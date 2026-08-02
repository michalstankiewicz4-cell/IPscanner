(function () {
  // Canonical list of tools the AI Assistant can call. Deliberately small
  // and capability-shaped (one entry = one whole logical operation with a
  // real parameter signature), not one entry per UI control - see the
  // "granularity" discussion this catalog implements: exploding this into
  // per-button nodes would break action atomicity and multiply the
  // permission surface without adding real safety.
  //
  // `permissionId` must match a real id in ai-permissions-runtime.js's
  // TREE - that's the single source of truth the engine checks before
  // running anything. `name` is the wire-format function name sent to the
  // model (snake_case, provider-agnostic); `description`/parameter
  // descriptions are plain English on purpose - they're prompt content for
  // the model, not user-facing UI text, matching the existing systemPrompt
  // strings in navigation-runtime.js's sendPrompt().
  // switch/open/close's "tool" parameter description gets the live id list
  // appended at call time (see withLiveToolIds below) instead of a
  // hand-maintained string - a hardcoded list drifts the moment a new tab
  // is added to tool-catalog.js (that's exactly how "language-manager"
  // ended up invisible to the model even though it was a perfectly real,
  // switchable tab). The three navigation tools can target the center tab
  // strip, the left sidebar, or the right settings panel - the handler
  // (ai-tools-handlers.js) resolves which one from the id's own ui flags,
  // so the model just needs a valid id, not the section it lives in.
  var NAV_TOOL_ID_NOTE = " Valid tool ids right now: ";

  var TOOLS = [
    {
      name: "switch_tool_tab",
      permissionId: "navigation.switch",
      description: "Switch to a different tool tab that is already open (or open it if it isn't) - the center tab strip, the left sidebar, or the right settings panel, whichever the id actually lives in. If asked to open something and unsure it'll work, prefer trying anyway and honestly reporting the ok:false result rather than claiming success.",
      parameters: {
        type: "object",
        properties: {
          tool: { type: "string", description: "The tool id to switch to." },
        },
        required: ["tool"],
      },
    },
    {
      name: "open_tool_tab",
      permissionId: "navigation.open-tab",
      description: "Open a specific tool tab and make it active, whether or not it was already open. Prefer this over switch_tool_tab when you specifically mean to open something new for the user.",
      parameters: {
        type: "object",
        properties: {
          tool: { type: "string", description: "The tool id to open - same id list as switch_tool_tab's \"tool\" parameter." },
        },
        required: ["tool"],
      },
    },
    {
      name: "close_tool_tab",
      permissionId: "navigation.close-tab",
      description: "Close a tool tab that is currently open.",
      parameters: {
        type: "object",
        properties: {
          tool: { type: "string", description: "The tool id to close." },
        },
        required: ["tool"],
      },
    },
    {
      name: "detect_external_ip",
      permissionId: "macros.ext-ip",
      description: "Run the app's built-in \"Detect external IP\" macro and return the detected address. Desktop app only - fails gracefully with a clear message when run in a browser preview.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "detect_local_ip",
      permissionId: "macros.local-ip",
      description: "Run the app's built-in \"Detect local IP\" macro and return the detected address. Desktop app only.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "detect_subnets",
      permissionId: "macros.subnets",
      description: "Run the app's built-in \"Detect subnets\" macro and return the detected CIDR range. Desktop app only.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "read_email_recon_history",
      permissionId: "email-recon.history",
      description: "Read the list of email addresses the user has previously looked up in the Email Recon tool (most recent first).",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "run_email_recon_lookup",
      permissionId: "email-recon.lookup",
      description: "Run an OSINT lookup for one email address across the sources the user has enabled in Email Recon settings (EmailRep, Gravatar, GitHub, HIBP breaches/pastes, etc.). Desktop app only - makes real external HTTP requests.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string", description: "The email address to look up." },
        },
        required: ["email"],
      },
    },
  ];

  // A handful of ids are ambiguous by name alone (a user asking for "the
  // IP scanner" almost always means "scan-runner", not "results-ip") - kept
  // as a small static supplement to the dynamic list below, not a
  // replacement for it, so the model gets both full coverage and
  // disambiguation for the ids people actually confuse.
  var ID_HINTS = {
    "scan-runner": "the IP Scanner's scan/config view - what \"the IP scanner\" almost always means",
    "results-ip": "the IP Scanner's results table specifically",
    globe: "3D globe plotting scanned hosts by geolocation",
  };

  function listOpenableToolIds() {
    var catalog = (window.NetReconNewUICore && window.NetReconNewUICore.toolCatalog) || {};
    return Object.keys(catalog).filter(function (id) {
      var ui = catalog[id].ui || {};
      return ui.showAsTab === true || ui.showInLeftPanel === true || ui.showInRightPanel === true;
    }).sort();
  }

  function withLiveToolIds(entry) {
    var ids = listOpenableToolIds();
    var listText = ids.map(function (id) {
      return ID_HINTS[id] ? '"' + id + '" (' + ID_HINTS[id] + ")" : '"' + id + '"';
    }).join(", ");
    var patched = JSON.parse(JSON.stringify(entry));
    patched.parameters.properties.tool.description += NAV_TOOL_ID_NOTE + listText + ".";
    return patched;
  }

  var NAV_TOOL_NAMES = { switch_tool_tab: true, open_tool_tab: true, close_tool_tab: true };

  function getTools() {
    return TOOLS.map(function (t) { return NAV_TOOL_NAMES[t.name] ? withLiveToolIds(t) : t; });
  }

  function getTool(name) {
    return TOOLS.find(function (t) { return t.name === name; }) || null;
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.aiToolsCatalog = {
    getTools: getTools,
    getTool: getTool,
  };
})();
