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

    // CIDR mode's single point of truth: on success this also drives
    // #v1ScanFrom/#v1ScanTo via setRangeInputs, so Start/Range History/
    // scan_range (which only ever read those two hidden inputs) work
    // unchanged regardless of which mode (Range vs CIDR) is active.
    function applyCidrValue(cidrStr) {
      var range = sharedNet && typeof sharedNet.cidrToRange === "function"
        ? sharedNet.cidrToRange(cidrStr)
        : null;
      var cidrInput = document.getElementById("v1ScanCidr");

      if (!range) {
        if (cidrInput) cidrInput.classList.add("is-invalid");
        return false;
      }

      if (cidrInput) {
        cidrInput.value = String(cidrStr || "").trim();
        cidrInput.classList.remove("is-invalid");
      }
      return setRangeInputs(range.from, range.to);
    }

    // shell: the browser's native "remembered field values" dropdown (driven
    // by the octet inputs' `name` attribute below) renders outside the page's
    // DOM, so the app's CSS-based "Blur IP addresses" privacy toggle
    // (body.v1-blur-ip) can't touch it - a screen-share could still leak past
    // octets through that dropdown even while blur is on. Toggling
    // `autocomplete` off/on to match keeps the two features honest together.
    function applyOctetAutocompleteForBlurState() {
      var blurred = document.body.classList.contains("v1-blur-ip");
      document.querySelectorAll("[data-ip-box] .v1-octet").forEach(function (input) {
        input.setAttribute("autocomplete", blurred ? "off" : "on");
      });
      var cidrInput = document.getElementById("v1ScanCidr");
      if (cidrInput) cidrInput.setAttribute("autocomplete", blurred ? "off" : "on");
    }

    function initRangeModeToggle() {
      var radios = Array.from(document.querySelectorAll('input[name="v1RangeMode"]'));
      if (!radios.length) return;

      function applyMode(mode) {
        document.querySelectorAll("[data-range-mode-panel]").forEach(function (panel) {
          panel.hidden = panel.getAttribute("data-range-mode-panel") !== mode;
        });
        if (mode === "cidr") {
          var cidrInput = document.getElementById("v1ScanCidr");
          if (cidrInput) applyCidrValue(cidrInput.value);
        }
      }

      radios.forEach(function (radio) {
        radio.addEventListener("change", function () {
          if (radio.checked) applyMode(radio.value);
        });
      });

      var checked = radios.find(function (radio) { return radio.checked; });
      applyMode(checked ? checked.value : "range");
    }

    function initCidrInput() {
      var cidrInput = document.getElementById("v1ScanCidr");
      if (!cidrInput) return;

      cidrInput.addEventListener("input", function () {
        applyCidrValue(cidrInput.value);
      });
      cidrInput.addEventListener("blur", function () {
        applyCidrValue(cidrInput.value);
      });
    }

    function initSegmentedIpInputs() {
      applyOctetAutocompleteForBlurState();
      window.addEventListener("newui:blur-ip-changed", applyOctetAutocompleteForBlurState);
      initRangeModeToggle();
      initCidrInput();

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
        applyCidrValue: applyCidrValue,
        initSegmentedIpInputs: initSegmentedIpInputs,
      };
    }

    return {
      init: init,
      setRangeInputs: setRangeInputs,
      applyCidrValue: applyCidrValue,
      initSegmentedIpInputs: initSegmentedIpInputs,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createIpInputsRuntime = createIpInputsRuntime;
})();
