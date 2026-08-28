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
      version: "v2.8.5",
      notes: [
        "Added a new tool: Reverse IP Lookup (Tools menu). Type an IP address to get its reverse-DNS (PTR) hostname, who owns the IP block (organization/network name/CIDR range, via RDAP - the modern successor to WHOIS), and every other domain historically seen resolving to that address (via a free passive-DNS lookup) - useful for finding what else is hosted on a shared IP. Works on both desktop and the web build, since all three lookups go straight to public APIs that already allow direct browser requests, no backend needed.",
        "Browser tool: added a network traffic inspector. Toggling \"Inspect\" on the current page routes it through a local proxy instead of loading it directly, so every fetch/XHR/beacon call plus every image/script/link/iframe the page loads is logged with method, URL, and kind - shown live in a new \"Network traffic\" right-panel tab (desktop only). Fixed a page that ships its own Content-Security-Policy via a <meta> tag (rather than an HTTP header, as GitHub Pages-hosted sites like ipscanner.pl itself have to) failing to render under Inspect - that meta CSP is now stripped along with the rest.",
        "Added an Inspect-mode identity setting (Options -> General -> Privacy & tools): Default (the app's real WebView2 signature, unchanged), Blend in as a normal browser (spoofs a common desktop Chrome fingerprint - User-Agent, navigator.webdriver, WebView2-specific markers - so the inspected site can't easily tell it's not a regular visitor), or Identify as \"OSINT NET Auditor\" (the opposite - openly announces this as an automated inspection tool via a custom User-Agent instead of hiding it). Applies the next time Inspect is started.",
        "Fixed a real bug where closing the app while Mail XSS Tester's tunnel (or the Browser tool's network proxy) was running left the underlying cloudflared process orphaned and still publicly reachable - both are now stopped whenever the app closes, through any close path.",
        "Fixed a bug in the \"Blend in\" Inspect identity mode that made bot detection WORSE instead of better: hiding navigator.webdriver by defining it directly on the navigator instance still leaves it as an OWN property (just one that returns undefined), which detectors that check hasOwnProperty() flag as suspicious - patched onto Navigator.prototype instead, confirmed passing against bot.sannysoft.com.",
        "Added domain ownership verification (Options -> General -> Domain verification): generate a random verification file/key once (prompts a native Save dialog, defaulting to the Desktop), upload it to a site's root, then verify individual domains against it - proves control over a domain before features that act on someone else's site are allowed to target it (not wired up to gate anything yet, this lays the groundwork for later). Verified domains persist to both localStorage and the session file. The status bar's new marker (an exclamation-mark triangle, next to the loading progress bar) shows the live status of whatever domain is currently typed into that field - white when empty, green when verified, red when not - and shows a green summary whenever at least one domain has ever been verified, even with the field empty.",
        "Added an always-visible update-available indicator to the status bar (the ⓘ next to \"active: X\"): green when you're on the latest version, blinking amber with a tooltip naming the new version when a newer release is found - independent of the existing one-time \"new version\" popup, so dismissing that with \"Later\" no longer makes the reminder disappear for the rest of the session.",
        "Added Help -> Documentation, opening a new docs/DOCUMENTATION.md through the in-app Markdown viewer. Also fixed a real bug in that viewer: the vendored marked.js (v5+) stopped generating id attributes on headings, so any #fragment link inside a viewed .md file (a table of contents, for example) silently went nowhere - headings get GitHub-style slug ids again now.",
        "Mail XSS Tester: the email Subject field is now fixed instead of freely editable."
      ]
    },
    {
      version: "v2.8.4",
      notes: [
        "Added Community Catalog (Options -> Community Catalog, and a new left-panel section): browse addons published in ANY GitHub repo tagged \"osintnetauditor-addon\" (not just this project's own tools/ folder), with a rating/review system - GitHub login (real OAuth via Supabase, opens your system browser), 1-5 star ratings with optional comments, a reply from the addon's own author under each review, and (for the project owner) a moderation panel to mark an addon Verified, block an addon, or block an author's account entirely. Self-rating your own addon is blocked. Selecting an addon in the left-panel list opens a detail tab with its description (from the GitHub repo itself), README/LICENSE links, and the Install button - the same install path (permission confirmation, etc.) already used for locally-added tools.",
        "Desktop-only: GitHub login uses your system browser (not the app's own window) plus a custom URL scheme (osintnetauditor://) to hand the result back to the app - a second Windows process spawned by that handoff is caught and merged into the already-open window instead of opening a duplicate.",
        "GitHub API responses are cached (5 minutes, survives an app restart) to stay well under GitHub's unauthenticated rate limit; if the limit is still hit, the app now shows exactly how long to wait instead of a bare error, and logs it to the bottom Console pane.",
        "Removed the old \"Import Tool\" panel (own tools/ folder browsing, \"Load from file...\", and the separate installed-extensions list) - Community Catalog is now the single place for all addon management.",
        "Added a new tool: HTTPS Auditor (Tools menu, desktop only). Checks a target URL for MITM-relevant weaknesses - HSTS header + browser preload-list status, security headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy), whether plain HTTP actually upgrades to HTTPS, the redirect chain, and mixed content - plus a certificate panel (subject/issuer/expiry) and an overall A-F letter grade. Export results as CSV or copy them to the clipboard. Every completed audit is saved with its timestamp in a left-panel \"Audit history\" list - clicking a past entry re-shows its full result and refills the URL field, and the whole history round-trips through session save/load as well as a plain restart.",
        "Added a per-addon install count to the Community Catalog (list rows and detail header), and reworked the left-panel list row layout: name + the addon's own version on the first line, rating + install count on a second line, plus an optional \"Built for app vX.X.X\" line when a manifest declares a targetAppVersion. Added an \"Installed\" badge, and the detail header now always shows README/LICENSE/DOCUMENTATION links (a file the repo doesn't have shows a warning icon instead of disappearing).",
        "Fixed a real GitHub-API-rate-limit leak: rating, installing, or moderating an addon was re-fetching the ENTIRE Community Catalog from GitHub every time, even though those actions only change data in this app's own database - now only that addon's own rating/install-count/moderation info refreshes, no GitHub requests at all. Also fixed README/LICENSE occasionally showing a false \"missing\" warning when a background check simply hit GitHub's rate limit instead of finding nothing.",
        "Added an in-app Markdown viewer: any link to a .md file (e.g. an addon's README) now opens in a \"Document\" tab instead of your browser, rendered and sanitized locally.",
        "Community Chat: the nickname/login prompt now floats over the existing message list instead of replacing it, so a first-time visitor can still see the channel has activity before picking a nickname.",
        "Mail XSS Tester: fixed the send-email form losing anything you'd typed every time the tunnel's status changed (e.g. clicking \"Start tunnel\"), and added a note pointing at the exact cloudflared installer file to download when it's missing."
      ]
    },
    {
      version: "v2.8.3",
      notes: [
        "Added a Browser tool (Tools menu): an in-app browser tab for viewing a site without leaving the app, embedded as a normal page (iframe) by default. Some sites refuse to be embedded this way (banks, Google, and others that send X-Frame-Options/frame-ancestors) - when that happens, the tab automatically detects the block after a few seconds and offers to open the same address in its own separate app window instead, which isn't restricted the same way. The ⧉ button in the toolbar opens the current address in that separate window at any time, and detached (undocked) Browser cards work the same way as the docked tab.",
        "IP Library: updating the country-range list now refreshes the visible table immediately - previously the new data was saved but the table only picked it up after pressing F5. Removed the now-redundant \"Load cached\" button (the table always reflects the current cache already), and the update logic no longer depends on a separate .ps1 script file shipped alongside the app - it's generated in-app, the same way local/external IP detection already avoided an external script dependency.",
        "Removed the \"Show unfinished tools\" toggle and the in-progress tools it was hiding: the Style tab (formerly \"Lorem Ipsum\", used for UI experiments) is now reachable directly, Country IP Library is always visible, and TCP SYN Scan / OS Detection / ShellCraft's not-yet-working blocks are shown but permanently grayed out instead of hidden behind a toggle.",
        "Removed \"Demo Data mode\" and its two hardcoded example IP rows - it predated real scanning and wasn't needed anymore.",
        "Added a startup disclaimer: Options → General now has a checkbox that shows a one-time-per-launch notice that this is an amateur/vibecoded project, not suitable for commercial or corporate use. The dialog has its own \"Don't show this again\" checkbox, which controls the exact same setting as the one in General."
      ]
    },
    {
      version: "v2.8.2",
      notes: [
        "Community: added Discord login - authorize with your real Discord account to post as a \"✓ <name>\" verified sender instead of a free-text nickname, no longer able to be impersonated. The Worker now also validates nicknames server-side (closing a gap where only the app's own JS checked them, including a new block on faking the \"✓ \" verified prefix from the anonymous path).",
        "Fixed the \"change nickname\" link clearing your nickname immediately - since that clear was itself limited to once a day, a nickname you'd already changed today left you with no way back to the setup screen at all (including no way to see the new Discord login option). It's now a non-destructive switcher: reopens the setup card with your current nickname still filled in, and only actually applies a change (still once-a-day) once you submit something different.",
        "Fixed opening an external link (e.g. the new Discord login flow) from the desktop app silently truncating any URL with more than one query parameter - Windows' command shell was splitting on \"&\" and only the first parameter ever reached the browser."
      ]
    },
    {
      version: "v2.8.1",
      notes: [
        "Community: right-click a sender's name to ignore them - hides their messages on your device only (a local filter, not real moderation, since the chat has no real per-user accounts yet), with a small \"Ignored: ...\" list to undo it any time."
      ]
    },
    {
      version: "v2.8.0",
      notes: [
        "Added Community (Help menu, and a new icon at the top of the Left Shortcut Bar): a shared chat with other users of the app, backed by a Discord channel behind a small proxy - no account, login, or setup needed, just pick a nickname once. Works on desktop and www.",
        "Anti-abuse, since there are no real accounts yet: Cloudflare Turnstile blocks scripted/curl access to the chat's backend before a message can ever reach Discord, nicknames are validated and can only be changed once a day, every message is marked as coming from an unverified sender, and repeated identical messages collapse into one entry with a counter instead of flooding the list.",
        "Fixed detaching a tab into its own floating window breaking any tool (like the new Community chat) whose controls are wired up by element id - detaching strips ids to avoid clashing with the still-docked copy, so wiring now uses attributes that survive it instead."
      ]
    },
    {
      version: "v2.7.0",
      notes: [
        "Added real auto-update: alongside the usual portable zip, releases now also ship a signed NSIS installer - installer users get a native \"Update & Restart\" prompt that downloads, verifies, and installs the new version automatically. Portable-zip users keep the exact same experience as before (a prompt that opens the Releases page).",
        "Big hotfix pass from a full-app code review: fixed a port preset reorder bug that silently reverted the move while still claiming success, a falsy-zero bug that silently dropped \"0\" in AI Properties/Permissions fields, a missing Location column toggle in the detached IP Results window, and a memory leak in WiFi/Google Dork from repeated tab switching.",
        "Fixed importing the app's own downloadable Polish language pack overwriting newer translations with the English fallback instead of merging - Google Dork Finder, Mail XSS Tester, WiFi, and 280 other keys were missing from that pack and are now filled in and up to date.",
        "A round of internal cleanup: removed dead code, deduplicated repeated logic across several files, and throttled/parallelized a few things that were doing more work than needed (large scans, DNS lookups in IP Extractor)."
      ]
    },
    {
      version: "v2.6.0",
      notes: [
        "Added a reusable addon \"custom markup\" system: an installable tool can now declare its own input fields and a structured results table (not just a static card), so addons can collect input and show real data instead of plain text output.",
        "Added IP Scanner Heuristic JS, a real installable addon built on that system: pick a target and one of 5 client-side techniques (Fetch, Image, Link/CSS, WebSocket, IFrame) to heuristically check common ports - works fully on www, not just desktop, with an editable port list. Opens as two linked tabs: target/technique/ports on the left, results on the right.",
        "Addons can now ship a real JS program of their own instead of only a declarative config - IP Scanner Heuristic JS was migrated to this model as the first example.",
        "Added Topology (Tools menu - previously \"Virtual Machines\"): a manually-curated visual computer inventory. Add device icons (including new server/switch/printer/router/scanner/sniffer types), connect them by dragging from a node's connector handle or auto-discover new ones from your last scan, and attach color-coded Scanner/Sniffer taps to any device or connection.",
        "Topology nodes gained real remote-management: right-click a computer and choose \"Uruchom\" to remote-install a program over PowerShell Remoting (with quick links to the QEMU/VirtualBox download pages), or check RDP/VNC per node for a live desktop preview - a real in-app VNC viewer, or Windows' own Remote Desktop Connection.",
        "Added Globe (Tools menu): scanned hosts plotted on an interactive 3D globe, powered by a new persisted Location (city/country) field you can enable in Config's Host Enrichment section.",
        "Added Agent Identity (Options - previously \"Agent Profiles\"): save your own OSINT account-creation identities - name, nickname, email, login, masked password, notes, photo, file attachments, and any number of linked services (e.g. social media accounts), each with its own freeform fields.",
        "Added Mail XSS Tester (Tools menu): send yourself a test email containing several known HTML/XSS payload variants and get an automatic report of which ones survived your webmail's own sanitization - nothing is exfiltrated, each payload only proves execution by calling a private beacon URL.",
        "Added a Demo Data toggle to the top bar: switches the IP Results tool's two placeholder example rows on/off, so sample data never gets mixed up with your real scan results.",
        "Saved sessions are now stamped with the app version that created them (warns if you load one from a different version) and remember which addons were installed, offering one-click reinstall if any are missing on load.",
        "The version shown next to a translation or addon now means the app version it targets, not an arbitrary revision number - shown as \"For app X\" in the Language Manager and the addon catalog alike.",
        "ipscanner.pl (the web build) now ships a Content-Security-Policy and Referrer-Policy.",
        "Fixed a rendering bug where an extension-contributed left-panel tool (and any tool sharing the generic card template) could get its content or title rendered twice.",
        "Fixed several accessibility/autofill warnings raised by the browser on addon-declared input fields and the AI Properties panel.",
        "Added a \"Special thanks\" section in About, crediting testers.",
        "Added Google Dork Finder (Tools menu): compose an advanced Google search query (site:/filetype:/inurl:/intitle:/intext:, exact phrases, +include/-exclude) from categorized presets (exposed .env files, admin panels, DB dumps, and more) and open it in your browser - saved query history, nothing scraped in-app. An optional Google Custom Search API key/CX can be set in Options - General for a future \"extract results\" feature.",
        "Added WiFi (Tools menu): scan nearby networks (table or a radar-style visual view - closer to center and greener means a stronger signal), check your current connection's details, and view saved profiles with on-demand password reveal - read-only, desktop only.",
        "Deep links now work from the web build too: e.g. ipscanner.pl/#dorking or #wifi opens that tool directly, same as clicking it in the Tools menu.",
        "Mail XSS Tester's form now stays visible on the web build - only the actions that need the desktop backend (tunnel, send) are disabled there, instead of hiding the whole tool.",
        "Fixed collapsible sidebar sections (Topology, ShellCraft, Mail XSS Tester, Google Dork, and others) not responding to clicks unless their panel had already been opened once this session."
      ]
    },
    {
      version: "v2.5.0",
      notes: [
        "Added a real AI Assistant: pick Anthropic Claude or Google Gemini, enter your own API key, and chat. It can navigate the app on your behalf - open tabs, run macros, look up emails - gated by a new AI Permissions tab where you control exactly what it's allowed to do, with a full audit log of every action.",
        "Added a quick safety switch (the UI checkbox in AI Assistant): turning it off doesn't stop the assistant from replying, it just takes away its ability to act, so it can only chat.",
        "Added RS \"AI Properties\" tab (click the model name in AI Assistant to open it): per-provider max response length and max tool-call rounds, plus an optional estimated-token counter - a live \"cost if sent now\" readout while typing, a running real cost for the whole conversation, and a small estimate on each sent message.",
        "Reworked Network Monitor: Start/Stop and a configurable live-poll interval moved into its own left panel, sortable columns (including within groups), grouped views (by process/PID/protocol/state for connections, by vendor/interface for LAN devices), and appeared/disappeared rows shown live in the table instead of a separate log.",
        "Fixed a structural inconsistency between the left and right side panels that could cause extra spacing in some tabs."
      ]
    },
    {
      version: "v2.4.0",
      notes: [
        "Added Network Monitor: view local TCP/UDP connections and the LAN ARP table live, no Administrator privileges needed.",
        "Added Email Recon: type an email address and check it against 7 public OSINT sources at once - emailrep.io, Gravatar, GitHub, HaveIBeenPwned (breaches + pastes), XposedOrNot, and LeakCheck. Same left/center/right layout as IP Scanner: pick sources and enter an optional HIBP key on the right, run the lookup on the left, read results in the middle. Includes lookup history and saveable source profiles.",
        "Added Hebrew as a second right-to-left language, alongside Arabic."
      ]
    },
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
