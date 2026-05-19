(function () {
  var menuGroups = {
    file: {
      purpose: "Operacje sesji: zapis, odczyt, domkniecie, import i wyjscie.",
    },
    options: {
      purpose: "Konfiguracja skanowania, jezyka interfejsu i rozszerzen.",
    },
    tools: {
      purpose: "Przelaczanie pomiedzy narzedziami diagnostycznymi.",
    },
    help: {
      purpose: "Informacje o wersji, pobieraniu i asystencie.",
    },
  };

  var menuActions = {
    "save-session": {
      label: "Save session (mock)",
      purpose: "Zapis aktualnej sesji.",
      behavior: "status",
    },
    "load-session": {
      label: "Load session (mock)",
      purpose: "Wczytanie zapisanej sesji.",
      behavior: "status",
    },
    "close-session": {
      label: "Close session (mock)",
      purpose: "Zamkniecie aktywnej sesji.",
      behavior: "status",
    },
    "import-another-session": {
      label: "Import another session data (mock)",
      purpose: "Import danych z innej sesji.",
      behavior: "status",
    },
    exit: {
      label: "Exit (mock)",
      purpose: "Wyjscie z aplikacji.",
      behavior: "status",
    },
    countries: {
      label: "Country IP Library (mock)",
      purpose: "Biblioteka zakresow IP wedlug krajow.",
      behavior: "switch-tool:settings",
    },
    presets: {
      label: "Port Presets (mock)",
      purpose: "Zarzadzanie presetami portow.",
      behavior: "switch-tool:settings",
    },
    defaults: {
      label: "Default Scan Values (mock)",
      purpose: "Domyslne wartosci skanowania.",
      behavior: "switch-tool:settings",
    },
    language: {
      label: "Language manager",
      purpose: "Dodawanie i aktywacja jezykow UI.",
      behavior: "open-language-manager",
    },
    customization: {
      label: "Customization (extensions)",
      purpose: "Instalacja i zarzadzanie rozszerzeniami.",
      behavior: "open-extension-manager",
    },
    versions: {
      label: "Versions",
      purpose: "Informacje o wersjach aplikacji.",
      behavior: "switch-tool:versions",
    },
    download: {
      label: "Download (mock)",
      purpose: "Linki do pobrania aplikacji.",
      behavior: "status",
    },
    about: {
      label: "About (mock)",
      purpose: "Informacje o projekcie.",
      behavior: "status",
    },
    assistant: {
      label: "Assistant",
      purpose: "Przelaczenie do panelu asystenta AI.",
      behavior: "switch-tool:ai-assistant",
    },
    "window-min": {
      label: "Window minimize (mock)",
      purpose: "Minimalizacja okna aplikacji.",
      behavior: "status",
    },
    "window-max": {
      label: "Window maximize (mock)",
      purpose: "Maksymalizacja okna aplikacji.",
      behavior: "status",
    },
    "window-close": {
      label: "Window close (mock)",
      purpose: "Zamykanie okna aplikacji.",
      behavior: "status",
    },
  };

  var panelDefinitions = {
    activityBar: {
      selector: ".v1-activity",
      purpose: "Szybkie ikony do przelaczania glownych narzedzi.",
    },
    explorer: {
      selector: ".v1-sidebar",
      purpose: "Lista wszystkich narzedzi i modulow aplikacji.",
    },
    editor: {
      selector: ".v1-content",
      purpose: "Glowny obszar roboczy aktywnego narzedzia.",
    },
    console: {
      selector: ".v1-console-zone",
      purpose: "Konsola logow i makr diagnostycznych.",
    },
    assistant: {
      selector: ".v1-rightbar",
      purpose: "Panel asystenta AI i watkow analitycznych.",
    },
    statusBar: {
      selector: ".v1-status",
      purpose: "Pasek statusu sesji i aktywnego narzedzia.",
    },
  };

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.uiDefinitions = {
    menuGroups: menuGroups,
    menuActions: menuActions,
    panelDefinitions: panelDefinitions,
  };
})();
