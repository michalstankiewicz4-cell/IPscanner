(function () {
  function createStatusLogRuntime(deps) {
    var maxLines = typeof deps.maxLines === "number" ? deps.maxLines : 400;

    // Keep transient route/menu chatter out of Info/Terminal logs.
    var suppressedPrefixes = [
      "Tool route:",
      "Trasa narzędzia:",
      "Menu: Versions",
      "Menu: Wersje",
      "Running PowerShell command...",
      "Uruchamianie komendy PowerShell..."
    ];

    function shouldSuppress(value) {
      for (var i = 0; i < suppressedPrefixes.length; i += 1) {
        if (value.indexOf(suppressedPrefixes[i]) === 0) {
          return true;
        }
      }
      return false;
    }

    function nowStamp() {
      var d = new Date();
      return d.toLocaleTimeString();
    }

    function append(text) {
      var infoLog = document.getElementById("v1InfoLog");
      var value = String(text || "").trim();
      if (!infoLog || !value) return;
      if (shouldSuppress(value)) return;

      var line = "[" + nowStamp() + "] " + value;
      var next = (infoLog.textContent ? infoLog.textContent + "\n" : "") + line;
      var rows = next.split("\n");
      infoLog.textContent = rows.length > maxLines ? rows.slice(rows.length - maxLines).join("\n") : next;
      infoLog.scrollTop = infoLog.scrollHeight;

      document.dispatchEvent(new CustomEvent("newui:console-pane-update", {
        detail: {
          pane: "info",
          source: "status-log",
          text: value,
        },
      }));
    }

    return {
      append: append,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createStatusLogRuntime = createStatusLogRuntime;
})();
