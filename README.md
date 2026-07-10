# OSINT NET Auditor

An amateur project made solely using vibe-coding for scientific purposes.

Desktop IP/port scanner application built with [Tauri](https://tauri.app/).

## Installation

### Ready-to-use installer (recommended)

1. Download the latest installer from the [Releases](../../releases) tab:
   - `OSINT NET Auditor_x.x.x_x64_en-US.msi` — MSI installer (Windows)
   - `OSINT NET Auditor_x.x.x_x64-setup.exe` — NSIS installer (Windows)
2. Run the downloaded file and follow the installer instructions.
3. After installation, launch **OSINT NET Auditor** from the Start Menu or desktop shortcut.

### Build from source

**Requirements:**
- [Node.js](https://nodejs.org/) v18+
- [Rust](https://rustup.rs/) (stable)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (C++ components)

**Steps:**
```bash
git clone https://github.com/michalstankiewicz4-cell/IPscanner.git
cd IPscanner
npm install
npm run tauri:build
```

The built EXE and installers will appear in:
`src-tauri/target/release/bundle/`

### A note on antivirus false positives

Some antivirus engines flag the built executable:

<img width="147" height="26" alt="image" src="https://github.com/user-attachments/assets/4768d6d8-9f5e-42c0-a3e9-1d27ab1608ff" />

VirusTotal scan of the release binary:
https://www.virustotal.com/gui/file/7c0706ee5d06693271bb14280606c14b59562fb7b8974e708c2d3b3084f75c0a

The site was clean as of 2026-05-13:
https://www.virustotal.com/gui/domain/ipscanner.pl

## Roadmap

See [ROADMAP.md](ROADMAP.md) for what's done, in progress, and planned next.

## Documentation

| File | Description |
| --- | --- |
| [ROADMAP.md](ROADMAP.md) | What's done, in progress, and planned. |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Project direction and rules for contributing code (written in Polish). |
| [FUTURE_PLUGIN_SHELL.md](FUTURE_PLUGIN_SHELL.md) | Design notes for the addon/plugin shell architecture (written in Polish). |
| [SHELL_PROGRESS.md](SHELL_PROGRESS.md) | Map of the shell layout (menu/panels/status bar) and where each tool opens (written in Polish). |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Community code of conduct. |
| [SECURITY.md](SECURITY.md) | How to report a security vulnerability. |
| [LICENSE.MD](LICENSE.MD) | MIT License. |

## Questions & discussions

Have a question or an idea? Use [GitHub Discussions](https://github.com/michalstankiewicz4-cell/IPscanner/discussions)
instead of opening an issue.

## NEW Screenshots

<img width="1919" height="1199" alt="image" src="https://github.com/user-attachments/assets/e870c791-973c-4365-a556-816111eea023" />

## OLD Screenshots

<img width="1042" height="852" alt="image" src="https://github.com/user-attachments/assets/c7b0f7dd-f0b3-4882-aaed-b8c919045ea1" />

<img width="1917" height="898" alt="image" src="https://github.com/user-attachments/assets/e1a90638-6705-48fc-9b84-6c1a6aeb9546" />

<img width="886" height="530" alt="image" src="https://github.com/user-attachments/assets/55e608d6-f24a-4443-82a7-9a6cdfa253ac" />

<img width="1072" height="838" alt="image" src="https://github.com/user-attachments/assets/94146e40-5993-4cbd-9333-e0390b89f56d" />

<img width="1919" height="1123" alt="image" src="https://github.com/user-attachments/assets/8fb27d15-d021-4be7-8478-7d1a359e215b" />

<img width="1691" height="1020" alt="image" src="https://github.com/user-attachments/assets/82023340-5d0c-451b-aea0-1c7bbf8d99d9" />

<img width="1633" height="947" alt="image" src="https://github.com/user-attachments/assets/38156ec6-386f-4f38-9e35-ea88002f7042" />

<img width="806" height="472" alt="image" src="https://github.com/user-attachments/assets/e93c4357-28b4-488f-8ed3-078502c0d488" />

<img width="1096" height="642" alt="image" src="https://github.com/user-attachments/assets/6c1d1269-e19c-4942-bb82-8aab3a58166a" />

<img width="1450" height="943" alt="image" src="https://github.com/user-attachments/assets/f2ed0a18-b5db-4cf4-8502-facb34c6c055" />

<img width="1359" height="1030" alt="image" src="https://github.com/user-attachments/assets/16d84391-4b03-456f-8bd4-e6ef73cdf6a9" />
