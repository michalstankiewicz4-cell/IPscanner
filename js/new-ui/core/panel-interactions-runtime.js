(function () {
  function createPanelInteractionsRuntime(deps) {
    var versionsData = Array.isArray(deps.versionsData) ? deps.versionsData : [];
    var tr = typeof deps.tr === "function" ? deps.tr : function (key) { return key; };
    var setStatusLine = typeof deps.setStatusLine === "function" ? deps.setStatusLine : null;
    var renderShellCraftLibrary = typeof deps.renderShellCraftLibrary === "function" ? deps.renderShellCraftLibrary : null;
    var renderCanvasBlockHtml = typeof deps.renderCanvasBlockHtml === "function" ? deps.renderCanvasBlockHtml : null;
    var renderShellCraftInspector = typeof deps.renderShellCraftInspector === "function" ? deps.renderShellCraftInspector : null;
    // #v1ShellCraftCanvas is torn down and recreated every time the ShellCraft
    // tab is (re)activated (wireToolRuntime -> wireShellCraftCanvas runs on
    // every switchTool), so a dataset flag on that element can never prevent
    // re-registration of the document-level listeners below - only explicit
    // teardown of the PREVIOUS bind's listeners does. Canvas-local listeners
    // (dragover/drop/dragstart/click/mousedown) don't need this: they're
    // discarded along with the old, detached canvasEl automatically.
    var shellcraftCanvasTeardown = null;
    // #v1ShellCraftInspector, unlike the canvas, is a stable element that's
    // never recreated - so its own dataset bind-guard correctly protects
    // document-level listeners here, as long as selection state lives
    // outside the function body (it must survive repeat calls, e.g. a
    // future language-refresh re-render, the same way the guard does).
    var shellcraftInspectorSelectedBlockId = "";
    var shellcraftInspectorSuppressNextRender = false;

    // ip-scanner tool: Network Monitor's last-fetched Refresh results, kept
    // outside wireNetworkMonitorTool() so they survive its DOM being torn
    // down and rebuilt (detaching/re-docking the tab, or a language-refresh
    // re-render) - without this, undocking would silently discard whatever
    // Refresh had already found and drop the tab back to an empty state.
    var netMonLastConnections = null;
    var netMonLastArp = null;

    // ip-scanner tool: Network Monitor's live-poll state - kept module-level
    // (not inside a wire function) so the setInterval timers keep running
    // across LS/CS being torn down and rebuilt (tool switches, redocking,
    // language refresh), exactly like netMonLast* above. Only a Stop click
    // clears a timer; navigating away from the tool does not.
    var netMonConnRunning = false;
    var netMonLanRunning = false;
    var netMonConnTimerId = null;
    var netMonLanTimerId = null;
    var netMonActionsBound = false;

    // ip-scanner tool: Network Monitor's per-column sort state (persisted -
    // same reasoning as the order/settings in tool-content-runtime.js's
    // netMonState, just kept here since only CS's tables need it).
    var NETMON_SORT_KEY = "netrecon_netmon_sort_v1";
    var NETMON_VIEW_KEY = "netrecon_netmon_view_v1";
    var NETMON_VISIBILITY_KEY = "netrecon_netmon_visibility_v1";
    var NETMON_KEEP_MARKS_KEY = "netrecon_netmon_keepmarks_v1";
    var NETMON_DISPLAY_MODE_KEY = "netrecon_netmon_displaymode_v1";
    // Which group labels are currently expanded in a grouped view - session
    // -only, and reset whenever the view itself changes (a "process"
    // grouping's expanded keys are meaningless once switched to "pid").
    var netMonConnExpandedGroups = {};
    var netMonLanExpandedGroups = {};

    // Appeared/disappeared rows aren't a separate log - they're mixed
    // straight into the live table instead (a disappeared row stays
    // visible, greyed and marked, for a grace window instead of just
    // vanishing; a newly-appeared one gets a brief highlight). Keyed by the
    // same identity key the diff itself uses, holding the row's last-known
    // data (needed to render it) plus when the mark was set, so an expired
    // entry can be pruned by wall-clock age at render time. Session-only,
    // like everything else Network Monitor doesn't explicitly persist.
    var NETMON_GONE_GRACE_MS = 30000;
    var NETMON_NEW_HIGHLIGHT_MS = 10000;
    var netMonConnGone = {};
    var netMonLanGone = {};
    var netMonConnNew = {};
    var netMonLanNew = {};

    function loadNetMonSort() {
      try {
        var raw = localStorage.getItem(NETMON_SORT_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          return {
            connections: parsed && parsed.connections ? parsed.connections : { col: null, dir: "asc" },
            lan: parsed && parsed.lan ? parsed.lan : { col: null, dir: "asc" },
          };
        }
      } catch (e) { /* fall through to default */ }
      return { connections: { col: null, dir: "asc" }, lan: { col: null, dir: "asc" } };
    }
    function saveNetMonSort(sort) {
      try { localStorage.setItem(NETMON_SORT_KEY, JSON.stringify(sort)); } catch (e) { /* ignore */ }
    }

    function loadNetMonView() {
      try {
        var raw = localStorage.getItem(NETMON_VIEW_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          return { connections: parsed.connections || "flat", lan: parsed.lan || "flat" };
        }
      } catch (e) { /* fall through to default */ }
      return { connections: "flat", lan: "flat" };
    }
    function saveNetMonView(view) {
      try { localStorage.setItem(NETMON_VIEW_KEY, JSON.stringify(view)); } catch (e) { /* ignore */ }
    }

    function loadNetMonVisibility() {
      try {
        var raw = localStorage.getItem(NETMON_VISIBILITY_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          return { connections: parsed.connections !== false, lan: parsed.lan !== false };
        }
      } catch (e) { /* fall through to default */ }
      return { connections: true, lan: true };
    }
    function saveNetMonVisibility(vis) {
      try { localStorage.setItem(NETMON_VISIBILITY_KEY, JSON.stringify(vis)); } catch (e) { /* ignore */ }
    }

    // "Keep changes visible" (checkbox) - a single, shared-across-both-
    // tables toggle: when on, pruneNetMonMarks() below never expires a
    // gone/new mark, so they stay in the table until the user turns it back
    // off (at which point stale ones are pruned immediately, not just on
    // the next fetch). "Display mode" (radio) picks what buildNetMonEffective
    // Rows() below actually includes: the plain current snapshot, the
    // current snapshot plus marks (today's default), or only the marked
    // (changed) rows.
    function loadNetMonKeepMarks() {
      try { return localStorage.getItem(NETMON_KEEP_MARKS_KEY) === "1"; } catch (e) { return false; }
    }
    function saveNetMonKeepMarks(keep) {
      try { localStorage.setItem(NETMON_KEEP_MARKS_KEY, keep ? "1" : "0"); } catch (e) { /* ignore */ }
    }

    function loadNetMonDisplayMode() {
      try {
        var raw = localStorage.getItem(NETMON_DISPLAY_MODE_KEY);
        if (raw === "actual" || raw === "all" || raw === "changes") return raw;
      } catch (e) { /* fall through to default */ }
      return "all";
    }
    function saveNetMonDisplayMode(mode) {
      try { localStorage.setItem(NETMON_DISPLAY_MODE_KEY, mode); } catch (e) { /* ignore */ }
    }

    // ip-scanner tool: Email Recon - same "survive detach/redock" reasoning
    // as netMonLast* above, plus a generation counter so a Stop click (or a
    // second Start before the first finishes) can make an in-flight lookup's
    // eventual response a no-op instead of overwriting newer state - there's
    // no cheap way to actually cancel the in-flight Rust-side reqwest calls.
    var emailReconLastResult = null;
    var emailReconActionsBound = false;
    var emailReconGeneration = 0;
    var emailReconRunning = false;

    // Shared by the canvas block's Run button and the Inspector's Run button
    // so both report identical, correct status-line feedback - including on
    // failure (runMacro returns false when the target scanner button isn't
    // in the DOM), instead of the two call sites drifting independently.
    function runMacroAndReportStatus(macrosApi, macroId) {
      var macro = macrosApi ? macrosApi.getMacro(macroId) : null;
      var ran = macrosApi ? macrosApi.runMacro(macroId) : false;
      if (!setStatusLine || !macro) return;
      setStatusLine((ran ? tr("statusMacroRun") : tr("statusMacroRunFailed")) + ": " + tr(macro.nameKey));
    }

    var escapeHtml = window.NetReconNewUICore.utils.dom.escapeHtml;

    // --- shell keys ---
    function wireVersionsTimeline(rootEl) {
      var root = rootEl && typeof rootEl.querySelector === "function"
        ? rootEl
        : document.getElementById("v1ToolDetail");
      if (!root) return;

      // No bind-guard here on purpose: #v1ToolDetail is a persistent container
      // whose innerHTML gets replaced on every tool switch (unlike, say, the
      // ShellCraft canvas element which is itself torn down/recreated) - a
      // dataset flag on it would survive across renders and wrongly skip
      // re-binding to the fresh .v1-version-point elements after navigating
      // away and back. All listeners below are local to elements inside
      // root, so they're discarded automatically when innerHTML is replaced;
      // re-running this on every render is safe and necessary.
      var track = root.querySelector("[data-version-role=\"track\"]") || root.querySelector("#v1VersionTrack");
      var versionsList = root.querySelector("[data-version-role=\"list\"]") || root.querySelector("#v1VersionsList");
      var physics = root.querySelector("[data-version-role=\"physics\"]") || root.querySelector("#v1VersionPhysics");
      if (!track || !versionsList || !physics) return;

      var points = Array.from(root.querySelectorAll(".v1-version-point"));
      if (!points.length) return;

      function setActiveBySourceIndex(sourceIndex) {
        var safeIndex = Number(sourceIndex);
        if (!Number.isFinite(safeIndex) || safeIndex < 0 || safeIndex >= versionsData.length) return;

        var entry = versionsData[safeIndex];
        if (!entry) return;

        points.forEach(function (point, idx) {
          var isActive = Number(point.getAttribute("data-version-index")) === safeIndex;
          point.classList.toggle("active", isActive);
          if (isActive) {
            point.classList.remove("is-bumping");
            // Force reflow to replay spring animation when selecting another point.
            void point.offsetWidth;
            point.classList.add("is-bumping");

            var progress = points.length > 1 ? idx / (points.length - 1) : 1;
            physics.style.setProperty("--v1-version-progress", String(progress));

            // Keep timeline movement scoped to the horizontal track only.
            var centerLeft = point.offsetLeft - Math.max(0, Math.floor((track.clientWidth - point.clientWidth) / 2));
            var maxLeft = Math.max(0, track.scrollWidth - track.clientWidth);
            var nextLeft = Math.max(0, Math.min(maxLeft, centerLeft));
            track.scrollTo({ left: nextLeft, behavior: "smooth" });
          }
        });

        var targetSection = null;
        root.querySelectorAll("[data-version-entry-index]").forEach(function (section) {
          var isCurrent = Number(section.getAttribute("data-version-entry-index")) === safeIndex;
          section.classList.toggle("is-active", isCurrent);
          if (isCurrent) {
            targetSection = section;
          }
        });

        if (targetSection) {
          var listRect = versionsList.getBoundingClientRect();
          var sectionRect = targetSection.getBoundingClientRect();
          var relativeTop = (sectionRect.top - listRect.top) + versionsList.scrollTop;
          var nextTop = safeIndex === 0 ? 0 : Math.max(0, Math.round(relativeTop - 12));
          versionsList.scrollTo({ top: nextTop, behavior: "smooth" });
        }
      }

      points.forEach(function (point) {
        point.addEventListener("click", function () {
          setActiveBySourceIndex(point.getAttribute("data-version-index"));
        });
      });

      root.querySelectorAll("[data-version-scroll]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var dir = btn.getAttribute("data-version-scroll") === "left" ? -1 : 1;
          track.scrollBy({ left: dir * 220, behavior: "smooth" });
        });
      });

      var dragging = false;
      var moved = false;
      var suppressClickOnce = false;
      var pointerId = null;
      var startX = 0;
      var startScroll = 0;
      var lastX = 0;
      var lastT = 0;
      var velocity = 0;
      var inertiaRaf = 0;

      function stopInertia() {
        if (inertiaRaf) {
          cancelAnimationFrame(inertiaRaf);
          inertiaRaf = 0;
        }
      }

      function runInertia() {
        stopInertia();
        function step() {
          velocity *= 0.92;
          if (Math.abs(velocity) < 0.1) {
            inertiaRaf = 0;
            return;
          }
          track.scrollLeft -= velocity;
          inertiaRaf = requestAnimationFrame(step);
        }
        inertiaRaf = requestAnimationFrame(step);
      }

      track.addEventListener("pointerdown", function (event) {
        if (event.button !== 0) return;
        // Do not start drag on interactive version points - allow direct click selection.
        if (event.target && event.target.closest && event.target.closest(".v1-version-point")) return;
        stopInertia();
        dragging = true;
        moved = false;
        pointerId = event.pointerId;
        startX = event.clientX;
        startScroll = track.scrollLeft;
        lastX = event.clientX;
        lastT = Date.now();
        velocity = 0;
        track.classList.add("is-dragging");
        track.setPointerCapture(pointerId);
      });

      track.addEventListener("pointermove", function (event) {
        if (!dragging || event.pointerId !== pointerId) return;
        var dx = event.clientX - startX;
        if (Math.abs(dx) > 3) moved = true;
        track.scrollLeft = startScroll - dx;

        var now = Date.now();
        var dt = Math.max(1, now - lastT);
        velocity = (event.clientX - lastX) / dt * 16;
        lastX = event.clientX;
        lastT = now;
      });

      function endDrag(event) {
        if (!dragging || event.pointerId !== pointerId) return;
        dragging = false;
        track.classList.remove("is-dragging");
        if (track.hasPointerCapture(pointerId)) {
          track.releasePointerCapture(pointerId);
        }
        pointerId = null;
        suppressClickOnce = moved;
        if (moved) {
          runInertia();
        }
      }

      track.addEventListener("pointerup", endDrag);
      track.addEventListener("pointercancel", endDrag);

      points.forEach(function (point) {
        point.addEventListener("click", function (event) {
          if (!suppressClickOnce) return;
          suppressClickOnce = false;
          event.preventDefault();
          event.stopPropagation();
        }, true);
      });

      setActiveBySourceIndex(0);
    }

    // --- ip-scanner tool keys ---
    // wireResultsIpTable/wirePresetsTool below are all IP-Scanner-specific
    // interaction wiring.
    function wireResultsIpTable(rootEl) {
      var root = rootEl && typeof rootEl.querySelector === "function"
        ? rootEl
        : document.getElementById("v1ToolDetail");
      if (!root) return;

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
          root.querySelectorAll('[data-col="' + key + '"]').forEach(function (cell) {
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
        positionFloatingMenu(root.querySelector("[data-columns-toggle]"), root.querySelector("[data-columns-menu]"));
      }

      function positionFilterMenus() {
        root.querySelectorAll("[data-filter-toggle]").forEach(function (toggleBtn) {
          var group = toggleBtn.getAttribute("data-filter-toggle");
          if (!group) return;
          var menu = root.querySelector('[data-filter-menu="' + group + '"]');
          positionFloatingMenu(toggleBtn, menu);
        });
      }

      function positionAllOpenMenus() {
        positionColumnsMenu();
        positionFilterMenus();
      }

      function updateMenusOpenClass() {
        var anyOpen = !!root.querySelector("[data-columns-menu]:not([hidden]), [data-filter-menu]:not([hidden])");
        root.classList.toggle("is-columns-menu-open", anyOpen);
      }

      function closeAllFilterMenus(exceptGroup) {
        root.querySelectorAll("[data-filter-menu]").forEach(function (menu) {
          var group = menu.getAttribute("data-filter-menu");
          if (exceptGroup && group === exceptGroup) return;
          menu.setAttribute("hidden", "hidden");
          menu.style.left = "";
          menu.style.top = "";
          menu.style.maxHeight = "";
          menu.style.overflowY = "";
          menu.style.visibility = "";
        });

        root.querySelectorAll("[data-filter-toggle]").forEach(function (toggleBtn) {
          var group = toggleBtn.getAttribute("data-filter-toggle");
          if (exceptGroup && group === exceptGroup) return;
          toggleBtn.setAttribute("aria-expanded", "false");
        });
      }

      function setFilterMenuOpen(group, open) {
        var toggleBtn = root.querySelector('[data-filter-toggle="' + group + '"]');
        var menu = root.querySelector('[data-filter-menu="' + group + '"]');
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

        root.querySelectorAll(".v1-ip-result-row[data-row-index]").forEach(function (resultRow) {
          var rowId = resultRow.getAttribute("data-row-index");
          var status = String(resultRow.getAttribute("data-status") || "unknown").toLowerCase();
          var resultKey = String(resultRow.getAttribute("data-result-key") || "");
          var expandBtn = rowId ? root.querySelector('[data-open-ports="' + rowId + '"]') : null;
          var expanded = expandBtn ? expandBtn.getAttribute("aria-expanded") === "true" : false;
          var forcePortsExpanded = showPortRows && !showIpRows;
          var statusPass = !hasAnyStatusFilter || !!(filterState.status && filterState.status[status]);
          var marksPass = !activeMarkFilters.length || activeMarkFilters.some(function (markKey) {
            return hasActionState(resultState, resultKey, markKey);
          });
          var ipVisible = showIpRows && statusPass && marksPass;

          resultRow.style.display = ipVisible ? "" : "none";

          if (!rowId) return;
          root.querySelectorAll('[data-ports-row="' + rowId + '"]').forEach(function (portsRow) {
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
        var toggleBtn = root.querySelector("[data-columns-toggle]");
        var menu = root.querySelector("[data-columns-menu]");
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
        root.querySelectorAll("[data-column-key]").forEach(function (input) {
          var key = input.getAttribute("data-column-key");
          if (!key || !Object.prototype.hasOwnProperty.call(DEFAULT_COLUMNS, key)) return;
          input.checked = state[key] !== false;
        });
        applyColumnVisibility(state);
      }

      function syncFilterControls() {
        var state = readFilterState();
        root.querySelectorAll("[data-filter-group][data-filter-key]").forEach(function (input) {
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
        root.querySelectorAll("[data-filter-toggle]").forEach(function (toggleBtn) {
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
        root.querySelectorAll("[data-port-action][data-port-key], [data-result-action][data-result-key]").forEach(function (button) {
          var key = button.getAttribute("data-port-key") || button.getAttribute("data-result-key");
          var action = button.getAttribute("data-port-action") || button.getAttribute("data-result-action");
          var entry = key && state[key] ? state[key] : null;
          var active = !!(entry && entry[action]);
          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", active ? "true" : "false");
        });
      }

      if (root.dataset.resultStateBound !== "1") {
        root.dataset.resultStateBound = "1";

        if (root.dataset.columnsMenuViewportBound !== "1") {
          root.dataset.columnsMenuViewportBound = "1";
          window.addEventListener("resize", function () {
            positionAllOpenMenus();
          });
          window.addEventListener("scroll", function () {
            positionAllOpenMenus();
          }, true);
        }

        root.addEventListener("click", function (event) {
          var filterToggleBtn = event.target && typeof event.target.closest === "function"
            ? event.target.closest("[data-filter-toggle]")
            : null;
          if (filterToggleBtn && root.contains(filterToggleBtn)) {
            var filterGroup = filterToggleBtn.getAttribute("data-filter-toggle");
            var filterExpanded = filterToggleBtn.getAttribute("aria-expanded") === "true";
            setFilterMenuOpen(filterGroup, !filterExpanded);
            return;
          }

          var toggleBtn = event.target && typeof event.target.closest === "function"
            ? event.target.closest("[data-columns-toggle]")
            : null;
          if (toggleBtn && root.contains(toggleBtn)) {
            var isExpanded = toggleBtn.getAttribute("aria-expanded") === "true";
            setColumnsMenuOpen(!isExpanded);
            return;
          }

          var resetButton = event.target && typeof event.target.closest === "function"
            ? event.target.closest("[data-reset-filters]")
            : null;
          if (resetButton && root.contains(resetButton)) {
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
          if (!menuRoot || !root.contains(menuRoot)) {
            setColumnsMenuOpen(false);
            closeAllFilterMenus();
            updateMenusOpenClass();
          }

          var button = event.target && typeof event.target.closest === "function"
            ? event.target.closest("[data-port-action][data-port-key], [data-result-action][data-result-key]")
            : null;
          if (!button || !root.contains(button)) return;

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

        root.addEventListener("change", function (event) {
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

      root.querySelectorAll("[data-open-ports]").forEach(function (button) {
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";

        button.addEventListener("click", function () {
          var rowId = button.getAttribute("data-open-ports");
          syncResultButtonsState();
          var portsRows = root.querySelectorAll('[data-ports-row="' + rowId + '"]');
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

    function wirePresetsTool(rootEl) {
      var root = rootEl && typeof rootEl.querySelector === "function"
        ? rootEl
        : document.getElementById("v1ToolDetail");
      if (!root) return;
      if (!root.querySelector(".v1-presets-shell")) return;

      var core = window.NetReconNewUICore || {};
      var presetsApi = core.presets;
      if (!presetsApi || typeof presetsApi.getState !== "function" || typeof presetsApi.replaceState !== "function") return;

      var tableBody = root.querySelector(".v1-presets-table tbody");
      if (!tableBody) return;

      var selectedPresetId = null;

      function cloneState(state) {
        return {
          defaultPresetId: String((state && state.defaultPresetId) || ""),
          presets: (state && Array.isArray(state.presets) ? state.presets : []).map(function (item) {
            return {
              id: String((item && item.id) || "").trim(),
              emoji: String((item && item.emoji) || "").trim(),
              name: String((item && item.name) || "").trim(),
              ports: String((item && item.ports) || "").trim(),
            };
          })
        };
      }

      function getState() {
        var fallbackState = typeof presetsApi.getDefaultState === "function"
          ? presetsApi.getDefaultState()
          : { defaultPresetId: "all-ports", presets: [] };

        var state = cloneState(presetsApi.getState());
        var hasData = Array.isArray(state.presets) && state.presets.some(function (item) {
          if (!item) return false;
          return !!String(item.name || "").trim() || !!String(item.ports || "").trim();
        });
        if (hasData) return state;

        if (typeof presetsApi.resetDefaults === "function") {
          try {
            var resetState = cloneState(presetsApi.resetDefaults());
            if (Array.isArray(resetState.presets) && resetState.presets.length) {
              return resetState;
            }
          } catch (_) {
            return cloneState(fallbackState);
          }
        }

        return cloneState(fallbackState);
      }

      function sanitizeId(value) {
        return String(value || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
      }

      function pickSelected(state) {
        var presets = state.presets;
        if (!presets.length) return null;
        var selected = presets.find(function (item) {
          return item.id === selectedPresetId;
        });
        if (selected) return selected;

        selected = presets.find(function (item) {
          return item.id === state.defaultPresetId;
        });
        if (selected) return selected;
        return presets[0];
      }

      function renderFromState(state) {
        var presets = state.presets;
        var selected = pickSelected(state);
        if (!selected) {
          tableBody.innerHTML = "";
          selectedPresetId = null;
          return;
        }

        selectedPresetId = selected.id;
        tableBody.innerHTML = "";
        presets.forEach(function (item) {
          var rowEl = document.createElement("tr");
          rowEl.className = "v1-presets-row";
          rowEl.setAttribute("data-preset-id", item.id);
          if (item.id === selectedPresetId) {
            rowEl.classList.add("is-selected");
          }

          rowEl.innerHTML = [
            '<td class="v1-presets-col-default"><input type="radio" name="v1PresetDefault" data-preset-default="' + item.id + '"' + (item.id === state.defaultPresetId ? ' checked' : '') + ' aria-label="' + escapeHtml(tr("presetsDefaultCol")) + '" /></td>',
            '<td class="v1-presets-col-emoji"><input type="text" maxlength="4" data-preset-field="emoji" data-preset-id="' + item.id + '" value="' + escapeHtml(item.emoji || "") + '" placeholder="⭐" /></td>',
            '<td class="v1-presets-col-name"><input type="text" data-preset-field="name" data-preset-id="' + item.id + '" value="' + escapeHtml(item.name || "") + '" placeholder="' + escapeHtml(tr("presetsNameLabel")) + '" /></td>',
            '<td class="v1-presets-col-ports"><input type="text" data-preset-field="ports" data-preset-id="' + item.id + '" value="' + escapeHtml(item.ports || "") + '" placeholder="80,443,8080" /></td>'
          ].join("");

          tableBody.appendChild(rowEl);
        });
      }

      function persistWith(mutator, statusSuffix) {
        var current = getState();
        var next = mutator(cloneState(current));
        if (!next) return;
        var saved = presetsApi.replaceState(next);
        renderFromState(saved);
        if (setStatusLine && statusSuffix) {
          setStatusLine(tr("menuPrefix") + ": " + statusSuffix);
        }
      }

      tableBody.addEventListener("click", function (event) {
        var defaultEl = event.target.closest("[data-preset-default]");
        if (defaultEl) {
          var defaultId = defaultEl.getAttribute("data-preset-default") || "";
          if (defaultId) {
            persistWith(function (next) {
              next.defaultPresetId = defaultId;
              selectedPresetId = defaultId;
              return next;
            }, "Default preset set");
          }
          return;
        }

        var rowEl = event.target.closest(".v1-presets-row[data-preset-id]");
        if (!rowEl) return;
        if (event.target.closest("input[type=\"text\"], input[type=\"radio\"]")) return;
        selectedPresetId = rowEl.getAttribute("data-preset-id") || "";
        renderFromState(getState());
      });

      tableBody.addEventListener("input", function (event) {
        var fieldEl = event.target.closest("[data-preset-field][data-preset-id]");
        if (!fieldEl) return;
        var field = fieldEl.getAttribute("data-preset-field") || "";
        var presetId = fieldEl.getAttribute("data-preset-id") || "";
        if (!presetId || (field !== "emoji" && field !== "name" && field !== "ports")) return;

        persistWith(function (next) {
          var idx = next.presets.findIndex(function (entry) { return entry.id === presetId; });
          if (idx < 0) return null;
          next.presets[idx][field] = String(fieldEl.value || "").trim();
          selectedPresetId = presetId;
          return next;
        }, null);
      });

      root.querySelectorAll("[data-preset-action]").forEach(function (button) {
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";
        button.addEventListener("click", function () {
          var action = button.getAttribute("data-preset-action") || "";
          var state = getState();
          var selected = pickSelected(state);
          if (!selected && action !== "add") return;

          if (action === "add") {
            persistWith(function (next) {
              var rawId = "preset";
              var uniqueId = rawId;
              var suffix = 2;
              while (next.presets.some(function (entry) { return entry.id === uniqueId; })) {
                uniqueId = rawId + "-" + String(suffix);
                suffix += 1;
              }

              next.presets.unshift({
                id: uniqueId,
                emoji: "",
                name: "",
                ports: "",
              });

              if (!next.defaultPresetId) next.defaultPresetId = uniqueId;
              selectedPresetId = uniqueId;
              return next;
            }, "Preset added");
            return;
          }

          if (action === "delete") {
            persistWith(function (next) {
              if (next.presets.length <= 1) return null;
              var idx = next.presets.findIndex(function (entry) { return entry.id === selected.id; });
              if (idx < 0) return null;
              next.presets.splice(idx, 1);
              if (!next.presets.length) return null;
              if (next.defaultPresetId === selected.id) {
                next.defaultPresetId = next.presets[0].id;
              }
              selectedPresetId = next.presets[Math.max(0, idx - 1)].id;
              return next;
            }, "Preset deleted");
            return;
          }

          if (action === "move-up" || action === "move-down") {
            persistWith(function (next) {
              var idx = next.presets.findIndex(function (entry) { return entry.id === selected.id; });
              if (idx < 0) return null;
              var dir = action === "move-up" ? -1 : 1;
              var target = idx + dir;
              if (target < 0 || target >= next.presets.length) return null;
              var moved = next.presets.splice(idx, 1)[0];
              next.presets.splice(target, 0, moved);
              selectedPresetId = moved.id;
              return next;
            }, action === "move-up" ? "Preset moved up" : "Preset moved down");
            return;
          }
        });
      });

      renderFromState(getState());
    }

    function wireShellCraftCanvas(rootEl) {
      var root = rootEl && typeof rootEl.querySelector === "function"
        ? rootEl
        : document.getElementById("v1ToolDetail");
      if (!root) return;
      // Detached/floating tool windows render their HTML through
      // panels-runtime.js's stripIds() (removes every id="..." attribute to
      // avoid duplicate-id conflicts with the docked view), so this must
      // resolve the canvas by its class, not its id, to keep working there.
      var canvasEl = root.querySelector(".v1-shellcraft-canvas");
      if (!canvasEl || !renderCanvasBlockHtml) return;

      var canvasApi = (window.NetReconNewUICore && window.NetReconNewUICore.shellcraftCanvas) || null;
      var macrosApi = (window.NetReconNewUICore && window.NetReconNewUICore.macros) || null;
      if (!canvasApi) return;

      if (shellcraftCanvasTeardown) {
        shellcraftCanvasTeardown();
        shellcraftCanvasTeardown = null;
      }

      var selectedBlockId = "";

      function render() {
        var state = canvasApi.getState();
        canvasEl.innerHTML = state.blocks.map(renderCanvasBlockHtml).join("");
        if (selectedBlockId) {
          var selectedEl = canvasEl.querySelector('[data-block-id="' + selectedBlockId + '"]');
          if (selectedEl) selectedEl.classList.add("is-selected");
        }
      }

      render();

      function onCanvasChanged() {
        if (!document.body.contains(canvasEl)) return;
        render();
      }
      document.addEventListener("newui:shellcraft-canvas-changed", onCanvasChanged);

      // No visible scrollbars (shell has overflow:hidden) - panning happens
      // by click-and-drag on empty canvas background instead. scrollLeft/Top
      // can still be set programmatically even with overflow:hidden.
      var canvasShellEl = canvasEl.closest(".v1-shellcraft-canvas-shell") || canvasEl.parentElement;
      var isPanning = false;
      var panStartX = 0;
      var panStartY = 0;
      var panScrollLeft = 0;
      var panScrollTop = 0;

      function onCanvasMouseDown(event) {
        if (event.target !== canvasEl || !canvasShellEl) return;
        isPanning = true;
        panStartX = event.clientX;
        panStartY = event.clientY;
        panScrollLeft = canvasShellEl.scrollLeft;
        panScrollTop = canvasShellEl.scrollTop;
        canvasEl.classList.add("is-panning");
        event.preventDefault();
      }

      function onDocumentMouseMove(event) {
        if (!isPanning || !canvasShellEl) return;
        canvasShellEl.scrollLeft = panScrollLeft - (event.clientX - panStartX);
        canvasShellEl.scrollTop = panScrollTop - (event.clientY - panStartY);
      }

      function onDocumentMouseUp() {
        if (!isPanning) return;
        isPanning = false;
        canvasEl.classList.remove("is-panning");
      }

      canvasEl.addEventListener("mousedown", onCanvasMouseDown);
      document.addEventListener("mousemove", onDocumentMouseMove);
      document.addEventListener("mouseup", onDocumentMouseUp);

      // Click-drag is the only pan input so far - also support mouse wheel /
      // trackpad scroll and keyboard, matching what overflow:auto would have
      // given for free before it was replaced with overflow:hidden + manual
      // panning. These are canvas-local (not document-level), so they don't
      // need the same teardown/leak handling as the pan listeners above.
      canvasEl.tabIndex = 0;

      canvasEl.addEventListener("wheel", function (event) {
        if (!canvasShellEl) return;
        canvasShellEl.scrollLeft += event.deltaX;
        canvasShellEl.scrollTop += event.deltaY;
        event.preventDefault();
      }, { passive: false });

      canvasEl.addEventListener("keydown", function (event) {
        if (!canvasShellEl) return;
        var step = 40;
        if (event.key === "ArrowLeft") canvasShellEl.scrollLeft -= step;
        else if (event.key === "ArrowRight") canvasShellEl.scrollLeft += step;
        else if (event.key === "ArrowUp") canvasShellEl.scrollTop -= step;
        else if (event.key === "ArrowDown") canvasShellEl.scrollTop += step;
        else if (event.key === "PageUp") canvasShellEl.scrollTop -= canvasShellEl.clientHeight;
        else if (event.key === "PageDown") canvasShellEl.scrollTop += canvasShellEl.clientHeight;
        else if (event.key === "Home") { canvasShellEl.scrollLeft = 0; canvasShellEl.scrollTop = 0; }
        else return;
        event.preventDefault();
      });

      shellcraftCanvasTeardown = function () {
        document.removeEventListener("newui:shellcraft-canvas-changed", onCanvasChanged);
        document.removeEventListener("mousemove", onDocumentMouseMove);
        document.removeEventListener("mouseup", onDocumentMouseUp);
      };

      canvasEl.addEventListener("dragover", function (event) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = event.dataTransfer.types.indexOf("application/x-shellcraft-move") >= 0 ? "move" : "copy";
      });

      canvasEl.addEventListener("drop", function (event) {
        event.preventDefault();
        var rect = canvasEl.getBoundingClientRect();
        var x = event.clientX - rect.left;
        var y = event.clientY - rect.top;

        var moveRaw = event.dataTransfer.getData("application/x-shellcraft-move");
        if (moveRaw) {
          try {
            var movePayload = JSON.parse(moveRaw);
            canvasApi.updateBlockPosition(movePayload.id, x - movePayload.offsetX, y - movePayload.offsetY);
          } catch (_) {
            // ignore malformed move payload
          }
          return;
        }

        var raw = event.dataTransfer.getData("application/x-shellcraft-block");
        if (!raw) return;
        try {
          var payload = JSON.parse(raw);
          canvasApi.addBlock(payload.type, x, y, payload.properties);
        } catch (_) {
          // ignore malformed drop payload
        }
      });

      canvasEl.addEventListener("dragstart", function (event) {
        var blockEl = event.target && event.target.closest ? event.target.closest(".v1-canvas-block") : null;
        if (!blockEl) return;
        var blockRect = blockEl.getBoundingClientRect();
        var movePayload = {
          id: blockEl.getAttribute("data-block-id"),
          offsetX: event.clientX - blockRect.left,
          offsetY: event.clientY - blockRect.top,
        };
        event.dataTransfer.setData("application/x-shellcraft-move", JSON.stringify(movePayload));
        event.dataTransfer.effectAllowed = "move";
      });

      canvasEl.addEventListener("click", function (event) {
        var removeBtn = event.target && event.target.closest ? event.target.closest("[data-canvas-block-remove]") : null;
        if (removeBtn) {
          canvasApi.removeBlock(removeBtn.getAttribute("data-canvas-block-remove"));
          return;
        }

        var runBtn = event.target && event.target.closest ? event.target.closest("[data-canvas-macro-run]") : null;
        if (runBtn) {
          runMacroAndReportStatus(macrosApi, runBtn.getAttribute("data-canvas-macro-run"));
          return;
        }

        var blockEl = event.target && event.target.closest ? event.target.closest(".v1-canvas-block") : null;
        if (!blockEl) return;

        if (blockEl.hasAttribute("data-block-not-runnable") && setStatusLine) {
          setStatusLine(tr("statusBlockNotExecutable"));
        }

        selectedBlockId = blockEl.getAttribute("data-block-id");
        canvasEl.querySelectorAll(".v1-canvas-block.is-selected").forEach(function (el) {
          el.classList.remove("is-selected");
        });
        blockEl.classList.add("is-selected");

        try {
          document.dispatchEvent(new CustomEvent("newui:shellcraft-block-selected", { detail: { blockId: selectedBlockId } }));
        } catch (_) {
          // ignore event dispatch failures
        }
      });
    }

    function wireShellCraftInspector() {
      var mount = document.getElementById("v1ShellCraftInspector");
      if (!mount || !renderShellCraftInspector) return;

      var canvasApi = (window.NetReconNewUICore && window.NetReconNewUICore.shellcraftCanvas) || null;
      var macrosApi = (window.NetReconNewUICore && window.NetReconNewUICore.macros) || null;
      if (!canvasApi) return;

      function render() {
        mount.innerHTML = renderShellCraftInspector(shellcraftInspectorSelectedBlockId);
      }

      render();

      if (mount.dataset.shellcraftBound === "1") return;
      mount.dataset.shellcraftBound = "1";

      document.addEventListener("newui:shellcraft-block-selected", function (event) {
        shellcraftInspectorSelectedBlockId = (event && event.detail && event.detail.blockId) || "";
        render();
      });

      document.addEventListener("newui:shellcraft-canvas-changed", function () {
        if (!document.body.contains(mount)) return;
        if (shellcraftInspectorSuppressNextRender) {
          shellcraftInspectorSuppressNextRender = false;
          return;
        }
        var state = canvasApi.getState();
        if (shellcraftInspectorSelectedBlockId && !state.blocks.some(function (b) { return b.id === shellcraftInspectorSelectedBlockId; })) {
          shellcraftInspectorSelectedBlockId = "";
        }
        render();
      });

      mount.addEventListener("input", function (event) {
        var target = event.target;
        if (!target || !target.matches || !target.matches("[data-inspector-field]")) return;
        if (!shellcraftInspectorSelectedBlockId) return;

        var field = target.getAttribute("data-inspector-field");
        var value = (field === "maxIterations" || field === "intervalMinutes") ? Number(target.value) : target.value;
        var patch = {};
        patch[field] = value;

        shellcraftInspectorSuppressNextRender = true;
        canvasApi.updateBlockProperties(shellcraftInspectorSelectedBlockId, patch);
      });

      mount.addEventListener("click", function (event) {
        var runBtn = event.target && event.target.closest ? event.target.closest("[data-canvas-macro-run]") : null;
        if (!runBtn) return;
        runMacroAndReportStatus(macrosApi, runBtn.getAttribute("data-canvas-macro-run"));
      });
    }

    function wireShellCraftLibrary() {
      var mount = document.getElementById("v1ShellCraftLibrary");
      if (!mount || !renderShellCraftLibrary) return;

      mount.innerHTML = renderShellCraftLibrary();

      if (mount.dataset.shellcraftBound === "1") return;
      mount.dataset.shellcraftBound = "1";

      mount.addEventListener("dragstart", function (event) {
        var row = event.target && event.target.closest ? event.target.closest(".v1-lib-block-row") : null;
        if (!row) return;

        var blockType = row.getAttribute("data-block-type");

        // Functional blocks (if / repeat-until / powershell / time-trigger)
        // have no interpreter yet - block dragging them onto the canvas
        // until "Show unfinished tools" is on. Checked live (not just at
        // render time) so a mid-session toggle takes effect immediately.
        if (row.getAttribute("data-block-category") === "functional") {
          var unfinishedOn = false;
          try { unfinishedOn = localStorage.getItem("netrecon_show_unfinished_tools") === "1"; } catch (_) {}
          if (!unfinishedOn) {
            event.preventDefault();
            return;
          }
        }

        var properties = {};
        if (blockType === "macro") {
          properties = { macroId: row.getAttribute("data-macro-id") };
        } else if (blockType === "repeat-until") {
          properties = { condition: "", maxIterations: 10 };
        } else if (blockType === "if") {
          properties = { condition: "" };
        } else if (blockType === "powershell") {
          properties = { command: "" };
        } else if (blockType === "time-trigger") {
          properties = { time: "", intervalMinutes: 0 };
        }

        event.dataTransfer.setData("application/x-shellcraft-block", JSON.stringify({ type: blockType, properties: properties }));
        event.dataTransfer.effectAllowed = "copy";
      });
    }

    // shell: TBM Options -> General settings screen (per-setting "remember
    // across restarts" checkboxes). Applies instantly on toggle, no separate
    // Save button - the actual "remember" enforcement runs at next launch,
    // in bootstrap-runtime.js's applyRememberedSettingsGate().
    function wireGeneralSettingsTool(rootEl) {
      var root = rootEl && typeof rootEl.querySelector === "function"
        ? rootEl
        : document.getElementById("v1ToolDetail");
      if (!root) return;
      if (!root.querySelector("[data-general-setting]")) return;
      if (root.dataset.generalSettingsBound === "1") return;
      root.dataset.generalSettingsBound = "1";

      var core = window.NetReconNewUICore || {};
      var generalSettingsApi = core.generalSettings;
      if (!generalSettingsApi) return;

      root.addEventListener("change", function (event) {
        var checkbox = event.target && event.target.closest ? event.target.closest("[data-general-setting]") : null;
        if (!checkbox) return;
        var key = checkbox.getAttribute("data-general-setting");
        if (!key) return;

        var current = generalSettingsApi.getState();
        var next = Object.assign({}, current);
        next[key] = !!checkbox.checked;
        generalSettingsApi.replaceState(next);

        if (setStatusLine) {
          setStatusLine(tr("menuPrefix") + ": " + tr("tipActionGeneral"));
        }
      });

      // "UI" test switch - deliberately NOT persisted (no generalSettingsApi
      // involved here at all). Picking "Test" just navigates to
      // test-ui.html; a normal relaunch always lands back on index.html
      // since nothing records the choice anywhere.
      root.addEventListener("change", function (event) {
        var radio = event.target && event.target.closest ? event.target.closest("input[name=\"v1UiSwitch\"]") : null;
        if (!radio || !radio.checked) return;
        if (radio.value === "test") {
          window.location.href = "test-ui.html";
        }
      });

      // AI Assistant settings - UI/persistence only, no real Claude/Google
      // call wired up yet. Each provider block (Anthropic/Google) is fully
      // independent - its own model, key, and storage mode - so switching
      // the shared "Provider" radio only changes which one is active, it
      // doesn't touch the other block's already-configured settings.
      var aiConfigApi = core.aiAssistantConfig;
      if (aiConfigApi) {
        root.addEventListener("change", function (event) {
          var target = event.target;
          if (!target) return;

          var providerRadio = target.closest ? target.closest('input[name="v1AiProvider"]') : null;
          if (providerRadio && providerRadio.checked) {
            var next = aiConfigApi.getState();
            next.provider = providerRadio.value === "google" ? "google" : "claude";
            aiConfigApi.replaceState(next);
            return;
          }

          var modelSelect = target.closest ? target.closest("[data-ai-model-select]") : null;
          if (modelSelect) {
            var selectProvider = modelSelect.getAttribute("data-ai-model-select");
            var nextModel = aiConfigApi.getState();
            nextModel[selectProvider === "google" ? "google" : "claude"].model = modelSelect.value;
            aiConfigApi.replaceState(nextModel);
            return;
          }

          var storageRadio = target.closest ? target.closest('input[name^="v1AiKeyStorage-"]') : null;
          if (storageRadio && storageRadio.checked) {
            var storageProvider = storageRadio.name.replace("v1AiKeyStorage-", "");
            aiConfigApi.setKeyStorageMode(storageProvider, storageRadio.value === "ram" ? "ram" : "localstorage");
            return;
          }

          var keyInput = target.closest ? target.closest("[data-ai-api-key]") : null;
          if (keyInput) {
            aiConfigApi.setApiKey(keyInput.getAttribute("data-ai-api-key"), keyInput.value);
          }
        });
      }

      root.addEventListener("click", function (event) {
        var btn = event.target && event.target.closest ? event.target.closest('[data-general-action="ai-permissions"]') : null;
        if (!btn) return;
        if (window.NetReconNewUI && window.NetReconNewUI.switchTool) {
          window.NetReconNewUI.switchTool("ai-permissions");
        }
      });
    }

    // ip-scanner tool: Network Monitor (local connections + ARP table).
    // Options (live Start/Stop with interval, one-shot Scan, section
    // reorder) live in the LS panel (tool-content-runtime.js's
    // "network-monitor" entry -> wireNetworkMonitorLeftPanel below); CS is
    // a pure, button-free results display. Both wire functions below are
    // thin: the real logic (refresh, timers, order) is shared module-level
    // so it works the same regardless of which section triggered it.
    var renderNetMonConnectionsRows = typeof deps.renderNetworkMonitorConnectionsRows === "function" ? deps.renderNetworkMonitorConnectionsRows : null;
    var renderNetMonArpRows = typeof deps.renderNetworkMonitorArpRows === "function" ? deps.renderNetworkMonitorArpRows : null;
    var renderNetMonConnectionsGrouped = typeof deps.renderNetworkMonitorConnectionsGrouped === "function" ? deps.renderNetworkMonitorConnectionsGrouped : null;
    var renderNetMonArpGrouped = typeof deps.renderNetworkMonitorArpGrouped === "function" ? deps.renderNetworkMonitorArpGrouped : null;

    function getNetMonState() {
      return (window.NetReconNewUICore && window.NetReconNewUICore.netMonState) || null;
    }
    function getNetMonOrder() {
      var s = getNetMonState();
      return s ? s.loadOrder() : ["connections", "lan"];
    }

    // Reorders a container's two direct children (whichever DOM currently
    // exists - LS panel, CS shell, both, or neither) to match stored order.
    // Idempotent, safe to call on every (re)render as well as right after a
    // Move click, so LS and CS - normally visible side by side - update in
    // lockstep without either one needing a full re-render.
    function reorderNetMonPair(container, connSelector, lanSelector, order) {
      if (!container) return;
      var connEl = container.querySelector(connSelector);
      var lanEl = container.querySelector(lanSelector);
      if (!connEl || !lanEl) return;
      if (order[0] === "lan") container.insertBefore(lanEl, connEl);
      else container.insertBefore(connEl, lanEl);
    }

    function applyNetMonOrder() {
      var order = getNetMonOrder();
      reorderNetMonPair(document.querySelector("[data-netmon-ls-list]"), '[data-netmon-ls-section="connections"]', '[data-netmon-ls-section="lan"]', order);
      reorderNetMonPair(document.querySelector(".v1-netmon-shell"), '[data-netmon-section="connections"]', '[data-netmon-section="lan"]', order);
    }

    function syncNetMonMoveButtons() {
      var order = getNetMonOrder();
      ["connections", "lan"].forEach(function (kind) {
        var idx = order.indexOf(kind);
        var upBtn = document.querySelector('[data-netmon-action="move-up-' + kind + '"]');
        var downBtn = document.querySelector('[data-netmon-action="move-down-' + kind + '"]');
        if (upBtn) upBtn.disabled = idx <= 0;
        if (downBtn) downBtn.disabled = idx >= order.length - 1;
      });
    }

    function swapNetMonOrder() {
      var order = getNetMonOrder();
      var s = getNetMonState();
      if (s) s.saveOrder([order[1], order[0]]);
      applyNetMonOrder();
      syncNetMonMoveButtons();
    }

    // Numeric-octet IP compare - a plain string compare would sort
    // "10.0.0.10" before "10.0.0.2" (lexicographic '1' < '2'), which reads
    // as wrong to anyone actually looking at a connections/ARP table.
    function compareNetMonIp(a, b) {
      var pa = String(a || "0.0.0.0").split(".");
      var pb = String(b || "0.0.0.0").split(".");
      for (var i = 0; i < 4; i++) {
        var da = Number(pa[i]) || 0;
        var db = Number(pb[i]) || 0;
        if (da !== db) return da - db;
      }
      return 0;
    }

    function netMonCompareConnections(a, b, col) {
      switch (col) {
        case "protocol": return String(a.protocol || "").localeCompare(String(b.protocol || ""));
        case "local": {
          var ipL = compareNetMonIp(a.local_addr, b.local_addr);
          return ipL !== 0 ? ipL : (Number(a.local_port || 0) - Number(b.local_port || 0));
        }
        case "remote": {
          var ipR = compareNetMonIp(a.remote_addr, b.remote_addr);
          return ipR !== 0 ? ipR : (Number(a.remote_port || 0) - Number(b.remote_port || 0));
        }
        case "state": return String(a.state || "").localeCompare(String(b.state || ""));
        case "pid": return Number(a.pid || 0) - Number(b.pid || 0);
        case "process": return String(a.process_name || "").localeCompare(String(b.process_name || ""));
        default: return 0;
      }
    }

    function netMonCompareArp(a, b, col) {
      var vendorFn = typeof deps.netMonVendorForMac === "function" ? deps.netMonVendorForMac : null;
      switch (col) {
        case "ip": return compareNetMonIp(a.ip, b.ip);
        case "mac": return String(a.mac || "").localeCompare(String(b.mac || ""));
        case "vendor": return String(vendorFn ? vendorFn(a.mac) : "").localeCompare(String(vendorFn ? vendorFn(b.mac) : ""));
        case "interface": return String(a.interface || "").localeCompare(String(b.interface || ""));
        default: return 0;
      }
    }

    function sortNetMonRows(rows, kind) {
      var s = loadNetMonSort()[kind];
      if (!rows || !s || !s.col) return rows;
      var compareFn = kind === "connections" ? netMonCompareConnections : netMonCompareArp;
      var sorted = rows.slice().sort(function (a, b) { return compareFn(a, b, s.col); });
      if (s.dir === "desc") sorted.reverse();
      return sorted;
    }

    // Same sort state as sortNetMonRows above, but as a reusable comparator
    // - the grouped renderer needs a plain (a, b) function to sort each
    // group's rows individually, rather than a whole-array sort+reverse.
    function buildNetMonCompareFn(kind) {
      var s = loadNetMonSort()[kind];
      if (!s || !s.col) return null;
      var compareFn = kind === "connections" ? netMonCompareConnections : netMonCompareArp;
      var col = s.col;
      var dir = s.dir;
      return function (a, b) {
        var cmp = compareFn(a, b, col);
        return dir === "desc" ? -cmp : cmp;
      };
    }

    function syncNetMonSortArrows() {
      var sortState = loadNetMonSort();
      ["connections", "lan"].forEach(function (kind) {
        var s = sortState[kind];
        var section = document.querySelector('[data-netmon-section="' + kind + '"]');
        if (!section) return;
        section.querySelectorAll("[data-netmon-sort-arrow]").forEach(function (span) {
          var col = span.getAttribute("data-netmon-sort-arrow");
          span.textContent = s.col === col ? (s.dir === "desc" ? " ▼" : " ▲") : "";
        });
      });
    }

    // Single source of truth for "what should this table's tbody show right
    // now": dispatches to the flat (sorted) renderer or the grouped one
    // depending on the current view, always from the latest cached rows -
    // called after every fetch, sort click, group toggle, and view/
    // visibility change, so no matter which one triggered the update the
    // table always reflects the freshest data under the current view.
    function renderNetMonTable(kind) {
      var isConn = kind === "connections";
      if (!(isConn ? netMonLastConnections : netMonLastArp)) return;
      var tbody = document.querySelector('[data-netmon-role="' + (isConn ? "connections-rows" : "arp-rows") + '"]');
      if (!tbody) return;
      pruneNetMonMarks(kind);
      var rows = buildNetMonEffectiveRows(kind);
      if (loadNetMonDisplayMode() === "changes" && !rows.length) {
        tbody.innerHTML = "<tr><td colspan=\"" + (isConn ? 6 : 4) + "\" class=\"v1-iplib-empty\">" + escapeHtml(tr("netMonChangesEmpty")) + "</td></tr>";
        return;
      }
      var view = loadNetMonView()[kind];
      if (!view || view === "flat") {
        var flatFn = isConn ? renderNetMonConnectionsRows : renderNetMonArpRows;
        if (flatFn) tbody.innerHTML = flatFn(sortNetMonRows(rows, kind));
      } else {
        var groupedFn = isConn ? renderNetMonConnectionsGrouped : renderNetMonArpGrouped;
        var expanded = isConn ? netMonConnExpandedGroups : netMonLanExpandedGroups;
        if (groupedFn) tbody.innerHTML = groupedFn(rows, view, expanded, buildNetMonCompareFn(kind));
      }
    }

    function setNetMonSortColumn(kind, col) {
      var sortState = loadNetMonSort();
      var s = sortState[kind];
      if (s.col === col) s.dir = s.dir === "asc" ? "desc" : "asc";
      else { s.col = col; s.dir = "asc"; }
      saveNetMonSort(sortState);
      syncNetMonSortArrows();
      renderNetMonTable(kind);
    }

    function toggleNetMonGroup(kind, key) {
      var expanded = kind === "connections" ? netMonConnExpandedGroups : netMonLanExpandedGroups;
      if (expanded[key]) delete expanded[key];
      else expanded[key] = true;
      renderNetMonTable(kind);
    }

    function syncNetMonViewUi() {
      var view = loadNetMonView();
      ["connections", "lan"].forEach(function (kind) {
        var select = document.querySelector('[data-netmon-view-select="' + kind + '"]');
        if (select) select.value = view[kind];
        var section = document.querySelector('[data-netmon-section="' + kind + '"]');
        if (section) section.setAttribute("data-netmon-view", view[kind]);
      });
    }

    function applyNetMonVisibility() {
      var vis = loadNetMonVisibility();
      ["connections", "lan"].forEach(function (kind) {
        var section = document.querySelector('[data-netmon-section="' + kind + '"]');
        if (section) section.hidden = !vis[kind];
        var checkbox = document.querySelector('[data-netmon-visibility="' + kind + '"]');
        if (checkbox) checkbox.checked = vis[kind];
      });
    }

    function applyNetMonToolbarState() {
      var keepCheck = document.querySelector("[data-netmon-keep-marks]");
      if (keepCheck) keepCheck.checked = loadNetMonKeepMarks();
      var mode = loadNetMonDisplayMode();
      document.querySelectorAll("[data-netmon-display-mode]").forEach(function (radio) {
        radio.checked = radio.value === mode;
      });
    }

    // Identifies rows that appeared/disappeared between this cycle and the
    // previous one, by a stable identity key - not raw per-cycle snapshots,
    // so a live poll every few seconds doesn't treat unchanged rows as new
    // each time.
    function netMonConnectionKey(row) {
      return (row.protocol || "") + "|" + (row.local_addr || "") + ":" + (row.local_port || "") + "|" + (row.remote_addr || "") + ":" + (row.remote_port || "") + "|" + (row.pid || "");
    }
    function netMonArpKey(row) {
      return (row.ip || "") + "|" + (row.mac || "");
    }

    function diffNetMonRows(oldRows, newRows, keyFn) {
      var oldMap = {};
      (oldRows || []).forEach(function (r) { oldMap[keyFn(r)] = r; });
      var newMap = {};
      (newRows || []).forEach(function (r) { newMap[keyFn(r)] = r; });
      var appeared = [];
      var disappeared = [];
      Object.keys(newMap).forEach(function (k) { if (!(k in oldMap)) appeared.push(newMap[k]); });
      Object.keys(oldMap).forEach(function (k) { if (!(k in newMap)) disappeared.push(oldMap[k]); });
      return { appeared: appeared, disappeared: disappeared };
    }

    // Records a diff into the gone/new marks, dropping the opposite mark
    // for the same key (a row that reappears within its own grace window
    // shouldn't show both badges at once).
    function markNetMonDiff(kind, diff, keyFn) {
      var isConn = kind === "connections";
      var goneMap = isConn ? netMonConnGone : netMonLanGone;
      var newMap = isConn ? netMonConnNew : netMonLanNew;
      var now = Date.now();
      diff.disappeared.forEach(function (row) { goneMap[keyFn(row)] = { row: row, ts: now }; });
      diff.appeared.forEach(function (row) {
        var key = keyFn(row);
        newMap[key] = now;
        delete goneMap[key];
      });
    }

    function pruneNetMonMarks(kind) {
      if (loadNetMonKeepMarks()) return;
      var now = Date.now();
      var isConn = kind === "connections";
      var goneMap = isConn ? netMonConnGone : netMonLanGone;
      var newMap = isConn ? netMonConnNew : netMonLanNew;
      Object.keys(goneMap).forEach(function (k) { if (now - goneMap[k].ts > NETMON_GONE_GRACE_MS) delete goneMap[k]; });
      Object.keys(newMap).forEach(function (k) { if (now - newMap[k] > NETMON_NEW_HIGHLIGHT_MS) delete newMap[k]; });
    }

    // Builds the row set actually handed to the renderer, per the current
    // display mode:
    //  - "actual": the plain current snapshot, no marks at all.
    //  - "all" (default): live rows (tagged __netmonNew where still within
    //    their highlight window) plus still-within-grace gone rows appended
    //    back in, tagged __netmonGone.
    //  - "changes": only the marked rows - unchanged live rows are left out
    //    entirely, so this becomes a pure diff-since-last-scan view.
    // panel-content-runtime.js's row renderers key off __netmonNew/
    // __netmonGone to add the +/- badge and row class.
    function buildNetMonEffectiveRows(kind) {
      var isConn = kind === "connections";
      var rows = (isConn ? netMonLastConnections : netMonLastArp) || [];
      var mode = loadNetMonDisplayMode();
      if (mode === "actual") return rows;

      var goneMap = isConn ? netMonConnGone : netMonLanGone;
      var newMap = isConn ? netMonConnNew : netMonLanNew;
      var keyFn = isConn ? netMonConnectionKey : netMonArpKey;
      var goneRows = Object.keys(goneMap).map(function (key) {
        return Object.assign({}, goneMap[key].row, { __netmonGone: true });
      });

      if (mode === "changes") {
        var newRows = rows.filter(function (row) { return newMap[keyFn(row)]; })
          .map(function (row) { return Object.assign({}, row, { __netmonNew: true }); });
        return newRows.concat(goneRows);
      }

      var effective = rows.map(function (row) {
        return newMap[keyFn(row)] ? Object.assign({}, row, { __netmonNew: true }) : row;
      });
      return effective.concat(goneRows);
    }

    function refreshNetMonConnections() {
      var platform = window.NetReconNewUICore && window.NetReconNewUICore.platform;
      if (!platform || !renderNetMonConnectionsRows) return Promise.resolve();
      // data-netmon-role, not #id: the detached/floating card variant of
      // CS's content strips all id="..." attributes (stripIds() in
      // panels-runtime.js), so an #id lookup would silently find nothing
      // there - and a live timer must keep updating the cache (for later
      // rehydration) even while CS isn't the active/mounted tab at all.
      // Returns the invoke promise so a manual Scan click can grey its own
      // button out for the in-flight duration (Start/Stop track their own
      // running state separately via setNetMonButtonsRunning).
      return platform.invoke("list_connections", {}).then(function (rows) {
        if (netMonLastConnections) {
          markNetMonDiff("connections", diffNetMonRows(netMonLastConnections, rows, netMonConnectionKey), netMonConnectionKey);
        }
        netMonLastConnections = rows;
        renderNetMonTable("connections");
      }).catch(function (err) {
        var tbody = document.querySelector('[data-netmon-role="connections-rows"]');
        if (tbody) tbody.innerHTML = "<tr><td colspan=\"6\" class=\"v1-iplib-empty\">" + escapeHtml(String((err && err.message) || err)) + "</td></tr>";
      });
    }

    function refreshNetMonArp() {
      var platform = window.NetReconNewUICore && window.NetReconNewUICore.platform;
      if (!platform || !renderNetMonArpRows) return Promise.resolve();
      return platform.invoke("list_arp_entries", {}).then(function (rows) {
        if (netMonLastArp) {
          markNetMonDiff("lan", diffNetMonRows(netMonLastArp, rows, netMonArpKey), netMonArpKey);
        }
        netMonLastArp = rows;
        renderNetMonTable("lan");
      }).catch(function (err) {
        var tbody = document.querySelector('[data-netmon-role="arp-rows"]');
        if (tbody) tbody.innerHTML = "<tr><td colspan=\"4\" class=\"v1-iplib-empty\">" + escapeHtml(String((err && err.message) || err)) + "</td></tr>";
      });
    }

    function getNetMonIntervalInput(kind) {
      return document.querySelector('[data-netmon-interval-input="' + kind + '"]');
    }

    function setNetMonButtonsRunning(kind, running) {
      var startBtn = document.querySelector('[data-netmon-action="start-' + kind + '"]');
      var stopBtn = document.querySelector('[data-netmon-action="stop-' + kind + '"]');
      var input = getNetMonIntervalInput(kind);
      if (startBtn) startBtn.disabled = running;
      if (stopBtn) stopBtn.disabled = !running;
      if (input) input.disabled = running;
    }

    function startNetMonLive(kind) {
      var isConn = kind === "connections";
      if (isConn ? netMonConnRunning : netMonLanRunning) return;

      var input = getNetMonIntervalInput(kind);
      var seconds = input ? parseInt(input.value, 10) : NaN;
      if (!seconds || seconds < 1) seconds = isConn ? 3 : 5;
      if (input) input.value = String(seconds);

      var s = getNetMonState();
      if (s) {
        var settings = s.loadSettings();
        if (isConn) settings.connectionsIntervalSec = seconds;
        else settings.lanIntervalSec = seconds;
        s.saveSettings(settings);
      }

      var refreshFn = isConn ? refreshNetMonConnections : refreshNetMonArp;
      refreshFn();
      var timerId = window.setInterval(refreshFn, seconds * 1000);
      if (isConn) { netMonConnRunning = true; netMonConnTimerId = timerId; }
      else { netMonLanRunning = true; netMonLanTimerId = timerId; }
      setNetMonButtonsRunning(kind, true);
    }

    function stopNetMonLive(kind) {
      var isConn = kind === "connections";
      if (isConn) {
        if (netMonConnTimerId) window.clearInterval(netMonConnTimerId);
        netMonConnTimerId = null;
        netMonConnRunning = false;
      } else {
        if (netMonLanTimerId) window.clearInterval(netMonLanTimerId);
        netMonLanTimerId = null;
        netMonLanRunning = false;
      }
      setNetMonButtonsRunning(kind, false);
    }

    function bindNetMonActionsOnce() {
      if (netMonActionsBound) return;
      netMonActionsBound = true;
      document.addEventListener("click", function (event) {
        var groupRow = event.target && event.target.closest ? event.target.closest(".v1-netmon-group-row") : null;
        if (groupRow) {
          var groupSection = groupRow.closest("[data-netmon-section]");
          var groupKind = groupSection ? groupSection.getAttribute("data-netmon-section") : null;
          var groupKey = groupRow.getAttribute("data-netmon-group-key");
          if (groupKind && groupKey !== null) toggleNetMonGroup(groupKind, groupKey);
          return;
        }

        var sortTh = event.target && event.target.closest ? event.target.closest("[data-netmon-sort-col]") : null;
        if (sortTh) {
          var section = sortTh.closest("[data-netmon-section]");
          var kind = section ? section.getAttribute("data-netmon-section") : null;
          // Works in both flat and grouped views - grouped just sorts each
          // group's rows individually (netMonGroupedRowsHtml), rather than
          // reordering the whole table.
          if (kind) setNetMonSortColumn(kind, sortTh.getAttribute("data-netmon-sort-col"));
          return;
        }

        var btn = event.target && event.target.closest ? event.target.closest("[data-netmon-action]") : null;
        if (!btn) return;
        var action = btn.getAttribute("data-netmon-action");
        if (action === "start-connections") startNetMonLive("connections");
        else if (action === "stop-connections") stopNetMonLive("connections");
        else if (action === "scan-connections") {
          // Greyed out for the in-flight duration, same visible "a scan is
          // running" signal Start/Stop already give - Scan has no running
          // state of its own to track, just this one request.
          btn.disabled = true;
          refreshNetMonConnections().finally(function () { btn.disabled = false; });
        }
        else if (action === "start-lan") startNetMonLive("lan");
        else if (action === "stop-lan") stopNetMonLive("lan");
        else if (action === "scan-lan") {
          btn.disabled = true;
          refreshNetMonArp().finally(function () { btn.disabled = false; });
        }
        else if (action === "move-up-connections" || action === "move-down-connections" || action === "move-up-lan" || action === "move-down-lan") swapNetMonOrder();
      });

      document.addEventListener("change", function (event) {
        var viewSelect = event.target && event.target.closest ? event.target.closest("[data-netmon-view-select]") : null;
        if (viewSelect) {
          var viewKind = viewSelect.getAttribute("data-netmon-view-select");
          var view = loadNetMonView();
          view[viewKind] = viewSelect.value;
          saveNetMonView(view);
          if (viewKind === "connections") netMonConnExpandedGroups = {};
          else netMonLanExpandedGroups = {};
          syncNetMonViewUi();
          renderNetMonTable(viewKind);
          return;
        }

        var visCheck = event.target && event.target.closest ? event.target.closest("[data-netmon-visibility]") : null;
        if (visCheck) {
          var visKind = visCheck.getAttribute("data-netmon-visibility");
          var vis = loadNetMonVisibility();
          vis[visKind] = visCheck.checked;
          saveNetMonVisibility(vis);
          applyNetMonVisibility();
          return;
        }

        var keepCheck = event.target && event.target.closest ? event.target.closest("[data-netmon-keep-marks]") : null;
        if (keepCheck) {
          saveNetMonKeepMarks(keepCheck.checked);
          // Turning it back off should prune stale marks immediately, not
          // just whenever the next fetch happens to land.
          renderNetMonTable("connections");
          renderNetMonTable("lan");
          return;
        }

        var modeRadio = event.target && event.target.closest ? event.target.closest("[data-netmon-display-mode]") : null;
        if (modeRadio && modeRadio.checked) {
          saveNetMonDisplayMode(modeRadio.value);
          renderNetMonTable("connections");
          renderNetMonTable("lan");
        }
      });
    }

    // CS wiring: rehydrates the results tables from cache, applies the
    // stored section order, and syncs button-disabled state on the LS
    // panel too (in case CS activated first) - runs on every (re)render,
    // same "survives detach/redock" reasoning as netMonLast* above.
    function wireNetworkMonitorTool(rootEl) {
      var root = rootEl && typeof rootEl.querySelector === "function"
        ? rootEl
        : document.getElementById("v1ToolDetail");
      if (!root) return;
      if (!root.querySelector(".v1-netmon-shell")) return;

      syncNetMonViewUi();
      applyNetMonToolbarState();
      renderNetMonTable("connections");
      renderNetMonTable("lan");
      syncNetMonSortArrows();
      applyNetMonVisibility();

      applyNetMonOrder();
      setNetMonButtonsRunning("connections", netMonConnRunning);
      setNetMonButtonsRunning("lan", netMonLanRunning);
      syncNetMonMoveButtons();
      bindNetMonActionsOnce();
    }

    // LS wiring (tool-content-runtime.js's "network-monitor" entry): the
    // panel's HTML is regenerated fresh on every activation (order/interval
    // values are baked in at render time from netMonState), so this just
    // needs to reconcile live/running state into the fresh buttons and
    // (re)bind the shared document-level action listener.
    function wireNetworkMonitorLeftPanel(rootEl) {
      applyNetMonOrder();
      setNetMonButtonsRunning("connections", netMonConnRunning);
      setNetMonButtonsRunning("lan", netMonLanRunning);
      syncNetMonMoveButtons();
      bindNetMonActionsOnce();
    }

    function setEmailReconButtonsState(isBusy) {
      var startBtn = document.querySelector('[data-emailrecon-action="start"]');
      var stopBtn = document.querySelector('[data-emailrecon-action="stop"]');
      if (startBtn) startBtn.disabled = !!isBusy;
      if (stopBtn) stopBtn.disabled = !isBusy;
    }

    function wireEmailReconTool(rootEl) {
      var root = rootEl && typeof rootEl.querySelector === "function"
        ? rootEl
        : document.getElementById("v1ToolDetail");
      if (!root) return;
      if (!root.querySelector(".v1-emailrecon-shell")) return;

      var renderRows = typeof deps.renderEmailReconRows === "function" ? deps.renderEmailReconRows : null;
      var renderSummary = typeof deps.renderEmailReconSummary === "function" ? deps.renderEmailReconSummary : null;

      function applySummaryToDom(summary) {
        var existsEl = document.querySelector('[data-emailrecon-role="exists-badge"]');
        var countEl = document.querySelector('[data-emailrecon-role="hit-count"]');
        if (existsEl) existsEl.textContent = summary.exists;
        if (countEl) countEl.textContent = summary.count;
      }

      // Re-hydrate from the last completed lookup on every (re)render of
      // this shell - same reasoning as Network Monitor's
      // netMonLastConnections above: #v1ToolDetail survives detach/redock,
      // so a bind-guard would otherwise skip this on redock even though the
      // summary/rows are brand-new, empty nodes each time.
      if (renderRows && emailReconLastResult) {
        var tbody = root.querySelector('[data-emailrecon-role="results-rows"]');
        if (tbody) tbody.innerHTML = renderRows(emailReconLastResult.sources);
      }
      if (renderSummary && emailReconLastResult) {
        applySummaryToDom(renderSummary(emailReconLastResult));
      }

      // Start/Stop live in the LS panel, not this CS root (unlike Network
      // Monitor's own refresh buttons) - the LS panel is a stable element
      // that's never torn down, so this listener only needs to bind once,
      // ever, via a plain module-level flag rather than a per-render guard.
      if (emailReconActionsBound) return;
      emailReconActionsBound = true;

      function startLookup() {
        if (emailReconRunning) return;
        var core = window.NetReconNewUICore || {};
        var platform = core.platform;
        var emailReconConfig = core.emailReconConfig;
        var emailReconApi = core.emailReconRuntime;
        var sharedNet = core.utils && core.utils.net;

        var input = document.getElementById("v1EmailReconInput");
        var email = input ? String(input.value || "").trim() : "";
        var isValid = sharedNet && typeof sharedNet.isValidEmail === "function"
          ? sharedNet.isValidEmail(email)
          : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        if (!isValid) {
          if (setStatusLine) setStatusLine(tr("emailReconInvalidEmail"));
          return;
        }
        if (!platform || !emailReconConfig) return;

        var state = emailReconConfig.getState();
        if (!state.emailrep && !state.gravatar && !state.github && !state.hibpBreaches && !state.hibpPastes && !state.xposedornot && !state.leakcheck) {
          if (setStatusLine) setStatusLine(tr("emailReconNoSourcesSelected"));
          return;
        }

        var thisGeneration = ++emailReconGeneration;
        emailReconRunning = true;
        setEmailReconButtonsState(true);
        if (setStatusLine) setStatusLine(tr("statusEmailReconStart") + " " + email);

        platform.invoke("email_recon_lookup", {
          email: email,
          options: {
            emailrep: state.emailrep,
            gravatar: state.gravatar,
            github: state.github,
            hibpBreaches: state.hibpBreaches,
            hibpPastes: state.hibpPastes,
            xposedornot: state.xposedornot,
            leakcheck: state.leakcheck,
            hibpApiKey: state.hibpApiKey,
          },
        }).then(function (result) {
          if (thisGeneration !== emailReconGeneration) return; // superseded by Stop or a newer lookup
          emailReconLastResult = result;
          var csRoot = document.querySelector(".v1-emailrecon-shell");
          if (csRoot && renderRows) {
            var resultsBody = csRoot.querySelector('[data-emailrecon-role="results-rows"]');
            if (resultsBody) resultsBody.innerHTML = renderRows(result.sources);
          }
          if (renderSummary) applySummaryToDom(renderSummary(result));
          if (emailReconApi && typeof emailReconApi.addEmailHistory === "function") {
            emailReconApi.addEmailHistory(email);
          }
          if (setStatusLine) setStatusLine(tr("statusEmailReconDone") + " " + email);
        }).catch(function (err) {
          if (thisGeneration !== emailReconGeneration) return;
          if (setStatusLine) setStatusLine(tr("statusErrorShort") + ": " + String((err && err.message) || err));
        }).finally(function () {
          if (thisGeneration !== emailReconGeneration) return;
          emailReconRunning = false;
          setEmailReconButtonsState(false);
        });
      }

      function stopLookup() {
        if (!emailReconRunning) return;
        // UI-only in v1 - there's no cheap way to cancel the in-flight
        // reqwest calls through the current invoke plumbing. Bumping the
        // generation counter just makes the eventual response a no-op
        // instead of overwriting anything the user has since moved on from.
        emailReconGeneration++;
        emailReconRunning = false;
        setEmailReconButtonsState(false);
        if (setStatusLine) setStatusLine(tr("statusEmailReconStop"));
      }

      document.addEventListener("click", function (event) {
        var btn = event.target && event.target.closest ? event.target.closest("[data-emailrecon-action]") : null;
        if (!btn) return;
        var action = btn.getAttribute("data-emailrecon-action");
        if (action === "start") startLookup();
        if (action === "stop") stopLookup();
      });
    }

    // AI Tools & Permissions (CS tab, opened from General settings). Any
    // change (profile pick, a tree select, the guardrail number, the lock
    // checkbox) just updates ai-permissions-runtime.js's store and
    // regenerates this tab's whole content from it - simplest way to keep
    // every select's "Mixed" state and disabled/locked styling correct
    // without hand-patching each element. The delegated listeners stay on
    // `root` itself (never replaced), so they survive that regeneration.
    function exportAiPermAuditLog(entries) {
      try {
        var blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "ai-audit-log.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (_) {
        // ignore - purely a convenience export, nothing depends on it succeeding
      }
    }

    function wireAiPermissionsTool(rootEl) {
      var root = rootEl && typeof rootEl.querySelector === "function"
        ? rootEl
        : document.getElementById("v1ToolDetail");
      if (!root) return;
      if (!root.querySelector(".v1-ai-perm-tree")) return;

      var api = window.NetReconNewUICore && window.NetReconNewUICore.aiPermissions;
      var renderFn = typeof deps.renderAiPermissionsTool === "function" ? deps.renderAiPermissionsTool : null;
      if (!api || !renderFn) return;

      function rerender() {
        root.innerHTML = renderFn();
      }

      if (root.dataset.aiPermBound === "1") return;
      root.dataset.aiPermBound = "1";

      root.addEventListener("change", function (event) {
        var target = event.target;
        if (!target) return;

        var profileRadio = target.closest ? target.closest('input[name="v1AiPermProfile"]') : null;
        if (profileRadio && profileRadio.checked) {
          api.applyProfile(profileRadio.value);
          rerender();
          return;
        }

        var select = target.closest ? target.closest("[data-ai-perm-select]") : null;
        if (select) {
          api.setNodeLevel(select.getAttribute("data-ai-perm-select"), select.value);
          rerender();
          return;
        }

        if (target.id === "v1AiPermMaxActions") {
          var nextMax = api.getState();
          nextMax.maxActionsPerConversation = Number(target.value) || nextMax.maxActionsPerConversation;
          api.replaceState(nextMax);
          return;
        }

        if (target.id === "v1AiPermLockSettings") {
          var nextLock = api.getState();
          nextLock.lockSettings = !!target.checked;
          api.replaceState(nextLock);
          rerender();
        }
      });

      root.addEventListener("click", function (event) {
        var btn = event.target && event.target.closest ? event.target.closest("[data-ai-perm-action]") : null;
        if (!btn) return;
        var action = btn.getAttribute("data-ai-perm-action");
        if (action === "clear-log") {
          api.clearAuditLog();
          rerender();
        } else if (action === "export-log") {
          exportAiPermAuditLog(api.loadAuditLog());
        }
      });
    }

    return {
      // shell
      wireVersionsTimeline: wireVersionsTimeline,
      wireGeneralSettingsTool: wireGeneralSettingsTool,
      wireShellCraftLibrary: wireShellCraftLibrary,
      wireShellCraftCanvas: wireShellCraftCanvas,
      wireShellCraftInspector: wireShellCraftInspector,
      // ip-scanner tool
      wireResultsIpTable: wireResultsIpTable,
      wirePresetsTool: wirePresetsTool,
      wireNetworkMonitorTool: wireNetworkMonitorTool,
      wireNetworkMonitorLeftPanel: wireNetworkMonitorLeftPanel,
      wireEmailReconTool: wireEmailReconTool,
      wireAiPermissionsTool: wireAiPermissionsTool,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createPanelInteractionsRuntime = createPanelInteractionsRuntime;
})();
