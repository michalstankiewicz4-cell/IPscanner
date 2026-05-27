(function () {
  var toolCatalog = {
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
    settings: {
      titleKey: "toolTitle_settings",
      textKey: "toolText_settings",
      points: ["Default scan values", "Language and presets", "Customization"]
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
    "results-ip": {
      titleKey: "toolTitle_results_ip",
      textKey: "toolText_results_ip",
      points: ["IP + hostname", "Open ports", "Enrichment data"]
    }
  };

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.toolCatalog = toolCatalog;
})();
