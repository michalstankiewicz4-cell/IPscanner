(function () {
  function createPanelsRuntime(deps) {
    var tr = deps.tr;
    var getToolInfoMap = deps.getToolInfoMap;
    var versionsData = Array.isArray(deps.versionsData) ? deps.versionsData : [];
    var store = deps.store;
    var extensionHost = deps.extensionHost;
    var i18n = deps.i18n;
    var applyStaticTranslations = deps.applyStaticTranslations;
    var onAfterRender = deps.onAfterRender;
    var setStatusLine = deps.setStatusLine;
    // Domyślnie brak aktywnej zakładki, wszystkie taby zamknięte
    var activeTool = null;
    var detachedCards = Object.create(null);
    var swapSourceCard = null;
    var detachedZCounter = 70;
    var DETACHED_LAYOUTS_KEY = "netrecon_detached_layouts_v1";
    var DETACHED_ARRANGE_STATE_KEY = "netrecon_detached_arrange_state_v1";

    function readDetachedLayouts() {
      try {
        var raw = window.localStorage ? window.localStorage.getItem(DETACHED_LAYOUTS_KEY) : "";
        if (!raw) return {};
        var parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (_) {
        return {};
      }
    }

    function writeDetachedLayouts(layouts) {
      try {
        if (!window.localStorage) return;
        window.localStorage.setItem(DETACHED_LAYOUTS_KEY, JSON.stringify(layouts || {}));
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
        var raw = window.localStorage ? window.localStorage.getItem(DETACHED_ARRANGE_STATE_KEY) : "";
        if (!raw) return {};
        var parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (_) {
        return {};
      }
    }

    function writeDetachedArrangeState(state) {
      try {
        if (!window.localStorage) return;
        window.localStorage.setItem(DETACHED_ARRANGE_STATE_KEY, JSON.stringify(state || {}));
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
      popout.setAttribute("aria-label", "Open tab in floating window");
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
        var label = isDetached ? "Dock tab back" : "Open tab in floating window";
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
        if (setStatusLine) setStatusLine(tr("toolRoute") + ": no detached windows to arrange");
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
        setStatusLine(tr("toolRoute") + ": auto-arranged " + cards.length + " windows");
      }
    }

    function syncDetachedArrangementOnCountChange() {
      var count = document.querySelectorAll(".v1-detached-tool-card").length;
      if (count <= 1) return;
      autoArrangeDetachedCards({ advanceVariant: false });
    }

    function wireDetachedResultsIp(rootEl) {
      if (!rootEl) return;
      rootEl.querySelectorAll("[data-open-ports]").forEach(function (button) {
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";

        button.addEventListener("click", function () {
          var rowId = button.getAttribute("data-open-ports");
          var portsRow = rootEl.querySelector('[data-ports-row="' + rowId + '"]');
          if (!portsRow) return;

          var expanded = button.getAttribute("aria-expanded") === "true";
          var nextExpanded = !expanded;
          button.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
          button.textContent = nextExpanded ? "−" : "+";
          if (nextExpanded) portsRow.removeAttribute("hidden");
          else portsRow.setAttribute("hidden", "hidden");
        });
      });
    }

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
      swapBtn.setAttribute("title", "Swap content with another window");
      swapBtn.setAttribute("aria-label", "Swap content with another window");
      header.appendChild(swapBtn);

      var dockBtn = document.createElement("button");
      dockBtn.className = "v1-detached-tool-dock";
      dockBtn.type = "button";
      dockBtn.textContent = "↙";
      dockBtn.setAttribute("title", "Dock tab back");
      dockBtn.setAttribute("aria-label", "Dock tab back");
      header.appendChild(dockBtn);

      var closeBtn = document.createElement("button");
      closeBtn.className = "v1-detached-tool-close";
      closeBtn.type = "button";
      closeBtn.textContent = "×";
      closeBtn.setAttribute("title", "Close tab");
      closeBtn.setAttribute("aria-label", "Close tab");
      header.appendChild(closeBtn);

      var body = document.createElement("div");
      body.className = "v1-detached-tool-body tool-detail";
      body.innerHTML = stripIds(buildDetailHtml(tool));

      card.appendChild(header);
      card.appendChild(body);
      document.body.appendChild(card);

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
        wireDetachedResultsIp(body);
      }

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
        card.classList.add("is-dragging");
      });

      function finishDrag(event) {
        if (!drag.dragging) return;
        if (event && drag.pointerId !== null && event.pointerId !== drag.pointerId) return;
        drag.dragging = false;
        drag.pointerId = null;
        card.classList.remove("is-dragging");
        saveDetachedLayout(card.getAttribute("data-detached-tool"), readCardLayoutFromDom(card));
      }

      document.addEventListener("pointermove", function (event) {
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

      document.addEventListener("pointerup", finishDrag);
      document.addEventListener("pointercancel", finishDrag);

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
        if (setStatusLine) setStatusLine(tr("toolRoute") + ": " + currentTool + " docked");
      });

      closeBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        var currentTool = card.getAttribute("data-detached-tool");
        closeToolTab(currentTool);
        if (setStatusLine) setStatusLine(tr("toolRoute") + ": " + currentTool + " closed");
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
    document.addEventListener("DOMContentLoaded", function () {
      document.querySelectorAll(".v1-tab").forEach(function (tab) {
        tab.classList.add("tab-closed");
        tab.setAttribute("hidden", "hidden");
      });
      updateEmptyState();
    });

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
      return tools[tool] || tools["scan-runner"] || {
        title: "Scan Runner",
        text: "",
        points: []
      };
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

    var panelInteractionsRuntime = null;
    if (window.NetReconNewUICore && window.NetReconNewUICore.newUiRuntimes && window.NetReconNewUICore.newUiRuntimes.createPanelInteractionsRuntime) {
      panelInteractionsRuntime = window.NetReconNewUICore.newUiRuntimes.createPanelInteractionsRuntime({
        versionsData: versionsData,
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
    }

    function updateEmptyState() {
      var tabs = Array.from(document.querySelectorAll(".v1-tab"));
      var hasOpenTabs = tabs.some(function (t) {
        return !t.classList.contains("tab-closed") && !isDetachedHiddenTab(t);
      });
      var emptyState = document.getElementById("v1NoTabsState");
      var mainCard = document.getElementById("v1MainCard");

      if (emptyState) {
        if (hasOpenTabs) emptyState.setAttribute("hidden", "hidden");
        else emptyState.removeAttribute("hidden");
      }

      if (mainCard) {
        if (hasOpenTabs) mainCard.removeAttribute("hidden");
        else mainCard.setAttribute("hidden", "hidden");
      }
    }

    function initWorkbenchTabs() {
      if (document.body && document.body.dataset.v1TabsBound === "1") {
        ensureAllTabControls();
        updateTabPopoutUi();
        return;
      }

      if (document.body) document.body.dataset.v1TabsBound = "1";

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
        var autoArrangeTrigger = event.target.closest('[data-menu-action="auto-arrange-windows"]');
        if (autoArrangeTrigger) {
          event.preventDefault();
          event.stopPropagation();
          if (event.stopImmediatePropagation) event.stopImmediatePropagation();
          autoArrangeDetachedCards();
          return;
        }

        var close = event.target.closest("[data-tab-close]");
        if (close) {
          event.preventDefault();
          event.stopPropagation();
          if (event.stopImmediatePropagation) event.stopImmediatePropagation();
          closeTab(close.closest(".v1-tab"));
          return;
        }

        var popout = event.target.closest("[data-tab-popout]");
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
          if (setStatusLine) setStatusLine(tr("toolRoute") + ": " + tool + " docked");
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
        if (setStatusLine) setStatusLine(tr("toolRoute") + ": " + tool + " undocked");
      });

      document.addEventListener("contextmenu", function (event) {
        var popout = event.target.closest("[data-tab-popout]");
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

        if (setStatusLine) setStatusLine(tr("toolRoute") + ": " + tool + " floating layout reset");
      });

      updateEmptyState();
      updateTabPopoutUi();
    }

    function buildDetailHtml(tool) {
      if (panelContentRuntime && panelContentRuntime.buildDetailHtml) {
        return panelContentRuntime.buildDetailHtml(tool);
      }
      return "<h4>" + escapeHtml(tool || "") + "</h4><div>Panel content runtime is not available.</div>";
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
        }
        if (typeof setStatusLine === "function") setStatusLine(tr("toolRoute") + ": brak aktywnej zakładki");
        if (v1StatusRight) v1StatusRight.textContent = tr("active") + ": brak aktywnej zakładki";
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
      }
      applyDetachedCardState();
      if (typeof setStatusLine === "function") setStatusLine(tr("toolRoute") + ": " + activeTool);
      if (v1StatusRight) v1StatusRight.textContent = tr("active") + ": " + activeTool;
      if (activeTool === "versions") {
        if (panelInteractionsRuntime && panelInteractionsRuntime.wireVersionsTimeline) {
          panelInteractionsRuntime.wireVersionsTimeline();
        }
      }
      if (activeTool === "results-ip") {
        if (panelInteractionsRuntime && panelInteractionsRuntime.wireResultsIpTable) {
          panelInteractionsRuntime.wireResultsIpTable();
        }
      }
      if (typeof onAfterRender === "function") onAfterRender(activeTool);
    }

    function wireImportToolButtons() {
      var root = document.getElementById("v1ToolDetail");
      if (!root) return;

      var manifestEl = document.getElementById("v1ImportManifest");
      var uninstallEl = document.getElementById("v1ImportUninstallId");
      var addMenuEl = document.getElementById("v1ImportAddMenu");
      var addActivityEl = document.getElementById("v1ImportAddActivity");
      var outputEl = document.getElementById("v1ImportOutput");

      if (manifestEl && !manifestEl.value.trim()) {
        manifestEl.value = "{\n  \"id\": \"com.example.demo\",\n  \"name\": \"Demo Extension\",\n  \"version\": \"0.1.0\",\n  \"contributions\": {\n    \"tools\": {},\n    \"menuActions\": {}\n  }\n}";
      }

      root.querySelectorAll("[data-import-action]").forEach(function (button) {
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";
        button.addEventListener("click", function () {
          var actionName = button.getAttribute("data-import-action");
          var manifestText = manifestEl ? (manifestEl.value || "{}").trim() : "{}";

          function listInstalled() {
            var items = extensionHost && extensionHost.listExtensions ? extensionHost.listExtensions() : [];
            if (!outputEl) return;
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

              outputEl.appendChild(itemEl);
            });
          }

          if (actionName === "list") {
            listInstalled();
            if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("extListHeader"));
            return;
          }

          if (actionName === "uninstall") {
            var id = uninstallEl ? (uninstallEl.value || "").trim() : "";
            if (!id) {
              if (outputEl) outputEl.textContent = tr("extUninstallPrompt");
              return;
            }

            var removeResult = extensionHost && extensionHost.uninstallExtension ? extensionHost.uninstallExtension(id) : { ok: false, error: tr("extUninstallFail") };
            if (!removeResult.ok) {
              if (outputEl) outputEl.textContent = tr("extUninstallFail") + "\n" + removeResult.error;
              return;
            }

            listInstalled();
            if (outputEl) outputEl.textContent = tr("extUninstallOk") + "\n" + removeResult.id;
            if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("extUninstallOk") + " - " + removeResult.id);
            if (window.NetReconNewUI && typeof window.NetReconNewUI.syncExtensionToolUi === "function") {
              window.NetReconNewUI.syncExtensionToolUi();
            }
            refreshActiveUI();
            return;
          }

          if (!manifestText) {
            if (outputEl) outputEl.textContent = tr("extInvalidJson");
            return;
          }

          var manifest = null;
          try {
            manifest = JSON.parse(manifestText);
          } catch (_) {
            if (outputEl) outputEl.textContent = tr("extInvalidJson");
            return;
          }

          var addToMenu = !addMenuEl || !!addMenuEl.checked;
          var addToActivity = !!(addActivityEl && addActivityEl.checked);
          if (manifest && manifest.contributions && manifest.contributions.tools && typeof manifest.contributions.tools === "object") {
            Object.keys(manifest.contributions.tools).forEach(function (toolKey) {
              var meta = manifest.contributions.tools[toolKey] || {};
              meta.ui = meta.ui && typeof meta.ui === "object" ? meta.ui : {};
              meta.ui.showInToolsMenu = addToMenu;
              meta.ui.showInActivityBar = addToActivity;
              meta.ui.showInLeftPanel = true;
              meta.ui.showAsTab = true;
              manifest.contributions.tools[toolKey] = meta;
            });
          }

          var result = extensionHost && extensionHost.installExtension ? extensionHost.installExtension(manifest) : { ok: false, error: tr("extInstallFail") };
          if (!result.ok) {
            if (outputEl) outputEl.textContent = tr("extInstallFail") + "\n" + result.error;
            return;
          }

          if (outputEl) outputEl.textContent = tr("extInstallOk") + "\n" + result.manifest.id + "@" + result.manifest.version;
          if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("extInstallOk") + " - " + result.manifest.id);
          if (window.NetReconNewUI && typeof window.NetReconNewUI.syncExtensionToolUi === "function") {
            window.NetReconNewUI.syncExtensionToolUi();
          }
          listInstalled();
          refreshActiveUI();
        });
      });
    }

    function wireLanguageManagerButtons() {
      var root = document.getElementById("v1ToolDetail");
      if (!root) return;

      var selectEl = document.getElementById("v1LangTabSelect");
      var codeEl = document.getElementById("v1LangTabCode");
      var dictEl = document.getElementById("v1LangTabDict");
      var outputEl = document.getElementById("v1LangTabOutput");

      if (selectEl && selectEl.dataset.bound !== "1") {
        selectEl.dataset.bound = "1";
        selectEl.addEventListener("change", function () {
          if (codeEl) codeEl.value = selectEl.value;
        });
      }

      if (codeEl && !codeEl.value.trim()) {
        codeEl.value = (selectEl && selectEl.value) || (i18n && i18n.getLang ? i18n.getLang() : "en");
      }
      if (selectEl && codeEl && codeEl.value && !selectEl.value) {
        selectEl.value = codeEl.value;
      }
      if (dictEl && !dictEl.value.trim()) {
        dictEl.value = "{\n  \"menuFile\": \"Datei\",\n  \"menuOptions\": \"Optionen\",\n  \"menuTools\": \"Werkzeuge\",\n  \"menuHelp\": \"Hilfe\"\n}";
      }
      if (outputEl && !outputEl.textContent.trim()) {
        var langs = i18n && i18n.listLanguages ? i18n.listLanguages() : [];
        outputEl.textContent = langs.length ? langs.join("\n") : tr("langListHeader") + ": -";
      }

      root.querySelectorAll("[data-lang-action]").forEach(function (button) {
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";
        button.addEventListener("click", function () {
          var actionName = button.getAttribute("data-lang-action");
          var code = ((codeEl && codeEl.value) || (selectEl && selectEl.value) || "").trim();

          if (actionName === "list") {
            var langs = i18n && i18n.listLanguages ? i18n.listLanguages() : [];
            if (outputEl) outputEl.textContent = langs.length ? langs.join("\n") : tr("langListHeader") + ": -";
            if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langListHeader"));
            return;
          }

          if (!code) {
            if (outputEl) outputEl.textContent = tr("langInvalidCode");
            return;
          }

          if (actionName === "add") {
            var dict = null;
            try {
              dict = JSON.parse(dictEl ? (dictEl.value || "{}") : "{}");
            } catch (_) {
              if (outputEl) outputEl.textContent = tr("langInvalidDict");
              return;
            }

            var addResult = i18n && i18n.addLanguage ? i18n.addLanguage(code, dict) : { ok: false, error: tr("langAddFail") };
            if (!addResult.ok) {
              if (outputEl) outputEl.textContent = tr("langAddFail") + "\n" + addResult.error;
              return;
            }

            if (outputEl) outputEl.textContent = tr("langAddOk") + "\n" + addResult.code;
            if (selectEl) {
              var option = document.createElement("option");
              option.value = addResult.code;
              option.textContent = addResult.code;
              selectEl.appendChild(option);
              selectEl.value = addResult.code;
            }
            if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langAddOk") + " - " + addResult.code);
            return;
          }

          if (actionName === "activate") {
            var before = i18n && i18n.getLang ? i18n.getLang() : "";
            var after = i18n && i18n.setLang ? i18n.setLang(code) : before;
            if (before === after && code.toLowerCase() !== after.toLowerCase()) {
              if (outputEl) outputEl.textContent = tr("langActivateFail") + "\n" + code;
              return;
            }

            if (selectEl) selectEl.value = after;
            if (codeEl) codeEl.value = after;
            if (clippyRuntime && clippyRuntime.setLanguage) {
              clippyRuntime.setLanguage(after);
            }

            if (window.NetReconNewUI && typeof window.NetReconNewUI.refreshLanguageUi === "function") {
              window.NetReconNewUI.refreshLanguageUi();
            }
            if (outputEl) outputEl.textContent = tr("langActivateOk") + "\n" + after;
            if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langActivateOk") + " - " + after);
          }
        });
      });
    }

    function switchTool(tool) {
      ensureAllTabControls();
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
        if (window.localStorage && tool !== "scan-runner") window.localStorage.setItem("netrecon_active_tool", tool);
      } catch (_) {}
      refreshActiveUI();
      updateEmptyState();
      updateTabPopoutUi();
    }

    function getActiveTool() {
      return activeTool;
    }

    function hasTool(tool) {
      var tools = getToolInfoMap ? getToolInfoMap() : {};
      return !!tools[tool];
    }

    return {
      setTooltips: setTooltips,
      refreshActiveUI: refreshActiveUI,
      switchTool: switchTool,
      getActiveTool: getActiveTool,
      hasTool: hasTool,
      initWorkbenchTabs: initWorkbenchTabs,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createPanelsRuntime = createPanelsRuntime;
})();
