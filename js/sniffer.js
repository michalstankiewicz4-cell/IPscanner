// ── Network Sniffer / Connection Monitor ─────────────────────────────────────

function snT(key, ...args) {
  if (typeof t === 'function') return t(key, ...args);
  return key;
}

function snEscHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const _tauriInvokeSn = window.__TAURI__?.core?.invoke ?? null;

const SN_STATE_COLORS = {
  'Established': { fg: '#004d00', bg: '#d4edda' },
  'Listen':      { fg: '#003580', bg: '#cce5ff' },
  'TimeWait':    { fg: '#7a4400', bg: '#fff3cd' },
  'CloseWait':   { fg: '#6d0000', bg: '#f8d7da' },
  'SynSent':     { fg: '#444',    bg: '#e9ecef' },
  'SynReceived': { fg: '#444',    bg: '#e9ecef' },
  'FinWait1':    { fg: '#444',    bg: '#e9ecef' },
  'FinWait2':    { fg: '#444',    bg: '#e9ecef' },
  'Closing':     { fg: '#444',    bg: '#e9ecef' },
};

let _snConnections = [];
let _snSortCol = 'proc';
let _snSortAsc = true;
let _snLiveTimer = null;
let _snSelectedId = null;
let _snInited = false;

// ── Status bar ────────────────────────────────────────────────────────────────
function snSetStatus(text, warn = false) {
  const el = document.getElementById('snifferStatus');
  if (!el) return;
  el.textContent = text;
  el.style.color = warn ? '#c00000' : '';
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function snRenderStats(rows) {
  const el = document.getElementById('snifferStats');
  if (!el) return;
  const tcp = rows.filter(r => r.proto === 'TCP').length;
  const udp = rows.filter(r => r.proto === 'UDP').length;
  const est = rows.filter(r => r.state === 'Established').length;
  const lst = rows.filter(r => r.state === 'Listen').length;
  el.textContent = `${snT('snifferTotal')}: ${rows.length}  TCP: ${tcp}  UDP: ${udp}  ESTABLISHED: ${est}  LISTEN: ${lst}`;
}

// ── Filter helpers ─────────────────────────────────────────────────────────────
function snFilteredRows() {
  const proto  = document.getElementById('snifferProto')?.value  || '';
  const state  = document.getElementById('snifferState')?.value  || '';
  const search = (document.getElementById('snifferSearch')?.value || '').toLowerCase().trim();
  return _snConnections.filter(r => {
    if (proto  && r.proto !== proto)   return false;
    if (state  && r.state !== state)   return false;
    if (search) {
      const hay = `${r.pid} ${r.proc} ${r.local} ${r.remote} ${r.state}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

function snSortRows(rows) {
  return [...rows].sort((a, b) => {
    let av = a[_snSortCol] ?? '', bv = b[_snSortCol] ?? '';
    if (_snSortCol === 'pid') { av = Number(av); bv = Number(bv); }
    else { av = String(av).toLowerCase(); bv = String(bv).toLowerCase(); }
    if (av < bv) return _snSortAsc ? -1 : 1;
    if (av > bv) return _snSortAsc ? 1 : -1;
    return 0;
  });
}

// ── State chip ────────────────────────────────────────────────────────────────
function snStateChip(state) {
  const c = SN_STATE_COLORS[state] || { fg: '#444', bg: '#e9ecef' };
  const label = state === 'Established' ? 'ESTAB' : (state || '?').toUpperCase();
  return `<span class="sn-state-chip" style="color:${c.fg};background:${c.bg};border-color:${c.fg}">${label}</span>`;
}

// ── Table render ──────────────────────────────────────────────────────────────
function snRenderTable() {
  const tbody = document.getElementById('snifferTableBody');
  if (!tbody) return;
  const rows = snSortRows(snFilteredRows());
  snRenderStats(rows);

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="sn-empty">${snT('snifferEmpty')}</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const sel = _snSelectedId === r._id ? ' class="sn-row-selected"' : '';
    return `<tr${sel} data-id="${snEscHtml(r._id)}">
      <td class="sn-pid">${snEscHtml(r.pid || '-')}</td>
      <td class="sn-proc" title="${snEscHtml(r.proc)}">${snEscHtml(r.proc || '-')}</td>
      <td class="sn-proto sn-proto-${(r.proto || '').toLowerCase()}">${snEscHtml(r.proto || '-')}</td>
      <td class="sn-addr" title="${snEscHtml(r.local)}">${snEscHtml(r.local || '-')}</td>
      <td class="sn-addr" title="${snEscHtml(r.remote)}">${snEscHtml(r.remote || '-')}</td>
      <td>${snStateChip(r.state)}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('tr[data-id]').forEach(tr => {
    tr.addEventListener('click', () => {
      _snSelectedId = tr.dataset.id;
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('sn-row-selected'));
      tr.classList.add('sn-row-selected');
    });
    tr.addEventListener('dblclick', () => {
      const row = rows.find(r => r._id === tr.dataset.id);
      if (!row?.remote) return;
      const ip = row.remote.split(':')[0];
      if (ip && ip !== '0.0.0.0' && ip !== '::' && ip !== '*' && ip !== '') {
        try { window.open(`http://${ip}`, '_blank'); } catch (_) {}
      }
    });
  });
}

function snUpdateSortUI() {
  document.querySelectorAll('#snifferTable th[data-col]').forEach(th => {
    th.classList.remove('sn-sort-asc', 'sn-sort-desc');
    if (th.dataset.col === _snSortCol) {
      th.classList.add(_snSortAsc ? 'sn-sort-asc' : 'sn-sort-desc');
    }
  });
}

// ── Data fetch ────────────────────────────────────────────────────────────────
async function snRefresh() {
  if (!_tauriInvokeSn) {
    snSetStatus(snT('snifferDesktopOnly'), true);
    return;
  }
  snSetStatus(snT('snifferLoading'));
  try {
    const conns = await _tauriInvokeSn('get_connections');
    _snConnections = (conns || []).map((r, i) => ({ ...r, _id: String(i) }));
    snRenderTable();
    snSetStatus(snT('snifferStatusDone', _snConnections.length));
  } catch (e) {
    snSetStatus(`Error: ${e}`, true);
  }
}

// ── Live mode ─────────────────────────────────────────────────────────────────
function snStartLive() {
  snStopLive();
  const ms = parseInt(document.getElementById('snifferInterval')?.value || '2000', 10);
  _snLiveTimer = setInterval(snRefresh, ms);
}

function snStopLive() {
  if (_snLiveTimer) { clearInterval(_snLiveTimer); _snLiveTimer = null; }
}

// ── CSV export ────────────────────────────────────────────────────────────────
function snExportCsv() {
  const rows = snSortRows(snFilteredRows());
  const header = 'PID,Process,Protocol,Local,Remote,State\r\n';
  const body = rows.map(r =>
    [r.pid, r.proc, r.proto, r.local, r.remote, r.state]
      .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(',')
  ).join('\r\n');
  const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'connections.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── One-time init ─────────────────────────────────────────────────────────────
function snInitOnce() {
  if (_snInited) return;
  _snInited = true;

  document.querySelectorAll('#snifferTable th[data-col]').forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      if (_snSortCol === th.dataset.col) _snSortAsc = !_snSortAsc;
      else { _snSortCol = th.dataset.col; _snSortAsc = true; }
      snUpdateSortUI();
      snRenderTable();
    });
  });

  document.getElementById('btnSnifferRefresh')?.addEventListener('click', snRefresh);
  document.getElementById('btnSnifferExport')?.addEventListener('click', snExportCsv);

  document.getElementById('snifferLive')?.addEventListener('change', e => {
    if (e.target.checked) snStartLive(); else snStopLive();
  });
  document.getElementById('snifferInterval')?.addEventListener('change', () => {
    if (document.getElementById('snifferLive')?.checked) snStartLive();
  });

  ['snifferProto', 'snifferState'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', snRenderTable)
  );
  document.getElementById('snifferSearch')?.addEventListener('input', snRenderTable);
  document.getElementById('btnSnifferClose')?.addEventListener('click', closeSnifferDlg);

  const win      = document.getElementById('snifferWin');
  const titlebar = document.getElementById('snifferTitlebar');
  if (win && titlebar && typeof initDragForWindow === 'function') {
    initDragForWindow(win, titlebar);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
function openSnifferDlg() {
  if (typeof openToolNativeWindow === 'function' && openToolNativeWindow('sniffer')) return;
  const win = document.getElementById('snifferWin');
  if (!win) return;
  win.style.display = 'flex';
  if (!win.style.top) { win.style.top = '60px'; win.style.left = '140px'; }
  if (typeof bringToFront === 'function') bringToFront(win);
  snInitOnce();
  snUpdateSortUI();
  snRefresh();
}

function closeSnifferDlg() {
  snStopLive();
  if (typeof _toolMode !== 'undefined' && _toolMode === 'sniffer') {
    if (typeof closeMainWindow === 'function') closeMainWindow();
    return;
  }
  const win = document.getElementById('snifferWin');
  if (win) win.style.display = 'none';
  const liveChk = document.getElementById('snifferLive');
  if (liveChk) liveChk.checked = false;
}

window.openSnifferDlg  = openSnifferDlg;
window.closeSnifferDlg = closeSnifferDlg;

if (typeof _toolMode !== 'undefined' && _toolMode === 'sniffer') {
  const win = document.getElementById('snifferWin');
  if (win) { win.style.display = 'flex'; win.style.top = '0'; win.style.left = '0'; win.style.width = '100vw'; win.style.height = '100vh'; }
  snInitOnce();
  snUpdateSortUI();
  snRefresh();
}
