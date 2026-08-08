(function () {
  // shell: generic detached-card/workbench-tab engine (open/close/detach/
  // arrange/resize any tool's card) makes up most of this file. Three
  // formerly-tangled tool sections have been extracted to sibling runtimes,
  // instantiated alongside panelContentRuntime etc. and dispatched via
  // wireToolRuntime exactly as before: IP Library (runtimes/ip-library-runtime.js),
  // the Language Manager catalog (runtimes/language-catalog-runtime.js), and
  // the GitHub addon catalog / "www addons" (runtimes/addon-catalog-runtime.js).
  // None of the three referenced this file's shared detach/redock state;
  // the addon-catalog runtime does call back into this file's own
  // refreshActiveUI/registerExtensionCommands, passed in as deps.
  // wireDetachedResultsIp (Results IP detached-window wiring) remains here
  // since it's part of the generic engine itself. A couple of small
  // hardcoded tool-id checks are labeled inline (wireToolRuntime, switchTool).
  function createPanelsRuntime(deps) {
    var tr = deps.tr;
    var getToolInfoMap = deps.getToolInfoMap;
    var versionsData = Array.isArray(deps.versionsData) ? deps.versionsData : [];
    var platform = deps.platform || ((window.NetReconNewUICore && window.NetReconNewUICore.platform) || {});
    var storage = platform.storage || null;
    var escapeHtml = window.NetReconNewUICore.utils.dom.escapeHtml;
    var store = deps.store;
    var extensionHost = deps.extensionHost;
    var commandBus = deps.commandBus || null;
    var i18n = deps.i18n;
    var onAfterRender = deps.onAfterRender;
    var setStatusLine = deps.setStatusLine;
    // Domyślnie brak aktywnej zakładki, wszystkie taby zamknięte
    var activeTool = null;
    var detachedCards = Object.create(null);
    var swapSourceCard = null;
    var detachedZCounter = 70;
    var DETACHED_LAYOUTS_KEY = "netrecon_detached_layouts_v1";
    var DETACHED_ARRANGE_STATE_KEY = "netrecon_detached_arrange_state_v1";
    var DETACHED_AUTO_ARRANGE_ENABLED_KEY = "netrecon_detached_auto_arrange_enabled_v1";
    var autoArrangeOnUndockEnabled = readDetachedAutoArrangeEnabled();

    var storageGet = typeof deps.storageGet === "function"
      ? deps.storageGet
      : function (key) {
          if (storage && typeof storage.getItem === "function") {
            return storage.getItem(key);
          }
          return window.localStorage ? window.localStorage.getItem(key) : null;
        };

    var storageSet = typeof deps.storageSet === "function"
      ? deps.storageSet
      : function (key, value) {
          if (storage && typeof storage.setItem === "function") {
            return storage.setItem(key, value);
          }
          if (!window.localStorage) return false;
          window.localStorage.setItem(key, value);
          return true;
        };

    function resetPersistentMemory() {
      try {
        if (storage && typeof storage.clear === "function") {
          storage.clear();
        } else if (window.localStorage && typeof window.localStorage.clear === "function") {
          window.localStorage.clear();
        }
      } catch (_) {
        // ignore storage clear failures
      }

      try {
        if (window.sessionStorage && typeof window.sessionStorage.clear === "function") {
          window.sessionStorage.clear();
        }
      } catch (_) {
        // ignore session storage clear failures
      }

      try {
        var core = window.NetReconNewUICore || null;
        if (core && Object.prototype.hasOwnProperty.call(core, "__netreconIpLibraryCache")) {
          delete core.__netreconIpLibraryCache;
        }
      } catch (_) {
        // ignore in-memory cache clear failures
      }
    }

    function readDetachedLayouts() {
      try {
        var raw = storageGet(DETACHED_LAYOUTS_KEY) || "";
        if (!raw) return {};
        var parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (_) {
        return {};
      }
    }

    function writeDetachedLayouts(layouts) {
      try {
        storageSet(DETACHED_LAYOUTS_KEY, JSON.stringify(layouts || {}));
      } catch (_) {
        // ignore persistence failures
      }
    }

    function saveDetachedLayout(tool, layout) {
      if (!tool || !layout) return;
      var all = readDetachedLayouts();
      all[tool] = layout;
      writeDetachedLayouts(all);
    }

    function clearDetachedLayout(tool) {
      if (!tool) return;
      var all = readDetachedLayouts();
      if (!Object.prototype.hasOwnProperty.call(all, tool)) return;
      delete all[tool];
      writeDetachedLayouts(all);
    }

    function readDetachedArrangeState() {
      try {
        var raw = storageGet(DETACHED_ARRANGE_STATE_KEY) || "";
        if (!raw) return {};
        var parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (_) {
        return {};
      }
    }

    function readDetachedAutoArrangeEnabled() {
      try {
        var raw = storageGet(DETACHED_AUTO_ARRANGE_ENABLED_KEY) || "";
        if (!raw) return true;
        if (raw === "0" || raw === "false") return false;
        return true;
      } catch (_) {
        return true;
      }
    }

    function writeDetachedAutoArrangeEnabled(enabled) {
      try {
        storageSet(DETACHED_AUTO_ARRANGE_ENABLED_KEY, enabled ? "1" : "0");
      } catch (_) {
        // ignore persistence failures
      }
    }

    function writeDetachedArrangeState(state) {
      try {
        storageSet(DETACHED_ARRANGE_STATE_KEY, JSON.stringify(state || {}));
      } catch (_) {
        // ignore persistence failures
      }
    }

    function getArrangementVariant(count, advance) {
      if (count !== 2 && count !== 3) return 0;
      var state = readDetachedArrangeState();
      var key = String(count);
      var current = Number(state[key]);
      var safeCurrent = Number.isFinite(current) ? current % 2 : 0;
      if (!advance) {
        return safeCurrent;
      }
      var next = (safeCurrent + 1) % 2;
      state[key] = next;
      writeDetachedArrangeState(state);
      return next;
    }

    function getDefaultDetachedLayout() {
      var area = getDetachedWorkspaceRect();
      var minWidth = Math.min(460, area.width);
      var minHeight = Math.min(260, area.height);
      var width = Math.min(980, Math.max(minWidth, area.width - 64));
      var height = Math.min(Math.round(area.height * 0.72), Math.max(minHeight, area.height - 64));
      return {
        top: area.top,
        left: area.left,
        width: width,
        height: height,
      };
    }

    function getDetachedLayout(tool) {
      if (!tool) return null;
      var all = readDetachedLayouts();
      var val = all[tool];
      if (!val || typeof val !== "object") return null;
      var top = Number(val.top);
      var left = Number(val.left);
      var width = Number(val.width);
      var height = Number(val.height);
      if (![top, left, width, height].every(function (n) { return Number.isFinite(n); })) return null;
      return {
        top: top,
        left: left,
        width: width,
        height: height,
      };
    }

    function clampDetachedLayout(layout) {
      var area = getDetachedWorkspaceRect();
      var minWidth = Math.min(460, area.width);
      var minHeight = Math.min(260, area.height);
      var width = Math.max(minWidth, Math.min(layout.width, area.width));
      var height = Math.max(minHeight, Math.min(layout.height, area.height));
      var left = Math.max(area.left, Math.min(layout.left, area.left + area.width - width));
      var top = Math.max(area.top, Math.min(layout.top, area.top + area.height - height));
      return { top: top, left: left, width: width, height: height };
    }

    function clampDetachedResizeLayout(layout) {
      var area = getDetachedWorkspaceRect();
      var minWidth = Math.min(460, area.width);
      var minHeight = Math.min(260, area.height);

      // Keep the top-left anchor stable during CSS resize whenever possible.
      var left = Number.isFinite(layout.left) ? layout.left : area.left;
      var top = Number.isFinite(layout.top) ? layout.top : area.top;
      left = Math.max(area.left, Math.min(left, area.left + area.width - minWidth));
      top = Math.max(area.top, Math.min(top, area.top + area.height - minHeight));

      var maxWidthFromLeft = Math.max(minWidth, area.left + area.width - left);
      var maxHeightFromTop = Math.max(minHeight, area.top + area.height - top);
      var width = Math.max(minWidth, Math.min(layout.width, maxWidthFromLeft));
      var height = Math.max(minHeight, Math.min(layout.height, maxHeightFromTop));

      return { top: top, left: left, width: width, height: height };
    }

    function readCardLayoutFromDom(card) {
      if (!card) return null;
      return {
        top: card.offsetTop,
        left: card.offsetLeft,
        width: card.offsetWidth,
        height: card.offsetHeight,
      };
    }

    function updateDetachedCardResizeLimits(card) {
      if (!card) return;
      var area = getDetachedWorkspaceRect();
      var minWidth = Math.min(460, area.width);
      var minHeight = Math.min(260, area.height);
      var rect = card.getBoundingClientRect();
      var left = Number.isFinite(rect.left) ? rect.left : area.left;
      var top = Number.isFinite(rect.top) ? rect.top : area.top;

      left = Math.max(area.left, Math.min(left, area.left + area.width - minWidth));
      top = Math.max(area.top, Math.min(top, area.top + area.height - minHeight));

      var maxWidth = Math.max(minWidth, Math.floor(area.left + area.width - left));
      var maxHeight = Math.max(minHeight, Math.floor(area.top + area.height - top));
      card.style.maxWidth = maxWidth + "px";
      card.style.maxHeight = maxHeight + "px";
    }

    function setDetachedCardDraggingState(card, dragging) {
      if (!card) return;
      var body = card.querySelector(".v1-detached-tool-body");
      if (!body) return;
      // Keep scrollbar behavior consistent across detached tools while dragging.
      body.style.overflow = "auto";
    }

    function applyCardLayout(card, layout) {
      if (!card || !layout) return;
      var safe = clampDetachedLayout(layout);
      card.style.top = safe.top + "px";
      card.style.left = safe.left + "px";
      card.style.width = safe.width + "px";
      card.style.height = safe.height + "px";
      updateDetachedCardResizeLimits(card);
    }

    function ensureTabPopoutControl(tabEl) {
      if (!tabEl || tabEl.querySelector("[data-tab-popout]")) return;
      var popout = document.createElement("span");
      popout.className = "v1-tab-popout";
      popout.setAttribute("data-tab-popout", "true");
      popout.setAttribute("role", "button");
      popout.setAttribute("aria-label", tr("detachedUndockTitle"));
      popout.setAttribute("tabindex", "-1");
      popout.textContent = "↗";

      var close = tabEl.querySelector("[data-tab-close]");
      if (close && close.parentNode === tabEl) {
        tabEl.insertBefore(popout, close);
      } else {
        tabEl.appendChild(popout);
      }
    }

    function ensureAllTabControls() {
      document.querySelectorAll(".v1-tab").forEach(function (tabEl) {
        ensureTabPopoutControl(tabEl);
      });
    }

    function isDetachedHiddenTab(tabEl) {
      return !!(tabEl && tabEl.classList.contains("tab-detached-hidden"));
    }

    function hideDetachedTab(tool) {
      if (!tool) return;
      var tabEl = document.querySelector('.v1-tab[data-tool="' + tool + '"]');
      if (!tabEl) return;
      tabEl.classList.add("tab-detached-hidden");
      tabEl.classList.remove("active");
      tabEl.setAttribute("hidden", "hidden");
    }

    function restoreDetachedTab(tool) {
      if (!tool) return;
      var tabEl = document.querySelector('.v1-tab[data-tool="' + tool + '"]');
      if (!tabEl) return;
      tabEl.classList.remove("tab-detached-hidden");
      if (!tabEl.classList.contains("tab-closed")) {
        tabEl.removeAttribute("hidden");
      }
    }

    function findNextDockedTab(excludedTool) {
      return Array.from(document.querySelectorAll(".v1-tab")).find(function (tabEl) {
        var tool = tabEl.getAttribute("data-tool") || "";
        return !tabEl.classList.contains("tab-closed") && !isDetachedHiddenTab(tabEl) && tool !== excludedTool;
      }) || null;
    }

    function closeToolTab(tool) {
      if (!tool) return;

      var tabEl = document.querySelector('.v1-tab[data-tool="' + tool + '"]');
      if (tabEl) {
        tabEl.classList.add("tab-closed");
        tabEl.classList.remove("active", "tab-detached-hidden");
        tabEl.setAttribute("hidden", "hidden");
      }

      destroyDetachedCard(tool);
      applyDetachedCardState();

      if (activeTool === tool) {
        var next = findNextDockedTab(tool);
        if (next) {
          var nextTool = next.getAttribute("data-tool");
          if (nextTool) {
            switchTool(nextTool);
            return;
          }
        }

        activeTool = null;
        if (store && store.setState) store.setState({ activeTool: null });
        refreshActiveUI();
        return;
      }

      updateEmptyState();
      updateTabPopoutUi();
    }

    function updateTabPopoutUi() {
      document.querySelectorAll(".v1-tab").forEach(function (tabEl) {
        ensureTabPopoutControl(tabEl);
        var tool = tabEl.getAttribute("data-tool");
        var popout = tabEl.querySelector("[data-tab-popout]");
        if (!popout) return;
        var isDetached = !!tool && !!getDetachedCard(tool);
        popout.classList.toggle("is-detached", isDetached);
        popout.textContent = isDetached ? "↙" : "↗";
        var label = isDetached ? tr("detachedDockTitle") : tr("detachedUndockTitle");
        popout.setAttribute("title", label);
        popout.setAttribute("aria-label", label);
      });
    }

    function getDetachedCard(tool) {
      var card = detachedCards[tool];
      if (!card) return null;
      if (!document.body || !document.body.contains(card)) {
        delete detachedCards[tool];
        return null;
      }
      return card;
    }

    function getDetachedCardCount() {
      return Object.keys(detachedCards).reduce(function (count, tool) {
        return count + (getDetachedCard(tool) ? 1 : 0);
      }, 0);
    }

    function bringDetachedCardToFront(cardEl) {
      if (!cardEl) return;
      detachedZCounter += 1;
      cardEl.style.zIndex = String(detachedZCounter);
    }

    function getDetachedWorkspaceRect() {
      var main = document.querySelector(".v1-main");
      var status = document.querySelector(".v1-status");
      if (!main) {
        var menubar = document.querySelector(".v1-menubar");
        var vw = Math.max(320, window.innerWidth || 1280);
        var vh = Math.max(320, window.innerHeight || 720);
        var topEdge = menubar ? Math.round(menubar.getBoundingClientRect().bottom) : 0;
        var bottomEdge = status ? Math.round(status.getBoundingClientRect().top) : vh;
        return {
          left: 0,
          top: Math.max(0, topEdge),
          width: vw,
          height: Math.max(260, bottomEdge - topEdge),
        };
      }
      var rect = main.getBoundingClientRect();
      var statusTop = status ? Math.round(status.getBoundingClientRect().top) : Math.round(rect.bottom);
      var bottomEdge = Math.min(Math.round(rect.bottom), statusTop);
      // Keep a tiny safety gap so the resize border never bleeds into the status bar.
      bottomEdge = Math.max(Math.round(rect.top) + 260, bottomEdge - 1);
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.max(320, Math.round(rect.width)),
        height: Math.max(260, bottomEdge - Math.round(rect.top)),
      };
    }

    var SNAP_THRESHOLD = 10;

    function snapDetachedPosition(cardEl, next) {
      var w = next.width;
      var h = next.height;
      var dL = next.left;
      var dR = next.left + w;
      var dT = next.top;
      var dB = next.top + h;
      var snL = dL;
      var snT = dT;
      var bestXDist = SNAP_THRESHOLD + 1;
      var bestYDist = SNAP_THRESHOLD + 1;

      var targets = [];
      document.querySelectorAll(".v1-detached-tool-card").forEach(function (c) {
        if (c === cardEl) return;
        var r = c.getBoundingClientRect();
        targets.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      });

      for (var i = 0; i < targets.length; i++) {
        var t = targets[i];
        var overlapY = Math.min(dB, t.bottom) - Math.max(dT, t.top);
        var overlapX = Math.min(dR, t.right) - Math.max(dL, t.left);
        // Allow a small perpendicular-axis tolerance to avoid missed snaps due to pixel rounding.
        if (overlapY >= -SNAP_THRESHOLD) {
          var candX = [
            { dist: Math.abs(dL - t.right), value: t.right },
            { dist: Math.abs(dR - t.left), value: t.left - w },
          ];
          for (var xi = 0; xi < candX.length; xi++) {
            if (candX[xi].dist <= SNAP_THRESHOLD && candX[xi].dist < bestXDist) {
              bestXDist = candX[xi].dist;
              snL = candX[xi].value;
            }
          }
        }

        if (overlapX >= -SNAP_THRESHOLD) {
          var candY = [
            { dist: Math.abs(dT - t.bottom), value: t.bottom },
            { dist: Math.abs(dB - t.top), value: t.top - h },
          ];
          for (var yi = 0; yi < candY.length; yi++) {
            if (candY[yi].dist <= SNAP_THRESHOLD && candY[yi].dist < bestYDist) {
              bestYDist = candY[yi].dist;
              snT = candY[yi].value;
            }
          }
        }
      }

      return { left: snL, top: snT };
    }

    function applyArrangementBox(tool, card, box, zOrder) {
      if (!card || !box) return;
      applyCardLayout(card, {
        left: Math.round(box.left),
        top: Math.round(box.top),
        width: Math.round(box.width),
        height: Math.round(box.height),
      });
      if (Number.isFinite(zOrder)) {
        detachedZCounter = Math.max(detachedZCounter, zOrder);
        card.style.zIndex = String(zOrder);
      } else {
        bringDetachedCardToFront(card);
      }
      if (tool) {
        saveDetachedLayout(tool, readCardLayoutFromDom(card));
      }
    }

    function autoArrangeDetachedCards(options) {
      var opts = options && typeof options === "object" ? options : {};
      var cards = Array.from(document.querySelectorAll(".v1-detached-tool-card")).map(function (cardEl) {
        var tool = cardEl.getAttribute("data-detached-tool") || "";
        return {
          tool: tool,
          card: cardEl,
        };
      }).filter(function (entry) { return !!entry.card; });

      if (!cards.length) {
        if (setStatusLine) setStatusLine(tr("toolRoute") + ": " + tr("detachedNoWindowsToArrange"));
        return;
      }

      var area = getDetachedWorkspaceRect();
      var count = cards.length;
      var boxes = [];
  var variant = getArrangementVariant(count, opts.advanceVariant !== false);

      if (count === 1) {
        boxes.push({ left: area.left, top: area.top, width: area.width, height: area.height });
      } else if (count === 2) {
        if (variant === 0) {
          var w2 = Math.floor(area.width / 2);
          boxes.push({ left: area.left, top: area.top, width: w2, height: area.height });
          boxes.push({ left: area.left + w2, top: area.top, width: area.width - w2, height: area.height });
        } else {
          var h2 = Math.floor(area.height / 2);
          boxes.push({ left: area.left, top: area.top, width: area.width, height: h2 });
          boxes.push({ left: area.left, top: area.top + h2, width: area.width, height: area.height - h2 });
        }
      } else if (count === 3) {
        var colWidth = Math.floor(area.width / 2);
        var rowHeight = Math.floor(area.height / 2);
        if (variant === 0) {
          boxes.push({ left: area.left, top: area.top, width: colWidth, height: area.height });
          boxes.push({ left: area.left + colWidth, top: area.top, width: area.width - colWidth, height: rowHeight });
          boxes.push({ left: area.left + colWidth, top: area.top + rowHeight, width: area.width - colWidth, height: area.height - rowHeight });
        } else {
          boxes.push({ left: area.left, top: area.top, width: colWidth, height: rowHeight });
          boxes.push({ left: area.left, top: area.top + rowHeight, width: colWidth, height: area.height - rowHeight });
          boxes.push({ left: area.left + colWidth, top: area.top, width: area.width - colWidth, height: area.height });
        }
      } else if (count === 4) {
        var w4 = Math.floor(area.width / 2);
        var h4 = Math.floor(area.height / 2);
        boxes.push({ left: area.left, top: area.top, width: w4, height: h4 });
        boxes.push({ left: area.left + w4, top: area.top, width: area.width - w4, height: h4 });
        boxes.push({ left: area.left, top: area.top + h4, width: w4, height: area.height - h4 });
        boxes.push({ left: area.left + w4, top: area.top + h4, width: area.width - w4, height: area.height - h4 });
      } else {
        var minW = Math.min(460, area.width);
        var minH = Math.min(260, area.height);
        var cw = Math.max(minW, Math.floor(area.width * 0.58));
        var ch = Math.max(minH, Math.floor(area.height * 0.58));
        var maxOffsetX = Math.max(0, area.width - cw);
        var maxOffsetY = Math.max(0, area.height - ch);
        for (var i = 0; i < count; i += 1) {
          var t = count > 1 ? (i / (count - 1)) : 0;
          boxes.push({
            left: area.left + Math.round(maxOffsetX * t),
            top: area.top + Math.round(maxOffsetY * t),
            width: cw,
            height: ch,
          });
        }
      }

      cards.forEach(function (entry, index) {
        var box = boxes[Math.min(index, boxes.length - 1)];
        applyArrangementBox(entry.tool, entry.card, box, 80 + index);
      });

      if (setStatusLine) {
        setStatusLine(tr("toolRoute") + ": " + tr("detachedAutoArrangedPrefix") + " " + cards.length + " " + tr("detachedWindowsLabel"));
      }
    }

    function syncDetachedArrangementOnCountChange() {
      var count = document.querySelectorAll(".v1-detached-tool-card").length;
      if (count <= 1) return;
      if (!autoArrangeOnUndockEnabled) return;
      autoArrangeDetachedCards({ advanceVariant: false });
    }

    // --- ip-scanner tool keys ---
    // Results IP table wiring for the detached-window case (mirrors
    // panel-interactions-runtime.js's wireResultsIpTable, but for
    // .v1-detached-tool-card instead of the tab). Whole block through
    // syncResultButtonsState() below is ip-scanner tool.
    function wireDetachedResultsIp(rootEl) {
      if (!rootEl) return;

      var RESULT_STATE_KEY = "netrecon_results_ip_result_state_v1";
      var COLUMN_STATE_KEY = "netrecon_results_ip_columns_v1";
      var FILTER_STATE_KEY = "netrecon_results_ip_filters_v1";
      var DEFAULT_COLUMNS = {
        hostname: true,
        flag: true,
        isp: true,
        as: true,
        device: true,
        http: true,
        access: true,
        banner: true,
        sslCert: true,
      };
      var DEFAULT_FILTERS = {
        type: {
          ip: true,
          ports: true,
        },
        marks: {
          favorite: false,
          check: false,
        },
        status: {
          active: true,
          unknown: true,
          dead: true,
        },
      };

      function cloneDefaultFilters() {
        return JSON.parse(JSON.stringify(DEFAULT_FILTERS));
      }

      function readResultState() {
        try {
          var raw = window.localStorage ? window.localStorage.getItem(RESULT_STATE_KEY) : "";
          if (!raw) return {};
          var parsed = JSON.parse(raw);
          return parsed && typeof parsed === "object" ? parsed : {};
        } catch (_) {
          return {};
        }
      }

      function writeResultState(state) {
        try {
          if (!window.localStorage) return;
          window.localStorage.setItem(RESULT_STATE_KEY, JSON.stringify(state || {}));
        } catch (_) {}
      }

      function readColumnState() {
        var merged = Object.assign({}, DEFAULT_COLUMNS);
        try {
          var raw = window.localStorage ? window.localStorage.getItem(COLUMN_STATE_KEY) : "";
          if (!raw) return merged;
          var parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object") return merged;

          Object.keys(DEFAULT_COLUMNS).forEach(function (key) {
            if (Object.prototype.hasOwnProperty.call(parsed, key)) {
              merged[key] = !!parsed[key];
            }
          });
          return merged;
        } catch (_) {
          return merged;
        }
      }

      function writeColumnState(state) {
        try {
          if (!window.localStorage) return;
          window.localStorage.setItem(COLUMN_STATE_KEY, JSON.stringify(state || {}));
        } catch (_) {}
      }

      function readFilterState() {
        var merged = cloneDefaultFilters();
        try {
          var raw = window.localStorage ? window.localStorage.getItem(FILTER_STATE_KEY) : "";
          if (!raw) return merged;
          var parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object") return merged;

          Object.keys(DEFAULT_FILTERS).forEach(function (groupKey) {
            var sourceGroup = parsed[groupKey];
            if (!sourceGroup || typeof sourceGroup !== "object") return;
            Object.keys(DEFAULT_FILTERS[groupKey]).forEach(function (itemKey) {
              if (Object.prototype.hasOwnProperty.call(sourceGroup, itemKey)) {
                merged[groupKey][itemKey] = !!sourceGroup[itemKey];
              }
            });
          });

          return merged;
        } catch (_) {
          return merged;
        }
      }

      function writeFilterState(state) {
        try {
          if (!window.localStorage) return;
          window.localStorage.setItem(FILTER_STATE_KEY, JSON.stringify(state || cloneDefaultFilters()));
        } catch (_) {}
      }

      function applyColumnVisibility(state) {
        Object.keys(DEFAULT_COLUMNS).forEach(function (key) {
          var visible = !state || state[key] !== false;
          rootEl.querySelectorAll('[data-col="' + key + '"]').forEach(function (cell) {
            cell.style.display = visible ? "" : "none";
          });
        });
      }

      function positionFloatingMenu(toggleBtn, menu) {
        if (!toggleBtn || !menu || menu.hasAttribute("hidden")) return;

        var margin = 8;
        var gap = 4;
        var viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
        var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 768;
        var triggerRect = toggleBtn.getBoundingClientRect();

        menu.style.position = "fixed";
        menu.style.left = "0px";
        menu.style.top = "0px";
        menu.style.visibility = "hidden";
        menu.style.maxHeight = "";
        menu.style.overflowY = "";

        var menuWidth = Math.max(220, Math.ceil(menu.offsetWidth || 0));
        var menuHeight = Math.max(160, Math.ceil(menu.offsetHeight || 0));
        var openUp = (triggerRect.bottom + gap + menuHeight + margin > viewportHeight)
          && (triggerRect.top - gap - menuHeight > margin);

        var top = openUp ? (triggerRect.top - menuHeight - gap) : (triggerRect.bottom + gap);
        var left = triggerRect.right - menuWidth;

        top = Math.max(margin, Math.min(top, viewportHeight - margin - menuHeight));
        left = Math.max(margin, Math.min(left, viewportWidth - margin - menuWidth));

        menu.style.left = Math.round(left) + "px";
        menu.style.top = Math.round(top) + "px";
        menu.style.maxHeight = Math.max(120, viewportHeight - margin - top) + "px";
        menu.style.overflowY = "auto";
        menu.style.visibility = "";
      }

      function positionColumnsMenu() {
        positionFloatingMenu(rootEl.querySelector("[data-columns-toggle]"), rootEl.querySelector("[data-columns-menu]"));
      }

      function positionFilterMenus() {
        rootEl.querySelectorAll("[data-filter-toggle]").forEach(function (toggleBtn) {
          var group = toggleBtn.getAttribute("data-filter-toggle");
          if (!group) return;
          var menu = rootEl.querySelector('[data-filter-menu="' + group + '"]');
          positionFloatingMenu(toggleBtn, menu);
        });
      }

      function positionAllOpenMenus() {
        positionColumnsMenu();
        positionFilterMenus();
      }

      function updateMenusOpenClass() {
        var anyOpen = !!rootEl.querySelector("[data-columns-menu]:not([hidden]), [data-filter-menu]:not([hidden])");
        rootEl.classList.toggle("is-columns-menu-open", anyOpen);
      }

      function closeAllFilterMenus(exceptGroup) {
        rootEl.querySelectorAll("[data-filter-menu]").forEach(function (menu) {
          var group = menu.getAttribute("data-filter-menu");
          if (exceptGroup && group === exceptGroup) return;
          menu.setAttribute("hidden", "hidden");
          menu.style.left = "";
          menu.style.top = "";
          menu.style.maxHeight = "";
          menu.style.overflowY = "";
          menu.style.visibility = "";
        });

        rootEl.querySelectorAll("[data-filter-toggle]").forEach(function (toggleBtn) {
          var group = toggleBtn.getAttribute("data-filter-toggle");
          if (exceptGroup && group === exceptGroup) return;
          toggleBtn.setAttribute("aria-expanded", "false");
        });
      }

      function setFilterMenuOpen(group, open) {
        var toggleBtn = rootEl.querySelector('[data-filter-toggle="' + group + '"]');
        var menu = rootEl.querySelector('[data-filter-menu="' + group + '"]');
        if (!toggleBtn || !menu) return;

        if (open) {
          setColumnsMenuOpen(false);
          closeAllFilterMenus(group);
          menu.removeAttribute("hidden");
          toggleBtn.setAttribute("aria-expanded", "true");
          positionFloatingMenu(toggleBtn, menu);
        } else {
          menu.setAttribute("hidden", "hidden");
          toggleBtn.setAttribute("aria-expanded", "false");
          menu.style.left = "";
          menu.style.top = "";
          menu.style.maxHeight = "";
          menu.style.overflowY = "";
          menu.style.visibility = "";
        }

        updateMenusOpenClass();
      }

      function hasActionState(resultState, key, action) {
        if (!key || !resultState || !resultState[key]) return false;
        return !!resultState[key][action];
      }

      function applyRowsFilter() {
        var filterState = readFilterState();
        var resultState = readResultState();
        var activeMarkFilters = Object.keys(DEFAULT_FILTERS.marks).filter(function (key) {
          return !!(filterState.marks && filterState.marks[key]);
        });
        var hasAnyStatusFilter = Object.keys(DEFAULT_FILTERS.status).some(function (key) {
          return !!(filterState.status && filterState.status[key]);
        });
        var showIpRows = !(filterState.type && filterState.type.ip === false);
        var showPortRows = !(filterState.type && filterState.type.ports === false);

        rootEl.querySelectorAll(".v1-ip-result-row[data-row-index]").forEach(function (resultRow) {
          var rowId = resultRow.getAttribute("data-row-index");
          var status = String(resultRow.getAttribute("data-status") || "unknown").toLowerCase();
          var resultKey = String(resultRow.getAttribute("data-result-key") || "");
          var expandBtn = rowId ? rootEl.querySelector('[data-open-ports="' + rowId + '"]') : null;
          var expanded = expandBtn ? expandBtn.getAttribute("aria-expanded") === "true" : false;
          var forcePortsExpanded = showPortRows && !showIpRows;
          var statusPass = !hasAnyStatusFilter || !!(filterState.status && filterState.status[status]);
          var marksPass = !activeMarkFilters.length || activeMarkFilters.some(function (markKey) {
            return hasActionState(resultState, resultKey, markKey);
          });
          var ipVisible = showIpRows && statusPass && marksPass;

          resultRow.style.display = ipVisible ? "" : "none";

          if (!rowId) return;
          rootEl.querySelectorAll('[data-ports-row="' + rowId + '"]').forEach(function (portsRow) {
            var portKey = String(portsRow.getAttribute("data-port-key") || "");
            var portMarksPass = !activeMarkFilters.length || (portKey && activeMarkFilters.some(function (markKey) {
              return hasActionState(resultState, portKey, markKey);
            }));
            var portsVisible = showPortRows && statusPass && portMarksPass && (forcePortsExpanded || expanded);

            portsRow.style.display = portsVisible ? "" : "none";
            if (portsVisible) {
              portsRow.removeAttribute("hidden");
            } else {
              portsRow.setAttribute("hidden", "hidden");
            }
          });
        });
      }

      function setColumnsMenuOpen(open) {
        var toggleBtn = rootEl.querySelector("[data-columns-toggle]");
        var menu = rootEl.querySelector("[data-columns-menu]");
        if (!toggleBtn || !menu) return;
        if (open) {
          closeAllFilterMenus();
          menu.removeAttribute("hidden");
          toggleBtn.setAttribute("aria-expanded", "true");
          positionColumnsMenu();
        } else {
          menu.setAttribute("hidden", "hidden");
          toggleBtn.setAttribute("aria-expanded", "false");
          menu.style.left = "";
          menu.style.top = "";
          menu.style.maxHeight = "";
          menu.style.overflowY = "";
          menu.style.visibility = "";
        }

        updateMenusOpenClass();
      }

      function syncColumnControls() {
        var state = readColumnState();
        rootEl.querySelectorAll("[data-column-key]").forEach(function (input) {
          var key = input.getAttribute("data-column-key");
          if (!key || !Object.prototype.hasOwnProperty.call(DEFAULT_COLUMNS, key)) return;
          input.checked = state[key] !== false;
        });
        applyColumnVisibility(state);
      }

      function syncFilterControls() {
        var state = readFilterState();
        rootEl.querySelectorAll("[data-filter-group][data-filter-key]").forEach(function (input) {
          var groupKey = input.getAttribute("data-filter-group");
          var itemKey = input.getAttribute("data-filter-key");
          if (!groupKey || !itemKey) return;
          if (!Object.prototype.hasOwnProperty.call(DEFAULT_FILTERS, groupKey)) return;
          if (!Object.prototype.hasOwnProperty.call(DEFAULT_FILTERS[groupKey], itemKey)) return;
          input.checked = !!(state[groupKey] && state[groupKey][itemKey]);
        });
        updateFilterButtonLabels(state);
      }

      function updateFilterButtonLabels(filterState) {
        var state = filterState || readFilterState();
        rootEl.querySelectorAll("[data-filter-toggle]").forEach(function (toggleBtn) {
          var groupKey = toggleBtn.getAttribute("data-filter-toggle");
          if (!groupKey || !Object.prototype.hasOwnProperty.call(DEFAULT_FILTERS, groupKey)) return;

          var baseLabel = toggleBtn.getAttribute("data-filter-label") || toggleBtn.textContent.replace(/\s*\(\d+\)\s*▾\s*$/, "").replace(/\s*▾\s*$/, "").trim();
          var activeCount = 0;
          Object.keys(DEFAULT_FILTERS[groupKey]).forEach(function (itemKey) {
            var value = !!(state[groupKey] && state[groupKey][itemKey]);
            var defValue = !!DEFAULT_FILTERS[groupKey][itemKey];
            if (value !== defValue) activeCount += 1;
          });

          toggleBtn.textContent = baseLabel + (activeCount > 0 ? " (" + activeCount + ")" : "") + " ▾";
        });
      }

      function syncResultButtonsState() {
        var state = readResultState();
        rootEl.querySelectorAll("[data-port-action][data-port-key], [data-result-action][data-result-key]").forEach(function (button) {
          var key = button.getAttribute("data-port-key") || button.getAttribute("data-result-key");
          var action = button.getAttribute("data-port-action") || button.getAttribute("data-result-action");
          var entry = key && state[key] ? state[key] : null;
          var active = !!(entry && entry[action]);
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", active ? "true" : "false");
        });
      }

      if (rootEl.dataset.resultStateBound !== "1") {
        rootEl.dataset.resultStateBound = "1";

        if (rootEl.dataset.columnsMenuViewportBound !== "1") {
          rootEl.dataset.columnsMenuViewportBound = "1";
          window.addEventListener("resize", function () {
            positionAllOpenMenus();
          });
          window.addEventListener("scroll", function () {
            positionAllOpenMenus();
          }, true);
        }

        rootEl.addEventListener("click", function (event) {
          var filterToggleBtn = event.target && typeof event.target.closest === "function"
            ? event.target.closest("[data-filter-toggle]")
            : null;
          if (filterToggleBtn && rootEl.contains(filterToggleBtn)) {
            var filterGroup = filterToggleBtn.getAttribute("data-filter-toggle");
            var filterExpanded = filterToggleBtn.getAttribute("aria-expanded") === "true";
            setFilterMenuOpen(filterGroup, !filterExpanded);
            return;
          }

          var toggleBtn = event.target && typeof event.target.closest === "function"
            ? event.target.closest("[data-columns-toggle]")
            : null;
          if (toggleBtn && rootEl.contains(toggleBtn)) {
            var isExpanded = toggleBtn.getAttribute("aria-expanded") === "true";
            setColumnsMenuOpen(!isExpanded);
            return;
          }

          var resetButton = event.target && typeof event.target.closest === "function"
            ? event.target.closest("[data-reset-filters]")
            : null;
          if (resetButton && rootEl.contains(resetButton)) {
            writeFilterState(cloneDefaultFilters());
            syncFilterControls();
            applyRowsFilter();
            setColumnsMenuOpen(false);
            closeAllFilterMenus();
            updateMenusOpenClass();
            return;
          }

          var menuRoot = event.target && typeof event.target.closest === "function"
            ? event.target.closest("[data-columns-menu], [data-filter-menu]")
            : null;
          if (!menuRoot || !rootEl.contains(menuRoot)) {
            setColumnsMenuOpen(false);
            closeAllFilterMenus();
            updateMenusOpenClass();
          }

          var button = event.target && typeof event.target.closest === "function"
            ? event.target.closest("[data-port-action][data-port-key], [data-result-action][data-result-key]")
            : null;
          if (!button || !rootEl.contains(button)) return;

          var key = button.getAttribute("data-port-key") || button.getAttribute("data-result-key");
          var action = button.getAttribute("data-port-action") || button.getAttribute("data-result-action");
          if (!key || !action) return;

          var state = readResultState();
          var entry = state[key] && typeof state[key] === "object" ? state[key] : {};
          entry[action] = !entry[action];
          state[key] = entry;
          writeResultState(state);
          syncResultButtonsState();
          applyRowsFilter();
        });

        rootEl.addEventListener("change", function (event) {
          var input = event.target;
          if (!input) return;

          if (input.getAttribute("data-column-key") != null) {
            var key = input.getAttribute("data-column-key");
            if (!key || !Object.prototype.hasOwnProperty.call(DEFAULT_COLUMNS, key)) return;

            var columnState = readColumnState();
            columnState[key] = !!input.checked;
            writeColumnState(columnState);
            applyColumnVisibility(columnState);
            return;
          }

          if (input.getAttribute("data-filter-group") != null && input.getAttribute("data-filter-key") != null) {
            var groupKey = input.getAttribute("data-filter-group");
            var itemKey = input.getAttribute("data-filter-key");
            if (!groupKey || !itemKey) return;
            if (!Object.prototype.hasOwnProperty.call(DEFAULT_FILTERS, groupKey)) return;
            if (!Object.prototype.hasOwnProperty.call(DEFAULT_FILTERS[groupKey], itemKey)) return;

            var filterState = readFilterState();
            filterState[groupKey][itemKey] = !!input.checked;
            writeFilterState(filterState);
            applyRowsFilter();
          }
        });
      }

      rootEl.querySelectorAll("[data-open-ports]").forEach(function (button) {
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";

        button.addEventListener("click", function () {
          var rowId = button.getAttribute("data-open-ports");
          syncResultButtonsState();
          var portsRows = rootEl.querySelectorAll('[data-ports-row="' + rowId + '"]');
          if (!portsRows.length) return;

          var expanded = button.getAttribute("aria-expanded") === "true";
          var nextExpanded = !expanded;
          button.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
          button.textContent = nextExpanded ? "−" : "+";

          applyRowsFilter();
        });
      });

      syncResultButtonsState();
      syncColumnControls();
      syncFilterControls();
      applyRowsFilter();
    }

    // shell (resumes here after the wireDetachedResultsIp tool block above)
    function stripIds(html) {
      return String(html || "").replace(/\sid="[^"]*"/g, "");
    }
    function destroyDetachedCard(tool) {
      var card = getDetachedCard(tool);
      if (!card) return;
      if (card.__resizeObserver && typeof card.__resizeObserver.disconnect === "function") {
        card.__resizeObserver.disconnect();
      }
      if (card.parentNode) card.parentNode.removeChild(card);
      delete detachedCards[tool];
      updateTabPopoutUi();
      syncDetachedArrangementOnCountChange();
    }

    function swapDetachedCardContents(cardA, cardB) {
      var toolA = cardA.getAttribute("data-detached-tool");
      var toolB = cardB.getAttribute("data-detached-tool");
      if (!toolA || !toolB || toolA === toolB) return;
      var bodyA = cardA.querySelector(".v1-detached-tool-body");
      var bodyB = cardB.querySelector(".v1-detached-tool-body");
      if (!bodyA || !bodyB) return;
      var titleA = cardA.querySelector(".v1-detached-tool-title");
      var titleB = cardB.querySelector(".v1-detached-tool-title");
      // Swap body nodes — native move preserves all event listeners
      var nextA = bodyA.nextSibling;
      var parentA = bodyA.parentNode;
      var nextB = bodyB.nextSibling;
      var parentB = bodyB.parentNode;
      parentA.removeChild(bodyA);
      parentB.removeChild(bodyB);
      parentB.insertBefore(bodyA, nextB);
      parentA.insertBefore(bodyB, nextA);
      // Swap title text
      if (titleA && titleB) {
        var tmpTitle = titleA.textContent;
        titleA.textContent = titleB.textContent;
        titleB.textContent = tmpTitle;
      }
      // Swap data attributes and internal map
      cardA.setAttribute("data-detached-tool", toolB);
      cardB.setAttribute("data-detached-tool", toolA);
      cardA.classList.toggle("is-versions-view", toolB === "versions");
      cardB.classList.toggle("is-versions-view", toolA === "versions");
      cardA.classList.toggle("is-shellcraft-view", toolB === "shellcraft");
      cardB.classList.toggle("is-shellcraft-view", toolA === "shellcraft");
      cardA.classList.toggle("is-pulpit-view", toolB === "pulpit");
      cardB.classList.toggle("is-pulpit-view", toolA === "pulpit");
      cardA.classList.toggle("is-pulpit-preview-view", toolB === "pulpit-preview");
      cardB.classList.toggle("is-pulpit-preview-view", toolA === "pulpit-preview");
      cardA.classList.toggle("is-globe-view", toolB === "globe");
      cardB.classList.toggle("is-globe-view", toolA === "globe");
      detachedCards[toolA] = cardB;
      detachedCards[toolB] = cardA;
    }

    function createDetachedCard(tool) {
      if (!tool) return null;
      var existing = getDetachedCard(tool);
      if (existing) {
        hideDetachedTab(tool);
        return existing;
      }

      var info = infoFor(tool);
      var card = document.createElement("article");
      card.className = "v1-card v1-detached-tool-card";
      card.setAttribute("data-detached-tool", tool);
      card.classList.toggle("is-versions-view", tool === "versions");
      card.classList.toggle("is-shellcraft-view", tool === "shellcraft");
      card.classList.toggle("is-pulpit-view", tool === "pulpit");
      card.classList.toggle("is-pulpit-preview-view", tool === "pulpit-preview");
      card.classList.toggle("is-globe-view", tool === "globe");

      var header = document.createElement("div");
      header.className = "v1-detached-tool-head";

      var title = document.createElement("strong");
      title.className = "v1-detached-tool-title";
      title.textContent = info.title || tool;
      header.appendChild(title);

      var swapBtn = document.createElement("button");
      swapBtn.className = "v1-detached-tool-swap";
      swapBtn.type = "button";
      swapBtn.textContent = "⇄";
      swapBtn.setAttribute("title", tr("detachedSwapTitle"));
      swapBtn.setAttribute("aria-label", tr("detachedSwapTitle"));
      header.appendChild(swapBtn);

      var dockBtn = document.createElement("button");
      dockBtn.className = "v1-detached-tool-dock";
      dockBtn.type = "button";
      dockBtn.textContent = "↙";
      dockBtn.setAttribute("title", tr("detachedDockTitle"));
      dockBtn.setAttribute("aria-label", tr("detachedDockTitle"));
      header.appendChild(dockBtn);

      var closeBtn = document.createElement("button");
      closeBtn.className = "v1-detached-tool-close";
      closeBtn.type = "button";
      closeBtn.textContent = "×";
      closeBtn.setAttribute("title", tr("tabCloseAria"));
      closeBtn.setAttribute("aria-label", tr("tabCloseAria"));
      header.appendChild(closeBtn);

      var body = document.createElement("div");
      body.className = "v1-detached-tool-body v1-right-content";

      var detailRoot = document.createElement("div");
      detailRoot.className = "tool-detail";
      detailRoot.innerHTML = stripIds(buildDetailHtml(tool));
      body.appendChild(detailRoot);

      card.appendChild(header);
      card.appendChild(body);
      var shellHost = document.querySelector(".v1-shell");
      (shellHost || document.body).appendChild(card);

      // Fallback inline styles keep floating card visible even with stale CSS cache.
      card.style.position = "fixed";
      card.style.display = "grid";
      card.style.gridTemplateRows = "34px minmax(0, 1fr)";
      card.style.overflow = "hidden";
      card.style.border = "1px solid #3c414a";
      card.style.boxShadow = "0 20px 44px rgba(0, 0, 0, 0.55)";
      card.style.zIndex = "70";

      var remembered = getDetachedLayout(tool);
      applyCardLayout(card, remembered || getDefaultDetachedLayout());
      bringDetachedCardToFront(card);

      if (tool === "results-ip") {
        wireDetachedResultsIp(detailRoot);
      }
      wireToolRuntime(tool, detailRoot);

      card.addEventListener("pointerdown", function () {
        bringDetachedCardToFront(card);
      });

      var drag = { pointerId: null, startX: 0, startY: 0, left: 0, top: 0, dragging: false };

      header.addEventListener("pointerdown", function (event) {
        if (event.button !== 0) return;
        if (event.target.closest("button")) return;
        event.preventDefault();
        bringDetachedCardToFront(card);
        var rect = card.getBoundingClientRect();
        drag.pointerId = event.pointerId;
        drag.startX = event.clientX;
        drag.startY = event.clientY;
        drag.left = rect.left;
        drag.top = rect.top;
        drag.dragging = true;
        if (typeof header.setPointerCapture === "function") {
          try {
            header.setPointerCapture(event.pointerId);
          } catch (_) {
            // Ignore capture failures on unsupported platforms.
          }
        }
        card.classList.add("is-dragging");
        setDetachedCardDraggingState(card, true);
      });

      function finishDrag(event) {
        if (!drag.dragging) return;
        if (event && drag.pointerId !== null && event.pointerId !== drag.pointerId) return;
        drag.dragging = false;
        drag.pointerId = null;
        if (event && typeof header.releasePointerCapture === "function") {
          try {
            header.releasePointerCapture(event.pointerId);
          } catch (_) {
            // Ignore capture failures on unsupported platforms.
          }
        }
        card.classList.remove("is-dragging");
        setDetachedCardDraggingState(card, false);
        saveDetachedLayout(card.getAttribute("data-detached-tool"), readCardLayoutFromDom(card));
      }

      header.addEventListener("pointermove", function (event) {
        if (!drag.dragging) return;
        if (event.pointerId !== drag.pointerId) return;
        var dx = event.clientX - drag.startX;
        var dy = event.clientY - drag.startY;
        var next = clampDetachedLayout({
          left: drag.left + dx,
          top: drag.top + dy,
          width: card.offsetWidth,
          height: card.offsetHeight,
        });
        var snapped = snapDetachedPosition(card, next);
        card.style.left = snapped.left + "px";
        card.style.top = snapped.top + "px";
        updateDetachedCardResizeLimits(card);
      });

      header.addEventListener("pointerup", finishDrag);
      header.addEventListener("pointercancel", finishDrag);

      dockBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        var currentTool = card.getAttribute("data-detached-tool");
        saveDetachedLayout(currentTool, readCardLayoutFromDom(card));
        destroyDetachedCard(currentTool);
        restoreDetachedTab(currentTool);
        if (!activeTool) {
          switchTool(currentTool);
        } else {
          updateEmptyState();
          updateTabPopoutUi();
        }
        if (setStatusLine) setStatusLine(tr("toolRoute") + ": " + currentTool + " " + tr("detachedDocked"));
      });

      closeBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        var currentTool = card.getAttribute("data-detached-tool");
        closeToolTab(currentTool);
        if (setStatusLine) setStatusLine(tr("toolRoute") + ": " + currentTool + " " + tr("detachedClosed"));
      });

      swapBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (swapSourceCard === card) {
          card.classList.remove("is-swap-source");
          swapSourceCard = null;
        } else if (swapSourceCard) {
          var source = swapSourceCard;
          source.classList.remove("is-swap-source");
          swapSourceCard = null;
          swapDetachedCardContents(source, card);
        } else {
          swapSourceCard = card;
          card.classList.add("is-swap-source");
        }
      });

      if (typeof ResizeObserver === "function") {
        var ro = new ResizeObserver(function () {
          var currentTool = card.getAttribute("data-detached-tool");
          if (!currentTool || !detachedCards[currentTool]) return;
          updateDetachedCardResizeLimits(card);
          var current = readCardLayoutFromDom(card);
          if (!current) return;
          var safe = clampDetachedResizeLayout(current);
          if (safe.top !== current.top || safe.left !== current.left || safe.width !== current.width || safe.height !== current.height) {
            card.style.top = safe.top + "px";
            card.style.left = safe.left + "px";
            card.style.width = safe.width + "px";
            card.style.height = safe.height + "px";
            updateDetachedCardResizeLimits(card);
          }
          saveDetachedLayout(currentTool, readCardLayoutFromDom(card));
        });
        ro.observe(card);
        card.__resizeObserver = ro;
      }

      detachedCards[tool] = card;
      hideDetachedTab(tool);
      updateTabPopoutUi();
      syncDetachedArrangementOnCountChange();
      return card;
    }

    function applyDetachedCardState() {
      if (document.body) {
        document.body.classList.toggle("v1-has-detached-card", getDetachedCardCount() > 0);
      }

      updateTabPopoutUi();
    }

    function infoFor(tool) {
      var tools = getToolInfoMap ? getToolInfoMap() : {};
      var baseInfo = tools[tool] || tools["scan-runner"] || {
        title: "Scan Runner",
        text: "",
        points: []
      };

      var keyTool = tool || "scan-runner";
      var titleKey = baseInfo.titleKey || ("toolTitle_" + String(keyTool).replace(/-/g, "_"));
      var localizedTitle = tr(titleKey);
      if (localizedTitle === titleKey) localizedTitle = baseInfo.title || keyTool;
      var textKey = baseInfo.textKey || ("toolText_" + String(keyTool).replace(/-/g, "_"));
      var localizedText = tr(textKey);
      if (localizedText === textKey) localizedText = baseInfo.text || "";

      var extResults = (store && store.getState().extResults) || {};
      var resultText = typeof baseInfo.resultKey === "string"
        ? (extResults[baseInfo.resultKey] || "")
        : undefined;

      return {
        title: localizedTitle,
        text: localizedText,
        points: Array.isArray(baseInfo.points) ? baseInfo.points : [],
        actions: Array.isArray(baseInfo.actions) ? baseInfo.actions : [],
        resultText: resultText,
        // Addon-declared input fields (rendered as .v1-ext-field-row by
        // renderDefaultTool) and an optional structured results table -
        // must be passed through here explicitly, same as every other key
        // above, or renderDefaultTool never sees them regardless of what it
        // does with them (this function is a narrow whitelist copy of the
        // raw manifest tool entry, not a pass-through).
        fields: Array.isArray(baseInfo.fields) ? baseInfo.fields : [],
        resultsTable: (baseInfo.resultsTable && typeof baseInfo.resultsTable === "object") ? baseInfo.resultsTable : null,
      };
    }

    // shell: loads an installed addon's own program (tools/<id>/main.js,
    // fetched and persisted alongside its manifest at install time - see
    // extensions.js's programSource field and addon-catalog-runtime.js's
    // fetchCatalog()) by injecting it as a blob-URL <script>, since the
    // text is already local (not re-fetchable by URL) rather than a normal
    // same-origin file. Requires 'blob:' in index.html's CSP script-src.
    // The script is expected to call window.NetReconNewUI.registerAddonCommands
    // (below) once it runs - a no-op if the addon has no program at all
    // (purely declarative addons, e.g. "powershell"-type-only, are
    // unaffected and never call this with a non-empty programSource).
    function loadAddonProgram(programSource) {
      var text = String(programSource || "").trim();
      if (!text) return;
      var blob = new Blob([text], { type: "application/javascript" });
      var url = URL.createObjectURL(blob);
      var el = document.createElement("script");
      el.src = url;
      el.onload = function () { URL.revokeObjectURL(url); };
      el.onerror = function () { URL.revokeObjectURL(url); };
      document.head.appendChild(el);
    }

    // Exposed for session-runtime.js's missing-addon reinstall flow, which
    // has no direct access to this closure (only extensionHost) - runs the
    // just-reinstalled addon's program the same way boot/fresh-install
    // already do via registerExtensionCommands below.
    window.NetReconNewUI = window.NetReconNewUI || {};
    window.NetReconNewUI.loadAddonProgram = loadAddonProgram;

    // shell: the registration contract an addon's own program (main.js)
    // calls into once loaded - a thin wrapper around commandBus.register()
    // (already generic, already supports exactly this) so an addon's code
    // never needs direct access to commandBus itself. Uninstall cleanup
    // needs no new code - performUninstall() below already calls
    // commandBus.unregisterAllFor(id).
    window.NetReconNewUI.registerAddonCommands = function (addonId, handlers) {
      if (!commandBus || !addonId || !handlers) return;
      Object.keys(handlers).forEach(function (commandId) {
        if (typeof handlers[commandId] === "function") {
          commandBus.register(commandId, handlers[commandId], addonId);
        }
      });
    };

    // shell: registers command-bus entries declared by an installed
    // extension's contributions.commands, gated on the extension's granted
    // permissions. "powershell" is the only command type left here - any
    // other custom behavior an addon needs comes from its own program
    // (tools/<id>/main.js, loaded via loadAddonProgram() above and
    // registered via window.NetReconNewUI.registerAddonCommands), not a
    // shell-hardcoded type dispatch (see FUTURE_PLUGIN_SHELL.md for the
    // larger, still-undone contribution model this is a small, additive
    // slice of).
    function registerExtensionCommands(manifest, programSourceOverride) {
      // manifest.programSource is present when this comes from
      // extensionHost.getInstalledManifests() (the boot-time loop below) -
      // but installExtension()'s own return value (validateManifest()'s
      // whitelisted manifest, used by addon-catalog-runtime.js right after
      // a fresh install) never carries it, so callers on that path pass it
      // separately instead.
      loadAddonProgram(programSourceOverride || (manifest && manifest.programSource));
      if (!commandBus || !manifest || !manifest.contributions) return;
      var granted = Array.isArray(manifest.permissions) ? manifest.permissions : [];
      var commands = manifest.contributions.commands || {};
      Object.keys(commands).forEach(function (commandId) {
        var def = commands[commandId];
        if (!def) return;

        if (def.type !== "powershell") return;
        if (granted.indexOf("powershell") === -1) return;
        var script = typeof def.script === "string" ? def.script.trim() : "";
        if (!script) return;
        // "params" (optional) declares which named values (matching a
        // .v1-ext-field-row's data-ext-field) this script expects - only
        // those exact keys are ever forwarded, never the whole args object a
        // caller happens to pass. Backed by run_powershell_with_args
        // (src-tauri/src/main.rs), which binds them as real PowerShell
        // parameters (-File, not -Command), not string interpolation - see
        // that function's own comment for why "-Command" couldn't do this
        // safely. Commands with no "params" keep using plain run_powershell
        // exactly as before, unchanged.
        var paramNames = Array.isArray(def.params) ? def.params : [];
        commandBus.register(commandId, function (args) {
          if (paramNames.length) {
            var filteredArgs = {};
            paramNames.forEach(function (name) {
              if (args && Object.prototype.hasOwnProperty.call(args, name)) {
                filteredArgs[name] = String(args[name]);
              }
            });
            return platform.invoke("run_powershell_with_args", { script: script, args: filteredArgs }).then(function (res) {
              var stdout = res && res.stdout ? String(res.stdout).trim() : "";
              var stderr = res && res.stderr ? String(res.stderr).trim() : "";
              return stdout || stderr || "(no output)";
            });
          }
          return platform.invoke("run_powershell", { command: script }).then(function (res) {
            var stdout = res && res.stdout ? String(res.stdout).trim() : "";
            var stderr = res && res.stderr ? String(res.stderr).trim() : "";
            return stdout || stderr || "(no output)";
          });
        }, manifest.id);
      });
    }

    if (commandBus && extensionHost && typeof extensionHost.getInstalledManifests === "function") {
      extensionHost.getInstalledManifests().forEach(registerExtensionCommands);
    }

    var panelContentRuntime = null;
    if (window.NetReconNewUICore && window.NetReconNewUICore.newUiRuntimes && window.NetReconNewUICore.newUiRuntimes.createPanelContentRuntime) {
      panelContentRuntime = window.NetReconNewUICore.newUiRuntimes.createPanelContentRuntime({
        tr: tr,
        escapeHtml: escapeHtml,
        infoFor: infoFor,
        versionsData: versionsData,
        i18n: i18n,
        extensionHost: extensionHost,
      });
    }

    var panelRenderersRuntime = null;
    if (window.NetReconNewUICore && window.NetReconNewUICore.newUiRuntimes && window.NetReconNewUICore.newUiRuntimes.createPanelRenderersRuntime) {
      panelRenderersRuntime = window.NetReconNewUICore.newUiRuntimes.createPanelRenderersRuntime({
        tr: tr,
        escapeHtml: escapeHtml,
      });
    }

    var globeRuntime = null;
    if (window.NetReconNewUICore && window.NetReconNewUICore.newUiRuntimes && window.NetReconNewUICore.newUiRuntimes.createGlobeRuntime) {
      globeRuntime = window.NetReconNewUICore.newUiRuntimes.createGlobeRuntime();
    }

    var panelInteractionsRuntime = null;
    if (window.NetReconNewUICore && window.NetReconNewUICore.newUiRuntimes && window.NetReconNewUICore.newUiRuntimes.createPanelInteractionsRuntime) {
      panelInteractionsRuntime = window.NetReconNewUICore.newUiRuntimes.createPanelInteractionsRuntime({
        versionsData: versionsData,
        tr: tr,
        setStatusLine: setStatusLine,
        globeRuntime: globeRuntime,
        renderShellCraftLibrary: panelContentRuntime && panelContentRuntime.renderShellCraftLibrary,
        renderCanvasBlockHtml: panelContentRuntime && panelContentRuntime.renderCanvasBlockHtml,
        renderShellCraftInspector: panelContentRuntime && panelContentRuntime.renderShellCraftInspector,
        renderPulpitLibrary: panelContentRuntime && panelContentRuntime.renderPulpitLibrary,
        renderPulpitNodeHtml: panelContentRuntime && panelContentRuntime.renderPulpitNodeHtml,
        renderPulpitLinksSvg: panelContentRuntime && panelContentRuntime.renderPulpitLinksSvg,
        pulpitEdgeAnchor: panelContentRuntime && panelContentRuntime.pulpitEdgeAnchor,
        renderPulpitPreviewList: panelContentRuntime && panelContentRuntime.renderPulpitPreviewList,
        renderPulpitPreviewTool: panelContentRuntime && panelContentRuntime.renderPulpitPreviewTool,
        renderMailXssTesterLibrary: panelContentRuntime && panelContentRuntime.renderMailXssTesterLibrary,
        renderMailXssTesterTool: panelContentRuntime && panelContentRuntime.renderMailXssTesterTool,
        renderMailXssTesterResults: panelContentRuntime && panelContentRuntime.renderMailXssTesterResults,
        renderGoogleDorkLibrary: panelContentRuntime && panelContentRuntime.renderGoogleDorkLibrary,
        renderGoogleDorkTool: panelContentRuntime && panelContentRuntime.renderGoogleDorkTool,
        renderGoogleDorkTemplates: panelContentRuntime && panelContentRuntime.renderGoogleDorkTemplates,
        renderKomunikatorLibrary: panelContentRuntime && panelContentRuntime.renderKomunikatorLibrary,
        renderKomunikatorTool: panelContentRuntime && panelContentRuntime.renderKomunikatorTool,
        renderKomunikatorMembers: panelContentRuntime && panelContentRuntime.renderKomunikatorMembers,
        renderPulpitInspector: panelContentRuntime && panelContentRuntime.renderPulpitInspector,
        renderAgentProfileLibrary: panelContentRuntime && panelContentRuntime.renderAgentProfileLibrary,
        renderAgentProfileDetailFields: panelContentRuntime && panelContentRuntime.renderAgentProfileDetailFields,
        renderNetworkMonitorConnectionsRows: panelContentRuntime && panelContentRuntime.renderNetworkMonitorConnectionsRows,
        renderNetworkMonitorArpRows: panelContentRuntime && panelContentRuntime.renderNetworkMonitorArpRows,
        renderNetworkMonitorConnectionsGrouped: panelContentRuntime && panelContentRuntime.renderNetworkMonitorConnectionsGrouped,
        renderNetworkMonitorArpGrouped: panelContentRuntime && panelContentRuntime.renderNetworkMonitorArpGrouped,
        netMonVendorForMac: panelContentRuntime && panelContentRuntime.netMonVendorForMac,
        renderEmailReconRows: panelContentRuntime && panelContentRuntime.renderEmailReconRows,
        renderEmailReconSummary: panelContentRuntime && panelContentRuntime.renderEmailReconSummary,
        renderAiPermissionsTool: panelContentRuntime && panelContentRuntime.renderAiPermissionsTool,
        renderAiPermLogHtml: panelContentRuntime && panelContentRuntime.renderAiPermLogHtml,
      });
    }

    var languageCatalogRuntime = null;
    if (window.NetReconNewUICore && window.NetReconNewUICore.newUiRuntimes && window.NetReconNewUICore.newUiRuntimes.createLanguageCatalogRuntime) {
      languageCatalogRuntime = window.NetReconNewUICore.newUiRuntimes.createLanguageCatalogRuntime({
        tr: tr,
        i18n: i18n,
        setStatusLine: setStatusLine,
        escapeHtml: escapeHtml,
        platform: platform,
      });
    }

    var ipLibraryRuntime = null;
    if (window.NetReconNewUICore && window.NetReconNewUICore.newUiRuntimes && window.NetReconNewUICore.newUiRuntimes.createIpLibraryRuntime) {
      ipLibraryRuntime = window.NetReconNewUICore.newUiRuntimes.createIpLibraryRuntime({
        tr: tr,
        setStatusLine: setStatusLine,
        platform: platform,
        storageGet: storageGet,
        storageSet: storageSet,
        panelRenderersRuntime: panelRenderersRuntime,
      });
    }

    var addonCatalogRuntime = null;
    if (window.NetReconNewUICore && window.NetReconNewUICore.newUiRuntimes && window.NetReconNewUICore.newUiRuntimes.createAddonCatalogRuntime) {
      addonCatalogRuntime = window.NetReconNewUICore.newUiRuntimes.createAddonCatalogRuntime({
        tr: tr,
        setStatusLine: setStatusLine,
        platform: platform,
        extensionHost: extensionHost,
        commandBus: commandBus,
        panelRenderersRuntime: panelRenderersRuntime,
        refreshActiveUI: refreshActiveUI,
        registerExtensionCommands: registerExtensionCommands,
      });
    }

    function setTooltips() {
      document.querySelectorAll("[data-tool]").forEach(function (el) {
        var tool = el.getAttribute("data-tool");
        if (!tool) return;
        var info = infoFor(tool);
        var tip = info.title + " - " + info.text;
        el.setAttribute("title", tip);
        el.setAttribute("aria-label", tip);
      });

      document.querySelectorAll(".v1-tab").forEach(function (el) {
        var titleEl = el.querySelector(".v1-tab-title");
        var txt = titleEl ? (titleEl.textContent || "").trim() : (el.textContent || "").trim();
        if (!txt) return;
        if (!el.getAttribute("title")) {
          el.setAttribute("title", tr("tabPrefix") + ": " + txt);
        }
      });

      document.querySelectorAll("[data-tab-close]").forEach(function (el) {
        el.setAttribute("aria-label", tr("tabCloseAria"));
      });
    }

    function updateEmptyState() {
      var tabs = Array.from(document.querySelectorAll(".v1-tab"));
      var hasOpenTabs = tabs.some(function (t) {
        return !t.classList.contains("tab-closed") && !isDetachedHiddenTab(t);
      });
      var emptyState = document.getElementById("v1NoTabsState");
      var mainCard = document.getElementById("v1MainCard");
      var tabsBar = document.querySelector(".v1-editor .v1-tabs");
      var editor = document.querySelector(".v1-editor");

      if (emptyState) {
        if (hasOpenTabs) emptyState.setAttribute("hidden", "hidden");
        else emptyState.removeAttribute("hidden");
      }

      if (mainCard) {
        if (hasOpenTabs) mainCard.removeAttribute("hidden");
        else mainCard.setAttribute("hidden", "hidden");
      }

      if (tabsBar) {
        if (hasOpenTabs) tabsBar.removeAttribute("hidden");
        else tabsBar.setAttribute("hidden", "hidden");
      }

      if (editor) {
        editor.classList.toggle("no-center-tabs", !hasOpenTabs);
      }
    }

    function initWorkbenchTabs() {
      if (document.body && document.body.dataset.v1TabsBound === "1") {
        ensureAllTabControls();
        if (ipLibraryRuntime) ipLibraryRuntime.wireIpLibraryButtons(document);
        updateTabPopoutUi();
        return;
      }

      if (document.body) document.body.dataset.v1TabsBound = "1";

      var autoArrangeToggle = document.getElementById("v1AutoArrangeToggle");
      if (autoArrangeToggle) {
        autoArrangeToggle.checked = !!autoArrangeOnUndockEnabled;
        if (autoArrangeToggle.dataset.v1Bound !== "1") {
          autoArrangeToggle.dataset.v1Bound = "1";
          autoArrangeToggle.addEventListener("change", function () {
            autoArrangeOnUndockEnabled = !!autoArrangeToggle.checked;
            writeDetachedAutoArrangeEnabled(autoArrangeOnUndockEnabled);
            if (setStatusLine) {
              setStatusLine(
                tr("toolRoute") + ": " + tr("autoArrangeOnUndockPrefix") + " " + (autoArrangeOnUndockEnabled ? tr("stateEnabled") : tr("stateDisabled"))
              );
            }
          });
        }
      }

      var autoArrangeButton = document.querySelector('[data-menu-action="auto-arrange-windows"]');
      if (autoArrangeButton && autoArrangeButton.dataset.v1Bound !== "1") {
        autoArrangeButton.dataset.v1Bound = "1";
        autoArrangeButton.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (event.stopImmediatePropagation) event.stopImmediatePropagation();
          autoArrangeDetachedCards();
        });
      }

      var resetMemoryButton = document.querySelector('[data-menu-action="reset-memory"]');
      if (resetMemoryButton && resetMemoryButton.dataset.v1Bound !== "1") {
        resetMemoryButton.dataset.v1Bound = "1";
        resetMemoryButton.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (event.stopImmediatePropagation) event.stopImmediatePropagation();
          var confirmDialog = window.NetReconNewUI && window.NetReconNewUI.openConfirmDialog;
          var confirmed = confirmDialog
            ? confirmDialog(tr("devFullResetConfirmTitle"), tr("devFullResetConfirmMessage"), tr("devFullResetConfirmOk"), tr("exitPromptCancel"))
            : Promise.resolve(window.confirm(tr("devFullResetConfirmMessage")));
          confirmed.then(function (shouldReset) {
            if (!shouldReset) return;
            resetPersistentMemory();
            window.location.reload();
          });
        });
      }

      if (panelInteractionsRuntime && panelInteractionsRuntime.wireShellCraftLibrary) {
        panelInteractionsRuntime.wireShellCraftLibrary();
      }

      if (panelInteractionsRuntime && panelInteractionsRuntime.wireShellCraftInspector) {
        panelInteractionsRuntime.wireShellCraftInspector();
      }

      ensureAllTabControls();

      function closeTab(tabEl) {
        if (!tabEl) return;
        var closingTool = tabEl.getAttribute("data-tool") || "";
        closeToolTab(closingTool);
      }

      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && swapSourceCard) {
          swapSourceCard.classList.remove("is-swap-source");
          swapSourceCard = null;
        }
      });

      document.addEventListener("click", function (event) {
        var target = event.target;
        if (!target || typeof target.closest !== "function") return;

        var close = target.closest("[data-tab-close]");
        if (close) {
          event.preventDefault();
          event.stopPropagation();
          if (event.stopImmediatePropagation) event.stopImmediatePropagation();
          closeTab(close.closest(".v1-tab"));
          return;
        }

        var popout = target.closest("[data-tab-popout]");
        if (!popout) return;

        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();

        var tabEl = popout.closest(".v1-tab");
        if (!tabEl) return;

        var tool = tabEl.getAttribute("data-tool");
        if (!tool) return;

        if (getDetachedCard(tool)) {
          destroyDetachedCard(tool);
          restoreDetachedTab(tool);
          applyDetachedCardState();
          if (!activeTool) {
            switchTool(tool);
          } else {
            updateEmptyState();
            updateTabPopoutUi();
          }
          if (setStatusLine) setStatusLine(tr("toolRoute") + ": " + tool + " " + tr("detachedDocked"));
          return;
        }

        if (tabEl.classList.contains("tab-closed")) {
          tabEl.classList.remove("tab-closed");
          tabEl.removeAttribute("hidden");
        }

        createDetachedCard(tool);
        applyDetachedCardState();
        if (activeTool === tool) {
          var nextDockedTab = findNextDockedTab(tool);
          if (nextDockedTab) {
            switchTool(nextDockedTab.getAttribute("data-tool"));
          } else {
            activeTool = null;
            if (store && store.setState) store.setState({ activeTool: null });
            refreshActiveUI();
          }
        } else {
          updateEmptyState();
          updateTabPopoutUi();
        }
        if (setStatusLine) setStatusLine(tr("toolRoute") + ": " + tool + " " + tr("detachedUndocked"));
      });

      document.addEventListener("contextmenu", function (event) {
        var target = event.target;
        if (!target || typeof target.closest !== "function") return;

        var popout = target.closest("[data-tab-popout]");
        if (!popout) return;

        event.preventDefault();
        event.stopPropagation();

        var tabEl = popout.closest(".v1-tab");
        if (!tabEl) return;
        var tool = tabEl.getAttribute("data-tool");
        if (!tool) return;

        clearDetachedLayout(tool);

        var detachedCard = getDetachedCard(tool);
        if (detachedCard) {
          applyCardLayout(detachedCard, getDefaultDetachedLayout());
          saveDetachedLayout(tool, readCardLayoutFromDom(detachedCard));
        }

        if (setStatusLine) setStatusLine(tr("toolRoute") + ": " + tool + " " + tr("detachedLayoutReset"));
      });

      updateEmptyState();
      if (ipLibraryRuntime) ipLibraryRuntime.wireIpLibraryButtons();
      updateTabPopoutUi();
    }

    function buildDetailHtml(tool) {
      if (panelContentRuntime && panelContentRuntime.buildDetailHtml) {
        return panelContentRuntime.buildDetailHtml(tool);
      }
      return "<h4>" + escapeHtml(tool || "") + "</h4><div>Panel content runtime is not available.</div>";
    }

    // shell dispatch mechanism (generic tool-id -> wiring-function routing),
    // branches below are individually shell or ip-scanner tool.
    function wireToolRuntime(tool, rootEl) {
      var scope = rootEl && typeof rootEl.querySelector === "function" ? rootEl : undefined;

      if (tool === "versions") { // shell
        if (panelInteractionsRuntime && panelInteractionsRuntime.wireVersionsTimeline) {
          panelInteractionsRuntime.wireVersionsTimeline(scope);
        }
        return;
      }

      if (tool === "shellcraft") { // shell
        if (panelInteractionsRuntime && panelInteractionsRuntime.wireShellCraftCanvas) {
          panelInteractionsRuntime.wireShellCraftCanvas(scope);
        }
        return;
      }

      if (tool === "pulpit") { // shell
        if (panelInteractionsRuntime && panelInteractionsRuntime.wirePulpitCanvas) {
          panelInteractionsRuntime.wirePulpitCanvas(scope);
        }
        return;
      }

      if (tool === "pulpit-preview") { // shell
        if (panelInteractionsRuntime && panelInteractionsRuntime.wirePulpitPreviewTool) {
          panelInteractionsRuntime.wirePulpitPreviewTool(scope);
        }
        return;
      }

      if (tool === "mail-xss-tester") { // shell
        if (panelInteractionsRuntime && panelInteractionsRuntime.wireMailXssTesterTool) {
          panelInteractionsRuntime.wireMailXssTesterTool(scope);
        }
        return;
      }

      if (tool === "google-dork") { // shell
        if (panelInteractionsRuntime && panelInteractionsRuntime.wireGoogleDorkTool) {
          panelInteractionsRuntime.wireGoogleDorkTool(scope);
        }
        return;
      }

      if (tool === "komunikator") { // shell
        if (panelInteractionsRuntime && panelInteractionsRuntime.wireKomunikatorTool) {
          panelInteractionsRuntime.wireKomunikatorTool(scope);
        }
        return;
      }

      if (tool === "globe") { // shell
        if (panelInteractionsRuntime && panelInteractionsRuntime.wireGlobeTool) {
          panelInteractionsRuntime.wireGlobeTool(scope);
        }
        return;
      }

      if (tool === "agent-profiles") { // shell
        if (panelInteractionsRuntime && panelInteractionsRuntime.wireAgentProfileDetail) {
          panelInteractionsRuntime.wireAgentProfileDetail(scope);
        }
        return;
      }

      if (tool === "results-ip") { // ip-scanner tool
        if (panelInteractionsRuntime && panelInteractionsRuntime.wireResultsIpTable) {
          panelInteractionsRuntime.wireResultsIpTable(scope);
        }
        return;
      }

      if (tool === "presets") { // ip-scanner tool
        if (panelInteractionsRuntime && panelInteractionsRuntime.wirePresetsTool) {
          panelInteractionsRuntime.wirePresetsTool(scope);
        }
        return;
      }

      if (tool === "ip-library") { // ip-scanner tool
        if (ipLibraryRuntime) ipLibraryRuntime.wireIpLibraryButtons(scope);
        return;
      }

      if (tool === "network-monitor") { // ip-scanner tool
        if (panelInteractionsRuntime && panelInteractionsRuntime.wireNetworkMonitorTool) {
          panelInteractionsRuntime.wireNetworkMonitorTool(scope);
        }
        return;
      }

      if (tool === "email-recon") { // ip-scanner tool
        if (panelInteractionsRuntime && panelInteractionsRuntime.wireEmailReconTool) {
          panelInteractionsRuntime.wireEmailReconTool(scope);
        }
        return;
      }

      if (tool === "ai-permissions") { // shell
        if (panelInteractionsRuntime && panelInteractionsRuntime.wireAiPermissionsTool) {
          panelInteractionsRuntime.wireAiPermissionsTool(scope);
        }
        return;
      }

      if (tool === "general") { // shell
        if (panelInteractionsRuntime && panelInteractionsRuntime.wireGeneralSettingsTool) {
          panelInteractionsRuntime.wireGeneralSettingsTool(scope);
        }
        return;
      }

      if (tool === "import-tool") { // shell
        if (addonCatalogRuntime) addonCatalogRuntime.wireImportToolButtons(scope);
        return;
      }

      if (tool === "language-manager") { // shell
        if (languageCatalogRuntime) languageCatalogRuntime.wireLanguageManagerButtons(scope);
        return;
      }

      // shell: generic fallback for extension-contributed tools whose
      // manifest declares contributions.tools[key].actions - wires each
      // declared action button to invoke the matching command-bus command.
      var toolInfo = (getToolInfoMap ? getToolInfoMap() : {})[tool];
      if (toolInfo && Array.isArray(toolInfo.actions) && toolInfo.actions.length) {
        wireExtensionToolActions(scope, toolInfo);
      }
    }

    // Reads the live value of one addon-declared input field
    // (.v1-ext-field-row's <input data-ext-field="name">) - escaped the same
    // way data-ext-action-command lookups already are (window.CSS.escape
    // when available), since a careless/hostile field name could otherwise
    // break the selector rather than just fail to match.
    function extFieldSelector(name) {
      var escaped = window.CSS && typeof window.CSS.escape === "function" ? window.CSS.escape(name) : String(name).replace(/["\\]/g, "\\$&");
      return '[data-ext-field="' + escaped + '"]';
    }

    function wireExtensionToolActions(scope, toolInfo) {
      var root = scope || document;
      var actions = Array.isArray(toolInfo.actions) ? toolInfo.actions : [];
      var fields = Array.isArray(toolInfo.fields) ? toolInfo.fields : [];
      var resultsTable = toolInfo.resultsTable || null;

      actions.forEach(function (action) {
        var commandId = action && action.commandId;
        if (!commandId) return;
        var selectorId = window.CSS && typeof window.CSS.escape === "function" ? window.CSS.escape(commandId) : String(commandId).replace(/["\\]/g, "\\$&");
        var btn = root.querySelector('[data-ext-action-command="' + selectorId + '"]');
        if (!btn || btn.dataset.extActionBound === "1") return;
        btn.dataset.extActionBound = "1";

        // "dynamic:<fieldName>" lets one button's actual target command
        // depend on a select field's current value (e.g. a "technique"
        // picker choosing native/fetch/img) instead of being fixed at
        // manifest-write time - commandId above still identifies the
        // BUTTON (data-ext-action-command), this only affects what gets
        // invoked when it's clicked.
        function resolveCommandId() {
          if (typeof commandId !== "string" || commandId.indexOf("dynamic:") !== 0) return commandId;
          var fieldName = commandId.slice("dynamic:".length);
          var fieldEl = root.querySelector(extFieldSelector(fieldName));
          return fieldEl ? fieldEl.value : "";
        }

        btn.addEventListener("click", function () {
          var output = root.querySelector("[data-ext-action-output]");
          var tableWrap = root.querySelector("[data-ext-results-table]");
          var realCommandId = resolveCommandId();
          if (!commandBus || !realCommandId || !commandBus.has(realCommandId)) {
            if (output) output.textContent = "Command not available (missing permission or extension not installed).";
            return;
          }

          var args = {};
          fields.forEach(function (field) {
            var name = field && field.name;
            if (!name) return;
            var input = root.querySelector(extFieldSelector(name));
            args[name] = input ? input.value : "";
          });

          btn.disabled = true;
          if (tableWrap) tableWrap.hidden = true;
          if (output) {
            output.hidden = false;
            output.textContent = "Running...";
          }

          // When this action hands its result to a DIFFERENT tool
          // (action.openTool - the LS-fields/CS-results split pattern, e.g.
          // a left-panel target+technique picker whose button opens a
          // center-tab results view), nothing renders locally here: this
          // root has no resultsTable of its own in that case, and showing
          // raw JSON in the fields panel right before switchTool() navigates
          // away from it would just be noise. The destination tool re-
          // renders fresh from the same stored resultKey value (see
          // infoFor/renderDefaultTool in panel-content-runtime.js), so
          // nothing is lost - only suppressed where it would look wrong.
          var showLocally = !action.openTool;

          function finish(text) {
            var renderedAsTable = false;
            if (showLocally && resultsTable && tableWrap) {
              var rows = null;
              try {
                var parsed = JSON.parse(text);
                if (Array.isArray(parsed)) rows = parsed;
              } catch (_) {
                rows = null;
              }
              if (rows) {
                var columns = Array.isArray(resultsTable.columns) ? resultsTable.columns : [];
                var tbody = tableWrap.querySelector("tbody");
                if (tbody) {
                  tbody.innerHTML = rows.map(function (row) {
                    var cells = columns.map(function (col) {
                      var value = row && Object.prototype.hasOwnProperty.call(row, col.key) ? row[col.key] : "";
                      return "<td>" + escapeHtml(String(value == null ? "" : value)) + "</td>";
                    }).join("");
                    return "<tr>" + cells + "</tr>";
                  }).join("");
                  tableWrap.hidden = false;
                  if (output) output.hidden = true;
                  renderedAsTable = true;
                }
              }
            }
            if (!renderedAsTable) {
              if (showLocally && output) {
                output.hidden = false;
                output.textContent = text;
              } else if (output) {
                output.hidden = true;
                output.textContent = "";
              }
            }

            if (action.resultKey && store) {
              store.setState({
                extResults: Object.assign({}, store.getState().extResults, {
                  [action.resultKey]: text,
                }),
              });
            }
            if (action.openTool && switchTool) switchTool(action.openTool);
          }

          Promise.resolve(commandBus.invoke(realCommandId, args))
            .then(function (result) {
              finish(String(result == null ? "" : result));
            })
            .catch(function (err) {
              finish("Error: " + (err && err.message ? err.message : String(err)));
            })
            .then(function () { btn.disabled = false; });
        });
      });
    }

    function getTabsTrack() {
      return document.querySelector(".v1-editor .v1-tabs");
    }

    function scrollActiveTabIntoView() {
      var tabsTrack = getTabsTrack();
      if (!tabsTrack) return;

      var activeTab = tabsTrack.querySelector('.v1-tab.active');
      if (!activeTab) return;

      var maxScrollLeft = Math.max(0, tabsTrack.scrollWidth - tabsTrack.clientWidth);
      var nextScrollLeft = Math.max(0, Math.min(
        maxScrollLeft,
        Math.round(activeTab.offsetLeft - (tabsTrack.clientWidth - activeTab.offsetWidth) / 2)
      ));

      if (Math.abs(tabsTrack.scrollLeft - nextScrollLeft) < 2) return;
      tabsTrack.scrollLeft = nextScrollLeft;
    }

    function scheduleScrollActiveTabIntoView() {
      if (!window.requestAnimationFrame) {
        scrollActiveTabIntoView();
        return;
      }

      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          scrollActiveTabIntoView();
        });
      });
    }

    function refreshActiveUI() {
      updateEmptyState();

      document.querySelectorAll(".v1-tab").forEach(function (el) {
        var isActive = el.getAttribute("data-tool") === activeTool;
        el.classList.toggle("active", isActive);
        if (isActive && !isDetachedHiddenTab(el)) {
          el.classList.remove("tab-closed");
          el.removeAttribute("hidden");
        }
      });

      var v1Title = document.getElementById("v1ToolTitle");
      var v1Detail = document.getElementById("v1ToolDetail");
      var v1StatusRight = document.getElementById("v1StatusRight");
      var v1MainCard = document.getElementById("v1MainCard");

      if (!activeTool) {
        if (v1Title) v1Title.textContent = "";
        if (v1Detail) v1Detail.innerHTML = "";
        if (v1MainCard) {
          v1MainCard.classList.remove("is-versions-view");
          v1MainCard.classList.remove("is-shellcraft-view");
          v1MainCard.classList.remove("is-pulpit-view");
          v1MainCard.classList.remove("is-pulpit-preview-view");
          v1MainCard.classList.remove("is-globe-view");
        }
        if (typeof setStatusLine === "function") setStatusLine(tr("toolRoute") + ": " + tr("noActiveTab"));
        if (v1StatusRight) v1StatusRight.textContent = tr("active") + ": " + tr("noActiveTab");
        if (typeof onAfterRender === "function") onAfterRender(activeTool);
        return;
      }

      // Ustaw zawartość dla aktywnej zakładki
      var info = infoFor(activeTool);
      if (v1Title) v1Title.textContent = info.title;
      if (v1Detail) v1Detail.innerHTML = buildDetailHtml(activeTool);
      if (v1MainCard) {
        v1MainCard.classList.toggle("is-versions-view", activeTool === "versions");
        v1MainCard.classList.toggle("is-shellcraft-view", activeTool === "shellcraft");
        v1MainCard.classList.toggle("is-pulpit-view", activeTool === "pulpit");
        v1MainCard.classList.toggle("is-pulpit-preview-view", activeTool === "pulpit-preview");
        v1MainCard.classList.toggle("is-globe-view", activeTool === "globe");
      }
      applyDetachedCardState();
      if (typeof setStatusLine === "function") setStatusLine(tr("toolRoute") + ": " + activeTool);
      if (v1StatusRight) v1StatusRight.textContent = tr("active") + ": " + activeTool;
      wireToolRuntime(activeTool);
      if (typeof onAfterRender === "function") onAfterRender(activeTool);
    }

    function switchTool(tool) {
      ensureAllTabControls();
      var detachedCard = tool ? getDetachedCard(tool) : null;
      if (detachedCard) {
        bringDetachedCardToFront(detachedCard);
        if (setStatusLine) setStatusLine(tr("toolRoute") + ": " + tool);
        return;
      }
      if (tool === "scan-runner" && !document.querySelector('.v1-tab[data-tool="scan-runner"]')) { // ip-scanner tool
        activeTool = null;
        if (store && store.setState) store.setState({ activeTool: null });
        refreshActiveUI();
        updateEmptyState();
        updateTabPopoutUi();
        return;
      }
      // Any other id with no matching center tab at all - either unknown,
      // or a real catalog entry that just isn't a center-tab tool (e.g. an
      // RS-only settings pane like "email-recon-config") - is a no-op that
      // leaves the current tab exactly as it was. Without this guard, an
      // id that only exists because getToolInfoMap()/hasTool() lump every
      // ui.showInLeftPanel/showInRightPanel/showAsTab entry into one flat
      // namespace would still blank the whole CS pane below (activeTool
      // set to an id nothing can render for) - surfaced by the AI tool-
      // calling engine, which can be handed any id a human would never
      // type into a hardcoded button's onclick.
      var tab = document.querySelector('.v1-tab[data-tool="' + tool + '"]');
      if (!tab) return;
      if (tab.classList.contains("tab-closed")) {
        tab.classList.remove("tab-closed");
      }
      if (tab && !isDetachedHiddenTab(tab)) {
        tab.removeAttribute("hidden");
      }

      activeTool = tool;
      if (store && store.setState) store.setState({ activeTool: tool });
      refreshActiveUI();
      updateEmptyState();
      updateTabPopoutUi();
      scheduleScrollActiveTabIntoView();
    }

    function getActiveTool() {
      return activeTool;
    }

    function hasTool(tool) {
      var tools = getToolInfoMap ? getToolInfoMap() : {};
      return !!tools[tool];
    }

    function getDetachedTools() {
      return Object.keys(detachedCards);
    }

    function getOpenCenterTools() {
      return Array.from(document.querySelectorAll(".v1-tab[data-tool]")).filter(function (t) {
        return !t.classList.contains("tab-closed") && !isDetachedHiddenTab(t);
      }).map(function (t) {
        return t.getAttribute("data-tool");
      }).filter(Boolean);
    }

    // shell: detached tool cards are built once (createDetachedCard()) and
    // never rebuilt afterward - switchTool()'s detached-card branch only
    // brings the card to front, it doesn't re-render. Live-updating tools
    // (results-ip during a scan) need an explicit rebuild path instead,
    // mirroring exactly what createDetachedCard() does at creation time.
    function refreshDetachedTool(tool) {
      var card = tool ? getDetachedCard(tool) : null;
      if (!card) return false;
      var detailRoot = card.querySelector(".tool-detail");
      if (!detailRoot) return false;
      detailRoot.innerHTML = stripIds(buildDetailHtml(tool));
      if (tool === "results-ip") {
        wireDetachedResultsIp(detailRoot);
      }
      wireToolRuntime(tool, detailRoot);
      return true;
    }

    function refreshShellCraftPanels() {
      if (panelInteractionsRuntime && panelInteractionsRuntime.wireShellCraftLibrary) {
        panelInteractionsRuntime.wireShellCraftLibrary();
      }
      if (panelInteractionsRuntime && panelInteractionsRuntime.wireShellCraftInspector) {
        panelInteractionsRuntime.wireShellCraftInspector();
      }
    }

    function refreshPulpitPanels() {
      if (panelInteractionsRuntime && panelInteractionsRuntime.wirePulpitLibrary) {
        panelInteractionsRuntime.wirePulpitLibrary();
      }
      if (panelInteractionsRuntime && panelInteractionsRuntime.wirePulpitInspector) {
        panelInteractionsRuntime.wirePulpitInspector();
      }
      if (panelInteractionsRuntime && panelInteractionsRuntime.wirePulpitPreviewList) {
        panelInteractionsRuntime.wirePulpitPreviewList();
      }
    }

    // CS self-listens for changes once wireAgentProfileDetail has run (see
    // its document-level "newui:agent-profiles-changed" handler), so only
    // the LS library needs a manual re-wire here - same reasoning
    // refreshPulpitPanels uses for its own Library half.
    function refreshAgentProfilePanels() {
      if (panelInteractionsRuntime && panelInteractionsRuntime.wireAgentProfileLibrary) {
        panelInteractionsRuntime.wireAgentProfileLibrary();
      }
    }

    // Exposed for LS/RS's generic-content-slot mechanism
    // (tool-content-runtime.js's "ip-library" entry) - reuses the exact
    // same wiring CS's own ip-library tab already calls, which is why it
    // already accepts an arbitrary rootEl instead of assuming `document`.
    function wireIpLibraryPanel(rootEl) {
      if (ipLibraryRuntime && ipLibraryRuntime.wireIpLibraryButtons) {
        ipLibraryRuntime.wireIpLibraryButtons(rootEl);
      }
    }

    // Exposed for LS's generic-content-slot mechanism (tool-content-
    // runtime.js's "network-monitor" entry) - same idea as
    // wireIpLibraryPanel above.
    function wireNetworkMonitorLeftPanel(rootEl) {
      if (panelInteractionsRuntime && panelInteractionsRuntime.wireNetworkMonitorLeftPanel) {
        panelInteractionsRuntime.wireNetworkMonitorLeftPanel(rootEl);
      }
    }

    // Exposed for LS/RS's generic-content-slot mechanism (tool-content-
    // runtime.js's "mail-xss-tester-library"/"-results" entries) - same
    // idea as wireNetworkMonitorLeftPanel above.
    function wireMailXssTesterLibrary(rootEl) {
      if (panelInteractionsRuntime && panelInteractionsRuntime.wireMailXssTesterLibrary) {
        panelInteractionsRuntime.wireMailXssTesterLibrary(rootEl);
      }
    }

    function wireMailXssTesterResults(rootEl) {
      if (panelInteractionsRuntime && panelInteractionsRuntime.wireMailXssTesterResults) {
        panelInteractionsRuntime.wireMailXssTesterResults(rootEl);
      }
    }

    // Exposed for LS/RS's generic-content-slot mechanism (tool-content-
    // runtime.js's "google-dork-library"/"-templates" entries) - same
    // idea as wireMailXssTesterLibrary/-Results above.
    function wireGoogleDorkLibrary(rootEl) {
      if (panelInteractionsRuntime && panelInteractionsRuntime.wireGoogleDorkLibrary) {
        panelInteractionsRuntime.wireGoogleDorkLibrary(rootEl);
      }
    }

    function wireGoogleDorkTemplates(rootEl) {
      if (panelInteractionsRuntime && panelInteractionsRuntime.wireGoogleDorkTemplates) {
        panelInteractionsRuntime.wireGoogleDorkTemplates(rootEl);
      }
    }

    // Exposed for LS/RS's generic-content-slot mechanism (tool-content-
    // runtime.js's "komunikator-library"/"-members" entries) - same idea
    // as wireGoogleDorkLibrary/-Templates above.
    function wireKomunikatorLibrary(rootEl) {
      if (panelInteractionsRuntime && panelInteractionsRuntime.wireKomunikatorLibrary) {
        panelInteractionsRuntime.wireKomunikatorLibrary(rootEl);
      }
    }

    function wireKomunikatorMembers(rootEl) {
      if (panelInteractionsRuntime && panelInteractionsRuntime.wireKomunikatorMembers) {
        panelInteractionsRuntime.wireKomunikatorMembers(rootEl);
      }
    }

    return {
      setTooltips: setTooltips,
      refreshActiveUI: refreshActiveUI,
      switchTool: switchTool,
      getActiveTool: getActiveTool,
      hasTool: hasTool,
      getDetachedTools: getDetachedTools,
      getOpenCenterTools: getOpenCenterTools,
      closeCenterTool: closeToolTab,
      flattenIpLibraryEntries: ipLibraryRuntime && ipLibraryRuntime.flattenIpLibraryEntries,
      initWorkbenchTabs: initWorkbenchTabs,
      buildDetailHtml: buildDetailHtml,
      wireToolRuntime: wireToolRuntime,
      stripIds: stripIds,
      refreshShellCraftPanels: refreshShellCraftPanels,
      refreshPulpitPanels: refreshPulpitPanels,
      refreshAgentProfilePanels: refreshAgentProfilePanels,
      wireIpLibraryPanel: wireIpLibraryPanel,
      wireNetworkMonitorLeftPanel: wireNetworkMonitorLeftPanel,
      wireMailXssTesterLibrary: wireMailXssTesterLibrary,
      wireMailXssTesterResults: wireMailXssTesterResults,
      wireGoogleDorkLibrary: wireGoogleDorkLibrary,
      wireGoogleDorkTemplates: wireGoogleDorkTemplates,
      wireKomunikatorLibrary: wireKomunikatorLibrary,
      wireKomunikatorMembers: wireKomunikatorMembers,
      refreshDetachedTool: refreshDetachedTool,
      applyEmailReconResult: function (email, result) {
        if (panelInteractionsRuntime && panelInteractionsRuntime.applyEmailReconResult) {
          panelInteractionsRuntime.applyEmailReconResult(email, result);
        }
      },
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createPanelsRuntime = createPanelsRuntime;
})();
