// Common BLE service UUIDs -> friendly names
const BT_SERVICE_NAMES = {
  '00001800-0000-1000-8000-00805f9b34fb': 'Generic Access',
  '00001801-0000-1000-8000-00805f9b34fb': 'Generic Attribute',
  '0000180a-0000-1000-8000-00805f9b34fb': 'Device Information',
  '0000180f-0000-1000-8000-00805f9b34fb': 'Battery Service',
  '00001812-0000-1000-8000-00805f9b34fb': 'Human Interface Device (HID)',
  '0000110b-0000-1000-8000-00805f9b34fb': 'Audio Sink (A2DP)',
  '00001108-0000-1000-8000-00805f9b34fb': 'Headset',
  '0000110c-0000-1000-8000-00805f9b34fb': 'AV Remote Control Target',
  '0000110e-0000-1000-8000-00805f9b34fb': 'AV Remote Control',
  '00001803-0000-1000-8000-00805f9b34fb': 'Link Loss',
  '00001804-0000-1000-8000-00805f9b34fb': 'Tx Power',
  '00001805-0000-1000-8000-00805f9b34fb': 'Current Time',
  '00001811-0000-1000-8000-00805f9b34fb': 'Alert Notification',
  '00001816-0000-1000-8000-00805f9b34fb': 'Cycling Speed & Cadence',
  '00001818-0000-1000-8000-00805f9b34fb': 'Cycling Power',
  '0000180d-0000-1000-8000-00805f9b34fb': 'Heart Rate',
  '0000180e-0000-1000-8000-00805f9b34fb': 'Phone Alert Status',
  '00001810-0000-1000-8000-00805f9b34fb': 'Blood Pressure',
  '00001809-0000-1000-8000-00805f9b34fb': 'Health Thermometer',
  '00001802-0000-1000-8000-00805f9b34fb': 'Immediate Alert',
};

function btT(key, ...args) {
  if (typeof t === 'function') return t(key, ...args);
  return key;
}

function btServiceLabel(uuid) {
  const lo = uuid.toLowerCase();
  return BT_SERVICE_NAMES[lo] || uuid;
}

function btRssiBar(rssi) {
  if (rssi === null || rssi === undefined) return '<span class="bt-rssi bt-rssi-unknown">? dBm</span>';
  let cls = 'bt-rssi-good';
  if (rssi < -80) cls = 'bt-rssi-weak';
  else if (rssi < -65) cls = 'bt-rssi-fair';
  return `<span class="bt-rssi ${cls}">${rssi} dBm</span>`;
}

let _btDevices = [];
let _btSelectedIdx = null;
let _btScanning = false;

function btSetStatus(text, warn = false, busy = false) {
  const el = document.getElementById('btDetectorStatus');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('bt-status-warn', !!warn);
  el.classList.toggle('bt-status-busy', !!busy);
}

function btRenderDeviceList() {
  const list = document.getElementById('btDeviceList');
  if (!list) return;

  if (_btDevices.length === 0) {
    list.innerHTML = `<div class="bt-empty">${escapeHtml(btT('btNoDevicesFound'))}</div>`;
    return;
  }

  list.innerHTML = _btDevices.map((d, i) => {
    const active = i === _btSelectedIdx ? ' bt-device-row-active' : '';
    const name = d.name || 'Unknown';
    const rssiVal = d.rssi !== null && d.rssi !== undefined ? `${d.rssi} dBm` : '';
    const isBle = d.source === 'BLE';
    const badge = isBle
      ? '<span class="bt-badge bt-badge-ble">BLE</span>'
      : '<span class="bt-badge bt-badge-classic">BT</span>';
    return `<div class="bt-device-row${active}" data-idx="${i}" onclick="btSelectDevice(${i})">
      <span class="bt-device-name">${badge} ${escapeHtml(name)}</span>
      <span class="bt-device-rssi">${rssiVal}</span>
    </div>`;
  }).join('');
}

function btRenderDeviceDetail(idx) {
  const detail = document.getElementById('btDeviceDetail');
  if (!detail) return;

  const d = _btDevices[idx];
  if (!d) {
    detail.innerHTML = `<div class="bt-empty">${escapeHtml(btT('btSelectDevice'))}</div>`;
    return;
  }

  const rows = [
    [btT('btLabelName'), escapeHtml(d.name || btT('btUnknown'))],
    [btT('btLabelAddress'), escapeHtml(d.address || '-')],
    [btT('btLabelSignal'), btRssiBar(d.rssi)],
    [btT('btLabelConnectable'), d.connectable ? btT('btYes') : btT('btNo')],
    [btT('btLabelSource'), escapeHtml(d.source || '-')],
  ];

  let html = '<table class="bt-detail-table">';
  for (const [k, v] of rows) {
    html += `<tr><td class="bt-detail-key">${k}</td><td class="bt-detail-val">${v}</td></tr>`;
  }
  html += '</table>';

  if (d.services && d.services.length > 0) {
    html += `<div class="bt-services-head">${escapeHtml(btT('btServicesHead'))}</div><ul class="bt-services-list">`;
    for (const svc of d.services) {
      html += `<li title="${escapeHtml(svc)}">${escapeHtml(btServiceLabel(svc))}</li>`;
    }
    html += '</ul>';
  } else {
    html += `<div class="bt-services-head">${escapeHtml(btT('btNoServices'))}</div>`;
  }

  detail.innerHTML = html;
}

function btSelectDevice(idx) {
  _btSelectedIdx = idx;
  btRenderDeviceList();
  btRenderDeviceDetail(idx);
}

async function btStartScan() {
  if (_btScanning) return;
  if (!_tauriInvoke) {
    btSetStatus(btT('btDesktopOnly'), true);
    return;
  }

  const durationSecs = parseInt(document.getElementById('btScanDuration')?.value || '5', 10);

  _btScanning = true;
  _btDevices = [];
  _btSelectedIdx = null;
  btRenderDeviceList();
  btRenderDeviceDetail(null);
  btSetStatus(btT('btStatusScanning', durationSecs), false, true);

  document.getElementById('btnBtScan').disabled = true;
  document.getElementById('btnBtScanStop').disabled = false;

  try {
    const devices = await _tauriInvoke('scan_bluetooth_devices', { durationSecs });
    _btDevices = devices || [];
    if (_btDevices.length > 0) {
      btSetStatus(btT('btStatusFound', _btDevices.length), false, false);
      btSelectDevice(0);
    } else {
      btSetStatus(btT('btStatusNoDevices'), false, false);
    }
    btRenderDeviceList();
  } catch (err) {
    btSetStatus(btT('btStatusError', err), true, false);
  } finally {
    _btScanning = false;
    document.getElementById('btnBtScan').disabled = false;
    document.getElementById('btnBtScanStop').disabled = true;
  }
}

function btStopScan() {
  btSetStatus(btT('btStatusStopRequested'), false, false);
}

function openBtDetectorWindow() {
  if (_toolMode === 'bt-detector') return;
  if (typeof openToolNativeWindow === 'function') {
    const opened = openToolNativeWindow('bt-detector');
    if (opened) return;
  }
  const win = document.getElementById('btDetectorWin');
  if (!win) return;
  win.style.display = 'block';
  if (typeof window.bringToFront === 'function') window.bringToFront(win);
}

function closeBtDetectorWindow() {
  if (_toolMode === 'bt-detector') {
    closeMainWindow();
    return;
  }
  const win = document.getElementById('btDetectorWin');
  if (win) win.style.display = 'none';
}

window.openBtDetectorDlg = openBtDetectorWindow;
window.closeBtDetectorDlg = closeBtDetectorWindow;

function initBtDetectorEvents() {
  document.getElementById('btnBtScan')?.addEventListener('click', btStartScan);
  document.getElementById('btnBtScanStop')?.addEventListener('click', btStopScan);
  document.getElementById('btnBtDetectorClose')?.addEventListener('click', closeBtDetectorWindow);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBtDetectorEvents);
} else {
  initBtDetectorEvents();
}

if (_toolMode === 'bt-detector') {
  btSetStatus(btT('btReadyAction'));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
