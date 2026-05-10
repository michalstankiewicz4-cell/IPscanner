// WiFi Radar Visualization

let _wifiRadarData = [];
let _wifiRadarAutoRefreshTimer = null;
let _wifiRadarInFlight = false;
let _wifiRadarAutoRefreshing = false;
let _wifiRadarSortBy = 'signal';
let _wifiRadarColors = [];

// Generate distinct colors for networks
function generateRadarColors(count) {
  const colors = [];
  const hueStep = 360 / Math.max(1, count);
  
  for (let i = 0; i < count; i++) {
    const hue = (i * hueStep) % 360;
    const saturation = 70 + (i % 3) * 10; // Vary saturation for better distinction
    const lightness = 45 + (i % 2) * 15;  // Vary lightness
    colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
  }
  
  return colors;
}

// Get signal strength percentage or return 0 if not available
function getNetworkSignalStrength(network) {
  if (typeof network.best_signal_pct === 'number') {
    return Math.max(0, Math.min(100, network.best_signal_pct));
  }
  return 0;
}

// Sort networks based on selected criteria
function sortWifiRadarNetworks(networks, sortBy) {
  const sorted = [...networks];
  
  switch (sortBy) {
    case 'signal':
      sorted.sort((a, b) => getNetworkSignalStrength(b) - getNetworkSignalStrength(a));
      break;
    case 'ssid':
      sorted.sort((a, b) => {
        const ssidA = (a.ssid || '(hidden)').toLowerCase();
        const ssidB = (b.ssid || '(hidden)').toLowerCase();
        return ssidA.localeCompare(ssidB);
      });
      break;
    case 'freq':
      sorted.sort((a, b) => {
        const freqA = a.freq || 0;
        const freqB = b.freq || 0;
        return freqB - freqA;
      });
      break;
    case 'bssid_count':
      sorted.sort((a, b) => (b.bssid_count || 0) - (a.bssid_count || 0));
      break;
    default:
      break;
  }
  
  return sorted;
}

// Draw radar visualization on canvas
function drawWifiRadar() {
  const canvas = document.getElementById('wifiRadarCanvas');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  // Set canvas size - make it responsive with minimum size
  const container = document.querySelector('.wifi-radar-container');
  if (!container || container.clientWidth <= 0 || container.clientHeight <= 0) return;
  
  const size = Math.max(100, Math.min(container.clientWidth - 20, container.clientHeight - 20, 480));
  canvas.width = size;
  canvas.height = size;
  
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = Math.max(20, (size / 2) - 20);
  
  // Draw background
  ctx.fillStyle = '#000080';
  ctx.fillRect(0, 0, size, size);
  
  // Draw concentric circles (signal strength levels)
  ctx.strokeStyle = '#00FF00';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.3;
  
  const levels = 5;
  for (let i = 1; i <= levels; i++) {
    const r = Math.max(0, (radius * i) / levels);
    ctx.beginPath();
    ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  // Draw crosshair
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#00FF00';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centerX - 10, centerY);
  ctx.lineTo(centerX + 10, centerY);
  ctx.moveTo(centerX, centerY - 10);
  ctx.lineTo(centerX, centerY + 10);
  ctx.stroke();
  
  // Draw center dot
  ctx.fillStyle = '#00FF00';
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw networks as points
  const networks = sortWifiRadarNetworks(_wifiRadarData, _wifiRadarSortBy);
  _wifiRadarColors = generateRadarColors(networks.length);
  
  networks.forEach((network, index) => {
    const angle = (index / Math.max(1, networks.length)) * Math.PI * 2 - Math.PI / 2;
    const signal = getNetworkSignalStrength(network);
    const distance = (signal / 100) * radius;
    
    const x = centerX + distance * Math.cos(angle);
    const y = centerY + distance * Math.sin(angle);
    
    // Draw network point
    ctx.fillStyle = _wifiRadarColors[index];
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw border
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 1;
    ctx.stroke();
  });
  
  // Draw labels on outer ring
  ctx.fillStyle = '#00FF00';
  ctx.globalAlpha = 1;
  ctx.font = '10px MS Sans Serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  networks.forEach((network, index) => {
    if (networks.length <= 12) { // Only show labels if not too crowded
      const angle = (index / Math.max(1, networks.length)) * Math.PI * 2 - Math.PI / 2;
      const labelDistance = radius + 25;
      
      const lx = centerX + labelDistance * Math.cos(angle);
      const ly = centerY + labelDistance * Math.sin(angle);
      
      const ssidLabel = network.ssid || '(hidden)';
      const displayLabel = ssidLabel.length > 12 ? ssidLabel.substring(0, 10) + '..' : ssidLabel;
      
      ctx.fillStyle = '#00FF00';
      ctx.globalAlpha = 0.7;
      ctx.fillText(displayLabel, lx, ly);
    }
  });
}

// Update legend with network information
function updateWifiRadarLegend() {
  const legendEl = document.getElementById('wifiRadarLegend');
  if (!legendEl) return;
  
  legendEl.innerHTML = '';
  
  const networks = sortWifiRadarNetworks(_wifiRadarData, _wifiRadarSortBy);
  
  if (networks.length === 0) {
    const empty = document.createElement('div');
    empty.style.padding = '8px';
    empty.textContent = 'No networks detected';
    legendEl.appendChild(empty);
    return;
  }
  
  networks.forEach((network, index) => {
    const item = document.createElement('div');
    item.className = 'radar-legend-item';
    
    // Color dot
    const dot = document.createElement('div');
    dot.className = 'radar-legend-dot';
    dot.style.backgroundColor = _wifiRadarColors[index] || '#808080';
    item.appendChild(dot);
    
    // Network info
    const ssid = network.ssid || '(hidden SSID)';
    const signal = getNetworkSignalStrength(network);
    const freq = network.freq ? ` @ ${network.freq}MHz` : '';
    
    const text = document.createElement('span');
    text.className = 'radar-legend-text';
    text.textContent = ssid;
    text.title = ssid;
    item.appendChild(text);
    
    const signal_text = document.createElement('span');
    signal_text.className = 'radar-legend-signal';
    signal_text.textContent = `${signal}%${freq}`;
    item.appendChild(signal_text);
    
    legendEl.appendChild(item);
  });
}

// Fetch WiFi networks and update radar
async function refreshWifiRadar() {
  if (_wifiRadarInFlight) return;
  
  if (!_tauriInvoke) {
    alert('WiFi Radar is available only in desktop (Tauri) mode.');
    return;
  }
  
  _wifiRadarInFlight = true;
  
  try {
    const networks = await _tauriInvoke('list_wifi_networks');
    _wifiRadarData = Array.isArray(networks) ? networks : [];
    
    drawWifiRadar();
    updateWifiRadarLegend();
  } catch (e) {
    console.error('WiFi Radar error:', e);
    alert(`WiFi Radar error: ${e?.message || String(e)}`);
  } finally {
    _wifiRadarInFlight = false;
  }
}

// Open WiFi Radar dialog
function openWifiRadarDlg() {
  if (openToolNativeWindow('wifi-radar')) return;
  const win = document.getElementById('wifiRadarWin');
  win.style.display = 'block';
  if (typeof window.bringToFront === 'function') window.bringToFront(win);
  refreshWifiRadar();
}

// Close WiFi Radar dialog
function closeWifiRadarDlg() {
  stopWifiRadarAutoRefresh();
  const win = document.getElementById('wifiRadarWin');
  if (win) win.style.display = 'none';
}

// Start auto-refresh
function startWifiRadarAutoRefresh() {
  stopWifiRadarAutoRefresh();
  
  _wifiRadarAutoRefreshing = true;
  const startBtn = document.getElementById('btnWifiRadarAutoRefresh');
  const stopBtn = document.getElementById('btnWifiRadarStopAuto');
  
  if (startBtn) startBtn.disabled = true;
  if (stopBtn) stopBtn.disabled = false;
  
  // Refresh immediately
  refreshWifiRadar();
  
  // Then set up interval (every 3 seconds)
  _wifiRadarAutoRefreshTimer = setInterval(refreshWifiRadar, 3000);
}

// Stop auto-refresh
function stopWifiRadarAutoRefresh() {
  _wifiRadarAutoRefreshing = false;
  
  if (_wifiRadarAutoRefreshTimer) {
    clearInterval(_wifiRadarAutoRefreshTimer);
    _wifiRadarAutoRefreshTimer = null;
  }
  
  const startBtn = document.getElementById('btnWifiRadarAutoRefresh');
  const stopBtn = document.getElementById('btnWifiRadarStopAuto');
  
  if (startBtn) startBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;
}

// Handle sort option change
function handleWifiRadarSortChange() {
  const selectEl = document.getElementById('wifiRadarSortBy');
  if (selectEl) {
    _wifiRadarSortBy = selectEl.value;
    drawWifiRadar();
    updateWifiRadarLegend();
  }
}

// Export functions to global scope
window.openWifiRadarDlg = openWifiRadarDlg;
window.closeWifiRadarDlg = closeWifiRadarDlg;
window.refreshWifiRadar = refreshWifiRadar;
window.startWifiRadarAutoRefresh = startWifiRadarAutoRefresh;
window.stopWifiRadarAutoRefresh = stopWifiRadarAutoRefresh;
window.handleWifiRadarSortChange = handleWifiRadarSortChange;

// Set up event listeners
document.getElementById('btnWifiRadarClose')?.addEventListener('click', closeWifiRadarDlg);
document.getElementById('btnWifiRadarRefresh')?.addEventListener('click', refreshWifiRadar);
document.getElementById('btnWifiRadarAutoRefresh')?.addEventListener('click', startWifiRadarAutoRefresh);
document.getElementById('btnWifiRadarStopAuto')?.addEventListener('click', stopWifiRadarAutoRefresh);
document.getElementById('wifiRadarSortBy')?.addEventListener('change', handleWifiRadarSortChange);

// Handle window resize to redraw radar
window.addEventListener('resize', () => {
  if (document.getElementById('wifiRadarWin')?.style.display !== 'none') {
    drawWifiRadar();
  }
});
