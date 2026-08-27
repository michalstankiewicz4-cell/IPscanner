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
    // "Style" catalog (CS-only) - reachable via the [Style] button in
    // Options -> General -> Appearance, see panel-content-runtime.js's
    // renderLoremIpsumTool() and docs/STYLELIST.md.
    "lorem-ipsum": {
      titleKey: "toolTitle_lorem_ipsum",
      textKey: "toolText_lorem_ipsum",
      points: [],
      icon: "📄",
      labelKey: "toolTitle_lorem_ipsum",
      ui: { showAsTab: true, order: 100 }
    },
    // Browser (CS-only) - a docked child webview (Tauri multi-webview,
    // Window::add_child), not an iframe, so it isn't subject to
    // X-Frame-Options/frame-ancestors blocking. See panel-content-runtime.js's
    // renderBrowserTool() and panel-interactions-runtime.js's wireBrowserTool().
    browser: {
      titleKey: "toolTitle_browser",
      textKey: "toolText_browser",
      points: [],
      icon: "🌐",
      labelKey: "toolTitle_browser",
      ui: { showAsTab: true, order: 110 }
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
      points: ["10 device types incl. servers, switches, printers, scanner/sniffer icons", "Per-type config fields plus name/host/note", "Draw connections between devices, or auto-build from your last scan"],
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
    // Live VNC desktop preview - a separate CS tab from the diagram canvas
    // above (that's drag/connect UI, a live video feed doesn't fit in the
    // same space) showing whichever node is currently "focused"
    // (pulpit-preview-runtime.js), plus an RS panel listing every node
    // currently being watched as a small live thumbnail each ("like
    // cameras"). Desktop-only - see pulpit-preview-runtime.js's own
    // comment; both renderers show a plain explanatory note on www instead.
    "pulpit-preview": {
      titleKey: "toolTitle_pulpit_preview",
      textKey: "toolText_pulpit_preview",
      points: ["Live VNC view of a Topology node's desktop", "Desktop app only - needs a raw TCP connection to the target"],
      icon: "🖵",
      labelKey: "tabLabel_pulpit_preview",
      ui: { showAsTab: true, order: 117 }
    },
    "pulpit-preview-list": {
      icon: null,
      labelKey: "tabLabel_pulpit_preview_list",
      ui: { showInRightPanel: true, rightOrder: 26 }
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
    // Mail XSS Tester: self-test which HTML/XSS payload variants survive
    // YOUR OWN webmail's sanitization - every payload's only effect is
    // firing a beacon request, proving it executed; nothing here
    // exfiltrates anything or persists. Needs a publicly reachable beacon
    // (see mail-xss-tester-runtime.js) and Rust's raw TCP/process-spawn
    // capability for the tunnel, so - like Topology's VNC preview - this
    // is desktop-only, gated via platform.isDesktop() in the renderer
    // rather than hidden from the catalog outright.
    "mail-xss-tester": {
      titleKey: "toolTitle_mail_xss_tester",
      textKey: "toolText_mail_xss_tester",
      points: ["Send yourself a test email with several sanitization-bypass payloads", "Each payload proves execution via a unique beacon URL, nothing more", "Desktop app only - needs a publicly reachable beacon endpoint"],
      icon: "🛡",
      labelKey: "tabLabel_mail_xss_tester",
      ui: { showAsTab: true, order: 121 }
    },
    // Checks a target URL for MITM-relevant weaknesses (missing HSTS/preload,
    // missing security headers, plain-HTTP not upgrading, mixed content) via
    // a real HTTP request from Rust (src-tauri/src/main.rs's https_audit
    // command) - a browser fetch() can't read another domain's response
    // headers cross-origin, so like Mail XSS Tester above this is
    // desktop-only, gated via platform.isDesktop() in the renderer.
    "https-auditor": {
      titleKey: "toolTitle_https_auditor",
      textKey: "toolText_https_auditor",
      points: ["HSTS presence + browser preload-list status", "Security headers: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy", "Redirect chain + mixed-content scan", "Desktop app only - reads response headers from Rust, not the webview (CORS)"],
      icon: "🔒",
      labelKey: "tabLabel_https_auditor",
      ui: { showAsTab: true, order: 124 }
    },
    // Reverse of the app's usual domain->IP direction: type an IP, get
    // back (a) its PTR/reverse-DNS hostname via Cloudflare's DNS-over-
    // HTTPS JSON API, and (b) every OTHER domain historically seen
    // resolving to that IP via HackerTarget's free reverse-IP-lookup API
    // - the PTR alone is usually just the hosting provider's own name,
    // not the actual site(s) hosted there. Both APIs send
    // Access-Control-Allow-Origin: * themselves, so - unlike HTTPS
    // Auditor - this needs no Rust backend and works on www too.
    "reverse-ip": {
      titleKey: "toolTitle_reverse_ip",
      textKey: "toolText_reverse_ip",
      points: ["Reverse DNS (PTR) via Cloudflare DNS-over-HTTPS", "Every other domain seen resolving to that IP, via HackerTarget's free API", "Works on desktop and www - both APIs allow direct browser requests"],
      icon: "🧭",
      labelKey: "tabLabel_reverse_ip",
      ui: { showAsTab: true, order: 125 }
    },
    "mail-xss-tester-library": {
      icon: null,
      labelKey: "tabLabel_mail_xss_tester_library",
      ui: { showInLeftPanel: true, leftOrder: 46 }
    },
    // Past HTTPS Auditor runs (timestamp + URL + grade), LS list driving
    // the "https-auditor" CS tab's detail view - same master-detail shape
    // as agent-profiles-library above.
    "https-auditor-library": {
      icon: null,
      labelKey: "tabLabel_https_auditor_library",
      ui: { showInLeftPanel: true, leftOrder: 49 }
    },
    "mail-xss-tester-results": {
      icon: null,
      labelKey: "tabLabel_mail_xss_tester_results",
      ui: { showInRightPanel: true, rightOrder: 27 }
    },
    // Google Dork Finder: build an advanced Google search-operator query
    // (site:/filetype:/inurl:/intitle:/intext:) and open it in a real
    // browser tab - the app never scrapes/parses Google's own result
    // pages (violates their ToS). Works fully on desktop AND www, unlike
    // Mail XSS Tester/Pulpit Preview above - opening a URL only needs the
    // existing platform.openExternalUrl() helper, no new backend at all.
    "google-dork": {
      titleKey: "toolTitle_google_dork",
      textKey: "toolText_google_dork",
      points: ["Compose site:/filetype:/inurl:/intitle:/intext: queries", "Start from a categorized preset (exposed .env, admin panels, DB dumps...)", "Opens in your browser - saved query history, nothing scraped in-app"],
      icon: "🔎",
      labelKey: "tabLabel_google_dork",
      ui: { showAsTab: true, order: 122 }
    },
    "google-dork-library": {
      icon: null,
      labelKey: "tabLabel_google_dork_library",
      ui: { showInLeftPanel: true, leftOrder: 47 }
    },
    "google-dork-templates": {
      icon: null,
      labelKey: "tabLabel_google_dork_templates",
      ui: { showInRightPanel: true, rightOrder: 28 }
    },
    // WiFi tool, Phase 1: nearby-network scan, current-connection info, and
    // saved-profile listing with on-demand password reveal - all backed by
    // the existing generic run_powershell command (netsh wlan ... parsed
    // into JSON in-script), no new Rust/backend code needed. Desktop only -
    // there is no www equivalent of shelling out to a local netsh.exe.
    "wifi": {
      titleKey: "toolTitle_wifi",
      textKey: "toolText_wifi",
      points: ["Scan nearby WiFi networks (signal, security, channel)", "Current connection details (SSID, IP, signal, rates)", "Saved profiles with on-demand password reveal"],
      icon: "📶",
      labelKey: "tabLabel_wifi",
      ui: { showAsTab: true, order: 123 }
    },
    "wifi-library": {
      icon: null,
      labelKey: "tabLabel_wifi_library",
      ui: { showInLeftPanel: true, leftOrder: 48 }
    },
    "wifi-adapter": {
      icon: null,
      labelKey: "tabLabel_wifi_adapter",
      ui: { showInRightPanel: true, rightOrder: 29 }
    },
    "wifi-current": {
      icon: null,
      labelKey: "tabLabel_wifi_current",
      ui: { showInRightPanel: true, rightOrder: 30 }
    },
    // Community Chat: shared chat backed by a Discord channel via a small
    // Cloudflare Worker proxy (see docs/COMMUNITY_CHAT_SETUP.md) - the app
    // never holds the Discord webhook/bot token itself. Works fully on
    // desktop AND www, same as Google Dork Finder - CS-only, no
    // library/results split needed (message list + input fit one panel).
    "community-chat": {
      titleKey: "toolTitle_community_chat",
      textKey: "toolText_community_chat",
      points: ["Chat with other users of the app", "Backed by a shared Discord channel", "Pick a nickname once, no account needed"],
      icon: "💬",
      labelKey: "tabLabel_community_chat",
      ui: { showAsTab: true, order: 130 }
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

    // Community Catalog: browse/rate/comment on GitHub-topic-tagged addon
    // repos (Supabase-backed) - LS list + CS detail, master-detail shape
    // copied from Agent Profiles (see community-catalog-detail-runtime.js).
    "community-catalog": {
      titleKey: "toolTitle_community_catalog",
      textKey: "toolText_community_catalog",
      points: ["Rate and comment with your GitHub account", "Author replies", "Admin moderation (Verified / block)"],
      icon: "🧩",
      labelKey: "tabLabel_community_catalog",
      ui: { showAsTab: true, order: 135 }
    },
    "community-catalog-library": {
      icon: null,
      labelKey: "communityCatalogLeftLabel",
      ui: { showInLeftPanel: true, leftOrder: 65 }
    },

    // In-app Markdown viewer - CS-only, not reachable from any menu, same
    // idea as "ai-permissions"/"presets". Opened by markdown-viewer-
    // runtime.js's openDoc() whenever the global external-link click
    // handler (bootstrap-runtime.js) sees an <a href> that clearly points
    // to a .md file, instead of routing it to the system browser.
    "md-viewer": {
      titleKey: "toolTitle_md_viewer",
      textKey: "toolText_md_viewer",
      points: [],
      icon: "📝",
      labelKey: "tabLabel_md_viewer",
      ui: { showAsTab: true, order: 136 }
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
