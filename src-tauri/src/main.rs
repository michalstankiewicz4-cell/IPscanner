// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{IpAddr, SocketAddr};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::str::FromStr;
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, Instant, SystemTime};

use serde::{Deserialize, Serialize};
use rusqlite::{Connection, params};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tokio::net::TcpStream;
use tokio::time::timeout;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

// ─── Shared scan-stop flag ───────────────────────────────────────────────────
struct ScanState {
    stop: AtomicBool,
}

// ─── DTOs ────────────────────────────────────────────────────────────────────
#[derive(Serialize, Clone)]
struct PortLatency {
    port: u16,
    ms: Option<u64>,
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

/// Probe a single IP across all given ports; returns open ports + best latency.
async fn probe_host(
    ip: String,
    mut ports: Vec<u16>,
    timeout_ms: u64,
    retries: u32,
    scan_delay_ms: u64,
    max_concurrent_ports: usize,
    randomize_ports: bool,
) -> (Vec<PortLatency>, Option<u64>) {
    if randomize_ports {
        shuffle_vec(&mut ports);
    }
    let port_sem = Arc::new(tokio::sync::Semaphore::new(max_concurrent_ports.max(1)));
    let mut set: tokio::task::JoinSet<(u16, bool, Option<u64>)> = tokio::task::JoinSet::new();
    for port in ports {
        let ip_c = ip.clone();
        let permit = port_sem.clone().acquire_owned().await.unwrap();
        set.spawn(async move {
            let _permit = permit;
            let addr_str = format!("{}:{}", ip_c, port);
            let addr: SocketAddr = match addr_str.parse() {
                Ok(a) => a,
                Err(_) => return (port, false, None::<u64>),
            };
            if scan_delay_ms > 0 {
                tokio::time::sleep(Duration::from_millis(scan_delay_ms)).await;
            }
            let t0 = Instant::now();
            let attempts = retries.saturating_add(1);
            for attempt in 0..attempts {
                match timeout(Duration::from_millis(timeout_ms), TcpStream::connect(addr)).await {
                    Ok(Ok(_)) => return (port, true, Some(t0.elapsed().as_millis() as u64)),
                    _ => {
                        if attempt + 1 == attempts {
                            return (port, false, None);
                        }
                    }
                }
            }
            (port, false, None)
        });
    }
    let mut open_ports: Vec<PortLatency> = Vec::new();
    let mut best_ms: Option<u64> = None;
    while let Some(res) = set.join_next().await {
        if let Ok((port, true, ms)) = res {
            open_ports.push(PortLatency { port, ms });
            if let Some(m) = ms {
                best_ms = Some(best_ms.map_or(m, |prev: u64| prev.min(m)));
            }
        }
    }
    open_ports.sort_unstable_by_key(|p| p.port);
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
    retries: u32,
    scan_delay_ms: u64,
    max_concurrent_ports: usize,
    randomize_ports: bool,
    randomize_hosts: bool,
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
            let (open_ports, ping_ms) = probe_host(
                ip.clone(),
                ports_c,
                timeout_ms,
                retries,
                scan_delay_ms,
                max_concurrent_ports,
                randomize_ports,
            ).await;
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
    ping: String,
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
        let migrations: [(&str, &str); 3] = [
            ("protocol", "ALTER TABLE scan_result_ports ADD COLUMN protocol TEXT NOT NULL DEFAULT 'TCP'"),
            ("service", "ALTER TABLE scan_result_ports ADD COLUMN service TEXT NOT NULL DEFAULT ''"),
            ("ping", "ALTER TABLE scan_result_ports ADD COLUMN ping TEXT NOT NULL DEFAULT '-'"),
        ];
        for (column, ddl) in migrations {
            if !existing.iter().any(|c| c == column) {
                conn.execute_batch(ddl)
                    .map_err(|e| format!("Failed to migrate scan_result_ports.{column}: {e}"))?;
            }
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
            .prepare_cached("INSERT INTO scan_results (ip, ping, hostname, flag, isp, as_info, device_identification, status, status_class) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)")
            .map_err(|e| format!("Failed to prepare scan_results insert: {e}"))?;
        let mut insert_port = tx
            .prepare_cached("INSERT INTO scan_result_ports (result_id, port, protocol, service, ping) VALUES (?1, ?2, ?3, ?4, ?5)")
            .map_err(|e| format!("Failed to prepare scan_result_ports insert: {e}"))?;

        for row in &data.scan_results {
            insert_result
                .execute(params![row.ip, row.ping, row.hostname, row.flag, row.isp, row.as_info, row.device_identification, row.status, row.status_class])
                .map_err(|e| format!("Failed to insert scan_results row: {e}"))?;
            let result_id = tx.last_insert_rowid();
            for port in &row.ports {
                insert_port
                    .execute(params![result_id, port.port, port.protocol, port.service, port.ping])
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
        // Older session files may be missing protocol/service/ping (added
        // incrementally over time) - reading must not mutate the file (only
        // a save/write runs the ALTER TABLE migration), so fall back to
        // defaults for whichever columns aren't there yet, newest-shape
        // first.
        type PortRow = (i64, i64, String, String, String);
        let full: Result<Vec<PortRow>, rusqlite::Error> = (|| {
            let mut stmt = conn.prepare("SELECT result_id, port, protocol, service, ping FROM scan_result_ports ORDER BY id")?;
            let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)))?
                .collect();
            rows
        })();
        let port_rows: Vec<PortRow> = match full {
            Ok(rows) => rows,
            Err(_) => {
                let mid: Result<Vec<PortRow>, rusqlite::Error> = (|| {
                    let mut stmt = conn.prepare("SELECT result_id, port, protocol, service FROM scan_result_ports ORDER BY id")?;
                    let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, "-".to_string())))?
                        .collect();
                    rows
                })();
                match mid {
                    Ok(rows) => rows,
                    Err(_) => {
                        let mut stmt = conn.prepare("SELECT result_id, port FROM scan_result_ports ORDER BY id")
                            .map_err(|e| format!("Failed to prepare scan_result_ports read (legacy): {e}"))?;
                        let rows = stmt.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, "TCP".to_string(), String::new(), "-".to_string())))
                            .map_err(|e| format!("Failed to query scan_result_ports (legacy): {e}"))?
                            .collect::<Result<Vec<_>, _>>()
                            .map_err(|e| format!("Failed to read scan_result_ports row (legacy): {e}"))?;
                        rows
                    }
                }
            }
        };
        for (result_id, port, protocol, service, ping) in port_rows {
            if let Some(&idx) = scan_result_index.get(&result_id) {
                scan_results[idx].ports.push(ScanPortEntry { port, protocol, service, ping });
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
        .setup(|app| {
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
            open_browser,
            window_minimize,
            window_toggle_maximize,
            window_toggle_fullscreen,
            window_get_state,
            window_start_dragging,
            window_close,
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
