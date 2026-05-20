(function () {
  function createNavigationRuntime(deps) {
    var tr = deps.tr;
    var switchTool = deps.switchTool;
    var setStatusLine = deps.setStatusLine;
    var runMenuAction = deps.runMenuAction;
    var getScannerSidebarRuntime = deps.getScannerSidebarRuntime;

    var sidebarView = "scanner";
    var invoke =
      (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke)
      || (window.__TAURI__ && window.__TAURI__.invoke)
      || (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke)
      || null;

    function firstIpv4(text) {
      var match = String(text || "").match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
      return match ? match[0] : "";
    }

    function firstCidr(text) {
      var match = String(text || "").match(/\b(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}\b/);
      return match ? match[0] : "";
    }

    function nowStamp() {
      var d = new Date();
      return d.toLocaleTimeString();
    }

    function appendPsConsole(line) {
      var out = document.getElementById("v1PsOutput");
      if (!out) return;
      out.textContent += String(line || "") + "\n";
      out.scrollTop = out.scrollHeight;
      document.dispatchEvent(new CustomEvent("newui:console-pane-update", {
        detail: {
          pane: "console",
          source: "scanner-sidebar",
          text: String(line || ""),
        },
      }));
    }

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
            if (!extEl) return;

            extEl.textContent = "...";
            if (extBtn) extBtn.hidden = true;

            var psCmd = "(Invoke-RestMethod -UseBasicParsing 'https://api.ipify.org').ToString()";

            if (!invoke) {
              extEl.textContent = "desktop only";
              appendPsConsole("[" + nowStamp() + "] PS> " + psCmd);
              appendPsConsole("[" + nowStamp() + "] desktop only");
              if (setStatusLine) setStatusLine("External IP: desktop only");
              return;
            }

            appendPsConsole("[" + nowStamp() + "] PS> " + psCmd);
            invoke("run_powershell", { command: psCmd }).then(function (res) {
              var stdout = (res && res.stdout) ? String(res.stdout).trim() : "";
              var stderr = (res && res.stderr) ? String(res.stderr).trim() : "";
              var exitCode = (res && typeof res.exit_code === "number") ? res.exit_code : -1;
              var ip = firstIpv4(stdout);

              if (stdout) appendPsConsole(stdout);
              if (stderr) appendPsConsole(stderr);
              appendPsConsole("[" + nowStamp() + "] exit code: " + exitCode);

              if (!ip) {
                extEl.textContent = "error";
                if (setStatusLine) setStatusLine("External IP: no output");
                return;
              }

              extEl.textContent = ip;
              if (extBtn) {
                extBtn.hidden = false;
                extBtn.onclick = function () {
                  var runtime = scannerRuntime();
                  return runtime && runtime.applyDetectedRange && runtime.applyDetectedRange(ip);
                };
              }
              if (setStatusLine) setStatusLine(tr("statusExternalIp") + " " + ip);
            }).catch(function () {
              extEl.textContent = "error";
              appendPsConsole("[" + nowStamp() + "] command failed");
              if (setStatusLine) setStatusLine("External IP: command failed");
            });
          }

          if (action === "local-ip") {
            var localEl = document.getElementById("v1DetectLocalIp");
            var localBtn = document.getElementById("v1UseLocalIp");
            if (!localEl) return;

            localEl.textContent = "...";
            if (localBtn) localBtn.hidden = true;

            var psLocalCmd = "$ip=(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^(127\\.|169\\.254\\.)' -and $_.InterfaceAlias -notmatch 'Loopback' } | Select-Object -First 1 -ExpandProperty IPAddress); if(-not $ip){$ip=(ipconfig | Select-String 'IPv4 Address|Adres IPv4' | ForEach-Object { $_.ToString().Split(':')[-1].Trim() } | Where-Object {$_ -and $_ -notmatch '^(127\\.|169\\.254\\.)'} | Select-Object -First 1)}; $ip";

            if (!invoke) {
              localEl.textContent = "desktop only";
              appendPsConsole("[" + nowStamp() + "] PS> " + psLocalCmd);
              appendPsConsole("[" + nowStamp() + "] desktop only");
              if (setStatusLine) setStatusLine("Local IP: desktop only");
              return;
            }

            appendPsConsole("[" + nowStamp() + "] PS> " + psLocalCmd);
            invoke("run_powershell", { command: psLocalCmd }).then(function (res) {
              var stdout = (res && res.stdout) ? String(res.stdout).trim() : "";
              var stderr = (res && res.stderr) ? String(res.stderr).trim() : "";
              var exitCode = (res && typeof res.exit_code === "number") ? res.exit_code : -1;
              var ip = firstIpv4(stdout);

              if (stdout) appendPsConsole(stdout);
              if (stderr) appendPsConsole(stderr);
              appendPsConsole("[" + nowStamp() + "] exit code: " + exitCode);

              if (!ip) {
                localEl.textContent = "error";
                if (setStatusLine) setStatusLine("Local IP: no output");
                return;
              }

              localEl.textContent = ip;
              if (localBtn) {
                localBtn.hidden = false;
                localBtn.onclick = function () {
                  var runtime = scannerRuntime();
                  return runtime && runtime.applyDetectedRange && runtime.applyDetectedRange(ip);
                };
              }
              if (setStatusLine) setStatusLine(tr("statusLocalIp") + " " + ip);
            }).catch(function () {
              localEl.textContent = "error";
              appendPsConsole("[" + nowStamp() + "] command failed");
              if (setStatusLine) setStatusLine("Local IP: command failed");
            });
          }

          if (action === "subnets") {
            var subEl = document.getElementById("v1DetectSubnets");
            var subBtn = document.getElementById("v1UseSubnets");
            if (!subEl) return;

            subEl.textContent = "...";
            if (subBtn) subBtn.hidden = true;

            var psSubnetCmd = "$e=(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^(127\\.|169\\.254\\.)' -and $_.InterfaceAlias -notmatch 'Loopback' } | Select-Object -First 1); if($e){$oct=$e.IPAddress.Split('.'); \"$($oct[0]).$($oct[1]).$($oct[2]).0/$($e.PrefixLength)\"}";

            if (!invoke) {
              subEl.textContent = "desktop only";
              appendPsConsole("[" + nowStamp() + "] PS> " + psSubnetCmd);
              appendPsConsole("[" + nowStamp() + "] desktop only");
              if (setStatusLine) setStatusLine("Subnets: desktop only");
              return;
            }

            appendPsConsole("[" + nowStamp() + "] PS> " + psSubnetCmd);
            invoke("run_powershell", { command: psSubnetCmd }).then(function (res) {
              var stdout = (res && res.stdout) ? String(res.stdout).trim() : "";
              var stderr = (res && res.stderr) ? String(res.stderr).trim() : "";
              var exitCode = (res && typeof res.exit_code === "number") ? res.exit_code : -1;
              var cidr = firstCidr(stdout);

              if (stdout) appendPsConsole(stdout);
              if (stderr) appendPsConsole(stderr);
              appendPsConsole("[" + nowStamp() + "] exit code: " + exitCode);

              if (!cidr) {
                var fallbackIp = firstIpv4(stdout);
                if (fallbackIp) {
                  var parts = fallbackIp.split(".");
                  cidr = parts[0] + "." + parts[1] + "." + parts[2] + ".0/24";
                }
              }

              if (!cidr) {
                subEl.textContent = "error";
                if (setStatusLine) setStatusLine("Subnets: no output");
                return;
              }

              subEl.textContent = cidr;
              if (subBtn) {
                subBtn.hidden = false;
                subBtn.onclick = function () {
                  var runtime = scannerRuntime();
                  return runtime && runtime.applyDetectedRange && runtime.applyDetectedRange(cidr);
                };
              }
              if (setStatusLine) setStatusLine(tr("statusSubnet") + " " + cidr);
            }).catch(function () {
              subEl.textContent = "error";
              appendPsConsole("[" + nowStamp() + "] command failed");
              if (setStatusLine) setStatusLine("Subnets: command failed");
            });
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
