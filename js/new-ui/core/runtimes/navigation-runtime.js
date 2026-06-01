(function () {
  function createNavigationRuntime(deps) {
    var tr = deps.tr;
    var switchTool = deps.switchTool;
    var setStatusLine = deps.setStatusLine;
    var runMenuAction = deps.runMenuAction;
    var getScannerSidebarRuntime = deps.getScannerSidebarRuntime;
    var platform = deps.platform || ((window.NetReconNewUICore && window.NetReconNewUICore.platform) || {});

    var sidebarView = "scanner";
    var sidebarFallbackOrder = ["scan-runner", "results-ip", "ip-library"];

    function sidebarViewForTool(tool, preferredView) {
      if (preferredView) return preferredView;
      if (tool === "results-ip") return "results";
      if (tool === "scan-runner" || tool === "ip-library") return "scanner";
      return sidebarView;
    }

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
      var toolTabsEl = document.getElementById("v1SidebarToolTabs");
      if (titleEl) {
        if (view === "results") titleEl.textContent = tr("resultsSidebarTitle");
        else if (view === "scanner") titleEl.textContent = tr("ipScanner");
        else titleEl.textContent = tr("explorer");
      }

      var showToolTabs = view === "scanner" || view === "results" || view === "empty";
      if (toolTabsEl) {
        toolTabsEl.hidden = !showToolTabs;
      }
      if (titleEl) {
        titleEl.hidden = showToolTabs;
      }

      document.querySelectorAll(".v1-activity [data-tool]").forEach(function (btn) {
        btn.classList.remove("active");
      });
      document.querySelectorAll(".v1-activity [data-activity]").forEach(function (btn) {
        if (btn.getAttribute("data-activity") === view) {
          btn.classList.add("active");
        }
      });
    }

    function scannerRuntime() {
      return typeof getScannerSidebarRuntime === "function" ? getScannerSidebarRuntime() : null;
    }

    function setSidebarTabOpen(tool, isOpen) {
      var wrap = document.querySelector('.v1-sidebar-tool-tab-wrap[data-sidebar-tab="' + tool + '"]');
      if (!wrap) return;
      wrap.classList.toggle("sidebar-tab-closed", !isOpen);
      if (isOpen) wrap.removeAttribute("hidden");
      else wrap.setAttribute("hidden", "hidden");
      syncLeftTabActivationInvariant();
    }

    function ensureSidebarTabOpen(tool) {
      if (!tool) return;
      setSidebarTabOpen(tool, true);
    }

    function activateSidebarTool(tool, preferredView) {
      if (!tool) return;
      ensureSidebarTabOpen(tool);
      setLeftActiveTab(tool);
      switchSidebarView(sidebarViewForTool(tool, preferredView));
    }

    function syncScannerSidebarToolPanels(activeTool) {
      var selected = activeTool === "ip-library" ? "ip-library" : "scan-runner";
      document.querySelectorAll("[data-sidebar-tool-panel]").forEach(function (panel) {
        var panelTool = panel.getAttribute("data-sidebar-tool-panel") || "";
        panel.hidden = panelTool !== selected;
      });
    }

    function setLeftActiveTab(tool) {
      var nextTool = String(tool || "");
      document.querySelectorAll(".v1-sidebar-tool-tab-wrap").forEach(function (wrap) {
        var wrapTool = wrap.getAttribute("data-sidebar-tab") || "";
        wrap.classList.toggle("is-left-active", !!nextTool && wrapTool === nextTool);
      });
      document.querySelectorAll(".v1-sidebar-tool-tab").forEach(function (btn) {
        var btnTool = btn.getAttribute("data-tool") || "";
        btn.classList.toggle("is-left-active", !!nextTool && btnTool === nextTool);
        btn.classList.toggle("active", !!nextTool && btnTool === nextTool);
      });
      syncScannerSidebarToolPanels(nextTool);
    }

    function syncLeftTabActivationInvariant() {
      var openTools = Array.from(document.querySelectorAll(".v1-sidebar-tool-tab-wrap"))
        .filter(function (wrap) {
          return !wrap.classList.contains("sidebar-tab-closed") && !wrap.hasAttribute("hidden");
        })
        .map(function (wrap) {
          return wrap.getAttribute("data-sidebar-tab") || "";
        })
        .filter(Boolean);

      if (!openTools.length) {
        setLeftActiveTab("");
        return;
      }

      if (openTools.length === 1) {
        setLeftActiveTab(openTools[0]);
        return;
      }

      var hasActive = Array.from(document.querySelectorAll(".v1-sidebar-tool-tab-wrap.is-left-active"))
        .some(function (wrap) {
          var tool = wrap.getAttribute("data-sidebar-tab") || "";
          return openTools.indexOf(tool) >= 0;
        });
      if (!hasActive) {
        setLeftActiveTab(openTools[0]);
      }
    }

    function isSidebarTabOpen(tool) {
      if (!tool) return false;
      var wrap = document.querySelector('.v1-sidebar-tool-tab-wrap[data-sidebar-tab="' + tool + '"]');
      if (!wrap) return false;
      if (wrap.classList.contains("sidebar-tab-closed")) return false;
      if (wrap.hasAttribute("hidden")) return false;
      return true;
    }

    function firstOpenSidebarTab(excludedTool) {
      var preferred = Array.isArray(sidebarFallbackOrder) ? sidebarFallbackOrder : [];
      for (var i = 0; i < preferred.length; i += 1) {
        var tool = preferred[i];
        if (!tool || tool === excludedTool) continue;
        if (isSidebarTabOpen(tool)) return tool;
      }

      var wraps = Array.from(document.querySelectorAll(".v1-sidebar-tool-tab-wrap"));
      var next = wraps.find(function (wrap) {
        if (wrap.classList.contains("sidebar-tab-closed")) return false;
        if (wrap.hasAttribute("hidden")) return false;
        var tabTool = wrap.getAttribute("data-sidebar-tab") || "";
        return tabTool && tabTool !== excludedTool;
      });
      return next ? (next.getAttribute("data-sidebar-tab") || "") : "";
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
          if (action === "scan-speed") {
            if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("tabScanDefaultsTitle"));
            if (switchTool) switchTool("scan-defaults");
          }
          if (action === "presets") {
            if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("scannerPortPresets"));
            if (switchTool) switchTool("presets");
          }

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
        });
      });
    }

    function bindResultTabs() {
      document.querySelectorAll("[data-result-tab]").forEach(function (item) {
        item.addEventListener("click", function () {
          var tool = item.getAttribute("data-result-tab");
          if (tool === "results-ip") {
            activateSidebarTool("results-ip", "results");
          }
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

          // Results activity should only affect the left panel.
          if (view === "results" || tool === "results-ip") {
            activateSidebarTool("results-ip", "results");
            return;
          }

          // Scanner activity should mirror Tools -> IP Scanner behavior.
          if (view === "scanner" && tool === "scan-runner") {
            ensureSidebarTabOpen("scan-runner");
            setLeftActiveTab("scan-runner");
            switchSidebarView("scanner");
            if (switchTool) switchTool("results-ip");
            return;
          }

          if (tool === "scan-runner" || tool === "ip-library" || tool === "results-ip") {
            activateSidebarTool(tool, view);
          }
          if (tool && switchTool) switchTool(tool);
        });
      });
    }

    function bindSidebarIntentEvents() {
      document.addEventListener("newui:sidebar-tab-intent-open", function (evt) {
        var detail = evt && evt.detail ? evt.detail : {};
        var tool = typeof detail.tool === "string" ? detail.tool : "";
        if (!tool) return;

        ensureSidebarTabOpen(tool);
        if (detail.activate !== false) {
          setLeftActiveTab(tool);
        }

        switchSidebarView(sidebarViewForTool(tool, detail.view));
      });
    }

    function bindToolClicks() {
      document.addEventListener("click", function (e) {
        if (e.target.closest(".v1-activity [data-activity]")) return;
        if (e.target.closest("[data-sidebar-tab-close]")) return;
        if (e.target.closest("[data-tab-close], [data-tab-popout]")) return;
        var target = e.target.closest("[data-tool]");
        if (!target) return;
        var tool = target.getAttribute("data-tool");
        if (!tool || !switchTool) return;
        var fromToolsMenu = !!target.closest('.v1-menu-group[data-menu="tools"]');
        var fromCenterTabs = !!target.closest(".v1-tabs");
        var fromLeftTabs = !!target.closest("#v1SidebarToolTabs");
        var fromActivityRail = !!target.closest(".v1-activity");

        if (fromActivityRail) {
          document.querySelectorAll(".v1-activity [data-tool]").forEach(function (btn) {
            btn.classList.toggle("active", btn === target);
          });
        }

        // Central tab clicks should only activate that tab.
        if (fromCenterTabs) {
          switchTool(tool);
          return;
        }

        // Left sidebar tab clicks should only switch/activate left tabs.
        if (fromLeftTabs) {
          activateSidebarTool(tool);
          return;
        }

        if (tool === "results-ip") {
          if (!fromToolsMenu && !fromCenterTabs) {
            activateSidebarTool("results-ip", "results");
          } else {
            if (fromToolsMenu) setLeftActiveTab("scan-runner");
          }
          switchSidebarView(fromToolsMenu ? "scanner" : "results");
          if (fromToolsMenu) {
            ensureSidebarTabOpen("scan-runner");
          }
        } else if (tool === "scan-runner" || tool === "ip-library") {
          activateSidebarTool(tool, "scanner");
        }
        switchTool(tool);
      });
    }

    function bindSidebarTabClosers() {
      document.addEventListener("click", function (e) {
        var close = e.target && e.target.closest ? e.target.closest("[data-sidebar-tab-close]") : null;
        if (!close) return;

        e.preventDefault();
        e.stopPropagation();

        var tool = close.getAttribute("data-tool") || "";
        if (!tool) return;

        setSidebarTabOpen(tool, false);

        var nextTool = firstOpenSidebarTab(tool);

        if (nextTool === "scan-runner" || nextTool === "ip-library") {
          setLeftActiveTab(nextTool);
          switchSidebarView("scanner");
          return;
        }

        if (nextTool === "results-ip") {
          setLeftActiveTab("results-ip");
          switchSidebarView("results");
          return;
        }

        setLeftActiveTab("");
        switchSidebarView("empty");
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
      setLeftActiveTab("");
      syncLeftTabActivationInvariant();
      bindScannerActions();
      bindResultTabs();
      bindActivityButtons();
      bindSidebarIntentEvents();
      bindToolClicks();
      bindSidebarTabClosers();
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
