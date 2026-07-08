(function () {
  function createPanelContentRuntime(deps) {
    var tr = deps.tr;
    var escapeHtml = deps.escapeHtml;
    var infoFor = deps.infoFor;
    var versionsData = Array.isArray(deps.versionsData) ? deps.versionsData : [];
    var i18n = deps.i18n;
    var extensionHost = deps.extensionHost;
    var core = window.NetReconNewUICore || {};
    var contentConfig = core.panelContentConfig || {};
    var versionsConfig = contentConfig.versions || {};
    var languageManagerConfig = contentConfig.languageManager || {};
    var importToolConfig = contentConfig.importTool || {};
    var resultsIpConfig = contentConfig.resultsIp || {};
    var presetsApi = core.presets || null;

    function trOr(key, fallback) {
      var value = tr(key);
      return value === key ? fallback : value;
    }

    // --- ip-scanner tool keys ---
    // Preset-lookup helpers, used only by renderPresetsTool/renderResultsIp below.
    function getSelectedPresetInfo() {
      var selectEl = document.getElementById("v1PortPreset");
      var selectedId = selectEl ? String(selectEl.value || "").trim() : "";
      var corePresets = core.presets && typeof core.presets.getState === "function"
        ? core.presets.getState()
        : null;
      var presets = corePresets && Array.isArray(corePresets.presets) ? corePresets.presets : [];

      var selected = presets.find(function (item) {
        return String(item && item.id || "") === selectedId;
      });
      if (!selected && corePresets && corePresets.defaultPresetId) {
        selected = presets.find(function (item) {
          return String(item && item.id || "") === String(corePresets.defaultPresetId || "");
        });
      }
      if (!selected) selected = presets[0] || { id: "", emoji: "", name: "" };

      return {
        id: String(selected.id || ""),
        emoji: String(selected.emoji || "").trim(),
        name: String(selected.name || selected.id || "").trim(),
      };
    }

    function getPresetsState() {
      var fallbackState = {
        defaultPresetId: "all-ports",
        presets: [
          { id: "cameras", emoji: "📷", name: "Cameras", ports: "80,443,554,8080,8081,9000,34567,37777" },
          { id: "printers", emoji: "🖨", name: "Printers", ports: "80,443,631,8080,9100" },
          { id: "folders-http", emoji: "📁", name: "Folders / HTTP", ports: "21,80,3000,5000,8000,8080,8888" },
          { id: "routers", emoji: "📡", name: "Routers", ports: "80,443,8080,8443,10000" },
          { id: "nas-servers", emoji: "🗄", name: "NAS / Servers", ports: "80,443,5000,5001,8006,8080,9090" },
          { id: "windows-smb", emoji: "🪟", name: "Windows / SMB", ports: "135,139,445,3389,5985,5986" },
          { id: "all-ports", emoji: "🌐", name: "All ports", ports: "21,80,135,139,443,445,554,631,3000,3389,5000,5001,5985,5986,8000,8006,8080,8081,8443,8888,9000,9090,9100,10000,34567,37777" }
        ]
      };

      function hasPresetData(state) {
        var presets = state && Array.isArray(state.presets) ? state.presets : [];
        if (!presets.length) return false;
        return presets.some(function (item) {
          if (!item || typeof item !== "object") return false;
          return !!String(item.name || "").trim() || !!String(item.ports || "").trim();
        });
      }

      try {
        if (presetsApi && typeof presetsApi.getState === "function") {
          var state = presetsApi.getState();
          if (hasPresetData(state)) return state;
          if (typeof presetsApi.resetDefaults === "function") {
            var resetState = presetsApi.resetDefaults();
            if (hasPresetData(resetState)) return resetState;
          }
        }
      } catch (_) {
        // ignore presets provider errors
      }

      return fallbackState;
    }

    // --- shell keys ---
    // Generic fallback (also used for extension-contributed tools that only
    // supply title/text/points), plus Help/Options entries that stay in the
    // base shell per FUTURE_PLUGIN_SHELL.md.
    function renderDefaultTool(tool) {
      var info = infoFor(tool);
      var points = (info.points || []).map(function (p) { return "<li>" + escapeHtml(p) + "</li>"; }).join("");
      return "<h4>" + escapeHtml(info.title) + "</h4><div>" + escapeHtml(info.text) + "</div><ul>" + points + "</ul>";
    }

    function renderVersionsTool() {
      if (!versionsData.length) {
        return "<h4>" + escapeHtml(trOr("versionsEmptyTitle", versionsConfig.emptyTitle || "Versions")) + "</h4><div>" + escapeHtml(trOr("versionsEmptyText", versionsConfig.emptyText || "No version entries available.")) + "</div>";
      }

      var chronological = versionsData.slice().reverse();
      var pointsHtml = chronological.map(function (entry, pos) {
        var sourceIndex = versionsData.length - 1 - pos;
        var activeClass = sourceIndex === 0 ? " active" : "";
        return [
          "<button type=\"button\" class=\"v1-version-point" + activeClass + "\" data-version-index=\"" + sourceIndex + "\" aria-label=\"" + escapeHtml(entry.version) + "\">",
          "<span class=\"v1-version-dot is-published\"></span>",
          "<span class=\"v1-version-label\">" + escapeHtml(entry.version) + "</span>",
          "</button>"
        ].join("");
      }).join("");

      var listHtml = versionsData.map(function (entry, idx) {
        var notes = (entry.notes || []).map(function (note) { return "<li>" + escapeHtml(note) + "</li>"; }).join("");
        var activeClass = idx === 0 ? " is-active" : "";
        return "<section class=\"v1-version-entry" + activeClass + "\" id=\"v1VersionEntry-" + idx + "\" data-version-entry-index=\"" + idx + "\"><h4>" + escapeHtml(entry.version) + "</h4><ul>" + notes + "</ul></section>";
      }).join("");

      return [
        "<div class=\"v1-versions-shell\">",
        "<div class=\"v1-versions-timeline-sticky\">",
        "<div class=\"v1-version-track-wrap\">",
        "<button type=\"button\" class=\"v1-version-scroll\" data-version-scroll=\"left\" aria-label=\"" + escapeHtml(trOr("versionsScrollLeftAria", versionsConfig.scrollLeftAria || "Scroll versions left")) + "\">◀</button>",
        "<div class=\"v1-version-track\" id=\"v1VersionTrack\" data-version-role=\"track\" role=\"listbox\" aria-label=\"" + escapeHtml(trOr("versionsTimelineAria", versionsConfig.timelineAria || "Published versions timeline")) + "\">",
        "<div class=\"v1-version-track-inner\">",
        pointsHtml,
        "</div>",
        "</div>",
        "<button type=\"button\" class=\"v1-version-scroll\" data-version-scroll=\"right\" aria-label=\"" + escapeHtml(trOr("versionsScrollRightAria", versionsConfig.scrollRightAria || "Scroll versions right")) + "\">▶</button>",
        "</div>",
        "<div class=\"v1-version-physics\" id=\"v1VersionPhysics\" data-version-role=\"physics\" style=\"--v1-version-progress: 1;\">",
        "<div class=\"v1-version-orb\" aria-hidden=\"true\"></div>",
        "</div>",
        "</div>",
        "<div class=\"v1-versions-list v1-scroll-safe-inline-end\" id=\"v1VersionsList\" data-version-role=\"list\">",
        listHtml,
        "</div>",
        "</div>"
      ].join("");
    }

    function getCurrentVersion() {
      if (!versionsData.length) return "v1.7.0";
      var first = versionsData[0] || {};
      var version = first.version;
      if (!version) return "v1.7.0";
      return String(version);
    }

    function renderAboutTool() {
      var currentVersion = escapeHtml(getCurrentVersion());
      var heading = escapeHtml(tr("aboutHeading")) + " " + currentVersion;
      var contactUrl = "https://" + String(tr("aboutSupportFacebook") || "").trim();
      var projectUrl = "https://" + String(tr("aboutProjectPageUrl") || "").trim();
      return [
        "<div class=\"v1-about\">",
        "<h4>" + heading + "</h4>",
        "<p>" + escapeHtml(tr("aboutByAuthor")) + "</p>",
        "<h4>" + escapeHtml(tr("aboutSupportHeading")) + "</h4>",
        "<p>" + escapeHtml(tr("aboutSupportBody")) + "</p>",
        "<p><strong>" + escapeHtml(tr("aboutSupportQuick")) + "</strong></p>",
        "<p><strong>" + escapeHtml(tr("aboutSupportPhone")) + "</strong></p>",
        "<p>" + escapeHtml(tr("aboutSupportContact")) + " <strong><a href=\"" + escapeHtml(contactUrl) + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + escapeHtml(tr("aboutSupportFacebook")) + "</a></strong></p>",
        "<p>" + escapeHtml(tr("aboutProjectPageLabel")) + " <strong><a href=\"" + escapeHtml(projectUrl) + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + escapeHtml(tr("aboutProjectPageUrl")) + "</a></strong></p>",
        "<h4>" + escapeHtml(tr("aboutTransferHeading")) + "</h4>",
        "<ul>",
        "<li>" + escapeHtml(tr("aboutTransferName")) + "</li>",
        "<li>" + escapeHtml(tr("aboutTransferCity")) + "</li>",
        "<li>" + escapeHtml(tr("aboutTransferBank")) + "</li>",
        "<li>" + escapeHtml(tr("aboutTransferIban")) + "</li>",
        "<li>" + escapeHtml(tr("aboutTransferTitle")) + "</li>",
        "</ul>",
        "<h4>" + escapeHtml(tr("aboutTotalCostsHeading")) + "</h4>",
        "<ul>",
        "<li>" + escapeHtml(tr("aboutTotalCostDomains")) + "</li>",
        "<li>" + escapeHtml(tr("aboutTotalCostCopilot")) + "</li>",
        "<li>" + escapeHtml(tr("aboutTotalCostOther")) + "</li>",
        "<li>" + escapeHtml(tr("aboutTotalCostAds")) + "</li>",
        "</ul>",
        "</div>"
      ].join("");
    }

    function renderLicenseTool() {
      var licenseText = contentConfig.licenseText || [
        "MIT License",
        "",
        "Copyright (c) Michal Stankiewicz",
        "",
        "Permission is hereby granted, free of charge, to any person obtaining a copy",
        "of this software and associated documentation files (the \"Software\"), to deal",
        "in the Software without restriction, including without limitation the rights",
        "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell",
        "copies of the Software, and to permit persons to whom the Software is",
        "furnished to do so, subject to the following conditions:",
        "",
        "The above copyright notice and this permission notice shall be included in all",
        "copies or substantial portions of the Software.",
        "",
        "THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR",
        "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,",
        "FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE",
        "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER",
        "LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,",
        "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE",
        "SOFTWARE."
      ].join("\n");
      return [
        "<div class=\"v1-license\">",
        "<h4>" + escapeHtml(tr("licenseHeading")) + "</h4>",
        "<pre class=\"v1-license-text\">" + escapeHtml(licenseText) + "</pre>",
        "</div>"
      ].join("");
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
      var dictPlaceholder = trOr("langDictPlaceholder", languageManagerConfig.dictPlaceholder || "{\n  \"menuFile\": \"Datei\"\n}");

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
        "<select id=\"v1LangTabSelect\" data-lang-role=\"select\">" + langOptions + "</select>",
        "<label for=\"v1LangTabCode\">" + tr("langCodeLabel") + "</label>",
        "<input id=\"v1LangTabCode\" data-lang-role=\"code\" type=\"text\" autocomplete=\"off\" placeholder=\"" + tr("langCodePlaceholder") + "\" />",
        "<label for=\"v1LangTabDict\">" + tr("langDictLabel") + "</label>",
        "<textarea id=\"v1LangTabDict\" data-lang-role=\"dict\" spellcheck=\"false\" placeholder=\"" + dictPlaceholder.replace(/\"/g, '&quot;') + "\"></textarea>",
        "</div>",
        "<div class=\"v1-lang-manager-actions\">",
        "<button type=\"button\" data-lang-action=\"add\">" + tr("langAddBtn") + "</button>",
        "<button type=\"button\" data-lang-action=\"activate\">" + tr("langActivateBtn") + "</button>",
        "<button type=\"button\" data-lang-action=\"list\">" + tr("langListBtn") + "</button>",
        "</div>",
        "<pre id=\"v1LangTabOutput\" data-lang-role=\"output\" class=\"v1-lang-manager-output\"></pre>",
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
        : "<div class=\"v1-import-empty\">" + escapeHtml(trOr("importToolEmptyText", importToolConfig.emptyText || "No imported tools yet.")) + "</div>";

      var subtitleText = tr("importToolSubtitle");
      if (subtitleText === "importToolSubtitle") {
        subtitleText = trOr("importToolSubtitle", importToolConfig.subtitle || "This area is still under development, so tool imports are temporarily unavailable.");
      }

      return [
        "<div class=\"v1-import-manager\">",
        "<div class=\"v1-import-manager-head\">",
        "<h4 style=\"margin:0 0 4px;\">" + tr("tipActionCustomization") + "</h4>",
        "<div class=\"v1-import-manager-note\">" + escapeHtml(subtitleText) + "</div>",
        "</div>",
        "<div class=\"v1-import-manager-grid\">",
        "<label for=\"v1ImportManifest\">" + escapeHtml(trOr("importToolManifestLabel", importToolConfig.manifestLabel || "Manifest JSON")) + "</label>",
        "<textarea id=\"v1ImportManifest\" data-import-role=\"manifest\" spellcheck=\"false\" placeholder=\"" + escapeHtml(trOr("importToolManifestPlaceholder", importToolConfig.manifestPlaceholder || "{\\n  \\\"id\\\": \\\"com.example.demo\\\"\\n}")) + "\"></textarea>",
        "<label for=\"v1ImportUninstallId\">" + escapeHtml(trOr("importToolUninstallLabel", importToolConfig.uninstallLabel || "Tool id to uninstall")) + "</label>",
        "<input id=\"v1ImportUninstallId\" data-import-role=\"uninstall-id\" type=\"text\" autocomplete=\"off\" placeholder=\"" + escapeHtml(trOr("importToolUninstallPlaceholder", importToolConfig.uninstallPlaceholder || "com.example.demo")) + "\" />",
        "</div>",
        "<div class=\"v1-import-manager-actions\">",
        "<button type=\"button\" data-import-action=\"install\">" + escapeHtml(trOr("importToolInstallBtn", importToolConfig.installBtn || "Import")) + "</button>",
        "<button type=\"button\" data-import-action=\"list\">" + escapeHtml(trOr("importToolListBtn", importToolConfig.listBtn || "List")) + "</button>",
        "<button type=\"button\" data-import-action=\"uninstall\">" + escapeHtml(trOr("importToolUninstallBtn", importToolConfig.uninstallBtn || "Uninstall")) + "</button>",
        "</div>",
        "<div class=\"v1-import-manager-options\">",
        "<label><input id=\"v1ImportAddMenu\" data-import-role=\"add-menu\" type=\"checkbox\" checked /> " + tr("importOptToolsMenu") + "</label>",
        "<label><input id=\"v1ImportAddActivity\" data-import-role=\"add-activity\" type=\"checkbox\" /> " + tr("importOptActivityIcon") + "</label>",
        "</div>",
        "<div id=\"v1ImportOutput\" data-import-role=\"output\" class=\"v1-import-output\">" + listHtml + "</div>",
        "</div>"
      ].join("");
    }

    // --- ip-scanner tool keys ---
    function renderIpLibraryTool() {
      return [
        "<div class=\"v1-import-manager\">",
        "<div class=\"v1-import-manager-head\">",
        "<h4 style=\"margin:0 0 4px;\">" + escapeHtml(tr("ipLibraryTitle")) + "</h4>",
        "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("ipLibraryNote")) + "</div>",
        "</div>",
        "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("ipLibraryCentralHint")) + "</div>",
        "<div class=\"v1-import-manager-note\"><strong>" + escapeHtml(tr("ipLibraryLastUpdateLabel")) + "</strong> <span id=\"v1IpLibraryCenterLastUpdate\" data-iplib-role=\"last-update-center\">-</span></div>",
        "<div id=\"v1IpLibraryCenterStatus\" data-iplib-role=\"status-center\" class=\"v1-import-manager-note\"></div>",
        "<div class=\"v1-results-table-scroll v1-results-table-scroll--ip\" data-native-hscroll=\"true\">",
        "<table class=\"v1-results-table v1-ip-results-table v1-iplib-table\">",
        "<thead><tr><th class=\"v1-iplib-col-country\">" + escapeHtml(tr("ipLibraryTableCountry")) + "</th><th class=\"v1-iplib-col-address\">" + escapeHtml(tr("ipLibraryTableAddress")) + "</th></tr></thead>",
        "<tbody id=\"v1IpLibraryCenterRows\" data-iplib-role=\"rows\"><tr><td colspan=\"2\" class=\"v1-iplib-empty\">" + escapeHtml(tr("ipLibraryTableEmpty")) + "</td></tr></tbody>",
        "</table>",
        "</div>",
        "</div>"
      ].join("");
    }

    function renderPresetsTool() {
      var fallbackPresets = [
        { id: "cameras", emoji: "📷", name: "Cameras", ports: "80,443,554,8080,8081,9000,34567,37777" },
        { id: "printers", emoji: "🖨", name: "Printers", ports: "80,443,631,8080,9100" },
        { id: "folders-http", emoji: "📁", name: "Folders / HTTP", ports: "21,80,3000,5000,8000,8080,8888" },
        { id: "routers", emoji: "📡", name: "Routers", ports: "80,443,8080,8443,10000" },
        { id: "nas-servers", emoji: "🗄", name: "NAS / Servers", ports: "80,443,5000,5001,8006,8080,9090" },
        { id: "windows-smb", emoji: "🪟", name: "Windows / SMB", ports: "135,139,445,3389,5985,5986" },
        { id: "all-ports", emoji: "🌐", name: "All ports", ports: "21,80,135,139,443,445,554,631,3000,3389,5000,5001,5985,5986,8000,8006,8080,8081,8443,8888,9000,9090,9100,10000,34567,37777" }
      ];

      var state = getPresetsState();
      var presets = Array.isArray(state.presets) ? state.presets : [];
      if (!presets.length) {
        presets = fallbackPresets.slice();
      }
      var selected = presets[0] || { id: "", emoji: "", name: "", ports: "" };

      var rowsHtml = presets.map(function (item) {
        var isDefault = item && item.id === state.defaultPresetId;
        var isSelected = item && item.id === selected.id;
        return [
          '<tr class="v1-presets-row' + (isSelected ? ' is-selected' : '') + '" data-preset-id="' + escapeHtml(item.id || "") + '">',
          '<td class="v1-presets-col-default"><input type="radio" name="v1PresetDefault" data-preset-default="' + escapeHtml(item.id || "") + '" ' + (isDefault ? 'checked' : '') + ' aria-label="' + escapeHtml(trOr("presetsDefaultCol", "Default")) + '" /></td>',
          '<td class="v1-presets-col-emoji"><input type="text" maxlength="4" data-preset-field="emoji" data-preset-id="' + escapeHtml(item.id || "") + '" value="' + escapeHtml(item.emoji || "") + '" placeholder="⭐" /></td>',
          '<td class="v1-presets-col-name"><input type="text" data-preset-field="name" data-preset-id="' + escapeHtml(item.id || "") + '" value="' + escapeHtml(item.name || "") + '" placeholder="' + escapeHtml(trOr("presetsNameLabel", "Name")) + '" /></td>',
          '<td class="v1-presets-col-ports"><input type="text" data-preset-field="ports" data-preset-id="' + escapeHtml(item.id || "") + '" value="' + escapeHtml(item.ports || "") + '" placeholder="80,443,8080" /></td>',
          '</tr>'
        ].join("");
      }).join("");

      return [
        "<div class=\"v1-presets-shell\">",
        "<div class=\"v1-presets-actions\">",
        "<button type=\"button\" data-preset-action=\"add\">" + escapeHtml(trOr("presetsAddBtn", "+ Add")) + "</button>",
        "<button type=\"button\" data-preset-action=\"delete\">" + escapeHtml(trOr("presetsDeleteBtn", "Delete")) + "</button>",
        "<button type=\"button\" data-preset-action=\"move-up\">" + escapeHtml(trOr("presetsMoveUpBtn", "Move Up")) + "</button>",
        "<button type=\"button\" data-preset-action=\"move-down\">" + escapeHtml(trOr("presetsMoveDownBtn", "Move Down")) + "</button>",
        "</div>",
        "<div class=\"v1-results-table-scroll v1-results-table-scroll--ip v1-presets-table-wrap\">",
        "<table class=\"v1-results-table v1-presets-table\" role=\"grid\" aria-label=\"" + escapeHtml(trOr("presetsListAria", "Port presets")) + "\">",
        "<thead><tr><th class=\"v1-presets-col-default\">" + escapeHtml(trOr("presetsDefaultCol", "Default")) + "</th><th class=\"v1-presets-col-emoji\">" + escapeHtml(trOr("presetsEmojiLabel", "Emoji")) + "</th><th class=\"v1-presets-col-name\">" + escapeHtml(trOr("presetsNameLabel", "Name")) + "</th><th class=\"v1-presets-col-ports\">" + escapeHtml(trOr("presetsPortsLabel", "Ports")) + "</th></tr></thead>",
        "<tbody>",
        rowsHtml,
        "</tbody>",
        "</table>",
        "</div>",
        "<p class=\"v1-presets-hint\">" + escapeHtml(trOr("presetsHint", "Enter port numbers separated by commas, e.g. 80, 443, 8080, 554")) + "</p>",
        "</div>"
      ].join("");
    }

    function renderScanDefaultsTool() {
      return [
        "<div class=\"v1-import-manager\">",
        "<div class=\"v1-import-manager-head\">",
        "<h4 style=\"margin:0 0 4px;\">" + escapeHtml(tr("defaultsPanelTitle")) + "</h4>",
        "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("defaultsPanelNote")) + "</div>",
        "</div>",
        "<div class=\"v1-import-manager-grid\" data-scan-defaults-form>",
        "<label for=\"v1DefaultsTimeout\">" + escapeHtml(tr("defaultsTimeoutLabel")) + "</label>",
        "<input id=\"v1DefaultsTimeout\" type=\"number\" min=\"200\" max=\"5000\" step=\"50\" value=\"1000\" />",
        "<label for=\"v1DefaultsConcurrency\">" + escapeHtml(tr("defaultsConcurrencyLabel")) + "</label>",
        "<input id=\"v1DefaultsConcurrency\" type=\"number\" min=\"1\" max=\"256\" step=\"1\" value=\"128\" />",
        "</div>",
        "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("defaultsPresetsManagedInPresets")) + "</div>",
        "<div class=\"v1-import-manager-actions\">",
        "<button type=\"button\" data-defaults-action=\"save\">" + escapeHtml(tr("defaultsSaveBtn")) + "</button>",
        "<button type=\"button\" data-defaults-action=\"restore\">" + escapeHtml(tr("defaultsRestoreBtn")) + "</button>",
        "</div>",
        "</div>"
      ].join("");
    }

    function renderResultsIp() {
      var SCAN_PROGRESS_KEY = "netrecon_scan_progress_v1";

      function buildScanProgressLoaderMarkup() {
        return [
          "<span class=\"v1-results-progress-loader\" aria-hidden=\"true\">",
          "<span class=\"v1-detect-loader-dot\"></span>",
          "<span class=\"v1-detect-loader-dot\"></span>",
          "<span class=\"v1-detect-loader-dot\"></span>",
          "<span class=\"v1-detect-loader-dot\"></span>",
          "<span class=\"v1-detect-loader-dot\"></span>",
          "<span class=\"v1-detect-loader-dot\"></span>",
          "</span>"
        ].join("");
      }

      function readScanProgressState() {
        try {
          var raw = window.localStorage ? window.localStorage.getItem(SCAN_PROGRESS_KEY) : "";
          if (!raw) return null;
          var parsed = JSON.parse(raw);
          return parsed && typeof parsed === "object" ? parsed : null;
        } catch (_) {
          return null;
        }
      }

      function formatScanProgress(state) {
        if (!state || typeof state !== "object") {
          return {
            text: trOr("resultsIpScanProgressIdle", "Progress: idle"),
            showLoader: true,
          };
        }

        var processed = Number(state.processed);
        var total = Number(state.total);
        var found = Number(state.found);
        if (!Number.isFinite(processed)) processed = 0;
        if (!Number.isFinite(total)) total = 0;
        if (!Number.isFinite(found)) found = 0;

        var percent = total > 0 ? Math.round((processed / total) * 100) : 0;
        if (percent < 0) percent = 0;
        if (percent > 100) percent = 100;

        if (total <= 0 && processed <= 0) {
          return {
            text: trOr("resultsIpScanProgressIdle", "Progress: idle"),
            showLoader: true,
          };
        }

        return {
          text: "Progress: " + processed + "/" + total + " (" + percent + "%) | found: " + found,
          showLoader: false,
        };
      }

      function readPersistedScanRows() {
        var STORAGE_KEY = "netrecon_scan_results_v1";
        try {
          var raw = window.localStorage ? window.localStorage.getItem(STORAGE_KEY) : "";
          if (!raw) return [];
          var parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) return [];

          return parsed
            .filter(function (row) {
              return row && typeof row === "object" && String(row.ip || "").trim();
            })
            .map(function (row) {
              var ports = Array.isArray(row.ports) ? row.ports : [];
              return {
                ip: String(row.ip || "").trim(),
                ping: String(row.ping || "-").trim() || "-",
                hostname: String(row.hostname || "-").trim() || "-",
                flag: String(row.flag || "-").trim() || "-",
                isp: String(row.isp || "-").trim() || "-",
                as: String(row.as || "").trim(),
                deviceIdentification: String(row.deviceIdentification || "").trim(),
                status: String(row.status || "active").trim() || "active",
                statusClass: String(row.statusClass || "is-up").trim() || "is-up",
                ports: ports,
              };
            });
        } catch (_) {
          return [];
        }
      }

      var persistedRows = readPersistedScanRows();
      var scanProgress = formatScanProgress(readScanProgressState());
      var scanProgressText = scanProgress && typeof scanProgress.text === "string"
        ? scanProgress.text
        : trOr("resultsIpScanProgressIdle", "Progress: idle");
      var scanProgressMarkup = scanProgress && scanProgress.showLoader
        ? buildScanProgressLoaderMarkup()
        : escapeHtml(scanProgressText);
      var rows = persistedRows.length
        ? persistedRows
        : (Array.isArray(resultsIpConfig.sampleRows) ? resultsIpConfig.sampleRows : []);
      var selectedPreset = getSelectedPresetInfo();
      var selectedPresetEmoji = selectedPreset.emoji || "🔎";
      var selectedPresetLabel = selectedPreset.name || selectedPreset.id || "";
      var columnItems = [
        { key: "hostname", icon: "🧭", label: trOr("resultsIpColumnHostname", "Hostname"), defaultVisible: true },
        { key: "flag", icon: "🌎", label: trOr("resultsIpColumnCountryFlag", "Country Flag"), defaultVisible: true },
        { key: "isp", icon: "🏢", label: trOr("resultsIpColumnIsp", "ISP"), defaultVisible: true },
        { key: "as", icon: "🕷", label: trOr("resultsIpColumnAs", "AS"), defaultVisible: false },
        { key: "device", icon: "📱", label: trOr("resultsIpColumnDeviceIdentification", "Device Identification"), defaultVisible: false },
        { key: "http", icon: "📄", label: trOr("resultsIpColumnHttpPageTitle", "HTTP Page Title"), defaultVisible: false },
        { key: "access", icon: "🔑", label: trOr("resultsIpColumnAccessSnapshot", "Access / Snapshot"), defaultVisible: false }
      ];
      var filterGroups = [
        {
          key: "type",
          buttonLabel: trOr("resultsIpFilterTypeButton", "IP / Ports"),
          items: [
            { key: "ip", icon: "🖧", label: trOr("resultsIpFilterTypeIp", "IP"), defaultChecked: true },
            { key: "ports", icon: "🔌", label: trOr("resultsIpFilterTypePorts", "Ports"), defaultChecked: true }
          ]
        },
        {
          key: "marks",
          buttonLabel: trOr("resultsIpFilterMarksButton", "Favorites / Checked"),
          items: [
            { key: "favorite", icon: "★", label: trOr("resultsIpFilterMarksFavorite", "Favorites"), defaultChecked: false },
            { key: "check", icon: "✓", label: trOr("resultsIpFilterMarksChecked", "Checked"), defaultChecked: false }
          ]
        },
        {
          key: "status",
          buttonLabel: trOr("resultsIpFilterStatusButton", "Status"),
          items: [
            { key: "active", icon: "🟢", label: trOr("resultsIpFilterStatusActive", "Active"), defaultChecked: true },
            { key: "unknown", icon: "⚪", label: trOr("resultsIpFilterStatusUnknown", "Unknown"), defaultChecked: true },
            { key: "dead", icon: "🔴", label: trOr("resultsIpFilterStatusDead", "Dead"), defaultChecked: true }
          ]
        }
      ];

      function resolvePortEntry(port) {
        if (port && typeof port === "object") {
          var rawPort = port.port != null ? port.port : (port.value != null ? port.value : "");
          return {
            portLabel: String(rawPort || "").replace(/^:/, "").trim(),
            httpPageTitle: String(port.httpPageTitle || port.pageTitle || port.title || "").trim(),
            accessSnapshot: String(port.accessSnapshot || port.access || port.snapshot || port.url || "").trim()
          };
        }

        return {
          portLabel: String(port || "").replace(/^:/, "").trim(),
          httpPageTitle: "",
          accessSnapshot: ""
        };
      }

      function resolveStatusKey(row) {
        var explicit = String((row && (row.status || row.state || row.health)) || "").toLowerCase().trim();
        if (explicit === "active" || explicit === "up" || explicit === "alive") return "active";
        if (explicit === "dead" || explicit === "down") return "dead";
        if (explicit === "unknown") return "unknown";

        var cls = String((row && row.statusClass) || "").toLowerCase();
        if (cls.indexOf("is-up") >= 0 || cls.indexOf("active") >= 0) return "active";
        if (cls.indexOf("is-down") >= 0 || cls.indexOf("dead") >= 0) return "dead";
        return "unknown";
      }

      var totalPorts = rows.reduce(function (sum, row) {
        return sum + ((row.ports && row.ports.length) || 0);
      }, 0);

      var bodyHtml = rows.map(function (row, idx) {
        var statusKey = resolveStatusKey(row);
        var resultKey = String(row.ip || "").trim();
        var portList = Array.isArray(row.ports) ? row.ports : [];
        var portsHtml = portList.length ? portList.map(function (port, portIdx) {
          var portEntry = resolvePortEntry(port);
          var portLabel = portEntry.portLabel;
          var portKey = String(row.ip || "").trim() + "|" + portLabel;
          var portHttpTitle = portEntry.httpPageTitle || "-";
          var portAccess = portEntry.accessSnapshot || "-";
          return [
            "<tr class=\"v1-ip-port-row\" data-ports-row=\"" + idx + "\" data-port-index=\"" + portIdx + "\" data-port-key=\"" + escapeHtml(portKey) + "\" data-status=\"" + escapeHtml(statusKey) + "\" hidden>",
            "<td class=\"v1-ip-col-check\"><button type=\"button\" class=\"v1-ip-port-action-btn\" data-port-action=\"check\" data-port-key=\"" + escapeHtml(portKey) + "\" aria-pressed=\"false\" aria-label=\"Mark port\">✓</button></td>",
            "<td class=\"v1-ip-col-star\"><button type=\"button\" class=\"v1-ip-port-action-btn\" data-port-action=\"favorite\" data-port-key=\"" + escapeHtml(portKey) + "\" aria-pressed=\"false\" aria-label=\"Add port to favorites\">★</button></td>",
            "<td class=\"v1-ip-col-status\" aria-hidden=\"true\"></td>",
            "<td class=\"v1-ip-col-ip\"><span class=\"v1-ip-port-line\"><span class=\"v1-ip-port-chip-emoji\" aria-hidden=\"true\" title=\"" + escapeHtml(selectedPresetLabel) + "\">" + escapeHtml(selectedPresetEmoji) + "</span><span class=\"v1-ip-port-value\">" + escapeHtml(portLabel) + "</span></span></td>",
            "<td class=\"v1-ip-col-expand\" aria-hidden=\"true\"></td>",
            "<td class=\"v1-ip-col-ping\" aria-hidden=\"true\"></td>",
            "<td class=\"v1-ip-col-host\" data-col=\"hostname\" aria-hidden=\"true\"></td>",
            "<td class=\"v1-ip-col-flag\" data-col=\"flag\" aria-hidden=\"true\"></td>",
            "<td class=\"v1-ip-col-isp\" data-col=\"isp\" aria-hidden=\"true\"></td>",
            "<td class=\"v1-ip-col-as\" data-col=\"as\" aria-hidden=\"true\"></td>",
            "<td class=\"v1-ip-col-device\" data-col=\"device\" aria-hidden=\"true\"></td>",
            "<td class=\"v1-ip-col-http\" data-col=\"http\">" + escapeHtml(portHttpTitle) + "</td>",
            "<td class=\"v1-ip-col-access\" data-col=\"access\"><span class=\"v1-ip-port-link\">" + escapeHtml(portAccess) + "</span></td>",
            "</tr>"
          ].join("");
        }).join("") : [
          "<tr class=\"v1-ip-port-row v1-ip-port-row--empty\" data-ports-row=\"" + idx + "\" data-status=\"" + escapeHtml(statusKey) + "\" hidden>",
          "<td class=\"v1-ip-col-check\" aria-hidden=\"true\"></td>",
          "<td class=\"v1-ip-col-star\" aria-hidden=\"true\"></td>",
          "<td class=\"v1-ip-col-status\" aria-hidden=\"true\"></td>",
          "<td class=\"v1-ip-col-ip\"><span class=\"v1-ip-port-empty\">" + escapeHtml(trOr("resultsIpNoOpenPorts", resultsIpConfig.noOpenPorts || "No open ports")) + "</span></td>",
          "<td class=\"v1-ip-col-expand\" aria-hidden=\"true\"></td>",
          "<td class=\"v1-ip-col-ping\" aria-hidden=\"true\"></td>",
          "<td class=\"v1-ip-col-host\" data-col=\"hostname\" aria-hidden=\"true\"></td>",
          "<td class=\"v1-ip-col-flag\" data-col=\"flag\" aria-hidden=\"true\"></td>",
          "<td class=\"v1-ip-col-isp\" data-col=\"isp\" aria-hidden=\"true\"></td>",
          "<td class=\"v1-ip-col-as\" data-col=\"as\" aria-hidden=\"true\"></td>",
          "<td class=\"v1-ip-col-device\" data-col=\"device\" aria-hidden=\"true\"></td>",
          "<td class=\"v1-ip-col-http\" data-col=\"http\">-</td>",
          "<td class=\"v1-ip-col-access\" data-col=\"access\">-</td>",
          "</tr>"
        ].join("");

        var rowAs = String(row.as || row.autonomousSystem || "").trim() || "-";
        var rowDevice = String(row.deviceIdentification || row.device || "").trim() || "-";

        return [
          "<tr class=\"v1-ip-result-row\" data-row-index=\"" + idx + "\" data-result-key=\"" + escapeHtml(resultKey) + "\" data-status=\"" + escapeHtml(statusKey) + "\">",
          "<td class=\"v1-ip-col-check\"><button type=\"button\" class=\"v1-ip-port-action-btn\" data-result-action=\"check\" data-result-key=\"" + escapeHtml(resultKey) + "\" aria-pressed=\"false\" aria-label=\"Mark IP\">✓</button></td>",
          "<td class=\"v1-ip-col-star\"><button type=\"button\" class=\"v1-ip-port-action-btn\" data-result-action=\"favorite\" data-result-key=\"" + escapeHtml(resultKey) + "\" aria-pressed=\"false\" aria-label=\"Add IP to favorites\">★</button></td>",
          "<td class=\"v1-ip-col-status\"><span class=\"v1-ip-status-dot " + escapeHtml(row.statusClass || "") + "\"></span></td>",
          "<td class=\"v1-ip-col-ip\">" + escapeHtml(row.ip) + "</td>",
          "<td class=\"v1-ip-col-expand\"><button type=\"button\" class=\"v1-ip-expand-btn\" data-open-ports=\"" + idx + "\" aria-expanded=\"false\">+</button></td>",
          "<td class=\"v1-ip-col-ping\">" + escapeHtml(row.ping) + "</td>",
          "<td class=\"v1-ip-col-host\" data-col=\"hostname\">" + escapeHtml(row.hostname) + "</td>",
          "<td class=\"v1-ip-col-flag\" data-col=\"flag\">" + escapeHtml(row.flag) + "</td>",
          "<td class=\"v1-ip-col-isp\" data-col=\"isp\">" + escapeHtml(row.isp) + "</td>",
          "<td class=\"v1-ip-col-as\" data-col=\"as\">" + escapeHtml(rowAs) + "</td>",
          "<td class=\"v1-ip-col-device\" data-col=\"device\">" + escapeHtml(rowDevice) + "</td>",
          "<td class=\"v1-ip-col-http\" data-col=\"http\">-</td>",
          "<td class=\"v1-ip-col-access\" data-col=\"access\">-</td>",
          "</tr>",
          portsHtml
        ].join("");
      }).join("");

      var headers = resultsIpConfig.headers || {};
      var columnsMenuHtml = columnItems.map(function (item) {
        return [
          "<label class=\"v1-results-columns-item\">",
          "<input type=\"checkbox\" data-column-key=\"" + escapeHtml(item.key) + "\"" + (item.defaultVisible ? " checked" : "") + " />",
          "<span class=\"v1-results-columns-icon\" aria-hidden=\"true\">" + escapeHtml(item.icon) + "</span>",
          "<span>" + escapeHtml(item.label) + "</span>",
          "</label>"
        ].join("");
      }).join("");
      var filtersHtml = filterGroups.map(function (group) {
        var itemsHtml = group.items.map(function (item) {
          return [
            "<label class=\"v1-results-columns-item\">",
            "<input type=\"checkbox\" data-filter-group=\"" + escapeHtml(group.key) + "\" data-filter-key=\"" + escapeHtml(item.key) + "\"" + (item.defaultChecked ? " checked" : "") + " />",
            "<span class=\"v1-results-columns-icon\" aria-hidden=\"true\">" + escapeHtml(item.icon) + "</span>",
            "<span>" + escapeHtml(item.label) + "</span>",
            "</label>"
          ].join("");
        }).join("");

        return [
          "<div class=\"v1-results-columns v1-results-filter\" data-results-filter data-filter-group=\"" + escapeHtml(group.key) + "\">",
          "<button type=\"button\" class=\"v1-results-columns-btn\" data-filter-toggle=\"" + escapeHtml(group.key) + "\" data-filter-label=\"" + escapeHtml(group.buttonLabel) + "\" aria-expanded=\"false\">" + escapeHtml(group.buttonLabel) + " ▾</button>",
          "<div class=\"v1-results-columns-menu\" data-filter-menu=\"" + escapeHtml(group.key) + "\" hidden>" + itemsHtml + "</div>",
          "</div>"
        ].join("");
      }).join("");

      return [
        "<div class=\"v1-results-meta-row\">",
        "<span>" + escapeHtml(trOr("resultsIpHostsLabel", resultsIpConfig.hostsLabel || "Hosty")) + ": <b id=\"resIpHostCount\">" + rows.length + "</b></span>",
        "<span>" + escapeHtml(trOr("resultsIpOpenPortsLabel", resultsIpConfig.openPortsLabel || "Otwarte porty")) + ": <b id=\"resIpPortCount\">" + totalPorts + "</b></span>",
        "<span id=\"resIpScanProgressTop\" class=\"v1-results-progress-note\" title=\"" + escapeHtml(scanProgressText) + "\">" + scanProgressMarkup + "</span>",
        "<div class=\"v1-results-controls\">",
        filtersHtml,
        "<button type=\"button\" class=\"v1-results-columns-btn\" data-reset-filters>" + escapeHtml(trOr("resultsIpResetFilters", "Reset filters")) + "</button>",
        "<div class=\"v1-results-columns\" data-results-columns>",
        "<button type=\"button\" class=\"v1-results-columns-btn\" data-columns-toggle aria-expanded=\"false\">" + escapeHtml(trOr("resultsIpColumnsButton", "Columns")) + " ▾</button>",
        "<div class=\"v1-results-columns-menu\" data-columns-menu hidden>" + columnsMenuHtml + "</div>",
        "</div>",
        "</div>",
        "</div>",
        "<div class=\"v1-results-table-scroll v1-results-table-scroll--ip\">",
        "<table class=\"v1-results-table v1-ip-results-table\">",
        "<thead><tr><th class=\"v1-ip-col-check\">✓</th><th class=\"v1-ip-col-star\">★</th><th class=\"v1-ip-col-status\">●</th><th class=\"v1-ip-col-ip\">" + escapeHtml(trOr("resultsIpHeaderIpAddressPort", headers.ipAddressPort || "IP Adress / Port")) + "</th><th class=\"v1-ip-col-expand\">+</th><th class=\"v1-ip-col-ping\">" + escapeHtml(trOr("resultsIpHeaderPing", headers.ping || "Ping")) + "</th><th class=\"v1-ip-col-host\" data-col=\"hostname\">" + escapeHtml(trOr("resultsIpHeaderHostname", headers.hostname || "Hostname")) + "</th><th class=\"v1-ip-col-flag\" data-col=\"flag\">" + escapeHtml(trOr("resultsIpHeaderFlag", headers.flag || "Flag")) + "</th><th class=\"v1-ip-col-isp\" data-col=\"isp\">" + escapeHtml(trOr("resultsIpHeaderIsp", headers.isp || "ISP")) + "</th><th class=\"v1-ip-col-as\" data-col=\"as\">" + escapeHtml(trOr("resultsIpHeaderAs", headers.as || "AS")) + "</th><th class=\"v1-ip-col-device\" data-col=\"device\">" + escapeHtml(trOr("resultsIpHeaderDeviceIdentification", headers.deviceIdentification || "Device Identification")) + "</th><th class=\"v1-ip-col-http\" data-col=\"http\">" + escapeHtml(trOr("resultsIpHeaderHttpPageTitle", headers.httpPageTitle || "HTTP Page Title")) + "</th><th class=\"v1-ip-col-access\" data-col=\"access\">" + escapeHtml(trOr("resultsIpHeaderAccessSnapshot", headers.accessSnapshot || "Access / Snapshot")) + "</th></tr></thead>",
        "<tbody>" + bodyHtml + "</tbody>",
        "</table>",
        "</div>"
      ].join("");
    }

    var toolRenderers = {
      // --- shell keys ---
      versions: renderVersionsTool,
      about: renderAboutTool,
      license: renderLicenseTool,
      "import-tool": renderImportTool,
      "language-manager": renderLanguageManagerTool,

      // --- ip-scanner tool keys ---
      "ip-library": renderIpLibraryTool,
      presets: renderPresetsTool,
      "scan-defaults": renderScanDefaultsTool,
      "results-ip": renderResultsIp,
    };

    function buildDetailHtml(tool) {
      var renderer = toolRenderers[tool] || function () { return renderDefaultTool(tool); };
      return renderer();
    }

    return {
      buildDetailHtml: buildDetailHtml,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createPanelContentRuntime = createPanelContentRuntime;
})();
