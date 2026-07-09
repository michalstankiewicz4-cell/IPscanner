(function () {
  function createNavigationRuntime(deps) {
    var tr = deps.tr;
    var switchTool = deps.switchTool;
    var setStatusLine = deps.setStatusLine;
    var runMenuAction = deps.runMenuAction;
    var getScannerSidebarRuntime = deps.getScannerSidebarRuntime;
    var platform = deps.platform || ((window.NetReconNewUICore && window.NetReconNewUICore.platform) || {});

    // --- ip-scanner tool keys ---
    // Fallback tab order, scan data keys, and scan-engine state below are all
    // IP-Scanner-specific, not generic shell state.
    var sidebarFallbackOrder = ["scan-runner", "shellcraft-library", "shellcraft-inspector", "results-ip", "ip-library"];
    var SCAN_DEFAULTS_KEY = "netrecon_scan_defaults_v1";
    var SCAN_RESULTS_KEY = "netrecon_scan_results_v1";
    var SCAN_PROGRESS_KEY = "netrecon_scan_progress_v1";
    var hostFoundUnlisten = null;
    var scanProgressUnlisten = null;
    var scanInProgress = false;
    var MAX_ENRICH_CONCURRENCY = 8;
    var enrichQueue = [];
    var enrichInFlight = 0;
    var enrichPendingByIp = Object.create(null);
    var resultsRefreshTimer = 0;

    function getInvoke() {
      if (platform && typeof platform.getInvoke === "function") {
        return platform.getInvoke();
      }
      return null;
    }

    function emitBusyDelta(delta, processKey, processLabel, processLabelKey) {
      try {
        document.dispatchEvent(new CustomEvent("newui:busy-state", {
          detail: {
            source: "navigation-runtime",
            delta: delta,
            processKey: processKey || "",
            processLabel: processLabel || "",
            processLabelKey: processLabelKey || "",
          },
        }));
      } catch (_) {
        // ignore busy-state event errors
      }
    }

    function runPowerShell(command, processKey, processLabel, processLabelKey) {
      emitBusyDelta(1, processKey, processLabel, processLabelKey);

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
        emitBusyDelta(-1, processKey, processLabel, processLabelKey);
      });
    }

    function scriptInvokeCommand(scriptRelativePath) {
      return [
        "$ErrorActionPreference='Stop'",
        "$scriptPath = Join-Path (Get-Location) '" + String(scriptRelativePath || "") + "'",
        "if (!(Test-Path $scriptPath)) { throw \"Missing script: $scriptPath\" }",
        "& $scriptPath"
      ].join("; ");
    }

    // ip-scanner tool: detect-IP/subnet regex parsing + loader UI, used only
    // by bindScannerActions' detect buttons below.
    function firstIpv4(text) {
      var match = String(text || "").match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
      return match ? match[0] : "";
    }

    function firstCidr(text) {
      var match = String(text || "").match(/\b(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}\b/);
      return match ? match[0] : "";
    }

    function nowStamp() {
      var d = new Date();
      return d.toLocaleTimeString();
    }

    function stopDetectLoader(el) {
      if (!el) return;
      if (el.__detectLoaderTimerId) {
        window.clearInterval(el.__detectLoaderTimerId);
        el.__detectLoaderTimerId = 0;
      }
      el.classList.remove("is-loading");
      delete el.__detectLoaderStepIndex;
      delete el.__detectLoaderResetPending;
      el.innerHTML = "";
    }

    function setDetectResultText(el, text) {
      if (!el) return;
      stopDetectLoader(el);
      el.textContent = String(text || "");
    }

    function startDetectLoader(el) {
      if (!el) return;
      stopDetectLoader(el);

      var sequence = [0, 1, 2, 5, 4, 3];
      var dots = [];
      var loader = document.createElement("span");
      loader.className = "v1-detect-loader";

      for (var i = 0; i < 6; i += 1) {
        var dot = document.createElement("span");
        dot.className = "v1-detect-loader-dot";
        loader.appendChild(dot);
        dots.push(dot);
      }

      function clearDots() {
        dots.forEach(function (dotEl) {
          dotEl.classList.remove("is-active");
        });
      }

      function tick() {
        if (el.__detectLoaderResetPending) {
          clearDots();
          el.__detectLoaderStepIndex = 0;
          el.__detectLoaderResetPending = false;
          return;
        }

        var index = Number(el.__detectLoaderStepIndex || 0);
        var seq = sequence[index];
        if (dots[seq]) {
          dots[seq].classList.add("is-active");
        }

        index += 1;
        el.__detectLoaderStepIndex = index;
        if (index >= sequence.length) {
          el.__detectLoaderResetPending = true;
        }
      }

      el.classList.add("is-loading");
      el.appendChild(loader);
      el.__detectLoaderStepIndex = 0;
      el.__detectLoaderResetPending = false;
      tick();
      el.__detectLoaderTimerId = window.setInterval(tick, 200);
    }

    function appendPsConsole(line) {
      var out = document.getElementById("v1PsOutput");
      if (!out) return;
      out.textContent += String(line || "") + "\n";
      out.scrollTop = out.scrollHeight;
      document.dispatchEvent(new CustomEvent("newui:console-pane-update", {
        detail: {
          pane: "console",
          source: "scanner-sidebar",
          text: String(line || ""),
        },
      }));
    }

    // --- ip-scanner tool keys ---
    // scannerRuntime() through startScanWithCurrentSettings() (below) is the
    // entire scan engine: range/port parsing, host enrichment queue, scan
    // progress events. All ip-scanner tool, no shell mechanism in this block.
    function scannerRuntime() {
      return typeof getScannerSidebarRuntime === "function" ? getScannerSidebarRuntime() : null;
    }

    function readScanDefaults() {
      var defaults = { timeoutMs: 1000, concurrency: 128 };
      try {
        var raw = window.localStorage ? window.localStorage.getItem(SCAN_DEFAULTS_KEY) : "";
        if (!raw) return defaults;
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return defaults;

        var timeout = Number(parsed.timeoutMs);
        var concurrency = Number(parsed.concurrency);
        if (!Number.isFinite(timeout)) timeout = defaults.timeoutMs;
        if (!Number.isFinite(concurrency)) concurrency = defaults.concurrency;

        defaults.timeoutMs = Math.max(200, Math.min(5000, Math.round(timeout)));
        defaults.concurrency = Math.max(1, Math.min(256, Math.round(concurrency)));
        return defaults;
      } catch (_) {
        return defaults;
      }
    }

    function parsePortsCsv(csv) {
      var unique = Object.create(null);
      var values = String(csv || "")
        .split(",")
        .map(function (token) { return Number(String(token || "").trim()); })
        .filter(function (num) {
          if (!Number.isFinite(num)) return false;
          var asInt = Math.round(num);
          if (asInt < 1 || asInt > 65535) return false;
          if (unique[asInt]) return false;
          unique[asInt] = true;
          return true;
        })
        .map(function (num) { return Math.round(num); });

      return values;
    }

    function readScanResults() {
      try {
        var raw = window.localStorage ? window.localStorage.getItem(SCAN_RESULTS_KEY) : "";
        if (!raw) return [];
        var parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }

    function writeScanResults(rows) {
      try {
        if (!window.localStorage) return;
        window.localStorage.setItem(SCAN_RESULTS_KEY, JSON.stringify(Array.isArray(rows) ? rows : []));
      } catch (_) {}
    }

    function scheduleResultsRefresh() {
      if (resultsRefreshTimer) return;
      resultsRefreshTimer = window.setTimeout(function () {
        resultsRefreshTimer = 0;
        refreshResultsViewIfVisible();
      }, 140);
    }

    function emitScanProgress(detail) {
      writeScanProgressState(detail || {});
      try {
        document.dispatchEvent(new CustomEvent("newui:scan-progress", {
          detail: detail || {},
        }));
      } catch (_) {}
    }

    function writeScanProgressState(detail) {
      try {
        if (!window.localStorage) return;
        window.localStorage.setItem(SCAN_PROGRESS_KEY, JSON.stringify(detail || {}));
      } catch (_) {}
    }

    function countryCodeToFlag(code) {
      var normalized = String(code || "").trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(normalized)) return "-";
      var first = 127397 + normalized.charCodeAt(0);
      var second = 127397 + normalized.charCodeAt(1);
      return String.fromCodePoint(first, second);
    }

    function invokeCommand(command, payload) {
      var invoke = getInvoke();
      if (!invoke) return Promise.reject(new Error("tauri invoke unavailable"));

      try {
        if (platform && typeof platform.invoke === "function") {
          return Promise.resolve(platform.invoke(command, payload || {}));
        }
        return Promise.resolve(invoke(command, payload || {}));
      } catch (err) {
        return Promise.reject(err);
      }
    }

    function mutateScanRow(ip, mutator) {
      var keyIp = String(ip || "").trim();
      if (!keyIp) return;

      var rows = readScanResults();
      var idx = rows.findIndex(function (row) {
        return row && String(row.ip || "").trim() === keyIp;
      });
      if (idx < 0) return;

      var current = rows[idx] && typeof rows[idx] === "object" ? rows[idx] : {};
      var next = mutator(Object.assign({}, current));
      if (!next || typeof next !== "object") return;
      rows[idx] = next;
      writeScanResults(rows);
      scheduleResultsRefresh();
    }

    function resetEnrichmentState() {
      enrichQueue = [];
      enrichInFlight = 0;
      enrichPendingByIp = Object.create(null);
    }

    function performHostEnrichment(ip) {
      var keyIp = String(ip || "").trim();
      if (!keyIp) return Promise.resolve();

      return Promise.allSettled([
        invokeCommand("hostname_lookup", { ip: keyIp }),
        invokeCommand("geo_lookup", { ip: keyIp }),
      ]).then(function (results) {
        var hostnameResult = results[0] || {};
        var geoResult = results[1] || {};
        var hostname = hostnameResult.status === "fulfilled" ? String(hostnameResult.value || "").trim() : "";
        var geo = geoResult.status === "fulfilled" && geoResult.value && typeof geoResult.value === "object"
          ? geoResult.value
          : null;

        mutateScanRow(keyIp, function (row) {
          var normalized = Object.assign({}, row);
          normalized.hostname = hostname || normalized.hostname || "-";

          if (geo) {
            var countryCode = String(geo.country_code || geo.countryCode || "").trim();
            var isp = String(geo.isp || "").trim();
            var asInfo = String(geo.as_info || geo.as || "").trim();
            var deviceHints = [];
            if (geo.proxy === true) deviceHints.push("Proxy");
            if (geo.hosting === true) deviceHints.push("Hosting");

            if (countryCode) normalized.flag = countryCodeToFlag(countryCode);
            if (isp) normalized.isp = isp;
            if (asInfo) normalized.as = asInfo;
            if (deviceHints.length) normalized.deviceIdentification = deviceHints.join(" / ");
          }

          return normalized;
        });
      }).catch(function () {
        // ignore enrichment failures for individual hosts
      });
    }

    function drainEnrichmentQueue() {
      while (enrichInFlight < MAX_ENRICH_CONCURRENCY && enrichQueue.length) {
        var ip = enrichQueue.shift();
        if (!ip) continue;

        enrichInFlight += 1;
        performHostEnrichment(ip).finally(function () {
          enrichInFlight = Math.max(0, enrichInFlight - 1);
          drainEnrichmentQueue();
        });
      }
    }

    function queueHostEnrichment(ip) {
      var keyIp = String(ip || "").trim();
      if (!keyIp) return;
      if (enrichPendingByIp[keyIp]) return;

      enrichPendingByIp[keyIp] = true;
      enrichQueue.push(keyIp);
      drainEnrichmentQueue();
    }

    function clearScanResults() {
      resetEnrichmentState();
      writeScanResults([]);
    }

    function upsertHostResult(payload) {
      var ip = String(payload && payload.ip || "").trim();
      if (!ip) return;

      var openPorts = Array.isArray(payload && payload.open_ports)
        ? payload.open_ports.filter(function (port) {
            var value = Number(port);
            return Number.isFinite(value) && value >= 1 && value <= 65535;
          }).map(function (port) { return Math.round(Number(port)); })
        : [];

      var pingMs = Number(payload && payload.ping_ms);
      var pingLabel = Number.isFinite(pingMs) && pingMs >= 0 ? (String(Math.round(pingMs)) + " ms") : "-";

      var rows = readScanResults();
      var existing = rows.find(function (row) {
        return row && String(row.ip || "").trim() === ip;
      }) || {};
      var nextRow = {
        ip: ip,
        ping: pingLabel,
        hostname: String(existing.hostname || "-").trim() || "-",
        flag: String(existing.flag || "-").trim() || "-",
        isp: String(existing.isp || "-").trim() || "-",
        as: String(existing.as || "").trim(),
        deviceIdentification: String(existing.deviceIdentification || "").trim(),
        status: "active",
        statusClass: "is-up",
        ports: openPorts,
      };

      var idx = rows.findIndex(function (row) {
        return row && String(row.ip || "").trim() === ip;
      });

      if (idx >= 0) {
        rows[idx] = nextRow;
      } else {
        rows.push(nextRow);
      }

      rows.sort(function (a, b) {
        return String(a.ip || "").localeCompare(String(b.ip || ""), undefined, { numeric: true, sensitivity: "base" });
      });

      writeScanResults(rows);
      scheduleResultsRefresh();
      queueHostEnrichment(ip);
    }

    function getEventListen() {
      var tauri = window.__TAURI__ || {};
      if (tauri.event && typeof tauri.event.listen === "function") return tauri.event.listen;
      if (tauri.core && typeof tauri.core.listen === "function") return tauri.core.listen;
      if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.event && typeof window.__TAURI_INTERNALS__.event.listen === "function") {
        return window.__TAURI_INTERNALS__.event.listen;
      }
      return null;
    }

    function detachHostFoundListener() {
      var off = hostFoundUnlisten;
      hostFoundUnlisten = null;
      if (typeof off === "function") {
        try {
          off();
        } catch (_) {}
      }
    }

    function detachScanProgressListener() {
      var off = scanProgressUnlisten;
      scanProgressUnlisten = null;
      if (typeof off === "function") {
        try {
          off();
        } catch (_) {}
      }
    }

    function ipv4ToU32(ip) {
      var parts = String(ip || "").trim().split(".");
      if (parts.length !== 4) return null;
      var nums = parts.map(function (part) {
        if (!/^\d{1,3}$/.test(part)) return NaN;
        return Number(part);
      });
      if (nums.some(function (value) { return !Number.isFinite(value) || value < 0 || value > 255; })) {
        return null;
      }
      return (((nums[0] << 24) >>> 0) + (nums[1] << 16) + (nums[2] << 8) + nums[3]) >>> 0;
    }

    function estimateRangeTotal(fromIp, toIp) {
      var start = ipv4ToU32(fromIp);
      var end = ipv4ToU32(toIp);
      if (start == null || end == null || end < start) return 0;
      return (end - start + 1) >>> 0;
    }

    function setScanButtonsState(isBusy) {
      var startBtn = document.querySelector('[data-scanner-action="start"]');
      var stopBtn = document.querySelector('[data-scanner-action="stop"]');
      if (startBtn) startBtn.disabled = !!isBusy;
      if (stopBtn) stopBtn.disabled = !isBusy;
    }

    function refreshResultsViewIfVisible() {
      var activeTab = document.querySelector('.v1-tab.active[data-tool]');
      var activeTool = activeTab ? String(activeTab.getAttribute("data-tool") || "").trim() : "";
      if (!activeTool) return;

      if (switchTool && activeTool === "results-ip") {
        switchTool("results-ip");
      }
    }

    function startScanWithCurrentSettings() {
      var invoke = getInvoke();
      if (!invoke) {
        if (setStatusLine) setStatusLine(tr("statusDesktopOnlyShort"));
        return;
      }

      var runtime = scannerRuntime();
      var range = runtime && runtime.addCurrentRangeFromInputs
        ? runtime.addCurrentRangeFromInputs()
        : {
            from: (document.getElementById("v1ScanFrom") || {}).value || "0.0.0.0",
            to: (document.getElementById("v1ScanTo") || {}).value || "0.0.0.0",
          };
      var selectedPreset = runtime && runtime.getSelectedPreset
        ? runtime.getSelectedPreset()
        : null;
      var selectedPorts = selectedPreset ? String(selectedPreset.ports || "") : "";
      var selectedPresetLabel = selectedPreset ? String(selectedPreset.name || selectedPreset.id || "").trim() : "";
      var ports = parsePortsCsv(selectedPorts);
      var defaults = readScanDefaults();
      var estimatedTotal = estimateRangeTotal(range.from, range.to);

      if (!ports.length) {
        if (setStatusLine) setStatusLine(tr("statusExtractorNoInput"));
        return;
      }

      var eventListen = getEventListen();
      detachHostFoundListener();
      detachScanProgressListener();
      if (eventListen) {
        Promise.resolve(eventListen("scan-progress", function (evt) {
          var payload = evt && evt.payload ? evt.payload : evt;
          var processed = Number(payload && payload.processed);
          var total = Number(payload && payload.total);
          var found = Number(payload && payload.found);
          var done = !!(payload && payload.done);
          var stopped = !!(payload && payload.stopped);

          emitScanProgress({
            state: done ? (stopped ? "cancelled" : "done") : "update",
            processed: Number.isFinite(processed) ? Math.max(0, Math.round(processed)) : 0,
            total: Number.isFinite(total) ? Math.max(0, Math.round(total)) : 0,
            found: Number.isFinite(found) ? Math.max(0, Math.round(found)) : 0,
          });
        })).then(function (off) {
          if (typeof off === "function") {
            scanProgressUnlisten = off;
          }
        }).catch(function () {});

        Promise.resolve(eventListen("host-found", function (evt) {
          var payload = evt && evt.payload ? evt.payload : evt;
          upsertHostResult(payload);
        })).then(function (off) {
          if (typeof off === "function") {
            hostFoundUnlisten = off;
          }
        }).catch(function () {});
      }

      emitScanProgress({
        state: "start",
        processed: 0,
        total: estimatedTotal,
        found: 0,
      });

      clearScanResults();

      scanInProgress = true;
      emitBusyDelta(1, "scan-range", "Scan IP range", "statusProcScanRange");
      setScanButtonsState(true);

      if (setStatusLine) {
        var status = tr("statusScanStart") + " " + range.from + " - " + range.to;
        status += " | timeout=" + defaults.timeoutMs + "ms";
        status += " | c=" + defaults.concurrency;
        if (selectedPresetLabel) {
          status += " | " + tr("scannerPortPresets") + ": " + selectedPresetLabel + " (" + ports.length + ")";
        }
        setStatusLine(status);
      }

      var promise;
      try {
        promise = invokeCommand("scan_range", {
          fromIp: String(range.from || "").trim(),
          toIp: String(range.to || "").trim(),
          ports: ports,
          concurrency: defaults.concurrency,
          timeoutMs: defaults.timeoutMs,
        });
      } catch (err) {
        promise = Promise.reject(err);
      }

      Promise.resolve(promise).then(function (found) {
        var totalFound = Number(found);
        if (!Number.isFinite(totalFound)) totalFound = readScanResults().length;
        if (setStatusLine) setStatusLine(tr("statusScanStop") + " | hosts=" + String(Math.max(0, Math.round(totalFound))));
      }).catch(function (err) {
        var msg = err && err.message ? err.message : String(err || "scan error");
        emitScanProgress({
          state: "error",
        });
        if (setStatusLine) setStatusLine(tr("statusCommandFailed") + ": " + msg);
      }).finally(function () {
        scanInProgress = false;
        emitBusyDelta(-1, "scan-range", "Scan IP range", "statusProcScanRange");
        setScanButtonsState(false);
        detachHostFoundListener();
        detachScanProgressListener();
        emitScanProgress({
          state: "done",
        });
        refreshResultsViewIfVisible();
      });
    }

    function setSidebarTabOpen(tool, isOpen) {
      var wrap = document.querySelector('.v1-sidebar-tool-tab-wrap[data-sidebar-tab="' + tool + '"]');
      if (!wrap) return;
      wrap.classList.toggle("sidebar-tab-closed", !isOpen);
      if (isOpen) wrap.removeAttribute("hidden");
      else wrap.setAttribute("hidden", "hidden");
      syncLeftTabActivationInvariant();
    }

    function ensureSidebarTabOpen(tool) {
      if (!tool) return;
      setSidebarTabOpen(tool, true);
    }

    function setRightTabOpen(tool, isOpen) {
      var wrap = document.querySelector('.v1-right-tool-tab-wrap[data-right-tab="' + tool + '"]');
      if (!wrap) return false;
      wrap.classList.toggle("right-tab-closed", !isOpen);
      if (isOpen) wrap.removeAttribute("hidden");
      else wrap.setAttribute("hidden", "hidden");
      if (!isOpen) {
        if (wrap.classList.contains("is-right-active")) {
          wrap.classList.remove("is-right-active");
          setRightTabActive(firstOpenRightTab(tool));
        }
      }
      syncRightTabActivationInvariant();
      return true;
    }

    function ensureRightTabOpen(tool) {
      if (!tool) return false;
      return setRightTabOpen(tool, true);
    }

    function syncRightTabActivationInvariant() {
      var openTools = Array.from(document.querySelectorAll(".v1-right-tool-tab-wrap"))
        .filter(function (wrap) {
          return !wrap.classList.contains("right-tab-closed") && !wrap.hasAttribute("hidden");
        })
        .map(function (wrap) {
          return wrap.getAttribute("data-right-tab") || "";
        })
        .filter(Boolean);

      var rightbar = document.querySelector(".v1-rightbar");
      if (rightbar) {
        rightbar.classList.toggle("right-tabs-empty", openTools.length === 0);
      }

      if (!openTools.length) {
        setRightTabActive("");
        return;
      }

      var hasActive = Array.from(document.querySelectorAll(".v1-right-tool-tab-wrap.is-right-active")).some(function (wrap) {
        var tool = wrap.getAttribute("data-right-tab") || "";
        return openTools.indexOf(tool) >= 0;
      });
      if (!hasActive) {
        setRightTabActive(openTools[0]);
      }
    }

    function setRightTabActive(tool) {
      var nextTool = String(tool || "");
      document.querySelectorAll(".v1-right-tool-tab-wrap").forEach(function (wrap) {
        var wrapTool = wrap.getAttribute("data-right-tab") || "";
        wrap.classList.toggle("is-right-active", !!nextTool && wrapTool === nextTool);
      });
      document.querySelectorAll(".v1-right-tab").forEach(function (btn) {
        var btnTool = btn.getAttribute("data-v1-right-tab") || "";
        btn.classList.toggle("active", !!nextTool && btnTool === nextTool);
      });
      document.querySelectorAll(".v1-right-pane").forEach(function (pane) {
        pane.classList.toggle("active", pane.getAttribute("data-v1-right-pane") === nextTool);
      });
    }

    function firstOpenRightTab(excludedTool) {
      var wraps = Array.from(document.querySelectorAll(".v1-right-tool-tab-wrap"));
      var next = wraps.find(function (wrap) {
        if (wrap.classList.contains("right-tab-closed")) return false;
        if (wrap.hasAttribute("hidden")) return false;
        var tabTool = wrap.getAttribute("data-right-tab") || "";
        return tabTool && tabTool !== excludedTool;
      });
      return next ? (next.getAttribute("data-right-tab") || "") : "";
    }

    function activateSidebarTool(tool) {
      if (!tool) return;
      ensureSidebarTabOpen(tool);
      setLeftActiveTab(tool);
    }

    // ip-scanner tool: maps a left-sidebar tool id to the activity-bar button
    // (if any) that represents it, so the activity bar stays in sync with
    // whichever tool is active in the left sidebar, regardless of how it got
    // activated (activity-bar click, Tools menu, center-tab click, tab close).
    function activityForSidebarTool(tool) {
      if (tool === "results-ip") return "results";
      if (tool === "scan-runner" || tool === "ip-library") return "scanner";
      return "";
    }

    function syncScannerSidebarToolPanels(activeTool) {
      var selected = String(activeTool || "");
      document.querySelectorAll("[data-sidebar-tool-panel]").forEach(function (panel) {
        var panelTool = panel.getAttribute("data-sidebar-tool-panel") || "";
        panel.hidden = panelTool !== selected;
      });
    }

    function setLeftActiveTab(tool) {
      var nextTool = String(tool || "");
      document.querySelectorAll(".v1-sidebar-tool-tab-wrap").forEach(function (wrap) {
        var wrapTool = wrap.getAttribute("data-sidebar-tab") || "";
        wrap.classList.toggle("is-left-active", !!nextTool && wrapTool === nextTool);
      });
      document.querySelectorAll(".v1-sidebar-tool-tab").forEach(function (btn) {
        var btnTool = btn.getAttribute("data-tool") || "";
        btn.classList.toggle("is-left-active", !!nextTool && btnTool === nextTool);
        btn.classList.toggle("active", !!nextTool && btnTool === nextTool);
      });
      syncScannerSidebarToolPanels(nextTool);

      var activity = activityForSidebarTool(nextTool);
      document.querySelectorAll(".v1-activity [data-tool]").forEach(function (btn) {
        btn.classList.remove("active");
      });
      document.querySelectorAll(".v1-activity [data-activity]").forEach(function (btn) {
        if (activity && btn.getAttribute("data-activity") === activity) {
          btn.classList.add("active");
        }
      });
    }

    function syncLeftTabActivationInvariant() {
      var openTools = Array.from(document.querySelectorAll(".v1-sidebar-tool-tab-wrap"))
        .filter(function (wrap) {
          return !wrap.classList.contains("sidebar-tab-closed") && !wrap.hasAttribute("hidden");
        })
        .map(function (wrap) {
          return wrap.getAttribute("data-sidebar-tab") || "";
        })
        .filter(Boolean);

      if (!openTools.length) {
        setLeftActiveTab("");
        return;
      }

      if (openTools.length === 1) {
        setLeftActiveTab(openTools[0]);
        return;
      }

      var hasActive = Array.from(document.querySelectorAll(".v1-sidebar-tool-tab-wrap.is-left-active"))
        .some(function (wrap) {
          var tool = wrap.getAttribute("data-sidebar-tab") || "";
          return openTools.indexOf(tool) >= 0;
        });
      if (!hasActive) {
        setLeftActiveTab(openTools[0]);
      }
    }

    function isSidebarTabOpen(tool) {
      if (!tool) return false;
      var wrap = document.querySelector('.v1-sidebar-tool-tab-wrap[data-sidebar-tab="' + tool + '"]');
      if (!wrap) return false;
      if (wrap.classList.contains("sidebar-tab-closed")) return false;
      if (wrap.hasAttribute("hidden")) return false;
      return true;
    }

    function firstOpenSidebarTab(excludedTool) {
      var preferred = Array.isArray(sidebarFallbackOrder) ? sidebarFallbackOrder : [];
      for (var i = 0; i < preferred.length; i += 1) {
        var tool = preferred[i];
        if (!tool || tool === excludedTool) continue;
        if (isSidebarTabOpen(tool)) return tool;
      }

      var wraps = Array.from(document.querySelectorAll(".v1-sidebar-tool-tab-wrap"));
      var next = wraps.find(function (wrap) {
        if (wrap.classList.contains("sidebar-tab-closed")) return false;
        if (wrap.hasAttribute("hidden")) return false;
        var tabTool = wrap.getAttribute("data-sidebar-tab") || "";
        return tabTool && tabTool !== excludedTool;
      });
      return next ? (next.getAttribute("data-sidebar-tab") || "") : "";
    }

    // --- ip-scanner tool keys ---
    // Scanner action buttons (start/stop/clear/detect-ip/detect-subnets).
    function bindScannerActions() {
      document.querySelectorAll("[data-scanner-action]").forEach(function (item) {
        item.addEventListener("click", function () {
          var action = item.getAttribute("data-scanner-action");
          if (!action) return;

          if (action === "start") {
            startScanWithCurrentSettings();
            return;
          }
          if (action === "stop") {
            if (scanInProgress) {
              try {
                invokeCommand("stop_scan", {}).catch(function () {});
              } catch (_) {}
            }
            if (setStatusLine) setStatusLine(tr("statusScanStop"));
            return;
          }
          if (action === "clear") {
            clearScanResults();
            emitScanProgress({ state: "reset", processed: 0, total: 0, found: 0 });
            refreshResultsViewIfVisible();
            if (setStatusLine) setStatusLine(tr("statusScanClear"));
            return;
          }
          if (action === "scan-speed") {
            if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("tabScanDefaultsTitle"));
            if (switchTool) switchTool("scan-defaults");
          }
          if (action === "presets") {
            if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("scannerPortPresets"));
            if (switchTool) switchTool("presets");
          }

          if (action === "ext-ip") {
            var extEl = document.getElementById("v1DetectExtIp");
            var extBtn = document.getElementById("v1UseExtIp");
            if (!extEl) return;

            startDetectLoader(extEl);
            if (extBtn) extBtn.hidden = true;

            var psCmd = scriptInvokeCommand("scripts\\detect-external-ip.ps1");
            var invoke = getInvoke();

            if (!invoke) {
              setDetectResultText(extEl, tr("statusDesktopOnlyShort"));
              appendPsConsole("[" + nowStamp() + "] PS> " + psCmd);
              appendPsConsole("[" + nowStamp() + "] " + tr("statusDesktopOnlyShort"));
              if (setStatusLine) setStatusLine(tr("statusExternalIpDesktopOnly"));
              return;
            }

            appendPsConsole("[" + nowStamp() + "] PS> " + psCmd);
            runPowerShell(psCmd, "detect-external-ip", "Detect external IP", "statusProcDetectExternalIp").then(function (res) {
              var stdout = (res && res.stdout) ? String(res.stdout).trim() : "";
              var stderr = (res && res.stderr) ? String(res.stderr).trim() : "";
              var exitCode = (res && typeof res.exit_code === "number") ? res.exit_code : -1;
              var ip = firstIpv4(stdout);

              if (stdout) appendPsConsole(stdout);
              if (stderr) appendPsConsole(stderr);
              appendPsConsole("[" + nowStamp() + "] exit code: " + exitCode);

              if (!ip) {
                setDetectResultText(extEl, tr("statusErrorShort"));
                if (setStatusLine) setStatusLine(tr("statusExternalIpNoOutput"));
                return;
              }

              setDetectResultText(extEl, ip);
              if (extBtn) {
                extBtn.hidden = false;
                extBtn.onclick = function () {
                  var runtime = scannerRuntime();
                  return runtime && runtime.applyDetectedRange && runtime.applyDetectedRange(ip);
                };
              }
              if (setStatusLine) setStatusLine(tr("statusExternalIp") + " " + ip);
            }).catch(function () {
              setDetectResultText(extEl, tr("statusErrorShort"));
              appendPsConsole("[" + nowStamp() + "] " + tr("statusCommandFailed"));
              if (setStatusLine) setStatusLine(tr("statusExternalIpCommandFailed"));
            });
          }

          if (action === "local-ip") {
            var localEl = document.getElementById("v1DetectLocalIp");
            var localBtn = document.getElementById("v1UseLocalIp");
            if (!localEl) return;

            startDetectLoader(localEl);
            if (localBtn) localBtn.hidden = true;

            var psLocalCmd = scriptInvokeCommand("scripts\\detect-local-ip.ps1");
            var invoke = getInvoke();

            if (!invoke) {
              setDetectResultText(localEl, tr("statusDesktopOnlyShort"));
              appendPsConsole("[" + nowStamp() + "] PS> " + psLocalCmd);
              appendPsConsole("[" + nowStamp() + "] " + tr("statusDesktopOnlyShort"));
              if (setStatusLine) setStatusLine(tr("statusLocalIpDesktopOnly"));
              return;
            }

            appendPsConsole("[" + nowStamp() + "] PS> " + psLocalCmd);
            runPowerShell(psLocalCmd, "detect-local-ip", "Detect local IP", "statusProcDetectLocalIp").then(function (res) {
              var stdout = (res && res.stdout) ? String(res.stdout).trim() : "";
              var stderr = (res && res.stderr) ? String(res.stderr).trim() : "";
              var exitCode = (res && typeof res.exit_code === "number") ? res.exit_code : -1;
              var ip = firstIpv4(stdout);

              if (stdout) appendPsConsole(stdout);
              if (stderr) appendPsConsole(stderr);
              appendPsConsole("[" + nowStamp() + "] exit code: " + exitCode);

              if (!ip) {
                setDetectResultText(localEl, tr("statusErrorShort"));
                if (setStatusLine) setStatusLine(tr("statusLocalIpNoOutput"));
                return;
              }

              setDetectResultText(localEl, ip);
              if (localBtn) {
                localBtn.hidden = false;
                localBtn.onclick = function () {
                  var runtime = scannerRuntime();
                  return runtime && runtime.applyDetectedRange && runtime.applyDetectedRange(ip);
                };
              }
              if (setStatusLine) setStatusLine(tr("statusLocalIp") + " " + ip);
            }).catch(function () {
              setDetectResultText(localEl, tr("statusErrorShort"));
              appendPsConsole("[" + nowStamp() + "] " + tr("statusCommandFailed"));
              if (setStatusLine) setStatusLine(tr("statusLocalIpCommandFailed"));
            });
          }

          if (action === "subnets") {
            var subEl = document.getElementById("v1DetectSubnets");
            var subBtn = document.getElementById("v1UseSubnets");
            if (!subEl) return;

            startDetectLoader(subEl);
            if (subBtn) subBtn.hidden = true;

            var psSubnetCmd = scriptInvokeCommand("scripts\\detect-subnet-cidr.ps1");
            var invoke = getInvoke();

            if (!invoke) {
              setDetectResultText(subEl, tr("statusDesktopOnlyShort"));
              appendPsConsole("[" + nowStamp() + "] PS> " + psSubnetCmd);
              appendPsConsole("[" + nowStamp() + "] " + tr("statusDesktopOnlyShort"));
              if (setStatusLine) setStatusLine(tr("statusSubnetsDesktopOnly"));
              return;
            }

            appendPsConsole("[" + nowStamp() + "] PS> " + psSubnetCmd);
            runPowerShell(psSubnetCmd, "detect-subnets", "Detect subnets", "statusProcDetectSubnets").then(function (res) {
              var stdout = (res && res.stdout) ? String(res.stdout).trim() : "";
              var stderr = (res && res.stderr) ? String(res.stderr).trim() : "";
              var exitCode = (res && typeof res.exit_code === "number") ? res.exit_code : -1;
              var cidr = firstCidr(stdout);

              if (stdout) appendPsConsole(stdout);
              if (stderr) appendPsConsole(stderr);
              appendPsConsole("[" + nowStamp() + "] exit code: " + exitCode);

              if (!cidr) {
                var fallbackIp = firstIpv4(stdout);
                if (fallbackIp) {
                  var parts = fallbackIp.split(".");
                  cidr = parts[0] + "." + parts[1] + "." + parts[2] + ".0/24";
                }
              }

              if (!cidr) {
                setDetectResultText(subEl, tr("statusErrorShort"));
                if (setStatusLine) setStatusLine(tr("statusSubnetsNoOutput"));
                return;
              }

              setDetectResultText(subEl, cidr);
              if (subBtn) {
                subBtn.hidden = false;
                subBtn.onclick = function () {
                  var runtime = scannerRuntime();
                  return runtime && runtime.applyDetectedRange && runtime.applyDetectedRange(cidr);
                };
              }
              if (setStatusLine) setStatusLine(tr("statusSubnet") + " " + cidr);
            }).catch(function () {
              setDetectResultText(subEl, tr("statusErrorShort"));
              appendPsConsole("[" + nowStamp() + "] " + tr("statusCommandFailed"));
              if (setStatusLine) setStatusLine(tr("statusSubnetsCommandFailed"));
            });
          }

          if (action === "save" && runMenuAction) runMenuAction("save-session");
          if (action === "load" && runMenuAction) runMenuAction("load-session");
        });
      });
    }

    // shell dispatch mechanism with an embedded ip-scanner-specific special
    // case ("results-ip") below - not cleanly separable without restructuring.
    function bindResultTabs() {
      document.querySelectorAll("[data-result-tab]").forEach(function (item) {
        item.addEventListener("click", function () {
          var tool = item.getAttribute("data-result-tab");
          if (tool === "results-ip") { // ip-scanner tool
            activateSidebarTool("results-ip");
          }
          if (tool && switchTool) switchTool(tool);
          document.querySelectorAll("[data-result-tab]").forEach(function (el) {
            el.classList.toggle("active", el === item);
          });
        });
      });
    }

    // shell dispatch mechanism (activity bar clicks) with embedded
    // ip-scanner-specific special cases below - not cleanly separable
    // without restructuring. Only binds to the Results/Scanner buttons
    // (the only ones carrying data-activity); Topology/Globe are handled
    // generically by bindToolClicks()'s fromActivityRail branch below.
    function bindActivityButtons() {
      document.querySelectorAll(".v1-activity [data-activity]").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          var tool = btn.getAttribute("data-tool");

          // ip-scanner tool: Results activity should only affect the left panel.
          if (tool === "results-ip") {
            activateSidebarTool("results-ip");
            return;
          }

          // ip-scanner tool: Scanner activity should mirror Tools -> IP Scanner behavior.
          if (tool === "scan-runner") {
            ensureSidebarTabOpen("scan-runner");
            setLeftActiveTab("scan-runner");
            if (switchTool) switchTool("results-ip");
            return;
          }

          if (tool && switchTool) switchTool(tool);
        });
      });
    }

    function bindSidebarIntentEvents() {
      document.addEventListener("newui:sidebar-tab-intent-open", function (evt) {
        var detail = evt && evt.detail ? evt.detail : {};
        var tool = typeof detail.tool === "string" ? detail.tool : "";
        if (!tool) return;

        ensureSidebarTabOpen(tool);
        if (detail.activate !== false) {
          setLeftActiveTab(tool);
        }
      });
    }

    // shell: mirrors bindSidebarIntentEvents above, for the right panel -
    // lets callers without a direct navigation-runtime reference (e.g.
    // menu-runtime.js's extension-contributed Options-menu entries) open/
    // activate a dynamically-created right-panel tab by dispatching a plain
    // DOM event instead of needing a new dependency threaded through.
    function bindRightTabIntentEvents() {
      document.addEventListener("newui:right-tab-intent-open", function (evt) {
        var detail = evt && evt.detail ? evt.detail : {};
        var tool = typeof detail.tool === "string" ? detail.tool : "";
        if (!tool) return;

        if (ensureRightTabOpen(tool)) {
          setRightTabActive(tool);
        }
      });
    }

    // shell dispatch mechanism (generic [data-tool] click routing) with
    // several embedded ip-scanner-specific branches below (shellcraft,
    // results-ip, scan-runner/ip-library) - not cleanly separable without
    // restructuring.
    function bindToolClicks() {
      document.addEventListener("click", function (e) {
        if (e.target.closest(".v1-activity [data-activity]")) return;
        if (e.target.closest("[data-sidebar-tab-close]")) return;
        if (e.target.closest("[data-tab-close], [data-tab-popout]")) return;
        var target = e.target.closest("[data-tool]");
        if (!target) return;
        var tool = target.getAttribute("data-tool");
        if (!tool || !switchTool) return;
        var fromToolsMenu = !!target.closest('.v1-menu-group[data-menu="tools"]');
        var fromCenterTabs = !!target.closest(".v1-tabs");
        var fromLeftTabs = !!target.closest("#v1SidebarToolTabs");
        var fromActivityRail = !!target.closest(".v1-activity");

        if (fromActivityRail) {
          document.querySelectorAll(".v1-activity [data-tool]").forEach(function (btn) {
            btn.classList.toggle("active", btn === target);
          });
        }

        // Central tab clicks should only activate that tab.
        if (fromCenterTabs) {
          if (tool === "shellcraft") {
            ensureSidebarTabOpen("shellcraft-library");
            ensureSidebarTabOpen("shellcraft-inspector");
            setLeftActiveTab("shellcraft-library");
          }
          switchTool(tool);
          return;
        }

        // Left sidebar tab clicks should only switch/activate left tabs.
        if (fromLeftTabs) {
          activateSidebarTool(tool);
          return;
        }

        if (tool === "results-ip") {
          if (!fromToolsMenu && !fromCenterTabs) {
            activateSidebarTool("results-ip");
          } else if (fromToolsMenu) {
            ensureSidebarTabOpen("scan-runner");
            setLeftActiveTab("scan-runner");
          }
        } else if (tool === "scan-runner" || tool === "ip-library") {
          activateSidebarTool(tool);
        } else if (tool === "shellcraft") {
          ensureSidebarTabOpen("shellcraft-library");
          ensureSidebarTabOpen("shellcraft-inspector");
          setLeftActiveTab("shellcraft-library");
        }
        switchTool(tool);
      });
    }

    // shell dispatch mechanism (generic sidebar tab close) - fully generic,
    // no ip-scanner-specific id checks.
    function bindSidebarTabClosers() {
      document.addEventListener("click", function (e) {
        var close = e.target && e.target.closest ? e.target.closest("[data-sidebar-tab-close]") : null;
        if (!close) return;

        e.preventDefault();
        e.stopPropagation();

        var tool = close.getAttribute("data-tool") || "";
        if (!tool) return;

        setSidebarTabOpen(tool, false);

        var nextTool = firstOpenSidebarTab(tool);
        setLeftActiveTab(nextTool);
      });
    }

    function bindConsoleTabs() {
      function tabForPane(paneName) {
        return document.querySelector('.v1-console-tab[data-v1-console-tab="' + paneName + '"]');
      }

      function appendToTerminalMirror(detail) {
        var d = detail && typeof detail === "object" ? detail : {};
        var paneName = typeof d.pane === "string" && d.pane ? d.pane : "info";
        var source = typeof d.source === "string" && d.source ? d.source : "unknown";
        var mirrorToTerminal = d.mirrorToTerminal === true;
        var text = String(d.text || "").trim();
        if (!text) return;

        // Keep Console(info) and Terminal(console) separated by default.
        // Only explicitly opted-in events may be mirrored to terminal output.
        if (!mirrorToTerminal) {
          return;
        }

        // Console-pane producers already append to terminal output directly.
        if (paneName === "console") {
          return;
        }

        var out = document.getElementById("v1PsOutput");
        if (!out) return;

        var prefix = "[" + paneName + ":" + source + "] ";
        var line = prefix + text;
        var next = (out.textContent ? out.textContent + "\n" : "") + line;
        var rows = next.split("\n");
        out.textContent = rows.length > 400 ? rows.slice(rows.length - 400).join("\n") : next;
        out.scrollTop = out.scrollHeight;
      }

      function paneIsActive(paneName) {
        var pane = document.querySelector('.v1-console-pane[data-v1-console-pane="' + paneName + '"]');
        return !!pane && pane.classList.contains("active");
      }

      function markPaneUnread(paneName) {
        var tab = tabForPane(paneName);
        if (!tab || paneIsActive(paneName)) return;
        tab.classList.add("has-unread");
      }

      function clearPaneUnread(paneName) {
        var tab = tabForPane(paneName);
        if (!tab) return;
        tab.classList.remove("has-unread");
      }

      document.addEventListener("newui:console-pane-update", function (evt) {
        var detail = evt && evt.detail ? evt.detail : {};
        var paneName = typeof detail.pane === "string" && detail.pane ? detail.pane : "info";
        markPaneUnread(paneName);
        appendToTerminalMirror(detail);
      });

      document.querySelectorAll(".v1-console-tab").forEach(function (tab) {
        tab.addEventListener("click", function () {
          var next = tab.getAttribute("data-v1-console-tab");
          if (!next) return;
          document.querySelectorAll(".v1-console-tab").forEach(function (t) {
            t.classList.toggle("active", t === tab);
          });
          document.querySelectorAll(".v1-console-pane").forEach(function (pane) {
            pane.classList.toggle("active", pane.getAttribute("data-v1-console-pane") === next);
          });
          clearPaneUnread(next);
        });
      });

      document.querySelectorAll(".v1-console-pane.active").forEach(function (pane) {
        clearPaneUnread(pane.getAttribute("data-v1-console-pane") || "");
      });
    }

    function bindRightTabsAndAssistant() {
      document.querySelectorAll(".v1-right-tab").forEach(function (tab) {
        tab.addEventListener("click", function () {
          var next = tab.getAttribute("data-v1-right-tab");
          if (!next) return;

          setRightTabActive(next);
        });
      });

      document.querySelectorAll("[data-right-tab-close]").forEach(function (close) {
        close.addEventListener("click", function (evt) {
          evt.stopPropagation();
          var tab = close.getAttribute("data-tool");
          if (!tab) return;
          setRightTabOpen(tab, false);
        });
      });

      var chat = document.getElementById("v1AiChatHistory");
      var promptInput = document.getElementById("v1AiPromptInput");
      var sendBtn = document.getElementById("v1AiSendBtn");
      if (!chat || !promptInput) return;

      function currentMode() {
        var selected = document.querySelector('input[name="v1AiMode"]:checked');
        return selected ? selected.value : "ui";
      }

      function appendMessage(kind, text) {
        var msg = document.createElement("div");
        msg.className = "v1-ai-msg " + kind;
        msg.textContent = String(text || "");
        chat.appendChild(msg);
        chat.scrollTop = chat.scrollHeight;
      }

      document.querySelectorAll('input[name="v1AiMode"]').forEach(function (radio) {
        radio.addEventListener("change", function () {
          if (!radio.checked) return;
          var mode = currentMode() === "ps" ? "PS" : "UI";
          appendMessage("assistant", "Mode switched to " + mode + ".");
        });
      });

      function sendPrompt() {
        var prompt = (promptInput.value || "").trim();
        if (!prompt) return;

        var mode = currentMode();
        appendMessage("user", prompt);
        promptInput.value = "";

        if (mode === "ps") {
          appendMessage("assistant", "PS mode active: I will focus on PowerShell/console commands and terminal workflow.");
        } else {
          appendMessage("assistant", "UI mode active: I will focus on UI flows, panel actions, and visual workflow steps.");
        }
      }

      if (sendBtn) {
        sendBtn.addEventListener("click", sendPrompt);
      }
      promptInput.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        if (event.shiftKey) return;
        event.preventDefault();
        sendPrompt();
      });
    }

    function init() {
      setLeftActiveTab("");
      syncLeftTabActivationInvariant();
      setScanButtonsState(false);
      bindScannerActions();
      bindResultTabs();
      bindActivityButtons();
      bindSidebarIntentEvents();
      bindRightTabIntentEvents();
      bindToolClicks();
      bindSidebarTabClosers();
      bindConsoleTabs();
      bindRightTabsAndAssistant();
    }

    function getOpenLeftTools() {
      return Array.from(document.querySelectorAll(".v1-sidebar-tool-tab-wrap[data-sidebar-tab]"))
        .filter(function (wrap) {
          return !wrap.classList.contains("sidebar-tab-closed") && !wrap.hasAttribute("hidden");
        })
        .map(function (wrap) { return wrap.getAttribute("data-sidebar-tab"); })
        .filter(Boolean);
    }

    function getActiveLeftTool() {
      var wrap = document.querySelector(".v1-sidebar-tool-tab-wrap.is-left-active[data-sidebar-tab]");
      return wrap ? wrap.getAttribute("data-sidebar-tab") : null;
    }

    function getOpenRightTools() {
      return Array.from(document.querySelectorAll(".v1-right-tool-tab-wrap[data-right-tab]"))
        .filter(function (wrap) {
          return !wrap.classList.contains("right-tab-closed") && !wrap.hasAttribute("hidden");
        })
        .map(function (wrap) { return wrap.getAttribute("data-right-tab"); })
        .filter(Boolean);
    }

    function getActiveRightTool() {
      var wrap = document.querySelector(".v1-right-tool-tab-wrap.is-right-active[data-right-tab]");
      return wrap ? wrap.getAttribute("data-right-tab") : null;
    }

    return {
      init: init,
      getOpenLeftTools: getOpenLeftTools,
      getActiveLeftTool: getActiveLeftTool,
      getOpenRightTools: getOpenRightTools,
      getActiveRightTool: getActiveRightTool,
      setSidebarTabOpen: setSidebarTabOpen,
      ensureRightTabOpen: ensureRightTabOpen,
      setRightTabOpen: setRightTabOpen,
      setRightTabActive: setRightTabActive,
      syncLeftTabActivationInvariant: syncLeftTabActivationInvariant,
      syncRightTabActivationInvariant: syncRightTabActivationInvariant,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createNavigationRuntime = createNavigationRuntime;
})();
