(function () {
  // NOTE (shell/tools split, prep pass): this is a single, homogeneous
  // changelog array mixing shell-era and scanner-tool-era entries by
  // release version - there's no mixed-code structure here to delimit like
  // in panel-content-config.js/ui-definitions.js. Versions menu entry stays
  // in the base shell per FUTURE_PLUGIN_SHELL.md, but splitting the actual
  // changelog content into "shell version history" vs "per-addon version
  // history" needs a real per-addon versioning scheme first (see
  // FUTURE_PLUGIN_SHELL.md's "Dodatkowe mozliwosci" item 6) - deferred, not
  // attempted in this pass.
  var versions = [
    {
      version: "v2.3.0",
      notes: [
        "IP Scanner now scans UDP and ICMP for real, alongside TCP - and none of the three need Administrator privileges. Check any combination in the Config tab's Protocol section and scan for all of them in a single pass.",
        "ICMP is no longer an exclusive \"ping only\" mode - it runs alongside a normal port scan now, so a single scan can report open ports and a real ping together.",
        "UDP results distinguish confirmed-open ports from ports that simply didn't respond (marked \"open?\") - UDP itself can't tell those apart, so the app is honest about the difference instead of guessing.",
        "TCP Connect can now be turned off entirely (Config tab), so an ICMP-only or UDP-only scan is possible. TCP SYN is still not implemented and is now fully hidden - not just grayed out - until \"Show unfinished tools\" is enabled."
      ]
    },
    {
      version: "v2.2.0",
      notes: [
        "IP Scanner (Config tab) is now real: Reverse DNS/Country Flag/ISP/AS/Device Identification enrichment, Retries, Scan delay, Max concurrent ports per host, and Randomize ports/hosts all actually apply to the scan instead of being inert placeholders.",
        "TCP SYN, UDP, and OS Detection are honestly marked as not-yet-implemented (need raw sockets) instead of silently doing nothing - they, along with ICMP mode, are grayed out until \"Show unfinished tools\" is enabled.",
        "Added Banner Grabbing and SSL/TLS Certificate Info columns to IP Results, and reorganized the Columns filter to match the Config tab's Detect grouping.",
        "Added the foundation of ShellCraft: a drag-and-drop block Library, Canvas, and Inspector, plus 3 working macros (External IP, Local IP, Subnets). The If/Repeat Until/PowerShell/Time Trigger blocks are placeable but not yet executable, and are grayed out until \"Show unfinished tools\" is enabled."
      ]
    },
    {
      version: "v2.1.0",
      notes: [
        "Added update checking on launch: the app now compares its version against the latest GitHub release on every startup (desktop and www alike), and shows a notification with a download link if a newer version is available.",
        "The update notification is shown at most once per released version, not once per day - it will not nag you again for a version you have already seen.",
        "Added a new \"Check for updates on startup\" toggle in Options -> General (enabled by default) for anyone who wants to turn the check off entirely."
      ]
    },
    {
      version: "v2.0.0 rebuild",
      notes: [
        "Retired the old Windows-95-style UI and dual-branch setup: main now ships the New UI directly, single branch, single source of truth.",
        "Started the Shell/Tools split across the whole codebase: generic host infrastructure (menus, panels, layout, sessions, scrollbars, i18n) is now clearly separated from IP-Scanner-specific tool code, with zero behavior changes.",
        "Added save/load/close session support with a real, user-chosen SQLite file (openable in DB Browser for SQLite) and a recent-sessions welcome view.",
        "Added the first piece of real Shell infrastructure: a Command Bus for registering and invoking named commands, laying groundwork for a future Command Palette and addon system.",
        "Designed the addon/plugin architecture for the Shell, with WASM confirmed as the sandboxing approach for future user-installable addons.",
        "Improved SEO and social-share previews (link previews on Facebook/Discord/etc. now show a proper title, description and image)."
      ]
    },
    {
      version: "v1.7.0 reset",
      notes: [
        "New UI",
        "IP Scanner in progress"
      ]
    },
    {
      version: "v1.6.4",
      notes: [
        "Added system reverse DNS for local/private IPs (PTR via desktop backend), so Hostname can resolve LAN devices reliably.",
        "Refined extra result columns: Country now shown as a flag, ISP moved to a dedicated column, and new AS column added.",
        "Improved geolocation reliability with backend fallback handling and better globe point placement when exact coordinates are unavailable.",
        "Fixed Topology Trace action: Trace button now correctly opens trace dialog and starts traceroute for selected/available host.",
        "Fixed list rendering edge cases where extra columns could remain visually hidden despite being enabled."
      ]
    },
    {
      version: "v1.6.3",
      notes: [
        "Added a factory reset button in the title bar with confirmation prompt and icon-only appearance.",
        "Added scan method optimizations for smoother and more consistent scan behavior.",
        "Added scan history panel with saved IP ranges, quick restore on double-click, and single-entry delete."
      ]
    },
    {
      version: "v1.6.2",
      notes: [
        "Added Phone Reverse Lookup tool with NumVerify, OpenCellID and Google People API support.",
        "Added Photo Analyze enhancements with richer EXIF/GPS/IPTC/XMP overview and map links for GPS.",
        "Added steganography-oriented checks for trailing data and better hidden-data status messages.",
        "Added Purple Dark and Black Flat skins in Customization."
      ]
    },
    {
      version: "v1.6.1",
      notes: [
        "Added GNSS Monitor tool with independent window mode, NMEA parsing, skyplot and satellite table.",
        "Added LTE Monitor tool with independent window mode, handover tracker and watchdog.",
        "Added LTE serial modem backend integration with auto-detection and manual COM/baud override."
      ]
    },
    {
      version: "v1.6.0",
      notes: [
        "Added IP Scan Watch in Tools.",
        "Added WiFi Detector in Tools.",
        "Added AI Security Assistant tool with multi-provider API support.",
        "Added Bluetooth Scanner in Tools.",
        "Added Network Sniffer in Tools with live connections table and CSV export."
      ]
    },
    {
      version: "v1.5.9",
      notes: [
        "Added scan mode controls with selectable type and speed.",
        "Results can now be sorted by IP address or response time.",
        "Added Blur button to mask IP addresses for safer screen sharing."
      ]
    },
    {
      version: "v1.5.8",
      notes: [
        "Expanded i18n coverage across toolbar and labels.",
        "Language and skin dialogs gained live preview with Cancel rollback.",
        "BroadcastChannel sync for language/skin across windows.",
        "Version numbers unified to 1.5.7 across app metadata."
      ]
    },
    {
      version: "v1.5.6",
      notes: [
        "Code quality refactor: moved inline styles to CSS classes across UI.",
        "Fixed proto canvas color consistency and duplicate class attribute bug."
      ]
    },
    {
      version: "v1.5.5",
      notes: [
        "Rebranded app name to NetRecon IP Auditor and switched icon to zebrus.png.",
        "Improved Help/Versions readability in dark skin.",
        "Fixed Versions dialog wrapping while resizing."
      ]
    },
    {
      version: "v1.5.4",
      notes: [
        "Code quality fixes around scan start declarations and duplicate listeners.",
        "Removed redundant code paths and extracted EN/PL strings to dedicated files."
      ]
    },
    {
      version: "v1.5.3",
      notes: [
        "Added Clippy assistant (Help -> Assistant) with EN/PL rotating tips and persistent state."
      ]
    },
    {
      version: "v1.5.2",
      notes: [
        "Added Glass skin and improved menu text contrast."
      ]
    },
    {
      version: "v1.5",
      notes: [
        "Refined results list UX and row expansion details by port."
      ]
    },
    {
      version: "v1.4p pre-alpha",
      notes: [
        "Moved Speed Test and Prototype from desktop icons to toolbar buttons."
      ]
    },
    {
      version: "v1.3p",
      notes: [
        "Added visual programming prototype window with draggable nodes and line linking mode."
      ]
    },
    {
      version: "v1.3",
      notes: [
        "Added internet speed checking in dedicated Speed Test window."
      ]
    }
  ];

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.versionsData = versions;
})();
