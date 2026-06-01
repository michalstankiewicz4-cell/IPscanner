(function () {
  function createPanelInteractionsRuntime(deps) {
    var versionsData = Array.isArray(deps.versionsData) ? deps.versionsData : [];
    var tr = typeof deps.tr === "function" ? deps.tr : function (key) { return key; };
    var setStatusLine = typeof deps.setStatusLine === "function" ? deps.setStatusLine : null;

    function wireVersionsTimeline() {
      var root = document.getElementById("v1ToolDetail");
      if (!root) return;

      var track = document.getElementById("v1VersionTrack");
      var versionsList = document.getElementById("v1VersionsList");
      var physics = document.getElementById("v1VersionPhysics");
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
            section.scrollIntoView({ behavior: "smooth", block: "nearest" });
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

    function wireResultsIpTable() {
      var root = document.getElementById("v1ToolDetail");
      if (!root) return;

      root.querySelectorAll("[data-open-ports]").forEach(function (button) {
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";

        button.addEventListener("click", function () {
          var rowId = button.getAttribute("data-open-ports");
          var portsRow = root.querySelector('[data-ports-row="' + rowId + '"]');
          if (!portsRow) return;

          var expanded = button.getAttribute("aria-expanded") === "true";
          var nextExpanded = !expanded;
          button.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
          button.textContent = nextExpanded ? "−" : "+";

          if (nextExpanded) {
            portsRow.removeAttribute("hidden");
          } else {
            portsRow.setAttribute("hidden", "hidden");
          }
        });
      });
    }

    function wirePresetsTool() {
      var root = document.getElementById("v1ToolDetail");
      if (!root) return;
      if (!root.querySelector(".v1-presets-shell")) return;

      var core = window.NetReconNewUICore || {};
      var presetsApi = core.presets;
      if (!presetsApi || typeof presetsApi.getState !== "function" || typeof presetsApi.replaceState !== "function") return;

      var listEl = root.querySelector(".v1-presets-list");
      var nameEl = document.getElementById("v1PresetName");
      var portsEl = document.getElementById("v1PresetPorts");
      if (!listEl || !nameEl || !portsEl) return;

      var selectedPresetId = null;

      function cloneState(state) {
        return {
          defaultPresetId: String((state && state.defaultPresetId) || ""),
          presets: (state && Array.isArray(state.presets) ? state.presets : []).map(function (item) {
            return {
              id: String((item && item.id) || "").trim(),
              name: String((item && item.name) || "").trim(),
              ports: String((item && item.ports) || "").trim(),
            };
          })
        };
      }

      function getState() {
        return cloneState(presetsApi.getState());
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
          listEl.innerHTML = "";
          nameEl.value = "";
          portsEl.value = "";
          selectedPresetId = null;
          return;
        }

        selectedPresetId = selected.id;
        listEl.innerHTML = "";
        presets.forEach(function (item) {
          var li = document.createElement("li");
          li.className = "v1-presets-item";
          li.setAttribute("data-preset-id", item.id);
          li.textContent = item.name;
          if (item.id === selectedPresetId) {
            li.classList.add("active");
            li.setAttribute("aria-selected", "true");
          }
          if (item.id === state.defaultPresetId) {
            li.setAttribute("title", "Default preset");
          }
          listEl.appendChild(li);
        });

        nameEl.value = selected.name;
        portsEl.value = selected.ports;
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

      listEl.addEventListener("click", function (event) {
        var itemEl = event.target.closest("[data-preset-id]");
        if (!itemEl) return;
        selectedPresetId = itemEl.getAttribute("data-preset-id") || "";
        renderFromState(getState());
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
              var rawId = sanitizeId(nameEl.value) || "preset";
              var uniqueId = rawId;
              var suffix = 2;
              while (next.presets.some(function (entry) { return entry.id === uniqueId; })) {
                uniqueId = rawId + "-" + String(suffix);
                suffix += 1;
              }

              next.presets.push({
                id: uniqueId,
                name: String(nameEl.value || "New preset").trim() || "New preset",
                ports: String(portsEl.value || "").trim(),
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

          if (action === "set-default") {
            persistWith(function (next) {
              if (!selected.id) return null;
              next.defaultPresetId = selected.id;
              selectedPresetId = selected.id;
              return next;
            }, "Default preset set");
            return;
          }

          if (action === "save") {
            persistWith(function (next) {
              var idx = next.presets.findIndex(function (entry) { return entry.id === selected.id; });
              if (idx < 0) return null;
              next.presets[idx].name = String(nameEl.value || "").trim() || next.presets[idx].name;
              next.presets[idx].ports = String(portsEl.value || "").trim();
              selectedPresetId = next.presets[idx].id;
              return next;
            }, "Preset saved");
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
