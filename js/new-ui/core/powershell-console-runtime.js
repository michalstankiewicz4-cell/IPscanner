(function () {
  // Command history (Up/Down arrow navigation in the Terminal's input) -
  // localStorage-only otherwise, bundled into the session file too via
  // getStateForSession()/restoreFromSession() below, same treatment
  // session-runtime.js already gives domain/mail verification and the
  // Memory notepad. Lives at this outer scope (not inside init() below) so
  // window.NetReconNewUICore.terminalHistory works even if init() hasn't
  // run yet (e.g. a session is loaded before the Terminal tab's DOM exists).
  var HISTORY_STORAGE_KEY = "netrecon_terminal_history_v1";
  var HISTORY_MAX_ENTRIES = 200;

  function loadHistoryEntries() {
    try {
      var raw = window.localStorage ? window.localStorage.getItem(HISTORY_STORAGE_KEY) : "";
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(function (c) { return String(c || ""); }).filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  }

  function saveHistoryEntries(entries) {
    try {
      if (window.localStorage) window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
    } catch (_) {
      // ignore persistence failures
    }
  }

  var terminalHistoryEntries = loadHistoryEntries();

  function pushHistoryEntry(cmd) {
    // Skip immediate repeats, same convention as a real shell - pressing
    // Up right after running the same command twice in a row shouldn't
    // need two presses to get past the duplicate.
    if (terminalHistoryEntries.length && terminalHistoryEntries[terminalHistoryEntries.length - 1] === cmd) return;
    terminalHistoryEntries.push(cmd);
    if (terminalHistoryEntries.length > HISTORY_MAX_ENTRIES) {
      terminalHistoryEntries.splice(0, terminalHistoryEntries.length - HISTORY_MAX_ENTRIES);
    }
    saveHistoryEntries(terminalHistoryEntries);
  }

  function getHistoryStateForSession() {
    return { entries: terminalHistoryEntries.slice() };
  }

  function restoreHistoryFromSession(data) {
    var entries = data && Array.isArray(data.entries)
      ? data.entries.map(function (c) { return String(c || ""); }).filter(Boolean)
      : [];
    terminalHistoryEntries = entries.slice(-HISTORY_MAX_ENTRIES);
    saveHistoryEntries(terminalHistoryEntries);
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.terminalHistory = {
    getStateForSession: getHistoryStateForSession,
    restoreFromSession: restoreHistoryFromSession,
  };

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

    function invokeCommand(name, payload) {
      if (platform && typeof platform.invoke === "function") {
        return platform.invoke(name, payload);
      }
      var invoke = getInvoke();
      if (!invoke) return Promise.reject(new Error("tauri invoke unavailable"));
      return invoke(name, payload);
    }

    function emitBusyDelta(delta) {
      try {
        document.dispatchEvent(new CustomEvent("newui:busy-state", {
          detail: {
            source: "powershell-console-runtime",
            delta: delta,
          },
        }));
      } catch (_) {
        // ignore busy-state event errors
      }
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
      var input = document.getElementById("v1PsInput");
      var quickCommandsEl = document.getElementById("v1PsQuickCommands");
      if (!out || !input) return;

      // pid of the console command currently running (spawned via
      // start_console_command), null when idle - lets a stray/late event
      // from an already-finished run be told apart from the live one, and
      // is what Ctrl+C below sends to cancel_console_command.
      var currentPid = null;

      // Up/Down history navigation state - historyIndex null means "typing
      // live, not currently browsing history"; historyDraft holds whatever
      // was typed before the first Up press, restored once Down runs past
      // the newest entry again (same feel as a real shell).
      var historyIndex = null;
      var historyDraft = "";

      function moveCaretToEnd() {
        var len = input.value.length;
        if (typeof input.setSelectionRange === "function") input.setSelectionRange(len, len);
      }

      function navigateHistoryUp() {
        if (!terminalHistoryEntries.length) return;
        if (historyIndex === null) {
          historyDraft = input.value;
          historyIndex = terminalHistoryEntries.length - 1;
        } else if (historyIndex > 0) {
          historyIndex -= 1;
        }
        input.value = terminalHistoryEntries[historyIndex];
        moveCaretToEnd();
      }

      function navigateHistoryDown() {
        if (historyIndex === null) return;
        if (historyIndex < terminalHistoryEntries.length - 1) {
          historyIndex += 1;
          input.value = terminalHistoryEntries[historyIndex];
        } else {
          historyIndex = null;
          input.value = historyDraft;
        }
        moveCaretToEnd();
      }

      function selectAllOutput() {
        var sel = window.getSelection ? window.getSelection() : null;
        if (!sel) return;
        var range = document.createRange();
        range.selectNodeContents(out);
        sel.removeAllRanges();
        sel.addRange(range);
        out.focus();
      }

      function hasActiveSelection() {
        var sel = window.getSelection ? window.getSelection() : null;
        return !!sel && String(sel.toString() || "").length > 0;
      }

      function append(line) {
        out.textContent += line + "\n";
        out.scrollTop = out.scrollHeight;
        document.dispatchEvent(new CustomEvent("newui:console-pane-update", {
          detail: {
            pane: "console",
            source: "powershell-console",
            text: String(line || ""),
          },
        }));
      }

      function setBusy(busy) {
        input.disabled = busy;
        if (quickCommandsEl) {
          Array.from(quickCommandsEl.querySelectorAll("button")).forEach(function (btn) {
            btn.disabled = busy;
          });
        }
      }

      function runCommand() {
        if (currentPid !== null) return; // a command is already running

        var cmd = String(input.value || "").trim();
        if (!cmd) return;

        pushHistoryEntry(cmd);
        historyIndex = null;
        historyDraft = "";

        append("[" + nowStamp() + "] PS> " + cmd);
        input.value = "";

        if (!getInvoke()) {
          append("[" + nowStamp() + "] " + t("psConsoleDesktopOnly"));
          if (typeof setStatusLine === "function") setStatusLine(t("psConsoleDesktopOnly"));
          return;
        }

        setBusy(true);
        emitBusyDelta(1);
        if (typeof setStatusLine === "function") setStatusLine(t("psConsoleRunning"));
        out.focus(); // so a Ctrl+C right after starting reaches this pane, not a disabled input

        Promise.resolve(invokeCommand("start_console_command", { command: cmd }))
          .then(function (pid) {
            currentPid = pid;
          })
          .catch(function (err) {
            append("[" + nowStamp() + "] " + t("psConsoleExecFailed") + " " + (err && err.message ? err.message : String(err)));
            if (typeof setStatusLine === "function") setStatusLine(t("psConsoleExecFailed"));
            setBusy(false);
            emitBusyDelta(-1);
            input.focus();
          });
      }

      function runQuickCommand(cmd) {
        if (input.disabled) return;
        input.value = cmd;
        runCommand();
      }

      function typeQuickCommand(cmd) {
        if (input.disabled) return;
        input.value = cmd + " ";
        input.focus();
        var len = input.value.length;
        if (typeof input.setSelectionRange === "function") input.setSelectionRange(len, len);
      }

      function renderQuickCommands(toolId) {
        if (!quickCommandsEl) return;
        var catalog = (window.NetReconNewUICore && window.NetReconNewUICore.toolCatalog) || {};
        var entry = catalog[toolId] || {};
        var commands = Array.isArray(entry.quickTerminalCommands) ? entry.quickTerminalCommands : [];

        quickCommandsEl.innerHTML = "";
        if (!commands.length) {
          quickCommandsEl.hidden = true;
          return;
        }

        commands.forEach(function (cmd) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "v1-ps-quick-cmd-btn";
          btn.textContent = cmd;
          btn.title = t("psConsoleQuickCmdHint").split("{cmd}").join(cmd);
          btn.disabled = input.disabled;
          btn.addEventListener("click", function () { runQuickCommand(cmd); });
          btn.addEventListener("contextmenu", function (event) {
            event.preventDefault();
            typeQuickCommand(cmd);
          });
          quickCommandsEl.appendChild(btn);
        });
        quickCommandsEl.hidden = false;
      }

      function cancelCurrentCommand() {
        if (currentPid === null) return;
        var pid = currentPid;
        append("[" + nowStamp() + "] ^C");
        Promise.resolve(invokeCommand("cancel_console_command", { pid: pid })).catch(function () {
          // ignore - if the process already finished on its own, there's
          // nothing left to cancel, and console-command-done still fires
        });
      }

      // Ctrl+C only reaches handleInterruptKeydown below while the OUTPUT
      // pane itself has focus (by design - that's what stops a stray Ctrl+C
      // elsewhere in the app from killing a background command). But while
      // a command is running, the INPUT is disabled and so can't take focus
      // on its own click - so clicking the (visually still there) command
      // row, or clicking into the Terminal tab itself, should count as
      // "focus the terminal" too, landing on the output pane instead of the
      // disabled input. No-op when nothing is running - a normal click just
      // focuses the (enabled) input the usual way.
      function focusOutputIfBusy() {
        if (currentPid !== null) out.focus();
      }

      var inputRow = input.closest(".v1-ps-input-row");
      if (inputRow) {
        inputRow.addEventListener("click", focusOutputIfBusy);
      }

      window.NetReconNewUICore.powerShellConsole = { focusOutputIfBusy: focusOutputIfBusy };

      function handleInterruptKeydown(event) {
        var isCtrlC = (event.ctrlKey || event.metaKey) && String(event.key || "").toLowerCase() === "c";
        if (!isCtrlC) return;
        if (currentPid === null) return;
        // A real selection means the user is trying to copy, not interrupt -
        // same convention most terminal apps use for this exact key combo.
        if (hasActiveSelection()) return;
        event.preventDefault();
        cancelCurrentCommand();
      }

      Promise.resolve(platform.listen ? platform.listen("console-command-output", function (payload) {
        if (!payload || payload.pid !== currentPid) return;
        append(String(payload.line || ""));
      }) : null).catch(function () {});

      Promise.resolve(platform.listen ? platform.listen("console-command-done", function (payload) {
        if (!payload || payload.pid !== currentPid) return;
        append("[" + nowStamp() + "] exit code: " + payload.exit_code);
        if (typeof setStatusLine === "function") setStatusLine(t("psConsoleReady"));
        currentPid = null;
        setBusy(false);
        emitBusyDelta(-1);
        input.focus();
      }) : null).catch(function () {});

      input.addEventListener("keydown", function (event) {
        var isSelectAll = (event.ctrlKey || event.metaKey) && String(event.key || "").toLowerCase() === "a";
        if (isSelectAll) {
          event.preventDefault();
          selectAllOutput();
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          navigateHistoryUp();
          return;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          navigateHistoryDown();
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          runCommand();
        }
      });

      out.addEventListener("keydown", function (event) {
        handleInterruptKeydown(event);
        if (event.defaultPrevented) return;

        var isSelectAll = (event.ctrlKey || event.metaKey) && String(event.key || "").toLowerCase() === "a";
        if (!isSelectAll) return;
        event.preventDefault();
        selectAllOutput();
      });

      function currentLeftTool() {
        var tabRegistry = window.NetReconNewUICore && window.NetReconNewUICore.tabRegistry;
        return tabRegistry && tabRegistry.getActiveTab ? tabRegistry.getActiveTab("left") : "";
      }

      document.addEventListener("newui:left-tool-changed", function (event) {
        renderQuickCommands(event && event.detail ? event.detail.tool : "");
      });

      function applyStaticTranslations() {
        input.setAttribute("placeholder", t("psConsolePlaceholder"));
        if (quickCommandsEl && !quickCommandsEl.hidden) {
          renderQuickCommands(currentLeftTool());
        }
      }

      applyStaticTranslations();
      append("[" + nowStamp() + "] " + t("psConsoleReady"));
      input.focus();

      renderQuickCommands(currentLeftTool());

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
