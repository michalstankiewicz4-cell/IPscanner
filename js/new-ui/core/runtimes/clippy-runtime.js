(function () {
  function createClippyRuntime(deps) {
    var tr = deps.tr;
    var setStatusLine = deps.setStatusLine;
    var initialLang = deps.initialLang || "en";

    var container = null;
    var tipText = null;
    var closeBtn = null;
    var bubble = null;
    var charBtn = null;
    var shell = null;

    var STORAGE_KEY = "netrecon_newui_clippy_enabled";
    var TIP_INTERVAL_MS = 9000;
    var tipIndex = 0;
    var timerId = null;
    var lang = normalizeLang(initialLang);
    var dragState = null;
    var suppressNextBubbleClick = false;

    var tipKeys = ["clippyTip1", "clippyTip2", "clippyTip3", "clippyTip4"];

    function normalizeLang(code) {
      return code === "pl" ? "pl" : "en";
    }

    function isVisible() {
      return !!container && !container.classList.contains("v1-clippy-hidden");
    }

    function currentTips() {
      return tipKeys
        .map(function (key) { return tr(key); })
        .filter(function (text, index) {
          return !!text && text !== tipKeys[index];
        });
    }

    function renderTip() {
      if (!tipText) return;
      var list = currentTips();
      if (!list.length) return;
      tipText.textContent = list[tipIndex % list.length];
      animateChar();
      if (isVisible()) {
        requestAnimationFrame(function () {
          keepInsideShell();
        });
      }
    }

    function nextTip() {
      var list = currentTips();
      if (!list.length) return;
      tipIndex = (tipIndex + 1) % list.length;
      renderTip();
    }

    function animateChar() {
      if (!charBtn) return;
      charBtn.classList.remove("v1-clippy-wiggle");
      void charBtn.offsetWidth;
      charBtn.classList.add("v1-clippy-wiggle");
    }

    function parsePixels(value) {
      var parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function currentBox() {
      if (!container) return { width: 0, height: 0 };
      return container.getBoundingClientRect();
    }

    function shellBox() {
      if (!shell) return { width: window.innerWidth, height: window.innerHeight };
      return shell.getBoundingClientRect();
    }

    function setPosition(left, top) {
      if (!container) return;
      var box = currentBox();
      var bounds = shellBox();
      var maxLeft = Math.max(0, bounds.width - box.width);
      var maxTop = Math.max(0, bounds.height - box.height);
      var nextLeft = clamp(left, 0, maxLeft);
      var nextTop = clamp(top, 0, maxTop);
      container.style.left = nextLeft + "px";
      container.style.top = nextTop + "px";
      container.style.right = "auto";
      container.style.bottom = "auto";
    }

    function keepInsideShell() {
      if (!container || !isVisible()) return;
      var rect = container.getBoundingClientRect();
      var bounds = shellBox();
      setPosition(rect.left - bounds.left, rect.top - bounds.top);
    }

    function syncPositionFromAnchors() {
      if (!container) return;
      var box = currentBox();
      var bounds = shellBox();
      var right = parsePixels(container.style.right);
      var bottom = parsePixels(container.style.bottom);
      if (container.style.left === "" && container.style.top === "" && (right || bottom)) {
        setPosition(Math.max(0, bounds.width - box.width - right), Math.max(0, bounds.height - box.height - bottom));
      }
    }

    function beginDrag(clientX, clientY) {
      if (!container) return;
      syncPositionFromAnchors();
      var rect = container.getBoundingClientRect();
      dragState = {
        startX: clientX,
        startY: clientY,
        startLeft: rect.left - shellBox().left,
        startTop: rect.top - shellBox().top,
        moved: false
      };
      container.classList.add("v1-clippy-dragging");
      document.addEventListener("mousemove", onDragMove);
      document.addEventListener("mouseup", endDrag);
    }

    function onDragMove(event) {
      if (!dragState || !container) return;
      var dx = event.clientX - dragState.startX;
      var dy = event.clientY - dragState.startY;
      if (!dragState.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        dragState.moved = true;
      }
      if (!dragState.moved) return;
      setPosition(dragState.startLeft + dx, dragState.startTop + dy);
      event.preventDefault();
    }

    function endDrag() {
      if (!dragState || !container) return;
      var wasDragged = dragState.moved;
      dragState = null;
      container.classList.remove("v1-clippy-dragging");
      document.removeEventListener("mousemove", onDragMove);
      document.removeEventListener("mouseup", endDrag);
      if (wasDragged) {
        suppressNextBubbleClick = true;
      }
    }

    function stopTimer() {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
    }

    function startTimer() {
      stopTimer();
      timerId = setInterval(function () {
        nextTip();
      }, TIP_INTERVAL_MS);
    }

    function show() {
      if (!container) return;
      container.classList.remove("v1-clippy-hidden");
      localStorage.setItem(STORAGE_KEY, "1");
      renderTip();
      startTimer();
      keepInsideShell();
      if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("clippyOn"));
    }

    function hide() {
      if (!container) return;
      container.classList.add("v1-clippy-hidden");
      localStorage.setItem(STORAGE_KEY, "0");
      stopTimer();
      if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("clippyOff"));
    }

    function toggle() {
      if (isVisible()) hide();
      else show();
    }

    function setLanguage(nextLang) {
      lang = normalizeLang(nextLang);
      tipIndex = 0;
      if (isVisible()) renderTip();
    }

    function bindEvents() {
      if (charBtn) {
        charBtn.addEventListener("mousedown", function (event) {
          if (event.button !== 0) return;
          event.preventDefault();
          beginDrag(event.clientX, event.clientY);
        });

        charBtn.addEventListener("click", function () {
          if (suppressNextBubbleClick) {
            suppressNextBubbleClick = false;
            return;
          }
          nextTip();
          startTimer();
        });
      }

      if (bubble) {
        bubble.addEventListener("mousedown", function (event) {
          if (event.button !== 0) return;
          if (event.target === closeBtn) return;
          if (event.target === charBtn) return;
          event.preventDefault();
          beginDrag(event.clientX, event.clientY);
        });

        bubble.addEventListener("click", function (event) {
          if (event.target === closeBtn) return;
          if (suppressNextBubbleClick) {
            suppressNextBubbleClick = false;
            return;
          }
          nextTip();
          startTimer();
        });
      }

      if (closeBtn) {
        closeBtn.addEventListener("click", function () {
          hide();
        });
      }
    }

    function init() {
      shell = document.querySelector(".v1-shell");
      container = document.getElementById("v1ClippyContainer");
      tipText = document.getElementById("v1ClippyTipText");
      closeBtn = document.getElementById("v1ClippyClose");
      bubble = document.getElementById("v1ClippyBubble");
      charBtn = document.getElementById("v1ClippyChar");

      if (!container || !tipText || !bubble || !charBtn) {
        return {
          toggle: function () {},
          show: function () {},
          hide: function () {},
          setLanguage: function () {},
          isVisible: function () { return false; }
        };
      }

      bindEvents();
      renderTip();
      syncPositionFromAnchors();

      if (localStorage.getItem(STORAGE_KEY) === "1") {
        show();
      } else {
        hide();
      }

      window.addEventListener("resize", function () {
        if (!isVisible()) return;
        keepInsideShell();
      });

      return {
        toggle: toggle,
        show: show,
        hide: hide,
        setLanguage: setLanguage,
        isVisible: isVisible
      };
    }

    return {
      init: init,
      toggle: toggle,
      show: show,
      hide: hide,
      setLanguage: setLanguage,
      isVisible: isVisible
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createClippyRuntime = createClippyRuntime;
})();
