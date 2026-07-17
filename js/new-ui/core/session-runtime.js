(function () {
  // --- shell keys ---
  // Session mechanism itself (file path/dialog/MRU bookkeeping, layout
  // restore) is generic shell infrastructure per FUTURE_PLUGIN_SHELL.md.
  var CURRENT_PATH_KEY = "netrecon_session_current_path";
  var LAST_DIR_KEY = "netrecon_session_last_dir";
  var RECENT_KEY = "netrecon_session_recent_v1";
  var PENDING_LAYOUT_KEY = "netrecon_session_pending_layout_v1";
  var DEFAULT_FILENAME = "OSINT-session.sqlite3";
  var MAX_RECENT = 10;

  // --- ip-scanner tool keys ---
  // The session FILE FORMAT/mechanism above is shell, but the actual data it
  // reads/writes below is hardcoded to the IP-Scanner payload shape. A real
  // shell needs a session-data contribution API here eventually (any addon
  // could contribute its own save/restore slice) - not attempted in this
  // delimiting pass, see collectSessionData/applyLoadedSessionData/closeSession.
  var SCAN_RESULTS_KEY = "netrecon_scan_results_v1";
  var SCAN_PROGRESS_KEY = "netrecon_scan_progress_v1";
  var IP_LIBRARY_KEY = "netrecon_country_ip_library_json";
  var IP_LIBRARY_UPDATED_KEY = "netrecon_country_ip_library_updated_at";
  var PRESETS_KEY = "netrecon_scan_presets_v1";
  var DEFAULTS_KEY = "netrecon_scan_defaults_v1";

  function createSessionRuntime(deps) {
    var tr = deps.tr;
    var platform = deps.platform;
    var setStatusLine = deps.setStatusLine;
    var panelsRuntime = deps.panelsRuntime;
    var switchTool = deps.switchTool;
    var getNavigationRuntime = deps.getNavigationRuntime || function () { return null; };
    var refreshCustomScrollbars = deps.refreshCustomScrollbars || function () {};
    var sessionSqlite = deps.sessionSqlite || null;
    var sharedNet = window.NetReconNewUICore && window.NetReconNewUICore.utils
      ? window.NetReconNewUICore.utils.net
      : null;
    var sharedDom = window.NetReconNewUICore && window.NetReconNewUICore.utils
      ? window.NetReconNewUICore.utils.dom
      : null;
    var escapeHtml = (sharedDom && sharedDom.escapeHtml) || function (value) { return String(value == null ? "" : value); };

    function isWww() {
      return !platform.getInvoke || !platform.getInvoke();
    }

    function lookupPortService(port) {
      return sharedNet && typeof sharedNet.lookupPortService === "function"
        ? sharedNet.lookupPortService(port)
        : "";
    }

    function storage() {
      return (platform && platform.storage) || null;
    }

    function statusMsg(text) {
      if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + text);
    }

    function basename(path) {
      var value = String(path || "");
      var idx = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
      return idx >= 0 ? value.slice(idx + 1) : value;
    }

    function dirname(path) {
      var value = String(path || "");
      var idx = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
      return idx >= 0 ? value.slice(0, idx) : "";
    }

    function isCancelled(err) {
      return !!err && (err === "cancelled" || err.message === "cancelled");
    }

    function layoutSummary(layout) {
      layout = layout || {};
      var c = (layout.center && layout.center.open) || [];
      var l = (layout.left && layout.left.open) || [];
      var r = (layout.right && layout.right.open) || [];
      return tr("sessionTabsLabel") + " center=" + c.length + "[" + c.join(",") + "]"
        + " left=" + l.length + "[" + l.join(",") + "]"
        + " right=" + r.length + "[" + r.join(",") + "]";
    }

    // --- layout collection (save) ---

    function collectCenterLayout() {
      var open = panelsRuntime && panelsRuntime.getOpenCenterTools ? panelsRuntime.getOpenCenterTools() : [];
      var detached = panelsRuntime && panelsRuntime.getDetachedTools ? panelsRuntime.getDetachedTools() : [];
      detached.forEach(function (tool) {
        if (open.indexOf(tool) === -1) open.push(tool);
      });
      var active = panelsRuntime && panelsRuntime.getActiveTool ? panelsRuntime.getActiveTool() : null;
      return { open: open, active: active || null };
    }

    function collectLeftLayout() {
      var nav = getNavigationRuntime();
      var open = nav && nav.getOpenLeftTools ? nav.getOpenLeftTools() : [];
      var active = nav && nav.getActiveLeftTool ? nav.getActiveLeftTool() : null;
      return { open: open, active: active || null };
    }

    function collectRightLayout() {
      var nav = getNavigationRuntime();
      var open = nav && nav.getOpenRightTools ? nav.getOpenRightTools() : [];
      var active = nav && nav.getActiveRightTool ? nav.getActiveRightTool() : null;
      return { open: open, active: active || null };
    }

    // General settings -> "Remember open tabs": same shape as
    // collectSessionData().layout, but without any of the ip-scanner-tool
    // session data around it - used to snapshot just the tab layout to a
    // Program-scope (not session-file) key on app close.
    function collectLayoutOnly() {
      return {
        center: collectCenterLayout(),
        left: collectLeftLayout(),
        right: collectRightLayout(),
      };
    }

    // ip-scanner tool: the fields below (scanResults/scanProgress/ipLibrary/
    // presets/scanDefaults) are IP-Scanner-specific; only "layout" is shell.
    function collectSessionData() {
      var s = storage();
      var scanResultsRaw = s ? s.getJson(SCAN_RESULTS_KEY, []) : [];
      var scanProgressRaw = s ? s.getJson(SCAN_PROGRESS_KEY, {}) : {};
      var ipLibraryRaw = s ? s.getJson(IP_LIBRARY_KEY, []) : [];
      var ipLibraryUpdatedAt = s ? (s.getItem(IP_LIBRARY_UPDATED_KEY) || "") : "";
      var presetsRaw = s ? s.getJson(PRESETS_KEY, {}) : {};
      var defaultsRaw = s ? s.getJson(DEFAULTS_KEY, {}) : {};

      var scanResults = (Array.isArray(scanResultsRaw) ? scanResultsRaw : []).map(function (row) {
        row = row || {};
        var ports = (Array.isArray(row.ports) ? row.ports : []).map(function (p) {
          if (p && typeof p === "object") {
            var n = Number(p.port);
            if (!Number.isFinite(n)) return null;
            return { port: n, protocol: String(p.protocol || "TCP"), status: String(p.status || "open"), service: String(p.service || ""), ping: String(p.ping || "-").trim() || "-" };
          }
          // Legacy bare-number ports (pre-dating protocol/service tagging) -
          // self-heal into the current shape on next save.
          var legacy = Number(p);
          return Number.isFinite(legacy) ? { port: legacy, protocol: "TCP", status: "open", service: lookupPortService(legacy), ping: "-" } : null;
        }).filter(Boolean);
        return {
          ip: String(row.ip || ""),
          ping: String(row.ping || "-"),
          hostname: String(row.hostname || "-"),
          flag: String(row.flag || "-"),
          isp: String(row.isp || "-"),
          as: String(row.as || ""),
          deviceIdentification: String(row.deviceIdentification || ""),
          status: String(row.status || ""),
          statusClass: String(row.statusClass || ""),
          ports: ports,
        };
      });

      var presetsList = Array.isArray(presetsRaw.presets) ? presetsRaw.presets : [];

      return {
        scanResults: scanResults,
        scanProgress: {
          state: String(scanProgressRaw.state || ""),
          processed: Number(scanProgressRaw.processed) || 0,
          total: Number(scanProgressRaw.total) || 0,
          found: Number(scanProgressRaw.found) || 0,
        },
        ipLibrary: {
          entries: panelsRuntime && panelsRuntime.flattenIpLibraryEntries
            ? panelsRuntime.flattenIpLibraryEntries(ipLibraryRaw)
            : [],
          updatedAt: ipLibraryUpdatedAt,
        },
        presets: {
          defaultPresetId: String(presetsRaw.defaultPresetId || ""),
          presets: presetsList.map(function (p) {
            p = p || {};
            return {
              id: String(p.id || ""),
              emoji: String(p.emoji || ""),
              name: String(p.name || ""),
              ports: String(p.ports || ""),
            };
          }),
        },
        scanDefaults: {
          timeoutMs: Number(defaultsRaw.timeoutMs) || 0,
          concurrency: Number(defaultsRaw.concurrency) || 0,
        },
        // shell: layout is generic (center/left/right open+active tools).
        layout: {
          center: collectCenterLayout(),
          left: collectLeftLayout(),
          right: collectRightLayout(),
        },
      };
    }

    // --- layout restore (load) ---

    function applyLayout(layout) {
      if (!layout) return;

      var nav = getNavigationRuntime();

      // Restore is declarative: anything currently open that ISN'T in the
      // saved layout gets closed first, so tools that are open-by-default
      // (e.g. the right panel's assistant tab) don't linger after a load.
      var center = layout.center || {};
      var centerTargetOpen = center.open || [];
      var currentCenterOpen = panelsRuntime && panelsRuntime.getOpenCenterTools ? panelsRuntime.getOpenCenterTools() : [];
      currentCenterOpen.forEach(function (tool) {
        if (centerTargetOpen.indexOf(tool) === -1 && panelsRuntime && panelsRuntime.closeCenterTool) {
          try { panelsRuntime.closeCenterTool(tool); } catch (_) {}
        }
      });
      centerTargetOpen.forEach(function (tool) {
        try {
          if (switchTool) switchTool(tool);
        } catch (_) {}
      });
      if (center.active) {
        try {
          if (switchTool) switchTool(center.active);
        } catch (_) {}
      }

      var left = layout.left || {};
      var leftTargetOpen = left.open || [];
      var currentLeftOpen = nav && nav.getOpenLeftTools ? nav.getOpenLeftTools() : [];
      currentLeftOpen.forEach(function (tool) {
        if (leftTargetOpen.indexOf(tool) === -1 && nav && nav.setSidebarTabOpen) {
          nav.setSidebarTabOpen(tool, false);
        }
      });
      leftTargetOpen.forEach(function (tool) {
        document.dispatchEvent(new CustomEvent("newui:sidebar-tab-intent-open", {
          detail: { tool: tool, activate: false },
        }));
      });
      if (left.active) {
        document.dispatchEvent(new CustomEvent("newui:sidebar-tab-intent-open", {
          detail: { tool: left.active, activate: true },
        }));
      }

      var right = layout.right || {};
      var rightTargetOpen = right.open || [];
      var currentRightOpen = nav && nav.getOpenRightTools ? nav.getOpenRightTools() : [];
      currentRightOpen.forEach(function (tool) {
        if (rightTargetOpen.indexOf(tool) === -1 && nav && nav.setRightTabOpen) {
          nav.setRightTabOpen(tool, false);
        }
      });
      rightTargetOpen.forEach(function (tool) {
        if (nav && nav.ensureRightTabOpen) nav.ensureRightTabOpen(tool);
      });
      if (right.active && nav && nav.setRightTabActive) {
        nav.setRightTabActive(right.active);
      }
      // Saved layouts can have a tool in `open` without a matching `active`
      // (e.g. an older snapshot saved before a tool's default-open state
      // changed) - without this, the tab shows as open but no pane is
      // marked active, so #v1-right-content stays visible with its own
      // background instead of collapsing to the empty state, and no pane
      // renders. syncRightTabActivationInvariant() has the same "at least
      // one active if something's open" fallback ensureRightTabOpen/
      // setRightTabOpen already rely on - re-running it here guarantees the
      // invariant holds regardless of what fields the saved layout had.
      if (nav && nav.syncRightTabActivationInvariant) {
        nav.syncRightTabActivationInvariant();
      }
    }

    function restoreLayoutAfterReload() {
      var s = storage();
      if (!s) return false;
      var raw = s.getItem(PENDING_LAYOUT_KEY);
      if (!raw) return false;
      s.removeItem(PENDING_LAYOUT_KEY);
      var layout;
      try {
        layout = JSON.parse(raw);
      } catch (_) {
        return false;
      }
      applyLayout(layout);
      statusMsg(tr("sessionLoadOk") + " — " + layoutSummary(layout));
      return true;
    }

    // --- recent sessions (MRU, shown on the center welcome view) ---

    function readRecent() {
      var s = storage();
      var raw = s ? s.getJson(RECENT_KEY, []) : [];
      return Array.isArray(raw) ? raw : [];
    }

    function getMostRecentPath() {
      var list = readRecent();
      return (list[0] && list[0].path) || "";
    }

    function writeRecent(list) {
      var s = storage();
      if (s) s.setJson(RECENT_KEY, list);
    }

    function pushRecent(path) {
      var list = readRecent().filter(function (item) { return item && item.path !== path; });
      list.unshift({ path: path, name: basename(path), savedAt: new Date().toISOString() });
      writeRecent(list.slice(0, MAX_RECENT));
      renderRecentSessionsList();
    }

    function dropRecent(path) {
      writeRecent(readRecent().filter(function (item) { return item && item.path !== path; }));
    }

    // --- default directory ---

    function resolveDefaultDir() {
      var s = storage();
      var stored = s ? s.getItem(LAST_DIR_KEY) : null;
      if (stored) return Promise.resolve(stored);
      return platform.invoke("session_install_dir").catch(function () { return ""; });
    }

    function hasActiveSession() {
      var s = storage();
      return !!(s && s.getItem(CURRENT_PATH_KEY));
    }

    function updateSessionNameLabel() {
      var label = document.getElementById("v1SessionNameLabel");
      var currentPath = hasActiveSession() ? storage().getItem(CURRENT_PATH_KEY) : null;
      if (label) {
        if (currentPath) {
          label.textContent = basename(currentPath);
          label.title = currentPath;
        } else {
          label.textContent = tr("sessionNoneLabel");
          label.title = "";
        }
      }
      var importItem = document.getElementById("v1MenuFileImport");
      if (importItem) {
        importItem.setAttribute("aria-disabled", currentPath ? "false" : "true");
      }
    }

    function rememberPathContext(path) {
      var s = storage();
      if (!s) return;
      s.setItem(CURRENT_PATH_KEY, path);
      s.setItem(LAST_DIR_KEY, dirname(path));
      pushRecent(path);
      updateSessionNameLabel();
    }

    // --- www save/load via sql.js (real .sqlite3 bytes, no Tauri invoke) ---

    // usePicker=true (Save As, or plain Save with no path yet) opens the
    // native folder picker. usePicker=false (plain Save on an already-saved
    // session) silently re-downloads to the same suggested filename, mirroring
    // desktop's "Save" (write_session_file) which never re-prompts - only
    // "Save As" should ever interrupt the user with a location dialog.
    function saveSessionToBrowser(usePicker) {
      statusMsg(tr("sessionSqliteEngineLoading"));
      var data = collectSessionData();
      return sessionSqlite.encodeSessionData(data).then(function (bytes) {
        var s = storage();
        var suggestedName = (s && s.getItem(CURRENT_PATH_KEY)) || DEFAULT_FILENAME;
        if (!usePicker) {
          sessionSqlite.downloadBytes(suggestedName, bytes);
          rememberPathContext(suggestedName);
          statusMsg(tr("sessionSaveOk") + " (" + suggestedName + ") — " + layoutSummary(data.layout));
          return true;
        }
        return sessionSqlite.saveBytesWithPicker(suggestedName, bytes).then(function (savedName) {
          rememberPathContext(savedName || suggestedName);
          statusMsg(tr("sessionSaveOk") + " (" + (savedName || suggestedName) + ") — " + layoutSummary(data.layout));
          return true;
        });
      }).catch(function (err) {
        if (isCancelled(err)) return false;
        statusMsg(tr("sessionSaveFailed"));
        return false;
      });
    }

    function loadSessionFromBrowser() {
      return sessionSqlite.pickFile().then(function (file) {
        if (!file) return false;
        return file.arrayBuffer().then(function (buffer) {
          return sessionSqlite.decodeSessionBytes(new Uint8Array(buffer));
        }).then(function (data) {
          return applyLoadedSessionData(file.name, data);
        });
      }).catch(function () {
        statusMsg(tr("sessionLoadFailed"));
        return false;
      });
    }

    // --- save / save as ---

    function saveSessionAs() {
      if (sessionSqlite && isWww()) return saveSessionToBrowser(true);
      var data = collectSessionData();
      return resolveDefaultDir().then(function (defaultDir) {
        return platform.invoke("save_session_dialog", {
          defaultDir: defaultDir,
          defaultFilename: DEFAULT_FILENAME,
          data: data,
        });
      }).then(function (path) {
        rememberPathContext(path);
        statusMsg(tr("sessionSaveOk") + " (" + basename(path) + ") — " + layoutSummary(data.layout));
        return true;
      }).catch(function (err) {
        if (!isCancelled(err)) statusMsg(tr("sessionSaveFailed"));
        return false;
      });
    }

    function saveSession() {
      if (sessionSqlite && isWww()) {
        var wwwCurrentPath = storage() ? storage().getItem(CURRENT_PATH_KEY) : null;
        return saveSessionToBrowser(!wwwCurrentPath);
      }
      var s = storage();
      var currentPath = s ? s.getItem(CURRENT_PATH_KEY) : null;
      if (!currentPath) return saveSessionAs();

      var data = collectSessionData();
      return platform.invoke("write_session_file", {
        path: currentPath,
        data: data,
      }).then(function () {
        pushRecent(currentPath);
        statusMsg(tr("sessionSaveOk") + " (" + basename(currentPath) + ") — " + layoutSummary(data.layout));
        return true;
      }).catch(function () {
        statusMsg(tr("sessionSaveRetry"));
        return saveSessionAs();
      });
    }

    // --- load ---

    function applyLoadedSessionData(path, data) {
      data = data || {};
      var s = storage();
      if (s) {
        // ip-scanner tool
        s.setItem(SCAN_RESULTS_KEY, JSON.stringify(data.scanResults || []));
        s.setItem(SCAN_PROGRESS_KEY, JSON.stringify(data.scanProgress || {}));
        s.setItem(IP_LIBRARY_KEY, JSON.stringify((data.ipLibrary && data.ipLibrary.entries) || []));
        s.setItem(IP_LIBRARY_UPDATED_KEY, (data.ipLibrary && data.ipLibrary.updatedAt) || "");
        s.setItem(PRESETS_KEY, JSON.stringify(data.presets || {}));
        s.setItem(DEFAULTS_KEY, JSON.stringify(data.scanDefaults || {}));
        // shell
        s.setItem(PENDING_LAYOUT_KEY, JSON.stringify(data.layout || {}));
      }
      rememberPathContext(path);
      statusMsg(tr("sessionLoadOk"));
      window.location.reload();
      return true;
    }

    function loadSession() {
      if (sessionSqlite && isWww()) return loadSessionFromBrowser();
      return resolveDefaultDir().then(function (defaultDir) {
        return platform.invoke("open_session_dialog", { defaultDir: defaultDir });
      }).then(function (result) {
        return applyLoadedSessionData(result.path, result.data);
      }).catch(function (err) {
        if (!isCancelled(err)) statusMsg(tr("sessionLoadFailed"));
        return false;
      });
    }

    function loadSessionFromPath(path) {
      if (sessionSqlite && isWww()) return loadSessionFromBrowser();
      return platform.invoke("read_session_file", { path: path }).then(function (data) {
        return applyLoadedSessionData(path, data);
      }).catch(function (err) {
        var notFound = !!err && String(err).indexOf("not found") !== -1;
        if (notFound) {
          dropRecent(path);
          renderRecentSessionsList();
          statusMsg(tr("sessionLoadEmpty"));
        } else {
          statusMsg(tr("sessionLoadFailed"));
        }
        return false;
      });
    }

    // --- close ---

    function closeSession() {
      var s = storage();
      if (s) {
        // ip-scanner tool
        s.removeItem(SCAN_RESULTS_KEY);
        s.removeItem(SCAN_PROGRESS_KEY);
        s.removeItem(IP_LIBRARY_KEY);
        s.removeItem(IP_LIBRARY_UPDATED_KEY);
        s.removeItem(PRESETS_KEY);
        s.removeItem(DEFAULTS_KEY);
        // shell
        s.removeItem(PENDING_LAYOUT_KEY);
        s.removeItem(CURRENT_PATH_KEY);
      }
      statusMsg(tr("sessionCloseOk"));
      window.location.reload();
    }

    // --- center welcome view (recent sessions) ---

    function pad2(n) {
      return n < 10 ? "0" + n : String(n);
    }

    function formatSavedAt(iso) {
      var value = String(iso || "").trim();
      if (!value) return "";
      var parsed = new Date(value);
      if (isNaN(parsed.getTime())) return value;
      return parsed.getFullYear() + "-" + pad2(parsed.getMonth() + 1) + "-" + pad2(parsed.getDate())
        + " " + pad2(parsed.getHours()) + ":" + pad2(parsed.getMinutes());
    }

    function renderRecentSessionsList() {
      renderFileMenuFlyout();

      var list = document.getElementById("v1SessionWelcomeList");
      if (!list) return;
      list.innerHTML = "";

      var recent = readRecent();
      if (!recent.length) {
        var empty = document.createElement("p");
        empty.className = "v1-session-welcome-empty";
        empty.textContent = tr("sessionListEmpty");
        list.appendChild(empty);
        refreshCustomScrollbars();
        return;
      }

      recent.forEach(function (item) {
        var row = document.createElement("div");
        row.className = "v1-session-row";

        var date = document.createElement("span");
        date.className = "v1-session-row-date";
        date.textContent = formatSavedAt(item.savedAt);
        row.appendChild(date);

        var link = document.createElement("a");
        link.className = "v1-session-row-name";
        link.href = "#";
        link.textContent = item.name;
        link.addEventListener("click", function (event) {
          event.preventDefault();
          loadSessionFromPath(item.path);
        });
        row.appendChild(link);

        var folder = document.createElement("span");
        folder.className = "v1-session-row-folder";
        folder.textContent = dirname(item.path);
        folder.title = item.path;
        row.appendChild(folder);

        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "v1-session-row-remove";
        removeBtn.setAttribute("aria-label", tr("sessionRemoveFromList"));
        removeBtn.title = tr("sessionRemoveFromList");
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          dropRecent(item.path);
          renderRecentSessionsList();
        });
        row.appendChild(removeBtn);

        list.appendChild(row);
      });

      refreshCustomScrollbars();
    }

    function renderFileMenuFlyout() {
      var flyout = document.getElementById("v1FileOpenRecentFlyout");
      if (!flyout) return;
      flyout.innerHTML = "";

      var recent = readRecent();
      if (!recent.length) {
        var empty = document.createElement("div");
        empty.className = "v1-menu-dd-flyout-empty";
        empty.textContent = tr("sessionListEmpty");
        flyout.appendChild(empty);
        refreshCustomScrollbars();
        return;
      }

      recent.forEach(function (item) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "v1-menu-dd-item v1-menu-dd-flyout-item";
        btn.title = item.path;
        btn.innerHTML = "<span>" + escapeHtml(item.name) + "</span><span class=\"shortcut\"></span>";
        btn.addEventListener("click", function (event) {
          event.stopPropagation();
          var fileGroup = document.querySelector('.v1-menu-group[data-menu="file"]');
          if (fileGroup) fileGroup.classList.remove("open");
          var submenu = flyout.closest(".v1-menu-dd-submenu");
          if (submenu) {
            submenu.classList.remove("open");
            var trigger = submenu.querySelector("[data-menu-submenu-trigger]");
            if (trigger) trigger.setAttribute("aria-expanded", "false");
          }
          loadSessionFromPath(item.path);
        });
        flyout.appendChild(btn);
      });

      refreshCustomScrollbars();
    }

    function initWelcomeView() {
      var title = document.getElementById("v1SessionWelcomeTitle");
      if (title) title.textContent = tr("sessionWelcomeTitle");

      renderRecentSessionsList();
      updateSessionNameLabel();
    }

    return {
      collectSessionData: collectSessionData,
      collectLayoutOnly: collectLayoutOnly,
      applyLayout: applyLayout,
      saveSession: saveSession,
      saveSessionAs: saveSessionAs,
      loadSession: loadSession,
      loadSessionFromPath: loadSessionFromPath,
      closeSession: closeSession,
      restoreLayoutAfterReload: restoreLayoutAfterReload,
      initWelcomeView: initWelcomeView,
      getMostRecentPath: getMostRecentPath,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createSessionRuntime = createSessionRuntime;
})();
