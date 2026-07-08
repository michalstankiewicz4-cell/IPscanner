(function () {
  var SHELL_SCROLL_TARGETS = [
    ".v1-tool-list",
    ".v1-card",
    ".v1-detached-tool-body",
    ".v1-versions-list",
    ".v1-ai-threadlist",
    ".v1-ai-chat",
    ".v1-ai-prompt",
    ".v1-console-pane[data-v1-console-pane=\"macro\"]",
    ".v1-ps-output",
    ".v1-info-log",
    ".v1-lang-manager-grid textarea",
    ".v1-import-manager-grid textarea",
    ".v1-lang-manager-output",
    ".v1-import-output",
    ".listview-body",
    ".v1-session-welcome-list",
  ];

  var TOOL_IP_SCANNER_SCROLL_TARGETS = [
    ".v1-ip-extractor-input",
    ".v1-ip-extractor-output",
    ".v1-results-table-scroll--ip",
  ];

  function createCustomScrollbarRuntime() {
    var items = [];
    var itemMap = new WeakMap();
    var resizeObserver = null;
    var mutationObserver = null;
    var refreshRafId = 0;
    var detachedDragActive = false;
    var activeDetachedCard = null;

    function normalizeActiveDetachedCard() {
      if (!activeDetachedCard) return;
      if (!document.body || !document.body.contains(activeDetachedCard)) {
        activeDetachedCard = null;
      }
    }

    function getScrollbarSizePx() {
      var raw = "";
      try {
        raw = getComputedStyle(document.documentElement).getPropertyValue("--v1-faux-scrollbar-size") || "";
      } catch (_) {
        raw = "";
      }
      var parsed = Number(String(raw).replace("px", "").trim());
      if (!Number.isFinite(parsed) || parsed <= 0) return 10;
      return parsed;
    }

    function targetSelector() {
      return SHELL_SCROLL_TARGETS.concat(TOOL_IP_SCANNER_SCROLL_TARGETS).join(", ");
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

      // TODO(shell-split): tool-specific, see targetSelector()
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

    function scheduleRefresh() {
      if (refreshRafId) return;
      if (typeof window.requestAnimationFrame !== "function") {
        refresh();
        return;
      }
      refreshRafId = window.requestAnimationFrame(function () {
        refreshRafId = 0;
        refresh();
      });
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

    function intersectsRect(a, b) {
      return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    }

    function isHostInVisibleTree(el) {
      if (!el || !el.isConnected) return false;
      var current = el;
      while (current && current.nodeType === 1) {
        var styles = window.getComputedStyle(current);
        if (styles.display === "none" || styles.visibility === "hidden") {
          return false;
        }
        current = current.parentElement;
      }
      return true;
    }

    function intersectsViewport(rect) {
      var viewportWidth = Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0);
      var viewportHeight = Math.max(0, window.innerHeight || document.documentElement.clientHeight || 0);
      if (viewportWidth <= 0 || viewportHeight <= 0) return false;
      return rect.right > 0 && rect.left < viewportWidth && rect.bottom > 0 && rect.top < viewportHeight;
    }

    function isClippingOverflow(value) {
      var normalized = String(value || "").toLowerCase();
      return normalized === "hidden" || normalized === "clip" || normalized === "auto" || normalized === "scroll";
    }

    function clipBoundsToRect(bounds, rect) {
      bounds.left = Math.max(bounds.left, rect.left);
      bounds.right = Math.min(bounds.right, rect.right);
      bounds.top = Math.max(bounds.top, rect.top);
      bounds.bottom = Math.min(bounds.bottom, rect.bottom);
    }

    function resolveVisibleBounds(el, rect) {
      var viewportWidth = Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0);
      var viewportHeight = Math.max(0, window.innerHeight || document.documentElement.clientHeight || 0);

      var bounds = {
        left: Math.max(0, rect.left),
        right: Math.min(viewportWidth, rect.right),
        top: Math.max(0, rect.top),
        bottom: Math.min(viewportHeight, rect.bottom)
      };

      if (!el || !el.closest) return bounds;

      // Always clamp rails to the nearest layout pane to prevent bleed into sibling columns.
      var paneHost = el.closest(".v1-sidebar, .v1-editor, .v1-rightbar");
      if (paneHost) {
        clipBoundsToRect(bounds, paneHost.getBoundingClientRect());
      }

      // Constrain faux rails to clipping ancestors (e.g. main editor content above console).
      var current = el.parentElement;
      while (current && current.nodeType === 1) {
        var style = window.getComputedStyle(current);
        if (isClippingOverflow(style.overflow) || isClippingOverflow(style.overflowX) || isClippingOverflow(style.overflowY)) {
          clipBoundsToRect(bounds, current.getBoundingClientRect());
        }
        current = current.parentElement;
      }

      var detachedCard = el.closest(".v1-detached-tool-card");
      if (!detachedCard) return bounds;

      var cardRect = detachedCard.getBoundingClientRect();
      clipBoundsToRect(bounds, cardRect);

      return bounds;
    }

    function getTopDetachedCard() {
      var cards = Array.from(document.querySelectorAll(".v1-detached-tool-card"));
      var best = null;
      var bestZ = Number.NEGATIVE_INFINITY;
      cards.forEach(function (card) {
        var style = window.getComputedStyle(card);
        if (style.display === "none" || style.visibility === "hidden") return;
        var rect = card.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        var z = Number(style.zIndex);
        if (!Number.isFinite(z)) z = 0;
        if (z >= bestZ) {
          bestZ = z;
          best = card;
        }
      });
      return best;
    }

    function isHostOccludedByHigherDetachedCard(el, rect) {
      if (!el || !el.closest) return false;
      normalizeActiveDetachedCard();
      var focusedCard = activeDetachedCard || getTopDetachedCard();
      var selfCard = el.closest(".v1-detached-tool-card");

      if (!selfCard) {
        var visibleCards = Array.from(document.querySelectorAll(".v1-detached-tool-card"));
        return visibleCards.some(function (card) {
          var style = window.getComputedStyle(card);
          if (style.display === "none" || style.visibility === "hidden") return false;
          var cardRect = card.getBoundingClientRect();
          if (cardRect.width <= 0 || cardRect.height <= 0) return false;
          return intersectsRect(rect, cardRect);
        });
      }

      // Outside active interaction, keep faux rails only on focused/top detached window.
      if (focusedCard && focusedCard !== selfCard) {
        return true;
      }

      // While actively dragging one detached card, keep rails focused on that card.
      if (detachedDragActive && activeDetachedCard && activeDetachedCard !== selfCard) {
        return true;
      }

      // When not dragging, focused-card rule above is enough.
      if (!detachedDragActive) {
        return false;
      }

      var selfZRaw = window.getComputedStyle(selfCard).zIndex;
      var selfZ = Number(selfZRaw);
      if (!Number.isFinite(selfZ)) selfZ = 0;

      var cards = Array.from(document.querySelectorAll(".v1-detached-tool-card"));

      return cards.some(function (card) {
        if (card === selfCard) return false;
        var style = window.getComputedStyle(card);
        if (style.display === "none" || style.visibility === "hidden") return false;
        var otherZ = Number(style.zIndex);
        if (!Number.isFinite(otherZ) || otherZ <= selfZ) return false;
        var otherRect = card.getBoundingClientRect();
        if (otherRect.width <= 0 || otherRect.height <= 0) return false;
        return intersectsRect(rect, otherRect);
      });
    }

    function isMenuDropdownOpen() {
      return !!document.querySelector(".v1-menu-group.open .v1-menu-dropdown");
    }

    function updateOne(item) {
      var el = item.el;
      var rail = item.rail;
      var thumb = item.thumb;
      var layerZ = resolveRailZIndex(el);
      var scrollbarSize = getScrollbarSizePx();
      var rect = el.getBoundingClientRect();
      var visibleBounds = resolveVisibleBounds(el, rect);
      var visibleWidth = Math.max(0, visibleBounds.right - visibleBounds.left);
      var visibleHeight = Math.max(0, visibleBounds.bottom - visibleBounds.top);
      var styles = getComputedStyle(el);
      var isVisibleTree = isHostInVisibleTree(el);
      var inViewport = intersectsViewport(rect);
      var isVisible = isVisibleTree && inViewport && rect.width > 0 && rect.height > 0 && visibleWidth > 0 && visibleHeight > 0;
      var isOccluded = isHostOccludedByHigherDetachedCard(el, rect) || isMenuDropdownOpen();
      var overflowY = (styles.overflowY || "").toLowerCase();
      var overflow = (styles.overflow || "").toLowerCase();
      var allowsVerticalScroll = ["auto", "scroll", "overlay"].indexOf(overflowY) >= 0
        || ["auto", "scroll", "overlay"].indexOf(overflow) >= 0;
      var scrollable = !isOccluded && allowsVerticalScroll && (el.scrollHeight > el.clientHeight + 1);

      if (isVisible && scrollable) {
        var railWidth = scrollbarSize;
        var thumbMin = 24;
        var railHeight = visibleHeight;
        var ratio = el.clientHeight / el.scrollHeight;
        var thumbHeight = Math.max(thumbMin, Math.floor(railHeight * ratio));
        var maxThumbTop = Math.max(0, railHeight - thumbHeight);
        var scrollRange = Math.max(1, el.scrollHeight - el.clientHeight);
        var thumbTop = Math.floor((el.scrollTop / scrollRange) * maxThumbTop);

        rail.style.display = "block";
        rail.style.zIndex = String(layerZ);
        rail.style.top = visibleBounds.top + "px";
        rail.style.left = Math.max(visibleBounds.left, visibleBounds.right - railWidth) + "px";
        rail.style.height = railHeight + "px";

        thumb.style.height = thumbHeight + "px";
        thumb.style.top = thumbTop + "px";
      } else {
        rail.style.display = "none";
        rail.style.height = "0px";
      }

      if (item.hRail && item.hThumb) {
        var horizontalStyles = getComputedStyle(el);
        var overflowXValue = (horizontalStyles.overflowX || "").toLowerCase();
        var overflowValue = (horizontalStyles.overflow || "").toLowerCase();
        var canScrollHorizontally = ["auto", "scroll", "overlay"].indexOf(overflowXValue) >= 0
          || ["auto", "scroll", "overlay"].indexOf(overflowValue) >= 0;
        var hasHorizontalOverflow = !isOccluded && canScrollHorizontally && (el.scrollWidth > el.clientWidth + 1);

        if (!isVisible || !hasHorizontalOverflow) {
          item.hRail.style.display = "none";
          item.hRail.style.width = "0px";
        } else {
          var horizontalRailHeight = scrollbarSize;
          var visibleLeft = visibleBounds.left;
          var visibleRight = visibleBounds.right;
          var visibleBottom = visibleBounds.bottom;
          var horizontalRailWidth = Math.max(0, visibleRight - visibleLeft);
          var horizontalThumbMin = 24;
          var horizontalRatio = el.clientWidth / el.scrollWidth;
          var horizontalThumbWidth = Math.max(horizontalThumbMin, Math.floor(horizontalRailWidth * horizontalRatio));
          horizontalThumbWidth = Math.min(horizontalRailWidth, horizontalThumbWidth);
          var horizontalMaxThumbLeft = Math.max(0, horizontalRailWidth - horizontalThumbWidth);
          var horizontalScrollRange = Math.max(1, el.scrollWidth - el.clientWidth);
          var horizontalThumbLeft = Math.floor((el.scrollLeft / horizontalScrollRange) * horizontalMaxThumbLeft);
          var horizontalTop = visibleBottom - horizontalRailHeight;

          if (horizontalRailWidth <= 0 || horizontalTop < visibleBounds.top) {
            item.hRail.style.display = "none";
            item.hRail.style.width = "0px";
            return;
          }

          item.hRail.style.display = "block";
          item.hRail.style.zIndex = String(layerZ);
          item.hRail.style.left = visibleLeft + "px";
          item.hRail.style.top = horizontalTop + "px";
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
      resizeObserver = new ResizeObserver(scheduleRefresh);
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
        var menuStateChanged = mutations.some(function (mutation) {
          if (mutation.type !== "attributes" || mutation.attributeName !== "class") return false;
          var target = mutation.target;
          if (!(target instanceof Element)) return false;
          return target.classList.contains("v1-menu-group");
        });
        if (foundCandidate || menuStateChanged) scheduleRefresh();
      });
      if (document.body) {
        mutationObserver.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["class"]
        });
      }

      window.addEventListener("resize", scheduleRefresh);
      document.addEventListener("scroll", scheduleRefresh, true);

      document.addEventListener("pointerdown", function (event) {
        if (!event || event.button !== 0) return;
        if (!event.target || !event.target.closest) return;
        var detachedCard = event.target.closest(".v1-detached-tool-card");
        if (detachedCard) {
          activeDetachedCard = detachedCard;
          detachedDragActive = true;
          scheduleRefresh();
          return;
        }

        // Clicking outside detached cards releases detached-only scrollbar focus.
        activeDetachedCard = null;
        detachedDragActive = false;
        scheduleRefresh();
      }, true);

      document.addEventListener("pointermove", function () {
        if (!detachedDragActive) return;
        scheduleRefresh();
      }, { passive: true });
      document.addEventListener("pointerup", function () {
        if (!detachedDragActive) return;
        detachedDragActive = false;
        scheduleRefresh();
      }, { passive: true });
      document.addEventListener("pointercancel", function () {
        if (!detachedDragActive) return;
        detachedDragActive = false;
        scheduleRefresh();
      }, { passive: true });

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
