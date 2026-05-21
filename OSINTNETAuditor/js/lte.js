const _lteInvoke = window.__TAURI__?.core?.invoke ?? null;

let _lteLiveTimer = null;
let _lteWatchdogTimer = null;
let _lteStatus = null;
let _lteHandovers = [];
let _lteAudit = [];
let _lteCorrelation = [];
let _lteWatchdogEvents = [];
let _lteLastProfileHash = '';
let _lteDownSamples = [];
let _lteRttSamples = [];
let _lteModemPort = null;
let _lteModemBaud = 115200;
let _lteManualPort = '__auto__';

function lteT(key, ...args) {
  if (typeof t === 'function') return t(key, ...args);
  return key;
}

function lteEsc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function lteSetStatus(msg, warn = false) {
  const el = document.getElementById('lteStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = warn ? '#8b0000' : '';
}

function lteSourceModeLabel(modem) {
  if (_lteManualPort && _lteManualPort !== '__auto__') {
    return `${lteT('lteModeManual')}: ${_lteManualPort}@${_lteModemBaud}`;
  }
  if (modem?.port_name) {
    const baud = Number(modem?.baud_rate) || _lteModemBaud;
    return `${lteT('lteModeAuto')}: ${modem.port_name}@${baud}`;
  }
  return `${lteT('lteModeAuto')}: browser`;
}

function lteNowIso() {
  return new Date().toISOString();
}

function lteFmtNum(v, d = 2) {
  if (!Number.isFinite(Number(v))) return '—';
  return Number(v).toFixed(d);
}

function ltePushLimited(arr, item, maxLen = 200) {
  arr.push(item);
  if (arr.length > maxLen) arr.splice(0, arr.length - maxLen);
}

async function lteFetchPublicIp() {
  try {
    const res = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.ip || null;
  } catch {
    return null;
  }
}

async function lteFetchLocalIp() {
  if (!_lteInvoke) return null;
  try {
    const ip = await _lteInvoke('get_local_ip');
    return ip || null;
  } catch {
    return null;
  }
}

async function lteFetchModemSnapshot() {
  if (!_lteInvoke) return null;

  const baudSel = document.getElementById('lteBaudSelect')?.value;
  const selBaud = Number.parseInt(baudSel || String(_lteModemBaud), 10);
  if (Number.isFinite(selBaud) && selBaud > 0) {
    _lteModemBaud = selBaud;
  }

  const manualSel = document.getElementById('ltePortSelect')?.value || _lteManualPort || '__auto__';
  _lteManualPort = manualSel;

  if (_lteManualPort !== '__auto__') {
    try {
      const snap = await _lteInvoke('read_lte_snapshot', {
        portName: _lteManualPort,
        baudRate: _lteModemBaud,
        sampleSecs: 2,
      });
      _lteModemPort = _lteManualPort;
      return snap;
    } catch {
      return null;
    }
  }

  // First try pinned modem port if detected earlier.
  if (_lteModemPort) {
    try {
      return await _lteInvoke('read_lte_snapshot', {
        portName: _lteModemPort,
        baudRate: _lteModemBaud,
        sampleSecs: 2,
      });
    } catch {
      _lteModemPort = null;
    }
  }

  // Auto-detect modem over COM ports.
  try {
    const snap = await _lteInvoke('read_lte_snapshot_auto', { sampleSecs: 2 });
    if (snap?.port_name) {
      _lteModemPort = snap.port_name;
      _lteModemBaud = Number(snap.baud_rate || 115200);
    }
    return snap;
  } catch {
    return null;
  }
}

async function lteRefreshPorts() {
  const sel = document.getElementById('ltePortSelect');
  if (!sel) return;

  const selectedBefore = _lteManualPort || sel.value || '__auto__';
  sel.innerHTML = '';

  const autoOpt = document.createElement('option');
  autoOpt.value = '__auto__';
  autoOpt.textContent = lteT('lteAutoDetect');
  sel.appendChild(autoOpt);

  if (!_lteInvoke) {
    sel.value = '__auto__';
    _lteManualPort = '__auto__';
    return;
  }

  try {
    const ports = await _lteInvoke('list_serial_ports');
    (ports || []).forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      sel.appendChild(opt);
    });

    const values = Array.from(sel.options).map((o) => o.value);
    if (values.includes(selectedBefore)) {
      sel.value = selectedBefore;
      _lteManualPort = selectedBefore;
    } else {
      sel.value = '__auto__';
      _lteManualPort = '__auto__';
    }
  } catch {
    sel.value = '__auto__';
    _lteManualPort = '__auto__';
  }
}

async function lteFetchPosition() {
  return await new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: null, lon: null, alt: null });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          alt: pos.coords.altitude,
        });
      },
      () => resolve({ lat: null, lon: null, alt: null }),
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 2000 }
    );
  });
}

function lteBuildConnectionSnapshot() {
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  return {
    at: lteNowIso(),
    netType: c?.type || null,
    effectiveType: c?.effectiveType || null,
    downlinkMbps: Number.isFinite(Number(c?.downlink)) ? Number(c.downlink) : null,
    rttMs: Number.isFinite(Number(c?.rtt)) ? Number(c.rtt) : null,
    saveData: !!c?.saveData,
    online: navigator.onLine,
  };
}

function lteQualityScore(status) {
  if (!status) return null;
  let score = 50;

  if (status.effectiveType === '4g') score += 25;
  else if (status.effectiveType === '3g') score += 8;
  else if (status.effectiveType === '2g' || status.effectiveType === 'slow-2g') score -= 18;

  if (Number.isFinite(status.downlinkMbps)) {
    score += Math.max(-12, Math.min(20, (status.downlinkMbps - 6) * 1.8));
  }
  if (Number.isFinite(status.rttMs)) {
    score += Math.max(-22, Math.min(12, (110 - status.rttMs) / 6));
  }
  if (status.online === false) score = 0;
  if (status.saveData) score -= 4;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function lteLikelyRadio(status) {
  if (!status) return 'Unknown';
  const eff = String(status.effectiveType || '').toLowerCase();
  const ua = navigator.userAgent || '';
  const mobile = /android|iphone|mobile|ipad|wwan/i.test(ua);
  if (eff === '4g' && mobile) return 'Likely LTE/4G';
  if (eff === '4g') return 'Likely high-speed link';
  if (eff === '3g' || eff === '2g' || eff === 'slow-2g') return eff.toUpperCase();
  return status.netType || 'Unknown';
}

function lteRenderStatus(status) {
  const box = document.getElementById('lteMetrics');
  if (!box) return;
  if (!status) {
    box.innerHTML = `<div class="lte-empty">${lteEsc(lteT('lteNoData'))}</div>`;
    return;
  }

  const quality = lteQualityScore(status);
  const rows = [
    [lteT('lteQualityScore'), quality != null ? `${quality}/100` : '—'],
    [lteT('lteRadioTech'), lteLikelyRadio(status)],
    [lteT('lteMode'), status.sourceMode || '—'],
    [lteT('lteOperator'), status.operator || '—'],
    [lteT('lteBand'), status.band || '—'],
    [lteT('lteEarfcn'), Number.isFinite(Number(status.earfcn)) ? status.earfcn : '—'],
    [lteT('lteCellId'), status.cellId || '—'],
    [lteT('lteTac'), status.tac || '—'],
    [lteT('lteRsrp'), Number.isFinite(Number(status.rsrpDbm)) ? `${lteFmtNum(status.rsrpDbm, 1)} dBm` : '—'],
    [lteT('lteRsrq'), Number.isFinite(Number(status.rsrqDb)) ? `${lteFmtNum(status.rsrqDb, 1)} dB` : '—'],
    [lteT('lteSinr'), Number.isFinite(Number(status.sinrDb)) ? `${lteFmtNum(status.sinrDb, 1)} dB` : '—'],
    [lteT('lteEffectiveType'), status.effectiveType || '—'],
    [lteT('lteConnType'), status.netType || '—'],
    [lteT('lteDownlink'), Number.isFinite(status.downlinkMbps) ? `${lteFmtNum(status.downlinkMbps, 1)} Mbps` : '—'],
    [lteT('lteRtt'), Number.isFinite(status.rttMs) ? `${Math.round(status.rttMs)} ms` : '—'],
    [lteT('ltePublicIp'), status.publicIp || '—'],
    [lteT('lteLocalIp'), status.localIp || '—'],
    [lteT('lteSource'), status.source || '—'],
    [lteT('lteOnline'), status.online ? lteT('btYes') : lteT('btNo')],
    [lteT('lteUpdatedAt'), status.at || '—'],
  ];

  box.innerHTML = rows
    .map(([k, v]) => `<div class="lte-metric-row"><span>${lteEsc(k)}</span><b>${lteEsc(v)}</b></div>`)
    .join('');
}

function lteRenderHandovers() {
  const box = document.getElementById('lteHandoverList');
  if (!box) return;
  if (_lteHandovers.length === 0) {
    box.innerHTML = `<div class="lte-empty">${lteEsc(lteT('lteNoHandover'))}</div>`;
    return;
  }
  box.innerHTML = _lteHandovers
    .slice()
    .reverse()
    .map((h) => `<div class="lte-row">${lteEsc(h.at)} | ${lteEsc(h.from)} -> ${lteEsc(h.to)} | ${lteEsc(h.reason)}</div>`)
    .join('');
}

function lteRenderAudit() {
  const box = document.getElementById('lteAuditList');
  if (!box) return;
  if (_lteAudit.length === 0) {
    box.innerHTML = `<div class="lte-empty">${lteEsc(lteT('lteNoAuditPoints'))}</div>`;
    return;
  }
  box.innerHTML = _lteAudit
    .slice()
    .reverse()
    .map((p, idx) => `<div class="lte-row">#${_lteAudit.length - idx} ${lteEsc(p.at)} | ${lteEsc(p.lat)}, ${lteEsc(p.lon)} | ${lteEsc(p.effectiveType)} | Q=${lteEsc(p.quality)}</div>`)
    .join('');
}

function lteRenderCorrelation() {
  const box = document.getElementById('lteCorrList');
  if (!box) return;
  if (_lteCorrelation.length === 0) {
    box.innerHTML = `<div class="lte-empty">${lteEsc(lteT('lteNoCorrelation'))}</div>`;
    return;
  }

  const withQ = _lteCorrelation.filter((x) => Number.isFinite(x.quality) && Number.isFinite(x.download));
  let corrText = lteT('lteCorrInsufficient');
  if (withQ.length >= 3) {
    const corr = ltePearson(withQ.map((x) => x.quality), withQ.map((x) => x.download));
    if (Number.isFinite(corr)) corrText = `${lteT('lteCorrNow')}: ${corr.toFixed(2)}`;
  }

  box.innerHTML = `${
    _lteCorrelation
      .slice()
      .reverse()
      .map((r, idx) => `<div class="lte-row">#${_lteCorrelation.length - idx} ${lteEsc(r.at)} | Q=${lteEsc(r.quality)} | D=${lteEsc(lteFmtNum(r.download, 1))} Mbps | U=${lteEsc(lteFmtNum(r.upload, 1))} Mbps | P=${lteEsc(lteFmtNum(r.ping, 0))} ms</div>`)
      .join('')
  }<div class="lte-corr-summary">${lteEsc(corrText)}</div>`;
}

function lteRenderWatchdog() {
  const box = document.getElementById('lteWatchdogList');
  if (!box) return;
  if (_lteWatchdogEvents.length === 0) {
    box.innerHTML = `<div class="lte-empty">${lteEsc(lteT('lteWatchdogEmpty'))}</div>`;
    return;
  }
  box.innerHTML = _lteWatchdogEvents
    .slice()
    .reverse()
    .map((e) => `<div class="lte-row ${e.ok ? 'lte-ok' : 'lte-fail'}">${lteEsc(e.at)} | ${lteEsc(e.ok ? lteT('lteWdOk') : lteT('lteWdFail'))} | ${lteEsc(e.rtt)} ms</div>`)
    .join('');
}

function lteDetectHandover(status) {
  const hash = [
    status.publicIp || '-',
    status.localIp || '-',
    status.effectiveType || '-',
    status.netType || '-',
    status.cellId || '-',
    status.tac || '-',
    status.band || '-',
  ].join('|');
  if (!_lteLastProfileHash) {
    _lteLastProfileHash = hash;
    return;
  }
  if (hash === _lteLastProfileHash) return;

  ltePushLimited(_lteHandovers, {
    at: status.at,
    from: _lteLastProfileHash,
    to: hash,
    reason: lteT('lteHandoverReasonProfileChange'),
  }, 300);
  _lteLastProfileHash = hash;
  lteRenderHandovers();
}

async function lteRefreshStatus() {
  const base = lteBuildConnectionSnapshot();
  const [publicIp, localIp, modem] = await Promise.all([
    lteFetchPublicIp(),
    lteFetchLocalIp(),
    lteFetchModemSnapshot(),
  ]);

  _lteStatus = {
    ...base,
    publicIp,
    localIp,
    source: modem?.source || 'Browser/OS',
    operator: modem?.operator || null,
    tech: modem?.tech || null,
    band: modem?.band || null,
    earfcn: modem?.earfcn ?? null,
    cellId: modem?.cell_id || null,
    tac: modem?.tac || null,
    rssiDbm: Number.isFinite(Number(modem?.rssi_dbm)) ? Number(modem.rssi_dbm) : null,
    rsrpDbm: Number.isFinite(Number(modem?.rsrp_dbm)) ? Number(modem.rsrp_dbm) : null,
    rsrqDb: Number.isFinite(Number(modem?.rsrq_db)) ? Number(modem.rsrq_db) : null,
    sinrDb: Number.isFinite(Number(modem?.sinr_db)) ? Number(modem.sinr_db) : null,
  };

  const modeLabel = lteSourceModeLabel(modem);
  _lteStatus.sourceMode = modeLabel;

  if (Number.isFinite(_lteStatus.downlinkMbps)) ltePushLimited(_lteDownSamples, _lteStatus.downlinkMbps, 30);
  if (Number.isFinite(_lteStatus.rttMs)) ltePushLimited(_lteRttSamples, _lteStatus.rttMs, 30);

  lteRenderStatus(_lteStatus);
  lteDetectHandover(_lteStatus);
  lteSetStatus(`${lteT('lteStatusUpdated')} (${modeLabel})`);
  return _lteStatus;
}

function lteStartLive() {
  lteStopLive();
  const secs = Math.max(1, parseInt(document.getElementById('lteLiveSecs')?.value || '3', 10));
  lteRefreshStatus();
  _lteLiveTimer = setInterval(lteRefreshStatus, secs * 1000);
  const startBtn = document.getElementById('btnLteStartLive');
  const stopBtn = document.getElementById('btnLteStopLive');
  if (startBtn) startBtn.disabled = true;
  if (stopBtn) stopBtn.disabled = false;
}

function lteStopLive() {
  if (_lteLiveTimer) {
    clearInterval(_lteLiveTimer);
    _lteLiveTimer = null;
  }
  const startBtn = document.getElementById('btnLteStartLive');
  const stopBtn = document.getElementById('btnLteStopLive');
  if (startBtn) startBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;
}

async function lteAddAuditPoint() {
  if (!_lteStatus) await lteRefreshStatus();
  const pos = await lteFetchPosition();
  const quality = lteQualityScore(_lteStatus);

  ltePushLimited(_lteAudit, {
    at: lteNowIso(),
    lat: Number.isFinite(pos.lat) ? Number(pos.lat).toFixed(6) : '—',
    lon: Number.isFinite(pos.lon) ? Number(pos.lon).toFixed(6) : '—',
    effectiveType: _lteStatus?.effectiveType || '—',
    quality: quality ?? '—',
    downlink: _lteStatus?.downlinkMbps ?? null,
    rtt: _lteStatus?.rttMs ?? null,
    publicIp: _lteStatus?.publicIp || null,
  }, 2000);

  lteRenderAudit();
  lteSetStatus(lteT('lteAuditPointAdded', _lteAudit.length));
}

function lteDownloadCsv(filename, headerCols, rows) {
  const header = `${headerCols.join(',')}\r\n`;
  const body = rows
    .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function lteExportAudit() {
  if (_lteAudit.length === 0) {
    lteSetStatus(lteT('lteNoAuditPoints'), true);
    return;
  }
  lteDownloadCsv(
    'lte_gps_audit.csv',
    ['at', 'lat', 'lon', 'effective_type', 'quality', 'downlink_mbps', 'rtt_ms', 'public_ip'],
    _lteAudit.map((x) => [x.at, x.lat, x.lon, x.effectiveType, x.quality, x.downlink, x.rtt, x.publicIp])
  );
}

async function lteSpeedSample() {
  if (!_lteStatus) await lteRefreshStatus();

  const ping = await lteMeasurePing();
  const download = await lteMeasureTransfer({
    url: 'https://speed.cloudflare.com/__down?bytes=3000000',
    method: 'GET',
    bytes: 3000000,
  });
  const uploadPayload = new Uint8Array(800000);
  uploadPayload.fill(97);
  const upload = await lteMeasureTransfer({
    url: 'https://speed.cloudflare.com/__up',
    method: 'POST',
    bytes: uploadPayload.byteLength,
    body: uploadPayload,
  });

  ltePushLimited(_lteCorrelation, {
    at: lteNowIso(),
    quality: lteQualityScore(_lteStatus),
    ping,
    download,
    upload,
  }, 400);

  lteRenderCorrelation();
  lteSetStatus(lteT('lteCorrAdded', _lteCorrelation.length));
}

function lteExportCorrelation() {
  if (_lteCorrelation.length === 0) {
    lteSetStatus(lteT('lteNoCorrelation'), true);
    return;
  }
  lteDownloadCsv(
    'lte_quality_correlation.csv',
    ['at', 'quality', 'ping_ms', 'download_mbps', 'upload_mbps'],
    _lteCorrelation.map((x) => [x.at, x.quality, x.ping, x.download, x.upload])
  );
}

async function lteMeasurePing() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);
  const started = performance.now();
  try {
    const res = await fetch(`https://speed.cloudflare.com/cdn-cgi/trace?seed=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await res.text();
    return Math.max(1, performance.now() - started);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function lteMeasureTransfer({ url, method, bytes, body }) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 20000);
  const started = performance.now();
  try {
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}seed=${Date.now()}`, {
      method,
      cache: 'no-store',
      body,
      headers: body ? { 'content-type': 'application/octet-stream' } : undefined,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    let transferred = bytes;
    if (method === 'GET') {
      const arr = await res.arrayBuffer();
      transferred = arr.byteLength;
    } else {
      await res.text();
    }

    const seconds = Math.max((performance.now() - started) / 1000, 0.001);
    return (transferred * 8) / seconds / 1000000;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function ltePearson(xs, ys) {
  if (!Array.isArray(xs) || !Array.isArray(ys) || xs.length !== ys.length || xs.length < 2) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const xv = xs[i] - mx;
    const yv = ys[i] - my;
    num += xv * yv;
    dx += xv * xv;
    dy += yv * yv;
  }
  if (dx <= 0 || dy <= 0) return null;
  return num / Math.sqrt(dx * dy);
}

async function lteWatchdogTick() {
  const started = performance.now();
  let ok = false;
  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 7000);
    const res = await fetch(`https://www.gstatic.com/generate_204?seed=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    window.clearTimeout(timeoutId);
    ok = res.ok;
  } catch {
    ok = false;
  }

  const rtt = Math.round(Math.max(0, performance.now() - started));
  ltePushLimited(_lteWatchdogEvents, { at: lteNowIso(), ok, rtt }, 500);
  lteRenderWatchdog();

  if (!ok) {
    lteSetStatus(lteT('lteWatchdogFail'), true);
  } else {
    lteSetStatus(lteT('lteWatchdogOk', rtt));
  }
}

function lteStartWatchdog() {
  lteStopWatchdog();
  const secs = Math.max(2, parseInt(document.getElementById('lteWatchdogSecs')?.value || '5', 10));
  lteWatchdogTick();
  _lteWatchdogTimer = setInterval(lteWatchdogTick, secs * 1000);

  const startBtn = document.getElementById('btnLteStartWatchdog');
  const stopBtn = document.getElementById('btnLteStopWatchdog');
  if (startBtn) startBtn.disabled = true;
  if (stopBtn) stopBtn.disabled = false;
}

function lteStopWatchdog() {
  if (_lteWatchdogTimer) {
    clearInterval(_lteWatchdogTimer);
    _lteWatchdogTimer = null;
  }
  const startBtn = document.getElementById('btnLteStartWatchdog');
  const stopBtn = document.getElementById('btnLteStopWatchdog');
  if (startBtn) startBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;
}

function openLteDlg() {
  if (_toolMode === 'lte') return;
  if (typeof openToolNativeWindow === 'function' && openToolNativeWindow('lte')) return;

  const win = document.getElementById('lteWin');
  if (!win) return;
  win.style.display = 'flex';
  if (!win.style.top) {
    win.style.top = '70px';
    win.style.left = '150px';
  }
  if (typeof bringToFront === 'function') bringToFront(win);

  lteRenderStatus(null);
  lteRenderHandovers();
  lteRenderAudit();
  lteRenderCorrelation();
  lteRenderWatchdog();
  lteSetStatus(lteT('lteReady'));
  lteRefreshPorts();
  lteRefreshStatus();
}

function closeLteDlg() {
  if (_toolMode === 'lte') {
    closeMainWindow();
    return;
  }
  lteStopLive();
  lteStopWatchdog();
  const win = document.getElementById('lteWin');
  if (win) win.style.display = 'none';
}

function initLteEvents() {
  lteRefreshPorts();

  document.getElementById('btnLteRefresh')?.addEventListener('click', lteRefreshStatus);
  document.getElementById('btnLteStartLive')?.addEventListener('click', lteStartLive);
  document.getElementById('btnLteStopLive')?.addEventListener('click', lteStopLive);
  document.getElementById('btnLteAddPoint')?.addEventListener('click', lteAddAuditPoint);
  document.getElementById('btnLteExportAudit')?.addEventListener('click', lteExportAudit);
  document.getElementById('btnLteRunSpeed')?.addEventListener('click', lteSpeedSample);
  document.getElementById('btnLteExportCorrelation')?.addEventListener('click', lteExportCorrelation);
  document.getElementById('btnLteStartWatchdog')?.addEventListener('click', lteStartWatchdog);
  document.getElementById('btnLteStopWatchdog')?.addEventListener('click', lteStopWatchdog);
  document.getElementById('btnLteClose')?.addEventListener('click', closeLteDlg);

  document.getElementById('ltePortSelect')?.addEventListener('change', (e) => {
    const v = e?.target?.value || '__auto__';
    _lteManualPort = v;
    if (v === '__auto__') _lteModemPort = null;
    lteRefreshStatus();
  });

  document.getElementById('lteBaudSelect')?.addEventListener('change', (e) => {
    const v = Number.parseInt(e?.target?.value || '115200', 10);
    if (Number.isFinite(v) && v > 0) _lteModemBaud = v;
    lteRefreshStatus();
  });

  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn && typeof conn.addEventListener === 'function') {
    conn.addEventListener('change', () => {
      lteRefreshStatus();
    });
  }

  window.addEventListener('online', () => lteRefreshStatus());
  window.addEventListener('offline', () => lteRefreshStatus());

  if (_toolMode === 'lte') {
    lteRenderStatus(null);
    lteRenderHandovers();
    lteRenderAudit();
    lteRenderCorrelation();
    lteRenderWatchdog();
    lteSetStatus(lteT('lteReady'));
    lteRefreshStatus();
  }
}

document.addEventListener('DOMContentLoaded', initLteEvents);

window.openLteDlg = openLteDlg;
window.closeLteDlg = closeLteDlg;
