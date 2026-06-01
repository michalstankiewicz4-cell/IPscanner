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

    function renderDefaultTool(tool) {
      var info = infoFor(tool);
      var points = (info.points || []).map(function (p) { return "<li>" + escapeHtml(p) + "</li>"; }).join("");
      return "<h4>" + escapeHtml(info.title) + "</h4><div>" + escapeHtml(info.text) + "</div><ul>" + points + "</ul>";
    }

    function renderVersionsTool() {
      if (!versionsData.length) {
        return "<h4>" + escapeHtml(versionsConfig.emptyTitle || "Versions") + "</h4><div>" + escapeHtml(versionsConfig.emptyText || "No version entries available.") + "</div>";
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
        "<button type=\"button\" class=\"v1-version-scroll\" data-version-scroll=\"left\" aria-label=\"" + escapeHtml(versionsConfig.scrollLeftAria || "Scroll versions left") + "\">◀</button>",
        "<div class=\"v1-version-track\" id=\"v1VersionTrack\" role=\"listbox\" aria-label=\"" + escapeHtml(versionsConfig.timelineAria || "Published versions timeline") + "\">",
        "<div class=\"v1-version-track-inner\">",
        pointsHtml,
        "</div>",
        "</div>",
        "<button type=\"button\" class=\"v1-version-scroll\" data-version-scroll=\"right\" aria-label=\"" + escapeHtml(versionsConfig.scrollRightAria || "Scroll versions right") + "\">▶</button>",
        "</div>",
        "<div class=\"v1-version-physics\" id=\"v1VersionPhysics\" style=\"--v1-version-progress: 1;\">",
        "<div class=\"v1-version-orb\" aria-hidden=\"true\"></div>",
        "</div>",
        "</div>",
        "<div class=\"v1-versions-list v1-scroll-safe-inline-end\" id=\"v1VersionsList\">",
        listHtml,
        "</div>",
        "</div>"
      ].join("");
    }

    function getCurrentVersion() {
      if (!versionsData.length) return "v1.6.5";
      var first = versionsData[0] || {};
      var version = first.version;
      if (!version) return "v1.6.5";
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
      var dictPlaceholder = languageManagerConfig.dictPlaceholder || "{\n  \"menuFile\": \"Datei\",\n  \"menuOptions\": \"Optionen\",\n  \"menuTools\": \"Werkzeuge\",\n  \"menuHelp\": \"Hilfe\"\n}";

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
        : "<div class=\"v1-import-empty\">" + escapeHtml(importToolConfig.emptyText || "No imported tools yet.") + "</div>";

      return [
        "<div class=\"v1-import-manager\">",
        "<div class=\"v1-import-manager-head\">",
        "<h4 style=\"margin:0 0 4px;\">" + tr("tipActionCustomization") + "</h4>",
        "<div class=\"v1-import-manager-note\">" + escapeHtml(importToolConfig.subtitle || "JSON manifest import, list and uninstall.") + "</div>",
        "</div>",
        "<div class=\"v1-import-manager-grid\">",
        "<label for=\"v1ImportManifest\">" + escapeHtml(importToolConfig.manifestLabel || "Manifest JSON") + "</label>",
        "<textarea id=\"v1ImportManifest\" spellcheck=\"false\" placeholder=\"" + escapeHtml(importToolConfig.manifestPlaceholder || "{\\n  \\\"id\\\": \\\"com.example.demo\\\"\\n}") + "\"></textarea>",
        "<label for=\"v1ImportUninstallId\">" + escapeHtml(importToolConfig.uninstallLabel || "Tool id to uninstall") + "</label>",
        "<input id=\"v1ImportUninstallId\" type=\"text\" autocomplete=\"off\" placeholder=\"" + escapeHtml(importToolConfig.uninstallPlaceholder || "com.example.demo") + "\" />",
        "</div>",
        "<div class=\"v1-import-manager-actions\">",
        "<button type=\"button\" data-import-action=\"install\">" + escapeHtml(importToolConfig.installBtn || "Import") + "</button>",
        "<button type=\"button\" data-import-action=\"list\">" + escapeHtml(importToolConfig.listBtn || "List") + "</button>",
        "<button type=\"button\" data-import-action=\"uninstall\">" + escapeHtml(importToolConfig.uninstallBtn || "Uninstall") + "</button>",
        "</div>",
        "<div class=\"v1-import-manager-options\">",
        "<label><input id=\"v1ImportAddMenu\" type=\"checkbox\" checked /> " + tr("importOptToolsMenu") + "</label>",
        "<label><input id=\"v1ImportAddActivity\" type=\"checkbox\" /> " + tr("importOptActivityIcon") + "</label>",
        "</div>",
        "<div id=\"v1ImportOutput\" class=\"v1-import-output\">" + listHtml + "</div>",
        "</div>"
      ].join("");
    }

    function renderIpLibraryTool() {
      return [
        "<div class=\"v1-import-manager\">",
        "<div class=\"v1-import-manager-head\">",
        "<h4 style=\"margin:0 0 4px;\">" + escapeHtml(tr("ipLibraryTitle")) + "</h4>",
        "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("ipLibraryNote")) + "</div>",
        "</div>",
        "<div class=\"v1-import-manager-note\">" + escapeHtml(tr("ipLibraryCentralHint")) + "</div>",
        "<div class=\"v1-import-manager-note\"><strong>" + escapeHtml(tr("ipLibraryLastUpdateLabel")) + "</strong> <span id=\"v1IpLibraryCenterLastUpdate\">-</span></div>",
        "<div id=\"v1IpLibraryCenterStatus\" class=\"v1-import-manager-note\"></div>",
        "<div class=\"v1-results-table-scroll v1-results-table-scroll--ip\">",
        "<table class=\"v1-results-table v1-ip-results-table v1-iplib-table\">",
        "<thead><tr><th class=\"v1-iplib-col-country\">" + escapeHtml(tr("ipLibraryTableCountry")) + "</th><th class=\"v1-iplib-col-address\">" + escapeHtml(tr("ipLibraryTableAddress")) + "</th></tr></thead>",
        "<tbody id=\"v1IpLibraryCenterRows\"><tr><td colspan=\"2\" class=\"v1-iplib-empty\">" + escapeHtml(tr("ipLibraryTableEmpty")) + "</td></tr></tbody>",
        "</table>",
        "</div>",
        "</div>"
      ].join("");
    }

    function renderPresetsTool() {
      return [
        "<div class=\"v1-presets-shell\">",
        "<div class=\"v1-presets-list-block\">",
        "<ul class=\"v1-presets-list\" role=\"listbox\" aria-label=\"Port presets\">",
        "<li class=\"v1-presets-item\">Cameras</li>",
        "<li class=\"v1-presets-item\">Printers</li>",
        "<li class=\"v1-presets-item\">Folders / HTTP</li>",
        "<li class=\"v1-presets-item\">Routers</li>",
        "<li class=\"v1-presets-item\">NAS / Servers</li>",
        "<li class=\"v1-presets-item\">Windows / SMB</li>",
        "<li class=\"v1-presets-item active\" aria-selected=\"true\">All ports</li>",
        "</ul>",
        "<div class=\"v1-presets-actions\">",
        "<button type=\"button\">+ Add</button>",
        "<button type=\"button\">Delete</button>",
        "<button type=\"button\">Move Up</button>",
        "<button type=\"button\">Move Down</button>",
        "<button type=\"button\">Set as default</button>",
        "</div>",
        "</div>",
        "<section class=\"v1-presets-editor\">",
        "<h4>Edit preset</h4>",
        "<div class=\"v1-presets-form\">",
        "<label for=\"v1PresetName\">Name</label>",
        "<input id=\"v1PresetName\" type=\"text\" autocomplete=\"off\" value=\"All ports\" />",
        "<label for=\"v1PresetPorts\">Ports</label>",
        "<input id=\"v1PresetPorts\" type=\"text\" autocomplete=\"off\" value=\"80,8080,443,554\" />",
        "</div>",
        "<p class=\"v1-presets-hint\">Enter port numbers separated by commas, e.g. 80, 443, 8080, 554</p>",
        "<div class=\"v1-presets-save\">",
        "<button type=\"button\">Save</button>",
        "</div>",
        "</section>",
        "</div>"
      ].join("");
    }

    function renderResultsIp() {
      var rows = Array.isArray(resultsIpConfig.sampleRows) ? resultsIpConfig.sampleRows : [];

      var totalPorts = rows.reduce(function (sum, row) {
        return sum + ((row.ports && row.ports.length) || 0);
      }, 0);

      var bodyHtml = rows.map(function (row, idx) {
        var portsHtml = (row.ports || []).map(function (port) {
          return "<a href=\"#\" class=\"v1-ip-port-link\">/admin/video/snapshot/files/status/stream/mjpeg" + escapeHtml(port) + "</a>";
        }).join("");

        return [
          "<tr class=\"v1-ip-result-row\" data-row-index=\"" + idx + "\">",
          "<td class=\"v1-ip-col-check\">✓</td>",
          "<td class=\"v1-ip-col-star\">★</td>",
          "<td class=\"v1-ip-col-status\"><span class=\"v1-ip-status-dot " + escapeHtml(row.statusClass || "") + "\"></span></td>",
          "<td class=\"v1-ip-col-ip\">" + escapeHtml(row.ip) + "</td>",
          "<td class=\"v1-ip-col-expand\"><button type=\"button\" class=\"v1-ip-expand-btn\" data-open-ports=\"" + idx + "\" aria-expanded=\"false\">+</button></td>",
          "<td class=\"v1-ip-col-ping\">" + escapeHtml(row.ping) + "</td>",
          "<td class=\"v1-ip-col-host\">" + escapeHtml(row.hostname) + "</td>",
          "<td class=\"v1-ip-col-flag\">" + escapeHtml(row.flag) + "</td>",
          "<td class=\"v1-ip-col-isp\">" + escapeHtml(row.isp) + "</td>",
          "</tr>",
          "<tr class=\"v1-ip-ports-row\" data-ports-row=\"" + idx + "\" hidden>",
          "<td colspan=\"10\">",
          "<div class=\"v1-ip-ports-wrap\">" + (portsHtml || "<span class=\"v1-ip-ports-empty\">" + escapeHtml(resultsIpConfig.noOpenPorts || "No open ports") + "</span>") + "</div>",
          "</td>",
          "</tr>"
        ].join("");
      }).join("");

      var headers = resultsIpConfig.headers || {};

      return [
        "<div class=\"v1-results-meta-row\">",
        "<span>" + escapeHtml(resultsIpConfig.hostsLabel || "Hosty") + ": <b id=\"resIpHostCount\">" + rows.length + "</b></span>",
        "<span>" + escapeHtml(resultsIpConfig.openPortsLabel || "Otwarte porty") + ": <b id=\"resIpPortCount\">" + totalPorts + "</b></span>",
        "</div>",
        "<div class=\"v1-results-table-scroll v1-results-table-scroll--ip\">",
        "<table class=\"v1-results-table v1-ip-results-table\">",
        "<thead><tr><th class=\"v1-ip-col-check\">✓</th><th class=\"v1-ip-col-star\">★</th><th class=\"v1-ip-col-status\">●</th><th class=\"v1-ip-col-ip\">" + escapeHtml(headers.ipAddress || "IP Address") + "</th><th class=\"v1-ip-col-expand\">+</th><th class=\"v1-ip-col-ping\">" + escapeHtml(headers.ping || "Ping") + "</th><th class=\"v1-ip-col-host\">" + escapeHtml(headers.hostname || "Hostname") + "</th><th class=\"v1-ip-col-flag\">" + escapeHtml(headers.flag || "Flag") + "</th><th class=\"v1-ip-col-isp\">" + escapeHtml(headers.isp || "ISP") + "</th></tr></thead>",
        "<tbody>" + bodyHtml + "</tbody>",
        "</table>",
        "</div>"
      ].join("");
    }

    var toolRenderers = {
      versions: renderVersionsTool,
      about: renderAboutTool,
      license: renderLicenseTool,
      "import-tool": renderImportTool,
      "language-manager": renderLanguageManagerTool,
      "ip-library": renderIpLibraryTool,
      presets: renderPresetsTool,
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
