(function () {
  function createPanelInteractionsRuntime(deps) {
    var versionsData = Array.isArray(deps.versionsData) ? deps.versionsData : [];

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

    return {
      wireVersionsTimeline: wireVersionsTimeline,
      wireResultsIpTable: wireResultsIpTable,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createPanelInteractionsRuntime = createPanelInteractionsRuntime;
})();
