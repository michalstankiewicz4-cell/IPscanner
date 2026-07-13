(function () {
  function createPanelContentRuntime(deps) {
    var tr = deps.tr;
    var escapeHtml = deps.escapeHtml;
    var infoFor = deps.infoFor;
    var versionsData = Array.isArray(deps.versionsData) ? deps.versionsData : [];
    var i18n = deps.i18n;
    var extensionHost = deps.extensionHost;
    var core = window.NetReconNewUICore || {};
    var sharedNet = core.utils ? core.utils.net : null;
    var contentConfig = core.panelContentConfig || {};
    var versionsConfig = contentConfig.versions || {};
    var importToolConfig = contentConfig.importTool || {};
    var resultsIpConfig = contentConfig.resultsIp || {};
    var presetsApi = core.presets || null;
    var macrosApi = core.macros || null;
    var shellcraftCanvasApi = core.shellcraftCanvas || null;
    var generalSettingsApi = core.generalSettings || null;

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
      var fallbackState = presetsApi && typeof presetsApi.getDefaultState === "function"
        ? presetsApi.getDefaultState()
        : { defaultPresetId: "all-ports", presets: [] };

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
      var hasActions = Array.isArray(info.actions) && info.actions.length;
      var hasResult = info.resultText != null;
      var actionsHtml = "";
      if (hasActions || hasResult) {
        var buttonsHtml = "";
        if (hasActions) {
          var buttons = info.actions.map(function (action, idx) {
            var commandId = String((action && action.commandId) || "");
            if (!commandId) return "";
            var label = escapeHtml(String((action && action.label) || commandId || ("Action " + (idx + 1))));
            return "<button type=\"button\" class=\"v1-ext-action-btn\" data-ext-action-command=\"" + escapeHtml(commandId) + "\">" + label + "</button>";
          }).join(" ");
          buttonsHtml = "<div class=\"v1-ext-actions\">" + buttons + "</div>";
        }
        actionsHtml = buttonsHtml + "<pre class=\"v1-ext-action-output\" data-ext-action-output>" + escapeHtml(info.resultText || "") + "</pre>";
      }
      return "<h4>" + escapeHtml(info.title) + "</h4><div>" + escapeHtml(info.text) + "</div><ul>" + points + "</ul>" + actionsHtml;
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
      if (!versionsData.length) return "v2.1.0";
      var first = versionsData[0] || {};
      var version = first.version;
      if (!version) return "v2.1.0";
      return String(version);
    }

    function renderAboutTool() {
      var currentVersion = escapeHtml(getCurrentVersion());
      var heading = escapeHtml(tr("aboutHeading")) + " " + currentVersion;
      var contactUrl = "https://" + String(tr("aboutSupportFacebook") || "").trim();
      var projectUrl = "https://" + String(tr("aboutProjectPageUrl") || "").trim();
      var zrzutkaUrl = "https://" + String(tr("aboutZrzutkaUrl") || "").trim();
      return [
        "<div class=\"v1-about\">",
        "<h4>" + heading + "</h4>",
        "<p>" + escapeHtml(tr("aboutByAuthor")) + "</p>",
        "<p>" + escapeHtml(tr("aboutVibecodingNote")) + "</p>",
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
        "<li>" + escapeHtml(tr("aboutTotalCostClaude")) + "</li>",
        "<li>" + escapeHtml(tr("aboutTotalCostDomains")) + "</li>",
        "<li>" + escapeHtml(tr("aboutTotalCostCopilot")) + "</li>",
        "<li>" + escapeHtml(tr("aboutTotalCostOther")) + "</li>",
        "<li>" + escapeHtml(tr("aboutTotalCostAds")) + "</li>",
        "</ul>",
        "<p>" + escapeHtml(tr("aboutZrzutkaLabel")) + " <strong><a href=\"" + escapeHtml(zrzutkaUrl) + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + escapeHtml(zrzutkaUrl) + "</a></strong></p>",
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

    // shell: throwaway placeholder tool (static lorem ipsum) - a first,
    // deliberately minimal step toward exploring an alternate UI later;
    // gated behind "Show unfinished tools" like Topology/Globe.
    function renderLoremIpsumTool() {
      var paragraphs = [
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
        "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
        "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.",
        "Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet.",
        "At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident.",
        "Similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga. Et harum quidem rerum facilis est et expedita distinctio. Nam libero tempore, cum soluta nobis est eligendi optio.",
        "Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae non recusandae. Itaque earum rerum hic tenetur a sapiente delectus.",
        "Vitae dicta sunt explicabo nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt neque porro quisquam est.",
        "Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur? Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse.",
        "Quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur. At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque.",
        "Corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident, similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga et harum quidem rerum.",
        "Facilis est et expedita distinctio nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est omnis dolor.",
        "Repellendus temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae non recusandae itaque earum rerum hic tenetur a sapiente.",
        "Delectus ut aut reiciendis voluptatibus maiores alias consequatur aut perferendis doloribus asperiores repellat. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos curabitur.",
      ];
      // shell: STYLELIST.md - live preview of every native <input> type
      // (+ textarea/select/button), pure markup, no data wiring yet ("source
      // of truth" for these is still to be decided, per the STYLELIST.md
      // note) - this tab exists specifically to LOOK at every style at once.
      var styleListItems = [
        { n: 1, type: "text", desc: "Standardowe jednolinijkowe pole tekstowe.", html: "<input type=\"text\" placeholder=\"Tekst...\" />" },
        { n: 2, type: "password", desc: "Pole tekstowe maskujące wpisane znaki kropkami.", html: "<input type=\"password\" placeholder=\"Hasło...\" />" },
        { n: 3, type: "email", desc: "Pole sprawdzające poprawność formatu adresu e-mail.", html: "<input type=\"email\" placeholder=\"nazwa@domena.pl\" />" },
        { n: 4, type: "number", desc: "Pole akceptujące tylko cyfry z suwakiem góra/dół.", html: "<input type=\"number\" placeholder=\"0\" />" },
        { n: 5, type: "checkbox", desc: "Kwadratowe pole wielokrotnego wyboru (zaznacz/odznacz).", html: "<input type=\"checkbox\" />" },
        { n: 6, type: "radio", desc: "Okrągły przycisk jednokrotnego wyboru w ramach jednej grupy.", html: "<label><input type=\"radio\" name=\"v1StyleListRadioDemo\" checked /> A</label> <label><input type=\"radio\" name=\"v1StyleListRadioDemo\" /> B</label>" },
        { n: 7, type: "file", desc: "Przycisk umożliwiający przesłanie pliku z dysku komputera.", html: "<input type=\"file\" />" },
        { n: 8, type: "date", desc: "Kalendarz do wyboru konkretnego dnia, miesiąca i roku.", html: "<input type=\"date\" />" },
        { n: 9, type: "datetime-local", desc: "Pole do wyboru daty oraz godziny bez strefy czasowej.", html: "<input type=\"datetime-local\" />" },
        { n: 10, type: "time", desc: "Pole do wyboru konkretnej godziny (godziny i minuty).", html: "<input type=\"time\" />" },
        { n: 11, type: "month", desc: "Pole ograniczone do wyboru wyłącznie miesiąca i roku.", html: "<input type=\"month\" />" },
        { n: 12, type: "week", desc: "Pole ograniczone do wyboru numeru tygodnia oraz roku.", html: "<input type=\"week\" />" },
        { n: 13, type: "color", desc: "Przycisk otwierający paletę do wyboru koloru.", html: "<input type=\"color\" value=\"#3794ff\" />" },
        { n: 14, type: "range", desc: "Suwak do wyboru przybliżonej wartości numerycznej.", html: "<input type=\"range\" min=\"0\" max=\"100\" value=\"50\" />" },
        { n: 15, type: "search", desc: "Pole tekstowe zoptymalizowane pod kątem wpisywania fraz wyszukiwania.", html: "<input type=\"search\" placeholder=\"Szukaj...\" />" },
        { n: 16, type: "tel", desc: "Pole zoptymalizowane do wprowadzania numerów telefonów.", html: "<input type=\"tel\" placeholder=\"+48 000 000 000\" />" },
        { n: 17, type: "url", desc: "Pole sprawdzające poprawność formatu adresu internetowego.", html: "<input type=\"url\" placeholder=\"https://example.com\" />" },
        { n: 18, type: "hidden", desc: "Ukryte pole przechowujące dane niewidoczne dla użytkownika.", html: "<input type=\"hidden\" value=\"ukryta-wartosc\" /><span class=\"v1-stylelist-hidden-note\">(niewidoczne - wartość: \"ukryta-wartosc\")</span>" },
        { n: 19, type: "button (input)", desc: "Zwykły przycisk aktywowany najczęściej przez JavaScript.", html: "<input type=\"button\" value=\"Button\" />" },
        { n: 20, type: "submit (input)", desc: "Przycisk wysyłający dane z całego formularza na serwer.", html: "<input type=\"submit\" value=\"Submit\" />" },
        { n: 21, type: "reset (input)", desc: "Przycisk przywracający wszystkim polom wartości domyślne.", html: "<input type=\"reset\" value=\"Reset\" />" },
        { n: 22, type: "image (input)", desc: "Przycisk graficzny działający tak samo jak submit.", html: "<input type=\"image\" src=\"zebrus.png\" alt=\"Image submit\" width=\"22\" height=\"22\" />" },
        { n: 23, type: "textarea", desc: "Pole do wprowadzania wielu linijek tekstu (np. komentarze).", html: "<textarea class=\"v1-stylelist-textarea\" rows=\"2\" placeholder=\"Wiele linijek tekstu...\">Linia 1\nLinia 2\nLinia 3\nLinia 4\nLinia 5\nLinia 6</textarea>" },
        { n: 24, type: "select", desc: "Rozwijana lista wyboru zawierająca znaczniki option.", html: "<select><option>Opcja 1</option><option>Opcja 2</option><option>Opcja 3</option></select>" },
        { n: 25, type: "button (tag)", desc: "Znacznik <button> do klikania, mogący zawierać tekst lub grafikę.", html: "<button type=\"button\">🖼️ Przycisk</button>" },
      ];

      // shell: STYLELIST.md "Inne style" section - starts with the custom
      // faux-scrollbar system (vertical/horizontal), since that's what's
      // used app-wide instead of native browser scrollbars (see
      // custom-scrollbar-runtime.js). Both demo boxes are real, functional
      // scroll containers registered in SHELL_SCROLL_TARGETS - not static
      // mockups - so the thumb you see is the actual live mechanism.
      var styleListOtherItems = [
        {
          n: 1,
          type: "pasek pionowy (custom scrollbar)",
          desc: "Wlasny system zamiast natywnego paska przegladarki - .v1-faux-scrollbar / .v1-faux-scrollbar-thumb.",
          html: "<div class=\"v1-stylelist-scroll-v-demo\">" +
            [1, 2, 3, 4, 5, 6, 7, 8].map(function (n) { return "<p>Linia " + n + " przykladowej tresci do przewijania w pionie.</p>"; }).join("") +
            "</div>"
        },
        {
          n: 2,
          type: "pasek poziomy (custom scrollbar)",
          desc: "Ten sam system w wariancie poziomym - .v1-faux-scrollbar-h / .v1-faux-scrollbar-thumb-h.",
          html: "<div class=\"v1-stylelist-scroll-h-demo\"><div class=\"v1-stylelist-scroll-h-track\">" +
            [1, 2, 3, 4, 5, 6, 7, 8].map(function (n) { return "<span>Kolumna " + n + "</span>"; }).join("") +
            "</div></div>"
        },
      ];

      function renderStyleListRows(items) {
        return items.map(function (item) {
          return [
            "<div class=\"v1-stylelist-row\">",
            "<div class=\"v1-stylelist-meta\">",
            "<strong>" + item.n + ". " + escapeHtml(item.type) + "</strong>",
            "<span>" + escapeHtml(item.desc) + "</span>",
            "</div>",
            "<div class=\"v1-stylelist-demo\">" + item.html + "</div>",
            "</div>"
          ].join("");
        }).join("");
      }

      return [
        "<div>",
        "<h4>" + escapeHtml(tr("toolTitle_lorem_ipsum")) + "</h4>",
        paragraphs.map(function (p) { return "<p>" + escapeHtml(p) + "</p>"; }).join(""),
        "</div>",
        "<div class=\"v1-stylelist-columns\">",
        "<div class=\"v1-stylelist\">",
        "<h4>Style List &mdash; Inputy</h4>",
        "<p>Zywy podglad kazdego natywnego typu input + textarea/select/button. Zrodlo prawdy jeszcze nieustalone - patrz STYLELIST.md.</p>",
        renderStyleListRows(styleListItems),
        "</div>",
        "<div class=\"v1-stylelist v1-stylelist-columns-second\">",
        "<h4>Style List &mdash; Inne style</h4>",
        "<p>Pozostale elementy wizualne aplikacji, poza inputami - patrz STYLELIST.md.</p>",
        renderStyleListRows(styleListOtherItems),
        "</div>",
        "</div>"
      ].join("");
    }

    // shell: Language Manager row markup for one installed language - kept
    // as a standalone helper (not just inlined into renderLanguageManagerTool)
    // because panels-runtime.js's wireLanguageManagerButtons() needs the
    // exact same row shape to re-render #v1LangInstalledList after a radio
    // change / local import / catalog install, mirroring how Import Tool's
    // listInstalled()/renderCatalog() independently rebuild their own
    // sub-regions rather than re-running the initial render function.
    function renderLangInstalledRow(item, current) {
      var checked = item.code === current ? " checked" : "";
      var versionHtml = item.version ? " <span>@ " + escapeHtml(item.version) + "</span>" : "";
      return [
        "<label class=\"v1-lang-item\">",
        "<input type=\"radio\" name=\"v1LangActive\" data-lang-radio=\"" + escapeHtml(item.code) + "\"" + checked + " />",
        "<span class=\"v1-lang-flag\" aria-hidden=\"true\">" + escapeHtml(item.flag || "🌐") + "</span>",
        "<strong>" + escapeHtml(item.name || item.code.toUpperCase()) + "</strong>",
        versionHtml,
        "</label>"
      ].join("");
    }

    function renderLanguageManagerTool() {
      var current = document.documentElement.getAttribute("lang") || "en";
      var langDetails = [];
      try {
        langDetails = i18n && i18n.listLanguageDetails ? i18n.listLanguageDetails() : [];
      } catch (_) {
        langDetails = [];
      }
      var installedHtml = langDetails.map(function (item) {
        return renderLangInstalledRow(item, current);
      }).join("");

      return [
        "<div class=\"v1-import-manager\">",
        "<div class=\"v1-import-manager-head\">",
        "<h4 style=\"margin:0 0 4px;\">" + tr("langManagerTitle") + "</h4>",
        "</div>",
        "<h4 style=\"margin:12px 0 4px;\">" + tr("langInstalledHeading") + "</h4>",
        "<div id=\"v1LangInstalledList\" data-lang-role=\"installed-list\">" + installedHtml + "</div>",
        "<div class=\"v1-import-manager-actions\">",
        "<button type=\"button\" data-lang-action=\"import\">" + tr("langImportBtn") + "</button>",
        "</div>",
        "<h4 style=\"margin:12px 0 4px;\">" + tr("langCatalogHeading") + "</h4>",
        "<div id=\"v1LangCatalog\" data-lang-role=\"catalog\" class=\"v1-import-output v1-catalog-list\">" + escapeHtml(tr("langCatalogEmpty")) + "</div>",
        "</div>"
      ].join("");
    }

    // shell: settings screen letting the user pick, per shell-level setting,
    // whether it should be remembered across app restarts (TBM Options ->
    // General). Actual "remember" enforcement lives in bootstrap-runtime.js's
    // applyRememberedSettingsGate() - this function only renders/reads the
    // toggle state.
    function renderGeneralSettingsTool() {
      var settings = generalSettingsApi ? generalSettingsApi.getState() : {};

      function checkboxRow(key, icon, labelKey, labelFallback) {
        var checked = !!settings[key];
        return [
          "<label class=\"v1-results-columns-item v1-general-settings-item\">",
          "<input type=\"checkbox\" data-general-setting=\"" + escapeHtml(key) + "\"" + (checked ? " checked" : "") + " />",
          "<span class=\"v1-results-columns-icon\" aria-hidden=\"true\">" + escapeHtml(icon) + "</span>",
          "<span>" + escapeHtml(trOr(labelKey, labelFallback)) + "</span>",
          "</label>"
        ].join("");
      }

      function groupHeading(key, fallback) {
        return "<h4 class=\"v1-general-settings-group\">" + escapeHtml(trOr(key, fallback)) + "</h4>";
      }

      return [
        "<div class=\"v1-import-manager\">",
        "<div class=\"v1-import-manager-head\">",
        "<h4 style=\"margin:0 0 4px;\">" + escapeHtml(trOr("tipActionGeneral", "General")) + "</h4>",
        "<div class=\"v1-import-manager-note\">" + escapeHtml(trOr("generalIntroNote", "Choose which preferences should be remembered the next time you launch the app.")) + "</div>",
        "</div>",

        groupHeading("generalGroupSession", "Session"),
        checkboxRow("autoLoadLastSession", "🗂", "generalAutoLoadLastSession", "Auto Load last session"),

        groupHeading("generalGroupUpdates", "Updates"),
        checkboxRow("checkForUpdates", "🔔", "generalCheckForUpdates", "Check for updates on startup"),

        groupHeading("generalGroupAppearance", "Appearance"),
        checkboxRow("panelSideRight", "🔀", "generalPanelSideRight", "Swap panel sides (activity bar/LS on the right, RS on the left)"),
        checkboxRow("rememberLanguage", "🌐", "generalRememberLanguage", "Remember UI language"),
        checkboxRow("rememberSkin", "🎨", "generalRememberSkin", "Remember skin / theme"),
        checkboxRow("rememberPanelSizes", "↔️", "generalRememberPanelSizes", "Remember panel sizes and collapsed state"),

        groupHeading("generalGroupPrivacyTools", "Privacy & tools"),
        checkboxRow("rememberBlurIp", "👁", "generalRememberBlurIp", "Remember \"Blur IP addresses\" state"),
        checkboxRow("rememberShowUnfinishedTools", "🚧", "generalRememberShowUnfinishedTools", "Remember \"Show unfinished tools\" state"),

        groupHeading("generalGroupWindows", "Windows"),
        checkboxRow("rememberWindowState", "🖥️", "generalRememberWindowState", "Remember window state (windowed / maximized / fullscreen)"),
        checkboxRow("rememberDetachedWindows", "🗔", "generalRememberDetachedWindows", "Remember detached window layout"),
        checkboxRow("rememberOpenTabs", "📑", "generalRememberOpenTabs", "Remember open tabs (LS/RS/CS)"),

        groupHeading("generalGroupAssistant", "Assistant"),
        checkboxRow("rememberClippyEnabled", "📎", "generalRememberClippyEnabled", "Remember Clippy enabled state"),

        groupHeading("generalGroupAddons", "Addons"),
        checkboxRow("rememberExtensions", "📦", "generalRememberExtensions", "Remember installed addons"),
        "<div class=\"v1-import-manager-note\">" + escapeHtml(trOr("generalExtensionsCautionNote", "If unchecked, installed addons will need to be reinstalled every time the app starts.")) + "</div>",

        groupHeading("generalGroupHistory", "History"),
        checkboxRow("rememberRangeHistory", "🕓", "generalRememberRangeHistory", "Remember IP range history"),

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
            return "<div class=\"v1-import-item\"><strong>" + escapeHtml(item.id) + "</strong> <span>@ " + escapeHtml(item.version) + "</span><div>" + escapeHtml(item.name) + "</div>"
              + "<button type=\"button\" class=\"v1-import-item-uninstall\" data-import-uninstall-id=\"" + escapeHtml(item.id) + "\">" + escapeHtml(tr("importToolUninstallBtn")) + "</button></div>";
          }).join("")
        : "<div class=\"v1-import-empty\">" + escapeHtml(trOr("importToolEmptyText", importToolConfig.emptyText || "No imported tools yet.")) + "</div>";

      var subtitleText = trOr("importToolSubtitle", importToolConfig.subtitle || "Install addons from the GitHub catalog or load a manifest from a local file.");

      return [
        "<div class=\"v1-import-manager\">",
        "<div class=\"v1-import-manager-head\">",
        "<h4 style=\"margin:0 0 4px;\">" + tr("tipActionCustomization") + "</h4>",
        "<div class=\"v1-import-manager-note\">" + escapeHtml(subtitleText) + "</div>",
        "</div>",
        "<h4 style=\"margin:0 0 4px;\">" + escapeHtml(trOr("importToolCatalogHeading", importToolConfig.catalogHeading || "Www addons")) + "</h4>",
        "<div id=\"v1ImportCatalog\" data-import-role=\"catalog\" class=\"v1-import-output v1-catalog-list\">" + escapeHtml(trOr("importToolCatalogEmpty", importToolConfig.catalogEmpty || "Loading...")) + "</div>",
        "<div class=\"v1-import-manager-actions\">",
        "<button type=\"button\" data-import-action=\"load-file\">" + escapeHtml(trOr("importToolLoadFileBtn", importToolConfig.loadFileBtn || "Load from file...")) + "</button>",
        "</div>",
        "<h4 style=\"margin:12px 0 4px;\">" + escapeHtml(tr("extListHeader")) + "</h4>",
        "<div id=\"v1ImportOutput\" data-import-role=\"output\" class=\"v1-import-output\">" + listHtml + "</div>",
        "</div>"
      ].join("");
    }

    var SHELLCRAFT_FUNCTIONAL_BLOCKS = [
      { type: "if", icon: "🔀", labelKey: "shellcraftBlockIfLabel" },
      { type: "repeat-until", icon: "🔁", labelKey: "shellcraftBlockRepeatUntilLabel" },
      { type: "powershell", icon: "⌨", labelKey: "shellcraftBlockPowerShellLabel" },
      { type: "time-trigger", icon: "⏰", labelKey: "shellcraftBlockTimeTriggerLabel" },
    ];

    function shellcraftBlockRowHtml(attrs, icon, label) {
      return [
        "<div class=\"v1-lib-block-row\" draggable=\"true\" " + attrs + ">",
        "<span class=\"v1-lib-block-icon\" aria-hidden=\"true\">" + escapeHtml(icon) + "</span>",
        "<span class=\"v1-lib-block-name\">" + escapeHtml(label) + "</span>",
        "</div>"
      ].join("");
    }

    function renderShellCraftLibrary() {
      var functionalHtml = SHELLCRAFT_FUNCTIONAL_BLOCKS.map(function (block) {
        return shellcraftBlockRowHtml("data-block-type=\"" + block.type + "\"", block.icon, tr(block.labelKey));
      }).join("");

      var macros = macrosApi ? macrosApi.getMacros() : [];
      var macrosHtml = macros.map(function (macro) {
        return shellcraftBlockRowHtml(
          "data-block-type=\"macro\" data-macro-id=\"" + escapeHtml(macro.id) + "\"",
          macro.iconGlyph,
          tr(macro.nameKey)
        );
      }).join("");

      return [
        "<ul class=\"v1-tool-list\">",
        "<li>",
        "<div class=\"v1-section-header\"><strong>" + escapeHtml(tr("shellcraftLibraryFunctionalHeading")) + "</strong><span class=\"v1-collapse-arrow\">▼</span></div>",
        "<div class=\"v1-section-body\">" + functionalHtml + "</div>",
        "</li>",
        "<li>",
        "<div class=\"v1-section-header\"><strong>" + escapeHtml(tr("shellcraftLibraryMacrosHeading")) + "</strong><span class=\"v1-collapse-arrow\">▼</span></div>",
        "<div class=\"v1-section-body\">" + macrosHtml + "</div>",
        "</li>",
        "</ul>"
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
      var state = getPresetsState();
      var presets = Array.isArray(state.presets) ? state.presets : [];
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
        "<input id=\"v1DefaultsTimeout\" data-defaults-role=\"timeout\" type=\"number\" min=\"200\" max=\"5000\" step=\"50\" value=\"1000\" />",
        "<label for=\"v1DefaultsConcurrency\">" + escapeHtml(tr("defaultsConcurrencyLabel")) + "</label>",
        "<input id=\"v1DefaultsConcurrency\" data-defaults-role=\"concurrency\" type=\"number\" min=\"1\" max=\"256\" step=\"1\" value=\"128\" />",
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
            accessSnapshot: String(port.accessSnapshot || port.access || port.snapshot || port.url || "").trim(),
            protocol: String(port.protocol || "TCP").trim().toUpperCase(),
            service: String(port.service || "").trim(),
            ping: String(port.ping || "-").trim() || "-"
          };
        }

        var legacyLabel = String(port || "").replace(/^:/, "").trim();
        return {
          portLabel: legacyLabel,
          httpPageTitle: "",
          accessSnapshot: "",
          protocol: "TCP",
          service: sharedNet && typeof sharedNet.lookupPortService === "function"
            ? sharedNet.lookupPortService(legacyLabel)
            : "",
          ping: "-"
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
          var portProtocolBadge = "<span class=\"v1-ip-port-badge v1-ip-port-badge--protocol is-" + escapeHtml(portEntry.protocol.toLowerCase()) + "\">" + escapeHtml(portEntry.protocol) + "</span>";
          var portServiceBadge = portEntry.service ? "<span class=\"v1-ip-port-badge v1-ip-port-badge--service\">" + escapeHtml(portEntry.service) + "</span>" : "";
          return [
            "<tr class=\"v1-ip-port-row\" data-ports-row=\"" + idx + "\" data-port-index=\"" + portIdx + "\" data-port-key=\"" + escapeHtml(portKey) + "\" data-status=\"" + escapeHtml(statusKey) + "\" hidden>",
            "<td class=\"v1-ip-col-check\"><button type=\"button\" class=\"v1-ip-port-action-btn\" data-port-action=\"check\" data-port-key=\"" + escapeHtml(portKey) + "\" aria-pressed=\"false\" aria-label=\"Mark port\">✓</button></td>",
            "<td class=\"v1-ip-col-star\"><button type=\"button\" class=\"v1-ip-port-action-btn\" data-port-action=\"favorite\" data-port-key=\"" + escapeHtml(portKey) + "\" aria-pressed=\"false\" aria-label=\"Add port to favorites\">★</button></td>",
            "<td class=\"v1-ip-col-status\" aria-hidden=\"true\"></td>",
            "<td class=\"v1-ip-col-ip\"><span class=\"v1-ip-port-line\"><span class=\"v1-ip-port-line-start\"><span class=\"v1-ip-port-chip-emoji\" aria-hidden=\"true\" title=\"" + escapeHtml(selectedPresetLabel) + "\">" + escapeHtml(selectedPresetEmoji) + "</span><span class=\"v1-ip-port-value\">" + escapeHtml(portLabel) + "</span></span>" + portProtocolBadge + "</span></td>",
            "<td class=\"v1-ip-col-expand\" aria-hidden=\"true\"></td>",
            "<td class=\"v1-ip-col-ping\">" + escapeHtml(portEntry.ping) + "</td>",
            "<td class=\"v1-ip-col-host\" data-col=\"hostname\">" + portServiceBadge + "</td>",
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

    function renderCanvasBlockHtml(block) {
      var runnable = block.type === "macro";
      var iconGlyph = "⚙";
      var titleText = block.type;
      var bodyHtml = "";

      if (block.type === "macro") {
        var macro = macrosApi ? macrosApi.getMacro(block.properties.macroId) : null;
        iconGlyph = macro ? macro.iconGlyph : "🌐";
        titleText = macro ? tr(macro.nameKey) : block.properties.macroId;
        bodyHtml = "<button type=\"button\" class=\"v1-canvas-block-run-btn\" data-canvas-macro-run=\"" + escapeHtml(block.properties.macroId) + "\">" + escapeHtml(tr("macroRunBtn")) + "</button>";
      } else {
        if (block.type === "if") { iconGlyph = "🔀"; titleText = tr("shellcraftBlockIfLabel"); }
        else if (block.type === "repeat-until") { iconGlyph = "🔁"; titleText = tr("shellcraftBlockRepeatUntilLabel"); }
        else if (block.type === "powershell") { iconGlyph = "⌨"; titleText = tr("shellcraftBlockPowerShellLabel"); }
        else if (block.type === "time-trigger") { iconGlyph = "⏰"; titleText = tr("shellcraftBlockTimeTriggerLabel"); }
        bodyHtml = "<div class=\"v1-canvas-block-not-runnable-note\">" + escapeHtml(tr("shellcraftBlockNotRunnableNote")) + "</div>";
      }

      return [
        "<div class=\"v1-canvas-block\" draggable=\"true\" data-block-id=\"" + escapeHtml(block.id) + "\" data-block-type=\"" + escapeHtml(block.type) + "\"" + (runnable ? "" : " data-block-not-runnable=\"true\"") + " style=\"left:" + block.x + "px;top:" + block.y + "px;\">",
        "<div class=\"v1-canvas-block-head\"><span class=\"v1-canvas-block-icon\" aria-hidden=\"true\">" + escapeHtml(iconGlyph) + "</span><span class=\"v1-canvas-block-title\">" + escapeHtml(titleText) + "</span><button type=\"button\" class=\"v1-canvas-block-remove\" data-canvas-block-remove=\"" + escapeHtml(block.id) + "\" aria-label=\"" + escapeHtml(tr("shellcraftBlockDeleteBtn")) + "\" title=\"" + escapeHtml(tr("shellcraftBlockDeleteBtn")) + "\">&times;</button></div>",
        bodyHtml,
        "</div>"
      ].join("");
    }

    function renderShellCraftInspector(blockId) {
      var state = shellcraftCanvasApi ? shellcraftCanvasApi.getState() : { blocks: [] };
      var block = state.blocks.find(function (b) { return b.id === blockId; });

      if (!block) {
        return "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("shellcraftInspectorEmptyNote")) + "</div>";
      }

      if (block.type === "macro") {
        var macro = macrosApi ? macrosApi.getMacro(block.properties.macroId) : null;
        return [
          "<div class=\"v1-shellcraft-inspector-field\">",
          "<label>" + escapeHtml(tr("shellcraftInspectorMacroNameLabel")) + "</label>",
          "<div>" + escapeHtml(macro ? tr(macro.nameKey) : block.properties.macroId) + "</div>",
          "</div>",
          "<div class=\"v1-shellcraft-inspector-field\">",
          "<label>" + escapeHtml(tr("shellcraftInspectorMacroActionLabel")) + "</label>",
          "<div>" + escapeHtml(macro ? macro.scannerAction : "") + "</div>",
          "</div>",
          "<button type=\"button\" class=\"v1-canvas-block-run-btn\" data-canvas-macro-run=\"" + escapeHtml(block.properties.macroId) + "\">" + escapeHtml(tr("shellcraftInspectorRunBtn")) + "</button>"
        ].join("");
      }

      if (block.type === "if") {
        return [
          "<div class=\"v1-shellcraft-inspector-field\">",
          "<label for=\"v1InspectorCondition\">" + escapeHtml(tr("shellcraftInspectorConditionLabel")) + "</label>",
          "<textarea id=\"v1InspectorCondition\" rows=\"3\" data-inspector-field=\"condition\">" + escapeHtml(block.properties.condition) + "</textarea>",
          "</div>"
        ].join("");
      }

      if (block.type === "repeat-until") {
        return [
          "<div class=\"v1-shellcraft-inspector-field\">",
          "<label for=\"v1InspectorCondition\">" + escapeHtml(tr("shellcraftInspectorConditionLabel")) + "</label>",
          "<textarea id=\"v1InspectorCondition\" rows=\"3\" data-inspector-field=\"condition\">" + escapeHtml(block.properties.condition) + "</textarea>",
          "</div>",
          "<div class=\"v1-shellcraft-inspector-field\">",
          "<label for=\"v1InspectorMaxIterations\">" + escapeHtml(tr("shellcraftInspectorMaxIterationsLabel")) + "</label>",
          "<input id=\"v1InspectorMaxIterations\" type=\"number\" min=\"1\" data-inspector-field=\"maxIterations\" value=\"" + escapeHtml(String(block.properties.maxIterations)) + "\" />",
          "</div>"
        ].join("");
      }

      if (block.type === "powershell") {
        return [
          "<div class=\"v1-shellcraft-inspector-field\">",
          "<label for=\"v1InspectorCommand\">" + escapeHtml(tr("shellcraftInspectorCommandLabel")) + "</label>",
          "<textarea id=\"v1InspectorCommand\" rows=\"3\" data-inspector-field=\"command\">" + escapeHtml(block.properties.command) + "</textarea>",
          "</div>"
        ].join("");
      }

      if (block.type === "time-trigger") {
        return [
          "<div class=\"v1-shellcraft-inspector-field\">",
          "<label for=\"v1InspectorTime\">" + escapeHtml(tr("shellcraftInspectorTimeLabel")) + "</label>",
          "<input id=\"v1InspectorTime\" type=\"text\" placeholder=\"HH:MM\" data-inspector-field=\"time\" value=\"" + escapeHtml(block.properties.time) + "\" />",
          "</div>",
          "<div class=\"v1-shellcraft-inspector-field\">",
          "<label for=\"v1InspectorIntervalMinutes\">" + escapeHtml(tr("shellcraftInspectorIntervalMinutesLabel")) + "</label>",
          "<input id=\"v1InspectorIntervalMinutes\" type=\"number\" min=\"0\" data-inspector-field=\"intervalMinutes\" value=\"" + escapeHtml(String(block.properties.intervalMinutes)) + "\" />",
          "</div>"
        ].join("");
      }

      return "";
    }

    var SHELLCRAFT_VIEWS = [
      { id: "flow", labelKey: "shellcraftViewFlowLabel", enabled: true },
      { id: "timeline", labelKey: "shellcraftViewTimelineLabel", enabled: false },
      { id: "tree", labelKey: "shellcraftViewTreeLabel", enabled: false },
      { id: "layered", labelKey: "shellcraftViewLayeredLabel", enabled: false },
    ];

    function renderShellCraftViewSwitcher() {
      var buttonsHtml = SHELLCRAFT_VIEWS.map(function (view) {
        var attrs = "type=\"button\" class=\"v1-shellcraft-view-btn" + (view.id === "flow" ? " is-active" : "") + "\" data-shellcraft-view=\"" + view.id + "\"";
        if (!view.enabled) {
          attrs += " disabled title=\"" + escapeHtml(tr("shellcraftViewNotImplementedNote")) + "\"";
        }
        return "<button " + attrs + ">" + escapeHtml(tr(view.labelKey)) + "</button>";
      }).join("");

      return "<div class=\"v1-shellcraft-view-switcher\">" + buttonsHtml + "</div>";
    }

    function renderShellCraftCanvasTool() {
      var state = shellcraftCanvasApi ? shellcraftCanvasApi.getState() : { blocks: [] };
      var blocksHtml = state.blocks.map(renderCanvasBlockHtml).join("");

      return [
        renderShellCraftViewSwitcher(),
        "<div class=\"v1-shellcraft-canvas-shell\">",
        "<div class=\"v1-shellcraft-canvas\" id=\"v1ShellCraftCanvas\">",
        blocksHtml,
        "</div>",
        "</div>"
      ].join("");
    }

    var toolRenderers = {
      // --- shell keys ---
      versions: renderVersionsTool,
      about: renderAboutTool,
      license: renderLicenseTool,
      "lorem-ipsum": renderLoremIpsumTool,
      general: renderGeneralSettingsTool,
      "import-tool": renderImportTool,
      "language-manager": renderLanguageManagerTool,
      shellcraft: renderShellCraftCanvasTool,

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
      renderShellCraftLibrary: renderShellCraftLibrary,
      renderCanvasBlockHtml: renderCanvasBlockHtml,
      renderShellCraftInspector: renderShellCraftInspector,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createPanelContentRuntime = createPanelContentRuntime;
})();
