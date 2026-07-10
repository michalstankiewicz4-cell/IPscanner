(function () {
  // shell: generic detached-card/workbench-tab engine (open/close/detach/
  // arrange/resize any tool's card) makes up most of this file. Three
  // contiguous ip-scanner tool blocks are labeled where they start:
  // extractRanges/pickCountryFromItem/flattenIpLibraryEntries (IP Library
  // parsing), wireDetachedResultsIp (Results IP detached-window wiring),
  // wireIpLibraryButtons (IP Library, incl. PowerShell invocation). A couple
  // of small hardcoded tool-id checks are labeled inline (wireToolRuntime,
  // switchTool). Largest and most tangled file in this shell/tools split -
  // no physical move attempted, comments only, per CONTRIBUTING 12a.
  function createPanelsRuntime(deps) {
    var tr = deps.tr;
    var getToolInfoMap = deps.getToolInfoMap;
    var versionsData = Array.isArray(deps.versionsData) ? deps.versionsData : [];
    var platform = deps.platform || ((window.NetReconNewUICore && window.NetReconNewUICore.platform) || {});
    var storage = platform.storage || null;
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

    // --- ip-scanner tool keys ---
    // IP Library raw-shape parsing, used by flattenIpLibraryEntries below
    // (session-runtime.js's collectSessionData) and wireIpLibraryButtons.
    function extractRanges(item) {
      if (!item || typeof item !== "object") return [];

      var direct = String(item.cidr || item.range || item.network || item.address || item.ip_range || "").trim();
      if (direct) return [direct];

      if (Array.isArray(item.ranges) && item.ranges.length) {
        return item.ranges.map(function (entry) {
          if (entry && typeof entry === "object") {
            return String(entry.cidr || entry.range || entry.network || entry.address || entry.ip_range || "").trim();
          }
          return String(entry || "").trim();
        }).filter(Boolean);
      }

      return [];
    }

    function pickCountryFromItem(item) {
      if (!item || typeof item !== "object") return "-";
      return String(
        item.country_code ||
        item.countryCode ||
        item.country ||
        item.code ||
        item.flag ||
        item.name ||
        "-"
      ).toUpperCase();
    }

    function flattenIpLibraryEntries(rawArray) {
      var items = Array.isArray(rawArray) ? rawArray : [];
      var entries = [];
      items.forEach(function (item) {
        var countryCode = pickCountryFromItem(item);
        extractRanges(item).forEach(function (cidr) {
          if (!cidr) return;
          entries.push({ cidr: cidr, countryCode: countryCode });
        });
      });
      return entries;
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
        as: false,
        device: false,
        http: false,
        access: false,
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
    function escapeHtml(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
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
      };
    }

    // shell: registers command-bus entries declared by an installed
    // extension's contributions.commands, gated on the extension's granted
    // permissions. Only "powershell" commands are supported today (see
    // FUTURE_PLUGIN_SHELL.md for the larger, still-undone contribution model).
    function registerExtensionCommands(manifest) {
      if (!commandBus || !manifest || !manifest.contributions) return;
      var granted = Array.isArray(manifest.permissions) ? manifest.permissions : [];
      var commands = manifest.contributions.commands || {};
      Object.keys(commands).forEach(function (commandId) {
        var def = commands[commandId];
        if (!def || def.type !== "powershell") return;
        if (granted.indexOf("powershell") === -1) return;
        var script = typeof def.script === "string" ? def.script.trim() : "";
        if (!script) return;
        commandBus.register(commandId, function () {
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

    var panelInteractionsRuntime = null;
    if (window.NetReconNewUICore && window.NetReconNewUICore.newUiRuntimes && window.NetReconNewUICore.newUiRuntimes.createPanelInteractionsRuntime) {
      panelInteractionsRuntime = window.NetReconNewUICore.newUiRuntimes.createPanelInteractionsRuntime({
        versionsData: versionsData,
        tr: tr,
        setStatusLine: setStatusLine,
        renderShellCraftLibrary: panelContentRuntime && panelContentRuntime.renderShellCraftLibrary,
        renderCanvasBlockHtml: panelContentRuntime && panelContentRuntime.renderCanvasBlockHtml,
        renderShellCraftInspector: panelContentRuntime && panelContentRuntime.renderShellCraftInspector,
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
        wireIpLibraryButtons(document);
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
      wireIpLibraryButtons();
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

      if (tool === "scan-defaults") { // ip-scanner tool
        if (panelInteractionsRuntime && panelInteractionsRuntime.wireScanDefaultsTool) {
          panelInteractionsRuntime.wireScanDefaultsTool(scope);
        }
        return;
      }

      if (tool === "ip-library") { // ip-scanner tool
        wireIpLibraryButtons(scope);
        return;
      }

      if (tool === "import-tool") { // shell
        wireImportToolButtons(scope);
        return;
      }

      if (tool === "language-manager") { // shell
        wireLanguageManagerButtons(scope);
        return;
      }

      // shell: generic fallback for extension-contributed tools whose
      // manifest declares contributions.tools[key].actions - wires each
      // declared action button to invoke the matching command-bus command.
      var toolInfo = (getToolInfoMap ? getToolInfoMap() : {})[tool];
      if (toolInfo && Array.isArray(toolInfo.actions) && toolInfo.actions.length) {
        wireExtensionToolActions(scope, toolInfo.actions);
      }
    }

    function wireExtensionToolActions(scope, actions) {
      var root = scope || document;
      actions.forEach(function (action) {
        var commandId = action && action.commandId;
        if (!commandId) return;
        var selectorId = window.CSS && typeof window.CSS.escape === "function" ? window.CSS.escape(commandId) : String(commandId).replace(/["\\]/g, "\\$&");
        var btn = root.querySelector('[data-ext-action-command="' + selectorId + '"]');
        if (!btn || btn.dataset.extActionBound === "1") return;
        btn.dataset.extActionBound = "1";
        btn.addEventListener("click", function () {
          var output = root.querySelector("[data-ext-action-output]");
          if (!commandBus || !commandBus.has(commandId)) {
            if (output) output.textContent = "Command not available (missing permission or extension not installed).";
            return;
          }
          btn.disabled = true;
          if (output) output.textContent = "Running...";
          Promise.resolve(commandBus.invoke(commandId))
            .then(function (result) {
              var text = String(result == null ? "" : result);
              if (output) output.textContent = text;
              if (action.resultKey && store) {
                store.setState({
                  extResults: Object.assign({}, store.getState().extResults, {
                    [action.resultKey]: text,
                  }),
                });
              }
              if (action.openTool && switchTool) switchTool(action.openTool);
            })
            .catch(function (err) {
              if (output) output.textContent = "Error: " + (err && err.message ? err.message : String(err));
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
      var v1ScanMeta = document.getElementById("v1ScanMeta");
      var v1ScanActions = document.getElementById("v1ScanActions");
      var v1MainCard = document.getElementById("v1MainCard");

      if (!activeTool) {
        if (v1Title) v1Title.textContent = "";
        if (v1Detail) v1Detail.innerHTML = "";
        if (v1ScanMeta) {
          v1ScanMeta.setAttribute("hidden", "hidden");
          v1ScanMeta.style.display = "none";
          v1ScanMeta.setAttribute("aria-hidden", "true");
        }
        if (v1ScanActions) {
          v1ScanActions.setAttribute("hidden", "hidden");
          v1ScanActions.style.display = "none";
          v1ScanActions.setAttribute("aria-hidden", "true");
        }
        if (v1MainCard) {
          v1MainCard.classList.remove("is-versions-view");
          v1MainCard.classList.remove("is-shellcraft-view");
        }
        if (typeof setStatusLine === "function") setStatusLine(tr("toolRoute") + ": " + tr("noActiveTab"));
        if (v1StatusRight) v1StatusRight.textContent = tr("active") + ": " + tr("noActiveTab");
        if (typeof onAfterRender === "function") onAfterRender(activeTool);
        return;
      }

      // Ustaw zawartość dla aktywnej zakładki
      var info = infoFor(activeTool);
      var isScanRunner = activeTool === "scan-runner";
      if (v1Title) v1Title.textContent = info.title;
      if (v1Detail) v1Detail.innerHTML = buildDetailHtml(activeTool);
      if (v1ScanMeta) {
        if (isScanRunner) {
          v1ScanMeta.removeAttribute("hidden");
          v1ScanMeta.style.display = "grid";
          v1ScanMeta.setAttribute("aria-hidden", "false");
        } else {
          v1ScanMeta.setAttribute("hidden", "hidden");
          v1ScanMeta.style.display = "none";
          v1ScanMeta.setAttribute("aria-hidden", "true");
        }
      }
      if (v1ScanActions) {
        if (isScanRunner) {
          v1ScanActions.removeAttribute("hidden");
          v1ScanActions.style.display = "flex";
          v1ScanActions.setAttribute("aria-hidden", "false");
        } else {
          v1ScanActions.setAttribute("hidden", "hidden");
          v1ScanActions.style.display = "none";
          v1ScanActions.setAttribute("aria-hidden", "true");
        }
      }
      if (v1MainCard) {
        v1MainCard.classList.toggle("is-versions-view", activeTool === "versions");
        v1MainCard.classList.toggle("is-shellcraft-view", activeTool === "shellcraft");
      }
      applyDetachedCardState();
      if (typeof setStatusLine === "function") setStatusLine(tr("toolRoute") + ": " + activeTool);
      if (v1StatusRight) v1StatusRight.textContent = tr("active") + ": " + activeTool;
      wireToolRuntime(activeTool);
      if (typeof onAfterRender === "function") onAfterRender(activeTool);
    }

    // --- ip-scanner tool keys ---
    // IP Library wiring, incl. PowerShell invocation for
    // update-country-ip-library.ps1. Whole block through loadCached() below
    // is ip-scanner tool.
    function wireIpLibraryButtons(rootEl) {
      var root = rootEl && typeof rootEl.querySelector === "function" ? rootEl : document;

      var countriesEl = root.querySelector("#v1IpLibraryCountryCodes") || root.querySelector(".v1-iplib-countries");
      var topRangesEl = root.querySelector("#v1IpLibraryTopRanges") || root.querySelector(".v1-iplib-topranges");
      var actionButtons = root.querySelectorAll("[data-iplib-action]");

      function getLastUpdateEls() {
        var sidebar = root.querySelector("#v1IpLibraryLastUpdate") || root.querySelector('[data-iplib-role="last-update-sidebar"]');
        var center = root.querySelector("#v1IpLibraryCenterLastUpdate") || root.querySelector('[data-iplib-role="last-update-center"]');
        if (root !== document) {
          if (!sidebar) sidebar = document.getElementById("v1IpLibraryLastUpdate");
          if (!center) center = document.getElementById("v1IpLibraryCenterLastUpdate");
        }
        return {
          sidebar: sidebar,
          center: center,
        };
      }

      function getStatusEls() {
        var sidebar = root.querySelector("#v1IpLibraryStatus") || root.querySelector('[data-iplib-role="status-sidebar"]');
        var center = root.querySelector("#v1IpLibraryCenterStatus") || root.querySelector('[data-iplib-role="status-center"]');
        if (root !== document) {
          if (!sidebar) sidebar = document.getElementById("v1IpLibraryStatus");
          if (!center) center = document.getElementById("v1IpLibraryCenterStatus");
        }
        return {
          sidebar: sidebar,
          center: center,
        };
      }

      function getCenterRowsEl() {
        return root.querySelector("#v1IpLibraryCenterRows") || root.querySelector('[data-iplib-role="rows"]');
      }

      if (!actionButtons.length && !getCenterRowsEl()) return;

      var DEFAULT_CODES = "pl,cn,ru,us,de,fr,gb,jp,kr,br,in,au,nl,ua,cz,se,no,fi,tr,ir,sa,za,ar,mx,ca,it,es";
      var CACHE_KEY = "netrecon_country_ip_library_json";
      var CACHE_UPDATED_KEY = "netrecon_country_ip_library_updated_at";
      var MEMORY_CACHE_KEY = "__netreconIpLibraryCache";

      if (countriesEl && !countriesEl.value.trim()) countriesEl.value = DEFAULT_CODES;
      if (topRangesEl && !topRangesEl.value.trim()) topRangesEl.value = "120";

      function writeStatus(text) {
        var value = String(text || "");
        var statusEls = getStatusEls();
        if (statusEls.sidebar) statusEls.sidebar.textContent = value;
        if (statusEls.center) statusEls.center.textContent = value;
      }

      function nowStamp() {
        var d = new Date();
        return d.toLocaleTimeString();
      }

      function appendTerminalLine(line) {
        var value = String(line || "");
        if (!value) return;

        var out = document.getElementById("v1PsOutput");
        if (out) {
          var next = (out.textContent ? out.textContent + "\n" : "") + value;
          var rows = next.split("\n");
          out.textContent = rows.length > 400 ? rows.slice(rows.length - 400).join("\n") : next;
          out.scrollTop = out.scrollHeight;
        }

        document.dispatchEvent(new CustomEvent("newui:console-pane-update", {
          detail: {
            pane: "console",
            source: "ip-library",
            text: value,
          },
        }));
      }

      function writeOutput(text) {
        var value = String(text || "").trim();
        if (!value) return;

        var clipped = value.length > 12000 ? (value.slice(0, 12000) + "\n...[truncated]") : value;
        appendTerminalLine(clipped);
      }

      function readMemoryCache() {
        try {
          var core = window.NetReconNewUICore = window.NetReconNewUICore || {};
          var payload = core[MEMORY_CACHE_KEY];
          if (!payload || typeof payload !== "object") return null;
          var data = Array.isArray(payload.data) ? payload.data : [];
          var updatedAt = String(payload.updatedAt || "-");
          return { data: data, updatedAt: updatedAt };
        } catch (_) {
          return null;
        }
      }

      function writeMemoryCache(data, updatedAt) {
        try {
          var core = window.NetReconNewUICore = window.NetReconNewUICore || {};
          core[MEMORY_CACHE_KEY] = {
            data: Array.isArray(data) ? data : [],
            updatedAt: String(updatedAt || "-")
          };
        } catch (_) {
          // ignore memory-cache write failures
        }
      }

      function setLastUpdate(value) {
        var text = String(value || "-");
        var lastUpdateEls = getLastUpdateEls();
        if (lastUpdateEls.sidebar) lastUpdateEls.sidebar.textContent = text;
        if (lastUpdateEls.center) lastUpdateEls.center.textContent = text;
      }

      function pickAddressFromItem(item) {
        if (!item || typeof item !== "object") return "-";

        if (item.cidr) return String(item.cidr);
        if (item.range) return String(item.range);
        if (item.network) return String(item.network);
        if (item.address) return String(item.address);
        if (item.ip_range) return String(item.ip_range);

        if (Array.isArray(item.ranges) && item.ranges.length) {
          return item.ranges.slice(0, 3).map(function (entry) {
            if (entry && typeof entry === "object") {
              return String(entry.cidr || entry.range || entry.network || entry.address || entry.ip_range || "");
            }
            return String(entry || "").trim();
          }).filter(Boolean).join(", ");
        }

        return "-";
      }


      function renderCenterRows(data) {
        var centerRowsEl = getCenterRowsEl();
        if (!centerRowsEl) return;

        var rows = Array.isArray(data) ? data : [];
        if (panelRenderersRuntime && typeof panelRenderersRuntime.renderIpLibraryRows === "function") {
          centerRowsEl.innerHTML = panelRenderersRuntime.renderIpLibraryRows(rows);
          return;
        }

        if (!rows.length) {
          centerRowsEl.innerHTML = '<tr><td colspan="2" class="v1-iplib-empty">' + escapeHtml(tr("ipLibraryTableEmpty")) + '</td></tr>';
          return;
        }

        var html = [];
        rows.forEach(function (item) {
          var country = pickCountryFromItem(item);
          var ranges = extractRanges(item);

          if (!ranges.length) {
            html.push('<tr><td class="v1-iplib-col-country">' + escapeHtml(country) + '</td><td class="v1-iplib-col-address">' + escapeHtml(pickAddressFromItem(item)) + '</td></tr>');
            return;
          }

          ranges.forEach(function (address) {
            html.push('<tr><td class="v1-iplib-col-country">' + escapeHtml(country) + '</td><td class="v1-iplib-col-address">' + escapeHtml(address) + '</td></tr>');
          });
        });

        centerRowsEl.innerHTML = html.join("");
      }

      function getInvoke() {
        if (platform && typeof platform.getInvoke === "function") {
          return platform.getInvoke();
        }
        return null;
      }

      function emitBusyDelta(delta) {
        try {
          document.dispatchEvent(new CustomEvent("newui:busy-state", {
            detail: {
              source: "panels-runtime",
              delta: delta,
            },
          }));
        } catch (_) {
          // ignore busy-state event errors
        }
      }

      function runPowerShell(command) {
        emitBusyDelta(1);

        var promise;
        try {
          if (platform && typeof platform.invoke === "function") {
            promise = platform.invoke("run_powershell", { command: command });
          } else {
            var invoke = getInvoke();
            if (!invoke) {
              promise = Promise.reject(new Error("tauri invoke unavailable"));
            } else {
              promise = invoke("run_powershell", { command: command });
            }
          }
        } catch (err) {
          promise = Promise.reject(err);
        }

        return Promise.resolve(promise).finally(function () {
          emitBusyDelta(-1);
        });
      }

      function parseCountries(text) {
        return String(text || "")
          .split(/[\s,;]+/)
          .map(function (v) { return v.trim().toLowerCase(); })
          .filter(function (v) { return /^[a-z]{2}$/.test(v); });
      }

      function loadCached() {
        var memory = readMemoryCache();
        if (memory && Array.isArray(memory.data) && memory.data.length) {
          var memCount = memory.data.length;
          setLastUpdate(memory.updatedAt || "-");
          writeStatus(tr("ipLibraryStatusLoaded") + " " + memCount + " | " + tr("ipLibraryStatusUpdatedAt") + " " + (memory.updatedAt || "-"));
          renderCenterRows(memory.data);
          return;
        }

        var raw = storageGet(CACHE_KEY) || "";
        var updatedAt = storageGet(CACHE_UPDATED_KEY) || "-";
        setLastUpdate(updatedAt);
        if (!raw) {
          writeStatus(tr("ipLibraryStatusEmpty"));
          renderCenterRows([]);
          return;
        }

        try {
          var data = JSON.parse(raw);
          var normalized = Array.isArray(data) ? data : (data && typeof data === "object" ? [data] : []);
          var count = normalized.length;
          writeMemoryCache(normalized, updatedAt);
          writeStatus(tr("ipLibraryStatusLoaded") + " " + count + " | " + tr("ipLibraryStatusUpdatedAt") + " " + updatedAt);
          renderCenterRows(normalized);
        } catch (_) {
          writeStatus(tr("ipLibraryStatusInvalidCache"));
          renderCenterRows([]);
        }
      }

      actionButtons.forEach(function (button) {
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";

        button.addEventListener("click", function () {
          var actionName = button.getAttribute("data-iplib-action");
          if (actionName === "load") {
            loadCached();
            return;
          }

          if (actionName === "clear") {
            storageSet(CACHE_KEY, "");
            storageSet(CACHE_UPDATED_KEY, "");
            writeMemoryCache([], "-");
            setLastUpdate("-");
            writeStatus(tr("ipLibraryStatusCleared"));
            renderCenterRows([]);
            appendTerminalLine("[" + nowStamp() + "] " + tr("ipLibraryStatusCleared"));
            if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("ipLibraryStatusCleared"));
            return;
          }

          var countryCodes = parseCountries(countriesEl ? countriesEl.value : "");
          if (!countryCodes.length) {
            writeStatus(tr("ipLibraryStatusBadCountries"));
            return;
          }

          var topRanges = Number(topRangesEl ? topRangesEl.value : "120");
          if (!Number.isFinite(topRanges)) topRanges = 120;
          topRanges = Math.max(10, Math.min(500, Math.round(topRanges)));
          if (topRangesEl) topRangesEl.value = String(topRanges);

          var countriesArg = "@('" + countryCodes.join("','") + "')";
          var psCommand = [
            "$ErrorActionPreference='Stop'",
            "$scriptPath = Join-Path (Get-Location) 'scripts\\update-country-ip-library.ps1'",
            "if (!(Test-Path $scriptPath)) { throw \"Missing script: $scriptPath\" }",
            "& $scriptPath -TopRanges " + topRanges + " -CountryCodes " + countriesArg
          ].join('; ');

          writeStatus(tr("ipLibraryStatusUpdating"));
          appendTerminalLine("[" + nowStamp() + "] PS> " + psCommand);
          appendTerminalLine("[" + nowStamp() + "] " + tr("psConsoleRunning"));

          runPowerShell(psCommand).then(function (res) {
            var stdout = res && res.stdout ? String(res.stdout).trim() : "";
            var stderr = res && res.stderr ? String(res.stderr).trim() : "";
            var exitCode = (res && typeof res.exit_code === "number") ? res.exit_code : -1;

            if (stdout) writeOutput(stdout);
            if (stderr) writeOutput(stderr);
            appendTerminalLine("[" + nowStamp() + "] exit code: " + exitCode);

            var jsonText = stdout;
            var arrayStart = stdout.indexOf("[");
            var arrayEnd = stdout.lastIndexOf("]");
            var objectStart = stdout.indexOf("{");
            var objectEnd = stdout.lastIndexOf("}");
            if (arrayStart >= 0 && arrayEnd > arrayStart) {
              jsonText = stdout.slice(arrayStart, arrayEnd + 1);
            } else if (objectStart >= 0 && objectEnd > objectStart) {
              jsonText = stdout.slice(objectStart, objectEnd + 1);
            }

            try {
              var parsed = JSON.parse(jsonText || "[]");
              var normalized = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === "object" ? [parsed] : []);
              var count = normalized.length;
              if (count === 0) {
                var mergedEmpty = [stdout, stderr].filter(Boolean).join("\n\n");
                writeStatus(tr("ipLibraryStatusUpdateFailed"));
                writeOutput(mergedEmpty || tr("ipLibraryStatusUpdateFailed"));
                renderCenterRows([]);
                if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("ipLibraryStatusUpdateFailed"));
                return;
              }

              var payload = JSON.stringify(normalized);
              storageSet(CACHE_KEY, payload);
              var updatedAt = new Date().toISOString();
              storageSet(CACHE_UPDATED_KEY, updatedAt);
              writeMemoryCache(normalized, updatedAt);
              setLastUpdate(updatedAt);

              writeStatus(tr("ipLibraryStatusUpdated") + " " + count + " | " + tr("ipLibraryStatusUpdatedAt") + " " + updatedAt);
              var mergedSuccess = [JSON.stringify(normalized, null, 2)].filter(Boolean).join("\n\n");
              writeOutput(mergedSuccess);
              loadCached();
              if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("ipLibraryStatusUpdated") + " " + count);
            } catch (_) {
              var merged = [stdout, stderr].filter(Boolean).join("\n\n");
              writeStatus(tr("ipLibraryStatusUpdateFailed"));
              writeOutput(merged || tr("ipLibraryStatusUpdateFailed"));
              renderCenterRows([]);
            }
          }).catch(function (err) {
            var errMsg = (err && err.message) ? String(err.message) : "";
            if (errMsg.toLowerCase().indexOf("tauri invoke unavailable") >= 0) {
              writeStatus(tr("statusDesktopOnlyShort"));
              writeOutput(tr("psConsoleDesktopOnly"));
              renderCenterRows([]);
              return;
            }

            writeStatus(tr("ipLibraryStatusUpdateFailed"));
            writeOutput(errMsg || tr("ipLibraryStatusUpdateFailed"));
            renderCenterRows([]);
          });
        });
      });

      loadCached();
    }

    // shell (resumes here after the wireIpLibraryButtons tool block above)
    var CATALOG_OWNER = "michalstankiewicz4-cell";
    var CATALOG_REPO = "IPscanner";
    var CATALOG_BRANCH = "main";
    var CATALOG_FOLDER = "tools";
    var CATALOG_API_URL = "https://api.github.com/repos/" + CATALOG_OWNER + "/" + CATALOG_REPO + "/contents/" + CATALOG_FOLDER + "?ref=" + CATALOG_BRANCH;
    var CATALOG_IMAGE_EXTENSIONS = ["png", "svg", "jpg", "jpeg", "gif", "webp"];
    // shell: catalog fetch is cached at module scope (outside any single
    // Import Tool mount) because refreshActiveUI() rebuilds #v1ToolDetail's
    // whole subtree - including #v1ImportCatalog - on every tab switch and
    // after every install/uninstall, which would otherwise re-trigger a full
    // GitHub API fetch each time and risk the unauthenticated 60/hour quota.
    var catalogEntriesCache = null;
    var catalogFetchPromise = null;

    // shell: fetches the addon catalog from the repo's own tools/ GitHub
    // folder - groups files by basename so "<name>.json" pairs with a
    // same-name image file ("<name>.png" etc.) as that addon's icon. Uses a
    // null-prototype object for grouping so a file literally named
    // "__proto__.json" can't shadow/pollute Object.prototype.
    function fetchCatalog() {
      return fetch(CATALOG_API_URL).then(function (res) {
        if (!res.ok) throw new Error("GitHub API " + res.status);
        return res.json();
      }).then(function (files) {
        var groups = Object.create(null);
        (Array.isArray(files) ? files : []).forEach(function (f) {
          if (!f || f.type !== "file" || typeof f.name !== "string") return;
          var dot = f.name.lastIndexOf(".");
          if (dot < 0) return;
          var base = f.name.slice(0, dot);
          var ext = f.name.slice(dot + 1).toLowerCase();
          groups[base] = groups[base] || {};
          if (ext === "json") groups[base].json = f;
          else if (CATALOG_IMAGE_EXTENSIONS.indexOf(ext) !== -1) groups[base].icon = f;
        });
        var entries = Object.keys(groups).map(function (k) { return groups[k]; }).filter(function (g) { return g.json; });
        return Promise.all(entries.map(function (entry) {
          return fetch(entry.json.download_url).then(function (r) { return r.json(); }).then(function (manifest) {
            return { manifest: manifest, iconUrl: entry.icon ? entry.icon.download_url : "" };
          }).catch(function () { return null; });
        }));
      }).then(function (results) {
        return results.filter(Boolean);
      });
    }

    // shell: returns the cached catalog if already fetched this session,
    // otherwise fetches once and caches (also caches the in-flight promise
    // so concurrent mounts don't fire duplicate requests).
    function loadCatalogCached() {
      if (catalogEntriesCache) return Promise.resolve(catalogEntriesCache);
      if (catalogFetchPromise) return catalogFetchPromise;
      catalogFetchPromise = fetchCatalog().then(function (entries) {
        catalogEntriesCache = entries;
        catalogFetchPromise = null;
        return entries;
      }).catch(function (err) {
        catalogFetchPromise = null;
        throw err;
      });
      return catalogFetchPromise;
    }

    function wireImportToolButtons(rootEl) {
      var root = rootEl && typeof rootEl.querySelector === "function"
        ? rootEl
        : document.getElementById("v1ToolDetail");
      if (!root) return;

      var outputEl = root.querySelector('[data-import-role="output"]') || root.querySelector("#v1ImportOutput");
      var catalogEl = root.querySelector('[data-import-role="catalog"]') || root.querySelector("#v1ImportCatalog");
      var catalogEntries = catalogEntriesCache || [];

      function listInstalled() {
        var items = extensionHost && extensionHost.listExtensions ? extensionHost.listExtensions() : [];
        if (!outputEl) return;
        if (panelRenderersRuntime && typeof panelRenderersRuntime.renderExtensionList === "function") {
          outputEl.innerHTML = panelRenderersRuntime.renderExtensionList(items);
          return;
        }

        outputEl.textContent = "";

        if (!items.length) {
          var emptyEl = document.createElement("div");
          emptyEl.className = "v1-import-empty";
          emptyEl.textContent = "No imported tools yet.";
          outputEl.appendChild(emptyEl);
          return;
        }

        items.forEach(function (item) {
          var itemEl = document.createElement("div");
          itemEl.className = "v1-import-item";

          var strong = document.createElement("strong");
          strong.textContent = item.id;
          itemEl.appendChild(strong);

          var ver = document.createElement("span");
          ver.textContent = "@ " + item.version;
          itemEl.appendChild(ver);

          var name = document.createElement("div");
          name.textContent = item.name;
          itemEl.appendChild(name);

          var uninstallBtn = document.createElement("button");
          uninstallBtn.type = "button";
          uninstallBtn.className = "v1-import-item-uninstall";
          uninstallBtn.setAttribute("data-import-uninstall-id", item.id);
          uninstallBtn.textContent = tr("importToolUninstallBtn");
          itemEl.appendChild(uninstallBtn);

          outputEl.appendChild(itemEl);
        });
      }

      // shell: uninstalls one extension by id - shared by the per-item
      // Uninstall button in the installed-extensions list and the catalog
      // list's Uninstall button.
      function performUninstall(id) {
        if (!id) {
          if (outputEl) outputEl.textContent = tr("extUninstallPrompt");
          return;
        }

        var removeResult = extensionHost && extensionHost.uninstallExtension ? extensionHost.uninstallExtension(id) : { ok: false, error: tr("extUninstallFail") };
        if (!removeResult.ok) {
          if (outputEl) outputEl.textContent = tr("extUninstallFail") + "\n" + removeResult.error;
          return;
        }

        if (commandBus && commandBus.unregisterAllFor) {
          commandBus.unregisterAllFor(removeResult.id);
        }
        listInstalled();
        renderCatalog();
        if (outputEl) outputEl.textContent = tr("extUninstallOk") + "\n" + removeResult.id;
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("extUninstallOk") + " - " + removeResult.id);
        if (window.NetReconNewUI && typeof window.NetReconNewUI.syncExtensionToolUi === "function") {
          window.NetReconNewUI.syncExtensionToolUi();
        }
        refreshActiveUI();
      }

      // shell: installs an already-parsed manifest object - shared by
      // "Load from file..." and clicking Install on a catalog entry. All
      // visibility flags (Tools menu / activity bar / left panel / tab) are
      // fully manifest-controlled - only fills in the shell's own baseline
      // defaults for whatever a tool key leaves unset, confirms permissions,
      // then registers commands and syncs the dynamic UI. iconUrl (only set
      // for catalog installs) becomes each tool's default icon, so the
      // addon's own tools/<name>.png shows up in the activity bar/Tools menu
      // without the manifest needing to reference it itself.
      function installManifestObject(manifest, iconUrl) {
        if (!manifest || typeof manifest !== "object") {
          if (outputEl) outputEl.textContent = tr("extInvalidJson");
          return Promise.resolve(false);
        }

        if (manifest.contributions && manifest.contributions.tools && typeof manifest.contributions.tools === "object") {
          Object.keys(manifest.contributions.tools).forEach(function (toolKey) {
            var meta = manifest.contributions.tools[toolKey] || {};
            meta.ui = meta.ui && typeof meta.ui === "object" ? meta.ui : {};
            if (meta.ui.showInLeftPanel === undefined) meta.ui.showInLeftPanel = false;
            if (meta.ui.showAsTab === undefined) meta.ui.showAsTab = true;
            if (iconUrl && meta.icon === undefined) meta.icon = iconUrl;
            manifest.contributions.tools[toolKey] = meta;
          });
        }

        function finishInstall() {
          var result = extensionHost && extensionHost.installExtension ? extensionHost.installExtension(manifest) : { ok: false, error: tr("extInstallFail") };
          if (!result.ok) {
            if (outputEl) outputEl.textContent = tr("extInstallFail") + "\n" + result.error;
            return false;
          }

          registerExtensionCommands(result.manifest);
          if (outputEl) outputEl.textContent = tr("extInstallOk") + "\n" + result.manifest.id + "@" + result.manifest.version;
          if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("extInstallOk") + " - " + result.manifest.id);
          if (window.NetReconNewUI && typeof window.NetReconNewUI.syncExtensionToolUi === "function") {
            window.NetReconNewUI.syncExtensionToolUi();
          }
          listInstalled();
          renderCatalog();
          refreshActiveUI();
          return true;
        }

        // Show only permissions that are actually recognized/enforced (per
        // extensions.js's validateManifest), not the manifest's raw request -
        // otherwise the dialog could overstate what's really being granted.
        var core = window.NetReconNewUICore || {};
        var validated = core.extensions && core.extensions.validateManifest ? core.extensions.validateManifest(manifest) : null;
        var requestedPermissions = validated && validated.ok ? validated.manifest.permissions : [];
        if (!requestedPermissions.length) {
          return Promise.resolve(finishInstall());
        }

        var confirmMsg = tr("extPermissionConfirmPrefix") + "\n\n- " + requestedPermissions.join("\n- ") + "\n\n" + tr("extPermissionConfirmSuffix");
        var confirmDialog = window.NetReconNewUI && window.NetReconNewUI.openConfirmDialog;
        var confirmed = confirmDialog
          ? confirmDialog(tr("extPermissionConfirmTitle"), confirmMsg, tr("extPermissionConfirmOk"), tr("exitPromptCancel"))
          : Promise.resolve(window.confirm(confirmMsg));

        return confirmed.then(function (ok) {
          if (!ok) {
            if (outputEl) outputEl.textContent = tr("extPermissionDeclined");
            return false;
          }
          return finishInstall();
        });
      }

      function renderCatalog() {
        if (!catalogEl) return;
        var installedIds = extensionHost && extensionHost.listExtensions
          ? extensionHost.listExtensions().map(function (item) { return item.id; })
          : [];

        catalogEl.innerHTML = "";
        if (!catalogEntries.length) {
          var emptyEl = document.createElement("div");
          emptyEl.className = "v1-import-empty";
          emptyEl.textContent = tr("importToolCatalogEmpty");
          catalogEl.appendChild(emptyEl);
          return;
        }

        catalogEntries.forEach(function (entry, idx) {
          var manifest = entry.manifest || {};
          var isInstalled = installedIds.indexOf(manifest.id) !== -1;

          var itemEl = document.createElement("div");
          itemEl.className = "v1-catalog-item";

          var iconCell = document.createElement("div");
          iconCell.className = "v1-catalog-icon-cell";
          if (window.NetReconNewUI && typeof window.NetReconNewUI.renderExtIcon === "function") {
            window.NetReconNewUI.renderExtIcon(iconCell, entry.iconUrl || "🧩");
          } else {
            iconCell.textContent = entry.iconUrl ? "" : "🧩";
          }
          itemEl.appendChild(iconCell);

          var infoEl = document.createElement("div");
          infoEl.className = "v1-catalog-info";
          var nameEl = document.createElement("strong");
          nameEl.textContent = manifest.name || manifest.id || "";
          var descEl = document.createElement("div");
          descEl.textContent = manifest.description || "";
          infoEl.appendChild(nameEl);
          infoEl.appendChild(descEl);
          itemEl.appendChild(infoEl);

          var actionBtn = document.createElement("button");
          actionBtn.type = "button";
          actionBtn.className = isInstalled ? "v1-import-item-uninstall" : "v1-catalog-install-btn";
          actionBtn.textContent = isInstalled ? tr("importToolUninstallBtn") : tr("importToolInstallBtn");
          actionBtn.setAttribute("data-catalog-index", String(idx));
          actionBtn.setAttribute("data-catalog-action", isInstalled ? "uninstall" : "install");
          itemEl.appendChild(actionBtn);

          catalogEl.appendChild(itemEl);
        });
      }

      if (catalogEl && catalogEl.dataset.catalogBound !== "1") {
        catalogEl.dataset.catalogBound = "1";
        catalogEl.addEventListener("click", function (e) {
          var btn = e.target && e.target.closest ? e.target.closest("[data-catalog-index]") : null;
          if (!btn) return;
          var idx = Number(btn.getAttribute("data-catalog-index"));
          var entry = catalogEntries[idx];
          if (!entry) return;
          if (btn.getAttribute("data-catalog-action") === "uninstall") {
            performUninstall(entry.manifest && entry.manifest.id);
          } else {
            installManifestObject(entry.manifest, entry.iconUrl);
          }
        });
      }

      if (outputEl && outputEl.dataset.uninstallBound !== "1") {
        outputEl.dataset.uninstallBound = "1";
        outputEl.addEventListener("click", function (e) {
          var btn = e.target && e.target.closest ? e.target.closest("[data-import-uninstall-id]") : null;
          if (!btn) return;
          performUninstall(btn.getAttribute("data-import-uninstall-id") || "");
        });
      }

      if (catalogEl) {
        if (catalogEntriesCache) {
          renderCatalog();
        } else {
          loadCatalogCached()
            .then(function (entries) {
              catalogEntries = entries;
              renderCatalog();
            })
            .catch(function () {
              if (catalogEl) catalogEl.textContent = tr("importToolCatalogError");
            });
        }
      }

      root.querySelectorAll("[data-import-action]").forEach(function (button) {
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";
        button.addEventListener("click", function () {
          var actionName = button.getAttribute("data-import-action");

          if (actionName === "load-file") {
            Promise.resolve(platform.invoke("open_extension_manifest_dialog", {}))
              .then(function (text) {
                var manifest = null;
                try {
                  manifest = JSON.parse(String(text || ""));
                } catch (_) {
                  if (outputEl) outputEl.textContent = tr("extInvalidJson");
                  return;
                }
                installManifestObject(manifest);
              })
              .catch(function (err) {
                var message = (err && err.message) || err || "";
                var cancelled = message === "cancelled";
                var unavailable = message === "tauri invoke unavailable";
                if (cancelled || !outputEl) return;
                outputEl.textContent = unavailable ? tr("extDesktopOnlyFeature") : tr("extInvalidJson");
              });
            return;
          }
        });
      });
    }

    // Reads a JSON file the user picks: native dialog on desktop (Tauri),
    // <input type=file> on www (mirrors session-sqlite-runtime.js's pickFile
    // pattern, but this needs a filename to derive the language code from,
    // which the desktop dialog path doesn't give us - so path/File.name is
    // returned alongside the text).
    function pickLanguageFileText() {
      var invoke = platform.getInvoke ? platform.getInvoke() : null;
      if (invoke) {
        return platform.invoke("open_language_file_dialog", {}).then(function (result) {
          return { name: (result && result.path) || "", text: (result && result.text) || "" };
        });
      }
      return new Promise(function (resolve, reject) {
        var input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.addEventListener("change", function () {
          var file = input.files && input.files[0];
          if (!file) { reject(new Error("cancelled")); return; }
          file.text().then(function (text) {
            resolve({ name: file.name, text: text });
          }, reject);
        });
        input.addEventListener("cancel", function () { reject(new Error("cancelled")); });
        input.click();
      });
    }

    function deriveLanguageCodeFromFilename(name) {
      var base = String(name || "").split(/[\\/]/).pop() || "";
      return base.replace(/\.json$/i, "").trim().toLowerCase();
    }

    function wireLanguageManagerButtons(rootEl) {
      var root = rootEl && typeof rootEl.querySelector === "function"
        ? rootEl
        : document.getElementById("v1ToolDetail");
      if (!root) return;

      var selectEl = root.querySelector('[data-lang-role="select"]') || root.querySelector("#v1LangTabSelect");

      function activate(code) {
        var before = i18n && i18n.getLang ? i18n.getLang() : "";
        var after = i18n && i18n.setLang ? i18n.setLang(code) : before;
        if (before === after && code.toLowerCase() !== after.toLowerCase()) {
          if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langActivateFail") + " - " + code);
          return false;
        }
        if (selectEl) selectEl.value = after;
        if (window.NetReconNewUI && typeof window.NetReconNewUI.refreshLanguageUi === "function") {
          window.NetReconNewUI.refreshLanguageUi();
        }
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langActivateOk") + " - " + after);
        return true;
      }

      if (selectEl && selectEl.dataset.bound !== "1") {
        selectEl.dataset.bound = "1";
        selectEl.addEventListener("change", function () {
          activate(selectEl.value);
        });
      }

      root.querySelectorAll("[data-lang-action]").forEach(function (button) {
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";
        button.addEventListener("click", function () {
          if (button.getAttribute("data-lang-action") !== "import") return;

          pickLanguageFileText().then(function (picked) {
            var code = deriveLanguageCodeFromFilename(picked.name);
            if (!code) {
              if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langInvalidCode"));
              return;
            }
            var dict;
            try {
              dict = JSON.parse(picked.text || "{}");
            } catch (_) {
              if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langInvalidDict"));
              return;
            }

            var addResult = i18n && i18n.addLanguage ? i18n.addLanguage(code, dict) : { ok: false, error: tr("langAddFail") };
            if (!addResult.ok) {
              if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langAddFail") + " - " + addResult.error);
              return;
            }

            if (selectEl) {
              var option = document.createElement("option");
              option.value = addResult.code;
              option.textContent = addResult.code;
              selectEl.appendChild(option);
            }
            activate(addResult.code);
          }).catch(function (err) {
            if (err && err.message === "cancelled") return;
            if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langAddFail"));
          });
        });
      });
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
      var tab = document.querySelector('.v1-tab[data-tool="' + tool + '"]');
      if (tab && tab.classList.contains("tab-closed")) {
        tab.classList.remove("tab-closed");
      }
      if (tab && !isDetachedHiddenTab(tab)) {
        tab.removeAttribute("hidden");
      }

      activeTool = tool;
      if (store && store.setState) store.setState({ activeTool: tool });
      try {
        if (tool !== "scan-runner") storageSet("netrecon_active_tool", tool);
      } catch (_) {}
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

    function refreshShellCraftPanels() {
      if (panelInteractionsRuntime && panelInteractionsRuntime.wireShellCraftLibrary) {
        panelInteractionsRuntime.wireShellCraftLibrary();
      }
      if (panelInteractionsRuntime && panelInteractionsRuntime.wireShellCraftInspector) {
        panelInteractionsRuntime.wireShellCraftInspector();
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
      flattenIpLibraryEntries: flattenIpLibraryEntries,
      initWorkbenchTabs: initWorkbenchTabs,
      buildDetailHtml: buildDetailHtml,
      wireToolRuntime: wireToolRuntime,
      refreshShellCraftPanels: refreshShellCraftPanels,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createPanelsRuntime = createPanelsRuntime;
})();
