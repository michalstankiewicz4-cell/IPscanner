(function () {
  function createPanelContentRuntime(deps) {
    var tr = deps.tr;
    var escapeHtml = deps.escapeHtml;
    var infoFor = deps.infoFor;
    var versionsData = Array.isArray(deps.versionsData) ? deps.versionsData : [];
    var i18n = deps.i18n;
    var core = window.NetReconNewUICore || {};
    var sharedNet = core.utils ? core.utils.net : null;
    var contentConfig = core.panelContentConfig || {};
    var versionsConfig = contentConfig.versions || {};
    var resultsIpConfig = contentConfig.resultsIp || {};
    var presetsApi = core.presets || null;
    var macrosApi = core.macros || null;
    var shellcraftCanvasApi = core.shellcraftCanvas || null;
    var pulpitCanvasApi = core.pulpitCanvas || null;
    var pulpitPreviewApi = core.pulpitPreview || null;
    var platformApi = core.platform || null;
    var mailXssTesterApi = core.mailXssTester || null;
    var googleDorkApi = core.googleDork || null;
    var wifiApi = core.wifi || null;
    var communityChatApi = core.communityChat || null;
    var agentProfilesApi = core.agentProfiles || null;
    var reverseIpApi = core.reverseIp || null;
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
    // Addon-declared input fields (contributions.tools[key].fields, e.g. a
    // scan target, or a "technique" picker) - a small, constrained schema
    // (type/name/label/placeholder, or type/name/label/options for a
    // select), not arbitrary markup, matching the security posture of the
    // rest of this static card (see panels-runtime.js's
    // wireExtensionToolActions for how these get read at click time, and
    // for the "dynamic:<fieldName>" commandId convention a select-type
    // technique picker is meant to be used with).
    function renderExtFieldsHtml(fields) {
      if (!Array.isArray(fields) || !fields.length) return "";
      var rows = fields.map(function (field) {
        var name = String((field && field.name) || "");
        if (!name) return "";
        var label = escapeHtml(String((field && field.label) || name));
        var controlHtml;
        if ((field && field.type) === "select") {
          var options = Array.isArray(field.options) ? field.options : [];
          var optionsHtml = options.map(function (opt) {
            var value = escapeHtml(String((opt && opt.value) || ""));
            var optLabel = escapeHtml(String((opt && opt.label) || (opt && opt.value) || ""));
            return "<option value=\"" + value + "\">" + optLabel + "</option>";
          }).join("");
          // name + autocomplete="off": Chrome's DevTools Issues panel flags
          // any form field with neither an id nor a name attribute, and
          // separately suggests an explicit autocomplete value - "off" is
          // also the semantically correct choice here regardless of the
          // lint, since these are addon-specific values (a target IP, a
          // port list) that a browser's address/profile autofill should
          // never try to fill in.
          controlHtml = "<select data-ext-field=\"" + escapeHtml(name) + "\" name=\"" + escapeHtml(name) + "\" autocomplete=\"off\">" + optionsHtml + "</select>";
        } else {
          var type = (field && field.type) === "number" ? "number" : "text";
          var placeholder = escapeHtml(String((field && field.placeholder) || ""));
          // "default" prefills a REAL, editable value (e.g. a ready-to-run
          // ports list the user can tweak) - distinct from "placeholder",
          // which is just a hint that disappears the moment the user types
          // and is never part of the field's actual value.
          var defaultValue = escapeHtml(String((field && field.default) || ""));
          controlHtml = "<input type=\"" + type + "\" data-ext-field=\"" + escapeHtml(name) + "\" name=\"" + escapeHtml(name) + "\" autocomplete=\"off\" placeholder=\"" + placeholder + "\" value=\"" + defaultValue + "\" />";
        }
        return [
          "<label class=\"v1-ext-field-row\">",
          "<span class=\"v1-ext-field-label\">" + label + "</span>",
          controlHtml,
          "</label>"
        ].join("");
      }).join("");
      return "<div class=\"v1-ext-fields\">" + rows + "</div>";
    }

    // Hidden unless "rows" (already-JSON.parsed by the caller, from either a
    // live action result or a stored resultKey value re-rendered fresh - see
    // renderDefaultTool and wireExtensionToolActions in panels-runtime.js,
    // which both parse the same way) is a real array - the existing <pre>
    // output stays in the markup unconditionally as the fallback for non-
    // JSON/error results, so both can exist side by side and only one is
    // ever shown. Pre-populating from "rows" at render time (not just after
    // a live click) matters for the LS/CS split pattern: an action can
    // declare "openTool" to hand its result to a DIFFERENT tool's tab (e.g.
    // a left-panel fields+button tool opening a center-tab results tool) -
    // that other tool only ever gets a fresh renderDefaultTool() call, never
    // a live DOM patch, so it must be able to show the right rows the first
    // time it's rendered, not just after some later click.
    function renderExtResultsTableHtml(resultsTable, rows) {
      if (!resultsTable || !Array.isArray(resultsTable.columns) || !resultsTable.columns.length) return "";
      var headCells = resultsTable.columns.map(function (col) {
        return "<th>" + escapeHtml(String((col && col.label) || (col && col.key) || "")) + "</th>";
      }).join("");
      var bodyHtml = Array.isArray(rows) ? rows.map(function (row) {
        var cells = resultsTable.columns.map(function (col) {
          var value = row && Object.prototype.hasOwnProperty.call(row, col.key) ? row[col.key] : "";
          return "<td>" + escapeHtml(String(value == null ? "" : value)) + "</td>";
        }).join("");
        return "<tr>" + cells + "</tr>";
      }).join("") : "";
      var hiddenAttr = Array.isArray(rows) ? "" : " hidden";
      return [
        "<div class=\"v1-results-table-scroll v1-ext-results-table-scroll\" data-ext-results-table" + hiddenAttr + ">",
        "<table class=\"v1-results-table v1-ext-results-table\">",
        "<thead><tr>" + headCells + "</tr></thead>",
        "<tbody>" + bodyHtml + "</tbody>",
        "</table>",
        "</div>"
      ].join("");
    }

    function renderDefaultTool(tool) {
      var info = infoFor(tool);
      var points = (info.points || []).map(function (p) { return "<li>" + escapeHtml(p) + "</li>"; }).join("");
      var hasActions = Array.isArray(info.actions) && info.actions.length;
      var hasResult = info.resultText != null;
      var fieldsHtml = renderExtFieldsHtml(info.fields);

      var parsedTableRows = null;
      if (info.resultsTable && typeof info.resultText === "string" && info.resultText) {
        try {
          var parsed = JSON.parse(info.resultText);
          if (Array.isArray(parsed)) parsedTableRows = parsed;
        } catch (_) {
          parsedTableRows = null;
        }
      }

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
        // Hidden whenever there's genuinely nothing to show yet (no result
        // text at all - e.g. a tool whose action always hands its result to
        // a DIFFERENT tool via openTool, so this <pre> is never populated
        // locally) as well as when a table successfully parsed - otherwise
        // an empty bordered box shows up with nothing in it before the
        // first scan ever runs.
        var preHiddenAttr = (parsedTableRows || !info.resultText) ? " hidden" : "";
        actionsHtml = buttonsHtml + "<pre class=\"v1-ext-action-output\" data-ext-action-output" + preHiddenAttr + ">" + escapeHtml(info.resultText || "") + "</pre>" + renderExtResultsTableHtml(info.resultsTable, parsedTableRows);
      }
      // No <h4>info.title</h4> here on purpose - #v1ToolTitle (panels-
      // runtime.js's refreshActiveUI, an <h3> that sits above this whole
      // card for EVERY active tab) already shows the exact same title once;
      // repeating it here as an <h4> right below it looked like a genuine
      // rendering bug (two near-identical headings stacked with nothing
      // between them) even though it was two intentional-but-redundant
      // pieces of markup, not a duplicate-render defect.
      return "<div>" + escapeHtml(info.text) + "</div><ul>" + points + "</ul>" + fieldsHtml + actionsHtml;
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
      if (!versionsData.length) return "v2.2.0";
      var first = versionsData[0] || {};
      var version = first.version;
      if (!version) return "v2.2.0";
      return String(version);
    }

    function renderAboutTool() {
      var currentVersion = escapeHtml(getCurrentVersion());
      var heading = escapeHtml(tr("aboutHeading")) + " " + currentVersion;
      var contactUrl = "https://" + String(tr("aboutSupportFacebook") || "").trim();
      var projectUrl = "https://" + String(tr("aboutProjectPageUrl") || "").trim();
      var zrzutkaUrl = "https://" + String(tr("aboutZrzutkaUrl") || "").trim();
      var testersUrl = "https://github.com/tBane-Dev";
      var tester2Url = "https://4programmers.net/Profile/98598";
      return [
        "<div class=\"v1-about\">",
        "<h4>" + heading + "</h4>",
        "<p>" + escapeHtml(tr("aboutByAuthor")) + "</p>",
        "<p>" + escapeHtml(tr("aboutSpecialThanksHeading")) + "</p>",
        "<p>" + escapeHtml(tr("aboutTestersLabel")) + " <a href=\"" + escapeHtml(testersUrl) + "\" target=\"_blank\" rel=\"noopener noreferrer\">GitHub</a>, " + escapeHtml(tr("aboutTesters2Label")) + " <a href=\"" + escapeHtml(tester2Url) + "\" target=\"_blank\" rel=\"noopener noreferrer\">4Programmers</a></p>",
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

    // shell: "Style" tab - live catalog of every native <input>/form widget
    // style used across the app (see docs/STYLELIST.md), reachable via the
    // [Style] button in Options -> General -> Appearance.
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
      var versionHtml = item.version ? " <span>" + escapeHtml(tr("forAppVersionPrefix")) + " " + escapeHtml(item.version) + "</span>" : "";
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
        // No in-content "Language Manager" heading here - the CS tab's own
        // header (v1ToolTitle, fed by toolTitle_language_manager) already
        // shows that same text right above this content.
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

      // Mutually-exclusive radio, unlike checkboxRow above - used for
      // Inspect mode's identity (default / blend in as a normal browser /
      // openly identify as this app), where at most one can ever be active
      // at once. currentValue/optionValue comparison decides "checked",
      // same shape as the AI Assistant provider radio further down.
      function radioRow(name, optionValue, currentValue, icon, labelKey, labelFallback) {
        var checked = optionValue === currentValue;
        return [
          "<label class=\"v1-results-columns-item v1-general-settings-item\">",
          "<input type=\"radio\" name=\"" + escapeHtml(name) + "\" value=\"" + escapeHtml(optionValue) + "\"" + (checked ? " checked" : "") + " />",
          "<span class=\"v1-results-columns-icon\" aria-hidden=\"true\">" + escapeHtml(icon) + "</span>",
          "<span>" + escapeHtml(trOr(labelKey, labelFallback)) + "</span>",
          "</label>"
        ].join("");
      }

      // AI Assistant: one self-contained, colon-aligned block per provider
      // (Anthropic/Google) - each with its own model dropdown, API key
      // field, and RAM-vs-localStorage choice, so both can be configured
      // ahead of time; the "Provider" radio (shared name across both
      // blocks) just picks which one is currently active. UI/settings
      // only for now - nothing here calls a real Claude/Google endpoint yet.
      var AI_PROVIDER_META = {
        claude: {
          displayName: "Anthropic",
          keyLink: "https://platform.claude.com/settings/workspaces/default/keys",
          models: [["opus", "aiModelOpus", "Opus"], ["sonnet", "aiModelSonnet", "Sonnet"], ["haiku", "aiModelHaiku", "Haiku"]],
        },
        google: {
          displayName: "Google",
          keyLink: "https://aistudio.google.com/api-keys",
          models: [["pro", "aiModelPro", "Pro"], ["flash", "aiModelFlash", "Flash"]],
        },
      };

      function aiProviderBlock(providerId) {
        var aiConfigApi = window.NetReconNewUICore && window.NetReconNewUICore.aiAssistantConfig;
        var state = aiConfigApi ? aiConfigApi.getState() : { provider: "claude", claude: { model: "sonnet", keyStorage: "localstorage" }, google: { model: "flash", keyStorage: "localstorage" } };
        var apiKey = aiConfigApi ? aiConfigApi.getApiKey(providerId) : "";
        var providerState = state[providerId];
        var meta = AI_PROVIDER_META[providerId];
        var isActive = state.provider === providerId;

        var modelOptions = meta.models.map(function (m) {
          var value = m[0], labelKey = m[1], labelFallback = m[2];
          return "<option value=\"" + value + "\"" + (providerState.model === value ? " selected" : "") + ">" + escapeHtml(trOr(labelKey, labelFallback)) + "</option>";
        }).join("");

        return [
          "<div class=\"v1-ai-provider-block\">",

          "<span class=\"v1-ai-provider-field-label\">" + escapeHtml(trOr("aiFieldProvider", "Provider:")) + "</span>",
          "<span class=\"v1-ai-provider-field-value\">",
          "<label class=\"v1-ai-provider-radio\">",
          "<input type=\"radio\" name=\"v1AiProvider\" value=\"" + providerId + "\"" + (isActive ? " checked" : "") + " />",
          "<span>" + escapeHtml(meta.displayName) + "</span>",
          "</label>",
          " <a href=\"" + escapeHtml(meta.keyLink) + "\" target=\"_blank\" rel=\"noopener\" class=\"v1-ai-provider-link\">" + escapeHtml(trOr("aiGetKeyLinkText", "get API key")) + "</a>",
          "</span>",

          "<span class=\"v1-ai-provider-field-label\">" + escapeHtml(trOr("aiFieldModel", "Model:")) + "</span>",
          "<span class=\"v1-ai-provider-field-value\">",
          "<select data-ai-model-select=\"" + providerId + "\">" + modelOptions + "</select>",
          "</span>",

          "<span class=\"v1-ai-provider-field-label\">" + escapeHtml(trOr("aiApiKeyLabel", "API key:")) + "</span>",
          "<span class=\"v1-ai-provider-field-value\">",
          "<input type=\"text\" data-ai-api-key=\"" + providerId + "\" autocomplete=\"off\" value=\"" + escapeHtml(apiKey) + "\" placeholder=\"" + escapeHtml(trOr("aiApiKeyPlaceholder", "API key")) + "\" />",
          "</span>",

          "<span class=\"v1-ai-provider-field-label\">" + escapeHtml(trOr("aiFieldStorage", "Storage:")) + "</span>",
          "<span class=\"v1-ai-provider-field-value\">",
          "<label class=\"v1-ai-provider-radio\">",
          "<input type=\"radio\" name=\"v1AiKeyStorage-" + providerId + "\" value=\"localstorage\"" + (providerState.keyStorage === "localstorage" ? " checked" : "") + " />",
          "<span>" + escapeHtml(trOr("aiStorageLocal", "local")) + "</span>",
          "</label>",
          "<label class=\"v1-ai-provider-radio\">",
          "<input type=\"radio\" name=\"v1AiKeyStorage-" + providerId + "\" value=\"ram\"" + (providerState.keyStorage === "ram" ? " checked" : "") + " />",
          "<span>RAM</span>",
          "</label>",
          "</span>",

          "</div>"
        ].join("");
      }

      function aiSystemPromptRow(mode, labelKey, labelFallback) {
        var aiConfigApi = window.NetReconNewUICore && window.NetReconNewUICore.aiAssistantConfig;
        var state = aiConfigApi ? aiConfigApi.getState() : {};
        var field = mode === "ps" ? "systemPromptPs" : "systemPromptUi";
        var value = typeof state[field] === "string" ? state[field] : "";
        return [
          "<div class=\"v1-ai-prompt-block\">",
          "<label for=\"v1AiSystemPrompt-" + mode + "\">" + escapeHtml(trOr(labelKey, labelFallback)) + "</label>",
          "<textarea id=\"v1AiSystemPrompt-" + mode + "\" data-ai-system-prompt=\"" + mode + "\" rows=\"3\">" + escapeHtml(value) + "</textarea>",
          "<button type=\"button\" class=\"v1-ai-prompt-reset\" data-ai-prompt-reset=\"" + mode + "\">" + escapeHtml(trOr("aiSystemPromptRestoreBtn", "Restore default")) + "</button>",
          "</div>"
        ].join("");
      }

      function aiAssistantRow() {
        return aiProviderBlock("claude") + aiProviderBlock("google")
          + aiSystemPromptRow("ui", "aiSystemPromptUiLabel", "System prompt (UI mode)")
          + aiSystemPromptRow("ps", "aiSystemPromptPsLabel", "System prompt (PS mode)");
      }

      // Google Dork API config - just the key/CX fields for now (no
      // consumer yet); reuses the AI provider block's colon-aligned
      // label/value layout since it's a generic shape, not AI-specific.
      function googleDorkApiRow() {
        var api = window.NetReconNewUICore && window.NetReconNewUICore.googleDorkApiConfig;
        var apiKey = api ? api.getApiKey() : "";
        var cx = api ? api.getCx() : "";

        return [
          "<div class=\"v1-ai-provider-block\">",

          "<span class=\"v1-ai-provider-field-label\">" + escapeHtml(trOr("googleDorkApiKeyLabel", "API key:")) + "</span>",
          "<span class=\"v1-ai-provider-field-value\">",
          "<input type=\"text\" data-google-dork-api-key autocomplete=\"off\" value=\"" + escapeHtml(apiKey) + "\" placeholder=\"" + escapeHtml(trOr("googleDorkApiKeyPlaceholder", "Custom Search API key")) + "\" />",
          " <a href=\"https://console.cloud.google.com/apis/credentials\" target=\"_blank\" rel=\"noopener\" class=\"v1-ai-provider-link\">" + escapeHtml(trOr("aiGetKeyLinkText", "get API key")) + "</a>",
          "</span>",

          "<span class=\"v1-ai-provider-field-label\">" + escapeHtml(trOr("googleDorkApiCxLabel", "Search engine ID:")) + "</span>",
          "<span class=\"v1-ai-provider-field-value\">",
          "<input type=\"text\" data-google-dork-api-cx autocomplete=\"off\" value=\"" + escapeHtml(cx) + "\" placeholder=\"" + escapeHtml(trOr("googleDorkApiCxPlaceholder", "Search engine ID (cx)")) + "\" />",
          " <a href=\"https://programmablesearchengine.google.com/controlpanel/all\" target=\"_blank\" rel=\"noopener\" class=\"v1-ai-provider-link\">" + escapeHtml(trOr("googleDorkApiCxLinkText", "create one")) + "</a>",
          "</span>",

          "</div>",
          "<div class=\"v1-import-manager-note\">" + escapeHtml(trOr("googleDorkApiNote", "Not used yet - saved for a future \"extract results\" feature on Google Dork Finder.")) + "</div>"
        ].join("");
      }

      function styleButtonRow() {
        return [
          "<div class=\"v1-scanner-actions v1-scanner-actions--spaced\">",
          "<button type=\"button\" data-tool=\"lorem-ipsum\">🖌️ " + escapeHtml(trOr("toolTitle_lorem_ipsum", "Style")) + "</button>",
          "</div>"
        ].join("");
      }

      return [
        "<div class=\"v1-import-manager\">",
        "<div class=\"v1-import-manager-head\">",
        "<h4 style=\"margin:0 0 4px;\">" + escapeHtml(trOr("tipActionGeneral", "General")) + "</h4>",
        "<div class=\"v1-import-manager-note\">" + escapeHtml(trOr("generalIntroNote", "Choose which preferences should be remembered the next time you launch the app.")) + "</div>",
        "</div>",

        groupHeading("generalGroupSession", "Session"),
        checkboxRow("showStartupDisclaimer", "⚠️", "generalShowStartupDisclaimer", "Show amateur-project disclaimer on startup"),
        checkboxRow("autoLoadLastSession", "🗂", "generalAutoLoadLastSession", "Auto Load last session"),

        groupHeading("generalGroupUpdates", "Updates"),
        checkboxRow("checkForUpdates", "🔔", "generalCheckForUpdates", "Check for updates on startup"),

        groupHeading("generalGroupAppearance", "Appearance"),
        checkboxRow("panelSideRight", "🔀", "generalPanelSideRight", "Swap panel sides (activity bar/LS on the right, RS on the left)"),
        checkboxRow("rememberLanguage", "🌐", "generalRememberLanguage", "Remember UI language"),
        checkboxRow("rememberSkin", "🎨", "generalRememberSkin", "Remember skin / theme"),
        styleButtonRow(),
        checkboxRow("rememberPanelSizes", "↔️", "generalRememberPanelSizes", "Remember panel sizes and collapsed state"),

        groupHeading("generalGroupPrivacyTools", "Privacy & tools"),
        (function () {
          var browserIdentityMode = settings.browserIdentifyAsApp ? "identify" : (settings.browserInvisibility ? "blend" : "default");
          return [
            radioRow("v1BrowserIdentityMode", "default", browserIdentityMode, "🌐", "generalBrowserIdentityDefault", "Default (real WebView2 signature)"),
            radioRow("v1BrowserIdentityMode", "blend", browserIdentityMode, "🕶️", "generalBrowserInvisibility", "Blend in as a normal browser"),
            radioRow("v1BrowserIdentityMode", "identify", browserIdentityMode, "🏷️", "generalBrowserIdentifyAsApp", "Identify as \"OSINT NET Auditor\""),
          ].join("");
        })(),
        "<div class=\"v1-import-manager-note\">" + escapeHtml(trOr("generalBrowserIdentityNote", "Controls what a site sees during the Browser tool's Inspect mode: its own real WebView2 signature, a spoofed ordinary-browser fingerprint (User-Agent, navigator.webdriver, WebView2 markers), or an open \"OSINTNETAuditor\" User-Agent identifying this as an automated tool. Applies the next time you start Inspect.")) + "</div>",
        checkboxRow("rememberBlurIp", "👁", "generalRememberBlurIp", "Remember \"Blur IP addresses\" state"),

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

        groupHeading("generalGroupAiAssistant", "AI Assistant"),
        aiAssistantRow(),
        "<div class=\"v1-scanner-actions v1-scanner-actions--spaced\">",
        "<button type=\"button\" data-general-action=\"ai-permissions\">🔐 " + escapeHtml(trOr("aiManagePermissionsBtn", "Manage AI Tools & Permissions...")) + "</button>",
        "</div>",

        groupHeading("generalGroupGoogleDorkApi", "Google Dork API"),
        googleDorkApiRow(),

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
        return shellcraftBlockRowHtml(
          "data-block-type=\"" + block.type + "\" data-block-category=\"functional\"",
          block.icon,
          tr(block.labelKey)
        );
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

    // "fields" (beyond the universal name/host/note every type already
    // has) is a list of {id, label, kind} describing that type's own extra
    // config values, stored in the node's fields{} bag (pulpit-canvas-runtime.js).
    // Adding a whole new device type later is just one more entry here plus
    // matching i18n keys - no other file needs to change.
    var PULPIT_TYPES = [
      { type: "remote", icon: "🌐", labelKey: "pulpitAddRemoteBtn", nameKey: "pulpitDefaultNameRemote", fields: [] },
      { type: "local", icon: "💻", labelKey: "pulpitAddLocalBtn", nameKey: "pulpitDefaultNameLocal", fields: [] },
      { type: "virtual", icon: "🗔", labelKey: "pulpitAddVirtualBtn", nameKey: "pulpitDefaultNameVirtual", fields: [] },
      { type: "own", icon: "⚙", labelKey: "pulpitAddOwnBtn", nameKey: "pulpitDefaultNameOwn", fields: [] },
      { type: "server", icon: "🖧", labelKey: "pulpitAddServerBtn", nameKey: "pulpitDefaultNameServer",
        fields: [{ id: "os", label: "pulpitFieldOsLabel" }, { id: "role", label: "pulpitFieldRoleLabel" }] },
      { type: "switch", icon: "🔀", labelKey: "pulpitAddSwitchBtn", nameKey: "pulpitDefaultNameSwitch",
        fields: [{ id: "ports", label: "pulpitFieldPortsLabel" }, { id: "vlan", label: "pulpitFieldVlanLabel" }] },
      { type: "printer", icon: "🖨", labelKey: "pulpitAddPrinterBtn", nameKey: "pulpitDefaultNamePrinter",
        fields: [{ id: "model", label: "pulpitFieldModelLabel" }, { id: "queue", label: "pulpitFieldQueueLabel" }] },
      { type: "router", icon: "📡", labelKey: "pulpitAddRouterBtn", nameKey: "pulpitDefaultNameRouter",
        fields: [{ id: "wan", label: "pulpitFieldWanLabel" }] },
      { type: "scanner", icon: "🔍", labelKey: "pulpitAddScannerBtn", nameKey: "pulpitDefaultNameScanner", fields: [], isTool: true },
      { type: "sniffer", icon: "🛰", labelKey: "pulpitAddSnifferBtn", nameKey: "pulpitDefaultNameSniffer", fields: [], isTool: true },
    ];

    function pulpitFieldsFor(type) {
      var entry = PULPIT_TYPES.filter(function (t) { return t.type === type; })[0];
      return entry ? entry.fields : [];
    }

    function pulpitIconFor(type) {
      var entry = PULPIT_TYPES.filter(function (t) { return t.type === type; })[0];
      return entry ? entry.icon : "⚙";
    }

    function pulpitTypeLabel(type) {
      return escapeHtml(tr("pulpitType" + type.charAt(0).toUpperCase() + type.slice(1) + "Label"));
    }

    // LS: plain click-to-add buttons (not draggable rows like ShellCraft's
    // library - adding a computer doesn't need a drag gesture, a button is
    // simpler and the pulpitCanvas API already takes an explicit x/y).
    function pulpitAddButtonHtml(entry) {
      return [
        "<button type=\"button\" class=\"v1-pulpit-add-btn\" data-pulpit-add-type=\"" + entry.type + "\">",
        "<span class=\"v1-pulpit-add-icon\" aria-hidden=\"true\">" + escapeHtml(entry.icon) + "</span>",
        "<span class=\"v1-pulpit-add-name\">" + escapeHtml(tr(entry.labelKey)) + "</span>",
        "</button>"
      ].join("");
    }

    function renderPulpitLibrary() {
      var deviceButtonsHtml = PULPIT_TYPES.filter(function (entry) { return !entry.isTool; }).map(pulpitAddButtonHtml).join("");
      var toolButtonsHtml = PULPIT_TYPES.filter(function (entry) { return entry.isTool; }).map(pulpitAddButtonHtml).join("");

      return [
        "<ul class=\"v1-tool-list\">",
        "<li>",
        "<div class=\"v1-section-header\"><strong>" + escapeHtml(tr("pulpitLibraryHeading")) + "</strong><span class=\"v1-collapse-arrow\">▼</span></div>",
        "<div class=\"v1-section-body\">",
        "<button type=\"button\" class=\"v1-pulpit-connect-btn\" data-pulpit-auto-discover>" + escapeHtml(tr("pulpitAutoDiscoverBtn")) + "</button>",
        deviceButtonsHtml,
        "</div>",
        "</li>",
        "<li>",
        "<div class=\"v1-section-header\"><strong>" + escapeHtml(tr("pulpitLibraryToolsHeading")) + "</strong><span class=\"v1-collapse-arrow\">▼</span></div>",
        "<div class=\"v1-section-body\">",
        toolButtonsHtml,
        "</div>",
        "</li>",
        "</ul>"
      ].join("");
    }

    // CS: one desktop-style icon (glyph on top, name label underneath) per
    // computer - draggable="true" for repositioning (reuses ShellCraft's
    // native-HTML5-DnD move mechanism, just not its "drag a new one in from
    // the library" mechanism, since adding is button-driven here).
    function renderPulpitNodeHtml(node) {
      var icon = pulpitIconFor(node.type);
      var label = node.name || tr("pulpitDefaultName" + node.type.charAt(0).toUpperCase() + node.type.slice(1));
      return [
        "<div class=\"v1-pulpit-node\" draggable=\"true\" data-node-id=\"" + escapeHtml(node.id) + "\" data-node-type=\"" + escapeHtml(node.type) + "\" style=\"left:" + node.x + "px;top:" + node.y + "px;\">",
        "<button type=\"button\" class=\"v1-pulpit-node-remove\" data-pulpit-node-remove=\"" + escapeHtml(node.id) + "\" aria-label=\"" + escapeHtml(tr("pulpitNodeDeleteBtn")) + "\" title=\"" + escapeHtml(tr("pulpitNodeDeleteBtn")) + "\">&times;</button>",
        "<span class=\"v1-pulpit-node-icon\" aria-hidden=\"true\">" + escapeHtml(icon) + "</span>",
        "<span class=\"v1-pulpit-node-label\">" + escapeHtml(label) + "</span>",
        "<span class=\"v1-pulpit-connector\" data-connector-for=\"" + escapeHtml(node.id) + "\" draggable=\"false\"></span>",
        "</div>"
      ].join("");
    }

    // Resolves which host/port pair is "live" right now based on the
    // node's hypervisor pick - null if no hypervisor is selected yet (VNC
    // has nothing to connect to in that state). Duplicated (not shared via
    // import) in pulpit-preview-runtime.js, same small-logic-duplication
    // convention this codebase already uses between independent runtime
    // modules elsewhere.
    function pulpitResolveVncTarget(node) {
      if (node.hypervisor === "qemu") return { host: node.vncQemuHost, port: node.vncQemuPort };
      if (node.hypervisor === "vb") return { host: node.vncVbHost, port: node.vncVbPort };
      return null;
    }

    // Desktop-only (see pulpit-preview-runtime.js's own comment) - a raw TCP
    // connection to the node's VNC server has to be opened by the native
    // Rust process, no browser (including the www/GitHub Pages build) can
    // do this itself. Rather than let a click silently fail there, the
    // button is replaced by an explanatory note.
    function renderPulpitPreviewToggle(node) {
      if (platformApi && typeof platformApi.isDesktop === "function" && !platformApi.isDesktop()) {
        return "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(tr("pulpitPreviewDesktopOnlyNote")) + "</p>";
      }
      var target = pulpitResolveVncTarget(node);
      var ready = !!(target && target.host && target.port);
      var active = !!(pulpitPreviewApi && pulpitPreviewApi.isActive && pulpitPreviewApi.isActive(node.id));
      var labelKey = active ? "pulpitPreviewStopBtn" : "pulpitPreviewStartBtn";
      return [
        "<button type=\"button\" class=\"v1-pulpit-connect-btn" + (active ? " is-active" : "") + "\" data-pulpit-preview-toggle=\"" + escapeHtml(node.id) + "\"" + (ready ? "" : " disabled") + ">",
        escapeHtml(tr(labelKey)),
        "</button>",
        ready ? "" : "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(tr("pulpitPreviewNeedsHostNote")) + "</p>"
      ].join("");
    }

    // Two independent checkboxes (RDP/VNC - a node can expose either, both,
    // or neither) then a divider then two radio-like checkboxes (QEMU/VB -
    // mutually exclusive, enforced by only ever rendering ONE of them
    // checked based on the single node.hypervisor string - see
    // panel-interactions-runtime.js's change handler for the other half of
    // that). Wired via [data-pulpit-conn-checkbox]/[data-pulpit-hypervisor-
    // checkbox], deliberately NOT data-inspector-field - the existing
    // delegated "input" listener only ever reads target.value, and
    // overloading it to also branch on .checked risks a regression in the
    // text-field path it already handles correctly.
    function renderPulpitConnCheckboxRow(node) {
      function checkboxItem(id, checked, labelKey, extraAttrs) {
        return [
          "<span class=\"v1-pulpit-checkbox-item\">",
          "<input id=\"" + id + "\" type=\"checkbox\"" + extraAttrs + (checked ? " checked" : "") + " />",
          "<label for=\"" + id + "\">" + escapeHtml(tr(labelKey)) + "</label>",
          "</span>"
        ].join("");
      }
      return [
        "<div class=\"v1-pulpit-checkbox-row\">",
        checkboxItem("v1InspectorPulpitConnRdp", node.connRdp, "pulpitConnRdpLabel", " data-pulpit-conn-checkbox=\"connRdp\""),
        checkboxItem("v1InspectorPulpitConnVnc", node.connVnc, "pulpitConnVncLabel", " data-pulpit-conn-checkbox=\"connVnc\""),
        "<span class=\"v1-pulpit-checkbox-divider\" aria-hidden=\"true\"></span>",
        checkboxItem("v1InspectorPulpitHypervisorQemu", node.hypervisor === "qemu", "pulpitHypervisorQemuLabel", " data-pulpit-hypervisor-checkbox data-hypervisor-value=\"qemu\""),
        checkboxItem("v1InspectorPulpitHypervisorVb", node.hypervisor === "vb", "pulpitHypervisorVbLabel", " data-pulpit-hypervisor-checkbox data-hypervisor-value=\"vb\""),
        "</div>"
      ].join("");
    }

    // A QEMU-managed VM and a VirtualBox-managed VM are physically
    // different machines (e.g. QEMU's own loopback-bound native VNC vs. a
    // VirtualBox VM's bridged LAN IP running a guest-side TigerVNC), so
    // which host/port pair is shown - and which one Podgląd actually
    // connects to, see pulpit-preview-runtime.js's resolveVncTarget() -
    // switches with the hypervisor checkbox instead of being one shared
    // field. No hypervisor picked yet -> a note instead of fields, since
    // there'd be no way to know which pair to show/edit.
    function renderPulpitVncFieldsForHypervisor(node) {
      if (!node.hypervisor) {
        return "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(tr("pulpitVncNeedsHypervisorNote")) + "</p>";
      }
      var isQemu = node.hypervisor === "qemu";
      var hostField = isQemu ? "vncQemuHost" : "vncVbHost";
      var portField = isQemu ? "vncQemuPort" : "vncVbPort";
      var hostValue = isQemu ? node.vncQemuHost : node.vncVbHost;
      var portValue = isQemu ? node.vncQemuPort : node.vncVbPort;
      var hintKey = isQemu ? "pulpitHypervisorQemuVncHint" : "pulpitHypervisorVbVncHint";
      return [
        "<div class=\"v1-pulpit-inspector-field\">",
        "<label for=\"v1InspectorPulpitVncHost\">" + escapeHtml(tr("pulpitInspectorHostLabel")) + " (" + escapeHtml(tr(isQemu ? "pulpitHypervisorQemuLabel" : "pulpitHypervisorVbLabel")) + ")</label>",
        "<input id=\"v1InspectorPulpitVncHost\" type=\"text\" data-inspector-field=\"" + hostField + "\" placeholder=\"127.0.0.1\" value=\"" + escapeHtml(hostValue) + "\" />",
        "</div>",
        "<div class=\"v1-pulpit-inspector-field\">",
        "<label for=\"v1InspectorPulpitVncPort\">" + escapeHtml(tr("pulpitInspectorVncPortLabel")) + "</label>",
        "<input id=\"v1InspectorPulpitVncPort\" type=\"text\" data-inspector-field=\"" + portField + "\" placeholder=\"5900\" value=\"" + escapeHtml(portValue) + "\" />",
        "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(tr(hintKey)) + "</p>",
        "</div>",
        renderPulpitPreviewToggle(node)
      ].join("");
    }

    // RS: name/host/note are editable (data-inspector-field, same delegated-
    // input-listener convention ShellCraft's inspector already uses); type is
    // fixed at creation, shown read-only.
    function renderPulpitInspector(nodeId) {
      var state = pulpitCanvasApi ? pulpitCanvasApi.getState() : { nodes: [] };
      var node = state.nodes.find(function (n) { return n.id === nodeId; });

      if (!node) {
        return "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("pulpitInspectorEmptyNote")) + "</div>";
      }

      return [
        "<div class=\"v1-pulpit-inspector-field\">",
        "<label>" + escapeHtml(tr("pulpitInspectorTypeLabel")) + "</label>",
        "<div>" + pulpitTypeLabel(node.type) + "</div>",
        "</div>",
        "<div class=\"v1-pulpit-inspector-field\">",
        "<label for=\"v1InspectorPulpitName\">" + escapeHtml(tr("pulpitInspectorNameLabel")) + "</label>",
        "<input id=\"v1InspectorPulpitName\" type=\"text\" data-inspector-field=\"name\" value=\"" + escapeHtml(node.name) + "\" />",
        "</div>",
        "<div class=\"v1-pulpit-inspector-field\">",
        "<label for=\"v1InspectorPulpitHost\">" + escapeHtml(tr("pulpitInspectorHostLabel")) + "</label>",
        "<input id=\"v1InspectorPulpitHost\" type=\"text\" data-inspector-field=\"host\" value=\"" + escapeHtml(node.host) + "\" />",
        "</div>",
        renderPulpitConnCheckboxRow(node),
        node.connRdp
          ? "<button type=\"button\" class=\"v1-pulpit-connect-btn\" data-pulpit-rdp-connect=\"" + escapeHtml(node.id) + "\">" + escapeHtml(tr("pulpitRdpConnectBtn")) + "</button>"
          : "",
        node.connVnc ? renderPulpitVncFieldsForHypervisor(node) : "",
        "<div class=\"v1-pulpit-inspector-field\">",
        "<label for=\"v1InspectorPulpitNote\">" + escapeHtml(tr("pulpitInspectorNoteLabel")) + "</label>",
        "<textarea id=\"v1InspectorPulpitNote\" rows=\"3\" data-inspector-field=\"note\">" + escapeHtml(node.note) + "</textarea>",
        "</div>",
        pulpitFieldsFor(node.type).map(function (f) {
          var fieldId = "v1InspectorPulpitField_" + f.id;
          var value = (node.fields && node.fields[f.id]) || "";
          return [
            "<div class=\"v1-pulpit-inspector-field\">",
            "<label for=\"" + fieldId + "\">" + escapeHtml(tr(f.label)) + "</label>",
            "<input id=\"" + fieldId + "\" type=\"text\" data-inspector-field=\"fields." + f.id + "\" value=\"" + escapeHtml(value) + "\" />",
            "</div>"
          ].join("");
        }).join(""),
        renderPulpitRemoteRunSection(node)
      ].join("");
    }

    // A deliberately separate form from the fields above: none of these
    // inputs use data-inspector-field, so wirePulpitInspector's delegated
    // "input" listener (which persists every keystroke into the canvas's
    // own localStorage-backed state via updateNodeProperties) never sees
    // them - a remote-install password must never end up in
    // netrecon_pulpit_canvas_v1. Wrapped in <form> (submit handled in JS,
    // never actually navigates) and the password field gets an explicit
    // autocomplete/name/id set so Chromium doesn't warn about an
    // unidentified or formless password field.
    function renderPulpitRemoteRunSection(node) {
      return [
        "<div class=\"v1-pulpit-remote-run\">",
        "<div class=\"v1-section-header\"><strong>" + escapeHtml(tr("pulpitRemoteRunHeading")) + "</strong></div>",
        "<form data-pulpit-remote-run-form=\"" + escapeHtml(node.id) + "\">",
        "<div class=\"v1-pulpit-inspector-field\">",
        "<label for=\"v1PulpitRemoteHost\">" + escapeHtml(tr("pulpitRemoteHostLabel")) + "</label>",
        "<input id=\"v1PulpitRemoteHost\" name=\"pulpitRemoteHost\" type=\"text\" autocomplete=\"off\" data-remote-run-field=\"computerName\" value=\"" + escapeHtml(node.host) + "\" />",
        "</div>",
        "<div class=\"v1-pulpit-inspector-field\">",
        "<label for=\"v1PulpitRemoteUsername\">" + escapeHtml(tr("pulpitRemoteUsernameLabel")) + "</label>",
        "<input id=\"v1PulpitRemoteUsername\" name=\"pulpitRemoteUsername\" type=\"text\" autocomplete=\"off\" data-remote-run-field=\"username\" />",
        "</div>",
        "<div class=\"v1-pulpit-inspector-field\">",
        "<label for=\"v1PulpitRemotePassword\">" + escapeHtml(tr("pulpitRemotePasswordLabel")) + "</label>",
        "<input id=\"v1PulpitRemotePassword\" name=\"pulpitRemotePassword\" type=\"password\" autocomplete=\"off\" data-remote-run-field=\"password\" />",
        "</div>",
        "<div class=\"v1-pulpit-inspector-field\">",
        "<label for=\"v1PulpitRemoteInstallerUrl\">" + escapeHtml(tr("pulpitRemoteInstallerUrlLabel")) + "</label>",
        "<input id=\"v1PulpitRemoteInstallerUrl\" name=\"pulpitRemoteInstallerUrl\" type=\"text\" autocomplete=\"off\" data-remote-run-field=\"installerUrl\" />",
        "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(tr("pulpitRemoteInstallerUrlHint")) + "</p>",
        "<div class=\"v1-pulpit-remote-quickpicks\">",
        "<button type=\"button\" class=\"v1-pulpit-connect-btn\" data-pulpit-remote-quickpick=\"qemu\">" + escapeHtml(tr("pulpitRemoteQemuQuickpickBtn")) + "</button>",
        "<button type=\"button\" class=\"v1-pulpit-connect-btn\" data-pulpit-remote-quickpick=\"virtualbox\">" + escapeHtml(tr("pulpitRemoteVirtualboxQuickpickBtn")) + "</button>",
        "</div>",
        "</div>",
        "<button type=\"submit\" class=\"v1-pulpit-remote-run-submit\" data-pulpit-remote-run-submit=\"" + escapeHtml(node.id) + "\">" + escapeHtml(tr("pulpitRemoteRunSubmitBtn")) + "</button>",
        "</form>",
        "<div class=\"v1-pulpit-remote-run-result\" data-pulpit-remote-run-result=\"" + escapeHtml(node.id) + "\" hidden></div>",
        "</div>"
      ].join("");
    }

    // CS: the currently-focused live preview session, big. The actual live
    // surface (noVNC's canvas) is mounted into [data-pulpit-preview-mount]
    // AFTER this string is assigned via innerHTML - by
    // wirePulpitPreviewTool (panel-interactions-runtime.js), via
    // pulpitPreviewApi.mountSurface(), never by this function itself: a
    // live RFB session lives in a real DOM node that must survive being
    // moved around, not be re-created from an HTML string on every render.
    function renderPulpitPreviewTool() {
      // Always wrapped in this one stable element (regardless of which of
      // the 3 states below applies) so wirePulpitPreviewTool
      // (panel-interactions-runtime.js) has something constant to capture
      // at wire-time and check document.body.contains(...) against on
      // later re-renders - the same staleness-guard shape wirePulpitCanvas
      // already uses for its own canvasEl, needed here because this tool's
      // CS content gets fully replaced whenever the user switches to a
      // different tab.
      var inner;
      if (platformApi && typeof platformApi.isDesktop === "function" && !platformApi.isDesktop()) {
        inner = "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("pulpitPreviewDesktopOnlyNote")) + "</div>";
      } else {
        var focusedId = pulpitPreviewApi ? pulpitPreviewApi.getFocusedNodeId() : "";
        inner = focusedId
          ? "<div class=\"v1-pulpit-preview-big\" data-pulpit-preview-mount=\"" + escapeHtml(focusedId) + "\"></div>"
          : "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("pulpitPreviewEmptyNote")) + "</div>";
      }
      return "<div class=\"v1-pulpit-preview-shell\">" + inner + "</div>";
    }

    // RS: every currently-watched node as a small live thumbnail ("like
    // cameras") - same mount-after-render discipline as
    // renderPulpitPreviewTool above.
    function renderPulpitPreviewList() {
      if (platformApi && typeof platformApi.isDesktop === "function" && !platformApi.isDesktop()) {
        return "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("pulpitPreviewDesktopOnlyNote")) + "</div>";
      }
      var activeIds = pulpitPreviewApi ? pulpitPreviewApi.getActiveNodeIds() : [];
      if (!activeIds.length) {
        return "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("pulpitPreviewNoneActiveNote")) + "</div>";
      }
      var state = pulpitCanvasApi ? pulpitCanvasApi.getState() : { nodes: [] };
      var nodeById = {};
      state.nodes.forEach(function (n) { nodeById[n.id] = n; });
      var focusedId = pulpitPreviewApi.getFocusedNodeId();

      var thumbsHtml = activeIds.map(function (nodeId) {
        var node = nodeById[nodeId];
        var label = node ? (node.name || node.host || nodeId) : nodeId;
        return [
          "<div class=\"v1-pulpit-preview-thumb" + (nodeId === focusedId ? " is-focused" : "") + "\" data-pulpit-preview-thumb=\"" + escapeHtml(nodeId) + "\">",
          "<div class=\"v1-pulpit-preview-thumb-mount\" data-pulpit-preview-mount=\"" + escapeHtml(nodeId) + "\"></div>",
          "<div class=\"v1-pulpit-preview-thumb-label\">" + escapeHtml(label) + "</div>",
          "<button type=\"button\" class=\"v1-pulpit-preview-thumb-stop\" data-pulpit-preview-stop=\"" + escapeHtml(nodeId) + "\" aria-label=\"" + escapeHtml(tr("pulpitPreviewStopBtn")) + "\" title=\"" + escapeHtml(tr("pulpitPreviewStopBtn")) + "\">&times;</button>",
          "</div>"
        ].join("");
      }).join("");

      return "<div class=\"v1-pulpit-preview-grid\">" + thumbsHtml + "</div>";
    }

    // shell: Globe - CS-only tab (no LS/RS), a lazy-loaded globe.gl WebGL
    // canvas plotting scanned hosts by geolocation. Just an empty, sized
    // shell here - wireGlobeTool (panel-interactions-runtime.js) fills it
    // in async (loading/empty states, then the actual globe) since building
    // it requires the vendored engine to finish loading and geo_lookup
    // calls to resolve, neither of which this synchronous renderer can do.
    function renderGlobeTool() {
      return "<div class=\"v1-globe-shell\" id=\"v1GlobeContainer\"></div>";
    }

    // Mail XSS Tester: desktop-only for the same reason Topology's VNC
    // preview is - the beacon HTTP listener and the cloudflared tunnel
    // process both need Rust's raw TCP/process-spawn capability, neither
    // of which any browser (including the www/GitHub Pages build) has.
    function mailXssTesterIsDesktop() {
      return !(platformApi && typeof platformApi.isDesktop === "function" && !platformApi.isDesktop());
    }

    // LS: payload picker, tunnel start/stop + status, and the send form -
    // password/app-password fields are read directly at submit time by
    // wireMailXssTesterLibrary (panel-interactions-runtime.js), never
    // routed through any persisted-state mechanism, same one-time
    // credential discipline as the remote-install password field.
    function renderMailXssTesterLibrary() {
      // Full form stays visible on www (payload picker, fields, buttons) -
      // only the two actions that need the desktop backend (tunnel,
      // send) are disabled with an inline hint, instead of blocking the
      // whole panel behind a single "desktop only" note.
      var isDesktopMode = mailXssTesterIsDesktop();

      var payloads = mailXssTesterApi ? mailXssTesterApi.getPayloads() : [];
      var selected = mailXssTesterApi ? mailXssTesterApi.getSelectedPayloadIds() : [];
      var status = mailXssTesterApi ? mailXssTesterApi.getTunnelStatus() : "idle";
      var url = mailXssTesterApi ? mailXssTesterApi.getTunnelUrl() : "";
      var error = mailXssTesterApi ? mailXssTesterApi.getTunnelError() : "";

      var payloadsHtml = payloads.map(function (p) {
        var checked = selected.indexOf(p.id) !== -1;
        var fieldId = "v1MailXssPayload_" + p.id;
        return [
          "<span class=\"v1-pulpit-checkbox-item\">",
          "<input id=\"" + fieldId + "\" type=\"checkbox\" data-mail-xss-payload-checkbox=\"" + escapeHtml(p.id) + "\"" + (checked ? " checked" : "") + " />",
          "<label for=\"" + fieldId + "\">" + escapeHtml(tr(p.labelKey)) + "</label>",
          "</span>"
        ].join("");
      }).join("");

      var tunnelStatusHtml = "";
      if (status === "running") {
        tunnelStatusHtml = "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(tr("mailXssTunnelRunningNote")) + " " + escapeHtml(url) + "</p>";
      } else if (status === "starting") {
        tunnelStatusHtml = "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(tr("mailXssTunnelStartingNote")) + "</p>";
      } else if (status === "error") {
        tunnelStatusHtml = [
          "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(tr("mailXssTunnelErrorPrefix")) + " " + escapeHtml(error) + "</p>",
          "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(tr("mailXssCloudflaredWhichFileNote")) + "</p>",
          "<button type=\"button\" class=\"v1-pulpit-connect-btn\" data-mail-xss-cloudflared-download>" + escapeHtml(tr("mailXssDownloadCloudflaredBtn")) + "</button>"
        ].join("");
      }

      var sendDisabled = status !== "running" || !isDesktopMode;
      var tunnelBtnDisabled = status === "starting" || !isDesktopMode;
      var desktopOnlyHintHtml = isDesktopMode ? "" : "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(tr("mailXssDesktopOnlyNote")) + "</p>";

      return [
        "<ul class=\"v1-tool-list\">",
        "<li>",
        "<div class=\"v1-section-header\"><strong>" + escapeHtml(tr("mailXssPayloadsHeading")) + "</strong><span class=\"v1-collapse-arrow\">▼</span></div>",
        "<div class=\"v1-section-body v1-pulpit-checkbox-row\">",
        payloadsHtml,
        "</div>",
        "</li>",
        "<li>",
        "<div class=\"v1-section-header\"><strong>" + escapeHtml(tr("mailXssTunnelHeading")) + "</strong><span class=\"v1-collapse-arrow\">▼</span></div>",
        "<div class=\"v1-section-body\">",
        desktopOnlyHintHtml,
        "<button type=\"button\" class=\"v1-pulpit-connect-btn" + (status === "running" ? " is-active" : "") + "\" data-mail-xss-tunnel-toggle" + (tunnelBtnDisabled ? " disabled" : "") + ">" + escapeHtml(tr(status === "running" ? "mailXssStopTunnelBtn" : "mailXssStartTunnelBtn")) + "</button>",
        tunnelStatusHtml,
        "</div>",
        "</li>",
        "<li>",
        "<div class=\"v1-section-header\"><strong>" + escapeHtml(tr("mailXssSendHeading")) + "</strong><span class=\"v1-collapse-arrow\">▼</span></div>",
        "<div class=\"v1-section-body\">",
        "<form data-mail-xss-send-form>",
        "<div class=\"v1-pulpit-inspector-field\">",
        "<label for=\"v1MailXssGmailAddress\">" + escapeHtml(tr("mailXssGmailAddressLabel")) + "</label>",
        "<input id=\"v1MailXssGmailAddress\" name=\"mailXssGmailAddress\" type=\"email\" autocomplete=\"off\" data-mail-xss-field=\"gmailAddress\" />",
        "</div>",
        "<div class=\"v1-pulpit-inspector-field\">",
        "<label for=\"v1MailXssAppPassword\">" + escapeHtml(tr("mailXssAppPasswordLabel")) + "</label>",
        "<input id=\"v1MailXssAppPassword\" name=\"mailXssAppPassword\" type=\"password\" autocomplete=\"off\" data-mail-xss-field=\"appPassword\" />",
        "</div>",
        "<div class=\"v1-pulpit-inspector-field\">",
        "<label for=\"v1MailXssTo\">" + escapeHtml(tr("mailXssToLabel")) + "</label>",
        "<input id=\"v1MailXssTo\" name=\"mailXssTo\" type=\"email\" autocomplete=\"off\" data-mail-xss-field=\"to\" />",
        "</div>",
        "<div class=\"v1-pulpit-inspector-field\">",
        "<label for=\"v1MailXssSubject\">" + escapeHtml(tr("mailXssSubjectLabel")) + "</label>",
        "<input id=\"v1MailXssSubject\" name=\"mailXssSubject\" type=\"text\" autocomplete=\"off\" data-mail-xss-field=\"subject\" value=\"" + escapeHtml(tr("mailXssDefaultSubject")) + "\" />",
        "</div>",
        "<button type=\"submit\" class=\"v1-pulpit-remote-run-submit\" data-mail-xss-send-submit" + (sendDisabled ? " disabled" : "") + ">" + escapeHtml(tr("mailXssSendBtn")) + "</button>",
        "</form>",
        "<div class=\"v1-pulpit-remote-run-result\" data-mail-xss-send-result hidden></div>",
        "</div>",
        "</li>",
        "</ul>"
      ].join("");
    }

    // CS: a live results summary - one row per selected payload, updating
    // as newui:mail-xss-tester-changed fires (wireMailXssTesterResults
    // re-renders this same shell, see panel-interactions-runtime.js).
    function renderMailXssTesterTool() {
      var payloads = mailXssTesterApi ? mailXssTesterApi.getPayloads() : [];
      var selected = mailXssTesterApi ? mailXssTesterApi.getSelectedPayloadIds() : [];
      var triggered = mailXssTesterApi ? mailXssTesterApi.getTriggeredPayloadIds() : [];
      var status = mailXssTesterApi ? mailXssTesterApi.getTunnelStatus() : "idle";

      var rowsHtml = payloads.filter(function (p) {
        return selected.indexOf(p.id) !== -1;
      }).map(function (p) {
        var isTriggered = triggered.indexOf(p.id) !== -1;
        return [
          "<tr>",
          "<td>" + escapeHtml(tr(p.labelKey)) + "</td>",
          "<td class=\"" + (isTriggered ? "v1-mail-xss-triggered-yes" : "v1-mail-xss-triggered-no") + "\">" + escapeHtml(tr(isTriggered ? "mailXssTriggeredYes" : "mailXssTriggeredNo")) + "</td>",
          "</tr>"
        ].join("");
      }).join("");

      var inner = [
        !mailXssTesterIsDesktop() ? "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(tr("mailXssDesktopOnlyNote")) + "</p>" : "",
        "<div class=\"v1-pulpit-inspector-field\">",
        "<label>" + escapeHtml(tr("mailXssTunnelHeading")) + "</label>",
        "<div>" + escapeHtml(tr("mailXssStatus_" + status)) + "</div>",
        "</div>",
        rowsHtml
          ? "<table class=\"v1-mail-xss-results-table\"><thead><tr><th>" + escapeHtml(tr("mailXssPayloadColumnLabel")) + "</th><th>" + escapeHtml(tr("mailXssTriggeredColumnLabel")) + "</th></tr></thead><tbody>" + rowsHtml + "</tbody></table>"
          : "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("mailXssNoPayloadsSelectedNote")) + "</div>"
      ].join("");
      return "<div class=\"v1-mail-xss-tester-shell\">" + inner + "</div>";
    }

    // RS: raw hit log, newest first - the User-Agent header is useful for
    // identifying which mail client/proxy actually fetched the beacon
    // (e.g. Gmail's own image-proxy UA vs. a desktop client's).
    function renderMailXssTesterResults() {
      var hits = mailXssTesterApi ? mailXssTesterApi.getHits() : [];
      if (!hits.length) {
        return "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("mailXssNoHitsYetNote")) + "</div>";
      }

      var rowsHtml = hits.slice().reverse().map(function (h) {
        var time = h.timestamp_ms ? new Date(h.timestamp_ms).toLocaleTimeString() : "";
        return [
          "<div class=\"v1-mail-xss-hit-row\">",
          "<div class=\"v1-mail-xss-hit-time\">" + escapeHtml(time) + "</div>",
          "<div class=\"v1-mail-xss-hit-payload\">" + escapeHtml(h.payload_id || "") + "</div>",
          "<div class=\"v1-mail-xss-hit-ua\">" + escapeHtml(h.user_agent || "") + "</div>",
          "<div class=\"v1-mail-xss-hit-addr\">" + escapeHtml(h.remote_addr || "") + "</div>",
          "</div>"
        ].join("");
      }).join("");

      return "<div class=\"v1-mail-xss-hit-log\">" + rowsHtml + "</div>";
    }

    // LS: the 9 builder fields (site:/filetype:/inurl:/intitle:/intext:,
    // exact phrase, +include/-exclude, and a verbatim "raw" field for
    // anything else) - no action button here, "Open in Google" lives on
    // CS next to the live query preview it actually opens.
    function renderGoogleDorkLibrary() {
      var fields = googleDorkApi ? googleDorkApi.getFields() : {};

      function fieldRow(key, labelKey) {
        var id = "v1GoogleDorkField_" + key;
        return [
          "<div class=\"v1-pulpit-inspector-field\">",
          "<label for=\"" + id + "\">" + escapeHtml(tr(labelKey)) + "</label>",
          "<input id=\"" + id + "\" type=\"text\" autocomplete=\"off\" data-google-dork-field=\"" + key + "\" value=\"" + escapeHtml(fields[key] || "") + "\" />",
          "</div>"
        ].join("");
      }

      return [
        "<ul class=\"v1-tool-list\">",
        "<li>",
        "<div class=\"v1-section-header\"><strong>" + escapeHtml(tr("googleDorkFieldsHeading")) + "</strong><span class=\"v1-collapse-arrow\">▼</span></div>",
        "<div class=\"v1-section-body\">",
        fieldRow("target", "googleDorkTargetLabel"),
        fieldRow("filetype", "googleDorkFiletypeLabel"),
        fieldRow("inurl", "googleDorkInurlLabel"),
        fieldRow("intitle", "googleDorkIntitleLabel"),
        fieldRow("intext", "googleDorkIntextLabel"),
        fieldRow("phrase", "googleDorkPhraseLabel"),
        fieldRow("include", "googleDorkIncludeLabel"),
        fieldRow("exclude", "googleDorkExcludeLabel"),
        fieldRow("raw", "googleDorkRawLabel"),
        "</div>",
        "</li>",
        "</ul>"
      ].join("");
    }

    // CS: live composed query, "Open in Google" (disabled while the query
    // is blank), and the saved query history - use/delete buttons mirror
    // scanner-sidebar-runtime.js's renderRangeHistory() convention (the
    // closest existing analog: a capped, dedupe-on-add local history).
    function renderGoogleDorkTool() {
      var query = googleDorkApi ? googleDorkApi.getComposedQuery() : "";
      var history = googleDorkApi ? googleDorkApi.getHistory() : [];

      var historyHtml = history.length
        ? history.map(function (item, idx) {
            return [
              "<div class=\"v1-google-dork-history-row\">",
              "<span class=\"v1-google-dork-history-text\" title=\"" + escapeHtml(item.query) + "\">" + escapeHtml(item.query) + "</span>",
              "<span class=\"v1-google-dork-history-actions\">",
              "<button type=\"button\" class=\"v1-range-history-btn\" data-google-dork-history-action=\"use\" data-google-dork-history-index=\"" + idx + "\" title=\"" + escapeHtml(tr("googleDorkHistoryUseAria")) + "\" aria-label=\"" + escapeHtml(tr("googleDorkHistoryUseAria")) + "\">&gt;</button>",
              "<button type=\"button\" class=\"v1-range-history-btn\" data-google-dork-history-action=\"delete\" data-google-dork-history-index=\"" + idx + "\" title=\"" + escapeHtml(tr("googleDorkHistoryDeleteAria")) + "\" aria-label=\"" + escapeHtml(tr("googleDorkHistoryDeleteAria")) + "\">&times;</button>",
              "</span>",
              "</div>"
            ].join("");
          }).join("")
        : "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("googleDorkHistoryEmptyNote")) + "</div>";

      return [
        "<div class=\"v1-google-dork-shell\">",
        "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(tr("googleDorkResponsibleUseNote")) + "</p>",
        "<div class=\"v1-pulpit-inspector-field\">",
        "<label>" + escapeHtml(tr("googleDorkQueryHeading")) + "</label>",
        query
          ? "<div class=\"v1-google-dork-query-preview\">" + escapeHtml(query) + "</div>"
          : "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("googleDorkQueryEmptyNote")) + "</div>",
        "</div>",
        "<button type=\"button\" class=\"v1-pulpit-connect-btn\" data-google-dork-open-btn" + (query ? "" : " disabled") + ">" + escapeHtml(tr("googleDorkOpenBtn")) + "</button>",
        "<div class=\"v1-section-header\"><strong>" + escapeHtml(tr("googleDorkHistoryHeading")) + "</strong><span class=\"v1-collapse-arrow\">▼</span></div>",
        historyHtml,
        "</div>"
      ].join("");
    }

    // shell: single-field form + results, all backed by src-tauri/src/
    // main.rs's https_audit command (real HTTP request from Rust, not the
    // webview's own fetch(), so it can read another domain's response
    // headers without hitting CORS) - see https-auditor-runtime.js for the
    // state layer, wireHttpsAuditorTool (panel-interactions-runtime.js) for
    // the click handling.
    function httpsAuditorRow(label, value, isGood) {
      var cls = "v1-https-auditor-row" + (isGood === true ? " is-ok" : isGood === false ? " is-bad" : "");
      return "<div class=\"" + cls + "\"><span>" + escapeHtml(label) + "</span><strong>" + escapeHtml(value) + "</strong></div>";
    }

    function httpsAuditorCsvEscape(value) {
      var s = value === null || value === undefined ? "" : String(value);
      return /["\n,]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s;
    }

    // Same fields/order as the on-screen rows above - used by both the
    // "Export CSV" (file download) and "Copy" (clipboard) buttons, so the
    // two always agree on content down to the row order.
    function httpsAuditorResultToCsv(result) {
      if (!result) return "";
      var rows = [
        ["Field", "Value"],
        ["Requested URL", result.requestedUrl],
        ["Final URL", result.finalUrl],
        ["Final status", result.finalStatus],
        ["HTTP upgrades to HTTPS", result.httpUpgradesToHttps ? "Yes" : "No"],
        ["HSTS", result.hsts || "Missing"],
        ["HSTS preloaded", result.hstsPreloaded ? "Yes" : "No"],
        ["Content-Security-Policy", result.csp || "Missing"],
        ["X-Frame-Options", result.xFrameOptions || "Missing"],
        ["X-Content-Type-Options", result.xContentTypeOptions || "Missing"],
        ["Referrer-Policy", result.referrerPolicy || "Missing"],
        ["Server", result.server || "Missing"],
        ["Mixed content count", result.mixedContentCount],
        ["Mixed content examples", (result.mixedContentExamples || []).join(" | ")],
      ];
      if (result.cert) {
        rows.push(["Certificate subject", result.cert.subject]);
        rows.push(["Certificate issuer", result.cert.issuer]);
        rows.push(["Certificate expires", result.cert.notAfter]);
        rows.push(["Certificate days until expiry", result.cert.daysUntilExpiry]);
        rows.push(["Certificate expired", result.cert.expired ? "Yes" : "No"]);
      }
      var grade = computeHttpsAuditorGrade(result);
      rows.push(["Grade", grade.letter + " (" + grade.passed + "/" + grade.total + ")"]);
      (result.redirectChain || []).forEach(function (hop, idx) {
        rows.push(["Redirect " + (idx + 1), hop.status + " -> " + hop.url]);
      });
      return rows.map(function (row) {
        return row.map(httpsAuditorCsvEscape).join(",");
      }).join("\r\n");
    }

    // Simple pass/fail score across the checks that have a clear right
    // answer (cert validity only counts if a cert was actually readable -
    // a failed/unreachable cert probe shouldn't silently drag the grade
    // down when it's really "we don't know", not "this failed"). Mirrors
    // the letter-grade style tools like Mozilla Observatory/securityheaders.com
    // use - one glance, not nine rows to read individually.
    function computeHttpsAuditorGrade(result) {
      var checks = [
        !!result.hsts,
        result.hstsPreloaded,
        !!result.csp,
        !!result.xFrameOptions,
        !!result.xContentTypeOptions,
        !!result.referrerPolicy,
        result.httpUpgradesToHttps,
        result.mixedContentCount === 0,
      ];
      if (result.cert) checks.push(!result.cert.expired);

      var passed = checks.filter(Boolean).length;
      var total = checks.length;
      var pct = total ? passed / total : 0;
      var letter = pct >= 0.9 ? "A" : pct >= 0.75 ? "B" : pct >= 0.6 ? "C" : pct >= 0.4 ? "D" : "F";
      return { letter: letter, passed: passed, total: total };
    }

    function renderHttpsAuditorGrade(grade) {
      var cls = "v1-https-auditor-grade v1-https-auditor-grade-" + grade.letter.toLowerCase();
      return "<div class=\"" + cls + "\"><span class=\"v1-https-auditor-grade-letter\">" + escapeHtml(grade.letter) + "</span><span>" + grade.passed + "/" + grade.total + "</span></div>";
    }

    function renderHttpsAuditorResult(result) {
      if (!result) return "";
      var redirectHtml = result.redirectChain && result.redirectChain.length
        ? result.redirectChain.map(function (hop) {
            return "<div class=\"v1-https-auditor-hop\">" + escapeHtml(hop.status) + " &rarr; " + escapeHtml(hop.url) + "</div>";
          }).join("")
        : "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("httpsAuditorNoRedirectsNote")) + "</div>";

      var mixedHtml = result.mixedContentCount > 0
        ? [
            httpsAuditorRow(tr("httpsAuditorMixedContentLabel"), String(result.mixedContentCount), false),
            (result.mixedContentExamples || []).map(function (u) {
              return "<div class=\"v1-https-auditor-hop\">" + escapeHtml(u) + "</div>";
            }).join("")
          ].join("")
        : httpsAuditorRow(tr("httpsAuditorMixedContentLabel"), "0", true);

      var certHtml = result.cert
        ? [
            "<div class=\"v1-section-header\"><strong>" + escapeHtml(tr("httpsAuditorCertHeading")) + "</strong></div>",
            httpsAuditorRow(tr("httpsAuditorCertSubjectLabel"), result.cert.subject, null),
            httpsAuditorRow(tr("httpsAuditorCertIssuerLabel"), result.cert.issuer, null),
            httpsAuditorRow(tr("httpsAuditorCertExpiresLabel"), result.cert.notAfter, !result.cert.expired),
            httpsAuditorRow(
              tr("httpsAuditorCertDaysLeftLabel"),
              String(result.cert.daysUntilExpiry),
              result.cert.expired ? false : result.cert.daysUntilExpiry > 14
            ),
          ].join("")
        : "";

      return [
        "<div class=\"v1-https-auditor-result\">",
        renderHttpsAuditorGrade(computeHttpsAuditorGrade(result)),
        "<div class=\"v1-import-manager-actions\">",
        "<button type=\"button\" data-https-auditor-export-csv-btn>" + escapeHtml(tr("httpsAuditorExportCsvBtn")) + "</button>",
        "<button type=\"button\" data-https-auditor-copy-btn>" + escapeHtml(tr("httpsAuditorCopyBtn")) + "</button>",
        "</div>",
        httpsAuditorRow(tr("httpsAuditorFinalUrlLabel"), result.finalUrl, null),
        httpsAuditorRow(tr("httpsAuditorStatusLabel"), String(result.finalStatus), result.finalStatus >= 200 && result.finalStatus < 400),
        httpsAuditorRow(tr("httpsAuditorHttpUpgradeLabel"), tr(result.httpUpgradesToHttps ? "httpsAuditorYes" : "httpsAuditorNo"), result.httpUpgradesToHttps),
        httpsAuditorRow(tr("httpsAuditorHstsLabel"), result.hsts || tr("httpsAuditorMissing"), !!result.hsts),
        httpsAuditorRow(tr("httpsAuditorHstsPreloadLabel"), tr(result.hstsPreloaded ? "httpsAuditorYes" : "httpsAuditorNo"), result.hstsPreloaded),
        httpsAuditorRow(tr("httpsAuditorCspLabel"), result.csp || tr("httpsAuditorMissing"), !!result.csp),
        httpsAuditorRow(tr("httpsAuditorXfoLabel"), result.xFrameOptions || tr("httpsAuditorMissing"), !!result.xFrameOptions),
        httpsAuditorRow(tr("httpsAuditorXctoLabel"), result.xContentTypeOptions || tr("httpsAuditorMissing"), !!result.xContentTypeOptions),
        httpsAuditorRow(tr("httpsAuditorReferrerPolicyLabel"), result.referrerPolicy || tr("httpsAuditorMissing"), !!result.referrerPolicy),
        httpsAuditorRow(tr("httpsAuditorServerLabel"), result.server || tr("httpsAuditorMissing"), null),
        mixedHtml,
        certHtml,
        "<div class=\"v1-section-header\"><strong>" + escapeHtml(tr("httpsAuditorRedirectChainLabel")) + "</strong></div>",
        redirectHtml,
        "</div>"
      ].join("");
    }

    function renderHttpsAuditorTool() {
      var isDesktop = !(platformApi && typeof platformApi.isDesktop === "function" && !platformApi.isDesktop());
      var api = window.NetReconNewUICore && window.NetReconNewUICore.httpsAuditor;
      var loading = api ? api.getLoading() : false;
      var error = api ? api.getError() : "";
      // A selected LS history entry (including the one a just-finished run
      // lands on automatically - see https-auditor-runtime.js's
      // addHistoryEntry()) takes priority over the bare "last run" result,
      // so clicking an older entry in the left panel actually replaces
      // what's shown here rather than always showing the latest run.
      var selectedEntry = api ? api.getSelectedEntry() : null;
      var result = selectedEntry ? selectedEntry.result : (api ? api.getResult() : null);
      // Same precedence as `result` above - clicking a history entry
      // should refill the URL bar with what was actually audited, not
      // leave it showing whatever was last typed/run.
      var lastUrl = selectedEntry ? (selectedEntry.requestedUrl || selectedEntry.finalUrl) : (api ? api.getLastUrl() : "");

      var bodyHtml;
      if (!isDesktop) {
        bodyHtml = "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(tr("httpsAuditorDesktopOnlyNote")) + "</p>";
      } else if (loading) {
        bodyHtml = "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("httpsAuditorRunningNote")) + "</div>";
      } else if (error) {
        bodyHtml = "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(tr("httpsAuditorErrorPrefix")) + " " + escapeHtml(error) + "</p>";
      } else if (result) {
        bodyHtml = renderHttpsAuditorResult(result);
      } else {
        bodyHtml = "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("httpsAuditorEmptyNote")) + "</div>";
      }

      return [
        "<div class=\"v1-https-auditor-shell\">",
        "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(tr("httpsAuditorIntroNote")) + "</p>",
        isDesktop ? [
          "<div class=\"v1-import-manager-actions\">",
          "<input type=\"text\" id=\"v1HttpsAuditorUrlInput\" data-https-auditor-url-input name=\"httpsAuditorUrl\" autocomplete=\"off\" placeholder=\"" + escapeHtml(tr("httpsAuditorUrlPlaceholder")) + "\"" + (lastUrl ? " value=\"" + escapeHtml(lastUrl) + "\"" : "") + " />",
          "<button type=\"button\" data-https-auditor-run-btn" + (loading ? " disabled" : "") + ">" + escapeHtml(tr("httpsAuditorRunBtn")) + "</button>",
          "</div>"
        ].join("") : "",
        bodyHtml,
        "</div>"
      ].join("");
    }

    // CS: single tab, no LS/RS - IP input + PTR result + reverse-lookup
    // domain list, all client-side (see reverse-ip-runtime.js), so unlike
    // HTTPS Auditor/Mail XSS Tester this has no isDesktop() gating at all.
    function renderReverseIpTool() {
      var api = reverseIpApi;
      var lastIp = api ? api.getLastIp() : "";
      var loading = api ? api.getLoading() : false;
      var error = api ? api.getError() : "";
      var ptrHostname = api ? api.getPtrHostname() : null;
      var domains = api ? api.getDomains() : null;
      var domainsNote = api ? api.getDomainsNote() : "";
      var ownership = api ? api.getOwnership() : null;
      var ownershipNote = api ? api.getOwnershipNote() : "";

      var bodyHtml;
      if (loading) {
        bodyHtml = "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("reverseIpRunningNote")) + "</div>";
      } else if (error === "invalid-ip") {
        bodyHtml = "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(tr("reverseIpInvalidIpNote")) + "</p>";
      } else if (lastIp) {
        var ptrHtml = [
          "<div class=\"v1-section-header\"><strong>" + escapeHtml(tr("reverseIpPtrHeading")) + "</strong></div>",
          "<div class=\"v1-reverse-ip-ptr" + (ptrHostname ? "" : " is-empty") + "\">" + escapeHtml(ptrHostname || tr("reverseIpPtrNoneNote")) + "</div>"
        ].join("");

        var domainsListHtml;
        if (domains === null) {
          domainsListHtml = "";
        } else if (domains.length) {
          domainsListHtml = "<div class=\"v1-reverse-ip-domains-list\">" + domains.map(function (d) {
            return "<div class=\"v1-reverse-ip-domain-row\">" + escapeHtml(d) + "</div>";
          }).join("") + "</div>";
        } else if (domainsNote) {
          domainsListHtml = "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(tr("reverseIpDomainsNotePrefix")) + " " + escapeHtml(domainsNote) + "</p>";
        } else {
          domainsListHtml = "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("reverseIpDomainsNoneNote")) + "</div>";
        }

        var domainsHeading = domains && domains.length
          ? tr("reverseIpDomainsHeading") + " (" + domains.length + ")"
          : tr("reverseIpDomainsHeading");

        var domainsHtml = [
          "<div class=\"v1-section-header\"><strong>" + escapeHtml(domainsHeading) + "</strong></div>",
          domainsListHtml
        ].join("");

        // Reuses httpsAuditorRow()'s label/value row (and its
        // .v1-https-auditor-row CSS class, loaded globally regardless of
        // which tool is active) rather than a second near-identical
        // helper just for this tool.
        var ownershipBodyHtml;
        if (ownership) {
          ownershipBodyHtml = [
            ownership.orgName ? httpsAuditorRow(tr("reverseIpOwnershipOrgLabel"), ownership.orgName, null) : "",
            ownership.name ? httpsAuditorRow(tr("reverseIpOwnershipNameLabel"), ownership.name, null) : "",
            ownership.range ? httpsAuditorRow(tr("reverseIpOwnershipRangeLabel"), ownership.range, null) : "",
            ownership.country ? httpsAuditorRow(tr("reverseIpOwnershipCountryLabel"), ownership.country, null) : ""
          ].join("");
        } else if (ownershipNote) {
          ownershipBodyHtml = "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(ownershipNote) + "</p>";
        } else {
          ownershipBodyHtml = "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("reverseIpOwnershipNoneNote")) + "</div>";
        }
        var ownershipHtml = [
          "<div class=\"v1-section-header\"><strong>" + escapeHtml(tr("reverseIpOwnershipHeading")) + "</strong></div>",
          ownershipBodyHtml
        ].join("");

        bodyHtml = ptrHtml + ownershipHtml + domainsHtml;
      } else {
        bodyHtml = "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("reverseIpEmptyNote")) + "</div>";
      }

      return [
        "<div class=\"v1-reverse-ip-shell\">",
        "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(tr("reverseIpIntroNote")) + "</p>",
        "<div class=\"v1-import-manager-actions\">",
        "<input type=\"text\" id=\"v1ReverseIpInput\" data-reverse-ip-input name=\"reverseIp\" autocomplete=\"off\" placeholder=\"" + escapeHtml(tr("reverseIpPlaceholder")) + "\"" + (lastIp ? " value=\"" + escapeHtml(lastIp) + "\"" : "") + " />",
        "<button type=\"button\" data-reverse-ip-run-btn" + (loading ? " disabled" : "") + ">" + escapeHtml(tr("reverseIpRunBtn")) + "</button>",
        "</div>",
        bodyHtml,
        "</div>"
      ].join("");
    }

    function httpsAuditorFormatTimestamp(iso) {
      var d = new Date(iso);
      return isNaN(d.getTime()) ? String(iso || "") : d.toLocaleString();
    }

    // LS: every past audit (timestamp + URL + grade badge), newest first -
    // clicking a row calls api.selectHistoryEntry(), which the CS detail
    // tab (renderHttpsAuditorTool above) and this list both re-render from
    // on the shared newui:https-auditor-changed event. No add button here -
    // rows are only created by running an audit from the CS tab.
    function renderHttpsAuditorLibrary() {
      var api = window.NetReconNewUICore && window.NetReconNewUICore.httpsAuditor;
      var history = api ? api.getHistory() : [];
      var selectedId = api ? api.getSelectedId() : "";

      var rowsHtml = history.length ? history.map(function (entry) {
        var isSelected = entry.id === selectedId;
        var gradeCls = "v1-https-auditor-lib-grade v1-https-auditor-grade-" + (entry.grade || "f").toLowerCase();
        return [
          "<div class=\"v1-https-auditor-lib-row" + (isSelected ? " is-selected" : "") + "\" data-https-audit-id=\"" + escapeHtml(entry.id) + "\">",
          "<span class=\"" + gradeCls + "\">" + escapeHtml(entry.grade || "?") + "</span>",
          "<span class=\"v1-https-auditor-lib-info\">",
          "<span class=\"v1-https-auditor-lib-url\">" + escapeHtml(entry.finalUrl || entry.requestedUrl) + "</span>",
          "<span class=\"v1-https-auditor-lib-time\">" + escapeHtml(httpsAuditorFormatTimestamp(entry.auditedAt)) + "</span>",
          "</span>",
          "<button type=\"button\" class=\"v1-https-auditor-lib-remove\" data-https-audit-remove=\"" + escapeHtml(entry.id) + "\" aria-label=\"" + escapeHtml(tr("httpsAuditorDeleteEntryBtn")) + "\" title=\"" + escapeHtml(tr("httpsAuditorDeleteEntryBtn")) + "\">&times;</button>",
          "</div>"
        ].join("");
      }).join("") : "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("httpsAuditorHistoryEmptyNote")) + "</div>";

      return [
        "<ul class=\"v1-tool-list\">",
        "<li>",
        "<div class=\"v1-section-header\"><strong>" + escapeHtml(tr("httpsAuditorHistoryHeading")) + "</strong><span class=\"v1-collapse-arrow\">▼</span></div>",
        "<div class=\"v1-section-body\">",
        "<div class=\"v1-https-auditor-lib-list\">" + rowsHtml + "</div>",
        "</div>",
        "</li>",
        "</ul>"
      ].join("");
    }

    // RS: categorized preset templates - clicking one fills LS's fields
    // (target/include/exclude untouched, see google-dork-runtime.js's
    // applyTemplate()) rather than opening anything directly.
    function renderGoogleDorkTemplates() {
      var templates = googleDorkApi ? googleDorkApi.getTemplates() : [];
      var categories = googleDorkApi ? googleDorkApi.getTemplateCategories() : [];
      var byCategory = {};
      templates.forEach(function (item) {
        if (!byCategory[item.category]) byCategory[item.category] = [];
        byCategory[item.category].push(item);
      });

      var sectionsHtml = categories.map(function (cat) {
        var items = byCategory[cat] || [];
        if (!items.length) return "";
        var itemsHtml = items.map(function (item) {
          return "<button type=\"button\" class=\"v1-google-dork-template-btn\" data-google-dork-template=\"" + escapeHtml(item.id) + "\">" + escapeHtml(tr(item.labelKey)) + "</button>";
        }).join("");
        return [
          "<li>",
          "<div class=\"v1-section-header\"><strong>" + escapeHtml(tr("googleDorkCategory_" + cat)) + "</strong><span class=\"v1-collapse-arrow\">▼</span></div>",
          "<div class=\"v1-section-body v1-google-dork-template-list\">",
          itemsHtml,
          "</div>",
          "</li>"
        ].join("");
      }).join("");

      return "<ul class=\"v1-tool-list\">" + sectionsHtml + "</ul>";
    }

    // WiFi tool, Phase 1: nearby scan + saved profiles (CS, tabbed),
    // action buttons + scan history (LS), current-connection info +
    // adapter/driver diagnostics (RS, 2 tabs). Every action is 100% backed
    // by run_powershell (wifi-runtime.js), but unlike the earlier
    // full-panel "desktop only" gate, this follows Mail XSS Tester's own
    // precedent instead: tables and buttons always render, only the
    // action buttons themselves are disabled (with an inline hint) when
    // not on desktop - there's no reason to hide read-only, empty tables.
    function wifiIsDesktop() {
      return !(platformApi && typeof platformApi.isDesktop === "function" && !platformApi.isDesktop());
    }

    function wifiDesktopGateHtml() {
      return "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(tr("wifiDesktopOnlyNote")) + "</p>";
    }

    function wifiFieldRow(labelKey, value) {
      return [
        "<div class=\"v1-pulpit-inspector-field\">",
        "<label>" + escapeHtml(tr(labelKey)) + "</label>",
        "<div>" + escapeHtml(value === null || value === undefined || value === "" ? "-" : String(value)) + "</div>",
        "</div>"
      ].join("");
    }

    // Password cell has 4 states, driven by wifiApi.getPasswordEntry(name):
    // unfetched (show the reveal button, disabled on www like every other
    // action button here), loading, revealed (cleartext key), or a
    // terminal note (open network / denied - key=clear was refused, no
    // elevation flow exists in this phase, see wifi-runtime.js).
    function wifiPasswordCellHtml(profileName) {
      var entry = wifiApi ? wifiApi.getPasswordEntry(profileName) : null;
      if (!entry) {
        return "<span class=\"v1-wifi-password-cell\"><button type=\"button\" class=\"v1-range-history-btn\" data-wifi-reveal-btn=\"" + escapeHtml(profileName) + "\"" + (wifiIsDesktop() ? "" : " disabled") + ">" + escapeHtml(tr("wifiShowPasswordBtn")) + "</button></span>";
      }
      if (entry.status === "loading") {
        return "<span class=\"v1-wifi-password-cell\"><span class=\"v1-wifi-password-note\">" + escapeHtml(tr("wifiPasswordLoadingNote")) + "</span></span>";
      }
      if (entry.status === "revealed") {
        return "<span class=\"v1-wifi-password-cell\"><span class=\"v1-wifi-password-value\">" + escapeHtml(entry.keyContent) + "</span></span>";
      }
      if (entry.status === "open") {
        return "<span class=\"v1-wifi-password-cell\"><span class=\"v1-wifi-password-note\">" + escapeHtml(tr("wifiPasswordOpenNote")) + "</span></span>";
      }
      return "<span class=\"v1-wifi-password-cell\"><span class=\"v1-wifi-password-note\">" + escapeHtml(tr("wifiPasswordDeniedNote")) + "</span></span>";
    }

    // "80%" -> 80, missing/unparseable -> null (kept distinct from 0% -
    // this dev machine's own scan-networks output often omits Signal
    // entirely even when BSSID/Channel are also missing, see wifi-runtime.js
    // - a real 0% and "unknown" shouldn't render identically).
    function wifiParseSignalPercent(signalStr) {
      var m = /(-?\d+(?:\.\d+)?)/.exec(String(signalStr || ""));
      if (!m) return null;
      var n = Number(m[1]);
      return isNaN(n) ? null : Math.max(0, Math.min(100, n));
    }

    // Red (weak) -> green (strong) via hue interpolation; unknown signal
    // gets a neutral gray rather than being misread as "0% = weakest".
    function wifiSignalColor(pct) {
      if (pct === null) return "#6b7280";
      return "hsl(" + Math.round(pct * 1.2) + ", 70%, 50%)";
    }

    // Distance from center is inverse to signal strength - strongest
    // networks ring the middle, weakest (and unknown) sit near the rim.
    function wifiSignalRadius(pct) {
      var minR = 32, maxR = 125;
      if (pct === null) return maxR;
      return minR + (1 - pct / 100) * (maxR - minR);
    }

    // Radar view: networks placed around a 360 circle in alphabetical SSID
    // order (0 at the top, sweeping clockwise - the "which order" the user
    // asked for once they couldn't recall the original spec), distance
    // from center driven by signal strength, dot color mirroring the same
    // strength. Self-contained inline SVG string, same string-building
    // convention as renderPulpitLinksSvg above, just not split into a
    // separate persistent element since this widget has no drag state to
    // preserve across re-renders.
    function renderWifiRadarSvg(networks) {
      var cx = 150, cy = 150;
      var sorted = networks.slice().sort(function (a, b) {
        return String(a.ssid || "").toLowerCase().localeCompare(String(b.ssid || "").toLowerCase());
      });
      var count = sorted.length || 1;
      var ringsHtml = [40, 80, 120].map(function (r) {
        return "<circle class=\"v1-wifi-radar-ring\" cx=\"" + cx + "\" cy=\"" + cy + "\" r=\"" + r + "\"></circle>";
      }).join("");
      var dotsHtml = sorted.map(function (n, i) {
        var pct = wifiParseSignalPercent(n.signal);
        var r = wifiSignalRadius(pct);
        var angleDeg = (i * 360 / count) - 90;
        var angleRad = angleDeg * Math.PI / 180;
        var x = cx + r * Math.cos(angleRad);
        var y = cy + r * Math.sin(angleRad);
        var color = wifiSignalColor(pct);
        var labelX = cx + (r + 12) * Math.cos(angleRad);
        var labelY = cy + (r + 12) * Math.sin(angleRad);
        var anchor = Math.cos(angleRad) > 0.15 ? "start" : (Math.cos(angleRad) < -0.15 ? "end" : "middle");
        var title = n.ssid + " · " + (pct === null ? "?" : pct + "%") + (n.security ? " · " + n.security : "");
        return [
          "<g data-wifi-radar-bssid=\"" + escapeHtml(n.bssid || "") + "\">",
          "<title>" + escapeHtml(title) + "</title>",
          "<circle class=\"v1-wifi-radar-dot\" cx=\"" + x.toFixed(1) + "\" cy=\"" + y.toFixed(1) + "\" r=\"6\" fill=\"" + color + "\"></circle>",
          "<text class=\"v1-wifi-radar-label\" x=\"" + labelX.toFixed(1) + "\" y=\"" + labelY.toFixed(1) + "\" text-anchor=\"" + anchor + "\">" + escapeHtml(n.ssid || "") + "</text>",
          "</g>"
        ].join("");
      }).join("");
      return [
        "<svg class=\"v1-wifi-radar\" viewBox=\"0 0 300 300\" role=\"img\" aria-label=\"" + escapeHtml(tr("wifiRadarAriaLabel")) + "\">",
        ringsHtml,
        "<circle class=\"v1-wifi-radar-center\" cx=\"" + cx + "\" cy=\"" + cy + "\" r=\"4\"></circle>",
        dotsHtml,
        "</svg>"
      ].join("");
    }

    function renderWifiNearbySection(active, view) {
      var state = wifiApi ? wifiApi.getNearby() : { networks: [], loading: false, error: null };
      var networks = state.networks || [];
      var currentView = view === "radar" ? "radar" : "table";
      var contentHtml;
      if (networks.length) {
        var rowsHtml = networks.map(function (n) {
          return [
            "<tr title=\"" + escapeHtml(n.bssid || "") + "\">",
            "<td>" + escapeHtml(n.ssid || "") + "</td>",
            "<td>" + escapeHtml(n.signal || "-") + "</td>",
            "<td>" + escapeHtml(n.security || "-") + "</td>",
            "<td>" + escapeHtml(n.channel || "-") + "</td>",
            "<td>" + escapeHtml(n.radioType || "-") + "</td>",
            "</tr>"
          ].join("");
        }).join("");
        var tableHtml = [
          "<div class=\"v1-results-table-scroll\">",
          "<table class=\"v1-results-table\">",
          "<thead><tr>",
          "<th>" + escapeHtml(tr("wifiColSsid")) + "</th>",
          "<th>" + escapeHtml(tr("wifiColSignal")) + "</th>",
          "<th>" + escapeHtml(tr("wifiColSecurity")) + "</th>",
          "<th>" + escapeHtml(tr("wifiColChannel")) + "</th>",
          "<th>" + escapeHtml(tr("wifiColRadioType")) + "</th>",
          "</tr></thead>",
          "<tbody>" + rowsHtml + "</tbody>",
          "</table>",
          "</div>"
        ].join("");
        contentHtml = [
          "<div class=\"v1-wifi-view-toggle\">",
          "<button type=\"button\" class=\"v1-wifi-tab-btn" + (currentView === "table" ? " is-active" : "") + "\" data-wifi-view=\"table\">" + escapeHtml(tr("wifiViewTable")) + "</button>",
          "<button type=\"button\" class=\"v1-wifi-tab-btn" + (currentView === "radar" ? " is-active" : "") + "\" data-wifi-view=\"radar\">" + escapeHtml(tr("wifiViewRadar")) + "</button>",
          "</div>",
          "<div class=\"v1-wifi-view" + (currentView === "table" ? " is-active" : "") + "\" data-wifi-view-panel=\"table\">" + tableHtml + "</div>",
          "<div class=\"v1-wifi-view" + (currentView === "radar" ? " is-active" : "") + "\" data-wifi-view-panel=\"radar\">" + renderWifiRadarSvg(networks) + "<p class=\"v1-import-manager-note\">" + escapeHtml(tr("wifiRadarLegendNote")) + "</p></div>"
        ].join("");
      } else {
        contentHtml = "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("wifiNearbyEmptyNote")) + "</div>";
      }
      return [
        "<div class=\"v1-wifi-section" + (active ? " is-active" : "") + "\" data-wifi-section=\"nearby\">",
        state.error ? "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(state.error) + "</p>" : "",
        contentHtml,
        "</div>"
      ].join("");
    }

    function renderWifiSavedSection(active) {
      var state = wifiApi ? wifiApi.getProfiles() : { list: [], loading: false, error: null };
      var list = state.list || [];
      var bodyHtml;
      if (list.length) {
        var rowsHtml = list.map(function (name) {
          return [
            "<tr>",
            "<td>" + escapeHtml(name) + "</td>",
            "<td>" + wifiPasswordCellHtml(name) + "</td>",
            "</tr>"
          ].join("");
        }).join("");
        bodyHtml = [
          "<div class=\"v1-results-table-scroll\">",
          "<table class=\"v1-results-table\">",
          "<thead><tr><th>" + escapeHtml(tr("wifiColProfile")) + "</th><th>" + escapeHtml(tr("wifiColPassword")) + "</th></tr></thead>",
          "<tbody>" + rowsHtml + "</tbody>",
          "</table>",
          "</div>"
        ].join("");
      } else {
        bodyHtml = "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("wifiSavedEmptyNote")) + "</div>";
      }
      return [
        "<div class=\"v1-wifi-section" + (active ? " is-active" : "") + "\" data-wifi-section=\"saved\">",
        state.error ? "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(state.error) + "</p>" : "",
        bodyHtml,
        "</div>"
      ].join("");
    }

    // CS: tab strip (WiFi/nearby / Saved Networks) over one content area -
    // no action buttons here anymore (moved to LS, above the scan history
    // list) - activeSection is passed in by the wire layer (read off the
    // DOM before a full outerHTML rebuild) rather than tracked as module
    // state here, keeping this render function stateless like its
    // siblings. Always renders (even on www) - only LS's buttons disable.
    function renderWifiTool(activeSection, activeView) {
      var section = activeSection === "saved" ? activeSection : "nearby";
      function tabBtn(id, labelKey) {
        return "<button type=\"button\" class=\"v1-wifi-tab-btn" + (section === id ? " is-active" : "") + "\" data-wifi-tab=\"" + id + "\">" + escapeHtml(tr(labelKey)) + "</button>";
      }
      return [
        "<div class=\"v1-wifi-shell\">",
        "<div class=\"v1-wifi-tabs\">",
        tabBtn("nearby", "wifiTabNearby"),
        tabBtn("saved", "wifiTabSaved"),
        "</div>",
        renderWifiNearbySection(section === "nearby", activeView),
        renderWifiSavedSection(section === "saved"),
        "</div>"
      ].join("");
    }

    // LS: action buttons (all of them - scan nearby, refresh current
    // connection, list saved profiles, refresh adapter info) in a section
    // above the scan-history list. Disabled + a single inline hint on www,
    // never a full-panel gate.
    function renderWifiActionsHtml() {
      var nearbyState = wifiApi ? wifiApi.getNearby() : { loading: false };
      var currentState = wifiApi ? wifiApi.getCurrent() : { loading: false };
      var profilesState = wifiApi ? wifiApi.getProfiles() : { loading: false };
      var adapterState = wifiApi ? wifiApi.getAdapterInfo() : { loading: false };
      var desktop = wifiIsDesktop();
      function actionBtn(attr, loading, labelKey, loadingKey) {
        return "<button type=\"button\" class=\"v1-pulpit-connect-btn\" " + attr + (loading || !desktop ? " disabled" : "") + ">" + escapeHtml(tr(loading && loadingKey ? loadingKey : labelKey)) + "</button>";
      }
      return [
        "<div class=\"v1-wifi-actions-list\">",
        actionBtn("data-wifi-scan-btn", nearbyState.loading, "wifiScanBtn", "wifiScanningNote"),
        actionBtn("data-wifi-refresh-current-btn", currentState.loading, "wifiRefreshBtn"),
        actionBtn("data-wifi-list-profiles-btn", profilesState.loading, "wifiListProfilesBtn"),
        actionBtn("data-wifi-refresh-adapter-btn", adapterState.loading, "wifiAdapterRefreshBtn"),
        "</div>",
        desktop ? "" : wifiDesktopGateHtml()
      ].join("");
    }

    // LS: action buttons section + scan-history list below it, mirrors
    // renderGoogleDorkTool's history block (same .v1-google-dork-history-
    // row/-text/-actions classes reused, .v1-range-history-btn for
    // use/delete) - "use" replays a snapshot into the corresponding CS/RS
    // surface via wifiApi.useHistoryEntry(), read-only, no live re-scan.
    function renderWifiLibrary() {
      var history = wifiApi ? wifiApi.getHistory() : [];
      var historyHtml = history.length
        ? history.map(function (item, idx) {
            var ts = item.updatedAt ? new Date(item.updatedAt).toLocaleTimeString() : "";
            var label = [item.kind, ts, item.summary].filter(Boolean).join(" · ");
            return [
              "<div class=\"v1-google-dork-history-row\">",
              "<span class=\"v1-google-dork-history-text\" title=\"" + escapeHtml(label) + "\">" + escapeHtml(label) + "</span>",
              "<span class=\"v1-google-dork-history-actions\">",
              "<button type=\"button\" class=\"v1-range-history-btn\" data-wifi-history-action=\"use\" data-wifi-history-index=\"" + idx + "\" title=\"" + escapeHtml(tr("wifiHistoryUseAria")) + "\" aria-label=\"" + escapeHtml(tr("wifiHistoryUseAria")) + "\">&gt;</button>",
              "<button type=\"button\" class=\"v1-range-history-btn\" data-wifi-history-action=\"delete\" data-wifi-history-index=\"" + idx + "\" title=\"" + escapeHtml(tr("wifiHistoryDeleteAria")) + "\" aria-label=\"" + escapeHtml(tr("wifiHistoryDeleteAria")) + "\">&times;</button>",
              "</span>",
              "</div>"
            ].join("");
          }).join("")
        : "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("wifiHistoryEmptyNote")) + "</div>";

      return [
        "<ul class=\"v1-tool-list\">",
        "<li>",
        "<div class=\"v1-section-header\"><strong>" + escapeHtml(tr("wifiActionsHeading")) + "</strong><span class=\"v1-collapse-arrow\">▼</span></div>",
        "<div class=\"v1-section-body\">",
        renderWifiActionsHtml(),
        "</div>",
        "</li>",
        "<li>",
        "<div class=\"v1-section-header\"><strong>" + escapeHtml(tr("wifiHistoryHeading")) + "</strong><span class=\"v1-collapse-arrow\">▼</span></div>",
        "<div class=\"v1-section-body\">",
        historyHtml,
        "</div>",
        "</li>",
        "</ul>"
      ].join("");
    }

    // RS tab 1: current-connection field list (moved out of CS - see
    // renderWifiTool above). No button here (refresh lives in LS); fetched
    // automatically once on first open, see wireWifiCurrent.
    function renderWifiCurrent() {
      var state = wifiApi ? wifiApi.getCurrent() : { info: null, loading: false, error: null, updatedAt: null };
      var info = state.info || {};
      var connected = info.state === "connected";
      var bodyHtml = connected
        ? [
            wifiFieldRow("wifiFieldSsid", info.ssid),
            wifiFieldRow("wifiFieldState", info.state),
            wifiFieldRow("wifiFieldAdapter", info.adapter),
            wifiFieldRow("wifiFieldIp", info.ipAddress),
            wifiFieldRow("wifiFieldSignal", info.signal),
            wifiFieldRow("wifiFieldChannel", info.channel),
            wifiFieldRow("wifiFieldSecurity", info.security),
            wifiFieldRow("wifiFieldRadioType", info.radioType),
            wifiFieldRow("wifiFieldReceiveRate", info.receiveRate),
            wifiFieldRow("wifiFieldTransmitRate", info.transmitRate),
          ].join("")
        : "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("wifiCurrentNotConnectedNote")) + "</div>";
      return [
        "<div class=\"v1-wifi-current\">",
        state.error ? "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(state.error) + "</p>" : "",
        bodyHtml,
        "</div>"
      ].join("");
    }

    // RS tab 2: static adapter/driver diagnostics (netsh wlan show
    // drivers) - "Hosted network supported" is deliberately surfaced here
    // now to give a future Hotspot/ICS phase real diagnostic data instead
    // of guessing. No button here (refresh lives in LS); fetched once on
    // first open, see wireWifiAdapter.
    function renderWifiAdapter() {
      var state = wifiApi ? wifiApi.getAdapterInfo() : { info: null, loading: false, error: null, updatedAt: null };
      var info = state.info || {};
      var hasInfo = !!state.updatedAt;
      var hostedNetwork = info.hostedNetworkSupported || tr("wifiAdapterHostedNetworkNotReported");
      var bodyHtml = hasInfo
        ? [
            wifiFieldRow("wifiAdapterFieldInterface", info.interfaceName),
            wifiFieldRow("wifiAdapterFieldDriver", info.driver),
            wifiFieldRow("wifiAdapterFieldVendor", info.vendor),
            wifiFieldRow("wifiAdapterFieldProvider", info.provider),
            wifiFieldRow("wifiAdapterFieldVersion", info.version),
            wifiFieldRow("wifiAdapterFieldType", info.type),
            wifiFieldRow("wifiAdapterFieldRadioTypes", info.radioTypesSupported),
            wifiFieldRow("wifiAdapterFieldHostedNetwork", hostedNetwork),
          ].join("")
        : "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("wifiAdapterEmptyNote")) + "</div>";
      return [
        "<div class=\"v1-wifi-adapter\">",
        state.error ? "<p class=\"v1-pulpit-remote-hint\">" + escapeHtml(state.error) + "</p>" : "",
        bodyHtml,
        "<p class=\"v1-import-manager-note\">" + escapeHtml(tr("wifiAdapterFutureNote")) + "</p>",
        "</div>"
      ].join("");
    }

    // Anchors a connection line on roughly the icon glyph's center, not the
    // node div's raw top-left (x,y) - node.x/node.y are the div's top-left
    // per renderPulpitNodeHtml's own "left:Xpx;top:Ypx" - and not the whole
    // 84px-wide/icon+label block's center either, since the label sits
    // below the icon (see pulpit.css); this offset is a visual
    // approximation, not tied to any exact CSS value.
    function pulpitEdgeAnchor(node) {
      return { x: node.x + 42, y: node.y + 22 };
    }

    // A tap targeting an existing edge (rather than a device) has no single
    // node to anchor to - it points at the wire itself, so it's drawn to
    // the midpoint between that edge's own two endpoints.
    function pulpitEdgeMidpoint(edge, nodeById) {
      var a = nodeById[edge.fromId];
      var b = nodeById[edge.toId];
      if (!a || !b) return null;
      var pa = pulpitEdgeAnchor(a);
      var pb = pulpitEdgeAnchor(b);
      return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    }

    // Rendered as an SVG sibling BEHIND the node divs (see pulpit.css's
    // z-index) inside the same 3000x2000 canvas coordinate space, so line
    // endpoints can be computed directly from each node's x/y - no separate
    // coordinate system to keep in sync. Each edge gets two overlapping
    // lines: a thin visible one and a fatter, normally-invisible "hit" line
    // (wider stroke, transparent) so clicking near-but-not-exactly on the
    // thin line still registers - mirrors the reference mockup's
    // click-to-remove affordance on a thin line.
    function renderPulpitLinksSvg(state) {
      var nodeById = {};
      state.nodes.forEach(function (n) { nodeById[n.id] = n; });
      var edgeById = {};
      state.edges.forEach(function (e) { edgeById[e.id] = e; });

      var lines = state.edges.map(function (edge) {
        var a = nodeById[edge.fromId];
        var b = nodeById[edge.toId];
        if (!a || !b) return "";
        var pa = pulpitEdgeAnchor(a);
        var pb = pulpitEdgeAnchor(b);
        // Hit-line first, visible line second - lets the CSS ":hover + "
        // adjacent-sibling highlight work (only selects a FOLLOWING
        // sibling), so hovering the generous invisible hit target
        // highlights the thin visible line drawn on top of it.
        return [
          "<g data-edge-id=\"" + escapeHtml(edge.id) + "\">",
          "<line class=\"v1-pulpit-link-hit\" data-pulpit-edge-remove=\"" + escapeHtml(edge.id) + "\" x1=\"" + pa.x + "\" y1=\"" + pa.y + "\" x2=\"" + pb.x + "\" y2=\"" + pb.y + "\"></line>",
          "<line class=\"v1-pulpit-link\" x1=\"" + pa.x + "\" y1=\"" + pa.y + "\" x2=\"" + pb.x + "\" y2=\"" + pb.y + "\"></line>",
          "</g>"
        ].join("");
      }).join("");

      // Scanner/sniffer taps: same hit-line + visible-line pattern, but the
      // second endpoint is either another node's anchor (targetKind "node")
      // or an existing edge's midpoint (targetKind "edge") - and the
      // visible line is colored per tool type instead of the dim default,
      // since a tap represents monitoring activity, not a documented
      // physical connection.
      var tapLines = state.taps.map(function (tap) {
        var toolNode = nodeById[tap.toolNodeId];
        if (!toolNode) return "";
        var pa = pulpitEdgeAnchor(toolNode);
        var pb = null;
        if (tap.targetKind === "node") {
          var targetNode = nodeById[tap.targetId];
          pb = targetNode ? pulpitEdgeAnchor(targetNode) : null;
        } else {
          var targetEdge = edgeById[tap.targetId];
          pb = targetEdge ? pulpitEdgeMidpoint(targetEdge, nodeById) : null;
        }
        if (!pb) return "";
        return [
          "<g data-tap-id=\"" + escapeHtml(tap.id) + "\">",
          "<line class=\"v1-pulpit-link-hit\" data-pulpit-tap-remove=\"" + escapeHtml(tap.id) + "\" x1=\"" + pa.x + "\" y1=\"" + pa.y + "\" x2=\"" + pb.x + "\" y2=\"" + pb.y + "\"></line>",
          "<line class=\"v1-pulpit-tap-link v1-pulpit-tap-link--" + escapeHtml(toolNode.type) + "\" x1=\"" + pa.x + "\" y1=\"" + pa.y + "\" x2=\"" + pb.x + "\" y2=\"" + pb.y + "\"></line>",
          "</g>"
        ].join("");
      }).join("");

      return "<svg class=\"v1-pulpit-links\">" + lines + tapLines + "</svg>";
    }

    function renderPulpitCanvasTool() {
      var state = pulpitCanvasApi ? pulpitCanvasApi.getState() : { nodes: [], edges: [], taps: [] };
      var linksHtml = renderPulpitLinksSvg(state);
      var nodesHtml = state.nodes.map(renderPulpitNodeHtml).join("");

      return [
        "<div class=\"v1-pulpit-canvas-shell\">",
        "<div class=\"v1-pulpit-canvas\" id=\"v1PulpitCanvas\">",
        linksHtml,
        nodesHtml,
        "</div>",
        // Sibling of the canvas, not a child of it - canvasEl.innerHTML gets
        // fully replaced on every render() (wirePulpitCanvas), which would
        // destroy this and any listener bound to it if it lived inside.
        "<div class=\"v1-pulpit-context-menu\" data-pulpit-context-menu hidden>",
        "<button type=\"button\" data-pulpit-context-run>" + escapeHtml(tr("pulpitNodeRunBtn")) + "</button>",
        "</div>",
        "</div>"
      ].join("");
    }

    // LS: plain list of profile names (click to select) + "+ Add profile"
    // button. Selection here drives CS's detail card - the inverse of
    // Pulpit's CS-canvas -> RS-inspector relationship, same underlying
    // mechanism (see wireAgentProfileLibrary/wireAgentProfileDetail in
    // panel-interactions-runtime.js).
    function renderAgentProfileLibrary() {
      var state = agentProfilesApi ? agentProfilesApi.getState() : { profiles: [] };
      var rowsHtml = state.profiles.map(function (profile) {
        var label = profile.name || tr("agentProfileDefaultName");
        return [
          "<div class=\"v1-agentprofile-list-row\" data-agentprofile-id=\"" + escapeHtml(profile.id) + "\">",
          "<span class=\"v1-agentprofile-list-name\">" + escapeHtml(label) + "</span>",
          "<button type=\"button\" class=\"v1-agentprofile-list-remove\" data-agentprofile-remove=\"" + escapeHtml(profile.id) + "\" aria-label=\"" + escapeHtml(tr("agentProfileDeleteBtn")) + "\" title=\"" + escapeHtml(tr("agentProfileDeleteBtn")) + "\">&times;</button>",
          "</div>"
        ].join("");
      }).join("");

      return [
        "<ul class=\"v1-tool-list\">",
        "<li>",
        "<div class=\"v1-section-header\"><strong>" + escapeHtml(tr("tabLabel_agent_profiles")) + "</strong><span class=\"v1-collapse-arrow\">▼</span></div>",
        "<div class=\"v1-section-body\">",
        "<button type=\"button\" class=\"v1-agentprofile-add-btn\" data-agentprofile-add>" + escapeHtml(tr("agentProfileAddBtn")) + "</button>",
        "<div class=\"v1-agentprofile-list\">" + rowsHtml + "</div>",
        "</div>",
        "</li>",
        "</ul>"
      ].join("");
    }

    // Right column of the CS card: per-profile "Serwisy społecznościowe" -
    // a repeatable list of services (freeform name, e.g. "Facebook"), each
    // holding a repeatable list of user-named, user-typed fields (label
    // picked freely, type picked at add-time). Service-field value inputs
    // use a DIFFERENT attribute (data-agentprofile-field-part) than the
    // static 6 fields' data-agentprofile-field, since field labels are
    // arbitrary user text and can collide across services ("PIN" in two
    // different services) - copy/password-toggle buttons key off the
    // field's own unique id instead of a name, see
    // wireAgentProfileDetail's generalized lookup.
    function renderAgentProfileServicesColumn(profileId, state) {
      var services = state.services.filter(function (s) { return s.profileId === profileId; });
      var fieldCopyLabel = escapeHtml(tr("agentProfileCopyBtn"));
      var passwordToggleLabel = escapeHtml(tr("agentProfileShowPasswordBtn"));
      var removeFieldLabel = escapeHtml(tr("agentProfileRemoveFieldBtn"));
      var removeServiceLabel = escapeHtml(tr("agentProfileRemoveServiceBtn"));

      var servicesHtml = services.map(function (service) {
        var fields = state.fields.filter(function (f) { return f.serviceId === service.id; });
        var fieldsHtml = fields.map(function (field) {
          var isPassword = field.type === "password";
          var rowClass = isPassword ? "v1-agentprofile-password-row" : "v1-agentprofile-input-row";
          var toggleHtml = isPassword
            ? "<button type=\"button\" class=\"v1-agentprofile-password-toggle\" data-agentprofile-toggle-field-password=\"" + escapeHtml(field.id) + "\" aria-pressed=\"false\" aria-label=\"" + passwordToggleLabel + "\" title=\"" + passwordToggleLabel + "\">👁</button>"
            : "";
          return [
            "<div class=\"v1-agentprofile-service-field-row\" data-agentprofile-field-id=\"" + escapeHtml(field.id) + "\">",
            "<input type=\"text\" class=\"v1-agentprofile-field-label\" data-agentprofile-field-part=\"label\" autocomplete=\"off\" placeholder=\"" + escapeHtml(tr("agentProfileFieldLabelPlaceholder")) + "\" value=\"" + escapeHtml(field.label) + "\" />",
            "<div class=\"" + rowClass + "\">",
            "<input type=\"" + (isPassword ? "password" : "text") + "\" data-agentprofile-field-part=\"value\" autocomplete=\"off\" value=\"" + escapeHtml(field.value) + "\" />",
            toggleHtml,
            "<button type=\"button\" class=\"v1-agentprofile-copy-btn\" data-agentprofile-copy-field=\"" + escapeHtml(field.id) + "\" aria-label=\"" + fieldCopyLabel + "\" title=\"" + fieldCopyLabel + "\">📋</button>",
            "<button type=\"button\" class=\"v1-agentprofile-attachment-remove\" data-agentprofile-remove-field=\"" + escapeHtml(field.id) + "\" aria-label=\"" + removeFieldLabel + "\" title=\"" + removeFieldLabel + "\">&times;</button>",
            "</div>",
            "</div>"
          ].join("");
        }).join("");

        return [
          "<div class=\"v1-agentprofile-service\" data-agentprofile-service-id=\"" + escapeHtml(service.id) + "\">",
          "<div class=\"v1-agentprofile-service-header\">",
          "<input type=\"text\" class=\"v1-agentprofile-service-name\" data-agentprofile-service-field=\"name\" autocomplete=\"off\" placeholder=\"" + escapeHtml(tr("agentProfileServiceNamePlaceholder")) + "\" value=\"" + escapeHtml(service.name) + "\" />",
          "<button type=\"button\" class=\"v1-agentprofile-attachment-remove\" data-agentprofile-remove-service=\"" + escapeHtml(service.id) + "\" aria-label=\"" + removeServiceLabel + "\" title=\"" + removeServiceLabel + "\">&times;</button>",
          "</div>",
          "<div class=\"v1-agentprofile-service-fields\">" + fieldsHtml + "</div>",
          "<div class=\"v1-agentprofile-service-field-actions\">",
          "<button type=\"button\" class=\"v1-agentprofile-add-field-btn\" data-agentprofile-add-field=\"text\" data-agentprofile-add-field-service=\"" + escapeHtml(service.id) + "\">" + escapeHtml(tr("agentProfileAddTextFieldBtn")) + "</button>",
          "<button type=\"button\" class=\"v1-agentprofile-add-field-btn\" data-agentprofile-add-field=\"password\" data-agentprofile-add-field-service=\"" + escapeHtml(service.id) + "\">" + escapeHtml(tr("agentProfileAddPasswordFieldBtn")) + "</button>",
          "</div>",
          "</div>"
        ].join("");
      }).join("");

      return [
        "<div class=\"v1-agentprofile-section-label\">" + escapeHtml(tr("agentProfileServicesLabel")) + "</div>",
        "<div class=\"v1-agentprofile-service-list\">" + servicesHtml + "</div>",
        "<button type=\"button\" class=\"v1-agentprofile-add-btn\" data-agentprofile-add-service>" + escapeHtml(tr("agentProfileAddServiceBtn")) + "</button>"
      ].join("");
    }

    // CS: the detail/edit card for the currently-selected profile. Split
    // into an outer shell (renderAgentProfileDetailTool, the zero-arg
    // function toolRenderers/buildDetailHtml calls on tab activation - an
    // empty mount, no selection known yet) and an inner fields renderer
    // (renderAgentProfileDetailFields(profileId), mirroring
    // renderPulpitInspector's role) that wireAgentProfileDetail calls
    // whenever the LS selection changes.
    function renderAgentProfileDetailFields(profileId) {
      var state = agentProfilesApi ? agentProfilesApi.getState() : { profiles: [], attachments: [] };
      var profile = state.profiles.find(function (p) { return p.id === profileId; });

      if (!profile) {
        return "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("agentProfileEmptyNote")) + "</div>";
      }

      var attachments = state.attachments.filter(function (a) { return a.profileId === profileId; });
      var photo = attachments.filter(function (a) { return a.role === "photo"; })[0] || null;
      var files = attachments.filter(function (a) { return a.role !== "photo"; });

      var filesHtml = files.map(function (a) {
        return [
          "<div class=\"v1-agentprofile-attachment-row\" data-agentprofile-attachment-id=\"" + escapeHtml(a.id) + "\">",
          "<span class=\"v1-agentprofile-attachment-name\">" + escapeHtml(a.filename) + "</span>",
          "<button type=\"button\" class=\"v1-agentprofile-attachment-remove\" data-agentprofile-remove-attachment=\"" + escapeHtml(a.id) + "\" aria-label=\"" + escapeHtml(tr("agentProfileRemoveAttachmentBtn")) + "\" title=\"" + escapeHtml(tr("agentProfileRemoveAttachmentBtn")) + "\">&times;</button>",
          "</div>"
        ].join("");
      }).join("");

      var copyLabel = escapeHtml(tr("agentProfileCopyBtn"));
      function copyBtn(field) {
        return "<button type=\"button\" class=\"v1-agentprofile-copy-btn\" data-agentprofile-copy=\"" + field + "\" aria-label=\"" + copyLabel + "\" title=\"" + copyLabel + "\">📋</button>";
      }

      return [
        // Wrapped in a <form> (never actually submitted - see
        // wireAgentProfileDetail's delegated submit-preventDefault) purely
        // to stop Chromium logging "[DOM] Password field is not contained
        // in a form" for the password inputs below - the main one AND
        // every per-service one in the right column, all one form now, not
        // two; autocomplete="off" throughout since these are this app's
        // own saved values, not something the browser's address/password
        // manager should offer to fill or save.
        "<form data-agentprofile-form autocomplete=\"off\">",
        "<div class=\"v1-agentprofile-columns\">",
        "<div class=\"v1-agentprofile-column-left\">",
        "<div class=\"v1-agentprofile-field\">",
        "<label for=\"v1AgentProfileName\">" + escapeHtml(tr("agentProfileNameLabel")) + "</label>",
        "<div class=\"v1-agentprofile-input-row\">",
        "<input id=\"v1AgentProfileName\" type=\"text\" name=\"agentProfileName\" autocomplete=\"off\" data-agentprofile-field=\"name\" value=\"" + escapeHtml(profile.name) + "\" />",
        copyBtn("name"),
        "</div>",
        "</div>",
        "<div class=\"v1-agentprofile-field\">",
        "<label for=\"v1AgentProfileNickname\">" + escapeHtml(tr("agentProfileNicknameLabel")) + "</label>",
        "<div class=\"v1-agentprofile-input-row\">",
        "<input id=\"v1AgentProfileNickname\" type=\"text\" name=\"agentProfileNickname\" autocomplete=\"off\" data-agentprofile-field=\"nickname\" value=\"" + escapeHtml(profile.nickname) + "\" />",
        copyBtn("nickname"),
        "</div>",
        "</div>",
        "<div class=\"v1-agentprofile-field\">",
        "<label for=\"v1AgentProfileEmail\">" + escapeHtml(tr("agentProfileEmailLabel")) + "</label>",
        "<div class=\"v1-agentprofile-input-row\">",
        "<input id=\"v1AgentProfileEmail\" type=\"text\" name=\"agentProfileEmail\" autocomplete=\"off\" data-agentprofile-field=\"email\" value=\"" + escapeHtml(profile.email) + "\" />",
        copyBtn("email"),
        "</div>",
        "</div>",
        "<div class=\"v1-agentprofile-field\">",
        "<label for=\"v1AgentProfileLogin\">" + escapeHtml(tr("agentProfileLoginLabel")) + "</label>",
        "<div class=\"v1-agentprofile-input-row\">",
        "<input id=\"v1AgentProfileLogin\" type=\"text\" name=\"agentProfileLogin\" autocomplete=\"off\" data-agentprofile-field=\"login\" value=\"" + escapeHtml(profile.login) + "\" />",
        copyBtn("login"),
        "</div>",
        "</div>",
        "<div class=\"v1-agentprofile-field\">",
        "<label for=\"v1AgentProfilePassword\">" + escapeHtml(tr("agentProfilePasswordLabel")) + "</label>",
        "<div class=\"v1-agentprofile-password-row\">",
        "<input id=\"v1AgentProfilePassword\" type=\"password\" name=\"agentProfilePassword\" autocomplete=\"off\" data-agentprofile-field=\"password\" value=\"" + escapeHtml(profile.password) + "\" />",
        "<button type=\"button\" class=\"v1-agentprofile-password-toggle\" data-agentprofile-toggle-password aria-pressed=\"false\" aria-label=\"" + escapeHtml(tr("agentProfileShowPasswordBtn")) + "\" title=\"" + escapeHtml(tr("agentProfileShowPasswordBtn")) + "\">👁</button>",
        copyBtn("password"),
        "</div>",
        "</div>",
        "<div class=\"v1-agentprofile-field\">",
        "<label for=\"v1AgentProfileNote\">" + escapeHtml(tr("agentProfileNoteLabel")) + "</label>",
        "<div class=\"v1-agentprofile-input-row\">",
        "<textarea id=\"v1AgentProfileNote\" name=\"agentProfileNote\" autocomplete=\"off\" rows=\"3\" data-agentprofile-field=\"note\">" + escapeHtml(profile.note) + "</textarea>",
        copyBtn("note"),
        "</div>",
        "</div>",
        "</div>",
        "<div class=\"v1-agentprofile-column-right\">",
        renderAgentProfileServicesColumn(profileId, state),
        "</div>",
        "</div>",
        "</form>",
        "<div class=\"v1-agentprofile-photo-section\">",
        // A plain heading, not a <label> - there's no single form control it
        // describes (an <img> preview + a button aren't form-associable),
        // and Chromium's DevTools flags any <label> with no matching
        // `for`/nested control as "not associated with a form field".
        "<div class=\"v1-agentprofile-section-label\">" + escapeHtml(tr("agentProfilePhotoLabel")) + "</div>",
        // src is filled in asynchronously by wireAgentProfileDetail (photo
        // bytes live in IndexedDB, not something a pure HTML-string
        // renderer can reach synchronously) - hidden until then.
        "<img class=\"v1-agentprofile-photo-preview\" data-agentprofile-photo-preview alt=\"\"" + (photo ? " data-agentprofile-photo-id=\"" + escapeHtml(photo.id) + "\"" : "") + (photo ? "" : " hidden") + " />",
        "<button type=\"button\" class=\"v1-agentprofile-add-photo-btn\" data-agentprofile-add-photo>" + escapeHtml(tr("agentProfileAddPhotoBtn")) + "</button>",
        "</div>",
        "<div class=\"v1-agentprofile-attachments-section\">",
        "<div class=\"v1-agentprofile-section-label\">" + escapeHtml(tr("agentProfileAttachmentsLabel")) + "</div>",
        "<div class=\"v1-agentprofile-attachments-list\">" + filesHtml + "</div>",
        "<button type=\"button\" class=\"v1-agentprofile-add-attachment-btn\" data-agentprofile-add-attachment>" + escapeHtml(tr("agentProfileAddAttachmentBtn")) + "</button>",
        "</div>"
      ].join("");
    }

    function renderAgentProfileDetailTool() {
      return "<div class=\"v1-agentprofile-detail\" id=\"v1AgentProfileDetail\">"
        + renderAgentProfileDetailFields("")
        + "</div>";
    }

    // Shell only - all real content (name/rating/Verified/description/
    // README-LICENSE/comments/review form/admin panel, per whichever addon
    // is selected in the left panel) is built by
    // community-catalog-detail-runtime.js's wireCommunityCatalogDetail(),
    // same split as ip-library's CENTER table above (static labels here,
    // dynamic rows filled in by its own wire function).
    function renderCommunityCatalogDetail() {
      return "<div class=\"v1-community-detail-body\"></div>";
    }

    // Shell only - real content (fetched + sanitized markdown, rendered to
    // HTML) is built by markdown-viewer-runtime.js's wireMarkdownViewer(),
    // same split as renderCommunityCatalogDetail() above.
    function renderMarkdownViewerDetail() {
      return "<div class=\"v1-md-viewer-root\"></div>";
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
                city: String(row.city || "").trim(),
                countryCode: String(row.countryCode || "").trim(),
                lat: typeof row.lat === "number" ? row.lat : null,
                lon: typeof row.lon === "number" ? row.lon : null,
                status: String(row.status || "active").trim() || "active",
                statusClass: String(row.statusClass || "is-up").trim() || "is-up",
                ports: ports,
              };
            });
        } catch (_) {
          return [];
        }
      }

      var rows = readPersistedScanRows();
      var selectedPreset = getSelectedPresetInfo();
      var selectedPresetEmoji = selectedPreset.emoji || "🔎";
      var selectedPresetLabel = selectedPreset.name || selectedPreset.id || "";
      // Menu order here deliberately mirrors the RS Config tab's Detect
      // grouping (Service Probing = port-level, then Host Enrichment =
      // host/IP-level), with a visual separator between the two - NOT the
      // actual table column order below, which stays as-is (hostname/flag/
      // isp/as/device/http/access/banner/sslCert) so existing layouts don't
      // shift.
      var columnItems = [
        { key: "banner", icon: "📡", label: trOr("resultsIpColumnBanner", "Banner Grabbing"), defaultVisible: true },
        { key: "http", icon: "📄", label: trOr("resultsIpColumnHttpPageTitle", "HTTP Page Title"), defaultVisible: true },
        { key: "access", icon: "🔑", label: trOr("resultsIpColumnAccessSnapshot", "Access / Snapshot"), defaultVisible: true },
        { key: "sslCert", icon: "🔒", label: trOr("resultsIpColumnSslCert", "SSL/TLS Certificate Info"), defaultVisible: true },
        { key: "hostname", icon: "🧭", label: trOr("resultsIpColumnHostname", "Hostname"), defaultVisible: true, groupStart: true },
        { key: "flag", icon: "🌎", label: trOr("resultsIpColumnCountryFlag", "Country Flag"), defaultVisible: true },
        { key: "isp", icon: "🏢", label: trOr("resultsIpColumnIsp", "ISP"), defaultVisible: true },
        { key: "as", icon: "🕷", label: trOr("resultsIpColumnAs", "AS"), defaultVisible: true },
        { key: "device", icon: "📱", label: trOr("resultsIpColumnDeviceIdentification", "Device Identification"), defaultVisible: true },
        { key: "location", icon: "📍", label: trOr("resultsIpColumnLocation", "Location"), defaultVisible: true }
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
            banner: String(port.banner || "").trim(),
            sslCertInfo: String(port.sslCertInfo || port.sslCert || port.certInfo || "").trim(),
            protocol: String(port.protocol || "TCP").trim().toUpperCase(),
            // "open" (confirmed) or "open_filtered" (UDP only - no response
            // at all, which for UDP can mean open OR silently filtered;
            // there's no way to tell those apart, see probe_port_udp in
            // main.rs). TCP/ICMP results are always "open" - a completed
            // handshake or echo reply leaves no ambiguity.
            status: String(port.status || "open").trim().toLowerCase(),
            service: String(port.service || "").trim(),
            ping: String(port.ping || "-").trim() || "-"
          };
        }

        var legacyLabel = String(port || "").replace(/^:/, "").trim();
        return {
          portLabel: legacyLabel,
          httpPageTitle: "",
          accessSnapshot: "",
          banner: "",
          sslCertInfo: "",
          protocol: "TCP",
          status: "open",
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

      // "City, CC" when both resolved, whichever one alone if only one did,
      // else "-" - same optional-field fallback convention as hostname's
      // own "-" default elsewhere in this table.
      function resolveLocationLabel(row) {
        var city = String((row && row.city) || "").trim();
        var countryCode = String((row && row.countryCode) || "").trim();
        if (city && countryCode) return city + ", " + countryCode;
        if (city) return city;
        if (countryCode) return countryCode;
        return "-";
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
          var portBanner = portEntry.banner || "-";
          var portSslCert = portEntry.sslCertInfo || "-";
          var portProtocolBadge = "<span class=\"v1-ip-port-badge v1-ip-port-badge--protocol is-" + escapeHtml(portEntry.protocol.toLowerCase()) + "\">" + escapeHtml(portEntry.protocol) + "</span>";
          // Only ever "open_filtered" for UDP (see resolvePortEntry) - a
          // confirmed-open port (TCP, or UDP with a real reply) gets no
          // extra badge at all.
          var portStatusBadge = portEntry.status === "open_filtered"
            ? "<span class=\"v1-ip-port-badge v1-ip-port-badge--status is-open-filtered\" title=\"" + escapeHtml(trOr("portStatusOpenFilteredTitle", "No response - port may be open or silently filtered, can't tell which")) + "\">" + escapeHtml(trOr("portStatusOpenFiltered", "open?")) + "</span>"
            : "";
          var portServiceBadge = portEntry.service ? "<span class=\"v1-ip-port-badge v1-ip-port-badge--service\">" + escapeHtml(portEntry.service) + "</span>" : "";
          return [
            "<tr class=\"v1-ip-port-row\" data-ports-row=\"" + idx + "\" data-port-index=\"" + portIdx + "\" data-port-key=\"" + escapeHtml(portKey) + "\" data-status=\"" + escapeHtml(statusKey) + "\" hidden>",
            "<td class=\"v1-ip-col-check\"><button type=\"button\" class=\"v1-ip-port-action-btn\" data-port-action=\"check\" data-port-key=\"" + escapeHtml(portKey) + "\" aria-pressed=\"false\" aria-label=\"Mark port\">✓</button></td>",
            "<td class=\"v1-ip-col-star\"><button type=\"button\" class=\"v1-ip-port-action-btn\" data-port-action=\"favorite\" data-port-key=\"" + escapeHtml(portKey) + "\" aria-pressed=\"false\" aria-label=\"Add port to favorites\">★</button></td>",
            "<td class=\"v1-ip-col-status\" aria-hidden=\"true\"></td>",
            "<td class=\"v1-ip-col-ip\"><span class=\"v1-ip-port-line\"><span class=\"v1-ip-port-line-start\"><span class=\"v1-ip-port-chip-emoji\" aria-hidden=\"true\" title=\"" + escapeHtml(selectedPresetLabel) + "\">" + escapeHtml(selectedPresetEmoji) + "</span><span class=\"v1-ip-port-value\">" + escapeHtml(portLabel) + "</span></span>" + portProtocolBadge + portStatusBadge + "</span></td>",
            "<td class=\"v1-ip-col-expand\" aria-hidden=\"true\"></td>",
            "<td class=\"v1-ip-col-ping\">" + escapeHtml(portEntry.ping) + "</td>",
            "<td class=\"v1-ip-col-host\" data-col=\"hostname\">" + portServiceBadge + "</td>",
            "<td class=\"v1-ip-col-flag\" data-col=\"flag\" aria-hidden=\"true\"></td>",
            "<td class=\"v1-ip-col-isp\" data-col=\"isp\" aria-hidden=\"true\"></td>",
            "<td class=\"v1-ip-col-as\" data-col=\"as\" aria-hidden=\"true\"></td>",
            "<td class=\"v1-ip-col-device\" data-col=\"device\" aria-hidden=\"true\"></td>",
            "<td class=\"v1-ip-col-location\" data-col=\"location\" aria-hidden=\"true\"></td>",
            "<td class=\"v1-ip-col-http\" data-col=\"http\">" + escapeHtml(portHttpTitle) + "</td>",
            "<td class=\"v1-ip-col-access\" data-col=\"access\"><span class=\"v1-ip-port-link\">" + escapeHtml(portAccess) + "</span></td>",
            "<td class=\"v1-ip-col-banner\" data-col=\"banner\">" + escapeHtml(portBanner) + "</td>",
            "<td class=\"v1-ip-col-sslCert\" data-col=\"sslCert\">" + escapeHtml(portSslCert) + "</td>",
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
          "<td class=\"v1-ip-col-location\" data-col=\"location\" aria-hidden=\"true\"></td>",
          "<td class=\"v1-ip-col-http\" data-col=\"http\">-</td>",
          "<td class=\"v1-ip-col-access\" data-col=\"access\">-</td>",
          "<td class=\"v1-ip-col-banner\" data-col=\"banner\">-</td>",
          "<td class=\"v1-ip-col-sslCert\" data-col=\"sslCert\">-</td>",
          "</tr>"
        ].join("");

        var rowAs = String(row.as || row.autonomousSystem || "").trim() || "-";
        var rowDevice = String(row.deviceIdentification || row.device || "").trim() || "-";
        var rowLocation = resolveLocationLabel(row);

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
          "<td class=\"v1-ip-col-location\" data-col=\"location\">" + escapeHtml(rowLocation) + "</td>",
          "<td class=\"v1-ip-col-http\" data-col=\"http\">-</td>",
          "<td class=\"v1-ip-col-access\" data-col=\"access\">-</td>",
          "<td class=\"v1-ip-col-banner\" data-col=\"banner\">-</td>",
          "<td class=\"v1-ip-col-sslCert\" data-col=\"sslCert\">-</td>",
          "</tr>",
          portsHtml
        ].join("");
      }).join("");

      var headers = resultsIpConfig.headers || {};
      var columnsMenuHtml = columnItems.map(function (item) {
        var separator = item.groupStart ? "<div class=\"v1-results-columns-separator\" role=\"separator\"></div>" : "";
        return separator + [
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
        "<thead><tr><th class=\"v1-ip-col-check\">✓</th><th class=\"v1-ip-col-star\">★</th><th class=\"v1-ip-col-status\">●</th><th class=\"v1-ip-col-ip\">" + escapeHtml(trOr("resultsIpHeaderIpAddressPort", headers.ipAddressPort || "IP Adress / Port")) + "</th><th class=\"v1-ip-col-expand\">+</th><th class=\"v1-ip-col-ping\">" + escapeHtml(trOr("resultsIpHeaderPing", headers.ping || "Ping")) + "</th><th class=\"v1-ip-col-host\" data-col=\"hostname\">" + escapeHtml(trOr("resultsIpHeaderHostname", headers.hostname || "Hostname")) + "</th><th class=\"v1-ip-col-flag\" data-col=\"flag\">" + escapeHtml(trOr("resultsIpHeaderFlag", headers.flag || "Flag")) + "</th><th class=\"v1-ip-col-isp\" data-col=\"isp\">" + escapeHtml(trOr("resultsIpHeaderIsp", headers.isp || "ISP")) + "</th><th class=\"v1-ip-col-as\" data-col=\"as\">" + escapeHtml(trOr("resultsIpHeaderAs", headers.as || "AS")) + "</th><th class=\"v1-ip-col-device\" data-col=\"device\">" + escapeHtml(trOr("resultsIpHeaderDeviceIdentification", headers.deviceIdentification || "Device Identification")) + "</th><th class=\"v1-ip-col-location\" data-col=\"location\">" + escapeHtml(trOr("resultsIpHeaderLocation", headers.location || "Location")) + "</th><th class=\"v1-ip-col-http\" data-col=\"http\">" + escapeHtml(trOr("resultsIpHeaderHttpPageTitle", headers.httpPageTitle || "HTTP Page Title")) + "</th><th class=\"v1-ip-col-access\" data-col=\"access\">" + escapeHtml(trOr("resultsIpHeaderAccessSnapshot", headers.accessSnapshot || "Access / Snapshot")) + "</th><th class=\"v1-ip-col-banner\" data-col=\"banner\">" + escapeHtml(trOr("resultsIpHeaderBanner", headers.banner || "Banner Grabbing")) + "</th><th class=\"v1-ip-col-sslCert\" data-col=\"sslCert\">" + escapeHtml(trOr("resultsIpHeaderSslCert", headers.sslCert || "SSL/TLS Certificate Info")) + "</th></tr></thead>",
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

    // TCP connection-state -> status-dot modifier class, matching the
    // existing .v1-ip-status-dot.is-up precedent instead of new badge markup.
    var netMonStateClass = {
      ESTABLISHED: "is-established",
      LISTEN: "is-listening",
      TIME_WAIT: "is-time-wait",
      CLOSE_WAIT: "is-close-wait",
      SYN_SENT: "is-pending",
      SYN_RCVD: "is-pending",
      FIN_WAIT1: "is-closing",
      FIN_WAIT2: "is-closing",
      CLOSING: "is-closing",
      LAST_ACK: "is-closing",
      CLOSED: "is-closed",
      DELETE_TCB: "is-closed"
    };

    function vendorForMac(mac) {
      var table = (window.NetReconNewUICore && window.NetReconNewUICore.ouiVendorData) || [];
      var prefix = String(mac || "").slice(0, 8).toUpperCase();
      for (var i = 0; i < table.length; i++) {
        if (table[i].prefix === prefix) return table[i].vendor;
      }
      return "-";
    }

    function netMonSortTh(colKey, labelKey) {
      return "<th data-netmon-sort-col=\"" + colKey + "\">" + escapeHtml(tr(labelKey)) +
        "<span class=\"v1-netmon-sort-arrow\" data-netmon-sort-arrow=\"" + colKey + "\"></span></th>";
    }

    function netMonViewSelect(kind, optionPairs) {
      var options = optionPairs.map(function (pair) {
        return "<option value=\"" + pair[0] + "\">" + escapeHtml(tr(pair[1])) + "</option>";
      }).join("");
      return "<select class=\"v1-netmon-view-select\" data-netmon-view-select=\"" + kind + "\">" + options + "</select>";
    }

    function renderNetworkMonitorTool() {
      // Order-agnostic: always emitted [connections, lan] here - actual
      // display order is a pure DOM swap applied right after wiring
      // (panel-interactions-runtime.js's applyNetMonOrder(), driven by
      // the same tool-content-runtime.js netMonState the LS panel reads),
      // keeping this renderer itself simple and stateless. Sort/view/
      // visibility state and history events live entirely in panel-
      // interactions-runtime.js module state - this function always emits
      // the same "neutral" markup, then wireNetworkMonitorTool() re-applies
      // all of it right after (and again on every refresh/redock).
      return [
        "<div class=\"v1-netmon-shell\">",
        "<div class=\"v1-netmon-toolbar\">",
        "<label class=\"v1-netmon-toolbar-check\"><input type=\"checkbox\" data-netmon-visibility=\"connections\" checked /> " + escapeHtml(tr("netMonConnectionsTitle")) + "</label>",
        "<label class=\"v1-netmon-toolbar-check\"><input type=\"checkbox\" data-netmon-visibility=\"lan\" checked /> " + escapeHtml(tr("netMonLanDevicesTitle")) + "</label>",
        "<label class=\"v1-netmon-toolbar-check\"><input type=\"checkbox\" data-netmon-keep-marks /> " + escapeHtml(tr("netMonKeepChangesLabel")) + "</label>",
        "<div class=\"v1-netmon-toolbar-radios\" role=\"radiogroup\">",
        "<label><input type=\"radio\" name=\"netmon-display-mode\" value=\"actual\" data-netmon-display-mode /> " + escapeHtml(tr("netMonModeActual")) + "</label>",
        "<label><input type=\"radio\" name=\"netmon-display-mode\" value=\"all\" data-netmon-display-mode checked /> " + escapeHtml(tr("netMonModeAll")) + "</label>",
        "<label><input type=\"radio\" name=\"netmon-display-mode\" value=\"changes\" data-netmon-display-mode /> " + escapeHtml(tr("netMonModeChanges")) + "</label>",
        "</div>",
        "</div>",
        "<div class=\"v1-netmon-section\" data-netmon-section=\"connections\" data-netmon-view=\"flat\">",
        "<div class=\"v1-netmon-section-head\">",
        "<h4 style=\"margin:0;\">" + escapeHtml(tr("netMonConnectionsTitle")) + "</h4>",
        netMonViewSelect("connections", [
          ["flat", "netMonViewFlat"],
          ["process", "netMonViewGroupProcess"],
          ["pid", "netMonViewGroupPid"],
          ["protocol", "netMonViewGroupProtocol"],
          ["local", "netMonViewGroupLocal"],
          ["remote", "netMonViewGroupRemote"],
          ["state", "netMonViewGroupState"]
        ]),
        "</div>",
        "<div class=\"v1-results-table-scroll v1-results-table-scroll--ip\" data-native-hscroll=\"true\">",
        "<table class=\"v1-results-table v1-netmon-table\">",
        "<thead><tr>",
        netMonSortTh("protocol", "netMonColProtocol"),
        netMonSortTh("local", "netMonColLocalAddr"),
        netMonSortTh("remote", "netMonColRemoteAddr"),
        netMonSortTh("state", "netMonColState"),
        netMonSortTh("pid", "netMonColPid"),
        netMonSortTh("process", "netMonColProcess"),
        "</tr></thead>",
        "<tbody id=\"v1NetMonConnectionsRows\" data-netmon-role=\"connections-rows\"><tr><td colspan=\"6\" class=\"v1-iplib-empty\">" + escapeHtml(tr("netMonEmptyConnections")) + "</td></tr></tbody>",
        "</table>",
        "</div>",
        "</div>",
        "<div class=\"v1-netmon-section\" data-netmon-section=\"lan\" data-netmon-view=\"flat\">",
        "<div class=\"v1-netmon-section-head\">",
        "<h4 style=\"margin:0;\">" + escapeHtml(tr("netMonLanDevicesTitle")) + "</h4>",
        netMonViewSelect("lan", [
          ["flat", "netMonViewFlat"],
          ["vendor", "netMonViewGroupVendor"],
          ["interface", "netMonViewGroupInterface"],
          ["ip", "netMonViewGroupIp"],
          ["mac", "netMonViewGroupMac"]
        ]),
        "</div>",
        "<div class=\"v1-results-table-scroll v1-results-table-scroll--ip\" data-native-hscroll=\"true\">",
        "<table class=\"v1-results-table v1-netmon-table\">",
        "<thead><tr>",
        netMonSortTh("ip", "netMonColIp"),
        netMonSortTh("mac", "netMonColMac"),
        netMonSortTh("vendor", "netMonColVendor"),
        netMonSortTh("interface", "netMonColInterface"),
        "</tr></thead>",
        "<tbody id=\"v1NetMonArpRows\" data-netmon-role=\"arp-rows\"><tr><td colspan=\"4\" class=\"v1-iplib-empty\">" + escapeHtml(tr("netMonEmptyArp")) + "</td></tr></tbody>",
        "</table>",
        "</div>",
        "</div>",
        "</div>"
      ].join("");
    }

    // Recently appeared/disappeared rows aren't a separate log anymore -
    // they're mixed straight into the live table (flat or grouped alike),
    // marked with a leading +/- badge and a row class, for as long as
    // panel-interactions-runtime.js's grace window keeps them tagged
    // (row.__netmonGone/__netmonNew, set there right before rendering).
    function netMonRowMark(row) {
      if (row.__netmonGone) return "<span class=\"v1-netmon-row-mark is-gone\" title=\"" + escapeHtml(tr("netMonHistoryDisappeared")) + "\">−</span> ";
      if (row.__netmonNew) return "<span class=\"v1-netmon-row-mark is-new\" title=\"" + escapeHtml(tr("netMonHistoryAppeared")) + "\">+</span> ";
      return "";
    }

    function netMonRowClass(row, extraClass) {
      var cls = row.__netmonGone ? "v1-netmon-row-gone" : (row.__netmonNew ? "v1-netmon-row-new" : "");
      if (extraClass) cls = cls ? cls + " " + extraClass : extraClass;
      return cls ? " class=\"" + cls + "\"" : "";
    }

    function netMonConnectionRowHtml(row) {
      var protocolBadge = "<span class=\"v1-ip-port-badge v1-ip-port-badge--protocol is-" + escapeHtml(String(row.protocol || "").toLowerCase()) + "\">" + escapeHtml(row.protocol) + "</span>";
      var stateHtml = row.state
        ? "<span class=\"v1-ip-status-dot " + (netMonStateClass[row.state] || "") + "\"></span>" + escapeHtml(row.state)
        : "-";
      return [
        "<td>" + netMonRowMark(row) + protocolBadge + "</td>",
        "<td>" + escapeHtml(row.local_addr) + ":" + escapeHtml(String(row.local_port)) + "</td>",
        "<td>" + (row.remote_addr ? escapeHtml(row.remote_addr) + ":" + escapeHtml(String(row.remote_port)) : "-") + "</td>",
        "<td>" + stateHtml + "</td>",
        "<td>" + escapeHtml(String(row.pid)) + "</td>",
        "<td>" + escapeHtml(row.process_name || "-") + "</td>"
      ].join("");
    }

    function netMonArpRowHtml(row) {
      return [
        "<td>" + netMonRowMark(row) + escapeHtml(row.ip) + "</td>",
        "<td>" + escapeHtml(row.mac) + "</td>",
        "<td>" + escapeHtml(vendorForMac(row.mac)) + "</td>",
        "<td>" + escapeHtml(row.interface) + "</td>"
      ].join("");
    }

    // Shared grouping engine for both tables: buckets rows by a display
    // label (the group key itself, e.g. a process name or a MAC vendor),
    // sorted alphabetically, each group collapsed to a single summary row
    // (name + count) unless its key is present in expandedKeys - in which
    // case its individual rows render underneath (optionally sorted by
    // sortCompareFn first - column sorting works the same whether flat or
    // grouped, it just sorts within each group instead of the whole table),
    // using the exact same per-row cell markup the flat view uses (rowHtmlFn).
    function netMonGroupedRowsHtml(rows, groupKeyFn, rowHtmlFn, colCount, expandedKeys, emptyKey, sortCompareFn) {
      if (!rows || !rows.length) {
        return "<tr><td colspan=\"" + colCount + "\" class=\"v1-iplib-empty\">" + escapeHtml(tr(emptyKey)) + "</td></tr>";
      }
      var groups = {};
      var order = [];
      rows.forEach(function (row) {
        var label = groupKeyFn(row) || "-";
        if (!groups[label]) { groups[label] = []; order.push(label); }
        groups[label].push(row);
      });
      order.sort(function (a, b) { return String(a).localeCompare(String(b)); });
      return order.map(function (label) {
        var groupRows = groups[label];
        var isExpanded = !!(expandedKeys && expandedKeys[label]);
        var arrow = isExpanded ? "▼" : "▶";
        var headerRow = "<tr class=\"v1-netmon-group-row\" data-netmon-group-key=\"" + escapeHtml(label) + "\">" +
          "<td colspan=\"" + colCount + "\"><span class=\"v1-collapse-arrow\">" + arrow + "</span> " +
          "<strong>" + escapeHtml(label) + "</strong> (" + groupRows.length + ")</td></tr>";
        var childRows = isExpanded
          ? (sortCompareFn ? groupRows.slice().sort(sortCompareFn) : groupRows)
            .map(function (r) { return "<tr" + netMonRowClass(r, "v1-netmon-group-child") + ">" + rowHtmlFn(r) + "</tr>"; }).join("")
          : "";
        return headerRow + childRows;
      }).join("");
    }

    function renderNetworkMonitorConnectionsRows(rows) {
      if (!rows || !rows.length) {
        return "<tr><td colspan=\"6\" class=\"v1-iplib-empty\">" + escapeHtml(tr("netMonEmptyConnections")) + "</td></tr>";
      }
      return rows.map(function (row) { return "<tr" + netMonRowClass(row) + ">" + netMonConnectionRowHtml(row) + "</tr>"; }).join("");
    }

    function renderNetworkMonitorConnectionsGrouped(rows, groupBy, expandedKeys, sortCompareFn) {
      var keyFn;
      if (groupBy === "pid") keyFn = function (r) { return String(r.pid); };
      else if (groupBy === "protocol") keyFn = function (r) { return r.protocol || "-"; };
      else if (groupBy === "local") keyFn = function (r) { return r.local_addr || "-"; };
      else if (groupBy === "remote") keyFn = function (r) { return r.remote_addr || "-"; };
      else if (groupBy === "state") keyFn = function (r) { return r.state || "-"; };
      else keyFn = function (r) { return r.process_name || "-"; };
      return netMonGroupedRowsHtml(rows, keyFn, netMonConnectionRowHtml, 6, expandedKeys, "netMonEmptyConnections", sortCompareFn);
    }

    function renderNetworkMonitorArpRows(rows) {
      if (!rows || !rows.length) {
        return "<tr><td colspan=\"4\" class=\"v1-iplib-empty\">" + escapeHtml(tr("netMonEmptyArp")) + "</td></tr>";
      }
      return rows.map(function (row) { return "<tr" + netMonRowClass(row) + ">" + netMonArpRowHtml(row) + "</tr>"; }).join("");
    }

    function renderNetworkMonitorArpGrouped(rows, groupBy, expandedKeys, sortCompareFn) {
      var keyFn;
      if (groupBy === "vendor") keyFn = function (r) { return vendorForMac(r.mac); };
      else if (groupBy === "interface") keyFn = function (r) { return r.interface || "-"; };
      else if (groupBy === "ip") keyFn = function (r) { return r.ip || "-"; };
      else keyFn = function (r) { return r.mac || "-"; };
      return netMonGroupedRowsHtml(rows, keyFn, netMonArpRowHtml, 4, expandedKeys, "netMonEmptyArp", sortCompareFn);
    }

    // Email Recon (CS results table) - source/status keys are what the
    // email_recon_lookup Rust command returns; map each to its i18n label.
    var emailReconSourceLabelKey = {
      emailrep: "emailReconSrcEmailrep",
      gravatar: "emailReconSrcGravatar",
      github: "emailReconSrcGithub",
      hibp_breaches: "emailReconSrcHibpBreaches",
      hibp_pastes: "emailReconSrcHibpPastes",
      xposedornot: "emailReconSrcXposedornot",
      leakcheck: "emailReconSrcLeakcheck"
    };
    var emailReconStatusLabelKey = {
      found: "emailReconStatusFound",
      not_found: "emailReconStatusNotFound",
      error: "emailReconStatusError",
      skipped_no_key: "emailReconStatusSkippedNoKey",
      skipped_disabled: "emailReconStatusSkippedDisabled"
    };
    // Reuses the .v1-ip-status-dot family (see cards.css) rather than
    // inventing a parallel badge component - same convention as Network
    // Monitor's TCP-state dots.
    var emailReconStatusClass = {
      found: "is-found",
      not_found: "is-not-found",
      error: "is-error",
      skipped_no_key: "is-skipped",
      skipped_disabled: "is-skipped"
    };

    function renderEmailReconTool() {
      return [
        "<div class=\"v1-emailrecon-shell\">",
        "<div class=\"v1-card v1-emailrecon-summary\" data-emailrecon-role=\"summary\">",
        "<span class=\"v1-emailrecon-summary-exists\" data-emailrecon-role=\"exists-badge\"></span>",
        "<span class=\"v1-emailrecon-summary-count\" data-emailrecon-role=\"hit-count\"></span>",
        "</div>",
        "<div class=\"v1-results-table-scroll v1-results-table-scroll--ip\" data-native-hscroll=\"true\">",
        "<table class=\"v1-results-table v1-emailrecon-table\">",
        "<thead><tr>",
        "<th>" + escapeHtml(tr("emailReconColSource")) + "</th>",
        "<th>" + escapeHtml(tr("emailReconColStatus")) + "</th>",
        "<th>" + escapeHtml(tr("emailReconColSummary")) + "</th>",
        "<th>" + escapeHtml(tr("emailReconColDetail")) + "</th>",
        "</tr></thead>",
        "<tbody id=\"v1EmailReconRows\" data-emailrecon-role=\"results-rows\"><tr><td colspan=\"4\" class=\"v1-iplib-empty\">" + escapeHtml(tr("emailReconEmptyResults")) + "</td></tr></tbody>",
        "</table>",
        "</div>",
        // LeakCheck's free public API's only usage condition (per their
        // docs): a visible "Powered by LeakCheck" link wherever results
        // appear - this satisfies that, not just a courtesy credit.
        "<div class=\"v1-emailrecon-attribution\">" + escapeHtml(tr("emailReconAttributionPrefix")) + " <a href=\"https://leakcheck.io\" target=\"_blank\" rel=\"noopener\">LeakCheck</a></div>",
        "</div>"
      ].join("");
    }

    function renderEmailReconRows(sources) {
      if (!sources || !sources.length) {
        return "<tr><td colspan=\"4\" class=\"v1-iplib-empty\">" + escapeHtml(tr("emailReconEmptyResults")) + "</td></tr>";
      }
      return sources.map(function (row) {
        var sourceLabel = tr(emailReconSourceLabelKey[row.source] || row.source);
        var statusLabel = tr(emailReconStatusLabelKey[row.status] || row.status);
        var statusClass = emailReconStatusClass[row.status] || "";
        return [
          "<tr>",
          "<td>" + escapeHtml(sourceLabel) + "</td>",
          "<td><span class=\"v1-ip-status-dot " + statusClass + "\"></span>" + escapeHtml(statusLabel) + "</td>",
          "<td>" + escapeHtml(row.summary || "-") + "</td>",
          "<td>" + escapeHtml(row.detail || "-") + "</td>",
          "</tr>"
        ].join("");
      }).join("");
    }

    function renderEmailReconSummary(result) {
      if (!result) return { exists: "", count: "" };
      var existsKey = result.exists_hint === "yes" ? "emailReconSummaryExistsYes"
        : result.exists_hint === "no" ? "emailReconSummaryExistsNo"
        : "emailReconSummaryExistsUnknown";
      var total = (result.sources || []).length;
      var countText = tr("emailReconHitCount")
        .replace("{n}", String(result.hit_count || 0))
        .replace("{total}", String(total));
      return { exists: tr(existsKey), count: countText };
    }

    // AI Tools & Permissions (CS tab, opened from General settings). UI/
    // settings only - see ai-permissions-runtime.js's file-top comment.
    function aiPermTreeRow(node, depth, settingsLocked, groupUnavailable) {
      var api = window.NetReconNewUICore && window.NetReconNewUICore.aiPermissions;
      if (!api) return "";
      var unavailable = !!groupUnavailable || !!node.unavailable;
      var value = api.computeDisplayLevel(node);
      var isLocked = !!node.locked;
      var options = ["off", "auto", "ask"].map(function (opt) {
        return "<option value=\"" + opt + "\"" + (value === opt ? " selected" : "") + ">" + escapeHtml(trOr("aiPermLevel_" + opt, opt)) + "</option>";
      }).join("");
      if (value === "mixed") {
        options += "<option value=\"mixed\" selected disabled>" + escapeHtml(trOr("aiPermLevelMixed", "Mixed")) + "</option>";
      }
      var rowHtml = [
        "<div class=\"v1-ai-perm-row" + (unavailable ? " v1-ai-perm-row--unavailable" : "") + "\" style=\"padding-left:" + (depth * 18) + "px;\"" + (unavailable ? " title=\"" + escapeHtml(trOr("aiPermUnavailableNote", "Jeszcze niepodpiete pod realne wywolania AI")) + "\"" : "") + ">",
        "<span class=\"v1-ai-perm-label\">" + escapeHtml(trOr(node.labelKey, node.fallback)) + "</span>",
        "<select class=\"v1-ai-perm-select\" data-ai-perm-select=\"" + escapeHtml(node.id) + "\"" + (isLocked || settingsLocked || unavailable ? " disabled" : "") + ">" + options + "</select>",
        isLocked ? "<span class=\"v1-ai-perm-lock\" title=\"" + escapeHtml(trOr("aiPermLockedNote", "Locked - always requires confirmation")) + "\">🔒</span>" : "",
        "</div>"
      ].join("");
      var childrenHtml = (node.children || []).map(function (child) { return aiPermTreeRow(child, depth + 1, settingsLocked, unavailable); }).join("");
      return rowHtml + childrenHtml;
    }

    function renderAiPermLogHtml(log) {
      return log.length
        ? log.map(function (entry) { return "<div class=\"v1-ai-perm-log-item\">" + escapeHtml(JSON.stringify(entry)) + "</div>"; }).join("")
        : "<div class=\"v1-iplib-empty\">" + escapeHtml(trOr("aiPermLogEmpty", "No actions logged yet.")) + "</div>";
    }

    function renderAiPermissionsTool() {
      var api = window.NetReconNewUICore && window.NetReconNewUICore.aiPermissions;
      if (!api) return "";
      var state = api.getState();
      var log = api.loadAuditLog();

      var locked = state.lockSettings;

      function profileRadio(value, labelKey, labelFallback) {
        return [
          "<label class=\"v1-general-settings-ui-switch-option\">",
          "<input type=\"radio\" name=\"v1AiPermProfile\" value=\"" + value + "\"" + (state.profile === value ? " checked" : "") + (value === "custom" || locked ? " disabled" : "") + " />",
          "<span>" + escapeHtml(trOr(labelKey, labelFallback)) + "</span>",
          "</label>"
        ].join("");
      }

      return [
        "<div class=\"v1-import-manager\">",
        "<div class=\"v1-import-manager-head\">",
        "<h4 style=\"margin:0 0 4px;\">" + escapeHtml(trOr("aiPermTitle", "AI Tools & Permissions")) + "</h4>",
        "<div class=\"v1-import-manager-note\">" + escapeHtml(trOr("aiPermIntroNote", "UI only for now - these settings don't affect the assistant's behavior yet.")) + "</div>",
        "</div>",

        "<h4 class=\"v1-general-settings-group\" style=\"margin-top:0;\">" + escapeHtml(trOr("aiPermGroupProfile", "Profile")) + "</h4>",
        "<div class=\"v1-general-settings-ui-switch v1-general-settings-ui-switch--stacked\">",
        profileRadio("readonly", "aiPermProfileReadonly", "Read-only"),
        profileRadio("assisted", "aiPermProfileAssisted", "Assisted"),
        profileRadio("autonomous", "aiPermProfileAutonomous", "Autonomous"),
        profileRadio("custom", "aiPermProfileCustom", "Custom"),
        "</div>",

        "<h4 class=\"v1-general-settings-group\">" + escapeHtml(trOr("aiPermGroupAccess", "Tool Access")) + "</h4>",
        "<div class=\"v1-config-field-row\">",
        "<label for=\"v1AiPermPriority\">" + escapeHtml(trOr("aiPermPriorityLabel", "Priorytet przy konflikcie (drzewko vs. makro)")) + "</label>",
        "<select id=\"v1AiPermPriority\" class=\"v1-ai-perm-select\" disabled>",
        "<option>" + escapeHtml(trOr("aiPermPriorityRestrictive", "Wygrywa bardziej restrykcyjne (zalecane)")) + "</option>",
        "<option>" + escapeHtml(trOr("aiPermPriorityTool", "Priorytet: narzędzie")) + "</option>",
        "<option>" + escapeHtml(trOr("aiPermPriorityMacro", "Priorytet: makro")) + "</option>",
        "</select>",
        "</div>",
        "<div class=\"v1-ai-perm-tree\">" + (window.NetReconNewUICore.aiPermissions.TREE || []).map(function (node) { return aiPermTreeRow(node, 0, locked); }).join("") + "</div>",

        "<h4 class=\"v1-general-settings-group\">" + escapeHtml(trOr("aiPermGroupGuardrails", "Guardrails")) + "</h4>",
        "<div class=\"v1-config-field-row\">",
        "<label for=\"v1AiPermMaxActions\">" + escapeHtml(trOr("aiPermMaxActionsLabel", "Max actions per conversation")) + "</label>",
        "<input id=\"v1AiPermMaxActions\" type=\"number\" min=\"1\" max=\"100\" value=\"" + state.maxActionsPerConversation + "\"" + (locked ? " disabled" : "") + " />",
        "</div>",
        "<label class=\"v1-config-checkbox-row\">",
        "<input type=\"checkbox\" id=\"v1AiPermLockSettings\"" + (state.lockSettings ? " checked" : "") + " />",
        "<span>🔒 " + escapeHtml(trOr("aiPermLockSettingsLabel", "Block further changes")) + "</span>",
        "</label>",

        "<h4 class=\"v1-general-settings-group\">" + escapeHtml(trOr("aiPermGroupAuditLog", "Audit Log")) + "</h4>",
        "<div class=\"v1-scanner-actions v1-scanner-actions--spaced\">",
        "<button type=\"button\" data-ai-perm-action=\"clear-log\"" + (locked ? " disabled" : "") + ">" + escapeHtml(trOr("aiPermClearLogBtn", "Clear log")) + "</button>",
        "<button type=\"button\" data-ai-perm-action=\"export-log\">" + escapeHtml(trOr("aiPermExportLogBtn", "Export log")) + "</button>",
        "</div>",
        "<div class=\"v1-ai-perm-log\" id=\"v1AiPermLog\">",
        renderAiPermLogHtml(log),
        "</div>",

        "</div>"
      ].join("");
    }

    // Anti-flood display measure: repeated identical text (whether from one
    // spammy sender or several, e.g. a scripted flood using random
    // nicknames - a random nick doesn't evade Discord's own webhook rate
    // limit, but it would still visually flood the list) collapses into one
    // entry instead of N separate bubbles. The entry re-anchors to the
    // newest occurrence's position every time a duplicate arrives (bottom,
    // matching normal newest-at-bottom chat order) and accumulates a
    // newest-first author list + a repeat count. This is a display-only
    // grouping - every underlying message is still really in Discord for
    // real moderation, this just keeps the in-app reading experience from
    // being buried by repeated text.
    function groupCommunityChatMessages(messages) {
      var groups = [];
      var groupsByContent = {};
      messages.forEach(function (m) {
        var key = String(m.content || "");
        var group = groupsByContent[key];
        if (!group) {
          group = { content: m.content, authors: [], count: 0, lastTimestamp: m.timestamp, lastId: m.id };
          groupsByContent[key] = group;
          groups.push(group);
        }
        group.authors.unshift(m.author || "?");
        group.count += 1;
        group.lastTimestamp = m.timestamp;
        group.lastId = m.id;
      });
      groups.sort(function (a, b) {
        var ai = BigInt(a.lastId), bi = BigInt(b.lastId);
        return ai < bi ? -1 : (ai > bi ? 1 : 0);
      });
      return groups;
    }

    // Readability pass on top of the flood-grouping above: several
    // consecutive entries that all boil down to one single author (a
    // multi-author flood-group never counts, even if every group next to
    // it happens to share the SAME null "no single author" - the truthy
    // check on singleAuthor below is what keeps two unrelated mixed-author
    // groups from accidentally merging) collapse under one shared
    // author/time header instead of repeating it for every message, same
    // idea as Discord/Slack clustering someone's consecutive messages.
    function clusterCommunityChatGroups(groups) {
      var clusters = [];
      groups.forEach(function (group) {
        var uniqueAuthors = group.authors.filter(function (a, i) { return group.authors.indexOf(a) === i; });
        var singleAuthor = uniqueAuthors.length === 1 ? uniqueAuthors[0] : null;
        var last = clusters[clusters.length - 1];
        if (singleAuthor && last && last.singleAuthor === singleAuthor) {
          last.entries.push(group);
          last.lastTimestamp = group.lastTimestamp;
        } else {
          clusters.push({ singleAuthor: singleAuthor, authors: group.authors, entries: [group], lastTimestamp: group.lastTimestamp });
        }
      });
      return clusters;
    }

    // Community Chat: single CS panel (no LS/RS split, message list + input
    // fit one panel) - shown identically on desktop and www, backed by a
    // Cloudflare Worker (see community-chat-runtime.js's own comment).
    //
    // Message-list markup is its own function (not inlined into
    // renderCommunityChatTool) so panel-interactions-runtime.js can
    // refresh just the list on every ~5s poll tick without replacing the
    // input row's outerHTML - a wholesale re-render would wipe whatever
    // the user is mid-typing every single poll.
    // Messages from the free-text nickname path can be typed by anyone,
    // including someone else's name - shown once per cluster (not once per
    // underlying message). A cluster whose author(s) all carry the
    // Worker-enforced "✓ " verified-login prefix (see /send's sessionToken
    // branch in docs/COMMUNITY_CHAT_SETUP.md) skips this warning instead -
    // that prefix can't be faked from the anonymous path, the Worker
    // rejects it server-side.
    //
    // Each name inside the author line is its own data-comm-author span
    // (not one flat string) so a right-click can target one specific
    // person even inside a grouped/repeated-message entry with several
    // senders - see wireCommunityChatTool's contextmenu handler.
    function renderCommunityChatMessagesHtml(messages, nickname, ignored) {
      var ignoredSet = {};
      (ignored || []).forEach(function (n) { ignoredSet[n] = true; });
      var visible = messages.filter(function (m) { return !ignoredSet[m.author]; });

      if (!visible.length) return "<div class=\"v1-comm-empty\">" + escapeHtml(trOr("commChatEmptyNote", "No messages yet - say hi!")) + "</div>";

      // Avatar is a property of the AUTHOR, not any one message - built once
      // from the raw list (last one wins, harmless since the same author's
      // avatar doesn't change message-to-message) rather than threading it
      // through groupCommunityChatMessages/clusterCommunityChatGroups, which
      // group by message CONTENT and don't otherwise need to know about it.
      var authorAvatars = {};
      visible.forEach(function (m) {
        if (m.author && m.authorAvatarUrl) authorAvatars[m.author] = m.authorAvatarUrl;
      });

      var groups = groupCommunityChatMessages(visible);

      return clusterCommunityChatGroups(groups).map(function (cluster) {
        var own = cluster.singleAuthor ? cluster.singleAuthor === nickname : cluster.authors.indexOf(nickname) !== -1;
        var ts = cluster.lastTimestamp ? new Date(cluster.lastTimestamp).toLocaleTimeString() : "";
        var authorsHtml = (cluster.singleAuthor ? [cluster.singleAuthor] : cluster.authors).map(function (a) {
          return "<span class=\"v1-comm-msg-author-name\" data-comm-author=\"" + escapeHtml(a) + "\">" + escapeHtml(a) + "</span>";
        }).join(", ");
        // Only for single-author clusters - showing one person's avatar on
        // a multi-author flood-group would misrepresent who actually sent it.
        var avatarUrl = cluster.singleAuthor ? authorAvatars[cluster.singleAuthor] : null;
        var avatarHtml = avatarUrl ? "<img class=\"v1-comm-msg-avatar\" src=\"" + escapeHtml(avatarUrl) + "\" alt=\"\" />" : "";
        var linesHtml = cluster.entries.map(function (group) {
          var textLine = group.count > 1 ? (group.count + " x " + (group.content || "")) : (group.content || "");
          return "<span class=\"v1-comm-msg-text\">" + escapeHtml(textLine) + "</span>";
        }).join("");
        var verified = cluster.singleAuthor
          ? cluster.singleAuthor.indexOf("✓ ") === 0
          : cluster.authors.every(function (a) { return a.indexOf("✓ ") === 0; });
        return [
          "<div class=\"v1-comm-msg" + (own ? " own" : "") + "\">",
          avatarHtml,
          "<span class=\"v1-comm-msg-author\">" + authorsHtml + "</span>",
          "<span class=\"v1-comm-msg-time\">" + escapeHtml(ts) + "</span>",
          linesHtml,
          verified ? "" : "<span class=\"v1-comm-msg-warn\" title=\"" + escapeHtml(trOr("commChatUnverifiedWarnTitle", "This sender picked their own name - it isn't verified and could be impersonating someone.")) + "\">⚠ " + escapeHtml(trOr("commChatUnverifiedWarn", "unverified sender")) + "</span>",
          "</div>"
        ].join("");
      }).join("");
    }

    function communityChatNicknameErrorText(code, cooldownRemainingMs) {
      if (code === "cooldown") {
        var hours = Math.ceil((cooldownRemainingMs || 0) / (60 * 60 * 1000));
        return trOr("commChatNicknameCooldown", "You can change your nickname once a day - try again in ~{hours}h.").replace("{hours}", String(hours));
      }
      if (code === "forbidden_substring") return trOr("commChatNicknameForbiddenWord", "Nickname can't contain \"discord\" or \"clyde\" (Discord blocks it).");
      if (code === "forbidden_chars") return trOr("commChatNicknameForbiddenChars", "Nickname can't contain @ # : or `");
      if (code) return trOr("commChatNicknameInvalid", "Invalid nickname.");
      return "";
    }

    function communityChatLoginErrorText(code) {
      if (code === "timeout") return trOr("commChatLoginTimeout", "Login timed out - try again.");
      if (code) return trOr("commChatLoginFailed", "Discord login failed - try again.");
      return "";
    }

    // Known /send error codes from the Worker (see docs/COMMUNITY_CHAT_
    // SETUP.md) mapped to friendly text - anything unrecognized (a raw
    // "HTTP 500", say) falls through and is shown as-is rather than
    // silently swallowed, since an unmapped code is still more useful to
    // the user than nothing.
    function communityChatSendErrorText(code) {
      if (code === "turnstile_failed") return trOr("commChatTurnstileFailed", "Couldn't verify this isn't a script - try again in a moment.");
      if (code === "nickname_flagged") return trOr("commChatNicknameFlagged", "That nickname was flagged by the content filter.");
      if (code === "message_flagged") return trOr("commChatMessageFlagged", "That message was flagged by the content filter.");
      return code;
    }

    // No nickname yet: a floating card OVERLAYS the message list (dimmed
    // backdrop behind it), rather than replacing it - the chat's existing
    // messages stay visible/scrollable underneath, only sending is blocked
    // until an identity is picked. Previously this card replaced the
    // message-list area entirely, hiding the chat's own history behind a
    // blank setup screen, which read as "there's nothing here yet" even on
    // an active channel.
    //
    // The interactive elements below carry BOTH an id and a matching
    // data-comm-* attribute - detaching a tab into its own floating card
    // (panels-runtime.js's createDetachedCard) strips every id (stripIds())
    // to avoid duplicate-id collisions with the still-docked copy, so
    // wireCommunityChatTool queries by the data-attribute (survives
    // stripping) rather than by id (same fix results-ip needed for its
    // detached view).
    function renderCommunityChatNicknameSetup(nicknameErrorText, loginPending, loginErrorText, currentNickname) {
      return [
        "<div class=\"v1-comm-nickname-overlay\">",
        "<div class=\"v1-comm-nickname-setup\">",
        "<div class=\"v1-comm-nickname-setup-title\">" + escapeHtml(trOr("commChatNicknameSetupTitle", "Pick a nickname to start chatting")) + "</div>",
        nicknameErrorText ? "<div class=\"v1-comm-error\">" + escapeHtml(nicknameErrorText) + "</div>" : "",
        "<div class=\"v1-comm-nickname-row\">",
        "<input type=\"text\" id=\"v1CommChatNicknameInput\" data-comm-nickname-input name=\"communityChatNickname\" autocomplete=\"off\" placeholder=\"" + escapeHtml(trOr("commChatNicknamePlaceholder", "Pick a nickname...")) + "\" maxlength=\"32\"" + (currentNickname ? " value=\"" + escapeHtml(currentNickname) + "\"" : "") + " />",
        "<button type=\"button\" id=\"v1CommChatSaveNicknameBtn\" data-comm-save-nickname-btn>" + escapeHtml(trOr("commChatSaveNicknameBtn", "Start chatting")) + "</button>",
        "</div>",
        "<div class=\"v1-comm-nickname-setup-note\">" + escapeHtml(trOr("commChatNicknameSetupNote", "You can change your nickname once a day.")) + "</div>",
        currentNickname ? "<button type=\"button\" class=\"v1-comm-change-nick-btn\" data-comm-cancel-switch>" + escapeHtml(trOr("commChatCancelSwitch", "Cancel")) + "</button>" : "",
        "<div class=\"v1-comm-setup-divider\">" + escapeHtml(trOr("commChatSetupDivider", "or")) + "</div>",
        loginErrorText ? "<div class=\"v1-comm-error\">" + escapeHtml(loginErrorText) + "</div>" : "",
        "<button type=\"button\" class=\"v1-comm-discord-login-btn\" data-comm-discord-login" + (loginPending ? " disabled" : "") + ">" +
          escapeHtml(loginPending ? trOr("commChatLoginPending", "Waiting for Discord...") : trOr("commChatLoginWithDiscord", "Login with Discord")) +
          "</button>",
        "</div>",
        "</div>"
      ].join("");
    }

    function renderCommunityChatTool() {
      var messages = communityChatApi ? communityChatApi.getMessages() : [];
      var nickname = communityChatApi ? communityChatApi.getNickname() : "";
      var discordSession = communityChatApi ? communityChatApi.getDiscordSession() : null;
      var nicknameErrorText = communityChatNicknameErrorText(
        communityChatApi ? communityChatApi.getNicknameError() : "",
        communityChatApi ? communityChatApi.getNicknameCooldownRemainingMs() : 0
      );

      var showSwitcher = communityChatApi ? communityChatApi.getShowSwitcher() : false;
      var needsSetup = (!nickname && !discordSession) || (showSwitcher && !discordSession);
      var overlayHtml = "";
      if (needsSetup) {
        var loginPending = communityChatApi ? communityChatApi.getDiscordLoginPending() : false;
        var loginErrorText = communityChatLoginErrorText(communityChatApi ? communityChatApi.getDiscordLoginError() : "");
        overlayHtml = renderCommunityChatNicknameSetup(nicknameErrorText, loginPending, loginErrorText, nickname);
      }

      var identity = discordSession ? ("✓ " + discordSession.discordUsername) : nickname;
      var rawSendError = communityChatApi ? communityChatApi.getSendError() : "";
      var sendError = communityChatSendErrorText(rawSendError);
      var sending = communityChatApi ? communityChatApi.getSending() : false;
      var ignored = communityChatApi ? communityChatApi.getIgnored() : [];
      var listHtml = renderCommunityChatMessagesHtml(messages, identity, ignored);

      var ignoredRowHtml = ignored.length
        ? [
            "<div class=\"v1-comm-ignored-row\">",
            "<span class=\"v1-comm-ignored-label\">" + escapeHtml(trOr("commChatIgnoredLabel", "Ignored:")) + "</span>",
            ignored.map(function (n) {
              return "<span class=\"v1-comm-ignored-pill\">" + escapeHtml(n) + "<button type=\"button\" class=\"v1-comm-unignore-btn\" data-comm-unignore=\"" + escapeHtml(n) + "\" title=\"" + escapeHtml(trOr("commChatUnignoreAria", "Stop ignoring")) + "\" aria-label=\"" + escapeHtml(trOr("commChatUnignoreAria", "Stop ignoring")) + "\">&times;</button></span>";
            }).join(""),
            "</div>"
          ].join("")
        : "";

      var statusRowHtml = discordSession
        ? [
            "<div class=\"v1-comm-status-row\">",
            "<span class=\"v1-comm-status-identity\">",
            discordSession.avatarUrl ? "<img class=\"v1-comm-status-avatar\" src=\"" + escapeHtml(discordSession.avatarUrl) + "\" alt=\"\" />" : "",
            escapeHtml(trOr("commChatLoggedInAs", "Logged in as")) + " <strong>✓ " + escapeHtml(discordSession.discordUsername) + "</strong>",
            "</span>",
            "<button type=\"button\" class=\"v1-comm-change-nick-btn\" data-comm-discord-logout>" + escapeHtml(trOr("commChatLogout", "Logout")) + "</button>",
            "</div>"
          ].join("")
        : [
            "<div class=\"v1-comm-status-row\">",
            "<span>" + escapeHtml(trOr("commChatChattingAs", "Chatting as")) + " <strong>" + escapeHtml(nickname) + "</strong></span>",
            "<button type=\"button\" class=\"v1-comm-change-nick-btn\" data-comm-change-nick>" + escapeHtml(trOr("commChatChangeNickname", "change")) + "</button>",
            "</div>"
          ].join("");

      var inputAreaHtml = [
        statusRowHtml,
        nicknameErrorText ? "<div class=\"v1-comm-error\">" + escapeHtml(nicknameErrorText) + "</div>" : "",
        "<div class=\"v1-comm-input-row\">",
        "<input type=\"text\" id=\"v1CommChatMessageInput\" data-comm-message-input name=\"communityChatMessage\" autocomplete=\"off\" placeholder=\"" + escapeHtml(trOr("commChatMessagePlaceholder", "Message...")) + "\" maxlength=\"500\" />",
        "<button type=\"button\" id=\"v1CommChatSendBtn\" data-comm-send-btn" + (sending ? " disabled" : "") + ">" + escapeHtml(trOr("commChatSendBtn", "Send")) + "</button>",
        "</div>"
      ].join("");

      return [
        "<div class=\"v1-comm-chat-shell\">",
        overlayHtml,
        needsSetup ? "" : ignoredRowHtml,
        "<div class=\"v1-comm-chat-list\" id=\"v1CommChatMessages\">",
        listHtml,
        "</div>",
        needsSetup ? "" : (sendError ? "<div class=\"v1-comm-error\">" + escapeHtml(sendError) + "</div>" : ""),
        needsSetup ? "" : inputAreaHtml,
        "</div>"
      ].join("");
    }

    // shell: address bar + a plain <iframe>. Wiring (navigation, the
    // blocked-embedding fallback) is panel-interactions-runtime.js's
    // wireBrowserTool().
    function browserNetworkHitRow(hit) {
      var time = hit.timestamp_ms ? new Date(hit.timestamp_ms).toLocaleTimeString() : "";
      return [
        "<div class=\"v1-browser-network-row\">",
        "<span class=\"v1-browser-network-kind v1-browser-network-kind-" + escapeHtml(hit.kind || "") + "\">" + escapeHtml(hit.kind || "") + "</span>",
        "<span class=\"v1-browser-network-method\">" + escapeHtml(hit.method || "") + "</span>",
        "<span class=\"v1-browser-network-url\" title=\"" + escapeHtml(hit.url || "") + "\">" + escapeHtml(hit.url || "") + "</span>",
        "<span class=\"v1-browser-network-time\">" + escapeHtml(time) + "</span>",
        "</div>"
      ].join("");
    }

    // RS: live "what did this page actually talk to" log, on while the
    // Browser tool's Inspect toggle is on - same RS-panel pattern as Mail
    // XSS Tester's own hit log (wireBrowserNetworkPanel in
    // panel-interactions-runtime.js re-renders this whole thing on every
    // newui:browser-network-changed event).
    function renderBrowserNetworkLog() {
      var api = window.NetReconNewUICore && window.NetReconNewUICore.browserNetwork;
      var active = api ? api.getActive() : false;
      if (!active) {
        return "<div class=\"v1-import-manager-note\">" + escapeHtml(trOr("browserNetworkInactiveNote", "Not inspecting - click Inspect on the Browser tab.")) + "</div>";
      }
      var hits = api ? api.getHits() : [];
      var rowsHtml = hits.length
        ? hits.slice().reverse().map(browserNetworkHitRow).join("")
        : "<div class=\"v1-import-manager-note\">" + escapeHtml(trOr("browserNetworkEmptyNote", "No requests observed yet.")) + "</div>";
      return [
        "<div class=\"v1-section-header\"><strong>" + escapeHtml(trOr("browserNetworkHeading", "Network traffic")) + " (" + hits.length + ")</strong></div>",
        "<div class=\"v1-browser-network-rows\">" + rowsHtml + "</div>"
      ].join("");
    }

    function renderBrowserTool() {
      var networkApi = window.NetReconNewUICore && window.NetReconNewUICore.browserNetwork;
      var inspecting = networkApi ? networkApi.getActive() : false;
      return [
        "<div class=\"v1-embedded-browser\">",
        "<div class=\"v1-embedded-browser-toolbar\">",
        "<button type=\"button\" data-browser-action=\"reload\" title=\"" + escapeHtml(trOr("browserReloadTitle", "Reload")) + "\">⟳</button>",
        "<input type=\"text\" id=\"v1BrowserAddress\" class=\"v1-embedded-browser-address\" autocomplete=\"off\" spellcheck=\"false\" placeholder=\"https://...\" />",
        "<button type=\"button\" data-browser-action=\"go\">" + escapeHtml(trOr("browserGoBtn", "Go")) + "</button>",
        "<button type=\"button\" data-browser-action=\"toggle-inspect\" class=\"" + (inspecting ? "is-active" : "") + "\" title=\"" + escapeHtml(trOr("browserInspectTitle", "Inspect this page's network traffic")) + "\">" + escapeHtml(trOr(inspecting ? "browserInspectOnBtn" : "browserInspectOffBtn", inspecting ? "Inspecting" : "Inspect")) + "</button>",
        "<button type=\"button\" data-browser-action=\"open-native\" class=\"v1-embedded-browser-native-btn\" title=\"" + escapeHtml(trOr("browserOpenNativeTitle", "Open in a real browser window (bypasses embedding restrictions)")) + "\">⧉</button>",
        "</div>",
        "<div class=\"v1-embedded-browser-frame-wrap\">",
        // Plain <iframe> - normal DOM content in this same webview, not a
        // separate native surface, so it can never compete for the main
        // window's own input the way the abandoned docked-child-webview
        // approach did (see main.rs's Browser tool comment). Cross-origin
        // by construction (any real target site), so its content/network
        // traffic is normally opaque to us - the [⧉] button above and the
        // banner below both hand off to a real, independent browser window
        // (open_browser_window) for sites that need it. The [Inspect]
        // toggle is the one exception: it re-points this iframe at a local
        // Rust proxy (start_browser_proxy) that fetches the page itself and
        // injects a small reporting shim, trading a same-origin proxied
        // copy for actual visibility into what the page's own JS/resources
        // talk to - see the RS "Network traffic" tab (browser-network).
        "<iframe class=\"v1-embedded-browser-frame\" title=\"" + escapeHtml(trOr("toolTitle_browser", "Browser")) + "\"></iframe>",
        "<div class=\"v1-embedded-browser-blocked\" data-browser-blocked hidden>",
        "<span>" + escapeHtml(trOr("browserBlockedText", "This site may be blocking embedding.")) + "</span>",
        "<button type=\"button\" data-browser-blocked-open>" + escapeHtml(trOr("browserBlockedOpenBtn", "Open in a real browser window")) + "</button>",
        "</div>",
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
      browser: renderBrowserTool,
      general: renderGeneralSettingsTool,
      "language-manager": renderLanguageManagerTool,
      shellcraft: renderShellCraftCanvasTool,
      pulpit: renderPulpitCanvasTool,
      "pulpit-preview": renderPulpitPreviewTool,
      "mail-xss-tester": renderMailXssTesterTool,
      "https-auditor": renderHttpsAuditorTool,
      "reverse-ip": renderReverseIpTool,
      "google-dork": renderGoogleDorkTool,
      wifi: renderWifiTool,
      "community-chat": renderCommunityChatTool,
      globe: renderGlobeTool,
      "agent-profiles": renderAgentProfileDetailTool,
      "community-catalog": renderCommunityCatalogDetail,
      "md-viewer": renderMarkdownViewerDetail,

      // --- ip-scanner tool keys ---
      "ip-library": renderIpLibraryTool,
      presets: renderPresetsTool,
      "results-ip": renderResultsIp,
      "network-monitor": renderNetworkMonitorTool,
      "email-recon": renderEmailReconTool,
      "ai-permissions": renderAiPermissionsTool,
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
      renderPulpitLibrary: renderPulpitLibrary,
      renderPulpitNodeHtml: renderPulpitNodeHtml,
      renderPulpitLinksSvg: renderPulpitLinksSvg,
      renderPulpitInspector: renderPulpitInspector,
      renderPulpitPreviewList: renderPulpitPreviewList,
      renderPulpitPreviewTool: renderPulpitPreviewTool,
      renderMailXssTesterLibrary: renderMailXssTesterLibrary,
      renderMailXssTesterTool: renderMailXssTesterTool,
      renderMailXssTesterResults: renderMailXssTesterResults,
      renderHttpsAuditorTool: renderHttpsAuditorTool,
      renderReverseIpTool: renderReverseIpTool,
      renderBrowserNetworkLog: renderBrowserNetworkLog,
      renderHttpsAuditorLibrary: renderHttpsAuditorLibrary,
      httpsAuditorResultToCsv: httpsAuditorResultToCsv,
      renderGoogleDorkLibrary: renderGoogleDorkLibrary,
      renderGoogleDorkTool: renderGoogleDorkTool,
      renderGoogleDorkTemplates: renderGoogleDorkTemplates,
      renderWifiTool: renderWifiTool,
      renderWifiLibrary: renderWifiLibrary,
      renderWifiAdapter: renderWifiAdapter,
      renderWifiCurrent: renderWifiCurrent,
      renderCommunityChatTool: renderCommunityChatTool,
      renderCommunityChatMessagesHtml: renderCommunityChatMessagesHtml,
      pulpitEdgeAnchor: pulpitEdgeAnchor,
      renderAgentProfileLibrary: renderAgentProfileLibrary,
      renderAgentProfileDetailFields: renderAgentProfileDetailFields,
      renderNetworkMonitorConnectionsRows: renderNetworkMonitorConnectionsRows,
      renderNetworkMonitorArpRows: renderNetworkMonitorArpRows,
      renderNetworkMonitorConnectionsGrouped: renderNetworkMonitorConnectionsGrouped,
      renderNetworkMonitorArpGrouped: renderNetworkMonitorArpGrouped,
      netMonVendorForMac: vendorForMac,
      renderEmailReconRows: renderEmailReconRows,
      renderEmailReconSummary: renderEmailReconSummary,
      renderAiPermissionsTool: renderAiPermissionsTool,
      renderAiPermLogHtml: renderAiPermLogHtml,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createPanelContentRuntime = createPanelContentRuntime;
})();
