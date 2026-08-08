// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
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
use tokio::io::{AsyncReadExt, AsyncWriteExt};
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

/// Probes one UDP port via a *connected* socket - on Windows, an incoming
/// ICMP "port unreachable" surfaces as a ConnectionReset error on recv, so
/// this needs no raw socket / admin rights, unlike a classic UDP scanner.
/// Returns (round_trip_ms, confirmed): confirmed=true only when real reply
/// data came back (definitely open); confirmed=false means no response at
/// all within the timeout - UDP's inherent "open|filtered" ambiguity, not
/// something this can resolve further. None means a ConnectionReset came
/// back - the port is definitely closed, not reported at all (same as TCP).
async fn probe_port_udp(ip: &str, port: u16, timeout_ms: u64) -> Option<(u64, bool)> {
    let addr = format!("{}:{}", ip, port);
    let socket = tokio::net::UdpSocket::bind("0.0.0.0:0").await.ok()?;
    socket.connect(&addr).await.ok()?;
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
                let addr_str = format!("{}:{}", ip_c, port);
                let addr: SocketAddr = match addr_str.parse() {
                    Ok(a) => a,
                    Err(_) => return None,
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
    while let Some(res) = set.join_next().await {
        processed += 1;
        if matches!(res, Ok(true)) { found += 1; }
        let _ = app.emit("scan-progress", ScanProgress {
            total,
            processed,
            found,
            done: false,
            stopped: false,
        });
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
    // Open URL in system default browser (Windows). `cmd /c start` re-
    // parses its whole command line for shell metacharacters (&, |, ^)
    // even when the URL arrives as a single argv entry (it has no spaces,
    // so Rust's own Windows argument-quoting never wraps it in quotes),
    // silently truncating any URL with more than one query parameter at
    // the first "&" - confirmed live via Komunikator's multi-param OAuth
    // URL, which only ever reached Google with its first query param
    // (client_id) intact, producing a "missing response_type" error.
    // `explorer.exe <url>` (tried as a first fix) turned out unreliable
    // too - it opened a plain file-browser window instead of handing the
    // URL to the default browser. `rundll32 url.dll,FileProtocolHandler`
    // is the standard, long-established Windows mechanism specifically
    // for this - verified empirically (a query param placed AFTER the
    // first "&" survives intact, unlike the `cmd /c start` bug above).
    let _ = std::process::Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", url.as_str()])
        .spawn();
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

#[tauri::command]
fn open_extension_manifest_dialog() -> Result<String, String> {
    let picked = rfd::FileDialog::new()
        .set_title("Import Extension Manifest")
        .add_filter("JSON", &["json"])
        .pick_file();

    let path = match picked {
        Some(path) => path,
        None => return Err("cancelled".into()),
    };

    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
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

#[tauri::command]
fn window_close(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
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
        let mut size: u32 = 0;
        let _ = GetExtendedTcpTable(None, &mut size, false, AF_INET.0 as u32, TCP_TABLE_OWNER_PID_ALL, 0);
        let mut buf = alloc_word_buffer(size as usize);
        loop {
            size = (buf.len() * 8) as u32;
            let ret = GetExtendedTcpTable(
                Some(buf.as_mut_ptr() as *mut std::ffi::c_void),
                &mut size,
                false,
                AF_INET.0 as u32,
                TCP_TABLE_OWNER_PID_ALL,
                0,
            );
            if ret == 0 {
                break;
            } else if ret == ERROR_INSUFFICIENT_BUFFER.0 {
                buf = alloc_word_buffer(size as usize);
            } else {
                return Err(format!("GetExtendedTcpTable failed with code {}", ret));
            }
        }
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

        let mut size: u32 = 0;
        let _ = GetExtendedUdpTable(None, &mut size, false, AF_INET.0 as u32, UDP_TABLE_OWNER_PID, 0);
        let mut buf = alloc_word_buffer(size as usize);
        loop {
            size = (buf.len() * 8) as u32;
            let ret = GetExtendedUdpTable(
                Some(buf.as_mut_ptr() as *mut std::ffi::c_void),
                &mut size,
                false,
                AF_INET.0 as u32,
                UDP_TABLE_OWNER_PID,
                0,
            );
            if ret == 0 {
                break;
            } else if ret == ERROR_INSUFFICIENT_BUFFER.0 {
                buf = alloc_word_buffer(size as usize);
            } else {
                return Err(format!("GetExtendedUdpTable failed with code {}", ret));
            }
        }
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
    for line in lines {
        if let Some(idx) = line.find(':') {
            let (name, value) = line.split_at(idx);
            if name.eq_ignore_ascii_case("user-agent") {
                user_agent = value[1..].trim().to_string();
            }
        }
    }

    if !payload_id.is_empty() {
        let hit = BeaconHit {
            payload_id,
            timestamp_ms: SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
            user_agent,
            remote_addr: peer,
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
            let _ = child.kill();
            return Err("cloudflared exited without printing a tunnel URL".into());
        }
        Ok(Err(e)) => {
            let _ = child.kill();
            return Err(e.to_string());
        }
        Err(_) => {
            let _ = child.kill();
            return Err("Timed out waiting for cloudflared to report its tunnel URL".into());
        }
    };

    let state = app.state::<Arc<MailXssTesterState>>();
    *state.tunnel_child.lock().unwrap() = Some(child);

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
) -> Result<(), String> {
    let email = lettre::Message::builder()
        .from(gmail_address.parse().map_err(|e: lettre::address::AddressError| e.to_string())?)
        .to(to.parse().map_err(|e: lettre::address::AddressError| e.to_string())?)
        .subject(subject)
        .header(lettre::message::header::ContentType::TEXT_HTML)
        .body(html_body)
        .map_err(|e| e.to_string())?;

    let creds = lettre::transport::smtp::authentication::Credentials::new(gmail_address, app_password);

    let mailer = lettre::AsyncSmtpTransport::<lettre::Tokio1Executor>::relay("smtp.gmail.com")
        .map_err(|e| e.to_string())?
        .credentials(creds)
        .build();

    mailer.send(email).await.map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Komunikator: Google Sign-In OAuth loopback listener ───────────────────
// Google actively blocks its own OAuth consent screen from loading inside an
// embedded webview (403 disallowed_useragent, enforced since 2023), so
// signInWithPopup/signInWithRedirect can never work directly inside this
// app's WebView2 window. The desktop-app-correct pattern (same one Google's
// own "OAuth for Desktop Apps" docs describe, and what VS Code/Slack/Discord
// desktop all do) is: open the consent screen in the user's REAL system
// browser (open_browser, already exists), and catch the redirect back here
// via a one-shot local HTTP listener - exactly the same shape as the Mail
// XSS Tester's beacon listener above (start_beacon_server/
// handle_beacon_connection), just answering exactly one request instead of
// many, and forwarding the query string instead of accumulating hits.
async fn handle_oauth_callback_connection(mut stream: TcpStream, app: AppHandle) {
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
    let request_line = request.lines().next().unwrap_or("");
    let path = request_line.split_whitespace().nth(1).unwrap_or("");
    let query = path.splitn(2, '?').nth(1).unwrap_or("");

    let mut code = String::new();
    let mut error = String::new();
    for pair in query.split('&') {
        let mut it = pair.splitn(2, '=');
        let key = it.next().unwrap_or("");
        let value = percent_decode(it.next().unwrap_or(""));
        if key == "code" {
            code = value;
        } else if key == "error" {
            error = value;
        }
    }

    let _ = app.emit("oauth-callback", serde_json::json!({ "code": code, "error": error }));

    let body = "<html><body style=\"font-family:sans-serif;text-align:center;margin-top:80px;\"><h2>You can close this tab</h2><p>Return to the app to continue.</p></body></html>";
    let header = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes()).await;
    let _ = stream.write_all(body.as_bytes()).await;
}

// One-shot by design (unlike start_beacon_server's persistent accept loop) -
// exits after handling exactly one connection, since a single OAuth redirect
// is all this is ever meant to catch per sign-in attempt. No shared state to
// .manage() either, since there's nothing to accumulate between calls.
// Fixed, not OS-assigned like the beacon/VNC listeners (same idea as
// VNC_BRIDGE_PORT above) - confirmed live that Firebase's auto-created
// "Web application"-type OAuth client requires an EXACT redirect_uri
// match (scheme+host+port+path), not just scheme+host the way a genuine
// "Desktop app"-type client would get from Google's documented loopback
// flow. A random OS-assigned port can never satisfy an exact match, so
// this needs to be one fixed value the user registers once in Google
// Cloud Console's Authorized redirect URIs as "http://localhost:53682/".
const OAUTH_LOOPBACK_PORT: u16 = 53682;

#[tauri::command]
async fn start_oauth_listener(app: AppHandle) -> Result<u16, String> {
    let listener = TcpListener::bind(("127.0.0.1", OAUTH_LOOPBACK_PORT)).await.map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    tauri::async_runtime::spawn(async move {
        // Without this, an abandoned attempt (browser tab closed without
        // finishing, or the user just changes their mind) leaves this
        // listener bound to OAUTH_LOOPBACK_PORT forever - since that port
        // is a fixed value (not OS-assigned), every subsequent sign-in
        // attempt would then fail to bind it until the app restarts. 5
        // minutes is generous enough for a real sign-in (including 2FA)
        // while still releasing the port in a reasonable time otherwise.
        if let Ok(Ok((stream, _))) = timeout(Duration::from_secs(300), listener.accept()).await {
            handle_oauth_callback_connection(stream, app).await;
        }
    });

    Ok(port)
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
        .manage(Arc::new(ScanState { stop: AtomicBool::new(false) }))
        .manage(Arc::new(MailXssTesterState {
            hits: Mutex::new(Vec::new()),
            beacon_task: Mutex::new(None),
            tunnel_child: Mutex::new(None),
        }))
        .setup(|app| {
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
            stop_scan,
            geo_lookup,
            hostname_lookup,
            email_recon_lookup,
            open_browser,
            open_rdp,
            start_beacon_server,
            stop_beacon_server,
            get_beacon_hits,
            start_tunnel,
            stop_tunnel,
            send_test_email,
            start_oauth_listener,
            window_minimize,
            window_toggle_maximize,
            window_toggle_fullscreen,
            window_get_state,
            window_start_dragging,
            window_close,
            open_extension_manifest_dialog,
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
            list_connections,
            list_arp_entries,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
