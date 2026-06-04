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
            point.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
          }
        });

        root.querySelectorAll("[data-version-entry-index]").forEach(function (section) {
          var isCurrent = Number(section.getAttribute("data-version-entry-index")) === safeIndex;
          section.classList.toggle("is-active", isCurrent);
          if (isCurrent) {
            var nextTop = Math.max(0, section.offsetTop - 8);
            versionsList.scrollTo({ top: nextTop, behavior: "smooth" });
          }
        });
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
        root.addEventListener("click", function (event) {
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

          portsRows.forEach(function (portsRow) {
            if (nextExpanded) {
              portsRow.removeAttribute("hidden");
            } else {
              portsRow.setAttribute("hidden", "hidden");
            }
          });
        });
      });

      syncResultButtonsState();
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

    return {
      wireVersionsTimeline: wireVersionsTimeline,
      wireResultsIpTable: wireResultsIpTable,
      wirePresetsTool: wirePresetsTool,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createPanelInteractionsRuntime = createPanelInteractionsRuntime;
})();
