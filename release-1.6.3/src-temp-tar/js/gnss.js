const _gnssInvoke = window.__TAURI__?.core?.invoke ?? null;

let _gnssLiveTimer = null;
let _gnssLastSnapshot = null;
let _gnssLastWifi = [];
let _gnssAuditPoints = [];

function gnssT(key, ...args) {
  if (typeof t === 'function') return t(key, ...args);
  return key;
}

function gnssSetStatus(msg, warn = false) {
  const el = document.getElementById('gnssStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = warn ? '#8b0000' : '#000080';
}

function gnssEsc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function gnssRefreshPorts() {
  const sel = document.getElementById('gnssPortSelect');
  if (!sel) return;
  sel.innerHTML = '';

  const browserOpt = document.createElement('option');
  browserOpt.value = '__browser__';
  browserOpt.textContent = gnssT('gnssBrowserGeo');
  sel.appendChild(browserOpt);

  if (!_gnssInvoke) {
    gnssSetStatus(gnssT('gnssDesktopOnly'), true);
    return;
  }

  try {
    const ports = await _gnssInvoke('list_serial_ports');
    (ports || []).forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      sel.appendChild(opt);
    });
    gnssSetStatus(gnssT('gnssPortsLoaded', ports?.length || 0));
  } catch (e) {
    gnssSetStatus(gnssT('gnssErrPorts', e), true);
  }
}

function gnssFormatNum(v, d = 5) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  return Number(v).toFixed(d);
}

function gnssRenderMetrics(s) {
  const box = document.getElementById('gnssMetrics');
  if (!box) return;
  if (!s) {
    box.innerHTML = '<div class="gnss-metric-row">No GNSS data.</div>';
    return;
  }

  box.innerHTML = [
    [gnssT('gnssFix'), s.fix_type || '—'],
    ['Lat', gnssFormatNum(s.latitude, 6)],
    ['Lon', gnssFormatNum(s.longitude, 6)],
    ['Alt (m)', gnssFormatNum(s.altitude_m, 1)],
    ['Speed (km/h)', gnssFormatNum(s.speed_kmh, 1)],
    ['HDOP', gnssFormatNum(s.hdop, 2)],
    [gnssT('gnssSatsUsed'), s.sats_used ?? '—'],
    [gnssT('gnssSatsInView'), s.sats_in_view ?? '—'],
    [gnssT('gnssSource'), s.source || '—'],
    [gnssT('gnssTimeUtc'), s.timestamp_utc || '—'],
  ].map(([k, v]) => `<div class="gnss-metric-row"><span>${gnssEsc(k)}</span><b>${gnssEsc(v)}</b></div>`).join('');
}

function gnssRenderSatTable(sats) {
  const tbody = document.getElementById('gnssSatTbody');
  if (!tbody) return;
  if (!sats || sats.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="gnss-empty">No satellites.</td></tr>';
    return;
  }

  tbody.innerHTML = sats.map((s) => `
    <tr>
      <td>${gnssEsc(s.prn || '—')}</td>
      <td>${gnssEsc(s.constellation || '—')}</td>
      <td>${gnssEsc(s.azimuth ?? '—')}</td>
      <td>${gnssEsc(s.elevation ?? '—')}</td>
      <td>${gnssEsc(s.snr ?? '—')}</td>
    </tr>`).join('');
}

function gnssRenderSkyplot(sats) {
  const cvs = document.getElementById('gnssSkyplot');
  if (!cvs) return;
  const ctx = cvs.getContext('2d');
  if (!ctx) return;

  const w = cvs.width;
  const h = cvs.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.42;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#b0b0b0';
  [0.33, 0.66, 1].forEach((k) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r * k, 0, Math.PI * 2);
    ctx.stroke();
  });

  ctx.strokeStyle = '#a0a0a0';
  ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();

  ctx.fillStyle = '#444';
  ctx.font = '10px Segoe UI, Tahoma, sans-serif';
  ctx.fillText('N', cx - 4, cy - r - 6);
  ctx.fillText('S', cx - 4, cy + r + 12);
  ctx.fillText('W', cx - r - 12, cy + 3);
  ctx.fillText('E', cx + r + 6, cy + 3);

  (sats || []).forEach((s) => {
    const az = Number(s.azimuth);
    const el = Number(s.elevation);
    if (Number.isNaN(az) || Number.isNaN(el)) return;
    const rr = r * (1 - Math.min(Math.max(el, 0), 90) / 90);
    const rad = (az - 90) * Math.PI / 180;
    const x = cx + Math.cos(rad) * rr;
    const y = cy + Math.sin(rad) * rr;

    const snr = Number(s.snr || 0);
    const color = snr > 35 ? '#007a00' : snr > 20 ? '#b56a00' : '#9a0000';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#222';
    ctx.font = '9px Segoe UI, Tahoma, sans-serif';
    ctx.fillText(String(s.prn || ''), x + 6, y - 6);
  });
}

async function gnssReadFromBrowser() {
  return await new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation API unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          source: 'Browser Geolocation',
          timestamp_utc: new Date(pos.timestamp).toISOString(),
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          altitude_m: pos.coords.altitude,
          speed_kmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : null,
          fix_type: 'Geolocation',
          hdop: null,
          sats_used: null,
          sats_in_view: null,
          satellites: [],
        });
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 2000 }
    );
  });
}

async function gnssReadNow() {
  const port = document.getElementById('gnssPortSelect')?.value || '__browser__';
  const baud = parseInt(document.getElementById('gnssBaudSelect')?.value || '9600', 10);

  gnssSetStatus(gnssT('gnssReading'));
  try {
    let snap;
    if (port === '__browser__') {
      snap = await gnssReadFromBrowser();
    } else {
      if (!_gnssInvoke) throw new Error('Tauri backend required for serial GNSS');
      snap = await _gnssInvoke('read_gnss_snapshot', { portName: port, baudRate: baud, sampleSecs: 3 });
    }

    _gnssLastSnapshot = snap;
    gnssRenderMetrics(snap);
    gnssRenderSatTable(snap.satellites || []);
    gnssRenderSkyplot(snap.satellites || []);
    gnssSetStatus(gnssT('gnssReadOk'));
  } catch (e) {
    gnssSetStatus(gnssT('gnssErrRead', e), true);
  }
}

function gnssStartLive() {
  if (_gnssLiveTimer) return;
  gnssReadNow();
  _gnssLiveTimer = setInterval(gnssReadNow, 2500);
  const startBtn = document.getElementById('btnGnssStartLive');
  const stopBtn = document.getElementById('btnGnssStopLive');
  if (startBtn) startBtn.disabled = true;
  if (stopBtn) stopBtn.disabled = false;
}

function gnssStopLive() {
  if (_gnssLiveTimer) {
    clearInterval(_gnssLiveTimer);
    _gnssLiveTimer = null;
  }
  const startBtn = document.getElementById('btnGnssStartLive');
  const stopBtn = document.getElementById('btnGnssStopLive');
  if (startBtn) startBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;
}

async function gnssScanWifi() {
  if (!_gnssInvoke) {
    gnssSetStatus(gnssT('gnssDesktopOnly'), true);
    return;
  }
  try {
    _gnssLastWifi = await _gnssInvoke('list_wifi_networks');
    gnssSetStatus(gnssT('gnssWifiOk', _gnssLastWifi?.length || 0));
  } catch (e) {
    gnssSetStatus(gnssT('gnssErrWifi', e), true);
  }
}

function gnssRenderAuditList() {
  const list = document.getElementById('gnssAuditList');
  if (!list) return;
  if (_gnssAuditPoints.length === 0) {
    list.innerHTML = `<div class="gnss-empty">${gnssEsc(gnssT('gnssNoAuditPoints'))}</div>`;
    return;
  }
  list.innerHTML = _gnssAuditPoints.map((p, i) => (
    `<div class="gnss-audit-row">#${i + 1} ${gnssEsc(p.time)} | ${gnssEsc(p.lat)}, ${gnssEsc(p.lon)} | WiFi: ${gnssEsc(p.wifiCount)} | best: ${gnssEsc(p.best || '-')}</div>`
  )).join('');
}

function gnssAddAuditPoint() {
  if (!_gnssLastSnapshot?.latitude || !_gnssLastSnapshot?.longitude) {
    gnssSetStatus(gnssT('gnssNeedFix'), true);
    return;
  }

  const best = (_gnssLastWifi || []).slice().sort((a, b) => (b.best_signal_pct || 0) - (a.best_signal_pct || 0))[0];
  _gnssAuditPoints.push({
    time: new Date().toISOString(),
    lat: Number(_gnssLastSnapshot.latitude).toFixed(6),
    lon: Number(_gnssLastSnapshot.longitude).toFixed(6),
    wifiCount: _gnssLastWifi?.length || 0,
    best: best?.ssid || null,
  });
  gnssRenderAuditList();
  gnssSetStatus(gnssT('gnssPointAdded', _gnssAuditPoints.length));
}

function gnssExportAudit() {
  if (_gnssAuditPoints.length === 0) {
    gnssSetStatus(gnssT('gnssNoAuditPoints'), true);
    return;
  }
  const header = 'time,lat,lon,wifi_count,best_ssid\r\n';
  const body = _gnssAuditPoints.map((p) => [p.time, p.lat, p.lon, p.wifiCount, p.best || '']
    .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'gnss_wifi_audit.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openGnssDlg() {
  if (_toolMode === 'gnss') return;
  if (typeof openToolNativeWindow === 'function' && openToolNativeWindow('gnss')) return;
  const win = document.getElementById('gnssWin');
  if (!win) return;
  win.style.display = 'flex';
  if (!win.style.top) {
    win.style.top = '64px';
    win.style.left = '140px';
  }
  if (typeof bringToFront === 'function') bringToFront(win);

  gnssRefreshPorts();
  gnssRenderMetrics(null);
  gnssRenderSatTable([]);
  gnssRenderSkyplot([]);
  gnssRenderAuditList();
  gnssSetStatus(gnssT('gnssReady'));
}

function closeGnssDlg() {
  if (_toolMode === 'gnss') {
    closeMainWindow();
    return;
  }
  gnssStopLive();
  const win = document.getElementById('gnssWin');
  if (win) win.style.display = 'none';
}

function gnssInit() {
  document.getElementById('btnGnssRefreshPorts')?.addEventListener('click', gnssRefreshPorts);
  document.getElementById('btnGnssReadNow')?.addEventListener('click', gnssReadNow);
  document.getElementById('btnGnssStartLive')?.addEventListener('click', gnssStartLive);
  document.getElementById('btnGnssStopLive')?.addEventListener('click', gnssStopLive);
  document.getElementById('btnGnssWifiScan')?.addEventListener('click', gnssScanWifi);
  document.getElementById('btnGnssAuditPoint')?.addEventListener('click', gnssAddAuditPoint);
  document.getElementById('btnGnssExportAudit')?.addEventListener('click', gnssExportAudit);
  document.getElementById('btnGnssClose')?.addEventListener('click', closeGnssDlg);
}

document.addEventListener('DOMContentLoaded', gnssInit);

window.openGnssDlg = openGnssDlg;
window.closeGnssDlg = closeGnssDlg;
