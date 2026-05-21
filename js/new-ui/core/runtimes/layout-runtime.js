(function () {
  function createLayoutRuntime(deps) {
    var refreshCustomScrollbars = deps.refreshCustomScrollbars || function () {};
    var tr = deps.tr || function (key) { return key; };

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
        return (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke)
          || (window.__TAURI__ && window.__TAURI__.invoke)
          || (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke)
          || null;
      }

      if (menubar) {
        menubar.addEventListener("pointerdown", function (event) {
          if (event.button !== 0) return;
          if (event.target.closest(".v1-window-btn, .v1-menu-trigger, .v1-menu-dd-item, .v1-menu-group")) return;
          var invoke = getTauriInvoke();
          if (!invoke) return;
          invoke("window_start_dragging").catch(function () {});
        });
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
      }

      window.addEventListener("pointermove", function (event) {
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
