(function () {
  var STORAGE_KEY = "netrecon_general_settings_v1";

  function makeDefaultState() {
    return {
      autoLoadLastSession: false,
      panelSideRight: false,
      checkForUpdates: true,
      rememberLanguage: true,
      rememberSkin: true,
      rememberPanelSizes: true,
      rememberBlurIp: true,
      rememberShowUnfinishedTools: true,
      rememberDetachedWindows: true,
      rememberWindowState: true,
      rememberOpenTabs: true,
      rememberClippyEnabled: true,
      rememberExtensions: true,
      rememberRangeHistory: true,
    };
  }

  function safeBool(value, fallback) {
    return typeof value === "boolean" ? value : !!fallback;
  }

  function cloneState(state) {
    var fallback = makeDefaultState();
    var input = state && typeof state === "object" ? state : {};
    var result = {};
    Object.keys(fallback).forEach(function (key) {
      result[key] = safeBool(input[key], fallback[key]);
    });
    return result;
  }

  function loadState() {
    try {
      var raw = window.localStorage ? window.localStorage.getItem(STORAGE_KEY) : "";
      if (!raw) return cloneState(makeDefaultState());
      return cloneState(JSON.parse(raw));
    } catch (_) {
      return cloneState(makeDefaultState());
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
      document.dispatchEvent(new CustomEvent("newui:general-settings-changed", { detail: getState() }));
    } catch (_) {
      // ignore event dispatch failures
    }
  }

  function getState() {
    return cloneState(currentState);
  }

  function replaceState(nextState) {
    currentState = cloneState(nextState);
    saveState(currentState);
    emitChanged();
    return getState();
  }

  function resetDefaults() {
    return replaceState(makeDefaultState());
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.generalSettings = {
    STORAGE_KEY: STORAGE_KEY,
    getState: getState,
    getDefaultState: makeDefaultState,
    replaceState: replaceState,
    resetDefaults: resetDefaults,
  };

  // AI Assistant settings (General tab, below History) - kept as its own
  // store rather than folded into generalSettings above, for two reasons:
  // that store is strictly all-boolean (cloneState() coerces every field
  // with safeBool()), and the API keys specifically need asymmetric
  // persistence the rest of this file has no precedent for - "RAM" mode
  // must never touch localStorage at all, not even transiently. Each
  // provider (Claude/Google) is independently configurable - its own
  // model choice, its own key, its own storage mode - so both can be set
  // up ahead of time and the "Provider" radio just picks which one is
  // currently active, without re-entering anything on every switch.
  var AI_CONFIG_KEY = "netrecon_ai_assistant_config_v1";
  var AI_KEY_STORAGE_PREFIX = "netrecon_ai_assistant_key_";

  function makeDefaultAiConfigState() {
    return {
      provider: "claude", // "claude" | "google" - which one is currently active
      claude: { model: "sonnet", keyStorage: "localstorage" },
      google: { model: "flash", keyStorage: "localstorage" },
    };
  }

  function cloneAiProviderState(input, fallback) {
    var src = input && typeof input === "object" ? input : {};
    return {
      model: typeof src.model === "string" && src.model ? src.model : fallback.model,
      keyStorage: src.keyStorage === "ram" ? "ram" : "localstorage",
    };
  }

  function cloneAiConfigState(state) {
    var fallback = makeDefaultAiConfigState();
    var input = state && typeof state === "object" ? state : {};
    return {
      provider: input.provider === "google" ? "google" : "claude",
      claude: cloneAiProviderState(input.claude, fallback.claude),
      google: cloneAiProviderState(input.google, fallback.google),
    };
  }

  function loadAiConfigState() {
    try {
      var raw = window.localStorage ? window.localStorage.getItem(AI_CONFIG_KEY) : "";
      if (!raw) return cloneAiConfigState(makeDefaultAiConfigState());
      return cloneAiConfigState(JSON.parse(raw));
    } catch (_) {
      return cloneAiConfigState(makeDefaultAiConfigState());
    }
  }

  function saveAiConfigState(state) {
    try {
      if (!window.localStorage) return;
      window.localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(state));
    } catch (_) {
      // ignore persistence failures
    }
  }

  var currentAiConfigState = loadAiConfigState();
  // Session-only backing store for "RAM" mode, one slot per provider - a
  // plain module var, never written anywhere on disk, gone the moment the
  // app reloads/restarts.
  var ramApiKeys = { claude: "", google: "" };

  function normalizeProvider(provider) {
    return provider === "google" ? "google" : "claude";
  }

  function emitAiConfigChanged() {
    try {
      document.dispatchEvent(new CustomEvent("newui:ai-assistant-config-changed", { detail: getAiConfigState() }));
    } catch (_) {
      // ignore event dispatch failures
    }
  }

  function getAiConfigState() {
    return cloneAiConfigState(currentAiConfigState);
  }

  function replaceAiConfigState(nextState) {
    currentAiConfigState = cloneAiConfigState(nextState);
    saveAiConfigState(currentAiConfigState);
    emitAiConfigChanged();
    return getAiConfigState();
  }

  function getAiApiKey(provider) {
    var p = normalizeProvider(provider);
    if (currentAiConfigState[p].keyStorage === "ram") return ramApiKeys[p];
    try {
      return (window.localStorage && window.localStorage.getItem(AI_KEY_STORAGE_PREFIX + p)) || "";
    } catch (_) {
      return "";
    }
  }

  function setAiApiKey(provider, value) {
    var p = normalizeProvider(provider);
    var key = String(value || "");
    if (currentAiConfigState[p].keyStorage === "ram") {
      ramApiKeys[p] = key;
      return;
    }
    try {
      if (window.localStorage) window.localStorage.setItem(AI_KEY_STORAGE_PREFIX + p, key);
    } catch (_) {
      // ignore persistence failures
    }
  }

  // Switching a provider's storage mode migrates its key across instead of
  // losing it or leaving a stale copy behind: moving to "ram" clears the
  // on-disk copy (an app claiming "session only" that quietly keeps a
  // plaintext copy on disk would be actively misleading); moving to
  // "localstorage" persists whatever was held in memory.
  function setAiKeyStorageMode(provider, mode) {
    var p = normalizeProvider(provider);
    var nextMode = mode === "ram" ? "ram" : "localstorage";
    if (nextMode === currentAiConfigState[p].keyStorage) return;
    var existingKey = getAiApiKey(p);
    if (nextMode === "ram") {
      try {
        if (window.localStorage) window.localStorage.removeItem(AI_KEY_STORAGE_PREFIX + p);
      } catch (_) { /* ignore */ }
      ramApiKeys[p] = existingKey;
    } else {
      try {
        if (window.localStorage) window.localStorage.setItem(AI_KEY_STORAGE_PREFIX + p, existingKey);
      } catch (_) { /* ignore */ }
      ramApiKeys[p] = "";
    }
    var next = getAiConfigState();
    next[p].keyStorage = nextMode;
    replaceAiConfigState(next);
  }

  window.NetReconNewUICore.aiAssistantConfig = {
    getState: getAiConfigState,
    getDefaultState: makeDefaultAiConfigState,
    replaceState: replaceAiConfigState,
    getApiKey: getAiApiKey,
    setApiKey: setAiApiKey,
    setKeyStorageMode: setAiKeyStorageMode,
  };
})();
