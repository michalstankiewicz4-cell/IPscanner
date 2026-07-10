(function () {
  var menuGroups = {
    file: {
      purposeKey: "tipMenuGroupFile",
      purpose: "Operacje sesji: zapis, odczyt, domkniecie, import i wyjscie.",
    },
    options: {
      purposeKey: "tipMenuGroupOptions",
      purpose: "Konfiguracja skanowania, jezyka interfejsu i rozszerzen.",
    },
    tools: {
      purposeKey: "tipMenuGroupTools",
      purpose: "Przelaczanie pomiedzy narzedziami diagnostycznymi.",
    },
    help: {
      purposeKey: "tipMenuGroupHelp",
      purpose: "Informacje o wersji, pobieraniu i asystencie.",
    },
  };

  var menuActions = {
    // --- shell keys ---
    // File/Options(Language, Import Tools)/Help/window actions stay in the
    // base shell per FUTURE_PLUGIN_SHELL.md. Only 3 entries below route to
    // IP-Scanner-specific tools (see "ip-scanner tool keys" marker further
    // down) - everything else here is shell chrome.
    "new-session": {
      label: "New",
      purposeKey: "tipActionNewSession",
      purpose: "Zamkniecie biezacej sesji i rozpoczecie nowej (jak Close).",
      behavior: "new-session",
    },
    "save-session": {
      label: "Save",
      purposeKey: "tipActionSaveSession",
      purpose: "Zapis aktualnej sesji.",
      behavior: "save-session",
    },
    "save-session-as": {
      label: "Save as...",
      purposeKey: "tipActionSaveSessionAs",
      purpose: "Zapis aktualnej sesji pod nowa nazwa.",
      behavior: "save-session-as",
    },
    "load-session": {
      label: "Open",
      purposeKey: "tipActionLoadSession",
      purpose: "Wczytanie zapisanej sesji.",
      behavior: "load-session",
    },
    "close-session": {
      label: "Close",
      purposeKey: "tipActionCloseSession",
      purpose: "Zamkniecie aktywnej sesji.",
      behavior: "close-session",
    },
    "import-another-session": {
      label: "Import (mock)",
      purposeKey: "tipActionImportAnotherSession",
      purpose: "Import danych z innej sesji.",
      behavior: "status",
    },
    exit: {
      label: "Exit (mock)",
      purposeKey: "tipActionExit",
      purpose: "Wyjscie z aplikacji.",
      behavior: "app-exit",
    },
    language: {
      label: "Language manager",
      purposeKey: "tipActionLanguage",
      purpose: "Dodawanie i aktywacja jezykow UI.",
      behavior: "open-language-manager",
    },
    customization: {
      label: "Import Tool",
      purposeKey: "tipActionCustomization",
      purpose: "Import rozszerzen i zarzadzanie toolami.",
      behavior: "switch-tool:import-tool",
    },
    versions: {
      label: "Versions",
      purposeKey: "tipActionVersions",
      purpose: "Informacje o wersjach aplikacji.",
      behavior: "switch-tool:versions",
    },
    download: {
      label: "Download",
      purposeKey: "tipActionDownload",
      purpose: "Linki do pobrania aplikacji.",
      behavior: "open-github-download",
    },
    about: {
      label: "About (mock)",
      purposeKey: "tipActionAbout",
      purpose: "Informacje o projekcie.",
      behavior: "switch-tool:about",
    },
    license: {
      label: "License",
      purposeKey: "tipActionLicense",
      purpose: "Informacje o licencji projektu.",
      behavior: "switch-tool:license",
    },
    assistant: {
      label: "Assistant",
      purposeKey: "tipActionAssistant",
      purpose: "Pokaz lub ukryj asystenta Clippy.",
      behavior: "toggle-clippy",
    },
    "assistant-right": {
      label: "AI Assistant",
      purposeKey: "tipActionAssistant",
      purpose: "Otwiera panel asystenta AI po prawej stronie.",
      behavior: "open-right-tool:assistant",
    },
    "window-min": {
      label: "Window minimize",
      purposeKey: "tipActionWindowMin",
      purpose: "Minimalizacja okna aplikacji.",
      behavior: "window-minimize",
    },
    "window-max": {
      label: "Window maximize",
      purposeKey: "tipActionWindowMax",
      purpose: "Maksymalizacja okna aplikacji.",
      behavior: "window-maximize",
    },
    "window-fullscreen": {
      label: "Window fullscreen",
      purposeKey: "tipActionWindowFullscreen",
      purpose: "Przelaczenie trybu pelnoekranowego.",
      behavior: "window-fullscreen",
    },
    "auto-arrange-windows": {
      label: "Auto Arrange windows",
      purposeKey: "tipActionAutoArrange",
      purpose: "Automatyczne rozmieszczenie odpiętych okien.",
      behavior: "auto-arrange-windows",
    },
    "blur-ip-soon": {
      label: "Blur IP addresses",
      purposeKey: "tipActionBlurIp",
      purpose: "Rozmywa widoczne adresy IP/hostname na ekranie (bezpieczne udostepnianie ekranu).",
      behavior: "toggle-blur-ip",
    },
    "window-close": {
      label: "Window close",
      purposeKey: "tipActionWindowClose",
      purpose: "Zamykanie okna aplikacji.",
      behavior: "window-close",
    },

    // --- ip-scanner tool keys ---
    // These 3 route to IP-Scanner-specific tools; per FUTURE_PLUGIN_SHELL.md
    // the base Options menu trims down to only Language + Import Tools, so
    // these become addon-contributed menu entries once that split happens.
    countries: {
      label: "Country IP Library",
      purposeKey: "tipActionCountries",
      purpose: "Biblioteka zakresow IP wedlug krajow.",
      behavior: "switch-tool:ip-library",
    },
    presets: {
      label: "Port Presets (mock)",
      purposeKey: "tipActionPresets",
      purpose: "Zarzadzanie presetami portow.",
      behavior: "switch-tool:presets",
    },
    defaults: {
      label: "Default Scan Values (mock)",
      purposeKey: "tipActionDefaults",
      purpose: "Domyslne wartosci skanowania.",
      behavior: "switch-tool:scan-defaults",
    },
  };

  var panelDefinitions = {
    activityBar: {
      selector: ".v1-activity",
      purposeKey: "tipPanelActivityBar",
      purpose: "Szybkie ikony do przelaczania glownych narzedzi.",
    },
    explorer: {
      selector: ".v1-sidebar",
      purposeKey: "tipPanelSidebar",
      purpose: "Lista wszystkich narzedzi i modulow aplikacji.",
    },
    editor: {
      selector: ".v1-content",
      purposeKey: "tipPanelEditor",
      purpose: "Glowny obszar roboczy aktywnego narzedzia.",
    },
    console: {
      selector: ".v1-console-zone",
      purposeKey: "tipPanelConsole",
      purpose: "Konsola logow i makr diagnostycznych.",
    },
    assistant: {
      selector: ".v1-rightbar",
      purposeKey: "tipPanelAssistant",
      purpose: "Panel asystenta AI i watkow analitycznych.",
    },
    statusBar: {
      selector: ".v1-status",
      purposeKey: "tipPanelStatusBar",
      purpose: "Pasek statusu sesji i aktywnego narzedzia.",
    },
  };

  var appLinks = {
    downloadUrl: "https://github.com/michalstankiewicz4-cell/IPscanner",
  };

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.uiDefinitions = {
    menuGroups: menuGroups,
    menuActions: menuActions,
    panelDefinitions: panelDefinitions,
    appLinks: appLinks,
  };
})();
