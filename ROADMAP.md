# Roadmap

High-level view of what's done, what's in progress, and what's planned. For
the detailed architectural vision behind the addon system, see
[FUTURE_PLUGIN_SHELL.md](FUTURE_PLUGIN_SHELL.md) (Polish). For the day-to-day
project direction and rules, see [CONTRIBUTING.md](CONTRIBUTING.md) (Polish).

## Done

- Core IP/port scanner (range scanning, results browser, topology and globe
  views, port presets, country IP library, session save/load).
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
    addons straight from the [`tools/`](tools/) folder of this repo.
- Rebrand to OSINT NET Auditor, including the compiled binary name, and
  working NSIS/MSI installers with WebView2 auto-detection.

## In progress

- Finishing out the core scanner (deprioritized in favor of the shell/addon
  work — see CONTRIBUTING §1 — but not abandoned).
- Further contribution points from `FUTURE_PLUGIN_SHELL.md`: status bar API,
  one activity-bar icon per addon, a unified settings surface, a formal event
  bus (replacing today's ad-hoc `CustomEvent`s), and a command palette.

## Planned

- PDF censored-text checker.
- Email/file analyser.
- IPv6/IPv4 correlation.

## Considered and rejected

- **WASM as the addon sandboxing mechanism** — a working proof-of-concept
  (compiled `.wasm` module, linear-memory string marshaling) was built and
  verified end-to-end, but rejected: the debugging surface (pointer/capacity
  arithmetic, opaque traps with no error message) was judged too costly
  relative to the benefit at this stage. The addon system stays JS-only; see
  the note at the top of `FUTURE_PLUGIN_SHELL.md` for details.
