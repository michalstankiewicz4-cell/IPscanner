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
    // Domyślnie brak aktywnej zakładki, wszystkie taby zamknięte
    var activeTool = null;
    document.addEventListener("DOMContentLoaded", function () {
      document.querySelectorAll(".v1-tab").forEach(function (tab) {
        tab.classList.add("tab-closed");
        tab.setAttribute("hidden", "hidden");
      });
      updateEmptyState();
    });

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

    function wireVersionsTimeline() {
      var root = document.getElementById("v1ToolDetail");
      if (!root) return;

      var track = document.getElementById("v1VersionTrack");
      var versionsList = document.getElementById("v1VersionsList");
      var physics = document.getElementById("v1VersionPhysics");
      if (!track || !versionsList || !physics) return;

      var points = Array.from(root.querySelectorAll(".v1-version-point"));
      if (!points.length) return;

      function setActiveBySourceIndex(sourceIndex) {
        var safeIndex = Number(sourceIndex);
        if (!Number.isFinite(safeIndex) || safeIndex < 0 || safeIndex >= versionsData.length) return;

        var entry = versionsData[safeIndex];
        if (!entry) return;

        points.forEach(function (point, idx) {
          var isActive = Number(point.getAttribute("data-version-index")) === safeIndex;
          point.classList.toggle("active", isActive);
          if (isActive) {
            point.classList.remove("is-bumping");
            // Force reflow to replay spring animation when selecting another point.
            void point.offsetWidth;
            point.classList.add("is-bumping");

            var progress = points.length > 1 ? idx / (points.length - 1) : 1;
            physics.style.setProperty("--v1-version-progress", String(progress));
            point.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
          }
        });

        root.querySelectorAll("[data-version-entry-index]").forEach(function (section) {
          var isCurrent = Number(section.getAttribute("data-version-entry-index")) === safeIndex;
          section.classList.toggle("is-active", isCurrent);
          if (isCurrent) {
            section.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        });
      }

      points.forEach(function (point) {
        point.addEventListener("click", function () {
          setActiveBySourceIndex(point.getAttribute("data-version-index"));
        });
      });

      root.querySelectorAll("[data-version-scroll]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var dir = btn.getAttribute("data-version-scroll") === "left" ? -1 : 1;
          track.scrollBy({ left: dir * 220, behavior: "smooth" });
        });
      });

      var dragging = false;
      var moved = false;
      var suppressClickOnce = false;
      var pointerId = null;
      var startX = 0;
      var startScroll = 0;
      var lastX = 0;
      var lastT = 0;
      var velocity = 0;
      var inertiaRaf = 0;

      function stopInertia() {
        if (inertiaRaf) {
          cancelAnimationFrame(inertiaRaf);
          inertiaRaf = 0;
        }
      }

      function runInertia() {
        stopInertia();
        function step() {
          velocity *= 0.92;
          if (Math.abs(velocity) < 0.1) {
            inertiaRaf = 0;
            return;
          }
          track.scrollLeft -= velocity;
          inertiaRaf = requestAnimationFrame(step);
        }
        inertiaRaf = requestAnimationFrame(step);
      }

      track.addEventListener("pointerdown", function (event) {
        if (event.button !== 0) return;
        // Do not start drag on interactive version points - allow direct click selection.
        if (event.target && event.target.closest && event.target.closest(".v1-version-point")) return;
        stopInertia();
        dragging = true;
        moved = false;
        pointerId = event.pointerId;
        startX = event.clientX;
        startScroll = track.scrollLeft;
        lastX = event.clientX;
        lastT = Date.now();
        velocity = 0;
        track.classList.add("is-dragging");
        track.setPointerCapture(pointerId);
      });

      track.addEventListener("pointermove", function (event) {
        if (!dragging || event.pointerId !== pointerId) return;
        var dx = event.clientX - startX;
        if (Math.abs(dx) > 3) moved = true;
        track.scrollLeft = startScroll - dx;

        var now = Date.now();
        var dt = Math.max(1, now - lastT);
        velocity = (event.clientX - lastX) / dt * 16;
        lastX = event.clientX;
        lastT = now;
      });

      function endDrag(event) {
        if (!dragging || event.pointerId !== pointerId) return;
        dragging = false;
        track.classList.remove("is-dragging");
        if (track.hasPointerCapture(pointerId)) {
          track.releasePointerCapture(pointerId);
        }
        pointerId = null;
        suppressClickOnce = moved;
        if (moved) {
          runInertia();
        }
      }

      track.addEventListener("pointerup", endDrag);
      track.addEventListener("pointercancel", endDrag);

      points.forEach(function (point) {
        point.addEventListener("click", function (event) {
          if (!suppressClickOnce) return;
          suppressClickOnce = false;
          event.preventDefault();
          event.stopPropagation();
        }, true);
      });

      setActiveBySourceIndex(0);
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

    function wireResultsIpTable() {
      var root = document.getElementById("v1ToolDetail");
      if (!root) return;

      root.querySelectorAll("[data-open-ports]").forEach(function (button) {
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";

        button.addEventListener("click", function () {
          var rowId = button.getAttribute("data-open-ports");
          var portsRow = root.querySelector('[data-ports-row="' + rowId + '"]');
          if (!portsRow) return;

          var expanded = button.getAttribute("aria-expanded") === "true";
          var nextExpanded = !expanded;
          button.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
          button.textContent = nextExpanded ? "−" : "+";

          if (nextExpanded) {
            portsRow.removeAttribute("hidden");
          } else {
            portsRow.setAttribute("hidden", "hidden");
          }
        });
      });
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
      about: renderAboutTool,
      license: renderLicenseTool,
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

      document.querySelectorAll(".v1-tab").forEach(function (el) {
        var isActive = el.getAttribute("data-tool") === activeTool;
        el.classList.toggle("active", isActive);
        if (isActive) {
          el.classList.remove("tab-closed");
          el.removeAttribute("hidden");
        }
      });

      var v1Title = document.getElementById("v1ToolTitle");
      var v1Detail = document.getElementById("v1ToolDetail");
      var v1StatusRight = document.getElementById("v1StatusRight");
      var v1ScanMeta = document.getElementById("v1ScanMeta");
      var v1ScanActions = document.getElementById("v1ScanActions");
      var v1MainCard = document.getElementById("v1MainCard");

      if (!activeTool) {
        if (v1Title) v1Title.textContent = "";
        if (v1Detail) v1Detail.innerHTML = "";
        if (v1ScanMeta) {
          v1ScanMeta.setAttribute("hidden", "hidden");
          v1ScanMeta.style.display = "none";
          v1ScanMeta.setAttribute("aria-hidden", "true");
        }
        if (v1ScanActions) {
          v1ScanActions.setAttribute("hidden", "hidden");
          v1ScanActions.style.display = "none";
          v1ScanActions.setAttribute("aria-hidden", "true");
        }
        if (v1MainCard) {
          v1MainCard.classList.remove("is-versions-view");
        }
        if (typeof setStatusLine === "function") setStatusLine(tr("toolRoute") + ": brak aktywnej zakładki");
        if (v1StatusRight) v1StatusRight.textContent = tr("active") + ": brak aktywnej zakładki";
        if (typeof onAfterRender === "function") onAfterRender(activeTool);
        return;
      }

      // Ustaw zawartość dla aktywnej zakładki
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
      if (v1MainCard) {
        v1MainCard.classList.toggle("is-versions-view", activeTool === "versions");
      }
      if (typeof setStatusLine === "function") setStatusLine(tr("toolRoute") + ": " + activeTool);
      if (v1StatusRight) v1StatusRight.textContent = tr("active") + ": " + activeTool;
      if (activeTool === "versions") {
        wireVersionsTimeline();
      }
      if (activeTool === "results-ip") {
        wireResultsIpTable();
      }
      if (typeof onAfterRender === "function") onAfterRender(activeTool);
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
