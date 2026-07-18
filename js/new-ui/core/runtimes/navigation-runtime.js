(function () {
  function createNavigationRuntime(deps) {
    var tr = deps.tr;
    var switchTool = deps.switchTool;
    var setStatusLine = deps.setStatusLine;
    var runMenuAction = deps.runMenuAction;
    var getScannerSidebarRuntime = deps.getScannerSidebarRuntime;
    var refreshDetachedTool = deps.refreshDetachedTool;
    var platform = deps.platform || ((window.NetReconNewUICore && window.NetReconNewUICore.platform) || {});
    var sharedNet = window.NetReconNewUICore && window.NetReconNewUICore.utils
      ? window.NetReconNewUICore.utils.net
      : null;
    var tabRegistry = window.NetReconNewUICore && window.NetReconNewUICore.tabRegistry;
    var shellcraftInspectorClosedByUser = false;

    function lookupPortService(port) {
      return sharedNet && typeof sharedNet.lookupPortService === "function"
        ? sharedNet.lookupPortService(port)
        : "";
    }

    // --- ip-scanner tool keys ---
    // Fallback tab order, scan data keys, and scan-engine state below are all
    // IP-Scanner-specific, not generic shell state.
    var sidebarFallbackOrder = ["scan-runner", "shellcraft-library", "results-ip", "ip-library"];
    var SCAN_DEFAULTS_KEY = "netrecon_scan_defaults_v1";
    var CONFIG_FORM_STATE_KEY = "netrecon_scanner_config_form_v1";
    var SCAN_RESULTS_KEY = "netrecon_scan_results_v1";
    var SCAN_PROGRESS_KEY = "netrecon_scan_progress_v1";
    var hostFoundUnlisten = null;
    var scanProgressUnlisten = null;
    var scanInProgress = false;
    var MAX_ENRICH_CONCURRENCY = 8;
    var enrichQueue = [];
    var enrichInFlight = 0;
    var enrichPendingByIp = Object.create(null);
    var currentScanEnrichmentConfig = null;
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

    // Inlined verbatim from scripts/detect-*.ps1 (kept byte-identical - see
    // those files for the human-readable originals). Previously these ran
    // via `Join-Path (Get-Location) 'scripts\...'`, which only resolved
    // correctly when a scripts/ folder happened to sit near the process's
    // working directory - true during dev, but a portable release (built
    // with `tauri build --no-bundle`, which skips tauri.conf.json's
    // bundle.resources copy step entirely) ships as a single bare .exe with
    // no scripts/ folder anywhere nearby, so this always threw "Missing
    // script" for portable-build users. Inlining removes the file
    // dependency entirely - same technique the addon system's inline
    // "powershell"-type commands already use.
    function detectExternalIpCommand() {
      return [
        "$ErrorActionPreference = 'Stop'",
        "",
        "$ip = (Invoke-RestMethod -UseBasicParsing 'https://api.ipify.org').ToString().Trim()",
        "if (-not $ip) {",
        "  throw 'No external IP detected'",
        "}",
        "",
        "$ip",
      ].join("\n");
    }

    function detectLocalIpCommand() {
      return [
        "$ErrorActionPreference = 'Stop'",
        "",
        "$ip = (",
        "  Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |",
        "  Where-Object {",
        "    $_.IPAddress -notmatch '^(127\\.|169\\.254\\.)' -and",
        "    $_.InterfaceAlias -notmatch 'Loopback'",
        "  } |",
        "  Select-Object -First 1 -ExpandProperty IPAddress",
        ")",
        "",
        "if (-not $ip) {",
        "  $ip = (",
        "    ipconfig |",
        "    Select-String 'IPv4 Address|Adres IPv4' |",
        "    ForEach-Object { $_.ToString().Split(':')[-1].Trim() } |",
        "    Where-Object { $_ -and $_ -notmatch '^(127\\.|169\\.254\\.)' } |",
        "    Select-Object -First 1",
        "  )",
        "}",
        "",
        "if (-not $ip) {",
        "  throw 'No local IPv4 detected'",
        "}",
        "",
        "$ip",
      ].join("\n");
    }

    function detectSubnetCidrCommand() {
      return [
        "$ErrorActionPreference = 'Stop'",
        "",
        "$entry = (",
        "  Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |",
        "  Where-Object {",
        "    $_.IPAddress -notmatch '^(127\\.|169\\.254\\.)' -and",
        "    $_.InterfaceAlias -notmatch 'Loopback'",
        "  } |",
        "  Select-Object -First 1",
        ")",
        "",
        "if ($entry) {",
        "  $oct = $entry.IPAddress.Split('.')",
        "  \"$($oct[0]).$($oct[1]).$($oct[2]).0/$($entry.PrefixLength)\"",
        "  exit 0",
        "}",
        "",
        "$ip = (",
        "  ipconfig |",
        "  Select-String 'IPv4 Address|Adres IPv4' |",
        "  ForEach-Object { $_.ToString().Split(':')[-1].Trim() } |",
        "  Where-Object { $_ -and $_ -notmatch '^(127\\.|169\\.254\\.)' } |",
        "  Select-Object -First 1",
        ")",
        "",
        "if (-not $ip) {",
        "  throw 'No subnet CIDR detected'",
        "}",
        "",
        "$oct = $ip.Split('.')",
        "\"$($oct[0]).$($oct[1]).$($oct[2]).0/24\"",
      ].join("\n");
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

    // Reads the RS Config tab's generic autosaved snapshot (written by
    // scanner-sidebar-runtime.js's initConfigFormAutosave(), independent of
    // any named profile - see CONFIG_FORM_STATE_KEY there) and maps it to
    // the subset of fields the scan engine actually consumes. Booleans
    // default to false, matching this session's "TCP Connect + rest
    // unchecked" fresh-install defaults.
    function readConfigFormSnapshot() {
      var snapshot = {
        retries: 1,
        scanDelayMs: 0,
        maxConcurrentPorts: 64,
        randomizePorts: false,
        randomizeHosts: false,
        reverseDns: false,
        countryFlag: false,
        isp: false,
        as: false,
        deviceIdentification: false,
        tcpEnabled: true,
        tcpSynMode: false,
        udpChecked: false,
        icmpChecked: false,
      };
      try {
        var raw = window.localStorage ? window.localStorage.getItem(CONFIG_FORM_STATE_KEY) : "";
        if (!raw) return snapshot;
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return snapshot;

        var retries = Number(parsed.v1ConfigRetries);
        if (Number.isFinite(retries)) snapshot.retries = Math.max(0, Math.min(10, Math.round(retries)));

        var scanDelay = Number(parsed.v1ConfigScanDelay);
        if (Number.isFinite(scanDelay)) snapshot.scanDelayMs = Math.max(0, Math.min(5000, Math.round(scanDelay)));

        var maxPorts = Number(parsed.v1ConfigMaxConcurrentPorts);
        if (Number.isFinite(maxPorts)) snapshot.maxConcurrentPorts = Math.max(1, Math.min(512, Math.round(maxPorts)));

        snapshot.randomizePorts = !!parsed.v1ConfigRandomizePorts;
        snapshot.randomizeHosts = !!parsed.v1ConfigRandomizeHosts;
        snapshot.reverseDns = !!parsed.v1ConfigReverseDns;
        snapshot.countryFlag = !!parsed.v1ConfigCountryFlag;
        snapshot.isp = !!parsed.v1ConfigIsp;
        snapshot.as = !!parsed.v1ConfigAs;
        snapshot.deviceIdentification = !!parsed.v1ConfigDeviceIdentification;
        snapshot.tcpEnabled = parsed.v1ConfigProtocolTcpEnabled !== false;
        snapshot.tcpSynMode = !!parsed.v1ConfigProtocolTcpSyn;
        snapshot.udpChecked = !!parsed.v1ConfigProtocolUdp;
        snapshot.icmpChecked = !!parsed.v1ConfigProtocolIcmp;

        return snapshot;
      } catch (_) {
        return snapshot;
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

      // Gated by the RS Config tab's Detect/Host Enrichment checkboxes
      // (captured once per scan in currentScanEnrichmentConfig, set by
      // startScanWithCurrentSettings()) - hostname_lookup/geo_lookup used to
      // run unconditionally for every found host regardless of these
      // checkboxes; skip whichever Rust call(s) nothing needs.
      var cfg = currentScanEnrichmentConfig || {
        reverseDns: false, countryFlag: false, isp: false, as: false, deviceIdentification: false,
      };
      var needsHostname = cfg.reverseDns;
      var needsGeo = cfg.countryFlag || cfg.isp || cfg.as || cfg.deviceIdentification;
      if (!needsHostname && !needsGeo) return Promise.resolve();

      return Promise.allSettled([
        needsHostname ? invokeCommand("hostname_lookup", { ip: keyIp }) : Promise.resolve(null),
        needsGeo ? invokeCommand("geo_lookup", { ip: keyIp }) : Promise.resolve(null),
      ]).then(function (results) {
        var hostnameResult = results[0] || {};
        var geoResult = results[1] || {};
        var hostname = needsHostname && hostnameResult.status === "fulfilled" ? String(hostnameResult.value || "").trim() : "";
        var geo = needsGeo && geoResult.status === "fulfilled" && geoResult.value && typeof geoResult.value === "object"
          ? geoResult.value
          : null;

        mutateScanRow(keyIp, function (row) {
          var normalized = Object.assign({}, row);
          if (needsHostname) normalized.hostname = hostname || normalized.hostname || "-";

          if (geo) {
            var countryCode = String(geo.country_code || geo.countryCode || "").trim();
            var isp = String(geo.isp || "").trim();
            var asInfo = String(geo.as_info || geo.as || "").trim();
            var deviceHints = [];
            if (geo.proxy === true) deviceHints.push("Proxy");
            if (geo.hosting === true) deviceHints.push("Hosting");

            if (cfg.countryFlag && countryCode) normalized.flag = countryCodeToFlag(countryCode);
            if (cfg.isp && isp) normalized.isp = isp;
            if (cfg.as && asInfo) normalized.as = asInfo;
            if (cfg.deviceIdentification && deviceHints.length) normalized.deviceIdentification = deviceHints.join(" / ");
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
        ? payload.open_ports.map(function (entry) {
            var rawPort = entry && typeof entry === "object" ? entry.port : entry;
            var value = Number(rawPort);
            if (!Number.isFinite(value) || value < 1 || value > 65535) return null;
            var rounded = Math.round(value);
            var ms = entry && typeof entry === "object" ? Number(entry.ms) : NaN;
            var protocol = entry && typeof entry === "object" && entry.protocol ? String(entry.protocol) : "TCP";
            var status = entry && typeof entry === "object" && entry.status ? String(entry.status) : "open";
            return {
              port: rounded,
              protocol: protocol,
              status: status,
              service: lookupPortService(rounded),
              ping: Number.isFinite(ms) && ms >= 0 ? (String(Math.round(ms)) + " ms") : "-",
            };
          }).filter(Boolean)
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
      // Docked: results-ip only re-renders (via switchTool -> refreshActiveUI)
      // if it's the active tab. Detached: it's a separate floating card with
      // no "active tab" of its own, and switchTool()'s detached branch only
      // brings it to front without rebuilding content - so it needs its own
      // explicit refresh, independent of whichever tab is active in the dock.
      if (typeof refreshDetachedTool === "function") {
        refreshDetachedTool("results-ip");
      }

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

      // TCP/UDP/ICMP are independent, additive protocol checkboxes in
      // Config's Protocol section now (icmpChecked used to be its own
      // exclusive "Ports vs ICMP" mode in scan-runner - moved here so a
      // single scan can report open ports AND a real ICMP ping together).
      // TCP SYN needs raw sockets/admin rights (ICMP avoided that by using
      // the Windows IP Helper API instead, see scan_range/probe_host_icmp
      // in main.rs, but SYN scanning has no such no-admin equivalent) -
      // not implemented yet, so block rather than silently running a normal
      // TCP Connect scan under the SYN label.
      var configSnapshot = readConfigFormSnapshot();
      if (configSnapshot.tcpSynMode) {
        if (setStatusLine) setStatusLine(tr("statusTcpSynNotImplemented"));
        return;
      }

      if (!configSnapshot.tcpEnabled && !configSnapshot.udpChecked && !configSnapshot.icmpChecked) {
        if (setStatusLine) setStatusLine(tr("statusNoProtocolSelected"));
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

      if ((configSnapshot.tcpEnabled || configSnapshot.udpChecked) && !ports.length) {
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
        if ((configSnapshot.tcpEnabled || configSnapshot.udpChecked) && selectedPresetLabel) {
          status += " | " + tr("scannerPortPresets") + ": " + selectedPresetLabel + " (" + ports.length + ")";
        }
        if (configSnapshot.udpChecked) {
          status += " | " + tr("statusUdpAmbiguityNote");
          // UDP alone can never confirm a host is alive - "found" requires
          // a confirmed signal (see scan_range's found check in main.rs),
          // and most networks/devices silently drop unsolicited UDP
          // instead of rejecting it, so a UDP-only scan often reports
          // nothing at all even against a genuinely occupied range. TCP or
          // ICMP alongside it gives real host-presence confirmation.
          if (!configSnapshot.tcpEnabled && !configSnapshot.icmpChecked) {
            status += " | " + tr("statusUdpAloneNote");
          }
        }
        setStatusLine(status);
      }

      currentScanEnrichmentConfig = configSnapshot;

      var promise;
      try {
        promise = invokeCommand("scan_range", {
          fromIp: String(range.from || "").trim(),
          toIp: String(range.to || "").trim(),
          ports: ports,
          concurrency: defaults.concurrency,
          timeoutMs: defaults.timeoutMs,
          retries: configSnapshot.retries,
          scanDelayMs: configSnapshot.scanDelayMs,
          maxConcurrentPorts: configSnapshot.maxConcurrentPorts,
          randomizePorts: configSnapshot.randomizePorts,
          randomizeHosts: configSnapshot.randomizeHosts,
          tcpChecked: configSnapshot.tcpEnabled,
          udpChecked: configSnapshot.udpChecked,
          icmpChecked: configSnapshot.icmpChecked,
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
      if (isOpen) tabRegistry.openTab("left", tool);
      else tabRegistry.closeTab("left", tool);
    }

    function ensureSidebarTabOpen(tool) {
      if (!tool) return;
      setSidebarTabOpen(tool, true);
    }

    function syncRightEmptyState() {
      var rightbar = document.querySelector(".v1-rightbar");
      if (rightbar) {
        rightbar.classList.toggle("right-tabs-empty", tabRegistry.getOpenTabs("right").length === 0);
      }
    }

    function setRightTabOpen(tool, isOpen) {
      if (isOpen) tabRegistry.openTab("right", tool);
      else tabRegistry.closeTab("right", tool);
      return true;
    }

    function ensureRightTabOpen(tool) {
      if (!tool) return false;
      return setRightTabOpen(tool, true);
    }

    function syncRightTabActivationInvariant() {
      syncRightEmptyState();
      tabRegistry.syncActivationInvariant("right");
    }

    function setRightTabActive(tool) {
      tabRegistry.setActiveTab("right", tool);
    }

    function firstOpenRightTab(excludedTool) {
      return tabRegistry.firstOpenTab("right", excludedTool);
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

    function setLeftActiveTab(tool) {
      tabRegistry.setActiveTab("left", tool);
    }

    // Section-aware open+activate for tools whose home section is now a
    // tool-catalog.js `ui` flag rather than a hardcoded assumption (scan-
    // runner/config, see activateGenericContent()'s "move" branch above) -
    // use this instead of hardcoding ensureSidebarTabOpen+setLeftActiveTab
    // (or the right-panel equivalents) so a flipped tool keeps opening
    // where it's actually configured to live, not where it used to.
    function activateToolInItsConfiguredSection(tool) {
      var catalogEntry = (window.NetReconNewUICore.toolCatalog || {})[tool];
      var ui = catalogEntry && catalogEntry.ui;
      if (ui && ui.showInRightPanel) {
        ensureRightTabOpen(tool);
        setRightTabActive(tool);
      } else if (ui && ui.showInLeftPanel) {
        ensureSidebarTabOpen(tool);
        setLeftActiveTab(tool);
      }
    }

    // Same idea, but open-only - doesn't steal the section's active tab.
    // Used for "config", which should just be available alongside scan-
    // runner (its old behavior was ensureRightTabOpen() only, never
    // setRightTabActive()) rather than yanking focus away from whatever
    // else the user had active in that section.
    function ensureToolOpenInItsConfiguredSection(tool) {
      var catalogEntry = (window.NetReconNewUICore.toolCatalog || {})[tool];
      var ui = catalogEntry && catalogEntry.ui;
      if (ui && ui.showInRightPanel) {
        ensureRightTabOpen(tool);
      } else if (ui && ui.showInLeftPanel) {
        ensureSidebarTabOpen(tool);
      }
    }

    function syncLeftTabActivationInvariant() {
      tabRegistry.syncActivationInvariant("left");
    }

    function isSidebarTabOpen(tool) {
      return tabRegistry.isTabOpen("left", tool);
    }

    function firstOpenSidebarTab(excludedTool) {
      return tabRegistry.firstOpenTab("left", excludedTool);
    }

    // Tracks, per section, which "move" tool's node (if any) is currently
    // shown there - needed because neither section's native pane-toggle can
    // reliably hide a reparented node (see activateGenericContent below),
    // so activateGenericContent has to explicitly hide the previous one
    // itself when switching to a different tool.
    var activeMovableNode = { left: null, right: null };

    // LS/RS "generic content slot": for tools with an entry in
    // tool-content-runtime.js (currently lorem-ipsum-left/-right,
    // shellcraft-library, shellcraft-inspector, results-ip's LS nav-list,
    // ip-library) render+
    // wire that entry into the section's ONE shared slot element; for
    // "move" entries (scan-runner/config/assistant - live DOM-only state
    // that regeneration would destroy) reparent their one persistent node
    // into this section's natural container instead (see tool-content-
    // runtime.js's makeMovableEntry). Visibility is NOT delegated to tab-
    // registry.js's native pane-toggle for these 3 - each section's native
    // toggle looks for its OWN identifying attribute/class
    // (data-sidebar-tool-panel vs .v1-right-pane[data-v1-right-pane]),
    // which the node only ever carries one of (whichever was its original
    // home), so a cross-section toggle call always no-ops. This function
    // manages visibility itself via inline style.display (wins by
    // specificity over both sections' CSS) instead. For every other tool
    // (versions/presets/general/about/license/topology/globe/import-tool/
    // language-manager/shellcraft - CS-only today, no tool-content-
    // runtime.js entry) fall back to CS's own already-proven
    // buildDetailHtml()/wireToolRuntime() (panel-content-runtime.js/
    // panels-runtime.js) - those already accept an arbitrary root (reused
    // for detached/floating tool windows), so this gets every CS tool
    // section-movable for free without a dedicated LS/RS render function
    // per tool. Returns nothing; called from both onActivate hooks below
    // with that section's id ("left"/"right") and slot element id.
    function activateGenericContent(tool, section, slotElId) {
      var slot = document.getElementById(slotElId);
      if (!slot) return;

      var contentRuntime = window.NetReconNewUICore && window.NetReconNewUICore.toolContentRuntime;
      var entry = contentRuntime && tool ? contentRuntime[tool] : null;
      var moveNode = entry && entry.move ? entry.getNode() : null;

      var previousMovableNode = activeMovableNode[section];
      if (previousMovableNode && previousMovableNode !== moveNode) {
        previousMovableNode.style.display = "none";
        activeMovableNode[section] = null;
      }

      if (moveNode) {
        var homeContainer = document.querySelector(section === "left" ? ".v1-sidebar" : ".v1-right-content");
        if (homeContainer && moveNode.parentElement !== homeContainer) {
          homeContainer.appendChild(moveNode);
        }
        moveNode.hidden = false;
        moveNode.style.display = entry.displayValue || "block";
        activeMovableNode[section] = moveNode;
        slot.style.display = "none";
        slot.innerHTML = "";
        return;
      }

      if (entry) {
        slot.innerHTML = entry.render ? entry.render(tr) : "";
        slot.style.display = "block";
        if (entry.wire) entry.wire(slot);
        return;
      }

      if (tool && window.NetReconNewUI && window.NetReconNewUI.buildDetailHtml) {
        slot.innerHTML = window.NetReconNewUI.buildDetailHtml(tool);
        slot.style.display = "block";
        if (window.NetReconNewUI.wireToolRuntime) window.NetReconNewUI.wireToolRuntime(tool, slot);
        return;
      }

      slot.style.display = "none";
      slot.innerHTML = "";
    }

    // Language switch: whichever migrated tool is currently active in LS/RS
    // (if any) needs its generic-content-slot HTML rebuilt with the new
    // tr() - unlike tab labels (retranslateSectionTabs(), text-only,
    // updated in place) this content was baked in at render time, so a
    // full re-render is simplest; harmless no-op for pinned tools (nothing
    // in the slot to refresh) or when nothing's active.
    function refreshActiveGenericContent() {
      activateGenericContent(tabRegistry.getActiveTab("left"), "left", "v1SidebarGenericContent");
      activateGenericContent(tabRegistry.getActiveTab("right"), "right", "v1RightGenericContent");
    }

    // Registers LS/RS with the shared tab-registry engine (tab-registry.js)
    // - each adapter describes that section's existing DOM/CSS conventions
    // (unchanged), each hook holds the section-specific extra behavior the
    // generic engine doesn't know about (activity-bar mirroring for LS, the
    // "right-tabs-empty" empty-state class for RS). Called once from init().
    function registerTabSections() {
      tabRegistry.registerSection(
        "left",
        {
          wrapSelector: '.v1-sidebar-tool-tab-wrap[data-sidebar-tab="{id}"]',
          wrapListSelector: ".v1-sidebar-tool-tab-wrap",
          idAttr: "data-sidebar-tab",
          closedClass: "sidebar-tab-closed",
          activeClass: "is-left-active",
          paneSelector: '[data-sidebar-tool-panel="{id}"]',
          paneVisibility: "hidden-attr",
          fallbackOrder: sidebarFallbackOrder,
          wrapClass: "v1-sidebar-tool-tab-wrap",
          buttonClass: "v1-sidebar-tool-tab",
          buttonIdAttr: "data-tool",
          closeClass: "v1-sidebar-tool-tab-close",
          closeFlagAttr: "data-sidebar-tab-close",
        },
        {
          onActivate: function (nextTool) {
            document.querySelectorAll(".v1-sidebar-tool-tab").forEach(function (btn) {
              var btnTool = btn.getAttribute("data-tool") || "";
              btn.classList.toggle("is-left-active", !!nextTool && btnTool === nextTool);
              btn.classList.toggle("active", !!nextTool && btnTool === nextTool);
            });

            activateGenericContent(nextTool, "left", "v1SidebarGenericContent");

            var activity = activityForSidebarTool(nextTool);
            document.querySelectorAll(".v1-activity [data-tool]").forEach(function (btn) {
              btn.classList.remove("active");
            });
            document.querySelectorAll(".v1-activity [data-activity]").forEach(function (btn) {
              if (activity && btn.getAttribute("data-activity") === activity) {
                btn.classList.add("active");
              }
            });
          },
        }
      );

      tabRegistry.registerSection(
        "right",
        {
          wrapSelector: '.v1-right-tool-tab-wrap[data-right-tab="{id}"]',
          wrapListSelector: ".v1-right-tool-tab-wrap",
          idAttr: "data-right-tab",
          closedClass: "right-tab-closed",
          activeClass: "is-right-active",
          paneSelector: '.v1-right-pane[data-v1-right-pane="{id}"]',
          paneVisibility: "active-class",
          paneActiveClass: "active",
          wrapClass: "v1-right-tool-tab-wrap",
          buttonClass: "v1-right-tab",
          buttonIdAttr: "data-v1-right-tab",
          closeClass: "v1-right-tool-tab-close",
          closeFlagAttr: "data-right-tab-close",
        },
        {
          onActivate: function (nextTool) {
            document.querySelectorAll(".v1-right-tab").forEach(function (btn) {
              var btnTool = btn.getAttribute("data-v1-right-tab") || "";
              btn.classList.toggle("active", !!nextTool && btnTool === nextTool);
            });
            activateGenericContent(nextTool, "right", "v1RightGenericContent");
          },
          onOpen: syncRightEmptyState,
          onClose: syncRightEmptyState,
        }
      );

      // "center" is registered for row RENDERING only (renderTabRowHtml/
      // renderSectionTabs/retranslateSectionTabs) - deliberately no hooks,
      // since CS keeps its own open/close/activate logic (switchTool/
      // closeToolTab in panels-runtime.js, unchanged) rather than routing
      // through openTab/closeTab/setActiveTab like left/right do. CS's
      // content-swap, detached/popout windows, and scroll-into-view are
      // tightly coupled to switchTool() in a way LS/RS's activation never
      // was - out of scope for this pass, see the plan.
      var escapeHtml = (window.NetReconNewUICore.utils && window.NetReconNewUICore.utils.dom && window.NetReconNewUICore.utils.dom.escapeHtml) || String;
      tabRegistry.registerSection("center", {
        wrapSelector: '.v1-tab[data-tool="{id}"]',
        wrapListSelector: ".v1-tab[data-tool]",
        idAttr: "data-tool",
        closedClass: "tab-closed",
        activeClass: "active",
        buildRow: function (id, icon, label, closeAria) {
          var iconSpan = '<span class="v1-tab-icon" aria-hidden="true">' + escapeHtml(icon) + "</span>";
          return (
            '<button class="v1-tab tab-closed" data-tool="' + id + '" type="button" hidden>' +
            iconSpan +
            '<span class="v1-tab-title">' + escapeHtml(label) + "</span>" +
            '<span class="v1-tab-close" data-tab-close="true" role="button" aria-label="' + escapeHtml(closeAria) + '" tabindex="-1">×</span>' +
            "</button>"
          );
        },
        retranslateRow: function (wrap, icon, label) {
          var titleEl = wrap.querySelector(".v1-tab-title");
          if (titleEl) titleEl.textContent = label;
        },
      });
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

            var psCmd = detectExternalIpCommand();
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

            var psLocalCmd = detectLocalIpCommand();
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

            var psSubnetCmd = detectSubnetCidrCommand();
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
    // Delegated (not per-element) so this keeps working for the LS
    // results-ip panel's 3-item nav list after it's regenerated by
    // tool-content-runtime.js's generic-content-slot mechanism - a
    // per-element bind here would only ever reach whichever copy existed
    // at the time init() ran, same class of bug RS's tab clicks had before
    // that got fixed (see bindRightTabsAndAssistant()).
    function bindResultTabs() {
      document.addEventListener("click", function (e) {
        var item = e.target && e.target.closest ? e.target.closest("[data-result-tab]") : null;
        if (!item) return;
        var tool = item.getAttribute("data-result-tab");
        if (tool === "results-ip") { // ip-scanner tool
          activateSidebarTool("results-ip");
        }
        if (tool && switchTool) switchTool(tool);
        document.querySelectorAll("[data-result-tab]").forEach(function (el) {
          el.classList.toggle("active", el === item);
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
            activateToolInItsConfiguredSection("scan-runner");
            ensureToolOpenInItsConfiguredSection("config");
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
            setLeftActiveTab("shellcraft-library");
            if (!shellcraftInspectorClosedByUser) {
              ensureRightTabOpen("shellcraft-inspector");
              setRightTabActive("shellcraft-inspector");
            }
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
            activateToolInItsConfiguredSection("scan-runner");
            ensureToolOpenInItsConfiguredSection("config");
          }
        } else if (tool === "scan-runner" || tool === "ip-library") {
          activateSidebarTool(tool);
        } else if (tool === "email-recon") {
          // 3 independent surfaces on one click (LS/CS/RS), same idea as
          // "lorem-ipsum" below - but open-only for RS (no
          // setRightTabActive), matching "config"'s precedent above: the
          // Sources/API-Keys/Profiles pane should be reachable without
          // stealing focus from whatever's already active in RS (e.g. AI
          // Assistant). Without this, closing "email-recon-config" once
          // left no way to ever reopen it - there was no button/menu
          // wired to it at all.
          activateSidebarTool("email-recon");
          ensureToolOpenInItsConfiguredSection("email-recon-config");
        } else if (tool === "shellcraft") {
          ensureSidebarTabOpen("shellcraft-library");
          setLeftActiveTab("shellcraft-library");
          if (!shellcraftInspectorClosedByUser) {
            ensureRightTabOpen("shellcraft-inspector");
            setRightTabActive("shellcraft-inspector");
          }
        } else if (tool === "lorem-ipsum") {
          // Placeholder tool: one click opens all three independent
          // surfaces (CS's own "lorem-ipsum" via switchTool() below, plus
          // its own separate lorem-ipsum-left/-right tool ids here - 3
          // distinct tools, not one id shared across sections).
          ensureSidebarTabOpen("lorem-ipsum-left");
          setLeftActiveTab("lorem-ipsum-left");
          ensureRightTabOpen("lorem-ipsum-right");
          setRightTabActive("lorem-ipsum-right");
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

    // shell: Down Section "Macro" console tab - a small, fixed list of
    // shortcuts, each reproducing an existing LS Detect-button click 1:1.
    function bindMacroConsolePane() {
      var outputEl = document.getElementById("v1MacroOutput");
      var inputEl = document.getElementById("v1MacroInput");
      if (!outputEl || !inputEl) return;

      var macrosApi = (window.NetReconNewUICore && window.NetReconNewUICore.macros) || null;
      if (!macrosApi) return;

      function append(line) {
        outputEl.textContent += (outputEl.textContent ? "\n" : "") + line;
        outputEl.scrollTop = outputEl.scrollHeight;
        document.dispatchEvent(new CustomEvent("newui:console-pane-update", {
          detail: { pane: "macro", source: "macro-console", text: String(line || "") },
        }));
      }

      function findMacro(query) {
        var needle = query.trim().toLowerCase();
        return macrosApi.getMacros().find(function (macro) {
          return macro.id.toLowerCase() === needle || tr(macro.nameKey).toLowerCase() === needle;
        }) || null;
      }

      function listMacros() {
        macrosApi.getMacros().forEach(function (macro) {
          append(macro.iconGlyph + " " + macro.id + " - " + tr(macro.nameKey));
        });
      }

      function runCommand() {
        var raw = String(inputEl.value || "").trim();
        if (!raw) return;

        append("M> " + raw);
        inputEl.value = "";

        var normalized = raw.toLowerCase();
        if (normalized === "help" || normalized === "?") {
          listMacros();
          return;
        }

        var macro = findMacro(raw);
        if (!macro) {
          append(tr("macroUnknownCommand") + " \"" + raw + "\" - " + tr("macroHelpHint"));
          return;
        }

        var ran = macrosApi.runMacro(macro.id);
        if (!ran) {
          append(tr("statusMacroRunFailed") + ": " + tr(macro.nameKey));
          if (setStatusLine) setStatusLine(tr("statusMacroRunFailed") + ": " + tr(macro.nameKey));
          return;
        }
        append(tr("statusMacroRun") + ": " + tr(macro.nameKey));
        if (setStatusLine) setStatusLine(tr("statusMacroRun") + ": " + tr(macro.nameKey));
      }

      if (inputEl.dataset.macroBound !== "1") {
        inputEl.dataset.macroBound = "1";
        inputEl.addEventListener("keydown", function (event) {
          if (event.key !== "Enter") return;
          event.preventDefault();
          runCommand();
        });
      }

      if (outputEl.dataset.macroBound !== "1") {
        outputEl.dataset.macroBound = "1";
        append(tr("macroHelpHint"));
      }
    }

    function bindRightTabsAndAssistant() {
      // Delegated (not per-element, matching bindSidebarTabClosers/
      // bindToolClicks' pattern elsewhere in this file) so tab rows added
      // after this runs - by an addon, or later by a registry-driven
      // re-render - work without needing their own explicit listener.
      document.addEventListener("click", function (e) {
        var closeBtn = e.target && e.target.closest ? e.target.closest("[data-right-tab-close]") : null;
        if (closeBtn) {
          e.stopPropagation();
          var closeTool = closeBtn.getAttribute("data-tool");
          if (!closeTool) return;
          if (closeTool === "shellcraft-inspector") shellcraftInspectorClosedByUser = true;
          setRightTabOpen(closeTool, false);
          return;
        }

        var tab = e.target && e.target.closest ? e.target.closest(".v1-right-tab") : null;
        if (!tab) return;
        var next = tab.getAttribute("data-v1-right-tab");
        if (!next) return;
        setRightTabActive(next);
      });

      document.addEventListener("newui:shellcraft-block-selected", function () {
        // Selecting a block is a clear signal the user wants to see its
        // properties again - let the next ShellCraft entry-point click
        // re-open Inspector rather than leaving it permanently unreachable
        // after one manual close.
        shellcraftInspectorClosedByUser = false;
      });

      var chat = document.getElementById("v1AiChatHistory");
      var promptInput = document.getElementById("v1AiPromptInput");
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

      promptInput.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        if (event.shiftKey) return;
        event.preventDefault();
        sendPrompt();
      });
    }

    function init() {
      registerTabSections();
      // LS's 5, RS's 4, and CS's 13 built-in tab rows are all generated
      // from tool-catalog.js here. LS/CS's click handling (bindToolClicks/
      // bindSidebarTabClosers) was already delegated, so no equivalent fix
      // was needed there like RS's bindRightTabsAndAssistant() required.
      // CS's open/close/activate logic (switchTool/closeToolTab) is NOT
      // routed through this registry - only its row markup is generated
      // here, see registerTabSections()'s "center" comment.
      tabRegistry.renderSectionTabs("left", ".v1-sidebar-tool-tabs", tr);
      tabRegistry.renderSectionTabs("right", ".v1-right-tabs", tr);
      tabRegistry.renderSectionTabs("center", "#v1TabsTrack", tr);
      setLeftActiveTab("");
      syncLeftTabActivationInvariant();
      syncRightTabActivationInvariant();
      setScanButtonsState(false);
      bindScannerActions();
      bindResultTabs();
      bindActivityButtons();
      bindSidebarIntentEvents();
      bindRightTabIntentEvents();
      bindToolClicks();
      bindSidebarTabClosers();
      bindConsoleTabs();
      bindMacroConsolePane();
      bindRightTabsAndAssistant();
    }

    function getOpenLeftTools() {
      return tabRegistry.getOpenTabs("left");
    }

    function getActiveLeftTool() {
      return tabRegistry.getActiveTab("left") || null;
    }

    function getOpenRightTools() {
      return tabRegistry.getOpenTabs("right");
    }

    function getActiveRightTool() {
      return tabRegistry.getActiveTab("right") || null;
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
      refreshActiveGenericContent: refreshActiveGenericContent,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createNavigationRuntime = createNavigationRuntime;
})();
