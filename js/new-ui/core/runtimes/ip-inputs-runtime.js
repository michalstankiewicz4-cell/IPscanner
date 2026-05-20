(function () {
  function createIpInputsRuntime() {
    var sharedNet = window.NetReconNewUICore && window.NetReconNewUICore.utils
      ? window.NetReconNewUICore.utils.net
      : null;

    function isValidIpv4(value) {
      if (sharedNet && typeof sharedNet.isValidIpv4 === "function") {
        return sharedNet.isValidIpv4(value);
      }
      var parts = String(value || "").trim().split(".");
      if (parts.length !== 4) return false;
      return parts.every(function (part) {
        return /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255;
      });
    }

    function setRangeInputs(fromIp, toIp) {
      if (!isValidIpv4(fromIp) || !isValidIpv4(toIp)) return false;
      var fromHidden = document.getElementById("v1ScanFrom");
      var toHidden = document.getElementById("v1ScanTo");
      if (fromHidden) fromHidden.value = fromIp;
      if (toHidden) toHidden.value = toIp;

      document.querySelectorAll("[data-ip-box]").forEach(function (box) {
        var type = box.getAttribute("data-ip-box");
        var value = type === "from" ? fromIp : toIp;
        var octets = Array.from(box.querySelectorAll(".v1-octet"));
        value.split(".").forEach(function (part, idx) {
          if (octets[idx]) octets[idx].value = part;
        });
      });
      return true;
    }

    function initSegmentedIpInputs() {
      document.querySelectorAll("[data-ip-box]").forEach(function (box) {
        var type = box.getAttribute("data-ip-box");
        var hiddenId = type === "from" ? "v1ScanFrom" : "v1ScanTo";
        var hidden = document.getElementById(hiddenId);
        var octets = Array.from(box.querySelectorAll(".v1-octet"));
        if (!hidden || octets.length !== 4) return;

        function fillFromHidden() {
          var parts = String(hidden.value || "0.0.0.0").split(".");
          for (var i = 0; i < 4; i += 1) {
            var part = parts[i] || "0";
            octets[i].value = part.replace(/\D+/g, "").slice(0, 3);
          }
        }

        function syncHidden() {
          var parts = octets.map(function (input) {
            var raw = String(input.value || "").replace(/\D+/g, "").slice(0, 3);
            if (!raw) return "0";
            var n = Math.max(0, Math.min(255, Number(raw)));
            return String(n);
          });
          hidden.value = parts.join(".");
        }

        octets.forEach(function (input, index) {
          input.addEventListener("input", function () {
            input.value = String(input.value || "").replace(/\D+/g, "").slice(0, 3);
            if (input.value.length === 3 && index < octets.length - 1) {
              octets[index + 1].focus();
              octets[index + 1].select();
            }
            syncHidden();
          });

          input.addEventListener("blur", function () {
            var raw = String(input.value || "").replace(/\D+/g, "").slice(0, 3);
            if (!raw) {
              input.value = "0";
            } else {
              input.value = String(Math.max(0, Math.min(255, Number(raw))));
            }
            syncHidden();
          });

          input.addEventListener("keydown", function (event) {
            if (event.key === "Backspace" && !input.value && index > 0) {
              octets[index - 1].focus();
              octets[index - 1].select();
            }
          });
        });

        fillFromHidden();
        syncHidden();
      });
    }

    function init() {
      return {
        setRangeInputs: setRangeInputs,
        initSegmentedIpInputs: initSegmentedIpInputs,
      };
    }

    return {
      init: init,
      setRangeInputs: setRangeInputs,
      initSegmentedIpInputs: initSegmentedIpInputs,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createIpInputsRuntime = createIpInputsRuntime;
})();
