(function () {
  // shell: lazy-loaded 3D globe engine (globe.gl, a ThreeJS/WebGL wrapper)
  // for the Globe tool - mirrors session-sqlite-runtime.js's sql.js loader
  // exactly (memoized promise, dynamic <script> injection, never referenced
  // by a <script> tag in index.html itself, so it costs nothing at boot).
  // Vendored from https://unpkg.com/globe.gl@2.46.1/dist/globe.gl.min.js and
  // https://unpkg.com/three-globe@2.45.2/example/img/earth-day.jpg - bump
  // the versions in this comment and js/new-ui/vendor/globe-gl/ together
  // when upgrading. This module only knows how to load/init the engine and
  // build/destroy a globe instance from caller-supplied point data - it has
  // no knowledge of scan results or geo_lookup, same separation of concerns
  // session-sqlite-runtime.js keeps from readScanResults().
  var VENDOR_BASE = "js/new-ui/vendor/globe-gl/";
  var enginePromise = null;

  function injectScript(src) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement("script");
      el.src = src;
      el.onload = function () { resolve(); };
      el.onerror = function () { reject(new Error("failed to load " + src)); };
      document.head.appendChild(el);
    });
  }

  function loadEngine() {
    if (enginePromise) return enginePromise;
    enginePromise = injectScript(VENDOR_BASE + "globe.gl.min.js")
      .then(function () {
        if (typeof window.Globe !== "function") {
          throw new Error("Globe not available after loading globe.gl.min.js");
        }
        return window.Globe;
      })
      .catch(function (err) {
        enginePromise = null;
        throw err;
      });
    return enginePromise;
  }

  function buildGlobe(containerEl, points) {
    return loadEngine().then(function (Globe) {
      return Globe()(containerEl)
        .globeImageUrl(VENDOR_BASE + "earth-day.jpg")
        .pointsData(points)
        .pointLat("lat")
        .pointLng("lng")
        .pointColor("color")
        .pointLabel("label")
        .width(containerEl.clientWidth)
        .height(containerEl.clientHeight);
    });
  }

  // No documented destroy()/dispose() exists for globe.gl as of 2.46.1 -
  // pauseAnimation() is its documented method to stop the internal
  // requestAnimationFrame render loop, called defensively here. The
  // container itself is discarded by the caller (CS tab-switch machinery
  // replaces #v1ToolDetail's whole innerHTML unconditionally on every
  // switch), so this is the best-effort stop for the WebGL render loop
  // specifically - flagged as a known open risk in the plan, not something
  // this function can fully guarantee.
  function destroyGlobe(instance) {
    if (instance && typeof instance.pauseAnimation === "function") {
      try { instance.pauseAnimation(); } catch (_) {
        // ignore - best-effort cleanup only
      }
    }
  }

  function createGlobeRuntime() {
    return {
      loadEngine: loadEngine,
      buildGlobe: buildGlobe,
      destroyGlobe: destroyGlobe,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createGlobeRuntime = createGlobeRuntime;
})();
