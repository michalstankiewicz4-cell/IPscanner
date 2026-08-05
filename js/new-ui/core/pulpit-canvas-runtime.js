(function () {
  var STORAGE_KEY = "netrecon_pulpit_canvas_v1";
  var VALID_TYPES = ["remote", "local", "virtual", "own", "server", "switch", "printer", "router", "scanner", "sniffer"];
  // Only these types may be the source of a "tap" - a monitoring/script
  // link that can target either a device node OR an existing edge (line),
  // unlike a plain edge which only ever connects two devices.
  var TOOL_TYPES = ["scanner", "sniffer"];
  var TAP_TARGET_KINDS = ["node", "edge"];

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

  function makeEdgeId() {
    return "edge-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36);
  }

  function makeTapId() {
    return "tap-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36);
  }

  function makeDefaultState() {
    return { nodes: [], edges: [], taps: [] };
  }

  // Per-type config values (e.g. a switch's port count, a server's OS) -
  // loose on purpose (any string key/value survives), since which keys are
  // "expected" is a display-layer concern (PULPIT_TYPES' own fields list in
  // panel-content-runtime.js), not something this storage layer enforces.
  function sanitizeFields(raw) {
    var out = {};
    if (raw && typeof raw === "object") {
      Object.keys(raw).forEach(function (key) {
        var k = safeString(key);
        if (!k) return;
        out[k] = safeString(raw[key]);
      });
    }
    return out;
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
      // Inspector checkboxes: RDP/VNC are independent (a node can expose
      // either, both, or neither); hypervisor is radio-like (a VM runs
      // under one at a time) - enforced by the UI only ever rendering one
      // of "qemu"/"vb" as checked, not by validation here.
      connRdp: !!item.connRdp,
      connVnc: !!item.connVnc,
      hypervisor: item.hypervisor === "qemu" || item.hypervisor === "vb" ? item.hypervisor : "",
      // VNC target is kept SEPARATE per hypervisor, not one shared
      // host/port - a QEMU-managed VM and a VirtualBox-managed VM are
      // physically different machines (e.g. QEMU's own loopback-bound
      // native VNC vs. a VirtualBox VM's bridged LAN IP running TigerVNC),
      // so switching the hypervisor checkbox switches which of these two
      // pairs Podgląd actually connects to - see pulpit-preview-
      // runtime.js's resolveVncTarget().
      vncQemuHost: safeString(item.vncQemuHost),
      vncQemuPort: safeString(item.vncQemuPort),
      vncVbHost: safeString(item.vncVbHost),
      vncVbPort: safeString(item.vncVbPort),
      fields: sanitizeFields(item.fields),
      x: Math.max(0, Math.round(safeNumber(item.x, 40))),
      y: Math.max(0, Math.round(safeNumber(item.y, 40))),
    };
  }

  // nodeIds gates which edges survive - an edge referencing a node that no
  // longer exists (deleted, or never existed) is simply dropped, which is
  // exactly what makes removeNode() clean up its own edges for free: it
  // filters the node out first, then replaceState()'s own sanitizeState()
  // re-derives nodeIds from that already-shrunk list.
  function sanitizeEdge(item, nodeIds) {
    var fromId = safeString(item && item.fromId);
    var toId = safeString(item && item.toId);
    if (!fromId || !toId || fromId === toId) return null;
    if (!nodeIds[fromId] || !nodeIds[toId]) return null;
    return { id: safeString(item && item.id) || makeEdgeId(), fromId: fromId, toId: toId };
  }

  // toolNodeId must be a scanner/sniffer node; targetId must resolve in
  // whichever id space targetKind points at (nodeIds for "node", edgeIds
  // for "edge"). Same "drop on any dangling reference" discipline as
  // sanitizeEdge - this is what makes deleting a node OR an edge clean up
  // any tap that pointed at it, for free.
  function sanitizeTap(item, nodeById, edgeIds) {
    var toolNodeId = safeString(item && item.toolNodeId);
    var targetKind = TAP_TARGET_KINDS.indexOf(item && item.targetKind) >= 0 ? item.targetKind : "";
    var targetId = safeString(item && item.targetId);
    if (!toolNodeId || !targetKind || !targetId) return null;

    var toolNode = nodeById[toolNodeId];
    if (!toolNode || TOOL_TYPES.indexOf(toolNode.type) === -1) return null;
    if (targetKind === "node") {
      if (!nodeById[targetId] || targetId === toolNodeId) return null;
    } else if (!edgeIds[targetId]) {
      return null;
    }

    return { id: safeString(item && item.id) || makeTapId(), toolNodeId: toolNodeId, targetKind: targetKind, targetId: targetId };
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

    var nodeIds = Object.create(null);
    var nodeById = Object.create(null);
    nodes.forEach(function (n) { nodeIds[n.id] = true; nodeById[n.id] = n; });

    // Undirected dedupe: A->B and B->A count as the same connection, only
    // one survives.
    var pairSeen = Object.create(null);
    var edges = (state && Array.isArray(state.edges) ? state.edges : [])
      .map(function (e) { return sanitizeEdge(e, nodeIds); })
      .filter(function (edge) {
        if (!edge) return false;
        var key = edge.fromId < edge.toId ? edge.fromId + "::" + edge.toId : edge.toId + "::" + edge.fromId;
        if (pairSeen[key]) return false;
        pairSeen[key] = true;
        return true;
      });

    var edgeIdSeen = Object.create(null);
    edges.forEach(function (edge) {
      if (edgeIdSeen[edge.id]) edge.id = makeEdgeId();
      edgeIdSeen[edge.id] = true;
    });

    var edgeIds = Object.create(null);
    edges.forEach(function (e) { edgeIds[e.id] = true; });

    var tapPairSeen = Object.create(null);
    var taps = (state && Array.isArray(state.taps) ? state.taps : [])
      .map(function (t) { return sanitizeTap(t, nodeById, edgeIds); })
      .filter(function (tap) {
        if (!tap) return false;
        var key = tap.toolNodeId + "::" + tap.targetKind + "::" + tap.targetId;
        if (tapPairSeen[key]) return false;
        tapPairSeen[key] = true;
        return true;
      });

    var tapIdSeen = Object.create(null);
    taps.forEach(function (tap) {
      if (tapIdSeen[tap.id]) tap.id = makeTapId();
      tapIdSeen[tap.id] = true;
    });

    return { nodes: nodes, edges: edges, taps: taps };
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

  function addNode(type, x, y, props) {
    var next = cloneState(currentState);
    var p = props && typeof props === "object" ? props : {};
    var node = sanitizeNode({ type: type, x: x, y: y, name: p.name, host: p.host, note: p.note, fields: p.fields });
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

  // patch.fields (if present) is merged into the node's existing fields
  // bag rather than replacing it outright, so editing one per-type field
  // (e.g. just "vlan") never wipes out the others (e.g. "ports").
  function updateNodeProperties(nodeId, patch) {
    var next = cloneState(currentState);
    var node = findNode(next, nodeId);
    if (!node) return;

    var rest = patch && typeof patch === "object" ? Object.assign({}, patch) : {};
    var mergedFields = node.fields;
    if (rest.fields && typeof rest.fields === "object") {
      mergedFields = Object.assign({}, node.fields, rest.fields);
      delete rest.fields;
    }

    var merged = Object.assign({}, node, rest, { id: node.id, type: node.type, x: node.x, y: node.y, fields: mergedFields });
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

  function addEdge(fromId, toId) {
    var next = cloneState(currentState);
    var nodeIds = Object.create(null);
    next.nodes.forEach(function (n) { nodeIds[n.id] = true; });
    var edge = sanitizeEdge({ fromId: fromId, toId: toId }, nodeIds);
    if (!edge) return "";
    var key = edge.fromId < edge.toId ? edge.fromId + "::" + edge.toId : edge.toId + "::" + edge.fromId;
    var exists = next.edges.some(function (e) {
      var k = e.fromId < e.toId ? e.fromId + "::" + e.toId : e.toId + "::" + e.fromId;
      return k === key;
    });
    if (exists) return "";
    next.edges.push(edge);
    replaceState(next);
    return edge.id;
  }

  function removeEdge(edgeId) {
    var next = cloneState(currentState);
    next.edges = next.edges.filter(function (e) { return e.id !== edgeId; });
    // Any tap targeting this edge gets dropped for free by cloneState's own
    // edgeIds validation inside the replaceState() call below - same
    // pattern removeNode() already relies on for edges.
    replaceState(next);
  }

  function addTap(toolNodeId, targetKind, targetId) {
    var next = cloneState(currentState);
    var nodeById = Object.create(null);
    next.nodes.forEach(function (n) { nodeById[n.id] = n; });
    var edgeIds = Object.create(null);
    next.edges.forEach(function (e) { edgeIds[e.id] = true; });

    var tap = sanitizeTap({ toolNodeId: toolNodeId, targetKind: targetKind, targetId: targetId }, nodeById, edgeIds);
    if (!tap) return "";
    var key = tap.toolNodeId + "::" + tap.targetKind + "::" + tap.targetId;
    var exists = next.taps.some(function (t) {
      return (t.toolNodeId + "::" + t.targetKind + "::" + t.targetId) === key;
    });
    if (exists) return "";
    next.taps.push(tap);
    replaceState(next);
    return tap.id;
  }

  function removeTap(tapId) {
    var next = cloneState(currentState);
    next.taps = next.taps.filter(function (t) { return t.id !== tapId; });
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
    addEdge: addEdge,
    removeEdge: removeEdge,
    addTap: addTap,
    removeTap: removeTap,
  };
})();
