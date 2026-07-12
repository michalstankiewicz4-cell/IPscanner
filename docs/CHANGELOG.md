# Changelog

Notable user-facing and architectural changes, newest first. For the
high-level "what's done vs. planned" view, see [ROADMAP.md](ROADMAP.md).

This file was started on 2026-07-11 and is not backfilled beyond a few days
of prior context — for full history use `git log`.

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
