(function () {
  var toolCatalog = {
    // --- shell keys ---
    // Options: Language + Import Tools stay in the base shell per
    // FUTURE_PLUGIN_SHELL.md; Help menu items (versions/about/license) also
    // stay in the base shell per SHELL_PROGRESS.md. Judgment call, not settled
    // fact — flag if a future split disagrees.
    //
    // icon/labelKey/ui are read by tab-registry.js (LS/CS/RS tab-strip
    // chrome) - titleKey/textKey/points are unrelated, read by
    // panel-content-runtime.js's buildDetailHtml()/infoFor() for a tool's
    // in-content <h4>/body text. The two can differ (e.g. results-ip's
    // titleKey is "Result Data List" but its tab label is "IP Results") -
    // that's expected, not a bug, see i18n.js's tabLabel_* comment.
    // ui.order positions a tab within its own section's strip (lower =
    // earlier); ui.leftOrder/rightOrder override it for LS/RS specifically
    // (CS only ever uses ui.order).
    general: {
      titleKey: "toolTitle_general",
      textKey: "toolText_general",
      points: ["Auto load last session", "Per-setting remember toggles", "Applies on next launch"],
      icon: "⚙️",
      labelKey: "tabGeneralTitle",
      ui: { showAsTab: true, order: 40 }
    },
    "import-tool": {
      titleKey: "toolTitle_import_tool",
      textKey: "toolText_import_tool",
      points: ["Paste manifest JSON", "List installed tools", "Uninstall by id"],
      icon: "📦",
      labelKey: "importToolTitle",
      ui: { showAsTab: true, order: 50 }
    },
    "language-manager": {
      titleKey: "toolTitle_language_manager",
      textKey: "toolText_language_manager",
      points: ["Add custom dictionaries", "Activate language", "List available languages"],
      icon: "🌐",
      labelKey: "tabLabel_language_manager",
      ui: { showAsTab: true, order: 60 }
    },
    versions: {
      titleKey: "toolTitle_versions",
      textKey: "toolText_versions",
      points: ["Release history", "Major updates", "Quality fixes"],
      icon: "📘",
      labelKey: "tabLabel_versions",
      ui: { showAsTab: true, order: 10 }
    },
    about: {
      titleKey: "toolTitle_about",
      textKey: "toolText_about",
      points: ["Project summary", "Author details", "Support links"],
      icon: "ℹ️",
      labelKey: "tabAboutTitle",
      ui: { showAsTab: true, order: 70 }
    },
    license: {
      titleKey: "toolTitle_license",
      textKey: "toolText_license",
      points: ["MIT license", "Permission notice", "Copyright notice"],
      icon: "📄",
      labelKey: "tabLicenseTitle",
      ui: { showAsTab: true, order: 80 }
    },
    // 3 independent placeholder tools, not one id shared across sections -
    // each opens/closes on its own, and each is free to have its own
    // content. "lorem-ipsum" (CS) keeps the titleKey/textKey/points used by
    // panel-content-runtime.js's own renderer; lorem-ipsum-left/-right have
    // no CS presence, so no titleKey/textKey/points needed (same pattern as
    // shellcraft-library/shellcraft-inspector below) - their content comes
    // from tool-content-runtime.js instead.
    "lorem-ipsum": {
      titleKey: "toolTitle_lorem_ipsum",
      textKey: "toolText_lorem_ipsum",
      points: [],
      icon: "📄",
      labelKey: "toolTitle_lorem_ipsum",
      ui: { showAsTab: true, order: 100 }
    },
    "lorem-ipsum-left": {
      icon: "📄",
      labelKey: "toolTitle_lorem_ipsum",
      ui: { showInLeftPanel: true, leftOrder: 50 }
    },
    "lorem-ipsum-right": {
      icon: "📄",
      labelKey: "toolTitle_lorem_ipsum",
      ui: { showInRightPanel: true, rightOrder: 30 }
    },
    // ShellCraft stays in the base shell (confirmed by the user, not a
    // judgment call like the ones above) - see SHELL_PROGRESS.md.
    shellcraft: {
      titleKey: "toolTitle_shellcraft",
      textKey: "toolText_shellcraft",
      points: ["Shell script library", "Command inspector", "Empty starter workspace"],
      icon: "🛠",
      labelKey: "tabLabel_shellcraft",
      ui: { showAsTab: true, order: 110 }
    },
    // ShellCraft's Library (LS) and Inspector (RS) are distinct tabs from
    // the canvas above (different content, different ids) - not the same
    // tool shown in 3 places, so they get their own registry entries rather
    // than extra ui flags on "shellcraft" itself.
    "shellcraft-library": {
      icon: null,
      labelKey: "tabLabel_shellcraft_library",
      ui: { showInLeftPanel: true, leftOrder: 30 }
    },
    "shellcraft-inspector": {
      icon: null,
      labelKey: "tabLabel_shellcraft_inspector",
      ui: { showInRightPanel: true, rightOrder: 20 }
    },
    // Pulpit: a manually-curated visual inventory of computers - same
    // three-entry Library(LS)/Canvas(CS)/Inspector(RS) shape as ShellCraft
    // above, reusing its canvas/drag/selection architecture.
    pulpit: {
      titleKey: "toolTitle_pulpit",
      textKey: "toolText_pulpit",
      points: ["Freely placed computer icons", "Per-computer notes", "Remote / local / virtual / own types"],
      icon: "🖥",
      labelKey: "tabLabel_pulpit",
      ui: { showAsTab: true, order: 115 }
    },
    "pulpit-library": {
      icon: null,
      labelKey: "tabLabel_pulpit_library",
      ui: { showInLeftPanel: true, leftOrder: 35 }
    },
    "pulpit-inspector": {
      icon: null,
      labelKey: "tabLabel_pulpit_inspector",
      ui: { showInRightPanel: true, rightOrder: 25 }
    },
    // Agent Profiles: the user's own account-creation identities (nickname/
    // email/login/password/note/attachments), reachable from Options (not
    // Tools) - see index.html's Options dropdown. LS list + CS detail card
    // only, no RS - reuses Pulpit's selection-event mechanism relocated
    // (LS drives selection here, instead of CS).
    "agent-profiles": {
      titleKey: "toolTitle_agent_profiles",
      textKey: "toolText_agent_profiles",
      points: ["One login+password per identity", "Optional photo and file attachments", "Saved with the session file"],
      icon: "🪪",
      labelKey: "tabLabel_agent_profiles",
      ui: { showAsTab: true, order: 116 }
    },
    "agent-profiles-library": {
      icon: null,
      labelKey: "tabLabel_agent_profiles_library",
      ui: { showInLeftPanel: true, leftOrder: 36 }
    },

    // --- ip-scanner tool keys ---
    "scan-runner": {
      titleKey: "toolTitle_scan_runner",
      textKey: "toolText_scan_runner",
      points: ["IP range + presets", "Concurrency control", "Export/import results"],
      icon: null,
      labelKey: "ipScanner",
      ui: { showInLeftPanel: true, leftOrder: 10 }
    },
    globe: {
      titleKey: "toolTitle_globe",
      textKey: "toolText_globe",
      points: ["Interactive 3D globe", "Scanned host markers", "On-demand geolocation"],
      icon: "🌍",
      labelKey: "tabLabel_globe",
      ui: { showAsTab: true, order: 120 }
    },
    "ip-library": {
      titleKey: "toolTitle_ip_library",
      textKey: "toolText_ip_library",
      points: ["Country IP ranges", "PowerShell auto update", "Local cache preview"],
      icon: "🗂",
      labelKey: "ipLibraryTabTitle",
      ui: { showInLeftPanel: true, leftOrder: 20, showAsTab: true, order: 20 }
    },
    presets: {
      titleKey: "toolTitle_presets",
      textKey: "toolText_presets",
      points: ["Built-in scan groups", "Editable custom ports", "Default preset choice"],
      icon: "⭐",
      labelKey: "tabPresetsTitle",
      ui: { showAsTab: true, order: 30 }
    },
    "results-ip": {
      titleKey: "toolTitle_results_ip",
      textKey: "toolText_results_ip",
      points: ["IP + hostname", "Open ports", "Enrichment data"],
      icon: "🖥",
      // Tab label differs by section: CS already had its own key
      // ("IP Results"), LS its own too ("Results") - reused directly
      // rather than duplicated.
      labelKey: "tabResultsIp",
      leftLabelKey: "resultsSidebarTitle",
      ui: { showInLeftPanel: true, leftOrder: 40, showAsTab: true, order: 90 }
    },

    "network-monitor": {
      titleKey: "toolTitle_network_monitor",
      textKey: "toolText_network_monitor",
      points: ["Local TCP/UDP connections", "Owning process names", "LAN ARP table with vendor lookup"],
      icon: "🖧",
      labelKey: "tabLabel_network_monitor",
      ui: { showInLeftPanel: true, leftOrder: 45, showAsTab: true, order: 95 }
    },

    "email-recon": {
      titleKey: "toolTitle_email_recon",
      textKey: "toolText_email_recon",
      points: ["Breach & paste checks", "Gravatar / GitHub lookups", "Reputation signal"],
      icon: "📧",
      labelKey: "tabLabel_email_recon",
      ui: { showInLeftPanel: true, leftOrder: 60, showAsTab: true, order: 96 }
    },

    // CS-only, opened via the "Manage..." button in General settings' AI
    // Assistant section (switchTool("ai-permissions")) - not reachable from
    // the activity bar or Tools menu, same idea as "presets".
    "ai-permissions": {
      titleKey: "toolTitle_ai_permissions",
      textKey: "toolText_ai_permissions",
      points: ["Profile presets", "Per-tool access tree", "Guardrails & audit log"],
      icon: "🔐",
      labelKey: "tabLabel_ai_permissions",
      ui: { showAsTab: true, order: 97 }
    },

    // --- RS-only built-ins (no CS tab, no generic content renderer) ---
    assistant: {
      icon: "🤖",
      labelKey: "menuToolsAiAssistant",
      ui: { showInRightPanel: true, rightOrder: 10 }
    },
    config: {
      icon: null,
      labelKey: "tabLabel_config",
      ui: { showInRightPanel: true, rightOrder: 40 }
    },
    "email-recon-config": {
      icon: null,
      labelKey: "tabLabel_email_recon_config",
      ui: { showInRightPanel: true, rightOrder: 50 }
    },
    "ai-properties": {
      icon: null,
      labelKey: "tabLabel_ai_properties",
      ui: { showInRightPanel: true, rightOrder: 15 }
    }
  };

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.toolCatalog = toolCatalog;
})();
