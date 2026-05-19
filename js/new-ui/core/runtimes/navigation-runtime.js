(function () {
  function createNavigationRuntime(deps) {
    var tr = deps.tr;
    var switchTool = deps.switchTool;
    var setStatusLine = deps.setStatusLine;
    var runMenuAction = deps.runMenuAction;
    var getScannerSidebarRuntime = deps.getScannerSidebarRuntime;

    var sidebarView = "scanner";

    function switchSidebarView(view) {
      sidebarView = view;
      document.querySelectorAll("[data-sidebar-view]").forEach(function (el) {
        el.hidden = el.getAttribute("data-sidebar-view") !== view;
      });

      var titleEl = document.getElementById("v1SidebarTitle");
      if (titleEl) {
        if (view === "results") titleEl.textContent = tr("resultsSidebarTitle");
        else if (view === "scanner") titleEl.textContent = tr("ipScanner");
        else titleEl.textContent = tr("explorer");
      }

      document.querySelectorAll(".v1-activity [data-activity]").forEach(function (btn) {
        btn.classList.toggle("active", btn.getAttribute("data-activity") === view);
      });
    }

    function scannerRuntime() {
      return typeof getScannerSidebarRuntime === "function" ? getScannerSidebarRuntime() : null;
    }

    function bindScannerActions() {
      document.querySelectorAll("[data-scanner-action]").forEach(function (item) {
        item.addEventListener("click", function () {
          var action = item.getAttribute("data-scanner-action");
          if (!action) return;

          if (action === "start") {
            var runtime = scannerRuntime();
            var range = runtime && runtime.addCurrentRangeFromInputs
              ? runtime.addCurrentRangeFromInputs()
              : {
                  from: (document.getElementById("v1ScanFrom") || {}).value || "0.0.0.0",
                  to: (document.getElementById("v1ScanTo") || {}).value || "0.0.0.0",
                };
            if (setStatusLine) setStatusLine(tr("statusScanStart") + " " + range.from + " - " + range.to);
          }
          if (action === "stop" && setStatusLine) setStatusLine(tr("statusScanStop"));
          if (action === "clear" && setStatusLine) setStatusLine(tr("statusScanClear"));
          if (action === "scan-speed" && setStatusLine) setStatusLine(tr("statusScanSpeed"));

          if (action === "ext-ip") {
            var extEl = document.getElementById("v1DetectExtIp");
            var extBtn = document.getElementById("v1UseExtIp");
            if (extEl) {
              extEl.textContent = "...";
              if (extBtn) extBtn.hidden = true;
              setTimeout(function () {
                var ip = "203.0.113.42";
                extEl.textContent = ip;
                if (extBtn) {
                  extBtn.hidden = false;
                  extBtn.onclick = function () {
                    var runtime = scannerRuntime();
                    return runtime && runtime.applyDetectedRange && runtime.applyDetectedRange(ip);
                  };
                }
                if (setStatusLine) setStatusLine(tr("statusExternalIp") + " " + ip);
              }, 600);
            }
          }

          if (action === "local-ip") {
            var localEl = document.getElementById("v1DetectLocalIp");
            var localBtn = document.getElementById("v1UseLocalIp");
            if (localEl) {
              localEl.textContent = "...";
              if (localBtn) localBtn.hidden = true;
              setTimeout(function () {
                var ip = "192.168.1.5";
                localEl.textContent = ip;
                if (localBtn) {
                  localBtn.hidden = false;
                  localBtn.onclick = function () {
                    var runtime = scannerRuntime();
                    return runtime && runtime.applyDetectedRange && runtime.applyDetectedRange(ip);
                  };
                }
                if (setStatusLine) setStatusLine(tr("statusLocalIp") + " " + ip);
              }, 400);
            }
          }

          if (action === "subnets") {
            var subEl = document.getElementById("v1DetectSubnets");
            var subBtn = document.getElementById("v1UseSubnets");
            if (subEl) {
              subEl.textContent = "...";
              if (subBtn) subBtn.hidden = true;
              setTimeout(function () {
                var ip = "192.168.1.0/24";
                subEl.textContent = ip;
                if (subBtn) {
                  subBtn.hidden = false;
                  subBtn.onclick = function () {
                    var runtime = scannerRuntime();
                    return runtime && runtime.applyDetectedRange && runtime.applyDetectedRange(ip);
                  };
                }
                if (setStatusLine) setStatusLine(tr("statusSubnet") + " " + ip);
              }, 400);
            }
          }

          if (action === "save" && runMenuAction) runMenuAction("save-session");
          if (action === "load" && runMenuAction) runMenuAction("load-session");
          if (["ext-ip", "local-ip", "subnets", "scan-speed"].indexOf(action) < 0 && switchTool) {
            switchTool("results-ip");
          }
        });
      });
    }

    function bindResultTabs() {
      document.querySelectorAll("[data-result-tab]").forEach(function (item) {
        item.addEventListener("click", function () {
          var tool = item.getAttribute("data-result-tab");
          if (tool && switchTool) switchTool(tool);
          document.querySelectorAll("[data-result-tab]").forEach(function (el) {
            el.classList.toggle("active", el === item);
          });
        });
      });
    }

    function bindActivityButtons() {
      document.querySelectorAll(".v1-activity [data-activity]").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          var view = btn.getAttribute("data-activity");
          switchSidebarView(view);
          var tool = btn.getAttribute("data-tool");
          if (tool && switchTool) switchTool(tool);
        });
      });
    }

    function bindToolClicks() {
      document.addEventListener("click", function (e) {
        if (e.target.closest(".v1-activity [data-activity]")) return;
        var target = e.target.closest("[data-tool]");
        if (!target) return;
        var tool = target.getAttribute("data-tool");
        if (!tool || !switchTool) return;
        switchTool(tool);
      });
    }

    function bindConsoleTabs() {
      function tabForPane(paneName) {
        return document.querySelector('.v1-console-tab[data-v1-console-tab="' + paneName + '"]');
      }

      function paneIsActive(paneName) {
        var pane = document.querySelector('.v1-console-pane[data-v1-console-pane="' + paneName + '"]');
        return !!pane && pane.classList.contains("active");
      }

      function markPaneUnread(paneName) {
        var tab = tabForPane(paneName);
        if (!tab || paneIsActive(paneName)) return;
        tab.classList.add("has-unread");
      }

      function clearPaneUnread(paneName) {
        var tab = tabForPane(paneName);
        if (!tab) return;
        tab.classList.remove("has-unread");
      }

      document.addEventListener("newui:console-pane-update", function (evt) {
        var detail = evt && evt.detail ? evt.detail : {};
        var paneName = typeof detail.pane === "string" && detail.pane ? detail.pane : "info";
        markPaneUnread(paneName);
      });

      document.querySelectorAll(".v1-console-tab").forEach(function (tab) {
        tab.addEventListener("click", function () {
          var next = tab.getAttribute("data-v1-console-tab");
          if (!next) return;
          document.querySelectorAll(".v1-console-tab").forEach(function (t) {
            t.classList.toggle("active", t === tab);
          });
          document.querySelectorAll(".v1-console-pane").forEach(function (pane) {
            pane.classList.toggle("active", pane.getAttribute("data-v1-console-pane") === next);
          });
          clearPaneUnread(next);
        });
      });

      document.querySelectorAll(".v1-console-pane.active").forEach(function (pane) {
        clearPaneUnread(pane.getAttribute("data-v1-console-pane") || "");
      });
    }

    function init() {
      bindScannerActions();
      bindResultTabs();
      bindActivityButtons();
      bindToolClicks();
      bindConsoleTabs();
    }

    return {
      init: init,
      switchSidebarView: switchSidebarView,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createNavigationRuntime = createNavigationRuntime;
})();
