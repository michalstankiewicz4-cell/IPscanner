// ══════════════════════════════════════════════════
//  COMMAND CONSOLE
// ══════════════════════════════════════════════════

const btnConsole  = document.getElementById('btnCmdConsole');

const cmdWin = document.getElementById('cmdWin');
const cmdTitlebar = document.getElementById('cmdTitlebar');
const cmdInput = document.getElementById('cmdInput');
const cmdOutput = document.getElementById('cmdOutput');
const btnCmdRun = document.getElementById('btnCmdRun');
const btnCmdClose = document.getElementById('btnCmdClose');
const cmdMenuMacro = document.getElementById('cmdMenuMacro');
const cmdMenuMacroDrop = document.getElementById('cmdMenuMacroDrop');
const btnCmdSaveMacro = document.getElementById('btnCmdSaveMacro');
const cmdMacroList = document.getElementById('cmdMacroList');
const cmdHistory = [];
let cmdHistoryIndex = 0;

function appendCmdLog(text) {
  const stamp = new Date().toLocaleTimeString();
  cmdOutput.value += `[${stamp}] ${text}\n`;
  cmdOutput.scrollTop = cmdOutput.scrollHeight;
}

function openCmdConsole() {
  if (openToolNativeWindow('console')) return;
  cmdWin.style.display = 'block';
  if (!cmdOutput.value.trim()) {
    appendCmdLog('Scanner Console gotowa. Uzyj: focus, scan, help.');
    appendCmdLog(`Focus: ${focusedIp || '(brak)'}`);
  }
  cmdInput.focus();
}

function closeCmdConsole() {
  if (_toolMode === 'console') {
    closeMainWindow();
    return;
  }
  cmdWin.style.display = 'none';
  cmdMenuMacroDrop.style.display = 'none';
}

function setFocusedIp(ip) {
  focusedIp = ip;
  localStorage.setItem('netrecon_focus_ip', ip);
}

function getCommandMacros() {
  try {
    const parsed = JSON.parse(localStorage.getItem('netrecon_console_macros') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderCommandMacros() {
  const macros = getCommandMacros();
  cmdMacroList.innerHTML = '';

  if (!macros.length) {
    const empty = document.createElement('div');
    empty.style.padding = '4px 24px 4px 28px';
    empty.style.whiteSpace = 'nowrap';
    empty.style.color = '#666';
    empty.textContent = '(brak zapisanych makr)';
    cmdMacroList.appendChild(empty);
    return;
  }

  macros.slice().reverse().forEach((m, idx) => {
    const originalIndex = macros.length - 1 - idx;
    const row = document.createElement('div');
    row.style.padding = '4px 8px 4px 10px';
    row.style.cursor = 'default';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';

    const nameEl = document.createElement('span');
    nameEl.style.flex = '1';
    nameEl.style.whiteSpace = 'nowrap';
    nameEl.style.overflow = 'hidden';
    nameEl.style.textOverflow = 'ellipsis';
    nameEl.textContent = m.name || `makro_${idx + 1}`;

    const delEl = document.createElement('span');
    delEl.textContent = '✕ Usun';
    delEl.style.fontSize = '10px';
    delEl.style.padding = '1px 4px';
    delEl.style.border = '1px solid #808080';
    delEl.style.background = '#c0c0c0';
    delEl.style.color = '#400';
    delEl.style.whiteSpace = 'nowrap';
    delEl.style.cursor = 'pointer';
    delEl.title = 'Usun makro';

    row.appendChild(nameEl);
    row.appendChild(delEl);

    row.addEventListener('mouseenter', () => {
      row.style.background = '#000080';
      row.style.color = '#fff';
      delEl.style.color = '#fff';
      delEl.style.borderColor = '#fff';
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = '';
      row.style.color = '';
      delEl.style.color = '#400';
      delEl.style.borderColor = '#808080';
    });
    row.addEventListener('click', () => {
      cmdInput.value = (m.body || '').trim();
      appendCmdLog(`Wczytano makro: ${m.name || '(bez nazwy)'}`);
      cmdMenuMacroDrop.style.display = 'none';
      cmdInput.focus();
    });

    delEl.addEventListener('click', e => {
      e.stopPropagation();
      const current = getCommandMacros();
      if (originalIndex < 0 || originalIndex >= current.length) return;
      const removed = current[originalIndex];
      current.splice(originalIndex, 1);
      localStorage.setItem('netrecon_console_macros', JSON.stringify(current));
      appendCmdLog(`Usunieto makro: ${(removed && removed.name) || '(bez nazwy)'}`);
      renderCommandMacros();
      if (typeof renderMacroFiles === 'function') renderMacroFiles();
    });

    cmdMacroList.appendChild(row);
  });
}

function parseSubnet3(v) {
  if (!/^(\d{1,3}\.){2}\d{1,3}$/.test(v)) return null;
  const p = v.split('.').map(Number);
  if (p.some(n => n < 0 || n > 255)) return null;
  return `${p[0]}.${p[1]}.${p[2]}`;
}

async function runConsoleCommand(raw) {
  const line = raw.trim();
  if (!line) {
    appendCmdLog('Brak polecenia.');
    return;
  }

  if (!cmdHistory.length || cmdHistory[cmdHistory.length - 1] !== line) {
    cmdHistory.push(line);
  }
  cmdHistoryIndex = cmdHistory.length;

  appendCmdLog(`> ${line}`);

  const parts = line.split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase();
  const arg = parts.slice(1).join(' ').trim();

  if (cmd === 'help') {
    appendCmdLog('focus x.x.x.x    -> ustawia focus IP');
    appendCmdLog('focus            -> pokazuje focus IP');
    appendCmdLog('scan             -> skanuje focus IP');
    appendCmdLog('scan x.x.x.x     -> skanuje pojedyncze IP');
    appendCmdLog('scan x.x.x       -> skanuje x.x.x.0 - x.x.x.255');
    appendCmdLog('Enter nie uruchamia polecenia, uzyj przycisku Run.');
    return;
  }

  if (cmd === 'focus') {
    if (!arg) {
      appendCmdLog(`Focus: ${focusedIp || '(brak ustawionego IP)'}`);
      return;
    }
    if (!isIPv4(arg)) {
      appendCmdLog('Bledny adres IP. Uzyj formatu x.x.x.x');
      return;
    }
    setFocusedIp(arg);
    appendCmdLog(`Ustawiono focus na ${arg}`);
    return;
  }

  if (cmd === 'scan') {
    if (scanning) {
      appendCmdLog('Skanowanie juz trwa.');
      return;
    }

    let fromIp = '';
    let toIp = '';

    if (!arg) {
      if (!focusedIp) {
        appendCmdLog('Brak focus IP. Uzyj: focus x.x.x.x');
        return;
      }
      fromIp = focusedIp;
      toIp = focusedIp;
    } else if (isIPv4(arg)) {
      fromIp = arg;
      toIp = arg;
    } else {
      const subnet = parseSubnet3(arg);
      if (!subnet) {
        appendCmdLog('Niepoprawne polecenie scan. Uzyj scan x.x.x.x lub scan x.x.x');
        return;
      }
      fromIp = `${subnet}.0`;
      toIp = `${subnet}.255`;
    }

    setIP('f', fromIp);
    setIP('t', toIp);
    appendCmdLog(`Zakres skanu: ${fromIp} - ${toIp}`);
    try {
      await startScan();
      appendCmdLog(`Skan zakonczony. Hosty: ${totalFound}, porty: ${totalOpenPorts}`);
    } catch (e) {
      appendCmdLog(`Blad skanowania: ${e.message}`);
      setScanState(false);
    }
    return;
  }

  appendCmdLog(`Nieznane polecenie: ${cmd}. Uzyj help.`);
}

function saveCommandMacro() {
  const text = cmdInput.value.trim();
  if (!text) {
    appendCmdLog('Brak tresci do zapisania jako makro.');
    return;
  }

  const defaultName = `macro_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}`;
  const name = prompt('Nazwa makra:', defaultName);
  if (!name) return;

  let macros = getCommandMacros();

  macros.push({ name: name.trim() || defaultName, body: text, savedAt: Date.now() });
  localStorage.setItem('netrecon_console_macros', JSON.stringify(macros.slice(-40)));
  appendCmdLog(`Makro zapisane: ${name}`);
  renderCommandMacros();
  if (typeof renderMacroFiles === 'function') renderMacroFiles();
}


btnConsole.addEventListener('click', openCmdConsole);
btnCmdClose.addEventListener('click', closeCmdConsole);
btnCmdRun.addEventListener('click', () => runConsoleCommand(cmdInput.value));
btnCmdSaveMacro.addEventListener('click', () => {
  saveCommandMacro();
  cmdMenuMacroDrop.style.display = 'none';
});

cmdMenuMacro.addEventListener('click', e => {
  e.stopPropagation();
  renderCommandMacros();
  cmdMenuMacroDrop.style.display = cmdMenuMacroDrop.style.display === 'block' ? 'none' : 'block';
});
document.addEventListener('click', () => {
  cmdMenuMacroDrop.style.display = 'none';
});

cmdInput.addEventListener('keydown', e => {
  if (e.key === 'ArrowUp') {
    if (!cmdHistory.length) return;
    e.preventDefault();
    if (cmdHistoryIndex > 0) cmdHistoryIndex -= 1;
    cmdInput.value = cmdHistory[cmdHistoryIndex] || '';
    const pos = cmdInput.value.length;
    cmdInput.setSelectionRange(pos, pos);
  }
  if (e.key === 'ArrowDown') {
    if (!cmdHistory.length) return;
    e.preventDefault();
    if (cmdHistoryIndex < cmdHistory.length - 1) {
      cmdHistoryIndex += 1;
      cmdInput.value = cmdHistory[cmdHistoryIndex] || '';
    } else {
      cmdHistoryIndex = cmdHistory.length;
      cmdInput.value = '';
    }
    const pos = cmdInput.value.length;
    cmdInput.setSelectionRange(pos, pos);
  }
});

// Keep title buttons functional and draggable without interfering with button clicks.
(function() {
  let ox = 0;
  let oy = 0;
  let dragging = false;
  if (!cmdWin || !cmdTitlebar) return;
  cmdTitlebar.addEventListener('mousedown', e => {
    if (e.target.closest('.titlebar-btns')) return;
    const r = cmdWin.getBoundingClientRect();
    dragging = true;
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    cmdWin.style.transform = 'none';
    cmdWin.style.left = r.left + 'px';
    cmdWin.style.top = r.top + 'px';
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    cmdWin.style.left = Math.max(0, Math.min(e.clientX - ox, window.innerWidth - cmdWin.offsetWidth)) + 'px';
    cmdWin.style.top = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - 42)) + 'px';
  });
  window.addEventListener('mouseup', () => { dragging = false; });
})();

