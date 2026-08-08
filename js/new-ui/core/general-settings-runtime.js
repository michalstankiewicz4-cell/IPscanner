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

  // The two system prompts sendPrompt() (navigation-runtime.js) sends per
  // mode - kept here, not there, since this file already owns every other
  // piece of AI Assistant config, and a user-editable prompt needs the
  // same persisted-state/"restore default" treatment as everything else in
  // this store. PS stays a defined default even though its mode toggle is
  // still disabled today (see index.html's v1AiModePsCheckbox) - the text
  // exists and is ready for whenever that toggle is wired up for real.
  var DEFAULT_SYSTEM_PROMPT_UI = "You are an assistant embedded in a desktop network/OSINT tool. Focus on explaining UI actions, panel workflows, and built-in macros the user can trigger in the app. Do not suggest running arbitrary shell commands.";
  var DEFAULT_SYSTEM_PROMPT_PS = "You are an assistant embedded in a desktop network/OSINT tool, running with full console permissions. Focus on PowerShell commands and console/terminal workflows the user can run.";

  // Per-provider, not global - RS's "AI Properties" tab shows whichever
  // provider is currently active, and switching providers there switches
  // to that provider's own remembered numbers instead of a single shared
  // pair. See docs/ROADMAP.md's "AI Assistant: configurable cost/round
  // limits" entry - this is that entry, implemented.
  var DEFAULT_MAX_OUTPUT_TOKENS = 1024;
  var DEFAULT_MAX_ROUNDS = 6;

  function makeDefaultAiConfigState() {
    return {
      provider: "claude", // "claude" | "google" - which one is currently active
      claude: { model: "sonnet", keyStorage: "localstorage", maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS, maxRounds: DEFAULT_MAX_ROUNDS },
      google: { model: "flash", keyStorage: "localstorage", maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS, maxRounds: DEFAULT_MAX_ROUNDS },
      systemPromptUi: DEFAULT_SYSTEM_PROMPT_UI,
      systemPromptPs: DEFAULT_SYSTEM_PROMPT_PS,
      // Quick on/off for the whole assistant's UI-mode capability (the only
      // mode that's actually functional today - PS mode's own checkbox
      // stays disabled/unwired). Defaults on so nothing changes for anyone
      // who doesn't touch it.
      uiModeEnabled: true,
      // RS "AI Properties" tab - shows/hides the live estimated-token
      // counter overlaid on the prompt textarea (navigation-runtime.js).
      // Not per-provider (unlike maxOutputTokens/maxRounds above): it's a
      // display preference, not a cost ceiling, so there's no reason for
      // it to differ by provider.
      tokenCounterEnabled: true,
    };
  }

  function cloneAiProviderState(input, fallback) {
    var src = input && typeof input === "object" ? input : {};
    return {
      model: typeof src.model === "string" && src.model ? src.model : fallback.model,
      keyStorage: src.keyStorage === "ram" ? "ram" : "localstorage",
      maxOutputTokens: typeof src.maxOutputTokens === "number" && src.maxOutputTokens > 0 ? src.maxOutputTokens : fallback.maxOutputTokens,
      maxRounds: typeof src.maxRounds === "number" && src.maxRounds > 0 ? src.maxRounds : fallback.maxRounds,
    };
  }

  function cloneAiConfigState(state) {
    var fallback = makeDefaultAiConfigState();
    var input = state && typeof state === "object" ? state : {};
    return {
      provider: input.provider === "google" ? "google" : "claude",
      claude: cloneAiProviderState(input.claude, fallback.claude),
      google: cloneAiProviderState(input.google, fallback.google),
      systemPromptUi: typeof input.systemPromptUi === "string" ? input.systemPromptUi : fallback.systemPromptUi,
      systemPromptPs: typeof input.systemPromptPs === "string" ? input.systemPromptPs : fallback.systemPromptPs,
      uiModeEnabled: typeof input.uiModeEnabled === "boolean" ? input.uiModeEnabled : fallback.uiModeEnabled,
      tokenCounterEnabled: typeof input.tokenCounterEnabled === "boolean" ? input.tokenCounterEnabled : fallback.tokenCounterEnabled,
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
  // Output-token ceiling for a single API response - was Claude-only until
  // this was audited for runaway-cost risk; Gemini had no cap at all,
  // meaning a Gemini-configured user's response length (and therefore
  // cost) was unbounded. Per-provider value now, editable via RS's "AI
  // Properties" tab (see maxOutputTokens in makeDefaultAiConfigState above).

  function sendAiChatMessageClaude(model, apiKey, messages, system, maxTokens) {
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
        max_tokens: maxTokens,
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

  function sendAiChatMessageGoogle(model, apiKey, messages, system, maxTokens) {
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey);
    var body = {
      contents: messages.map(function (m) {
        return { role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] };
      }),
      generationConfig: { maxOutputTokens: maxTokens },
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
    var maxTokens = (currentAiConfigState[p] || {}).maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS;
    return p === "google"
      ? sendAiChatMessageGoogle(model, apiKey, messages, system, maxTokens)
      : sendAiChatMessageClaude(model, apiKey, messages, system, maxTokens);
  }

  // Tool-calling variants: same endpoints/headers/model-id mapping as above,
  // but (a) accept an optional `tools` array in the provider's own wire
  // format (built by ai-tools-provider-claude.js/ai-tools-provider-
  // gemini.js, not this file - this file only knows how to talk HTTP to
  // each provider, not how to describe NetRecon's own tool catalog) and
  // (b) return the raw parsed response body instead of extracted text, so
  // the caller (ai-tools-engine-runtime.js) can inspect it for tool_use/
  // functionCall blocks. The plain sendAiChatMessage above is untouched and
  // still used as-is by the parts of the app that don't go through the
  // engine.
  function sendAiChatMessageClaudeRaw(model, apiKey, messages, system, tools, signal, maxTokens) {
    var body = {
      model: model,
      max_tokens: maxTokens,
      system: system || undefined,
      messages: messages,
    };
    if (tools && tools.length) body.tools = tools;

    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
      signal: signal,
    }).then(function (resp) {
      return resp.text().then(function (text) {
        if (!resp.ok) throw new Error("Anthropic API error (" + resp.status + "): " + text);
        var data = JSON.parse(text);
        if (data.error) throw new Error("Anthropic API error: " + JSON.stringify(data.error));
        return data;
      });
    });
  }

  function sendAiChatMessageGoogleRaw(model, apiKey, messages, system, tools, signal, maxTokens) {
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey);
    var body = { contents: messages, generationConfig: { maxOutputTokens: maxTokens } };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (tools && tools.length) body.tools = tools;

    return fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: signal,
    }).then(function (resp) {
      return resp.text().then(function (text) {
        if (!resp.ok) throw new Error("Google API error (" + resp.status + "): " + text);
        var data = JSON.parse(text);
        if (data.error) throw new Error("Google API error: " + JSON.stringify(data.error));
        return data;
      });
    });
  }

  function sendChatMessageRaw(provider, modelKey, apiKey, messages, system, tools, signal) {
    var p = normalizeProvider(provider);
    var model = getAiApiModelId(p, modelKey);
    if (!apiKey) return Promise.reject(new Error("missing_api_key"));
    var maxTokens = (currentAiConfigState[p] || {}).maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS;
    return p === "google"
      ? sendAiChatMessageGoogleRaw(model, apiKey, messages, system, tools, signal, maxTokens)
      : sendAiChatMessageClaudeRaw(model, apiKey, messages, system, tools, signal, maxTokens);
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
    sendChatMessageRaw: sendChatMessageRaw,
    normalizeProvider: normalizeProvider,
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

  // RS "AI Properties" tab (index.html's static v1-right-pane) shows the
  // two per-provider numbers above for whichever provider is CURRENTLY
  // active - same "single static element, bind once" reasoning as the mode
  // badge above, and the same event covers both (provider switch changes
  // both what the badge says and which provider's numbers this shows).
  // Guarded against clobbering an in-progress edit: RS stays visible
  // alongside whatever's open in CS/LS, so a config change from elsewhere
  // (e.g. switching provider in General Settings) can fire while the user
  // has one of these two inputs focused.
  function updateAiPropertiesFields() {
    var state = getAiConfigState();
    var providerState = state[state.provider] || {};
    var meta = AI_DISPLAY_NAMES[state.provider] || AI_DISPLAY_NAMES.claude;

    var activeLabel = document.getElementById("v1AiPropertiesActiveLabel");
    if (activeLabel) activeLabel.textContent = meta.name;

    var tokensInput = document.getElementById("v1AiPropMaxTokens");
    if (tokensInput && document.activeElement !== tokensInput) tokensInput.value = providerState.maxOutputTokens;

    var roundsInput = document.getElementById("v1AiPropMaxRounds");
    if (roundsInput && document.activeElement !== roundsInput) roundsInput.value = providerState.maxRounds;

    // Not per-provider (unlike the two above) - a plain top-level flag, so
    // no active-element guard needed (a checkbox has no "in-progress edit"
    // state to clobber the way a number input being typed into does).
    var counterCheckbox = document.getElementById("v1AiPropTokenCounter");
    if (counterCheckbox) counterCheckbox.checked = state.tokenCounterEnabled;
  }

  function wireAiPropertiesFields() {
    var tokensInput = document.getElementById("v1AiPropMaxTokens");
    var roundsInput = document.getElementById("v1AiPropMaxRounds");
    var counterCheckbox = document.getElementById("v1AiPropTokenCounter");

    function commit(field, input) {
      var next = getAiConfigState();
      next[next.provider][field] = Number(input.value) || next[next.provider][field];
      replaceAiConfigState(next);
    }

    if (tokensInput) tokensInput.addEventListener("change", function () { commit("maxOutputTokens", tokensInput); });
    if (roundsInput) roundsInput.addEventListener("change", function () { commit("maxRounds", roundsInput); });
    if (counterCheckbox) {
      counterCheckbox.addEventListener("change", function () {
        var next = getAiConfigState();
        next.tokenCounterEnabled = counterCheckbox.checked;
        replaceAiConfigState(next);
      });
    }
  }

  updateAiModeBadge();
  updateAiPropertiesFields();
  wireAiPropertiesFields();
  document.addEventListener("newui:ai-assistant-config-changed", updateAiModeBadge);
  document.addEventListener("newui:ai-assistant-config-changed", updateAiPropertiesFields);

  // Google Dork API config (General tab, below AI Assistant) - the
  // Google Custom Search JSON API key + Search Engine ID (CX) that a
  // future "extract results" feature on Google Dork Finder will read.
  // Deliberately just persisted key/value pairs (no RAM-vs-localStorage
  // choice like the AI Assistant keys above) - a Custom Search key is
  // lower-stakes than a chat-provider key, same simple persistence as
  // Email Recon's own HIBP key field.
  var GOOGLE_DORK_API_KEY_STORAGE = "netrecon_google_dork_api_key";
  var GOOGLE_DORK_API_CX_STORAGE = "netrecon_google_dork_api_cx";

  function getGoogleDorkApiKey() {
    try {
      return (window.localStorage && window.localStorage.getItem(GOOGLE_DORK_API_KEY_STORAGE)) || "";
    } catch (_) {
      return "";
    }
  }

  function setGoogleDorkApiKey(value) {
    try {
      if (window.localStorage) window.localStorage.setItem(GOOGLE_DORK_API_KEY_STORAGE, String(value || ""));
    } catch (_) {
      // ignore persistence failures
    }
  }

  function getGoogleDorkApiCx() {
    try {
      return (window.localStorage && window.localStorage.getItem(GOOGLE_DORK_API_CX_STORAGE)) || "";
    } catch (_) {
      return "";
    }
  }

  function setGoogleDorkApiCx(value) {
    try {
      if (window.localStorage) window.localStorage.setItem(GOOGLE_DORK_API_CX_STORAGE, String(value || ""));
    } catch (_) {
      // ignore persistence failures
    }
  }

  window.NetReconNewUICore.googleDorkApiConfig = {
    getApiKey: getGoogleDorkApiKey,
    setApiKey: setGoogleDorkApiKey,
    getCx: getGoogleDorkApiCx,
    setCx: setGoogleDorkApiCx,
  };

  // Firebase config (General tab, below Google Dork API) - the project
  // config object Firebase's console shows when you register a Web App
  // (apiKey/authDomain/projectId). Komunikator's Phase 1 (Google Sign-In)
  // only needs these 3 fields; storageBucket/messagingSenderId/appId would
  // be added alongside Firestore in Phase 2 if needed. Same simple
  // localStorage persistence as googleDorkApiConfig above - not a secret
  // on the level of an AI provider key (Firebase web config is meant to be
  // public/client-embeddable by design; real access control lives in
  // Firestore security rules, not in hiding this object).
  var FIREBASE_CONFIG_STORAGE = "netrecon_firebase_config_v1";
  // oauthClientId is a DIFFERENT value from apiKey - it's the "Web client
  // ID" Firebase Console shows under Authentication -> Sign-in method ->
  // Google -> Web SDK configuration (a *.apps.googleusercontent.com id),
  // needed to build the loopback OAuth authorization URL. apiKey identifies
  // the Firebase *project*; oauthClientId identifies the Google OAuth
  // client used to actually run the sign-in flow.
  // oauthClientId should be a genuine "Desktop app"-type OAuth client
  // (create one in Google Cloud Console -> Credentials -> Create
  // Credentials -> OAuth client ID -> Desktop app), which gets loopback-
  // flexible redirect_uri matching that a "Web application"-type client
  // (e.g. Firebase's own auto-created one) doesn't. clientSecret is still
  // required even for this type, though - confirmed live: Google's OAuth
  // implementation requires client_secret in the token exchange for
  // EVERY client type, including "Desktop app" (a documented deviation
  // from the pure PKCE spec, where a public client wouldn't need one) -
  // the secret just isn't treated as fully confidential for this type,
  // unlike a real server-side "Web application" client's secret.
  var FIREBASE_CONFIG_FIELDS = ["apiKey", "authDomain", "projectId", "oauthClientId", "clientSecret"];

  function loadFirebaseConfig() {
    try {
      var raw = window.localStorage ? window.localStorage.getItem(FIREBASE_CONFIG_STORAGE) : "";
      var parsed = raw ? JSON.parse(raw) : {};
      var out = {};
      FIREBASE_CONFIG_FIELDS.forEach(function (key) {
        out[key] = typeof parsed[key] === "string" ? parsed[key] : "";
      });
      return out;
    } catch (_) {
      var empty = {};
      FIREBASE_CONFIG_FIELDS.forEach(function (key) { empty[key] = ""; });
      return empty;
    }
  }

  function saveFirebaseConfigField(key, value) {
    if (FIREBASE_CONFIG_FIELDS.indexOf(key) === -1) return;
    var current = loadFirebaseConfig();
    current[key] = String(value == null ? "" : value);
    try {
      if (window.localStorage) window.localStorage.setItem(FIREBASE_CONFIG_STORAGE, JSON.stringify(current));
    } catch (_) {
      // ignore persistence failures
    }
  }

  window.NetReconNewUICore.firebaseConfig = {
    getConfig: loadFirebaseConfig,
    setField: saveFirebaseConfigField,
  };
})();
