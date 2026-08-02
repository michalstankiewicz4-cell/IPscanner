(function () {
  var STORAGE_KEY = "netrecon_pulpit_canvas_v1";
  var VALID_TYPES = ["remote", "local", "virtual", "own"];

  function safeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function safeNumber(value, fallback) {
    var num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function makeId() {
    return "pulpit-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36);
  }

  function makeDefaultState() {
    return { nodes: [] };
  }

  function sanitizeNode(item) {
    var type = VALID_TYPES.indexOf(item && item.type) >= 0 ? item.type : "";
    if (!type) return null;

    return {
      id: safeString(item.id) || makeId(),
      type: type,
      name: safeString(item.name),
      host: safeString(item.host),
      note: safeString(item.note),
      x: Math.max(0, Math.round(safeNumber(item.x, 40))),
      y: Math.max(0, Math.round(safeNumber(item.y, 40))),
    };
  }

  function cloneState(state) {
    var nodes = (state && Array.isArray(state.nodes) ? state.nodes : [])
      .map(sanitizeNode)
      .filter(function (node) { return !!node; });

    var seen = Object.create(null);
    nodes.forEach(function (node) {
      if (seen[node.id]) node.id = makeId();
      seen[node.id] = true;
    });

    return { nodes: nodes };
  }

  function sanitizeState(raw) {
    return cloneState(raw && typeof raw === "object" ? raw : makeDefaultState());
  }

  function loadState() {
    try {
      var raw = window.localStorage ? window.localStorage.getItem(STORAGE_KEY) : "";
      if (!raw) return sanitizeState(makeDefaultState());
      return sanitizeState(JSON.parse(raw));
    } catch (_) {
      return sanitizeState(makeDefaultState());
    }
  }

  function saveState(state) {
    try {
      if (!window.localStorage) return;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // ignore persistence failures
    }
  }

  var currentState = loadState();

  function emitChanged() {
    try {
      document.dispatchEvent(new CustomEvent("newui:pulpit-canvas-changed", { detail: getState() }));
    } catch (_) {
      // ignore event dispatch failures
    }
  }

  function getState() {
    return cloneState(currentState);
  }

  function replaceState(nextState) {
    currentState = sanitizeState(nextState);
    saveState(currentState);
    emitChanged();
    return getState();
  }

  function findNode(state, nodeId) {
    return state.nodes.find(function (n) { return n.id === nodeId; }) || null;
  }

  function addNode(type, x, y, fields) {
    var next = cloneState(currentState);
    var props = fields && typeof fields === "object" ? fields : {};
    var node = sanitizeNode({ type: type, x: x, y: y, name: props.name, host: props.host, note: props.note });
    if (!node) return "";
    next.nodes.push(node);
    replaceState(next);
    return node.id;
  }

  function updateNodePosition(nodeId, x, y) {
    var next = cloneState(currentState);
    var node = findNode(next, nodeId);
    if (!node) return;
    node.x = Math.max(0, Math.round(safeNumber(x, node.x)));
    node.y = Math.max(0, Math.round(safeNumber(y, node.y)));
    replaceState(next);
  }

  function updateNodeProperties(nodeId, patch) {
    var next = cloneState(currentState);
    var node = findNode(next, nodeId);
    if (!node) return;
    var merged = Object.assign({}, node, patch, { id: node.id, type: node.type, x: node.x, y: node.y });
    var sanitized = sanitizeNode(merged);
    if (!sanitized) return;
    next.nodes = next.nodes.map(function (n) { return n.id === nodeId ? sanitized : n; });
    replaceState(next);
  }

  function removeNode(nodeId) {
    var next = cloneState(currentState);
    next.nodes = next.nodes.filter(function (n) { return n.id !== nodeId; });
    replaceState(next);
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.pulpitCanvas = {
    getState: getState,
    replaceState: replaceState,
    addNode: addNode,
    updateNodePosition: updateNodePosition,
    updateNodeProperties: updateNodeProperties,
    removeNode: removeNode,
  };
})();
