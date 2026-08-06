(function () {
  function createPlatformAdapter() {
    var PARITY_QUERY_KEY = "nr_parity";
    var PARITY_STORAGE_KEY = "netrecon_desktop_parity";

    function hasNativeInvoke() {
      return !!(
        (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke)
        || (window.__TAURI__ && window.__TAURI__.invoke)
        || (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke)
      );
    }

    function readParityFromQuery() {
      try {
        var params = new URLSearchParams(window.location.search || "");
        var value = String(params.get(PARITY_QUERY_KEY) || "").trim().toLowerCase();
        return value === "1" || value === "true" || value === "on";
      } catch (_) {
        return false;
      }
    }

    function readParityFromStorage() {
      try {
        if (!window.localStorage) return false;
        var value = String(window.localStorage.getItem(PARITY_STORAGE_KEY) || "").trim().toLowerCase();
        return value === "1" || value === "true" || value === "on";
      } catch (_) {
        return false;
      }
    }

    function isParityMode() {
      // Query flag always wins (manual override for web parity testing).
      if (readParityFromQuery()) return true;

      // In desktop builds, never let stale storage parity disable native invoke.
      if (hasNativeInvoke()) return false;

      return readParityFromStorage();
    }

    function setParityMode(enabled) {
      try {
        if (!window.localStorage) return false;
        window.localStorage.setItem(PARITY_STORAGE_KEY, enabled ? "1" : "0");
        return true;
      } catch (_) {
        return false;
      }
    }

    function getInvoke() {
      if (isParityMode()) return null;
      return hasNativeInvoke()
        ? ((window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke)
            || (window.__TAURI__ && window.__TAURI__.invoke)
            || (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke)
            || null)
        : null;
    }

    function invoke(command, payload) {
      var inv = getInvoke();
      if (!inv) return Promise.reject(new Error("tauri invoke unavailable"));
      return inv(command, payload || {});
    }

    // Mail XSS Tester's beacon-hit events (main.rs's app.emit("mail-xss-
    // beacon-hit", ...)) are the first thing in this codebase needing a
    // backend-push channel instead of a request/response invoke() - same
    // parity-mode/unavailable-on-www guard as invoke() above, resolving to
    // a no-op unlisten function instead of rejecting so a bare .then() call
    // site doesn't need its own try/catch for the www build.
    function listen(eventName, callback) {
      var noopUnlisten = function () {};
      if (isParityMode()) return Promise.resolve(noopUnlisten);
      var evt = window.__TAURI__ && window.__TAURI__.event;
      if (!evt || typeof evt.listen !== "function") return Promise.resolve(noopUnlisten);
      return evt.listen(eventName, function (event) {
        callback(event && event.payload);
      });
    }

    function getWindowApi() {
      var tauri = window.__TAURI__;
      return tauri && (tauri.window || tauri.webviewWindow)
        ? (tauri.window || tauri.webviewWindow)
        : null;
    }

    function getCurrentWindow() {
      if (isParityMode()) return null;
      var winApi = getWindowApi();
      if (!winApi) return null;
      try {
        if (typeof winApi.getCurrentWindow === "function") return winApi.getCurrentWindow();
        if (typeof winApi.getCurrentWebviewWindow === "function") return winApi.getCurrentWebviewWindow();
        return winApi.appWindow || null;
      } catch (_) {
        return null;
      }
    }

    function getDpi() {
      if (isParityMode()) return null;
      return (window.__TAURI__ && window.__TAURI__.dpi) ? window.__TAURI__.dpi : null;
    }

    function isDesktop() {
      if (isParityMode()) return false;
      var ua = (navigator.userAgent || "").toLowerCase();
      return !!(getInvoke() || getCurrentWindow() || ua.indexOf("tauri") !== -1);
    }

    function windowAction(kind) {
      var commandMap = {
        minimize: "window_minimize",
        maximize: "window_toggle_maximize",
        fullscreen: "window_toggle_fullscreen",
        close: "window_close",
      };

      var command = commandMap[kind];
      if (command) {
        return invoke(command).then(function () { return true; }).catch(function () {
          return runWindowActionFallback(kind);
        });
      }

      return Promise.resolve(false);
    }

    function runWindowActionFallback(kind) {
      var currentWindow = getCurrentWindow();
      if (!currentWindow) return Promise.resolve(false);

      try {
        if (kind === "minimize" && typeof currentWindow.minimize === "function") {
          return Promise.resolve(currentWindow.minimize()).then(function () { return true; }).catch(function () { return false; });
        }
        if (kind === "maximize" && typeof currentWindow.toggleMaximize === "function") {
          return Promise.resolve(currentWindow.toggleMaximize()).then(function () { return true; }).catch(function () { return false; });
        }
        if (kind === "close" && typeof currentWindow.close === "function") {
          return Promise.resolve(currentWindow.close()).then(function () { return true; }).catch(function () { return false; });
        }
        if (kind === "fullscreen" && typeof currentWindow.setFullscreen === "function") {
          var getState = typeof currentWindow.isFullscreen === "function"
            ? Promise.resolve(currentWindow.isFullscreen()).catch(function () { return false; })
            : Promise.resolve(false);
          return getState.then(function (isFullscreen) {
            return Promise.resolve(currentWindow.setFullscreen(!isFullscreen)).then(function () { return true; });
          }).catch(function () { return false; });
        }
      } catch (_) {
        return Promise.resolve(false);
      }

      return Promise.resolve(false);
    }

    function openExternalUrl(url) {
      var safeUrl = String(url || "").trim();
      if (!/^https?:\/\//i.test(safeUrl)) return false;

      var inv = isParityMode() ? null : getInvoke();
      if (inv) {
        inv("open_browser", { url: safeUrl }).catch(function () {
          try { window.open(safeUrl, "_blank", "noopener"); } catch (_) {}
        });
        return true;
      }

      try {
        window.open(safeUrl, "_blank", "noopener");
        return true;
      } catch (_) {
        return false;
      }
    }

    var storage = {
      getItem: function (key) {
        try {
          return window.localStorage ? window.localStorage.getItem(key) : null;
        } catch (_) {
          return null;
        }
      },
      setItem: function (key, value) {
        try {
          if (!window.localStorage) return false;
          window.localStorage.setItem(key, value);
          return true;
        } catch (_) {
          return false;
        }
      },
      removeItem: function (key) {
        try {
          if (!window.localStorage) return false;
          window.localStorage.removeItem(key);
          return true;
        } catch (_) {
          return false;
        }
      },
      clear: function () {
        try {
          if (!window.localStorage) return false;
          window.localStorage.clear();
          return true;
        } catch (_) {
          return false;
        }
      },
      getJson: function (key, fallback) {
        var raw = this.getItem(key);
        if (!raw) return fallback;
        try {
          return JSON.parse(raw);
        } catch (_) {
          return fallback;
        }
      },
      setJson: function (key, value) {
        try {
          return this.setItem(key, JSON.stringify(value));
        } catch (_) {
          return false;
        }
      },
    };

    return {
      getInvoke: getInvoke,
      invoke: invoke,
      listen: listen,
      getCurrentWindow: getCurrentWindow,
      getDpi: getDpi,
      isDesktop: isDesktop,
      isParityMode: isParityMode,
      setParityMode: setParityMode,
      windowAction: windowAction,
      openExternalUrl: openExternalUrl,
      storage: storage,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.platform = createPlatformAdapter();
})();