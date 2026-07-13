(function () {
  function createLayoutRuntime(deps) {
    var refreshCustomScrollbars = deps.refreshCustomScrollbars || function () {};
    var tr = deps.tr || function (key) { return key; };
    var platform = deps.platform || ((window.NetReconNewUICore && window.NetReconNewUICore.platform) || {});

    function init() {
      var main = document.querySelector(".v1-main");
      var editor = document.querySelector(".v1-editor");
      var menubar = document.querySelector(".v1-menubar");
      var sidebar = document.querySelector(".v1-sidebar");
      var rightbar = document.querySelector(".v1-rightbar");
      var activity = document.querySelector(".v1-activity");
      var leftHandle = document.querySelector('[data-resize="left"]');
      var rightHandle = document.querySelector('[data-resize="right"]');
      var consoleHandle = document.querySelector('[data-resize="console"]');
      var leftToggle = document.querySelector('[data-panel-toggle="left"]');
      var rightToggle = document.querySelector('[data-panel-toggle="right"]');
      var bottomToggle = document.querySelector('[data-panel-toggle="bottom"]');
      var statusRight = document.getElementById("v1StatusRight");
      if (!main || !editor || !sidebar || !rightbar || !activity || !leftHandle || !rightHandle || !consoleHandle || !leftToggle || !rightToggle || !bottomToggle) return;

      function getTauriInvoke() {
        if (platform && typeof platform.getInvoke === "function") {
          return platform.getInvoke();
        }
        return null;
      }

      function getCurrentTauriWindow() {
        if (platform && typeof platform.getCurrentWindow === "function") {
          return platform.getCurrentWindow();
        }
        return null;
      }

      function getTauriDpi() {
        if (platform && typeof platform.getDpi === "function") {
          return platform.getDpi();
        }
        return null;
      }

      if (menubar) {
        menubar.addEventListener("pointerdown", function (event) {
          if (event.button !== 0) return;
          var target = event.target;
          if (!target || typeof target.closest !== "function") return;
          if (target.closest("button, input, label, a, select, textarea, .v1-window-btn, .v1-menu-trigger, .v1-menu-dd-item, .v1-menu-group, .v1-menubar-action, .v1-menubar-toggle")) return;
          var invoke = getTauriInvoke();
          if (!invoke) return;
          invoke("window_start_dragging").catch(function () {});
        });
      }

      var edgeSize = 6;

      function getResizeDirection(event) {
        var x = event.clientX;
        var y = event.clientY;
        var w = window.innerWidth;
        var h = window.innerHeight;

        var atLeft = x <= edgeSize;
        var atRight = x >= w - edgeSize;
        var atTop = y <= edgeSize;
        var atBottom = y >= h - edgeSize;

        if (atTop && atLeft) return "northwest";
        if (atTop && atRight) return "northeast";
        if (atBottom && atLeft) return "southwest";
        if (atBottom && atRight) return "southeast";
        if (atTop) return "north";
        if (atBottom) return "south";
        if (atLeft) return "west";
        if (atRight) return "east";
        return "";
      }

      function cursorForDirection(direction) {
        if (direction === "north" || direction === "south") return "ns-resize";
        if (direction === "east" || direction === "west") return "ew-resize";
        if (direction === "northeast" || direction === "southwest") return "nesw-resize";
        if (direction === "northwest" || direction === "southeast") return "nwse-resize";
        return "";
      }

      var winResize = null;
      var MIN_WINDOW_WIDTH = 760;
      var MIN_WINDOW_HEIGHT = 520;

      window.addEventListener("pointermove", function (event) {
        if (drag || winResize) return;
        var invoke = getTauriInvoke();
        if (!invoke) {
          document.documentElement.style.cursor = "";
          return;
        }
        var direction = getResizeDirection(event);
        document.documentElement.style.cursor = cursorForDirection(direction);
      });

      window.addEventListener("pointerleave", function () {
        if (drag || winResize) return;
        document.documentElement.style.cursor = "";
      });

      window.addEventListener("pointerdown", function (event) {
        if (event.button !== 0) return;
        var tWin = getCurrentTauriWindow();
        var dpi = getTauriDpi();
        if (!tWin || !dpi || typeof dpi.LogicalSize !== "function" || typeof dpi.LogicalPosition !== "function") return;
        var direction = getResizeDirection(event);
        if (!direction) return;
        event.preventDefault();
        event.stopPropagation();
        winResize = {
          pointerId: event.pointerId,
          direction: direction,
          startScreenX: event.screenX,
          startScreenY: event.screenY,
          startLeft: window.screenX,
          startTop: window.screenY,
          startWidth: window.innerWidth,
          startHeight: window.innerHeight,
          win: tWin,
          dpi: dpi,
        };
        document.body.style.userSelect = "none";
        document.documentElement.style.cursor = cursorForDirection(direction);
      }, true);

      var PANEL_SIZES_KEY = "netrecon_panel_sizes_v1";

      function loadPersistedSizes() {
        try {
          var raw = window.localStorage ? window.localStorage.getItem(PANEL_SIZES_KEY) : "";
          if (!raw) return null;
          var parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object") return null;
          return parsed;
        } catch (_) {
          return null;
        }
      }

      // General settings -> "Remember panel sizes" also covers collapsed
      // state (left/right/bottom), not just widths/heights - a panel left
      // collapsed is as much a remembered layout choice as its width.
      function persistSizes() {
        try {
          if (!window.localStorage) return;
          window.localStorage.setItem(PANEL_SIZES_KEY, JSON.stringify({
            left: size.left,
            right: size.right,
            console: size.console,
            leftCollapsed: panelState.leftCollapsed,
            rightCollapsed: panelState.rightCollapsed,
            bottomCollapsed: panelState.bottomCollapsed,
          }));
        } catch (_) {
          // ignore persistence failures
        }
      }

      var size = {
        left: 320,
        right: 300,
        console: 200,
      };

      var panelState = {
        leftCollapsed: false,
        rightCollapsed: false,
        bottomCollapsed: false,
      };

      (function applyPersistedSizes() {
        var persisted = loadPersistedSizes();
        if (!persisted) return;
        if (typeof persisted.left === "number") size.left = Math.max(180, Math.min(460, persisted.left));
        if (typeof persisted.right === "number") size.right = Math.max(220, Math.min(520, persisted.right));
        if (typeof persisted.console === "number") size.console = Math.max(90, Math.min(360, persisted.console));
        if (typeof persisted.leftCollapsed === "boolean") panelState.leftCollapsed = persisted.leftCollapsed;
        if (typeof persisted.rightCollapsed === "boolean") panelState.rightCollapsed = persisted.rightCollapsed;
        if (typeof persisted.bottomCollapsed === "boolean") panelState.bottomCollapsed = persisted.bottomCollapsed;
      })();

      function syncToggleLabels() {
        leftToggle.textContent = panelState.leftCollapsed ? "▶" : "◀";
        leftToggle.setAttribute("title", panelState.leftCollapsed ? tr("panelRestoreLeft") : tr("panelHideLeft"));
        leftToggle.setAttribute("aria-label", panelState.leftCollapsed ? tr("panelRestoreLeft") : tr("panelHideLeft"));

        rightToggle.textContent = panelState.rightCollapsed ? "◀" : "▶";
        rightToggle.setAttribute("title", panelState.rightCollapsed ? tr("panelRestoreRight") : tr("panelHideRight"));
        rightToggle.setAttribute("aria-label", panelState.rightCollapsed ? tr("panelRestoreRight") : tr("panelHideRight"));

        bottomToggle.textContent = panelState.bottomCollapsed ? "▲" : "▼";
        bottomToggle.setAttribute("title", panelState.bottomCollapsed ? tr("panelRestoreBottom") : tr("panelHideBottom"));
        bottomToggle.setAttribute("aria-label", panelState.bottomCollapsed ? tr("panelRestoreBottom") : tr("panelHideBottom"));
      }

      function applySizes() {
        var leftWidth = panelState.leftCollapsed ? 26 : size.left;
        var rightWidth = panelState.rightCollapsed ? 26 : size.right;

        // General -> "Swap panel sides": relocates just the activity bar
        // (via CSS `order` on body.v1-activity-last, see main.css), leaving
        // LS/RS's relative order to CS and CS/DS reading direction alone -
        // deliberately narrower than the dir="rtl" full mirror. Independent
        // of isRtl (not guarded by it): under a real RTL language, the
        // activity bar already sits on the side dir="rtl" put it via the
        // grid's own reversal, so toggling this setting moves it to
        // whichever side is currently NOT that one - i.e. it always flips
        // the activity bar to the opposite end of wherever it already is,
        // rather than forcing an absolute side. main.css has matching
        // dir="rtl"-aware overrides for the activity bar's own button
        // alignment and active-icon indicator, since "order: 6" lands on a
        // different physical side depending on isRtl.
        var isRtl = document.documentElement.getAttribute("dir") === "rtl";
        var activityLast = document.body.classList.contains("v1-panel-side-right");
        document.body.classList.toggle("v1-activity-last", activityLast);
        main.style.gridTemplateColumns = activityLast
          ? leftWidth + "px 6px minmax(0, 1fr) 6px " + rightWidth + "px 48px"
          : "48px " + leftWidth + "px 6px minmax(0, 1fr) 6px " + rightWidth + "px";

        sidebar.classList.toggle("collapsed", panelState.leftCollapsed);
        rightbar.classList.toggle("collapsed", panelState.rightCollapsed);

        if (panelState.bottomCollapsed) {
          editor.classList.add("console-collapsed");
          editor.style.gridTemplateRows = "";
        } else {
          editor.classList.remove("console-collapsed");
          editor.style.gridTemplateRows = "38px minmax(120px, 1fr) 6px " + size.console + "px";
        }

        syncToggleLabels();
        refreshCustomScrollbars();
      }

      var drag = null;
      var statusRightBeforeDrag = "";

      function startDrag(type, event) {
        drag = {
          type: type,
          startX: event.clientX,
          startY: event.clientY,
          left: size.left,
          right: size.right,
          console: size.console,
        };

        if (type === "left") leftHandle.classList.add("dragging");
        if (type === "right") rightHandle.classList.add("dragging");
        if (type === "console") consoleHandle.classList.add("dragging");

        if ((type === "left" || type === "console") && statusRight) {
          statusRightBeforeDrag = statusRight.textContent || "";
          if (type === "left") statusRight.textContent = "left width: " + size.left + "px";
          if (type === "console") statusRight.textContent = "console height: " + size.console + "px";
        }

        document.body.style.userSelect = "none";
      }

      function stopDrag() {
        var currentDrag = drag;
        drag = null;
        leftHandle.classList.remove("dragging");
        rightHandle.classList.remove("dragging");
        consoleHandle.classList.remove("dragging");

        if (currentDrag) persistSizes();

        if (currentDrag && (currentDrag.type === "left" || currentDrag.type === "console") && statusRight) {
          statusRight.textContent = statusRightBeforeDrag || statusRight.textContent;
        }

        document.body.style.userSelect = "";
        document.documentElement.style.cursor = "";
      }

      window.addEventListener("pointermove", function (event) {
        if (winResize) {
          if (event.pointerId !== winResize.pointerId) return;

          var dx = event.screenX - winResize.startScreenX;
          var dy = event.screenY - winResize.startScreenY;
          var dir = winResize.direction;

          var nextLeft = winResize.startLeft;
          var nextTop = winResize.startTop;
          var nextWidth = winResize.startWidth;
          var nextHeight = winResize.startHeight;

          if (dir.indexOf("east") !== -1) {
            nextWidth = Math.max(MIN_WINDOW_WIDTH, winResize.startWidth + dx);
          }
          if (dir.indexOf("west") !== -1) {
            nextWidth = Math.max(MIN_WINDOW_WIDTH, winResize.startWidth - dx);
            nextLeft = winResize.startLeft + (winResize.startWidth - nextWidth);
          }
          if (dir.indexOf("south") !== -1) {
            nextHeight = Math.max(MIN_WINDOW_HEIGHT, winResize.startHeight + dy);
          }
          if (dir.indexOf("north") !== -1) {
            nextHeight = Math.max(MIN_WINDOW_HEIGHT, winResize.startHeight - dy);
            nextTop = winResize.startTop + (winResize.startHeight - nextHeight);
          }

          winResize.win.setSize(new winResize.dpi.LogicalSize(Math.round(nextWidth), Math.round(nextHeight))).catch(function () {});
          if (nextLeft !== winResize.startLeft || nextTop !== winResize.startTop) {
            winResize.win.setPosition(new winResize.dpi.LogicalPosition(Math.round(nextLeft), Math.round(nextTop))).catch(function () {});
          }
          return;
        }

        if (!drag) return;

        if ((drag.type === "left" && panelState.leftCollapsed) || (drag.type === "right" && panelState.rightCollapsed) || (drag.type === "console" && panelState.bottomCollapsed)) {
          return;
        }

        // Under a real RTL language's structural mirror (.v1-main gets
        // direction: rtl, reversing the grid so LS/activity dock right and
        // RS docks left - see main.css), both resize handles sit on the
        // opposite physical side from LTR, so dragging the same physical
        // direction must grow/shrink the opposite way. Flipping the delta's
        // sign here is the only change needed - applySizes()'s
        // gridTemplateColumns string stays identical, CSS direction handles
        // the physical placement. NOT tied to the "Swap panel sides" General
        // setting - that only relocates the activity bar (see applySizes()),
        // LS/RS keep their normal relative position to CS, so no sign flip
        // is needed for that case.
        var rtlSign = document.documentElement.getAttribute("dir") === "rtl" ? -1 : 1;

        if (drag.type === "left") {
          size.left = Math.max(180, Math.min(460, drag.left + rtlSign * (event.clientX - drag.startX)));
          if (statusRight) statusRight.textContent = "left width: " + size.left + "px";
        }

        if (drag.type === "right") {
          size.right = Math.max(220, Math.min(520, drag.right - rtlSign * (event.clientX - drag.startX)));
        }

        if (drag.type === "console") {
          size.console = Math.max(90, Math.min(360, drag.console - (event.clientY - drag.startY)));
          if (statusRight) statusRight.textContent = "console height: " + size.console + "px";
        }

        applySizes();
      });

      window.addEventListener("pointerup", stopDrag);
      window.addEventListener("pointercancel", stopDrag);

      window.addEventListener("pointerup", function (event) {
        if (!winResize) return;
        if (event.pointerId !== winResize.pointerId) return;
        winResize = null;
        document.body.style.userSelect = "";
        document.documentElement.style.cursor = "";
      });

      window.addEventListener("pointercancel", function (event) {
        if (!winResize) return;
        if (event.pointerId !== winResize.pointerId) return;
        winResize = null;
        document.body.style.userSelect = "";
        document.documentElement.style.cursor = "";
      });

      leftHandle.addEventListener("pointerdown", function (event) { startDrag("left", event); });
      rightHandle.addEventListener("pointerdown", function (event) { startDrag("right", event); });
      consoleHandle.addEventListener("pointerdown", function (event) { startDrag("console", event); });

      leftHandle.addEventListener("dblclick", function () {
        panelState.leftCollapsed = false;
        size.left = 320;
        applySizes();
        persistSizes();
      });

      leftToggle.addEventListener("click", function () {
        panelState.leftCollapsed = !panelState.leftCollapsed;
        applySizes();
        persistSizes();
      });

      rightToggle.addEventListener("click", function () {
        panelState.rightCollapsed = !panelState.rightCollapsed;
        applySizes();
        persistSizes();
      });

      bottomToggle.addEventListener("click", function () {
        panelState.bottomCollapsed = !panelState.bottomCollapsed;
        applySizes();
        persistSizes();
      });

      window.addEventListener("resize", applySizes);
      // Re-run whenever the "Swap panel sides" General setting or the
      // active language changes - both feed applySizes()'s isRtl/
      // activityLast computation above.
      document.addEventListener("newui:general-settings-changed", applySizes);
      window.addEventListener("netrecon:language-changed", applySizes);
      syncToggleLabels();
      applySizes();
    }

    return {
      init: init,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createLayoutRuntime = createLayoutRuntime;
})();
