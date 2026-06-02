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
      var leftHandle = document.querySelector('[data-resize="left"]');
      var rightHandle = document.querySelector('[data-resize="right"]');
      var consoleHandle = document.querySelector('[data-resize="console"]');
      var leftToggle = document.querySelector('[data-panel-toggle="left"]');
      var rightToggle = document.querySelector('[data-panel-toggle="right"]');
      var bottomToggle = document.querySelector('[data-panel-toggle="bottom"]');
      var statusRight = document.getElementById("v1StatusRight");
      if (!main || !editor || !sidebar || !rightbar || !leftHandle || !rightHandle || !consoleHandle || !leftToggle || !rightToggle || !bottomToggle) return;

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
        main.style.gridTemplateColumns = "48px " + leftWidth + "px 6px minmax(0, 1fr) 6px " + rightWidth + "px";

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

        if (drag.type === "left") {
          size.left = Math.max(180, Math.min(460, drag.left + (event.clientX - drag.startX)));
          if (statusRight) statusRight.textContent = "left width: " + size.left + "px";
        }

        if (drag.type === "right") {
          size.right = Math.max(220, Math.min(520, drag.right - (event.clientX - drag.startX)));
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
        refreshCustomScrollbars();
      });

      leftToggle.addEventListener("click", function () {
        panelState.leftCollapsed = !panelState.leftCollapsed;
        applySizes();
        refreshCustomScrollbars();
      });

      rightToggle.addEventListener("click", function () {
        panelState.rightCollapsed = !panelState.rightCollapsed;
        applySizes();
        refreshCustomScrollbars();
      });

      bottomToggle.addEventListener("click", function () {
        panelState.bottomCollapsed = !panelState.bottomCollapsed;
        applySizes();
        refreshCustomScrollbars();
      });

      window.addEventListener("resize", applySizes);
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
