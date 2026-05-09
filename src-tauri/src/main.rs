// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{IpAddr, SocketAddr};
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
    "tool-ai-assistant",
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
        "ai-assistant" => ("tool-ai-assistant", "NetRecon - AI Security Assistant", 880.0, 760.0),
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
