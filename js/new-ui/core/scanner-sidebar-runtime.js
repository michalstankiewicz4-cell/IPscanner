(function () {
  function createScannerSidebarRuntime(deps) {
    var tr = deps.tr;
    var setStatusLine = deps.setStatusLine;
    var setRangeInputs = deps.setRangeInputs;

    var RANGE_HISTORY_KEY = "netrecon_range_history";

    function t(key) {
      return typeof tr === "function" ? tr(key) : key;
    }

    function isValidIpv4(value) {
      var parts = String(value || "").trim().split(".");
      if (parts.length !== 4) return false;
      return parts.every(function (part) {
        return /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255;
      });
    }

    function isLikelyDomain(value) {
      return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(String(value || "").trim());
    }

    function loadRangeHistory() {
      try {
        var raw = localStorage.getItem(RANGE_HISTORY_KEY);
        var parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(function (item) {
          return item && isValidIpv4(item.from) && isValidIpv4(item.to);
        });
      } catch (_) {
        return [];
      }
    }

    function saveRangeHistory(items) {
      try {
        localStorage.setItem(RANGE_HISTORY_KEY, JSON.stringify((items || []).slice(0, 24)));
      } catch (_) {
        // ignore storage errors
      }
    }

    function renderRangeHistory() {
      var root = document.getElementById("v1RangeHistory");
      if (!root) return;
      var items = loadRangeHistory();
      if (!items.length) {
        root.innerHTML = '<div class="v1-range-history-empty">' + t("scannerNoRangeHistory") + "</div>";
        return;
      }

      root.innerHTML = items.map(function (item, idx) {
        var text = item.from + " - " + item.to;
        return '<div class="v1-range-history-item">'
          + '<span class="v1-range-history-text" title="' + text + '">' + text + "</span>"
          + '<span class="v1-range-history-actions">'
          + '<button type="button" class="v1-range-history-btn" data-history-action="use" data-history-index="' + idx + '" title="' + t("scannerHistoryUseAria") + '" aria-label="' + t("scannerHistoryUseAria") + '">&gt;</button>'
          + '<button type="button" class="v1-range-history-btn" data-history-action="delete" data-history-index="' + idx + '" title="' + t("scannerHistoryDeleteAria") + '" aria-label="' + t("scannerHistoryDeleteAria") + '">x</button>'
          + "</span>"
          + "</div>";
      }).join("");
    }

    function addRangeHistory(fromIp, toIp) {
      if (!isValidIpv4(fromIp) || !isValidIpv4(toIp)) return;
      var key = fromIp + "|" + toIp;
      var items = loadRangeHistory().filter(function (item) {
        return (item.from + "|" + item.to) !== key;
      });
      items.unshift({ from: fromIp, to: toIp, updatedAt: Date.now() });
      saveRangeHistory(items);
      renderRangeHistory();
    }

    function addCurrentRangeFromInputs() {
      var from = (document.getElementById("v1ScanFrom") || {}).value || "0.0.0.0";
      var to = (document.getElementById("v1ScanTo") || {}).value || "0.0.0.0";
      addRangeHistory(from, to);
      return { from: from, to: to };
    }

    function applyDetectedRange(ip) {
      var base = String(ip || "").split("/")[0];
      var parts = base.split(".");
      if (parts.length !== 4) return false;
      var prefix = parts.slice(0, 3).join(".");
      var fromIp = prefix + ".0";
      var toIp = prefix + ".255";
      if (typeof setRangeInputs === "function" && setRangeInputs(fromIp, toIp)) {
        addRangeHistory(fromIp, toIp);
        if (typeof setStatusLine === "function") {
          setStatusLine(t("statusRangeSet") + " " + fromIp + " - " + toIp);
        }
        return true;
      }
      return false;
    }

    function initRangeHistoryUi() {
      var root = document.getElementById("v1RangeHistory");
      if (!root) return;

      root.addEventListener("click", function (event) {
        var btn = event.target.closest("[data-history-action]");
        if (!btn) return;
        var action = btn.getAttribute("data-history-action");
        var idx = Number(btn.getAttribute("data-history-index"));
        var items = loadRangeHistory();
        var item = items[idx];
        if (!item) return;

        if (action === "use") {
          if (typeof setRangeInputs === "function" && setRangeInputs(item.from, item.to)) {
            if (typeof setStatusLine === "function") {
              setStatusLine(t("statusRangeRecalled") + " " + item.from + " - " + item.to);
            }
          }
          return;
        }

        if (action === "delete") {
          items.splice(idx, 1);
          saveRangeHistory(items);
          renderRangeHistory();
          if (typeof setStatusLine === "function") {
            setStatusLine(t("statusRangeDeleted"));
          }
        }
      });

      renderRangeHistory();
    }

    function resolveDomainToIp(domain) {
      var endpoint = "https://dns.google/resolve?name=" + encodeURIComponent(domain) + "&type=A";
      return fetch(endpoint, { method: "GET" }).then(function (response) {
        if (!response.ok) return null;
        return response.json();
      }).then(function (data) {
        var answers = Array.isArray(data && data.Answer) ? data.Answer : [];
        var hit = answers.find(function (entry) {
          return entry && entry.type === 1 && isValidIpv4(entry.data);
        });
        return hit ? hit.data : null;
      }).catch(function () {
        return null;
      });
    }

    function initIpExtractor() {
      var input = document.getElementById("v1IpExtractorInput");
      var output = document.getElementById("v1IpExtractorOutput");
      var trigger = document.getElementById("v1IpExtractBtn");
      if (!input || !output || !trigger) return;

      trigger.addEventListener("click", async function () {
        var raw = String(input.value || "").trim();
        if (!raw) {
          if (typeof setStatusLine === "function") setStatusLine(t("statusExtractorNoInput"));
          return;
        }

        var tokens = raw.split(/[\s,;]+/).map(function (x) { return x.trim(); }).filter(Boolean);
        var existing = String(output.value || "").split(/\r?\n/).map(function (x) { return x.trim(); }).filter(isValidIpv4);
        var dedupe = new Set(existing);
        var added = 0;
        var unresolved = 0;

        for (var i = 0; i < tokens.length; i += 1) {
          var token = tokens[i];
          if (isValidIpv4(token)) {
            if (!dedupe.has(token)) {
              dedupe.add(token);
              added += 1;
            }
            continue;
          }

          if (isLikelyDomain(token)) {
            var resolved = await resolveDomainToIp(token);
            if (resolved && !dedupe.has(resolved)) {
              dedupe.add(resolved);
              added += 1;
            } else if (!resolved) {
              unresolved += 1;
            }
          }
        }

        output.value = Array.from(dedupe).join("\n");
        if (typeof setStatusLine === "function") {
          setStatusLine(t("statusExtractorAdded") + " " + added + (unresolved ? ", " + t("statusExtractorUnresolved") + " " + unresolved : ""));
        }
      });
    }

    function applyStaticTranslations() {
      var detectTitle = document.getElementById("v1DetectIpTitle");
      var extLabel = document.getElementById("v1DetectBtnExtLabel");
      var localLabel = document.getElementById("v1DetectBtnLocalLabel");
      var subnetLabel = document.getElementById("v1DetectBtnSubnetsLabel");
      var detectExtBtn = document.querySelector('[data-scanner-action="ext-ip"]');
      var detectLocalBtn = document.querySelector('[data-scanner-action="local-ip"]');
      var detectSubnetsBtn = document.querySelector('[data-scanner-action="subnets"]');
      var useExtBtn = document.getElementById("v1UseExtIp");
      var useLocalBtn = document.getElementById("v1UseLocalIp");
      var useSubnetsBtn = document.getElementById("v1UseSubnets");
      var ipRangeTitle = document.getElementById("v1IpRangeTitle");
      var fromLabel = document.getElementById("v1IpLabelFrom");
      var toLabel = document.getElementById("v1IpLabelTo");
      var portsLabel = document.getElementById("v1PortsLabel");
      var portPreset = document.getElementById("v1PortPreset");
      var startBtn = document.querySelector('[data-scanner-action="start"]');
      var stopBtn = document.querySelector('[data-scanner-action="stop"]');
      var clearBtn = document.querySelector('[data-scanner-action="clear"]');
      var scanSpeedBtn = document.querySelector('[data-scanner-action="scan-speed"]');
      var extractorTitle = document.getElementById("v1IpExtractorTitle");
      var extractorInput = document.getElementById("v1IpExtractorInput");
      var extractorBtn = document.getElementById("v1IpExtractBtn");
      var extractorOutput = document.getElementById("v1IpExtractorOutput");
      var historyTitle = document.getElementById("v1RangeHistoryTitle");

      if (detectTitle) detectTitle.textContent = t("scannerDetectIp");
      if (extLabel) extLabel.textContent = t("scannerExternalIp");
      if (localLabel) localLabel.textContent = t("scannerLocalIp");
      if (subnetLabel) subnetLabel.textContent = t("scannerSubnets");
      if (detectExtBtn) {
        detectExtBtn.setAttribute("title", t("scannerTipDetectExternal"));
        detectExtBtn.setAttribute("aria-label", t("scannerTipDetectExternal"));
      }
      if (detectLocalBtn) {
        detectLocalBtn.setAttribute("title", t("scannerTipDetectLocal"));
        detectLocalBtn.setAttribute("aria-label", t("scannerTipDetectLocal"));
      }
      if (detectSubnetsBtn) {
        detectSubnetsBtn.setAttribute("title", t("scannerTipDetectSubnets"));
        detectSubnetsBtn.setAttribute("aria-label", t("scannerTipDetectSubnets"));
      }
      if (useExtBtn) {
        useExtBtn.setAttribute("title", t("scannerTipUseDetectedRange"));
        useExtBtn.setAttribute("aria-label", t("scannerTipUseDetectedRange"));
      }
      if (useLocalBtn) {
        useLocalBtn.setAttribute("title", t("scannerTipUseDetectedRange"));
        useLocalBtn.setAttribute("aria-label", t("scannerTipUseDetectedRange"));
      }
      if (useSubnetsBtn) {
        useSubnetsBtn.setAttribute("title", t("scannerTipUseDetectedRange"));
        useSubnetsBtn.setAttribute("aria-label", t("scannerTipUseDetectedRange"));
      }
      if (ipRangeTitle) ipRangeTitle.textContent = t("scannerIpRange");
      if (fromLabel) fromLabel.textContent = t("scannerFrom");
      if (toLabel) toLabel.textContent = t("scannerTo");
      if (portsLabel) portsLabel.textContent = t("scannerPorts");
      if (startBtn) startBtn.textContent = "▶ " + t("scannerStart");
      if (stopBtn) stopBtn.textContent = "■ " + t("scannerStop");
      if (clearBtn) clearBtn.textContent = "✕ " + t("scannerClear");
      if (scanSpeedBtn) scanSpeedBtn.textContent = "⏱ " + t("scannerScanSpeed");
      if (startBtn) {
        startBtn.setAttribute("title", t("scannerTipStart"));
        startBtn.setAttribute("aria-label", t("scannerTipStart"));
      }
      if (stopBtn) {
        stopBtn.setAttribute("title", t("scannerTipStop"));
        stopBtn.setAttribute("aria-label", t("scannerTipStop"));
      }
      if (clearBtn) {
        clearBtn.setAttribute("title", t("scannerTipClear"));
        clearBtn.setAttribute("aria-label", t("scannerTipClear"));
      }
      if (scanSpeedBtn) {
        scanSpeedBtn.setAttribute("title", t("scannerTipScanSpeed"));
        scanSpeedBtn.setAttribute("aria-label", t("scannerTipScanSpeed"));
      }
      if (extractorTitle) extractorTitle.textContent = t("scannerIpExtractor");
      if (extractorInput) extractorInput.setAttribute("placeholder", t("scannerExtractorPlaceholder"));
      if (extractorBtn) extractorBtn.textContent = "+ " + t("scannerAddExtract");
      if (extractorBtn) {
        extractorBtn.setAttribute("title", t("scannerTipAddExtract"));
        extractorBtn.setAttribute("aria-label", t("scannerTipAddExtract"));
      }
      if (extractorOutput) extractorOutput.setAttribute("placeholder", t("scannerExtractedPlaceholder"));
      if (historyTitle) historyTitle.textContent = t("scannerRangeHistory");

      if (portPreset) {
        var options = portPreset.querySelectorAll("option");
        if (options[0]) options[0].textContent = t("scannerPresetCommon");
        if (options[1]) options[1].textContent = t("scannerPresetTop20");
        if (options[2]) options[2].textContent = t("scannerPresetWeb");
        if (options[3]) options[3].textContent = t("scannerPresetSmb");
        if (options[4]) options[4].textContent = t("scannerPresetDb");
        if (options[5]) options[5].textContent = t("scannerPresetAll");
        if (options[6]) options[6].textContent = t("scannerPresetCustom");
      }

      renderRangeHistory();
    }

    function init() {
      initIpExtractor();
      initRangeHistoryUi();
      applyStaticTranslations();
    }

    return {
      init: init,
      applyStaticTranslations: applyStaticTranslations,
      addCurrentRangeFromInputs: addCurrentRangeFromInputs,
      applyDetectedRange: applyDetectedRange,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createScannerSidebarRuntime = createScannerSidebarRuntime;
})();
