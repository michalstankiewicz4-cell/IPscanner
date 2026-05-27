(function () {
  function createNavigationRuntime(deps) {
    var tr = deps.tr;
    var switchTool = deps.switchTool;
    var setStatusLine = deps.setStatusLine;
    var runMenuAction = deps.runMenuAction;
    var getScannerSidebarRuntime = deps.getScannerSidebarRuntime;
    var platform = deps.platform || ((window.NetReconNewUICore && window.NetReconNewUICore.platform) || {});

    var sidebarView = "scanner";

    function getInvoke() {
      if (platform && typeof platform.getInvoke === "function") {
        return platform.getInvoke();
      }
      return null;
    }

    function runPowerShell(command) {
      if (platform && typeof platform.invoke === "function") {
        return platform.invoke("run_powershell", { command: command });
      }
      var invoke = getInvoke();
      if (!invoke) return Promise.reject(new Error("tauri invoke unavailable"));
      return invoke("run_powershell", { command: command });
    }

    function scriptInvokeCommand(scriptRelativePath) {
      return [
        "$ErrorActionPreference='Stop'",
        "$scriptPath = Join-Path (Get-Location) '" + String(scriptRelativePath || "") + "'",
        "if (!(Test-Path $scriptPath)) { throw \"Missing script: $scriptPath\" }",
        "& $scriptPath"
      ].join("; ");
    }

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
      var out = document.getElementById("v1InfoLog");
      if (!out) return;
      out.textContent += String(line || "") + "\n";
      out.scrollTop = out.scrollHeight;
      document.dispatchEvent(new CustomEvent("newui:console-pane-update", {
        detail: {
          pane: "info",
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

            var psCmd = scriptInvokeCommand("scripts\\detect-external-ip.ps1");
            var invoke = getInvoke();

            if (!invoke) {
              extEl.textContent = tr("statusDesktopOnlyShort");
              appendPsConsole("[" + nowStamp() + "] PS> " + psCmd);
              appendPsConsole("[" + nowStamp() + "] " + tr("statusDesktopOnlyShort"));
              if (setStatusLine) setStatusLine(tr("statusExternalIpDesktopOnly"));
              return;
            }

            appendPsConsole("[" + nowStamp() + "] PS> " + psCmd);
            runPowerShell(psCmd).then(function (res) {
              var stdout = (res && res.stdout) ? String(res.stdout).trim() : "";
              var stderr = (res && res.stderr) ? String(res.stderr).trim() : "";
              var exitCode = (res && typeof res.exit_code === "number") ? res.exit_code : -1;
              var ip = firstIpv4(stdout);

              if (stdout) appendPsConsole(stdout);
              if (stderr) appendPsConsole(stderr);
              appendPsConsole("[" + nowStamp() + "] exit code: " + exitCode);

              if (!ip) {
                extEl.textContent = tr("statusErrorShort");
                if (setStatusLine) setStatusLine(tr("statusExternalIpNoOutput"));
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
              extEl.textContent = tr("statusErrorShort");
              appendPsConsole("[" + nowStamp() + "] " + tr("statusCommandFailed"));
              if (setStatusLine) setStatusLine(tr("statusExternalIpCommandFailed"));
            });
          }

          if (action === "local-ip") {
            var localEl = document.getElementById("v1DetectLocalIp");
            var localBtn = document.getElementById("v1UseLocalIp");
            if (!localEl) return;

            localEl.textContent = "...";
            if (localBtn) localBtn.hidden = true;

            var psLocalCmd = scriptInvokeCommand("scripts\\detect-local-ip.ps1");
            var invoke = getInvoke();

            if (!invoke) {
              localEl.textContent = tr("statusDesktopOnlyShort");
              appendPsConsole("[" + nowStamp() + "] PS> " + psLocalCmd);
              appendPsConsole("[" + nowStamp() + "] " + tr("statusDesktopOnlyShort"));
              if (setStatusLine) setStatusLine(tr("statusLocalIpDesktopOnly"));
              return;
            }

            appendPsConsole("[" + nowStamp() + "] PS> " + psLocalCmd);
            runPowerShell(psLocalCmd).then(function (res) {
              var stdout = (res && res.stdout) ? String(res.stdout).trim() : "";
              var stderr = (res && res.stderr) ? String(res.stderr).trim() : "";
              var exitCode = (res && typeof res.exit_code === "number") ? res.exit_code : -1;
              var ip = firstIpv4(stdout);

              if (stdout) appendPsConsole(stdout);
              if (stderr) appendPsConsole(stderr);
              appendPsConsole("[" + nowStamp() + "] exit code: " + exitCode);

              if (!ip) {
                localEl.textContent = tr("statusErrorShort");
                if (setStatusLine) setStatusLine(tr("statusLocalIpNoOutput"));
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
              localEl.textContent = tr("statusErrorShort");
              appendPsConsole("[" + nowStamp() + "] " + tr("statusCommandFailed"));
              if (setStatusLine) setStatusLine(tr("statusLocalIpCommandFailed"));
            });
          }

          if (action === "subnets") {
            var subEl = document.getElementById("v1DetectSubnets");
            var subBtn = document.getElementById("v1UseSubnets");
            if (!subEl) return;

            subEl.textContent = "...";
            if (subBtn) subBtn.hidden = true;

            var psSubnetCmd = scriptInvokeCommand("scripts\\detect-subnet-cidr.ps1");
            var invoke = getInvoke();

            if (!invoke) {
              subEl.textContent = tr("statusDesktopOnlyShort");
              appendPsConsole("[" + nowStamp() + "] PS> " + psSubnetCmd);
              appendPsConsole("[" + nowStamp() + "] " + tr("statusDesktopOnlyShort"));
              if (setStatusLine) setStatusLine(tr("statusSubnetsDesktopOnly"));
              return;
            }

            appendPsConsole("[" + nowStamp() + "] PS> " + psSubnetCmd);
            runPowerShell(psSubnetCmd).then(function (res) {
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
                subEl.textContent = tr("statusErrorShort");
                if (setStatusLine) setStatusLine(tr("statusSubnetsNoOutput"));
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
              subEl.textContent = tr("statusErrorShort");
              appendPsConsole("[" + nowStamp() + "] " + tr("statusCommandFailed"));
              if (setStatusLine) setStatusLine(tr("statusSubnetsCommandFailed"));
            });
          }

          if (action === "save" && runMenuAction) runMenuAction("save-session");
          if (action === "load" && runMenuAction) runMenuAction("load-session");
          if (["ext-ip", "local-ip", "subnets", "scan-speed"].indexOf(action) < 0 && switchTool) {
            switchTool("scan-runner");
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
        if (e.target.closest("[data-tab-close], [data-tab-popout]")) return;
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

    function bindRightTabsAndAssistant() {
      document.querySelectorAll(".v1-right-tab").forEach(function (tab) {
        tab.addEventListener("click", function () {
          var next = tab.getAttribute("data-v1-right-tab");
          if (!next) return;

          document.querySelectorAll(".v1-right-tab").forEach(function (item) {
            item.classList.toggle("active", item === tab);
          });

          document.querySelectorAll(".v1-right-pane").forEach(function (pane) {
            pane.classList.toggle("active", pane.getAttribute("data-v1-right-pane") === next);
          });
        });
      });

      var chat = document.getElementById("v1AiChatHistory");
      var promptInput = document.getElementById("v1AiPromptInput");
      var sendBtn = document.getElementById("v1AiSendBtn");
      if (!chat || !promptInput) return;

      function currentMode() {
        var selected = document.querySelector('input[name="v1AiMode"]:checked');
        return selected ? selected.value : "ui";
      }

      function appendMessage(kind, text) {
        var msg = document.createElement("div");
        msg.className = "v1-ai-msg " + kind;
        msg.textContent = String(text || "");
        chat.appendChild(msg);
        chat.scrollTop = chat.scrollHeight;
      }

      document.querySelectorAll('input[name="v1AiMode"]').forEach(function (radio) {
        radio.addEventListener("change", function () {
          if (!radio.checked) return;
          var mode = currentMode() === "ps" ? "PS" : "UI";
          appendMessage("assistant", "Mode switched to " + mode + ".");
        });
      });

      function sendPrompt() {
        var prompt = (promptInput.value || "").trim();
        if (!prompt) return;

        var mode = currentMode();
        appendMessage("user", prompt);
        promptInput.value = "";

        if (mode === "ps") {
          appendMessage("assistant", "PS mode active: I will focus on PowerShell/console commands and terminal workflow.");
        } else {
          appendMessage("assistant", "UI mode active: I will focus on UI flows, panel actions, and visual workflow steps.");
        }
      }

      if (sendBtn) {
        sendBtn.addEventListener("click", sendPrompt);
      }
      promptInput.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        if (event.shiftKey) return;
        event.preventDefault();
        sendPrompt();
      });
    }

    function init() {
      bindScannerActions();
      bindResultTabs();
      bindActivityButtons();
      bindToolClicks();
      bindConsoleTabs();
      bindRightTabsAndAssistant();
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
