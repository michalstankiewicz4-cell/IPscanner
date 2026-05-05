// ══════════════════════════════════════════════════
//  PROTOTYPE
// ══════════════════════════════════════════════════

function openProtoWindow() {
  if (openToolNativeWindow('proto')) return;
  const win = document.getElementById('protoWin');
  if (!win) return;
  if (typeof initProtoCanvas === 'function') initProtoCanvas();
  win.style.display = 'block';
  if (typeof window.bringToFront === 'function') window.bringToFront(win);
  if (typeof protoRenderLinks === 'function') protoRenderLinks();
}

function closeProtoWindow() {
  if (_toolMode === 'proto') {
    closeMainWindow();
    return;
  }
  const win = document.getElementById('protoWin');
  if (win) win.style.display = 'none';
}

function toggleProtoWindowSize() {
  const win = document.getElementById('protoWin');
  const btn = document.getElementById('btnProtoToggle');
  if (!win || !btn) return;

  const maximized = win.dataset.maximized === '1';
  if (!maximized) {
    const rect = win.getBoundingClientRect();
    win.dataset.prevLeft = String(rect.left);
    win.dataset.prevTop = String(rect.top);
    win.dataset.prevWidth = String(rect.width);
    win.dataset.prevHeight = String(rect.height);

    win.style.left = '8px';
    win.style.top = '36px';
    win.style.width = 'calc(100vw - 16px)';
    win.style.height = 'calc(100vh - 44px)';
    win.dataset.maximized = '1';
    btn.textContent = '❐';
    btn.title = 'Restore';
  } else {
    win.style.left = `${win.dataset.prevLeft || 220}px`;
    win.style.top = `${win.dataset.prevTop || 88}px`;
    win.style.width = `${win.dataset.prevWidth || 920}px`;
    win.style.height = `${win.dataset.prevHeight || 640}px`;
    win.dataset.maximized = '0';
    btn.textContent = '□';
    btn.title = 'Maximize';
  }

  if (typeof protoRenderLinks === 'function') protoRenderLinks();
}

let protoRenderLinks = null;

function initProtoCanvas() {
  const canvas = document.getElementById('protoCanvas');
  const links = document.getElementById('protoLinks');
  const status = document.getElementById('protoStatus');
  if (!canvas || !links || canvas.dataset.ready === '1') return;

  canvas.dataset.ready = '1';

  const connections = [
    { from: 'n1', to: 'n2' },
    { from: 'n2', to: 'n3' },
    { from: 'n3', to: 'n4' },
    { from: 'n5', to: 'n6' },
    { from: 'n6', to: 'n7' },
    { from: 'n7', to: 'n8' },
    { from: 'n9', to: 'n10' },
    { from: 'n10', to: 'n11', fromAnchor: 'out-true' },
    { from: 'n10', to: 'n12', fromAnchor: 'out-false' }
  ];
  let pendingFrom = null;
  let pendingFromAnchor = 'out';

  function setProtoStatus(text) {
    if (status) status.textContent = text;
  }

  function refreshAnchorStyles() {
    const anchors = canvas.querySelectorAll('.proto-anchor');
    anchors.forEach(a => a.classList.remove('proto-anchor-active'));
    if (!pendingFrom) return;
    pendingFrom.classList.add('proto-anchor-active');
  }

  function anchorPoint(nodeId, type) {
    let anchor;
    if (type === 'out-true' || type === 'out-false') {
      anchor = canvas.querySelector(`.proto-anchor-out[data-node="${nodeId}"][data-anchor="${type}"]`);
    } else if (type === 'out') {
      // prefer anchor without data-anchor (regular single-output node)
      anchor = canvas.querySelector(`.proto-anchor-out[data-node="${nodeId}"]:not([data-anchor])`)
             || canvas.querySelector(`.proto-anchor-out[data-node="${nodeId}"]`);
    } else {
      anchor = canvas.querySelector(`.proto-anchor-${type}[data-node="${nodeId}"]`);
    }
    if (!anchor) return null;
    const a = anchor.getBoundingClientRect();
    const c = canvas.getBoundingClientRect();
    return {
      x: a.left - c.left + a.width / 2,
      y: a.top - c.top + a.height / 2
    };
  }

  protoRenderLinks = () => {
    const w = Math.max(canvas.scrollWidth, canvas.clientWidth);
    const h = Math.max(canvas.scrollHeight, canvas.clientHeight);
    links.setAttribute('viewBox', `0 0 ${w} ${h}`);
    links.setAttribute('width', String(w));
    links.setAttribute('height', String(h));
    links.innerHTML = '';

    connections.forEach(c => {
      const fromAnchorType = c.fromAnchor || 'out';
      const from = anchorPoint(c.from, fromAnchorType);
      const to = anchorPoint(c.to, 'in');
      if (!from || !to) return;
      const dx = Math.max(36, Math.abs(to.x - from.x) * 0.45);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`);
      path.setAttribute('fill', 'none');
      const strokeColor = fromAnchorType === 'out-true' ? '#2a7a2a'
                        : fromAnchorType === 'out-false' ? '#b03030'
                        : '#2f4f7f';
      path.setAttribute('stroke', strokeColor);
      path.setAttribute('stroke-width', '2.2');
      path.setAttribute('stroke-linecap', 'round');
      if (fromAnchorType === 'out-false') {
        path.setAttribute('stroke-dasharray', '6 3');
      }
      links.appendChild(path);
    });
  };

  function hasConnection(fromId, toId, fromAnchorType) {
    const fa = fromAnchorType || 'out';
    return connections.some(c => c.from === fromId && c.to === toId && (c.fromAnchor || 'out') === fa);
  }

  canvas.querySelectorAll('.proto-anchor-out').forEach(anchor => {
    anchor.addEventListener('click', e => {
      e.stopPropagation();
      pendingFrom = anchor;
      pendingFromAnchor = anchor.dataset.anchor || 'out';
      refreshAnchorStyles();
      const fromNode = anchor.dataset.node || '?';
      const anchorLabel = pendingFromAnchor === 'out-true' ? ' [TRUE]'
                        : pendingFromAnchor === 'out-false' ? ' [FALSE]' : '';
      setProtoStatus(`Link mode: selected OUT${anchorLabel} from ${fromNode}. Click an IN anchor to create a line.`);
    });
  });

  canvas.querySelectorAll('.proto-anchor-in').forEach(anchor => {
    anchor.addEventListener('click', e => {
      e.stopPropagation();
      if (!pendingFrom) {
        setProtoStatus('Link mode: first click an OUT anchor, then click an IN anchor.');
        return;
      }
      const fromId = pendingFrom.dataset.node;
      const toId = anchor.dataset.node;
      if (!fromId || !toId) {
        pendingFrom = null;
        pendingFromAnchor = 'out';
        refreshAnchorStyles();
        setProtoStatus('Status: prototype mode (connection canceled).');
        return;
      }
      if (fromId === toId) {
        pendingFrom = null;
        pendingFromAnchor = 'out';
        refreshAnchorStyles();
        setProtoStatus('Connection canceled: source and target cannot be the same node.');
        return;
      }
      if (hasConnection(fromId, toId, pendingFromAnchor)) {
        pendingFrom = null;
        pendingFromAnchor = 'out';
        refreshAnchorStyles();
        setProtoStatus(`Connection already exists: ${fromId} -> ${toId}`);
        return;
      }

      const newConn = { from: fromId, to: toId };
      if (pendingFromAnchor !== 'out') newConn.fromAnchor = pendingFromAnchor;
      connections.push(newConn);
      pendingFrom = null;
      pendingFromAnchor = 'out';
      refreshAnchorStyles();
      if (protoRenderLinks) protoRenderLinks();
      setProtoStatus(`Added connection: ${fromId} -> ${toId}`);
    });
  });

  canvas.addEventListener('click', () => {
    if (!pendingFrom) return;
    pendingFrom = null;
    pendingFromAnchor = 'out';
    refreshAnchorStyles();
    setProtoStatus('Link mode canceled.');
  });

  const nodes = canvas.querySelectorAll('.proto-node');
  nodes.forEach(node => {
    const handle = node.querySelector('.proto-node-head') || node;
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (e.target.classList.contains('proto-anchor')) return;
      const nr = node.getBoundingClientRect();
      const cr = canvas.getBoundingClientRect();
      dragging = true;
      offsetX = e.clientX - nr.left;
      offsetY = e.clientY - nr.top;
      node.style.zIndex = '4';

      const onMove = ev => {
        if (!dragging) return;
        const maxLeft = Math.max(0, canvas.scrollWidth - node.offsetWidth);
        const maxTop = Math.max(0, canvas.scrollHeight - node.offsetHeight);
        const left = Math.max(0, Math.min(ev.clientX - cr.left - offsetX, maxLeft));
        const top = Math.max(24, Math.min(ev.clientY - cr.top - offsetY, maxTop));
        node.style.left = `${left}px`;
        node.style.top = `${top}px`;
        if (protoRenderLinks) protoRenderLinks();
      };

      const onUp = () => {
        dragging = false;
        node.style.zIndex = '2';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  });

  window.addEventListener('resize', () => {
    if (protoRenderLinks) protoRenderLinks();
  });

  protoRenderLinks();
  setProtoStatus('Status: Prototype mode (UI concept only). Link mode: click OUT anchor, then click IN anchor.');
}

document.addEventListener('DOMContentLoaded', () => {
  const protoCloseBtn = document.getElementById('btnProtoClose');
  if (protoCloseBtn) protoCloseBtn.addEventListener('click', closeProtoWindow);

  const protoToggleBtn = document.getElementById('btnProtoToggle');
  if (protoToggleBtn) protoToggleBtn.addEventListener('click', toggleProtoWindowSize);

  const protoWin = document.getElementById('protoWin');
  const protoBar = document.getElementById('protoTitlebar');
  const protoResizeHandle = document.getElementById('protoResizeHandle');
  if (protoWin && protoBar) {
    let dragging = false;
    let ox = 0;
    let oy = 0;
    protoBar.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (e.target.closest('.titlebar-btns')) return;
      const r = protoWin.getBoundingClientRect();
      dragging = true;
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      protoWin.style.transform = 'none';
      protoWin.style.left = r.left + 'px';
      protoWin.style.top = r.top + 'px';
      e.preventDefault();
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      protoWin.style.left = Math.max(0, Math.min(e.clientX - ox, window.innerWidth - protoWin.offsetWidth)) + 'px';
      protoWin.style.top = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - 44)) + 'px';
    });
    window.addEventListener('mouseup', () => { dragging = false; });
  }

  if (protoWin && protoResizeHandle) {
    let resizing = false;
    let startW = 0;
    let startH = 0;
    let startX = 0;
    let startY = 0;

    protoResizeHandle.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      resizing = true;
      startW = protoWin.offsetWidth;
      startH = protoWin.offsetHeight;
      startX = e.clientX;
      startY = e.clientY;
      e.preventDefault();
    });

    window.addEventListener('mousemove', e => {
      if (!resizing || protoWin.dataset.maximized === '1') return;
      const nextW = Math.max(760, Math.min(window.innerWidth - protoWin.offsetLeft - 8, startW + (e.clientX - startX)));
      const nextH = Math.max(500, Math.min(window.innerHeight - protoWin.offsetTop - 8, startH + (e.clientY - startY)));
      protoWin.style.width = `${nextW}px`;
      protoWin.style.height = `${nextH}px`;
      if (typeof protoRenderLinks === 'function') protoRenderLinks();
    });

    window.addEventListener('mouseup', () => {
      resizing = false;
    });
  }
});
