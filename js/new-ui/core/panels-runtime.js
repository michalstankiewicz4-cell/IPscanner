(function () {
  function createPanelsRuntime(deps) {
    var tr = deps.tr;
    var getToolInfoMap = deps.getToolInfoMap;
    var versionsData = Array.isArray(deps.versionsData) ? deps.versionsData : [];
    var store = deps.store;
    var activeTool = deps.initialActiveTool || "scan-runner";

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
      var points = (info.points || []).map(function (p) { return "<li>" + p + "</li>"; }).join("");
      return "<h4>" + info.title + "</h4><div>" + info.text + "</div><ul>" + points + "</ul>";
    }

    function renderVersionsTool() {
      if (!versionsData.length) {
        return "<h4>Versions</h4><div>No version entries available.</div>";
      }

      var entriesHtml = versionsData.map(function (entry) {
        var notes = (entry.notes || []).map(function (note) { return "<li>" + note + "</li>"; }).join("");
        return "<section class=\"v1-version-entry\"><h4>" + entry.version + "</h4><ul>" + notes + "</ul></section>";
      }).join("");
      return "<div class=\"v1-versions-list\">" + entriesHtml + "</div>";
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
      var v1StatusLine = document.getElementById("v1StatusLine");
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
      if (v1StatusLine) v1StatusLine.textContent = tr("toolRoute") + ": " + activeTool;
      if (v1StatusRight) v1StatusRight.textContent = tr("active") + ": " + activeTool;
    }

    function switchTool(tool) {
      var tab = document.querySelector('.v1-tab[data-tool="' + tool + '"]');
      if (tab && tab.classList.contains("tab-closed")) {
        tab.classList.remove("tab-closed");
        tab.removeAttribute("hidden");
      }

      activeTool = tool;
      if (store && store.setState) store.setState({ activeTool: tool });
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
