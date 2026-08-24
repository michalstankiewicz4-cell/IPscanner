(function () {
  // HTTPS Auditor: checks a target URL for MITM-relevant weaknesses -
  // missing HSTS (and whether it's on the browser preload list, which
  // protects even a user's very first visit), missing security headers,
  // whether the plain-HTTP origin actually upgrades to HTTPS, mixed
  // content on the response body, and certificate validity. Desktop-only -
  // the real HTTP request (src-tauri/src/main.rs's https_audit command)
  // runs from Rust so it can read response headers for ANY target domain,
  // which a browser's own fetch() can't do cross-origin. On www this just
  // has nothing to call.
  //
  // Every completed audit is kept as a timestamped history entry, shown as
  // an LS list (community-catalog/agent-profiles' master-detail shape) -
  // localStorage persists it across a plain app restart, and it also
  // round-trips through session save/load like every other tool's state
  // (see session-runtime.js's collectSessionData()/applyLoadedSessionData(),
  // and the Rust/sql.js https_audit_history table both keep in sync with
  // this module's wire shape).
  var HISTORY_KEY = "netrecon_https_audit_history_v1";
  var HISTORY_LIMIT = 200; // keep this bounded - an unattended "audit everything" habit shouldn't grow the session file forever

  function randomId() {
    return (window.crypto && typeof window.crypto.randomUUID === "function")
      ? window.crypto.randomUUID()
      : (Date.now().toString(36) + Math.random().toString(36).slice(2));
  }

  function loadHistoryFromStorage() {
    try {
      var raw = window.localStorage ? window.localStorage.getItem(HISTORY_KEY) : null;
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveHistoryToStorage(history) {
    try {
      if (window.localStorage) window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (_) {
      // ignore quota/serialization failures - history is a convenience log, nothing else depends on it
    }
  }

  function createHttpsAuditorRuntime() {
    var lastUrl = "";
    var loading = false;
    var error = "";
    var result = null; // the just-completed/in-progress run, distinct from a selected past entry
    var history = loadHistoryFromStorage(); // [{id, auditedAt, requestedUrl, finalUrl, grade, result}], newest first
    var selectedId = ""; // "" means "showing the current/new run", not a history entry

    function emitChanged() {
      try {
        document.dispatchEvent(new CustomEvent("newui:https-auditor-changed", {
          detail: { loading: loading, error: error, result: result }
        }));
      } catch (_) {
        // ignore event dispatch failures
      }
    }

    function getLastUrl() { return lastUrl; }
    function getLoading() { return loading; }
    function getError() { return error; }
    function getResult() { return result; }
    function getHistory() { return history.slice(); }
    function getSelectedId() { return selectedId; }

    function getSelectedEntry() {
      if (!selectedId) return null;
      for (var i = 0; i < history.length; i++) {
        if (history[i].id === selectedId) return history[i];
      }
      return null;
    }

    function selectHistoryEntry(id) {
      selectedId = String(id || "");
      emitChanged();
    }

    // Grade computed the same way the renderer does (panel-content-
    // runtime.js's computeHttpsAuditorGrade) - duplicated here in letter-
    // only form since the list row just needs the badge text, not the
    // full pass/total breakdown, and pulling that function in as a cross-
    // file dependency isn't worth it for one letter.
    function gradeLetterFor(r) {
      var checks = [!!r.hsts, r.hstsPreloaded, !!r.csp, !!r.xFrameOptions, !!r.xContentTypeOptions, !!r.referrerPolicy, r.httpUpgradesToHttps, r.mixedContentCount === 0];
      if (r.cert) checks.push(!r.cert.expired);
      var pct = checks.filter(Boolean).length / checks.length;
      return pct >= 0.9 ? "A" : pct >= 0.75 ? "B" : pct >= 0.6 ? "C" : pct >= 0.4 ? "D" : "F";
    }

    function addHistoryEntry(r) {
      var entry = {
        id: randomId(),
        auditedAt: new Date().toISOString(),
        requestedUrl: r.requestedUrl || "",
        finalUrl: r.finalUrl || "",
        grade: gradeLetterFor(r),
        result: r,
      };
      history.unshift(entry);
      if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
      saveHistoryToStorage(history);
      selectedId = entry.id;
      return entry;
    }

    function deleteHistoryEntry(id) {
      history = history.filter(function (e) { return e.id !== id; });
      saveHistoryToStorage(history);
      if (selectedId === id) selectedId = history.length ? history[0].id : "";
      emitChanged();
    }

    function clearHistory() {
      history = [];
      saveHistoryToStorage(history);
      selectedId = "";
      emitChanged();
    }

    function runAudit(url) {
      var platform = window.NetReconNewUICore && window.NetReconNewUICore.platform;
      var trimmed = String(url || "").trim();
      if (!trimmed) return;
      if (!platform || !platform.isDesktop || !platform.isDesktop()) return;

      lastUrl = trimmed;
      loading = true;
      error = "";
      selectedId = ""; // "current run" takes over the detail view until it lands in history below
      emitChanged();

      Promise.resolve(platform.invoke("https_audit", { url: trimmed })).then(function (r) {
        result = r;
        loading = false;
        addHistoryEntry(r);
        emitChanged();
      }).catch(function (err) {
        result = null;
        loading = false;
        error = (err && err.message) ? err.message : String(err);
        emitChanged();
      });
    }

    // Wire shape for session save (main.rs's HttpsAuditHistoryRow / session-
    // sqlite-runtime.js's https_audit_history table) - resultJson as a
    // string, not the parsed object getHistory() returns for the UI.
    function getHistoryForSession() {
      return history.map(function (e) {
        return {
          id: e.id,
          auditedAt: e.auditedAt,
          requestedUrl: e.requestedUrl,
          finalUrl: e.finalUrl,
          grade: e.grade,
          resultJson: JSON.stringify(e.result),
        };
      });
    }

    // Called by session-runtime.js's applyLoadedSessionData() (desktop
    // path only - www's session load reloads the page after session-
    // sqlite-runtime.js writes the SAME localStorage key this module reads
    // at its own init, so no explicit call is needed there).
    function restoreHistoryFromSession(rawEntries) {
      history = (Array.isArray(rawEntries) ? rawEntries : []).map(function (e) {
        e = e || {};
        var parsed = null;
        try { parsed = JSON.parse(e.resultJson || "null"); } catch (_) { parsed = null; }
        return {
          id: String(e.id || randomId()),
          auditedAt: String(e.auditedAt || ""),
          requestedUrl: String(e.requestedUrl || ""),
          finalUrl: String(e.finalUrl || ""),
          grade: String(e.grade || ""),
          result: parsed,
        };
      }).filter(function (e) { return e.result; });
      saveHistoryToStorage(history);
    }

    return {
      getLastUrl: getLastUrl,
      getLoading: getLoading,
      getError: getError,
      getResult: getResult,
      runAudit: runAudit,
      getHistory: getHistory,
      getHistoryForSession: getHistoryForSession,
      restoreHistoryFromSession: restoreHistoryFromSession,
      getSelectedId: getSelectedId,
      getSelectedEntry: getSelectedEntry,
      selectHistoryEntry: selectHistoryEntry,
      deleteHistoryEntry: deleteHistoryEntry,
      clearHistory: clearHistory,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.httpsAuditor = createHttpsAuditorRuntime();
})();
