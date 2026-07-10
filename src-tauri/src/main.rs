// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{IpAddr, SocketAddr};
use std::io::Read;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::str::FromStr;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use rusqlite::{Connection, params};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tokio::net::lookup_host;
use tokio::net::TcpStream;
use tokio::time::timeout;
use keyring::Entry;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

// ─── Shared scan-stop flag ───────────────────────────────────────────────────
struct ScanState {
    stop: AtomicBool,
}

struct ScanWatchState {
    events: Mutex<Vec<ScanWatchEvent>>,
}

#[derive(Clone)]
struct ScanWatchEvent {
    seen_at: Instant,
    remote_ip: String,
    local_port: u16,
}

const TOOL_WINDOW_LABELS: &[&str] = &[
    "tool-console",
    "tool-macro",
    "tool-speed",
    "tool-proto",
    "tool-globe",
    "tool-topology",
    "tool-radar",
    "tool-gnss",
    "tool-lte",
    "tool-sniffer",
    "tool-imgmeta",
    "tool-ai-assistant",
    "tool-bt-detector",
    "tool-phone-lookup",
    "tool-wifi-detector",
    "tool-scan-watch",
    "clippy",
];

// ─── DTOs ────────────────────────────────────────────────────────────────────
#[derive(Serialize, Clone)]
struct PortResult {
    port: u16,
    open: bool,
    ms: Option<u64>,
}

#[derive(Serialize, Clone)]
struct HostFound {
    ip: String,
    open_ports: Vec<u16>,
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
struct TraceRunResult {
    output: String,
    resolved_ip: String,
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

#[derive(Serialize, Clone)]
struct ScanWatchSuspect {
    ip: String,
    unique_ports: usize,
    hits: usize,
    last_seen_secs_ago: u64,
}

#[derive(Serialize, Clone)]
struct ScanWatchResult {
    generated_at_unix: u64,
    sample_count: usize,
    suspects: Vec<ScanWatchSuspect>,
}

#[derive(Serialize, Clone)]
struct WifiNetwork {
    ssid: String,
    bssid_count: usize,
    best_signal_pct: Option<u8>,
    source: String,
}

#[derive(Serialize, Clone)]
struct WifiProperty {
    key: String,
    value: String,
}

#[derive(Clone, Default)]
struct WifiNetworkBlock {
    ssid: String,
    lines: Vec<String>,
}

#[derive(Serialize, Clone)]
struct BtDevice {
    name: String,
    address: String,
    rssi: Option<i16>,
    connectable: bool,
    services: Vec<String>,
    source: String,
}

#[derive(Serialize, Clone)]
struct SnifferConn {
    pid: u32,
    proc: String,
    proto: String,
    local: String,
    remote: String,
    state: String,
}

#[derive(Serialize, Clone)]
struct GnssSat {
    prn: String,
    elevation: Option<u8>,
    azimuth: Option<u16>,
    snr: Option<u8>,
    constellation: String,
}

#[derive(Serialize, Clone)]
struct GnssSnapshot {
    source: String,
    timestamp_utc: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    altitude_m: Option<f64>,
    speed_kmh: Option<f64>,
    fix_type: String,
    hdop: Option<f64>,
    sats_used: Option<u32>,
    sats_in_view: Option<u32>,
    satellites: Vec<GnssSat>,
}

#[derive(Serialize, Clone, Default)]
struct LteSnapshot {
    source: String,
    port_name: String,
    baud_rate: u32,
    operator: Option<String>,
    tech: Option<String>,
    band: Option<String>,
    earfcn: Option<i32>,
    cell_id: Option<String>,
    tac: Option<String>,
    rssi_dbm: Option<f64>,
    rsrp_dbm: Option<f64>,
    rsrq_db: Option<f64>,
    sinr_db: Option<f64>,
    raw_lines: Vec<String>,
}

// ─── Commands ────────────────────────────────────────────────────────────────

/// Single TCP port probe.
#[tauri::command]
async fn scan_port(ip: String, port: u16, timeout_ms: u64) -> PortResult {
    let addr_str = format!("{}:{}", ip, port);
    let addr: SocketAddr = match addr_str.parse() {
        Ok(a) => a,
        Err(_) => return PortResult { port, open: false, ms: None },
    };
    let t0 = Instant::now();
    match timeout(Duration::from_millis(timeout_ms), TcpStream::connect(addr)).await {
        Ok(Ok(_)) => PortResult { port, open: true, ms: Some(t0.elapsed().as_millis() as u64) },
        _ => PortResult { port, open: false, ms: None },
    }
}

/// Probe a single IP across all given ports; returns open ports + best latency.
async fn probe_host(ip: String, ports: Vec<u16>, timeout_ms: u64) -> (Vec<u16>, Option<u64>) {
    let mut set: tokio::task::JoinSet<(u16, bool, Option<u64>)> = tokio::task::JoinSet::new();
    for port in ports {
        let ip_c = ip.clone();
        set.spawn(async move {
            let addr_str = format!("{}:{}", ip_c, port);
            let addr: SocketAddr = match addr_str.parse() {
                Ok(a) => a,
                Err(_) => return (port, false, None::<u64>),
            };
            let t0 = Instant::now();
            match timeout(Duration::from_millis(timeout_ms), TcpStream::connect(addr)).await {
                Ok(Ok(_)) => (port, true, Some(t0.elapsed().as_millis() as u64)),
                _ => (port, false, None),
            }
        });
    }
    let mut open_ports: Vec<u16> = Vec::new();
    let mut best_ms: Option<u64> = None;
    while let Some(res) = set.join_next().await {
        if let Ok((port, true, ms)) = res {
            open_ports.push(port);
            if let Some(m) = ms {
                best_ms = Some(best_ms.map_or(m, |prev: u64| prev.min(m)));
            }
        }
    }
    open_ports.sort_unstable();
    (open_ports, best_ms)
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

    for i in 0..total {
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
            let (open_ports, ping_ms) = probe_host(ip.clone(), ports_c, timeout_ms).await;
            if !open_ports.is_empty() {
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

/// Returns first detected private IPv4 on active non-loopback interfaces.
#[tauri::command]
fn get_local_ip() -> Option<String> {
    let ifaces = if_addrs::get_if_addrs().ok()?;
    for iface in ifaces {
        if iface.is_loopback() {
            continue;
        }
        if let if_addrs::IfAddr::V4(v4) = iface.addr {
            let o = v4.ip.octets();
            let is_private = o[0] == 10
                || (o[0] == 172 && (16..=31).contains(&o[1]))
                || (o[0] == 192 && o[1] == 168);
            if is_private {
                return Some(v4.ip.to_string());
            }
        }
    }
    None
}

/// Returns unique local /24 subnet bases (e.g. 192.168.1) from active interfaces.
#[tauri::command]
fn get_local_subnets() -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    if let Ok(ifaces) = if_addrs::get_if_addrs() {
        for iface in ifaces {
            if iface.is_loopback() {
                continue;
            }
            if let if_addrs::IfAddr::V4(v4) = iface.addr {
                let o = v4.ip.octets();
                let is_private = o[0] == 10
                    || (o[0] == 172 && (16..=31).contains(&o[1]))
                    || (o[0] == 192 && o[1] == 168);
                if is_private {
                    out.push(format!("{}.{}.{}", o[0], o[1], o[2]));
                }
            }
        }
    }
    out.sort_by_key(|b| ip_to_u32(&format!("{}.0", b)).unwrap_or(u32::MAX));
    out.dedup();
    out
}

#[tauri::command]
async fn run_traceroute(target: String) -> Result<TraceRunResult, String> {
    let raw_target = target.trim();
    if raw_target.is_empty() {
        return Err("Target is empty".into());
    }

    let ip = resolve_target_ipv4(raw_target).await?;
    let trace_target = ip.clone();

    let output = tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "windows")]
        {
            // Run tracert without spawning a visible cmd window.
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            Command::new("tracert")
                .creation_flags(CREATE_NO_WINDOW)
                .args(["-4", "-d", "-h", "20", "-w", "800", trace_target.as_str()])
                .output()
        }

        #[cfg(not(target_os = "windows"))]
        {
            Command::new("traceroute")
                .args(["-n", "-m", "20", "-w", "1", trace_target.as_str()])
                .output()
        }
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|res| res.map_err(|e| e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = if stderr.trim().is_empty() {
        stdout
    } else {
        format!("{}\n{}", stdout, stderr)
    };

    if combined.trim().is_empty() {
        return Err("Traceroute returned no output".into());
    }

    Ok(TraceRunResult {
        output: combined,
        resolved_ip: ip,
    })
}

#[tauri::command]
fn open_browser(url: String) {
    // Open URL in system default browser (Windows)
    let _ = std::process::Command::new("cmd")
        .args(["/c", "start", "", url.as_str()])
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

#[tauri::command]
fn save_scan_results_dialog(default_filename: String, content: String) -> Result<String, String> {
    let picked = rfd::FileDialog::new()
        .set_title("Export scan results")
        .set_file_name(&default_filename)
        .add_filter("JSON", &["json"])
        .save_file();

    let path = match picked {
        Some(path) => path,
        None => return Err("cancelled".into()),
    };

    fs::write(&path, content).map_err(|e| format!("Failed to save file: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn open_scan_results_dialog() -> Result<String, String> {
    let picked = rfd::FileDialog::new()
        .set_title("Import scan results")
        .add_filter("JSON", &["json"])
        .pick_file();

    let path = match picked {
        Some(path) => path,
        None => return Err("cancelled".into()),
    };

    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
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

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScanPortEntry {
    port: i64,
    protocol: String,
    service: String,
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

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionData {
    scan_results: Vec<ScanResultRow>,
    scan_progress: ScanProgressData,
    ip_library: IpLibraryData,
    presets: PresetsData,
    scan_defaults: ScanDefaultsData,
    layout: LayoutData,
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
      status TEXT NOT NULL,
      status_class TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scan_result_ports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      result_id INTEGER NOT NULL REFERENCES scan_results(id) ON DELETE CASCADE,
      port INTEGER NOT NULL,
      protocol TEXT NOT NULL DEFAULT 'TCP',
      service TEXT NOT NULL DEFAULT ''
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
    CREATE TABLE IF NOT EXISTS session_layout_tabs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section TEXT NOT NULL,
      tool TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS session_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      saved_at TEXT NOT NULL,
      version INTEGER NOT NULL
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
    // only (id, result_id, port) - CREATE TABLE IF NOT EXISTS above is a
    // no-op against that pre-existing table, so add the missing columns
    // explicitly. `prepare` fails at compile time on an unknown column
    // regardless of row count, unlike `query_row` (which would also fail on
    // a merely-empty table and false-positive the migration).
    if conn.prepare("SELECT protocol, service FROM scan_result_ports").is_err() {
        conn.execute_batch(
            "ALTER TABLE scan_result_ports ADD COLUMN protocol TEXT NOT NULL DEFAULT 'TCP';
             ALTER TABLE scan_result_ports ADD COLUMN service TEXT NOT NULL DEFAULT '';"
        ).map_err(|e| format!("Failed to migrate scan_result_ports schema: {e}"))?;
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
            .prepare_cached("INSERT INTO scan_results (ip, ping, hostname, flag, isp, as_info, device_identification, status, status_class) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)")
            .map_err(|e| format!("Failed to prepare scan_results insert: {e}"))?;
        let mut insert_port = tx
            .prepare_cached("INSERT INTO scan_result_ports (result_id, port, protocol, service) VALUES (?1, ?2, ?3, ?4)")
            .map_err(|e| format!("Failed to prepare scan_result_ports insert: {e}"))?;

        for row in &data.scan_results {
            insert_result
                .execute(params![row.ip, row.ping, row.hostname, row.flag, row.isp, row.as_info, row.device_identification, row.status, row.status_class])
                .map_err(|e| format!("Failed to insert scan_results row: {e}"))?;
            let result_id = tx.last_insert_rowid();
            for port in &row.ports {
                insert_port
                    .execute(params![result_id, port.port, port.protocol, port.service])
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
        "INSERT INTO session_meta (id, saved_at, version) VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), 1) ON CONFLICT(id) DO UPDATE SET saved_at = excluded.saved_at, version = excluded.version",
        [],
    ).map_err(|e| format!("Failed to write session_meta: {e}"))?;

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

    let mut results_stmt = conn
        .prepare("SELECT id, ip, ping, hostname, flag, isp, as_info, device_identification, status, status_class FROM scan_results ORDER BY id")
        .map_err(|e| format!("Failed to prepare scan_results read: {e}"))?;
    let result_rows = results_stmt
        .query_map([], |row| {
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
                    status: row.get(8)?,
                    status_class: row.get(9)?,
                    ports: Vec::new(),
                },
            ))
        })
        .map_err(|e| format!("Failed to query scan_results: {e}"))?;

    let mut scan_results: Vec<ScanResultRow> = Vec::new();
    let mut scan_result_index: HashMap<i64, usize> = HashMap::new();
    for row in result_rows {
        let (id, row) = row.map_err(|e| format!("Failed to read scan_results row: {e}"))?;
        scan_result_index.insert(id, scan_results.len());
        scan_results.push(row);
    }

    {
        // Older session files may not have the protocol/service columns yet
        // (added after this file was last saved) - reading must not mutate
        // the file (only a save/write runs the ALTER TABLE migration), so
        // fall back to defaults here instead.
        let has_protocol_service = conn.prepare("SELECT protocol, service FROM scan_result_ports").is_ok();
        let port_rows: Vec<(i64, i64, String, String)> = if has_protocol_service {
            let mut ports_stmt = conn
                .prepare("SELECT result_id, port, protocol, service FROM scan_result_ports ORDER BY id")
                .map_err(|e| format!("Failed to prepare scan_result_ports read: {e}"))?;
            let rows = ports_stmt
                .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?)))
                .map_err(|e| format!("Failed to query scan_result_ports: {e}"))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("Failed to read scan_result_ports row: {e}"))?;
            rows
        } else {
            let mut ports_stmt = conn
                .prepare("SELECT result_id, port FROM scan_result_ports ORDER BY id")
                .map_err(|e| format!("Failed to prepare scan_result_ports read (legacy): {e}"))?;
            let rows = ports_stmt
                .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, "TCP".to_string(), String::new())))
                .map_err(|e| format!("Failed to query scan_result_ports (legacy): {e}"))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("Failed to read scan_result_ports row (legacy): {e}"))?;
            rows
        };
        for (result_id, port, protocol, service) in port_rows {
            if let Some(&idx) = scan_result_index.get(&result_id) {
                scan_results[idx].ports.push(ScanPortEntry { port, protocol, service });
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

    Ok(SessionData {
        scan_results,
        scan_progress,
        ip_library: IpLibraryData { entries: ip_library_entries, updated_at: ip_library_updated_at },
        presets: PresetsData { default_preset_id, presets: presets_items },
        scan_defaults,
        layout,
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
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
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

#[tauri::command]
fn window_start_dragging(window: WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_close(window: WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        close_tool_windows(&window.app_handle());
    }
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_clippy_window(app: AppHandle, lang: String) -> Result<(), String> {
    const CLIPPY_WIDTH: i32 = 280;
    const CLIPPY_HEIGHT: i32 = 185;
    const CLIPPY_MARGIN: i32 = 20;

    let mut target_monitor = app.primary_monitor().ok().flatten();

    let mut pos_x: i32 = 40;
    let mut pos_y: i32 = 40;
    if let Some(main) = app.get_webview_window("main") {
        if let Ok(Some(mon)) = main.current_monitor() {
            target_monitor = Some(mon);
        }
        if let (Ok(main_pos), Ok(main_size)) = (main.outer_position(), main.outer_size()) {
            let target_x = main_pos.x + main_size.width as i32 - CLIPPY_WIDTH - CLIPPY_MARGIN;
            let target_y = main_pos.y + main_size.height as i32 - CLIPPY_HEIGHT - CLIPPY_MARGIN;

            let (cx, cy) = if let Some(mon) = target_monitor.as_ref() {
                let mon_pos = mon.position();
                let mon_size = mon.size();

                let min_x = mon_pos.x;
                let min_y = mon_pos.y;
                let max_x = mon_pos.x + mon_size.width as i32 - CLIPPY_WIDTH;
                let max_y = mon_pos.y + mon_size.height as i32 - CLIPPY_HEIGHT;

                let clamped_x = target_x.clamp(min_x, max_x.max(min_x));
                let clamped_y = target_y.clamp(min_y, max_y.max(min_y));
                (clamped_x, clamped_y)
            } else {
                (target_x.max(0), target_y.max(0))
            };

            pos_x = cx;
            pos_y = cy;
        }
    }

    if let Some(win) = app.get_webview_window("clippy") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_position(PhysicalPosition::new(pos_x, pos_y));
        let _ = win.set_focus();
        let _ = app.emit("clippy-window-opened", ());
        return Ok(());
    }

    let url = WebviewUrl::App(format!("clippy.html#lang={}", lang).into());
    let win = WebviewWindowBuilder::new(&app, "clippy", url)
        .title("NetRecon Clippy")
        .inner_size(CLIPPY_WIDTH as f64, CLIPPY_HEIGHT as f64)
        .position(pos_x as f64, pos_y as f64)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .build()
        .map_err(|e| e.to_string())?;
    let _ = win.set_position(PhysicalPosition::new(pos_x, pos_y));
    let _ = win.set_focus();
    let _ = app.emit("clippy-window-opened", ());
    Ok(())
}

#[tauri::command]
fn close_clippy_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("clippy") {
        win.close().map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

#[tauri::command]
fn clippy_window_ready(app: AppHandle) -> Result<(), String> {
    app.emit("clippy-window-ready", ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_tool_window(app: AppHandle, tool: String) -> Result<(), String> {
    let tool = tool.trim().to_lowercase();
    let (label, title, width, height) = match tool.as_str() {
        "console" => ("tool-console", "NetRecon - Command Console", 760.0, 440.0),
        "macro" => ("tool-macro", "NetRecon - Macro Folder", 620.0, 420.0),
        "speed" => ("tool-speed", "NetRecon - Speed Test", 560.0, 340.0),
        "proto" => ("tool-proto", "NetRecon - Prototype", 980.0, 680.0),
        "globe" => ("tool-globe", "NetRecon - World Map", 1060.0, 740.0),
        "topology" => ("tool-topology", "NetRecon - Topology", 1060.0, 740.0),
        "wifi-radar" => ("tool-radar", "NetRecon - WiFi Radar", 760.0, 640.0),
        "gnss" => ("tool-gnss", "NetRecon - GNSS Monitor", 980.0, 700.0),
        "lte" => ("tool-lte", "NetRecon - LTE Monitor", 980.0, 700.0),
        "sniffer" => ("tool-sniffer", "NetRecon - Network Sniffer", 980.0, 620.0),
        "imgmeta" => ("tool-imgmeta", "NetRecon - Image Metadata Analyzer", 900.0, 680.0),
        "phone-lookup" => ("tool-phone-lookup", "NetRecon - Phone Reverse Lookup", 680.0, 780.0),
        "wifi-detector" => ("tool-wifi-detector", "NetRecon - WiFi Detector", 820.0, 600.0),
        "scan-watch" => ("tool-scan-watch", "NetRecon - IP Scan Watch", 720.0, 520.0),
        "ai-assistant" => ("tool-ai-assistant", "NetRecon - AI Security Assistant", 880.0, 760.0),
        "bt-detector" => ("tool-bt-detector", "NetRecon - Bluetooth Detector", 820.0, 600.0),
        _ => return Err(format!("Unsupported tool window: {tool}")),
    };

    if let Some(win) = app.get_webview_window(label) {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
        return Ok(());
    }

    let url = WebviewUrl::App(format!("index.html#tool={tool}").into());
    let builder = WebviewWindowBuilder::new(&app, label, url)
        .title(title)
        .inner_size(width, height)
        .min_inner_size(480.0, 320.0)
        .decorations(false)
        .resizable(true);

    let win = builder.build().map_err(|e| e.to_string())?;
    let _ = win.set_focus();
    Ok(())
}

#[tauri::command]
fn check_scan_watch(
    app: AppHandle,
    window_secs: u64,
    min_ports: usize,
) -> Result<ScanWatchResult, String> {
    let now = Instant::now();
    let window = Duration::from_secs(window_secs.clamp(5, 3600));
    let min_ports = min_ports.clamp(2, 128);

    let output = {
        #[cfg(target_os = "windows")]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            Command::new("netstat")
                .creation_flags(CREATE_NO_WINDOW)
                .args(["-na", "-p", "tcp"])
                .output()
                .map_err(|e| format!("Failed to run netstat: {e}"))?
        }

        #[cfg(not(target_os = "windows"))]
        {
            Command::new("netstat")
                .args(["-nat"])
                .output()
                .map_err(|e| format!("Failed to run netstat: {e}"))?
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.trim().is_empty() {
        return Err("netstat returned empty output".into());
    }

    let mut snapshot_seen: HashSet<(String, u16, String)> = HashSet::new();
    for line in stdout.lines() {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 4 {
            continue;
        }

        let (local_col, remote_col, state_col) = if cols[0].eq_ignore_ascii_case("TCP") {
            if cols.len() < 4 {
                continue;
            }
            (cols[1], cols[2], cols[3])
        } else {
            continue;
        };

        let Some((local_ip, local_port)) = parse_ipv4_socket(local_col) else {
            continue;
        };
        let Some((remote_ip, remote_port)) = parse_ipv4_socket(remote_col) else {
            continue;
        };

        if remote_ip == "0.0.0.0" || remote_ip == "127.0.0.1" || local_ip == "127.0.0.1" {
            continue;
        }

        let state = state_col.to_ascii_uppercase();
        let interesting_state = matches!(
            state.as_str(),
            "SYN_RECEIVED" | "ESTABLISHED" | "TIME_WAIT" | "CLOSE_WAIT"
        );
        if !interesting_state {
            continue;
        }

        // Heuristic for likely inbound probes.
        if local_port > 49151 || remote_port <= 1023 {
            continue;
        }

        snapshot_seen.insert((remote_ip, local_port, state));
    }

    let watch_state = app.state::<Arc<ScanWatchState>>();
    let mut events = watch_state
        .events
        .lock()
        .map_err(|_| "scan watch state lock poisoned")?;

    for (remote_ip, local_port, _) in snapshot_seen {
        events.push(ScanWatchEvent {
            seen_at: now,
            remote_ip,
            local_port,
        });
    }

    events.retain(|e| now.duration_since(e.seen_at) <= window);

    let mut by_ip: HashMap<&str, (HashSet<u16>, usize, Instant)> = HashMap::new();
    for ev in events.iter() {
        let entry = by_ip
            .entry(ev.remote_ip.as_str())
            .or_insert_with(|| (HashSet::new(), 0usize, ev.seen_at));
        entry.0.insert(ev.local_port);
        entry.1 += 1;
        if ev.seen_at > entry.2 {
            entry.2 = ev.seen_at;
        }
    }

    let mut suspects: Vec<ScanWatchSuspect> = by_ip
        .into_iter()
        .filter_map(|(ip, (ports, hits, last_seen))| {
            if ports.len() < min_ports {
                return None;
            }
            Some(ScanWatchSuspect {
                ip: ip.to_string(),
                unique_ports: ports.len(),
                hits,
                last_seen_secs_ago: now.duration_since(last_seen).as_secs(),
            })
        })
        .collect();

    suspects.sort_by(|a, b| {
        b.unique_ports
            .cmp(&a.unique_ports)
            .then_with(|| b.hits.cmp(&a.hits))
            .then_with(|| a.ip.cmp(&b.ip))
    });

    Ok(ScanWatchResult {
        generated_at_unix: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
        sample_count: events.len(),
        suspects,
    })
}

#[tauri::command]
fn list_wifi_networks() -> Result<Vec<WifiNetwork>, String> {
    match run_wifi_netsh_show_networks() {
        Ok(output) => {
            let blocks = parse_wifi_network_blocks(&output);

            let mut out: Vec<WifiNetwork> = blocks
                .iter()
                .map(|b| WifiNetwork {
                    ssid: b.ssid.clone(),
                    bssid_count: count_bssid_lines(&b.lines),
                    best_signal_pct: best_signal_percent(&b.lines),
                    source: "scan".to_string(),
                })
                .collect();

            out.sort_by(|a, b| {
                b.best_signal_pct
                    .unwrap_or(0)
                    .cmp(&a.best_signal_pct.unwrap_or(0))
                    .then_with(|| a.ssid.cmp(&b.ssid))
            });

            Ok(out)
        }
        Err(scan_err) => {
            // Corporate policy can block live scanning. Fallback to saved profiles.
            let profiles = list_saved_wifi_profiles()?;
            if profiles.is_empty() {
                Err(scan_err)
            } else {
                Ok(profiles)
            }
        }
    }
}

#[tauri::command]
fn get_wifi_network_details(ssid: String) -> Result<Vec<WifiProperty>, String> {
    if let Ok(output) = run_wifi_netsh_show_networks() {
        let blocks = parse_wifi_network_blocks(&output);
        if let Some(wanted) = blocks.into_iter().find(|b| b.ssid == ssid) {
            let mut properties = parse_wifi_properties_from_lines(&wanted.lines);
            if properties.is_empty() {
                properties.push(WifiProperty {
                    key: "Info".to_string(),
                    value: "No structured properties were parsed for this network.".to_string(),
                });
            }
            return Ok(properties);
        }
    }

    // Fallback path for environments where scan is blocked.
    let profile_raw = run_wifi_netsh_show_profile(&ssid)?;
    let profile_lines: Vec<String> = profile_raw.lines().map(|l| l.trim().to_string()).collect();
    let mut properties = parse_wifi_properties_from_lines(&profile_lines);
    if properties.is_empty() {
        properties.push(WifiProperty {
            key: "Info".to_string(),
            value: "No structured properties were parsed for this profile.".to_string(),
        });
    }
    Ok(properties)
}

#[tauri::command]
async fn ai_multi_provider_query(
    provider: String,
    api_key: String,
    model: String,
    prompt: String,
) -> Result<String, String> {
    let provider = provider.trim().to_lowercase();
    let api_key = api_key.trim().to_string();
    let prompt = prompt.trim().to_string();
    let model = model.trim().to_string();

    if api_key.is_empty() {
        return Err("API key is required.".into());
    }
    if prompt.is_empty() {
        return Err("Prompt is empty.".into());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    match provider.as_str() {
        "claude" => {
            let use_model = if model.is_empty() {
                "claude-3-5-sonnet-latest".to_string()
            } else {
                model
            };

            let body = json!({
                "model": use_model,
                "max_tokens": 900,
                "messages": [
                    { "role": "user", "content": prompt }
                ]
            });

            let resp = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Claude request failed: {e}"))?;

            let status = resp.status();
            let raw = resp
                .text()
                .await
                .map_err(|e| format!("Claude response read failed: {e}"))?;

            if !status.is_success() {
                return Err(format!("Claude API error ({}): {}", status, raw));
            }

            let v: Value = serde_json::from_str(&raw)
                .map_err(|e| format!("Claude response parse failed: {e}"))?;

            let text = v
                .get("content")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|first| first.get("text"))
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .trim()
                .to_string();

            if text.is_empty() {
                return Err("Claude returned empty content.".into());
            }

            Ok(text)
        }
        "google" => {
            let use_model = if model.is_empty() {
                "gemini-1.5-flash".to_string()
            } else {
                model
            };

            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
                use_model, api_key
            );

            let body = json!({
                "contents": [
                    {
                        "parts": [
                            { "text": prompt }
                        ]
                    }
                ]
            });

            let resp = client
                .post(url)
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Google request failed: {e}"))?;

            let status = resp.status();
            let raw = resp
                .text()
                .await
                .map_err(|e| format!("Google response read failed: {e}"))?;

            if !status.is_success() {
                return Err(format!("Google API error ({}): {}", status, raw));
            }

            let v: Value = serde_json::from_str(&raw)
                .map_err(|e| format!("Google response parse failed: {e}"))?;

            let text = v
                .get("candidates")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|c| c.get("content"))
                .and_then(|c| c.get("parts"))
                .and_then(|p| p.as_array())
                .map(|parts| {
                    parts
                        .iter()
                        .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
                        .collect::<Vec<&str>>()
                        .join("\n")
                })
                .unwrap_or_default()
                .trim()
                .to_string();

            if text.is_empty() {
                return Err("Google API returned empty content.".into());
            }

            Ok(text)
        }
        "copilot" => {
            // Uses GitHub Models OpenAI-compatible endpoint and token.
            let use_model = if model.is_empty() {
                "gpt-4o-mini".to_string()
            } else {
                model
            };

            let body = json!({
                "model": use_model,
                "messages": [
                    { "role": "user", "content": prompt }
                ],
                "temperature": 0.2
            });

            let resp = client
                .post("https://models.inference.ai.azure.com/chat/completions")
                .header("authorization", format!("Bearer {}", api_key))
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Copilot request failed: {e}"))?;

            let status = resp.status();
            let raw = resp
                .text()
                .await
                .map_err(|e| format!("Copilot response read failed: {e}"))?;

            if !status.is_success() {
                return Err(format!("Copilot API error ({}): {}", status, raw));
            }

            let v: Value = serde_json::from_str(&raw)
                .map_err(|e| format!("Copilot response parse failed: {e}"))?;

            let text = v
                .get("choices")
                .and_then(|c| c.as_array())
                .and_then(|arr| arr.first())
                .and_then(|c| c.get("message"))
                .and_then(|m| m.get("content"))
                .and_then(|t| t.as_str())
                .unwrap_or("")
                .trim()
                .to_string();

            if text.is_empty() {
                return Err("Copilot API returned empty content.".into());
            }

            Ok(text)
        }
        _ => Err(format!("Unsupported AI provider: {}", provider)),
    }
}

fn ai_secure_storage_account(provider: &str) -> Result<String, String> {
    let p = provider.trim().to_lowercase();
    if p.is_empty() {
        return Err("Provider is required.".into());
    }
    if !p.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("Provider contains invalid characters.".into());
    }
    Ok(format!("provider:{}", p))
}

#[tauri::command]
fn ai_store_api_key_secure(provider: String, api_key: String) -> Result<(), String> {
    let account = ai_secure_storage_account(&provider)?;
    let key = api_key.trim();
    if key.is_empty() {
        return Err("API key is required.".into());
    }

    let entry = Entry::new("netrecon.ipscanner.ai", &account)
        .map_err(|e| format!("Secure storage init failed: {e}"))?;
    entry
        .set_password(key)
        .map_err(|e| format!("Secure storage write failed: {e}"))
}

#[tauri::command]
fn ai_load_api_key_secure(provider: String) -> Result<Option<String>, String> {
    let account = ai_secure_storage_account(&provider)?;
    let entry = Entry::new("netrecon.ipscanner.ai", &account)
        .map_err(|e| format!("Secure storage init failed: {e}"))?;

    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Secure storage read failed: {e}")),
    }
}

#[tauri::command]
fn ai_delete_api_key_secure(provider: String) -> Result<(), String> {
    let account = ai_secure_storage_account(&provider)?;
    let entry = Entry::new("netrecon.ipscanner.ai", &account)
        .map_err(|e| format!("Secure storage init failed: {e}"))?;

    match entry.delete_password() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Secure storage delete failed: {e}")),
    }
}

#[tauri::command]
async fn scan_bluetooth_devices(duration_secs: u64) -> Result<Vec<BtDevice>, String> {
    use btleplug::api::{Central, Manager as _, ScanFilter};
    use btleplug::platform::Manager;

    let duration_secs = duration_secs.clamp(3, 30);
    let mut devices: Vec<BtDevice> = Vec::new();

    // ── BLE scan via btleplug ───────────────────────────────────────────────
    let ble_result: Result<Vec<BtDevice>, String> = async {
        let manager = Manager::new()
            .await
            .map_err(|e| format!("BT manager error: {e}"))?;

        let adapters = manager
            .adapters()
            .await
            .map_err(|e| format!("No BT adapters: {e}"))?;

        let adapter = adapters
            .into_iter()
            .next()
            .ok_or_else(|| "No Bluetooth adapter found.".to_string())?;

        adapter
            .start_scan(ScanFilter::default())
            .await
            .map_err(|e| format!("BLE scan start failed: {e}"))?;

        tokio::time::sleep(Duration::from_secs(duration_secs)).await;

        adapter
            .stop_scan()
            .await
            .map_err(|e| format!("BLE scan stop failed: {e}"))?;

        let peripherals = adapter
            .peripherals()
            .await
            .map_err(|e| format!("Peripheral list failed: {e}"))?;

        let mut ble_devices: Vec<BtDevice> = Vec::new();
        for p in peripherals {
            use btleplug::api::Peripheral as _;
            let props = p.properties().await.ok().flatten();
            if let Some(props) = props {
                ble_devices.push(BtDevice {
                    name: props.local_name.unwrap_or_else(|| "Unknown".to_string()),
                    address: p.address().to_string(),
                    rssi: props.rssi,
                    connectable: false,
                    services: props.services.iter().map(|s| s.to_string()).collect(),
                    source: "BLE".to_string(),
                });
            }
        }
        Ok(ble_devices)
    }.await;

    match ble_result {
        Ok(mut ble) => devices.append(&mut ble),
        Err(_) => {
            // BLE failed (no adapter or policy blocked) — continue to Classic BT
        }
    }

    // ── Classic BT via PowerShell (paired/visible devices) ──────────────────
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // Enumerate BT devices from PnP (covers paired Classic BT + BLE)
        let ps_output = Command::new("powershell")
            .creation_flags(CREATE_NO_WINDOW)
            .args([
                "-NoProfile", "-NonInteractive", "-Command",
                r#"$OutputEncoding = [System.Text.UTF8Encoding]::new($false);
                   [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false);
                   Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue |
                   Select-Object FriendlyName, Status, InstanceId |
                   ConvertTo-Json -Compress"#,
            ])
            .output();

        if let Ok(out) = ps_output {
            let raw = String::from_utf8_lossy(&out.stdout).to_string();
            let raw = raw.trim();
            // Wrap single object in array if needed
            let json_str = if raw.starts_with('{') {
                format!("[{}]", raw)
            } else {
                raw.to_string()
            };

            if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(&json_str) {
                for entry in arr {
                    let name = entry.get("FriendlyName")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unknown")
                        .to_string();
                    let status = entry.get("Status")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let instance_id = entry.get("InstanceId")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();

                    // Extract BT address from InstanceId (e.g. BTHENUM\..._LOCALMFR&...\7&...)
                    // InstanceId for BTHA2DP or BTHENUM contains the address in the DeviceID
                    let address = extract_bt_address_from_instance_id(&instance_id)
                        .unwrap_or_else(|| "-".to_string());

                    // Avoid duplicating devices already found by BLE scan
                    if !address.eq("-") && devices.iter().any(|d| {
                        d.address.to_lowercase().replace(':', "") ==
                        address.to_lowercase().replace(':', "")
                    }) {
                        continue;
                    }

                    devices.push(BtDevice {
                        name,
                        address,
                        rssi: None,
                        connectable: status.eq_ignore_ascii_case("OK"),
                        services: vec![],
                        source: format!("Classic BT ({})", status),
                    });
                }
            }
        }
    }

    // Sort: BLE by RSSI first, Classic BT at end
    devices.sort_by(|a, b| {
        let a_rssi = a.rssi.unwrap_or(i16::MIN);
        let b_rssi = b.rssi.unwrap_or(i16::MIN);
        b_rssi.cmp(&a_rssi)
    });

    Ok(devices)
}

#[tauri::command]
fn get_connections() -> Result<Vec<SnifferConn>, String> {
        #[cfg(target_os = "windows")]
        {
                const CREATE_NO_WINDOW: u32 = 0x08000000;

                let ps_script = r#"
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$tcp = Get-NetTCPConnection -ErrorAction SilentlyContinue |
    Select-Object OwningProcess,LocalAddress,LocalPort,RemoteAddress,RemotePort,State
$udp = Get-NetUDPEndpoint -ErrorAction SilentlyContinue |
    Select-Object OwningProcess,LocalAddress,LocalPort,RemoteAddress,RemotePort

$procMap = @{}
Get-Process -ErrorAction SilentlyContinue | ForEach-Object {
    $procMap[[string]$_.Id] = $_.ProcessName
}

$rows = @()

foreach ($c in $tcp) {
    $pid = [int]($c.OwningProcess)
    $pidKey = [string]$pid
    $pname = if ($procMap.ContainsKey($pidKey)) { $procMap[$pidKey] } else { 'unknown' }
    $rows += [PSCustomObject]@{
        pid   = $pid
        proc  = $pname
        proto = 'TCP'
        local = "{0}:{1}" -f $c.LocalAddress, $c.LocalPort
        remote= "{0}:{1}" -f $c.RemoteAddress, $c.RemotePort
        state = [string]$c.State
    }
}

foreach ($c in $udp) {
    $pid = [int]($c.OwningProcess)
    $pidKey = [string]$pid
    $pname = if ($procMap.ContainsKey($pidKey)) { $procMap[$pidKey] } else { 'unknown' }
    $rows += [PSCustomObject]@{
        pid   = $pid
        proc  = $pname
        proto = 'UDP'
        local = "{0}:{1}" -f $c.LocalAddress, $c.LocalPort
        remote= if ($c.RemoteAddress -and $c.RemotePort) { "{0}:{1}" -f $c.RemoteAddress, $c.RemotePort } else { '-' }
        state = 'Listen'
    }
}

$rows | ConvertTo-Json -Compress
"#;

                let out = Command::new("powershell")
                        .creation_flags(CREATE_NO_WINDOW)
                        .args(["-NoProfile", "-NonInteractive", "-Command", ps_script])
                        .output()
                        .map_err(|e| format!("PowerShell sniffer failed: {e}"))?;

                let raw = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if raw.is_empty() {
                        return Ok(Vec::new());
                }

                let json_str = if raw.starts_with('{') {
                        format!("[{}]", raw)
                } else {
                        raw
                };

                let arr: Vec<Value> = serde_json::from_str(&json_str)
                        .map_err(|e| format!("Sniffer JSON parse failed: {e}"))?;

                let mut rows = Vec::new();
                for item in arr {
                        let pid = item.get("pid").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                        let proc = item.get("proc").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
                        let proto = item.get("proto").and_then(|v| v.as_str()).unwrap_or("?").to_string();
                        let local = item.get("local").and_then(|v| v.as_str()).unwrap_or("-").to_string();
                        let remote = item.get("remote").and_then(|v| v.as_str()).unwrap_or("-").to_string();
                        let state = item.get("state").and_then(|v| v.as_str()).unwrap_or("-").to_string();

                        rows.push(SnifferConn {
                                pid,
                                proc,
                                proto,
                                local,
                                remote,
                                state,
                        });
                }

                rows.sort_by(|a, b| {
                        a.proc
                                .to_ascii_lowercase()
                                .cmp(&b.proc.to_ascii_lowercase())
                                .then(a.pid.cmp(&b.pid))
                });

                Ok(rows)
        }

        #[cfg(not(target_os = "windows"))]
        {
                Err("Sniffer backend is currently supported on Windows only.".into())
        }
}

#[derive(Default)]
struct GnssParseState {
    timestamp_utc: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    altitude_m: Option<f64>,
    speed_kmh: Option<f64>,
    hdop: Option<f64>,
    fix_quality: Option<u8>,
    sats_used: Option<u32>,
    sats_in_view: Option<u32>,
    sat_map: HashMap<String, GnssSat>,
}

#[tauri::command]
fn list_serial_ports() -> Result<Vec<String>, String> {
    let ports = serialport::available_ports()
        .map_err(|e| format!("Failed to enumerate serial ports: {e}"))?;
    let mut out = ports.into_iter().map(|p| p.port_name).collect::<Vec<_>>();
    out.sort();
    Ok(out)
}

#[tauri::command]
fn read_gnss_snapshot(port_name: String, baud_rate: u32, sample_secs: u64) -> Result<GnssSnapshot, String> {
    let baud_rate = baud_rate.clamp(1200, 921600);
    let sample_secs = sample_secs.clamp(1, 20);

    let mut port = serialport::new(port_name.clone(), baud_rate)
        .timeout(Duration::from_millis(250))
        .open()
        .map_err(|e| format!("Failed to open serial port '{}': {e}", port_name))?;

    let started = Instant::now();
    let mut read_buf = [0u8; 2048];
    let mut acc = String::new();
    let mut state = GnssParseState::default();

    while started.elapsed() < Duration::from_secs(sample_secs) {
        match port.read(&mut read_buf) {
            Ok(n) if n > 0 => {
                acc.push_str(&String::from_utf8_lossy(&read_buf[..n]));
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(e) => return Err(format!("GNSS read error: {e}")),
        }

        while let Some(pos) = acc.find('\n') {
            let mut line = acc.drain(..=pos).collect::<String>();
            line = line.trim().to_string();
            if line.is_empty() {
                continue;
            }
            parse_nmea_line(&line, &mut state);
        }
    }

    let mut satellites = state.sat_map.into_values().collect::<Vec<_>>();
    satellites.sort_by(|a, b| {
        b.snr
            .unwrap_or(0)
            .cmp(&a.snr.unwrap_or(0))
            .then(a.prn.cmp(&b.prn))
    });

    let fix_type = match state.fix_quality {
        Some(0) => "No Fix",
        Some(1) => "GPS Fix",
        Some(2) => "DGPS Fix",
        Some(4) => "RTK Fixed",
        Some(5) => "RTK Float",
        Some(6) => "Estimated",
        Some(_) => "Fix",
        None => {
            if state.latitude.is_some() && state.longitude.is_some() {
                "Fix"
            } else {
                "No Fix"
            }
        }
    }
    .to_string();

    Ok(GnssSnapshot {
        source: format!("NMEA/Serial ({})", port_name),
        timestamp_utc: state.timestamp_utc,
        latitude: state.latitude,
        longitude: state.longitude,
        altitude_m: state.altitude_m,
        speed_kmh: state.speed_kmh,
        fix_type,
        hdop: state.hdop,
        sats_used: state.sats_used,
        sats_in_view: state.sats_in_view,
        satellites,
    })
}

fn parse_nmea_line(line: &str, state: &mut GnssParseState) {
    if !line.starts_with('$') {
        return;
    }

    let payload = line.trim_start_matches('$').split('*').next().unwrap_or("");
    let mut parts = payload.split(',');
    let sentence = parts.next().unwrap_or("");
    let fields = parts.collect::<Vec<_>>();
    if sentence.len() < 3 {
        return;
    }

    let kind = &sentence[sentence.len() - 3..];
    let constellation = nmea_constellation(sentence).to_string();

    match kind {
        "GGA" => {
            if state.timestamp_utc.is_none() {
                state.timestamp_utc = fields.get(0).and_then(|s| format_nmea_time(s));
            }
            if let (Some(lat), Some(ns), Some(lon), Some(ew)) = (fields.get(1), fields.get(2), fields.get(3), fields.get(4)) {
                if let Some(v) = parse_nmea_coord(lat, ns, 2) {
                    state.latitude = Some(v);
                }
                if let Some(v) = parse_nmea_coord(lon, ew, 3) {
                    state.longitude = Some(v);
                }
            }
            state.fix_quality = fields.get(5).and_then(|s| s.parse::<u8>().ok());
            state.sats_used = fields.get(6).and_then(|s| s.parse::<u32>().ok());
            state.hdop = fields.get(7).and_then(|s| s.parse::<f64>().ok());
            state.altitude_m = fields.get(8).and_then(|s| s.parse::<f64>().ok());
        }
        "RMC" => {
            if state.timestamp_utc.is_none() {
                state.timestamp_utc = fields.get(0).and_then(|s| format_nmea_time(s));
            }
            if let (Some(lat), Some(ns), Some(lon), Some(ew)) = (fields.get(2), fields.get(3), fields.get(4), fields.get(5)) {
                if let Some(v) = parse_nmea_coord(lat, ns, 2) {
                    state.latitude = Some(v);
                }
                if let Some(v) = parse_nmea_coord(lon, ew, 3) {
                    state.longitude = Some(v);
                }
            }
            if let Some(knots) = fields.get(6).and_then(|s| s.parse::<f64>().ok()) {
                state.speed_kmh = Some(knots * 1.852);
            }
        }
        "GSV" => {
            if let Some(v) = fields.get(2).and_then(|s| s.parse::<u32>().ok()) {
                state.sats_in_view = Some(v);
            }
            let mut i = 3usize;
            while i + 3 < fields.len() {
                let prn = fields[i].trim();
                if !prn.is_empty() {
                    let key = format!("{}:{}", constellation, prn);
                    let sat = GnssSat {
                        prn: prn.to_string(),
                        elevation: fields[i + 1].parse::<u8>().ok(),
                        azimuth: fields[i + 2].parse::<u16>().ok(),
                        snr: fields[i + 3].parse::<u8>().ok(),
                        constellation: constellation.clone(),
                    };
                    state.sat_map.insert(key, sat);
                }
                i += 4;
            }
        }
        _ => {}
    }
}

fn nmea_constellation(sentence: &str) -> &'static str {
    if sentence.starts_with("GP") || sentence.starts_with("GN") {
        "GPS"
    } else if sentence.starts_with("GL") {
        "GLONASS"
    } else if sentence.starts_with("GA") {
        "Galileo"
    } else if sentence.starts_with("GB") || sentence.starts_with("BD") {
        "BeiDou"
    } else if sentence.starts_with("GI") {
        "NavIC"
    } else {
        "GNSS"
    }
}

fn parse_nmea_coord(raw: &str, hemi: &str, deg_digits: usize) -> Option<f64> {
    let raw = raw.trim();
    if raw.len() < deg_digits + 2 {
        return None;
    }
    let (deg_part, min_part) = raw.split_at(deg_digits);
    let deg = deg_part.parse::<f64>().ok()?;
    let min = min_part.parse::<f64>().ok()?;
    let mut out = deg + (min / 60.0);
    if hemi.eq_ignore_ascii_case("S") || hemi.eq_ignore_ascii_case("W") {
        out = -out;
    }
    Some(out)
}

fn format_nmea_time(raw: &str) -> Option<String> {
    let s = raw.trim();
    if s.len() < 6 {
        return None;
    }
    let hh = &s[0..2];
    let mm = &s[2..4];
    let ss = &s[4..6];
    Some(format!("{}:{}:{} UTC", hh, mm, ss))
}

#[tauri::command]
fn read_lte_snapshot(port_name: String, baud_rate: u32, sample_secs: u64) -> Result<LteSnapshot, String> {
    let baud_rate = baud_rate.clamp(1200, 921600);
    let sample_secs = sample_secs.clamp(1, 8);

    let mut port = serialport::new(port_name.clone(), baud_rate)
        .timeout(Duration::from_millis(220))
        .open()
        .map_err(|e| format!("Failed to open serial port '{}': {e}", port_name))?;

    let mut lines: Vec<String> = Vec::new();
    let commands: [(&str, u64); 10] = [
        ("AT", 220),
        ("ATI", 300),
        ("AT+CSQ", 260),
        ("AT+CESQ", 260),
        ("AT+COPS?", 320),
        ("AT+CPSI?", 350),
        ("AT+QENG=\"servingcell\"", 420),
        ("AT+QCAINFO", 320),
        ("AT^HCSQ?", 320),
        ("AT+CEREG?", 300),
    ];

    for (cmd, wait_ms) in commands {
        let mut chunk = at_collect_lines(&mut *port, cmd, Duration::from_millis(wait_ms));
        lines.append(&mut chunk);
    }

    // Passive sampling for URC/network notifications.
    let started = Instant::now();
    let mut acc = String::new();
    let mut buf = [0u8; 1024];
    while started.elapsed() < Duration::from_secs(sample_secs) {
        match port.read(&mut buf) {
            Ok(n) if n > 0 => {
                acc.push_str(&String::from_utf8_lossy(&buf[..n]));
                while let Some(pos) = acc.find('\n') {
                    let line = acc.drain(..=pos).collect::<String>().trim().to_string();
                    if !line.is_empty() {
                        lines.push(line);
                    }
                }
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(_) => break,
        }
    }

    let mut snap = parse_lte_snapshot(&lines, &port_name, baud_rate);
    if snap.raw_lines.len() > 140 {
        snap.raw_lines.truncate(140);
    }

    let has_metrics = snap.rssi_dbm.is_some()
        || snap.rsrp_dbm.is_some()
        || snap.rsrq_db.is_some()
        || snap.sinr_db.is_some()
        || snap.operator.is_some()
        || snap.tech.is_some()
        || snap.band.is_some()
        || snap.earfcn.is_some()
        || snap.cell_id.is_some();

    if !has_metrics {
        return Err("Port responded but no LTE metrics were detected.".into());
    }

    Ok(snap)
}

#[tauri::command]
fn read_lte_snapshot_auto(sample_secs: u64) -> Result<LteSnapshot, String> {
    let sample_secs = sample_secs.clamp(1, 4);
    let ports = list_serial_ports()?;
    if ports.is_empty() {
        return Err("No serial ports found.".into());
    }

    let baud_candidates: [u32; 4] = [115200, 57600, 38400, 9600];
    let mut tries = 0usize;
    let mut last_err: Option<String> = None;

    for port in ports {
        for baud in baud_candidates {
            tries += 1;
            match read_lte_snapshot(port.clone(), baud, sample_secs) {
                Ok(s) => return Ok(s),
                Err(e) => last_err = Some(format!("{} @ {}: {}", port, baud, e)),
            }
        }
    }

    Err(format!(
        "Could not detect LTE modem on serial ports ({} attempts). Last error: {}",
        tries,
        last_err.unwrap_or_else(|| "n/a".to_string())
    ))
}

fn at_collect_lines(
    port: &mut dyn serialport::SerialPort,
    cmd: &str,
    wait: Duration,
) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut acc = String::new();
    let mut buf = [0u8; 1024];

    let _ = port.write_all(format!("{}\r", cmd).as_bytes());
    let _ = port.flush();

    let started = Instant::now();
    while started.elapsed() < wait {
        match port.read(&mut buf) {
            Ok(n) if n > 0 => {
                acc.push_str(&String::from_utf8_lossy(&buf[..n]));
                while let Some(pos) = acc.find('\n') {
                    let mut line = acc.drain(..=pos).collect::<String>();
                    line = line.trim().to_string();
                    if line.is_empty() {
                        continue;
                    }
                    if line.eq_ignore_ascii_case("OK") || line.eq_ignore_ascii_case(cmd) {
                        continue;
                    }
                    out.push(line.clone());
                    if line.to_ascii_uppercase().contains("ERROR") {
                        return out;
                    }
                }
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(_) => break,
        }
    }

    out
}

fn parse_lte_snapshot(lines: &[String], port_name: &str, baud_rate: u32) -> LteSnapshot {
    let mut s = LteSnapshot {
        source: format!("AT/Serial ({})", port_name),
        port_name: port_name.to_string(),
        baud_rate,
        raw_lines: lines.to_vec(),
        ..Default::default()
    };

    for line in lines {
        let up = line.to_ascii_uppercase();

        if up.starts_with("+CSQ:") {
            let nums = parse_signed_numbers(line);
            if let Some(v) = nums.first() {
                if (0..=31).contains(v) {
                    s.rssi_dbm = Some(-113.0 + ((*v as f64) * 2.0));
                }
            }
        }

        if up.starts_with("+CESQ:") {
            let nums = parse_signed_numbers(line);
            if nums.len() >= 6 {
                let rsrq = nums[4];
                let rsrp = nums[5];
                if (0..=34).contains(&rsrq) {
                    s.rsrq_db = Some(-19.5 + (rsrq as f64 * 0.5));
                }
                if (0..=97).contains(&rsrp) {
                    s.rsrp_dbm = Some(-140.0 + rsrp as f64);
                }
            }
        }

        if up.starts_with("^HCSQ") {
            let nums = parse_signed_numbers(line);
            if nums.len() >= 3 {
                let rsrp = nums[0];
                let rsrq = nums[1];
                let sinr = nums[2];
                if s.rsrp_dbm.is_none() && (0..=97).contains(&rsrp) {
                    s.rsrp_dbm = Some(-140.0 + rsrp as f64);
                }
                if s.rsrq_db.is_none() && (0..=34).contains(&rsrq) {
                    s.rsrq_db = Some(-19.5 + (rsrq as f64 * 0.5));
                }
                if s.sinr_db.is_none() && (0..=250).contains(&sinr) {
                    s.sinr_db = Some(-20.0 + (sinr as f64 * 0.2));
                }
            }
            if up.contains("LTE") {
                s.tech = Some("LTE".to_string());
            }
        }

        if up.starts_with("+COPS:") {
            if let Some(op) = first_quoted(line) {
                if !op.trim().is_empty() {
                    s.operator = Some(op);
                }
            }
            if let Some(act) = parse_signed_numbers(line).last().copied() {
                if s.tech.is_none() {
                    s.tech = Some(map_cops_act_to_tech(act).to_string());
                }
            }
        }

        if up.starts_with("+CPSI:") || up.contains("SERVINGCELL") || up.contains("QENG") {
            if s.tech.is_none() {
                if up.contains("LTE") {
                    s.tech = Some("LTE".to_string());
                } else if up.contains("NR5G") || up.contains("5G") {
                    s.tech = Some("NR5G".to_string());
                }
            }

            if s.band.is_none() {
                for tok in line.split(|c: char| c == ',' || c.is_whitespace()) {
                    let t = tok.trim();
                    let tu = t.to_ascii_uppercase();
                    if tu.contains("BAND") && !t.is_empty() {
                        s.band = Some(t.to_string());
                        break;
                    }
                }
            }

            if s.earfcn.is_none() {
                for n in parse_signed_numbers(line) {
                    if (100..=90000).contains(&n) {
                        s.earfcn = Some(n);
                        break;
                    }
                }
            }

            for hx in find_hex_words(line) {
                if s.tac.is_none() {
                    s.tac = Some(hx);
                } else if s.cell_id.is_none() {
                    s.cell_id = Some(hx);
                    break;
                }
            }

            let nums = parse_signed_numbers(line);
            if s.rsrp_dbm.is_none() {
                if let Some(v) = nums.iter().copied().find(|v| (-160..=-40).contains(v)) {
                    s.rsrp_dbm = Some(v as f64);
                }
            }
            if s.rsrq_db.is_none() {
                if let Some(v) = nums.iter().copied().find(|v| (-30..=0).contains(v)) {
                    s.rsrq_db = Some(v as f64);
                }
            }
            if s.sinr_db.is_none() {
                if let Some(v) = nums.iter().copied().rev().find(|v| (-30..=80).contains(v)) {
                    s.sinr_db = Some(v as f64);
                }
            }
        }

        if up.starts_with("+CEREG:") || up.starts_with("+CGREG:") || up.starts_with("+CREG:") {
            let q = quoted_values(line);
            if q.len() >= 2 {
                if s.tac.is_none() {
                    s.tac = Some(q[0].clone());
                }
                if s.cell_id.is_none() {
                    s.cell_id = Some(q[1].clone());
                }
            }
        }
    }

    if s.tech.is_none() {
        s.tech = Some("LTE".to_string());
    }

    s
}

fn parse_signed_numbers(text: &str) -> Vec<i32> {
    let mut out = Vec::new();
    let mut cur = String::new();
    for ch in text.chars() {
        if ch.is_ascii_digit() || ((ch == '-' || ch == '+') && cur.is_empty()) {
            cur.push(ch);
        } else if !cur.is_empty() {
            if let Ok(v) = cur.parse::<i32>() {
                out.push(v);
            }
            cur.clear();
        }
    }
    if !cur.is_empty() {
        if let Ok(v) = cur.parse::<i32>() {
            out.push(v);
        }
    }
    out
}

fn first_quoted(text: &str) -> Option<String> {
    quoted_values(text).into_iter().next()
}

fn quoted_values(text: &str) -> Vec<String> {
    let mut vals = Vec::new();
    let mut in_q = false;
    let mut cur = String::new();
    for ch in text.chars() {
        if ch == '"' {
            if in_q {
                vals.push(cur.clone());
                cur.clear();
                in_q = false;
            } else {
                in_q = true;
            }
            continue;
        }
        if in_q {
            cur.push(ch);
        }
    }
    vals
}

fn find_hex_words(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    for tok in text.split(|c: char| c == ',' || c.is_whitespace() || c == ':') {
        let t = tok.trim();
        let tu = t.to_ascii_lowercase();
        if tu.starts_with("0x") && tu.len() > 2 && tu[2..].chars().all(|c| c.is_ascii_hexdigit()) {
            out.push(t.to_string());
        }
    }
    out
}

fn map_cops_act_to_tech(act: i32) -> &'static str {
    match act {
        7 => "LTE",
        9 => "LTE-M",
        2 => "UTRAN",
        0 => "GSM",
        _ => "Cellular",
    }
}

fn extract_bt_address_from_instance_id(instance_id: &str) -> Option<String> {
    // InstanceId format examples:
    //   BTHENUM\{0000110b-...}\7&2a3b4c5d&0&000EC6AABBCC_C00000000
    //   BTHLE\DEV_AABBCCDDEEFF\...
    // Try to extract 12 hex digits that look like a MAC address
    let upper = instance_id.to_uppercase();
    for part in upper.split(['\\', '_', '&', '{', '}']) {
        let p = part.trim();
        if p.len() == 12 && p.chars().all(|c| c.is_ascii_hexdigit()) {
            let addr = p.chars()
                .collect::<Vec<_>>()
                .chunks(2)
                .map(|ch| ch.iter().collect::<String>())
                .collect::<Vec<_>>()
                .join(":");
            return Some(addr);
        }
    }
    None
}


// ─── Helpers ─────────────────────────────────────────────────────────────────

fn run_wifi_netsh_show_networks() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let output = Command::new("netsh")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["wlan", "show", "networks", "mode=bssid"])
            .output()
            .map_err(|e| format!("Failed to run netsh wlan show networks: {e}"))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let combined = if stderr.trim().is_empty() {
            stdout.clone()
        } else {
            format!("{}\n{}", stdout, stderr)
        };

        if !output.status.success() {
            return Err(map_wifi_netsh_error(&combined));
        }

        if stdout.trim().is_empty() {
            return Err("netsh returned empty output".into());
        }

        if combined.to_ascii_lowercase().contains("location permission")
            || combined.to_ascii_lowercase().contains("requires elevation")
        {
            return Err(map_wifi_netsh_error(&combined));
        }

        Ok(stdout)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("WiFi Detector is currently supported on Windows only.".into())
    }
}

fn map_wifi_netsh_error(raw: &str) -> String {
    let lower = raw.to_ascii_lowercase();

    if lower.contains("location permission") {
        return "WiFi scan blocked by Windows privacy settings. Enable Location Services in Settings > Privacy & security > Location.".to_string();
    }
    if lower.contains("requires elevation") || lower.contains("error 5") {
        return "WiFi scan requires elevated privileges. Run the app as Administrator and try again.".to_string();
    }
    if lower.contains("there is no wireless interface") {
        return "No wireless interface detected on this system.".to_string();
    }

    format!("WiFi scan failed: {}", raw.trim())
}

fn list_saved_wifi_profiles() -> Result<Vec<WifiNetwork>, String> {
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let output = Command::new("netsh")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["wlan", "show", "profiles"])
            .output()
            .map_err(|e| format!("Failed to run netsh wlan show profiles: {e}"))?;

        if !output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let combined = if stderr.trim().is_empty() { stdout } else { format!("{}\n{}", stdout, stderr) };
            return Err(format!("Failed to read saved WiFi profiles: {}", combined.trim()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let mut names = HashSet::<String>::new();

        for line in stdout.lines() {
            let trimmed = line.trim();
            let Some((left, right)) = trimmed.split_once(':') else {
                continue;
            };
            let left_l = left.to_ascii_lowercase();
            if !left_l.contains("profile") {
                continue;
            }
            let name = right.trim();
            if name.is_empty() || name.eq_ignore_ascii_case("<none>") {
                continue;
            }
            names.insert(name.to_string());
        }

        let mut out: Vec<WifiNetwork> = names
            .into_iter()
            .map(|ssid| WifiNetwork {
                ssid,
                bssid_count: 0,
                best_signal_pct: None,
                source: "profile".to_string(),
            })
            .collect();

        out.sort_by(|a, b| a.ssid.cmp(&b.ssid));
        Ok(out)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("WiFi profile fallback is currently supported on Windows only.".into())
    }
}

fn run_wifi_netsh_show_profile(profile_name: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let output = Command::new("netsh")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["wlan", "show", "profile", &format!("name={}", profile_name)])
            .output()
            .map_err(|e| format!("Failed to run netsh wlan show profile: {e}"))?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let combined = if stderr.trim().is_empty() { stdout.clone() } else { format!("{}\n{}", stdout, stderr) };

        if !output.status.success() {
            return Err(format!("Failed to read WiFi profile '{}': {}", profile_name, combined.trim()));
        }

        if stdout.trim().is_empty() {
            return Err(format!("WiFi profile '{}' returned empty output", profile_name));
        }

        Ok(stdout)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("WiFi profile details are currently supported on Windows only.".into())
    }
}

fn parse_wifi_properties_from_lines(lines: &[String]) -> Vec<WifiProperty> {
    let mut properties = Vec::new();
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            let key = k.trim();
            let value = v.trim();
            if key.is_empty() || value.is_empty() {
                continue;
            }
            properties.push(WifiProperty {
                key: key.to_string(),
                value: value.to_string(),
            });
        }
    }
    properties
}

fn parse_wifi_network_blocks(raw: &str) -> Vec<WifiNetworkBlock> {
    let mut blocks: Vec<WifiNetworkBlock> = Vec::new();
    let mut current: Option<WifiNetworkBlock> = None;

    for line in raw.lines() {
        let trimmed = line.trim();
        if let Some(ssid) = parse_ssid_header_line(trimmed) {
            if let Some(prev) = current.take() {
                blocks.push(prev);
            }
            current = Some(WifiNetworkBlock {
                ssid,
                lines: vec![trimmed.to_string()],
            });
            continue;
        }

        if let Some(ref mut block) = current {
            block.lines.push(trimmed.to_string());
        }
    }

    if let Some(last) = current {
        blocks.push(last);
    }

    blocks
}

fn parse_ssid_header_line(line: &str) -> Option<String> {
    let (left, right) = line.split_once(':')?;
    let key = left.trim().to_ascii_lowercase();
    if !key.starts_with("ssid ") {
        return None;
    }
    if key.contains("bssid") {
        return None;
    }

    let ssid = right.trim();
    if ssid.is_empty() {
        Some("(hidden SSID)".to_string())
    } else {
        Some(ssid.to_string())
    }
}

fn count_bssid_lines(lines: &[String]) -> usize {
    lines
        .iter()
        .filter(|line| {
            line.split_once(':')
                .map(|(k, _)| {
                    let key = k.trim().to_ascii_lowercase();
                    key.starts_with("bssid ")
                })
                .unwrap_or(false)
        })
        .count()
}

fn best_signal_percent(lines: &[String]) -> Option<u8> {
    let mut best: Option<u8> = None;
    for line in lines {
        let Some((_, value_part)) = line.split_once(':') else {
            continue;
        };
        if !value_part.contains('%') {
            continue;
        }
        let digits: String = value_part.chars().filter(|c| c.is_ascii_digit()).collect();
        let Ok(value) = digits.parse::<u8>() else {
            continue;
        };
        best = Some(best.map_or(value, |prev| prev.max(value)));
    }
    best
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

fn parse_ipv4_socket(s: &str) -> Option<(String, u16)> {
    let mut parts = s.rsplitn(2, ':');
    let port_str = parts.next()?;
    let host_str = parts.next()?;
    if host_str.contains('[') || host_str.contains(']') || host_str.contains("::") {
        return None;
    }
    let port = port_str.parse::<u16>().ok()?;
    let ip = host_str.trim();
    if ip.is_empty() {
        return None;
    }
    if IpAddr::from_str(ip).ok().and_then(|addr| match addr {
        IpAddr::V4(v4) => Some(v4.to_string()),
        IpAddr::V6(_) => None,
    }).is_none() {
        return None;
    }
    Some((ip.to_string(), port))
}

fn close_tool_windows(app: &AppHandle) {
    for label in TOOL_WINDOW_LABELS {
        if let Some(win) = app.get_webview_window(label) {
            let _ = win.close();
        }
    }
}

async fn resolve_target_ipv4(target: &str) -> Result<String, String> {
    match IpAddr::from_str(target) {
        Ok(IpAddr::V4(v4)) => return Ok(v4.to_string()),
        Ok(IpAddr::V6(_)) => return Err("IPv6 is not supported for traceroute in this tool".into()),
        Err(_) => {}
    }

    let query = format!("{}:0", target);
    let mut addrs = lookup_host(query)
        .await
        .map_err(|e| format!("DNS resolve failed: {}", e))?;

    if let Some(addr) = addrs.find(|sa| matches!(sa.ip(), IpAddr::V4(_))) {
        if let IpAddr::V4(v4) = addr.ip() {
            return Ok(v4.to_string());
        }
    }

    Err("No IPv4 address found for this hostname".into())
}

#[tauri::command]
async fn resolve_domain_ipv4(target: String) -> Result<String, String> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err("Empty hostname".into());
    }
    resolve_target_ipv4(trimmed).await
}

// ─── Image Metadata ──────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
struct ImgMetaEntry {
    section: String,
    key: String,
    value: String,
}

impl ImgMetaEntry {
    fn new(section: &str, key: &str, value: impl Into<String>) -> Self {
        ImgMetaEntry { section: section.into(), key: key.into(), value: value.into() }
    }
}

fn read_u16_be(buf: &[u8], off: usize) -> Option<u16> {
    Some(((*buf.get(off)?) as u16) << 8 | (*buf.get(off + 1)?) as u16)
}
fn read_u16_le(buf: &[u8], off: usize) -> Option<u16> {
    Some((*buf.get(off)?) as u16 | ((*buf.get(off + 1)?) as u16) << 8)
}
fn read_u32_be(buf: &[u8], off: usize) -> Option<u32> {
    Some(((*buf.get(off)?) as u32) << 24 | ((*buf.get(off+1)?) as u32) << 16
        | ((*buf.get(off+2)?) as u32) << 8 | (*buf.get(off+3)?) as u32)
}
fn read_u32_le(buf: &[u8], off: usize) -> Option<u32> {
    Some((*buf.get(off)?) as u32 | ((*buf.get(off+1)?) as u32) << 8
        | ((*buf.get(off+2)?) as u32) << 16 | ((*buf.get(off+3)?) as u32) << 24)
}
fn read_i32_le(buf: &[u8], off: usize) -> Option<i32> {
    read_u32_le(buf, off).map(|v| v as i32)
}

fn safe_ascii(buf: &[u8]) -> String {
    buf.iter().map(|&b| if b >= 0x20 && b < 0x7f { b as char } else { '?' }).collect()
}

fn decode_utf16le_ztrim(buf: &[u8]) -> String {
    let mut units = Vec::with_capacity(buf.len() / 2);
    let mut i = 0usize;
    while i + 1 < buf.len() {
        let u = u16::from_le_bytes([buf[i], buf[i + 1]]);
        if u == 0 { break; }
        units.push(u);
        i += 2;
    }
    String::from_utf16_lossy(&units).trim().to_string()
}

// ── JPEG ──────────────────────────────────────────────────────────────────────

fn parse_jpeg(data: &[u8], out: &mut Vec<ImgMetaEntry>) {
    let mut pos = 2usize; // skip SOI FF D8
    while pos + 3 < data.len() {
        if data[pos] != 0xFF { break; }
        let marker = data[pos + 1];
        if marker == 0xD9 || marker == 0xD8 { pos += 2; continue; }
        let seg_len = match read_u16_be(data, pos + 2) { Some(l) => l as usize, None => break };
        let seg_end = pos + 2 + seg_len;
        let seg = data.get(pos + 4..seg_end.min(data.len())).unwrap_or(&[]);

        match marker {
            0xE0 => { // APP0 JFIF
                if seg.starts_with(b"JFIF\0") && seg.len() >= 14 {
                    let units = seg[7];
                    let xdpi = read_u16_be(seg, 8).unwrap_or(0);
                    let ydpi = read_u16_be(seg, 10).unwrap_or(0);
                    out.push(ImgMetaEntry::new("JFIF","Version", format!("{}.{:02}", seg[5], seg[6])));
                    out.push(ImgMetaEntry::new("JFIF","DensityUnit", match units { 1 => "DPI", 2 => "DPCM", _ => "Aspect ratio" }));
                    if units > 0 { out.push(ImgMetaEntry::new("JFIF","XDensity", xdpi.to_string())); out.push(ImgMetaEntry::new("JFIF","YDensity", ydpi.to_string())); }
                    if seg.len() >= 14 { out.push(ImgMetaEntry::new("JFIF","Thumbnail", format!("{}×{}", seg[12], seg[13]))); }
                }
            }
            0xE1 => { // APP1 EXIF or XMP
                if seg.starts_with(b"Exif\0\0") {
                    parse_exif(&seg[6..], out);
                } else if seg.starts_with(b"http://ns.adobe.com/xap/1.0/\0") {
                    if let Ok(s) = std::str::from_utf8(&seg[29..]) {
                        extract_xmp_simple(s, out);
                    }
                }
            }
            0xE2 => { // APP2 ICC or Flashpix
                if seg.starts_with(b"ICC_PROFILE\0") { out.push(ImgMetaEntry::new("Color","ICC Profile","present")); }
            }
            0xED => { // APP13 IPTC
                if seg.starts_with(b"Photoshop 3.0\0") { parse_iptc(seg, out); }
            }
            0xEE => { // APP14 Adobe
                if seg.starts_with(b"Adobe") && seg.len() >= 12 {
                    out.push(ImgMetaEntry::new("Adobe","DCTEncodeVersion", read_u16_be(seg,6).unwrap_or(0).to_string()));
                    out.push(ImgMetaEntry::new("Adobe","ColorTransform", match seg.get(11).copied().unwrap_or(0) { 0=>"RGB/CMYK", 1=>"YCbCr", 2=>"YCCK", _=>"Unknown" }));
                }
            }
            0xC0 | 0xC1 | 0xC2 | 0xC3 => { // SOF markers → dimensions
                if seg.len() >= 5 {
                    let prec = seg[0];
                    let h = read_u16_be(seg, 1).unwrap_or(0);
                    let w = read_u16_be(seg, 3).unwrap_or(0);
                    let comp = seg.get(5).copied().unwrap_or(0);
                    out.push(ImgMetaEntry::new("Image","Width", w.to_string()));
                    out.push(ImgMetaEntry::new("Image","Height", h.to_string()));
                    out.push(ImgMetaEntry::new("Image","BitDepth", prec.to_string()));
                    out.push(ImgMetaEntry::new("Image","Components", comp.to_string()));
                    out.push(ImgMetaEntry::new("Image","ColorMode", match comp { 1=>"Grayscale", 3=>"YCbCr/RGB", 4=>"CMYK", _=>"Unknown" }));
                    out.push(ImgMetaEntry::new("Image","Encoding", match marker { 0xC0=>"Baseline DCT", 0xC1=>"Extended seq. DCT", 0xC2=>"Progressive DCT", 0xC3=>"Lossless", _=>"Unknown" }));
                }
            }
            0xFE => { // COM comment
                if let Ok(s) = std::str::from_utf8(seg) { out.push(ImgMetaEntry::new("Comment","Comment", s.trim())); }
            }
            _ => {}
        }

        if seg_end <= pos + 2 { break; }
        pos = seg_end;
    }
}

// ── EXIF/TIFF IFD parser ─────────────────────────────────────────────────────

fn parse_exif(data: &[u8], out: &mut Vec<ImgMetaEntry>) {
    if data.len() < 8 { return; }
    let little_endian = match data.get(0..2) {
        Some(b"II") => true,
        Some(b"MM") => false,
        _ => return,
    };
    let r16 = |off: usize| -> Option<u16> { if little_endian { read_u16_le(data, off) } else { read_u16_be(data, off) } };
    let r32 = |off: usize| -> Option<u32> { if little_endian { read_u32_le(data, off) } else { read_u32_be(data, off) } };
    let magic = r16(2).unwrap_or(0);
    if magic != 42 { return; }
    let ifd0_off = r32(4).unwrap_or(0) as usize;
    parse_tiff_ifd(data, ifd0_off, little_endian, "EXIF", out, 0);
}

fn parse_tiff_ifd(data: &[u8], off: usize, le: bool, section: &str, out: &mut Vec<ImgMetaEntry>, depth: u8) {
    if depth > 3 { return; }
    let r16 = |o: usize| -> Option<u16> { if le { read_u16_le(data, o) } else { read_u16_be(data, o) } };
    let r32 = |o: usize| -> Option<u32> { if le { read_u32_le(data, o) } else { read_u32_be(data, o) } };

    let count = match r16(off) { Some(c) => c as usize, None => return };
    for i in 0..count {
        let entry_off = off + 2 + i * 12;
        if entry_off + 12 > data.len() { break; }
        let tag = match r16(entry_off) { Some(v) => v, None => break };
        let typ = match r16(entry_off + 2) { Some(v) => v, None => break };
        let cnt = match r32(entry_off + 4) { Some(v) => v as usize, None => break };
        let val_off_raw = match r32(entry_off + 8) { Some(v) => v as usize, None => break };

        // Value offset or inline value
        let type_size = match typ { 1|2|7 => 1, 3|8 => 2, 4|9|11 => 4, 5|10|12 => 8, _ => 1 };
        let val_size = type_size * cnt;
        let val_start = if val_size <= 4 { entry_off + 8 } else { val_off_raw };
        if val_start + val_size > data.len() && val_size > 4 { continue; }
        let vdata = data.get(val_start..).unwrap_or(&[]);

        let read_rat_f = |o: usize| -> Option<f64> {
            let n = if le { read_u32_le(data, val_start + o) } else { read_u32_be(data, val_start + o) };
            let d = if le { read_u32_le(data, val_start + o + 4) } else { read_u32_be(data, val_start + o + 4) };
            match (n, d) {
                (Some(n), Some(d)) if d != 0 => Some(n as f64 / d as f64),
                _ => None,
            }
        };
        let read_str = || -> String {
            let end = vdata.iter().position(|&b| b == 0).unwrap_or(val_size.min(vdata.len()));
            std::str::from_utf8(&vdata[..end]).unwrap_or("").trim().to_string()
        };
        let read_u16v = || -> Option<u16> { if le { read_u16_le(vdata, 0) } else { read_u16_be(vdata, 0) } };
        let read_u32v = || -> Option<u32> { if le { read_u32_le(vdata, 0) } else { read_u32_be(vdata, 0) } };

        match (section, tag) {
            // ── IFD0 / common TIFF tags ──────────────────────────────────────
            (_, 0x010E) => out.push(ImgMetaEntry::new(section, "ImageDescription", read_str())),
            (_, 0x010F) => out.push(ImgMetaEntry::new(section, "Make", read_str())),
            (_, 0x0110) => out.push(ImgMetaEntry::new(section, "Model", read_str())),
            (_, 0x0112) => out.push(ImgMetaEntry::new(section, "Orientation", match read_u16v().unwrap_or(0) {
                1=>"Normal",2=>"Mirror H",3=>"180°",4=>"Mirror V",
                5=>"Mirror H+90°CW",6=>"90°CW",7=>"Mirror H+90°CCW",8=>"90°CCW",_=>"Unknown"
            })),
            (_, 0x011A) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new(section,"XResolution", format!("{:.2}", v))); } }
            (_, 0x011B) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new(section,"YResolution", format!("{:.2}", v))); } }
            (_, 0x0128) => out.push(ImgMetaEntry::new(section,"ResolutionUnit", match read_u16v().unwrap_or(0) { 2=>"inch",3=>"cm",_=>"none" })),
            (_, 0x0131) => out.push(ImgMetaEntry::new(section,"Software", read_str())),
            (_, 0x0132) => out.push(ImgMetaEntry::new(section,"DateTime", read_str())),
            (_, 0x013B) => out.push(ImgMetaEntry::new(section,"Artist", read_str())),
            (_, 0x013C) => out.push(ImgMetaEntry::new(section,"HostComputer", read_str())),
            (_, 0x8298) => out.push(ImgMetaEntry::new(section,"Copyright", read_str())),
            // Windows XP EXIF tags (UTF-16LE)
            (_, 0x9C9B) => { let s = decode_utf16le_ztrim(vdata); if !s.is_empty() { out.push(ImgMetaEntry::new(section,"XPAuthor", s)); } }
            (_, 0x9C9C) => { let s = decode_utf16le_ztrim(vdata); if !s.is_empty() { out.push(ImgMetaEntry::new(section,"XPComment", s)); } }
            (_, 0x9C9D) => { let s = decode_utf16le_ztrim(vdata); if !s.is_empty() { out.push(ImgMetaEntry::new(section,"XPKeywords", s)); } }
            (_, 0x9C9E) => { let s = decode_utf16le_ztrim(vdata); if !s.is_empty() { out.push(ImgMetaEntry::new(section,"XPSubject", s)); } }
            (_, 0x9C9F) => { let s = decode_utf16le_ztrim(vdata); if !s.is_empty() { out.push(ImgMetaEntry::new(section,"XPTitle", s)); } }
            // TIFF structural tags
            (_, 0x0115) => { if let Some(v) = read_u16v() { out.push(ImgMetaEntry::new(section,"SamplesPerPixel", v.to_string())); } }
            (_, 0x0116) => { if let Some(v) = read_u32v() { out.push(ImgMetaEntry::new(section,"RowsPerStrip", v.to_string())); } }
            (_, 0x011C) => out.push(ImgMetaEntry::new(section,"PlanarConfig", match read_u16v().unwrap_or(0) { 1=>"Chunky",2=>"Planar",_=>"Other" })),
            (_, 0x013D) => out.push(ImgMetaEntry::new(section,"Predictor", match read_u16v().unwrap_or(0) { 1=>"None",2=>"Horizontal",3=>"Float",_=>"Other" })),
            (_, 0x013E) => { if let (Some(x), Some(y)) = (read_rat_f(0), read_rat_f(8)) { out.push(ImgMetaEntry::new(section,"WhitePoint", format!("{:.4}, {:.4}", x, y))); } }
            (_, 0x013F) => { // PrimaryChromaticities: 6 rationals (Rx,Ry,Gx,Gy,Bx,By)
                if val_size >= 48 {
                    let vals: Vec<String> = (0..6).filter_map(|i| read_rat_f(i * 8).map(|v| format!("{:.4}", v))).collect();
                    if vals.len() == 6 { out.push(ImgMetaEntry::new(section,"PrimaryChromaticities", vals.join(", "))); }
                }
            }
            (_, 0x0100) => { if let Some(v) = read_u32v() { out.push(ImgMetaEntry::new(section,"Width", v.to_string())); } }
            (_, 0x0101) => { if let Some(v) = read_u32v() { out.push(ImgMetaEntry::new(section,"Height", v.to_string())); } }
            (_, 0x0102) => { if let Some(v) = read_u16v() { out.push(ImgMetaEntry::new(section,"BitsPerSample", v.to_string())); } }
            (_, 0x0103) => out.push(ImgMetaEntry::new(section,"Compression", match read_u16v().unwrap_or(0) {
                1=>"None",2=>"CCITT",3=>"Fax3",4=>"Fax4",5=>"LZW",6=>"JPEG (old)",7=>"JPEG",
                8=>"Deflate",32773=>"PackBits",_=>"Other"
            })),
            (_, 0x0106) => out.push(ImgMetaEntry::new(section,"PhotometricInterp", match read_u16v().unwrap_or(0) {
                0=>"WhiteIsZero",1=>"BlackIsZero",2=>"RGB",3=>"Palette",
                4=>"Transparency Mask",5=>"CMYK",6=>"YCbCr",8=>"CIELab",_=>"Other"
            })),
            // ── SubIFD pointers ──────────────────────────────────────────────
            (_, 0x8769) => { // ExifIFD
                if let Some(ptr) = read_u32v() { parse_tiff_ifd(data, ptr as usize, le, "ExifIFD", out, depth + 1); }
            }
            (_, 0x8825) => { // GPSIFD
                if let Some(ptr) = read_u32v() { parse_tiff_ifd(data, ptr as usize, le, "GPS", out, depth + 1); }
            }
            // ── ExifIFD tags ─────────────────────────────────────────────────
            ("ExifIFD", 0x829A) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new("ExifIFD","ExposureTime", format!("{:.6} s", v))); } }
            ("ExifIFD", 0x829D) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new("ExifIFD","FNumber", format!("f/{:.1}", v))); } }
            ("ExifIFD", 0x8822) => out.push(ImgMetaEntry::new("ExifIFD","ExposureProgram", match read_u16v().unwrap_or(0) {
                0=>"Not defined",1=>"Manual",2=>"Normal",3=>"Aperture priority",
                4=>"Shutter priority",5=>"Creative",6=>"Action",7=>"Portrait",8=>"Landscape",_=>"Other"
            })),
            ("ExifIFD", 0x8827) => { if let Some(v) = read_u16v() { out.push(ImgMetaEntry::new("ExifIFD","ISO", v.to_string())); } }
            ("ExifIFD", 0x9000) => out.push(ImgMetaEntry::new("ExifIFD","ExifVersion", safe_ascii(&vdata[..val_size.min(4).min(vdata.len())]))),
            ("ExifIFD", 0x9003) => out.push(ImgMetaEntry::new("ExifIFD","DateTimeOriginal", read_str())),
            ("ExifIFD", 0x9004) => out.push(ImgMetaEntry::new("ExifIFD","DateTimeDigitized", read_str())),
            ("ExifIFD", 0x9201) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new("ExifIFD","ShutterSpeedValue", format!("{:.4} EV", v))); } }
            ("ExifIFD", 0x9202) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new("ExifIFD","ApertureValue", format!("{:.4} EV", v))); } }
            ("ExifIFD", 0x9204) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new("ExifIFD","ExposureBias", format!("{:.2} EV", v))); } }
            ("ExifIFD", 0x9207) => out.push(ImgMetaEntry::new("ExifIFD","MeteringMode", match read_u16v().unwrap_or(0) {
                1=>"Average",2=>"CenterWeighted",3=>"Spot",4=>"MultiSpot",5=>"Pattern",6=>"Partial",_=>"Other"
            })),
            ("ExifIFD", 0x9208) => out.push(ImgMetaEntry::new("ExifIFD","LightSource", match read_u16v().unwrap_or(0) {
                0=>"Unknown",1=>"Daylight",2=>"Fluorescent",3=>"Tungsten",4=>"Flash",9=>"Fine weather",10=>"Cloudy",_=>"Other"
            })),
            ("ExifIFD", 0x9209) => { if let Some(v) = read_u16v() { out.push(ImgMetaEntry::new("ExifIFD","Flash", if v & 1 == 1 { "Fired" } else { "Did not fire" })); } }
            ("ExifIFD", 0x920A) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new("ExifIFD","FocalLength", format!("{:.1} mm", v))); } }
            ("ExifIFD", 0xA000) => out.push(ImgMetaEntry::new("ExifIFD","FlashPixVersion", safe_ascii(&vdata[..val_size.min(4).min(vdata.len())]))),
            ("ExifIFD", 0xA001) => out.push(ImgMetaEntry::new("ExifIFD","ColorSpace", match read_u16v().unwrap_or(0) { 1=>"sRGB", 0xFFFF=>"Uncalibrated", _=>"Other" })),
            ("ExifIFD", 0xA002) => { if let Some(v) = read_u32v() { out.push(ImgMetaEntry::new("ExifIFD","PixelWidth", v.to_string())); } }
            ("ExifIFD", 0xA003) => { if let Some(v) = read_u32v() { out.push(ImgMetaEntry::new("ExifIFD","PixelHeight", v.to_string())); } }
            ("ExifIFD", 0xA401) => out.push(ImgMetaEntry::new("ExifIFD","CustomRendered", match read_u16v().unwrap_or(0) { 0=>"Normal",1=>"Custom",_=>"Other" })),
            ("ExifIFD", 0xA402) => out.push(ImgMetaEntry::new("ExifIFD","ExposureMode", match read_u16v().unwrap_or(0) { 0=>"Auto",1=>"Manual",2=>"Auto bracket",_=>"Other" })),
            ("ExifIFD", 0xA403) => out.push(ImgMetaEntry::new("ExifIFD","WhiteBalance", match read_u16v().unwrap_or(0) { 0=>"Auto",1=>"Manual",_=>"Other" })),
            ("ExifIFD", 0xA404) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new("ExifIFD","DigitalZoomRatio", format!("{:.2}×", v))); } }
            ("ExifIFD", 0xA405) => { if let Some(v) = read_u16v() { out.push(ImgMetaEntry::new("ExifIFD","FocalLength35mm", format!("{} mm", v))); } }
            ("ExifIFD", 0xA406) => out.push(ImgMetaEntry::new("ExifIFD","SceneCaptureType", match read_u16v().unwrap_or(0) { 0=>"Standard",1=>"Landscape",2=>"Portrait",3=>"Night scene",_=>"Other" })),
            ("ExifIFD", 0xA408) => out.push(ImgMetaEntry::new("ExifIFD","Contrast", match read_u16v().unwrap_or(0) { 0=>"Normal",1=>"Soft",2=>"Hard",_=>"Other" })),
            ("ExifIFD", 0xA409) => out.push(ImgMetaEntry::new("ExifIFD","Saturation", match read_u16v().unwrap_or(0) { 0=>"Normal",1=>"Low",2=>"High",_=>"Other" })),
            ("ExifIFD", 0xA40A) => out.push(ImgMetaEntry::new("ExifIFD","Sharpness", match read_u16v().unwrap_or(0) { 0=>"Normal",1=>"Soft",2=>"Hard",_=>"Other" })),
            ("ExifIFD", 0xA420) => out.push(ImgMetaEntry::new("ExifIFD","ImageUniqueID", read_str())),
            ("ExifIFD", 0xA430) => out.push(ImgMetaEntry::new("ExifIFD","CameraOwnerName", read_str())),
            ("ExifIFD", 0x9286) => { // UserComment
                if vdata.len() >= 8 {
                    let charset = &vdata[..8];
                    let txt = &vdata[8..val_size.min(vdata.len())];
                    if charset.starts_with(b"ASCII") || charset.starts_with(b"\0\0\0\0\0\0\0\0") {
                        if let Ok(s) = std::str::from_utf8(txt) { let s = s.trim_matches('\0').trim().to_string(); if !s.is_empty() { out.push(ImgMetaEntry::new("ExifIFD","UserComment", s)); } }
                    }
                }
            }
            // ── More ExifIFD tags ────────────────────────────────────────────
            ("ExifIFD", 0x9203) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new("ExifIFD","BrightnessValue", format!("{:.4} EV", v))); } }
            ("ExifIFD", 0x9205) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new("ExifIFD","MaxApertureValue", format!("{:.4} EV", v))); } }
            ("ExifIFD", 0x9206) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new("ExifIFD","SubjectDistance", format!("{:.2} m", v))); } }
            ("ExifIFD", 0x9214) => { // SubjectArea: 2, 3, or 4 SHORTs
                let cnt2 = cnt.min(4);
                let vals: Vec<String> = (0..cnt2).filter_map(|i| r16(val_start + i*2).map(|v| v.to_string())).collect();
                if !vals.is_empty() { out.push(ImgMetaEntry::new("ExifIFD","SubjectArea", vals.join(", "))); }
            }
            ("ExifIFD", 0x927C) => { out.push(ImgMetaEntry::new("ExifIFD","MakerNote","present")); }
            ("ExifIFD", 0x9290) => { let s = read_str(); if !s.is_empty() { out.push(ImgMetaEntry::new("ExifIFD","SubSecTime", s)); } }
            ("ExifIFD", 0x9291) => { let s = read_str(); if !s.is_empty() { out.push(ImgMetaEntry::new("ExifIFD","SubSecTimeOriginal", s)); } }
            ("ExifIFD", 0x9292) => { let s = read_str(); if !s.is_empty() { out.push(ImgMetaEntry::new("ExifIFD","SubSecTimeDigitized", s)); } }
            ("ExifIFD", 0xA20E) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new("ExifIFD","FocalPlaneXResolution", format!("{:.2}", v))); } }
            ("ExifIFD", 0xA20F) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new("ExifIFD","FocalPlaneYResolution", format!("{:.2}", v))); } }
            ("ExifIFD", 0xA210) => out.push(ImgMetaEntry::new("ExifIFD","FocalPlaneResUnit", match read_u16v().unwrap_or(0) { 1=>"None",2=>"inch",3=>"cm",_=>"Other" })),
            ("ExifIFD", 0xA214) => { if let (Some(x), Some(y)) = (r16(val_start), r16(val_start+2)) { out.push(ImgMetaEntry::new("ExifIFD","SubjectLocation", format!("{}, {}", x, y))); } }
            ("ExifIFD", 0xA215) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new("ExifIFD","ExposureIndex", format!("{:.2}", v))); } }
            ("ExifIFD", 0xA217) => out.push(ImgMetaEntry::new("ExifIFD","SensingMethod", match read_u16v().unwrap_or(0) {
                1=>"Not defined",2=>"One-chip color area",3=>"Two-chip color area",
                4=>"Three-chip color area",5=>"Color sequential area",
                7=>"Trilinear",8=>"Color sequential linear",_=>"Other"
            })),
            ("ExifIFD", 0xA300) => { out.push(ImgMetaEntry::new("ExifIFD","FileSource", match vdata.first().copied().unwrap_or(0) { 1=>"Film scanner",2=>"Reflection print scanner",3=>"Digital camera",_=>"Other" })); }
            ("ExifIFD", 0xA301) => { out.push(ImgMetaEntry::new("ExifIFD","SceneType", match vdata.first().copied().unwrap_or(0) { 1=>"Directly photographed",_=>"Other" })); }
            ("ExifIFD", 0xA407) => out.push(ImgMetaEntry::new("ExifIFD","GainControl", match read_u16v().unwrap_or(0) { 0=>"None",1=>"Low gain up",2=>"High gain up",3=>"Low gain down",4=>"High gain down",_=>"Other" })),
            ("ExifIFD", 0xA40C) => out.push(ImgMetaEntry::new("ExifIFD","SubjectDistanceRange", match read_u16v().unwrap_or(0) { 0=>"Unknown",1=>"Macro",2=>"Close",3=>"Distant",_=>"Other" })),
            ("ExifIFD", 0xA431) => { let s = read_str(); if !s.is_empty() { out.push(ImgMetaEntry::new("ExifIFD","BodySerialNumber", s)); } }
            ("ExifIFD", 0xA432) => { // LensSpecification: min focal, max focal, min aperture, max aperture (4 RATIONAL)
                if let (Some(f1), Some(f2)) = (read_rat_f(0), read_rat_f(8)) {
                    let astr = match (read_rat_f(16), read_rat_f(24)) {
                        (Some(a1), Some(a2)) if a1 > 0.0 && a2 > 0.0 && (a1 - a2).abs() > 0.05 => format!(" f/{:.1}-{:.1}", a1, a2),
                        (Some(a1), _) if a1 > 0.0 => format!(" f/{:.1}", a1),
                        _ => String::new(),
                    };
                    let fstr = if (f1 - f2).abs() < 0.5 { format!("{:.0}mm", f1) } else { format!("{:.0}-{:.0}mm", f1, f2) };
                    out.push(ImgMetaEntry::new("ExifIFD","LensSpecification", format!("{}{}", fstr, astr)));
                }
            }
            ("ExifIFD", 0xA433) => { let s = read_str(); if !s.is_empty() { out.push(ImgMetaEntry::new("ExifIFD","LensMake", s)); } }
            ("ExifIFD", 0xA434) => { let s = read_str(); if !s.is_empty() { out.push(ImgMetaEntry::new("ExifIFD","LensModel", s)); } }
            ("ExifIFD", 0xA435) => { let s = read_str(); if !s.is_empty() { out.push(ImgMetaEntry::new("ExifIFD","LensSerialNumber", s)); } }
            ("ExifIFD", 0xA500) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new("ExifIFD","Gamma", format!("{:.4}", v))); } }
            // ── GPS tags ─────────────────────────────────────────────────────
            ("GPS", 0x0001) => out.push(ImgMetaEntry::new("GPS","LatitudeRef", safe_ascii(&vdata[..1.min(vdata.len())]))),
            ("GPS", 0x0003) => out.push(ImgMetaEntry::new("GPS","LongitudeRef", safe_ascii(&vdata[..1.min(vdata.len())]))),
            ("GPS", 0x0005) => out.push(ImgMetaEntry::new("GPS","AltitudeRef", match vdata.first().copied().unwrap_or(0) { 0=>"Above sea level",1=>"Below sea level",_=>"Unknown" })),
            ("GPS", 0x000C) => out.push(ImgMetaEntry::new("GPS","SpeedRef", safe_ascii(&vdata[..1.min(vdata.len())]))),
            ("GPS", 0x0010) => out.push(ImgMetaEntry::new("GPS","ImgDirectionRef", safe_ascii(&vdata[..1.min(vdata.len())]))),
            ("GPS", 0x0012) => out.push(ImgMetaEntry::new("GPS","MapDatum", read_str())),
            ("GPS", 0x001D) => out.push(ImgMetaEntry::new("GPS","DateStamp", read_str())),
            ("GPS", 0x0002) => { // GPSLatitude (3 rationals)
                if let (Some(d), Some(m), Some(s)) = (read_rat_f(0), read_rat_f(8), read_rat_f(16)) {
                    out.push(ImgMetaEntry::new("GPS","Latitude", format!("{}°{}'{:.4}\"", d as u32, m as u32, s)));
                }
            }
            ("GPS", 0x0004) => { // GPSLongitude (3 rationals)
                if let (Some(d), Some(m), Some(s)) = (read_rat_f(0), read_rat_f(8), read_rat_f(16)) {
                    out.push(ImgMetaEntry::new("GPS","Longitude", format!("{}°{}'{:.4}\"", d as u32, m as u32, s)));
                }
            }
            ("GPS", 0x0006) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new("GPS","Altitude", format!("{:.2} m", v))); } }
            ("GPS", 0x000D) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new("GPS","Speed", format!("{:.2}", v))); } }
            ("GPS", 0x0011) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new("GPS","ImgDirection", format!("{:.2}°", v))); } }
            ("GPS", 0x0007) => { // GPSTimeStamp (3 rationals HH MM SS)
                if let (Some(h), Some(m), Some(s)) = (read_rat_f(0), read_rat_f(8), read_rat_f(16)) {
                    out.push(ImgMetaEntry::new("GPS","TimeStampUTC", format!("{:02}:{:02}:{:06.3}", h as u32, m as u32, s)));
                }
            }
            ("GPS", 0x0008) => { let s = read_str(); if !s.is_empty() { out.push(ImgMetaEntry::new("GPS","Satellites", s)); } }
            ("GPS", 0x0009) => { let s = safe_ascii(&vdata[..1.min(vdata.len())]); if !s.is_empty() { out.push(ImgMetaEntry::new("GPS","Status", s)); } }
            ("GPS", 0x000A) => { let s = safe_ascii(&vdata[..1.min(vdata.len())]); if !s.is_empty() { out.push(ImgMetaEntry::new("GPS","MeasureMode", s)); } }
            ("GPS", 0x000B) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new("GPS","DOP", format!("{:.4}", v))); } }
            ("GPS", 0x000E) => { let s = safe_ascii(&vdata[..1.min(vdata.len())]); if !s.is_empty() { out.push(ImgMetaEntry::new("GPS","TrackRef", s)); } }
            ("GPS", 0x000F) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new("GPS","Track", format!("{:.2}°", v))); } }
            ("GPS", 0x0013) => { let s = safe_ascii(&vdata[..1.min(vdata.len())]); if !s.is_empty() { out.push(ImgMetaEntry::new("GPS","DestLatitudeRef", s)); } }
            ("GPS", 0x0014) => {
                if let (Some(d), Some(m), Some(s)) = (read_rat_f(0), read_rat_f(8), read_rat_f(16)) {
                    out.push(ImgMetaEntry::new("GPS","DestLatitude", format!("{}°{}'{:.4}\"", d as u32, m as u32, s)));
                }
            }
            ("GPS", 0x0015) => { let s = safe_ascii(&vdata[..1.min(vdata.len())]); if !s.is_empty() { out.push(ImgMetaEntry::new("GPS","DestLongitudeRef", s)); } }
            ("GPS", 0x0016) => {
                if let (Some(d), Some(m), Some(s)) = (read_rat_f(0), read_rat_f(8), read_rat_f(16)) {
                    out.push(ImgMetaEntry::new("GPS","DestLongitude", format!("{}°{}'{:.4}\"", d as u32, m as u32, s)));
                }
            }
            ("GPS", 0x0017) => { let s = safe_ascii(&vdata[..1.min(vdata.len())]); if !s.is_empty() { out.push(ImgMetaEntry::new("GPS","DestBearingRef", s)); } }
            ("GPS", 0x0018) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new("GPS","DestBearing", format!("{:.2}°", v))); } }
            ("GPS", 0x0019) => { let s = safe_ascii(&vdata[..1.min(vdata.len())]); if !s.is_empty() { out.push(ImgMetaEntry::new("GPS","DestDistanceRef", s)); } }
            ("GPS", 0x001A) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new("GPS","DestDistance", format!("{:.4}", v))); } }
            ("GPS", 0x001B) => { let s = read_str(); if !s.is_empty() { out.push(ImgMetaEntry::new("GPS","GPSProcessingMethod", s)); } }
            ("GPS", 0x001C) => { let s = read_str(); if !s.is_empty() { out.push(ImgMetaEntry::new("GPS","GPSAreaInformation", s)); } }
            ("GPS", 0x001E) => { if let Some(v) = read_u16v() { out.push(ImgMetaEntry::new("GPS","Differential", if v == 0 { "No correction" } else { "Differential" })); } }
            ("GPS", 0x001F) => { if let Some(v) = read_rat_f(0) { out.push(ImgMetaEntry::new("GPS","HPositioningError", format!("{:.2} m", v))); } }
            _ => {}
        }
    }
    // Follow next IFD if present
    let next_off_pos = off + 2 + count * 12;
    if let Some(next) = r32(next_off_pos) {
        if next != 0 && next as usize + 2 < data.len() && depth == 0 {
            parse_tiff_ifd(data, next as usize, le, section, out, depth + 1);
        }
    }
}

// ── IPTC ─────────────────────────────────────────────────────────────────────

fn parse_iptc(data: &[u8], out: &mut Vec<ImgMetaEntry>) {
    let mut pos = 14usize; // skip "Photoshop 3.0\0"
    while pos + 5 < data.len() {
        if data[pos] != 0x38 || data[pos+1] != 0x42 || data[pos+2] != 0x49 || data[pos+3] != 0x4D { pos += 1; continue; }
        let resource_type = read_u16_be(data, pos+4).unwrap_or(0);
        let name_len = data.get(pos+7).copied().unwrap_or(0) as usize;
        let name_pad = if (name_len + 1) % 2 == 0 { name_len + 1 } else { name_len + 2 };
        let data_len = read_u32_be(data, pos + 6 + name_pad).unwrap_or(0) as usize;
        let block_start = pos + 10 + name_pad;
        if resource_type == 0x0404 { // IPTC-NAA
            let iptc_data = data.get(block_start..block_start+data_len).unwrap_or(&[]);
            let mut ip = 0usize;
            while ip + 4 < iptc_data.len() {
                if iptc_data[ip] != 0x1C { ip += 1; continue; }
                let ds = iptc_data[ip+1];
                let tag = iptc_data[ip+2];
                let len = read_u16_be(iptc_data, ip+3).unwrap_or(0) as usize;
                let val = iptc_data.get(ip+5..ip+5+len).unwrap_or(&[]);
                if ds == 2 {
                    let key = match tag {
                        5=>"ObjectName",7=>"EditStatus",10=>"Urgency",15=>"Category",20=>"Supplemental",
                        22=>"FixtureId",25=>"Keywords",26=>"ContentLocationCode",27=>"ContentLocationName",
                        30=>"ReleaseDate",35=>"ReleaseTime",37=>"ExpirationDate",38=>"ExpirationTime",
                        40=>"SpecialInstruction",42=>"ActionAdvised",45=>"ReferenceService",
                        47=>"ReferenceDate",50=>"ReferenceNumber",55=>"DateCreated",60=>"TimeCreated",
                        62=>"DigitalCreationDate",63=>"DigitalCreationTime",
                        65=>"OriginatingProgram",70=>"ProgramVersion",75=>"ObjectCycle",
                        80=>"ByLine",85=>"ByLineTitle",90=>"City",92=>"SubLocation",
                        95=>"Province",100=>"CountryCode",101=>"CountryName",
                        103=>"TransmissionRef",105=>"Headline",110=>"Credit",118=>"Contact",
                        115=>"Source",116=>"Copyright",120=>"Caption",122=>"WriterEditor",
                        130=>"ImageType",131=>"ImageOrientation",135=>"LanguageIdentifier",_=>"Other"
                    };
                    if key != "Other" {
                        if let Ok(s) = std::str::from_utf8(val) { let s = s.trim().to_string(); if !s.is_empty() { out.push(ImgMetaEntry::new("IPTC", key, s)); } }
                    }
                }
                ip += 5 + len;
            }
        }
        let block_end = block_start + data_len + if data_len % 2 != 0 { 1 } else { 0 };
        pos = block_end;
    }
}

// ── XMP extraction (simple tag scan) ─────────────────────────────────────────

fn extract_xmp_tag_value(xmp: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    if let Some(i) = xmp.find(&open) {
        let inner = &xmp[i + open.len()..];
        if let Some(j) = inner.find(&close) {
            let body = inner[..j].trim();
            if !body.is_empty() && !body.contains('<') {
                return Some(body.to_string());
            }
            if let Some(li_start) = body.find("<rdf:li") {
                let li_body = &body[li_start..];
                if let Some(gt) = li_body.find('>') {
                    let after = &li_body[gt + 1..];
                    if let Some(li_end) = after.find("</rdf:li>") {
                        let val = after[..li_end].trim();
                        if !val.is_empty() { return Some(val.to_string()); }
                    }
                }
            }
        }
    }

    let attr = format!("{}=\"", tag);
    if let Some(i) = xmp.find(&attr) {
        let rest = &xmp[i + attr.len()..];
        if let Some(j) = rest.find('"') {
            let val = rest[..j].trim();
            if !val.is_empty() { return Some(val.to_string()); }
        }
    }

    None
}

fn extract_xmp_simple(xmp: &str, out: &mut Vec<ImgMetaEntry>) {
    let fields = [
        ("dc:title","Title"), ("dc:description","Description"), ("dc:creator","Creator"),
        ("dc:subject","Subject"), ("dc:rights","Rights"), ("xmp:CreateDate","CreateDate"),
        ("xmp:ModifyDate","ModifyDate"), ("xmp:CreatorTool","CreatorTool"),
        ("xmp:MetadataDate","MetadataDate"),
        ("xmp:Rating","Rating"), ("photoshop:DateCreated","DateCreated"),
        ("photoshop:Credit","Credit"), ("photoshop:Source","Source"),
        ("photoshop:CaptionWriter","CaptionWriter"), ("xmpRights:UsageTerms","UsageTerms"),
        // Document identity (xmpMM)
        ("xmpMM:DocumentID","DocumentID"), ("xmpMM:OriginalDocumentID","OriginalDocumentID"),
        ("xmpMM:InstanceID","InstanceID"),
        // Photoshop namespace extras
        ("photoshop:ColorMode","XmpColorMode"), ("photoshop:ICCProfile","XmpICCProfile"),
        ("photoshop:Headline","XmpHeadline"), ("photoshop:Instructions","Instructions"),
        ("photoshop:TransmissionReference","TransmissionReference"),
        ("photoshop:Urgency","XmpUrgency"),
        ("photoshop:City","XmpCity"), ("photoshop:State","XmpState"),
        ("photoshop:Country","XmpCountry"),
        ("photoshop:AuthorsPosition","AuthorsPosition"),
        ("photoshop:Byline","XmpByline"), ("photoshop:BylineTitle","XmpBylineTitle"),
        ("photoshop:Caption","XmpCaption"),
        // IPTC core (Iptc4xmpCore)
        ("Iptc4xmpCore:Location","IptcLocation"), ("Iptc4xmpCore:CountryCode","IptcCountryCode"),
        ("Iptc4xmpCore:Scene","Scene"), ("Iptc4xmpCore:SubjectCode","SubjectCode"),
        // Rights
        ("xmpRights:WebStatement","WebStatement"), ("xmpRights:Marked","RightsMarked"),
    ];
    for (tag, label) in &fields {
        if let Some(s) = extract_xmp_tag_value(xmp, tag) {
            out.push(ImgMetaEntry::new("XMP", label, s));
        }
    }
}

// ── PNG ───────────────────────────────────────────────────────────────────────

fn parse_png(data: &[u8], out: &mut Vec<ImgMetaEntry>) {
    let mut pos = 8usize; // skip PNG signature
    while pos + 8 <= data.len() {
        let chunk_len = read_u32_be(data, pos).unwrap_or(0) as usize;
        let chunk_type = data.get(pos+4..pos+8).unwrap_or(&[]);
        let chunk_data = data.get(pos+8..pos+8+chunk_len.min(data.len().saturating_sub(pos+8))).unwrap_or(&[]);

        match chunk_type {
            b"IHDR" if chunk_data.len() >= 13 => {
                let w = read_u32_be(chunk_data, 0).unwrap_or(0);
                let h = read_u32_be(chunk_data, 4).unwrap_or(0);
                let depth = chunk_data[8];
                let color_type = chunk_data[9];
                let interlace = chunk_data[12];
                out.push(ImgMetaEntry::new("Image","Width", w.to_string()));
                out.push(ImgMetaEntry::new("Image","Height", h.to_string()));
                out.push(ImgMetaEntry::new("Image","BitDepth", depth.to_string()));
                out.push(ImgMetaEntry::new("Image","ColorType", match color_type {
                    0=>"Grayscale",2=>"Truecolor",3=>"Indexed",4=>"Grayscale+Alpha",6=>"Truecolor+Alpha",_=>"Unknown"
                }));
                out.push(ImgMetaEntry::new("Image","Interlace", if interlace == 0 { "None" } else { "Adam7" }));
            }
            b"tEXt" => {
                if let Some(sep) = chunk_data.iter().position(|&b| b == 0) {
                    let key = std::str::from_utf8(&chunk_data[..sep]).unwrap_or("?");
                    let val = std::str::from_utf8(&chunk_data[sep+1..]).unwrap_or("?");
                    out.push(ImgMetaEntry::new("Text", key, val.trim()));
                }
            }
            b"iTXt" => {
                if let Some(sep) = chunk_data.iter().position(|&b| b == 0) {
                    let key = std::str::from_utf8(&chunk_data[..sep]).unwrap_or("?");
                    // skip compression flag (1), compression method (1), language tag (null terminated), translated keyword (null terminated)
                    let rest = &chunk_data[sep+1..];
                    let skip_nulls = |s: &[u8], n: usize| -> usize {
                        let mut pos = 0; let mut found = 0;
                        while pos < s.len() { if s[pos] == 0 { found += 1; if found == n { return pos + 1; } } pos += 1; }
                        s.len()
                    };
                    let val_start = 2 + skip_nulls(&rest[2..], 2);
                    let val = rest.get(val_start..).and_then(|v| std::str::from_utf8(v).ok()).unwrap_or("").trim().to_string();
                    if !val.is_empty() { out.push(ImgMetaEntry::new("Text", key, val)); }
                }
            }
            b"tIME" if chunk_data.len() >= 7 => {
                let y = read_u16_be(chunk_data, 0).unwrap_or(0);
                out.push(ImgMetaEntry::new("PNG","LastModified",
                    format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02}", y, chunk_data[2], chunk_data[3], chunk_data[4], chunk_data[5], chunk_data[6])));
            }
            b"gAMA" if chunk_data.len() >= 4 => {
                let gamma = read_u32_be(chunk_data, 0).unwrap_or(0);
                out.push(ImgMetaEntry::new("PNG","Gamma", format!("{:.5}", gamma as f64 / 100000.0)));
            }
            b"sRGB" if !chunk_data.is_empty() => {
                out.push(ImgMetaEntry::new("Color","sRGB", match chunk_data[0] {
                    0=>"Perceptual",1=>"Relative colorimetric",2=>"Saturation",3=>"Absolute colorimetric",_=>"Other"
                }));
            }
            b"iCCP" => { out.push(ImgMetaEntry::new("Color","ICC Profile","present")); }
            b"pHYs" if chunk_data.len() >= 9 => {
                let xppu = read_u32_be(chunk_data, 0).unwrap_or(0);
                let yppu = read_u32_be(chunk_data, 4).unwrap_or(0);
                let unit = chunk_data[8];
                if unit == 1 {
                    out.push(ImgMetaEntry::new("PNG","XPixelDensity", format!("{} px/m ({:.0} DPI)", xppu, xppu as f64 * 0.0254)));
                    out.push(ImgMetaEntry::new("PNG","YPixelDensity", format!("{} px/m ({:.0} DPI)", yppu, yppu as f64 * 0.0254)));
                } else {
                    out.push(ImgMetaEntry::new("PNG","PixelAspect", format!("{}:{}", xppu, yppu)));
                }
            }
            b"bKGD" => { out.push(ImgMetaEntry::new("PNG","BackgroundColor","present")); }
            b"hIST" => { out.push(ImgMetaEntry::new("PNG","Histogram","present")); }
            b"sBIT" => { out.push(ImgMetaEntry::new("PNG","SignificantBits","present")); }
            b"eXIf" | b"eXif" => { parse_exif(chunk_data, out); } // PNG EXIF chunk
            b"IEND" => break,
            _ => {}
        }
        pos = pos + 12 + chunk_len;
    }
}

// ── BMP ───────────────────────────────────────────────────────────────────────

fn parse_bmp(data: &[u8], out: &mut Vec<ImgMetaEntry>) {
    if data.len() < 54 { return; }
    let file_size = read_u32_le(data, 2).unwrap_or(0);
    let data_off  = read_u32_le(data, 10).unwrap_or(0);
    let dib_size  = read_u32_le(data, 14).unwrap_or(0);
    out.push(ImgMetaEntry::new("BMP","FileSize", format!("{} bytes", file_size)));
    out.push(ImgMetaEntry::new("BMP","PixelArrayOffset", format!("{} bytes", data_off)));
    out.push(ImgMetaEntry::new("BMP","DIBHeaderSize", format!("{} bytes ({})",dib_size, match dib_size {
        12=>"BITMAPCOREHEADER",40=>"BITMAPINFOHEADER",52=>"BITMAPV2INFOHEADER",
        56=>"BITMAPV3INFOHEADER",108=>"BITMAPV4HEADER",124=>"BITMAPV5HEADER",_=>"Unknown"
    })));
    if dib_size >= 40 && data.len() >= 54 {
        let w    = read_i32_le(data, 18).unwrap_or(0).abs() as u32;
        let h    = read_i32_le(data, 22).unwrap_or(0).abs() as u32;
        let planes = read_u16_le(data, 26).unwrap_or(0);
        let bpp  = read_u16_le(data, 28).unwrap_or(0);
        let comp = read_u32_le(data, 30).unwrap_or(0);
        let img_size = read_u32_le(data, 34).unwrap_or(0);
        let xppm = read_i32_le(data, 38).unwrap_or(0);
        let yppm = read_i32_le(data, 42).unwrap_or(0);
        let colors_used = read_u32_le(data, 46).unwrap_or(0);
        out.push(ImgMetaEntry::new("Image","Width", w.to_string()));
        out.push(ImgMetaEntry::new("Image","Height", h.to_string()));
        out.push(ImgMetaEntry::new("Image","ColorPlanes", planes.to_string()));
        out.push(ImgMetaEntry::new("Image","BitsPerPixel", bpp.to_string()));
        out.push(ImgMetaEntry::new("Image","ColorMode", match bpp { 1=>"Monochrome",4=>"16-color",8=>"256-color",16=>"High color",24=>"True color",32=>"True color+Alpha",_=>"Other" }));
        out.push(ImgMetaEntry::new("BMP","Compression", match comp { 0=>"BI_RGB (none)",1=>"BI_RLE8",2=>"BI_RLE4",3=>"BI_BITFIELDS",4=>"BI_JPEG",5=>"BI_PNG",_=>"Other" }));
        out.push(ImgMetaEntry::new("BMP","ImageDataSize", format!("{} bytes", img_size)));
        if xppm > 0 { out.push(ImgMetaEntry::new("BMP","XPixelsPerMeter", format!("{} ({:.0} DPI)", xppm, xppm as f64 * 0.0254))); }
        if yppm > 0 { out.push(ImgMetaEntry::new("BMP","YPixelsPerMeter", format!("{} ({:.0} DPI)", yppm, yppm as f64 * 0.0254))); }
        if colors_used > 0 { out.push(ImgMetaEntry::new("BMP","ColorsUsed", colors_used.to_string())); }
    }
}

// ── GIF ───────────────────────────────────────────────────────────────────────

fn parse_gif(data: &[u8], out: &mut Vec<ImgMetaEntry>) {
    if data.len() < 13 { return; }
    let version = std::str::from_utf8(&data[3..6]).unwrap_or("?");
    let w = read_u16_le(data, 6).unwrap_or(0);
    let h = read_u16_le(data, 8).unwrap_or(0);
    let packed = data[10];
    let gct = (packed >> 7) & 1;
    let color_res = ((packed >> 4) & 0x7) + 1;
    let gct_size = packed & 0x7;
    let bg_index = data[11];
    let aspect = data[12];

    out.push(ImgMetaEntry::new("Image","GIFVersion", version));
    out.push(ImgMetaEntry::new("Image","Width", w.to_string()));
    out.push(ImgMetaEntry::new("Image","Height", h.to_string()));
    out.push(ImgMetaEntry::new("GIF","GlobalColorTable", if gct == 1 { "Yes" } else { "No" }));
    if gct == 1 { out.push(ImgMetaEntry::new("GIF","ColorTableSize", format!("{} colors", 2u32.pow(gct_size as u32 + 1)))); }
    out.push(ImgMetaEntry::new("GIF","ColorResolution", format!("{} bits/channel", color_res)));
    out.push(ImgMetaEntry::new("GIF","BackgroundColorIndex", bg_index.to_string()));
    if aspect != 0 { out.push(ImgMetaEntry::new("GIF","PixelAspectRatio", format!("{:.4}", (aspect as f64 + 15.0) / 64.0))); }

    // Scan for Netscape Application Extension (animated GIF loop count)
    let mut pos = 13usize + if gct == 1 { 3 * (2usize.pow(gct_size as u32 + 1)) } else { 0 };
    let mut frame_count = 0u32;
    while pos < data.len() {
        match data[pos] {
            0x2C => { frame_count += 1; pos += 1; if pos + 9 <= data.len() { pos += 9; } else { break; } }
            0x21 => {
                if pos + 1 >= data.len() { break; }
                let ext_type = data[pos+1];
                pos += 2;
                if ext_type == 0xFF && pos + 1 < data.len() { // App extension
                    let blen = data[pos] as usize; pos += 1;
                    if let Some(app) = data.get(pos..pos+blen.min(11)) {
                        if app.starts_with(b"NETSCAPE2.0") {
                            pos += blen;
                            if pos + 1 < data.len() { let sublen = data[pos] as usize; pos += 1;
                                if sublen >= 3 { let loops = read_u16_le(data, pos+1).unwrap_or(0);
                                    out.push(ImgMetaEntry::new("GIF","AnimationLoops", if loops == 0 { "Infinite".into() } else { loops.to_string() })); }
                                pos += sublen;
                            }
                        } else { pos += blen; }
                    } else { pos += blen; }
                }
                // skip sub-blocks
                while pos < data.len() { let bl = data[pos] as usize; pos += 1; if bl == 0 { break; } pos += bl; }
            }
            0x3B => break, // Trailer
            _ => { pos += 1; }
        }
    }
    if frame_count > 1 { out.push(ImgMetaEntry::new("GIF","Animated", "Yes")); out.push(ImgMetaEntry::new("GIF","FrameCount", frame_count.to_string())); }
    else { out.push(ImgMetaEntry::new("GIF","Animated", "No")); }
}

// ── WebP ─────────────────────────────────────────────────────────────────────

fn parse_webp(data: &[u8], out: &mut Vec<ImgMetaEntry>) {
    if data.len() < 12 { return; }
    let riff_size = read_u32_le(data, 4).unwrap_or(0);
    out.push(ImgMetaEntry::new("WebP","RIFFSize", format!("{} bytes", riff_size + 8)));
    let subtype = data.get(8..12).unwrap_or(&[]);
    let subtype_str = safe_ascii(subtype);
    out.push(ImgMetaEntry::new("WebP","Subtype", subtype_str.trim().to_string()));

    let mut pos = 12usize;
    while pos + 8 <= data.len() {
        let fcc = data.get(pos..pos+4).unwrap_or(&[]);
        let chunk_size = read_u32_le(data, pos+4).unwrap_or(0) as usize;
        let chunk_data = data.get(pos+8..pos+8+chunk_size.min(data.len().saturating_sub(pos+8))).unwrap_or(&[]);
        match fcc {
            b"VP8 " => {
                out.push(ImgMetaEntry::new("Image","Encoding","VP8 (Lossy)"));
                if chunk_data.len() >= 10 && chunk_data[0] == 0x9D && chunk_data[1] == 0x01 && chunk_data[2] == 0x2A {
                    let w = read_u16_le(chunk_data, 6).unwrap_or(0) & 0x3FFF;
                    let h = read_u16_le(chunk_data, 8).unwrap_or(0) & 0x3FFF;
                    out.push(ImgMetaEntry::new("Image","Width", w.to_string()));
                    out.push(ImgMetaEntry::new("Image","Height", h.to_string()));
                }
            }
            b"VP8L" => {
                out.push(ImgMetaEntry::new("Image","Encoding","VP8L (Lossless)"));
                if chunk_data.len() >= 5 && chunk_data[0] == 0x2F {
                    let bits = ((chunk_data[4] as u32) << 24) | ((chunk_data[3] as u32) << 16) | ((chunk_data[2] as u32) << 8) | chunk_data[1] as u32;
                    let w = (bits & 0x3FFF) + 1;
                    let h = ((bits >> 14) & 0x3FFF) + 1;
                    out.push(ImgMetaEntry::new("Image","Width", w.to_string()));
                    out.push(ImgMetaEntry::new("Image","Height", h.to_string()));
                }
            }
            b"VP8X" => {
                out.push(ImgMetaEntry::new("Image","Encoding","VP8X (Extended)"));
                if chunk_data.len() >= 10 {
                    let flags = chunk_data[0];
                    let w = (read_u32_le(chunk_data, 4).unwrap_or(0) & 0xFFFFFF) + 1;
                    let h = (read_u32_le(chunk_data, 7).unwrap_or(0) & 0xFFFFFF) + 1;
                    out.push(ImgMetaEntry::new("Image","Width", w.to_string()));
                    out.push(ImgMetaEntry::new("Image","Height", h.to_string()));
                    if flags & 0x02 != 0 { out.push(ImgMetaEntry::new("WebP","ICC Profile","present")); }
                    if flags & 0x04 != 0 { out.push(ImgMetaEntry::new("WebP","Animation","Yes")); }
                    if flags & 0x08 != 0 { out.push(ImgMetaEntry::new("WebP","EXIF","present")); }
                    if flags & 0x10 != 0 { out.push(ImgMetaEntry::new("WebP","Alpha","Yes")); }
                    if flags & 0x20 != 0 { out.push(ImgMetaEntry::new("WebP","XMP","present")); }
                }
            }
            b"EXIF" => { parse_exif(chunk_data, out); }
            b"XMP " => { if let Ok(s) = std::str::from_utf8(chunk_data) { extract_xmp_simple(s, out); } }
            b"ICCP" => { out.push(ImgMetaEntry::new("Color","ICC Profile","present")); }
            _ => {}
        }
        let aligned = chunk_size + (chunk_size & 1);
        pos = pos + 8 + aligned;
    }
}

// ── TIFF standalone ───────────────────────────────────────────────────────────

fn parse_tiff_file(data: &[u8], out: &mut Vec<ImgMetaEntry>) {
    parse_exif(data, out); // TIFF and EXIF share the same TIFF structure
}

fn find_meta_value(entries: &[ImgMetaEntry], section: &str, key: &str) -> Option<String> {
    entries
        .iter()
        .find(|e| e.section == section && e.key == key)
        .map(|e| e.value.clone())
}

fn parse_gps_dms(dms: &str) -> Option<f64> {
    // Expected format: 52°12'34.5678"
    let deg_pos = dms.find('°')?;
    let min_pos = dms.find('\'')?;
    let sec_pos = dms.rfind('"')?;
    if !(deg_pos < min_pos && min_pos < sec_pos) { return None; }

    let deg = dms[..deg_pos].trim().parse::<f64>().ok()?;
    let min = dms[deg_pos + 1..min_pos].trim().parse::<f64>().ok()?;
    let sec = dms[min_pos + 1..sec_pos].trim().parse::<f64>().ok()?;

    Some(deg + (min / 60.0) + (sec / 3600.0))
}

fn add_derived_gps(entries: &mut Vec<ImgMetaEntry>) {
    let lat_ref = find_meta_value(entries, "GPS", "LatitudeRef").unwrap_or_default();
    let lon_ref = find_meta_value(entries, "GPS", "LongitudeRef").unwrap_or_default();
    let lat_dms = match find_meta_value(entries, "GPS", "Latitude") {
        Some(v) => v,
        None => return,
    };
    let lon_dms = match find_meta_value(entries, "GPS", "Longitude") {
        Some(v) => v,
        None => return,
    };

    if let Some(mut lat) = parse_gps_dms(&lat_dms) {
        if lat_ref.eq_ignore_ascii_case("S") { lat = -lat; }
        entries.push(ImgMetaEntry::new("GPS", "LatitudeDecimal", format!("{:.8}", lat)));
    }
    if let Some(mut lon) = parse_gps_dms(&lon_dms) {
        if lon_ref.eq_ignore_ascii_case("W") { lon = -lon; }
        entries.push(ImgMetaEntry::new("GPS", "LongitudeDecimal", format!("{:.8}", lon)));
    }
}

// ── Format detection ──────────────────────────────────────────────────────────

fn detect_image_format(data: &[u8]) -> &'static str {
    if data.starts_with(b"\xFF\xD8\xFF")                           { return "JPEG"; }
    if data.starts_with(b"\x89PNG\r\n\x1A\n")                     { return "PNG"; }
    if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") { return "GIF"; }
    if data.starts_with(b"BM")                                    { return "BMP"; }
    if data.starts_with(b"RIFF") && data.get(8..12) == Some(b"WEBP") { return "WebP"; }
    if data.starts_with(b"II\x2A\x00") || data.starts_with(b"MM\x00\x2A") { return "TIFF"; }
    if data.starts_with(b"\x00\x00\x01\x00")                      { return "ICO"; }
    if data.starts_with(b"\x00\x00\x02\x00")                      { return "CUR"; }
    if data.starts_with(b"8BPS")                                   { return "PSD"; }
    if data.starts_with(b"\x00\x00\x00") && data.get(4..8) == Some(b"ftyp") { return "HEIC/MP4"; }
    "Unknown"
}

fn detect_container_end_exclusive(data: &[u8], format: &str) -> Option<usize> {
    match format {
        "JPEG" => {
            if data.len() < 4 { return None; }
            let mut last_eoi: Option<usize> = None;
            for i in 0..(data.len() - 1) {
                if data[i] == 0xFF && data[i + 1] == 0xD9 {
                    last_eoi = Some(i + 2);
                }
            }
            last_eoi
        }
        "PNG" => {
            if data.len() < 8 || !data.starts_with(b"\x89PNG\r\n\x1A\n") { return None; }
            let mut pos = 8usize;
            while pos + 8 <= data.len() {
                let chunk_len = read_u32_be(data, pos).unwrap_or(0) as usize;
                let chunk_type = data.get(pos + 4..pos + 8).unwrap_or(&[]);
                let total = 12usize.saturating_add(chunk_len);
                if pos + total > data.len() { return None; }
                if chunk_type == b"IEND" {
                    return Some(pos + total);
                }
                pos += total;
            }
            None
        }
        "BMP" => {
            let declared = read_u32_le(data, 2).unwrap_or(0) as usize;
            if declared >= 14 && declared <= data.len() {
                Some(declared)
            } else {
                None
            }
        }
        "WebP" => {
            if data.len() < 12 || !data.starts_with(b"RIFF") || data.get(8..12) != Some(b"WEBP") {
                return None;
            }
            let riff_size = read_u32_le(data, 4).unwrap_or(0) as usize;
            let end = 8usize.saturating_add(riff_size);
            if end <= data.len() { Some(end) } else { None }
        }
        _ => None,
    }
}

fn add_container_boundary_meta(data: &[u8], format: &str, out: &mut Vec<ImgMetaEntry>) {
    if data.is_empty() { return; }

    out.push(ImgMetaEntry::new("File", "ContainerStartOffset", "0"));
    out.push(ImgMetaEntry::new("File", "FileEndOffset", (data.len() - 1).to_string()));

    let Some(end_exclusive) = detect_container_end_exclusive(data, format) else {
        return;
    };
    if end_exclusive == 0 { return; }

    out.push(ImgMetaEntry::new("File", "ContainerEndOffset", (end_exclusive - 1).to_string()));

    if end_exclusive < data.len() {
        let trailing = data.len() - end_exclusive;
        out.push(ImgMetaEntry::new("File", "HasTrailingData", "Yes"));
        out.push(ImgMetaEntry::new("File", "TrailingDataBytes", trailing.to_string()));
        let preview: String = data[end_exclusive..]
            .iter()
            .take(16)
            .map(|b| format!("{:02X} ", b))
            .collect();
        if !preview.is_empty() {
            out.push(ImgMetaEntry::new("File", "TrailingDataHexPreview", preview.trim()));
        }
    } else {
        out.push(ImgMetaEntry::new("File", "HasTrailingData", "No"));
    }
}

// ── Main command ──────────────────────────────────────────────────────────────

#[tauri::command]
fn read_image_meta(
    header_bytes: Vec<u8>,
    filename: String,
    mime_type: Option<String>,
    file_size: Option<u64>,
    last_modified_unix_ms: Option<u64>,
) -> Vec<ImgMetaEntry> {
    let mut out: Vec<ImgMetaEntry> = Vec::new();
    let data = &header_bytes;

    out.push(ImgMetaEntry::new("File","Filename", &filename));
    if let Some(mt) = mime_type {
        if !mt.trim().is_empty() {
            out.push(ImgMetaEntry::new("File", "MimeType", mt.trim().to_string()));
        }
    }
    if let Some(fs) = file_size {
        out.push(ImgMetaEntry::new("File", "FileSize", format!("{} bytes", fs)));
    }
    if let Some(ts_ms) = last_modified_unix_ms {
        let secs = ts_ms / 1000;
        let rem_ms = ts_ms % 1000;
        out.push(ImgMetaEntry::new("File", "LastModifiedUnix", format!("{}.{}", secs, rem_ms)));
    }
    out.push(ImgMetaEntry::new("File","DataReceived", format!("{} bytes", data.len())));

    let ext = filename.rsplit('.').next().unwrap_or("").to_uppercase();
    out.push(ImgMetaEntry::new("File","Extension", &ext));

    let format = detect_image_format(data);
    out.push(ImgMetaEntry::new("File","Format", format));
    add_container_boundary_meta(data, format, &mut out);

    // Hex dump of first 16 bytes
    let hex: String = data.iter().take(16).map(|b| format!("{:02X} ", b)).collect();
    out.push(ImgMetaEntry::new("File","MagicBytes", hex.trim()));

    match format {
        "JPEG" => {
            parse_jpeg(data, &mut out);
        }
        "PNG"  => parse_png(data, &mut out),
        "BMP"  => parse_bmp(data, &mut out),
        "GIF"  => parse_gif(data, &mut out),
        "WebP" => parse_webp(data, &mut out),
        "TIFF" => parse_tiff_file(data, &mut out),
        "PSD"  => {
            if data.len() >= 26 {
                let version = read_u16_be(data, 4).unwrap_or(0);
                let channels = read_u16_be(data, 12).unwrap_or(0);
                let h = read_u32_be(data, 14).unwrap_or(0);
                let w = read_u32_be(data, 18).unwrap_or(0);
                let depth = read_u16_be(data, 22).unwrap_or(0);
                let color_mode = read_u16_be(data, 24).unwrap_or(0);
                out.push(ImgMetaEntry::new("PSD","Version", if version == 1 { "PSD" } else { "PSB" }));
                out.push(ImgMetaEntry::new("Image","Width", w.to_string()));
                out.push(ImgMetaEntry::new("Image","Height", h.to_string()));
                out.push(ImgMetaEntry::new("PSD","Channels", channels.to_string()));
                out.push(ImgMetaEntry::new("PSD","BitDepth", depth.to_string()));
                out.push(ImgMetaEntry::new("PSD","ColorMode", match color_mode {
                    0=>"Bitmap",1=>"Grayscale",2=>"Indexed",3=>"RGB",4=>"CMYK",
                    7=>"Multichannel",8=>"Duotone",9=>"Lab",_=>"Other"
                }));
            }
        }
        _ => {}
    }

    // Derive decimal GPS coordinates from EXIF DMS fields when possible.
    add_derived_gps(&mut out);

    out
}

// ─── Phone Lookup Commands ────────────────────────────────────────────────────

#[tauri::command]
async fn phone_lookup_query(
    phone_number: String,
    numverify_key: String,
    opencell_id_key: String,
    google_key: String,
) -> Result<serde_json::Value, String> {
    // Normalize phone number
    let normalized = phone_number.replace(" ", "").replace("-", "").replace("(", "").replace(")", "");
    
    // Initialize result object
    let mut result = serde_json::json!({
        "numverify": null,
        "opencellid": [],
        "people_api": null,
        "error": null
    });

    // 1. Call NumVerify API
    if !numverify_key.is_empty() {
        if let Ok(nv_result) = phone_lookup_numverify(&normalized, &numverify_key).await {
            result["numverify"] = nv_result;
        }
    }

    // 2. Call OpenCellID API
    if !opencell_id_key.is_empty() {
        if let Ok(occ_result) = phone_lookup_opencellid(&normalized, &opencell_id_key).await {
            result["opencellid"] = occ_result;
        }
    }

    // 3. Call Google People API (optional, requires API key)
    if !google_key.is_empty() {
        if let Ok(people_result) = phone_lookup_google_people(&normalized, &google_key).await {
            result["people_api"] = people_result;
        }
    }

    Ok(result)
}

async fn phone_lookup_numverify(phone_number: &str, api_key: &str) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    
    if api_key.is_empty() {
        return Ok(serde_json::json!({
            "valid": false,
            "country_name": "N/A",
            "country_code": "N/A",
            "number_type": "Unknown",
            "carrier": "N/A",
            "international_format": phone_number,
            "national_format": phone_number,
            "location": "Requires API key"
        }));
    }

    let https_url = format!(
        "https://api.numverify.com/validate?number={}&access_key={}",
        phone_number, api_key
    );
    let http_url = format!(
        "http://api.numverify.com/validate?number={}&access_key={}",
        phone_number, api_key
    );

    let response = match client.get(&https_url).send().await {
        Ok(resp) => Ok(resp),
        Err(_) => client.get(&http_url).send().await,
    };

    match response {
        Ok(resp) => {
            match resp.json::<serde_json::Value>().await {
                Ok(json) => {
                    Ok(serde_json::json!({
                        "valid": json.get("valid").and_then(|v| v.as_bool()).unwrap_or(false),
                        "country_name": json.get("country_name").and_then(|v| v.as_str()).unwrap_or("N/A"),
                        "country_code": json.get("country_code").and_then(|v| v.as_str()).unwrap_or("N/A"),
                        "number_type": json.get("number_type").and_then(|v| v.as_str()).unwrap_or("Unknown"),
                        "carrier": json.get("carrier").and_then(|v| v.as_str()).unwrap_or("N/A"),
                        "international_format": json.get("international_format").and_then(|v| v.as_str()).unwrap_or(phone_number),
                        "national_format": json.get("national_format").and_then(|v| v.as_str()).unwrap_or(phone_number),
                        "location": json.get("location").and_then(|v| v.as_str()).unwrap_or("N/A"),
                    }))
                }
                Err(_) => Err("Failed to parse NumVerify response".to_string())
            }
        }
        Err(_) => Err("NumVerify API unavailable".to_string())
    }
}

async fn phone_lookup_opencellid(_phone_number: &str, _api_key: &str) -> Result<serde_json::Value, String> {
    // Note: OpenCellID requires cell tower info, not just phone number
    // This is a placeholder for actual implementation
    Ok(serde_json::json!([]))
}

async fn phone_lookup_google_people(_phone_number: &str, api_key: &str) -> Result<serde_json::Value, String> {
    // Google People API requires OAuth and API key
    // Returns null in sandbox mode
    
    if api_key.is_empty() {
        return Ok(serde_json::Value::Null);
    }

    // Placeholder: Google People API would require proper OAuth setup
    Ok(serde_json::Value::Null)
}

// ─── Main ────────────────────────────────────────────────────────────────────────────

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
        .manage(Arc::new(ScanWatchState { events: Mutex::new(Vec::new()) }))
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if matches!(event, WindowEvent::Destroyed) {
                    close_tool_windows(&window.app_handle());
                }
            }
            if window.label() == "clippy" {
                if matches!(event, WindowEvent::Destroyed) {
                    let _ = window.app_handle().emit("clippy-window-closed", ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            scan_port,
            scan_range,
            stop_scan,
            geo_lookup,
            hostname_lookup,
            resolve_domain_ipv4,
            get_local_ip,
            get_local_subnets,
            run_traceroute,
            open_tool_window,
            check_scan_watch,
            list_wifi_networks,
            get_wifi_network_details,
            ai_multi_provider_query,
            ai_store_api_key_secure,
            ai_load_api_key_secure,
            ai_delete_api_key_secure,
            scan_bluetooth_devices,
            get_connections,
            list_serial_ports,
            read_gnss_snapshot,
            read_lte_snapshot,
            read_lte_snapshot_auto,
            read_image_meta,
            phone_lookup_query,
            open_clippy_window,
            close_clippy_window,
            clippy_window_ready,
            open_browser,
            window_minimize,
            window_toggle_maximize,
            window_toggle_fullscreen,
            window_start_dragging,
            window_close,
            save_scan_results_dialog,
            open_scan_results_dialog,
            open_extension_manifest_dialog,
            open_language_file_dialog,
            session_install_dir,
            save_session_dialog,
            open_session_dialog,
            write_session_file,
            read_session_file,
            run_powershell,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
