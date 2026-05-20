(function () {
  function createPanelsRuntime(deps) {
    var tr = deps.tr;
    var getToolInfoMap = deps.getToolInfoMap;
    var versionsData = Array.isArray(deps.versionsData) ? deps.versionsData : [];
    var store = deps.store;
    var extensionHost = deps.extensionHost;
    var i18n = deps.i18n;
    var applyStaticTranslations = deps.applyStaticTranslations;
    var onAfterRender = deps.onAfterRender;
    var setStatusLine = deps.setStatusLine;
    var activeTool = deps.initialActiveTool || "scan-runner";

    function escapeHtml(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function infoFor(tool) {
      var tools = getToolInfoMap ? getToolInfoMap() : {};
      return tools[tool] || tools["scan-runner"] || {
        title: "Scan Runner",
        text: "",
        points: []
      };
    }

    function setTooltips() {
      document.querySelectorAll("[data-tool]").forEach(function (el) {
        var tool = el.getAttribute("data-tool");
        if (!tool) return;
        var info = infoFor(tool);
        var tip = info.title + " - " + info.text;
        el.setAttribute("title", tip);
        el.setAttribute("aria-label", tip);
      });

      document.querySelectorAll(".v1-tab").forEach(function (el) {
        var titleEl = el.querySelector(".v1-tab-title");
        var txt = titleEl ? (titleEl.textContent || "").trim() : (el.textContent || "").trim();
        if (!txt) return;
        if (!el.getAttribute("title")) {
          el.setAttribute("title", tr("tabPrefix") + ": " + txt);
        }
      });
    }

    function updateEmptyState() {
      var tabs = Array.from(document.querySelectorAll(".v1-tab"));
      var hasOpenTabs = tabs.some(function (t) { return !t.classList.contains("tab-closed"); });
      var emptyState = document.getElementById("v1NoTabsState");
      var mainCard = document.getElementById("v1MainCard");

      if (emptyState) {
        if (hasOpenTabs) emptyState.setAttribute("hidden", "hidden");
        else emptyState.removeAttribute("hidden");
      }

      if (mainCard) {
        if (hasOpenTabs) mainCard.removeAttribute("hidden");
        else mainCard.setAttribute("hidden", "hidden");
      }
    }

    function initWorkbenchTabs() {
      var tabs = Array.from(document.querySelectorAll(".v1-tab"));
      if (!tabs.length) return;

      function closeTab(tabEl) {
        if (!tabEl) return;
        tabEl.classList.add("tab-closed");
        tabEl.setAttribute("hidden", "hidden");

        if (!tabEl.classList.contains("active")) {
          updateEmptyState();
          return;
        }

        var next = tabs.find(function (t) { return !t.classList.contains("tab-closed"); });
        if (!next) {
          updateEmptyState();
          return;
        }

        var tool = next.getAttribute("data-tool");
        if (tool) {
          switchTool(tool);
        }

        updateEmptyState();
      }

      tabs.forEach(function (tabEl) {
        var close = tabEl.querySelector("[data-tab-close]");
        if (!close) return;

        close.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          closeTab(tabEl);
        });
      });

      updateEmptyState();
    }

    function renderDefaultTool(tool) {
      var info = infoFor(tool);
      var points = (info.points || []).map(function (p) { return "<li>" + escapeHtml(p) + "</li>"; }).join("");
      return "<h4>" + escapeHtml(info.title) + "</h4><div>" + escapeHtml(info.text) + "</div><ul>" + points + "</ul>";
    }

    function renderVersionsTool() {
      if (!versionsData.length) {
        return "<h4>Versions</h4><div>No version entries available.</div>";
      }

      var entriesHtml = versionsData.map(function (entry) {
        var notes = (entry.notes || []).map(function (note) { return "<li>" + escapeHtml(note) + "</li>"; }).join("");
        return "<section class=\"v1-version-entry\"><h4>" + escapeHtml(entry.version) + "</h4><ul>" + notes + "</ul></section>";
      }).join("");
      return "<div class=\"v1-versions-list\">" + entriesHtml + "</div>";
    }

    function renderLanguageManagerTool() {
      var current = document.documentElement.getAttribute("lang") || "en";
      var langList = [];
      try {
        langList = i18n && i18n.listLanguages ? i18n.listLanguages() : [];
      } catch (_) {
        langList = [];
      }
      var langOptions = langList.map(function (code) {
        return "<option value=\"" + escapeHtml(code) + "\">" + escapeHtml(code) + "</option>";
      }).join("");
      var dictPlaceholder = "{\n  \"menuFile\": \"Datei\",\n  \"menuOptions\": \"Optionen\",\n  \"menuTools\": \"Werkzeuge\",\n  \"menuHelp\": \"Hilfe\"\n}";

      return [
        "<div class=\"v1-lang-manager\">",
        "<div class=\"v1-lang-manager-head\">",
        "<div>",
        "<h4 style=\"margin:0 0 4px;\">" + tr("langManagerTitle") + "</h4>",
        "<div class=\"v1-lang-manager-note\">" + tr("langListHeader") + ": " + current + "</div>",
        "</div>",
        "</div>",
        "<div class=\"v1-lang-manager-grid\">",
        "<label for=\"v1LangTabSelect\">" + tr("langListHeader") + "</label>",
        "<select id=\"v1LangTabSelect\">" + langOptions + "</select>",
        "<label for=\"v1LangTabCode\">" + tr("langCodeLabel") + "</label>",
        "<input id=\"v1LangTabCode\" type=\"text\" autocomplete=\"off\" placeholder=\"" + tr("langCodePlaceholder") + "\" />",
        "<label for=\"v1LangTabDict\">" + tr("langDictLabel") + "</label>",
        "<textarea id=\"v1LangTabDict\" spellcheck=\"false\" placeholder=\"" + dictPlaceholder.replace(/\"/g, '&quot;') + "\"></textarea>",
        "</div>",
        "<div class=\"v1-lang-manager-actions\">",
        "<button type=\"button\" data-lang-action=\"add\">" + tr("langAddBtn") + "</button>",
        "<button type=\"button\" data-lang-action=\"activate\">" + tr("langActivateBtn") + "</button>",
        "<button type=\"button\" data-lang-action=\"list\">" + tr("langListBtn") + "</button>",
        "</div>",
        "<pre id=\"v1LangTabOutput\" class=\"v1-lang-manager-output\"></pre>",
        "</div>"
      ].join("");
    }

    function renderImportTool() {
      var tools = [];
      try {
        tools = extensionHost && extensionHost.listExtensions ? extensionHost.listExtensions() : [];
      } catch (_) {
        tools = [];
      }

      var listHtml = tools.length
        ? tools.map(function (item) {
            return "<div class=\"v1-import-item\"><strong>" + escapeHtml(item.id) + "</strong> <span>@ " + escapeHtml(item.version) + "</span><div>" + escapeHtml(item.name) + "</div></div>";
          }).join("")
        : "<div class=\"v1-import-empty\">No imported tools yet.</div>";

      return [
        "<div class=\"v1-import-manager\">",
        "<div class=\"v1-import-manager-head\">",
        "<h4 style=\"margin:0 0 4px;\">" + tr("tipActionCustomization") + "</h4>",
        "<div class=\"v1-import-manager-note\">JSON manifest import, list and uninstall.</div>",
        "</div>",
        "<div class=\"v1-import-manager-grid\">",
        "<label for=\"v1ImportManifest\">Manifest JSON</label>",
        "<textarea id=\"v1ImportManifest\" spellcheck=\"false\" placeholder=\"{\n  \"id\": \"com.example.demo\"\n}\"></textarea>",
        "<label for=\"v1ImportUninstallId\">Tool id to uninstall</label>",
        "<input id=\"v1ImportUninstallId\" type=\"text\" autocomplete=\"off\" placeholder=\"com.example.demo\" />",
        "</div>",
        "<div class=\"v1-import-manager-actions\">",
        "<button type=\"button\" data-import-action=\"install\">Import</button>",
        "<button type=\"button\" data-import-action=\"list\">List</button>",
        "<button type=\"button\" data-import-action=\"uninstall\">Uninstall</button>",
        "</div>",
        "<div class=\"v1-import-manager-options\">",
        "<label><input id=\"v1ImportAddMenu\" type=\"checkbox\" checked /> " + tr("importOptToolsMenu") + "</label>",
        "<label><input id=\"v1ImportAddActivity\" type=\"checkbox\" /> " + tr("importOptActivityIcon") + "</label>",
        "</div>",
        "<div id=\"v1ImportOutput\" class=\"v1-import-output\">" + listHtml + "</div>",
        "</div>"
      ].join("");
    }

    function renderResultsManage() {
      return [
        "<div class=\"v1-results-actions\">",
        "<button class=\"v1-res-btn\">📤 Export JSON</button>",
        "<button class=\"v1-res-btn\">📥 Import JSON</button>",
        "<button class=\"v1-res-btn v1-res-btn--danger\">🗑 Wyczyść wyniki</button>",
        "</div>",
        "<h4 style=\"margin:14px 0 8px\">Ostatnie operacje</h4>",
        "<table class=\"v1-results-table\">",
        "<thead><tr><th>Czas</th><th>Operacja</th><th>Plik</th></tr></thead>",
        "<tbody><tr><td colspan=\"3\" class=\"v1-results-empty\">Brak zapisanych operacji.</td></tr></tbody>",
        "</table>"
      ].join("");
    }

    function renderResultsIp() {
      return [
        "<div class=\"v1-results-meta-row\">",
        "<span>Hosty: <b id=\"resIpHostCount\">–</b></span>",
        "<span>Otwarte porty: <b id=\"resIpPortCount\">–</b></span>",
        "</div>",
        "<table class=\"v1-results-table\">",
        "<thead><tr><th>IP</th><th>Nazwa hosta</th><th>Otwarte porty</th><th>Status</th></tr></thead>",
        "<tbody><tr><td colspan=\"4\" class=\"v1-results-empty\">Brak wyników skanowania IP.</td></tr></tbody>",
        "</table>"
      ].join("");
    }

    function renderResultsWifi() {
      return [
        "<table class=\"v1-results-table\">",
        "<thead><tr><th>SSID</th><th>BSSID</th><th>Sygnał (dBm)</th><th>Kanał</th></tr></thead>",
        "<tbody><tr><td colspan=\"4\" class=\"v1-results-empty\">Brak wykrytych sieci WiFi.</td></tr></tbody>",
        "</table>"
      ].join("");
    }

    function renderResultsBt() {
      return [
        "<table class=\"v1-results-table\">",
        "<thead><tr><th>Nazwa</th><th>Adres</th><th>RSSI</th><th>Typ</th></tr></thead>",
        "<tbody><tr><td colspan=\"4\" class=\"v1-results-empty\">Brak wykrytych urządzeń Bluetooth.</td></tr></tbody>",
        "</table>"
      ].join("");
    }

    var toolRenderers = {
      versions: renderVersionsTool,
      "import-tool": renderImportTool,
      "language-manager": renderLanguageManagerTool,
      "results-manage": renderResultsManage,
      "results-ip": renderResultsIp,
      "results-wifi": renderResultsWifi,
      "results-bt": renderResultsBt,
    };

    function buildDetailHtml(tool) {
      var renderer = toolRenderers[tool] || function () { return renderDefaultTool(tool); };
      return renderer();
    }

    function refreshActiveUI() {
      updateEmptyState();

      document.querySelectorAll("[data-tool]").forEach(function (el) {
        var isActive = el.getAttribute("data-tool") === activeTool;
        el.classList.toggle("active", isActive);
        if (el.tagName === "BUTTON") {
          el.setAttribute("aria-pressed", isActive ? "true" : "false");
        }
      });

      var v1Title = document.getElementById("v1ToolTitle");
      var v1Detail = document.getElementById("v1ToolDetail");
      var v1StatusRight = document.getElementById("v1StatusRight");
      var v1ScanMeta = document.getElementById("v1ScanMeta");
      var v1ScanActions = document.getElementById("v1ScanActions");
      var info = infoFor(activeTool);
      var isScanRunner = activeTool === "scan-runner";

      if (v1Title) v1Title.textContent = info.title;
      if (v1Detail) v1Detail.innerHTML = buildDetailHtml(activeTool);
      if (v1ScanMeta) {
        if (isScanRunner) {
          v1ScanMeta.removeAttribute("hidden");
          v1ScanMeta.style.display = "grid";
          v1ScanMeta.setAttribute("aria-hidden", "false");
        } else {
          v1ScanMeta.setAttribute("hidden", "hidden");
          v1ScanMeta.style.display = "none";
          v1ScanMeta.setAttribute("aria-hidden", "true");
        }
      }
      if (v1ScanActions) {
        if (isScanRunner) {
          v1ScanActions.removeAttribute("hidden");
          v1ScanActions.style.display = "flex";
          v1ScanActions.setAttribute("aria-hidden", "false");
        } else {
          v1ScanActions.setAttribute("hidden", "hidden");
          v1ScanActions.style.display = "none";
          v1ScanActions.setAttribute("aria-hidden", "true");
        }
      }
      if (typeof setStatusLine === "function") setStatusLine(tr("toolRoute") + ": " + activeTool);
      if (v1StatusRight) v1StatusRight.textContent = tr("active") + ": " + activeTool;
      if (typeof onAfterRender === "function") onAfterRender(activeTool);
      if (activeTool === "language-manager") {
        wireLanguageManagerButtons();
      }
      if (activeTool === "import-tool") {
        wireImportToolButtons();
      }
    }

    function wireImportToolButtons() {
      var root = document.getElementById("v1ToolDetail");
      if (!root) return;

      var manifestEl = document.getElementById("v1ImportManifest");
      var uninstallEl = document.getElementById("v1ImportUninstallId");
      var addMenuEl = document.getElementById("v1ImportAddMenu");
      var addActivityEl = document.getElementById("v1ImportAddActivity");
      var outputEl = document.getElementById("v1ImportOutput");

      if (manifestEl && !manifestEl.value.trim()) {
        manifestEl.value = "{\n  \"id\": \"com.example.demo\",\n  \"name\": \"Demo Extension\",\n  \"version\": \"0.1.0\",\n  \"contributions\": {\n    \"tools\": {},\n    \"menuActions\": {}\n  }\n}";
      }

      root.querySelectorAll("[data-import-action]").forEach(function (button) {
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";
        button.addEventListener("click", function () {
          var actionName = button.getAttribute("data-import-action");
          var manifestText = manifestEl ? (manifestEl.value || "{}").trim() : "{}";

          function listInstalled() {
            var items = extensionHost && extensionHost.listExtensions ? extensionHost.listExtensions() : [];
            if (!outputEl) return;
            outputEl.textContent = "";

            if (!items.length) {
              var emptyEl = document.createElement("div");
              emptyEl.className = "v1-import-empty";
              emptyEl.textContent = "No imported tools yet.";
              outputEl.appendChild(emptyEl);
              return;
            }

            items.forEach(function (item) {
              var itemEl = document.createElement("div");
              itemEl.className = "v1-import-item";

              var strong = document.createElement("strong");
              strong.textContent = item.id;
              itemEl.appendChild(strong);

              var ver = document.createElement("span");
              ver.textContent = "@ " + item.version;
              itemEl.appendChild(ver);

              var name = document.createElement("div");
              name.textContent = item.name;
              itemEl.appendChild(name);

              outputEl.appendChild(itemEl);
            });
          }

          if (actionName === "list") {
            listInstalled();
            if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("extListHeader"));
            return;
          }

          if (actionName === "uninstall") {
            var id = uninstallEl ? (uninstallEl.value || "").trim() : "";
            if (!id) {
              if (outputEl) outputEl.textContent = tr("extUninstallPrompt");
              return;
            }

            var removeResult = extensionHost && extensionHost.uninstallExtension ? extensionHost.uninstallExtension(id) : { ok: false, error: tr("extUninstallFail") };
            if (!removeResult.ok) {
              if (outputEl) outputEl.textContent = tr("extUninstallFail") + "\n" + removeResult.error;
              return;
            }

            listInstalled();
            if (outputEl) outputEl.textContent = tr("extUninstallOk") + "\n" + removeResult.id;
            if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("extUninstallOk") + " - " + removeResult.id);
            if (window.NetReconNewUI && typeof window.NetReconNewUI.syncExtensionToolUi === "function") {
              window.NetReconNewUI.syncExtensionToolUi();
            }
            refreshActiveUI();
            return;
          }

          if (!manifestText) {
            if (outputEl) outputEl.textContent = tr("extInvalidJson");
            return;
          }

          var manifest = null;
          try {
            manifest = JSON.parse(manifestText);
          } catch (_) {
            if (outputEl) outputEl.textContent = tr("extInvalidJson");
            return;
          }

          var addToMenu = !addMenuEl || !!addMenuEl.checked;
          var addToActivity = !!(addActivityEl && addActivityEl.checked);
          if (manifest && manifest.contributions && manifest.contributions.tools && typeof manifest.contributions.tools === "object") {
            Object.keys(manifest.contributions.tools).forEach(function (toolKey) {
              var meta = manifest.contributions.tools[toolKey] || {};
              meta.ui = meta.ui && typeof meta.ui === "object" ? meta.ui : {};
              meta.ui.showInToolsMenu = addToMenu;
              meta.ui.showInActivityBar = addToActivity;
              meta.ui.showInLeftPanel = true;
              meta.ui.showAsTab = true;
              manifest.contributions.tools[toolKey] = meta;
            });
          }

          var result = extensionHost && extensionHost.installExtension ? extensionHost.installExtension(manifest) : { ok: false, error: tr("extInstallFail") };
          if (!result.ok) {
            if (outputEl) outputEl.textContent = tr("extInstallFail") + "\n" + result.error;
            return;
          }

          if (outputEl) outputEl.textContent = tr("extInstallOk") + "\n" + result.manifest.id + "@" + result.manifest.version;
          if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("extInstallOk") + " - " + result.manifest.id);
          if (window.NetReconNewUI && typeof window.NetReconNewUI.syncExtensionToolUi === "function") {
            window.NetReconNewUI.syncExtensionToolUi();
          }
          listInstalled();
          refreshActiveUI();
        });
      });
    }

    function wireLanguageManagerButtons() {
      var root = document.getElementById("v1ToolDetail");
      if (!root) return;

      var selectEl = document.getElementById("v1LangTabSelect");
      var codeEl = document.getElementById("v1LangTabCode");
      var dictEl = document.getElementById("v1LangTabDict");
      var outputEl = document.getElementById("v1LangTabOutput");

      if (selectEl && selectEl.dataset.bound !== "1") {
        selectEl.dataset.bound = "1";
        selectEl.addEventListener("change", function () {
          if (codeEl) codeEl.value = selectEl.value;
        });
      }

      if (codeEl && !codeEl.value.trim()) {
        codeEl.value = (selectEl && selectEl.value) || (i18n && i18n.getLang ? i18n.getLang() : "en");
      }
      if (selectEl && codeEl && codeEl.value && !selectEl.value) {
        selectEl.value = codeEl.value;
      }
      if (dictEl && !dictEl.value.trim()) {
        dictEl.value = "{\n  \"menuFile\": \"Datei\",\n  \"menuOptions\": \"Optionen\",\n  \"menuTools\": \"Werkzeuge\",\n  \"menuHelp\": \"Hilfe\"\n}";
      }
      if (outputEl && !outputEl.textContent.trim()) {
        var langs = i18n && i18n.listLanguages ? i18n.listLanguages() : [];
        outputEl.textContent = langs.length ? langs.join("\n") : tr("langListHeader") + ": -";
      }

      root.querySelectorAll("[data-lang-action]").forEach(function (button) {
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";
        button.addEventListener("click", function () {
          var actionName = button.getAttribute("data-lang-action");
          var code = ((codeEl && codeEl.value) || (selectEl && selectEl.value) || "").trim();

          if (actionName === "list") {
            var langs = i18n && i18n.listLanguages ? i18n.listLanguages() : [];
            if (outputEl) outputEl.textContent = langs.length ? langs.join("\n") : tr("langListHeader") + ": -";
            if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langListHeader"));
            return;
          }

          if (!code) {
            if (outputEl) outputEl.textContent = tr("langInvalidCode");
            return;
          }

          if (actionName === "add") {
            var dict = null;
            try {
              dict = JSON.parse(dictEl ? (dictEl.value || "{}") : "{}");
            } catch (_) {
              if (outputEl) outputEl.textContent = tr("langInvalidDict");
              return;
            }

            var addResult = i18n && i18n.addLanguage ? i18n.addLanguage(code, dict) : { ok: false, error: tr("langAddFail") };
            if (!addResult.ok) {
              if (outputEl) outputEl.textContent = tr("langAddFail") + "\n" + addResult.error;
              return;
            }

            if (outputEl) outputEl.textContent = tr("langAddOk") + "\n" + addResult.code;
            if (selectEl) {
              var option = document.createElement("option");
              option.value = addResult.code;
              option.textContent = addResult.code;
              selectEl.appendChild(option);
              selectEl.value = addResult.code;
            }
            if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langAddOk") + " - " + addResult.code);
            return;
          }

          if (actionName === "activate") {
            var before = i18n && i18n.getLang ? i18n.getLang() : "";
            var after = i18n && i18n.setLang ? i18n.setLang(code) : before;
            if (before === after && code.toLowerCase() !== after.toLowerCase()) {
              if (outputEl) outputEl.textContent = tr("langActivateFail") + "\n" + code;
              return;
            }

            if (selectEl) selectEl.value = after;
            if (codeEl) codeEl.value = after;
            if (clippyRuntime && clippyRuntime.setLanguage) {
              clippyRuntime.setLanguage(after);
            }

            if (window.NetReconNewUI && typeof window.NetReconNewUI.refreshLanguageUi === "function") {
              window.NetReconNewUI.refreshLanguageUi();
            }
            if (outputEl) outputEl.textContent = tr("langActivateOk") + "\n" + after;
            if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langActivateOk") + " - " + after);
          }
        });
      });
    }

    function switchTool(tool) {
      var tab = document.querySelector('.v1-tab[data-tool="' + tool + '"]');
      if (tab && tab.classList.contains("tab-closed")) {
        tab.classList.remove("tab-closed");
        tab.removeAttribute("hidden");
      }

      activeTool = tool;
      if (store && store.setState) store.setState({ activeTool: tool });
      try {
        if (window.localStorage && tool !== "scan-runner") window.localStorage.setItem("netrecon_active_tool", tool);
      } catch (_) {}
      refreshActiveUI();
      updateEmptyState();
    }

    function getActiveTool() {
      return activeTool;
    }

    function hasTool(tool) {
      var tools = getToolInfoMap ? getToolInfoMap() : {};
      return !!tools[tool];
    }

    return {
      setTooltips: setTooltips,
      refreshActiveUI: refreshActiveUI,
      switchTool: switchTool,
      getActiveTool: getActiveTool,
      hasTool: hasTool,
      initWorkbenchTabs: initWorkbenchTabs,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createPanelsRuntime = createPanelsRuntime;
})();
