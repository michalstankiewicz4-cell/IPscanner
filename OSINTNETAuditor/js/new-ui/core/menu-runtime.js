(function () {
  function createMenuRuntime(deps) {
    var tr = deps.tr;
    var uiDefinitions = deps.uiDefinitions || { menuGroups: {}, menuActions: {}, panelDefinitions: {} };
    var appLinks = deps.appLinks || {};
    var getActionMap = deps.getActionMap;
    var setStatusLine = deps.setStatusLine;
    var onOpenExtensionManager = deps.onOpenExtensionManager;
    var onOpenLanguageManager = deps.onOpenLanguageManager;
    var onSwitchTool = deps.onSwitchTool;
    var onToggleClippy = deps.onToggleClippy;
    var onAutoArrangeWindows = deps.onAutoArrangeWindows;

    function actionDefinition(action) {
      return (uiDefinitions.menuActions && uiDefinitions.menuActions[action]) || null;
    }

    function getInvoke() {
      return (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke)
        || (window.__TAURI__ && window.__TAURI__.invoke)
        || (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke)
        || null;
    }

    function openExternalUrl(url) {
      var safeUrl = String(url || "").trim();
      if (!safeUrl) return;

      var invoke = getInvoke();
      if (invoke) {
        invoke("open_browser", { url: safeUrl }).catch(function () {
          try { window.open(safeUrl, "_blank", "noopener"); } catch (_) {}
        });
        return;
      }

      try { window.open(safeUrl, "_blank", "noopener"); } catch (_) {}
    }

    function runMenuAction(action) {
      var actionMap = getActionMap ? getActionMap() : {};
      var label = action && actionMap[action] ? actionMap[action] : action;
      var def = actionDefinition(action);
      var behavior = def && def.behavior ? def.behavior : "status";

      // Obsługa otwierania GitHuba dla Download
      if (behavior === "open-github-download") {
        openExternalUrl(appLinks.downloadUrl);
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + label);
        return;
      }

      async function runNativeWindowAction(kind) {
        var invoke = getInvoke();
        if (invoke) {
          try {
            if (kind === "minimize") {
              await invoke("window_minimize");
              return true;
            }
            if (kind === "maximize") {
              await invoke("window_toggle_maximize");
              return true;
            }
            if (kind === "fullscreen") {
              await invoke("window_toggle_fullscreen");
              return true;
            }
            if (kind === "close") {
              await invoke("window_close");
              return true;
            }
          } catch (_) {}
        }

        var tauri = window.__TAURI__;
        var winApi = tauri && (tauri.window || tauri.webviewWindow)
          ? (tauri.window || tauri.webviewWindow)
          : null;
        if (!winApi) return false;

        var currentWindow = null;
        if (typeof winApi.getCurrentWindow === "function") {
          currentWindow = winApi.getCurrentWindow();
        } else if (typeof winApi.getCurrentWebviewWindow === "function") {
          currentWindow = winApi.getCurrentWebviewWindow();
        } else {
          currentWindow = winApi.appWindow || null;
        }
        if (!currentWindow) return false;

        try {
          if (kind === "minimize" && typeof currentWindow.minimize === "function") {
            await currentWindow.minimize();
            return true;
          }
          if (kind === "maximize" && typeof currentWindow.toggleMaximize === "function") {
            await currentWindow.toggleMaximize();
            return true;
          }
          if (kind === "close" && typeof currentWindow.close === "function") {
            await currentWindow.close();
            return true;
          }
          if (kind === "fullscreen" && typeof currentWindow.setFullscreen === "function") {
            var isFullscreen = false;
            if (typeof currentWindow.isFullscreen === "function") {
              isFullscreen = await currentWindow.isFullscreen();
            }
            await currentWindow.setFullscreen(!isFullscreen);
            return true;
          }
        } catch (_) {
          return false;
        }

        return false;
      }

      async function runWebFullscreenToggle() {
        try {
          if (document.fullscreenElement && document.exitFullscreen) {
            await document.exitFullscreen();
            return true;
          }
          var root = document.documentElement;
          if (root && root.requestFullscreen) {
            await root.requestFullscreen();
            return true;
          }
        } catch (_) {
          return false;
        }
        return false;
      }


      // Otwieranie zakładek przez switchTool
      if (behavior === "open-extension-manager") {
        if (onSwitchTool) onSwitchTool("import-tool");
        if (onOpenExtensionManager) onOpenExtensionManager("extensions");
        return;
      }
      if (behavior === "open-language-manager") {
        if (onSwitchTool) onSwitchTool("language-manager");
        if (onOpenLanguageManager) onOpenLanguageManager("languages");
        return;
      }
      if (behavior.indexOf("switch-tool:") === 0) {
        var tool = behavior.slice("switch-tool:".length);
        if (tool && onSwitchTool) onSwitchTool(tool);
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + label);
        return;
      }

      if (behavior === "toggle-clippy") {
        if (onToggleClippy) onToggleClippy();
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + label);
        return;
      }

      if (behavior === "window-minimize") {
        runNativeWindowAction("minimize").then(function (handled) {
          if (setStatusLine) {
            setStatusLine(
              tr("menuPrefix") + ": " + label + (handled ? "" : tr("statusDesktopOnlySuffix"))
            );
          }
        });
        return;
      }

      if (behavior === "window-maximize") {
        runNativeWindowAction("maximize").then(function (handled) {
          if (setStatusLine) {
            setStatusLine(
              tr("menuPrefix") + ": " + label + (handled ? "" : tr("statusDesktopOnlySuffix"))
            );
          }
        });
        return;
      }

      if (behavior === "window-fullscreen") {
        runNativeWindowAction("fullscreen").then(function (handled) {
          if (handled) {
            if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + label);
            return;
          }
          runWebFullscreenToggle().then(function () {
            if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + label);
          });
        });
        return;
      }

      if (behavior === "window-close") {
        runNativeWindowAction("close").then(function (handled) {
          if (!handled) {
            try { window.close(); } catch (_) {}
          }
          if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + label);
        });
        return;
      }

      if (behavior === "auto-arrange-windows") {
        if (onAutoArrangeWindows) onAutoArrangeWindows();
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + label);
        return;
      }

      if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + label);
    }

    function applyMenuAndPanelDefinitions() {
      Object.keys(uiDefinitions.menuGroups || {}).forEach(function (menuKey) {
        var trigger = document.querySelector('[data-menu="' + menuKey + '"] .v1-menu-trigger');
        var def = uiDefinitions.menuGroups[menuKey];
        var purpose = def && (def.purposeKey ? tr(def.purposeKey) : def.purpose);
        if (!trigger || !purpose) return;
        trigger.setAttribute("title", purpose);
        trigger.setAttribute("aria-label", trigger.textContent + " - " + purpose);
      });

      Object.keys(uiDefinitions.menuActions || {}).forEach(function (actionKey) {
        var def = uiDefinitions.menuActions[actionKey];
        var purpose = def && (def.purposeKey ? tr(def.purposeKey) : def.purpose);
        if (!purpose) return;
        document.querySelectorAll('[data-menu-action="' + actionKey + '"]').forEach(function (item) {
          item.setAttribute("title", purpose);
          item.setAttribute("aria-label", purpose);
        });
      });

      Object.keys(uiDefinitions.panelDefinitions || {}).forEach(function (panelKey) {
        var panelDef = uiDefinitions.panelDefinitions[panelKey];
        var purpose = panelDef && (panelDef.purposeKey ? tr(panelDef.purposeKey) : panelDef.purpose);
        if (!panelDef || !panelDef.selector || !purpose) return;
        var panel = document.querySelector(panelDef.selector);
        if (!panel) return;
        panel.setAttribute("title", purpose);
        panel.setAttribute("aria-label", purpose);
      });
    }

    function initMenuBar() {
      var menubar = document.getElementById("v1Menubar");
      if (!menubar) return;

      var groups = Array.from(menubar.querySelectorAll(".v1-menu-group"));

      function closeAllMenus() {
        groups.forEach(function (group) { group.classList.remove("open"); });
      }

      function openMenu(group) {
        closeAllMenus();
        group.classList.add("open");
      }

      groups.forEach(function (group) {
        var trigger = group.querySelector(".v1-menu-trigger");
        if (!trigger) return;

        trigger.addEventListener("click", function (event) {
          event.stopPropagation();
          var willOpen = !group.classList.contains("open");
          closeAllMenus();
          if (willOpen) group.classList.add("open");
        });

        group.addEventListener("mouseenter", function () {
          var opened = groups.some(function (g) { return g.classList.contains("open"); });
          if (!opened) return;
          openMenu(group);
        });
      });

      document.addEventListener("click", function (event) {
        if (menubar.contains(event.target)) return;
        closeAllMenus();
      });

      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") closeAllMenus();
      });

      menubar.querySelectorAll(".v1-menu-dd-item").forEach(function (item) {
        item.addEventListener("click", function () {
          closeAllMenus();
        });
      });
    }

    function initMenuActions() {
      if (document.body && document.body.dataset.v1MenuActionsBound === "1") return;
      if (document.body) document.body.dataset.v1MenuActionsBound = "1";

      document.addEventListener("click", function (event) {
        var item = event.target && event.target.closest
          ? event.target.closest("[data-menu-action]")
          : null;
        if (!item) return;
        var action = item.getAttribute("data-menu-action");
        if (!action) return;
        runMenuAction(action);
      });
    }

    return {
      initMenuBar: initMenuBar,
      initMenuActions: initMenuActions,
      applyMenuAndPanelDefinitions: applyMenuAndPanelDefinitions,
      runMenuAction: runMenuAction,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createMenuRuntime = createMenuRuntime;
})();
