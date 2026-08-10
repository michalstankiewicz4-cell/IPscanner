(function () {
  // WiFi tool, Phase 1: nearby-network scan, current-connection info, and
  // saved-profile listing (with on-demand cleartext password reveal). All
  // read-only, no system state changes. Needs zero new backend code - every
  // feature here is a PowerShell script string shelled out through the
  // already-existing generic run_powershell Tauri command (same one
  // powershell-console-runtime.js uses), since `netsh wlan ...` has no
  // native JSON output mode: each script regex-parses netsh's plain-text
  // tables and ends with ConvertTo-Json -Compress so this module gets
  // structured data instead of hand-parsing text itself.
  //
  // Hotspot/Internet Connection Sharing is explicitly NOT part of this
  // module - it needs elevation this app has never done before, and is
  // deferred to its own future phase (see docs/plans, not this file).

  var HISTORY_KEY = "netrecon_wifi_scan_history";

  // powershell.exe here resolves to Windows PowerShell 5.1 (confirmed live
  // on the dev machine), which has no `ConvertTo-Json -AsArray` (added in
  // PS 6+) - a 1-element PowerShell array always collapses to a bare JSON
  // scalar regardless of how it's wrapped (`@(...)` does not prevent this).
  // Every list-shaped result must be normalized on this side instead of
  // trying to fight it in the script.
  function toArray(value) {
    if (value === null || value === undefined) return [];
    return Array.isArray(value) ? value : [value];
  }

  // PowerShell single-quoted string escaping (double an embedded '). The
  // profile name always originates from netsh's own earlier output, not
  // free-form user input, but this is applied defensively rather than
  // assuming that's always true.
  function escapePs(value) {
    return String(value == null ? "" : value).replace(/'/g, "''");
  }

  // Every script sets Console.OutputEncoding to UTF-8 first: run_powershell
  // launches with CREATE_NO_WINDOW (no real console attached), and
  // PowerShell's default stdout encoding for a detached/redirected process
  // is the system OEM codepage, not UTF-8 - which would silently mangle
  // non-ASCII SSIDs/adapter names before Rust's String::from_utf8_lossy
  // ever sees the bytes. Fixed here, script-side, no main.rs change needed.
  var ENCODING_PREAMBLE = "[Console]::OutputEncoding = [Text.Encoding]::UTF8\n";

  function buildNearbyScanScript() {
    return ENCODING_PREAMBLE + [
      "$raw = netsh wlan show networks mode=bssid",
      "$networks = @()",
      "$current = $null",
      "foreach ($line in $raw) {",
      "  if ($line -match '^SSID \\d+ : (.*)$') {",
      "    if ($current) { $networks += $current }",
      "    $current = [PSCustomObject]@{ ssid = $matches[1].Trim(); security = $null; signal = $null; channel = $null; bssid = $null; radioType = $null }",
      "  } elseif ($current -and $line -match '^\\s*Authentication\\s*:\\s*(.*)$') {",
      "    $current.security = $matches[1].Trim()",
      "  } elseif ($current -and -not $current.bssid -and $line -match '^\\s*BSSID \\d+\\s*:\\s*(.*)$') {",
      "    $current.bssid = $matches[1].Trim()",
      "  } elseif ($current -and -not $current.signal -and $line -match '^\\s*Signal\\s*:\\s*(.*)$') {",
      "    $current.signal = $matches[1].Trim()",
      "  } elseif ($current -and -not $current.radioType -and $line -match '^\\s*Radio type\\s*:\\s*(.*)$') {",
      "    $current.radioType = $matches[1].Trim()",
      "  } elseif ($current -and -not $current.channel -and $line -match '^\\s*Channel\\s*:\\s*(.*)$') {",
      "    $current.channel = $matches[1].Trim()",
      "  }",
      "}",
      "if ($current) { $networks += $current }",
      "@($networks) | ConvertTo-Json -Compress",
    ].join("\n");
  }

  function buildCurrentConnectionScript() {
    return ENCODING_PREAMBLE + [
      "$raw = netsh wlan show interfaces",
      "$info = @{}",
      "foreach ($line in $raw) {",
      "  if ($line -match '^\\s*Name\\s*:\\s*(.*)$')                        { $info.adapterName = $matches[1].Trim() }",
      "  elseif ($line -match '^\\s*Description\\s*:\\s*(.*)$')             { $info.adapter = $matches[1].Trim() }",
      "  elseif ($line -match '^\\s*State\\s*:\\s*(.*)$')                   { $info.state = $matches[1].Trim() }",
      "  elseif ($line -match '^\\s*SSID\\s*:\\s*(.*)$')                    { $info.ssid = $matches[1].Trim() }",
      "  elseif ($line -match '^\\s*Radio type\\s*:\\s*(.*)$')              { $info.radioType = $matches[1].Trim() }",
      "  elseif ($line -match '^\\s*Authentication\\s*:\\s*(.*)$')          { $info.security = $matches[1].Trim() }",
      "  elseif ($line -match '^\\s*Channel\\s*:\\s*(.*)$')                 { $info.channel = $matches[1].Trim() }",
      "  elseif ($line -match '^\\s*Receive rate \\(Mbps\\)\\s*:\\s*(.*)$')   { $info.receiveRate = $matches[1].Trim() }",
      "  elseif ($line -match '^\\s*Transmit rate \\(Mbps\\)\\s*:\\s*(.*)$')  { $info.transmitRate = $matches[1].Trim() }",
      "  elseif ($line -match '^\\s*Signal\\s*:\\s*(.*)$')                  { $info.signal = $matches[1].Trim() }",
      "}",
      "if ($info.adapterName) {",
      "  try {",
      "    $ip = Get-NetIPAddress -InterfaceAlias $info.adapterName -AddressFamily IPv4 -ErrorAction Stop |",
      "      Where-Object { $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1 -ExpandProperty IPAddress",
      "    $info.ipAddress = $ip",
      "  } catch { $info.ipAddress = $null }",
      "}",
      "[PSCustomObject]$info | ConvertTo-Json -Compress",
    ].join("\n");
  }

  function buildSavedProfilesScript() {
    return ENCODING_PREAMBLE + [
      "$raw = netsh wlan show profiles",
      "$profiles = @()",
      "foreach ($line in $raw) {",
      "  if ($line -match '^\\s*All User Profile\\s*:\\s*(.*)$') { $profiles += $matches[1].Trim() }",
      "}",
      "@($profiles) | ConvertTo-Json -Compress",
    ].join("\n");
  }

  function buildProfilePasswordScript(profileName) {
    var name = escapePs(profileName);
    return ENCODING_PREAMBLE + [
      "$name = '" + name + "'",
      '$raw = netsh wlan show profile name="$name" key=clear',
      "$result = @{ profile = $name; keyContent = $null; security = $null }",
      "foreach ($line in $raw) {",
      "  if ($line -match '^\\s*Key Content\\s*:\\s*(.*)$')                    { $result.keyContent = $matches[1].Trim() }",
      "  elseif (-not $result.security -and $line -match '^\\s*Authentication\\s*:\\s*(.*)$') { $result.security = $matches[1].Trim() }",
      "}",
      "[PSCustomObject]$result | ConvertTo-Json -Compress",
    ].join("\n");
  }

  function buildAdapterInfoScript() {
    return ENCODING_PREAMBLE + [
      "$raw = netsh wlan show drivers",
      "$info = @{}",
      "foreach ($line in $raw) {",
      "  if ($line -match '^\\s*Interface name\\s*:\\s*(.*)$')              { $info.interfaceName = $matches[1].Trim() }",
      "  elseif ($line -match '^\\s*Driver\\s*:\\s*(.*)$')                   { $info.driver = $matches[1].Trim() }",
      "  elseif ($line -match '^\\s*Vendor\\s*:\\s*(.*)$')                   { $info.vendor = $matches[1].Trim() }",
      "  elseif ($line -match '^\\s*Provider\\s*:\\s*(.*)$')                 { $info.provider = $matches[1].Trim() }",
      "  elseif ($line -match '^\\s*Version\\s*:\\s*(.*)$')                  { $info.version = $matches[1].Trim() }",
      "  elseif ($line -match '^\\s*Type\\s*:\\s*(.*)$')                     { $info.type = $matches[1].Trim() }",
      "  elseif ($line -match '^\\s*Radio types supported\\s*:\\s*(.*)$')    { $info.radioTypesSupported = $matches[1].Trim() }",
      "  elseif ($line -match '^\\s*Hosted network supported\\s*:\\s*(.*)$') { $info.hostedNetworkSupported = $matches[1].Trim() }",
      "}",
      "[PSCustomObject]$info | ConvertTo-Json -Compress",
    ].join("\n");
  }

  function loadHistory() {
    try {
      var raw = window.localStorage ? window.localStorage.getItem(HISTORY_KEY) : "";
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (item) {
        return item && typeof item === "object" && item.kind && item.snapshot;
      });
    } catch (_) {
      return [];
    }
  }

  function saveHistory(items) {
    try {
      if (!window.localStorage) return;
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify((items || []).slice(0, 24)));
    } catch (_) {
      // ignore persistence failures - history is a convenience, not critical state
    }
  }

  function createWifiRuntime() {
    var nearby = { networks: [], loading: false, error: null, updatedAt: null };
    var current = { info: null, loading: false, error: null, updatedAt: null };
    var profiles = { list: [], loading: false, error: null, updatedAt: null };
    var adapter = { info: null, loading: false, error: null, updatedAt: null };
    // profileName -> { status: "revealed"|"open"|"denied", keyContent, security }
    // Never persisted to localStorage - passwords must not survive a reload.
    var passwordCache = Object.create(null);

    function emitChanged() {
      try {
        document.dispatchEvent(new CustomEvent("newui:wifi-changed", { detail: {} }));
      } catch (_) {
        // ignore event dispatch failures
      }
    }

    function platform() {
      return (window.NetReconNewUICore && window.NetReconNewUICore.platform) || null;
    }

    function isDesktop() {
      var p = platform();
      return !!(p && typeof p.isDesktop === "function" && p.isDesktop());
    }

    function runPowerShell(command) {
      var p = platform();
      if (!p || typeof p.invoke !== "function") {
        return Promise.reject(new Error("tauri invoke unavailable"));
      }
      return Promise.resolve(p.invoke("run_powershell", { command: command }));
    }

    // Runs a script and parses stdout as JSON, with the "1 result collapses
    // to a scalar, not an array" PowerShell quirk left to the caller to
    // normalize via toArray() where relevant.
    function runAndParse(command) {
      return runPowerShell(command).then(function (res) {
        var stdout = String((res && res.stdout) || "").trim();
        if (!stdout) {
          var stderr = String((res && res.stderr) || "").trim();
          throw new Error(stderr || "(no output)");
        }
        return JSON.parse(stdout);
      });
    }

    function addHistoryEntry(kind, summary, snapshot) {
      var items = loadHistory();
      items.unshift({ kind: kind, summary: summary, snapshot: snapshot, updatedAt: Date.now() });
      saveHistory(items);
      emitChanged();
    }

    // Shared shape behind scanNearby/refreshCurrentConnection/
    // listSavedProfiles/refreshAdapterInfo below - each only differs in
    // which state slice it tracks, which script it runs, how it applies
    // the parsed result, and whether it logs a history entry.
    // applyResult(parsed) must mutate the relevant state field(s) and
    // return the value callers/history should see; historyFn(result), if
    // given, returns {kind, summary, snapshot} or a falsy value to skip
    // logging (refreshAdapterInfo has no history entry at all).
    function runTracked(state, scriptBuilder, applyResult, historyFn) {
      state.loading = true;
      state.error = null;
      emitChanged();
      return runAndParse(scriptBuilder()).then(function (parsed) {
        var result = applyResult(parsed);
        state.loading = false;
        state.updatedAt = Date.now();
        emitChanged();
        var entry = historyFn ? historyFn(result) : null;
        if (entry) addHistoryEntry(entry.kind, entry.summary, entry.snapshot);
        return result;
      }).catch(function (err) {
        state.loading = false;
        state.error = (err && err.message) ? err.message : String(err);
        emitChanged();
        throw err;
      });
    }

    function scanNearby() {
      return runTracked(nearby, buildNearbyScanScript, function (parsed) {
        var networks = toArray(parsed).filter(function (n) { return n && n.ssid; });
        nearby.networks = networks;
        return networks;
      }, function (networks) {
        return { kind: "nearby", summary: networks.length + " network" + (networks.length === 1 ? "" : "s"), snapshot: networks };
      });
    }

    function refreshCurrentConnection() {
      return runTracked(current, buildCurrentConnectionScript, function (parsed) {
        current.info = parsed && typeof parsed === "object" ? parsed : {};
        return current.info;
      }, function (info) {
        return { kind: "current", summary: info.ssid || info.state || "snapshot", snapshot: info };
      });
    }

    function listSavedProfiles() {
      return runTracked(profiles, buildSavedProfilesScript, function (parsed) {
        var list = toArray(parsed).filter(Boolean);
        profiles.list = list;
        return list;
      }, function (list) {
        return { kind: "saved", summary: list.length + " profile" + (list.length === 1 ? "" : "s"), snapshot: list };
      });
    }

    function revealProfilePassword(profileName) {
      if (!profileName) return Promise.reject(new Error("profileName required"));
      passwordCache[profileName] = { status: "loading" };
      emitChanged();
      return runAndParse(buildProfilePasswordScript(profileName)).then(function (parsed) {
        var keyContent = parsed && parsed.keyContent ? String(parsed.keyContent) : "";
        var security = parsed && parsed.security ? String(parsed.security) : "";
        var isOpen = !keyContent && /open|none/i.test(security || "");
        passwordCache[profileName] = {
          status: keyContent ? "revealed" : (isOpen ? "open" : "denied"),
          keyContent: keyContent,
          security: security,
        };
        emitChanged();
        return passwordCache[profileName];
      }).catch(function (err) {
        passwordCache[profileName] = { status: "denied", error: (err && err.message) ? err.message : String(err) };
        emitChanged();
        return passwordCache[profileName];
      });
    }

    function refreshAdapterInfo() {
      return runTracked(adapter, buildAdapterInfoScript, function (parsed) {
        adapter.info = parsed && typeof parsed === "object" ? parsed : {};
        return adapter.info;
      }, null);
    }

    function getNearby() { return nearby; }
    function getCurrent() { return current; }
    function getProfiles() { return profiles; }
    function getAdapterInfo() { return adapter; }
    function getPasswordEntry(profileName) { return passwordCache[profileName] || null; }

    function getHistory() { return loadHistory(); }

    function useHistoryEntry(index) {
      var items = loadHistory();
      var item = items[index];
      if (!item) return;
      if (item.kind === "nearby") {
        nearby.networks = toArray(item.snapshot);
        nearby.updatedAt = item.updatedAt;
      } else if (item.kind === "current") {
        current.info = item.snapshot;
        current.updatedAt = item.updatedAt;
      } else if (item.kind === "saved") {
        profiles.list = toArray(item.snapshot);
        profiles.updatedAt = item.updatedAt;
      }
      emitChanged();
    }

    function removeFromHistory(index) {
      var items = loadHistory();
      if (index < 0 || index >= items.length) return;
      items.splice(index, 1);
      saveHistory(items);
      emitChanged();
    }

    return {
      isDesktop: isDesktop,
      scanNearby: scanNearby,
      refreshCurrentConnection: refreshCurrentConnection,
      listSavedProfiles: listSavedProfiles,
      revealProfilePassword: revealProfilePassword,
      refreshAdapterInfo: refreshAdapterInfo,
      getNearby: getNearby,
      getCurrent: getCurrent,
      getProfiles: getProfiles,
      getAdapterInfo: getAdapterInfo,
      getPasswordEntry: getPasswordEntry,
      getHistory: getHistory,
      useHistoryEntry: useHistoryEntry,
      removeFromHistory: removeFromHistory,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.wifi = createWifiRuntime();
})();
