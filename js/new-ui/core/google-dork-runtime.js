(function () {
  // Google Dork Finder: build an advanced Google search-operator query
  // (site:/filetype:/inurl:/intitle:/intext:, exact phrases, +include/
  // -exclude) and open it in a real browser tab. This app never scrapes/
  // parses Google's own result pages in-app - that violates Google's ToS
  // and gets the requesting IP rate-limited fast - so every "dork tool" in
  // this space works the same way: compose the query, hand it to a real
  // browser, let the user read the results themselves. That also means
  // this tool needs zero new backend code: opening a URL already has a
  // complete helper (platform.openExternalUrl(), see platform-runtime.js)
  // that works identically on desktop and www.

  // Templates never set "target" (site:) - a preset is "what to look
  // for", the target stays whatever the user already typed separately, so
  // picking a new preset never wipes out an in-progress site: search.
  var TEMPLATES = [
    { id: "env-file", category: "secrets", labelKey: "googleDorkTplEnvFile", fields: { filetype: "env", intext: "DB_PASSWORD" } },
    { id: "git-exposed", category: "secrets", labelKey: "googleDorkTplGitExposed", fields: { inurl: ".git", phrase: "index of" } },
    { id: "config-files", category: "secrets", labelKey: "googleDorkTplConfigFiles", fields: { intext: "password", raw: "(filetype:conf OR filetype:cnf OR filetype:ini)" } },
    { id: "backup-files", category: "secrets", labelKey: "googleDorkTplBackupFiles", fields: { raw: "(filetype:bak OR filetype:backup OR filetype:old)" } },
    { id: "log-files", category: "secrets", labelKey: "googleDorkTplLogFiles", fields: { filetype: "log" } },
    { id: "api-keys", category: "secrets", labelKey: "googleDorkTplApiKeys", fields: { filetype: "json", raw: "(\"api_key\" OR \"apikey\" OR \"secret_key\")" } },
    { id: "admin-panel", category: "access", labelKey: "googleDorkTplAdminPanel", fields: { inurl: "admin", intitle: "login" } },
    { id: "login-pages", category: "access", labelKey: "googleDorkTplLoginPages", fields: { inurl: "login" } },
    { id: "directory-listing", category: "data", labelKey: "googleDorkTplDirectoryListing", fields: { intitle: "index of /" } },
    { id: "sql-dump", category: "data", labelKey: "googleDorkTplSqlDump", fields: { intext: "insert into", raw: "(filetype:sql OR filetype:db OR filetype:sqlitedb)" } },
  ];

  var TEMPLATE_CATEGORIES = ["secrets", "access", "data"];

  var FIELD_KEYS = ["target", "phrase", "include", "exclude", "filetype", "inurl", "intitle", "intext", "raw"];

  var HISTORY_KEY = "netrecon_google_dork_history";

  function blankFields() {
    var out = {};
    FIELD_KEYS.forEach(function (k) { out[k] = ""; });
    return out;
  }

  function composeQuery(fields) {
    var parts = [];
    if (fields.target) parts.push("site:" + fields.target);
    if (fields.filetype) parts.push("filetype:" + fields.filetype);
    if (fields.inurl) parts.push("inurl:" + fields.inurl);
    if (fields.intitle) parts.push("intitle:" + fields.intitle);
    if (fields.intext) parts.push("intext:" + fields.intext);
    if (fields.phrase) parts.push("\"" + fields.phrase + "\"");
    (fields.include || "").split(/\s+/).filter(Boolean).forEach(function (w) { parts.push("+" + w); });
    (fields.exclude || "").split(/\s+/).filter(Boolean).forEach(function (w) { parts.push("-" + w); });
    if (fields.raw) parts.push(fields.raw);
    return parts.join(" ").trim();
  }

  function loadHistory() {
    try {
      var raw = window.localStorage ? window.localStorage.getItem(HISTORY_KEY) : "";
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (item) {
        return item && typeof item === "object" && String(item.query || "").trim();
      });
    } catch (_) {
      return [];
    }
  }

  function saveHistory(items) {
    try {
      if (!window.localStorage) return;
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify((items || []).slice(0, 24)));
    } catch (_) {
      // ignore persistence failures - history is a convenience, not critical state
    }
  }

  function createGoogleDorkRuntime() {
    var fields = blankFields();

    function emitChanged() {
      try {
        document.dispatchEvent(new CustomEvent("newui:google-dork-changed", {
          detail: { fields: Object.assign({}, fields), query: composeQuery(fields) }
        }));
      } catch (_) {
        // ignore event dispatch failures
      }
    }

    function getTemplates() { return TEMPLATES.slice(); }
    function getTemplateCategories() { return TEMPLATE_CATEGORIES.slice(); }
    function getFields() { return Object.assign({}, fields); }

    function setField(key, value) {
      if (FIELD_KEYS.indexOf(key) === -1) return;
      fields[key] = String(value == null ? "" : value);
      emitChanged();
    }

    function applyTemplate(templateId) {
      var tpl = TEMPLATES.filter(function (t) { return t.id === templateId; })[0];
      if (!tpl) return;
      FIELD_KEYS.forEach(function (key) {
        if (key === "target") return; // presets never touch the target/site field
        fields[key] = String((tpl.fields && tpl.fields[key]) || "");
      });
      emitChanged();
    }

    function getComposedQuery() { return composeQuery(fields); }

    function getHistory() { return loadHistory(); }

    function addToHistory(query) {
      var q = String(query || "").trim();
      if (!q) return;
      var items = loadHistory().filter(function (item) { return item.query !== q; });
      items.unshift({ query: q, updatedAt: Date.now() });
      saveHistory(items);
      emitChanged();
    }

    function removeFromHistory(index) {
      var items = loadHistory();
      if (index < 0 || index >= items.length) return;
      items.splice(index, 1);
      saveHistory(items);
      emitChanged();
    }

    function useHistoryEntry(index) {
      var items = loadHistory();
      var item = items[index];
      if (!item) return;
      // A restored history entry becomes the raw field verbatim (site:/
      // filetype:/etc. are already baked into item.query) and every other
      // field clears, since the composed string can't be reliably split
      // back into its original per-field parts.
      fields = blankFields();
      fields.raw = item.query;
      emitChanged();
    }

    function openInGoogle() {
      var query = getComposedQuery();
      if (!query) return false;
      var platform = window.NetReconNewUICore && window.NetReconNewUICore.platform;
      if (!platform || typeof platform.openExternalUrl !== "function") return false;
      var opened = platform.openExternalUrl("https://www.google.com/search?q=" + encodeURIComponent(query));
      if (opened) addToHistory(query);
      return opened;
    }

    return {
      getTemplates: getTemplates,
      getTemplateCategories: getTemplateCategories,
      getFields: getFields,
      setField: setField,
      applyTemplate: applyTemplate,
      getComposedQuery: getComposedQuery,
      getHistory: getHistory,
      addToHistory: addToHistory,
      removeFromHistory: removeFromHistory,
      useHistoryEntry: useHistoryEntry,
      openInGoogle: openInGoogle,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.googleDork = createGoogleDorkRuntime();
})();
