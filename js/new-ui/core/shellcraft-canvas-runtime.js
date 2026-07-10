(function () {
  var STORAGE_KEY = "netrecon_shellcraft_canvas_v1";
  var VALID_TYPES = ["macro", "if", "repeat-until", "powershell", "time-trigger"];

  function safeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function safeNumber(value, fallback) {
    var num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function makeId() {
    return "block-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36);
  }

  function makeDefaultState() {
    return { blocks: [] };
  }

  function sanitizeProperties(type, raw) {
    var props = raw && typeof raw === "object" ? raw : {};
    if (type === "macro") {
      return { macroId: safeString(props.macroId) };
    }
    if (type === "if") {
      return { condition: safeString(props.condition) };
    }
    if (type === "repeat-until") {
      return {
        condition: safeString(props.condition),
        maxIterations: Math.max(1, Math.round(safeNumber(props.maxIterations, 10))),
      };
    }
    if (type === "powershell") {
      return { command: safeString(props.command) };
    }
    if (type === "time-trigger") {
      return {
        time: safeString(props.time),
        intervalMinutes: Math.max(0, Math.round(safeNumber(props.intervalMinutes, 0))),
      };
    }
    return {};
  }

  function sanitizeBlock(item) {
    var type = VALID_TYPES.indexOf(item && item.type) >= 0 ? item.type : "";
    if (!type) return null;
    if (type === "macro" && !safeString(item.properties && item.properties.macroId)) return null;

    return {
      id: safeString(item.id) || makeId(),
      type: type,
      x: Math.max(0, Math.round(safeNumber(item.x, 40))),
      y: Math.max(0, Math.round(safeNumber(item.y, 40))),
      properties: sanitizeProperties(type, item.properties),
    };
  }

  function cloneState(state) {
    var blocks = (state && Array.isArray(state.blocks) ? state.blocks : [])
      .map(sanitizeBlock)
      .filter(function (block) { return !!block; });

    var seen = Object.create(null);
    blocks.forEach(function (block) {
      if (seen[block.id]) block.id = makeId();
      seen[block.id] = true;
    });

    return { blocks: blocks };
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
      document.dispatchEvent(new CustomEvent("newui:shellcraft-canvas-changed", { detail: getState() }));
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

  function findBlock(state, blockId) {
    return state.blocks.find(function (b) { return b.id === blockId; }) || null;
  }

  function addBlock(type, x, y, properties) {
    var next = cloneState(currentState);
    var block = sanitizeBlock({ type: type, x: x, y: y, properties: properties });
    if (!block) return "";
    next.blocks.push(block);
    replaceState(next);
    return block.id;
  }

  function updateBlockPosition(blockId, x, y) {
    var next = cloneState(currentState);
    var block = findBlock(next, blockId);
    if (!block) return;
    block.x = Math.max(0, Math.round(safeNumber(x, block.x)));
    block.y = Math.max(0, Math.round(safeNumber(y, block.y)));
    replaceState(next);
  }

  function updateBlockProperties(blockId, propsPatch) {
    var next = cloneState(currentState);
    var block = findBlock(next, blockId);
    if (!block) return;
    block.properties = sanitizeProperties(block.type, Object.assign({}, block.properties, propsPatch));
    replaceState(next);
  }

  function removeBlock(blockId) {
    var next = cloneState(currentState);
    next.blocks = next.blocks.filter(function (b) { return b.id !== blockId; });
    replaceState(next);
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.shellcraftCanvas = {
    getState: getState,
    replaceState: replaceState,
    addBlock: addBlock,
    updateBlockPosition: updateBlockPosition,
    updateBlockProperties: updateBlockProperties,
    removeBlock: removeBlock,
  };
})();
