(function () {
  // HTTPS Auditor: checks a target URL for MITM-relevant weaknesses -
  // missing HSTS (and whether it's on the browser preload list, which
  // protects even a user's very first visit), missing security headers,
  // whether the plain-HTTP origin actually upgrades to HTTPS, and mixed
  // content on the response body. Desktop-only - the real HTTP request
  // (src-tauri/src/main.rs's https_audit command) runs from Rust so it can
  // read response headers for ANY target domain, which a browser's own
  // fetch() can't do cross-origin (CORS blocks reading headers unless the
  // target explicitly opts in). On www this just has nothing to call.

  function createHttpsAuditorRuntime() {
    var lastUrl = "";
    var loading = false;
    var error = "";
    var result = null;

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

    function runAudit(url) {
      var platform = window.NetReconNewUICore && window.NetReconNewUICore.platform;
      var trimmed = String(url || "").trim();
      if (!trimmed) return;
      if (!platform || !platform.isDesktop || !platform.isDesktop()) return;

      lastUrl = trimmed;
      loading = true;
      error = "";
      emitChanged();

      Promise.resolve(platform.invoke("https_audit", { url: trimmed })).then(function (r) {
        result = r;
        loading = false;
        emitChanged();
      }).catch(function (err) {
        result = null;
        loading = false;
        error = (err && err.message) ? err.message : String(err);
        emitChanged();
      });
    }

    return {
      getLastUrl: getLastUrl,
      getLoading: getLoading,
      getError: getError,
      getResult: getResult,
      runAudit: runAudit,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.httpsAuditor = createHttpsAuditorRuntime();
})();
