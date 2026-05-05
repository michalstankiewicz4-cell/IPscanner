// ══════════════════════════════════════════════════
//  COMMAND CONSOLE — read-only log view (XP CMD style)
// ══════════════════════════════════════════════════

const btnConsole      = document.getElementById('btnCmdConsole');
const cmdWin          = document.getElementById('cmdWin');
const cmdTitlebar     = document.getElementById('cmdTitlebar');
const cmdOutput       = document.getElementById('cmdOutput');
const btnCmdClose     = document.getElementById('btnCmdClose');
const cmdMenuFile     = document.getElementById('cmdMenuFile');
const cmdMenuFileDrop = document.getElementById('cmdMenuFileDrop');
const btnCmdSaveLogs  = document.getElementById('btnCmdSaveLogs');
const cmdFilterSelect = document.getElementById('cmdFilterSelect');
const btnCmdFilter    = document.getElementById('btnCmdFilter');
const btnCmdClearLog  = document.getElementById('btnCmdClearLog');

// Full log buffer — entries tagged by category
const _cmdLogBuffer = []; // { stamp, text, tag }

function appendCmdLog(text, tag) {
  const stamp = new Date().toLocaleTimeString();
  const cat = tag || _detectTag(text);
  _cmdLogBuffer.push({ stamp, text, cat });
  const currentFilter = cmdFilterSelect ? cmdFilterSelect.value : '';
  if (!currentFilter || cat === currentFilter) {
    cmdOutput.value += `[${stamp}] ${text}\n`;
    cmdOutput.scrollTop = cmdOutput.scrollHeight;
  }
}

function _detectTag(text) {
  const t = text.toLowerCase();
  if (t.includes('scan') || t.includes('host') || t.includes('port')) return 'scan';
  if (t.includes('trace') || t.includes('hop') || t.includes('tracert')) return 'tracert';
  if (t.includes('macro')) return 'macro';
  if (t.includes('speed') || t.includes('download') || t.includes('upload') || t.includes('ping')) return 'speed';
  return '';
}

function _applyFilter() {
  const f = cmdFilterSelect.value;
  const lines = _cmdLogBuffer
    .filter(e => !f || e.cat === f)
    .map(e => `[${e.stamp}] ${e.text}`)
    .join('\n');
  cmdOutput.value = lines ? lines + '\n' : '';
  cmdOutput.scrollTop = cmdOutput.scrollHeight;
}

function openCmdConsole() {
  if (openToolNativeWindow('console')) return;
  cmdWin.style.display = 'block';
  if (typeof window.bringToFront === 'function') window.bringToFront(cmdWin);
  if (!_cmdLogBuffer.length) {
    appendCmdLog('NetRecon IP Auditor — konsola zdarzen');
    appendCmdLog('Tryb tylko-do-odczytu. Logi skanu i zdarzenia systemu.');
    appendCmdLog('─'.repeat(52));
  }
  cmdOutput.scrollTop = cmdOutput.scrollHeight;
}

function closeCmdConsole() {
  if (_toolMode === 'console') {
    closeMainWindow();
    return;
  }
  cmdWin.style.display = 'none';
}

// File menu
cmdMenuFile.addEventListener('click', e => {
  e.stopPropagation();
  cmdMenuFileDrop.style.display = cmdMenuFileDrop.style.display === 'block' ? 'none' : 'block';
});
document.addEventListener('click', () => { cmdMenuFileDrop.style.display = 'none'; });

// Save logs
btnCmdSaveLogs.addEventListener('click', () => {
  cmdMenuFileDrop.style.display = 'none';
  const content = _cmdLogBuffer.map(e => `[${e.stamp}] ${e.text}`).join('\r\n');
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date().toISOString().slice(0,19).replace(/[T:]/g,'-');
  a.href = url; a.download = `netrecon-log-${ts}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

// Filter
btnCmdFilter.addEventListener('click', _applyFilter);
cmdFilterSelect.addEventListener('change', _applyFilter);

// Clear
btnCmdClearLog.addEventListener('click', () => {
  _cmdLogBuffer.length = 0;
  cmdOutput.value = '';
});

btnConsole.addEventListener('click', openCmdConsole);
btnCmdClose.addEventListener('click', closeCmdConsole);

// Draggable
(function() {
  let ox = 0, oy = 0, dragging = false;
  if (!cmdWin || !cmdTitlebar) return;
  cmdTitlebar.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (e.target.closest('.titlebar-btns')) return;
    const r = cmdWin.getBoundingClientRect();
    dragging = true;
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    cmdWin.style.transform = 'none';
    cmdWin.style.left = r.left + 'px';
    cmdWin.style.top  = r.top  + 'px';
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    cmdWin.style.left = Math.max(0, Math.min(e.clientX - ox, window.innerWidth  - cmdWin.offsetWidth))  + 'px';
    cmdWin.style.top  = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - 42)) + 'px';
  });
  window.addEventListener('mouseup', () => { dragging = false; });
})();
