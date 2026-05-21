(function () {
  var versions = [
    {
      version: "v1.6.5",
      notes: [
        "Added intermediate host status (blue light) for unusual responses: IPs with no open ports but with detectable network response.",
        "Added a dedicated Intermediate filter button between Active and Dead in the results toolbar.",
        "Improved results filtering so Dead now shows only typical dead hosts, while intermediate hosts are grouped in their own view.",
        "Added scan results Export/Import actions in File menu (JSON format), including scan range history in exported files and restoring history on import.",
        "Improved Globe visualization: elevated arc routes with animated flow and thinner 1px styling aligned to globe route animation behavior."
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
