(function () {
  function createMenuRuntime(deps) {
    var tr = deps.tr;
    var uiDefinitions = deps.uiDefinitions || { menuGroups: {}, menuActions: {}, panelDefinitions: {} };
    var appLinks = deps.appLinks || {};
    var platform = deps.platform || ((window.NetReconNewUICore && window.NetReconNewUICore.platform) || {});
    var getActionMap = deps.getActionMap;
    var setStatusLine = deps.setStatusLine;
    var onOpenExtensionManager = deps.onOpenExtensionManager;
    var onOpenLanguageManager = deps.onOpenLanguageManager;
    var onSwitchTool = deps.onSwitchTool;
    var onSwitchSidebarView = deps.onSwitchSidebarView;
    var onToggleClippy = deps.onToggleClippy;
    var exitDialogState = {
      root: null,
      title: null,
      message: null,
      saveBtn: null,
      discardBtn: null,
      cancelBtn: null,
      resolver: null,
      keyHandler: null,
      backdropHandler: null,
      lastFocused: null,
    };

    function actionDefinition(action) {
      return (uiDefinitions.menuActions && uiDefinitions.menuActions[action]) || null;
    }

    function getInvoke() {
      if (platform && typeof platform.getInvoke === "function") {
        return platform.getInvoke();
      }
      return null;
    }

    function openExternalUrl(url) {
      var safeUrl = String(url || "").trim();
      if (!safeUrl) return;

      if (platform && typeof platform.openExternalUrl === "function") {
        if (platform.openExternalUrl(safeUrl)) return;
      }

      try { window.open(safeUrl, "_blank", "noopener"); } catch (_) {}
    }

    function requestSidebarToolTabOpen(tool, preferredView) {
      if (!tool) return false;
      var detail = {
        tool: tool,
        activate: true,
      };
      if (preferredView) detail.view = preferredView;
      document.dispatchEvent(new CustomEvent("newui:sidebar-tab-intent-open", { detail: detail }));
      return true;
    }

    function ensureExitDialog() {
      if (exitDialogState.root && exitDialogState.root.isConnected) return exitDialogState;

      var root = document.createElement("div");
      root.className = "v1-exit-modal";
      root.setAttribute("hidden", "hidden");
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-modal", "true");
      root.setAttribute("aria-labelledby", "v1ExitModalTitle");
      root.setAttribute("aria-describedby", "v1ExitModalMessage");

      var panel = document.createElement("div");
      panel.className = "v1-exit-panel";

      var head = document.createElement("div");
      head.className = "v1-exit-head";

      var title = document.createElement("h3");
      title.id = "v1ExitModalTitle";
      head.appendChild(title);

      var message = document.createElement("p");
      message.id = "v1ExitModalMessage";
      message.className = "v1-exit-message";

      var actions = document.createElement("div");
      actions.className = "v1-exit-actions";

      var saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "v1-exit-btn v1-exit-btn--primary";
      saveBtn.dataset.exitChoice = "save";

      var discardBtn = document.createElement("button");
      discardBtn.type = "button";
      discardBtn.className = "v1-exit-btn";
      discardBtn.dataset.exitChoice = "discard";

      var cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "v1-exit-btn";
      cancelBtn.dataset.exitChoice = "cancel";

      actions.appendChild(saveBtn);
      actions.appendChild(discardBtn);
      actions.appendChild(cancelBtn);

      panel.appendChild(head);
      panel.appendChild(message);
      panel.appendChild(actions);
      root.appendChild(panel);
      document.body.appendChild(root);

      function resolveChoice(choice) {
        if (typeof exitDialogState.resolver === "function") {
          var done = exitDialogState.resolver;
          exitDialogState.resolver = null;
          done(choice || "cancel");
        }
      }

      root.addEventListener("click", function (event) {
        var target = event.target;
        var choice = target && target.dataset ? target.dataset.exitChoice : "";
        if (!choice) return;
        root.setAttribute("hidden", "hidden");
        if (exitDialogState.lastFocused && typeof exitDialogState.lastFocused.focus === "function") {
          try { exitDialogState.lastFocused.focus(); } catch (_) {}
        }
        resolveChoice(choice);
      });

      exitDialogState.keyHandler = function (event) {
        if (event.key !== "Escape") return;
        event.preventDefault();
        root.setAttribute("hidden", "hidden");
        if (exitDialogState.lastFocused && typeof exitDialogState.lastFocused.focus === "function") {
          try { exitDialogState.lastFocused.focus(); } catch (_) {}
        }
        resolveChoice("cancel");
      };

      exitDialogState.backdropHandler = function (event) {
        if (event.target !== root) return;
        root.setAttribute("hidden", "hidden");
        if (exitDialogState.lastFocused && typeof exitDialogState.lastFocused.focus === "function") {
          try { exitDialogState.lastFocused.focus(); } catch (_) {}
        }
        resolveChoice("cancel");
      };

      exitDialogState.root = root;
      exitDialogState.title = title;
      exitDialogState.message = message;
      exitDialogState.saveBtn = saveBtn;
      exitDialogState.discardBtn = discardBtn;
      exitDialogState.cancelBtn = cancelBtn;
      return exitDialogState;
    }

    function openExitConfirmDialog() {
      var modal = ensureExitDialog();
      modal.title.textContent = tr("exitDialogTitle");
      modal.message.textContent = tr("exitDialogMessage");
      modal.saveBtn.textContent = tr("exitPromptSaveAndExit");
      modal.discardBtn.textContent = tr("exitPromptExitWithoutSave");
      modal.cancelBtn.textContent = tr("exitPromptCancel");
      modal.lastFocused = document.activeElement;

      modal.root.removeAttribute("hidden");
      document.addEventListener("keydown", modal.keyHandler, true);
      modal.root.addEventListener("mousedown", modal.backdropHandler);
      setTimeout(function () {
        try { modal.saveBtn.focus(); } catch (_) {}
      }, 0);

      return new Promise(function (resolve) {
        modal.resolver = function (choice) {
          modal.root.setAttribute("hidden", "hidden");
          document.removeEventListener("keydown", modal.keyHandler, true);
          modal.root.removeEventListener("mousedown", modal.backdropHandler);
          resolve(choice || "cancel");
        };
      });
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
        if (platform && typeof platform.windowAction === "function") {
          try {
            return await platform.windowAction(kind);
          } catch (_) {
            return false;
          }
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

      function closeAppWindow(labelText) {
        runNativeWindowAction("close").then(function (handled) {
          if (!handled) {
            try { window.close(); } catch (_) {}
          }
          if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + labelText);
        });
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
        if (tool === "scan-runner" || tool === "ip-library") {
          var handledBySidebarRuntime = requestSidebarToolTabOpen(tool, "scanner");
          if (!handledBySidebarRuntime && onSwitchSidebarView) {
            onSwitchSidebarView("scanner");
          }
        }
        if (tool && onSwitchTool) onSwitchTool(tool);
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + label);
        return;
      }

      if (behavior.indexOf("open-right-tool:") === 0) {
        var tool = behavior.slice("open-right-tool:".length);
        if (tool) {
          var wrap = document.querySelector('.v1-right-tool-tab-wrap[data-right-tab="' + tool + '"]');
          if (wrap) {
            wrap.classList.remove("right-tab-closed");
            wrap.removeAttribute("hidden");
          }
          document.querySelectorAll(".v1-right-tool-tab-wrap").forEach(function (item) {
            var wrapTool = item.getAttribute("data-right-tab") || "";
            item.classList.toggle("is-right-active", wrapTool === tool);
          });
          document.querySelectorAll(".v1-right-tab").forEach(function (btn) {
            var btnTool = btn.getAttribute("data-v1-right-tab") || "";
            btn.classList.toggle("active", btnTool === tool);
          });
          document.querySelectorAll(".v1-right-pane").forEach(function (pane) {
            pane.classList.toggle("active", pane.getAttribute("data-v1-right-pane") === tool);
          });
          var rightbar = document.querySelector(".v1-rightbar");
          if (rightbar) {
            rightbar.classList.remove("right-tabs-empty");
          }
        }
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
        closeAppWindow(label);
        return;
      }

      if (behavior === "app-exit") {
        openExitConfirmDialog().then(function (choice) {
          if (choice === "save") {
            runMenuAction("save-session");
            closeAppWindow(label);
            return;
          }

          if (choice === "discard") {
            closeAppWindow(label);
            return;
          }

          if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("exitPromptCancelled"));
        });
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

      bindMenuActions();
    }

    function bindMenuActions() {
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

    function initMenuActions() {
      bindMenuActions();
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
