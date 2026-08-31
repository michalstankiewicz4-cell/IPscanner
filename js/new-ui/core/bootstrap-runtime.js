(function () {
      // shell: this whole file is the app's composition root (wires every
      // runtime factory via DI) - fundamentally shell orchestration by
      // definition. Specific mixed spots (DOM refs/fallback data that are
      // ip-scanner-tool-specific) are labeled individually below rather than
      // splitting this file, per CONTRIBUTING 12a.
      const core = window.NetReconNewUICore || {};

      // General settings (TBM Options -> General): for every "remember X"
      // toggle the user turned off, wipe that setting's storage key (and, for
      // language, also reset the already-parsed in-memory dictionaries - see
      // below) BEFORE anything reads it. Must run before literally any other
      // line in this file, since netrecon_lang/netrecon_newui_skin are read
      // just a few lines below, and netrecon_custom_i18n was already merged
      // into i18n.js's in-memory dictionaries at script-parse time, earlier
      // than this file even started executing.
      (function applyRememberedSettingsGate() {
        var gs = core.generalSettings;
        if (!gs || typeof gs.getState !== "function") return;
        var settings;
        try {
          settings = gs.getState();
        } catch (_) {
          return;
        }

        function clear(key) {
          try { window.localStorage.removeItem(key); } catch (_) {}
        }

        if (!settings.rememberLanguage) {
          clear("netrecon_custom_i18n");
          clear("netrecon_lang");
          if (core.i18n && typeof core.i18n.resetLanguages === "function") {
            core.i18n.resetLanguages();
          }
        }
        if (!settings.rememberSkin) clear("netrecon_newui_skin");
        if (!settings.rememberPanelSizes) clear("netrecon_panel_sizes_v1");
        if (!settings.rememberBlurIp) clear("netrecon_blur_ip");
        if (!settings.rememberDetachedWindows) {
          clear("netrecon_detached_layouts_v1");
          clear("netrecon_detached_arrange_state_v1");
          clear("netrecon_detached_auto_arrange_enabled_v1");
        }
        if (!settings.rememberWindowState) clear("netrecon_window_state_v1");
        if (!settings.rememberOpenTabs) clear("netrecon_open_tabs_v1");
        if (!settings.rememberClippyEnabled) clear("netrecon_newui_clippy_enabled");
        if (!settings.rememberExtensions) clear("netrecon_newui_extensions");
        if (!settings.rememberRangeHistory) clear("netrecon_range_history");
      })();

      // TBM Options -> General -> "Swap panel sides": independent of language
      // direction - a `body.v1-panel-side-right` class that main.css ORs
      // alongside `html[dir="rtl"]` to mirror the activity bar/LS/RS grid.
      // RTL languages (Arabic) get the mirror unconditionally via the
      // `dir="rtl"` half of that OR, regardless of this toggle; non-RTL
      // languages get it only when this is checked. Applied on boot and live
      // on every change (general-settings-runtime.js's replaceState() always
      // dispatches newui:general-settings-changed), unlike the "remember X"
      // meta-toggles above, which only take effect on next launch.
      function applyPanelSidePreference() {
        var gs = core.generalSettings;
        var settings = gs && typeof gs.getState === "function" ? gs.getState() : null;
        if (document.body) {
          document.body.classList.toggle("v1-panel-side-right", !!(settings && settings.panelSideRight));
        }
      }
      applyPanelSidePreference();
      document.addEventListener("newui:general-settings-changed", applyPanelSidePreference);

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
        // APP_VERSION (generated by scripts/sync-version.js from package.json)
        // is the authoritative source - prefer it over versionsData[0], whose
        // changelog-style version strings can drift or carry extra text (e.g.
        // "v2.0.0 rebuild") independently of the real package version.
        if (core.APP_VERSION) return "v" + String(core.APP_VERSION);
        const versions = Array.isArray(core.versionsData) ? core.versionsData : [];
        const first = versions[0] || {};
        return first.version ? String(first.version) : "";
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

      // Safety net: any JS error/rejection that isn't already handled by a
      // more specific try/catch surfaces here too, so it's visible in the
      // Console pane instead of only in devtools (which most users, and
      // even most debugging sessions, never have open). Deliberately not a
      // replacement for deliberate error handling elsewhere (e.g. Community
      // Chat's own error-code logging) - this only catches what nothing
      // else already caught.
      window.addEventListener("error", function (event) {
        var message = (event && event.error && event.error.message) || (event && event.message) || "unknown error";
        setStatusLine("Error: " + message);
      });
      window.addEventListener("unhandledrejection", function (event) {
        var reason = event && event.reason;
        var message = (reason && reason.message) ? reason.message : String(reason);
        setStatusLine("Unhandled error: " + message);
      });

      let scannerSidebarRuntime = null;
      let emailReconRuntime = null;
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
      // Same pattern: reassigned once menuRuntime is created (below) to the
      // real implementations. Their original local bodies were dead code -
      // found during shell/tools delimiting (CONTRIBUTING 12a) and removed
      // here, since they matched the exact already-fixed
      // setTooltips/refreshActiveUI/switchTool pattern: reassigned before
      // their first real use, so the local reimplementation was unreachable
      // in practice.
      let applyMenuAndPanelDefinitions = function () {};
      let initMenuBar = function () {};
      let initMenuActions = function () {};
      let runMenuAction = function () {};

      // MIXED: this function's DOM lookups and translations below are shell
      // (menu triggers, Terminal/Console tabs) interleaved with ip-scanner
      // tool refs (activityScannerBtn, toolsMenuIpScanner/Globe, ipLibrary*
      // labels, resultNavIp/IpLibrary/Presets). Not split line-by-line here
      // (too fine-grained to bracket cleanly without restructuring);
      // grouping by shell vs tool is future work once this file gets its
      // own dedicated pass.
      function applyStaticTranslations() {
        const fileTrigger = document.querySelector('[data-menu="file"] .v1-menu-trigger');
        const optionsTrigger = document.querySelector('[data-menu="options"] .v1-menu-trigger');
        const toolsTrigger = document.querySelector('[data-menu="tools"] .v1-menu-trigger');
        const helpTrigger = document.querySelector('[data-menu="help"] .v1-menu-trigger');
        const explorerHead = document.getElementById("v1SidebarTitle");
        const assistantHead = document.querySelector('.v1-rightbar .v1-head-title');
        const activityResultsBtn = document.getElementById("v1ActivityResults");
        const activityScannerBtn = document.getElementById("v1ActivityScanner");
        const activityNetworkMonitorBtn = document.getElementById("v1ActivityNetworkMonitor");
        const activityEmailReconBtn = document.getElementById("v1ActivityEmailRecon");
        const aiModeUiLabel = document.getElementById("v1AiModeUiLabel");
        const aiModeBadge = document.getElementById("v1AiModeBadge");
        const aiStopBtn = document.getElementById("v1AiStopBtn");
        const aiClearHistoryBtn = document.getElementById("v1AiClearHistoryBtn");
        const aiPropertiesTitle = document.getElementById("v1AiPropertiesTitle");
        const aiPropertiesActiveNote = document.getElementById("v1AiPropertiesActiveNote");
        const aiPropMaxTokensLabel = document.getElementById("v1AiPropMaxTokensLabel");
        const aiPropMaxRoundsLabel = document.getElementById("v1AiPropMaxRoundsLabel");
        const aiPropTokenCounterLabel = document.getElementById("v1AiPropTokenCounterLabel");
        const toolsMenuIpScanner = document.getElementById("v1ToolsMenuIpScanner");
        const toolsMenuGlobe = document.getElementById("v1ToolsMenuGlobe");
        const toolsMenuBrowser = document.getElementById("v1ToolsMenuBrowser");
        const toolsMenuPulpitPreview = document.getElementById("v1ToolsMenuPulpitPreview");
        const toolsMenuMailXssTester = document.getElementById("v1ToolsMenuMailXssTester");
        const toolsMenuHttpsAuditor = document.getElementById("v1ToolsMenuHttpsAuditor");
        const toolsMenuReverseIp = document.getElementById("v1ToolsMenuReverseIp");
        const toolsMenuGoogleDork = document.getElementById("v1ToolsMenuGoogleDork");
        const toolsMenuWifi = document.getElementById("v1ToolsMenuWifi");
        const helpMenuCommunityChat = document.getElementById("v1HelpMenuCommunityChat");
        const toolsMenuNetworkMonitor = document.getElementById("v1ToolsMenuNetworkMonitor");
        const toolsMenuEmailRecon = document.getElementById("v1ToolsMenuEmailRecon");
        tabsTrack = document.getElementById("v1TabsTrack");
        tabsScrollLeftBtn = document.getElementById("v1TabsScrollLeft");
        tabsScrollRightBtn = document.getElementById("v1TabsScrollRight");
        // LS's tool-tab buttons and RS's tab buttons are generated by
        // tab-registry.js's renderSectionTabs() now (ipScanner/
        // ipLibraryTabTitle/resultsSidebarTitle/tabLabel_shellcraft_library),
        // not id-based lookups here.
        // ip-library's LS panel (title/buttons/labels/placeholder) and
        // results-ip's LS nav list are all generated by
        // tool-content-runtime.js's generic-content-slot entries now (see
        // navigation-runtime.js's activateGenericContent()) - their content
        // bakes in tr() directly at render time, so the many id-based
        // lookups+usages that used to live here (v1IpLibraryPanelTitle/
        // UpdateBtn/LoadBtn/ClearBtn/TopRangesLabel/CountryCodes placeholder,
        // v1ResultNavIp/IpLibrary/Presets) are gone - nothing left to
        // re-translate here.
        // CS's built-in tab titles (results-ip/ip-library/presets/
        // general/import-tool/language-manager/about/license/lorem-ipsum/
        // globe/versions/shellcraft) are generated by tab-registry.js's
        // renderSectionTabs()/retranslateSectionTabs() now, not these
        // id-based lookups.
        const terminalTab = document.getElementById("v1TerminalTab");
        const consoleTab = document.getElementById("v1ConsoleTab");
        const assistantMenuLabel = document.querySelector('[data-menu-action="assistant"] span:first-child');
        const aboutMenuLabel = document.querySelector('[data-menu-action="about"] span:first-child');
        const licenseMenuLabel = document.querySelector('[data-menu-action="license"] span:first-child');
        const resetMemoryButton = document.querySelector('[data-menu-action="reset-memory"]');
        const blurIpSoonButton = document.querySelector('[data-menu-action="blur-ip"]');
        const autoArrangeToggle = document.getElementById("v1AutoArrangeToggle");
        const autoArrangeToggleWrap = autoArrangeToggle ? autoArrangeToggle.closest(".v1-menubar-toggle") : null;
        const clippyClose = document.getElementById("v1ClippyClose");
        const fileNewLabel = document.querySelector('[data-menu-action="new-session"] span:first-child');
        const fileOpenLabel = document.querySelector('[data-menu-action="load-session"] span:first-child');
        const fileOpenRecentLabel = document.querySelector('[data-menu-submenu-trigger="open-recent"] span:first-child');
        const fileImportLabel = document.querySelector('#v1MenuFileImport span:first-child');
        const fileSaveLabel = document.querySelector('[data-menu-action="save-session"] span:first-child');
        const fileSaveAsLabel = document.querySelector('[data-menu-action="save-session-as"] span:first-child');
        const fileCloseLabel = document.querySelector('[data-menu-action="close-session"] span:first-child');
        const fileExitLabel = document.querySelector('[data-menu-action="exit"] span:first-child');
        const optionsCountriesLabel = document.querySelector('[data-menu-action="countries"] span:first-child');
        const optionsPresetsLabel = document.querySelector('[data-menu-action="presets"] span:first-child');
        const optionsLanguageLabel = document.querySelector('[data-menu-action="language"] span:first-child');
        const optionsGeneralLabel = document.querySelector('[data-menu-action="general"] span:first-child');
        const optionsImportToolLabel = document.querySelector('[data-menu-action="customization"] span:first-child');
        const toolsAiAssistantLabel = document.querySelector('[data-menu-action="assistant-right"] span:first-child');
        const helpVersionsLabel = document.querySelector('[data-menu-action="versions"] span:first-child');
        const helpDocumentationLabel = document.querySelector('[data-menu-action="documentation"] span:first-child');
        const windowMinBtn = document.querySelector('[data-menu-action="window-min"]');
        const windowMaxBtn = document.querySelector('[data-menu-action="window-max"]');
        const windowFullscreenBtn = document.querySelector('[data-menu-action="window-fullscreen"]');
        const windowCloseBtn = document.querySelector('[data-menu-action="window-close"]');
        const autoArrangeWindowsBtn = document.querySelector('[data-menu-action="auto-arrange-windows"]');

        if (fileTrigger) fileTrigger.textContent = tr("menuFile");
        if (optionsTrigger) optionsTrigger.textContent = tr("menuOptions");
        if (toolsTrigger) toolsTrigger.textContent = tr("menuTools");
        if (helpTrigger) helpTrigger.textContent = tr("menuHelp");
        if (explorerHead) explorerHead.textContent = tr("ipScanner");
        if (assistantHead) assistantHead.textContent = tr("assistant");

        if (activityResultsBtn) {
          activityResultsBtn.setAttribute("title", tr("resultsBrowser"));
          activityResultsBtn.setAttribute("aria-label", tr("resultsBrowser"));
        }
        if (activityScannerBtn) {
          activityScannerBtn.setAttribute("title", tr("ipScanner"));
          activityScannerBtn.setAttribute("aria-label", tr("ipScanner"));
        }
        if (activityNetworkMonitorBtn) {
          activityNetworkMonitorBtn.setAttribute("title", tr("toolTitle_network_monitor"));
          activityNetworkMonitorBtn.setAttribute("aria-label", tr("toolTitle_network_monitor"));
        }
        if (activityEmailReconBtn) {
          activityEmailReconBtn.setAttribute("title", tr("toolTitle_email_recon"));
          activityEmailReconBtn.setAttribute("aria-label", tr("toolTitle_email_recon"));
        }
        if (aiModeUiLabel) aiModeUiLabel.setAttribute("title", tr("aiModeUiCheckboxTitle"));
        if (aiModeBadge) {
          aiModeBadge.setAttribute("title", tr("aiModeBadgeTitle"));
          aiModeBadge.setAttribute("aria-label", tr("aiModeBadgeTitle"));
        }
        if (aiStopBtn) {
          aiStopBtn.setAttribute("title", tr("aiStopBtnTitle"));
          aiStopBtn.setAttribute("aria-label", tr("aiStopBtnTitle"));
        }
        if (aiClearHistoryBtn) {
          aiClearHistoryBtn.setAttribute("title", tr("aiClearHistoryBtnTitle"));
          aiClearHistoryBtn.setAttribute("aria-label", tr("aiClearHistoryBtnTitle"));
        }
        if (aiPropertiesTitle) aiPropertiesTitle.textContent = tr("aiPropertiesTitle");
        if (aiPropertiesActiveNote) aiPropertiesActiveNote.textContent = tr("aiPropertiesActiveNote");
        if (aiPropMaxTokensLabel) aiPropMaxTokensLabel.textContent = tr("aiPropMaxTokensLabel");
        if (aiPropMaxRoundsLabel) aiPropMaxRoundsLabel.textContent = tr("aiPropMaxRoundsLabel");
        if (aiPropTokenCounterLabel) aiPropTokenCounterLabel.textContent = tr("aiPropTokenCounterLabel");
        if (tabsScrollLeftBtn) {
          tabsScrollLeftBtn.setAttribute("title", tr("tabScrollLeft"));
          tabsScrollLeftBtn.setAttribute("aria-label", tr("tabScrollLeft"));
        }
        if (tabsScrollRightBtn) {
          tabsScrollRightBtn.setAttribute("title", tr("tabScrollRight"));
          tabsScrollRightBtn.setAttribute("aria-label", tr("tabScrollRight"));
        }
        if (toolsMenuIpScanner) toolsMenuIpScanner.textContent = tr("ipScanner");
        if (toolsMenuGlobe) toolsMenuGlobe.textContent = tr("toolTitle_globe");
        if (toolsMenuBrowser) toolsMenuBrowser.textContent = tr("toolTitle_browser");
        if (toolsMenuPulpitPreview) toolsMenuPulpitPreview.textContent = tr("toolTitle_pulpit_preview");
        if (toolsMenuMailXssTester) toolsMenuMailXssTester.textContent = tr("toolTitle_mail_xss_tester");
        if (toolsMenuHttpsAuditor) toolsMenuHttpsAuditor.textContent = tr("toolTitle_https_auditor");
        if (toolsMenuReverseIp) toolsMenuReverseIp.textContent = tr("toolTitle_reverse_ip");
        if (toolsMenuGoogleDork) toolsMenuGoogleDork.textContent = tr("toolTitle_google_dork");
        if (toolsMenuWifi) toolsMenuWifi.textContent = tr("toolTitle_wifi");
        if (helpMenuCommunityChat) helpMenuCommunityChat.textContent = tr("toolTitle_community_chat");
        if (toolsMenuNetworkMonitor) toolsMenuNetworkMonitor.textContent = tr("toolTitle_network_monitor");
        if (toolsMenuEmailRecon) toolsMenuEmailRecon.textContent = tr("toolTitle_email_recon");
        document.querySelectorAll("[data-sidebar-tab-close]").forEach((el) => {
          el.setAttribute("aria-label", tr("tabCloseAria"));
          el.setAttribute("title", tr("tabCloseAria"));
        });
        if (terminalTab) terminalTab.textContent = tr("terminalTab");
        if (consoleTab) consoleTab.textContent = tr("consoleTab");
        if (aboutMenuLabel) aboutMenuLabel.textContent = tr("helpAboutTitle");
        if (licenseMenuLabel) licenseMenuLabel.textContent = tr("helpLicenseTitle");
        if (assistantMenuLabel) assistantMenuLabel.textContent = "📎 " + tr("assistant");
        if (fileNewLabel) fileNewLabel.textContent = tr("menuFileNew");
        if (fileOpenLabel) fileOpenLabel.textContent = tr("menuFileOpen");
        if (fileOpenRecentLabel) fileOpenRecentLabel.textContent = tr("menuFileOpenRecent");
        if (fileImportLabel) fileImportLabel.textContent = tr("menuFileImport");
        if (fileSaveLabel) fileSaveLabel.textContent = tr("menuFileSave");
        if (fileSaveAsLabel) fileSaveAsLabel.textContent = tr("menuFileSaveAs");
        if (fileCloseLabel) fileCloseLabel.textContent = tr("menuFileClose");
        if (fileExitLabel) fileExitLabel.textContent = tr("menuFileExit");
        if (optionsCountriesLabel) optionsCountriesLabel.textContent = tr("menuOptionsCountries");
        if (optionsPresetsLabel) optionsPresetsLabel.textContent = tr("menuOptionsPresets");
        if (optionsLanguageLabel) optionsLanguageLabel.textContent = tr("menuOptionsLanguage");
        if (optionsGeneralLabel) optionsGeneralLabel.textContent = tr("menuOptionsGeneral");
        if (optionsImportToolLabel) optionsImportToolLabel.textContent = tr("menuOptionsImportTool");
        if (toolsAiAssistantLabel) toolsAiAssistantLabel.textContent = "🤖 " + tr("menuToolsAiAssistant");
        if (helpVersionsLabel) helpVersionsLabel.textContent = tr("menuHelpVersions");
        if (helpDocumentationLabel) helpDocumentationLabel.textContent = tr("menuHelpDocumentation");
        if (windowMinBtn) {
          windowMinBtn.setAttribute("title", tr("windowMinimizeTitle"));
          windowMinBtn.setAttribute("aria-label", tr("windowMinimizeTitle"));
        }
        if (windowMaxBtn) {
          windowMaxBtn.setAttribute("title", tr("windowMaximizeTitle"));
          windowMaxBtn.setAttribute("aria-label", tr("windowMaximizeTitle"));
        }
        if (windowFullscreenBtn) {
          windowFullscreenBtn.setAttribute("title", tr("windowFullscreenTitle"));
          windowFullscreenBtn.setAttribute("aria-label", tr("windowFullscreenTitle"));
        }
        if (windowCloseBtn) {
          windowCloseBtn.setAttribute("title", tr("windowCloseTitle"));
          windowCloseBtn.setAttribute("aria-label", tr("windowCloseTitle"));
        }
        if (autoArrangeWindowsBtn) {
          autoArrangeWindowsBtn.setAttribute("title", tr("autoArrangeWindowsBtnTitle"));
          autoArrangeWindowsBtn.setAttribute("aria-label", tr("autoArrangeWindowsBtnTitle"));
        }
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
          var blurActive = document.body.classList.contains("v1-blur-ip");
          blurIpSoonButton.classList.toggle("is-active", blurActive);
          blurIpSoonButton.setAttribute("aria-pressed", blurActive ? "true" : "false");
        }
        if (autoArrangeToggle) {
          autoArrangeToggle.setAttribute("title", tr("autoArrangeOnUndockTitle"));
          autoArrangeToggle.setAttribute("aria-label", tr("autoArrangeOnUndockTitle"));
        }
        if (clippyClose) clippyClose.setAttribute("aria-label", tr("clippyCloseAria"));
        if (scannerSidebarRuntime && scannerSidebarRuntime.applyStaticTranslations) {
          scannerSidebarRuntime.applyStaticTranslations();
        }
        if (emailReconRuntime && emailReconRuntime.applyStaticTranslations) {
          emailReconRuntime.applyStaticTranslations();
        }
        if (powerShellConsoleRuntime && powerShellConsoleRuntime.applyStaticTranslations) {
          powerShellConsoleRuntime.applyStaticTranslations();
        }
      }

      function refreshLanguageUi() {
        applyStaticTranslations();
        // LS/RS's built-in tab labels are generated (see index.html's
        // .v1-sidebar-tool-tabs/.v1-right-tabs comments) -
        // applyStaticTranslations() has no ids to re-translate there
        // anymore, so update them in place instead (not renderSectionTabs(),
        // which would reset open/active state).
        var tabRegistry = window.NetReconNewUICore && window.NetReconNewUICore.tabRegistry;
        if (tabRegistry && tabRegistry.retranslateSectionTabs) {
          tabRegistry.retranslateSectionTabs("left", tr);
          tabRegistry.retranslateSectionTabs("right", tr);
          tabRegistry.retranslateSectionTabs("center", tr);
        }
        if (setTooltips) setTooltips();
        if (refreshActiveUI) refreshActiveUI();
        // ShellCraft's Library (LS) and Inspector (RS) render once at
        // startup into persistent mounts outside #v1ToolDetail, so
        // refreshActiveUI()'s #v1ToolDetail-only rebuild never reaches them -
        // re-render them explicitly so their strings pick up the new language.
        if (panelsRuntime && panelsRuntime.refreshShellCraftPanels) {
          panelsRuntime.refreshShellCraftPanels();
        }
        // Same reasoning as ShellCraft above - Pulpit's Library/Inspector
        // persistent mounts need an explicit re-render too.
        if (panelsRuntime && panelsRuntime.refreshPulpitPanels) {
          panelsRuntime.refreshPulpitPanels();
        }
        // Agent Profiles' Library (LS) is the same kind of persistent mount
        // outside #v1ToolDetail - its own CS half is a generic-content-slot
        // tool instead, so it's already covered by the block below.
        if (panelsRuntime && panelsRuntime.refreshAgentProfilePanels) {
          panelsRuntime.refreshAgentProfilePanels();
        }
        // LS/RS generic-content-slot tools (tool-content-runtime.js) bake
        // tr() in at render time, so whichever one is currently active (if
        // any) needs a fresh render to pick up the new language too - a
        // harmless no-op for pinned tools / when nothing's active.
        if (navigationRuntime && navigationRuntime.refreshActiveGenericContent) {
          navigationRuntime.refreshActiveGenericContent();
        }
        requestAnimationFrame(function () {
          if (typeof refreshCustomScrollbars === "function") refreshCustomScrollbars();
        });
      }

      window.NetReconNewUI = window.NetReconNewUI || {};
      window.NetReconNewUI.setStatusLine = setStatusLine;
      window.NetReconNewUI.refreshLanguageUi = refreshLanguageUi;
      window.NetReconNewUI.syncExtensionToolUi = function () {
        if (typeof syncExtensionToolUi === "function") syncExtensionToolUi();
      };
      // Exposed for tool-content-runtime.js's LS/RS generic-content-slot
      // wire() functions (navigation-runtime.js's registerTabSections()) -
      // panelsRuntime is declared later in this same function, but these
      // closures only read it when actually invoked, well after boot
      // completes, same pattern refreshLanguageUi() above already relies on.
      window.NetReconNewUI.wireShellCraftPanels = function () {
        if (panelsRuntime && panelsRuntime.refreshShellCraftPanels) {
          panelsRuntime.refreshShellCraftPanels();
        }
      };
      window.NetReconNewUI.wirePulpitPanels = function () {
        if (panelsRuntime && panelsRuntime.refreshPulpitPanels) {
          panelsRuntime.refreshPulpitPanels();
        }
      };
      window.NetReconNewUI.wireAgentProfilePanels = function () {
        if (panelsRuntime && panelsRuntime.refreshAgentProfilePanels) {
          panelsRuntime.refreshAgentProfilePanels();
        }
      };
      window.NetReconNewUI.wireIpLibraryPanel = function (rootEl) {
        if (panelsRuntime && panelsRuntime.wireIpLibraryPanel) {
          panelsRuntime.wireIpLibraryPanel(rootEl);
        }
      };
      window.NetReconNewUI.wireNetworkMonitorLeftPanel = function (rootEl) {
        if (panelsRuntime && panelsRuntime.wireNetworkMonitorLeftPanel) {
          panelsRuntime.wireNetworkMonitorLeftPanel(rootEl);
        }
      };
      window.NetReconNewUI.wireMailXssTesterLibrary = function (rootEl) {
        if (panelsRuntime && panelsRuntime.wireMailXssTesterLibrary) {
          panelsRuntime.wireMailXssTesterLibrary(rootEl);
        }
      };
      window.NetReconNewUI.wireMailXssTesterResults = function (rootEl) {
        if (panelsRuntime && panelsRuntime.wireMailXssTesterResults) {
          panelsRuntime.wireMailXssTesterResults(rootEl);
        }
      };
      window.NetReconNewUI.wireBrowserNetworkPanel = function (rootEl) {
        if (panelsRuntime && panelsRuntime.wireBrowserNetworkPanel) {
          panelsRuntime.wireBrowserNetworkPanel(rootEl);
        }
      };
      window.NetReconNewUI.wireGoogleDorkLibrary = function (rootEl) {
        if (panelsRuntime && panelsRuntime.wireGoogleDorkLibrary) {
          panelsRuntime.wireGoogleDorkLibrary(rootEl);
        }
      };
      window.NetReconNewUI.wireGoogleDorkTemplates = function (rootEl) {
        if (panelsRuntime && panelsRuntime.wireGoogleDorkTemplates) {
          panelsRuntime.wireGoogleDorkTemplates(rootEl);
        }
      };
      window.NetReconNewUI.wireWifiLibrary = function (rootEl) {
        if (panelsRuntime && panelsRuntime.wireWifiLibrary) {
          panelsRuntime.wireWifiLibrary(rootEl);
        }
      };
      window.NetReconNewUI.wireWifiAdapter = function (rootEl) {
        if (panelsRuntime && panelsRuntime.wireWifiAdapter) {
          panelsRuntime.wireWifiAdapter(rootEl);
        }
      };
      window.NetReconNewUI.wireWifiCurrent = function (rootEl) {
        if (panelsRuntime && panelsRuntime.wireWifiCurrent) {
          panelsRuntime.wireWifiCurrent(rootEl);
        }
      };
      window.NetReconNewUI.wireHttpsAuditorLibrary = function (rootEl) {
        if (panelsRuntime && panelsRuntime.wireHttpsAuditorLibrary) {
          panelsRuntime.wireHttpsAuditorLibrary(rootEl);
        }
      };
      // Exposed for navigation-runtime.js's activateGenericContent() LS/RS
      // fallback - reuses CS's own buildDetailHtml()/wireToolRuntime()
      // (panel-content-runtime.js/panels-runtime.js) as-is, already proven
      // safe against an arbitrary root (detached/floating tool windows),
      // so every CS-only tool becomes section-movable without a dedicated
      // LS/RS render function. stripIds() mirrors the same treatment CS
      // already gives detached windows' HTML - without it, a tool with
      // fixed ids (e.g. versions' #v1VersionTrack) open in both CS and
      // LS/RS at once would duplicate that id in the live DOM.
      window.NetReconNewUI.buildDetailHtml = function (tool) {
        if (!panelsRuntime || !panelsRuntime.buildDetailHtml) return "";
        var html = panelsRuntime.buildDetailHtml(tool);
        return panelsRuntime.stripIds ? panelsRuntime.stripIds(html) : html;
      };
      window.NetReconNewUI.wireToolRuntime = function (tool, rootEl) {
        if (panelsRuntime && panelsRuntime.wireToolRuntime) {
          panelsRuntime.wireToolRuntime(tool, rootEl);
        }
      };
      // Exposed for panel-interactions-runtime.js's "Manage AI Tools &
      // Permissions..." button (General settings) - opens a CS tab from a
      // button click the same way the Port Presets button already does,
      // just via this flat bridge instead of a deps-threaded reference
      // (switchTool isn't otherwise passed into that file's deps object).
      window.NetReconNewUI.switchTool = function (tool) {
        if (panelsRuntime && panelsRuntime.switchTool) {
          panelsRuntime.switchTool(tool);
        }
      };
      // Same flat-bridge reasoning as switchTool above, for the AI tool-
      // calling engine's "close_tool_tab" handler (ai-tools/ai-tools-
      // handlers.js) - panelsRuntime already exposes the underlying
      // function as closeCenterTool.
      window.NetReconNewUI.closeToolTab = function (tool) {
        if (panelsRuntime && panelsRuntime.closeCenterTool) {
          panelsRuntime.closeCenterTool(tool);
        }
      };
      // LS/RS equivalents of switchTool/closeToolTab above, for tool ids
      // whose ui flags mark them showInLeftPanel/showInRightPanel rather
      // than showAsTab (center) - switchTool() only ever handles center
      // tabs, so without these the AI tool-calling engine had no way to
      // open/close anything living in the left sidebar or right settings
      // panel (e.g. "language-manager" only has showAsTab, but
      // "ip-library"/"scan-runner" are LS, "email-recon-config" is RS-only).
      window.NetReconNewUI.openToolInSection = function (tool) {
        if (navigationRuntime && navigationRuntime.activateToolInItsConfiguredSection) {
          navigationRuntime.activateToolInItsConfiguredSection(tool);
        }
      };
      window.NetReconNewUI.closeToolInSection = function (tool, section) {
        if (!navigationRuntime) return;
        if (section === "left" && navigationRuntime.setSidebarTabOpen) {
          navigationRuntime.setSidebarTabOpen(tool, false);
        } else if (section === "right" && navigationRuntime.setRightTabOpen) {
          navigationRuntime.setRightTabOpen(tool, false);
        }
      };
      window.NetReconNewUI.getOpenLeftTools = function () {
        return navigationRuntime && navigationRuntime.getOpenLeftTools ? navigationRuntime.getOpenLeftTools() : [];
      };
      window.NetReconNewUI.getOpenRightTools = function () {
        return navigationRuntime && navigationRuntime.getOpenRightTools ? navigationRuntime.getOpenRightTools() : [];
      };
      window.NetReconNewUI.hasTool = function (tool) {
        return !!(panelsRuntime && panelsRuntime.hasTool && panelsRuntime.hasTool(tool));
      };
      // hasTool() above answers "does this id exist anywhere in the tool
      // catalog" (LS/RS/CS all lumped together) - these two answer the
      // narrower, more reliable question ai-tools-handlers.js actually
      // needs: "did switch/close actually take effect on a real center
      // tab". Checking this after calling switchTool/closeToolTab is what
      // lets the AI be told the honest truth when it's handed an id that
      // isn't a center tab at all (e.g. an RS-only settings pane).
      window.NetReconNewUI.getActiveTool = function () {
        return panelsRuntime && panelsRuntime.getActiveTool ? panelsRuntime.getActiveTool() : null;
      };
      window.NetReconNewUI.getOpenCenterTools = function () {
        return panelsRuntime && panelsRuntime.getOpenCenterTools ? panelsRuntime.getOpenCenterTools() : [];
      };
      // Lets a successful AI-triggered email-recon lookup (ai-tools-
      // handlers.js) paint its result into the CS tab the same way the
      // manual Start button does - see applyEmailReconResult() in
      // panel-interactions-runtime.js.
      window.NetReconNewUI.applyEmailReconResult = function (email, result) {
        if (panelsRuntime && panelsRuntime.applyEmailReconResult) {
          panelsRuntime.applyEmailReconResult(email, result);
        }
      };
      // Same reasoning again - ai-tools-handlers.js is a flat singleton
      // module (like macros-runtime.js/email-recon-runtime.js's config
      // half), not a deps-threaded factory, so it has no other way to
      // reach the current tr().
      window.NetReconNewUI.tr = tr;

      // =========================
      // 1) Tool metadata + routing
      // =========================
      const uiDefinitions = core.uiDefinitions || {
        menuGroups: {},
        menuActions: {},
        panelDefinitions: {},
      };
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
        "new-session": "New",
        "save-session": "Save",
        "save-session-as": "Save as...",
        "load-session": "Open",
        "close-session": "Close",
        "import-another-session": "Import (mock)",
        exit: "Exit",
        countries: "Country IP Library", // ip-scanner tool
        presets: "Port Presets", // ip-scanner tool
        defaults: "Default Scan Values", // ip-scanner tool
        language: "Language manager",
        customization: "Import Tool",
        versions: "Versions",
        download: "Download",
        about: "About",
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
      // Tools-menu item, and Options-menu button below (syncExtensionOptionsMenuUi).
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

        // ui.openWithTools (optional) lets one entry point - a single Tools-
        // menu click, activity-bar icon, etc. - open several related tools
        // together (e.g. a left-panel input tool paired with its own
        // center-tab results tool), instead of the results tab only ever
        // appearing after the first action runs. Each listed key goes
        // through this SAME function, so it's opened into whichever
        // surface(s) ITS OWN ui flags declare, exactly as if it had been
        // opened directly.
        const alsoOpen = Array.isArray(toolUi.openWithTools) ? toolUi.openWithTools : [];
        alsoOpen.forEach((otherKey) => {
          if (otherKey && otherKey !== toolKey) openExtensionTool(otherKey);
        });
      }

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
      window.NetReconNewUI.renderExtIcon = renderExtIcon;

      // shell: extension-contributed Options-menu entries (contributions.
      // optionsMenu), each opening a list of that extension's own tool keys
      // via whichever surface (LS/RS/CS) their own ui flags declare. Each
      // button gets a direct click listener closing over the real manifest
      // id/entry def - no string-encoded action id, so there's nothing for
      // an extension id containing a colon (or any other character) to break.
      // Independent of syncExtensionToolUi()'s entries.length early-return,
      // since an extension may contribute only an optionsMenu and no tools.
      function syncExtensionOptionsMenuUi() {
        const optionsDropdown = document.querySelector('.v1-menu-group[data-menu="options"] .v1-menu-dropdown');
        if (!optionsDropdown || !extensionHost || !extensionHost.getInstalledManifests) return;

        extensionHost.getInstalledManifests().forEach((manifest) => {
          const optionsMenu = manifest.contributions && manifest.contributions.optionsMenu;
          if (!optionsMenu || typeof optionsMenu !== "object") return;
          Object.keys(optionsMenu).forEach((actionKey) => {
            const entryDef = optionsMenu[actionKey] || {};
            const btn = document.createElement("button");
            btn.className = "v1-menu-dd-item";
            btn.setAttribute("data-dynamic-extension", "1");
            const label = document.createElement("span");
            label.textContent = String(entryDef.label || actionKey);
            const shortcut = document.createElement("span");
            shortcut.className = "shortcut";
            btn.appendChild(label);
            btn.appendChild(shortcut);
            btn.addEventListener("click", function () {
              document.querySelectorAll(".v1-menu-group.open").forEach(function (group) {
                group.classList.remove("open");
              });
              const openTools = Array.isArray(entryDef.openTools) ? entryDef.openTools : [];
              openTools.forEach(function (toolKey) { openExtensionTool(toolKey); });
              if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + (entryDef.label || actionKey));
            });
            optionsDropdown.appendChild(btn);
          });
        });
      }

      function syncExtensionToolUi() {
        clearDynamicExtensionUi();
        syncExtensionOptionsMenuUi();

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
        const sidebarEl = document.querySelector('.v1-left-content');
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
            renderExtIcon(icon, entry.icon);

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

          // Any center-tab extension tool lands here by default (a generic
          // "IP Scanner sub-tool" shortcut list) unless it opts out via
          // ui.showInScannerList: false - needed for a tool that's really a
          // RESULTS view for a separate left-panel input tool (e.g. this
          // addon's own CS results tab), where a second shortcut duplicating
          // the Tools-menu entry would just be redundant clutter.
          if (scannerToolList && entry.ui.showInLeftPanel !== true && entry.ui.showInRightPanel !== true && entry.ui.showAsTab !== false && entry.ui.showInScannerList !== false) {
            const li = document.createElement("li");
            li.className = "v1-extension-tool-item";
            li.setAttribute("data-tool", entry.key);
            li.setAttribute("data-dynamic-extension", "1");
            renderExtIcon(li, entry.icon);
            li.appendChild(document.createTextNode(" " + entry.title));
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

            // Click handling (activate / close) is delegated generically
            // from navigation-runtime.js's bindRightTabsAndAssistant(), not
            // bound per-element here - it matches any .v1-right-tab /
            // [data-right-tab-close] regardless of when the element was
            // created, so no explicit listener is needed on these.
            const tabBtn = document.createElement("button");
            tabBtn.className = "v1-right-tab";
            tabBtn.setAttribute("data-v1-right-tab", entry.key);
            tabBtn.setAttribute("type", "button");
            tabBtn.textContent = entry.title;

            const tabClose = document.createElement("span");
            tabClose.className = "v1-right-tool-tab-close";
            tabClose.setAttribute("data-right-tab-close", "true");
            tabClose.setAttribute("data-tool", entry.key);
            tabClose.setAttribute("role", "button");
            tabClose.setAttribute("tabindex", "-1");
            tabClose.setAttribute("aria-label", tr("tabCloseAria"));
            tabClose.textContent = "×";

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

      let activeTool = store ? store.getState().activeTool : "scan-runner";

      function scrollTabTrackToElement(element) {
        if (!element || !tabsTrack) return;
        // Physical bounding-rect delta + scrollBy(), not an absolute scrollLeft
        // assignment - under RTL, Chromium's scrollLeft range/sign convention
        // differs from LTR (0 sits at the physical right edge, valid values go
        // negative), so clamping to [0, scrollWidth-clientWidth] like before
        // silently no-ops under RTL. A relative physical delta via scrollBy()
        // shifts the viewport the same way regardless of direction.
        const trackRect = tabsTrack.getBoundingClientRect();
        const elRect = element.getBoundingClientRect();
        const delta = (elRect.left + elRect.width / 2) - (trackRect.left + trackRect.width / 2);
        if (Math.abs(delta) < 2) return;
        tabsTrack.scrollBy({ left: delta });
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
        const trackRect = tabsTrack.getBoundingClientRect();

        // Physically leftmost/rightmost visible tab - NOT DOM order
        // (visibleTabs[0]/[length-1]), which only matches physical
        // left-to-right order under LTR. Under RTL the tab strip's flex
        // order reverses (DOM-first tab renders visually rightmost), so
        // picking by DOM position checked the wrong tab against the wrong
        // edge and made the scroll-arrow overlays appear/intercept clicks
        // where they shouldn't.
        let leftmostRect = null;
        let rightmostRect = null;
        const visibleTabsWidth = visibleTabs.reduce(function (sum, tab) {
          const rect = tab.getBoundingClientRect();
          if (!leftmostRect || rect.left < leftmostRect.left) leftmostRect = rect;
          if (!rightmostRect || rect.right > rightmostRect.right) rightmostRect = rect;
          return sum + Math.ceil(rect.width || tab.offsetWidth || 0);
        }, 0);
        const hasLeftOverflow = !!(leftmostRect && leftmostRect.left < trackRect.left - 1);
        const hasRightOverflow = !!(rightmostRect && rightmostRect.right > trackRect.right + 1);
        const maxScrollLeft = Math.max(0, Math.ceil((tabsTrack.scrollWidth || 0) - (tabsTrack.clientWidth || 0)));
        const widthOverflow = visibleTabsWidth > (tabsTrack.clientWidth || 0) + 2;
        const hasOverflow = widthOverflow || maxScrollLeft > 1 || hasLeftOverflow || hasRightOverflow;

        if (tabsShell) {
          tabsShell.classList.toggle('has-overflow', hasOverflow);
        }

        if (tabsScrollLeftBtn && tabsScrollRightBtn) {
          // Physical hasLeftOverflow/hasRightOverflow (from bounding rects,
          // computed above) rather than comparing tabsTrack.scrollLeft against
          // a [0, max] range - under RTL, Chromium's scrollLeft for this
          // container is 0-or-negative (spec range is [-max, 0]), so that
          // range check permanently disabled the left arrow and never
          // disabled the right one. The physical flags are direction-agnostic.
          tabsScrollLeftBtn.disabled = !hasOverflow || !hasLeftOverflow;
          tabsScrollRightBtn.disabled = !hasOverflow || !hasRightOverflow;
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

      function applyCidrValue(cidrStr) {
        if (!ipInputsRuntime || !ipInputsRuntime.applyCidrValue) return false;
        return ipInputsRuntime.applyCidrValue(cidrStr);
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

      const ipInputsRuntimeFactory = runtimeFactory.createIpInputsRuntime
        ? runtimeFactory.createIpInputsRuntime({ tr })
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

      const sessionSqliteRuntime = runtimeFactory.createSessionSqliteRuntime
        ? runtimeFactory.createSessionSqliteRuntime()
        : null;

      const sessionRuntime = runtimeFactory.createSessionRuntime
        ? runtimeFactory.createSessionRuntime({
            tr,
            platform,
            setStatusLine,
            panelsRuntime,
            switchTool,
            getNavigationRuntime: function () { return navigationRuntime; },
            refreshCustomScrollbars: function () { refreshCustomScrollbars(); },
            sessionSqlite: sessionSqliteRuntime,
            extensionHost: extensionHost,
          })
        : null;

      const menuRuntime = runtimeFactory.createMenuRuntime
        ? runtimeFactory.createMenuRuntime({
            tr,
            platform,
            uiDefinitions,
            getActionMap,
            setStatusLine,
            onOpenLanguageManager: openLanguageManager,
            onSwitchTool: switchTool,
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
        window.NetReconNewUI = window.NetReconNewUI || {};
        window.NetReconNewUI.openConfirmDialog = menuRuntime.openConfirmDialog;
        window.NetReconNewUI.openUpdateDialog = menuRuntime.openUpdateDialog;
        window.NetReconNewUI.openStartupDisclaimerDialog = menuRuntime.openStartupDisclaimerDialog;
      }

      const navigationRuntimeFactory = runtimeFactory.createNavigationRuntime
        ? runtimeFactory.createNavigationRuntime({
            tr,
            platform,
            switchTool,
            setStatusLine,
            runMenuAction: (menuRuntime && menuRuntime.runMenuAction) ? menuRuntime.runMenuAction : runMenuAction,
            getScannerSidebarRuntime: function () { return scannerSidebarRuntime; },
            refreshDetachedTool: (panelsRuntime && panelsRuntime.refreshDetachedTool) ? panelsRuntime.refreshDetachedTool : function () { return false; },
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
            applyCidrValue,
          })
        : null;

      emailReconRuntime = runtimeFactory.createEmailReconRuntime
        ? runtimeFactory.createEmailReconRuntime({ tr, setStatusLine })
        : null;
      // Flat global, same as core.platform/core.generalSettings - lets
      // panel-interactions-runtime.js's wireEmailReconTool reach
      // addEmailHistory()/isValidEmail() without threading it through the
      // panels-runtime.js -> panel-interactions-runtime.js deps chain.
      if (emailReconRuntime) core.emailReconRuntime = emailReconRuntime;

      const powerShellConsoleRuntimeFactory = runtimeFactory.createPowerShellConsoleRuntime
        ? runtimeFactory.createPowerShellConsoleRuntime({
            tr,
            platform,
            setStatusLine,
          })
        : null;

      try {
        if (localStorage.getItem("netrecon_blur_ip") === "1") {
          document.body.classList.add("v1-blur-ip");
        }
      } catch (_) {}

      applyStaticTranslations();
      applyMenuAndPanelDefinitions();
      setTooltips();
      initMenuBar();
      initMenuActions();
      initDisabledShortcuts();
      initSegmentedIpInputs();
      initCenterTabsScrollButtons();
      if (scannerSidebarRuntime && scannerSidebarRuntime.init) {
        scannerSidebarRuntime.init();
      }
      if (emailReconRuntime && emailReconRuntime.init) {
        emailReconRuntime.init();
      }
      if (powerShellConsoleRuntimeFactory && powerShellConsoleRuntimeFactory.init) {
        powerShellConsoleRuntime = powerShellConsoleRuntimeFactory.init();
      }
      initResizableLayout();
      initCustomScrollbars();

      // General settings -> "Remember window state": the window always
      // launches maximized (tauri.conf.json), so calling the matching
      // native toggle exactly once deterministically reaches "normal" or
      // "fullscreen" if that's what was last saved (see menu-runtime.js's
      // persistWindowState). Reuses the existing toggle commands - already
      // fix the frameless work-area bug - instead of duplicating that logic
      // here. No-op on www (no native window to toggle).
      if (platform && typeof platform.getInvoke === "function" && platform.getInvoke()) {
        try {
          var savedWindowState = window.localStorage ? window.localStorage.getItem("netrecon_window_state_v1") : "";
          if (savedWindowState === "fullscreen") {
            platform.invoke("window_toggle_fullscreen").catch(function () {});
          } else if (savedWindowState === "normal") {
            platform.invoke("window_toggle_maximize").catch(function () {});
          }
        } catch (_) {}
      }

      switchTool(initialActiveTool);

      var hadPendingReload = sessionRuntime && sessionRuntime.restoreLayoutAfterReload
        ? !!sessionRuntime.restoreLayoutAfterReload()
        : false;

      function revealUi() {
        if (!document.body) return;
        document.body.style.visibility = "visible";
        document.body.setAttribute("data-v1-ready", "true");
      }

      function revealUiNextFrame() {
        requestAnimationFrame(revealUi);
      }

      function finishBootReveal() {
        if (sessionRuntime && sessionRuntime.initWelcomeView) {
          sessionRuntime.initWelcomeView();
        }
        if (document.fonts && document.fonts.ready) {
          Promise.race([
            document.fonts.ready,
            new Promise(function (resolve) { setTimeout(resolve, 220); })
          ]).then(revealUiNextFrame).catch(revealUiNextFrame);
        } else {
          revealUiNextFrame();
        }
      }

      // General settings (TBM Options -> General) -> "Auto Load last
      // session": desktop-only (www can't read a session file by path
      // without a live user gesture, see loadSessionFromPath). Runs before
      // revealUi/initWelcomeView so a successful auto-load's reload happens
      // while the app is still hidden (body.v1-preload-hidden) - no flash of
      // the empty welcome screen. hadPendingReload guards against re-loading
      // right after a manual save/load already triggered one.
      var autoLoadPath = "";
      if (!hadPendingReload && platform && typeof platform.getInvoke === "function" && platform.getInvoke()
          && core.generalSettings && typeof core.generalSettings.getState === "function"
          && core.generalSettings.getState().autoLoadLastSession
          && sessionRuntime && typeof sessionRuntime.getMostRecentPath === "function") {
        autoLoadPath = sessionRuntime.getMostRecentPath();
      }

      // General settings -> "Remember open tabs": which LS/RS/CS tabs were
      // open (and which was active in each section) when the app was last
      // closed via its own Exit/close action - independent of any saved
      // session file. Skipped when a session is about to auto-load instead
      // (that session's own saved layout takes priority) or right after a
      // manual save/load reload (which just restored its own layout).
      if (!hadPendingReload && !autoLoadPath && sessionRuntime && typeof sessionRuntime.applyLayout === "function") {
        try {
          var savedTabsRaw = window.localStorage ? window.localStorage.getItem("netrecon_open_tabs_v1") : "";
          if (savedTabsRaw) sessionRuntime.applyLayout(JSON.parse(savedTabsRaw));
        } catch (_) {}
      }

      if (autoLoadPath) {
        sessionRuntime.loadSessionFromPath(autoLoadPath).then(function (ok) {
          if (!ok) finishBootReveal();
          // ok === true: window.location.reload() already fired inside
          // applyLoadedSessionData; nothing else to do this boot.
        });
      } else {
        finishBootReveal();
      }

      // General settings -> "Check for updates on startup": fire-and-forget,
      // never blocks UI reveal. Compares the running build's version against
      // the latest GitHub release and shows a dialog (via openConfirmDialog,
      // wired below) if a newer one is available.
      var updateCheckRuntime = runtimeFactory.createUpdateCheckRuntime
        ? runtimeFactory.createUpdateCheckRuntime({ tr, platform, generalSettings: core.generalSettings, setStatusLine })
        : null;
      if (updateCheckRuntime && updateCheckRuntime.checkForUpdate) {
        updateCheckRuntime.checkForUpdate();
      }

      // General settings -> "Show amateur-project disclaimer on startup":
      // fire-and-forget like the update check above, shown after UI reveal -
      // a liability-style notice, not a blocking gate on using the app.
      // Checking the dialog's own "don't show again" box persists the same
      // showStartupDisclaimer=false back into generalSettings, so Options ->
      // General's checkbox and the dialog's checkbox stay in sync either way.
      if (core.generalSettings && typeof core.generalSettings.getState === "function"
          && core.generalSettings.getState().showStartupDisclaimer
          && window.NetReconNewUI && window.NetReconNewUI.openStartupDisclaimerDialog) {
        window.NetReconNewUI.openStartupDisclaimerDialog(
          tr("startupDisclaimerTitle"),
          tr("startupDisclaimerMessage"),
          tr("startupDisclaimerDontShowAgain"),
          tr("startupDisclaimerOk")
        ).then(function (result) {
          if (result && result.checkboxChecked && core.generalSettings && typeof core.generalSettings.replaceState === "function") {
            var next = core.generalSettings.getState();
            next.showStartupDisclaimer = false;
            core.generalSettings.replaceState(next);
          }
        });
      }

      window.NetReconNewUI = window.NetReconNewUI || {};
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

        // data-force-external opts a link out of the .md interception below
        // - e.g. the Markdown viewer's own "Open in browser" link, whose
        // href is itself a .md URL and would otherwise just reopen the same
        // doc in the same tab instead of actually leaving the app.
        if (!link.hasAttribute("data-force-external")) {
          // A link that clearly points to a .md file opens in the in-app
          // Markdown viewer CS tab instead of the system browser - see
          // markdown-viewer-runtime.js's isMarkdownLink()/openDoc().
          if (window.NetReconNewUI && window.NetReconNewUI.isMarkdownLink && window.NetReconNewUI.openMarkdownDoc
              && window.NetReconNewUI.isMarkdownLink(href)) {
            event.preventDefault();
            window.NetReconNewUI.openMarkdownDoc(href);
            return;
          }
        }

        event.preventDefault();
        openExternalUrl(href);
      });

      document.addEventListener("click", () => {
        requestAnimationFrame(() => {
          refreshCustomScrollbars();
        });
      });

      window.addEventListener("netrecon:language-changed", refreshLanguageUi);

      // Collapsible sidebar sections - delegated on document rather than
      // bound per-element at boot time, since most LS/RS panel content
      // (ShellCraft/Topology included, not just the newer tools) only
      // renders once its own tool is actually opened/rebuilt, well after
      // this file's own boot-time querySelectorAll ran - a per-element
      // binding at boot could only ever reach whatever .v1-section-header
      // elements happened to already exist in the DOM at that instant,
      // which for lazily-mounted panels is effectively none. Delegation
      // works for every header regardless of when it's added.
      document.addEventListener('click', function (e) {
        var header = e.target.closest('.v1-section-header');
        if (!header) return;
        if (e.target.closest('button, input, select, textarea, a')) return;
        var li = header.closest('li');
        if (li) li.classList.toggle('v1-collapsed');
      });
    })();
