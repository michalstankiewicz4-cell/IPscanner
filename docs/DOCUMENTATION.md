# OSINT NET Auditor v2.8.5 - Documentation

## Table of Contents

- [1. Shell](#shell)
  - [1.1. Top bar menu](#11-top-bar-menu)
    - [1.1.1. Logo](#111-logo)
    - [1.1.2. File](#112-file)
    - [1.1.3. Options](#113-options)
    - [1.1.4. Tools](#114-tools)
    - [1.1.5. Last saved session name](#115-last-saved-session-name)
    - [1.1.6. Button panel](#116-button-panel)
    - [1.1.7. Window button manager](#117-window-button-manager)
  - [1.2. Left shortcut menu](#12-left-shortcut-menu)
    - [1.2.1. Community](#121-community)
    - [1.2.2. Result data list](#122-result-data-list)
  - [1.3. Down information bar](#13-down-information-bar)
    - [1.3.1. Loader](#131-loader)
    - [1.3.2. Processes](#132-processes)
    - [1.3.3. Loading progress bar](#133-loading-progress-bar)
    - [1.3.4. Domain verification status](#134-domain-verification-status)
    - [1.3.5. Version information](#135-version-information)
    - [1.3.6. Active tab](#136-active-tab)
  - [1.4. Left section](#14-left-section)
  - [1.5. Right section](#15-right-section)
  - [1.6. Central section](#16-central-section)
    - [1.6.1. Tab](#161-tab)
    - [1.6.2. Window](#162-window)
  - [1.7. Down section](#17-down-section)
    - [1.7.1. Terminal](#171-terminal)
    - [1.7.2. Macro](#172-macro)
    - [1.7.3. Console](#173-console)
- [2. Sessions](#sessions)
- [3. Options](#options)
  - [3.1. Country IP Library](#31-country-ip-library)
  - [3.2. Port presets](#32-port-presets)
  - [3.3. Language](#33-language)
  - [3.4. General](#34-general)
  - [3.5. Keyboard shortcuts](#35-keyboard-shortcuts)
  - [3.6. Community Catalog](#36-community-catalog)
  - [3.7. Agent identity](#37-agent-identity)
- [4. Tools](#tools)
  - [4.1. AI Assistant](#41-ai-assistant)
    - [4.1.1. Setup](#411-setup)
    - [4.1.2. Permissions](#412-permissions)
  - [4.2. ShellCraft](#42-shellcraft)
  - [4.3. IP Scanner](#43-ip-scanner)
  - [4.4. Network Monitor](#44-network-monitor)
  - [4.5. Email Recon](#45-email-recon)
  - [4.6. Topology](#46-topology)
  - [4.7. Desktop Preview](#47-desktop-preview)
  - [4.8. Globe](#48-globe)
  - [4.9. Browser](#49-browser)
  - [4.10. Mail XSS Tester](#410-mail-xss-tester)
    - [4.10.1. Payloads](#4101-payloads)
    - [4.10.2. Raw-MIME techniques](#4102-raw-mime-techniques)
      - [4.10.2.1. utf7-charset](#41021-utf7-charset)
      - [4.10.2.2. overlong-utf8](#41022-overlong-utf8)
      - [4.10.2.3. mime-boundary-desync](#41023-mime-boundary-desync)
      - [4.10.2.4. mime-boundary-desync-css](#41024-mime-boundary-desync-css)
      - [4.10.2.5. mime-alternative-control-img / mime-alternative-control-css](#41025-mime-alternative-control-img--mime-alternative-control-css)
      - [4.10.2.6. encoded-word-header](#41026-encoded-word-header)
    - [4.10.3. Custom technique builder](#4103-custom-technique-builder)
    - [4.10.4. Tunnel](#4104-tunnel)
    - [4.10.5. Test mail](#4105-test-mail)
      - [4.10.5.1. Mail verification](#41051-mail-verification)
  - [4.11. HTTPS Auditor](#411-https-auditor)
  - [4.12. Reverse IP Lookup](#412-reverse-ip-lookup)
  - [4.13. Google Dork Finder](#413-google-dork-finder)
  - [4.14. WiFi](#414-wifi)
- [5. Creating addons](#creating-addons)

## Shell

The main window's layout: a menu bar and status bar framing four regions -
Left, Right, Central, and a collapsible bottom panel.

### 1.1. Top bar menu
<img width="958" height="20" alt="image" src="https://github.com/user-attachments/assets/6b679898-9a90-4f26-80b4-b6e9dea44d21" />

The bar across the top of the window: the app logo, the File/Options/Tools
menus, the current session's name, a small utility button panel, and the
window controls.

#### 1.1.1. Logo
<img width="131" height="36" alt="image" src="https://github.com/user-attachments/assets/b9df151f-40e4-4579-b777-ff099fe74085" />

The app icon in the top-left corner. Purely decorative - not clickable.

#### 1.1.2. File
<img width="224" height="200" alt="image" src="https://github.com/user-attachments/assets/7b29af44-cddd-4188-a683-63dabb86c43f" />

New, Open, Open Recent, Import, Save, Save As, Close, Exit - see
[2. Sessions](#sessions). Import is a placeholder, not implemented yet.

#### 1.1.3. Options
<img width="221" height="158" alt="image" src="https://github.com/user-attachments/assets/bf9fa1ef-d793-4c07-95e7-8d4e0caaee8b" />

Country IP Library, Port Presets, Language, General, Community Catalog,
Agent Identity - see [3. Options](#options).

#### 1.1.4. Tools
<img width="224" height="298" alt="image" src="https://github.com/user-attachments/assets/ca3083fb-5701-4711-9196-4f9e35779edf" />

Opens any of the app's tools - see [4. Tools](#tools) for the full list.

#### 1.1.5. Last saved session name
<img width="155" height="31" alt="image" src="https://github.com/user-attachments/assets/c22cecd9-eef7-4784-b349-d9cd095a59ce" />

Shows the current session's filename once one is saved or loaded (hover
for the full path), or "No active session" otherwise. Read-only, not
clickable.

#### 1.1.6. Button panel
<img width="114" height="29" alt="image" src="https://github.com/user-attachments/assets/5dbf5bb9-28d0-4803-be16-bd44d52cd47d" />

Three small controls: **⟲** resets local app settings/cache and reloads
(not your saved session files); **👁** blurs IP/hostname text everywhere,
handy for screen-sharing; the auto-arrange checkbox plus **▦** button
tidies up any detached floating tool windows into a grid.

#### 1.1.7. Window button manager
<img width="136" height="26" alt="image" src="https://github.com/user-attachments/assets/ec6cf3a5-6ac2-4b06-8d38-8dd3eb58c93f" />

Minimize, maximize, fullscreen, and close - desktop-only. Close snapshots
your currently open tabs first if "Remember open tabs" is enabled in
[3.4. General](#34-general).

### 1.2. Left shortcut menu
<img width="38" height="64" alt="image" src="https://github.com/user-attachments/assets/a6e9fa7c-6e46-4c9f-8808-4ede7522506e" />

A narrow icon bar for jumping straight to a few key panels: 💬 Community,
📊 Result Data List, 📡 IP Scanner, 🖧 Network Monitor, 📧 Email Recon.

#### 1.2.1. Community
<img width="509" height="309" alt="image" src="https://github.com/user-attachments/assets/4b7c3107-580e-44a7-9591-187c26ba305f" />

Opens the Community Chat panel.

#### 1.2.2. Result data list
<img width="221" height="131" alt="image" src="https://github.com/user-attachments/assets/8b16784d-f487-4ec4-b187-a643eefbedba" />

Opens the IP Scanner's results table.

### 1.3. Down information bar
<img width="959" height="14" alt="image" src="https://github.com/user-attachments/assets/40ef2f02-a16a-4b7d-902a-0d7088b79680" />

A thin status strip along the bottom of the window with six live
indicators, left to right.

#### 1.3.1. Loader
<img width="26" height="19" alt="image" src="https://github.com/user-attachments/assets/67bb063b-ce08-4888-8e73-0af68ee6bd3a" />

Animates while something is running in the background - a scan, an API
call, etc.

#### 1.3.2. Processes
<img width="17" height="20" alt="image" src="https://github.com/user-attachments/assets/1eb37308-3fa7-478d-a9c6-e7a644fa700b" />

Count of active background operations; hover for a breakdown of what's
running. Green at 0-1, amber once more than one stacks up.

#### 1.3.3. Loading progress bar
<img width="92" height="21" alt="image" src="https://github.com/user-attachments/assets/995651dc-fe54-4d69-8ee2-ffb0565f2c73" />

Fills in during an IP scan, showing how many addresses have been
processed.

#### 1.3.4. Domain verification status
<img width="16" height="21" alt="image" src="https://github.com/user-attachments/assets/c1a44602-a04b-4021-b0d8-030225efebc5" />

Reflects whatever's typed into [3.4. General](#34-general)'s domain
verification field: white if empty, green if verified, red if not. With
the field empty, stays green as long as at least one domain has ever been
verified this session.

#### 1.3.5. Version information
<img width="18" height="20" alt="image" src="https://github.com/user-attachments/assets/1933203a-31c6-4591-b48f-4d1c121a02a2" />

Green when you're on the latest release; blinks amber with the new
version number in its tooltip when an update is available.

#### 1.3.6. Active tab
<img width="83" height="23" alt="image" src="https://github.com/user-attachments/assets/4aee3504-4c4c-4439-b34e-59d28ef859ce" />

Names whichever tab is currently focused in the central panel.

### 1.4. left section
<img width="239" height="449" alt="image" src="https://github.com/user-attachments/assets/3d9baa83-82f2-4e3a-a00b-6925e226c1d2" />

Hosts each tool's own supporting panel - result tables, libraries, history
lists, and similar - depending on what's open.

### 1.5. right section
<img width="209" height="448" alt="image" src="https://github.com/user-attachments/assets/c76124ec-5ee9-45a1-9b7d-f52015531e25" />

Hosts each tool's own configuration or output panel - scan settings, the
AI Assistant chat, live logs, and similar - depending on what's open.

### 1.6. Central section
<img width="520" height="322" alt="image" src="https://github.com/user-attachments/assets/c3963ae1-c5a4-4427-968a-bf114ec0af37" />

Where every tool's main view lives, one per tab.

#### 1.6.1. Tab
<img width="507" height="38" alt="image" src="https://github.com/user-attachments/assets/726ef941-bcbc-4949-9ce9-3c7f14c07168" />

The tab strip. Tabs can be closed (×) or popped out (↗), and scroll when
there are more than fit - they can't be reordered.

#### 1.6.2. Window
<img width="515" height="380" alt="image" src="https://github.com/user-attachments/assets/68a54299-3c56-4184-95d8-97f5ac3286e6" />

Popping out (↗) a tab turns it into a draggable, resizable floating card
confined to the app's own window - not a real separate OS window.
Position and size are remembered per tool. The only feature that opens a
genuine standalone OS window is the Browser tool's own "open in real
window" button - see [4.9. Browser](#49-browser).

### 1.7. Down section
<img width="512" height="149" alt="image" src="https://github.com/user-attachments/assets/1621cd94-653d-456e-a262-b878a77b829e" />

A collapsible bottom panel with three tabs.

#### 1.7.1. Terminal
<img width="512" height="149" alt="image" src="https://github.com/user-attachments/assets/92805ec4-2f38-4dd9-b6e1-884b1e3627cd" />

A real PowerShell console running inside the app.

#### 1.7.2. Macro
<img width="513" height="146" alt="image" src="https://github.com/user-attachments/assets/673c3753-ede0-44fd-986d-8611da181d11" />

A tiny command runner for exactly three built-in shortcuts: `ext-ip`,
`local-ip`, `subnets` (type `help` to list them) - not a general
scripting console.

#### 1.7.3. Console
<img width="509" height="147" alt="image" src="https://github.com/user-attachments/assets/8c460b1d-d646-48b1-abb4-4a2f2094e923" />

A read-only log of what the app itself is doing in the background - rate
limit waits and similar.

## Sessions
<img width="443" height="253" alt="image" src="https://github.com/user-attachments/assets/38f2777e-c956-4ccb-9b71-a1f2b36e2854" />

A session is a single SQLite file (`OSINT-session.sqlite3` by default)
holding everything: scan results, the IP library, presets, agent
profiles, layout, and more.

- **New** and **Close** both clear the current session back to a blank
  state.
- **Open**, **Save**, and **Save As** use native file dialogs. Save
  writes to the current file if one's already loaded, otherwise falls
  back to Save As.
- **Exit** asks whether to save first.
- **Import** is a placeholder - not implemented yet.

## Options
<img width="247" height="197" alt="image" src="https://github.com/user-attachments/assets/f1672ea6-11a9-4f57-9d59-1370d544feae" />

Reachable from the top menu's Options entry.

### 3.1. Country IP Library
<img width="689" height="280" alt="image" src="https://github.com/user-attachments/assets/2d552bed-81c4-4620-82ef-ffac654eb577" />

A per-country table of IP ranges, refreshed on demand (needs PowerShell,
desktop only).

### 3.2. Port presets
<img width="442" height="311" alt="image" src="https://github.com/user-attachments/assets/c3c24dbb-362c-4daa-862f-99beee9c36fd" />

Editable list of named port groups - an emoji, a name, and a
comma-separated port list - used throughout the scanner.

### 3.3. Language
<img width="344" height="440" alt="image" src="https://github.com/user-attachments/assets/daa24404-d226-484e-969b-90a50ea610ea" />

Switch the UI language, or install one from the community language
catalog (fetched from GitHub) or a local file.

### 3.4. General
<img width="450" height="440" alt="image" src="https://github.com/user-attachments/assets/ccb7abe0-4c9c-4ead-baf2-67e9afc67945" />

Per-setting checkboxes for what should be remembered across restarts,
plus:

- AI Assistant provider setup - see [4.1.1. Setup](#411-setup).
- Domain verification: generate a verification file/key, upload it to a
  site's root, then verify individual domains against it - proves
  control over a domain before features that act on someone else's site
  (like Browser Inspect) are allowed to target it. Reflected live in
  [1.3.4. Domain verification status](#134-domain-verification-status).
- Mail verification: send yourself a one-time code and type it back to
  prove control over a mailbox, the same idea as domain verification
  above but for email - see
  [4.10.5.1. Mail verification](#41051-mail-verification).
- A Google Dork API key field - saved for a future feature, not used
  yet.

### 3.5. Keyboard shortcuts

Not implemented yet.

### 3.6. Community Catalog
<img width="463" height="263" alt="image" src="https://github.com/user-attachments/assets/a93e77db-f5f6-4e2f-b184-a1f51cbdb4eb" />

Browse addons published by anyone as a public GitHub repo tagged
`osintnetauditor-addon` - see [5. Creating addons](#creating-addons).
Browsing and installing needs no login; rating or commenting on an addon
does (real GitHub sign-in).

### 3.7. Agent identity
<img width="687" height="423" alt="image" src="https://github.com/user-attachments/assets/ca978a2b-d8c9-4456-ba5f-405b255605e2" />

Save reusable OSINT identities - name, email, login, password, notes,
photo/file attachments, and freeform per-service fields - as part of the
session.

## Tools
<img width="251" height="353" alt="image" src="https://github.com/user-attachments/assets/82c4ffbb-d2c3-4255-8153-e4ba6c692e52" />

Reachable from the top menu's Tools entry.

### 4.1. AI Assistant

A chat panel wired directly to Anthropic's or Google's API using your own
key - no backend involved. Can call the app's own tools on your behalf,
gated by [4.1.2. Permissions](#412-permissions).

#### 4.1.1. Setup

[3.4. General](#34-general) -> AI Assistant: pick a provider (Anthropic
or Google), a model, and paste an API key
([get an Anthropic key](https://platform.claude.com/settings/workspaces/default/keys) /
[get a Google key](https://aistudio.google.com/api-keys)) - stored
locally or RAM-only, your choice.

#### 4.1.2. Permissions

A profile (Read-only / Assisted / Autonomous / Custom) plus a per-tool
auto/ask/off list controlling what the AI Assistant is allowed to do on
its own, with an audit log of everything it's actually done.

### 4.2. ShellCraft

A drag-and-drop automation canvas. Only the three macro blocks (External
IP / Local IP / Subnets) actually run today - If, Repeat Until,
PowerShell, and Time Trigger blocks can be placed but aren't runnable
yet.

### 4.3. IP Scanner

Scan an IP range or CIDR block for open ports. TCP Connect, UDP, and
ICMP are available; TCP SYN and OS Detection are shown but permanently
disabled.

### 4.4. Network Monitor

Live tables of local TCP/UDP connections and LAN devices (with vendor
lookup via MAC OUI), sortable and groupable.

### 4.5. Email Recon

Look up an email address across emailrep.io, Gravatar, GitHub,
HaveIBeenPwned (breaches and pastes), XposedOrNot, and LeakCheck - pick
which sources to check, with an optional HIBP API key for higher limits.

### 4.6. Topology

A visual network diagram - auto-build it from your last scan, or add
devices (server/switch/printer/router) and tools (scanner/sniffer) by
hand and connect them.

### 4.7. Desktop Preview

Live thumbnails of any Topology node running a reachable VNC server
(desktop only).

### 4.8. Globe

Plots scanned hosts on a 3D globe by geolocation.

### 4.9. Browser

An embedded browser tab with its own address bar, Reload, and Go. If a
site refuses to be framed - or any time, via the **⧉** button - it opens
in a genuine separate browser window instead.

The **Inspect** toggle routes the page through a local proxy so every
request it makes is logged live in the right panel, and lets you choose
whether it blends in as a normal browser or openly identifies as this
app (see [3.4. General](#34-general)).

### 4.10. Mail XSS Tester

Mail XSS Tester checks whether a webmail client sanitizes HTML email
properly, by sending yourself a test email containing several different
HTML injection techniques and watching which ones actually get through
and execute. Each payload is tagged with a random token unique to that
session, so a hit can never be confused with an unrelated run, and every
payload's only effect is a single network request to a local beacon - no
exfiltration, no persistence, nothing to clean up afterwards either way.

The overall flow: start the tunnel (4.10.4), fill in your own mailbox's
credentials and send yourself the test email (4.10.5), then open that
email in the webmail client you actually want to test - whichever
payloads fired show up live in the app's results list, tagged with
method, timestamp, User-Agent, and the requesting IP.

Three things can be sent in one go, each covering different ground: the
six fixed payloads (4.10.1) for known HTML/CSS/SVG sanitizer-bypass
tricks, the fixed raw-MIME techniques (4.10.2) for SMTP/MIME-encoding
edge cases, and the custom technique builder (4.10.3) for combinations
that don't have a fixed checkbox of their own.

#### 4.10.1. Payloads

Six variants are included, each demonstrating a different HTML/CSS/SVG
injection vector - a sanitizer that strips the right tag or attribute
simply prevents that one payload from ever calling out, which is itself
the useful signal:

- **img-onerror** - `<img src="invalid" onerror="...">`. A broken image
  reference whose `onerror` handler fires the moment the browser gives up
  loading it.
- **svg-onload** - `<svg onload="...">`. Fires via the `onload` event
  attribute directly on an inline SVG element.
- **svg-script** - `<svg><script>...</script></svg>`. A plain
  `<script>` tag, nested inside an SVG rather than the HTML body -
  many sanitizers strip `<script>` at the top level but miss it inside
  other elements.
- **css-import** - `<style>@import "...";</style>`. A CSS `@import`
  pointing at the beacon URL - CSS rules alone can trigger a network
  request, no JavaScript execution needed at all.
- **iframe-src** - `<iframe src="...">`. The simplest variant - just an
  embedded frame pointing straight at the beacon, loaded the moment the
  email renders.
- **foreignobject** - `<svg><foreignObject><body onload="...">`. Smuggles
  a regular HTML `<body>` with an `onload` handler inside an SVG
  `foreignObject` - a known technique for sneaking past sanitizers that
  only look at top-level HTML tags.

#### 4.10.2. Raw-MIME techniques

Unlike the six payloads above, these don't rely on a sanitizer missing a
specific HTML tag or attribute - each one instead targets the boundary
between the SMTP/MIME transport layer and HTML parsing itself, built
byte-for-byte as a raw message rather than through a normal typed email
API. Each is its own separate email (they can't share a message with
each other or with the payloads' combined body), so a hit's beacon path
identifies exactly which technique fired.

Every one of these has come back negative against Gmail in this app's
own testing so far - included as diagnostics for other webmail clients,
not because Gmail is known to be vulnerable to them.

##### 4.10.2.1. utf7-charset

Declares the whole message body's charset as UTF-7 and encodes the
payload's `<`/`>`/`{`/`}` through UTF-7's own shift-sequence encoding
(e.g. `<script>` becomes `+ADw-script+AD4-`) - no literal `<script>`
substring exists anywhere in the raw bytes, only after a UTF-7-aware
decoder converts it back.

##### 4.10.2.2. overlong-utf8

Encodes `<`/`>` as invalid, "overlong" UTF-8 byte sequences (a
technically illegal, non-canonical way of encoding a plain ASCII
character using more bytes than necessary). Tests whether the mail
client's UTF-8 decoder is strict (rejects the sequence outright, per
spec) or lenient (silently accepts it and reconstructs the literal
character anyway).

##### 4.10.2.3. mime-boundary-desync

A well-formed three-part `multipart/alternative` message where the
second part's own content contains something that *looks* like a
second MIME boundary line, without actually being a real one - tests
whether a parser gets confused about where that part ends, letting an
`<img>` payload leak into a part that gets rendered.

##### 4.10.2.4. mime-boundary-desync-css

The same boundary-confusion trick as 4.10.2.3, but smuggling
`<style>@import "...";</style>` instead of `<img>` - tests whether
external CSS reaches the recipient's browser directly, since webmail
providers that proxy embedded images server-side don't necessarily do
the same for CSS.

##### 4.10.2.5. mime-alternative-control-img / mime-alternative-control-css

A control pair for 4.10.2.3 and 4.10.2.4: byte-for-byte the same
three-part shape, but with every boundary line well-formed (no
malformed junk anywhere). If these ALSO trigger, it proves the
malformed boundary in the other two wasn't doing anything special - a
mail client rendering the last part it understands in a
`multipart/alternative` message is standard, expected behavior
(RFC 2046 §5.1.4), not a parser bug.

##### 4.10.2.6. encoded-word-header

Encodes the `From:` header itself using RFC 2047 "encoded word" syntax
(a base64 blob), hiding a payload inside what looks like an ordinary
display name - tests whether anything scans raw header bytes for
known-bad substrings before header-decoding happens.

#### 4.10.3. Custom technique builder

Rather than one fixed checkbox per possible combination, this builds a
raw-MIME technique from parts you pick yourself:

- **Vector** - which tag carries the beacon call: `<script>` (a
  `fetch()` call) or CSS `<style>@import "...";</style>`.
- **Mechanism** - how the tag's own delimiters are hidden from a raw
  byte scan:
  - **Soft line break** - splits the tag name itself with a
    quoted-printable soft line break (e.g. `<scri=` + a line break +
    `pt>`) - decoding removes that break and rejoins the tag, so the
    intact tag name never appears unbroken in the raw wire bytes.
  - **Hex-escape '<' only** / **'>' only** / **both** - hex-escapes one
    or both angle brackets as their quoted-printable `=3C`/`=3E`
    equivalents. Escaping only one isolates whether a scanner needing
    to see a complete `<tag>` shape behaves differently from one that
    only cares about the opening delimiter.
  - **Natural QP line-wrap** - instead of a hand-placed break, lets a
    real RFC 2045 76-column-limit encoder decide where its own soft
    line break falls, based on how much filler text precedes the tag.
- **Filler text** (natural-wrap only) - a plain, freely editable text
  field, not just a length: a "Generate" button seeds it with a preview
  of a given character count (repeating the classic Polish pangram,
  chosen for its diacritics), but the field can be retyped or pasted
  over with anything before sending.

"Send custom technique" sends the current combination immediately, as
its own separate email, using the same sender/recipient fields as
4.10.5 below. The "+" button next to it instead queues the current
combination into a list underneath (each entry individually removable)
without sending it - "Send queued techniques (N)" then sends every
queued combination together, one email each, sequentially. This is the
way to test several hand-picked combinations in one run (for example a
sweep of natural-wrap filler lengths) without needing a fixed checkbox
for each one.

#### 4.10.4. Tunnel

Detection needs a beacon endpoint that's reachable from the public
internet - most webmail providers (Gmail included) fetch/proxy embedded
content through their own infrastructure rather than the recipient's
machine, so a plain `localhost` listener would never see a hit. The
tunnel bridges that gap.

Requires [cloudflared](https://github.com/cloudflare/cloudflared/releases/latest)
(Cloudflare's free, account-free tunnel client) to be installed first -
on that releases page, download **cloudflared-windows-amd64.msi**
specifically (the installer - it adds itself to `PATH` automatically, no
manual setup needed). If it's missing, the app's own "Download
cloudflared" button opens that exact page for you.

Clicking "Start tunnel" in the app starts a small local HTTP server (the
beacon, which just logs whatever hits it) and exposes it through a
temporary Cloudflare Quick Tunnel - a real public
`https://*.trycloudflare.com` URL, generated fresh each time, no
Cloudflare account required. The test email's payloads all point at that
URL. Stopping the tunnel (or closing the app) tears both the tunnel and
the local beacon server back down, so nothing is left listening once the
test is done.

#### 4.10.5. Test mail

Sending needs real SMTP credentials for a real mailbox - never your
account's normal login password, an app-specific one instead.

Fill in, in the app:

- **Send via** - which SMTP provider actually delivers the mail: Gmail
  or Onet. Onet exists specifically so a technique message can cross
  two genuinely different mail systems (this tool's own SMTP client,
  through Onet's real servers, to the recipient) instead of always
  originating from the app itself.
- **Account email** / **Password** - the sending account's credentials.
  For Gmail this must be a
  [Google App Password](https://myaccount.google.com/apppasswords)
  (requires 2-Step Verification to already be on; generating one is a
  single click on that page) - a normal Gmail login password is
  rejected. Onet has no separate app-password system, so its own
  regular account password is used instead. The field under the
  password updates to say which is expected, based on the provider
  currently selected.
- **To** - locked to a dropdown of mailboxes already proven via
  4.10.5.1 below - never free text, so a test can only ever be aimed at
  a mailbox you've already demonstrated you control.
- **Subject** - whatever's convenient for telling test runs apart later.

With the tunnel running and these fields filled in, "Send" delivers
every selected payload (4.10.1) and raw-MIME technique (4.10.2) in one
run - the payloads combined into a single email, each technique as its
own separate one. Open the result in the target webmail client
afterwards - the app's results list updates live as payloads/techniques
fire.

##### 4.10.5.1. Mail verification

Lives in [3.4. General](#34-general), not in Mail XSS Tester's own
tabs - proves you actually control a mailbox before it can be picked as
the "To" address above, the same way [3.4](#34-general)'s domain
verification proves control over a domain before Browser Inspect can
target it.

The flow: fill in a sender account (its own provider/address/password
fields, entirely separate from Mail XSS Tester's own send form above -
switching one doesn't affect the other), type in the mailbox you want
to verify, and send yourself a one-time code. Typing that code back in
confirms it and adds the mailbox to the verified list. Unlike sending
an actual test payload, this doesn't need the tunnel running at all -
the code is a plain email with no beacon URL in it, nothing for a
public endpoint to receive.

### 4.11. HTTPS Auditor

Checks a URL for HSTS, security headers, the redirect chain, and mixed
content, with a certificate panel and an overall grade (desktop only).
Keeps a history of past runs, exportable as CSV.

### 4.12. Reverse IP Lookup

Type an IP address to get its reverse-DNS (PTR) hostname, who owns the
block (via RDAP), and any other domains historically seen resolving to
that address. Works on both desktop and the web build, no backend
needed.

### 4.13. Google Dork Finder

Builds a Google search query (`site:`/`filetype:`/`inurl:`/`intitle:`/
`intext:`) from templates or your own picks, and opens it in your real
browser - never scrapes Google directly. Keeps a reusable history of
past queries.

### 4.14. WiFi

Scan nearby networks, or view and reveal saved WiFi profiles and their
passwords (desktop only, via `netsh wlan`).

## Creating addons

Addons are plain JSON manifests (`manifest.json`) that add tools, menu
entries, or PowerShell-backed commands - no build step, and no
sandboxing beyond a single `"powershell"` permission the user has to
approve on install.

To publish one: create a public GitHub repo tagged with the topic
`osintnetauditor-addon`, with `manifest.json` at the root (optionally an
`icon.png` and a `main.js` for real custom logic beyond PowerShell).
It'll show up automatically in
[3.6. Community Catalog](#36-community-catalog) - full format and rules
in [`CONTRIBUTING.md`](https://github.com/michalstankiewicz4-cell/IPscanner/blob/main/CONTRIBUTING.md)
and [`docs/COMMUNITY_ADDON_GUIDELINES.md`](https://github.com/michalstankiewicz4-cell/IPscanner/blob/main/docs/COMMUNITY_ADDON_GUIDELINES.md).
