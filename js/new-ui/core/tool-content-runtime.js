(function () {
  // Per-tool content render/wire functions for LS/RS's shared "generic
  // content slot" (see navigation-runtime.js's registerTabSections()
  // "left"/"right" onActivate hooks, and tab-registry.js's comment on why
  // this is separate from the chrome engine). Mirrors panel-content-
  // runtime.js's toolRenderers dispatch shape for CS - same idea, kept in
  // its own file since it's LS/RS-specific and CS's own mechanism is left
  // completely untouched.
  //
  // Two kinds of entries: {render, wire} tools are safe to tear down and
  // rebuild on demand (static content, or already-idempotent wiring proven
  // by CS reusing the same function); {move, getNode, displayValue} tools
  // (scan-runner/config/assistant, near the bottom of this file) have live
  // DOM-only state that regeneration would destroy, so their one persistent
  // node is reparented instead - see makeMovableEntry below.
  //
  // Each entry: { render: function(tr) -> htmlString, wire: function(rootEl) | null }.
  // render() must bake in tr()'d text directly (not rely on ids for a
  // later id-based translation pass) - content injected after boot is
  // invisible to bootstrap-runtime.js's one-time applyStaticTranslations().
  var toolContentRuntime = {};

  toolContentRuntime["shellcraft-library"] = {
    render: function () {
      return '<div id="v1ShellCraftLibrary" class="v1-shellcraft-library"></div>';
    },
    wire: function () {
      if (window.NetReconNewUI && window.NetReconNewUI.wireShellCraftPanels) {
        window.NetReconNewUI.wireShellCraftPanels();
      }
    },
  };

  toolContentRuntime["shellcraft-inspector"] = {
    render: function () {
      return '<div id="v1ShellCraftInspector" class="v1-shellcraft-inspector"></div>';
    },
    wire: function () {
      if (window.NetReconNewUI && window.NetReconNewUI.wireShellCraftPanels) {
        window.NetReconNewUI.wireShellCraftPanels();
      }
    },
  };

  var LOREM_PARAGRAPHS = [
    "Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.",
    "Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt.",
    "Ut labore et dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam.",
    "Nisi ut aliquid ex ea commodi consequatur? Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur.",
    "Vel illum qui dolorem eum fugiat quo voluptas nulla pariatur, at vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis.",
    "Praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident.",
    "Similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga et harum quidem rerum facilis est.",
    "Et expedita distinctio nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime.",
    "Placeat facere possimus, omnis voluptas assumenda est omnis dolor repellendus temporibus autem quibusdam et aut officiis.",
    "Debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae non recusandae itaque earum rerum.",
    "Hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus maiores alias consequatur aut perferendis doloribus asperiores.",
    "Repellat class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos curabitur suscipit.",
    "Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae praesent libero sed cursus ante dapibus.",
    "Eleifend tellus, integer feugiat scelerisque varius morbi enim nunc faucibus a pellentesque sit amet porttitor eget dolor.",
  ];

  // lorem-ipsum-left/-right: independent tools from CS's own "lorem-ipsum"
  // (panel-content-runtime.js's renderLoremIpsumTool, different paragraphs -
  // that's fine now, they're 3 separate placeholder tools, not the same
  // tool id shown in 3 places, see tool-catalog.js's comment).
  function renderLoremIpsum(tr) {
    var heading = tr ? tr("toolTitle_lorem_ipsum") : "Lorem Ipsum";
    var body = LOREM_PARAGRAPHS.map(function (p) { return "<p>" + p + "</p>"; }).join("");
    return '<div class="tool-detail"><h4>' + heading + "</h4>" + body + "</div>";
  }
  toolContentRuntime["lorem-ipsum-left"] = { render: renderLoremIpsum, wire: null };
  toolContentRuntime["lorem-ipsum-right"] = { render: renderLoremIpsum, wire: null };

  // This is specifically LS's tiny 3-item launcher list ("open the real
  // results-ip/ip-library/presets tool"), not the actual results table -
  // CS's results-ip (the real table) is a completely separate, much
  // bigger renderer in panel-content-runtime.js, untouched by this file.
  toolContentRuntime["results-ip"] = {
    render: function (tr) {
      var t = tr || function (k) { return k; };
      return (
        '<ul class="v1-tool-list">' +
        '<li data-result-tab="results-ip" class="v1-result-nav-item">🖥 ' + t("resultsIp") + "</li>" +
        '<li data-result-tab="ip-library" class="v1-result-nav-item">🗂 ' + t("ipLibraryTabTitle") + "</li>" +
        '<li data-result-tab="presets" class="v1-result-nav-item">⭐ ' + t("tabPresetsTitle") + "</li>" +
        "</ul>"
      );
    },
    // bindResultTabs() is delegated (document-level), so freshly rendered
    // <li> rows work immediately with no explicit rewiring needed.
    wire: null,
  };

  toolContentRuntime["ip-library"] = {
    // ipLibraryPanelNote/ipLibraryCountriesLabel's labels were already
    // untranslated (dead applyStaticTranslations() lookups with no
    // matching tr() call) before this migration - preserved as-is
    // (English-only) rather than expanding scope with new i18n keys here.
    render: function (tr) {
      var t = tr || function (k) { return k; };
      return (
        '<ul class="v1-tool-list">' +
        "<li>" +
        '<div class="v1-section-header"><strong>' + t("ipLibraryTitle") + '</strong><span class="v1-collapse-arrow">▼</span></div>' +
        '<div class="v1-section-body">' +
        '<div class="v1-scanner-actions v1-iplib-actions">' +
        '<button type="button" data-iplib-action="update" id="v1IpLibraryUpdateBtn">' + t("ipLibraryUpdateBtn") + "</button>" +
        '<button type="button" data-iplib-action="load" id="v1IpLibraryLoadBtn">' + t("ipLibraryLoadBtn") + "</button>" +
        '<button type="button" data-iplib-action="clear" id="v1IpLibraryClearBtn">' + t("ipLibraryClearBtn") + "</button>" +
        "</div>" +
        "</div>" +
        "</li>" +
        "<li>" +
        '<div class="v1-section-header"><strong>Country IP Library • Range Selection</strong><span class="v1-collapse-arrow">▼</span></div>' +
        '<div class="v1-section-body">' +
        '<div class="v1-import-manager-note">Update the country range library using a local PowerShell script and keep a cached copy.</div>' +
        '<div class="v1-iplib-grid">' +
        '<div class="v1-iplib-field">' +
        '<label for="v1IpLibraryCountryCodes">Country codes</label>' +
        '<textarea id="v1IpLibraryCountryCodes" class="v1-iplib-countries" autocomplete="off" rows="3" placeholder="pl,cn,ru,us,de,fr,gb,jp,kr,br,in,au,nl,ua,cz,se,no,fi,tr,ir,sa,za,ar,mx,ca,it,es"></textarea>' +
        "</div>" +
        '<div class="v1-iplib-field">' +
        '<label for="v1IpLibraryTopRanges">' + t("ipLibraryTopRangesLabel") + "</label>" +
        '<input id="v1IpLibraryTopRanges" class="v1-iplib-topranges" type="number" min="10" max="500" step="10" value="120" />' +
        "</div>" +
        "</div>" +
        "</div>" +
        "</li>" +
        "</ul>"
      );
    },
    wire: function (rootEl) {
      if (window.NetReconNewUI && window.NetReconNewUI.wireIpLibraryPanel) {
        window.NetReconNewUI.wireIpLibraryPanel(rootEl);
      }
    },
  };

  // Network Monitor's live-poll interval (per section) and the two
  // sections' display order are small pieces of state needed both here
  // (to seed the LS panel's initial HTML on render) and in panel-
  // interactions-runtime.js (to actually run the timers and reorder CS's
  // DOM) - this file loads first, so it owns the read/write helpers and
  // exposes them flatly rather than each file keeping its own copy.
  var NETMON_ORDER_KEY = "netrecon_netmon_order_v1";
  var NETMON_SETTINGS_KEY = "netrecon_netmon_settings_v1";
  var NETMON_DEFAULT_ORDER = ["connections", "lan"];
  var NETMON_DEFAULT_SETTINGS = { connectionsIntervalSec: 3, lanIntervalSec: 5 };

  function loadNetMonOrder() {
    try {
      var raw = localStorage.getItem(NETMON_ORDER_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === 2 && parsed.indexOf("connections") !== -1 && parsed.indexOf("lan") !== -1) {
          return parsed;
        }
      }
    } catch (e) { /* fall through to default */ }
    return NETMON_DEFAULT_ORDER.slice();
  }

  function saveNetMonOrder(order) {
    try { localStorage.setItem(NETMON_ORDER_KEY, JSON.stringify(order)); } catch (e) { /* ignore */ }
  }

  function loadNetMonSettings() {
    try {
      var raw = localStorage.getItem(NETMON_SETTINGS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        return {
          connectionsIntervalSec: Number(parsed.connectionsIntervalSec) > 0 ? Number(parsed.connectionsIntervalSec) : NETMON_DEFAULT_SETTINGS.connectionsIntervalSec,
          lanIntervalSec: Number(parsed.lanIntervalSec) > 0 ? Number(parsed.lanIntervalSec) : NETMON_DEFAULT_SETTINGS.lanIntervalSec,
        };
      }
    } catch (e) { /* fall through to default */ }
    return { connectionsIntervalSec: NETMON_DEFAULT_SETTINGS.connectionsIntervalSec, lanIntervalSec: NETMON_DEFAULT_SETTINGS.lanIntervalSec };
  }

  function saveNetMonSettings(settings) {
    try { localStorage.setItem(NETMON_SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.netMonState = {
    loadOrder: loadNetMonOrder,
    saveOrder: saveNetMonOrder,
    loadSettings: loadNetMonSettings,
    saveSettings: saveNetMonSettings,
  };

  // Network Monitor's LS panel: options only (live-poll Start/Stop with a
  // configurable interval, one-shot Scan, and Move Up/Down to reorder the
  // two sections - mirrored into CS's own section order by panel-
  // interactions-runtime.js). CS itself (panel-content-runtime.js's
  // renderNetworkMonitorTool) is untouched except for losing its own
  // inline Refresh buttons, now redundant with this panel.
  toolContentRuntime["network-monitor"] = {
    render: function (tr) {
      var t = tr || function (k) { return k; };
      var order = loadNetMonOrder();
      var settings = loadNetMonSettings();

      function sectionHtml(kind) {
        var titleKey = kind === "connections" ? "netMonConnectionsTitle" : "netMonLanDevicesTitle";
        var intervalVal = kind === "connections" ? settings.connectionsIntervalSec : settings.lanIntervalSec;
        return (
          "<li data-netmon-ls-section=\"" + kind + "\">" +
          "<div class=\"v1-section-header\"><strong>" + t(titleKey) + "</strong><span class=\"v1-collapse-arrow\">▼</span></div>" +
          "<div class=\"v1-section-body\">" +
          "<div class=\"v1-config-field-row\">" +
          "<label>" + t("netMonIntervalLabel") + "</label>" +
          "<input type=\"number\" min=\"1\" max=\"3600\" step=\"1\" value=\"" + intervalVal + "\" data-netmon-interval-input=\"" + kind + "\" />" +
          "</div>" +
          "<div class=\"v1-scanner-actions v1-scanner-actions--spaced\">" +
          "<button type=\"button\" data-netmon-action=\"start-" + kind + "\">▶ " + t("netMonLiveStartBtn") + "</button>" +
          "<button type=\"button\" data-netmon-action=\"stop-" + kind + "\">■ " + t("netMonLiveStopBtn") + "</button>" +
          "<button type=\"button\" data-netmon-action=\"scan-" + kind + "\">⟳ " + t("netMonScanBtn") + "</button>" +
          "</div>" +
          "<div class=\"v1-scanner-actions v1-scanner-actions--spaced\">" +
          "<button type=\"button\" data-netmon-action=\"move-up-" + kind + "\">↑ " + t("netMonMoveUpBtn") + "</button>" +
          "<button type=\"button\" data-netmon-action=\"move-down-" + kind + "\">↓ " + t("netMonMoveDownBtn") + "</button>" +
          "</div>" +
          "</div>" +
          "</li>"
        );
      }

      // UI only, per explicit instruction - not wired to anything yet
      // (no click/change handlers exist for these data-netmon-send-*
      // attributes anywhere). disabled on every control, same "visible but
      // inert" treatment as OS Detection's checkbox in the Config tab,
      // rather than hidden behind "Show unfinished tools" - the point right
      // now is to review the layout, not to hide it.
      var sendSectionHtml =
        "<li>" +
        "<div class=\"v1-section-header\"><strong>" + t("netMonSendTitle") + "</strong><span class=\"v1-collapse-arrow\">▼</span></div>" +
        "<div class=\"v1-section-body\">" +
        "<div class=\"v1-scanner-actions v1-scanner-actions--spaced\">" +
        "<button type=\"button\" data-netmon-action=\"send-to-scanner\" disabled>➜ " + t("netMonSendBtn") + "</button>" +
        "</div>" +
        "<label class=\"v1-config-checkbox-row\">" +
        "<input type=\"checkbox\" data-netmon-send-auto disabled />" +
        "<span>" + t("netMonSendAutoLabel") + "</span>" +
        "</label>" +
        "<label class=\"v1-config-checkbox-row\">" +
        "<input type=\"checkbox\" data-netmon-send-source=\"connections-local\" checked disabled />" +
        "<span>" + t("netMonSendSrcConnLocal") + "</span>" +
        "</label>" +
        "<label class=\"v1-config-checkbox-row\">" +
        "<input type=\"checkbox\" data-netmon-send-source=\"connections-remote\" checked disabled />" +
        "<span>" + t("netMonSendSrcConnRemote") + "</span>" +
        "</label>" +
        "<label class=\"v1-config-checkbox-row\">" +
        "<input type=\"checkbox\" data-netmon-send-source=\"lan-ip\" checked disabled />" +
        "<span>" + t("netMonSendSrcLanIp") + "</span>" +
        "</label>" +
        "</div>" +
        "</li>";

      return "<ul class=\"v1-tool-list\" data-netmon-ls-list>" + order.map(sectionHtml).join("") + sendSectionHtml + "</ul>";
    },
    wire: function (rootEl) {
      if (window.NetReconNewUI && window.NetReconNewUI.wireNetworkMonitorLeftPanel) {
        window.NetReconNewUI.wireNetworkMonitorLeftPanel(rootEl);
      }
    },
  };

  // "move" entries: unlike the render/wire entries above (fresh HTML on
  // every activation - fine for stateless content), these 3 tools have
  // live state that only exists in their DOM (typed-but-unsaved form
  // fields, assistant's chat history - appendMessage() appends straight to
  // the DOM with zero JS-side backing store). Regenerating them would
  // destroy that state, so instead activateGenericContent() (navigation-
  // runtime.js) physically reparents the SAME node (never recreated) into
  // whichever section is active - getNode() always returns the one
  // original element, found lazily (not at boot) so load order doesn't
  // matter and nothing happens until a real activation occurs.
  //
  // displayValue: visibility is NOT delegated to tab-registry.js's native
  // pane-toggle here (unlike a first pass assumed) - each section's native
  // toggle looks for ITS OWN identifying attribute/class
  // (data-sidebar-tool-panel for left, .v1-right-pane[data-v1-right-pane]
  // for right), which these nodes only carry ONE of (whichever was their
  // original home) - so a cross-section toggle call always no-ops (finds
  // nothing) and never shows/hides them. activateGenericContent() manages
  // visibility itself via this node's inline style.display instead, which
  // wins by specificity over both sections' class/attribute CSS rules.
  function makeMovableEntry(selector, displayValue) {
    var cached = null;
    return {
      move: true,
      displayValue: displayValue,
      getNode: function () {
        if (!cached) cached = document.querySelector(selector);
        return cached;
      },
    };
  }
  toolContentRuntime["scan-runner"] = makeMovableEntry('[data-sidebar-tool-panel="scan-runner"]', "flex");
  toolContentRuntime["config"] = makeMovableEntry('.v1-right-pane[data-v1-right-pane="config"]', "block");
  toolContentRuntime["assistant"] = makeMovableEntry('.v1-right-pane[data-v1-right-pane="assistant"]', "block");
  // Email Recon's LS panel (email input/history) and RS pane (Sources/API
  // Keys/Profiles) are the same kind of live-DOM-state static content as
  // scan-runner/config above (not CS-tool content that regenerates via
  // buildDetailHtml) - without a "move" entry here, activateGenericContent()
  // falls through to its buildDetailHtml() fallback and renders a SECOND,
  // duplicate copy of the CS results shell into the LS generic-content slot.
  toolContentRuntime["email-recon"] = makeMovableEntry('[data-sidebar-tool-panel="email-recon"]', "flex");
  toolContentRuntime["email-recon-config"] = makeMovableEntry('.v1-right-pane[data-v1-right-pane="email-recon-config"]', "block");
  // Same live-DOM-state static pane as config/assistant/email-recon-config
  // above - without this, activating it falls through to the
  // buildDetailHtml() fallback, which has no real entry for it and prints
  // the raw tool id ("ai-properties") as literal text into the generic
  // content slot, stacked underneath the real pane.
  toolContentRuntime["ai-properties"] = makeMovableEntry('.v1-right-pane[data-v1-right-pane="ai-properties"]', "block");

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.toolContentRuntime = toolContentRuntime;
})();
