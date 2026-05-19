(function () {
  var LANG_KEY = "netrecon_lang";
  var CUSTOM_DICTS_KEY = "netrecon_custom_i18n";

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
      resultsManage: "Manage Results",
      resultsIp: "IP Scan Results",
      resultsWifi: "WiFi Devices",
      resultsBt: "Bluetooth Devices",
      tabResultsManage: "Manage",
      tabResultsIp: "IP Results",
      tabResultsWifi: "WiFi",
      tabResultsBt: "Bluetooth",
      toolResultsManageTitle: "Manage Results",
      toolResultsManageText: "Export, import, and clear saved scan results.",
      toolResultsIpTitle: "IP Scan Results",
      toolResultsIpText: "Table of discovered hosts, open ports, and enrichment data.",
      toolResultsWifiTitle: "WiFi Devices",
      toolResultsWifiText: "List of discovered WiFi networks with signal details.",
      toolResultsBtTitle: "Bluetooth Devices",
      toolResultsBtText: "List of discovered BLE and Classic Bluetooth devices.",
      assistant: "Assistant",
      toolRoute: "Tool route",
      active: "active",
      menuPrefix: "Menu",
      tabPrefix: "Tab",
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
      resultsManage: "Zarządzanie wynikami",
      resultsIp: "Wyniki IP Scan",
      resultsWifi: "Urządzenia WiFi",
      resultsBt: "Urządzenia Bluetooth",
      tabResultsManage: "Zarządzanie",
      tabResultsIp: "Wyniki IP",
      tabResultsWifi: "WiFi",
      tabResultsBt: "Bluetooth",
      toolResultsManageTitle: "Zarządzanie wynikami",
      toolResultsManageText: "Eksport, import i czyszczenie zapisanych wyników skanowania.",
      toolResultsIpTitle: "Wyniki IP Scan",
      toolResultsIpText: "Tabela wykrytych hostów, portów i wzbogaconych danych.",
      toolResultsWifiTitle: "Urządzenia WiFi",
      toolResultsWifiText: "Lista wykrytych sieci WiFi z parametrami sygnałów.",
      toolResultsBtTitle: "Urządzenia Bluetooth",
      toolResultsBtText: "Lista wykrytych urządzeń BLE i Classic Bluetooth.",
      assistant: "Asystent",
      toolRoute: "Trasa narzędzia",
      active: "aktywne",
      menuPrefix: "Menu",
      tabPrefix: "Zakładka",
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
      localStorage.setItem(CUSTOM_DICTS_KEY, JSON.stringify(custom));
    } catch (_) {}
  }

  function loadCustomDictionaries() {
    var payload = null;
    try {
      payload = localStorage.getItem(CUSTOM_DICTS_KEY);
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
    var raw = localStorage.getItem(LANG_KEY) || "en";
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
      localStorage.setItem(LANG_KEY, normalized);
      document.documentElement.setAttribute("lang", normalized);
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
