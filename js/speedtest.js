// ══════════════════════════════════════════════════
//  SPEED TEST
// ══════════════════════════════════════════════════

function openSpeedWindow() {
  if (openToolNativeWindow('speed')) return;
  const win = document.getElementById('speedWin');
  if (!win) return;
  win.style.display = 'block';
  if (typeof window.bringToFront === 'function') window.bringToFront(win);
}

function closeSpeedWindow() {
  if (_toolMode === 'speed') {
    closeMainWindow();
    return;
  }
  const win = document.getElementById('speedWin');
  if (win) win.style.display = 'none';
}


const speedWin = document.getElementById('speedWin');
const speedTitlebar = document.getElementById('speedTitlebar');
const btnSpeedStart = document.getElementById('btnSpeedStart');
const speedDownloadValue = document.getElementById('speedDownloadValue');
const speedPingValue = document.getElementById('speedPingValue');
const speedUploadValue = document.getElementById('speedUploadValue');
const speedStatus = document.getElementById('speedStatus');
let speedTestRunning = false;

function setSpeedStatus(text) {
  if (speedStatus) speedStatus.textContent = text;
}

function setSpeedValues(downloadMbps, pingMs, uploadMbps) {
  if (speedDownloadValue) speedDownloadValue.textContent = downloadMbps;
  if (speedPingValue) speedPingValue.textContent = pingMs;
  if (speedUploadValue) speedUploadValue.textContent = uploadMbps;
}

function formatMbps(value) {
  if (!Number.isFinite(value) || value <= 0) return '--';
  return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

function formatPingMs(value) {
  if (!Number.isFinite(value) || value <= 0) return '--';
  return value < 10 ? value.toFixed(1) : value.toFixed(0);
}

async function measurePingMs() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);
  const started = performance.now();
  try {
    const response = await fetch(`https://speed.cloudflare.com/cdn-cgi/trace?seed=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    await response.text();
    return performance.now() - started;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function measureTransferMbps({ url, method, bytes, body }) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 20000);
  const started = performance.now();
  try {
    const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}seed=${Date.now()}`, {
      method,
      cache: 'no-store',
      headers: body ? { 'content-type': 'application/octet-stream' } : undefined,
      body,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    let transferredBytes = bytes;
    if (method === 'GET') {
      const buffer = await response.arrayBuffer();
      transferredBytes = buffer.byteLength;
    } else {
      await response.text();
    }

    const seconds = Math.max((performance.now() - started) / 1000, 0.001);
    return (transferredBytes * 8) / seconds / 1000000;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function runSpeedTest() {
  if (speedTestRunning) return;

  speedTestRunning = true;
  if (btnSpeedStart) btnSpeedStart.disabled = true;
  setSpeedValues('--', '--', '--');

  try {
    setSpeedStatus('Pomiar ping...');
    const pingMs = await measurePingMs();
    if (speedPingValue) speedPingValue.textContent = formatPingMs(pingMs);

    setSpeedStatus('Pomiar download...');
    const downloadMbps = await measureTransferMbps({
      url: 'https://speed.cloudflare.com/__down?bytes=6000000',
      method: 'GET',
      bytes: 6000000
    });
    if (speedDownloadValue) speedDownloadValue.textContent = formatMbps(downloadMbps);

    setSpeedStatus('Pomiar upload...');
    const uploadBytes = 1500000;
    const uploadPayload = new Uint8Array(uploadBytes);
    uploadPayload.fill(97);
    const uploadMbps = await measureTransferMbps({
      url: 'https://speed.cloudflare.com/__up',
      method: 'POST',
      bytes: uploadBytes,
      body: uploadPayload
    });
    if (speedUploadValue) speedUploadValue.textContent = formatMbps(uploadMbps);

    setSpeedStatus(`Gotowe. Ping: ${formatPingMs(pingMs)} ms, Download: ${formatMbps(downloadMbps)} Mbps, Upload: ${formatMbps(uploadMbps)} Mbps`);
    if (typeof appendCmdLog === 'function') appendCmdLog(`Speed test: ping ${formatPingMs(pingMs)} ms  down ${formatMbps(downloadMbps)} Mbps  up ${formatMbps(uploadMbps)} Mbps`, 'speed');
  } catch (error) {
    const errMsg = error && error.message ? error.message : String(error);
    setSpeedStatus(`Test nieudany: ${errMsg}`);
    if (typeof appendCmdLog === 'function') appendCmdLog(`Speed test failed: ${errMsg}`, 'speed');
  } finally {
    speedTestRunning = false;
    if (btnSpeedStart) btnSpeedStart.disabled = false;
  }
}

if (btnSpeedStart) btnSpeedStart.addEventListener('click', runSpeedTest);

document.addEventListener('DOMContentLoaded', () => {
  const speedCloseBtn = document.getElementById('btnSpeedClose');
  if (speedCloseBtn) speedCloseBtn.addEventListener('click', closeSpeedWindow);

  const speedWin = document.getElementById('speedWin');
  const speedBar = document.getElementById('speedTitlebar');
  if (speedWin && speedBar) {
    let dragging = false;
    let ox = 0;
    let oy = 0;
    speedBar.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (e.target.closest('.titlebar-btns')) return;
      const r = speedWin.getBoundingClientRect();
      dragging = true;
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      speedWin.style.transform = 'none';
      speedWin.style.left = r.left + 'px';
      speedWin.style.top = r.top + 'px';
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      speedWin.style.left = Math.max(0, Math.min(e.clientX - ox, window.innerWidth - speedWin.offsetWidth)) + 'px';
      speedWin.style.top = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - 44)) + 'px';
    });
    window.addEventListener('mouseup', () => { dragging = false; });
  }
});
