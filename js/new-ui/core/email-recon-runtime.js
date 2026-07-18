(function () {
  // ip-scanner tool: Email Recon. Deliberately its own file rather than
  // bolted onto scanner-sidebar-runtime.js - that file's history/profiles/
  // config-autosave code is IP-Scanner-shaped (its CONFIG_FIELD_IDS list is
  // literally the Protocol/Performance/Detect/Security field ids); reusing
  // it here would repeat the concern-mixing already flagged as debt in
  // docs/ROADMAP.md backlog item 24.

  var CONFIG_STORAGE_KEY = "netrecon_email_recon_config_v1";
  var HISTORY_KEY = "netrecon_email_recon_history";
  var PROFILES_KEY = "netrecon_email_recon_profiles_v1";
  var ACTIVE_PROFILE_KEY = "netrecon_email_recon_active_profile_v1";

  function isValidEmail(value) {
    var sharedNet = window.NetReconNewUICore && window.NetReconNewUICore.utils && window.NetReconNewUICore.utils.net;
    if (sharedNet && typeof sharedNet.isValidEmail === "function") {
      return sharedNet.isValidEmail(value);
    }
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  }

  // ─── Config (Sources + HIBP key) state store ───────────────────────────
  // Same shape/convention as general-settings-runtime.js: a flat, zero-deps
  // singleton so panel-interactions-runtime.js can read it directly via
  // window.NetReconNewUICore.emailReconConfig, exactly like it already does
  // for window.NetReconNewUICore.generalSettings/platform.

  function makeDefaultConfigState() {
    return {
      emailrep: true,
      gravatar: true,
      github: true,
      hibpBreaches: true,
      hibpPastes: true,
      hibpApiKey: "",
    };
  }

  function safeBool(value, fallback) {
    return typeof value === "boolean" ? value : !!fallback;
  }

  function safeString(value, fallback) {
    return typeof value === "string" ? value : (fallback || "");
  }

  function cloneConfigState(state) {
    var fallback = makeDefaultConfigState();
    var input = state && typeof state === "object" ? state : {};
    return {
      emailrep: safeBool(input.emailrep, fallback.emailrep),
      gravatar: safeBool(input.gravatar, fallback.gravatar),
      github: safeBool(input.github, fallback.github),
      hibpBreaches: safeBool(input.hibpBreaches, fallback.hibpBreaches),
      hibpPastes: safeBool(input.hibpPastes, fallback.hibpPastes),
      hibpApiKey: safeString(input.hibpApiKey, fallback.hibpApiKey),
    };
  }

  function loadConfigState() {
    try {
      var raw = window.localStorage ? window.localStorage.getItem(CONFIG_STORAGE_KEY) : "";
      if (!raw) return cloneConfigState(makeDefaultConfigState());
      return cloneConfigState(JSON.parse(raw));
    } catch (_) {
      return cloneConfigState(makeDefaultConfigState());
    }
  }

  function saveConfigState(state) {
    try {
      if (!window.localStorage) return;
      window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // ignore persistence failures
    }
  }

  var currentConfigState = loadConfigState();

  function getConfigState() {
    return cloneConfigState(currentConfigState);
  }

  function emitConfigChanged() {
    try {
      document.dispatchEvent(new CustomEvent("newui:email-recon-config-changed", { detail: getConfigState() }));
    } catch (_) {
      // ignore event dispatch failures
    }
  }

  function replaceConfigState(nextState) {
    currentConfigState = cloneConfigState(nextState);
    saveConfigState(currentConfigState);
    emitConfigChanged();
    return getConfigState();
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.emailReconConfig = {
    STORAGE_KEY: CONFIG_STORAGE_KEY,
    getState: getConfigState,
    getDefaultState: makeDefaultConfigState,
    replaceState: replaceConfigState,
  };

  // ─── LS history + RS Sources/Profiles UI wiring ────────────────────────

  function createEmailReconRuntime(deps) {
    var tr = deps.tr;
    var setStatusLine = deps.setStatusLine;

    function t(key) {
      return typeof tr === "function" ? tr(key) : key;
    }

    var escapeHtml = window.NetReconNewUICore.utils && window.NetReconNewUICore.utils.dom
      ? window.NetReconNewUICore.utils.dom.escapeHtml
      : function (value) { return String(value == null ? "" : value); };

    // ---- Recent Lookups history (same loadX/saveX/renderX/addX/initXUi
    // shape as IP Scanner's Range History, scanner-sidebar-runtime.js) ----

    function loadEmailHistory() {
      try {
        var raw = localStorage.getItem(HISTORY_KEY);
        var parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(function (item) {
          return item && isValidEmail(item.email);
        });
      } catch (err) {
        console.error("[email-recon-history] load failed:", err);
        return [];
      }
    }

    function saveEmailHistory(items) {
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify((items || []).slice(0, 24)));
      } catch (err) {
        console.error("[email-recon-history] save failed:", err);
        if (typeof setStatusLine === "function") {
          setStatusLine(t("statusEmailReconHistorySaveFailed") + " (" + (err && err.message ? err.message : err) + ")");
        }
      }
    }

    function renderEmailHistory() {
      var root = document.getElementById("v1EmailReconHistory");
      if (!root) return;
      var items = loadEmailHistory();
      if (!items.length) {
        root.innerHTML = '<div class="v1-range-history-empty">' + escapeHtml(t("emailReconHistoryEmpty")) + "</div>";
        return;
      }

      root.innerHTML = items.map(function (item, idx) {
        var text = escapeHtml(item.email);
        return '<div class="v1-range-history-item">'
          + '<span class="v1-range-history-text" title="' + text + '">' + text + "</span>"
          + '<span class="v1-range-history-actions">'
          + '<button type="button" class="v1-range-history-btn" data-history-action="use" data-history-index="' + idx + '" title="' + escapeHtml(t("emailReconHistoryUseAria")) + '" aria-label="' + escapeHtml(t("emailReconHistoryUseAria")) + '">&gt;</button>'
          + '<button type="button" class="v1-range-history-btn" data-history-action="delete" data-history-index="' + idx + '" title="' + escapeHtml(t("emailReconHistoryDeleteAria")) + '" aria-label="' + escapeHtml(t("emailReconHistoryDeleteAria")) + '">x</button>'
          + "</span>"
          + "</div>";
      }).join("");
    }

    function addEmailHistory(email) {
      if (!isValidEmail(email)) return;
      var normalized = String(email).trim();
      var items = loadEmailHistory().filter(function (item) {
        return item.email.toLowerCase() !== normalized.toLowerCase();
      });
      items.unshift({ email: normalized, updatedAt: Date.now() });
      saveEmailHistory(items);
      renderEmailHistory();
    }

    function initEmailHistoryUi() {
      var root = document.getElementById("v1EmailReconHistory");
      if (!root) return;

      root.addEventListener("click", function (event) {
        var btn = event.target.closest("[data-history-action]");
        if (!btn) return;
        var action = btn.getAttribute("data-history-action");
        var idx = Number(btn.getAttribute("data-history-index"));
        var items = loadEmailHistory();
        var item = items[idx];
        if (!item) return;

        if (action === "use") {
          var input = document.getElementById("v1EmailReconInput");
          if (input) {
            input.value = item.email;
            if (typeof setStatusLine === "function") setStatusLine(t("statusEmailReconStart") + " " + item.email);
          }
          return;
        }

        if (action === "delete") {
          items.splice(idx, 1);
          saveEmailHistory(items);
          renderEmailHistory();
          if (typeof setStatusLine === "function") setStatusLine(t("statusEmailReconHistoryDeleted"));
        }
      });

      renderEmailHistory();
    }

    // ---- RS "Sources"/"API Keys" group: DOM <-> emailReconConfig sync ----

    var SOURCE_FIELD_MAP = {
      v1EmailReconSrcEmailrep: "emailrep",
      v1EmailReconSrcGravatar: "gravatar",
      v1EmailReconSrcGithub: "github",
      v1EmailReconSrcHibpBreaches: "hibpBreaches",
      v1EmailReconSrcHibpPastes: "hibpPastes",
    };

    function applyConfigStateToDom(state) {
      Object.keys(SOURCE_FIELD_MAP).forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.checked = !!state[SOURCE_FIELD_MAP[id]];
      });
      var keyInput = document.getElementById("v1EmailReconHibpKey");
      if (keyInput && document.activeElement !== keyInput) keyInput.value = state.hibpApiKey || "";
    }

    var sourcesUiBound = false;
    function initSourcesUi() {
      applyConfigStateToDom(getConfigState());
      if (sourcesUiBound) return;
      sourcesUiBound = true;

      document.addEventListener("change", function (event) {
        var target = event.target;
        if (!target || !target.id) return;
        if (Object.prototype.hasOwnProperty.call(SOURCE_FIELD_MAP, target.id)) {
          var next = getConfigState();
          next[SOURCE_FIELD_MAP[target.id]] = !!target.checked;
          replaceConfigState(next);
          return;
        }
        if (target.id === "v1EmailReconHibpKey") {
          var nextKey = getConfigState();
          nextKey.hibpApiKey = String(target.value || "").trim();
          replaceConfigState(nextKey);
        }
      });
    }

    // ---- RS "Profiles" group: name + which sources are enabled, no color
    // (reuses only the generic name+settings core of the scanner's Profiles
    // feature, scanner-sidebar-runtime.js ~lines 269-311/398-437 -
    // deliberately skips its color-swatch/floating-dropdown machinery,
    // not needed here). ----

    function loadEmailProfiles() {
      try {
        var raw = localStorage.getItem(PROFILES_KEY);
        var parsed = raw ? JSON.parse(raw) : null;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(function (item) {
          return item && typeof item.name === "string" && item.settings && typeof item.settings === "object";
        });
      } catch (err) {
        console.error("[email-recon-profiles] load failed:", err);
        return [];
      }
    }

    function saveEmailProfiles(items) {
      try {
        localStorage.setItem(PROFILES_KEY, JSON.stringify((items || []).slice(0, 48)));
      } catch (err) {
        console.error("[email-recon-profiles] save failed:", err);
      }
    }

    function getActiveEmailProfileId() {
      try {
        return localStorage.getItem(ACTIVE_PROFILE_KEY) || "";
      } catch (err) {
        return "";
      }
    }

    function setActiveEmailProfileId(id) {
      try {
        localStorage.setItem(ACTIVE_PROFILE_KEY, String(id || ""));
      } catch (err) {
        // ignore persistence failures
      }
    }

    function captureSourcesSnapshot() {
      var state = getConfigState();
      return {
        emailrep: state.emailrep,
        gravatar: state.gravatar,
        github: state.github,
        hibpBreaches: state.hibpBreaches,
        hibpPastes: state.hibpPastes,
      };
    }

    function renderEmailProfiles() {
      var root = document.getElementById("v1EmailReconProfilesList");
      if (!root) return;
      var items = loadEmailProfiles();
      var activeId = getActiveEmailProfileId();

      if (!items.length) {
        root.innerHTML = '<div class="v1-range-history-empty">' + escapeHtml(t("emailReconProfilesEmpty")) + "</div>";
        return;
      }

      root.innerHTML = items.map(function (item, idx) {
        var name = escapeHtml(item.name);
        var activeClass = item.id === activeId ? " is-active" : "";
        return '<div class="v1-profile-item' + activeClass + '" data-profile-index="' + idx + '">'
          + '<span class="v1-profile-name" title="' + name + '">' + name + "</span>"
          + '<button type="button" class="v1-profile-delete-btn" data-profile-index="' + idx + '" title="' + escapeHtml(t("emailReconProfileDeleteAria")) + '" aria-label="' + escapeHtml(t("emailReconProfileDeleteAria")) + '">x</button>'
          + "</div>";
      }).join("");
    }

    function addEmailProfile(name) {
      var trimmedName = String(name || "").trim();
      if (!trimmedName) {
        if (typeof setStatusLine === "function") setStatusLine(t("emailReconProfileNameRequired"));
        return false;
      }
      var items = loadEmailProfiles();
      items.push({
        id: "ep" + Date.now().toString(36) + Math.floor(Math.random() * 1000),
        name: trimmedName,
        settings: captureSourcesSnapshot(),
      });
      saveEmailProfiles(items);
      renderEmailProfiles();
      if (typeof setStatusLine === "function") setStatusLine(t("statusProfileEmailReconAdded") + " " + trimmedName);
      return true;
    }

    function selectEmailProfile(id) {
      var items = loadEmailProfiles();
      var item = items.find(function (entry) { return entry.id === id; });
      if (!item) return;

      var next = getConfigState();
      Object.keys(item.settings || {}).forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(next, key)) next[key] = !!item.settings[key];
      });
      replaceConfigState(next);
      applyConfigStateToDom(next);
      setActiveEmailProfileId(item.id);
      renderEmailProfiles();
      if (typeof setStatusLine === "function") setStatusLine(t("statusProfileEmailReconLoaded") + " " + item.name);
    }

    function initEmailProfilesUi() {
      var listRoot = document.getElementById("v1EmailReconProfilesList");
      var addBtn = document.getElementById("v1EmailReconProfileAddBtn");
      var nameInput = document.getElementById("v1EmailReconProfileNameInput");
      if (!listRoot || !addBtn || !nameInput) return;

      addBtn.addEventListener("click", function () {
        if (addEmailProfile(nameInput.value)) {
          nameInput.value = "";
          nameInput.focus();
        }
      });

      nameInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          addBtn.click();
        }
      });

      listRoot.addEventListener("click", function (event) {
        var deleteBtn = event.target.closest(".v1-profile-delete-btn");
        if (deleteBtn) {
          var deleteIdx = Number(deleteBtn.getAttribute("data-profile-index"));
          var items = loadEmailProfiles();
          var item = items[deleteIdx];
          if (!item) return;
          items.splice(deleteIdx, 1);
          saveEmailProfiles(items);
          renderEmailProfiles();
          if (typeof setStatusLine === "function") setStatusLine(t("statusProfileDeleted"));
          return;
        }

        var row = event.target.closest(".v1-profile-item");
        if (!row) return;
        var idx = Number(row.getAttribute("data-profile-index"));
        var loadItems = loadEmailProfiles();
        var loadItem = loadItems[idx];
        if (!loadItem) return;
        selectEmailProfile(loadItem.id);
      });

      renderEmailProfiles();
    }

    // ---- i18n ----

    function applyStaticTranslations() {
      var inputTitle = document.getElementById("v1EmailReconInputTitle");
      var emailInput = document.getElementById("v1EmailReconInput");
      var historyTitle = document.getElementById("v1EmailReconHistoryTitle");
      var profilesTitle = document.getElementById("v1EmailReconProfilesTitle");
      var profileNameInput = document.getElementById("v1EmailReconProfileNameInput");
      var profileAddBtn = document.getElementById("v1EmailReconProfileAddBtn");
      var sourcesTitle = document.getElementById("v1EmailReconSourcesTitle");
      var apiKeysTitle = document.getElementById("v1EmailReconApiKeysTitle");
      var hibpKeyLabel = document.getElementById("v1EmailReconHibpKeyLabel");
      var hibpKeyInput = document.getElementById("v1EmailReconHibpKey");
      var srcEmailrepLabel = document.getElementById("v1EmailReconSrcEmailrepLabel");
      var srcGravatarLabel = document.getElementById("v1EmailReconSrcGravatarLabel");
      var srcGithubLabel = document.getElementById("v1EmailReconSrcGithubLabel");
      var srcHibpBreachesLabel = document.getElementById("v1EmailReconSrcHibpBreachesLabel");
      var srcHibpPastesLabel = document.getElementById("v1EmailReconSrcHibpPastesLabel");
      var srcEmailrepHelp = document.getElementById("v1EmailReconSrcEmailrepHelp");
      var srcGravatarHelp = document.getElementById("v1EmailReconSrcGravatarHelp");
      var srcGithubHelp = document.getElementById("v1EmailReconSrcGithubHelp");
      var srcHibpBreachesHelp = document.getElementById("v1EmailReconSrcHibpBreachesHelp");
      var srcHibpPastesHelp = document.getElementById("v1EmailReconSrcHibpPastesHelp");

      if (inputTitle) inputTitle.textContent = t("emailReconInputLabel");
      if (emailInput) emailInput.setAttribute("placeholder", t("emailReconInputPlaceholder"));
      if (historyTitle) historyTitle.textContent = t("emailReconHistoryTitle");
      if (profilesTitle) profilesTitle.textContent = t("emailReconProfilesTitle");
      if (profileNameInput) profileNameInput.setAttribute("placeholder", t("emailReconProfileNamePlaceholder"));
      if (profileAddBtn) profileAddBtn.setAttribute("aria-label", t("emailReconProfileAddAria"));
      if (sourcesTitle) sourcesTitle.textContent = t("emailReconSourcesTitle");
      if (apiKeysTitle) apiKeysTitle.textContent = t("emailReconApiKeysTitle");
      if (hibpKeyLabel) hibpKeyLabel.textContent = t("emailReconHibpKeyLabel");
      if (hibpKeyInput) hibpKeyInput.setAttribute("placeholder", t("emailReconHibpKeyPlaceholder"));
      if (srcEmailrepLabel) srcEmailrepLabel.textContent = t("emailReconSrcEmailrep");
      if (srcGravatarLabel) srcGravatarLabel.textContent = t("emailReconSrcGravatar");
      if (srcGithubLabel) srcGithubLabel.textContent = t("emailReconSrcGithub");
      if (srcHibpBreachesLabel) srcHibpBreachesLabel.textContent = t("emailReconSrcHibpBreaches");
      if (srcHibpPastesLabel) srcHibpPastesLabel.textContent = t("emailReconSrcHibpPastes");
      if (srcEmailrepHelp) srcEmailrepHelp.setAttribute("title", t("emailReconSrcEmailrepHelp"));
      if (srcGravatarHelp) srcGravatarHelp.setAttribute("title", t("emailReconSrcGravatarHelp"));
      if (srcGithubHelp) srcGithubHelp.setAttribute("title", t("emailReconSrcGithubHelp"));
      if (srcHibpBreachesHelp) srcHibpBreachesHelp.setAttribute("title", t("emailReconSrcHibpBreachesHelp"));
      if (srcHibpPastesHelp) srcHibpPastesHelp.setAttribute("title", t("emailReconSrcHibpPastesHelp"));

      renderEmailHistory();
      renderEmailProfiles();
    }

    function init() {
      initEmailHistoryUi();
      initSourcesUi();
      initEmailProfilesUi();
    }

    return {
      init: init,
      applyStaticTranslations: applyStaticTranslations,
      addEmailHistory: addEmailHistory,
      isValidEmail: isValidEmail,
    };
  }

  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createEmailReconRuntime = createEmailReconRuntime;
})();
