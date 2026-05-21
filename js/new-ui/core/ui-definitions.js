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
    "save-session": {
      label: "Save session (mock)",
      purposeKey: "tipActionSaveSession",
      purpose: "Zapis aktualnej sesji.",
      behavior: "status",
    },
    "load-session": {
      label: "Load session (mock)",
      purposeKey: "tipActionLoadSession",
      purpose: "Wczytanie zapisanej sesji.",
      behavior: "status",
    },
    "close-session": {
      label: "Close session (mock)",
      purposeKey: "tipActionCloseSession",
      purpose: "Zamkniecie aktywnej sesji.",
      behavior: "status",
    },
    "import-another-session": {
      label: "Import another session data (mock)",
      purposeKey: "tipActionImportAnotherSession",
      purpose: "Import danych z innej sesji.",
      behavior: "status",
    },
    exit: {
      label: "Exit (mock)",
      purposeKey: "tipActionExit",
      purpose: "Wyjscie z aplikacji.",
      behavior: "status",
    },
    countries: {
      label: "Country IP Library (mock)",
      purposeKey: "tipActionCountries",
      purpose: "Biblioteka zakresow IP wedlug krajow.",
      behavior: "switch-tool:settings",
    },
    presets: {
      label: "Port Presets (mock)",
      purposeKey: "tipActionPresets",
      purpose: "Zarzadzanie presetami portow.",
      behavior: "switch-tool:settings",
    },
    defaults: {
      label: "Default Scan Values (mock)",
      purposeKey: "tipActionDefaults",
      purpose: "Domyslne wartosci skanowania.",
      behavior: "switch-tool:settings",
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
    "window-close": {
      label: "Window close",
      purposeKey: "tipActionWindowClose",
      purpose: "Zamykanie okna aplikacji.",
      behavior: "window-close",
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
