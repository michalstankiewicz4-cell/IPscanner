// ══════════════════════════════════════════════════
//  MACRO FOLDER
// ══════════════════════════════════════════════════

function readMacroStorageList() {
  try {
    const parsed = JSON.parse(localStorage.getItem('netrecon_console_macros') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderMacroFiles() {
  const listEl = document.getElementById('macroFolderList');
  const countEl = document.getElementById('macroFolderCount');
  if (!listEl || !countEl) return;

  const macros = readMacroStorageList();
  listEl.innerHTML = '';

  if (!macros.length) {
    const empty = document.createElement('div');
    empty.style.padding = '8px';
    empty.style.color = '#666';
    empty.textContent = 'Folder jest pusty.';
    listEl.appendChild(empty);
    countEl.textContent = '0 plikow';
    return;
  }

  macros.slice().reverse().forEach((m, idx) => {
    const originalIndex = macros.length - 1 - idx;
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    row.style.padding = '3px 6px';
    row.style.cursor = 'default';
    row.style.borderBottom = '1px solid #f0f0f0';

    const fileName = (m.name || `makro_${idx + 1}`).replace(/\s+/g, '_') + '.macro';
    const ts = m.savedAt ? new Date(m.savedAt).toLocaleString() : '-';

    row.innerHTML = `<span style="font-size:12px">📄</span><span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${fileName}</span><span style="font-size:9px;color:#666">${ts}</span>`;
    row.addEventListener('mouseenter', () => {
      row.style.background = '#000080';
      row.style.color = '#fff';
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = '';
      row.style.color = '';
    });
    row.addEventListener('dblclick', () => {
      if (typeof openCmdConsole === 'function') openCmdConsole();
      const input = document.getElementById('cmdInput');
      if (input) input.value = (m.body || '').trim();
      const out = document.getElementById('cmdOutput');
      if (out) {
        const stamp = new Date().toLocaleTimeString();
        out.value += `[${stamp}] Wczytano plik makra: ${fileName}\n`;
        out.scrollTop = out.scrollHeight;
      }
    });

    row.addEventListener('contextmenu', e => {
      e.preventDefault();
      openMacroContextMenu(e.clientX, e.clientY, originalIndex);
    });

    listEl.appendChild(row);
  });

  countEl.textContent = `${macros.length} plikow`;
}

let macroCtxIndex = -1;

function closeMacroContextMenu() {
  const menu = document.getElementById('macroCtxMenu');
  if (menu) menu.style.display = 'none';
  macroCtxIndex = -1;
}

function openMacroContextMenu(x, y, originalIndex) {
  const menu = document.getElementById('macroCtxMenu');
  if (!menu) return;
  macroCtxIndex = originalIndex;
  menu.style.display = 'block';

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mw = menu.offsetWidth || 150;
  const mh = menu.offsetHeight || 30;

  const left = Math.max(0, Math.min(x, vw - mw - 2));
  const top = Math.max(0, Math.min(y, vh - mh - 2));
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
}

function deleteMacroByIndex(originalIndex) {
  const current = getCommandMacros();
  if (originalIndex < 0 || originalIndex >= current.length) return;
  const removed = current[originalIndex];
  current.splice(originalIndex, 1);
  localStorage.setItem('netrecon_console_macros', JSON.stringify(current));
  if (typeof appendCmdLog === 'function') {
    appendCmdLog(`Usunieto makro: ${(removed && removed.name) || '(bez nazwy)'}`);
  }
  if (typeof renderCommandMacros === 'function') renderCommandMacros();
  renderMacroFiles();
}

function openMacroFolder() {
  if (openToolNativeWindow('macro')) return;
  const win = document.getElementById('macroFolderWin');
  if (!win) return;
  renderMacroFiles();
  win.style.display = 'block';
}

function closeMacroFolder() {
  if (_toolMode === 'macro') {
    closeMainWindow();
    return;
  }
  const win = document.getElementById('macroFolderWin');
  if (win) win.style.display = 'none';
}


document.addEventListener('DOMContentLoaded', () => {
  const macroCloseBtn = document.getElementById('btnMacroFolderClose');
  if (macroCloseBtn) macroCloseBtn.addEventListener('click', closeMacroFolder);

  const macroWin = document.getElementById('macroFolderWin');
  const macroBar = document.getElementById('macroFolderTitlebar');
  const macroCtxMenu = document.getElementById('macroCtxMenu');
  const macroCtxDelete = document.getElementById('macroCtxDelete');
  if (macroWin && macroBar) {
    let dragging = false;
    let ox = 0;
    let oy = 0;
    macroBar.addEventListener('mousedown', e => {
      if (e.target.closest('.titlebar-btns')) return;
      const r = macroWin.getBoundingClientRect();
      dragging = true;
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      macroWin.style.transform = 'none';
      macroWin.style.left = r.left + 'px';
      macroWin.style.top = r.top + 'px';
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      macroWin.style.left = Math.max(0, Math.min(e.clientX - ox, window.innerWidth - macroWin.offsetWidth)) + 'px';
      macroWin.style.top = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - 44)) + 'px';
    });
    window.addEventListener('mouseup', () => { dragging = false; });
  }

  if (macroCtxDelete) {
    macroCtxDelete.addEventListener('mouseenter', () => {
      macroCtxDelete.style.background = '#000080';
      macroCtxDelete.style.color = '#fff';
    });
    macroCtxDelete.addEventListener('mouseleave', () => {
      macroCtxDelete.style.background = '';
      macroCtxDelete.style.color = '';
    });
    macroCtxDelete.addEventListener('click', () => {
      if (macroCtxIndex >= 0) deleteMacroByIndex(macroCtxIndex);
      closeMacroContextMenu();
    });
  }

  document.addEventListener('click', e => {
    if (!macroCtxMenu) return;
    if (macroCtxMenu.style.display !== 'block') return;
    if (e.target && macroCtxMenu.contains(e.target)) return;
    closeMacroContextMenu();
  });

  window.addEventListener('blur', closeMacroContextMenu);
});
