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

  // --- agent profiles keys ---
  // Metadata mirrors agent-profiles-runtime.js's own two localStorage keys
  // exactly (kept as separate literal constants here, not imported, since
  // this file already writes every other tool's session keys directly and
  // bypasses each tool's own runtime module the same way - see
  // collectSessionData/applyLoadedSessionData/closeSession). Attachment
  // BYTES never touch localStorage at all - they live only in IndexedDB via
  // agent-profile-attachments-db.js, addressed by the same id used in the
  // metadata list here.
  var AGENT_PROFILES_KEY = "netrecon_agent_profiles_v1";
  var AGENT_PROFILE_ATTACHMENTS_KEY = "netrecon_agent_profile_attachments_v1";
  // Services/fields are plain strings (no IndexedDB involved, unlike
  // attachments) - must exactly match SERVICES_KEY/FIELDS_KEY in
  // agent-profiles-runtime.js, same hand-duplication risk as the pair above.
  var AGENT_PROFILE_SERVICES_KEY = "netrecon_agent_profile_services_v1";
  var AGENT_PROFILE_SERVICE_FIELDS_KEY = "netrecon_agent_profile_service_fields_v1";

  function bytesToBase64(bytes) {
    var chunkSize = 0x8000;
    var binary = "";
    for (var i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function base64ToBytes(base64) {
    var binary = atob(base64 || "");
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function createSessionRuntime(deps) {
    var tr = deps.tr;
    var platform = deps.platform;
    var setStatusLine = deps.setStatusLine;
    var panelsRuntime = deps.panelsRuntime;
    var switchTool = deps.switchTool;
    var getNavigationRuntime = deps.getNavigationRuntime || function () { return null; };
    var refreshCustomScrollbars = deps.refreshCustomScrollbars || function () {};
    var sessionSqlite = deps.sessionSqlite || null;
    var extensionHost = deps.extensionHost || null;
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
          city: String(row.city || ""),
          countryCode: String(row.countryCode || ""),
          lat: typeof row.lat === "number" ? row.lat : null,
          lon: typeof row.lon === "number" ? row.lon : null,
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
        // Metadata only here (id/profileId/filename/mimeType/role) - the
        // actual attachment bytes get filled in by attachAgentProfileBlobs()
        // right before encoding, since reading them out of IndexedDB is
        // async and this function stays synchronous like every other slice
        // above.
        agentProfiles: (function () {
          var api = window.NetReconNewUICore && window.NetReconNewUICore.agentProfiles;
          return api ? api.getState() : { profiles: [], attachments: [] };
        })(),
        // shell: layout is generic (center/left/right open+active tools).
        layout: {
          center: collectCenterLayout(),
          left: collectLeftLayout(),
          right: collectRightLayout(),
        },
        // Full manifests (not just id/version) of every currently-installed
        // addon, so a future load on a machine missing one can reinstall it
        // straight from the session file with no network call - there is no
        // offline catalog cache anywhere else in the app to fall back on.
        extensions: (function () {
          var manifests = extensionHost && extensionHost.getInstalledManifests ? extensionHost.getInstalledManifests() : [];
          return manifests.map(function (m) {
            return { id: String(m.id || ""), name: String(m.name || ""), version: String(m.version || ""), manifestJson: JSON.stringify(m) };
          });
        })(),
        // HTTPS Auditor: {id/auditedAt/requestedUrl/finalUrl/grade/
        // resultJson} wire shape both write paths expect - see
        // https-auditor-runtime.js's getHistoryForSession().
        httpsAuditHistory: (function () {
          var api = window.NetReconNewUICore && window.NetReconNewUICore.httpsAuditor;
          return api && api.getHistoryForSession ? api.getHistoryForSession() : [];
        })(),
      };
    }

    // Fills each agentProfiles.attachments[].dataBase64 in from IndexedDB
    // right before a save - collectSessionData() itself only has metadata,
    // since IndexedDB access is async and every other slice it builds is
    // synchronous. Mutates entry objects in place (safe: they came from
    // agentProfiles.getState(), which returns a fresh clone on every call,
    // never the live in-memory state) and resolves with the same `data`
    // object so every save call site can chain straight through.
    function attachAgentProfileBlobs(data) {
      var attachments = (data.agentProfiles && Array.isArray(data.agentProfiles.attachments))
        ? data.agentProfiles.attachments
        : [];
      if (!attachments.length) return Promise.resolve(data);

      var db = window.NetReconNewUICore && window.NetReconNewUICore.agentProfileAttachmentsDb;
      if (!db) return Promise.resolve(data);

      return Promise.all(attachments.map(function (entry) {
        return db.getAttachment(entry.id).then(function (blob) {
          if (!blob) { entry.dataBase64 = ""; return; }
          return blob.arrayBuffer().then(function (buffer) {
            entry.dataBase64 = bytesToBase64(new Uint8Array(buffer));
          });
        }).catch(function () {
          entry.dataBase64 = "";
        });
      })).then(function () { return data; });
    }

    // Inverse of attachAgentProfileBlobs() on load - writes profile/
    // attachment-metadata straight to localStorage (same as every other
    // slice in applyLoadedSessionData, bypassing agent-profiles-runtime.js's
    // own per-item API since a full page reload follows right after and
    // that module reloads its state fresh from localStorage on next boot),
    // then decodes each attachment's bytes back into a Blob and writes it
    // into IndexedDB. Clears the store first so attachments from whatever
    // session was open before this load don't linger alongside the newly
    // loaded ones.
    function restoreAgentProfileAttachments(agentProfilesData) {
      agentProfilesData = agentProfilesData || {};
      var profiles = Array.isArray(agentProfilesData.profiles) ? agentProfilesData.profiles : [];
      var attachments = Array.isArray(agentProfilesData.attachments) ? agentProfilesData.attachments : [];
      var services = Array.isArray(agentProfilesData.services) ? agentProfilesData.services : [];
      var fields = Array.isArray(agentProfilesData.fields) ? agentProfilesData.fields : [];

      var s = storage();
      if (s) {
        s.setItem(AGENT_PROFILES_KEY, JSON.stringify(profiles));
        s.setItem(AGENT_PROFILE_ATTACHMENTS_KEY, JSON.stringify(attachments.map(function (a) {
          return { id: a.id, profileId: a.profileId, filename: a.filename, mimeType: a.mimeType, role: a.role };
        })));
        // Plain strings, no binary bytes - unlike attachments, this is a
        // synchronous write alongside the two above, no IndexedDB step.
        s.setItem(AGENT_PROFILE_SERVICES_KEY, JSON.stringify(services));
        s.setItem(AGENT_PROFILE_SERVICE_FIELDS_KEY, JSON.stringify(fields));
      }

      var db = window.NetReconNewUICore && window.NetReconNewUICore.agentProfileAttachmentsDb;
      if (!db) return Promise.resolve();

      return db.clearAll().then(function () {
        return Promise.all(attachments.map(function (a) {
          if (!a || !a.dataBase64) return Promise.resolve();
          return db.putAttachment(a.id, new Blob([base64ToBytes(a.dataBase64)], { type: a.mimeType || "application/octet-stream" }));
        }));
      }).catch(function () {
        // Best-effort: a failed attachment restore shouldn't block the rest
        // of the session load - the metadata written above still reflects
        // what was in the file even if some/all blob writes failed.
      });
    }

    // --- session versioning / addon tracking (load) ---

    // Purely informational - resolves regardless of which button (or
    // Escape/backdrop) the user picks, since an app-version mismatch never
    // blocks a load, it's just a heads-up.
    function checkVersionMismatch(data) {
      var saved = data.meta && data.meta.appVersion;
      var current = window.NetReconNewUICore && window.NetReconNewUICore.APP_VERSION;
      if (!saved || !current || saved === current) return Promise.resolve();
      var ui = window.NetReconNewUI;
      if (!ui || typeof ui.openConfirmDialog !== "function") return Promise.resolve();
      var message = tr("sessionVersionMismatchMessage").replace("{saved}", saved).replace("{current}", current);
      return ui.openConfirmDialog(tr("sessionVersionMismatchTitle"), message, tr("sessionVersionMismatchOk"), tr("exitPromptCancel")).then(function () {});
    }

    // Lazily-built modal, structurally mirroring menu-runtime.js's own
    // buildButtonDialog()/openConfirmDialog() (same .v1-exit-modal/-panel/
    // -head/-message/-actions/-btn CSS classes for visual consistency), with
    // one addition: a scrollable checkbox list between the message and the
    // action buttons, since (unlike every other confirm dialog in this app)
    // this one needs to show a variable-length, per-item-selectable list.
    var missingExtDialogState = null;

    function ensureMissingExtDialog() {
      if (missingExtDialogState && missingExtDialogState.root.isConnected) return missingExtDialogState;

      var root = document.createElement("div");
      root.className = "v1-exit-modal";
      root.setAttribute("hidden", "hidden");
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-modal", "true");

      var panel = document.createElement("div");
      panel.className = "v1-exit-panel";

      var head = document.createElement("div");
      head.className = "v1-exit-head";
      var title = document.createElement("h3");
      head.appendChild(title);

      var message = document.createElement("p");
      message.className = "v1-exit-message";

      var list = document.createElement("div");
      list.className = "v1-session-missing-ext-list";

      var actions = document.createElement("div");
      actions.className = "v1-exit-actions";
      var installBtn = document.createElement("button");
      installBtn.type = "button";
      installBtn.className = "v1-exit-btn v1-exit-btn--primary";
      var skipBtn = document.createElement("button");
      skipBtn.type = "button";
      skipBtn.className = "v1-exit-btn";
      actions.appendChild(installBtn);
      actions.appendChild(skipBtn);

      panel.appendChild(head);
      panel.appendChild(message);
      panel.appendChild(list);
      panel.appendChild(actions);
      root.appendChild(panel);
      document.body.appendChild(root);

      var state = {
        root: root, title: title, message: message, list: list,
        installBtn: installBtn, skipBtn: skipBtn, resolver: null, checkboxes: [],
      };

      function finish(result) {
        root.setAttribute("hidden", "hidden");
        document.removeEventListener("keydown", state._keyHandler, true);
        root.removeEventListener("mousedown", state._backdropHandler);
        var done = state.resolver;
        state.resolver = null;
        if (typeof done === "function") done(result || []);
      }

      installBtn.addEventListener("click", function () {
        var picked = state.checkboxes.filter(function (c) { return c.input.checked; }).map(function (c) { return c.entry; });
        finish(picked);
      });
      skipBtn.addEventListener("click", function () { finish([]); });

      state._keyHandler = function (event) {
        if (event.key === "Escape") { event.preventDefault(); finish([]); }
      };
      state._backdropHandler = function (event) {
        if (event.target === root) finish([]);
      };

      missingExtDialogState = state;
      return state;
    }

    function promptMissingExtensions(missingList) {
      var state = ensureMissingExtDialog();
      state.title.textContent = tr("sessionMissingAddonsTitle");
      state.message.textContent = tr("sessionMissingAddonsMessage");
      state.installBtn.textContent = tr("sessionMissingAddonsInstall");
      state.skipBtn.textContent = tr("sessionMissingAddonsSkip");

      state.list.innerHTML = "";
      state.checkboxes = missingList.map(function (entry) {
        var row = document.createElement("label");
        row.className = "v1-session-missing-ext-row";
        var input = document.createElement("input");
        input.type = "checkbox";
        input.checked = true;
        var span = document.createElement("span");
        span.textContent = (entry.name || entry.id) + " (" + (entry.version || "0.0.0") + ")";
        row.appendChild(input);
        row.appendChild(span);
        state.list.appendChild(row);
        return { input: input, entry: entry };
      });

      return new Promise(function (resolve) {
        state.resolver = resolve;
        state.root.removeAttribute("hidden");
        document.addEventListener("keydown", state._keyHandler, true);
        state.root.addEventListener("mousedown", state._backdropHandler);
      });
    }

    // Skipped cleanly (resolves immediately, no dialog) when nothing
    // recorded in the session is actually missing right now.
    function checkMissingExtensions(data) {
      var recorded = Array.isArray(data.extensions) ? data.extensions : [];
      if (!recorded.length || !extensionHost) return Promise.resolve();
      var installedIds = (typeof extensionHost.listExtensions === "function" ? extensionHost.listExtensions() : []).map(function (e) { return e.id; });
      var missing = recorded.filter(function (e) { return installedIds.indexOf(e.id) === -1; });
      if (!missing.length) return Promise.resolve();

      return promptMissingExtensions(missing).then(function (toInstall) {
        if (!toInstall || !toInstall.length) return;
        var ui = window.NetReconNewUI;
        toInstall.forEach(function (entry) {
          try {
            var parsed = JSON.parse(entry.manifestJson);
            if (typeof extensionHost.installExtension === "function") {
              extensionHost.installExtension(parsed, parsed && parsed.programSource);
            }
            // Reinstall alone only re-registers the manifest - the addon's
            // own program (if it shipped one) needs an explicit run, same
            // as boot/fresh-install already do via registerExtensionCommands.
            if (ui && typeof ui.loadAddonProgram === "function") ui.loadAddonProgram(parsed && parsed.programSource);
          } catch (_) {}
        });
        if (ui && typeof ui.syncExtensionToolUi === "function") ui.syncExtensionToolUi();
      });
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
      return attachAgentProfileBlobs(collectSessionData()).then(function (data) {
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
      return attachAgentProfileBlobs(collectSessionData()).then(function (data) {
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
        });
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

      return attachAgentProfileBlobs(collectSessionData()).then(function (data) {
        return platform.invoke("write_session_file", {
          path: currentPath,
          data: data,
        }).then(function () {
          pushRecent(currentPath);
          statusMsg(tr("sessionSaveOk") + " (" + basename(currentPath) + ") — " + layoutSummary(data.layout));
          return true;
        });
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
      // HTTPS Auditor history: the wire shape (resultJson as a string) needs
      // converting back to the runtime's in-memory shape (result as a parsed
      // object) before it lands in localStorage - the already-instantiated
      // runtime on this same page does that conversion itself and persists
      // it, so the reload below picks it up already in the right shape.
      (function () {
        var httpsApi = window.NetReconNewUICore && window.NetReconNewUICore.httpsAuditor;
        if (httpsApi && httpsApi.restoreHistoryFromSession) httpsApi.restoreHistoryFromSession(data.httpsAuditHistory || []);
      })();
      // Attachment blobs are written to IndexedDB asynchronously - the
      // reload below must wait for that to finish, otherwise a reload
      // firing mid-write would leave attachment metadata pointing at blobs
      // that never actually landed in the store. The version/addon checks
      // run first (both are dialogs the user should see before the reload
      // wipes the loading screen state) - each resolves immediately when
      // its own trigger condition doesn't apply, so a normal same-version,
      // same-addons load is unaffected.
      return checkVersionMismatch(data).then(function () {
        return checkMissingExtensions(data);
      }).then(function () {
        return restoreAgentProfileAttachments(data.agentProfiles);
      }).then(function () {
        rememberPathContext(path);
        statusMsg(tr("sessionLoadOk"));
        window.location.reload();
        return true;
      });
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
        // agent profiles
        s.removeItem(AGENT_PROFILES_KEY);
        s.removeItem(AGENT_PROFILE_ATTACHMENTS_KEY);
        s.removeItem(AGENT_PROFILE_SERVICES_KEY);
        s.removeItem(AGENT_PROFILE_SERVICE_FIELDS_KEY);
        // shell
        s.removeItem(PENDING_LAYOUT_KEY);
        s.removeItem(CURRENT_PATH_KEY);
      }
      // Same reasoning as applyLoadedSessionData: wait for the IndexedDB
      // clear to finish before reloading, or a pending New Session close
      // could get cut off mid-transaction and leak orphaned blobs.
      var db = window.NetReconNewUICore && window.NetReconNewUICore.agentProfileAttachmentsDb;
      var clearPromise = db ? db.clearAll().catch(function () {}) : Promise.resolve();
      clearPromise.then(function () {
        statusMsg(tr("sessionCloseOk"));
        window.location.reload();
      });
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
