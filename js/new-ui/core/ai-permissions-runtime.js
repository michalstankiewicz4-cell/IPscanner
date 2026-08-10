(function () {
  // AI Tools & Permissions (CS tab opened from General settings' "Manage
  // AI Tools & Permissions..." button). UI/settings only for now - nothing
  // reads this to actually gate a real AI tool-use call yet, since that
  // execution engine doesn't exist. Every value-bearing tree node still
  // saves/loads for real, so the panel is fully usable today and wiring
  // real enforcement later is just "read this store" - no UI changes.
  var STORAGE_KEY = "netrecon_ai_permissions_v1";
  var AUDIT_LOG_KEY = "netrecon_ai_audit_log_v1";
  var ACTION_COUNT_KEY = "netrecon_ai_action_count_v1";

  // Each node: id (dotted path), labelKey/fallback, optional kind
  // ("read" | "action" - only value-bearing nodes get one; pure grouping
  // nodes like "email-recon" itself don't), optional children, optional
  // locked (a fixed level that can never change - e.g. HIBP always asks,
  // regardless of profile, because it's the one source that costs money/
  // has a tight rate limit).
  var TREE = [
    {
      id: "email-recon", labelKey: "aiPermNodeEmailRecon", fallback: "📧 Email Recon",
      children: [
        {
          id: "email-recon.lookup", labelKey: "aiPermNodeEmailReconLookup", fallback: "Uruchom lookup", kind: "action",
          children: [
            { id: "email-recon.lookup.hibp", labelKey: "aiPermNodeEmailReconHibp", fallback: "HIBP (płatne)", kind: "action", locked: "ask" },
          ],
        },
        { id: "email-recon.history", labelKey: "aiPermNodeEmailReconHistory", fallback: "Czytaj historię", kind: "read" },
      ],
    },
    {
      // Not yet wired to a real AI tool adapter - shown but grayed out
      // (see "unavailable" below) until that integration exists.
      id: "network-monitor", labelKey: "aiPermNodeNetworkMonitor", fallback: "🖧 Network Monitor", unavailable: true,
      children: [
        { id: "network-monitor.read", labelKey: "aiPermNodeNetworkMonitorRead", fallback: "Czytaj dane", kind: "read" },
        { id: "network-monitor.live", labelKey: "aiPermNodeNetworkMonitorLive", fallback: "Start/stop monitorowania", kind: "action" },
        { id: "network-monitor.send", labelKey: "aiPermNodeNetworkMonitorSend", fallback: "Wyślij IP do skanera", kind: "action" },
      ],
    },
    {
      id: "ip-scanner", labelKey: "aiPermNodeIpScanner", fallback: "🔍 IP Scanner", unavailable: true,
      children: [
        { id: "ip-scanner.read", labelKey: "aiPermNodeIpScannerRead", fallback: "Czytaj wyniki", kind: "read" },
        { id: "ip-scanner.scan", labelKey: "aiPermNodeIpScannerScan", fallback: "Uruchom skan", kind: "action" },
      ],
    },
    {
      id: "macros", labelKey: "aiPermNodeMacros", fallback: "🧩 Makra",
      children: [
        { id: "macros.ext-ip", labelKey: "macroExtIpName", fallback: "Wykryj zewnętrzne IP", kind: "action" },
        { id: "macros.local-ip", labelKey: "macroLocalIpName", fallback: "Wykryj lokalne IP", kind: "action" },
        { id: "macros.subnets", labelKey: "macroSubnetsName", fallback: "Wykryj podsieci", kind: "action" },
      ],
    },
    {
      id: "navigation", labelKey: "aiPermNodeNavigation", fallback: "🔀 Nawigacja",
      children: [
        { id: "navigation.switch", labelKey: "aiPermNodeNavigationSwitch", fallback: "Przełącz narzędzie/zakładkę", kind: "action" },
        { id: "navigation.open-tab", labelKey: "aiPermNodeNavigationOpenTab", fallback: "Otwórz zakładkę", kind: "action" },
        { id: "navigation.close-tab", labelKey: "aiPermNodeNavigationCloseTab", fallback: "Zamknij zakładkę", kind: "action" },
      ],
    },
  ];

  var VALID_LEVELS = ["off", "auto", "ask"];
  var PROFILE_RULES = {
    readonly: { read: "auto", action: "off" },
    assisted: { read: "auto", action: "ask" },
    autonomous: { read: "auto", action: "auto" },
  };
  var VALID_PROFILES = ["readonly", "assisted", "autonomous", "custom"];

  // Visits every "value-bearing" node - a leaf (no children), or a node
  // that has both children AND its own kind (email-recon.lookup: a real
  // toggle in its own right, not just a folder). Pure grouping nodes
  // (email-recon, network-monitor, ...) are skipped - their displayed
  // value is always computed from children, never stored directly.
  function walkValueNodes(nodes, fn) {
    nodes.forEach(function (node) {
      if (node.kind || !node.children || !node.children.length) fn(node);
      if (node.children) walkValueNodes(node.children, fn);
    });
  }

  function findNode(nodes, id) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) return nodes[i];
      if (nodes[i].children) {
        var found = findNode(nodes[i].children, id);
        if (found) return found;
      }
    }
    return null;
  }

  function makeDefaultState() {
    var levels = {};
    walkValueNodes(TREE, function (node) {
      levels[node.id] = node.locked || PROFILE_RULES.assisted[node.kind];
    });
    return {
      profile: "assisted",
      levels: levels,
      maxActionsPerConversation: 10,
      lockSettings: false,
    };
  }

  function cloneState(state) {
    var fallback = makeDefaultState();
    var input = state && typeof state === "object" ? state : {};
    var inputLevels = input.levels && typeof input.levels === "object" ? input.levels : {};
    var levels = {};
    walkValueNodes(TREE, function (node) {
      if (node.locked) { levels[node.id] = node.locked; return; }
      var v = inputLevels[node.id];
      levels[node.id] = VALID_LEVELS.indexOf(v) !== -1 ? v : fallback.levels[node.id];
    });
    return {
      profile: VALID_PROFILES.indexOf(input.profile) !== -1 ? input.profile : fallback.profile,
      levels: levels,
      maxActionsPerConversation: Number(input.maxActionsPerConversation) > 0 ? Number(input.maxActionsPerConversation) : fallback.maxActionsPerConversation,
      lockSettings: input.lockSettings === true,
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return cloneState(makeDefaultState());
      return cloneState(JSON.parse(raw));
    } catch (_) {
      return cloneState(makeDefaultState());
    }
  }

  function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* ignore */ }
  }

  var currentState = loadState();

  function getState() { return cloneState(currentState); }

  function replaceState(next) {
    currentState = cloneState(next);
    saveState(currentState);
    return getState();
  }

  // Sets every level a preset profile controls, leaving locked nodes
  // (e.g. HIBP) untouched regardless of how permissive the profile is -
  // "Autonomous" still can't skip confirmation for the one source that
  // actually costs money.
  function applyProfile(profileName) {
    var rules = PROFILE_RULES[profileName];
    if (!rules) return getState(); // "custom" - nothing to apply, it's a read-out state
    var next = getState();
    walkValueNodes(TREE, function (node) {
      if (node.locked) return;
      next.levels[node.id] = rules[node.kind];
    });
    next.profile = profileName;
    return replaceState(next);
  }

  // A manual per-node edit (leaf or a grouping node's own row) always
  // marks the profile as "Custom" - simplest, most predictable rule
  // rather than trying to detect whether the result still happens to
  // match a preset.
  function cascadeSet(node, value, levels) {
    if (node.locked) return;
    if (node.kind || !node.children || !node.children.length) levels[node.id] = value;
    if (node.children) node.children.forEach(function (child) { cascadeSet(child, value, levels); });
  }

  function setNodeLevel(id, value) {
    var node = findNode(TREE, id);
    if (!node || node.locked || VALID_LEVELS.indexOf(value) === -1) return getState();
    var next = getState();
    cascadeSet(node, value, next.levels);
    next.profile = "custom";
    return replaceState(next);
  }

  // Rendering helper: a grouping node's (or a hybrid node's) displayed
  // value is computed from its own stored value (if it has one) plus all
  // descendants - "mixed" whenever they disagree, which is exactly what
  // should happen e.g. for "Uruchom lookup" once its only child (HIBP) is
  // permanently locked to "ask" and the parent itself is set to anything
  // else.
  function computeDisplayLevel(node) {
    var state = getState();
    function compute(n) {
      var own = n.locked ? n.locked : (n.kind ? state.levels[n.id] : null);
      if (!n.children || !n.children.length) return own;
      var childVals = n.children.map(compute);
      var all = own !== null ? [own].concat(childVals) : childVals;
      var allSame = all.every(function (v) { return v === all[0]; });
      return allSame ? all[0] : "mixed";
    }
    return compute(node);
  }

  // Execution-time gate for one concrete leaf id (e.g. "navigation.switch"
  // or "email-recon.lookup.hibp") - unlike computeDisplayLevel (which
  // aggregates a whole subtree for the UI, and can report "mixed"), the
  // engine always asks about one specific node it's about to run, so this
  // only ever returns a real, storable level. Unknown ids are treated as
  // "off" - failing closed is the only safe default for an id the tree
  // doesn't recognize.
  function resolveLevel(id) {
    var node = findNode(TREE, id);
    if (!node) return "off";
    if (node.locked) return node.locked;
    var state = getState();
    var v = state.levels[id];
    return VALID_LEVELS.indexOf(v) !== -1 ? v : "off";
  }

  function loadAuditLog() {
    try {
      var raw = localStorage.getItem(AUDIT_LOG_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function emitAuditLogChanged() {
    try { document.dispatchEvent(new CustomEvent("newui:ai-audit-log-changed")); } catch (_) { /* ignore */ }
  }

  function clearAuditLog() {
    try { localStorage.setItem(AUDIT_LOG_KEY, "[]"); } catch (_) { /* ignore */ }
    emitAuditLogChanged();
  }

  // Called by the tool-calling engine once per resolved tool call (allowed,
  // declined, or blocked) - the log stays capped at 100 entries so it can't
  // grow the localStorage payload unbounded over a long-lived conversation.
  // Fires newui:ai-audit-log-changed so the AI Permissions tab (if open at
  // the time - the engine runs independently of which tab is visible) can
  // refresh its log view live instead of only on next render.
  function appendAuditLog(entry) {
    try {
      var log = loadAuditLog();
      log.push({
        time: new Date().toISOString(),
        toolId: String((entry && entry.toolId) || ""),
        args: (entry && entry.args) || {},
        outcome: String((entry && entry.outcome) || ""),
        detail: (entry && entry.detail) || null,
      });
      localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(log.slice(-100)));
    } catch (_) { /* ignore */ }
    emitAuditLogChanged();
  }

  // "Max actions per conversation" guardrail counter. This app has a single
  // eternal chat thread (no new-conversation button yet), so "a
  // conversation" is defined as "since the visible history was last empty" -
  // the engine calls resetActionCount() itself right before the first turn
  // of a fresh thread, and incrementActionCount() once per executed tool
  // call after that.
  function getActionCount() {
    try {
      var n = Number(localStorage.getItem(ACTION_COUNT_KEY));
      return n > 0 ? n : 0;
    } catch (_) {
      return 0;
    }
  }

  function incrementActionCount() {
    var next = getActionCount() + 1;
    try { localStorage.setItem(ACTION_COUNT_KEY, String(next)); } catch (_) { /* ignore */ }
    return next;
  }

  function resetActionCount() {
    try { localStorage.setItem(ACTION_COUNT_KEY, "0"); } catch (_) { /* ignore */ }
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.aiPermissions = {
    TREE: TREE,
    findNode: function (id) { return findNode(TREE, id); },
    getState: getState,
    replaceState: replaceState,
    applyProfile: applyProfile,
    setNodeLevel: setNodeLevel,
    computeDisplayLevel: computeDisplayLevel,
    resolveLevel: resolveLevel,
    loadAuditLog: loadAuditLog,
    clearAuditLog: clearAuditLog,
    appendAuditLog: appendAuditLog,
    getActionCount: getActionCount,
    incrementActionCount: incrementActionCount,
    resetActionCount: resetActionCount,
  };
})();
