(function () {
  function createPowerShellConsoleRuntime(deps) {
    var tr = deps.tr;
    var setStatusLine = deps.setStatusLine;
    var platform = deps.platform || ((window.NetReconNewUICore && window.NetReconNewUICore.platform) || {});

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

    function t(key) {
      return typeof tr === "function" ? tr(key) : key;
    }

    function nowStamp() {
      var d = new Date();
      return d.toLocaleTimeString();
    }

    function init() {
      var out = document.getElementById("v1PsOutput");
      var infoLog = document.getElementById("v1InfoLog");
      var input = document.getElementById("v1PsInput");
      if (!out || !input) return;

      function selectAllOutput() {
        var sel = window.getSelection ? window.getSelection() : null;
        if (!sel) return;
        var range = document.createRange();
        range.selectNodeContents(out);
        sel.removeAllRanges();
        sel.addRange(range);
        out.focus();
      }

      function append(line) {
        // Keep terminal echo for command context, but route program logs to Console tab.
        out.textContent += line + "\n";
        out.scrollTop = out.scrollHeight;
        if (infoLog) {
          infoLog.textContent += line + "\n";
          infoLog.scrollTop = infoLog.scrollHeight;
        }
        document.dispatchEvent(new CustomEvent("newui:console-pane-update", {
          detail: {
            pane: "info",
            source: "powershell-console",
            text: String(line || ""),
          },
        }));
      }

      function setBusy(busy) {
        input.disabled = busy;
      }

      function runCommand() {
        var cmd = String(input.value || "").trim();
        if (!cmd) return;

        append("[" + nowStamp() + "] PS> " + cmd);
        input.value = "";

        var invoke = getInvoke();
        if (!invoke) {
          append("[" + nowStamp() + "] " + t("psConsoleDesktopOnly"));
          if (typeof setStatusLine === "function") setStatusLine(t("psConsoleDesktopOnly"));
          return;
        }

        setBusy(true);
        if (typeof setStatusLine === "function") setStatusLine(t("psConsoleRunning"));

        runPowerShell(cmd).then(function (res) {
          var stdout = (res && res.stdout) ? String(res.stdout) : "";
          var stderr = (res && res.stderr) ? String(res.stderr) : "";
          var exitCode = (res && typeof res.exit_code === "number") ? res.exit_code : -1;

          if (stdout.trim()) append(stdout.trimEnd());
          if (stderr.trim()) append(stderr.trimEnd());
          append("[" + nowStamp() + "] exit code: " + exitCode);
          if (typeof setStatusLine === "function") setStatusLine(t("psConsoleReady"));
        }).catch(function (err) {
          append("[" + nowStamp() + "] " + t("psConsoleExecFailed") + " " + (err && err.message ? err.message : String(err)));
          if (typeof setStatusLine === "function") setStatusLine(t("psConsoleExecFailed"));
        }).finally(function () {
          setBusy(false);
          input.focus();
        });
      }

      input.addEventListener("keydown", function (event) {
        var isSelectAll = (event.ctrlKey || event.metaKey) && String(event.key || "").toLowerCase() === "a";
        if (isSelectAll) {
          event.preventDefault();
          selectAllOutput();
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          runCommand();
        }
      });

      out.addEventListener("keydown", function (event) {
        var isSelectAll = (event.ctrlKey || event.metaKey) && String(event.key || "").toLowerCase() === "a";
        if (!isSelectAll) return;
        event.preventDefault();
        selectAllOutput();
      });

      function applyStaticTranslations() {
        input.setAttribute("placeholder", t("psConsolePlaceholder"));
      }

      applyStaticTranslations();
      append("[" + nowStamp() + "] " + t("psConsoleReady"));
      input.focus();

      return {
        applyStaticTranslations: applyStaticTranslations,
      };
    }

    return {
      init: init,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createPowerShellConsoleRuntime = createPowerShellConsoleRuntime;
})();
