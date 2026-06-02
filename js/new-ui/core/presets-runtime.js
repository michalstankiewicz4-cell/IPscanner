(function () {
  var STORAGE_KEY = "netrecon_scan_presets_v1";

  function makeDefaultState() {
    return {
      defaultPresetId: "all-ports",
      presets: [
        { id: "cameras", name: "Cameras", ports: "80,443,554,8080,8081,9000,34567,37777" },
        { id: "printers", name: "Printers", ports: "80,443,631,8080,9100" },
        { id: "folders-http", name: "Folders / HTTP", ports: "21,80,3000,5000,8000,8080,8888" },
        { id: "routers", name: "Routers", ports: "80,443,8080,8443,10000" },
        { id: "nas-servers", name: "NAS / Servers", ports: "80,443,5000,5001,8006,8080,9090" },
        { id: "windows-smb", name: "Windows / SMB", ports: "135,139,445,3389,5985,5986" },
        { id: "all-ports", name: "All ports", ports: "21,80,135,139,443,445,554,631,3000,3389,5000,5001,5985,5986,8000,8006,8080,8081,8443,8888,9000,9090,9100,10000,34567,37777" }
      ]
    };
  }

  function safeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function cloneState(state) {
    return {
      defaultPresetId: safeString(state && state.defaultPresetId),
      presets: (state && Array.isArray(state.presets) ? state.presets : []).map(function (item) {
        return {
          id: safeString(item && item.id),
          name: safeString(item && item.name),
          ports: safeString(item && item.ports),
        };
      }),
    };
  }

  function normalizeId(value, fallbackIndex) {
    var base = safeString(value).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (base) return base;
    return "preset-" + String(fallbackIndex + 1);
  }

  function sanitizeState(raw) {
    var fallback = makeDefaultState();
    var input = raw && typeof raw === "object" ? raw : {};
    var inputPresets = Array.isArray(input.presets) ? input.presets : fallback.presets;

    var seen = Object.create(null);
    var presets = inputPresets.map(function (item, index) {
      var id = normalizeId(item && item.id, index);
      if (seen[id]) {
        id = id + "-" + String(index + 1);
      }
      seen[id] = true;
      return {
        id: id,
        name: safeString(item && item.name) || (fallback.presets[index] && fallback.presets[index].name) || ("Preset " + String(index + 1)),
        ports: safeString(item && item.ports),
      };
    }).filter(function (item) {
      return !!item.id && !!item.name;
    });

    if (!presets.length) presets = fallback.presets.slice();

    var defaultPresetId = safeString(input.defaultPresetId);
    var hasDefault = presets.some(function (item) { return item.id === defaultPresetId; });
    if (!hasDefault) {
      defaultPresetId = presets[0].id;
    }

    return {
      defaultPresetId: defaultPresetId,
      presets: presets,
    };
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
      document.dispatchEvent(new CustomEvent("newui:presets-changed", { detail: getState() }));
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

  function resetDefaults() {
    return replaceState(makeDefaultState());
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.presets = {
    STORAGE_KEY: STORAGE_KEY,
    getState: getState,
    replaceState: replaceState,
    resetDefaults: resetDefaults,
  };
})();
