// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{IpAddr, SocketAddr};
use std::io::Read;
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
use tauri::{AppHandle, Emitter, LogicalPosition, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tokio::net::lookup_host;
use tokio::net::TcpStream;
use tokio::time::timeout;

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
    "tool-ai-assistant",
    "tool-bt-detector",
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

#[derive(Serialize, Deserialize, Clone)]
pub struct GeoResult {
    pub status: String,
    pub country: Option<String>,
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

#[derive(Serialize, Clone)]
struct TraceRunResult {
    output: String,
    resolved_ip: String,
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
    while let Some(res) = set.join_next().await {
        if matches!(res, Ok(true)) { found += 1; }
    }
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
    let url = format!(
        "http://ip-api.com/json/{}?fields=status,country,city,isp,org,proxy,hosting,as,lat,lon",
        ip
    );
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .ok()?;
    let geo: GeoResult = client.get(&url).send().await.ok()?.json().await.ok()?;
    if geo.status == "success" { Some(geo) } else { None }
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
    const CLIPPY_WIDTH: f64 = 280.0;
    const CLIPPY_HEIGHT: f64 = 185.0;
    const CLIPPY_MARGIN: i32 = 20;

    let mut pos_x = 40.0;
    let mut pos_y = 40.0;
    if let Some(main) = app.get_webview_window("main") {
        if let (Ok(main_pos), Ok(main_size)) = (main.outer_position(), main.outer_size()) {
            let target_x = main_pos.x + main_size.width as i32 - CLIPPY_WIDTH as i32 - CLIPPY_MARGIN;
            let target_y = main_pos.y + main_size.height as i32 - CLIPPY_HEIGHT as i32 - CLIPPY_MARGIN;
            pos_x = target_x.max(0) as f64;
            pos_y = target_y.max(0) as f64;
        }
    }

    if let Some(win) = app.get_webview_window("clippy") {
        let _ = win.show();
        let _ = win.set_position(LogicalPosition::new(pos_x, pos_y));
        let _ = win.set_focus();
        let _ = app.emit("clippy-window-opened", ());
        return Ok(());
    }

    let url = WebviewUrl::App(format!("clippy.html#lang={}", lang).into());
    let win = WebviewWindowBuilder::new(&app, "clippy", url)
        .title("NetRecon Clippy")
        .inner_size(CLIPPY_WIDTH, CLIPPY_HEIGHT)
        .position(pos_x, pos_y)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .build()
        .map_err(|e| e.to_string())?;
    let _ = win.set_position(LogicalPosition::new(pos_x, pos_y));
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

// ─── Main ────────────────────────────────────────────────────────────────────

fn main() {
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
            get_local_ip,
            get_local_subnets,
            run_traceroute,
            open_tool_window,
            check_scan_watch,
            list_wifi_networks,
            get_wifi_network_details,
            ai_multi_provider_query,
            scan_bluetooth_devices,
            get_connections,
            list_serial_ports,
            read_gnss_snapshot,
            read_lte_snapshot,
            read_lte_snapshot_auto,
            open_clippy_window,
            close_clippy_window,
            open_browser,
            window_minimize,
            window_toggle_maximize,
            window_start_dragging,
            window_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
