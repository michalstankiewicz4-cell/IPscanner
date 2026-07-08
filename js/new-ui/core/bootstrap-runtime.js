(function () {
      // shell: this whole file is the app's composition root (wires every
      // runtime factory via DI) - fundamentally shell orchestration by
      // definition. Specific mixed spots (DOM refs/fallback data that are
      // ip-scanner-tool-specific) are labeled individually below rather than
      // splitting this file, per CONTRIBUTING 12a.
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
        if (!versions.length) return "v1.7.0";
        const first = versions[0] || {};
        return first.version ? String(first.version) : "v1.7.0";
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
      // Reassigned once panelsRuntime is created (below) to
      // panelsRuntime.setTooltips / a wrapper around panelsRuntime's
      // refreshActiveUI/switchTool. These no-op placeholders only exist so
      // the names are bound in scope for the handful of call sites that
      // execute before that reassignment runs.
      let setTooltips = function () {};
      let refreshActiveUI = function () {};
      let switchTool = function () {};
      // Same pattern: reassigned once menuRuntime/extensionManagerRuntime are
      // created (below) to the real implementations. Their original local
      // bodies (and the extension-manager-modal helper cluster that only
      // those bodies called) were dead code - found during shell/tools
      // delimiting (CONTRIBUTING 12a) and removed here, since they matched
      // the exact already-fixed setTooltips/refreshActiveUI/switchTool
      // pattern: reassigned before their first real use, so the local
      // reimplementation was unreachable in practice.
      let applyMenuAndPanelDefinitions = function () {};
      let initMenuBar = function () {};
      let initMenuActions = function () {};
      let runMenuAction = function () {};
      let openExtensionManager = function () {};
      let closeExtensionManager = function () {};
      let isExtModalOpen = function () { return false; };
      let initExtensionManagerUi = function () {};

      // MIXED: this function's DOM lookups and translations below are shell
      // (menu triggers, About/License/Import Tool/Language Manager tab
      // titles, Terminal/Console tabs) interleaved with ip-scanner tool refs
      // (activityScannerBtn/activityTopologyBtn/activityGlobeBtn,
      // toolsMenuIpScanner/Topology/Globe, sidebarTabScanner/IpLibrary,
      // ipLibrary* labels, resultNavIp/IpLibrary/Presets,
      // tabTitleIpLibrary/Presets/ScanDefaults/Topology/Globe). Not split
      // line-by-line here (too fine-grained to bracket cleanly without
      // restructuring); grouping by shell vs tool is future work once this
      // file gets its own dedicated pass.
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
        const resultNavPresets = document.getElementById("v1ResultNavPresets");
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
        const blurIpSoonButton = document.querySelector('[data-menu-action="blur-ip-soon"]');
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
        if (resultNavPresets) resultNavPresets.textContent = "⭐ " + tr("tabPresetsTitle");
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
        if (blurIpSoonButton) {
          blurIpSoonButton.setAttribute("title", tr("blurIpSoonButtonTitle"));
          blurIpSoonButton.setAttribute("aria-label", tr("blurIpSoonButtonTitle"));
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

      // ip-scanner tool: fallback entry only used if tool-catalog.js failed
      // to load (core.toolCatalog missing).
      const baseToolInfo = core.toolCatalog || {
        "scan-runner": {
          title: "Scan Runner",
          text: "Zakres IP, port presets, rownolegly probing i zapis wynikow.",
          points: ["IP range + presets", "Concurrency control", "Export/import results"]
        }
      };

      // MIXED (fallback only, used if uiDefinitions.menuActions is missing):
      // mirrors ui-definitions.js's menuActions - same 3 ip-scanner tool
      // entries (countries/presets/defaults), rest is shell. Kept as a
      // literal duplicate here rather than re-deriving from uiDefinitions,
      // since it exists specifically as the fallback for when that's absent.
      const fallbackActionMap = {
        "save-session": "Save session",
        "save-session-as": "Save session as...",
        "load-session": "Load session",
        "close-session": "Close session",
        "import-another-session": "Import another session data (mock)",
        exit: "Exit (mock)",
        countries: "Country IP Library", // ip-scanner tool
        presets: "Port Presets (mock)", // ip-scanner tool
        defaults: "Default Scan Values (mock)", // ip-scanner tool
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

      // shell: opens an extension-contributed tool via whichever surface(s)
      // its own ui flags declare (LS/RS/CS) - the single place that knows how
      // to open such a tool, used by the dynamically-created activity-bar icon,
      // Tools-menu item, and (via window.NetReconNewUI) the Options-menu "ext:"
      // dispatch in menu-runtime.js.
      function openExtensionTool(toolKey) {
        const toolMap = getToolInfoMap();
        const toolUi = (toolMap[toolKey] && toolMap[toolKey].ui) || {};
        if (toolUi.showInLeftPanel === true) {
          document.dispatchEvent(new CustomEvent("newui:sidebar-tab-intent-open", { detail: { tool: toolKey, activate: true } }));
        }
        if (toolUi.showInRightPanel === true) {
          document.dispatchEvent(new CustomEvent("newui:right-tab-intent-open", { detail: { tool: toolKey } }));
        }
        if (toolUi.showAsTab !== false) {
          switchTool(toolKey);
        }
      }
      window.NetReconNewUI = window.NetReconNewUI || {};
      window.NetReconNewUI.openExtensionTool = openExtensionTool;

      // shell: renders an extension-contributed icon into a container - an
      // http(s)/data URL (e.g. a catalog icon file) becomes a real <img>,
      // anything else (emoji/text, the existing convention) stays plain text.
      function renderExtIcon(container, icon) {
        const value = String(icon || "");
        if (/^(https?:|data:)/.test(value)) {
          const img = document.createElement("img");
          img.className = "v1-ext-icon-img";
          img.src = value;
          img.alt = "";
          container.appendChild(img);
        } else {
          container.appendChild(document.createTextNode(value));
        }
      }

      function syncExtensionToolUi() {
        clearDynamicExtensionUi();

        const entries = extensionToolEntries();
        if (!entries.length) {
          if (navigationRuntime && navigationRuntime.syncLeftTabActivationInvariant) {
            navigationRuntime.syncLeftTabActivationInvariant();
          }
          if (navigationRuntime && navigationRuntime.syncRightTabActivationInvariant) {
            navigationRuntime.syncRightTabActivationInvariant();
          }
          if (typeof setTooltips === "function") setTooltips();
          return;
        }

        const toolsDropdown = document.querySelector('[data-menu="tools"] .v1-menu-dropdown');
        const activityBar = document.querySelector('.v1-activity');
        const scannerToolList = document.querySelector('.v1-sidebar [data-sidebar-tool-panel="scan-runner"] .v1-tool-list');
        const tabsBar = document.querySelector('.v1-tabs');
        const sidebarToolTabs = document.getElementById('v1SidebarToolTabs');
        const sidebarEl = document.querySelector('.v1-sidebar');
        const rightTabsEl = document.querySelector('.v1-right-tabs');
        const rightContentEl = document.querySelector('.v1-right-content');

        entries.forEach((entry) => {
          if (tabsBar && entry.ui.showAsTab !== false) {
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

          if (scannerToolList && entry.ui.showInLeftPanel !== true) {
            const li = document.createElement("li");
            li.className = "v1-extension-tool-item";
            li.setAttribute("data-tool", entry.key);
            li.setAttribute("data-dynamic-extension", "1");
            li.textContent = entry.icon + " " + entry.title;
            scannerToolList.appendChild(li);
          }

          if (sidebarToolTabs && sidebarEl && entry.ui.showInLeftPanel === true) {
            const wrap = document.createElement("div");
            wrap.className = "v1-sidebar-tool-tab-wrap sidebar-tab-closed";
            wrap.setAttribute("data-sidebar-tab", entry.key);
            wrap.setAttribute("data-dynamic-extension", "1");
            wrap.setAttribute("hidden", "hidden");

            const tabBtn = document.createElement("button");
            tabBtn.className = "v1-sidebar-tool-tab";
            tabBtn.setAttribute("data-tool", entry.key);
            tabBtn.setAttribute("type", "button");
            tabBtn.textContent = entry.title;

            const tabClose = document.createElement("span");
            tabClose.className = "v1-sidebar-tool-tab-close";
            tabClose.setAttribute("data-sidebar-tab-close", "true");
            tabClose.setAttribute("data-tool", entry.key);
            tabClose.setAttribute("role", "button");
            tabClose.setAttribute("tabindex", "-1");
            tabClose.setAttribute("aria-label", tr("tabCloseAria"));
            tabClose.textContent = "×";

            wrap.appendChild(tabBtn);
            wrap.appendChild(tabClose);
            sidebarToolTabs.appendChild(wrap);

            const panel = document.createElement("div");
            panel.className = "tool-detail";
            panel.setAttribute("data-sidebar-tool-panel", entry.key);
            panel.setAttribute("data-dynamic-extension", "1");
            panel.setAttribute("hidden", "hidden");
            if (panelsRuntime && panelsRuntime.buildDetailHtml) {
              panel.innerHTML = panelsRuntime.buildDetailHtml(entry.key);
            }
            sidebarEl.appendChild(panel);
            if (panelsRuntime && panelsRuntime.wireToolRuntime) {
              panelsRuntime.wireToolRuntime(entry.key, panel);
            }
          }

          if (rightTabsEl && rightContentEl && entry.ui.showInRightPanel === true) {
            const wrap = document.createElement("div");
            wrap.className = "v1-right-tool-tab-wrap right-tab-closed";
            wrap.setAttribute("data-right-tab", entry.key);
            wrap.setAttribute("data-dynamic-extension", "1");
            wrap.setAttribute("hidden", "hidden");

            const tabBtn = document.createElement("button");
            tabBtn.className = "v1-right-tab";
            tabBtn.setAttribute("data-v1-right-tab", entry.key);
            tabBtn.setAttribute("type", "button");
            tabBtn.textContent = entry.title;
            tabBtn.addEventListener("click", function () {
              document.dispatchEvent(new CustomEvent("newui:right-tab-intent-open", { detail: { tool: entry.key } }));
            });

            const tabClose = document.createElement("span");
            tabClose.className = "v1-right-tool-tab-close";
            tabClose.setAttribute("data-right-tab-close", "true");
            tabClose.setAttribute("data-tool", entry.key);
            tabClose.setAttribute("role", "button");
            tabClose.setAttribute("tabindex", "-1");
            tabClose.setAttribute("aria-label", tr("tabCloseAria"));
            tabClose.textContent = "×";
            tabClose.addEventListener("click", function (e) {
              e.stopPropagation();
              if (navigationRuntime && navigationRuntime.setRightTabOpen) {
                navigationRuntime.setRightTabOpen(entry.key, false);
              }
            });

            wrap.appendChild(tabBtn);
            wrap.appendChild(tabClose);
            rightTabsEl.appendChild(wrap);

            const pane = document.createElement("section");
            pane.className = "v1-right-pane tool-detail";
            pane.setAttribute("data-v1-right-pane", entry.key);
            pane.setAttribute("data-dynamic-extension", "1");
            if (panelsRuntime && panelsRuntime.buildDetailHtml) {
              pane.innerHTML = panelsRuntime.buildDetailHtml(entry.key);
            }
            rightContentEl.appendChild(pane);
            if (panelsRuntime && panelsRuntime.wireToolRuntime) {
              panelsRuntime.wireToolRuntime(entry.key, pane);
            }
          }

          if (toolsDropdown && entry.ui.showInToolsMenu !== false) {
            const btn = document.createElement("button");
            btn.className = "v1-menu-dd-item";
            btn.setAttribute("data-tool", entry.key);
            btn.setAttribute("data-dynamic-extension", "1");

            const left = document.createElement("span");
            renderExtIcon(left, entry.icon);
            left.appendChild(document.createTextNode(" " + entry.title));
            const right = document.createElement("span");
            right.className = "shortcut";

            btn.appendChild(left);
            btn.appendChild(right);
            btn.addEventListener("click", function () {
              document.querySelectorAll(".v1-menu-group.open").forEach(function (group) {
                group.classList.remove("open");
              });
              openExtensionTool(entry.key);
            });
            toolsDropdown.appendChild(btn);
          }

          if (activityBar && entry.ui.showInActivityBar) {
            const btn = document.createElement("button");
            btn.setAttribute("data-tool", entry.key);
            btn.setAttribute("data-dynamic-extension", "1");
            btn.setAttribute("title", entry.title);
            btn.setAttribute("aria-label", entry.title);
            renderExtIcon(btn, entry.icon);
            btn.addEventListener("click", function () {
              openExtensionTool(entry.key);
            });
            activityBar.appendChild(btn);
          }
        });

        // shell: extension-contributed Options-menu entries (contributions.optionsMenu),
        // each opening a list of that extension's own tool keys via whichever
        // surface (LS/RS/CS) their own ui flags declare. See menu-runtime.js's
        // "ext:" behavior branch for the click-time dispatch.
        const optionsDropdown = document.querySelector('.v1-menu-group[data-menu="options"] .v1-menu-dropdown');
        if (optionsDropdown && extensionHost && extensionHost.getInstalledManifests) {
          extensionHost.getInstalledManifests().forEach((manifest) => {
            const optionsMenu = manifest.contributions && manifest.contributions.optionsMenu;
            if (!optionsMenu || typeof optionsMenu !== "object") return;
            Object.keys(optionsMenu).forEach((actionKey) => {
              const entryDef = optionsMenu[actionKey] || {};
              const btn = document.createElement("button");
              btn.className = "v1-menu-dd-item";
              btn.setAttribute("data-menu-action", "ext:" + manifest.id + ":" + actionKey);
              btn.setAttribute("data-dynamic-extension", "1");
              const label = document.createElement("span");
              label.textContent = String(entryDef.label || actionKey);
              const shortcut = document.createElement("span");
              shortcut.className = "shortcut";
              btn.appendChild(label);
              btn.appendChild(shortcut);
              optionsDropdown.appendChild(btn);
            });
          });
        }

        if (navigationRuntime && navigationRuntime.syncLeftTabActivationInvariant) {
          navigationRuntime.syncLeftTabActivationInvariant();
        }
        if (navigationRuntime && navigationRuntime.syncRightTabActivationInvariant) {
          navigationRuntime.syncRightTabActivationInvariant();
        }
        if (typeof setTooltips === "function") setTooltips();
        if (panelsRuntime && panelsRuntime.initWorkbenchTabs) {
          panelsRuntime.initWorkbenchTabs();
        }
        if (typeof refreshCustomScrollbars === "function") {
          requestAnimationFrame(() => refreshCustomScrollbars());
        }
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

      let activeTool = store ? store.getState().activeTool : "scan-runner";

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

      function refreshTabsOverflowUi() {
        if (!tabsTrack) return;

        const tabsShell = tabsTrack.closest('.v1-tabs-shell');
        const visibleTabs = Array.from(tabsTrack.querySelectorAll('.v1-tab')).filter((tab) => {
          return !tab.classList.contains('tab-closed') && !tab.classList.contains('tab-detached-hidden') && !tab.hasAttribute('hidden');
        });
        const visibleTabsWidth = visibleTabs.reduce(function (sum, tab) {
          return sum + Math.ceil(tab.getBoundingClientRect().width || tab.offsetWidth || 0);
        }, 0);
        const trackRect = tabsTrack.getBoundingClientRect();
        const firstVisibleTab = visibleTabs.length ? visibleTabs[0] : null;
        const lastVisibleTab = visibleTabs.length ? visibleTabs[visibleTabs.length - 1] : null;
        const firstRect = firstVisibleTab ? firstVisibleTab.getBoundingClientRect() : null;
        const lastRect = lastVisibleTab ? lastVisibleTab.getBoundingClientRect() : null;
        const hasLeftOverflow = !!(firstRect && firstRect.left < trackRect.left - 1);
        const hasRightOverflow = !!(lastRect && lastRect.right > trackRect.right + 1);
        const maxScrollLeft = Math.max(0, Math.ceil((tabsTrack.scrollWidth || 0) - (tabsTrack.clientWidth || 0)));
        const widthOverflow = visibleTabsWidth > (tabsTrack.clientWidth || 0) + 2;
        const hasOverflow = widthOverflow || maxScrollLeft > 1 || hasLeftOverflow || hasRightOverflow;
        const effectiveMaxScrollLeft = Math.max(0, Math.ceil(Math.max(maxScrollLeft, visibleTabsWidth - (tabsTrack.clientWidth || 0))));

        if (tabsShell) {
          tabsShell.classList.toggle('has-overflow', hasOverflow);
        }

        if (tabsScrollLeftBtn && tabsScrollRightBtn) {
          const currentScrollLeft = tabsTrack.scrollLeft;
          tabsScrollLeftBtn.disabled = !hasOverflow || currentScrollLeft <= 1;
          tabsScrollRightBtn.disabled = !hasOverflow || currentScrollLeft >= effectiveMaxScrollLeft - 1;
        }
      }

      function initCenterTabsScrollButtons() {
        if (!tabsTrack || !tabsScrollLeftBtn || !tabsScrollRightBtn) return;

        // Start hidden; refresh will enable only when real overflow is present.
        tabsScrollLeftBtn.disabled = true;
        tabsScrollRightBtn.disabled = true;

        function scrollTabsBy(direction) {
          tabsTrack.scrollBy({ left: direction * 260, behavior: "smooth" });
          requestAnimationFrame(refreshTabsOverflowUi);
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
            refreshTabsOverflowUi();
          }, { passive: true });
          tabsTrack.addEventListener("wheel", function (event) {
            const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
              ? event.deltaX
              : event.deltaY;
            if (Math.abs(delta) < 0.5) return;
            event.preventDefault();
            tabsTrack.scrollBy({ left: delta, behavior: "auto" });
            refreshTabsOverflowUi();
          }, { passive: false });
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
          refreshTabsOverflowUi();
        });

        refreshTabsOverflowUi();
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(function () {
            refreshTabsOverflowUi();
          });
        });

      }

      // =========================
      // 2) Top menu behavior
      // =========================
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

      // shell: generic named-command registry (FUTURE_PLUGIN_SHELL.md's
      // "Command bus"). First real registrations: extensions that declare a
      // permission-gated contributions.commands entry (see panels-runtime.js's
      // registerExtensionCommands) - existing menu/action wiring is untouched.
      const commandBusRuntime = runtimeFactory.createCommandBusRuntime
        ? runtimeFactory.createCommandBusRuntime()
        : null;
      window.NetReconNewUI = window.NetReconNewUI || {};
      window.NetReconNewUI.commandBus = commandBusRuntime;

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
            commandBus: commandBusRuntime,
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
        const panelsRefreshActiveUI = panelsRuntime.refreshActiveUI;
        const panelsSwitchTool = panelsRuntime.switchTool;
        refreshActiveUI = function () {
          panelsRefreshActiveUI();
          refreshTabsOverflowUi();
        };
        switchTool = function (tool) {
          panelsSwitchTool(tool);
          refreshTabsOverflowUi();
        };
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

      const sessionRuntime = runtimeFactory.createSessionRuntime
        ? runtimeFactory.createSessionRuntime({
            tr,
            platform,
            setStatusLine,
            panelsRuntime,
            switchTool,
            getNavigationRuntime: function () { return navigationRuntime; },
            refreshCustomScrollbars: function () { refreshCustomScrollbars(); },
          })
        : null;

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
            extensionHost,
            onToggleClippy: function () {
              if (clippyRuntime && clippyRuntime.toggle) {
                clippyRuntime.toggle();
              }
            },
            session: sessionRuntime,
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
      if (sessionRuntime && sessionRuntime.restoreLayoutAfterReload) {
        sessionRuntime.restoreLayoutAfterReload();
      }
      if (sessionRuntime && sessionRuntime.initWelcomeView) {
        sessionRuntime.initWelcomeView();
      }

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
