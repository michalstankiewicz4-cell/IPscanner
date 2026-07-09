(function () {
  // shell: www-only codec between collectSessionData()'s JS shape and real
  // .sqlite3 bytes, via sql.js (SQLite compiled to WASM - vendored verbatim,
  // not our own WASM code). Schema/read-write order below is a hand-copied
  // mirror of src-tauri/src/main.rs's SESSION_SCHEMA_SQL/write_session_data/
  // read_session_data - keep the two in sync if the Rust schema ever changes.
  // Vendored from https://unpkg.com/sql.js@1.14.1/dist/ - bump the version in
  // both this comment and js/new-ui/vendor/sql-js/ together when upgrading.
  var VENDOR_BASE = "js/new-ui/vendor/sql-js/";

  var SESSION_SCHEMA_SQL = [
    "CREATE TABLE IF NOT EXISTS scan_results (",
    "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
    "  ip TEXT NOT NULL, ping TEXT NOT NULL, hostname TEXT NOT NULL,",
    "  flag TEXT NOT NULL, isp TEXT NOT NULL, as_info TEXT NOT NULL,",
    "  device_identification TEXT NOT NULL, status TEXT NOT NULL, status_class TEXT NOT NULL",
    ");",
    "CREATE TABLE IF NOT EXISTS scan_result_ports (",
    "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
    "  result_id INTEGER NOT NULL REFERENCES scan_results(id) ON DELETE CASCADE,",
    "  port INTEGER NOT NULL",
    ");",
    "CREATE TABLE IF NOT EXISTS ip_library_entries (",
    "  id INTEGER PRIMARY KEY AUTOINCREMENT, country_code TEXT NOT NULL, cidr TEXT NOT NULL",
    ");",
    "CREATE TABLE IF NOT EXISTS ip_library_meta (",
    "  id INTEGER PRIMARY KEY CHECK (id = 1), updated_at TEXT NOT NULL",
    ");",
    "CREATE TABLE IF NOT EXISTS port_presets (",
    "  id TEXT PRIMARY KEY, emoji TEXT NOT NULL, name TEXT NOT NULL, ports TEXT NOT NULL,",
    "  is_default INTEGER NOT NULL DEFAULT 0",
    ");",
    "CREATE TABLE IF NOT EXISTS scan_defaults (",
    "  id INTEGER PRIMARY KEY CHECK (id = 1), timeout_ms INTEGER NOT NULL, concurrency INTEGER NOT NULL",
    ");",
    "CREATE TABLE IF NOT EXISTS scan_progress (",
    "  id INTEGER PRIMARY KEY CHECK (id = 1), state TEXT NOT NULL, processed INTEGER NOT NULL,",
    "  total INTEGER NOT NULL, found INTEGER NOT NULL",
    ");",
    "CREATE TABLE IF NOT EXISTS session_layout_tabs (",
    "  id INTEGER PRIMARY KEY AUTOINCREMENT, section TEXT NOT NULL, tool TEXT NOT NULL,",
    "  is_active INTEGER NOT NULL DEFAULT 0",
    ");",
    "CREATE TABLE IF NOT EXISTS session_meta (",
    "  id INTEGER PRIMARY KEY CHECK (id = 1), saved_at TEXT NOT NULL, version INTEGER NOT NULL",
    ");",
  ].join("\n");

  var enginePromise = null;

  function injectScript(src) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement("script");
      el.src = src;
      el.onload = function () { resolve(); };
      el.onerror = function () { reject(new Error("failed to load " + src)); };
      document.head.appendChild(el);
    });
  }

  function loadEngine() {
    if (enginePromise) return enginePromise;
    enginePromise = injectScript(VENDOR_BASE + "sql-wasm.js")
      .then(function () {
        if (typeof window.initSqlJs !== "function") {
          throw new Error("initSqlJs not available after loading sql-wasm.js");
        }
        return window.initSqlJs({ locateFile: function (f) { return VENDOR_BASE + f; } });
      })
      .catch(function (err) {
        enginePromise = null;
        throw err;
      });
    return enginePromise;
  }

  function encodeSessionData(data) {
    data = data || {};
    return loadEngine().then(function (SQL) {
      var db = new SQL.Database();
      try {
        db.run(SESSION_SCHEMA_SQL);

        var scanResults = Array.isArray(data.scanResults) ? data.scanResults : [];
        var insertResult = db.prepare(
          "INSERT INTO scan_results (id, ip, ping, hostname, flag, isp, as_info, device_identification, status, status_class) VALUES (?,?,?,?,?,?,?,?,?,?)"
        );
        var insertPort = db.prepare("INSERT INTO scan_result_ports (result_id, port) VALUES (?, ?)");
        scanResults.forEach(function (row, index) {
          row = row || {};
          var id = index + 1;
          insertResult.run([
            id,
            String(row.ip || ""),
            String(row.ping || ""),
            String(row.hostname || ""),
            String(row.flag || ""),
            String(row.isp || ""),
            String(row.as || ""),
            String(row.deviceIdentification || ""),
            String(row.status || ""),
            String(row.statusClass || ""),
          ]);
          var ports = Array.isArray(row.ports) ? row.ports : [];
          ports.forEach(function (port) {
            insertPort.run([id, Number(port) || 0]);
          });
        });
        insertResult.free();
        insertPort.free();

        var ipLibrary = data.ipLibrary || {};
        var entries = Array.isArray(ipLibrary.entries) ? ipLibrary.entries : [];
        var insertEntry = db.prepare("INSERT INTO ip_library_entries (country_code, cidr) VALUES (?, ?)");
        entries.forEach(function (entry) {
          entry = entry || {};
          insertEntry.run([String(entry.countryCode || ""), String(entry.cidr || "")]);
        });
        insertEntry.free();
        db.run("INSERT INTO ip_library_meta (id, updated_at) VALUES (1, ?)", [String(ipLibrary.updatedAt || "")]);

        var presetsObj = data.presets || {};
        var presetsList = Array.isArray(presetsObj.presets) ? presetsObj.presets : [];
        var defaultPresetId = String(presetsObj.defaultPresetId || "");
        var insertPreset = db.prepare("INSERT INTO port_presets (id, emoji, name, ports, is_default) VALUES (?,?,?,?,?)");
        presetsList.forEach(function (preset) {
          preset = preset || {};
          var id = String(preset.id || "");
          insertPreset.run([
            id,
            String(preset.emoji || ""),
            String(preset.name || ""),
            String(preset.ports || ""),
            id === defaultPresetId ? 1 : 0,
          ]);
        });
        insertPreset.free();

        var scanDefaults = data.scanDefaults || {};
        db.run("INSERT INTO scan_defaults (id, timeout_ms, concurrency) VALUES (1, ?, ?)", [
          Number(scanDefaults.timeoutMs) || 0,
          Number(scanDefaults.concurrency) || 0,
        ]);

        var scanProgress = data.scanProgress || {};
        db.run("INSERT INTO scan_progress (id, state, processed, total, found) VALUES (1, ?, ?, ?, ?)", [
          String(scanProgress.state || ""),
          Number(scanProgress.processed) || 0,
          Number(scanProgress.total) || 0,
          Number(scanProgress.found) || 0,
        ]);

        var layout = data.layout || {};
        var insertTab = db.prepare("INSERT INTO session_layout_tabs (section, tool, is_active) VALUES (?, ?, ?)");
        [["center", layout.center], ["left", layout.left], ["right", layout.right]].forEach(function (pair) {
          var sectionName = pair[0];
          var section = pair[1] || {};
          var open = Array.isArray(section.open) ? section.open : [];
          open.forEach(function (tool) {
            insertTab.run([sectionName, String(tool), section.active === tool ? 1 : 0]);
          });
        });
        insertTab.free();

        db.run("INSERT INTO session_meta (id, saved_at, version) VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), 1)");

        return db.export();
      } finally {
        db.close();
      }
    });
  }

  function decodeSessionBytes(bytes) {
    return loadEngine().then(function (SQL) {
      var db;
      try {
        db = new SQL.Database(bytes);
      } catch (_) {
        throw new Error("invalid sqlite file");
      }
      try {
        var scanResults = [];
        var indexById = {};
        var scanResultsRows = db.exec(
          "SELECT id, ip, ping, hostname, flag, isp, as_info, device_identification, status, status_class FROM scan_results ORDER BY id"
        );
        if (scanResultsRows.length) {
          scanResultsRows[0].values.forEach(function (row, idx) {
            indexById[row[0]] = idx;
            scanResults.push({
              ip: String(row[1] || ""),
              ping: String(row[2] || ""),
              hostname: String(row[3] || ""),
              flag: String(row[4] || ""),
              isp: String(row[5] || ""),
              as: String(row[6] || ""),
              deviceIdentification: String(row[7] || ""),
              status: String(row[8] || ""),
              statusClass: String(row[9] || ""),
              ports: [],
            });
          });
        }

        var portsRows = db.exec("SELECT result_id, port FROM scan_result_ports ORDER BY id");
        if (portsRows.length) {
          portsRows[0].values.forEach(function (row) {
            var idx = indexById[row[0]];
            if (idx !== undefined && scanResults[idx]) scanResults[idx].ports.push(Number(row[1]) || 0);
          });
        }

        var scanProgress = { state: "", processed: 0, total: 0, found: 0 };
        var progressRows = db.exec("SELECT state, processed, total, found FROM scan_progress WHERE id = 1");
        if (progressRows.length && progressRows[0].values.length) {
          var pr = progressRows[0].values[0];
          scanProgress = { state: String(pr[0] || ""), processed: Number(pr[1]) || 0, total: Number(pr[2]) || 0, found: Number(pr[3]) || 0 };
        }

        var entries = [];
        var entriesRows = db.exec("SELECT country_code, cidr FROM ip_library_entries ORDER BY id");
        if (entriesRows.length) {
          entriesRows[0].values.forEach(function (row) {
            entries.push({ countryCode: String(row[0] || ""), cidr: String(row[1] || "") });
          });
        }

        var updatedAt = "";
        var metaRows = db.exec("SELECT updated_at FROM ip_library_meta WHERE id = 1");
        if (metaRows.length && metaRows[0].values.length) updatedAt = String(metaRows[0].values[0][0] || "");

        var presets = [];
        var defaultPresetId = "";
        var presetsRows = db.exec("SELECT id, emoji, name, ports, is_default FROM port_presets ORDER BY rowid");
        if (presetsRows.length) {
          presetsRows[0].values.forEach(function (row) {
            var id = String(row[0] || "");
            if (!!row[4]) defaultPresetId = id;
            presets.push({ id: id, emoji: String(row[1] || ""), name: String(row[2] || ""), ports: String(row[3] || "") });
          });
        }

        var scanDefaults = { timeoutMs: 0, concurrency: 0 };
        var defaultsRows = db.exec("SELECT timeout_ms, concurrency FROM scan_defaults WHERE id = 1");
        if (defaultsRows.length && defaultsRows[0].values.length) {
          var dr = defaultsRows[0].values[0];
          scanDefaults = { timeoutMs: Number(dr[0]) || 0, concurrency: Number(dr[1]) || 0 };
        }

        var layout = { center: { open: [], active: null }, left: { open: [], active: null }, right: { open: [], active: null } };
        var tabsRows = db.exec("SELECT section, tool, is_active FROM session_layout_tabs ORDER BY id");
        if (tabsRows.length) {
          tabsRows[0].values.forEach(function (row) {
            var bucket = layout[String(row[0] || "")];
            if (!bucket) return;
            var tool = String(row[1] || "");
            bucket.open.push(tool);
            if (!!row[2]) bucket.active = tool;
          });
        }

        return {
          scanResults: scanResults,
          scanProgress: scanProgress,
          ipLibrary: { entries: entries, updatedAt: updatedAt },
          presets: { defaultPresetId: defaultPresetId, presets: presets },
          scanDefaults: scanDefaults,
          layout: layout,
        };
      } finally {
        db.close();
      }
    });
  }

  function downloadBytes(filename, bytes) {
    var blob = new Blob([bytes], { type: "application/x-sqlite3" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename || "OSINT-session.sqlite3";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function pickFile() {
    return new Promise(function (resolve) {
      var input = document.createElement("input");
      input.type = "file";
      input.accept = ".sqlite3,.db";
      var settled = false;
      function settle(value) {
        if (settled) return;
        settled = true;
        resolve(value);
      }
      input.addEventListener("change", function () {
        settle(input.files && input.files[0] ? input.files[0] : null);
      });
      input.addEventListener("cancel", function () {
        settle(null);
      });
      input.click();
    });
  }

  function createSessionSqliteRuntime() {
    return {
      loadEngine: loadEngine,
      encodeSessionData: encodeSessionData,
      decodeSessionBytes: decodeSessionBytes,
      downloadBytes: downloadBytes,
      pickFile: pickFile,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createSessionSqliteRuntime = createSessionSqliteRuntime;
})();
