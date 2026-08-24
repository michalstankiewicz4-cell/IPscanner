# Changelog

Notable user-facing and architectural changes, newest first. For the
high-level "what's done vs. planned" view, see [ROADMAP.md](ROADMAP.md).

This file was started on 2026-07-11 and is not backfilled beyond a few days
of prior context — for full history use `git log`.

## 2026-08-24

- Added an "Installed" badge to Community Catalog list rows (mirrors the
  existing "Verified" badge, checks the row's addon id against
  `extensionHost.listExtensions()`).
- Added `docs/COMMUNITY_ADDON_GUIDELINES.md` covering what's required for
  a repo to be listed (topic tag, manifest.json, permissions, content
  rules, licensing) and how moderation (Verified/block addon/block
  author) works. Linked from the Community Catalog panel's login bar as
  "Community addon guidelines".
- Added an in-app Markdown viewer: any link that clearly points to a
  `.md` file (checked in the same global click handler that already
  routes external links to the system browser) now opens in a "Document"
  center tab instead, rendered from the file's raw content via a locally
  vendored `marked` + `DOMPurify` (sanitized before it ever touches
  innerHTML, since this can render third-party GitHub content like addon
  READMEs). A `github.com/.../blob/...` source link resolves relative
  links/images inside the doc against the right repo path, so browsing
  from one doc to another (e.g. this changelog to `ROADMAP.md`) stays
  in-app.

## 2026-08-23

- Added Community Catalog (v2.8.4): browse/install addons from any GitHub
  repo tagged `osintnetauditor-addon`, with GitHub-login-gated ratings,
  comments, author replies, and an owner moderation panel (Verified/block
  addon/block author), backed by Supabase (plain REST for data, the JS SDK
  only for the OAuth flow itself). New left-panel section + center detail
  tab (master-detail, same pattern as Agent Profiles). Desktop login uses
  the system browser plus a custom URL scheme
  (`osintnetauditor://auth-callback`) and `tauri-plugin-deep-link` +
  `tauri-plugin-single-instance` (the latter needed because Windows always
  spawns a second process for a custom-scheme redirect while the app is
  still running mid-login - it forwards the URL to the existing window and
  exits instead of opening a duplicate).
- Removed the old "Import Tool" panel (own `tools/` folder browsing, "Load
  from file...", and the separate installed-extensions list) - Community
  Catalog is now the single place for all addon management.
- Built and iterated on this feature first as a standalone prototype
  (`addon-marketplace-poc/`, since deleted) before porting it in - see
  `docs/RELEASING.md` history / git log for the Supabase schema and RLS
  policies that back it.

## 2026-08-13

- Added a startup disclaimer: Options → General has a checkbox controlling
  a one-time-per-launch dialog stating the app is an amateur/vibecoded
  project, not suitable for commercial or corporate use. Implemented by
  teaching the shared modal-dialog factory (`menu-runtime.js`'s
  `buildButtonDialog`) an optional embedded "don't show again" checkbox,
  reused as-is by the existing exit/confirm/update dialogs with zero
  behavior change.
- Investigated the "Gaze-following privacy screen" idea (WebGazer.js-based
  webcam gaze tracking to drive a blur overlay) in real implementation
  detail, then dropped it: WebGazer.js is GPLv3-licensed and this repo is
  MIT throughout - vendoring it in directly would change the whole
  project's licensing posture. Moved from ROADMAP.md's Planned section to
  Considered and rejected.

## 2026-08-12

- Added Discord login to Community chat: authorize with your real Discord
  account to post as a "✓ <name>" verified sender instead of a free-text
  nickname. New Cloudflare Worker routes (`/oauth/start`, `/oauth/callback`,
  `/oauth/status`) built on a short-lived `state` + long-lived `sessionToken`
  KV pair; the Worker now also validates nicknames server-side on the
  anonymous path (previously only the app's own JS did, including a new
  block on faking the "✓ " verified prefix).
- Fixed `open_browser` (Rust) silently truncating any URL with more than one
  query parameter when opening it in the system browser - `cmd /c start`
  re-parses its command line for shell metacharacters outside of quotes, so
  an unquoted `&`-separated OAuth URL only ever reached the browser up to
  its first parameter. Fixed via `raw_arg()` with an explicit quoted URL.
- Fixed Community chat's "change nickname" link clearing the nickname
  immediately, which was itself gated by the once-a-day cooldown - a user
  who'd already changed today had no way back to the setup screen at all.
  Replaced with a non-destructive identity switcher that reopens the setup
  card (prefilled with the current nickname) without changing anything
  until a genuinely different value is submitted.

## 2026-07-18

- Added Hebrew (`languages/he.json`) as the second RTL language, published
  through the same GitHub-backed language catalog as German/Arabic/Polish -
  no code changes needed since `applyDirForLang()`/`addLanguage()` are
  fully generic (no hardcoded per-language logic anywhere), same pattern
  documented for Arabic below. Full 522-key dictionary, 1:1 with the
  English base.

## 2026-07-17

- Implemented real ICMP ping scanning via the Windows IP Helper API
  (`IcmpCreateFile`/`IcmpSendEcho`, `probe_host_icmp`/`icmp_ping_blocking`
  in `main.rs`) instead of a raw-socket crate - this is the same mechanism
  `ping.exe` itself uses and does **not** require Administrator privileges,
  unlike raw ICMP sockets (which Windows has restricted to admin since
  Vista). Verified via native build + WebView2 CDP that the app pings
  successfully without elevation.
- Implemented real UDP port scanning (`probe_port_udp`, `main.rs`) using a
  *connected* UDP socket - an incoming ICMP "port unreachable" for a
  connected socket surfaces as a `ConnectionReset` error on `recv`, so
  closed ports are detected without a raw socket either. A silent timeout
  (no reply, no reset) is UDP's inherent open-or-filtered ambiguity -
  reported with its own "open?" badge (new `PortLatency.status` field,
  `open` vs `open_filtered`) instead of being shown as a confirmed-open
  port. Threaded `status` through both session-persistence paths (native
  rusqlite and the sql.js/WASM www path) with matching `ALTER TABLE`
  migrations.
- Moved ICMP from its own exclusive "Ports vs ICMP" scan-mode toggle
  (picking ICMP used to hide the ports picker and skip port scanning
  entirely) into RS Config's Protocol section as an independent checkbox
  alongside the new UDP one - a single scan can now report open ports and
  a real ICMP ping together (`probe_host_multi`, runs TCP/UDP and ICMP
  concurrently via `tokio::join!`, preferring the real ICMP round-trip for
  the reported ping when available). TCP itself gained an enable/disable
  checkbox (previously always-on), so "ICMP only, no ports" - the old
  exclusive mode's actual behavior - stays reachable from the new location.
  Starting a scan with all three protocols unchecked now shows a clear
  "select at least one protocol" message instead of silently doing nothing.
- Simplified the Protocol section further: removed the now-redundant "TCP
  Connect"/"TCP SYN" radio (SYN was always grayed out, so the radio never
  offered a real choice) in favor of a single "TCP Connect" checkbox. TCP
  SYN moved from grayed-out-but-visible to fully hidden behind "Show
  unfinished tools" (it has zero backend support, unlike the still-visible
  grayed-out OS Detection).
- Made every LS/RS tab fully section-movable via `tool-catalog.js`'s `ui`
  flags: the 10 remaining CS-only tools (versions/presets/general/about/
  license/topology/globe/import-tool/language-manager/shellcraft) now fall
  back to CS's own `buildDetailHtml`/`wireToolRuntime` when placed in LS/RS
  instead of needing a dedicated render function each; `scan-runner`/
  `config`/`assistant` (previously pinned - their wiring was never built to
  be regenerated, and `assistant`'s chat history lives only as DOM nodes)
  are now reparented (moved, not rebuilt) between sections instead, so
  their live state survives a section change. Split "lorem-ipsum" into 3
  independent tools (`lorem-ipsum`/`lorem-ipsum-left`/`lorem-ipsum-right`)
  instead of one id shared across LS/CS/RS via `ui` flags, after finding it
  had silently drifted into showing different placeholder text per section.

## 2026-07-16

- Added a Range/CIDR toggle to the IP Scanner's "IP Range" section (LS): a
  radio switch between the existing From/To octet boxes and a new single
  `#v1ScanCidr` field, both writing into the same hidden
  `#v1ScanFrom`/`#v1ScanTo` inputs the rest of the pipeline (Start, range
  history, `estimateRangeTotal()`'s large-range warning) already reads, so
  no downstream code needed to change. Added a real `cidrToRange()` utility
  (`utils/net-utils.js`) and fixed an existing bug in
  `applyDetectedRange()` that always assumed a `/24` for a detected
  subnet's prefix instead of using the real one. Also hid the AI Assistant
  RS tab behind "Show unfinished tools" and fixed an RS empty-state
  invariant bug found along the way.
- Added a Ports/ICMP scan-mode toggle to the IP Scanner's "IP Range"
  section, alongside the Range/CIDR one, and a new RS "Config" tab for the
  IP Scanner (Protocol/Detect/Performance/Security sections) opened
  alongside LS/CS when IP Scanner is active.
- Migrated the IP Scanner's real scan settings (host timeout, max
  concurrent hosts) from the "Default Scan Values" CS tab into the new RS
  Config tab's Performance section, then **removed "Default Scan Values"
  entirely** — menu entry, CS tab, render/wire functions, dispatch branch,
  catalog/action-map entries, and its ~17 i18n keys across all 4
  dictionaries. Both scan settings still read/write the same
  `netrecon_scan_defaults_v1` localStorage key as before.
- Expanded the Config tab: added TCP Connect/TCP SYN/UDP to Protocol; OS
  Detection, Country Flag/ISP/AS/Device Identification/HTTP Page
  Title/Access-Snapshot to Detect (split into "Service Probing" and "Host
  Enrichment" subgroups); Retries and Max concurrent ports per host to
  Performance; SSL/TLS Certificate Info to Detect; Scan delay (ms) to
  Security. Added a "Profiles" system to the Config tab (color picker,
  name field, add/delete, a locked default "Default" entry) — fully
  functional, not scaffolding. Everything else added to Config this round
  is UI-only, not yet wired to real scan behavior (see ROADMAP item 17).
- Removed the second demo addon (`tools/testcenter.json` /
  `tools/testcenter.png`) from the addon catalog, leaving `tools/ipscanner.json`
  as the sole entry.
- Hid the "Country IP Library..." Options menu entry behind "Show
  unfinished tools" (same mechanism as Topology/Globe/AI Assistant) — in
  addition to the portable-`.exe` "Missing script" fix already documented
  under 2026-07-15.
- Added a small, deliberately non-persisted "UI" test switch to Options →
  General (hidden behind "Show unfinished tools"): a "Default"/"Test"
  radio pair that navigates to a new placeholder `test-ui.html` page when
  "Test" is picked. The choice is never written to `localStorage`, so a
  normal relaunch always lands back on the default UI without needing to
  clear any stored state — a small proof that switching UIs only needs a
  page navigation, not an app restart, given the current architecture.
- Split `panels-runtime.js` (2939 lines, the largest file in the New UI
  split) by extracting its three most independent tool sections — none of
  which touched the file's generic detached-card/workbench-tab engine that
  had previously ruled out a physical split — into their own sibling
  runtime files, following the same instantiation/dispatch pattern the
  file already used for `panelContentRuntime`/`panelRenderersRuntime`/
  `panelInteractionsRuntime`: `runtimes/language-catalog-runtime.js`
  (Language Manager's GitHub catalog), `runtimes/ip-library-runtime.js`
  (Country IP Library), and `runtimes/addon-catalog-runtime.js` (the
  GitHub addon catalog / "www addons"). `panels-runtime.js` is now 1991
  lines. Also added `docs/PROJECT_STRUCTURE.md`, a top-level map of every
  folder/file in the repo with an ASCII tree, and moved `STYLELIST.md`
  into `docs/`.

## 2026-07-15

- Fixed "Missing script" errors on the External IP / Local IP / Subnets
  detect buttons for anyone running the portable `.exe` (not the installer):
  those three PowerShell scripts lived in `scripts/*.ps1` and were resolved
  at runtime via `Join-Path (Get-Location) 'scripts\...'`, which only ever
  worked when a `scripts/` folder happened to sit near the process's
  working directory (true during dev). `tauri.conf.json`'s
  `bundle.resources` declares these as bundled resources, but that only
  applies to a full `tauri build` (the installer) - `tauri build
  --no-bundle` (used for every portable release so far) skips that step
  entirely, so the portable `.exe` never had a `scripts/` folder anywhere
  near it and always threw. Fixed by inlining all three scripts directly
  into `navigation-runtime.js` as plain JS strings (byte-identical to the
  old `.ps1` files, verified via a diff script before switching over) -
  same technique the addon system's inline `"powershell"`-type commands
  already use, so there's no file dependency left to break. The old
  `scripts/detect-*.ps1` files and the now-unused `scriptInvokeCommand()`
  helper were deleted. `scripts/update-country-ip-library.ps1` has the
  exact same underlying bug and hasn't been fixed yet (bigger/more complex
  script, separate follow-up).
- Added an update-check-on-launch feature (desktop + www): the app now has
  runtime access to its own version for the first time, via a generated
  `js/new-ui/core/app-version.js` (written by an extended
  `scripts/sync-version.js`, previously only synced `Cargo.toml`/
  `tauri.conf.json`/the NSIS installer template). A new
  `update-check-runtime.js` compares it against the latest GitHub release on
  every launch and shows the existing confirm-dialog component with a
  download link if a newer version is out, throttled to once per released
  version via `localStorage` rather than once per day. Gated behind a new
  "Check for updates on startup" toggle in Options → General (default on).
- First step toward exploring an alternate UI (see `STYLELIST.md`, new): a
  "Lorem Ipsum" placeholder tool (icon in the activity bar / LRSB, gated
  behind "Show unfinished tools" like Topology/Globe) that opens all three
  surfaces at once - a Center Section tab, a Left Section tab, and a
  closable Right Section tab - each with its own independent filler text.
  The CS tab doubles as a living style catalog: a live, working preview of
  every native `<input>` type plus textarea/select/button (25 items,
  `STYLELIST.md` tracks which ones have a settled "source of truth"), laid
  out in two columns alongside a growing "other UI styles" section that
  starts with the app's custom vertical/horizontal scrollbar
  (`.v1-faux-scrollbar`) - generalized `custom-scrollbar-runtime.js`'s
  horizontal-rail support (previously hardcoded to one results-table
  selector) to work for any registered target.

- Added `name` attributes to the 8 IP-range octet inputs (From/To ×4) so
  the browser's native "remembered field values" dropdown can suggest
  previously-typed octets - shared per octet position (`ip-octet-1..4`)
  across both boxes, since the same range of plausible values applies
  either way. That dropdown renders outside the page's DOM, so the
  CSS-based "Blur IP addresses" toggle can't touch it - added
  `applyOctetAutocompleteForBlurState()` (`ip-inputs-runtime.js`) to
  toggle `autocomplete` off/on to match, on boot and live via a new
  `newui:blur-ip-changed` event dispatched from `menu-runtime.js`'s
  blur-ip toggle handler, so the two privacy features stay honest
  together instead of the dropdown leaking octets around the blur.
- Fixed two more physical-direction assumptions in the RTL mirror, found
  during manual testing: LS/RS's collapse-toggle arrows (`◀`/`▶`) were
  hardcoded assuming LS is always physically left and RS always physically
  right, so they pointed the wrong way once a real RTL language swapped
  their sides — `layout-runtime.js`'s `syncToggleLabels()` now flips the
  glyphs to match. The Down Section's collapse-toggle button used
  `margin-left: auto` (a physical flex-spacer trick) to sit at the end of
  its tab row, which doesn't respond to `direction` - added an
  `html[dir="rtl"]` override so it sits flush at the true start of the row
  under RTL instead of floating mid-row.

- Added a "Swap panel sides" toggle to Options -> General: relocates just
  the activity bar (LRSB) to the opposite edge of the screen, independent
  of language. Implemented via CSS `order` (not `direction`), so LS/RS keep
  their normal relative position to CS and CS/DS content direction is
  untouched - deliberately narrower than a real RTL language's full
  structural mirror. Works together with RTL languages rather than being
  overridden by them: since `order` assigns track numbers regardless of
  `direction`, the same rule lands the activity bar on the opposite
  physical side from wherever a real RTL language's own mirror already put
  it - so the toggle always means "flip the activity bar to the other
  end," in both directions, rather than forcing an absolute side.
- Renamed the "LSB" abbreviation to "LRSB" (Left/Right Shortcut Bar) in
  `docs/SHELL_PROGRESS.md` and the few user-facing strings that referenced
  it, now that the activity bar isn't always on the left.

- First real slice of the "Full RTL structural mirror" (see ROADMAP): the top
  menu bar (TBM) and the bottom status bar (DSB) now fully mirror under RTL
  languages, not just text direction. Under `dir="rtl"` the menu bar's flex
  order reverses (logo/File/Options/Tools/Help move to the right edge,
  window controls to the left, matching native RTL app conventions), with
  matching fixes for the dropdown/submenu-flyout anchor position (was
  hardcoded `left: 0`/`left: 100%`, now flips to `right`), the submenu arrow
  glyph (mirrored via `transform: scaleX(-1)`), and the brand-logo/
  window-controls edge margins. The status bar mirrors via the same
  `direction: rtl` toggle (`justify-content: space-between` handles the rest
  automatically, no physical left/right values to fix). Deliberately scoped
  to just these two chrome bars — the activity bar/LS/CS/RS grid (`.v1-main`)
  stays pinned physically LTR for now, since mirroring it needs
  `layout-runtime.js`'s resize-drag pixel math to become direction-aware
  first (see ROADMAP "Full RTL structural mirror").

- Fixed the top menu bar (TBM) largely not being translated: `applyStaticTranslations()`
  only ever covered the File/Options/Tools/Help triggers plus About/License/Assistant
  — every other dropdown item (New/Open/Open Recent/Import/Save/Save as.../Close/Exit,
  Country IP Library.../Port Presets.../Default Scan Values.../Language.../General.../
  Import Tool..., AI Assistant, Versions/Download), the 4 window control buttons
  (Minimize/Maximize/Fullscreen/Close), and the "Show unfinished tools"/"Auto Arrange
  windows" button titles stayed hardcoded English regardless of active language. Added
  23 new i18n keys and wired them in, bringing every shipped dictionary (English,
  Polish, and the German/Arabic catalog files) to 456 keys, 1:1. Bumped
  `languages/de.json`, `languages/ar.json`, and `languages/pl.json` to version 1.0.1
  since their dictionary content changed.

## 2026-07-14

- Added text-direction RTL support and Arabic (`languages/ar.json`) as the
  first RTL language, installable through the Language Manager catalog
  exactly like German/Polish. Language catalog manifests can now carry an
  `"rtl": true` field; `i18n.js` reads it and sets `<html dir="rtl">` on
  every language switch (and at boot for whichever language was last
  active). Scope is deliberately narrow: LS/RS/activity bar stay
  physically where they are today — only text direction flips (3
  `text-align: left → start` CSS fixes). Added a `unicode-bidi: isolate`
  rule for the results table's IP/ping/AS/HTTP-status columns so that
  inherently left-to-right data (addresses, port numbers) never gets
  visually reordered by the bidi algorithm under RTL. Full structural
  mirroring (LS/RS swapping sides) is a separate, larger, deferred item —
  see ROADMAP.md.
- Fixed local `Import language...` silently falling back to English when
  pointed at a "rich" catalog-shaped file (e.g. a `languages/<code>.json`
  downloaded manually) instead of the plain local dictionary format — it
  now detects both shapes and unwraps the rich one correctly, including
  its `rtl` flag.
- Fixed the top menu bar's dropdowns overflowing off-screen under RTL
  (Arabic): setting `<html dir="rtl">` doesn't just flip text — it also
  reverses the physical order of any flex/grid container using the
  default axis (menu bar row, the activity-bar/LS/CS/RS grid, the status
  bar row), which pushed left-anchored menu dropdowns past the right edge
  of the window and moved LS/RS/activity bar off their stated physical
  side. Pinned `direction: ltr` on `.v1-menubar`/`.v1-main`/`.v1-status`
  (the structural chrome) and re-declared `direction: rtl` on the actual
  panel content (`.v1-sidebar`/`.v1-editor`/`.v1-rightbar`) and menu
  dropdown text under `html[dir="rtl"]`, so chrome position stays fixed
  while text keeps reading right-to-left.

## 2026-07-13

- Language Manager (Options → Language...) redesigned to match Import
  Tool's look: the old raw-code combobox is replaced by an installed-languages
  list (flag emoji + version, radio-button activation, no uninstall) and a
  new GitHub-backed catalog below it, fetched from this repo's `languages/`
  folder exactly like the `tools/` addon catalog. Local `.json` import
  ("Import language...") still works unchanged. Added German
  (`languages/de.json`) as the first catalog language — a complete,
  hand-translated 433-string dictionary. Cleaned up 8 dead i18n keys left
  over from an older paste-JSON language UI.
- Added `languages/pl.json` — Polish published in the same catalog format
  as German, even though `pl` is a built-in language (shows as "already
  installed" in the catalog, matching the built-in `en`/`pl` behavior).
  While assembling it, found and fixed real drift in `i18n.js`'s PL
  dictionary: a stray `resultsIpHeaderIpAddress` key that only ever
  existed in PL (no EN counterpart, unused anywhere), and 13 keys
  (`resultsIpColumn*`/`resultsIpHeader*`) that were defined **twice**
  inside the PL dictionary object - a copy-pasted block sitting between
  `statusRangeSet` and `statusRangeRecalled` (which are adjacent in EN),
  silently overridden by JS object-literal semantics but confusing source.
  PL and EN now have exactly the same 433 keys, no duplicates.

## 2026-07-12

- New TBM Options -> **General** screen: per-setting checkboxes controlling
  whether a shell preference (UI language, skin, panel sizes, "Blur IP
  addresses", "Show unfinished tools", detached-window layout, Clippy
  enabled, installed addons, IP range history) is remembered across app
  restarts or reset to default on next launch. All default to remembered
  (today's behavior), applied via a new `applyRememberedSettingsGate()` in
  `bootstrap-runtime.js` that runs before any of those settings are read.
- New **Auto Load last session** toggle (first item in General, off by
  default): on desktop, automatically reopens the most recently saved/opened
  session on startup instead of showing the "Recent sessions" welcome
  screen. Reuses the existing dialog-free `loadSessionFromPath()`; the
  triggered reload happens while the window is still hidden, so there's no
  visible flash of the welcome screen first. Not available on the www build
  (no dialog-free file-read primitive in the browser).
- Panel sizes (left/right/bottom section widths/heights) **and** their
  collapsed/expanded state are now persisted across restarts by default
  (`netrecon_panel_sizes_v1`) — previously they silently reset to the
  hardcoded defaults on every launch.
- Added a "Remember window state" toggle to General: the app now remembers
  whether it was windowed, maximized, or fullscreen and reopens in that same
  mode (default on). New Rust command `window_get_state` (read-only) backs
  it; restoring reuses the existing `window_toggle_maximize`/
  `window_toggle_fullscreen` commands rather than duplicating their
  frameless-window work-area fix.
- Added a "Remember open tabs" toggle to General: which LS/RS/CS tabs were
  open (and which was active per section) at last graceful exit are now
  restored on the next launch, independent of any saved session file.
  Yields to a session's own saved layout when one is about to load (Auto
  Load last session, or a pending manual save/load reload).

## 2026-07-11

- Repo-wide dead-code cleanup (audit): removed ~26 unreachable Tauri backend
  commands and their helpers/structs from `src-tauri/src/main.rs` (WiFi,
  Bluetooth, GNSS, LTE, sniffer, phone lookup, image metadata, traceroute,
  AI provider/secure-key commands, the separate tool-window + native-clippy
  window subsystem, JSON export/import dialogs) — none were called from any
  JS. `main.rs` shrank from ~4370 to ~1280 lines; 4 unused crates dropped
  (`btleplug`, `serialport`, `keyring`, `if-addrs`); `cargo check` is clean.
  On the front end: deleted the orphaned extension-manager modal
  (`extension-manager-runtime.js`), ~9 never-used CSS rule groups, a batch of
  dead i18n keys, and the fake static scan metrics + Export/Import buttons in
  the main card. Consolidated the port-preset defaults (4 drifting copies →
  one canonical source) and `escapeHtml` (→ shared util). Renamed the stale
  `blur-ip-soon` action to `blur-ip` (the feature has shipped), refreshed the
  now-inaccurate ShellCraft/Import-Tool descriptions, and dropped the
  write-only `netrecon_active_tool` localStorage key. See
  [ROADMAP.md](ROADMAP.md) "Removed" for details.
- ShellCraft: fixed 10 issues found by a code review of the block-canvas
  editor — listener leaks in the canvas/inspector wiring (accumulated on
  every tab switch), the detached/floating ShellCraft window being fully
  non-interactive, macro runs always reporting success even when they
  silently failed, a dead "not runnable" click branch, the Macro console tab
  not feeding the Down Section unread-badge system, missing wheel/keyboard
  scrolling on the canvas, Library/Inspector not refreshing on language
  switch, and the Inspector re-opening itself right after being manually
  closed.
- Moved top-level docs (`ROADMAP.md`, `SHELL_PROGRESS.md`,
  `FUTURE_PLUGIN_SHELL.md`, `MEMORY_SESSION.md`,
  `SESSION_DATABASE_SCHEMA.md`) into `docs/`.

## 2026-07-10

- ShellCraft: real drag-and-drop block canvas (Center Section), a
  categorized block Library (Left Section: Functional / Macros), the
  Inspector moved from Left to Right Section with live property editing, and
  3 working macros (External IP / Local IP / Subnets) reachable from a
  terminal-style Down Section "Macro" console tab (type a macro name, `?` or
  `help` for the list).
- ShellCraft: Flow / Timeline / Tree / Layered view switcher next to the
  title (only Flow is implemented; the rest are shown disabled).
- Top Bar Menu: "Show unfinished tools" toggle, revealing Topology Map and
  Globe (hidden from the LSB and Tools menu by default since they have no
  real logic yet — see ROADMAP backlog items 13-14).
- Hid Topology Map and Globe from the LSB and Tools menu.
- Reorganized the File and Tools menus; unified custom confirm dialogs
  (session close/new, dev full reset, extension install permission) to
  match the app's existing "Exit" dialog look; added a native www "Save As"
  via the File System Access API.
- Added protocol/service badges and per-port ping to open ports, persisted
  in the session `.sqlite3` schema.
- Implemented the "Blur sensitive data" toggle as a real, persisted CSS
  class covering IP tables, range inputs, and (blanket, whole-pane, see
  ROADMAP "Planned") Terminal/Console/Macro output.
- Fixed the frameless window's maximize covering the Windows taskbar with a
  black bar.

## 2026-07-09

- Rebranded to OSINT NET Auditor across the compiled binary name and
  installers (NSIS/MSI, with WebView2 auto-detection).
- Added www session save/load via sql.js — real `.sqlite3` files,
  round-trip compatible with the desktop app, no server involved.
- Simplified the Language Manager to a plain list + import button.
- Added `ROADMAP.md`; audited which tool features can run on www vs.
  desktop-only.
