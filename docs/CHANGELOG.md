# Changelog

Notable user-facing and architectural changes, newest first. For the
high-level "what's done vs. planned" view, see [ROADMAP.md](ROADMAP.md).

This file was started on 2026-07-11 and is not backfilled beyond a few days
of prior context — for full history use `git log`.

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
  real logic yet — see ROADMAP backlog items 14-15).
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
