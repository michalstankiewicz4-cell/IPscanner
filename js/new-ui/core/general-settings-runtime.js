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

  // Maps the settings UI's short model ids (opus/sonnet/haiku, pro/flash) to
  // the real model strings each provider's API expects - kept here, next to
  // the rest of the AI Assistant state, so sendAiChatMessage() callers never
  // have to know the real API model names.
  var AI_API_MODEL_IDS = {
    claude: { opus: "claude-opus-4-8", sonnet: "claude-sonnet-5", haiku: "claude-haiku-4-5-20251001" },
    google: { pro: "gemini-2.5-pro", flash: "gemini-2.5-flash" },
  };

  function getAiApiModelId(provider, modelKey) {
    var p = normalizeProvider(provider);
    var table = AI_API_MODEL_IDS[p] || {};
    return table[modelKey] || modelKey;
  }

  // Direct browser/webview fetch() calls, not routed through the Rust
  // backend - both work this way (Gemini's API supports CORS for this by
  // design; Anthropic's requires the explicit opt-in header below, which
  // exists specifically for this use case). This is the one deliberate
  // exception to "external calls go through Rust": it's what makes the
  // chat work identically in the native app AND on ipscanner.pl, and it
  // means the API key never passes through any server this app's authors
  // control - it goes straight from the user's own browser/webview to
  // Anthropic/Google, visible only in that browser's own Network tab.
  function sendAiChatMessageClaude(model, apiKey, messages, system) {
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 1024,
        system: system || undefined,
        messages: messages.map(function (m) {
          return { role: m.role === "assistant" ? "assistant" : "user", content: m.content };
        }),
      }),
    }).then(function (resp) {
      return resp.text().then(function (text) {
        if (!resp.ok) throw new Error("Anthropic API error (" + resp.status + "): " + text);
        var data = JSON.parse(text);
        if (data.error) throw new Error("Anthropic API error: " + JSON.stringify(data.error));
        var reply = (data.content || [])
          .filter(function (b) { return b.type === "text"; })
          .map(function (b) { return b.text || ""; })
          .join("");
        if (!reply) throw new Error("Empty response from Anthropic");
        return reply;
      });
    });
  }

  function sendAiChatMessageGoogle(model, apiKey, messages, system) {
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey);
    var body = {
      contents: messages.map(function (m) {
        return { role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] };
      }),
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };

    return fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (resp) {
      return resp.text().then(function (text) {
        if (!resp.ok) throw new Error("Google API error (" + resp.status + "): " + text);
        var data = JSON.parse(text);
        if (data.error) throw new Error("Google API error: " + JSON.stringify(data.error));
        var reply = (data.candidates || [])
          .map(function (c) {
            var parts = (c.content && c.content.parts) || [];
            return parts.map(function (p) { return p.text || ""; }).join("");
          })
          .join("");
        if (!reply) throw new Error("Empty response from Google");
        return reply;
      });
    });
  }

  function sendAiChatMessage(provider, modelKey, apiKey, messages, system) {
    var p = normalizeProvider(provider);
    var model = getAiApiModelId(p, modelKey);
    if (!apiKey) return Promise.reject(new Error("missing_api_key"));
    return p === "google"
      ? sendAiChatMessageGoogle(model, apiKey, messages, system)
      : sendAiChatMessageClaude(model, apiKey, messages, system);
  }

  window.NetReconNewUICore.aiAssistantConfig = {
    getState: getAiConfigState,
    getDefaultState: makeDefaultAiConfigState,
    replaceState: replaceAiConfigState,
    getApiKey: getAiApiKey,
    setApiKey: setAiApiKey,
    setKeyStorageMode: setAiKeyStorageMode,
    getApiModelId: getAiApiModelId,
    sendChatMessage: sendAiChatMessage,
  };

  // RS "AI Assistant" panel's mode badge (index.html's static
  // #v1AiModeBadge, next to the UI/PS radio toggle) used to be a
  // hardcoded placeholder string - now it's derived from the real
  // provider+model choice above ("Anthropic" + "Sonnet" -> "Anthropic
  // Sonnet"), kept in sync on every config change. The badge is a single
  // static element (never torn down/re-rendered), so this only needs to
  // bind once.
  var AI_DISPLAY_NAMES = {
    claude: { name: "Anthropic", models: { opus: "Opus", sonnet: "Sonnet", haiku: "Haiku" } },
    google: { name: "Google", models: { pro: "Pro", flash: "Flash" } },
  };

  function computeAiModeBadgeText() {
    var state = getAiConfigState();
    var meta = AI_DISPLAY_NAMES[state.provider] || AI_DISPLAY_NAMES.claude;
    var providerState = state[state.provider] || {};
    var modelLabel = meta.models[providerState.model] || providerState.model || "";
    return meta.name + " " + modelLabel;
  }

  function updateAiModeBadge() {
    var badge = document.getElementById("v1AiModeBadge");
    if (badge) badge.textContent = computeAiModeBadgeText();
  }

  updateAiModeBadge();
  document.addEventListener("newui:ai-assistant-config-changed", updateAiModeBadge);
})();
