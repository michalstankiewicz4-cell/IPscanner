// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{IpAddr, SocketAddr};
use std::str::FromStr;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::net::TcpStream;
use tokio::time::timeout;

// ─── Shared scan-stop flag ───────────────────────────────────────────────────
struct ScanState {
    stop: AtomicBool,
}

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
async fn open_tool_window(app: AppHandle, tool: String) -> Result<(), String> {
    let tool = tool.trim().to_lowercase();
    let (label, title, width, height) = match tool.as_str() {
        "console" => ("tool-console", "NetRecon - Command Console", 760.0, 440.0),
        "macro" => ("tool-macro", "NetRecon - Macro Folder", 620.0, 420.0),
        "speed" => ("tool-speed", "NetRecon - Speed Test", 560.0, 340.0),
        "proto" => ("tool-proto", "NetRecon - Prototype", 980.0, 680.0),
        "globe" => ("tool-globe", "NetRecon - World Map", 1060.0, 740.0),
        "topology" => ("tool-topology", "NetRecon - Topology", 1060.0, 740.0),
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
        .resizable(true);

    let win = builder.build().map_err(|e| e.to_string())?;
    let _ = win.set_focus();
    Ok(())
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

const NATIVE_MENU_IDS: &[&str] = &[
    "scan_start",
    "scan_stop",
    "scan_clear",
    "app_exit",
    "open_countries",
    "open_presets",
    "open_defaults",
    "open_lang",
    "open_customize",
    "open_globe",
    "open_console",
    "open_macro",
    "open_speed",
    "open_proto",
    "open_topology",
    "help_versions",
    "help_about",
];

fn build_native_menu<R: tauri::Runtime, M: Manager<R>>(manager: &M) -> tauri::Result<Menu<R>> {
    let scan_menu = SubmenuBuilder::new(manager, "Scan")
        .text("scan_start", "Start")
        .text("scan_stop", "Stop")
        .text("scan_clear", "Clear")
        .separator()
        .text("app_exit", "Exit")
        .build()?;

    let options_menu = SubmenuBuilder::new(manager, "Options")
        .text("open_countries", "Country IP Library...")
        .text("open_presets", "Port Presets...")
        .text("open_defaults", "Default Scan Values...")
        .separator()
        .text("open_lang", "Language...")
        .separator()
        .text("open_customize", "Customization...")
        .build()?;

    let tools_menu = SubmenuBuilder::new(manager, "Tools")
        .text("open_globe", "World Map")
        .text("open_console", "Command Console")
        .text("open_macro", "Macro Folder")
        .text("open_speed", "Speed Test")
        .text("open_proto", "Prototype")
        .text("open_topology", "Topology")
        .build()?;

    let help_menu = SubmenuBuilder::new(manager, "Help")
        .text("help_versions", "Versions")
        .text("help_about", "About")
        .build()?;

    MenuBuilder::new(manager)
        .item(&scan_menu)
        .item(&options_menu)
        .item(&tools_menu)
        .item(&help_menu)
        .build()
}

// ─── Main ────────────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .manage(Arc::new(ScanState { stop: AtomicBool::new(false) }))
        .setup(|app| {
            let menu = build_native_menu(app)?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if NATIVE_MENU_IDS.contains(&id) {
                let _ = app.emit("native-menu", id.to_string());
            }
        })
        .invoke_handler(tauri::generate_handler![
            scan_port,
            scan_range,
            stop_scan,
            geo_lookup,
            get_local_ip,
            get_local_subnets,
            open_tool_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
