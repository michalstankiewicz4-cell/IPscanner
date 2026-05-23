(function () {
  function createCustomScrollbarRuntime() {
    var items = [];
    var itemMap = new WeakMap();
    var resizeObserver = null;
    var mutationObserver = null;

    function targetSelector() {
      return ".v1-tool-list, .v1-card, .v1-detached-tool-body, .v1-versions-list, .v1-ai-threadlist, .v1-ai-chat, .v1-ai-prompt, .v1-console-pane[data-v1-console-pane=\"macro\"], .v1-ps-output, .v1-info-log, .v1-ip-extractor-input, .v1-ip-extractor-output, .v1-lang-manager-grid textarea, .v1-import-manager-grid textarea, .v1-lang-manager-output, .v1-import-output, .v1-results-table-scroll--ip";
    }

    function targets() {
      return Array.from(document.querySelectorAll(targetSelector()));
    }

    function cleanupRemovedItems() {
      items = items.filter(function (item) {
        if (document.body && document.body.contains(item.el)) return true;
        if (item.rail && item.rail.parentNode) {
          item.rail.parentNode.removeChild(item.rail);
        }
        if (item.hRail && item.hRail.parentNode) {
          item.hRail.parentNode.removeChild(item.hRail);
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

      var useHorizontalRail = el.classList.contains("v1-results-table-scroll--ip");
      var hRail = null;
      var hThumb = null;
      if (useHorizontalRail) {
        hRail = document.createElement("div");
        hRail.className = "v1-faux-scrollbar-h";
        hThumb = document.createElement("div");
        hThumb.className = "v1-faux-scrollbar-thumb v1-faux-scrollbar-thumb-h";
        hRail.appendChild(hThumb);
        document.body.appendChild(hRail);
      }

      var item = {
        el: el,
        rail: rail,
        thumb: thumb,
        hRail: hRail,
        hThumb: hThumb,
        dragging: false,
        dragOffset: 0,
        draggingH: false,
        dragOffsetH: 0
      };

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

      if (hRail && hThumb) {
        hThumb.addEventListener("pointerdown", function (event) {
          event.preventDefault();
          event.stopPropagation();
          item.draggingH = true;
          item.dragOffsetH = event.clientX - hThumb.getBoundingClientRect().left;
          hThumb.classList.add("dragging");
          hThumb.setPointerCapture(event.pointerId);
        });

        hThumb.addEventListener("pointermove", function (event) {
          if (!item.draggingH) return;
          var railRect = hRail.getBoundingClientRect();
          var thumbRect = hThumb.getBoundingClientRect();
          var nextLeft = Math.max(0, Math.min(railRect.width - thumbRect.width, event.clientX - railRect.left - item.dragOffsetH));
          var ratio = nextLeft / Math.max(1, railRect.width - thumbRect.width);
          el.scrollLeft = ratio * Math.max(1, el.scrollWidth - el.clientWidth);
          updateOne(item);
        });

        hThumb.addEventListener("pointerup", function (event) {
          item.draggingH = false;
          hThumb.classList.remove("dragging");
          hThumb.releasePointerCapture(event.pointerId);
        });

        hThumb.addEventListener("pointercancel", function () {
          item.draggingH = false;
          hThumb.classList.remove("dragging");
        });

        hRail.addEventListener("pointerdown", function (event) {
          if (event.target === hThumb) return;
          var railRect = hRail.getBoundingClientRect();
          var thumbRect = hThumb.getBoundingClientRect();
          var clickCenter = event.clientX - railRect.left - thumbRect.width / 2;
          var nextLeft = Math.max(0, Math.min(railRect.width - thumbRect.width, clickCenter));
          var ratio = nextLeft / Math.max(1, railRect.width - thumbRect.width);
          el.scrollLeft = ratio * Math.max(1, el.scrollWidth - el.clientWidth);
          updateOne(item);
        });
      }

      if (resizeObserver) resizeObserver.observe(el);

      itemMap.set(el, item);
      items.push(item);
      return item;
    }

    function ensureItems() {
      targets().forEach(attachItem);
      cleanupRemovedItems();
    }

    function resolveRailZIndex(el) {
      var base = 20;
      if (!el || !el.closest) return base;
      var detachedCard = el.closest(".v1-detached-tool-card");
      if (!detachedCard) return base;
      var rawZ = window.getComputedStyle(detachedCard).zIndex;
      var parsedZ = Number(rawZ);
      if (!Number.isFinite(parsedZ)) return base;
      return Math.max(base, parsedZ + 1);
    }

    function updateOne(item) {
      var el = item.el;
      var rail = item.rail;
      var thumb = item.thumb;
      var layerZ = resolveRailZIndex(el);
      var rect = el.getBoundingClientRect();
      var styles = getComputedStyle(el);
      var isVisible = rect.width > 0 && rect.height > 0 && styles.display !== "none";
      var overflowY = (styles.overflowY || "").toLowerCase();
      var overflow = (styles.overflow || "").toLowerCase();
      var allowsVerticalScroll = ["visible", "auto", "scroll", "overlay"].indexOf(overflowY) >= 0
        || ["visible", "auto", "scroll", "overlay"].indexOf(overflow) >= 0;
      var scrollable = allowsVerticalScroll && (el.scrollHeight > el.clientHeight + 1);

      if (isVisible && scrollable) {
        var railWidth = 10;
        var thumbMin = 24;
        var railHeight = rect.height;
        var ratio = el.clientHeight / el.scrollHeight;
        var thumbHeight = Math.max(thumbMin, Math.floor(railHeight * ratio));
        var maxThumbTop = Math.max(0, railHeight - thumbHeight);
        var scrollRange = Math.max(1, el.scrollHeight - el.clientHeight);
        var thumbTop = Math.floor((el.scrollTop / scrollRange) * maxThumbTop);

        rail.style.display = "block";
        rail.style.zIndex = String(layerZ);
        rail.style.top = rect.top + "px";
        rail.style.left = rect.right - railWidth + "px";
        rail.style.height = railHeight + "px";

        thumb.style.height = thumbHeight + "px";
        thumb.style.top = thumbTop + "px";
      } else {
        rail.style.display = "none";
      }

      if (item.hRail && item.hThumb) {
        var horizontalStyles = getComputedStyle(el);
        var overflowXValue = (horizontalStyles.overflowX || "").toLowerCase();
        var overflowValue = (horizontalStyles.overflow || "").toLowerCase();
        var canScrollHorizontally = ["visible", "auto", "scroll", "overlay"].indexOf(overflowXValue) >= 0
          || ["visible", "auto", "scroll", "overlay"].indexOf(overflowValue) >= 0;
        var hasHorizontalOverflow = canScrollHorizontally && (el.scrollWidth > el.clientWidth + 1);

        if (!isVisible || !hasHorizontalOverflow) {
          item.hRail.style.display = "none";
        } else {
          var horizontalRailHeight = 10;
          var horizontalRailWidth = rect.width;
          var horizontalThumbMin = 24;
          var horizontalRatio = el.clientWidth / el.scrollWidth;
          var horizontalThumbWidth = Math.max(horizontalThumbMin, Math.floor(horizontalRailWidth * horizontalRatio));
          var horizontalMaxThumbLeft = Math.max(0, horizontalRailWidth - horizontalThumbWidth);
          var horizontalScrollRange = Math.max(1, el.scrollWidth - el.clientWidth);
          var horizontalThumbLeft = Math.floor((el.scrollLeft / horizontalScrollRange) * horizontalMaxThumbLeft);

          item.hRail.style.display = "block";
          item.hRail.style.zIndex = String(layerZ);
          item.hRail.style.left = rect.left + "px";
          item.hRail.style.top = rect.bottom - horizontalRailHeight + "px";
          item.hRail.style.width = horizontalRailWidth + "px";

          item.hThumb.style.width = horizontalThumbWidth + "px";
          item.hThumb.style.left = horizontalThumbLeft + "px";
        }
      }
    }

    function refresh() {
      ensureItems();
      items.forEach(updateOne);
    }

    function init() {
      resizeObserver = new ResizeObserver(refresh);
      ensureItems();

      mutationObserver = new MutationObserver(function (mutations) {
        var foundCandidate = mutations.some(function (mutation) {
          if (!mutation.addedNodes || !mutation.addedNodes.length) return false;
          return Array.from(mutation.addedNodes).some(function (node) {
            if (!(node instanceof Element)) return false;
            if (node.matches && node.matches(targetSelector())) return true;
            return !!(node.querySelector && node.querySelector(targetSelector()));
          });
        });
        if (foundCandidate) refresh();
      });
      if (document.body) {
        mutationObserver.observe(document.body, { childList: true, subtree: true });
      }

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
