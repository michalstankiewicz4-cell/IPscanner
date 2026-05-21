(function () {
  function createStatusLogRuntime(deps) {
    var maxLines = typeof deps.maxLines === "number" ? deps.maxLines : 400;

    function nowStamp() {
      var d = new Date();
      return d.toLocaleTimeString();
    }

    function append(text) {
      var infoLog = document.getElementById("v1InfoLog");
      var value = String(text || "").trim();
      if (!infoLog || !value) return;

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
