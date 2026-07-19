# Roadmap

High-level view of what's done, what's in progress, and what's planned. For
the detailed architectural vision behind the addon system, see
[FUTURE_PLUGIN_SHELL.md](FUTURE_PLUGIN_SHELL.md) (Polish). For the day-to-day
project direction and rules, see [CONTRIBUTING.md](../CONTRIBUTING.md) (Polish).

## Done

- Core IP/port scanner (range scanning, results browser, port presets,
  country IP library, session save/load). Topology and globe views existed
  in the legacy UI only — in the New UI they are unfinished placeholders,
  hidden by default (see backlog items 14-15).
- New UI shell (VS Code-style layout: menu bar, activity bar, left/right/center
  panels, bottom terminal/console).
- Shell vs. tool code split across `js/new-ui/core/**` so the UI layer isn't
  tangled with scanner-specific logic.
- Addon/extension system, running entirely in JS (no sandboxing runtime):
  - JSON manifest format (`contributions.tools` / `menuActions` / `i18n` /
    `commands` / `optionsMenu`), with per-tool UI placement flags
    (`showInLeftPanel` / `showInRightPanel` / `showAsTab`).
  - Permission confirmation prompt before install (currently one permission:
    `"powershell"`).
  - Install / uninstall at runtime, including full cleanup of dynamically
    created tabs, panels, and menu entries.
  - A generic command bus (`register` / `invoke`) that both the shell and
    addons register commands on.
  - A GitHub-backed addon catalog (Import Tool) that lists and installs
    addons straight from the [`tools/`](../tools/) folder of this repo.
- Rebrand to OSINT NET Auditor, including the compiled binary name, and
  working NSIS/MSI installers with WebView2 auto-detection.
- Session save/load now also works in the browser build (`ipscanner.pl`),
  using real `.sqlite3` files via sql.js — round-trip compatible with the
  desktop app's files, no server/backend involved.
- File/Tools menu reorganized to match the target UX spec: "New" aliases
  "Close", an "Open Recent" flyout submenu (the app's first nested menu),
  gated "Import" (enabled only with an active session), Tools menu reordered.
- Custom styled confirm dialogs (matching the app's "Exit" dialog look)
  replace every native `window.confirm()` call in the app (session
  close/new, dev full reset, extension install permission).
- www builds get a real native folder-picker "Save As" via the File System
  Access API (Chromium), falling back to a plain download on browsers
  without it (Firefox/Safari).
- Open ports now carry a protocol (TCP) and inferred service-name badge
  (e.g. "HTTP", "SSH"), plus per-port ping, shown on each port row and
  persisted in the session `.sqlite3` schema (with migration for old files).
- ShellCraft v1: a real drag-and-drop block canvas (center section) with a
  categorized block Library (left), an Inspector with live property editing
  (right), and 3 working macros (External IP / Local IP / Subnets) runnable
  from a terminal-style "Macro" console tab or from canvas blocks.
  Functional blocks (If / Repeat Until / PowerShell) are placeable and
  editable but honestly non-executable — no interpreter yet (backlog
  item 11).
- Language Manager redesigned around a GitHub-backed catalog (Options →
  Language...), mirroring Import Tool: installed languages get a flag +
  version + radio-button activation (no uninstall), and a new list below
  fetches installable language packs from this repo's `languages/` folder —
  same mechanism as the `tools/` addon catalog, just for i18n dictionaries.
  German (`languages/de.json`) and Polish (`languages/pl.json`, published
  even though `pl` is built-in) are the first two catalog entries, both
  the full 433-string dictionary.
- Text-direction RTL support, with Arabic (`languages/ar.json`) as the
  first RTL language: catalog manifests can carry an `"rtl": true` field,
  read by `i18n.js`'s new `applyDirForLang()` to set `<html dir>` on every
  language switch/boot. Scoped deliberately narrow — LS/RS/activity bar
  stay physically where they are, only text direction flips (3
  `text-align: left → start` fixes) — plus a `unicode-bidi: isolate`
  guard on IP/ping/AS/HTTP-status table columns so that inherently-LTR
  data never gets bidi-reordered under RTL. Full structural mirroring is a
  separate, larger, deferred item (see "Planned" below).
- Full RTL structural mirror: the top menu bar and bottom status bar fully
  mirror under RTL (flex order reverses, menu dropdown/submenu-flyout
  anchors flip from `left` to `right`, window controls move to the left
  edge with the rest of the bar). The activity-bar/LS/CS/RS grid mirrors
  too — LS↔RS physically swap sides under a real RTL language, with a
  matching sign flip in `layout-runtime.js`'s resize-drag delta math and
  CS/DS content direction restored via targeted `direction: rtl` overrides
  on `.v1-sidebar`/`.v1-editor`/`.v1-rightbar`. Turned out far smaller in
  practice than the original ~50-property estimate below suggested — a
  systematic audit found ~10 concrete physical `left`/`right`/`margin-*`/
  `padding-*` fixes, not a full rewrite.
- Added a "Swap panel sides" toggle (Options -> General) that relocates
  just the activity bar (LRSB) independently of language, via CSS `order`
  rather than `direction` — so it composes with the RTL mirror above
  instead of being overridden by it: toggling it always flips the
  activity bar to whichever end it *isn't* currently on, whether that's
  due to the toggle itself or a real RTL language's own mirror.
- Update check on launch (desktop + www): compares the running build's
  version (`app-version.js`, generated by `scripts/sync-version.js` from
  `package.json` — the frontend previously had no runtime access to its own
  version at all) against the latest GitHub release, and shows a dialog with
  a download link if a newer one is available. Runs on every launch, throttled
  to notify at most once per released version (not once per day) via
  `localStorage`. Gated behind a new "Check for updates on startup" toggle in
  Options → General (default on).
- **Full no-admin IP scanning across TCP/UDP/ICMP**: Config's Protocol
  section (RS "Config" tab) now has 3 independently combinable, real
  protocol checks instead of one exclusive mode. UDP (`probe_port_udp`,
  `main.rs`) probes through a *connected* socket - on Windows, an incoming
  ICMP "port unreachable" surfaces as a `ConnectionReset` error on `recv`,
  so closed ports are detected without a raw socket; a silent timeout is
  UDP's inherent open-or-filtered ambiguity, shown with its own "open?"
  badge instead of being lumped in with confirmed-open ports. ICMP
  (`probe_host_icmp`/`icmp_ping_blocking`) uses the Windows IP Helper API's
  `IcmpSendEcho` - the same mechanism `ping.exe` itself uses, also no admin
  needed (raw ICMP sockets would require it). All checked protocols run
  concurrently per host (`probe_host_multi`, `tokio::join!`) and combine
  into one report - e.g. TCP + ICMP together return both open ports and a
  real ping from a single scan. ICMP used to be its own exclusive
  "Ports vs ICMP" mode (picking it skipped port scanning entirely); now
  it's additive like UDP, and TCP itself gained an enable/disable checkbox
  so "ICMP only, no ports" - the old exclusive mode's actual behavior -
  stays reachable. TCP SYN remains unimplemented (genuinely needs raw
  sockets/admin, no workaround exists) and moved from grayed-out-but-visible
  to fully hidden behind "Show unfinished tools" (backlog item 17).

## In progress

- Finishing out the core scanner (deprioritized in favor of the shell/addon
  work — see CONTRIBUTING §1 — but not abandoned).
- Further contribution points from `FUTURE_PLUGIN_SHELL.md`: status bar API,
  one activity-bar icon per addon, a unified settings surface, a formal event
  bus (replacing today's ad-hoc `CustomEvent`s), and a command palette.

## Planned

- **Real self-update (VS Code-style: background download, restart to
  apply)** — today's "Update check on launch" (see "Done" above) only shows
  a dialog with a manual download link. The official `tauri-plugin-updater`
  can do the rest: check a manifest (`latest.json`, publishable alongside
  GitHub Releases), download, verify, and install, leaving only a restart
  prompt. Its signing is **Ed25519, self-generated, free** — not to be
  confused with paid Windows Authenticode code-signing (which the app
  doesn't have today and isn't required for this). Main prerequisite: the
  updater cooperates most cleanly with an **installer-based** build; today's
  releases ship a portable zip (bare `.exe` + `scripts/` folder, see backlog
  item 23), so adopting this would mean either switching releases to the
  already-unused NSIS installer template in `src-tauri/nsis/`, or building a
  custom self-replace-on-restart flow to stay portable.
- Spanish and Russian language dictionaries (Latin/Cyrillic, no RTL
  complexity) — just adding a `languages/<code>.json` manifest to the repo,
  reusing the GitHub-backed language catalog mechanism (see "Done" above).
- PDF censored-text checker.
- Email/file analyser.
- IPv6/IPv4 correlation.
- **WEB Scanner as the first real installable addon** — a small, honestly-scoped
  www-side scanner (reachability checks on common HTTP(S) ports for public
  hosts only; real TCP port scanning and local/private-network targets are a
  hard browser limitation, not a missing feature — see `SHELL_PROGRESS.md`).
  Chosen deliberately as an addon rather than a built-in shell feature, but
  today's addon system can't support it yet — it only renders a static
  title/text/points card and only supports `"powershell"`-type commands. Needs,
  as prerequisites: (1) a new browser-side `"fetch"` command type in the
  command bus (`extensions.js`/`registerExtensionCommands`), and (2) some form
  of custom addon-rendered markup beyond the static card (an input field for
  the target host, a live results list) — both currently open design questions
  in `FUTURE_PLUGIN_SHELL.md`'s "Co realnie trzeba zaprojektowac" section.
- **Screenshot+OCR data-extraction engine** (working name "Data Thief" -
  reconsider before shipping, same "don't overclaim/sound sketchy" reasoning
  that turned "Sniffer" into "Network Monitor") — not a standalone tool but
  a *reusable engine* other tools call into: screenshot a target page → OCR
  it → identify data of interest (email/phone/etc.) either **auto**
  (regex for `@`/digit-sequences, plus a proximity heuristic - find a label
  like "mail:" in the OCR'd text and inspect nearby text blocks
  above/below/beside it) or **manual** (user selects a region on the
  screenshot and tags it). Motivating case: a page with no API exposes a
  phone number that isn't cleanly extractable any other way - a future
  phone-lookup tool could shell out to this engine instead of re-solving
  OCR itself. Two open technical risks to resolve before planning further,
  in priority order:
  1. **Can WebView2/Tauri screenshot an arbitrary target page at all** -
     today's app has zero page-rendering/screenshot capability of any
     kind. Needs research (a hidden secondary webview + a screenshot API?)
     before anything else is worth planning - this is the real go/no-go.
  2. **OCR engine choice** - leaning toward Windows' built-in
     `Windows.Media.Ocr` (reachable via the `windows` crate, already a
     dependency) over bundling Tesseract, matching the "own the code,
     minimize dependencies" direction from the Email Recon work - zero new
     binaries, no install step, at the cost of Windows-only (acceptable,
     the app is already WinAPI-dependent throughout).
  Not started - first step is researching risk #1.
- **Network Monitor: scrubbable timeline of past scans** — today's live
  monitor only keeps the *latest* snapshot (`netMonLastConnections`/
  `netMonLastArp`) plus a short-lived "recently appeared/disappeared" grace
  buffer; nothing further back is retained. The idea: store every scan as a
  timestamped snapshot (`{ts, rows}`, capped at ~50-100 entries to bound
  memory) and add a scrubber/slider UI with one tick per scan - dragging or
  clicking a point re-renders Connections/LAN from that historical snapshot
  instead of the live one, so past states become browsable, not just the
  present. Builds on infrastructure already in place (the diff/keying/
  render-dispatch machinery from the grouping and gone/new-marks work), so
  it's more UI-and-storage work than a new architecture. Two things to
  settle before starting:
  1. **"Changes only" display mode doesn't have an obvious meaning while
     scrubbed to a past point** (correctly flagged by the user) - it's
     defined today as "diff between the live cache and the previous live
     cycle." Simplest resolution: disable/hide that radio option whenever
     the timeline isn't pinned to the newest (live) point, only re-enabling
     it there. A per-point reinterpretation (diff between the selected scan
     and the one immediately before it) is a possible richer alternative,
     not required for a first pass.
  2. Whether live polling should keep advancing the timeline while the user
     is scrubbed to a past point (yes, most likely - the scan keeps
     happening in the background; only the *displayed* table stays pinned
     until the user scrubs back to "live").
  Not started - purely a feasibility/design conversation so far.
- **Selective IP-blur inside Terminal/Console output** — today the IP blur
  toggle blurs those panes whole-pane (see item 15 in the backlog below)
  because their output is free-form text concatenated as one string into a
  single `<pre>` (`#v1PsOutput`/`#v1InfoLog`, fed by 4 separate append
  functions across `powershell-console-runtime.js`/`status-log-runtime.js`/
  `panels-runtime.js`/`navigation-runtime.js`), with no per-line/per-token DOM
  structure to target. Doing this precisely would need: switching all 4
  append paths from `textContent` concatenation to real DOM node
  construction, a global (not first-match) IP-regex pass per appended chunk
  (a `/g` variant of `navigation-runtime.js`'s existing `firstIpv4`), and
  rewriting the 400-line trim logic to operate on DOM nodes instead of
  string-slicing. Deliberately deferred — a real rendering rewrite, and even
  then regex-based detection would miss non-IPv4 leaks (hostnames, IPv6),
  which risks false confidence worse than today's honest "we blur the whole
  thing" behavior.

## Backlog

A pass over every menu/tool, numbered for easy reference in discussion:

1. File → "Import another session data": today a mock (see the File menu
   entry in `SHELL_PROGRESS.md`). Should actually import/merge data from
   another saved session file into the current one, instead of replacing it.
2. File → Exit on www: does closing the browser tab/window, or the top-right
   `[x]`, after a save prompt (or after choosing not to save) actually work
   the way it should? Needs checking.
3. (www/app) Help Assistant: make it context-aware — show a relevant tip for
   whichever tab/tool is currently active, and update the tip when the user
   switches tools.
4. Finish the core IP Scanner (the deprioritized item from "In progress"
   above).
5. Country IP Library: work out what can run on www vs. app-only, and add
   more library update sources. Hidden from the Options menu by default,
   same as Topology/Globe (13/14 below) — the "Show unfinished tools"
   toggle reveals it.
6. Port Presets — done, 100%.
7. Audit the actual session save/load file format more closely (the
   `.sqlite3` schema shared with sql.js — see the www session-save work).
8. ~~Default Scan Values~~ — **removed**. The tool (Options menu entry, its
   own CS tab) was deleted entirely; its two real settings (host timeout,
   max concurrent hosts) were migrated into the new RS "Config" tab's
   Performance section (still backed by the same `netrecon_scan_defaults_v1`
   localStorage key `readScanDefaults()` reads at scan start).
9. Language: simplify to just a language picker list (selecting a language
    applies it immediately) plus an "import language" button that adds an
    entry to the list — drop everything else in the Language Manager UI.
10. Addon install/uninstall: move the "Load from file..." button above
    "Installed extensions".
11. ShellCraft — block editor v1 done (see "Done" above); still missing: an
    interpreter for If / Repeat Until / PowerShell blocks, block
    nesting/connections, and the Timeline/Tree/Layered views (the switcher
    exists, only Flow works).
12. AI Assistant — ~1.5% done (just the tab exists).
13. Topology Map — ~1% done (just the tab exists). Hidden from the LRSB and
    Tools menu by default; the top-bar "Show unfinished tools" toggle
    reveals it.
14. Globe — ~1% done (just the tab exists). Hidden by default, same as 13.
15. ~~"Blur sensitive data" button — usefulness unclear, consider removing.~~
    **Done** — implemented as a `body.v1-blur-ip` CSS toggle (persisted,
    restored on launch) covering the IP Results table, IP detection results,
    range inputs, IP Extractor, Range History, and — blanket, whole-pane —
    Terminal/Console/PowerShell Console and the info log. Console output
    can't be selectively substring-matched today (see "Planned" below).
16. ~~Down Status Bar shows some info that may not be necessary — review what's
    actually worth keeping there.~~ **Done** — audited: the loader, active
    process count, and 0-100% progress bar are real and wired to actual work
    (`newui:busy-state`/`newui:scan-progress` events from PowerShell commands
    and IP scans). The static `"main • tauri-desktop • UI mock only"` label
    was dead text with no JS reference and has been removed.
17. **Real IP Scanner functionality** — Protocol's TCP Connect/UDP/ICMP are
    now real and independently combinable (see "Done" above). TCP SYN
    remains UI-only scaffolding - no raw-socket backend exists, hidden
    behind "Show unfinished tools" rather than merely grayed out. Detect's
    Service Probing/Host Enrichment checkboxes, Performance's Retries/Max
    concurrent ports per host, and Security's Randomize ports/hosts and
    Scan delay weren't touched by that work - still need their own audit to
    confirm whether they're wired to real scan behavior. Performance's Host
    timeout/Max concurrent hosts and the Profiles section were already
    confirmed functional.
18. Rename "Www addons" catalog heading (Import Tool) to lowercase
    "www addons".
19. Add a loading indicator where addons appear in the Import Tool catalog
    list, shown in the bottom-left corner, while the GitHub-backed catalog
    fetch is in flight.
20. Add a loading indicator when loading languages from the GitHub-backed
    language catalog (Language Manager), also shown bottom-left.
21. Prettify the color picker in RS "Config"'s Profiles section — should be
    a square swatch-style picker matching `.v1-profile-swatch`'s look,
    instead of the default browser `<input type="color">` appearance.
22. Match the CS "Lorem Ipsum" tab's color-picker demo (STYLELIST.md
    scaffolding, see "Inne style"/other-styles section) to whatever the
    improved RS Config color picker ends up looking like (item 21).
23. `scripts/update-country-ip-library.ps1` has the same "Missing script"
    bug that was fixed for the IP-detect scripts (a portable `.exe` built
    with `tauri build --no-bundle` never ships a `scripts/` folder next to
    it — see the "Removed" section below once this is fixed). Needs the
    same inline-in-JS fix, just bigger/more complex than the detect
    scripts (149 lines, takes `-TopRanges`/`-CountryCodes` params that need
    to survive the switch from a script file to an inline command string).
24. **`js/new-ui/` file/folder organization audit (2026-07-18)** — the
    "shell vs. tool split" from "Done" above happened at the
    comment-annotation level (`// shell:` / `// ip-scanner tool:` / `//
    MIXED:` tags), not the file level; several files still physically mix
    concerns their own comments already flag as "not cleanly separable
    without restructuring" (3× in `navigation-runtime.js`, 1× in
    `panels-runtime.js`). Findings, low to high effort:
    - No `js/new-ui/tools/` split exists to mirror
      `css/new-ui/tools/{ip-scanner,shellcraft}/` — all JS (shell chrome +
      both tools) sits flat in `js/new-ui/core/` (24 files) and
      `js/new-ui/core/runtimes/` (13 files); the `core/` vs `core/runtimes/`
      split itself looks arbitrary (e.g. `panels-runtime.js`, 2014 lines,
      sits in `core/` while the similarly-sized generic dispatcher
      `navigation-runtime.js`, 1827 lines, sits in `core/runtimes/`).
    - Five confusingly-similar file names — `panel-content-config.js`
      (static data only), `panel-content-runtime.js` (`render*` HTML
      builders), `panel-interactions-runtime.js` (`wire*` event binding),
      `panel-renderers-runtime.js` (a handful of small generic helpers),
      `panels-runtime.js` (the tab dock/detach engine) — differ by one word
      and singular/plural; worth renaming to something self-evident (e.g.
      `tool-panel-html.js` / `tool-panel-wiring.js` /
      `tool-panel-render-helpers.js` / `workbench-tabs-runtime.js`).
    - `panels-runtime.js`'s own header calls it a "generic detached-card/
      workbench-tab engine," but `wireDetachedResultsIp` (~475 lines, 23%
      of the file, 22 nested sub-functions) is ip-scanner-Results-table-
      specific filter/column-menu wiring, not shell chrome — a clean
      extraction candidate on its own, independent of any wider folder move.
    - Minor: the same `var root = rootEl && typeof rootEl.querySelector
      === "function" ? rootEl : document...` fallback is duplicated
      near-verbatim across 6 wiring functions in
      `panel-interactions-runtime.js` — worth a shared helper.
    - Recommended order, each independently shippable: (1) rename the
      `panel*` files only — mechanical, low risk; (2) extract
      `wireDetachedResultsIp` out of `panels-runtime.js` into its own file;
      (3) full `js/new-ui/tools/<tool>/` folder split — the big one, do in
      stages with a working build + smoke test after each file move, not
      all at once.

## Removed (dead code cleanup, 2026-07-11)

A repo-wide audit removed code that was unreachable or misleading:

- **~26 dead Tauri backend commands** in `src-tauri/src/main.rs` (WiFi,
  Bluetooth, GNSS, LTE, connection sniffer, phone lookup, image-meta parsing,
  traceroute, the AI multi-provider/secure-key commands, the separate
  tool-window and native-clippy-window system, and the JSON export/import
  dialogs) — none were invoked from any JS. `main.rs` dropped from ~4370 to
  ~1280 lines and 4 now-unused crates were removed (`btleplug`,
  `serialport`, `keyring`, `if-addrs`). Recoverable from git if any is
  revived. The legacy `clippy.html` window went with it (the live Clippy is
  the DOM-based `clippy-runtime.js`).
- **Dead front-end**: the orphaned extension-manager modal
  (`extension-manager-runtime.js`), several never-rendered CSS rule groups,
  a batch of unused i18n keys, and fake static scan metrics / Export-Import
  buttons in the main card.

## Considered and rejected

- **WASM as the addon sandboxing mechanism** — a working proof-of-concept
  (compiled `.wasm` module, linear-memory string marshaling) was built and
  verified end-to-end, but rejected: the debugging surface (pointer/capacity
  arithmetic, opaque traps with no error message) was judged too costly
  relative to the benefit at this stage. The addon system stays JS-only; see
  the note at the top of `FUTURE_PLUGIN_SHELL.md` for details.
