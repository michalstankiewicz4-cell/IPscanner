(function () {
  var STEP_SEQUENCE = [0, 1, 2, 5, 4, 3];
  var STEP_MS = 200;

  function clearCells(cells) {
    cells.forEach(function (cell) {
      cell.classList.remove("is-active");
    });
  }

  function createStatusbarLoaderRuntime() {
    var i18n = window.NetReconNewUICore && window.NetReconNewUICore.i18n && window.NetReconNewUICore.i18n.createI18n
      ? window.NetReconNewUICore.i18n.createI18n()
      : null;

    function tr(key) {
      if (i18n && typeof i18n.t === "function") return i18n.t(key);
      return key;
    }

    var busyCount = 0;
    var processCount = 0;
    var progressPct = 0;
    var progressActive = false;
    var activeProcessMap = Object.create(null);
    var timerId = 0;
    var stepIndex = 0;
    var resetPending = false;

    function stop(cells) {
      if (timerId) {
        window.clearInterval(timerId);
        timerId = 0;
      }
      stepIndex = 0;
      resetPending = false;
      clearCells(cells);
    }

    function tick(cells) {
      if (resetPending) {
        clearCells(cells);
        stepIndex = 0;
        resetPending = false;
        return;
      }

      var seqIndex = STEP_SEQUENCE[stepIndex];
      var cell = cells[seqIndex];
      if (cell) {
        cell.classList.add("is-active");
      }
      stepIndex += 1;

      if (stepIndex >= STEP_SEQUENCE.length) {
        resetPending = true;
      }
    }

    function start(cells) {
      if (timerId) return;
      tick(cells);
      timerId = window.setInterval(function () {
        tick(cells);
      }, STEP_MS);
    }

    function applyBusyState(cells) {
      if (busyCount > 0 || progressActive) {
        start(cells);
      } else {
        stop(cells);
      }
    }

    function listActiveProcesses() {
      return Object.keys(activeProcessMap)
        .map(function (key) {
          var entry = activeProcessMap[key];
          return entry && entry.count > 0
            ? { key: key, label: String(entry.labelKey || "").trim() || String(entry.label || key), count: entry.count }
            : null;
        })
        .filter(function (entry) { return !!entry; });
    }

    function renderCount(countEl) {
      if (!countEl) return;
      var visibleCount = Math.max(0, busyCount);
      countEl.textContent = String(Math.max(0, visibleCount));
      countEl.classList.toggle("is-ok", visibleCount <= 1);
      countEl.classList.toggle("is-overload", visibleCount > 1);

      var active = listActiveProcesses();
      if (!active.length) {
        countEl.setAttribute("title", tr("statusProcNoActive"));
        return;
      }

      var lines = [tr("statusProcTooltipHeader")];
      active.forEach(function (entry) {
        lines.push("- " + tr(entry.label) + (entry.count > 1 ? (" x" + entry.count) : ""));
      });
      countEl.setAttribute("title", lines.join("\n"));
    }

    function renderProgress(progressBarEl, progressLabelEl) {
      var safePct = Math.max(0, Math.min(100, Math.round(progressPct)));
      if (progressBarEl) {
        progressBarEl.style.width = String(safePct) + "%";
      }
      if (progressLabelEl) {
        progressLabelEl.textContent = String(safePct) + "%";
      }
    }

    // Domain verification marker (4th item in the status bar's left group,
    // next to the loader/proc-count/progress bar - see cards.css's Domain
    // verification section and domain-verification-runtime.js). Shared
    // between this module's own startup call below and
    // panel-interactions-runtime.js's live keystroke handler on the
    // domain input field (Options > General), via
    // window.NetReconNewUICore.domainAuthStatusBar - one function, not two
    // copies of the same idle/authorised/unauthorised logic. With no
    // specific domain typed ("idle"), it now shows a SUMMARY (green if
    // any domain has ever been verified, white if none) rather than
    // always going blank white - that used to make the marker look wrong
    // immediately on launch even with domains already verified from a
    // previous session, since nothing gets typed into that field just by
    // opening the app.
    function updateDomainAuthMarker(domainInputValue) {
      var marker = document.getElementById("v1StatusDomainAuth");
      var api = window.NetReconNewUICore && window.NetReconNewUICore.domainVerification;
      if (!marker || !api) return;

      var typed = String(domainInputValue || "").trim();
      if (typed) {
        var authorised = api.isDomainVerified(typed);
        marker.className = "v1-status-domain-auth " + (authorised ? "is-authorised" : "is-unauthorised");
        marker.title = typed + ": " + tr(authorised ? "domainVerifyStatusAuthorised" : "domainVerifyStatusUnauthorised");
        return;
      }

      var state = api.getState();
      if (state.verifiedDomains && state.verifiedDomains.length > 0) {
        var names = state.verifiedDomains.map(function (d) { return d.domain; }).join(", ");
        marker.className = "v1-status-domain-auth is-authorised";
        marker.title = tr("domainVerifyStatusIdleVerified").replace("{domains}", names);
      } else {
        marker.className = "v1-status-domain-auth is-idle";
        marker.title = tr("domainVerifyStatusIdle");
      }
    }

    // Update-available marker (the ⓘ next to "active: X") - always visible,
    // unlike the domain-auth one above. Green/steady by default (matches
    // the markup's own .is-current class, so it reads right even before
    // this runs or if update checking is off); update-check-runtime.js
    // calls setOutdated() the moment its async check actually finds a
    // newer release, and setCurrent() again to confirm/refresh the
    // tooltip once a check completes without finding one.
    function setUpdateMarkerCurrent(versionLabel) {
      var marker = document.getElementById("v1StatusUpdateAvailable");
      if (!marker) return;
      marker.className = "v1-status-update-marker is-current";
      marker.title = tr("statusUpToDateTooltip").replace("{version}", versionLabel || "");
    }

    function setUpdateMarkerOutdated(tag) {
      var marker = document.getElementById("v1StatusUpdateAvailable");
      if (!marker) return;
      marker.className = "v1-status-update-marker is-outdated";
      marker.title = tr("statusUpdateAvailableTooltip").replace("{tag}", tag || "");
    }

    function init() {
      window.NetReconNewUICore = window.NetReconNewUICore || {};
      window.NetReconNewUICore.domainAuthStatusBar = { update: updateDomainAuthMarker };
      updateDomainAuthMarker("");
      document.addEventListener("newui:domain-verification-changed", function () {
        updateDomainAuthMarker("");
      });

      window.NetReconNewUICore.updateAvailableStatusBar = { setCurrent: setUpdateMarkerCurrent, setOutdated: setUpdateMarkerOutdated };
      setUpdateMarkerCurrent(window.NetReconNewUICore.APP_VERSION);

      var loader = document.getElementById("v1StatusLoader");
      if (!loader) return;
      var countEl = document.getElementById("v1StatusProcCount");
      var progressBarEl = document.getElementById("v1StatusProgressBar");
      var progressLabelEl = document.getElementById("v1StatusProgressLabel");

      var cells = Array.from(loader.querySelectorAll(".v1-status-loader-cell"));
      if (cells.length < 6) return;

      stop(cells);
      renderCount(countEl);
      renderProgress(progressBarEl, progressLabelEl);

      document.addEventListener("newui:busy-state", function (event) {
        var detail = event && event.detail ? event.detail : {};
        var processKey = String(detail.processKey || detail.source || "generic").trim() || "generic";
        var processLabel = String(detail.processLabel || detail.source || processKey).trim() || processKey;
        var processLabelKey = String(detail.processLabelKey || "").trim();

        if (typeof detail.delta === "number" && Number.isFinite(detail.delta)) {
          busyCount += detail.delta;

          if (!activeProcessMap[processKey]) {
            activeProcessMap[processKey] = { label: processLabel, labelKey: processLabelKey, count: 0 };
          }
          activeProcessMap[processKey].label = processLabel;
          if (processLabelKey) {
            activeProcessMap[processKey].labelKey = processLabelKey;
          }
          activeProcessMap[processKey].count += detail.delta;
          if (activeProcessMap[processKey].count <= 0) {
            delete activeProcessMap[processKey];
          }
        } else if (typeof detail.busy === "boolean") {
          busyCount = detail.busy ? Math.max(1, busyCount) : 0;
          if (!detail.busy) {
            activeProcessMap = Object.create(null);
          }
        }

        if (busyCount < 0) busyCount = 0;
        applyBusyState(cells);
        renderCount(countEl);
      });

      document.addEventListener("newui:scan-progress", function (event) {
        var detail = event && event.detail ? event.detail : {};
        var state = String(detail.state || "").toLowerCase();

        if (state === "start") {
          progressActive = true;
          processCount = 0;
          progressPct = 0;
        }

        if (state === "reset") {
          progressActive = false;
          processCount = 0;
          progressPct = 0;
        }

        if (typeof detail.processed === "number" && Number.isFinite(detail.processed)) {
          processCount = Math.max(0, Math.round(detail.processed));
        }

        if (typeof detail.total === "number" && Number.isFinite(detail.total) && detail.total > 0) {
          progressPct = (Math.max(0, processCount) / detail.total) * 100;
        }

        if (state === "done" || state === "cancelled" || state === "error") {
          progressActive = false;
          if (state === "done" && progressPct > 0) {
            progressPct = 100;
          }
        }

        applyBusyState(cells);
        renderCount(countEl);
        renderProgress(progressBarEl, progressLabelEl);
      });

      window.addEventListener("netrecon:language-changed", function () {
        renderCount(countEl);
      });
    }

    return {
      init: init,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createStatusbarLoaderRuntime = createStatusbarLoaderRuntime;

  var runtime = createStatusbarLoaderRuntime();
  if (runtime && typeof runtime.init === "function") {
    runtime.init();
  }
})();
