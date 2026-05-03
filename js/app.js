function selectIcon(el) {
  const lbl = document.getElementById('iconLabel');
  const img = document.getElementById('iconImg');
  lbl.style.background = '#000080';
  img.style.filter = 'invert(1) sepia(1) saturate(5) hue-rotate(180deg)';
  setTimeout(()=>{ lbl.style.background='transparent'; img.style.filter=''; }, 1200);
}
function openNotepad() {
  document.getElementById('notepadWin').style.display = 'block';
  document.getElementById('notepadText').value =
`================================================================
  NetRecon IP Scanner 1.5.1
  by Michał Stankiewicz
================================================================

  Tel. / BLIK:  797 486 355

  Jeżeli podoba Ci się to co robię i chcesz wesprzeć
  projekt — każda złotówka motywuje do kolejnych ficzerów!

  BLIK → 797 486 355   💙  Dziękuję!

----------------------------------------------------------------
  LICENCJA (MIT) — Polski
----------------------------------------------------------------

  Niniejszym udziela się bezpłatnie każdemu, kto uzyska
  kopię tego oprogramowania i powiązanych plików dokumentacji
  (dalej „Oprogramowanie"), pozwolenia na korzystanie
  z Oprogramowania bez ograniczeń, w tym bez ograniczeń
  prawa do używania, kopiowania, modyfikowania, łączenia,
  publikowania, dystrybuowania, udzielania podlicencji
  i/lub sprzedaży kopii Oprogramowania, a także zezwalania
  na to osobom, którym Oprogramowanie jest dostarczane,
  pod następującymi warunkami:

  Powyższa nota autorska oraz niniejsze zezwolenie muszą
  zostać dołączone do wszystkich kopii lub istotnych części
  Oprogramowania.

  OPROGRAMOWANIE JEST DOSTARCZANE „TAKIM, JAKIE JEST",
  BEZ JAKIEJKOLWIEK GWARANCJI, WYRAŹNEJ LUB DOROZUMIANEJ,
  W TYM MIĘDZY INNYMI GWARANCJI PRZYDATNOŚCI HANDLOWEJ,
  PRZYDATNOŚCI DO OKREŚLONEGO CELU I NIENARUSZALNOŚCI.
  W ŻADNYM WYPADKU AUTORZY LUB WŁAŚCICIELE PRAW AUTORSKICH
  NIE PONOSZĄ ODPOWIEDZIALNOŚCI ZA JAKIEKOLWIEK ROSZCZENIA,
  SZKODY LUB INNĄ ODPOWIEDZIALNOŚĆ, CZY TO W RAMACH UMOWY,
  DELIKTU CZY W INNY SPOSÓB, WYNIKAJĄCĄ Z OPROGRAMOWANIA
  LUB KORZYSTANIA Z NIEGO.

----------------------------------------------------------------
  LICENSE (MIT) — English
----------------------------------------------------------------

  Permission is hereby granted, free of charge, to any
  person obtaining a copy of this software and associated
  documentation files (the "Software"), to deal in the
  Software without restriction, including without limitation
  the rights to use, copy, modify, merge, publish,
  distribute, sublicense, and/or sell copies of the
  Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice
  shall be included in all copies or substantial portions
  of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
  ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
  TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
  PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
  SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
  CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
  OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
  IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
  DEALINGS IN THE SOFTWARE.

  If you enjoy what I'm building — BLIK is welcome! 🙏
  797 486 355

================================================================`;
}
function closeNotepad() {
  document.getElementById('notepadWin').style.display = 'none';
}

function makeWindowDraggable(winEl, handleEl) {
  if (!winEl || !handleEl || handleEl.dataset.dragBound === '1') return;
  handleEl.dataset.dragBound = '1';
  handleEl.style.cursor = 'move';

  let dragging = false;
  let activePointerId = null;
  let offsetX = 0;
  let offsetY = 0;

  const stopDragging = () => {
    dragging = false;
    activePointerId = null;
    document.body.style.cursor = '';
  };

  handleEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' && e.button !== 0) return;
    if (e.target.closest('.title-btn, .titlebar-btns, button, input, select, textarea, a, label')) return;

    const rect = winEl.getBoundingClientRect();
    dragging = true;
    activePointerId = e.pointerId;
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    // Centered dialogs use transform translate; convert to explicit coords before dragging.
    winEl.style.transform = 'none';
    winEl.style.left = rect.left + 'px';
    winEl.style.top = rect.top + 'px';

    document.body.style.cursor = 'move';
    handleEl.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });

  window.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== activePointerId) return;

    const maxLeft = Math.max(0, window.innerWidth - winEl.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - 28);
    const nextLeft = Math.min(Math.max(0, e.clientX - offsetX), maxLeft);
    const nextTop = Math.min(Math.max(0, e.clientY - offsetY), maxTop);

    winEl.style.left = nextLeft + 'px';
    winEl.style.top = nextTop + 'px';
  });

  window.addEventListener('pointerup', (e) => {
    if (e.pointerId === activePointerId) stopDragging();
  });

  window.addEventListener('pointercancel', (e) => {
    if (e.pointerId === activePointerId) stopDragging();
  });
}

function initAllDialogDragging() {
  makeWindowDraggable(
    document.getElementById('notepadWin'),
    document.querySelector('#notepadWin > div:first-child')
  );

  document.querySelectorAll('.dlg95').forEach((dlg) => {
    makeWindowDraggable(dlg, dlg.querySelector('.dlg-title'));
  });

  makeWindowDraggable(
    document.getElementById('dlgScanCountry'),
    document.querySelector('#dlgScanCountry > .titlebar')
  );

  makeWindowDraggable(
    document.getElementById('dlgTrace'),
    document.querySelector('#dlgTrace > .titlebar')
  );
}

function closeMainWindow() {
  if (_toolMode) {
    closeCurrentWindowImmediate();
    return;
  }
  requestAppCloseConfirmation();
}

let _closeConfirmInProgress = false;

function requestAppCloseConfirmation() {
  if (_closeConfirmInProgress) return;
  _closeConfirmInProgress = true;

  try {
    const ok = window.confirm('Czy jestes pewien, ze chcesz zamknac skaner?');
    if (!ok) return;

    invokeWindowAction('window_close').then(success => {
      if (!success && !_isTauriDesktop) window.close();
    });
  } finally {
    _closeConfirmInProgress = false;
  }
}

function closeCurrentWindowImmediate() {
  invokeWindowAction('window_close').then(success => {
    if (!success) window.close();
  });
}

function getTauriCurrentWindow() {
  const getCurrentWindow = window.__TAURI__?.window?.getCurrentWindow
    ?? window.__TAURI__?.webviewWindow?.getCurrentWindow
    ?? null;
  if (!getCurrentWindow) return null;
  try { return getCurrentWindow(); } catch { return null; }
}

async function invokeWindowAction(commandName) {
  if (_tauriInvoke) {
    try {
      await _tauriInvoke(commandName);
      return true;
    } catch {}
  }
  return false;
}

async function minimizeMainWindow() {
  await invokeWindowAction('window_minimize');
}

async function toggleMaximizeMainWindow() {
  await invokeWindowAction('window_toggle_maximize');
}

async function startMainWindowDrag() {
  await invokeWindowAction('window_start_dragging');
}

function openMainWindow() {
  const win = document.getElementById('mainWin');
  if (!win) return;
  win.style.display = 'block';
  win.style.zIndex = '20';
}


document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('mainCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeMainWindow);

  const minBtn = document.getElementById('mainMinBtn');
  if (minBtn) minBtn.addEventListener('click', minimizeMainWindow);

  const maxBtn = document.getElementById('mainMaxBtn');
  if (maxBtn) maxBtn.addEventListener('click', toggleMaximizeMainWindow);

  const mainTitlebar = document.querySelector('#mainWin > .titlebar');
  if (mainTitlebar) {
    mainTitlebar.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' && e.button !== 0) return;
      if (e.target.closest('.titlebar-btns')) return;
      e.preventDefault();
      startMainWindowDrag();
    });
  }

  initAllDialogDragging();
});

// ══════════════════════════════════════════════════
//  i18n
// ══════════════════════════════════════════════════
let lang = localStorage.getItem('netrecon_lang') || 'en';

const STRINGS = {
  en: {
    menuFile:'File', menuOptions:'Options', menuHelp:'Help',
    menuLanguage:'Language...', menuAbout:'About', menuVersions:'Versions', menuPresets:'Port Presets...', menuCountries:'Country IP Library...', menuDefaults:'Default Scan Values...',
    btnStart:'▶ Start', btnStop:'■ Stop', btnClear:'✕ Clear',
    btnMyIp:'🌐 My External IP', btnMyLocalIp:'🏠 My Local IP', btnLocalSubnets:'🧭 Local Subnets', btnCopy:'📋 Copy', btnUse:'➤ Use',
    scanSettings:'Scan Settings', ipRange:'IP Range:', threads:'Threads:', delayMs:'Delay (ms):',
    modeCam:'📹 Cameras', modePrint:'🖨️ Printers',
    modeFolder:'📁 Folders / HTTP', modeRouter:'🌐 Routers',
    modeNas:'💾 NAS', modeAll:'🔍 All',
    hintCam:'Ports: 80, 8080, 8081, 443, 554(RTSP), 9000, 37777(Dahua), 34567(DVR)',
    hintPrint:'Ports: 80, 443, 631(IPP), 9100(RAW), 8080',
    hintFolder:'Ports: 80, 8080, 8888, 21(FTP), 3000, 8000 — folder listing, FTP',
    hintRouter:'Ports: 80, 443, 8080, 8443, 10000(Webmin)',
    hintNas:'Synology 5000/5001, QNAP 8080, Proxmox 8006, TrueNAS 80/443',
    hintAll:'All known ports at once — slower, most thorough',
    labelChecked:'Checked:', labelFound:'Found:', labelPorts:'Ports:',
    colIp:'IP Address', colPing:'Ping', colHostname:'Hostname', colPorts:'Ports', colLinks:'Paths / Links',
    emptyRow:'No results. Configure IP range and click Start.',
    emptyScanning:'Scanning…', emptyNone:'No active hosts found.',
    detailGeo:'🌍 Geolocation / ISP', detailDevice:'🖥 Device Identification',
    detailTitle:'📄 HTTP Page Title', detailAccess:'🔑 Access',
    geoLocal:'Local address — geolocation unavailable',
    geoError:'Failed to fetch data',
    geoCountry:'Country:', geoIsp:'ISP:', geoAs:'AS:',
    deviceFavicon:'Favicon:', deviceFaviconYes:'✔ Yes (web panel)', deviceFaviconNo:'✘ None',
    deviceType:'Type:', deviceSuggestion:'Hint:', deviceUnknown:'Unknown device type',
    titleExtOnly:'Title: external IPs only', titleUnavailable:'Title: unavailable',
    titleLabel:'Page title:', accessLabel:'Snapshot:',
    accessOpen:'🔓 Accessible without password',
    accessClosed:'Requires authorization or unavailable',
    loading:'Loading…', analyzing:'Analyzing…', checking:'Checking…',
    localSubnetsFound:(n)=>`${n} subnet(s) detected`, localSubnetsNone:'No local subnet found',
    localDetectUnsupported:'Local network detection is not supported in this browser/context',
    localIpDetectError:'Local IP detection failed (WebRTC blocked or unavailable)',
    previewOpen:'↗ Open', previewClose:'✕',
    statusReady:'Ready.', statusCleared:'Cleared.',
    errInvalidIp:'Invalid IPv4 address.',
    errIpRange:'FROM address must be ≤ TO.',
    errNoPorts:'No ports selected in preset.',
    statusScanning:(n,p)=>`Scanning ${n} addresses × ${p} ports…`,
    statusLarge:(n,p,t)=>`Large range: ${n} addresses × ${p} ports. Est. ${t}…`,
    statusStopped:(n)=>`Stopped after ${n} addresses.`,
    statusDone:(h,p)=>`Done. Found ${h} hosts (${p} ports).`,
    statusNone:'Scan complete — no active hosts.',
    statusHosts:(n)=>`${n} hosts`,
    ctxCopyIp:'Copy IP Address', ctxCopyPorts:'Copy Ports', ctxHostname:'Hostname (reverse DNS)', ctxScanAllPorts:'Scan this IP (all ports)',
    ctxOpenBrowser:'Open in Browser', ctxPreview:'Preview here',
    labelPreset:'Preset:', labelPorts2:'Ports:',
    presetAdd:'+ Add', presetDel:'✕ Delete',
    presetEdit:'Edit preset', presetName:'Name:',
    presetPorts:'Ports:', presetSave:'💾 Save',
    presetHint:'Enter port numbers separated by commas, e.g.: 80, 443, 8080, 554',
    dlgTitle:'Options', dlgLang:'Language:',
    dlgDefaults:'Default Scan Values:', dlgDefaultThreads:'Threads:', dlgDefaultDelay:'Delay (ms):',
    dlgLangEn:'English', dlgLangPl:'Polski',
    menuClippy:'📎 Assistant',
    dlgOk:'OK', dlgCancel:'Cancel', dlgClose:'Close', dlgVersionsTitle:'Versions',
    portRtsp:'RTSP stream likely available',
    portIpp:'Printer (IPP)', portRaw:'Printer (RAW)',
    portSyn:'Synology NAS?', portProx:'Proxmox VE?',
    tagVpn:'VPN/Proxy', tagDc:'Datacenter', tagRecognized:'IDENTIFIED',
    notepadDesktop:'Notepad',
    notepadWinTitle:'Notepad – About',
    previewBlocked:'Device blocks embedding (X-Frame-Options).',
    previewBlockedLink:'Open directly in new tab →',
    btnImportTrace:'Import Trace', btnClearGraph:'Clear Graph', graphCleared:'Trace routes cleared.', btnClearTopoFilters:'Clear Filters', topoFiltersLabel:'Filters:', mapLiveLabel:'Live scan visualization',
    filterAllPorts:'All ports', filterPortLabel:'port', filterSubnetLabel:'subnet', filterPingLabel:'ping', filterPingPlaceholder:'Max ms',
    topologyStatus:(n)=>`Topology view · ${n} visible hosts`,
    topologyFilteredStatus:(n)=>`Topology view · ${n} filtered hosts`,
    traceRoutesLabel:'trace routes',
    traceDlgTitle:'Import traceroute', traceTargetLabel:'Target IP:', traceHint:'Paste output from tracert or traceroute.', traceDlgHint:'Import a real traceroute path for the selected host.',
    traceErrTarget:'Enter a valid target IPv4 address.', traceErrTargetOrHost:'Enter a valid target IP or hostname.', traceErrParse:'Could not parse any hops from the pasted output.',
    traceImported:(n, ip)=>`Imported ${n} hops for ${ip}.`, traceImportedStatus:(ip, n)=>`Trace route imported for ${ip} (${n} hops).`, traceHopCopied:(ip)=>`Hop IP copied: ${ip}`,
    btnTraceAuto:'Auto Trace', traceAutoRunning:'Running traceroute...', traceAutoDesktopOnly:'Auto trace works only in Tauri desktop build.',
    traceAutoFailed:(msg)=>`Traceroute failed: ${msg}`,
    btnTraceSave:'Import',
  },
  pl: {
    menuFile:'Plik', menuOptions:'Opcje', menuHelp:'Pomoc',
    menuLanguage:'Język...', menuAbout:'O programie', menuVersions:'Wersje', menuPresets:'Presety portów...', menuCountries:'Biblioteka krajów IP...', menuDefaults:'Domyślne wartości skanowania...',
    btnStart:'▶ Start', btnStop:'■ Stop', btnClear:'✕ Wyczyść',
    btnMyIp:'🌐 Moje zewnętrzne IP', btnMyLocalIp:'🏠 Moje lokalne IP', btnLocalSubnets:'🧭 Lokalne podsieci', btnCopy:'📋 Kopiuj', btnUse:'➤ Użyj',
    scanSettings:'Ustawienia skanowania', ipRange:'IP Range:', threads:'Wątki:', delayMs:'Opóźnienie (ms):',
    modeCam:'📹 Kamery', modePrint:'🖨️ Drukarki',
    modeFolder:'📁 Foldery / HTTP', modeRouter:'🌐 Routery',
    modeNas:'💾 NAS', modeAll:'🔍 Wszystko',
    hintCam:'Porty: 80, 8080, 8081, 443, 554(RTSP), 9000, 37777(Dahua), 34567(DVR)',
    hintPrint:'Porty: 80, 443, 631(IPP), 9100(RAW), 8080',
    hintFolder:'Porty: 80, 8080, 8888, 21(FTP), 3000, 8000 — listing folderów, FTP',
    hintRouter:'Porty: 80, 443, 8080, 8443, 10000(Webmin)',
    hintNas:'Synology 5000/5001, QNAP 8080, Proxmox 8006, TrueNAS 80/443',
    hintAll:'Wszystkie znane porty jednocześnie — wolniejszy, najdokładniejszy',
    labelChecked:'Sprawdzono:', labelFound:'Znaleziono:', labelPorts:'Portów:',
    colIp:'Adres IP', colPing:'Ping', colHostname:'Hostname', colPorts:'Porty', colLinks:'Ścieżki / Linki',
    emptyRow:'Brak wyników. Skonfiguruj zakres IP i kliknij Start.',
    emptyScanning:'Skanowanie…', emptyNone:'Nie znaleziono aktywnych hostów.',
    detailGeo:'🌍 Geolokalizacja / ISP', detailDevice:'🖥 Identyfikacja urządzenia',
    detailTitle:'📄 Tytuł strony HTTP', detailAccess:'🔑 Dostęp',
    geoLocal:'Adres lokalny — geolokalizacja niedostępna',
    geoError:'Błąd pobierania danych',
    geoCountry:'Kraj:', geoIsp:'ISP:', geoAs:'AS:',
    deviceFavicon:'Favicon:', deviceFaviconYes:'✔ Tak (panel webowy)', deviceFaviconNo:'✘ Brak',
    deviceType:'Typ:', deviceSuggestion:'Sugestia:', deviceUnknown:'Nieznany typ urządzenia',
    titleExtOnly:'Tytuł: tylko dla zewnętrznych IP', titleUnavailable:'Tytuł: niedostępny',
    titleLabel:'Tytuł strony:', accessLabel:'Snapshot:',
    accessOpen:'🔓 Dostępny bez hasła',
    accessClosed:'Wymaga autoryzacji lub brak',
    loading:'Pobieranie…', analyzing:'Analiza…', checking:'Sprawdzanie…',
    localSubnetsFound:(n)=>`Wykryto podsieci: ${n}`, localSubnetsNone:'Nie wykryto lokalnej podsieci',
    localDetectUnsupported:'Wykrywanie lokalnej sieci nie jest wspierane w tej przeglądarce/kontekście',
    localIpDetectError:'Nie udało się wykryć lokalnego IP (WebRTC zablokowane lub niedostępne)',
    previewOpen:'↗ Otwórz', previewClose:'✕',
    statusReady:'Gotowy.', statusCleared:'Wyczyszczono.',
    errInvalidIp:'Podaj poprawne adresy IPv4.',
    errIpRange:'Adres OD musi być ≤ DO.',
    errNoPorts:'Wybierz co najmniej jeden port w presecie.',
    statusScanning:(n,p)=>`Skanuję ${n} adresów × ${p} portów…`,
    statusLarge:(n,p,t)=>`Duży zakres: ${n} adresów × ${p} portów. Est. ${t}…`,
    statusStopped:(n)=>`Zatrzymano po ${n} adresach.`,
    statusDone:(h,p)=>`Zakończono. Znaleziono ${h} hostów (${p} portów).`,
    statusNone:'Skan zakończony — brak aktywnych hostów.',
    statusHosts:(n)=>`${n} hostów`,
    ctxCopyIp:'Kopiuj adres IP', ctxCopyPorts:'Kopiuj porty', ctxHostname:'Hostname (reverse DNS)', ctxScanAllPorts:'Skanuj to IP (wszystkie porty)',
    ctxOpenBrowser:'Otwórz w przeglądarce', ctxPreview:'Podgląd tutaj',
    labelPreset:'Preset:', labelPorts2:'Porty:',
    presetAdd:'+ Dodaj', presetDel:'✕ Usuń',
    presetEdit:'Edytuj preset', presetName:'Nazwa:',
    presetPorts:'Porty:', presetSave:'💾 Zapisz',
    presetHint:'Wpisz numery portów po przecinku, np.: 80, 443, 8080, 554',
    dlgTitle:'Opcje', dlgLang:'Język:',
    dlgDefaults:'Domyślne wartości skanowania:', dlgDefaultThreads:'Wątki:', dlgDefaultDelay:'Opóźnienie (ms):',
    dlgLangEn:'English', dlgLangPl:'Polski',
    menuClippy:'📎 Asystent',
    dlgOk:'OK', dlgCancel:'Anuluj', dlgClose:'Zamknij', dlgVersionsTitle:'Wersje',
    portRtsp:'RTSP stream prawdopodobnie dostępny',
    portIpp:'Drukarka (IPP)', portRaw:'Drukarka (RAW)',
    portSyn:'Synology NAS?', portProx:'Proxmox VE?',
    tagVpn:'VPN/Proxy', tagDc:'Datacenter', tagRecognized:'ROZPOZNANY',
    notepadDesktop:'Notatnik',
    notepadWinTitle:'Notatnik – O autorze',
    previewBlocked:'Urządzenie blokuje osadzanie (X-Frame-Options).',
    previewBlockedLink:'Otwórz w nowej karcie →',
    btnImportTrace:'Importuj Trace', btnClearGraph:'Wyczyść graf', graphCleared:'Trasy zostały wyczyszczone.', btnClearTopoFilters:'Wyczyść filtry', topoFiltersLabel:'Filtry:', mapLiveLabel:'Wizualizacja na żywo',
    filterAllPorts:'Wszystkie porty', filterPortLabel:'port', filterSubnetLabel:'podsieć', filterPingLabel:'ping', filterPingPlaceholder:'Maks ms',
    topologyStatus:(n)=>`Widok topologii · ${n} widocznych hostów`,
    topologyFilteredStatus:(n)=>`Widok topologii · ${n} hostów po filtrach`,
    traceRoutesLabel:'tras trace',
    traceDlgTitle:'Import traceroute', traceTargetLabel:'Docelowe IP:', traceHint:'Wklej wynik z tracert albo traceroute.', traceDlgHint:'Zaimportuj prawdziwą trasę hop-by-hop dla wybranego hosta.',
    traceErrTarget:'Podaj poprawny docelowy adres IPv4.', traceErrTargetOrHost:'Podaj poprawny docelowy adres IP lub hostname.', traceErrParse:'Nie udało się odczytać hopów z wklejonego wyniku.',
    traceImported:(n, ip)=>`Zaimportowano ${n} hopów dla ${ip}.`, traceImportedStatus:(ip, n)=>`Zaimportowano trasę dla ${ip} (${n} hopów).`, traceHopCopied:(ip)=>`Skopiowano IP hopa: ${ip}`,
    btnTraceAuto:'Auto Trace', traceAutoRunning:'Uruchamiam traceroute...', traceAutoDesktopOnly:'Auto trace działa tylko w wersji desktopowej Tauri.',
    traceAutoFailed:(msg)=>`Traceroute nie powiodło się: ${msg}`,
    btnTraceSave:'Importuj',
  }
};

function t(key, ...args) {
  const s = STRINGS[lang];
  const v = s[key] ?? STRINGS['en'][key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}

function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const v = t(key);
    if (typeof v === 'string') el.textContent = v;
  });
  const subnetInput = document.getElementById('topoSubnetFilter');
  const pingInput = document.getElementById('topoPingMax');
  if (subnetInput) subnetInput.placeholder = t('filterSubnetLabel');
  if (pingInput) pingInput.placeholder = t('filterPingPlaceholder');
  if (typeof refreshTopologyFilterOptions === 'function') refreshTopologyFilterOptions();
  // Notify clippy about lang change
  if (typeof window.clippySetLang === 'function') window.clippySetLang(lang);
  // Persist
  localStorage.setItem('netrecon_lang', lang);
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function loadScanDefaults() {
  try {
    const raw = localStorage.getItem('netrecon_scan_defaults');
    if (!raw) return { threads: 20, delayMs: 0 };
    const obj = JSON.parse(raw);
    return {
      threads: clampInt(obj.threads, 2, 64, 20),
      delayMs: clampInt(obj.delayMs, 0, 5000, 0)
    };
  } catch {
    return { threads: 20, delayMs: 0 };
  }
}

function saveScanDefaults(threads, delayMs) {
  const safe = {
    threads: clampInt(threads, 2, 64, 20),
    delayMs: clampInt(delayMs, 0, 5000, 0)
  };
  localStorage.setItem('netrecon_scan_defaults', JSON.stringify(safe));
  return safe;
}

function applyScanDefaultsToMainInputs(cfg) {
  const threadsInput = document.getElementById('concNum');
  const delayInput = document.getElementById('delayMs');
  threadsInput.value = String(clampInt(cfg.threads, 2, 64, 20));
  delayInput.value = String(clampInt(cfg.delayMs, 0, 5000, 0));
}

// ── Language dialog ──
function openLangDlg() {
  document.getElementById('radioEn').checked = (lang === 'en');
  document.getElementById('radioPl').checked = (lang === 'pl');
  document.getElementById('dlgOverlay').classList.add('open');
}
function closeLangDlg() {
  document.getElementById('dlgOverlay').classList.remove('open');
}
document.querySelectorAll('input[name=dlgLang]').forEach(el => {
  el.addEventListener('change', () => {
    lang = document.querySelector('input[name=dlgLang]:checked').value;
    applyLang();
  });
});
document.getElementById('dlgOk').addEventListener('click', () => {
  lang = document.querySelector('input[name=dlgLang]:checked').value;
  applyLang();
  closeLangDlg();
});
document.getElementById('dlgCancel').addEventListener('click', closeLangDlg);

// ── Defaults dialog ──
function openDefaultsDlg() {
  const cfg = loadScanDefaults();
  document.getElementById('dlgDefaultThreads').value = String(cfg.threads);
  document.getElementById('dlgDefaultDelay').value = String(cfg.delayMs);
  document.getElementById('dlgDefaultsOverlay').classList.add('open');
}
function closeDefaultsDlg() {
  document.getElementById('dlgDefaultsOverlay').classList.remove('open');
}

// ── Versions dialog ──
function openVersionsDlg() {
  document.getElementById('dlgVersionsOverlay').classList.add('open');
}
function closeVersionsDlg() {
  document.getElementById('dlgVersionsOverlay').classList.remove('open');
}
function persistDefaultsFromDialog() {
  const cfg = saveScanDefaults(
    document.getElementById('dlgDefaultThreads').value,
    document.getElementById('dlgDefaultDelay').value
  );
  applyScanDefaultsToMainInputs(cfg);
}
document.getElementById('dlgDefaultThreads').addEventListener('input', persistDefaultsFromDialog);
document.getElementById('dlgDefaultDelay').addEventListener('input', persistDefaultsFromDialog);
document.getElementById('dlgDefaultsOk').addEventListener('click', () => {
  persistDefaultsFromDialog();
  closeDefaultsDlg();
});
document.getElementById('dlgDefaultsCancel').addEventListener('click', closeDefaultsDlg);

// ── Menu bar ──
document.querySelectorAll('.menu-item').forEach(item => {
  item.addEventListener('click', e => {
    e.stopPropagation();
    const wasOpen = item.classList.contains('open');
    document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
  });
});
document.addEventListener('click', () => {
  document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'));
});
document.getElementById('menuLang').addEventListener('click', () => {
  document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'));
  openLangDlg();
});
document.getElementById('menuDefaults').addEventListener('click', () => {
  document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'));
  openDefaultsDlg();
});
document.getElementById('menuVersions').addEventListener('click', () => {
  document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'));
  openVersionsDlg();
});
document.getElementById('menuAbout').addEventListener('click', () => {
  document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'));
  openNotepad();
});
document.getElementById('menuClippy').addEventListener('click', () => {
  document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'));
  if (typeof window.clippyToggle === 'function') window.clippyToggle();
});
document.getElementById('dlgVersionsCloseBtn').addEventListener('click', closeVersionsDlg);

// ══════════════════════════════════════════════════
//  CUSTOMIZATION
// ══════════════════════════════════════════════════
const TOOLBAR_BTNS_CFG = [
  { chk: 'chkBtnGlobe',   id: 'btnGlobe',        key: 'tb_globe' },
  { chk: 'chkBtnConsole', id: 'btnCmdConsole',   key: 'tb_console' },
  { chk: 'chkBtnMacro',   id: 'btnMacroToolbar', key: 'tb_macro' },
  { chk: 'chkBtnSpeed',      id: 'btnSpeedToolbar',    key: 'tb_speed' },
  { chk: 'chkBtnProto',      id: 'btnProtoToolbar',    key: 'tb_proto' },
  { chk: 'chkBtnTopology',   id: 'btnTopologyToolbar', key: 'tb_topology' },
];
const UI_SKIN_KEY = 'ui_skin';
const UI_SKINS = ['classic', 'glass', 'workbench'];

function getSavedSkin() {
  const savedSkin = localStorage.getItem(UI_SKIN_KEY);
  return UI_SKINS.includes(savedSkin) ? savedSkin : 'classic';
}

function setBodySkinClass(skin) {
  document.body.classList.remove('skin-classic', 'skin-glass', 'skin-workbench');
  document.body.classList.add(`skin-${skin}`);
}

function applySkinCustomization() {
  setBodySkinClass(getSavedSkin());
}

function applyToolbarCustomization() {
  TOOLBAR_BTNS_CFG.forEach(({ id, key }) => {
    const hidden = localStorage.getItem(key) === '0';
    const btn = document.getElementById(id);
    if (btn) btn.style.display = hidden ? 'none' : '';
  });
}

function openCustomizeDlg() {
  TOOLBAR_BTNS_CFG.forEach(({ chk, key }) => {
    const el = document.getElementById(chk);
    if (el) el.checked = localStorage.getItem(key) !== '0';
  });

  const activeSkin = getSavedSkin();
  const skinClassic = document.getElementById('skinClassic');
  const skinGlass = document.getElementById('skinGlass');
  const skinWorkbench = document.getElementById('skinWorkbench');
  if (skinClassic) skinClassic.checked = activeSkin === 'classic';
  if (skinGlass) skinGlass.checked = activeSkin === 'glass';
  if (skinWorkbench) skinWorkbench.checked = activeSkin === 'workbench';

  document.getElementById('dlgCustomizeOverlay').classList.add('open');
}
function closeCustomizeDlg() {
  TOOLBAR_BTNS_CFG.forEach(({ chk, key }) => {
    const el = document.getElementById(chk);
    if (el) localStorage.setItem(key, el.checked ? '1' : '0');
  });

  const selectedSkin = document.querySelector('input[name="uiSkin"]:checked')?.value;
  localStorage.setItem(UI_SKIN_KEY, UI_SKINS.includes(selectedSkin) ? selectedSkin : 'classic');

  applyToolbarCustomization();
  applySkinCustomization();
  document.getElementById('dlgCustomizeOverlay').classList.remove('open');
}

document.getElementById('menuCustomize').addEventListener('click', () => {
  document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'));
  openCustomizeDlg();
});

document.querySelectorAll('input[name="uiSkin"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const skin = document.querySelector('input[name="uiSkin"]:checked')?.value;
    setBodySkinClass(UI_SKINS.includes(skin) ? skin : 'classic');
  });
});

document.getElementById('btnMacroToolbar').addEventListener('click', openMacroFolder);
document.getElementById('btnSpeedToolbar').addEventListener('click', openSpeedWindow);
document.getElementById('btnProtoToolbar').addEventListener('click', openProtoWindow);

applyToolbarCustomization();
applySkinCustomization();

// ══════════════════════════════════════════════════
//  PORT PRESETS
// ══════════════════════════════════════════════════
const DEFAULT_PRESETS = [
  { name: '📹 Cameras',         ports: '80, 8080, 8081, 443, 554, 9000, 37777, 34567' },
  { name: '🖨️ Printers',        ports: '80, 443, 631, 9100, 8080' },
  { name: '📁 Folders / HTTP',  ports: '80, 8080, 8888, 21, 3000, 8000, 5000' },
  { name: '🌐 Routers',         ports: '80, 443, 8080, 8443, 10000' },
  { name: '💾 NAS / Servers',   ports: '80, 443, 5000, 5001, 8080, 8006, 9090' },
  { name: '🔍 All ports',       ports: '80, 443, 8080, 8443, 8081, 554, 9000, 37777, 34567, 631, 9100, 5000, 5001, 8006, 21, 3000, 8000, 8888, 9090, 10000' },
];

function loadPresets() {
  try {
    const saved = localStorage.getItem('netrecon_presets');
    return saved ? JSON.parse(saved) : DEFAULT_PRESETS.map(p => ({...p}));
  } catch { return DEFAULT_PRESETS.map(p => ({...p})); }
}
function savePresetsStorage(arr) {
  localStorage.setItem('netrecon_presets', JSON.stringify(arr));
}

let presets = loadPresets();
let activePresetIdx = +( localStorage.getItem('netrecon_active_preset') || 0 );
if (activePresetIdx >= presets.length) activePresetIdx = 0;
let portsOverride = null;

function getActivePorts() {
  if (portsOverride !== null) return portsOverride;
  const preset = presets[activePresetIdx];
  if (!preset) return [];
  return preset.ports.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0 && n <= 65535);
}

function findAllPortsPresetIndex() {
  if (!presets.length) return -1;
  let bestIdx = 0;
  let bestCount = -1;
  presets.forEach((p, i) => {
    const ports = (p?.ports || '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0 && n <= 65535);
    const name = (p?.name || '').toLowerCase();
    const scoreBonus = (name.includes('all') || name.includes('wszyst')) ? 1000 : 0;
    const score = ports.length + scoreBonus;
    if (score > bestCount) {
      bestCount = score;
      bestIdx = i;
    }
  });
  return bestIdx;
}

function activatePresetByIndex(idx) {
  if (idx < 0 || idx >= presets.length) return;
  activePresetIdx = idx;
  localStorage.setItem('netrecon_active_preset', activePresetIdx);
  const sel = document.getElementById('presetSelect');
  if (sel) sel.value = String(activePresetIdx);
  updatePortsDisplay();
}

function buildPresetSelect() {
  const sel = document.getElementById('presetSelect');
  sel.innerHTML = '';
  presets.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = p.name;
    if (i === activePresetIdx) opt.selected = true;
    sel.appendChild(opt);
  });
  updatePortsDisplay();
}

function updatePortsDisplay() {
  const ports = getActivePorts();
  document.getElementById('activePorts').textContent = ports.join(', ');
  document.getElementById('portHint').textContent = presets[activePresetIdx]?.ports || '';
}

document.getElementById('presetSelect').addEventListener('change', function() {
  activePresetIdx = +this.value;
  localStorage.setItem('netrecon_active_preset', activePresetIdx);
  updatePortsDisplay();
});

buildPresetSelect();

// ── Presets Dialog ──
let dlgSelectedPreset = -1;

function openPresetsDlg() {
  dlgSelectedPreset = activePresetIdx;
  renderPresetListBox();
  document.getElementById('dlgPresetsOverlay').classList.add('open');
}
function closePresetsDlg() {
  document.getElementById('dlgPresetsOverlay').classList.remove('open');
}

function renderPresetListBox() {
  const box = document.getElementById('presetListBox');
  box.innerHTML = '';
  presets.forEach((p, i) => {
    const row = document.createElement('div');
    row.style.cssText = `padding:3px 8px;font-size:11px;cursor:default;
      background:${i===dlgSelectedPreset?'#000080':'#fff'};
      color:${i===dlgSelectedPreset?'#fff':'#000'};`;
    row.textContent = p.name;
    row.addEventListener('click', () => {
      dlgSelectedPreset = i;
      renderPresetListBox();
      loadPresetIntoEditor(i);
    });
    box.appendChild(row);
  });
  const editBox = document.getElementById('presetEditBox');
  editBox.style.opacity    = dlgSelectedPreset >= 0 ? '1' : '0.4';
  editBox.style.pointerEvents = dlgSelectedPreset >= 0 ? '' : 'none';
}

function loadPresetIntoEditor(i) {
  const p = presets[i];
  document.getElementById('presetNameInput').value  = p.name;
  document.getElementById('presetPortsInput').value = p.ports;
  document.getElementById('presetEditBox').style.opacity = '1';
  document.getElementById('presetEditBox').style.pointerEvents = '';
}

document.getElementById('btnPresetAdd').addEventListener('click', () => {
  presets.push({ name: 'New Preset', ports: '80, 443, 8080' });
  dlgSelectedPreset = presets.length - 1;
  renderPresetListBox();
  loadPresetIntoEditor(dlgSelectedPreset);
  document.getElementById('presetNameInput').focus();
  document.getElementById('presetNameInput').select();
});

document.getElementById('btnPresetDel').addEventListener('click', () => {
  if (dlgSelectedPreset < 0 || presets.length <= 1) return;
  presets.splice(dlgSelectedPreset, 1);
  dlgSelectedPreset = Math.min(dlgSelectedPreset, presets.length - 1);
  renderPresetListBox();
  if (dlgSelectedPreset >= 0) loadPresetIntoEditor(dlgSelectedPreset);
});

document.getElementById('btnPresetUp').addEventListener('click', () => {
  if (dlgSelectedPreset <= 0) return;
  [presets[dlgSelectedPreset-1], presets[dlgSelectedPreset]] =
  [presets[dlgSelectedPreset], presets[dlgSelectedPreset-1]];
  dlgSelectedPreset--;
  renderPresetListBox();
  loadPresetIntoEditor(dlgSelectedPreset);
});

document.getElementById('btnPresetDown').addEventListener('click', () => {
  if (dlgSelectedPreset < 0 || dlgSelectedPreset >= presets.length - 1) return;
  [presets[dlgSelectedPreset+1], presets[dlgSelectedPreset]] =
  [presets[dlgSelectedPreset], presets[dlgSelectedPreset+1]];
  dlgSelectedPreset++;
  renderPresetListBox();
  loadPresetIntoEditor(dlgSelectedPreset);
});

document.getElementById('btnPresetSave').addEventListener('click', () => {
  if (dlgSelectedPreset < 0) return;
  const name  = document.getElementById('presetNameInput').value.trim();
  const ports = document.getElementById('presetPortsInput').value.trim();
  if (!name) return;
  presets[dlgSelectedPreset] = { name, ports };
  renderPresetListBox();
});

document.getElementById('dlgPresetsOk').addEventListener('click', () => {
  // Auto-save any unsaved edits
  if (dlgSelectedPreset >= 0) {
    const name  = document.getElementById('presetNameInput').value.trim();
    const ports = document.getElementById('presetPortsInput').value.trim();
    if (name) presets[dlgSelectedPreset] = { name, ports };
  }
  savePresetsStorage(presets);
  if (activePresetIdx >= presets.length) activePresetIdx = 0;
  buildPresetSelect();
  closePresetsDlg();
});

document.getElementById('menuPresets').addEventListener('click', () => {
  document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'));
  openPresetsDlg();
});

// ══════════════════════════════════════════════════
//  IP INPUT — auto-jump between octets
// ══════════════════════════════════════════════════
['f0','f1','f2','f3','t0','t1','t2','t3'].forEach((id, idx) => {
  const el = document.getElementById(id);
  el.addEventListener('input', () => {
    el.value = el.value.replace(/[^0-9]/g,'');
    if (+el.value > 255) el.value = '255';
    if (el.value.length === 3) {
      const ids = ['f0','f1','f2','f3','t0','t1','t2','t3'];
      const next = document.getElementById(ids[idx+1]);
      if (next) next.focus();
    }
  });
  el.addEventListener('keydown', e => {
    if (e.key === '.' || e.key === 'Tab') {
      e.preventDefault();
      const ids = ['f0','f1','f2','f3','t0','t1','t2','t3'];
      const next = document.getElementById(ids[idx+1]);
      if (next) next.focus();
    }
    if (e.key === 'Backspace' && el.value === '') {
      const ids = ['f0','f1','f2','f3','t0','t1','t2','t3'];
      const prev = document.getElementById(ids[idx-1]);
      if (prev) prev.focus();
    }
  });
});

function getIP(prefix) {
  return [0,1,2,3].map(i => document.getElementById(prefix+i).value || '0').join('.');
}
function setIP(prefix, ip) {
  const parts = ip.split('.');
  [0,1,2,3].forEach(i => { document.getElementById(prefix+i).value = parts[i]||''; });
}


// ══════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════
let scanning=false, stopRequested=false;
const activeControllers = new Set();
var foundHostsMap={}, foundPingMap={}, totalFound=0, totalOpenPorts=0;
let timerInterval=null, scanStart=0;
let selectedRowEl=null, ctxTargetIp='', ctxTargetPorts=[];
let focusedIp = localStorage.getItem('netrecon_focus_ip') || '';

// ══════════════════════════════════════════════════
//  DOM
// ══════════════════════════════════════════════════
const btnGo       = document.getElementById('btnGo');
const btnStop     = document.getElementById('btnStop');
const btnClear    = document.getElementById('btnClear');
const progFill    = document.getElementById('progFill');
const progPct     = document.getElementById('progPct');
const statChecked = document.getElementById('statChecked');
const statFound   = document.getElementById('statFound');
const statPorts   = document.getElementById('statPorts');
const statTime    = document.getElementById('statTime');
const statusMsg   = document.getElementById('statusMsg');
const statusCount = document.getElementById('statusCount');
const listBody    = document.getElementById('listBody');
const emptyRow    = document.getElementById('emptyRow');
const previewWrap = document.getElementById('previewWrap');
const previewFrame= document.getElementById('previewFrame');
const previewBlocked=document.getElementById('previewBlocked');
const previewUrl  = document.getElementById('previewUrl');
const btnPreviewOpen = document.getElementById('btnPreviewOpen');
const btnPreviewClose= document.getElementById('btnPreviewClose');
const previewExtLink = document.getElementById('previewExtLink');
const ctxMenu     = document.getElementById('ctxMenu');

// ══════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════
function isIPv4(v) {
  if (!v.match(/^(\d{1,3}\.){3}\d{1,3}$/)) return false;
  return v.split('.').every(p => { const n=+p; return n>=0&&n<=255; });
}
function ipToNum(ip) { return ip.split('.').reduce((a,p)=>((a<<8)+ +p)>>>0,0); }
function numToIp(n)  { return [24,16,8,0].map(s=>(n>>>s)&255).join('.'); }

function setStatus(text, type='') {
  statusMsg.textContent = text;
  statusMsg.className = 'status-panel'+(type?' '+type:'');
}
function updateProgress(checked, total, fh, op) {
  const pct = total ? Math.round(checked/total*100) : 0;
  progFill.style.width = pct+'%';
  progPct.textContent = pct+'%';
  statChecked.textContent = checked;
  statFound.textContent   = fh;
  statPorts.textContent   = op;
  statusCount.textContent = t('statusHosts', fh);
}
function setScanState(on) {
  scanning=on; btnGo.disabled=on; btnStop.disabled=!on;
  if (on) {
    btnGo.classList.add('pressed');
    scanStart=Date.now();
    timerInterval=setInterval(()=>{
      statTime.textContent = ((Date.now()-scanStart)/1000).toFixed(1)+'s';
    },200);
  } else {
    btnGo.classList.remove('pressed');
    clearInterval(timerInterval);
  }
}

// ══════════════════════════════════════════════════
//  PROBE
// ══════════════════════════════════════════════════

// Tauri invoke helper — falls back to null when running in a plain browser
const _tauriInvoke = (window.__TAURI_INTERNALS__?.invoke)
  ?? (window.__TAURI__?.invoke)
  ?? (window.__TAURI__?.core?.invoke)
  ?? null;

const _tauriListen = window.__TAURI__?.event?.listen ?? null;
const _toolMode = (new URLSearchParams((window.location.hash || '').replace(/^#/, ''))).get('tool');
// Declared in globe.js first (loads earlier); guard against duplicate const.
if (typeof _isTauriDesktop === 'undefined') {
  var _isTauriDesktop = !!(window.__TAURI__ || window.__TAURI_INTERNALS__ || navigator.userAgent.toLowerCase().includes('tauri'));
}

function openToolNativeWindow(tool) {
  if (!_tauriInvoke || _toolMode) return false;
  _tauriInvoke('open_tool_window', { tool }).catch(() => {});
  return true;
}

function makeToolChromeCloseOnly(target) {
  const bar = target.querySelector('.titlebar');
  if (!bar) return;

  bar.style.display = 'flex';
  bar.style.cursor = 'move';

  let btns = bar.querySelector('.titlebar-btns');
  if (!btns) {
    btns = document.createElement('div');
    btns.className = 'titlebar-btns';
    bar.appendChild(btns);
  }

  const allBtns = Array.from(bar.querySelectorAll('.title-btn, button'));
  let closeBtn = allBtns.find(btn => {
    const id = (btn.id || '').toLowerCase();
    const txt = (btn.textContent || '').trim();
    return id.includes('close') || txt.includes('✕') || txt.toLowerCase() === 'x';
  });

  allBtns.forEach(btn => {
    if (btn !== closeBtn) btn.style.display = 'none';
  });

  if (!closeBtn) {
    closeBtn = document.createElement('button');
    closeBtn.className = 'title-btn';
    closeBtn.textContent = '✕';
    closeBtn.style.fontWeight = '900';
    btns.appendChild(closeBtn);
  }

  closeBtn.style.display = '';
  closeBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeCurrentWindowImmediate();
  };

  if (!bar.dataset.toolDragBound) {
    bar.dataset.toolDragBound = '1';
    bar.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' && e.button !== 0) return;
      if (e.target.closest('.title-btn, button')) return;
      e.preventDefault();
      startMainWindowDrag();
    });
  }
}

function hideToolMenus(target) {
  target.querySelectorAll('.menubar').forEach(el => {
    el.style.display = 'none';
  });

  const cmdMacroMenu = target.querySelector('#cmdMenuMacro');
  if (cmdMacroMenu?.parentElement) {
    cmdMacroMenu.parentElement.style.display = 'none';
  }
}

function applyToolWindowMode() {
  if (!_toolMode) return;
  document.body.classList.add('tool-window-mode');

  const toolToWindow = {
    console: 'cmdWin',
    macro: 'macroFolderWin',
    speed: 'speedWin',
    proto: 'protoWin',
    globe: 'globeWin',
    topology: 'globeWin',
  };

  const targetId = toolToWindow[_toolMode];
  const target = targetId ? document.getElementById(targetId) : null;
  if (!target) return;

  target.style.display = 'block';
  target.style.position = 'fixed';
  target.style.top = '0';
  target.style.left = '0';
  target.style.width = '100vw';
  target.style.height = '100vh';
  target.style.maxWidth = '100vw';
  target.style.maxHeight = '100vh';
  target.style.transform = 'none';
  target.style.zIndex = '1';

  makeToolChromeCloseOnly(target);
  hideToolMenus(target);

  if (_toolMode === 'macro' && typeof renderMacroFiles === 'function') {
    renderMacroFiles();
  }
  if (_toolMode === 'console') {
    if (typeof openCmdConsole === 'function') openCmdConsole();
  }
  if (_toolMode === 'proto' && typeof initProtoCanvas === 'function') {
    initProtoCanvas();
    if (typeof protoRenderLinks === 'function') protoRenderLinks();
  }
  if ((_toolMode === 'globe' || _toolMode === 'topology') && typeof initGlobe === 'function') {
    if (!globeReady) initGlobe();
    if (_toolMode === 'topology' && typeof setMapMode === 'function') setMapMode('topology');
    if (_toolMode === 'globe' && typeof setMapMode === 'function') setMapMode('globe');
    if (typeof syncMapModeUI === 'function') syncMapModeUI();
    if (typeof drawCurrentMap === 'function') drawCurrentMap();
    if (_toolMode === 'globe' && typeof startRotation === 'function') startRotation();
  }
}

function applyNativeChromeMode() {
  document.body.classList.remove('tauri-native-menu');
}

// Apply as early as possible and re-apply once DOM is fully ready.
applyNativeChromeMode();
window.addEventListener('DOMContentLoaded', () => {
  applyNativeChromeMode();
  applyToolWindowMode();
});

function handleNativeMenuAction(actionId) {
  switch (actionId) {
    case 'scan_start':
      document.getElementById('btnGo')?.click();
      break;
    case 'scan_stop':
      document.getElementById('btnStop')?.click();
      break;
    case 'scan_clear':
      document.getElementById('btnClear')?.click();
      break;
    case 'app_exit':
      closeMainWindow();
      break;
    case 'open_countries':
      document.getElementById('menuCountries')?.click();
      break;
    case 'open_presets':
      document.getElementById('menuPresets')?.click();
      break;
    case 'open_defaults':
      document.getElementById('menuDefaults')?.click();
      break;
    case 'open_lang':
      document.getElementById('menuLang')?.click();
      break;
    case 'open_customize':
      document.getElementById('menuCustomize')?.click();
      break;
    case 'open_globe':
      document.getElementById('btnGlobe')?.click();
      break;
    case 'open_console':
      document.getElementById('btnCmdConsole')?.click();
      break;
    case 'open_macro':
      document.getElementById('btnMacroToolbar')?.click();
      break;
    case 'open_speed':
      document.getElementById('btnSpeedToolbar')?.click();
      break;
    case 'open_proto':
      document.getElementById('btnProtoToolbar')?.click();
      break;
    case 'open_topology':
      document.getElementById('btnTopologyToolbar')?.click();
      break;
    case 'help_versions':
      document.getElementById('menuVersions')?.click();
      break;
    case 'help_about':
      document.getElementById('menuAbout')?.click();
      break;
  }
}

if (_tauriListen) {
  _tauriListen('native-menu', event => {
    if (typeof event?.payload === 'string') {
      handleNativeMenuAction(event.payload);
    }
  }).catch(() => {});
}

async function probePort(ip, port, ms=1500) {
  if (_tauriInvoke) {
    // Native Rust TCP probe — no CORS restrictions
    try {
      const r = await _tauriInvoke('scan_port', { ip, port, timeoutMs: ms });
      return { ok: r.open, ms: r.ms ?? null };
    } catch (e) {
      if (!window.__scanInvokeWarned) {
        window.__scanInvokeWarned = true;
        const msg = (e && e.message) ? e.message : String(e);
        setStatus(`Tauri invoke error: ${msg}`, 'err');
      }
      return { ok: false, ms: null };
    }
  }
  // Browser fallback (used when opening index.html directly)
  const ctrl = new AbortController();
  activeControllers.add(ctrl);
  const tid = setTimeout(()=>ctrl.abort(), ms);
  const t0 = Date.now();
  try {
    const proto = (port===443||port===8443)?'https':'http';
    await fetch(`${proto}://${ip}:${port}/`,{mode:'no-cors',cache:'no-store',signal:ctrl.signal});
    return { ok: true, ms: Date.now() - t0 };
  } catch { return { ok: false, ms: null }; }
  finally { clearTimeout(tid); activeControllers.delete(ctrl); }
}

function tryImageLoad(url, ms=2000) {
  return new Promise(res => {
    const img=new Image();
    const tid=setTimeout(()=>{img.src='';res(false);},ms);
    img.onload =()=>{clearTimeout(tid);res(true); };
    img.onerror=()=>{clearTimeout(tid);res(false);};
    img.src=url;
  });
}

function isPrivateIP(ip) {
  const p = ip.split('.').map(Number);
  return p[0]===10 ||
    (p[0]===172 && p[1]>=16 && p[1]<=31) ||
    (p[0]===192 && p[1]===168) ||
    p[0]===127;
}

// ── Geolocation via ip-api.com ──
async function geoLookup(ip) {
  try {
    let d;
    if (_tauriInvoke) {
      // Rust handles the HTTP request — no CORS/mixed-content issues
      d = await _tauriInvoke('geo_lookup', { ip });
    } else {
      const r = await fetch(
        `http://ip-api.com/json/${ip}?fields=status,country,city,isp,org,proxy,hosting,as,lat,lon`,
        { signal: AbortSignal.timeout(4000) }
      );
      d = await r.json();
    }
    if (d && d.status === 'success') {
      if (d.lat && d.lon) {
        ipGeoCoords[ip] = { lat: d.lat, lon: d.lon, country: d.country };
        updateGlobeDots();
      }
      return d;
    }
    return null;
  } catch { return null; }
}

// ── Page title via CORS proxy (external IPs only) ──
async function fetchTitle(ip, port) {
  const proto = (port===443||port===8443)?'https':'http';
  const target = encodeURIComponent(`${proto}://${ip}:${port}/`);
  try {
    const r = await fetch(`https://corsproxy.io/?${target}`,
      { signal: AbortSignal.timeout(5000) });
    const html = await r.text();
    const m = html.match(/<title[^>]*>([^<]{1,100})<\/title>/i);
    return m ? m[1].trim().replace(/\s+/g,' ') : null;
  } catch { return null; }
}

// ── Favicon probe ──
function checkFavicon(ip, port) {
  const proto = (port===443||port===8443)?'https':'http';
  return tryImageLoad(`${proto}://${ip}:${port}/favicon.ico`, 2000);
}

// ── Snapshot / open auth ──
async function checkAuth(ip, ports) {
  const snaps = [
    '/snapshot.jpg','/image.jpg','/jpg/image.jpg',
    '/cgi-bin/snapshot.cgi','/webcapture.jpg',
    '/live/0/mjpeg.jpg','/tmpfs/auto.jpg',
    '/ISAPI/Streaming/channels/101/picture',
    '/onvif/snapshot',
  ];
  for (const port of ports) {
    const proto=(port===443||port===8443)?'https':'http';
    for (const path of snaps)
      if (await tryImageLoad(`${proto}://${ip}:${port}${path}`, 1800)) return true;
  }
  return false;
}

// ── Device fingerprint by known image paths ──
const FP_IMAGES = [
  { path: '/ISAPI/Streaming/channels/101/picture', label: 'Hikvision' },
  { path: '/cgi-bin/snapshot.cgi',                 label: 'Dahua / kamera' },
  { path: '/jpg/image.jpg',                         label: 'Kamera IP' },
  { path: '/webcapture.jpg',                        label: 'Kamera IP' },
  { path: '/onvif/snapshot',                        label: 'ONVIF Camera' },
  { path: '/tmpfs/auto.jpg',                        label: 'Kamera IP (wbudowana)' },
  { path: '/axis-cgi/jpg/image.cgi',                label: 'Axis Camera' },
];

async function fingerprintByImage(ip, ports) {
  for (const port of ports.slice(0, 3)) {
    const proto=(port===443||port===8443)?'https':'http';
    for (const fp of FP_IMAGES) {
      if (await tryImageLoad(`${proto}://${ip}:${port}${fp.path}`, 1400))
        return fp.label;
    }
  }
  return null;
}

// ── Full enrichment (runs async after row is added) ──
async function enrichRow(ip, ports, cells) {
  const { cGeo, cDevice, cTitle, cAccess } = cells;

  // Run geo + fingerprint + favicon + title in parallel
  const [ geo, deviceLabel, hasFavicon, isOpen, title ] = await Promise.all([
    geoLookup(ip),
    fingerprintByImage(ip, ports),
    checkFavicon(ip, ports[0]),
    checkAuth(ip, ports),
    isPrivateIP(ip) ? Promise.resolve(null) : fetchTitle(ip, ports[0]),
  ]);

  // Geo
  if (geo) {
    const vpnTag = geo.proxy   ? `<span class="detail-tag tag-vpn">${t('tagVpn')}</span>` : '';
    const dcTag  = geo.hosting ? `<span class="detail-tag tag-dc">${t('tagDc')}</span>`   : '';
    cGeo.innerHTML =
      `<div class="detail-line"><b>${t('geoCountry')}</b> ${geo.country||'?'} — ${geo.city||'?'}${vpnTag}${dcTag}</div>`+
      `<div class="detail-line"><b>${t('geoIsp')}</b> ${geo.isp||'?'}</div>`+
      `<div class="detail-line"><b>${t('geoAs')}</b> ${geo.as||'?'}</div>`;
  } else {
    cGeo.innerHTML = isPrivateIP(ip)
      ? `<div class="detail-line" style="color:#808080">${t('geoLocal')}</div>`
      : `<div class="detail-line" style="color:#c00">${t('geoError')}</div>`;
  }

  // Device
  let deviceHtml = '';
  if (deviceLabel) {
    deviceHtml += `<div class="detail-line"><b>${t('deviceType')}</b> ${deviceLabel} <span class="detail-tag tag-device">${t('tagRecognized')}</span></div>`;
  }
  deviceHtml += `<div class="detail-line"><b>${t('deviceFavicon')}</b> ${hasFavicon ? t('deviceFaviconYes') : t('deviceFaviconNo')}</div>`;
  const portGuess = ports.includes(554)  ? t('portRtsp') :
                    ports.includes(631)  ? t('portIpp')  :
                    ports.includes(9100) ? t('portRaw')  :
                    ports.includes(5000)||ports.includes(5001) ? t('portSyn') :
                    ports.includes(8006) ? t('portProx') : null;
  if (portGuess) deviceHtml += `<div class="detail-line"><b>${t('deviceSuggestion')}</b> ${portGuess}</div>`;
  cDevice.innerHTML = deviceHtml || `<div class="detail-line" style="color:#808080">${t('deviceUnknown')}</div>`;

  // Title
  if (title) {
    cTitle.innerHTML = `<div class="detail-line"><b>${t('titleLabel')}</b> "${title}"</div>`;
  } else if (isPrivateIP(ip)) {
    cTitle.innerHTML = `<div class="detail-line" style="color:#808080">${t('titleExtOnly')}</div>`;
  } else {
    cTitle.innerHTML = `<div class="detail-line" style="color:#808080">${t('titleUnavailable')}</div>`;
  }

  // Access
  cAccess.innerHTML = isOpen
    ? `<div class="detail-line"><b>${t('accessLabel')}</b> <span style="color:green">${t('accessOpen')}</span></div>`
    : `<div class="detail-line"><b>${t('accessLabel')}</b> ${t('accessClosed')}</div>`;
}

// ── Hostname lookup via ip-api (already used for geo, reuse) ──
const hostnameCache = {};
async function lookupHostname(ip) {
  if (hostnameCache[ip] !== undefined) return hostnameCache[ip];
  try {
    const r = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,reverse`,
      { signal: AbortSignal.timeout(4000) }
    );
    const d = await r.json();
    const result = (d.status === 'success' && d.reverse) ? d.reverse : null;
    hostnameCache[ip] = result;
    return result;
  } catch { hostnameCache[ip] = null; return null; }
}

// ══════════════════════════════════════════════════
//  ADD ROW
// ══════════════════════════════════════════════════
function addResultRow(ip, openPorts, pingMs) {
  if (emptyRow.parentNode) emptyRow.remove();

  // Generic paths — work for any device type
  const paths = [
    {p:'/',l:'/'}, {p:'/admin',l:'/admin'}, {p:'/video',l:'/video'},
    {p:'/snapshot.jpg',l:'/snapshot'}, {p:'/files',l:'/files'},
    {p:'/status',l:'/status'}, {p:'/stream',l:'/stream'},
    {p:'/mjpeg',l:'/mjpeg'},
  ];

  const row = document.createElement('div');
  row.className = 'lv-row';
  row.dataset.ip = ip;
  row.style.display = 'grid';

  // Icon
  const cIcon = document.createElement('div');
  cIcon.className='lv-cell lv-icon';
  cIcon.innerHTML='<span class="icon-ok">✔</span>';
  row.appendChild(cIcon);

  // IP
  const cIp = document.createElement('div');
  cIp.className='lv-cell';
  cIp.innerHTML = `${ip} <span id="acc_${ip.replace(/\./g,'_')}" style="font-size:9px"></span>`;
  row.appendChild(cIp);

  // Expand (+)
  const cExpand = document.createElement('div');
  cExpand.className = 'lv-cell lv-expand-cell';
  const expandBtn = document.createElement('span');
  expandBtn.className = 'row-expand-btn';
  expandBtn.textContent = '+';
  expandBtn.title = 'Pokaż udostępnione zasoby';
  cExpand.appendChild(expandBtn);
  row.appendChild(cExpand);

  // Ping
  const cPing = document.createElement('div');
  cPing.className='lv-cell';
  cPing.style.textAlign = 'left';
  if (pingMs !== null && pingMs !== undefined) {
    const color = pingMs < 100 ? 'green' : pingMs < 500 ? '#808000' : '#c00';
    cPing.innerHTML = `<span style="color:${color};font-weight:bold">${pingMs} ms</span>`;
  } else {
    cPing.innerHTML = '<span style="color:#808080">-</span>';
  }
  row.appendChild(cPing);

  // ── Paths sub-row (expandable below the row) ──
  const pathsRow = document.createElement('div');
  pathsRow.className = 'paths-row';
  const pFrag = document.createDocumentFragment();
  openPorts.forEach((port) => {
    const line = document.createElement('div');
    line.className = 'path-port-line';

    const label = document.createElement('span');
    label.className = 'path-port-label';
    label.textContent = `:${port}`;
    line.appendChild(label);

    const proto=(port===443||port===8443)?'https':'http';
    paths.forEach(({p,l}, li) => {
      if (li>0) line.appendChild(document.createTextNode(' '));
      const a=document.createElement('span'); a.className='path-link';
      const url=`${proto}://${ip}:${port}${p}`;
      a.textContent=l; a.title=url;
      a.addEventListener('click', e=>{ e.stopPropagation(); openPreview(url); });
      line.appendChild(a);
    });
    pFrag.appendChild(line);
  });
  pathsRow.appendChild(pFrag);

  expandBtn.addEventListener('click', e => {
    e.stopPropagation();
    const open = pathsRow.classList.toggle('open');
    expandBtn.textContent = open ? '−' : '+';
    expandBtn.style.color = open ? '#c00' : '';
  });

  // ── Left click → select only (no detail, no preview) ──
  row.addEventListener('click', () => {
    const wasSelected = row.classList.contains('selected');
    document.querySelectorAll('.lv-row.selected').forEach(r => r.classList.remove('selected'));
    if (!wasSelected) {
      row.classList.add('selected');
      selectedRowEl = row;
    } else {
      selectedRowEl = null;
    }
  });

  // Right click → context menu
  row.addEventListener('contextmenu', e=>{
    e.preventDefault();
    ctxTargetIp=ip; ctxTargetPorts=openPorts;
    const vw=window.innerWidth, vh=window.innerHeight;
    ctxMenu.style.left=Math.min(e.clientX, vw-175)+'px';
    ctxMenu.style.top=Math.min(e.clientY, vh-220)+'px';
    ctxMenu.classList.add('open');
  });

  listBody.appendChild(row);
  listBody.appendChild(pathsRow);

  // ── Auto geo-locate for globe dots ──
  if (!ipGeoCoords[ip]) {
    geoLookup(ip).then(d => {
      // geoLookup already stores in ipGeoCoords and calls updateGlobeDots
      // Also update the IP cell with 🔓 flag if auth check was done separately
    });
  } else {
    updateGlobeDots();
  }

  saveResults();
}

// ══════════════════════════════════════════════════
//  RESULTS PERSISTENCE
// ══════════════════════════════════════════════════
function saveResults() {
  try {
    const data = Object.entries(foundHostsMap).map(([ip, ports]) => ({
      ip, ports,
      ping: foundPingMap[ip] ?? null,
      hostname: hostnameCache[ip] ?? null,
      geo: ipGeoCoords[ip] ?? null,
    }));
    localStorage.setItem('netrecon_results', JSON.stringify(data));
    localStorage.setItem('netrecon_results_ts', Date.now());
  } catch {}
}

function restoreResults() {
  try {
    const raw = localStorage.getItem('netrecon_results');
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data.length) return;
    const ts = +localStorage.getItem('netrecon_results_ts');
    const age = ts ? Math.round((Date.now() - ts) / 60000) : null;

    data.forEach(({ ip, ports, ping, hostname, geo }) => {
      foundHostsMap[ip] = ports;
      totalFound++;
      totalOpenPorts += ports.length;
      if (ping !== null) foundPingMap[ip] = ping;
      if (hostname !== null) hostnameCache[ip] = hostname;
      if (geo) ipGeoCoords[ip] = geo;
      addResultRow(ip, ports, ping);
    });
    updateProgress(0, 0, totalFound, totalOpenPorts);
    const ageStr = age !== null ? ` (${age} min ago)` : '';
    setStatus(`Restored ${totalFound} results from last scan${ageStr}.`, 'ok');
    statusCount.textContent = t('statusHosts', totalFound);
    if (typeof appendCmdLog === 'function') appendCmdLog(`Restored ${totalFound} host${totalFound===1?'':'s'} from last scan${ageStr}.`, 'scan');
  } catch {}
}

// ── Restore on load ──
restoreResults();

// ══════════════════════════════════════════════════
//  PREVIEW
// ══════════════════════════════════════════════════
function openInBrowser(url) {
  if (window.__TAURI__) {
    window.__TAURI__.core.invoke('open_browser', { url });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

function openPreview(url) {
  previewUrl.textContent = url;
  previewFrame.style.display = 'block';
  previewBlocked.style.display = 'none';
  previewFrame.src = url;
  previewExtLink.href = url;
  btnPreviewOpen.onclick = ()=>openInBrowser(url);
  previewWrap.classList.add('open');
  previewFrame.onload = () => {
    try { void previewFrame.contentDocument; }
    catch { previewFrame.style.display='none'; previewBlocked.style.display='flex'; }
  };
  setTimeout(()=>previewWrap.scrollIntoView({behavior:'smooth',block:'start'}),60);
}
btnPreviewClose.addEventListener('click',()=>{
  previewWrap.classList.remove('open');
  previewFrame.src='about:blank';
  if(selectedRowEl){selectedRowEl.classList.remove('selected');selectedRowEl=null;}
});

// ══════════════════════════════════════════════════
//  ENRICH POPUP (draggable Win95-style info window)
// ══════════════════════════════════════════════════
function showEnrichPopup(popupId, label, asyncFn) {
  // Toggle: clicking the same menu item again closes the popup
  const existing = document.getElementById(popupId);
  if (existing) { existing.remove(); return; }

  const win = document.createElement('div');
  win.id = popupId;
  win.className = 'enrich-popup';
  const offset = document.querySelectorAll('.enrich-popup').length * 24;
  win.style.top  = (90 + offset) + 'px';
  win.style.left = Math.max(10, (window.innerWidth / 2 - 160)) + 'px';

  const bar = document.createElement('div');
  bar.className = 'enrich-popup-bar';
  bar.innerHTML = `<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span>` +
    `<span class="title-btn" style="cursor:pointer;font-size:10px;padding:0 5px;margin-left:4px">✕</span>`;
  bar.querySelector('.title-btn').addEventListener('click', () => win.remove());

  const body = document.createElement('div');
  body.className = 'enrich-popup-body';
  body.innerHTML = '<span style="color:#808080;font-style:italic">Ładowanie…</span>';

  win.append(bar, body);
  document.body.appendChild(win);

  // Draggable titlebar
  let drag = false, ox = 0, oy = 0;
  bar.addEventListener('mousedown', e => {
    if (e.target.classList.contains('title-btn')) return;
    drag = true;
    const r = win.getBoundingClientRect();
    ox = e.clientX - r.left; oy = e.clientY - r.top;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    win.style.left = (e.clientX - ox) + 'px';
    win.style.top  = (e.clientY - oy) + 'px';
  });
  document.addEventListener('mouseup', () => { drag = false; });

  asyncFn()
    .then(html  => { body.innerHTML = html || '<span style="color:#808080">Brak danych</span>'; })
    .catch(() => { body.innerHTML = '<span style="color:#c00">Błąd ładowania danych</span>'; });
}

// ══════════════════════════════════════════════════
//  CONTEXT MENU
// ══════════════════════════════════════════════════
document.getElementById('ctxCopyIp').addEventListener('click',()=>{
  navigator.clipboard?.writeText(ctxTargetIp);
  ctxMenu.classList.remove('open');
});
document.getElementById('ctxCopyPorts').addEventListener('click',()=>{
  navigator.clipboard?.writeText(ctxTargetPorts.join(', '));
  ctxMenu.classList.remove('open');
});
document.getElementById('ctxHostname').addEventListener('click',()=>{
  const ip = ctxTargetIp;
  ctxMenu.classList.remove('open');
  showEnrichPopup(`enrich-host-${ip}`, `🧭 Hostname — ${ip}`, async () => {
    const name = await lookupHostname(ip);
    return name
      ? `<div><b>Hostname:</b> ${name}</div>`
      : `<span style="color:#808080">Brak rekordu reverse DNS</span>`;
  });
});
document.getElementById('ctxOpenBrowser').addEventListener('click',()=>{
  const proto=(ctxTargetPorts[0]===443||ctxTargetPorts[0]===8443)?'https':'http';
  openInBrowser(`${proto}://${ctxTargetIp}:${ctxTargetPorts[0]}/`);
  ctxMenu.classList.remove('open');
});
document.getElementById('ctxPreview').addEventListener('click',()=>{
  const proto=(ctxTargetPorts[0]===443||ctxTargetPorts[0]===8443)?'https':'http';
  openPreview(`${proto}://${ctxTargetIp}:${ctxTargetPorts[0]}/`);
  ctxMenu.classList.remove('open');
});
document.getElementById('ctxScanAllPorts').addEventListener('click',()=>{
  if (!ctxTargetIp || scanning) {
    ctxMenu.classList.remove('open');
    return;
  }
  portsOverride = Array.from({length: 65535}, (_, i) => i + 1);
  setIP('f', ctxTargetIp);
  setIP('t', ctxTargetIp);
  ctxMenu.classList.remove('open');
  startScan()
    .catch(e => { setStatus(`Error: ${e.message}`, 'err'); setScanState(false); })
    .finally(() => { portsOverride = null; });
});
document.addEventListener('click',()=>ctxMenu.classList.remove('open'));
document.addEventListener('keydown',e=>{ if(e.key==='Escape') ctxMenu.classList.remove('open'); });

// ── Detail enrichment handlers (right-click popup windows) ──
document.getElementById('ctxDetailGeo').addEventListener('click', () => {
  const ip = ctxTargetIp;
  ctxMenu.classList.remove('open');
  showEnrichPopup(`enrich-geo-${ip}`, `🌍 Geolokalizacja — ${ip}`, async () => {
    const geo = await geoLookup(ip);
    if (!geo) return isPrivateIP(ip)
      ? `<span style="color:#808080">${t('geoLocal')}</span>`
      : `<span style="color:#c00">${t('geoError')}</span>`;
    const vpn = geo.proxy   ? `<span style="background:#800080;color:#fff;padding:0 3px;font-size:9px;margin-left:3px">VPN/Proxy</span>` : '';
    const dc  = geo.hosting ? `<span style="background:#808080;color:#fff;padding:0 3px;font-size:9px;margin-left:3px">DC</span>` : '';
    return `<div style="line-height:1.9">` +
      `<b>${t('geoCountry')}</b> ${geo.country||'?'} — ${geo.city||'?'}${vpn}${dc}<br>` +
      `<b>${t('geoIsp')}</b> ${geo.isp||'?'}<br>` +
      `<b>${t('geoAs')}</b> ${geo.as||'?'}</div>`;
  });
});

document.getElementById('ctxDetailDevice').addEventListener('click', () => {
  const ip = ctxTargetIp, ports = ctxTargetPorts.slice();
  ctxMenu.classList.remove('open');
  showEnrichPopup(`enrich-dev-${ip}`, `🖥 Urządzenie — ${ip}`, async () => {
    const [deviceLabel, hasFavicon] = await Promise.all([
      fingerprintByImage(ip, ports),
      checkFavicon(ip, ports[0]),
    ]);
    let html = '';
    if (deviceLabel) html += `<div><b>${t('deviceType')}</b> ${deviceLabel} <span style="background:green;color:#fff;padding:0 3px;font-size:9px">${t('tagRecognized')}</span></div>`;
    html += `<div><b>${t('deviceFavicon')}</b> ${hasFavicon ? t('deviceFaviconYes') : t('deviceFaviconNo')}</div>`;
    const portGuess = ports.includes(554)?t('portRtsp'):ports.includes(631)?t('portIpp'):ports.includes(9100)?t('portRaw'):ports.includes(5000)||ports.includes(5001)?t('portSyn'):ports.includes(8006)?t('portProx'):null;
    if (portGuess) html += `<div><b>${t('deviceSuggestion')}</b> ${portGuess}</div>`;
    return html || `<span style="color:#808080">${t('deviceUnknown')}</span>`;
  });
});

document.getElementById('ctxDetailTitle').addEventListener('click', () => {
  const ip = ctxTargetIp, ports = ctxTargetPorts.slice();
  ctxMenu.classList.remove('open');
  showEnrichPopup(`enrich-title-${ip}`, `📄 Tytuł HTTP — ${ip}`, async () => {
    if (isPrivateIP(ip)) return `<span style="color:#808080">${t('titleExtOnly')}</span>`;
    const title = await fetchTitle(ip, ports[0]);
    return title
      ? `<b>${t('titleLabel')}</b> &ldquo;${title}&rdquo;`
      : `<span style="color:#808080">${t('titleUnavailable')}</span>`;
  });
});

document.getElementById('ctxDetailAccess').addEventListener('click', () => {
  const ip = ctxTargetIp, ports = ctxTargetPorts.slice();
  ctxMenu.classList.remove('open');
  showEnrichPopup(`enrich-acc-${ip}`, `🔑 Dostęp — ${ip}`, async () => {
    const isOpen = await checkAuth(ip, ports);
    return isOpen
      ? `<b>${t('accessLabel')}</b> <span style="color:green">${t('accessOpen')}</span>`
      : `<b>${t('accessLabel')}</b> ${t('accessClosed')}`;
  });
});

// ══════════════════════════════════════════════════
//  EXTERNAL IP
// ══════════════════════════════════════════════════
const btnMyIp      = document.getElementById('btnMyIp');
const myIpResult   = document.getElementById('myIpResult');
const btnCopyMyIp  = document.getElementById('btnCopyMyIp');
const btnUseMyIp   = document.getElementById('btnUseMyIp');

btnMyIp.addEventListener('click', async () => {
  myIpResult.style.color = '#808000';
  myIpResult.textContent = t('loading');
  btnCopyMyIp.style.display = 'none';
  btnUseMyIp.style.display  = 'none';
  btnMyIp.disabled = true;
  try {
    const res  = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    myIpResult.style.color = '#000080';
    myIpResult.textContent = data.ip;
    btnCopyMyIp.style.display = 'inline-block';
    btnCopyMyIp.onclick = () => {
      navigator.clipboard?.writeText(data.ip);
      btnCopyMyIp.textContent = '✔ OK';
      setTimeout(() => { btnCopyMyIp.textContent = t('btnCopy'); }, 1500);
    };
    btnUseMyIp.style.display = 'inline-block';
    btnUseMyIp.onclick = () => {
      const parts = data.ip.split('.').map(Number);
      setIP('f', `${parts[0]}.${parts[1]}.${parts[2]}.1`);
      setIP('t', `${parts[0]}.${parts[1]}.${parts[2]}.254`);
    };
  } catch {
    myIpResult.style.color = '#c00';
    myIpResult.textContent = t('geoError');
  } finally {
    btnMyIp.disabled = false;
  }
});

// ══════════════════════════════════════════════════
// Local IP Detection
const btnMyLocalIp      = document.getElementById('btnMyLocalIp');
const myLocalIpResult   = document.getElementById('myLocalIpResult');
const btnCopyMyLocalIp  = document.getElementById('btnCopyMyLocalIp');
const btnUseMyLocalIp   = document.getElementById('btnUseMyLocalIp');
const btnLocalSubnets   = document.getElementById('btnLocalSubnets');
const localSubnetsResult= document.getElementById('localSubnetsResult');
const localSubnetSelect = document.getElementById('localSubnetSelect');
const btnUseLocalSubnet = document.getElementById('btnUseLocalSubnet');

async function detectLocalIP() {
  if (_tauriInvoke) {
    try {
      const ip = await _tauriInvoke('get_local_ip');
      if (ip && isPrivateIpv4(ip)) return ip;
      throw new Error('No local private IPv4 found');
    } catch (err) {
      // Fall through to WebRTC fallback for browser mode / dev diagnostics.
    }
  }
  return new Promise((resolve, reject) => {
    if (!window.RTCPeerConnection) {
      reject(new Error('RTCPeerConnection unavailable'));
      return;
    }
    let pc;
    try {
      pc = new RTCPeerConnection({ iceServers: [] });
    } catch (err) {
      reject(err);
      return;
    }

    const isPrivateIpv4 = (ip) =>
      /^10\./.test(ip) ||
      /^192\.168\./.test(ip) ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip);

    const extractIpv4 = (text) => {
      if (!text) return null;
      const m = text.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
      return m ? m[1] : null;
    };

    let done = false;
    const finish = (ip) => {
      if (done) return;
      done = true;
      clearTimeout(timeoutId);
      try { pc.close(); } catch {}
      resolve(ip);
    };

    const fail = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timeoutId);
      try { pc.close(); } catch {}
      reject(err || new Error('Local IP not found'));
    };

    const checkCandidateText = (text) => {
      const ip = extractIpv4(text);
      if (ip && isPrivateIpv4(ip)) finish(ip);
    };

    pc.onicecandidate = (evt) => {
      if (!evt || !evt.candidate) return;
      checkCandidateText(evt.candidate.candidate);
      if (evt.candidate.address) checkCandidateText(evt.candidate.address);
    };

    pc.onicecandidateerror = () => {
      // Ignore transient ICE errors; timeout/fallback will handle final state.
    };

    const timeoutId = setTimeout(async () => {
      try {
        // Fallback for browsers that hide IP in candidate strings.
        const stats = await pc.getStats();
        for (const report of stats.values()) {
          if (report.type === 'local-candidate' || report.type === 'candidate-pair') {
            const ip = report.address || report.ip || extractIpv4(report.candidateType || '');
            if (ip && isPrivateIpv4(ip)) {
              finish(ip);
              return;
            }
          }
        }
      } catch {}
      fail(new Error('Timeout'));
    }, 5000);

    pc.createDataChannel('local-ip-probe');
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch((err) => fail(err));
  });
}

function isPrivateIpv4(ip) {
  return /^10\./.test(ip) ||
         /^192\.168\./.test(ip) ||
         /^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip);
}

function extractIpv4(text) {
  if (!text) return null;
  const m = text.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
  return m ? m[1] : null;
}

function ipToSubnetBase(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

async function detectLocalSubnets() {
  if (_tauriInvoke) {
    try {
      const subnets = await _tauriInvoke('get_local_subnets');
      if (Array.isArray(subnets)) {
        return [...new Set(subnets.filter(Boolean))]
          .sort((a, b) => ipToNum(a + '.0') - ipToNum(b + '.0'));
      }
    } catch (err) {
      // Fall through to WebRTC fallback for browser mode / dev diagnostics.
    }
  }
  return new Promise((resolve, reject) => {
    if (!window.RTCPeerConnection) {
      reject(new Error('RTCPeerConnection unavailable'));
      return;
    }
    let pc;
    try {
      pc = new RTCPeerConnection({ iceServers: [] });
    } catch (err) {
      reject(err);
      return;
    }

    const ips = new Set();
    let done = false;

    const addIp = (ip) => {
      if (ip && isPrivateIpv4(ip)) ips.add(ip);
    };

    const addFromText = (text) => {
      const ip = extractIpv4(text);
      addIp(ip);
    };

    const finish = async () => {
      if (done) return;
      done = true;
      clearTimeout(timeoutId);
      try {
        const stats = await pc.getStats();
        for (const report of stats.values()) {
          if (report.type === 'local-candidate' || report.type === 'candidate-pair') {
            addIp(report.address || report.ip || null);
          }
        }
      } catch {}
      try { pc.close(); } catch {}

      const subnets = [...new Set([...ips]
        .map(ipToSubnetBase)
        .filter(Boolean))]
        .sort((a, b) => ipToNum(a + '.0') - ipToNum(b + '.0'));

      resolve(subnets);
    };

    pc.onicecandidate = (evt) => {
      if (evt && evt.candidate) {
        addFromText(evt.candidate.candidate);
        addFromText(evt.candidate.address);
      }
    };

    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') {
        finish();
      }
    };

    pc.onicecandidateerror = () => {
      // Ignore ICE transient errors.
    };

    const timeoutId = setTimeout(finish, 4500);
    pc.createDataChannel('local-subnet-probe');
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch(() => finish());
  });
}

btnMyLocalIp.addEventListener('click', async () => {
  myLocalIpResult.style.color = '#808000';
  myLocalIpResult.textContent = t('loading');
  btnCopyMyLocalIp.style.display = 'none';
  btnUseMyLocalIp.style.display  = 'none';
  btnMyLocalIp.disabled = true;
  
  try {
    const localIP = await detectLocalIP();
    myLocalIpResult.style.color = '#000080';
    myLocalIpResult.textContent = localIP;
    
    btnCopyMyLocalIp.style.display = 'inline-block';
    btnCopyMyLocalIp.onclick = () => {
      navigator.clipboard?.writeText(localIP);
      btnCopyMyLocalIp.textContent = '✔ OK';
      setTimeout(() => { btnCopyMyLocalIp.textContent = t('btnCopy'); }, 1500);
    };
    
    btnUseMyLocalIp.style.display = 'inline-block';
    btnUseMyLocalIp.onclick = () => {
      const parts = localIP.split('.').map(Number);
      // Set range to scan local network
      setIP('f', `${parts[0]}.${parts[1]}.${parts[2]}.1`);
      setIP('t', `${parts[0]}.${parts[1]}.${parts[2]}.254`);
    };
  } catch (error) {
    myLocalIpResult.style.color = '#c00';
    myLocalIpResult.textContent = /RTCPeerConnection unavailable/i.test(String(error && error.message || ''))
      ? t('localDetectUnsupported')
      : t('localIpDetectError');
  } finally {
    btnMyLocalIp.disabled = false;
  }
});

btnLocalSubnets.addEventListener('click', async () => {
  localSubnetsResult.style.color = '#808000';
  localSubnetsResult.textContent = t('loading');
  localSubnetSelect.style.display = 'none';
  btnUseLocalSubnet.style.display = 'none';
  btnLocalSubnets.disabled = true;

  try {
    const subnets = await detectLocalSubnets();
    if (!subnets.length) {
      localSubnetsResult.style.color = '#c00';
      localSubnetsResult.textContent = t('localSubnetsNone');
      return;
    }

    localSubnetSelect.innerHTML = '';
    subnets.forEach((base) => {
      const opt = document.createElement('option');
      opt.value = base;
      opt.textContent = `${base}.0/24`;
      localSubnetSelect.appendChild(opt);
    });

    localSubnetsResult.style.color = '#000080';
    localSubnetsResult.textContent = t('localSubnetsFound', subnets.length);
    localSubnetSelect.style.display = 'inline-block';
    btnUseLocalSubnet.style.display = 'inline-block';

    btnUseLocalSubnet.onclick = () => {
      const base = localSubnetSelect.value;
      if (!base) return;
      setIP('f', `${base}.1`);
      setIP('t', `${base}.254`);
      setStatus(`Range set: ${base}.1 - ${base}.254`, 'ok');
    };
  } catch {
    localSubnetsResult.style.color = '#c00';
    localSubnetsResult.textContent = t('localIpDetectError');
  } finally {
    btnLocalSubnets.disabled = false;
  }
});

// ══════════════════════════════════════════════════
async function startScan() {
  window.__scanInvokeWarned = false;
  const startIp=getIP('f'), endIp=getIP('t');
  if (!isIPv4(startIp)||!isIPv4(endIp)) { setStatus(t('errInvalidIp'),'err'); return; }
  const startNum=ipToNum(startIp), endNum=ipToNum(endIp);
  if (startNum>endNum) { setStatus(t('errIpRange'),'err'); return; }

  const selectedPorts = getActivePorts();
  if (!selectedPorts.length) { setStatus(t('errNoPorts'),'err'); return; }

  const total=endNum-startNum+1;
  foundHostsMap={}; foundPingMap={}; totalFound=0; totalOpenPorts=0;
  refreshTopologyFilterOptions();
  stopRequested=false; statTime.textContent='0.0s';
  updateProgress(0,total,0,0); setScanState(true);
  if (typeof appendCmdLog === 'function') appendCmdLog(`Scan start: ${startIp} — ${endIp}  [${selectedPorts.length} port${selectedPorts.length===1?'':'s'}, conc: ${concurrency}]`, 'scan');

  // Clear list
  listBody.innerHTML='';
  listBody.appendChild(emptyRow);
  emptyRow.textContent = t('emptyScanning');

  const concurrency = Math.min(+document.getElementById('concNum').value || 20, 64);
  const delayMs = Math.max(0, Math.min(5000, +document.getElementById('delayMs').value || 0));

  if (total>500) {
    const estSec=Math.round(total*(1500/concurrency)/1000);
    const estStr=estSec>=60?`~${Math.ceil(estSec/60)} min`:`~${estSec}s`;
    setStatus(t('statusLarge', total, selectedPorts.length, estStr),'warn');
  } else {
    setStatus(t('statusScanning', total, selectedPorts.length),'warn');
  }

  // Show/hide port progress bar
  const portProgWrap  = document.getElementById('portProgWrap');
  const portProgFill  = document.getElementById('portProgFill');
  const portProgLabel = document.getElementById('portProgLabel');
  function showPortProgress(current, total, ip) {
    portProgWrap.classList.add('active');
    const pct = total ? Math.round(current / total * 100) : 0;
    portProgFill.style.width = pct + '%';
    portProgLabel.textContent = `Porty: ${current + 1}–${Math.min(current + 100, total)} / ${total}  (${ip})`;
  }
  function hidePortProgress() {
    portProgWrap.classList.remove('active');
    portProgFill.style.width = '0%';
  }

  // Probe all ports for one IP — chunked to avoid freezing browser
  async function probeAllPorts(ip, ports) {
    const CHUNK = 100;
    const results = [];
    for (let i = 0; i < ports.length && !stopRequested; i += CHUNK) {
      showPortProgress(i, ports.length, ip);
      const batch = ports.slice(i, i + CHUNK);
      const batchRes = await Promise.all(
        batch.map(port => probePort(ip, port, 1400).then(r => ({ port, ok: r.ok, ms: r.ms })))
      );
      results.push(...batchRes);
    }
    hidePortProgress();
    return results;
  }

  let nextIdx=0, checked=0;
  const worker = async () => {
    while (!stopRequested) {
      const idx=nextIdx++; if(idx>=total) return;
      const ip=numToIp(startNum+idx);
      const res = selectedPorts.length > 200
        ? await probeAllPorts(ip, selectedPorts)
        : await Promise.all(selectedPorts.map(port=>probePort(ip,port,1400).then(r=>({port, ok:r.ok, ms:r.ms}))));
      const openPorts=res.filter(r=>r.ok).map(r=>r.port);
      const bestMs = res.filter(r=>r.ok).reduce((a,r)=>r.ms<a?r.ms:a, Infinity);
      const pingMs = bestMs === Infinity ? null : bestMs;
      if (openPorts.length) {
        foundHostsMap[ip]=openPorts; totalFound++; totalOpenPorts+=openPorts.length;
        if (pingMs !== null) foundPingMap[ip] = pingMs;
        addResultRow(ip, openPorts, pingMs);
        if (typeof appendCmdLog === 'function') appendCmdLog(`>> HOST  ${ip}  ports: [${openPorts.join(', ')}]${pingMs !== null ? '  ping: '+pingMs+'ms' : ''}`, 'scan');
      }
      checked++;
      if (checked%4===0||checked===total) updateProgress(checked,total,totalFound,totalOpenPorts);
      if (delayMs > 0 && !stopRequested && nextIdx < total) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  };

  await Promise.all(Array.from({length:concurrency},worker));
  setScanState(false);
  updateProgress(total,total,totalFound,totalOpenPorts);

  if (totalFound===0 && emptyRow.parentNode) emptyRow.textContent = t('emptyNone');
  if (stopRequested) setStatus(t('statusStopped', statChecked.textContent),'warn');
  else if (totalFound>0) setStatus(t('statusDone', totalFound, totalOpenPorts),'ok');
  else setStatus(t('statusNone'),'err');
  if (typeof appendCmdLog === 'function') {
    if (stopRequested) appendCmdLog(`Scan stopped. Checked: ${statChecked.textContent}, found: ${totalFound} host${totalFound===1?'':'s'}`, 'scan');
    else if (totalFound>0) appendCmdLog(`Scan complete. Hosts: ${totalFound}, open ports: ${totalOpenPorts}`, 'scan');
    else appendCmdLog('Scan complete. No hosts found.', 'scan');
    appendCmdLog('─'.repeat(52), 'scan');
  }
}

btnGo.addEventListener('click',()=>{
  if(!scanning) startScan().catch(e=>{setStatus(`Error: ${e.message}`,'err');setScanState(false);});
});
btnStop.addEventListener('click',()=>{
  stopRequested=true; activeControllers.forEach(c=>c.abort());
  if (_tauriInvoke) _tauriInvoke('stop_scan').catch(()=>{});
});
btnClear.addEventListener('click',()=>{
  foundHostsMap={}; foundPingMap={}; totalFound=0; totalOpenPorts=0;
  traceRoutes = {};
  listBody.innerHTML=''; listBody.appendChild(emptyRow);
  emptyRow.textContent = t('emptyRow');
  updateProgress(0,0,0,0); statTime.textContent='0.0s';
  setStatus(t('statusCleared'));
  previewWrap.classList.remove('open');
  previewFrame.src='about:blank'; selectedRowEl=null;
  localStorage.removeItem('netrecon_results');
  localStorage.removeItem('netrecon_results_ts');
  localStorage.removeItem('netrecon_trace_routes');
  refreshTopologyFilterOptions();
  updateGlobeDots();
});



applyLang();
applyScanDefaultsToMainInputs(loadScanDefaults());
restoreTraceRoutes();
refreshTopologyFilterOptions();
