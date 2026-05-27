(function () {
  var LANG_KEY = "netrecon_lang";
  var CUSTOM_DICTS_KEY = "netrecon_custom_i18n";

  function getStorageAdapter() {
    var core = window.NetReconNewUICore || {};
    var platform = core.platform || null;
    return platform && platform.storage ? platform.storage : null;
  }

  function storageGet(key) {
    var storage = getStorageAdapter();
    if (storage && typeof storage.getItem === "function") {
      return storage.getItem(key);
    }
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function storageSet(key, value) {
    var storage = getStorageAdapter();
    if (storage && typeof storage.setItem === "function") {
      return storage.setItem(key, value);
    }
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  var baseDictionaries = {
    en: {
      menuFile: "File",
      menuOptions: "Options",
      menuTools: "Tools",
      menuHelp: "Help",
      explorer: "Explorer",
      ipScanner: "IP Scanner",
      resultsSidebarTitle: "Results",
      resultsBrowser: "Results Browser",
      resultsIp: "IP Scan Results",
      tabResultsIp: "IP Results",
      terminalTab: "Terminal",
      consoleTab: "Console",
      toolTitle_scan_runner: "Scan Runner",
      toolTitle_topology: "Topology Map",
      toolTitle_globe: "World Globe",
      toolTitle_ip_library: "IP Library",
      toolTitle_settings: "Options",
      toolTitle_import_tool: "Import Tool",
      toolTitle_language_manager: "Language Manager",
      toolTitle_versions: "Versions",
      toolTitle_about: "About",
      toolTitle_license: "License",
      toolTitle_results_ip: "IP Scan Results",
      toolResultsIpTitle: "IP Scan Results",
      toolResultsIpText: "Table of discovered hosts, open ports, and enrichment data.",
      toolText_results_ip: "Table of discovered hosts, open ports, and enrichment data.",
      toolText_scan_runner: "IP range, port presets, concurrent probing, and result persistence.",
      toolText_topology: "Host relationship view with filters by port and response time.",
      toolText_globe: "Host geolocation map and communication endpoints.",
      toolText_ip_library: "Country IP range library with PowerShell-based update and local cache.",
      toolText_settings: "Application settings, default scan values, and UI preferences.",
      toolText_import_tool: "Import, list, and remove tools/extensions from JSON manifest.",
      toolText_language_manager: "Add, activate, and review language dictionaries.",
      toolText_versions: "Application change and release history.",
      toolText_about: "Project and author information.",
      toolText_license: "License and usage terms.",
      assistant: "Assistant",
      toolRoute: "Tool route",
      active: "active",
      noActiveTab: "no active tab",
      menuPrefix: "Menu",
      tabPrefix: "Tab",
      tabCloseAria: "Close tab",
      extManagerTitle: "Extension Manager",
      extManifestLabel: "Manifest JSON",
      extManifestPlaceholder: "Paste extension manifest JSON",
      extUninstallLabel: "Extension id to uninstall",
      extUninstallPlaceholder: "com.example.demo",
      extInstallBtn: "Install",
      extListBtn: "List",
      extUninstallBtn: "Uninstall",
      extCloseBtn: "Close",
      extManagerReady: "Ready. Install, list, or uninstall extensions.",
      langManagerTitle: "Language Manager",
      langCodeLabel: "Language code",
      langCodePlaceholder: "e.g. de",
      langDictLabel: "Language dictionary JSON",
      langDictPlaceholder: "{\n  \"menuFile\": \"Datei\"\n}",
      langAddBtn: "Add language",
      langActivateBtn: "Activate language",
      langListBtn: "List languages",
      langAddOk: "Language added",
      langAddFail: "Language add failed",
      langActivateOk: "Language activated",
      langActivateFail: "Language activation failed",
      langListHeader: "Available languages",
      langInvalidCode: "Invalid language code",
      langInvalidDict: "Invalid language dictionary",
      extManagerPrompt: "Extension manager: type install, list, or uninstall",
      extManifestPrompt: "Paste extension manifest JSON",
      extInvalidJson: "Invalid JSON manifest",
      extInstallOk: "Extension installed",
      extInstallFail: "Extension install failed",
      extListEmpty: "No installed extensions",
      extListHeader: "Installed extensions",
      extUninstallPrompt: "Type extension id to uninstall",
      extUninstallOk: "Extension uninstalled",
      extUninstallFail: "Extension uninstall failed",
      importToolTitle: "Import Tool",
      ipLibraryTabTitle: "IP Library",
      ipLibraryTitle: "Country IP Library",
      ipLibraryNote: "Update the country range library using a local PowerShell script and keep a cached copy.",
      ipLibraryCountriesLabel: "Country codes",
      ipLibraryTopRangesLabel: "Top ranges per country",
      ipLibraryUpdateBtn: "Update (PowerShell)",
      ipLibraryLoadBtn: "Load cached",
      ipLibraryLastUpdateLabel: "Last update:",
      ipLibraryStatusEmpty: "No cached IP library data.",
      ipLibraryStatusLoaded: "Loaded",
      ipLibraryStatusUpdated: "Updated",
      ipLibraryStatusUpdatedAt: "Updated at:",
      ipLibraryStatusUpdating: "Updating country IP library...",
      ipLibraryStatusUpdateFailed: "IP library update failed.",
      ipLibraryStatusBadCountries: "Provide at least one 2-letter country code.",
      ipLibraryStatusInvalidCache: "Cached IP library is invalid JSON.",
      helpAboutTitle: "About",
      helpLicenseTitle: "License",
      tabAboutTitle: "About",
      tabLicenseTitle: "License",
      aboutHeading: "OSINT NET Auditor",
      aboutVersionLabel: "Automatic version from one source:",
      aboutByAuthor: "by Michal Stankiewicz",
      aboutSupportHeading: "Do you like what I build?",
      aboutSupportBody: "If my work inspired you or helped in real use, you can support further development:",
      aboutSupportQuick: "Quick support: Bank transfer or BLIK to phone:",
      aboutSupportPhone: "+48 797 486 355",
      aboutSupportContact: "Stay in touch: Facebook",
      aboutSupportFacebook: "facebook.com/MajkelMajkel",
      aboutProjectPageLabel: "Project page:",
      aboutProjectPageUrl: "facebook.com/OSINTNETAuditor",
      aboutTransferHeading: "Transfer details:",
      aboutTransferName: "Michal Stankiewicz",
      aboutTransferCity: "02-585 Warszawa",
      aboutTransferBank: "PKO BP",
      aboutTransferIban: "IBAN: PL55 1020 1097 0000 7902 0226 5353",
      aboutTransferTitle: "Title: \"inspiracja\"",
      aboutTotalCostsHeading: "My total costs:",
      aboutTotalCostDomains: "domains - $4",
      aboutTotalCostCopilot: "github copilot - $78.00",
      aboutTotalCostOther: "other expenses - $12",
      aboutTotalCostAds: "ads - $16",
      licenseHeading: "MIT License",
      importOptToolsMenu: "Add imported tools to Tools menu",
      importOptActivityIcon: "Add imported tools icon to activity bar",
      scannerDetectIp: "Detect IP",
      scannerExternalIp: "External IP",
      scannerLocalIp: "Local IP",
      scannerSubnets: "Subnets",
      scannerIpRange: "IP Range",
      scannerFrom: "From",
      scannerTo: "To",
      scannerPorts: "Ports",
      scannerPresetCommon: "Common (21,22,23,80,443,3389)",
      scannerPresetTop20: "Top 20",
      scannerPresetWeb: "Web (80,443,8080,8443)",
      scannerPresetSmb: "SMB / Windows (135,139,445)",
      scannerPresetDb: "Databases (1433,1521,3306,5432,6379,27017)",
      scannerPresetAll: "All (1-65535)",
      scannerPresetCustom: "Custom...",
      scannerStart: "Start",
      scannerStop: "Stop",
      scannerClear: "Clear",
      scannerScanSpeed: "Scan Speed",
      scannerIpExtractor: "IP Extractor",
      scannerExtractorPlaceholder: "example.com 192.168.1.10",
      scannerAddExtract: "Add / Extract",
      scannerExtractedPlaceholder: "Extracted IPs...",
      scannerRangeHistory: "Range History",
      scannerNoRangeHistory: "No scan ranges yet.",
      scannerHistoryUseAria: "Use range",
      scannerHistoryDeleteAria: "Delete range",
      statusScanStart: "Scan: Start (mock)",
      statusScanStop: "Scan: Stop (mock)",
      statusScanClear: "Scan: Clear (mock)",
      statusScanSpeed: "Scan: Speed settings (mock)",
      statusExternalIp: "External IP:",
      statusLocalIp: "Local IP:",
      statusSubnet: "Subnet:",
      statusRangeSet: "IP Range set:",
      statusRangeRecalled: "IP Range recalled:",
      statusRangeDeleted: "Range removed from history",
      statusExtractorNoInput: "IP Extractor: no input",
      statusExtractorAdded: "IP Extractor: added",
      statusExtractorUnresolved: "unresolved",
      statusDesktopOnlyShort: "desktop only",
      statusDesktopOnlySuffix: " (desktop only)",
      statusErrorShort: "error",
      statusCommandFailed: "command failed",
      statusExternalIpDesktopOnly: "External IP: desktop only",
      statusExternalIpNoOutput: "External IP: no output",
      statusExternalIpCommandFailed: "External IP: command failed",
      statusLocalIpDesktopOnly: "Local IP: desktop only",
      statusLocalIpNoOutput: "Local IP: no output",
      statusLocalIpCommandFailed: "Local IP: command failed",
      statusSubnetsDesktopOnly: "Subnets: desktop only",
      statusSubnetsNoOutput: "Subnets: no output",
      statusSubnetsCommandFailed: "Subnets: command failed",
      panelHideLeft: "Hide left section",
      panelRestoreLeft: "Restore left section",
      panelHideRight: "Hide right section",
      panelRestoreRight: "Restore right section",
      panelHideBottom: "Hide bottom section",
      panelRestoreBottom: "Restore bottom section",
      scannerTipDetectExternal: "Detect your external/public IP",
      scannerTipDetectLocal: "Detect your local LAN IP",
      scannerTipDetectSubnets: "Detect local subnets",
      scannerTipUseDetectedRange: "Use detected IP as range x.x.x.0 - x.x.x.255",
      scannerTipStart: "Start scan for current range",
      scannerTipStop: "Stop current scan",
      scannerTipClear: "Clear current scan state",
      scannerTipScanSpeed: "Open scan speed settings",
      scannerTipAddExtract: "Add IPs and resolve domains to IP",
      tipMenuGroupFile: "Session operations: save, load, close, import, and exit.",
      tipMenuGroupOptions: "Scan configuration, UI language, and extensions.",
      tipMenuGroupTools: "Switch between diagnostic tools.",
      tipMenuGroupHelp: "Version, download, and assistant information.",
      tipActionSaveSession: "Save current session.",
      tipActionLoadSession: "Load saved session.",
      tipActionCloseSession: "Close active session.",
      tipActionImportAnotherSession: "Import data from another session.",
      tipActionExit: "Exit application.",
      tipActionCountries: "Country-based IP range library.",
      tipActionPresets: "Manage port presets.",
      tipActionDefaults: "Default scan values.",
      tipActionLanguage: "Add and activate UI languages.",
      tipActionCustomization: "Open the Import Tool panel.",
      tipActionVersions: "Application version information.",
      tipActionDownload: "Application download links.",
      tipActionAbout: "Project information.",
      tipActionLicense: "License information.",
      tipActionAssistant: "Show or hide the Clippy assistant.",
      tipActionWindowMin: "Minimize application window.",
      tipActionWindowMax: "Maximize application window.",
      tipActionWindowFullscreen: "Toggle fullscreen mode.",
      tipActionAutoArrange: "Automatically arrange detached windows.",
      tipActionWindowClose: "Close application window.",
      autoArrangeOnUndockTitle: "Auto arrange when tabs are opened in floating windows",
      autoArrangeOnUndockPrefix: "auto arrange on undock",
      stateEnabled: "enabled",
      stateDisabled: "disabled",
      detachedSwapTitle: "Swap content with another window",
      detachedDockTitle: "Dock tab back",
      detachedUndockTitle: "Open tab in floating window",
      detachedNoWindowsToArrange: "no detached windows to arrange",
      detachedAutoArrangedPrefix: "auto-arranged",
      detachedWindowsLabel: "windows",
      detachedLayoutReset: "floating layout reset",
      detachedDocked: "docked",
      detachedUndocked: "undocked",
      detachedClosed: "closed",
      tipPanelActivityBar: "Quick icons for switching primary tools.",
      tipPanelSidebar: "Tool and scanner controls sidebar.",
      tipPanelEditor: "Main work area for the active tool.",
      tipPanelConsole: "Diagnostic log and macro console.",
      tipPanelAssistant: "AI assistant panel and analysis threads.",
      tipPanelStatusBar: "Session and active tool status bar.",
      clippyOn: "Clippy on",
      clippyOff: "Clippy off",
      clippyCloseAria: "Close assistant",
      clippyTip1: "Need a quick start? Set an IP range and click Start.",
      clippyTip2: "Use the Results Browser to switch between IP, WiFi and Bluetooth views.",
      clippyTip3: "You can manage extensions and languages in Options -> Customization.",
      clippyTip4: "Tip: click me to rotate hints instantly.",
      psConsolePlaceholder: "Type PowerShell command and press Enter",
      psConsoleRun: "Run",
      psConsoleClear: "Clear",
      psConsoleReady: "PowerShell integrated console ready.",
      psConsoleRunning: "Running PowerShell command...",
      psConsoleDesktopOnly: "PowerShell execution is available only in desktop (Tauri) mode.",
      psConsoleExecFailed: "PowerShell execution failed:",
      psConsoleCleared: "Console output cleared.",
    },
    pl: {
      menuFile: "Plik",
      menuOptions: "Opcje",
      menuTools: "Narzędzia",
      menuHelp: "Pomoc",
      explorer: "Eksplorator",
      ipScanner: "Skaner IP",
      resultsSidebarTitle: "Wyniki",
      resultsBrowser: "Przeglądanie wyników",
      resultsIp: "Wyniki IP Scan",
      tabResultsIp: "Wyniki IP",
      terminalTab: "Terminal",
      consoleTab: "Konsola",
      toolTitle_scan_runner: "Scan Runner",
      toolTitle_topology: "Mapa topologii",
      toolTitle_globe: "Glob",
      toolTitle_ip_library: "Biblioteka IP",
      toolTitle_settings: "Opcje",
      toolTitle_import_tool: "Import Tool",
      toolTitle_language_manager: "Menedzer jezykow",
      toolTitle_versions: "Wersje",
      toolTitle_about: "O aplikacji",
      toolTitle_license: "Licencja",
      toolTitle_results_ip: "Wyniki IP Scan",
      toolResultsIpTitle: "Wyniki IP Scan",
      toolResultsIpText: "Tabela wykrytych hostów, portów i wzbogaconych danych.",
      toolText_results_ip: "Tabela wykrytych hostow, portow i wzbogaconych danych.",
      toolText_scan_runner: "Zakres IP, presety portów, równoległe sondowanie i zapis wyników.",
      toolText_topology: "Widok relacji hostów z filtrowaniem po porcie i czasie odpowiedzi.",
      toolText_globe: "Mapa geolokalizacji hostów i punktów komunikacji.",
      toolText_ip_library: "Biblioteka zakresow IP krajow z aktualizacja przez PowerShell i cache lokalnym.",
      toolText_settings: "Ustawienia aplikacji, domyślne wartości skanowania i preferencje UI.",
      toolText_import_tool: "Importowanie, lista i usuwanie narzędzi oraz rozszerzeń z manifestu JSON.",
      toolText_language_manager: "Dodawanie, aktywacja i przegląd słowników językowych.",
      toolText_versions: "Historia zmian i wydań aplikacji.",
      toolText_about: "Informacje o projekcie i autorze.",
      toolText_license: "Informacje o licencji i warunkach użycia.",
      assistant: "Asystent",
      toolRoute: "Trasa narzędzia",
      active: "aktywne",
      noActiveTab: "brak aktywnej zakładki",
      menuPrefix: "Menu",
      tabPrefix: "Zakładka",
      tabCloseAria: "Zamknij zakładkę",
      extManagerTitle: "Menedzer rozszerzen",
      extManifestLabel: "Manifest JSON",
      extManifestPlaceholder: "Wklej JSON manifestu rozszerzenia",
      extUninstallLabel: "Id rozszerzenia do odinstalowania",
      extUninstallPlaceholder: "com.example.demo",
      extInstallBtn: "Instaluj",
      extListBtn: "Lista",
      extUninstallBtn: "Odinstaluj",
      extCloseBtn: "Zamknij",
      extManagerReady: "Gotowe. Zainstaluj, wyswietl liste lub odinstaluj rozszerzenia.",
      langManagerTitle: "Menedzer jezykow",
      langCodeLabel: "Kod jezyka",
      langCodePlaceholder: "np. de",
      langDictLabel: "JSON slownika jezyka",
      langDictPlaceholder: "{\n  \"menuFile\": \"Datei\"\n}",
      langAddBtn: "Dodaj jezyk",
      langActivateBtn: "Aktywuj jezyk",
      langListBtn: "Lista jezykow",
      langAddOk: "Jezyk dodany",
      langAddFail: "Dodanie jezyka nieudane",
      langActivateOk: "Jezyk aktywowany",
      langActivateFail: "Aktywacja jezyka nieudana",
      langListHeader: "Dostepne jezyki",
      langInvalidCode: "Niepoprawny kod jezyka",
      langInvalidDict: "Niepoprawny slownik jezyka",
      extManagerPrompt: "Menedzer rozszerzen: wpisz install, list lub uninstall",
      extManifestPrompt: "Wklej JSON manifestu rozszerzenia",
      extInvalidJson: "Niepoprawny JSON manifestu",
      extInstallOk: "Rozszerzenie zainstalowane",
      extInstallFail: "Instalacja rozszerzenia nieudana",
      extListEmpty: "Brak zainstalowanych rozszerzen",
      extListHeader: "Zainstalowane rozszerzenia",
      extUninstallPrompt: "Podaj id rozszerzenia do odinstalowania",
      extUninstallOk: "Rozszerzenie odinstalowane",
      extUninstallFail: "Odinstalowanie rozszerzenia nieudane",
      importToolTitle: "Import Tool",
      ipLibraryTabTitle: "Biblioteka IP",
      ipLibraryTitle: "Biblioteka krajowych zakresow IP",
      ipLibraryNote: "Aktualizuj biblioteke zakresow krajow lokalnym skryptem PowerShell i trzymaj kopie w cache.",
      ipLibraryCountriesLabel: "Kody krajow",
      ipLibraryTopRangesLabel: "Liczba zakresow na kraj",
      ipLibraryUpdateBtn: "Aktualizuj (PowerShell)",
      ipLibraryLoadBtn: "Wczytaj cache",
      ipLibraryLastUpdateLabel: "Ostatnia aktualizacja:",
      ipLibraryStatusEmpty: "Brak danych biblioteki IP w cache.",
      ipLibraryStatusLoaded: "Wczytano",
      ipLibraryStatusUpdated: "Zaktualizowano",
      ipLibraryStatusUpdatedAt: "Aktualizacja:",
      ipLibraryStatusUpdating: "Aktualizacja biblioteki IP...",
      ipLibraryStatusUpdateFailed: "Aktualizacja biblioteki IP nieudana.",
      ipLibraryStatusBadCountries: "Podaj co najmniej jeden 2-literowy kod kraju.",
      ipLibraryStatusInvalidCache: "Cache biblioteki IP ma niepoprawny JSON.",
      helpAboutTitle: "O aplikacji",
      helpLicenseTitle: "Licencja",
      tabAboutTitle: "O aplikacji",
      tabLicenseTitle: "Licencja",
      aboutHeading: "OSINT NET Auditor",
      aboutVersionLabel: "Automatyczna wersja z jednego zrodla:",
      aboutByAuthor: "by Michal Stankiewicz",
      aboutSupportHeading: "Podoba Ci sie to, co robie?",
      aboutSupportBody: "Jesli moja praca byla dla Ciebie inspiracja lub realna pomoca, mozesz wesprzec moje dalsze dzialania:",
      aboutSupportQuick: "Szybkie wsparcie: Przelew tradycyjny lub BLIK na numer telefonu:",
      aboutSupportPhone: "+48 797 486 355",
      aboutSupportContact: "Badzmy w kontakcie: Facebook",
      aboutSupportFacebook: "facebook.com/MajkelMajkel",
      aboutProjectPageLabel: "Strona projektu:",
      aboutProjectPageUrl: "facebook.com/OSINTNETAuditor",
      aboutTransferHeading: "Dane do przelewu:",
      aboutTransferName: "Michal Stankiewicz",
      aboutTransferCity: "02-585 Warszawa",
      aboutTransferBank: "PKO BP",
      aboutTransferIban: "IBAN: PL55 1020 1097 0000 7902 0226 5353",
      aboutTransferTitle: "Tytulem: \"inspiracja\"",
      aboutTotalCostsHeading: "My total costs:",
      aboutTotalCostDomains: "domains - $4",
      aboutTotalCostCopilot: "github copilot - $78.00",
      aboutTotalCostOther: "other expenses - $12",
      aboutTotalCostAds: "ads - $16",
      licenseHeading: "Licencja MIT",
      importOptToolsMenu: "Dodaj importowane toole do menu Tools",
      importOptActivityIcon: "Dodaj ikone importowanych tooli do panelu activity",
      scannerDetectIp: "Wykryj IP",
      scannerExternalIp: "Zewnetrzne IP",
      scannerLocalIp: "Lokalne IP",
      scannerSubnets: "Podsieci",
      scannerIpRange: "Zakres IP",
      scannerFrom: "Od",
      scannerTo: "Do",
      scannerPorts: "Porty",
      scannerPresetCommon: "Popularne (21,22,23,80,443,3389)",
      scannerPresetTop20: "Top 20",
      scannerPresetWeb: "WWW (80,443,8080,8443)",
      scannerPresetSmb: "SMB / Windows (135,139,445)",
      scannerPresetDb: "Bazy danych (1433,1521,3306,5432,6379,27017)",
      scannerPresetAll: "Wszystkie (1-65535)",
      scannerPresetCustom: "Wlasne...",
      scannerStart: "Start",
      scannerStop: "Stop",
      scannerClear: "Wyczysc",
      scannerScanSpeed: "Predkosc skanu",
      scannerIpExtractor: "Ekstraktor IP",
      scannerExtractorPlaceholder: "example.com 192.168.1.10",
      scannerAddExtract: "Dodaj / Ekstraktuj",
      scannerExtractedPlaceholder: "Wyekstrahowane IP...",
      scannerRangeHistory: "Historia zakresow",
      scannerNoRangeHistory: "Brak zapisanych zakresow.",
      scannerHistoryUseAria: "Uzyj zakresu",
      scannerHistoryDeleteAria: "Usun zakres",
      statusScanStart: "Skan: Start (mock)",
      statusScanStop: "Skan: Stop (mock)",
      statusScanClear: "Skan: Wyczysc (mock)",
      statusScanSpeed: "Skan: Ustawienia predkosci (mock)",
      statusExternalIp: "Zewnetrzne IP:",
      statusLocalIp: "Lokalne IP:",
      statusSubnet: "Podsiec:",
      statusRangeSet: "Ustawiono zakres IP:",
      statusRangeRecalled: "Przywrocono zakres IP:",
      statusRangeDeleted: "Usunieto zakres z historii",
      statusExtractorNoInput: "Ekstraktor IP: brak danych",
      statusExtractorAdded: "Ekstraktor IP: dodano",
      statusExtractorUnresolved: "nierozwiazane",
      statusDesktopOnlyShort: "tylko desktop",
      statusDesktopOnlySuffix: " (tylko desktop)",
      statusErrorShort: "blad",
      statusCommandFailed: "polecenie nie powiodlo sie",
      statusExternalIpDesktopOnly: "Zewnetrzne IP: tylko desktop",
      statusExternalIpNoOutput: "Zewnetrzne IP: brak wyniku",
      statusExternalIpCommandFailed: "Zewnetrzne IP: polecenie nie powiodlo sie",
      statusLocalIpDesktopOnly: "Lokalne IP: tylko desktop",
      statusLocalIpNoOutput: "Lokalne IP: brak wyniku",
      statusLocalIpCommandFailed: "Lokalne IP: polecenie nie powiodlo sie",
      statusSubnetsDesktopOnly: "Podsieci: tylko desktop",
      statusSubnetsNoOutput: "Podsieci: brak wyniku",
      statusSubnetsCommandFailed: "Podsieci: polecenie nie powiodlo sie",
      panelHideLeft: "Ukryj lewy panel",
      panelRestoreLeft: "Przywroc lewy panel",
      panelHideRight: "Ukryj prawy panel",
      panelRestoreRight: "Przywroc prawy panel",
      panelHideBottom: "Ukryj dolny panel",
      panelRestoreBottom: "Przywroc dolny panel",
      scannerTipDetectExternal: "Wykryj zewnetrzne/publiczne IP",
      scannerTipDetectLocal: "Wykryj lokalne IP w sieci LAN",
      scannerTipDetectSubnets: "Wykryj lokalne podsieci",
      scannerTipUseDetectedRange: "Uzyj wykrytego IP jako zakres x.x.x.0 - x.x.x.255",
      scannerTipStart: "Uruchom skanowanie biezacego zakresu",
      scannerTipStop: "Zatrzymaj biezace skanowanie",
      scannerTipClear: "Wyczysc stan biezacego skanu",
      scannerTipScanSpeed: "Otworz ustawienia predkosci skanowania",
      scannerTipAddExtract: "Dodaj IP i rozwiaz domeny do adresow IP",
      tipMenuGroupFile: "Operacje sesji: zapis, odczyt, domkniecie, import i wyjscie.",
      tipMenuGroupOptions: "Konfiguracja skanowania, jezyka interfejsu i rozszerzen.",
      tipMenuGroupTools: "Przelaczanie pomiedzy narzedziami diagnostycznymi.",
      tipMenuGroupHelp: "Informacje o wersji, pobieraniu i asystencie.",
      tipActionSaveSession: "Zapis aktualnej sesji.",
      tipActionLoadSession: "Wczytanie zapisanej sesji.",
      tipActionCloseSession: "Zamkniecie aktywnej sesji.",
      tipActionImportAnotherSession: "Import danych z innej sesji.",
      tipActionExit: "Wyjscie z aplikacji.",
      tipActionCountries: "Biblioteka zakresow IP wedlug krajow.",
      tipActionPresets: "Zarzadzanie presetami portow.",
      tipActionDefaults: "Domyslne wartosci skanowania.",
      tipActionLanguage: "Dodawanie i aktywacja jezykow UI.",
      tipActionCustomization: "Otworz panel Import Tool.",
      tipActionVersions: "Informacje o wersjach aplikacji.",
      tipActionDownload: "Linki do pobrania aplikacji.",
      tipActionAbout: "Informacje o projekcie.",
      tipActionLicense: "Informacje o licencji.",
      tipActionAssistant: "Pokaz lub ukryj asystenta Clippy.",
      tipActionWindowMin: "Minimalizacja okna aplikacji.",
      tipActionWindowMax: "Maksymalizacja okna aplikacji.",
      tipActionWindowFullscreen: "Przelaczenie trybu pelnoekranowego.",
      tipActionAutoArrange: "Automatyczne rozmieszczenie odpiętych okien.",
      tipActionWindowClose: "Zamykanie okna aplikacji.",
      autoArrangeOnUndockTitle: "Automatycznie rozmieszczaj przy otwieraniu zakładek w pływających oknach",
      autoArrangeOnUndockPrefix: "auto rozmieszczanie przy odpinaniu",
      stateEnabled: "włączone",
      stateDisabled: "wyłączone",
      detachedSwapTitle: "Zamień zawartość z innym oknem",
      detachedDockTitle: "Przypnij zakładkę z powrotem",
      detachedUndockTitle: "Otwórz zakładkę w pływającym oknie",
      detachedNoWindowsToArrange: "brak odpiętych okien do rozmieszczenia",
      detachedAutoArrangedPrefix: "automatycznie rozmieszczono",
      detachedWindowsLabel: "okna",
      detachedLayoutReset: "zresetowano układ pływającego okna",
      detachedDocked: "przypięto",
      detachedUndocked: "odpięto",
      detachedClosed: "zamknięto",
      tipPanelActivityBar: "Szybkie ikony do przelaczania glownych narzedzi.",
      tipPanelSidebar: "Panel boczny sterowania skanerem i narzedziami.",
      tipPanelEditor: "Glowny obszar roboczy aktywnego narzedzia.",
      tipPanelConsole: "Konsola logow i makr diagnostycznych.",
      tipPanelAssistant: "Panel asystenta AI i watkow analitycznych.",
      tipPanelStatusBar: "Pasek statusu sesji i aktywnego narzedzia.",
      clippyOn: "Clippy wlaczony",
      clippyOff: "Clippy wylaczony",
      clippyCloseAria: "Zamknij asystenta",
      clippyTip1: "Szybki start: ustaw zakres IP i kliknij Start.",
      clippyTip2: "Uzyj Przegladania wynikow, aby przelaczac widoki IP, WiFi i Bluetooth.",
      clippyTip3: "Rozszerzeniami i jezykami zarzadzasz w Opcje -> Dostosowanie.",
      clippyTip4: "Wskazowka: kliknij mnie, aby od razu zmienic podpowiedz.",
      psConsolePlaceholder: "Wpisz komende PowerShell i nacisnij Enter",
      psConsoleRun: "Uruchom",
      psConsoleClear: "Wyczysc",
      psConsoleReady: "Zintegrowana konsola PowerShell gotowa.",
      psConsoleRunning: "Uruchamianie komendy PowerShell...",
      psConsoleDesktopOnly: "Wykonywanie PowerShell jest dostepne tylko w trybie desktop (Tauri).",
      psConsoleExecFailed: "Blad wykonania PowerShell:",
      psConsoleCleared: "Wyczyszczono wynik konsoli.",
    },
  };

  function cloneDictionaries(dicts) {
    var out = {};
    Object.keys(dicts || {}).forEach(function (langCode) {
      out[langCode] = Object.assign({}, dicts[langCode] || {});
    });
    return out;
  }

  var dictionaries = cloneDictionaries(baseDictionaries);

  function normalizeLangCode(code) {
    if (typeof code !== "string") return "";
    var normalized = code.trim().toLowerCase();
    if (!normalized) return "";
    return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(normalized) ? normalized : "";
  }

  function saveCustomDictionaries() {
    var custom = {};
    Object.keys(dictionaries).forEach(function (code) {
      if (!baseDictionaries[code]) {
        custom[code] = Object.assign({}, dictionaries[code]);
      }
    });

    try {
      storageSet(CUSTOM_DICTS_KEY, JSON.stringify(custom));
    } catch (_) {}
  }

  function loadCustomDictionaries() {
    var payload = null;
    try {
      payload = storageGet(CUSTOM_DICTS_KEY);
    } catch (_) {
      payload = null;
    }

    if (!payload) return;

    var parsed = null;
    try {
      parsed = JSON.parse(payload);
    } catch (_) {
      parsed = null;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;

    Object.keys(parsed).forEach(function (code) {
      var normalizedCode = normalizeLangCode(code);
      var dict = parsed[code];
      if (!normalizedCode || !dict || typeof dict !== "object" || Array.isArray(dict)) return;
      dictionaries[normalizedCode] = Object.assign({}, dict);
    });
  }

  function getCurrentLang() {
    var raw = storageGet(LANG_KEY) || "en";
    return dictionaries[raw] ? raw : "en";
  }

  function addLanguage(code, dictionary, persist) {
    var normalizedCode = normalizeLangCode(code);
    if (!normalizedCode) {
      return { ok: false, error: "Invalid language code" };
    }

    if (!dictionary || typeof dictionary !== "object" || Array.isArray(dictionary)) {
      return { ok: false, error: "Invalid language dictionary" };
    }

    dictionaries[normalizedCode] = Object.assign({}, dictionary);
    if (persist !== false) saveCustomDictionaries();
    return { ok: true, code: normalizedCode };
  }

  function listLanguages() {
    return Object.keys(dictionaries).sort();
  }

  function resetLanguages() {
    dictionaries = cloneDictionaries(baseDictionaries);
    loadCustomDictionaries();
  }

  function createI18n() {
    var lang = getCurrentLang();

    function t(key) {
      return (dictionaries[lang] && dictionaries[lang][key]) || (dictionaries.en && dictionaries.en[key]) || key;
    }

    function setLang(next) {
      var normalized = normalizeLangCode(next);
      if (!normalized || !dictionaries[normalized]) return lang;
      lang = normalized;
      storageSet(LANG_KEY, normalized);
      document.documentElement.setAttribute("lang", normalized);
      try {
        window.dispatchEvent(new CustomEvent("netrecon:language-changed", { detail: { lang: normalized } }));
      } catch (_) {}
      return lang;
    }

    function getLang() {
      return lang;
    }

    document.documentElement.setAttribute("lang", lang);

    return {
      t: t,
      getLang: getLang,
      setLang: setLang,
      addLanguage: addLanguage,
      listLanguages: listLanguages,
    };
  }

  loadCustomDictionaries();

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.i18n = {
    createI18n: createI18n,
    getCurrentLang: getCurrentLang,
    addLanguage: addLanguage,
    listLanguages: listLanguages,
    resetLanguages: resetLanguages,
  };
})();
