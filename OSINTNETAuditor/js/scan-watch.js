let _scanWatchTimer = null;
let _scanWatchInFlight = false;
let _scanWatchWatching = false;

function getScanWatchSettings() {
  const w = Math.max(5, Math.min(3600, parseInt(document.getElementById('scanWatchWindowSecs')?.value || '30', 10) || 30));
  const p = Math.max(2, Math.min(128, parseInt(document.getElementById('scanWatchMinPorts')?.value || '8', 10) || 8));
  const i = Math.max(1, Math.min(60, parseInt(document.getElementById('scanWatchPollSecs')?.value || '2', 10) || 2));
  return { windowSecs: w, minPorts: p, pollSecs: i };
}

function saveScanWatchSettings() {
  const cfg = getScanWatchSettings();
  try { localStorage.setItem('netrecon_scan_watch', JSON.stringify(cfg)); } catch {}
}

function restoreScanWatchSettings() {
  try {
    const cfg = JSON.parse(localStorage.getItem('netrecon_scan_watch') || 'null');
    if (!cfg) return;
    const swW = document.getElementById('scanWatchWindowSecs');
    const swP = document.getElementById('scanWatchMinPorts');
    const swI = document.getElementById('scanWatchPollSecs');
    if (swW && Number.isFinite(cfg.windowSecs)) swW.value = String(cfg.windowSecs);
    if (swP && Number.isFinite(cfg.minPorts)) swP.value = String(cfg.minPorts);
    if (swI && Number.isFinite(cfg.pollSecs)) swI.value = String(cfg.pollSecs);
  } catch {}
}

function setScanWatchStatus(text, isWarn = false) {
  const el = document.getElementById('scanWatchStatus');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('scanwatch-status-warn', !!isWarn);
}

function setScanWatchBusy(isBusy) {
  const statusEl = document.getElementById('scanWatchStatus');
  const checkBtn = document.getElementById('btnScanWatchCheckNow');
  if (statusEl) statusEl.classList.toggle('scanwatch-status-busy', !!isBusy);
  if (checkBtn) checkBtn.disabled = !!isBusy;
}

function renderScanWatchRows(result) {
  const tbody = document.getElementById('scanWatchTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const suspects = Array.isArray(result?.suspects) ? result.suspects : [];
  if (suspects.length === 0) {
    const tr = document.createElement('tr');
    tr.className = 'scanwatch-empty-row';
    const td = document.createElement('td');
    td.colSpan = 4;
    td.textContent = 'No suspicious multi-port activity detected in current window.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  suspects.forEach(s => {
    const tr = document.createElement('tr');
    tr.className = 'scanwatch-row';

    const tdIp = document.createElement('td');
    tdIp.textContent = s.ip;

    const tdPorts = document.createElement('td');
    tdPorts.className = 'scanwatch-num';
    tdPorts.textContent = String(s.unique_ports);

    const tdHits = document.createElement('td');
    tdHits.className = 'scanwatch-num';
    tdHits.textContent = String(s.hits);

    const tdLast = document.createElement('td');
    tdLast.className = 'scanwatch-num';
    tdLast.textContent = `${s.last_seen_secs_ago}s`;

    tr.appendChild(tdIp);
    tr.appendChild(tdPorts);
    tr.appendChild(tdHits);
    tr.appendChild(tdLast);
    tbody.appendChild(tr);
  });
}

async function runScanWatchCheck() {
  if (_scanWatchInFlight) return;

  if (!_tauriInvoke) {
    setScanWatchStatus('IP Scan Watch is available only in desktop (Tauri) mode.', true);
    return;
  }

  const { windowSecs, minPorts } = getScanWatchSettings();
  saveScanWatchSettings();
  _scanWatchInFlight = true;
  setScanWatchBusy(true);
  setScanWatchStatus(_scanWatchWatching ? 'Checking... (watch running)' : 'Checking...');

  try {
    const result = await _tauriInvoke('check_scan_watch', { windowSecs, minPorts });
    renderScanWatchRows(result);
    const suspects = Array.isArray(result?.suspects) ? result.suspects.length : 0;
    const samples = Number.isFinite(result?.sample_count) ? result.sample_count : 0;
    const watchTag = _scanWatchWatching ? ' | Watch: ON' : '';
    setScanWatchStatus(`Window: ${windowSecs}s | Threshold: ${minPorts} ports | Samples: ${samples} | Suspects: ${suspects}${watchTag}`, suspects > 0);
  } catch (e) {
    setScanWatchStatus(`Scan watch error: ${e?.message || e}`, true);
  } finally {
    _scanWatchInFlight = false;
    setScanWatchBusy(false);
  }
}

function startScanWatch() {
  stopScanWatch();
  const { pollSecs } = getScanWatchSettings();
  saveScanWatchSettings();
  _scanWatchWatching = true;
  _scanWatchTimer = setInterval(runScanWatchCheck, pollSecs * 1000);
  runScanWatchCheck();
  const startBtn = document.getElementById('btnScanWatchStart');
  const stopBtn = document.getElementById('btnScanWatchStop');
  if (startBtn) startBtn.disabled = true;
  if (stopBtn) stopBtn.disabled = false;
  setScanWatchStatus(`Watch started (refresh every ${pollSecs}s)...`);
}

function stopScanWatch() {
  _scanWatchWatching = false;
  if (_scanWatchTimer) {
    clearInterval(_scanWatchTimer);
    _scanWatchTimer = null;
  }
  const startBtn = document.getElementById('btnScanWatchStart');
  const stopBtn = document.getElementById('btnScanWatchStop');
  if (startBtn) startBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;
  if (!_scanWatchInFlight) setScanWatchStatus('Watch stopped.');
}

function openScanWatchDlg() {
  if (typeof openToolNativeWindow === 'function' && openToolNativeWindow('scan-watch')) return;
  const win = document.getElementById('scanWatchWin');
  if (!win) return;
  restoreScanWatchSettings();
  win.style.display = 'flex';
  if (!win.style.top) { win.style.top = '60px'; win.style.left = '100px'; }
  if (typeof bringToFront === 'function') bringToFront(win);
  if (typeof initDragForWindow === 'function') {
    const tb = document.getElementById('scanWatchTitlebar');
    if (tb) initDragForWindow(win, tb);
  }
  runScanWatchCheck();
}

function closeScanWatchDlg() {
  stopScanWatch();
  if (typeof _toolMode !== 'undefined' && _toolMode === 'scan-watch') {
    if (typeof closeMainWindow === 'function') closeMainWindow();
    return;
  }
  const win = document.getElementById('scanWatchWin');
  if (win) win.style.display = 'none';
}

window.openScanWatchDlg = openScanWatchDlg;
window.closeScanWatchDlg = closeScanWatchDlg;

document.getElementById('menuToolScanWatch')?.addEventListener('click', () => {
  closeAllMenus();
  openScanWatchDlg();
});

document.getElementById('btnScanWatchClose')?.addEventListener('click', closeScanWatchDlg);
document.getElementById('btnScanWatchCheckNow')?.addEventListener('click', runScanWatchCheck);
document.getElementById('btnScanWatchStart')?.addEventListener('click', startScanWatch);
document.getElementById('btnScanWatchStop')?.addEventListener('click', stopScanWatch);

if (typeof _toolMode !== 'undefined' && _toolMode === 'scan-watch') {
  const win = document.getElementById('scanWatchWin');
  if (win) { win.style.display = 'flex'; win.style.top = '0'; win.style.left = '0'; win.style.width = '100vw'; win.style.height = '100vh'; }
  restoreScanWatchSettings();
  runScanWatchCheck();
}
