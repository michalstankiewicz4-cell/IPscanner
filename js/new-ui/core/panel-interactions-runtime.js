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
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createPanelInteractionsRuntime = createPanelInteractionsRuntime;
})();
