(function () {
  // Browser tool "inspect network traffic" mode - see src-tauri/src/main.rs's
  // browser-proxy comment block for the full mechanism (a local Rust proxy
  // fetches the target page itself, injects a JS shim, serves that instead
  // of the real page so the iframe becomes same-origin with us). This
  // module owns the JS-side state: whether inspection is currently on, the
  // live hit log, and the Tauri event subscription that feeds it.
  //
  // Desktop-only - platform.invoke("start_browser_proxy", ...) has nothing
  // to call on www, same as every other Rust-backed tool this session
  // (HTTPS Auditor, Mail XSS Tester).

  function createBrowserNetworkRuntime() {
    var active = false;
    var hits = [];
    var unlisten = null;

    function emitChanged() {
      try {
        document.dispatchEvent(new CustomEvent("newui:browser-network-changed", {}));
      } catch (_) {
        // ignore event dispatch failures
      }
    }

    function getActive() { return active; }
    function getHits() { return hits; }

    function ensureListener() {
      if (unlisten) return;
      var platform = window.NetReconNewUICore && window.NetReconNewUICore.platform;
      if (!platform || typeof platform.listen !== "function") return;
      Promise.resolve(platform.listen("browser-network-hit", function (hit) {
        hits.push(hit);
        emitChanged();
      })).then(function (fn) {
        unlisten = fn;
      });
    }

    // Returns the local proxy URL to load in the iframe instead of the
    // real target - resolves to null (and leaves `active` false) if the
    // backend call fails or isn't available (www build).
    function start(targetUrl) {
      var platform = window.NetReconNewUICore && window.NetReconNewUICore.platform;
      if (!platform || !platform.isDesktop || !platform.isDesktop()) return Promise.resolve(null);

      hits = [];
      ensureListener();
      return Promise.resolve(platform.invoke("start_browser_proxy", { targetUrl: targetUrl })).then(function (localUrl) {
        active = true;
        emitChanged();
        return localUrl;
      }).catch(function () {
        active = false;
        emitChanged();
        return null;
      });
    }

    function stop() {
      var platform = window.NetReconNewUICore && window.NetReconNewUICore.platform;
      active = false;
      hits = [];
      emitChanged();
      if (platform && typeof platform.invoke === "function") {
        Promise.resolve(platform.invoke("stop_browser_proxy", {})).catch(function () {});
      }
    }

    return {
      getActive: getActive,
      getHits: getHits,
      start: start,
      stop: stop,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.browserNetwork = createBrowserNetworkRuntime();
})();
