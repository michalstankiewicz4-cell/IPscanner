(function () {
  function createPanelInteractionsRuntime(deps) {
    var versionsData = Array.isArray(deps.versionsData) ? deps.versionsData : [];
    var tr = typeof deps.tr === "function" ? deps.tr : function (key) { return key; };
    var setStatusLine = typeof deps.setStatusLine === "function" ? deps.setStatusLine : null;

    function escapeHtml(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function wireVersionsTimeline(rootEl) {
      var root = rootEl && typeof rootEl.querySelector === "function"
        ? rootEl
        : document.getElementById("v1ToolDetail");
      if (!root) return;

      if (root.dataset.versionsTimelineBound === "1") return;
      root.dataset.versionsTimelineBound = "1";

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
        var fallbackState = {
          defaultPresetId: "all-ports",
          presets: [
            { id: "cameras", emoji: "📷", name: "Cameras", ports: "80,443,554,8080,8081,9000,34567,37777" },
            { id: "printers", emoji: "🖨", name: "Printers", ports: "80,443,631,8080,9100" },
            { id: "folders-http", emoji: "📁", name: "Folders / HTTP", ports: "21,80,3000,5000,8000,8080,8888" },
            { id: "routers", emoji: "📡", name: "Routers", ports: "80,443,8080,8443,10000" },
            { id: "nas-servers", emoji: "🗄", name: "NAS / Servers", ports: "80,443,5000,5001,8006,8080,9090" },
            { id: "windows-smb", emoji: "🪟", name: "Windows / SMB", ports: "135,139,445,3389,5985,5986" },
            { id: "all-ports", emoji: "🌐", name: "All ports", ports: "21,80,135,139,443,445,554,631,3000,3389,5000,5001,5985,5986,8000,8006,8080,8081,8443,8888,9000,9090,9100,10000,34567,37777" }
          ]
        };

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
            '<td class="v1-presets-col-default"><input type="radio" name="v1PresetDefault" data-preset-default="' + item.id + '"' + (item.id === state.defaultPresetId ? ' checked' : '') + ' /></td>',
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

    function wireScanDefaultsTool(rootEl) {
      var root = rootEl && typeof rootEl.querySelector === "function"
        ? rootEl
        : document.getElementById("v1ToolDetail");
      if (!root) return;
      if (!root.querySelector("[data-scan-defaults-form]")) return;

      var DEFAULTS_KEY = "netrecon_scan_defaults_v1";
      var RECOMMENDED_DEFAULTS = {
        timeoutMs: 1000,
        concurrency: 128,
      };

      function sanitizeDefaults(value) {
        var next = Object.assign({}, RECOMMENDED_DEFAULTS, value || {});
        var timeout = Number(next.timeoutMs);
        var concurrency = Number(next.concurrency);

        if (!Number.isFinite(timeout)) timeout = RECOMMENDED_DEFAULTS.timeoutMs;
        if (!Number.isFinite(concurrency)) concurrency = RECOMMENDED_DEFAULTS.concurrency;

        timeout = Math.max(200, Math.min(5000, Math.round(timeout)));
        concurrency = Math.max(1, Math.min(256, Math.round(concurrency)));

        return {
          timeoutMs: timeout,
          concurrency: concurrency,
        };
      }

      function readDefaults() {
        try {
          var raw = window.localStorage ? window.localStorage.getItem(DEFAULTS_KEY) : "";
          if (!raw) return Object.assign({}, RECOMMENDED_DEFAULTS);
          var parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object") {
            return Object.assign({}, RECOMMENDED_DEFAULTS);
          }
          return sanitizeDefaults(parsed);
        } catch (_) {
          return Object.assign({}, RECOMMENDED_DEFAULTS);
        }
      }

      function writeDefaults(next) {
        var safe = sanitizeDefaults(next);
        try {
          if (window.localStorage) {
            window.localStorage.setItem(DEFAULTS_KEY, JSON.stringify(safe));
          }
        } catch (_) {}

        try {
          document.dispatchEvent(new CustomEvent("newui:scan-defaults-changed", {
            detail: Object.assign({}, safe),
          }));
        } catch (_) {}

        return safe;
      }

      function setInputValues(state) {
        var timeoutInput = root.querySelector("#v1DefaultsTimeout");
        var concurrencyInput = root.querySelector("#v1DefaultsConcurrency");
        if (timeoutInput) timeoutInput.value = String(state.timeoutMs);
        if (concurrencyInput) concurrencyInput.value = String(state.concurrency);
      }

      function readInputs() {
        var timeoutInput = root.querySelector("#v1DefaultsTimeout");
        var concurrencyInput = root.querySelector("#v1DefaultsConcurrency");
        return sanitizeDefaults({
          timeoutMs: timeoutInput ? Number(timeoutInput.value) : RECOMMENDED_DEFAULTS.timeoutMs,
          concurrency: concurrencyInput ? Number(concurrencyInput.value) : RECOMMENDED_DEFAULTS.concurrency,
        });
      }

      setInputValues(readDefaults());

      if (root.dataset.scanDefaultsBound === "1") return;
      root.dataset.scanDefaultsBound = "1";

      root.addEventListener("click", function (event) {
        var button = event.target && typeof event.target.closest === "function"
          ? event.target.closest("[data-defaults-action]")
          : null;
        if (!button || !root.contains(button)) return;

        var action = button.getAttribute("data-defaults-action");
        if (!action) return;

        if (action === "save") {
          var next = writeDefaults(readInputs());
          setInputValues(next);
          if (setStatusLine) {
            setStatusLine(tr("defaultsSavedStatus") + " " + next.timeoutMs + "ms / c=" + next.concurrency);
          }
          return;
        }

        if (action === "restore") {
          var restored = writeDefaults(RECOMMENDED_DEFAULTS);
          setInputValues(restored);
          if (setStatusLine) setStatusLine(tr("defaultsRestoredStatus"));
        }
      });
    }

    return {
      wireVersionsTimeline: wireVersionsTimeline,
      wireResultsIpTable: wireResultsIpTable,
      wirePresetsTool: wirePresetsTool,
      wireScanDefaultsTool: wireScanDefaultsTool,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createPanelInteractionsRuntime = createPanelInteractionsRuntime;
})();
