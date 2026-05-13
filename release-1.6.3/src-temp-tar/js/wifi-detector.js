let _wifiDetectorTimer = null;
let _wifiDetectorInFlight = false;
let _wifiDetectorWatching = false;
let _wifiNetworks = [];
let _wifiSelectedSsid = null;

function getWifiDetectorSettings() {
  const pollSecs = Math.max(1, Math.min(60, parseInt(document.getElementById('wifiDetectorPollSecs')?.value || '5', 10) || 5));
  return { pollSecs };
}

function saveWifiDetectorSettings() {
  const cfg = getWifiDetectorSettings();
  try { localStorage.setItem('netrecon_wifi_detector', JSON.stringify(cfg)); } catch {}
}

function restoreWifiDetectorSettings() {
  try {
    const cfg = JSON.parse(localStorage.getItem('netrecon_wifi_detector') || 'null');
    if (!cfg) return;
    const pollEl = document.getElementById('wifiDetectorPollSecs');
    if (pollEl && Number.isFinite(cfg.pollSecs)) pollEl.value = String(cfg.pollSecs);
  } catch {}
}

function setWifiDetectorStatus(text, isWarn = false) {
  const el = document.getElementById('wifiDetectorStatus');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('wifi-detector-status-warn', !!isWarn);
}

function setWifiDetectorBusy(isBusy) {
  const statusEl = document.getElementById('wifiDetectorStatus');
  const checkBtn = document.getElementById('btnWifiDetectorCheckNow');
  if (statusEl) statusEl.classList.toggle('wifi-detector-status-busy', !!isBusy);
  if (checkBtn) checkBtn.disabled = !!isBusy;
}

function renderWifiDetails(properties, ssidLabel) {
  const titleEl = document.getElementById('wifiDetectorDetailsTitle');
  const tbody = document.getElementById('wifiDetectorDetailsTbody');
  if (!tbody) return;

  titleEl.textContent = ssidLabel ? `Properties - ${ssidLabel}` : 'Properties';
  tbody.innerHTML = '';

  if (!Array.isArray(properties) || properties.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 2;
    td.className = 'wifi-detector-empty';
    td.textContent = 'No properties available.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  properties.forEach(({ key, value }) => {
    const tr = document.createElement('tr');

    const tdKey = document.createElement('td');
    tdKey.className = 'wifi-detector-key';
    tdKey.textContent = key || '-';

    const tdVal = document.createElement('td');
    tdVal.className = 'wifi-detector-value';
    tdVal.textContent = value || '-';

    tr.appendChild(tdKey);
    tr.appendChild(tdVal);
    tbody.appendChild(tr);
  });
}

function renderWifiNetworkList(networks) {
  const listEl = document.getElementById('wifiDetectorNetworkList');
  if (!listEl) return;
  listEl.innerHTML = '';

  if (!Array.isArray(networks) || networks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'wifi-detector-empty';
    empty.textContent = 'No WiFi networks detected.';
    listEl.appendChild(empty);
    renderWifiDetails([], null);
    return;
  }

  networks.forEach((network) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wifi-detector-net-item';
    if (network.ssid === _wifiSelectedSsid) btn.classList.add('active');

    const ssidLabel = network.ssid || '(hidden SSID)';
    const signal = Number.isFinite(network.best_signal_pct) ? `${network.best_signal_pct}%` : 'n/a';
    const bssidCount = Number.isFinite(network.bssid_count) ? network.bssid_count : 0;
    const isProfile = network.source === 'profile';

    btn.textContent = ssidLabel;
    const meta = document.createElement('span');
    meta.className = 'wifi-detector-net-meta';
    meta.textContent = isProfile
      ? 'Source: saved profile (policy fallback)'
      : `Signal: ${signal} | APs: ${bssidCount}`;
    btn.appendChild(meta);

    btn.addEventListener('click', () => {
      selectWifiNetwork(network.ssid);
    });

    listEl.appendChild(btn);
  });
}

async function loadWifiNetworkDetails(ssid) {
  if (!_tauriInvoke) {
    renderWifiDetails([], null);
    return;
  }

  try {
    const details = await _tauriInvoke('get_wifi_network_details', { ssid });
    renderWifiDetails(details, ssid || '(hidden SSID)');
  } catch (e) {
    renderWifiDetails([
      { key: 'Error', value: e?.message || String(e) }
    ], ssid || '(hidden SSID)');
  }
}

function selectWifiNetwork(ssid) {
  _wifiSelectedSsid = ssid;
  renderWifiNetworkList(_wifiNetworks);
  loadWifiNetworkDetails(ssid);
}

async function runWifiDetectorCheck() {
  if (_wifiDetectorInFlight) return;

  if (!_tauriInvoke) {
    setWifiDetectorStatus('WiFi Detector network scan is available only in desktop (Tauri) mode.', true);
    return;
  }

  _wifiDetectorInFlight = true;
  setWifiDetectorBusy(true);
  setWifiDetectorStatus(_wifiDetectorWatching ? 'Checking... (watch running)' : 'Checking...');

  try {
    const networks = await _tauriInvoke('list_wifi_networks');
    _wifiNetworks = Array.isArray(networks) ? networks : [];

    if (_wifiNetworks.length === 0) {
      _wifiSelectedSsid = null;
      renderWifiNetworkList(_wifiNetworks);
      setWifiDetectorStatus(`Found 0 networks${_wifiDetectorWatching ? ' | Watch: ON' : ''}`);
      return;
    }

    const selectedStillExists = _wifiNetworks.some(n => n.ssid === _wifiSelectedSsid);
    if (!selectedStillExists) {
      _wifiSelectedSsid = _wifiNetworks[0].ssid;
    }

    renderWifiNetworkList(_wifiNetworks);
    await loadWifiNetworkDetails(_wifiSelectedSsid);

    const uniqueSsids = _wifiNetworks.length;
    const profileFallback = _wifiNetworks.every(n => n.source === 'profile');
    const watchTag = _wifiDetectorWatching ? ' | Watch: ON' : '';
    setWifiDetectorStatus(
      profileFallback
        ? `Live scan blocked by policy. Showing ${uniqueSsids} saved profile(s)${watchTag}`
        : `Found ${uniqueSsids} network(s)${watchTag}`,
      profileFallback
    );
  } catch (e) {
    const message = e?.message || String(e);
    setWifiDetectorStatus(`WiFi detector error: ${message}`, true);
    renderWifiDetails([{ key: 'Error', value: message }], null);
  } finally {
    _wifiDetectorInFlight = false;
    setWifiDetectorBusy(false);
  }
}

function startWifiDetector() {
  stopWifiDetector();
  const { pollSecs } = getWifiDetectorSettings();
  saveWifiDetectorSettings();

  _wifiDetectorWatching = true;
  _wifiDetectorTimer = setInterval(runWifiDetectorCheck, pollSecs * 1000);
  runWifiDetectorCheck();

  const startBtn = document.getElementById('btnWifiDetectorStart');
  const stopBtn = document.getElementById('btnWifiDetectorStop');
  if (startBtn) startBtn.disabled = true;
  if (stopBtn) stopBtn.disabled = false;

  setWifiDetectorStatus(`Watch started (refresh every ${pollSecs}s)...`);
}

function stopWifiDetector() {
  _wifiDetectorWatching = false;

  if (_wifiDetectorTimer) {
    clearInterval(_wifiDetectorTimer);
    _wifiDetectorTimer = null;
  }

  const startBtn = document.getElementById('btnWifiDetectorStart');
  const stopBtn = document.getElementById('btnWifiDetectorStop');
  if (startBtn) startBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;

  if (!_wifiDetectorInFlight) setWifiDetectorStatus('Watch stopped.');
}

function openWifiDetectorDlg() {
  restoreWifiDetectorSettings();
  openOverlay('dlgWifiDetectorOverlay');
  _wifiSelectedSsid = null;
  runWifiDetectorCheck();
}

function closeWifiDetectorDlg() {
  stopWifiDetector();
  closeOverlay('dlgWifiDetectorOverlay');
}

window.openWifiDetectorDlg = openWifiDetectorDlg;
window.closeWifiDetectorDlg = closeWifiDetectorDlg;

document.getElementById('menuToolWifiDetector')?.addEventListener('click', () => {
  closeAllMenus();
  openWifiDetectorDlg();
});

document.getElementById('btnWifiDetectorCheckNow')?.addEventListener('click', runWifiDetectorCheck);
document.getElementById('btnWifiDetectorStart')?.addEventListener('click', startWifiDetector);
document.getElementById('btnWifiDetectorStop')?.addEventListener('click', stopWifiDetector);
document.getElementById('wifiDetectorPollSecs')?.addEventListener('change', saveWifiDetectorSettings);
