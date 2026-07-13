(function () {
  var toolCatalog = {
    // --- shell keys ---
    // Options: Language + Import Tools stay in the base shell per
    // FUTURE_PLUGIN_SHELL.md; Help menu items (versions/about/license) also
    // stay in the base shell per SHELL_PROGRESS.md. Judgment call, not settled
    // fact — flag if a future split disagrees.
    general: {
      titleKey: "toolTitle_general",
      textKey: "toolText_general",
      points: ["Auto load last session", "Per-setting remember toggles", "Applies on next launch"]
    },
    "import-tool": {
      titleKey: "toolTitle_import_tool",
      textKey: "toolText_import_tool",
      points: ["Paste manifest JSON", "List installed tools", "Uninstall by id"]
    },
    "language-manager": {
      titleKey: "toolTitle_language_manager",
      textKey: "toolText_language_manager",
      points: ["Add custom dictionaries", "Activate language", "List available languages"]
    },
    versions: {
      titleKey: "toolTitle_versions",
      textKey: "toolText_versions",
      points: ["Release history", "Major updates", "Quality fixes"]
    },
    about: {
      titleKey: "toolTitle_about",
      textKey: "toolText_about",
      points: ["Project summary", "Author details", "Support links"]
    },
    license: {
      titleKey: "toolTitle_license",
      textKey: "toolText_license",
      points: ["MIT license", "Permission notice", "Copyright notice"]
    },
    "lorem-ipsum": {
      titleKey: "toolTitle_lorem_ipsum",
      textKey: "toolText_lorem_ipsum",
      points: []
    },
    // ShellCraft stays in the base shell (confirmed by the user, not a
    // judgment call like the ones above) - see SHELL_PROGRESS.md.
    shellcraft: {
      titleKey: "toolTitle_shellcraft",
      textKey: "toolText_shellcraft",
      points: ["Shell script library", "Command inspector", "Empty starter workspace"]
    },

    // --- ip-scanner tool keys ---
    "scan-runner": {
      titleKey: "toolTitle_scan_runner",
      textKey: "toolText_scan_runner",
      points: ["IP range + presets", "Concurrency control", "Export/import results"]
    },
    topology: {
      titleKey: "toolTitle_topology",
      textKey: "toolText_topology",
      points: ["Canvas graph", "Live filters", "Node hover telemetry"]
    },
    globe: {
      titleKey: "toolTitle_globe",
      textKey: "toolText_globe",
      points: ["D3 globe", "Country markers", "Geo enrichment"]
    },
    "ip-library": {
      titleKey: "toolTitle_ip_library",
      textKey: "toolText_ip_library",
      points: ["Country IP ranges", "PowerShell auto update", "Local cache preview"]
    },
    presets: {
      titleKey: "toolTitle_presets",
      textKey: "toolText_presets",
      points: ["Built-in scan groups", "Editable custom ports", "Default preset choice"]
    },
    "scan-defaults": {
      titleKey: "toolTitle_scan_defaults",
      textKey: "toolText_scan_defaults",
      points: ["Timeout and retries", "Concurrency limits", "Default port profile"]
    },
    "results-ip": {
      titleKey: "toolTitle_results_ip",
      textKey: "toolText_results_ip",
      points: ["IP + hostname", "Open ports", "Enrichment data"]
    }
  };

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.toolCatalog = toolCatalog;
})();
