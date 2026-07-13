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
  item 12).
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

## In progress

- Finishing out the core scanner (deprioritized in favor of the shell/addon
  work — see CONTRIBUTING §1 — but not abandoned).
- Further contribution points from `FUTURE_PLUGIN_SHELL.md`: status bar API,
  one activity-bar icon per addon, a unified settings surface, a formal event
  bus (replacing today's ad-hoc `CustomEvent`s), and a command palette.

## Planned

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
- **Selective IP-blur inside Terminal/Console output** — today the IP blur
  toggle blurs those panes whole-pane (see item 16 in the backlog below)
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

## Backlog (per-feature audit, 2026-07-09)

A pass over every menu/tool, numbered for easy reference in discussion:

1. File → "Import another session data": today a mock (see the File menu
   entry in `SHELL_PROGRESS.md`). Should actually import/merge data from
   another saved session file into the current one, instead of replacing it.
2. File → Exit on www: does closing the browser tab/window, or the top-right
   `[x]`, after a save prompt (or after choosing not to save) actually work
   the way it should? Needs checking.
3. www: show a "new version available" popup, but only once per actual
   version change since the visitor's last visit (not on every page load).
4. (www/app) Help Assistant: make it context-aware — show a relevant tip for
   whichever tab/tool is currently active, and update the tip when the user
   switches tools.
5. Finish the core IP Scanner (the deprioritized item from "In progress"
   above).
6. Country IP Library: work out what can run on www vs. app-only, and add
   more library update sources.
7. Port Presets — done, 100%.
8. Audit the actual session save/load file format more closely (the
   `.sqlite3` schema shared with sql.js — see the www session-save work).
9. Default Scan Values — done, 100%.
10. Language: simplify to just a language picker list (selecting a language
    applies it immediately) plus an "import language" button that adds an
    entry to the list — drop everything else in the Language Manager UI.
11. Addon install/uninstall: move the "Load from file..." button above
    "Installed extensions".
12. ShellCraft — block editor v1 done (see "Done" above); still missing: an
    interpreter for If / Repeat Until / PowerShell blocks, block
    nesting/connections, and the Timeline/Tree/Layered views (the switcher
    exists, only Flow works).
13. AI Assistant — ~1.5% done (just the tab exists).
14. Topology Map — ~1% done (just the tab exists). Hidden from the LRSB and
    Tools menu by default; the top-bar "Show unfinished tools" toggle
    reveals it.
15. Globe — ~1% done (just the tab exists). Hidden by default, same as 14.
16. ~~"Blur sensitive data" button — usefulness unclear, consider removing.~~
    **Done** — implemented as a `body.v1-blur-ip` CSS toggle (persisted,
    restored on launch) covering the IP Results table, IP detection results,
    range inputs, IP Extractor, Range History, and — blanket, whole-pane —
    Terminal/Console/PowerShell Console and the info log. Console output
    can't be selectively substring-matched today (see "Planned" below).
17. ~~Down Status Bar shows some info that may not be necessary — review what's
    actually worth keeping there.~~ **Done** — audited: the loader, active
    process count, and 0-100% progress bar are real and wired to actual work
    (`newui:busy-state`/`newui:scan-progress` events from PowerShell commands
    and IP scans). The static `"main • tauri-desktop • UI mock only"` label
    was dead text with no JS reference and has been removed.

Items 7, 9, 10, 11, 16, and 17 are done.

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
