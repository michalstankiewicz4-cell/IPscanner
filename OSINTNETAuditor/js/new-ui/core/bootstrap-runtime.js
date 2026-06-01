(function () {
      const core = window.NetReconNewUICore || {};
      const i18n = core.i18n && core.i18n.createI18n
        ? core.i18n.createI18n()
        : { t: function (k) { return k; }, getLang: function () { return document.documentElement.getAttribute("lang") || "en"; } };

      if (core.theme && core.theme.applySkin && core.theme.getCurrentSkin) {
        core.theme.applySkin(core.theme.getCurrentSkin());
      }

      const platform = core.platform || {};
      const storage = platform.storage || null;
      function storageGet(key) {
        if (storage && typeof storage.getItem === "function") {
          return storage.getItem(key);
        }
        return window.localStorage ? window.localStorage.getItem(key) : null;
      }

      function storageSet(key, value) {
        if (storage && typeof storage.setItem === "function") {
          return storage.setItem(key, value);
        }
        if (!window.localStorage) return false;
        window.localStorage.setItem(key, value);
        return true;
      }

      const initialActiveTool = null;

      const store = core.createStore
        ? core.createStore({
            activeTool: initialActiveTool,
            lang: i18n.getLang(),
            skin: core.theme && core.theme.getCurrentSkin ? core.theme.getCurrentSkin() : "default",
          })
        : null;

      function tr(key) {
        return i18n && i18n.t ? i18n.t(key) : key;
      }

      function getCurrentVersion() {
        const versions = Array.isArray(core.versionsData) ? core.versionsData : [];
        if (!versions.length) return "v1.6.5";
        const first = versions[0] || {};
        return first.version ? String(first.version) : "v1.6.5";
      }

      function getAppNameWithVersion() {
        return "OSINT NET Auditor " + getCurrentVersion();
      }

      const statusLogRuntime = core.newUiRuntimes && core.newUiRuntimes.createStatusLogRuntime
        ? core.newUiRuntimes.createStatusLogRuntime({ maxLines: 400 })
        : null;

      const appNameWithVersion = getAppNameWithVersion();
      document.title = appNameWithVersion;
      const menuBrand = document.getElementById("v1MenuBrand");
      if (menuBrand) {
        menuBrand.setAttribute("title", appNameWithVersion);
        menuBrand.setAttribute("aria-label", appNameWithVersion);
      }

      function setStatusLine(text) {
        if (statusLogRuntime && statusLogRuntime.append) {
          statusLogRuntime.append(String(text || ""));
        }
      }

      if (platform && typeof platform.isParityMode === "function" && platform.isParityMode()) {
        setStatusLine("Desktop parity mode enabled");
      }

      let scannerSidebarRuntime = null;
      let powerShellConsoleRuntime = null;
      let layoutRuntime = null;
      let customScrollbarRuntime = null;
      let ipInputsRuntime = null;
      let navigationRuntime = null;
      let clippyRuntime = null;
      let tabsTrack = null;
      let tabsScrollLeftBtn = null;
      let tabsScrollRightBtn = null;

      function applyStaticTranslations() {
        const fileTrigger = document.querySelector('[data-menu="file"] .v1-menu-trigger');
        const optionsTrigger = document.querySelector('[data-menu="options"] .v1-menu-trigger');
        const toolsTrigger = document.querySelector('[data-menu="tools"] .v1-menu-trigger');
        const helpTrigger = document.querySelector('[data-menu="help"] .v1-menu-trigger');
        const explorerHead = document.getElementById("v1SidebarTitle");
        const assistantHead = document.querySelector('.v1-rightbar .v1-head-title');
        const extTitle = document.getElementById("v1ExtTitle");
        const extManifestLabel = document.getElementById("v1ExtManifestLabel");
        const extManifest = document.getElementById("v1ExtManifest");
        const extUninstallLabel = document.getElementById("v1ExtUninstallLabel");
        const extUninstallId = document.getElementById("v1ExtUninstallId");
        const extInstallBtn = document.getElementById("v1ExtInstallBtn");
        const extListBtn = document.getElementById("v1ExtListBtn");
        const extUninstallBtn = document.getElementById("v1ExtUninstallBtn");
        const langCodeLabel = document.getElementById("v1LangCodeLabel");
        const langCode = document.getElementById("v1LangCode");
        const langDictLabel = document.getElementById("v1LangDictLabel");
        const langDict = document.getElementById("v1LangDict");
        const langAddBtn = document.getElementById("v1LangAddBtn");
        const langActivateBtn = document.getElementById("v1LangActivateBtn");
        const langListBtn = document.getElementById("v1LangListBtn");
        const extCloseBtn = document.getElementById("v1ExtCloseBtn");
        const extClose = document.getElementById("v1ExtClose");
        const activityResultsBtn = document.getElementById("v1ActivityResults");
        const activityScannerBtn = document.getElementById("v1ActivityScanner");
        const activityTopologyBtn = document.getElementById("v1ActivityTopology");
        const activityGlobeBtn = document.getElementById("v1ActivityGlobe");
        const toolsMenuIpScanner = document.getElementById("v1ToolsMenuIpScanner");
        const toolsMenuTopology = document.getElementById("v1ToolsMenuTopology");
        const toolsMenuGlobe = document.getElementById("v1ToolsMenuGlobe");
        tabsTrack = document.getElementById("v1TabsTrack");
        tabsScrollLeftBtn = document.getElementById("v1TabsScrollLeft");
        tabsScrollRightBtn = document.getElementById("v1TabsScrollRight");
        const sidebarTabScanner = document.getElementById("v1SidebarTabScanner");
        const sidebarTabIpLibrary = document.getElementById("v1SidebarTabIpLibrary");
        const sidebarTabResults = document.getElementById("v1SidebarTabResults");
        const ipLibraryPanelTitle = document.getElementById("v1IpLibraryPanelTitle");
        const ipLibraryPanelNote = document.getElementById("v1IpLibraryPanelNote");
        const ipLibraryCountriesLabel = document.getElementById("v1IpLibraryCountriesLabel");
        const ipLibraryCountriesInput = document.getElementById("v1IpLibraryCountryCodes");
        const ipLibraryTopRangesLabel = document.getElementById("v1IpLibraryTopRangesLabel");
        const ipLibraryUpdateBtn = document.getElementById("v1IpLibraryUpdateBtn");
        const ipLibraryLoadBtn = document.getElementById("v1IpLibraryLoadBtn");
        const ipLibraryClearBtn = document.getElementById("v1IpLibraryClearBtn");
        const ipLibraryLastUpdateLabel = document.getElementById("v1IpLibraryLastUpdateLabel");
        const resultNavIp = document.getElementById("v1ResultNavIp");
        const resultNavIpLibrary = document.getElementById("v1ResultNavIpLibrary");
        const tabResultsIp = document.getElementById("v1TabTitleResultsIp");
        const tabTitleIpLibrary = document.getElementById("v1TabTitleIpLibrary");
        const tabTitlePresets = document.getElementById("v1TabTitlePresets");
        const tabTitleScanDefaults = document.getElementById("v1TabTitleScanDefaults");
        const tabTitleImportTool = document.getElementById("v1TabTitleImportTool");
        const tabTitleLanguageManager = document.getElementById("v1TabTitleLanguageManager");
        const tabTitleAbout = document.getElementById("v1TabTitleAbout");
        const tabTitleLicense = document.getElementById("v1TabTitleLicense");
        const tabTitleTopology = document.getElementById("v1TabTitleTopology");
        const tabTitleGlobe = document.getElementById("v1TabTitleGlobe");
        const terminalTab = document.getElementById("v1TerminalTab");
        const consoleTab = document.getElementById("v1ConsoleTab");
        const assistantMenuLabel = document.querySelector('[data-menu-action="assistant"] span:first-child');
        const aboutMenuLabel = document.querySelector('[data-menu-action="about"] span:first-child');
        const licenseMenuLabel = document.querySelector('[data-menu-action="license"] span:first-child');
        const resetMemoryButton = document.querySelector('[data-menu-action="reset-memory"]');
        const autoArrangeToggle = document.getElementById("v1AutoArrangeToggle");
        const autoArrangeToggleWrap = autoArrangeToggle ? autoArrangeToggle.closest(".v1-menubar-toggle") : null;
        const clippyClose = document.getElementById("v1ClippyClose");

        if (fileTrigger) fileTrigger.textContent = tr("menuFile");
        if (optionsTrigger) optionsTrigger.textContent = tr("menuOptions");
        if (toolsTrigger) toolsTrigger.textContent = tr("menuTools");
        if (helpTrigger) helpTrigger.textContent = tr("menuHelp");
        if (explorerHead) explorerHead.textContent = tr("ipScanner");
        if (assistantHead) assistantHead.textContent = tr("assistant");
        if (extTitle) extTitle.textContent = tr("extManagerTitle");
        if (extManifestLabel) extManifestLabel.textContent = tr("extManifestLabel");
        if (extManifest) extManifest.setAttribute("placeholder", tr("extManifestPlaceholder"));
        if (langCodeLabel) langCodeLabel.textContent = tr("langCodeLabel");
        if (langCode) langCode.setAttribute("placeholder", tr("langCodePlaceholder"));
        if (langDictLabel) langDictLabel.textContent = tr("langDictLabel");
        if (langDict) langDict.setAttribute("placeholder", tr("langDictPlaceholder"));
        if (extUninstallLabel) extUninstallLabel.textContent = tr("extUninstallLabel");
        if (extUninstallId) extUninstallId.setAttribute("placeholder", tr("extUninstallPlaceholder"));
        if (extInstallBtn) extInstallBtn.textContent = tr("extInstallBtn");
        if (extListBtn) extListBtn.textContent = tr("extListBtn");
        if (extUninstallBtn) extUninstallBtn.textContent = tr("extUninstallBtn");
        if (langAddBtn) langAddBtn.textContent = tr("langAddBtn");
        if (langActivateBtn) langActivateBtn.textContent = tr("langActivateBtn");
        if (langListBtn) langListBtn.textContent = tr("langListBtn");
        if (extCloseBtn) extCloseBtn.textContent = tr("extCloseBtn");
        if (extClose) extClose.setAttribute("aria-label", tr("extCloseBtn"));

        if (activityResultsBtn) {
          activityResultsBtn.setAttribute("title", tr("resultsBrowser"));
          activityResultsBtn.setAttribute("aria-label", tr("resultsBrowser"));
        }
        if (activityScannerBtn) {
          activityScannerBtn.setAttribute("title", tr("ipScanner"));
          activityScannerBtn.setAttribute("aria-label", tr("ipScanner"));
        }
        if (activityTopologyBtn) {
          activityTopologyBtn.setAttribute("title", tr("toolTitle_topology"));
          activityTopologyBtn.setAttribute("aria-label", tr("toolTitle_topology"));
        }
        if (activityGlobeBtn) {
          activityGlobeBtn.setAttribute("title", tr("toolTitle_globe"));
          activityGlobeBtn.setAttribute("aria-label", tr("toolTitle_globe"));
        }
        if (tabsScrollLeftBtn) {
          tabsScrollLeftBtn.setAttribute("title", tr("tabScrollLeft"));
          tabsScrollLeftBtn.setAttribute("aria-label", tr("tabScrollLeft"));
        }
        if (tabsScrollRightBtn) {
          tabsScrollRightBtn.setAttribute("title", tr("tabScrollRight"));
          tabsScrollRightBtn.setAttribute("aria-label", tr("tabScrollRight"));
        }
        if (toolsMenuIpScanner) toolsMenuIpScanner.textContent = tr("ipScanner");
        if (toolsMenuTopology) toolsMenuTopology.textContent = tr("toolTitle_topology");
        if (toolsMenuGlobe) toolsMenuGlobe.textContent = tr("toolTitle_globe");
        if (sidebarTabScanner) sidebarTabScanner.textContent = tr("ipScanner");
        if (sidebarTabIpLibrary) sidebarTabIpLibrary.textContent = tr("ipLibraryTabTitle");
        if (sidebarTabResults) sidebarTabResults.textContent = tr("resultsSidebarTitle");
        if (ipLibraryPanelTitle) ipLibraryPanelTitle.textContent = tr("ipLibraryTitle");
        if (ipLibraryCountriesInput) ipLibraryCountriesInput.setAttribute("placeholder", "pl,cn,ru,us,de,fr,gb,jp,kr,br,in,au,nl,ua,cz,se,no,fi,tr,ir,sa,za,ar,mx,ca,it,es");
        if (ipLibraryTopRangesLabel) ipLibraryTopRangesLabel.textContent = tr("ipLibraryTopRangesLabel");
        if (ipLibraryUpdateBtn) ipLibraryUpdateBtn.textContent = tr("ipLibraryUpdateBtn");
        if (ipLibraryLoadBtn) ipLibraryLoadBtn.textContent = tr("ipLibraryLoadBtn");
        if (ipLibraryClearBtn) ipLibraryClearBtn.textContent = tr("ipLibraryClearBtn");
        if (ipLibraryLastUpdateLabel) ipLibraryLastUpdateLabel.textContent = tr("ipLibraryLastUpdateLabel");
        document.querySelectorAll("[data-sidebar-tab-close]").forEach((el) => {
          el.setAttribute("aria-label", tr("tabCloseAria"));
          el.setAttribute("title", tr("tabCloseAria"));
        });
        if (resultNavIp) resultNavIp.textContent = "🖥 " + tr("resultsIp");
        if (resultNavIpLibrary) resultNavIpLibrary.textContent = "🗂 " + tr("ipLibraryTabTitle");
        if (tabResultsIp) tabResultsIp.textContent = tr("tabResultsIp");
        if (tabTitleIpLibrary) tabTitleIpLibrary.textContent = tr("ipLibraryTabTitle");
        if (tabTitlePresets) tabTitlePresets.textContent = tr("tabPresetsTitle");
        if (tabTitleScanDefaults) tabTitleScanDefaults.textContent = tr("tabScanDefaultsTitle");
        if (tabTitleImportTool) tabTitleImportTool.textContent = tr("importToolTitle");
        if (tabTitleLanguageManager) tabTitleLanguageManager.textContent = tr("langManagerTitle");
        if (tabTitleAbout) tabTitleAbout.textContent = tr("tabAboutTitle");
        if (tabTitleLicense) tabTitleLicense.textContent = tr("tabLicenseTitle");
        if (tabTitleTopology) tabTitleTopology.textContent = tr("toolTitle_topology");
        if (tabTitleGlobe) tabTitleGlobe.textContent = tr("toolTitle_globe");
        if (terminalTab) terminalTab.textContent = tr("terminalTab");
        if (consoleTab) consoleTab.textContent = tr("consoleTab");
        if (aboutMenuLabel) aboutMenuLabel.textContent = tr("helpAboutTitle");
        if (licenseMenuLabel) licenseMenuLabel.textContent = tr("helpLicenseTitle");
        if (assistantMenuLabel) assistantMenuLabel.textContent = "📎 " + tr("assistant");
        if (autoArrangeToggleWrap) {
          autoArrangeToggleWrap.setAttribute("title", tr("autoArrangeOnUndockTitle"));
          autoArrangeToggleWrap.setAttribute("aria-label", tr("autoArrangeOnUndockTitle"));
        }
        if (resetMemoryButton) {
          resetMemoryButton.setAttribute("title", tr("devFullResetButtonTitle"));
          resetMemoryButton.setAttribute("aria-label", tr("devFullResetButtonTitle"));
        }
        if (autoArrangeToggle) {
          autoArrangeToggle.setAttribute("title", tr("autoArrangeOnUndockTitle"));
          autoArrangeToggle.setAttribute("aria-label", tr("autoArrangeOnUndockTitle"));
        }
        if (clippyClose) clippyClose.setAttribute("aria-label", tr("clippyCloseAria"));
        if (scannerSidebarRuntime && scannerSidebarRuntime.applyStaticTranslations) {
          scannerSidebarRuntime.applyStaticTranslations();
        }
        if (powerShellConsoleRuntime && powerShellConsoleRuntime.applyStaticTranslations) {
          powerShellConsoleRuntime.applyStaticTranslations();
        }
      }

      function refreshLanguageUi() {
        applyStaticTranslations();
        if (setTooltips) setTooltips();
        if (refreshActiveUI) refreshActiveUI();
        if (typeof syncLanguageManagerPanel === "function") syncLanguageManagerPanel();
        requestAnimationFrame(function () {
          if (typeof refreshCustomScrollbars === "function") refreshCustomScrollbars();
        });
      }

      window.NetReconNewUI = window.NetReconNewUI || {};
      window.NetReconNewUI.refreshLanguageUi = refreshLanguageUi;
      window.NetReconNewUI.syncExtensionToolUi = function () {
        if (typeof syncExtensionToolUi === "function") syncExtensionToolUi();
      };

      // =========================
      // 1) Tool metadata + routing
      // =========================
      const uiDefinitions = core.uiDefinitions || {
        menuGroups: {},
        menuActions: {},
        panelDefinitions: {},
      };
      const appLinks = uiDefinitions.appLinks || {};

      const baseToolInfo = core.toolCatalog || {
        "scan-runner": {
          title: "Scan Runner",
          text: "Zakres IP, port presets, rownolegly probing i zapis wynikow.",
          points: ["IP range + presets", "Concurrency control", "Export/import results"]
        }
      };

      const fallbackActionMap = {
        "save-session": "Save session (mock)",
        "load-session": "Load session (mock)",
        "close-session": "Close session (mock)",
        "import-another-session": "Import another session data (mock)",
        exit: "Exit (mock)",
        countries: "Country IP Library",
        presets: "Port Presets (mock)",
        defaults: "Default Scan Values (mock)",
        language: "Language manager",
        customization: "Customization (extensions)",
        versions: "Versions (mock)",
        download: "Download (mock)",
        about: "About (mock)",
        license: "License",
        assistant: "Assistant",
        "window-min": "Window minimize",
        "window-max": "Window maximize",
        "window-fullscreen": "Window fullscreen",
        "auto-arrange-windows": "Auto Arrange windows",
        "window-close": "Window close"
      };

      const baseActionMap = Object.keys(fallbackActionMap).reduce((acc, actionKey) => {
        const def = uiDefinitions.menuActions && uiDefinitions.menuActions[actionKey];
        acc[actionKey] = def && def.label ? def.label : fallbackActionMap[actionKey];
        return acc;
      }, {});

      const extensionHost = core.extensions && core.extensions.createExtensionHost
        ? core.extensions.createExtensionHost({
            baseTools: baseToolInfo,
            baseMenuActions: baseActionMap,
            onResetLanguages: function () {
              if (core.i18n && core.i18n.resetLanguages) {
                core.i18n.resetLanguages();
              }
            },
            onLanguageContribution: function (langCode, dict) {
              if (i18n && i18n.addLanguage) {
                i18n.addLanguage(langCode, dict, false);
              }
            },
          })
        : null;

      if (extensionHost && extensionHost.loadFromStorage) {
        extensionHost.loadFromStorage();
      }

      function getToolInfoMap() {
        return extensionHost ? extensionHost.getTools() : baseToolInfo;
      }

      function getActionMap() {
        return extensionHost ? extensionHost.getMenuActions() : baseActionMap;
      }

      function extensionToolEntries() {
        const toolMap = getToolInfoMap();
        return Object.keys(toolMap)
          .filter((toolKey) => !Object.prototype.hasOwnProperty.call(baseToolInfo, toolKey))
          .map((toolKey) => {
            const info = toolMap[toolKey] || {};
            const ui = info.ui && typeof info.ui === "object" ? info.ui : {};
            return {
              key: toolKey,
              title: info.title || toolKey,
              icon: info.icon || "🧩",
              ui,
            };
          });
      }

      function clearDynamicExtensionUi() {
        document.querySelectorAll('[data-dynamic-extension="1"]').forEach((el) => {
          el.remove();
        });
      }

      function syncExtensionToolUi() {
        clearDynamicExtensionUi();

        const entries = extensionToolEntries();
        if (!entries.length) {
          if (typeof setTooltips === "function") setTooltips();
          return;
        }

        const toolsDropdown = document.querySelector('[data-menu="tools"] .v1-menu-dropdown');
        const activityBar = document.querySelector('.v1-activity');
        const activitySpacer = activityBar ? activityBar.querySelector('.v1-activity-spacer') : null;
        const scannerToolList = document.querySelector('.v1-sidebar [data-sidebar-view="scanner"] .v1-tool-list');
        const tabsBar = document.querySelector('.v1-tabs');

        entries.forEach((entry) => {
          if (tabsBar) {
            const tab = document.createElement("button");
            tab.className = "v1-tab tab-closed";
            tab.setAttribute("data-tool", entry.key);
            tab.setAttribute("type", "button");
            tab.setAttribute("hidden", "hidden");
            tab.setAttribute("data-dynamic-extension", "1");

            const icon = document.createElement("span");
            icon.className = "v1-tab-icon";
            icon.setAttribute("aria-hidden", "true");
            icon.textContent = entry.icon;

            const title = document.createElement("span");
            title.className = "v1-tab-title";
            title.textContent = entry.title;

            const close = document.createElement("span");
            close.className = "v1-tab-close";
            close.setAttribute("data-tab-close", "true");
            close.setAttribute("role", "button");
            close.setAttribute("aria-label", tr("tabCloseAria"));
            close.setAttribute("tabindex", "-1");
            close.textContent = "×";

            tab.appendChild(icon);
            tab.appendChild(title);
            tab.appendChild(close);
            tabsBar.appendChild(tab);
          }

          if (scannerToolList) {
            const li = document.createElement("li");
            li.className = "v1-extension-tool-item";
            li.setAttribute("data-tool", entry.key);
            li.setAttribute("data-dynamic-extension", "1");
            li.textContent = entry.icon + " " + entry.title;
            scannerToolList.appendChild(li);
          }

          if (toolsDropdown && entry.ui.showInToolsMenu !== false) {
            const btn = document.createElement("button");
            btn.className = "v1-menu-dd-item";
            btn.setAttribute("data-tool", entry.key);
            btn.setAttribute("data-dynamic-extension", "1");

            const left = document.createElement("span");
            left.textContent = entry.icon + " " + entry.title;
            const right = document.createElement("span");
            right.className = "shortcut";

            btn.appendChild(left);
            btn.appendChild(right);
            btn.addEventListener("click", function () {
              document.querySelectorAll(".v1-menu-group.open").forEach(function (group) {
                group.classList.remove("open");
              });
            });
            toolsDropdown.appendChild(btn);
          }

          if (activityBar && activitySpacer && entry.ui.showInActivityBar) {
            const btn = document.createElement("button");
            btn.setAttribute("data-tool", entry.key);
            btn.setAttribute("data-dynamic-extension", "1");
            btn.setAttribute("title", entry.title);
            btn.setAttribute("aria-label", entry.title);
            btn.textContent = entry.icon;
            activityBar.insertBefore(btn, activitySpacer);
          }
        });

        if (typeof setTooltips === "function") setTooltips();
        if (panelsRuntime && panelsRuntime.initWorkbenchTabs) {
          panelsRuntime.initWorkbenchTabs();
        }
        if (typeof refreshCustomScrollbars === "function") {
          requestAnimationFrame(() => refreshCustomScrollbars());
        }
      }

      function actionDefinition(action) {
        return (uiDefinitions.menuActions && uiDefinitions.menuActions[action]) || null;
      }

      function applyMenuAndPanelDefinitions() {
        Object.keys(uiDefinitions.menuGroups || {}).forEach((menuKey) => {
          const trigger = document.querySelector('[data-menu="' + menuKey + '"] .v1-menu-trigger');
          const def = uiDefinitions.menuGroups[menuKey];
          if (!trigger || !def || !def.purpose) return;
          trigger.setAttribute("title", def.purpose);
          trigger.setAttribute("aria-label", trigger.textContent + " - " + def.purpose);
        });

        Object.keys(uiDefinitions.menuActions || {}).forEach((actionKey) => {
          const def = uiDefinitions.menuActions[actionKey];
          if (!def || !def.purpose) return;
          document.querySelectorAll('[data-menu-action="' + actionKey + '"]').forEach((item) => {
            item.setAttribute("title", def.purpose);
            item.setAttribute("aria-label", def.purpose);
          });
        });

        Object.keys(uiDefinitions.panelDefinitions || {}).forEach((panelKey) => {
          const def = uiDefinitions.panelDefinitions[panelKey];
          if (!def || !def.selector || !def.purpose) return;
          const panel = document.querySelector(def.selector);
          if (!panel) return;
          panel.setAttribute("title", def.purpose);
          panel.setAttribute("aria-label", def.purpose);
        });
      }

      function extModalElements() {
        return {
          root: document.getElementById("v1ExtModal"),
          manifest: document.getElementById("v1ExtManifest"),
          uninstallId: document.getElementById("v1ExtUninstallId"),
          langCode: document.getElementById("v1LangCode"),
          langDict: document.getElementById("v1LangDict"),
          output: document.getElementById("v1ExtOutput"),
          installBtn: document.getElementById("v1ExtInstallBtn"),
          listBtn: document.getElementById("v1ExtListBtn"),
          uninstallBtn: document.getElementById("v1ExtUninstallBtn"),
          langAddBtn: document.getElementById("v1LangAddBtn"),
          langActivateBtn: document.getElementById("v1LangActivateBtn"),
          langListBtn: document.getElementById("v1LangListBtn"),
          closeBtn: document.getElementById("v1ExtCloseBtn"),
          closeIconBtn: document.getElementById("v1ExtClose"),
        };
      }

      function defaultManifestText() {
        return "{\n  \"id\": \"com.example.demo\",\n  \"name\": \"Demo Extension\",\n  \"version\": \"0.1.0\",\n  \"contributions\": {\n    \"tools\": {},\n    \"menuActions\": {}\n  }\n}";
      }

      function isExtModalOpen() {
        const modal = document.getElementById("v1ExtModal");
        return !!modal && !modal.hasAttribute("hidden");
      }

      function writeExtOutput(text) {
        const els = extModalElements();
        if (els.output) {
          els.output.textContent = text;
          els.output.scrollTop = 0;
        }
      }

      function closeExtensionManager() {
        const els = extModalElements();
        if (els.root) els.root.setAttribute("hidden", "hidden");
      }

      function openExtensionManager(section) {
        if (!extensionHost) {
          setStatusLine(tr("menuPrefix") + ": " + tr("extInstallFail") + " (host unavailable)");
          return;
        }

        const els = extModalElements();
        if (!els.root) return;

        if (els.manifest && !els.manifest.value.trim()) {
          els.manifest.value = defaultManifestText();
        }

        if (els.langDict && !els.langDict.value.trim()) {
          els.langDict.value = "{\n  \"menuFile\": \"Datei\",\n  \"menuOptions\": \"Optionen\",\n  \"menuTools\": \"Werkzeuge\",\n  \"menuHelp\": \"Hilfe\"\n}";
        }

        els.root.removeAttribute("hidden");
        writeExtOutput(tr("extManagerReady"));
        if (section === "languages" && els.langCode) {
          els.langCode.focus();
          return;
        }
        if (els.manifest) els.manifest.focus();
      }

      function openLanguageManager() {
        switchTool("language-manager");
      }

      function languageManagerElements() {
        return {
          code: document.getElementById("v1LangTabCode"),
          dict: document.getElementById("v1LangTabDict"),
          output: document.getElementById("v1LangTabOutput"),
        };
      }

      function languageManagerDefaultDict() {
        return "{\n  \"menuFile\": \"Datei\",\n  \"menuOptions\": \"Optionen\",\n  \"menuTools\": \"Werkzeuge\",\n  \"menuHelp\": \"Hilfe\"\n}";
      }

      function languageManagerWrite(text) {
        const els = languageManagerElements();
        if (els.output) {
          els.output.textContent = text;
          els.output.scrollTop = 0;
        }
      }

      function syncLanguageManagerPanel() {
        if (activeTool !== "language-manager") return;
        const els = languageManagerElements();
        if (els.code && !els.code.value.trim()) {
          els.code.value = i18n.getLang ? i18n.getLang() : "en";
        }
        if (els.dict && !els.dict.value.trim()) {
          els.dict.value = languageManagerDefaultDict();
        }
        if (els.output && !els.output.textContent.trim()) {
          const langs = i18n.listLanguages ? i18n.listLanguages() : [];
          languageManagerWrite(langs.length ? langs.join("\n") : tr("langListHeader") + ": -");
        }
      }

      function initLanguageManagerUi() {}

      function runMenuAction(action) {
        const actionMap = getActionMap();
        const label = action && actionMap[action] ? actionMap[action] : action;
        const def = actionDefinition(action);
        const behavior = def && def.behavior ? def.behavior : "status";

        async function runNativeWindowAction(kind) {
          if (platform && typeof platform.windowAction === "function") {
            try {
              return await platform.windowAction(kind);
            } catch (_) {
              return false;
            }
          }

          return false;
        }

        async function runWebFullscreenToggle() {
          try {
            if (document.fullscreenElement && document.exitFullscreen) {
              await document.exitFullscreen();
              return true;
            }
            const root = document.documentElement;
            if (root && root.requestFullscreen) {
              await root.requestFullscreen();
              return true;
            }
          } catch (_) {
            return false;
          }
          return false;
        }

        if (behavior === "open-extension-manager") {
          openExtensionManager("extensions");
          return;
        }

        if (behavior === "open-language-manager") {
          openLanguageManager();
          return;
        }

        if (behavior.indexOf("switch-tool:") === 0) {
          const tool = behavior.slice("switch-tool:".length);
          if (tool) switchTool(tool);
          setStatusLine(tr("menuPrefix") + ": " + label);
          return;
        }

        if (behavior === "window-minimize") {
          runNativeWindowAction("minimize").then(function (handled) {
            setStatusLine(
              tr("menuPrefix") + ": " + label + (handled ? "" : " (desktop only)")
            );
          });
          return;
        }

        if (behavior === "window-maximize") {
          runNativeWindowAction("maximize").then(function (handled) {
            setStatusLine(
              tr("menuPrefix") + ": " + label + (handled ? "" : " (desktop only)")
            );
          });
          return;
        }

        if (behavior === "window-close") {
          runNativeWindowAction("close").then(function (handled) {
            if (!handled) {
              try { window.close(); } catch (_) {}
            }
            setStatusLine(tr("menuPrefix") + ": " + label);
          });
          return;
        }

        if (behavior === "window-fullscreen") {
          runNativeWindowAction("fullscreen").then(function (handled) {
            if (handled) {
              setStatusLine(tr("menuPrefix") + ": " + label);
              return;
            }
            runWebFullscreenToggle().then(function () {
              setStatusLine(tr("menuPrefix") + ": " + label);
            });
          });
          return;
        }

        setStatusLine(tr("menuPrefix") + ": " + label);
      }

      function installExtensionFromModal() {
        const els = extModalElements();
        if (!els.manifest) return;

        let manifest = null;
        try {
          manifest = JSON.parse(els.manifest.value || "{}");
        } catch (_) {
          writeExtOutput(tr("extInvalidJson"));
          setStatusLine(tr("menuPrefix") + ": " + tr("extInvalidJson"));
          return;
        }

        const result = extensionHost.installExtension(manifest);
        if (!result.ok) {
          writeExtOutput(tr("extInstallFail") + "\n" + result.error);
          setStatusLine(tr("menuPrefix") + ": " + tr("extInstallFail") + " - " + result.error);
          return;
        }

        setTooltips();
        refreshActiveUI();
        writeExtOutput(tr("extInstallOk") + "\n" + result.manifest.id + "@" + result.manifest.version);
        setStatusLine(tr("menuPrefix") + ": " + tr("extInstallOk") + " - " + result.manifest.id);
      }

      function listExtensionsFromModal() {
        const list = extensionHost.listExtensions();
        if (!list.length) {
          writeExtOutput(tr("extListEmpty"));
          setStatusLine(tr("menuPrefix") + ": " + tr("extListEmpty"));
          return;
        }

        const lines = [tr("extListHeader") + ":"];
        list.forEach((item) => {
          lines.push("- " + item.id + " @ " + item.version + " (" + item.name + ")");
        });

        writeExtOutput(lines.join("\n"));
        setStatusLine(tr("menuPrefix") + ": " + tr("extListHeader") + " - " + list.length);
      }

      function uninstallExtensionFromModal() {
        const els = extModalElements();
        const id = els.uninstallId ? (els.uninstallId.value || "").trim() : "";
        if (!id) {
          writeExtOutput(tr("extUninstallPrompt"));
          return;
        }

        const result = extensionHost.uninstallExtension(id);
        if (!result.ok) {
          writeExtOutput(tr("extUninstallFail") + "\n" + result.error);
          setStatusLine(tr("menuPrefix") + ": " + tr("extUninstallFail") + " - " + result.error);
          return;
        }

        if (!getToolInfoMap()[activeTool]) {
          switchTool("scan-runner");
        } else {
          setTooltips();
          refreshActiveUI();
        }

        writeExtOutput(tr("extUninstallOk") + "\n" + result.id);
        setStatusLine(tr("menuPrefix") + ": " + tr("extUninstallOk") + " - " + result.id);
      }

      function addLanguageFromModal() {
        const els = extModalElements();
        if (!els.langCode || !els.langDict || !i18n || !i18n.addLanguage) return;

        const code = (els.langCode.value || "").trim();
        if (!code) {
          writeExtOutput(tr("langInvalidCode"));
          setStatusLine(tr("menuPrefix") + ": " + tr("langAddFail") + " - " + tr("langInvalidCode"));
          return;
        }

        let dict = null;
        try {
          dict = JSON.parse(els.langDict.value || "{}");
        } catch (_) {
          writeExtOutput(tr("langInvalidDict"));
          setStatusLine(tr("menuPrefix") + ": " + tr("langAddFail") + " - " + tr("langInvalidDict"));
          return;
        }

        const result = i18n.addLanguage(code, dict);
        if (!result.ok) {
          writeExtOutput(tr("langAddFail") + "\n" + result.error);
          setStatusLine(tr("menuPrefix") + ": " + tr("langAddFail") + " - " + result.error);
          return;
        }

        writeExtOutput(tr("langAddOk") + "\n" + result.code);
        setStatusLine(tr("menuPrefix") + ": " + tr("langAddOk") + " - " + result.code);
      }

      function activateLanguageFromModal() {
        const els = extModalElements();
        if (!els.langCode || !i18n || !i18n.setLang) return;

        const code = (els.langCode.value || "").trim();
        if (!code) {
          writeExtOutput(tr("langInvalidCode"));
          return;
        }

        const before = i18n.getLang ? i18n.getLang() : "";
        const after = i18n.setLang(code);
        if (before === after && code.toLowerCase() !== after.toLowerCase()) {
          writeExtOutput(tr("langActivateFail") + "\n" + code);
          setStatusLine(tr("menuPrefix") + ": " + tr("langActivateFail") + " - " + code);
          return;
        }

        applyStaticTranslations();
        if (clippyRuntime && clippyRuntime.setLanguage) {
          clippyRuntime.setLanguage(after);
        }
        setTooltips();
        refreshActiveUI();
        writeExtOutput(tr("langActivateOk") + "\n" + after);
        setStatusLine(tr("menuPrefix") + ": " + tr("langActivateOk") + " - " + after);
      }

      function listLanguagesFromModal() {
        const langs = i18n && i18n.listLanguages ? i18n.listLanguages() : [];
        if (!langs.length) {
          writeExtOutput(tr("langListHeader") + ": -");
          return;
        }

        writeExtOutput(tr("langListHeader") + ":\n- " + langs.join("\n- "));
      }

      function initExtensionManagerUi() {
        const els = extModalElements();
        if (!els.root) return;

        if (els.installBtn) els.installBtn.addEventListener("click", installExtensionFromModal);
        if (els.listBtn) els.listBtn.addEventListener("click", listExtensionsFromModal);
        if (els.uninstallBtn) els.uninstallBtn.addEventListener("click", uninstallExtensionFromModal);
        if (els.langAddBtn) els.langAddBtn.addEventListener("click", addLanguageFromModal);
        if (els.langActivateBtn) els.langActivateBtn.addEventListener("click", activateLanguageFromModal);
        if (els.langListBtn) els.langListBtn.addEventListener("click", listLanguagesFromModal);
        if (els.closeBtn) els.closeBtn.addEventListener("click", closeExtensionManager);
        if (els.closeIconBtn) els.closeIconBtn.addEventListener("click", closeExtensionManager);

        els.root.addEventListener("click", (event) => {
          if (event.target === els.root) closeExtensionManager();
        });
      }

      let activeTool = store ? store.getState().activeTool : "scan-runner";

      function infoFor(tool) {
        const tools = getToolInfoMap();
        const info = tools[tool] || tools["scan-runner"] || baseToolInfo["scan-runner"];
        if (tool === "results-ip") {
          return Object.assign({}, info, {
            title: tr("toolResultsIpTitle"),
            text: tr("toolResultsIpText"),
          });
        }
        return info;
      }

      function setTooltips() {
        document.querySelectorAll("[data-tool]").forEach((el) => {
          const tool = el.getAttribute("data-tool");
          if (!tool) return;
          const info = infoFor(tool);
          const tip = info.title + " - " + info.text;
          el.setAttribute("title", tip);
          el.setAttribute("aria-label", tip);
        });

        document.querySelectorAll(".v1-tab").forEach((el) => {
          const txt = (el.textContent || "").trim();
          if (!txt) return;
          if (!el.getAttribute("title")) {
            el.setAttribute("title", tr("tabPrefix") + ": " + txt);
          }
        });
      }

      function buildDetailHtml(tool) {
        const info = infoFor(tool);
        const points = info.points.map((p) => "<li>" + p + "</li>").join("");
        return "<h4>" + info.title + "</h4><div>" + info.text + "</div><ul>" + points + "</ul>";
      }

      function isElementFullyVisibleWithinContainer(element, container) {
        if (!element || !container) return true;
        const elementRect = element.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        return elementRect.left >= containerRect.left && elementRect.right <= containerRect.right;
      }

      function scrollTabTrackToElement(element) {
        if (!element || !tabsTrack) return;
        const maxScrollLeft = Math.max(0, tabsTrack.scrollWidth - tabsTrack.clientWidth);
        const nextScrollLeft = Math.max(0, Math.min(
          maxScrollLeft,
          Math.round(element.offsetLeft - (tabsTrack.clientWidth - element.offsetWidth) / 2)
        ));
        if (Math.abs(tabsTrack.scrollLeft - nextScrollLeft) < 2) return;
        tabsTrack.scrollLeft = nextScrollLeft;
      }

      function scheduleScrollActiveTabIntoView() {
        if (!tabsTrack) return;
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(function () {
            const activeTab = tabsTrack.querySelector('.v1-tab.active');
            if (activeTab) {
              scrollTabTrackToElement(activeTab);
            }
          });
        });
      }

      function refreshActiveUI() {
        document.querySelectorAll("[data-tool]").forEach((el) => {
          const isActive = el.getAttribute("data-tool") === activeTool;
          el.classList.toggle("active", isActive);
          if (el.tagName === "BUTTON") {
            el.setAttribute("aria-pressed", isActive ? "true" : "false");
          }
        });

        if (tabsTrack) {
          const activeTab = tabsTrack.querySelector('.v1-tab.active');
          if (activeTab && !isElementFullyVisibleWithinContainer(activeTab, tabsTrack)) {
            scheduleScrollActiveTabIntoView();
          }

          if (tabsScrollLeftBtn && tabsScrollRightBtn) {
            const maxScrollLeft = Math.max(0, tabsTrack.scrollWidth - tabsTrack.clientWidth);
            const currentScrollLeft = tabsTrack.scrollLeft;
            tabsScrollLeftBtn.disabled = currentScrollLeft <= 1;
            tabsScrollRightBtn.disabled = currentScrollLeft >= maxScrollLeft - 1;
          }
        }

        const v1Title = document.getElementById("v1ToolTitle");
        const v1Detail = document.getElementById("v1ToolDetail");
        const v1StatusLine = document.getElementById("v1StatusLine");
        const v1StatusRight = document.getElementById("v1StatusRight");
        const info = infoFor(activeTool);

        if (v1Title) v1Title.textContent = info.title;
        if (v1Detail) v1Detail.innerHTML = buildDetailHtml(activeTool);
        if (v1StatusLine) v1StatusLine.textContent = tr("toolRoute") + ": " + activeTool;
        if (v1StatusRight) v1StatusRight.textContent = tr("active") + ": " + activeTool;
      }

      function switchTool(tool) {
        activeTool = tool;
        if (store) store.setState({ activeTool: tool });
        refreshActiveUI();
        scheduleScrollActiveTabIntoView();
      }

      function initCenterTabsScrollButtons() {
        if (!tabsTrack || !tabsScrollLeftBtn || !tabsScrollRightBtn) return;

        function scrollTabsBy(direction) {
          tabsTrack.scrollBy({ left: direction * 260, behavior: "smooth" });
          requestAnimationFrame(refreshActiveUI);
        }

        [
          { btn: tabsScrollLeftBtn, direction: -1 },
          { btn: tabsScrollRightBtn, direction: 1 },
        ].forEach(function (entry) {
          if (!entry.btn || entry.btn.dataset.bound === "1") return;
          entry.btn.dataset.bound = "1";
          entry.btn.addEventListener("click", function () {
            scrollTabsBy(entry.direction);
          });
        });

        if (tabsTrack.dataset.bound !== "1") {
          tabsTrack.dataset.bound = "1";
          tabsTrack.addEventListener("scroll", function () {
            refreshActiveUI();
          }, { passive: true });
          tabsTrack.addEventListener("click", function (event) {
            const tab = event.target && typeof event.target.closest === "function"
              ? event.target.closest(".v1-tab")
              : null;
            if (!tab || tab.classList.contains("tab-closed") || tab.classList.contains("tab-detached-hidden")) return;
            if (event.target && typeof event.target.closest === "function") {
              if (event.target.closest("[data-tab-close]") || event.target.closest("[data-tab-popout]")) return;
            }

            const tool = tab.getAttribute("data-tool") || "";
            if (!tool) return;

            if (tool !== activeTool) {
              switchTool(tool);
              return;
            }

            scheduleScrollActiveTabIntoView();
          });
        }

        window.addEventListener("resize", function () {
          refreshActiveUI();
        });
      }

      // =========================
      // Activity bar + sidebar views
      // =========================
      function switchSidebarView(view) {
        if (!navigationRuntime || !navigationRuntime.switchSidebarView) return;
        navigationRuntime.switchSidebarView(view);
      }

      // =========================
      // 2) Top menu behavior
      // =========================
      function initMenuBar() {
        const menubar = document.getElementById("v1Menubar");
        if (!menubar) return;

        const groups = Array.from(menubar.querySelectorAll(".v1-menu-group"));

        function closeAllMenus() {
          groups.forEach((group) => group.classList.remove("open"));
        }

        function openMenu(group) {
          closeAllMenus();
          group.classList.add("open");
        }

        groups.forEach((group) => {
          const trigger = group.querySelector(".v1-menu-trigger");
          if (!trigger) return;

          trigger.addEventListener("click", (event) => {
            event.stopPropagation();
            const willOpen = !group.classList.contains("open");
            closeAllMenus();
            if (willOpen) group.classList.add("open");
          });

          group.addEventListener("mouseenter", () => {
            const opened = groups.some((g) => g.classList.contains("open"));
            if (!opened) return;
            openMenu(group);
          });
        });

        document.addEventListener("click", (event) => {
          if (menubar.contains(event.target)) return;
          closeAllMenus();
        });

        document.addEventListener("keydown", (event) => {
          if (event.key === "Escape") closeAllMenus();
        });

        menubar.querySelectorAll(".v1-menu-dd-item").forEach((item) => {
          item.addEventListener("click", () => {
            closeAllMenus();
          });
        });
      }

      function initMenuActions() {
        document.querySelectorAll("[data-menu-action]").forEach((item) => {
          item.addEventListener("click", () => {
            const action = item.getAttribute("data-menu-action");
            if (!action) return;
            runMenuAction(action);
          });
        });
      }

      function initDisabledShortcuts() {
        document.addEventListener("keydown", (event) => {
          const key = (event.key || "").toLowerCase();
          const blockCtrl = event.ctrlKey && !event.altKey && !event.metaKey && (
            key === "s" || key === "l" || key === "w" || (event.shiftKey && key === "i")
          );
          const blockAltF4 = event.altKey && !event.ctrlKey && !event.metaKey && key === "f4";

          if (blockCtrl || blockAltF4) {
            event.preventDefault();
            event.stopPropagation();
          }
        }, true);
      }

      function setRangeInputs(fromIp, toIp) {
        if (!ipInputsRuntime || !ipInputsRuntime.setRangeInputs) return false;
        return ipInputsRuntime.setRangeInputs(fromIp, toIp);
      }

      function initSegmentedIpInputs() {
        if (!ipInputsRuntime || !ipInputsRuntime.initSegmentedIpInputs) return;
        ipInputsRuntime.initSegmentedIpInputs();
      }

      // =========================
      // 3) Splitter resizing
      // =========================
      function initResizableLayout() {
        const runtimes = window.NetReconNewUICore && window.NetReconNewUICore.newUiRuntimes
          ? window.NetReconNewUICore.newUiRuntimes
          : {};
        if (!runtimes.createLayoutRuntime) return;
        layoutRuntime = runtimes.createLayoutRuntime({
          tr: tr,
          platform: platform,
          refreshCustomScrollbars: function () {
            refreshCustomScrollbars();
          },
        });
        if (layoutRuntime && layoutRuntime.init) {
          layoutRuntime.init();
        }
      }

      // =========================
      // 4) Custom scrollbars
      // =========================
      let refreshCustomScrollbars = function () {};

      function initCustomScrollbars() {
        const runtimes = window.NetReconNewUICore && window.NetReconNewUICore.newUiRuntimes
          ? window.NetReconNewUICore.newUiRuntimes
          : {};
        if (!runtimes.createCustomScrollbarRuntime) return;
        customScrollbarRuntime = runtimes.createCustomScrollbarRuntime();
        const instance = customScrollbarRuntime && customScrollbarRuntime.init
          ? customScrollbarRuntime.init()
          : null;
        refreshCustomScrollbars = instance && instance.refresh
          ? instance.refresh
          : function () {};
      }

      // =========================
      // 5) Runtime delegation (incremental cleanup)
      // =========================
      const runtimeFactory = core.newUiRuntimes || {};

      const ipInputsRuntimeFactory = runtimeFactory.createIpInputsRuntime
        ? runtimeFactory.createIpInputsRuntime()
        : null;

      if (ipInputsRuntimeFactory && ipInputsRuntimeFactory.init) {
        ipInputsRuntime = ipInputsRuntimeFactory.init();
      }

      const panelsRuntime = runtimeFactory.createPanelsRuntime
        ? runtimeFactory.createPanelsRuntime({
            tr,
            platform,
            storageGet,
            storageSet,
            getToolInfoMap,
            versionsData: core.versionsData || [],
            store,
            extensionHost,
            setStatusLine,
            i18n,
            applyStaticTranslations,
            onAfterRender: function () {
              requestAnimationFrame(function () {
                refreshCustomScrollbars();
                syncLanguageManagerPanel();
              });
            },
            initialActiveTool: initialActiveTool,
          })
        : null;

      if (panelsRuntime) {
        setTooltips = panelsRuntime.setTooltips;
        refreshActiveUI = panelsRuntime.refreshActiveUI;
        switchTool = panelsRuntime.switchTool;
        if (panelsRuntime.initWorkbenchTabs) {
          panelsRuntime.initWorkbenchTabs();
        }
      }

      syncExtensionToolUi();

      const extensionManagerRuntime = runtimeFactory.createExtensionManagerRuntime
        ? runtimeFactory.createExtensionManagerRuntime({
            tr,
            extensionHost,
            i18n,
            applyStaticTranslations,
            setStatusLine,
            setTooltips,
            refreshActiveUI,
            switchTool,
            getActiveTool: panelsRuntime ? panelsRuntime.getActiveTool : function () { return activeTool; },
            hasTool: panelsRuntime ? panelsRuntime.hasTool : function (tool) { return !!getToolInfoMap()[tool]; },
          })
        : null;

      if (extensionManagerRuntime) {
        openExtensionManager = extensionManagerRuntime.open;
        closeExtensionManager = extensionManagerRuntime.close;
        isExtModalOpen = extensionManagerRuntime.isOpen;
        initExtensionManagerUi = extensionManagerRuntime.init;
      }

      const menuRuntime = runtimeFactory.createMenuRuntime
        ? runtimeFactory.createMenuRuntime({
            tr,
            platform,
            uiDefinitions,
            appLinks,
            getActionMap,
            setStatusLine,
            onOpenExtensionManager: openExtensionManager,
            onOpenLanguageManager: openLanguageManager,
            onSwitchTool: switchTool,
            onSwitchSidebarView: switchSidebarView,
            onToggleClippy: function () {
              if (clippyRuntime && clippyRuntime.toggle) {
                clippyRuntime.toggle();
              }
            },
          })
        : null;

      const clippyRuntimeFactory = runtimeFactory.createClippyRuntime
        ? runtimeFactory.createClippyRuntime({
            tr,
            setStatusLine,
            initialLang: i18n.getLang ? i18n.getLang() : "en",
          })
        : null;

      if (clippyRuntimeFactory && clippyRuntimeFactory.init) {
        clippyRuntime = clippyRuntimeFactory.init();
      }

      if (menuRuntime) {
        initMenuBar = menuRuntime.initMenuBar;
        initMenuActions = menuRuntime.initMenuActions;
        applyMenuAndPanelDefinitions = menuRuntime.applyMenuAndPanelDefinitions;
      }

      const navigationRuntimeFactory = runtimeFactory.createNavigationRuntime
        ? runtimeFactory.createNavigationRuntime({
            tr,
            platform,
            switchTool,
            setStatusLine,
            runMenuAction: (menuRuntime && menuRuntime.runMenuAction) ? menuRuntime.runMenuAction : runMenuAction,
            getScannerSidebarRuntime: function () { return scannerSidebarRuntime; },
          })
        : null;

      if (navigationRuntimeFactory && navigationRuntimeFactory.init) {
        navigationRuntime = navigationRuntimeFactory;
        navigationRuntime.init();
      }

      scannerSidebarRuntime = runtimeFactory.createScannerSidebarRuntime
        ? runtimeFactory.createScannerSidebarRuntime({
            tr,
            setStatusLine,
            setRangeInputs,
          })
        : null;

      const powerShellConsoleRuntimeFactory = runtimeFactory.createPowerShellConsoleRuntime
        ? runtimeFactory.createPowerShellConsoleRuntime({
            tr,
            platform,
            setStatusLine,
          })
        : null;

      applyStaticTranslations();
      applyMenuAndPanelDefinitions();
      initExtensionManagerUi();
      initLanguageManagerUi();
      setTooltips();
      initMenuBar();
      initMenuActions();
      initDisabledShortcuts();
      initSegmentedIpInputs();
      initCenterTabsScrollButtons();
      if (scannerSidebarRuntime && scannerSidebarRuntime.init) {
        scannerSidebarRuntime.init();
      }
      if (powerShellConsoleRuntimeFactory && powerShellConsoleRuntimeFactory.init) {
        powerShellConsoleRuntime = powerShellConsoleRuntimeFactory.init();
      }
      initResizableLayout();
      initCustomScrollbars();
      switchTool(initialActiveTool);
      const hasOpenSidebarTabs = !!document.querySelector('.v1-sidebar-tool-tab-wrap:not(.sidebar-tab-closed):not([hidden])');
      const initialSidebarView = (!initialActiveTool && !hasOpenSidebarTabs) ? "empty" : "scanner";
      switchSidebarView(initialSidebarView);

      function revealUi() {
        if (!document.body) return;
        document.body.style.visibility = "visible";
        document.body.setAttribute("data-v1-ready", "true");
      }

      function revealUiNextFrame() {
        requestAnimationFrame(revealUi);
      }

      if (document.fonts && document.fonts.ready) {
        Promise.race([
          document.fonts.ready,
          new Promise(function (resolve) { setTimeout(resolve, 220); })
        ]).then(revealUiNextFrame).catch(revealUiNextFrame);
      } else {
        revealUiNextFrame();
      }

      window.NetReconNewUI = window.NetReconNewUI || {};
      window.NetReconNewUI.extensions = extensionHost;
      window.NetReconNewUI.syncExtensionToolUi = syncExtensionToolUi;

      function openExternalUrl(url) {
        const safeUrl = String(url || "").trim();
        if (!/^https?:\/\//i.test(safeUrl)) return;

        if (platform && typeof platform.openExternalUrl === "function") {
          if (platform.openExternalUrl(safeUrl)) return;
        }

        try { window.open(safeUrl, "_blank", "noopener"); } catch (_) {}
      }

      document.addEventListener("click", function (event) {
        const link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
        if (!link) return;

        const href = String(link.getAttribute("href") || "").trim();
        if (!/^https?:\/\//i.test(href)) return;

        event.preventDefault();
        openExternalUrl(href);
      });

      document.addEventListener("click", () => {
        requestAnimationFrame(() => {
          refreshCustomScrollbars();
        });
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && isExtModalOpen()) {
          closeExtensionManager();
        }
      });

      window.addEventListener("netrecon:language-changed", refreshLanguageUi);

      // Collapsible sidebar sections
      document.querySelectorAll('.v1-section-header').forEach(function (header) {
        header.addEventListener('click', function (e) {
          if (e.target.closest('button, input, select, textarea, a')) return;
          header.closest('li').classList.toggle('v1-collapsed');
        });
      });
    })();
