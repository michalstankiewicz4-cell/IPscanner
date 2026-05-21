(function () {
  function createCustomScrollbarRuntime() {
    var items = [];
    var itemMap = new WeakMap();
    var resizeObserver = null;

    function targets() {
      return Array.from(document.querySelectorAll(
        ".v1-tool-list, .v1-card, .v1-versions-list, .v1-ai-threadlist, .v1-ai-chat, .v1-ai-prompt, .v1-console-pane[data-v1-console-pane=\"macro\"], .v1-ps-output, .v1-info-log, .v1-ip-extractor-input, .v1-ip-extractor-output, .v1-lang-manager-grid textarea, .v1-import-manager-grid textarea, .v1-lang-manager-output, .v1-import-output"
      ));
    }

    function cleanupRemovedItems() {
      items = items.filter(function (item) {
        if (document.body && document.body.contains(item.el)) return true;
        if (item.rail && item.rail.parentNode) {
          item.rail.parentNode.removeChild(item.rail);
        }
        itemMap.delete(item.el);
        return false;
      });
    }

    function attachItem(el) {
      if (!el || itemMap.has(el)) return itemMap.get(el) || null;

      el.classList.add("v1-custom-scroll-host");

      var rail = document.createElement("div");
      rail.className = "v1-faux-scrollbar";

      var thumb = document.createElement("div");
      thumb.className = "v1-faux-scrollbar-thumb";
      rail.appendChild(thumb);
      document.body.appendChild(rail);

      var item = { el: el, rail: rail, thumb: thumb, dragging: false, dragOffset: 0 };

      el.addEventListener("scroll", function () { updateOne(item); }, { passive: true });

      thumb.addEventListener("pointerdown", function (event) {
        event.preventDefault();
        event.stopPropagation();
        item.dragging = true;
        item.dragOffset = event.clientY - thumb.getBoundingClientRect().top;
        thumb.classList.add("dragging");
        thumb.setPointerCapture(event.pointerId);
      });

      thumb.addEventListener("pointermove", function (event) {
        if (!item.dragging) return;
        var railRect = rail.getBoundingClientRect();
        var thumbRect = thumb.getBoundingClientRect();
        var nextTop = Math.max(0, Math.min(railRect.height - thumbRect.height, event.clientY - railRect.top - item.dragOffset));
        var ratio = nextTop / Math.max(1, railRect.height - thumbRect.height);
        el.scrollTop = ratio * Math.max(1, el.scrollHeight - el.clientHeight);
        updateOne(item);
      });

      thumb.addEventListener("pointerup", function (event) {
        item.dragging = false;
        thumb.classList.remove("dragging");
        thumb.releasePointerCapture(event.pointerId);
      });

      thumb.addEventListener("pointercancel", function () {
        item.dragging = false;
        thumb.classList.remove("dragging");
      });

      rail.addEventListener("pointerdown", function (event) {
        if (event.target === thumb) return;
        var railRect = rail.getBoundingClientRect();
        var thumbRect = thumb.getBoundingClientRect();
        var clickCenter = event.clientY - railRect.top - thumbRect.height / 2;
        var nextTop = Math.max(0, Math.min(railRect.height - thumbRect.height, clickCenter));
        var ratio = nextTop / Math.max(1, railRect.height - thumbRect.height);
        el.scrollTop = ratio * Math.max(1, el.scrollHeight - el.clientHeight);
        updateOne(item);
      });

      if (resizeObserver) resizeObserver.observe(el);

      itemMap.set(el, item);
      items.push(item);
      return item;
    }

    function ensureItems() {
      targets().forEach(attachItem);
      cleanupRemovedItems();
    }

    function updateOne(item) {
      var el = item.el;
      var rail = item.rail;
      var thumb = item.thumb;
      var rect = el.getBoundingClientRect();
      var styles = getComputedStyle(el);
      var isVisible = rect.width > 0 && rect.height > 0 && styles.display !== "none";
      var overflowY = (styles.overflowY || "").toLowerCase();
      var overflow = (styles.overflow || "").toLowerCase();
      var allowsVerticalScroll = ["visible", "auto", "scroll", "overlay"].indexOf(overflowY) >= 0
        || ["visible", "auto", "scroll", "overlay"].indexOf(overflow) >= 0;
      var scrollable = allowsVerticalScroll && (el.scrollHeight > el.clientHeight + 1);

      if (!isVisible || !scrollable) {
        rail.style.display = "none";
        return;
      }

      var railWidth = 10;
      var thumbMin = 24;
      var railHeight = rect.height;
      var ratio = el.clientHeight / el.scrollHeight;
      var thumbHeight = Math.max(thumbMin, Math.floor(railHeight * ratio));
      var maxThumbTop = Math.max(0, railHeight - thumbHeight);
      var scrollRange = Math.max(1, el.scrollHeight - el.clientHeight);
      var thumbTop = Math.floor((el.scrollTop / scrollRange) * maxThumbTop);

      rail.style.display = "block";
      rail.style.top = rect.top + "px";
      rail.style.left = rect.right - railWidth + "px";
      rail.style.height = railHeight + "px";

      thumb.style.height = thumbHeight + "px";
      thumb.style.top = thumbTop + "px";
    }

    function refresh() {
      ensureItems();
      items.forEach(updateOne);
    }

    function init() {
      resizeObserver = new ResizeObserver(refresh);
      ensureItems();

      window.addEventListener("resize", refresh);
      document.addEventListener("scroll", refresh, true);

      refresh();
      return {
        refresh: refresh,
      };
    }

    return {
      init: init,
      refresh: refresh,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createCustomScrollbarRuntime = createCustomScrollbarRuntime;
})();
