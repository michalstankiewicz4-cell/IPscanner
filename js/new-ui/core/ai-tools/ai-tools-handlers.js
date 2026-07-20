(function () {
  // Thin adapters, one per catalog entry (ai-tools-catalog.js) - each just
  // calls into the SAME function the matching real UI control already
  // calls (switchTool, runMacro, the email_recon_lookup Tauri command...).
  // No scanning/detection/lookup logic is reimplemented here; see the
  // "macros vs. duplicating logic" discussion this file is the answer to.
  //
  // Every handler returns a Promise resolving to a small JSON-safe object
  // (never throws for an expected/handled failure - "desktop only", "not
  // found", etc. are all normal results the model should be told about,
  // not engine-level errors). A handler only rejects for a genuinely
  // unexpected failure.

  function core() { return window.NetReconNewUICore || {}; }
  function ui() { return window.NetReconNewUI || {}; }

  function isDesktop() {
    var platform = core().platform;
    return !!(platform && typeof platform.getInvoke === "function" && platform.getInvoke());
  }

  // Which section (center/left/right) a tool id actually lives in, read
  // straight from tool-catalog.js's own ui flags - the single source of
  // truth tab-registry.js/navigation-runtime.js already use to decide
  // where a tab's row gets rendered. Center wins when a tool has more than
  // one flag (e.g. "ip-library"/"results-ip" are both an LS panel AND a CS
  // tab) since that's the more prominent surface for a shared tool.
  function toolSection(tool) {
    var catalog = core().toolCatalog || {};
    var entry = catalog[tool];
    if (!entry) return null;
    var uiFlags = entry.ui || {};
    if (uiFlags.showAsTab) return "center";
    if (uiFlags.showInLeftPanel) return "left";
    if (uiFlags.showInRightPanel) return "right";
    return null;
  }

  function openToolsFor(bridge, section) {
    if (section === "left") return bridge.getOpenLeftTools ? bridge.getOpenLeftTools() : [];
    if (section === "right") return bridge.getOpenRightTools ? bridge.getOpenRightTools() : [];
    return bridge.getOpenCenterTools ? bridge.getOpenCenterTools() : [];
  }

  // Routes to the right underlying mechanism for whichever section the id
  // lives in (switchTool() only ever handles the center strip; LS/RS use
  // navigation-runtime.js's activateToolInItsConfiguredSection via the
  // openToolInSection bridge) and verifies the real DOM state afterward,
  // rather than trusting hasTool() (which just answers "does this id exist
  // anywhere in the catalog" and would wrongly report success for an id
  // that exists but can't actually be reached this way).
  function handleSwitchTool(args) {
    var tool = String((args && args.tool) || "").trim();
    if (!tool) return Promise.resolve({ ok: false, reason: "missing_tool_id" });
    var bridge = ui();
    var section = toolSection(tool);
    if (!section) return Promise.resolve({ ok: false, tool: tool, reason: "unknown_tool" });

    if (section === "center") {
      if (!bridge.switchTool) return Promise.resolve({ ok: false, reason: "navigation_unavailable" });
      bridge.switchTool(tool);
      var activated = bridge.getActiveTool ? bridge.getActiveTool() === tool : true;
      return Promise.resolve({ ok: activated, tool: tool, reason: activated ? undefined : "failed_to_activate" });
    }

    if (!bridge.openToolInSection) return Promise.resolve({ ok: false, reason: "navigation_unavailable" });
    bridge.openToolInSection(tool);
    var opened = openToolsFor(bridge, section).indexOf(tool) !== -1;
    return Promise.resolve({ ok: opened, tool: tool, section: section, reason: opened ? undefined : "failed_to_open" });
  }

  function handleCloseTool(args) {
    var tool = String((args && args.tool) || "").trim();
    if (!tool) return Promise.resolve({ ok: false, reason: "missing_tool_id" });
    var bridge = ui();
    var section = toolSection(tool);
    if (!section) return Promise.resolve({ ok: false, tool: tool, reason: "unknown_tool" });

    var wasOpen = openToolsFor(bridge, section).indexOf(tool) !== -1;
    if (!wasOpen) return Promise.resolve({ ok: false, tool: tool, reason: "not_open" });

    if (section === "center") {
      if (!bridge.closeToolTab) return Promise.resolve({ ok: false, reason: "navigation_unavailable" });
      bridge.closeToolTab(tool);
    } else {
      if (!bridge.closeToolInSection) return Promise.resolve({ ok: false, reason: "navigation_unavailable" });
      bridge.closeToolInSection(tool, section);
    }
    var stillOpen = openToolsFor(bridge, section).indexOf(tool) !== -1;
    return Promise.resolve({ ok: !stillOpen, tool: tool });
  }

  // Detect-macro handlers: trigger the exact same button the user would
  // click (macros-runtime.js's runMacro), then poll the same on-screen
  // result element the button's own click handler fills in
  // (navigation-runtime.js's setDetectResultText/startDetectLoader), since
  // runMacro() itself doesn't return the detected value - it's a synthetic
  // click, not a call into a promise-returning detector.
  var DETECT_ELEMENT_IDS = {
    "ext-ip": "v1DetectExtIp",
    "local-ip": "v1DetectLocalIp",
    "subnets": "v1DetectSubnets",
  };
  var DETECT_POLL_MS = 250;
  var DETECT_TIMEOUT_MS = 20000;

  function isLikelyValue(macroId, text) {
    var net = core().utils && core().utils.net;
    if (!text) return false;
    if (macroId === "subnets") return net && typeof net.cidrToRange === "function" ? !!net.cidrToRange(text) : /\//.test(text);
    return net && typeof net.isValidIpv4 === "function" ? net.isValidIpv4(text) : /^\d+\.\d+\.\d+\.\d+$/.test(text);
  }

  function runDetectMacro(macroId) {
    if (!isDesktop()) {
      return Promise.resolve({ ok: false, reason: "desktop_only", message: "This action requires the desktop app; the browser preview cannot run local network/PowerShell detection." });
    }

    var macros = core().macros;
    var elId = DETECT_ELEMENT_IDS[macroId];
    var el = elId ? document.getElementById(elId) : null;
    if (!macros || typeof macros.runMacro !== "function" || !el) {
      return Promise.resolve({ ok: false, reason: "macro_unavailable" });
    }

    var triggered = macros.runMacro(macroId);
    if (!triggered) return Promise.resolve({ ok: false, reason: "macro_unavailable" });

    return new Promise(function (resolve) {
      var waited = 0;
      var timer = setInterval(function () {
        waited += DETECT_POLL_MS;
        var stillLoading = !!el.querySelector(".v1-detect-loader");
        if (!stillLoading) {
          clearInterval(timer);
          var text = String(el.textContent || "").trim();
          resolve({ ok: isLikelyValue(macroId, text), value: text });
          return;
        }
        if (waited >= DETECT_TIMEOUT_MS) {
          clearInterval(timer);
          resolve({ ok: false, reason: "timeout" });
        }
      }, DETECT_POLL_MS);
    });
  }

  function handleReadEmailHistory() {
    var emailReconApi = core().emailReconRuntime;
    if (!emailReconApi || typeof emailReconApi.getHistory !== "function") {
      return Promise.resolve({ ok: false, reason: "email_recon_unavailable" });
    }
    var items = emailReconApi.getHistory().map(function (item) { return item.email; });
    return Promise.resolve({ ok: true, emails: items });
  }

  // Independent second gate for the HIBP portion of a lookup, on top of
  // whatever gate already applied to the parent "run_email_recon_lookup"
  // action - HIBP is a locked node (always "ask"), so this always shows a
  // separate confirmation before HIBP is ever included, even when the
  // parent action itself is "auto". Declining drops just the HIBP flags
  // and lets the rest of the lookup proceed, reusing the backend's own
  // "SkippedDisabled" contract instead of aborting the whole action.
  function gateHibpInclusion(options) {
    var wantsHibp = !!(options.hibpBreaches || options.hibpPastes);
    if (!wantsHibp) return Promise.resolve(options);

    var bridge = ui();
    if (!bridge.openConfirmDialog) return Promise.resolve(options);

    var tr = bridge.tr || function (k) { return k; };
    return bridge.openConfirmDialog(
      tr("aiToolHibpConfirmTitle"),
      tr("aiToolHibpConfirmMessage"),
      tr("aiToolHibpConfirmOk"),
      tr("exitPromptCancel")
    ).then(function (confirmed) {
      if (confirmed) return options;
      var next = Object.assign({}, options);
      next.hibpBreaches = false;
      next.hibpPastes = false;
      return next;
    });
  }

  function handleEmailReconLookup(args) {
    var email = String((args && args.email) || "").trim();
    var net = core().utils && core().utils.net;
    var isValid = net && typeof net.isValidEmail === "function" ? net.isValidEmail(email) : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!isValid) return Promise.resolve({ ok: false, reason: "invalid_email" });

    if (!isDesktop()) {
      return Promise.resolve({ ok: false, reason: "desktop_only", message: "This action requires the desktop app; email lookups make real external HTTP requests that the browser preview cannot perform." });
    }

    var platform = core().platform;
    var emailReconConfig = core().emailReconConfig;
    if (!platform || !emailReconConfig) return Promise.resolve({ ok: false, reason: "email_recon_unavailable" });

    var state = emailReconConfig.getState();
    var options = {
      emailrep: state.emailrep,
      gravatar: state.gravatar,
      github: state.github,
      hibpBreaches: state.hibpBreaches,
      hibpPastes: state.hibpPastes,
      xposedornot: state.xposedornot,
      leakcheck: state.leakcheck,
      hibpApiKey: state.hibpApiKey,
    };

    return gateHibpInclusion(options).then(function (finalOptions) {
      return platform.invoke("email_recon_lookup", { email: email, options: finalOptions }).then(function (result) {
        // Paint the result into the CS Email Recon tab and add it to
        // history the same way the manual Start button does - without
        // this, the lookup runs for real but the user watching the CS
        // tab never sees it, since invoke() by itself has no DOM effect.
        var bridge = ui();
        if (bridge.applyEmailReconResult) bridge.applyEmailReconResult(email, result);
        return { ok: true, result: result };
      });
    }).catch(function (err) {
      return { ok: false, reason: "lookup_failed", message: String((err && err.message) || err) };
    });
  }

  var HANDLERS = {
    switch_tool_tab: handleSwitchTool,
    open_tool_tab: handleSwitchTool,
    close_tool_tab: handleCloseTool,
    detect_external_ip: function () { return runDetectMacro("ext-ip"); },
    detect_local_ip: function () { return runDetectMacro("local-ip"); },
    detect_subnets: function () { return runDetectMacro("subnets"); },
    read_email_recon_history: handleReadEmailHistory,
    run_email_recon_lookup: handleEmailReconLookup,
  };

  function runHandler(toolName, args) {
    var fn = HANDLERS[toolName];
    if (!fn) return Promise.resolve({ ok: false, reason: "unknown_tool" });
    try {
      return Promise.resolve(fn(args || {}));
    } catch (err) {
      return Promise.resolve({ ok: false, reason: "handler_threw", message: String((err && err.message) || err) });
    }
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.aiToolsHandlers = {
    runHandler: runHandler,
  };
})();
