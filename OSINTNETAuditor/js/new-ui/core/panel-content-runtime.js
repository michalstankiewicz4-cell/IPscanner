(function () {
  function createPanelContentRuntime(deps) {
    var tr = deps.tr;
    var escapeHtml = deps.escapeHtml;
    var infoFor = deps.infoFor;
    var versionsData = Array.isArray(deps.versionsData) ? deps.versionsData : [];
    var i18n = deps.i18n;
    var extensionHost = deps.extensionHost;

    function renderDefaultTool(tool) {
      var info = infoFor(tool);
      var points = (info.points || []).map(function (p) { return "<li>" + escapeHtml(p) + "</li>"; }).join("");
      return "<h4>" + escapeHtml(info.title) + "</h4><div>" + escapeHtml(info.text) + "</div><ul>" + points + "</ul>";
    }

    function renderVersionsTool() {
      if (!versionsData.length) {
        return "<h4>Versions</h4><div>No version entries available.</div>";
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
        "<button type=\"button\" class=\"v1-version-scroll\" data-version-scroll=\"left\" aria-label=\"Scroll versions left\">◀</button>",
        "<div class=\"v1-version-track\" id=\"v1VersionTrack\" role=\"listbox\" aria-label=\"Published versions timeline\">",
        "<div class=\"v1-version-track-inner\">",
        pointsHtml,
        "</div>",
        "</div>",
        "<button type=\"button\" class=\"v1-version-scroll\" data-version-scroll=\"right\" aria-label=\"Scroll versions right\">▶</button>",
        "</div>",
        "<div class=\"v1-version-physics\" id=\"v1VersionPhysics\" style=\"--v1-version-progress: 1;\">",
        "<div class=\"v1-version-orb\" aria-hidden=\"true\"></div>",
        "</div>",
        "</div>",
        "<div class=\"v1-versions-list\" id=\"v1VersionsList\">",
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
      return [
        "<div class=\"v1-license\">",
        "<h4>" + escapeHtml(tr("licenseHeading")) + "</h4>",
        "<pre class=\"v1-license-text\">MIT License\n\nCopyright (c) Michal Stankiewicz\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.</pre>",
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

    function renderResultsIp() {
      var rows = [
        {
          ip: "83.9.186.53",
          ping: "23 ms",
          hostname: "83.9.186.53.ipv4.supermedia.pl",
          flag: "PL",
          isp: "Orange Polska Spolka Akcyjna",
          statusClass: "is-up",
          ports: [":34567", ":80", ":443", ":631"]
        },
        {
          ip: "83.9.186.185",
          ping: "4 ms",
          hostname: "83.9.186.185.ipv4.supermedia.pl",
          flag: "PL",
          isp: "Orange Polska Spolka Akcyjna",
          statusClass: "is-up",
          ports: [":80", ":443"]
        }
      ];

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
          "<div class=\"v1-ip-ports-wrap\">" + (portsHtml || "<span class=\"v1-ip-ports-empty\">No open ports</span>") + "</div>",
          "</td>",
          "</tr>"
        ].join("");
      }).join("");

      return [
        "<div class=\"v1-results-meta-row\">",
        "<span>Hosty: <b id=\"resIpHostCount\">" + rows.length + "</b></span>",
        "<span>Otwarte porty: <b id=\"resIpPortCount\">" + totalPorts + "</b></span>",
        "</div>",
        "<div class=\"v1-results-table-scroll v1-results-table-scroll--ip\">",
        "<table class=\"v1-results-table v1-ip-results-table\">",
        "<thead><tr><th class=\"v1-ip-col-check\">✓</th><th class=\"v1-ip-col-star\">★</th><th class=\"v1-ip-col-status\">●</th><th class=\"v1-ip-col-ip\">IP Address</th><th class=\"v1-ip-col-expand\">+</th><th class=\"v1-ip-col-ping\">Ping</th><th class=\"v1-ip-col-host\">Hostname</th><th class=\"v1-ip-col-flag\">Flag</th><th class=\"v1-ip-col-isp\">ISP</th></tr></thead>",
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
