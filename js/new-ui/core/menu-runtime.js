(function () {
  function createMenuRuntime(deps) {
    var tr = deps.tr;
    var uiDefinitions = deps.uiDefinitions || { menuGroups: {}, menuActions: {}, panelDefinitions: {} };
    var appLinks = deps.appLinks || {};
    var platform = deps.platform || ((window.NetReconNewUICore && window.NetReconNewUICore.platform) || {});
    var getActionMap = deps.getActionMap;
    var setStatusLine = deps.setStatusLine;
    var onOpenLanguageManager = deps.onOpenLanguageManager;
    var onSwitchTool = deps.onSwitchTool;
    var onToggleClippy = deps.onToggleClippy;
    var session = deps.session || null;

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

    function requestSidebarToolTabOpen(tool) {
      if (!tool) return false;
      var detail = {
        tool: tool,
        activate: true,
      };
      document.dispatchEvent(new CustomEvent("newui:sidebar-tab-intent-open", { detail: detail }));
      return true;
    }

    // Shared factory behind both the app-exit dialog (3 buttons) and the
    // generic OK/Cancel confirm dialog (2 buttons), replacing window.confirm()
    // (unstyled, pinned to the top of the webview, not centered/themed).
    // A single dialog instance can only show one request at a time; calls
    // made while it's already open are queued instead of clobbering the
    // in-flight one's resolver, and Tab is trapped within the button row so
    // background controls stay unreachable while the dialog is open - both
    // properties window.confirm() had "for free" as a native blocking modal.
    function buildButtonDialog(idPrefix, buttonKeys) {
      var state = { root: null, title: null, message: null, buttons: {}, resolver: null, queue: [], lastFocused: null };

      function focusableButtons() {
        return buttonKeys
          .map(function (key) { return state.buttons[key]; })
          .filter(function (btn) { return btn && btn.offsetParent !== null; });
      }

      function finish(choice) {
        state.root.setAttribute("hidden", "hidden");
        document.removeEventListener("keydown", state._keyHandler, true);
        state.root.removeEventListener("mousedown", state._backdropHandler);
        if (state.lastFocused && typeof state.lastFocused.focus === "function") {
          try { state.lastFocused.focus(); } catch (_) {}
        }
        var done = state.resolver;
        state.resolver = null;
        if (typeof done === "function") done(choice || "cancel");
        if (state.queue.length) {
          var nextRequest = state.queue.shift();
          showNow(nextRequest.texts, nextRequest.resolve);
        }
      }

      function ensure() {
        if (state.root && state.root.isConnected) return state;

        var root = document.createElement("div");
        root.className = "v1-exit-modal";
        root.setAttribute("hidden", "hidden");
        root.setAttribute("role", "dialog");
        root.setAttribute("aria-modal", "true");
        root.setAttribute("aria-labelledby", idPrefix + "Title");
        root.setAttribute("aria-describedby", idPrefix + "Message");

        var panel = document.createElement("div");
        panel.className = "v1-exit-panel";

        var head = document.createElement("div");
        head.className = "v1-exit-head";

        var title = document.createElement("h3");
        title.id = idPrefix + "Title";
        head.appendChild(title);

        var message = document.createElement("p");
        message.id = idPrefix + "Message";
        message.className = "v1-exit-message";

        var actions = document.createElement("div");
        actions.className = "v1-exit-actions";

        buttonKeys.forEach(function (key, index) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "v1-exit-btn" + (index === 0 ? " v1-exit-btn--primary" : "");
          btn.dataset.dialogChoice = key;
          actions.appendChild(btn);
          state.buttons[key] = btn;
        });

        panel.appendChild(head);
        panel.appendChild(message);
        panel.appendChild(actions);
        root.appendChild(panel);
        document.body.appendChild(root);

        root.addEventListener("click", function (event) {
          var target = event.target;
          var choice = target && target.dataset ? target.dataset.dialogChoice : "";
          if (!choice) return;
          finish(choice);
        });

        state._keyHandler = function (event) {
          if (event.key === "Escape") {
            event.preventDefault();
            finish("cancel");
            return;
          }
          if (event.key !== "Tab") return;
          var list = focusableButtons();
          if (!list.length) return;
          event.preventDefault();
          var current = list.indexOf(document.activeElement);
          var next = event.shiftKey
            ? (current <= 0 ? list.length - 1 : current - 1)
            : (current === -1 || current === list.length - 1 ? 0 : current + 1);
          try { list[next].focus(); } catch (_) {}
        };

        state._backdropHandler = function (event) {
          if (event.target !== root) return;
          finish("cancel");
        };

        state.root = root;
        state.title = title;
        state.message = message;
        return state;
      }

      function showNow(texts, resolve) {
        var modal = ensure();
        modal.title.textContent = texts.title;
        modal.message.textContent = texts.message;
        buttonKeys.forEach(function (key) {
          if (modal.buttons[key]) modal.buttons[key].textContent = (texts.labels && texts.labels[key]) || "";
        });
        modal.lastFocused = document.activeElement;
        modal.root.removeAttribute("hidden");
        document.addEventListener("keydown", modal._keyHandler, true);
        modal.root.addEventListener("mousedown", modal._backdropHandler);
        modal.resolver = resolve;
        var focusKey = texts.focusKey || buttonKeys[0];
        setTimeout(function () {
          var btn = modal.buttons[focusKey];
          if (btn) { try { btn.focus(); } catch (_) {} }
        }, 0);
      }

      function open(texts) {
        return new Promise(function (resolve) {
          var modal = ensure();
          var busy = modal.root && !modal.root.hasAttribute("hidden");
          if (busy) {
            state.queue.push({ texts: texts, resolve: resolve });
            return;
          }
          showNow(texts, resolve);
        });
      }

      return { open: open };
    }

    var exitDialog = buildButtonDialog("v1ExitModal", ["save", "discard", "cancel"]);
    var confirmDialog = buildButtonDialog("v1ConfirmModal", ["ok", "cancel"]);

    function openExitConfirmDialog() {
      return exitDialog.open({
        title: tr("exitDialogTitle"),
        message: tr("exitDialogMessage"),
        labels: {
          save: tr("exitPromptSaveAndExit"),
          discard: tr("exitPromptExitWithoutSave"),
          cancel: tr("exitPromptCancel"),
        },
        focusKey: "save",
      });
    }

    function openConfirmDialog(titleText, messageText, okLabel, cancelLabel) {
      return confirmDialog.open({
        title: titleText,
        message: messageText,
        labels: { ok: okLabel, cancel: cancelLabel },
        focusKey: "ok",
      }).then(function (choice) { return choice === "ok"; });
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

      // General settings -> "Remember open tabs": snapshot which LS/RS/CS
      // tabs are open/active right before the window actually closes (the
      // native close command destroys the window, so this must run first,
      // not in the .then() below). Always writes; the "remember" checkbox
      // is enforced by clearing this key at boot, same convention as every
      // other General-governed setting.
      function persistOpenTabsSnapshot() {
        if (!session || typeof session.collectLayoutOnly !== "function") return;
        try {
          var layout = session.collectLayoutOnly();
          if (window.localStorage) window.localStorage.setItem("netrecon_open_tabs_v1", JSON.stringify(layout));
        } catch (_) {}
      }

      function closeAppWindow(labelText) {
        persistOpenTabsSnapshot();
        runNativeWindowAction("close").then(function (handled) {
          if (!handled) {
            try { window.close(); } catch (_) {}
          }
          if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + labelText);
        });
      }


      // Otwieranie zakładek przez switchTool
      if (behavior === "open-language-manager") {
        if (onSwitchTool) onSwitchTool("language-manager");
        if (onOpenLanguageManager) onOpenLanguageManager("languages");
        return;
      }
      // Generic "open this tab, in this section" convention - replaces the
      // old separate switch-tool:/open-right-tool: strings (the latter used
      // to hand-roll its own class toggling here, duplicating what
      // tab-registry.js's engine already does for "right"; now it just
      // dispatches the same intent events navigation-runtime.js's own
      // click handlers already use, so there's one code path either way).
      // "left" isn't handled here directly - nothing in today's menu
      // definitions opens a left-only tab without also opening its
      // center/right counterpart, see the scan-runner/ip-library case below.
      if (behavior.indexOf("open-tab:") === 0) {
        var parts = behavior.slice("open-tab:".length).split(":");
        var openSection = parts[0];
        var tool = parts[1] || "";
        if (tool && openSection === "center") {
          // ip-scanner tool keys: only these 2 ids also open/activate the
          // matching left-sidebar tool tab. Rest of this function/file is
          // shell (generic menu action dispatch) - this hardcoded check is
          // the one seam that would need a generic contribution instead of
          // an id check, once a contribution-point API exists.
          if (tool === "scan-runner" || tool === "ip-library") {
            requestSidebarToolTabOpen(tool);
          }
          if (onSwitchTool) onSwitchTool(tool);
        } else if (tool && openSection === "right") {
          document.dispatchEvent(new CustomEvent("newui:right-tab-intent-open", { detail: { tool: tool } }));
        } else if (tool && openSection === "left") {
          requestSidebarToolTabOpen(tool);
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

      // General settings -> "Remember window state": snapshot the resulting
      // mode (normal/maximized/fullscreen) after any successful native
      // toggle, so it can be restored on next launch (bootstrap-runtime.js).
      // Always writes; the "remember" checkbox is enforced by clearing this
      // key at boot, not by gating the write - same convention as every
      // other General-governed setting.
      function persistWindowState() {
        if (!platform || typeof platform.invoke !== "function") return;
        platform.invoke("window_get_state").then(function (state) {
          try {
            if (window.localStorage) window.localStorage.setItem("netrecon_window_state_v1", String(state || ""));
          } catch (_) {}
        }).catch(function () {});
      }

      if (behavior === "window-maximize") {
        runNativeWindowAction("maximize").then(function (handled) {
          if (handled) persistWindowState();
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
            persistWindowState();
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

      if (behavior === "toggle-unfinished-tools") {
        var unfinishedSelectors = [
          "#v1ActivityLoremIpsum",
          "#v1ActivityTopology",
          "#v1ActivityGlobe",
          ".v1-menu-dd-item[data-tool=\"lorem-ipsum\"]",
          ".v1-menu-dd-item[data-tool=\"topology\"]",
          ".v1-menu-dd-item[data-tool=\"globe\"]",
          ".v1-menu-dd-item[data-menu-action=\"assistant-right\"]",
          ".v1-menu-dd-item[data-menu-action=\"countries\"]",
          "[data-general-ui-switch]",
        ];
        // Not-yet-implemented scan techniques (TCP SYN/UDP/OS Detection all
        // need raw sockets; ICMP mode needs the same) - grayed out
        // (disabled, not hidden) so they're visible-but-unselectable until
        // "Show unfinished tools" is on, instead of only failing after
        // Start is pressed.
        var unfinishedDisabledSelectors = [
          "#v1ConfigProtocolTcpSyn",
          "#v1ConfigProtocolUdp",
          "#v1ConfigOsDetection",
          "#v1ScanModeIcmp",
        ];
        var unfinishedBtn = document.querySelector('[data-menu-action="show-unfinished-tools"]');
        var nextShowState = !(unfinishedBtn && unfinishedBtn.classList.contains("is-active"));
        unfinishedSelectors.forEach(function (selector) {
          var el = document.querySelector(selector);
          if (!el) return;
          if (nextShowState) el.removeAttribute("hidden");
          else el.setAttribute("hidden", "hidden");
        });
        unfinishedDisabledSelectors.forEach(function (selector) {
          var el = document.querySelector(selector);
          if (!el) return;
          if (nextShowState) el.removeAttribute("disabled");
          else el.setAttribute("disabled", "disabled");
        });
        try {
          localStorage.setItem("netrecon_show_unfinished_tools", nextShowState ? "1" : "0");
        } catch (_) {}
        // ShellCraft Library's functional block rows are dimmed/blocked via
        // this body class + CSS instead of a per-row disabled attribute
        // (they're draggable divs, not form controls - see the dragstart
        // guard in panel-interactions-runtime.js's wireShellCraftLibrary()).
        document.body.classList.toggle("v1-unfinished-tools-on", nextShowState);
        if (unfinishedBtn) {
          unfinishedBtn.classList.toggle("is-active", nextShowState);
          unfinishedBtn.setAttribute("aria-pressed", nextShowState ? "true" : "false");
        }
        if (setStatusLine) {
          setStatusLine(tr("menuPrefix") + ": " + (nextShowState ? tr("statusUnfinishedToolsOn") : tr("statusUnfinishedToolsOff")));
        }
        return;
      }

      if (behavior === "toggle-blur-ip") {
        var nextBlurState = !document.body.classList.contains("v1-blur-ip");
        document.body.classList.toggle("v1-blur-ip", nextBlurState);
        try {
          localStorage.setItem("netrecon_blur_ip", nextBlurState ? "1" : "0");
        } catch (_) {}
        try {
          window.dispatchEvent(new CustomEvent("newui:blur-ip-changed", { detail: { active: nextBlurState } }));
        } catch (_) {}
        var blurBtn = document.querySelector('[data-menu-action="blur-ip"]');
        if (blurBtn) {
          blurBtn.classList.toggle("is-active", nextBlurState);
          blurBtn.setAttribute("aria-pressed", nextBlurState ? "true" : "false");
        }
        if (setStatusLine) {
          setStatusLine(tr("menuPrefix") + ": " + (nextBlurState ? tr("statusBlurIpOn") : tr("statusBlurIpOff")));
        }
        return;
      }

      if (behavior === "save-session") {
        return session ? session.saveSession() : undefined;
      }

      if (behavior === "save-session-as") {
        if (session) session.saveSessionAs();
        return;
      }

      if (behavior === "load-session") {
        if (session) session.loadSession();
        return;
      }

      if (behavior === "close-session" || behavior === "new-session") {
        if (!session) return;
        var isNew = behavior === "new-session";
        openConfirmDialog(
          tr(isNew ? "sessionNewConfirmTitle" : "sessionCloseConfirmTitle"),
          tr(isNew ? "sessionNewConfirm" : "sessionCloseConfirm"),
          tr(isNew ? "sessionNewConfirmOk" : "sessionCloseConfirmOk"),
          tr("exitPromptCancel")
        ).then(function (confirmed) {
          if (confirmed) session.closeSession();
        });
        return;
      }

      if (behavior === "app-exit") {
        openExitConfirmDialog().then(function (choice) {
          if (choice === "save") {
            Promise.resolve(runMenuAction("save-session")).then(function () {
              closeAppWindow(label);
            });
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

      function closeAllSubmenus() {
        menubar.querySelectorAll(".v1-menu-dd-submenu.open").forEach(function (submenu) {
          submenu.classList.remove("open");
          var trigger = submenu.querySelector("[data-menu-submenu-trigger]");
          if (trigger) trigger.setAttribute("aria-expanded", "false");
        });
      }

      function openSubmenu(submenu) {
        closeAllSubmenus();
        submenu.classList.add("open");
        var trigger = submenu.querySelector("[data-menu-submenu-trigger]");
        if (trigger) trigger.setAttribute("aria-expanded", "true");
      }

      function closeAllMenus() {
        groups.forEach(function (group) { group.classList.remove("open"); });
        closeAllSubmenus();
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
        if (item.hasAttribute("data-menu-submenu-trigger")) return;
        item.addEventListener("click", function () {
          if (item.getAttribute("aria-disabled") === "true") return;
          closeAllMenus();
        });
      });

      menubar.querySelectorAll("[data-menu-submenu-trigger]").forEach(function (trigger) {
        var submenu = trigger.closest(".v1-menu-dd-submenu");
        if (!submenu) return;

        trigger.addEventListener("click", function (event) {
          event.stopPropagation();
          if (submenu.classList.contains("open")) {
            closeAllSubmenus();
          } else {
            openSubmenu(submenu);
          }
        });

        trigger.addEventListener("keydown", function (event) {
          if (event.key === "Enter" || event.key === " " || event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            openSubmenu(submenu);
            var firstItem = submenu.querySelector(".v1-menu-dd-flyout-item");
            if (firstItem) { try { firstItem.focus(); } catch (_) {} }
            return;
          }
          if ((event.key === "Escape" || event.key === "ArrowLeft") && submenu.classList.contains("open")) {
            event.preventDefault();
            closeAllSubmenus();
            try { trigger.focus(); } catch (_) {}
          }
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
        if (item.getAttribute("aria-disabled") === "true") {
          event.stopPropagation();
          return;
        }
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
      openConfirmDialog: openConfirmDialog,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createMenuRuntime = createMenuRuntime;
})();
