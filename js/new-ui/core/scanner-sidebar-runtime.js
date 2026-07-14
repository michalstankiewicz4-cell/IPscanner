(function () {
  function createScannerSidebarRuntime(deps) {
    var tr = deps.tr;
    var setStatusLine = deps.setStatusLine;
    var setRangeInputs = deps.setRangeInputs;
    var applyCidrValue = deps.applyCidrValue;

    var RANGE_HISTORY_KEY = "netrecon_range_history";
    var presetsListenerBound = false;
    var portPresetListenerBound = false;

    function t(key) {
      return typeof tr === "function" ? tr(key) : key;
    }

    var sharedNet = window.NetReconNewUICore && window.NetReconNewUICore.utils
      ? window.NetReconNewUICore.utils.net
      : null;
    var escapeHtml = window.NetReconNewUICore && window.NetReconNewUICore.utils && window.NetReconNewUICore.utils.dom
      ? window.NetReconNewUICore.utils.dom.escapeHtml
      : function (value) { return String(value == null ? "" : value); };

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
      } catch (err) {
        console.error("[range-history] load failed:", err);
        return [];
      }
    }

    function saveRangeHistory(items) {
      try {
        localStorage.setItem(RANGE_HISTORY_KEY, JSON.stringify((items || []).slice(0, 24)));
      } catch (err) {
        console.error("[range-history] save failed:", err);
        if (typeof setStatusLine === "function") {
          setStatusLine(t("statusRangeHistorySaveFailed") + " (" + (err && err.message ? err.message : err) + ")");
        }
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
      if (!isValidIpv4(fromIp) || !isValidIpv4(toIp)) {
        console.error("[range-history] rejected invalid range:", fromIp, toIp);
        if (typeof setStatusLine === "function") {
          setStatusLine(t("statusRangeHistoryInvalid") + " (" + fromIp + " - " + toIp + ")");
        }
        return;
      }
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
      // Subnets detection already yields a real "a.b.c.d/n" CIDR (any
      // prefix length); External/Local IP detection yields a bare address,
      // which keeps the previous /24-assumption default range. Either way,
      // both modes (Range and CIDR) end up driven through cidrToRange() so
      // the actual detected prefix is respected instead of always being
      // truncated to /24.
      var raw = String(ip || "").trim();
      var cidrStr = raw.indexOf("/") >= 0 ? raw : raw + "/24";

      var cidrModeActive = document.querySelector('[data-range-mode-panel="cidr"]:not([hidden])');
      if (cidrModeActive) {
        if (typeof applyCidrValue === "function" && applyCidrValue(cidrStr)) {
          if (typeof setStatusLine === "function") {
            setStatusLine(t("statusRangeSet") + " " + cidrStr);
          }
          return true;
        }
        return false;
      }

      var range = sharedNet && typeof sharedNet.cidrToRange === "function" ? sharedNet.cidrToRange(cidrStr) : null;
      if (!range) return false;
      if (typeof setRangeInputs === "function" && setRangeInputs(range.from, range.to)) {
        if (typeof setStatusLine === "function") {
          setStatusLine(t("statusRangeSet") + " " + range.from + " - " + range.to);
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

    // Scanner sidebar "Profiles" - named/colored labels the user can create
    // and delete, on top of the app's usual localStorage-list pattern (same
    // shape as Range History above). Not wired to any real scan-settings
    // save/restore yet - just the add/list/delete UI for now. The first
    // "Default" entry is synthesized (not stored) until a real profile gets
    // added, and can never be deleted (no delete button rendered for it,
    // plus a defensive check in the click handler).
    var PROFILES_KEY = "netrecon_scanner_profiles_v1";
    var DEFAULT_PROFILE = { id: "default", name: "Default", color: "#f2c94c", locked: true };

    function isValidHexColor(value) {
      return /^#[0-9a-fA-F]{3,8}$/.test(String(value || ""));
    }

    function loadProfiles() {
      try {
        var raw = localStorage.getItem(PROFILES_KEY);
        var parsed = raw ? JSON.parse(raw) : null;
        if (!Array.isArray(parsed) || !parsed.length) return [Object.assign({}, DEFAULT_PROFILE)];

        var sanitized = parsed.filter(function (item) {
          return item && typeof item.name === "string" && isValidHexColor(item.color);
        });
        var hasDefault = sanitized.some(function (item) { return item.id === "default"; });
        if (!hasDefault) sanitized.unshift(Object.assign({}, DEFAULT_PROFILE));
        return sanitized;
      } catch (err) {
        console.error("[profiles] load failed:", err);
        return [Object.assign({}, DEFAULT_PROFILE)];
      }
    }

    function saveProfiles(items) {
      try {
        localStorage.setItem(PROFILES_KEY, JSON.stringify((items || []).slice(0, 48)));
      } catch (err) {
        console.error("[profiles] save failed:", err);
      }
    }

    function renderProfiles() {
      var root = document.getElementById("v1ProfilesList");
      if (!root) return;
      var items = loadProfiles();

      root.innerHTML = items.map(function (item, idx) {
        var name = escapeHtml(item.locked ? t("scannerProfileDefaultName") : item.name);
        var color = isValidHexColor(item.color) ? item.color : "#4aa3ff";
        var deleteBtn = item.locked
          ? ""
          : "<button type=\"button\" class=\"v1-profile-delete-btn\" data-profile-index=\"" + idx + "\" title=\"" + escapeHtml(t("scannerProfileDeleteAria")) + "\" aria-label=\"" + escapeHtml(t("scannerProfileDeleteAria")) + "\">x</button>";
        return "<div class=\"v1-profile-item\">"
          + "<span class=\"v1-profile-swatch\" style=\"background:" + color + "\"></span>"
          + "<span class=\"v1-profile-name\" title=\"" + name + "\">" + name + "</span>"
          + deleteBtn
          + "</div>";
      }).join("");
    }

    function addProfile(name, color) {
      var trimmedName = String(name || "").trim();
      if (!trimmedName) {
        if (typeof setStatusLine === "function") setStatusLine(t("statusProfileNameRequired"));
        return false;
      }
      var safeColor = isValidHexColor(color) ? color : "#4aa3ff";
      var items = loadProfiles();
      items.push({
        id: "p" + Date.now().toString(36) + Math.floor(Math.random() * 1000),
        name: trimmedName,
        color: safeColor,
      });
      saveProfiles(items);
      renderProfiles();
      if (typeof setStatusLine === "function") setStatusLine(t("statusProfileAdded") + " " + trimmedName);
      return true;
    }

    function initProfilesUi() {
      var listRoot = document.getElementById("v1ProfilesList");
      var addBtn = document.getElementById("v1ProfileAddBtn");
      var nameInput = document.getElementById("v1ProfileNameInput");
      var colorInput = document.getElementById("v1ProfileColorInput");
      if (!listRoot || !addBtn || !nameInput || !colorInput) return;

      addBtn.addEventListener("click", function () {
        if (addProfile(nameInput.value, colorInput.value)) {
          nameInput.value = "";
          nameInput.focus();
        }
      });

      nameInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          addBtn.click();
        }
      });

      listRoot.addEventListener("click", function (event) {
        var btn = event.target.closest("[data-profile-index]");
        if (!btn) return;
        var idx = Number(btn.getAttribute("data-profile-index"));
        var items = loadProfiles();
        var item = items[idx];
        if (!item || item.locked) return;

        items.splice(idx, 1);
        saveProfiles(items);
        renderProfiles();
        if (typeof setStatusLine === "function") setStatusLine(t("statusProfileDeleted"));
      });

      renderProfiles();
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

    // Ports vs ICMP is a deliberate, user-chosen scan type - not a silent
    // pre-filter before port scanning (which would risk skipping hosts that
    // block ping but still have open ports). ICMP itself isn't implemented
    // yet (needs raw sockets / admin rights in the Rust backend); Start
    // just reports that honestly instead of pretending to scan.
    function initScanModeToggle() {
      var radios = Array.from(document.querySelectorAll('input[name="v1ScanMode"]'));
      if (!radios.length) return;

      function applyMode(mode) {
        document.querySelectorAll("[data-scan-mode-panel]").forEach(function (panel) {
          panel.hidden = panel.getAttribute("data-scan-mode-panel") !== mode;
        });
      }

      radios.forEach(function (radio) {
        radio.addEventListener("change", function () {
          if (radio.checked) applyMode(radio.value);
        });
      });

      var checked = radios.find(function (radio) { return radio.checked; });
      applyMode(checked ? checked.value : "ports");
    }

    // RS "Config" tab's Performance section - the real timeout/concurrency
    // settings, migrated here from the old Options -> Default Scan Values
    // tool (now removed). Shares the same netrecon_scan_defaults_v1
    // localStorage key readScanDefaults() (navigation-runtime.js) already
    // reads at scan-start, so no changes were needed there - only where
    // these two values are edited moved.
    function initConfigPerformanceInputs() {
      var DEFAULTS_KEY = "netrecon_scan_defaults_v1";
      var RECOMMENDED_DEFAULTS = { timeoutMs: 1000, concurrency: 128 };

      function sanitize(value) {
        var next = Object.assign({}, RECOMMENDED_DEFAULTS, value || {});
        var timeout = Number(next.timeoutMs);
        var concurrency = Number(next.concurrency);

        if (!Number.isFinite(timeout)) timeout = RECOMMENDED_DEFAULTS.timeoutMs;
        if (!Number.isFinite(concurrency)) concurrency = RECOMMENDED_DEFAULTS.concurrency;

        timeout = Math.max(200, Math.min(5000, Math.round(timeout)));
        concurrency = Math.max(1, Math.min(256, Math.round(concurrency)));

        return { timeoutMs: timeout, concurrency: concurrency };
      }

      function readSaved() {
        try {
          var raw = window.localStorage ? window.localStorage.getItem(DEFAULTS_KEY) : "";
          if (!raw) return Object.assign({}, RECOMMENDED_DEFAULTS);
          var parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object") return Object.assign({}, RECOMMENDED_DEFAULTS);
          return sanitize(parsed);
        } catch (_) {
          return Object.assign({}, RECOMMENDED_DEFAULTS);
        }
      }

      function writeSaved(next) {
        var safe = sanitize(next);
        try {
          if (window.localStorage) window.localStorage.setItem(DEFAULTS_KEY, JSON.stringify(safe));
        } catch (_) {}
        return safe;
      }

      var timeoutInput = document.getElementById("v1ConfigHostTimeout");
      var concurrencyInput = document.getElementById("v1ConfigMaxConcurrentHosts");
      if (!timeoutInput || !concurrencyInput) return;

      var saved = readSaved();
      timeoutInput.value = String(saved.timeoutMs);
      concurrencyInput.value = String(saved.concurrency);

      function persist() {
        var next = writeSaved({
          timeoutMs: Number(timeoutInput.value),
          concurrency: Number(concurrencyInput.value),
        });
        timeoutInput.value = String(next.timeoutMs);
        concurrencyInput.value = String(next.concurrency);
      }

      timeoutInput.addEventListener("change", persist);
      concurrencyInput.addEventListener("change", persist);
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

    function getPresetState() {
      try {
        var core = window.NetReconNewUICore || {};
        var api = core.presets;
        if (api && typeof api.getState === "function") {
          return api.getState();
        }
      } catch (_) {
        // ignore presets provider errors
      }

      return {
        defaultPresetId: "",
        presets: []
      };
    }

    function renderPortPresetOptions() {
      var portPreset = document.getElementById("v1PortPreset");
      if (!portPreset) return;

      var state = getPresetState();
      var presets = Array.isArray(state.presets) ? state.presets : [];
      if (!presets.length) return;

      var currentValue = String(portPreset.value || "");
      while (portPreset.firstChild) {
        portPreset.removeChild(portPreset.firstChild);
      }

      presets.forEach(function (item) {
        var option = document.createElement("option");
        var emoji = String((item && item.emoji) || "").trim();
        var name = String((item && item.name) || item.id || "").trim();
        var label = emoji ? (emoji + " " + name) : name;
        option.value = String(item.id || "");
        option.textContent = label;
        portPreset.appendChild(option);
      });

      var hasCurrentValue = presets.some(function (item) {
        return String(item.id) === currentValue;
      });
      var shouldPreserveCurrent = portPreset.dataset.userSelected === "1";
      var selectedValue = (shouldPreserveCurrent && hasCurrentValue)
        ? currentValue
        : String(state.defaultPresetId || presets[0].id || "");
      portPreset.value = selectedValue;
      syncSelectedPortsValue();
    }

    function getSelectedPreset() {
      var state = getPresetState();
      var presets = Array.isArray(state.presets) ? state.presets : [];
      if (!presets.length) {
        return { id: "", emoji: "", name: "", ports: "" };
      }

      var portPreset = document.getElementById("v1PortPreset");
      var selectedId = portPreset
        ? String(portPreset.value || "").trim()
        : String(state.defaultPresetId || "").trim();

      var selected = presets.find(function (item) {
        return String((item && item.id) || "") === selectedId;
      });
      if (!selected) {
        selected = presets.find(function (item) {
          return String((item && item.id) || "") === String(state.defaultPresetId || "").trim();
        }) || presets[0];
      }

      return {
        id: String((selected && selected.id) || "").trim(),
        emoji: String((selected && selected.emoji) || "").trim(),
        name: String((selected && selected.name) || (selected && selected.id) || "").trim(),
        ports: String((selected && selected.ports) || "").trim(),
      };
    }

    function syncSelectedPortsValue() {
      var hiddenPorts = document.getElementById("v1ScanPorts");
      if (!hiddenPorts) return;
      var selected = getSelectedPreset();
      hiddenPorts.value = selected.ports || "";
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
      var rangeModeRangeLabel = document.getElementById("v1RangeModeRangeLabel");
      var rangeModeCidrLabel = document.getElementById("v1RangeModeCidrLabel");
      var fromLabel = document.getElementById("v1IpLabelFrom");
      var toLabel = document.getElementById("v1IpLabelTo");
      var cidrLabel = document.getElementById("v1IpLabelCidr");
      var scanModePortsLabel = document.getElementById("v1ScanModePortsLabel");
      var scanModeIcmpLabel = document.getElementById("v1ScanModeIcmpLabel");
      var scanModeIcmpNote = document.getElementById("v1ScanModeIcmpNote");
      var portsLabel = document.getElementById("v1PortsLabel");
      var startBtn = document.querySelector('[data-scanner-action="start"]');
      var stopBtn = document.querySelector('[data-scanner-action="stop"]');
      var clearBtn = document.querySelector('[data-scanner-action="clear"]');
      var presetsBtn = document.querySelector('[data-scanner-action="presets"]');
      var extractorTitle = document.getElementById("v1IpExtractorTitle");
      var extractorInput = document.getElementById("v1IpExtractorInput");
      var extractorBtn = document.getElementById("v1IpExtractBtn");
      var extractorOutput = document.getElementById("v1IpExtractorOutput");
      var historyTitle = document.getElementById("v1RangeHistoryTitle");
      var profilesTitle = document.getElementById("v1ProfilesTitle");
      var profileNameInput = document.getElementById("v1ProfileNameInput");
      var profileColorInput = document.getElementById("v1ProfileColorInput");
      var profileAddBtn = document.getElementById("v1ProfileAddBtn");

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
      if (rangeModeRangeLabel) rangeModeRangeLabel.textContent = t("scannerRangeModeRange");
      if (rangeModeCidrLabel) rangeModeCidrLabel.textContent = t("scannerRangeModeCidr");
      if (fromLabel) fromLabel.textContent = t("scannerFrom");
      if (toLabel) toLabel.textContent = t("scannerTo");
      if (cidrLabel) cidrLabel.textContent = t("scannerRangeModeCidr");
      if (scanModePortsLabel) scanModePortsLabel.textContent = t("scannerModePorts");
      if (scanModeIcmpLabel) scanModeIcmpLabel.textContent = t("scannerModeIcmp");
      if (scanModeIcmpNote) scanModeIcmpNote.textContent = t("scannerModeIcmpNote");
      if (portsLabel) portsLabel.textContent = t("scannerPorts");
      if (startBtn) startBtn.textContent = "▶ " + t("scannerStart");
      if (stopBtn) stopBtn.textContent = "■ " + t("scannerStop");
      if (clearBtn) clearBtn.textContent = "✕ " + t("scannerClear");
      if (presetsBtn) presetsBtn.textContent = "⭐ " + t("scannerPortPresets");
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
      if (presetsBtn) {
        presetsBtn.setAttribute("title", t("scannerTipPortPresets"));
        presetsBtn.setAttribute("aria-label", t("scannerTipPortPresets"));
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
      if (profilesTitle) profilesTitle.textContent = t("scannerProfilesTitle");
      if (profileNameInput) profileNameInput.setAttribute("placeholder", t("scannerProfileNamePlaceholder"));
      if (profileColorInput) profileColorInput.setAttribute("aria-label", t("scannerProfileColorAria"));
      if (profileAddBtn) profileAddBtn.setAttribute("aria-label", t("scannerProfileAddAria"));
      renderProfiles();

      // RS "Config" tab, opened alongside the LS/CS tabs when IP Scanner is
      // clicked - static scaffolding only, not wired to real scan settings
      // yet, so this just handles labels/translations.
      var rightTabConfigBtn = document.getElementById("v1RightTabConfig");
      var configProtocolTitle = document.getElementById("v1ConfigProtocolTitle");
      var configProtocolTcpLabel = document.getElementById("v1ConfigProtocolTcpLabel");
      var configProtocolTcpSynLabel = document.getElementById("v1ConfigProtocolTcpSynLabel");
      var configProtocolUdpLabel = document.getElementById("v1ConfigProtocolUdpLabel");
      var configPerformanceTitle = document.getElementById("v1ConfigPerformanceTitle");
      var configHostTimeoutLabel = document.getElementById("v1ConfigHostTimeoutLabel");
      var configMaxConcurrentHostsLabel = document.getElementById("v1ConfigMaxConcurrentHostsLabel");
      var configMaxConcurrentPortsLabel = document.getElementById("v1ConfigMaxConcurrentPortsLabel");
      var configRetriesLabel = document.getElementById("v1ConfigRetriesLabel");
      var configDetectTitle = document.getElementById("v1ConfigDetectTitle");
      var configDetectServiceProbingHeading = document.getElementById("v1ConfigDetectServiceProbingHeading");
      var configDetectHostEnrichmentHeading = document.getElementById("v1ConfigDetectHostEnrichmentHeading");
      var configReverseDnsLabel = document.getElementById("v1ConfigReverseDnsLabel");
      var configBannerGrabbingLabel = document.getElementById("v1ConfigBannerGrabbingLabel");
      var configOsDetectionLabel = document.getElementById("v1ConfigOsDetectionLabel");
      var configSslCertInfoLabel = document.getElementById("v1ConfigSslCertInfoLabel");
      var configCountryFlagLabel = document.getElementById("v1ConfigCountryFlagLabel");
      var configIspLabel = document.getElementById("v1ConfigIspLabel");
      var configAsLabel = document.getElementById("v1ConfigAsLabel");
      var configDeviceIdentificationLabel = document.getElementById("v1ConfigDeviceIdentificationLabel");
      var configHttpPageTitleLabel = document.getElementById("v1ConfigHttpPageTitleLabel");
      var configAccessSnapshotLabel = document.getElementById("v1ConfigAccessSnapshotLabel");
      var configSecurityTitle = document.getElementById("v1ConfigSecurityTitle");
      var configRandomizePortsLabel = document.getElementById("v1ConfigRandomizePortsLabel");
      var configRandomizeHostsLabel = document.getElementById("v1ConfigRandomizeHostsLabel");
      var configScanDelayLabel = document.getElementById("v1ConfigScanDelayLabel");

      if (rightTabConfigBtn) rightTabConfigBtn.textContent = t("rightTabConfig");
      if (configProtocolTitle) configProtocolTitle.textContent = t("configGroupProtocol");
      if (configProtocolTcpLabel) configProtocolTcpLabel.textContent = t("configProtocolTcp");
      if (configProtocolTcpSynLabel) configProtocolTcpSynLabel.textContent = t("configProtocolTcpSyn");
      if (configProtocolUdpLabel) configProtocolUdpLabel.textContent = t("configProtocolUdp");
      if (configPerformanceTitle) configPerformanceTitle.textContent = t("configGroupPerformance");
      if (configHostTimeoutLabel) configHostTimeoutLabel.textContent = t("configHostTimeout");
      if (configMaxConcurrentHostsLabel) configMaxConcurrentHostsLabel.textContent = t("configMaxConcurrentHosts");
      if (configMaxConcurrentPortsLabel) configMaxConcurrentPortsLabel.textContent = t("configMaxConcurrentPorts");
      if (configRetriesLabel) configRetriesLabel.textContent = t("configRetries");
      if (configDetectTitle) configDetectTitle.textContent = t("configGroupDetect");
      if (configDetectServiceProbingHeading) configDetectServiceProbingHeading.textContent = t("configDetectServiceProbing");
      if (configDetectHostEnrichmentHeading) configDetectHostEnrichmentHeading.textContent = t("configDetectHostEnrichment");
      if (configReverseDnsLabel) configReverseDnsLabel.textContent = t("configReverseDns");
      if (configBannerGrabbingLabel) configBannerGrabbingLabel.textContent = t("configBannerGrabbing");
      if (configOsDetectionLabel) configOsDetectionLabel.textContent = t("configOsDetection");
      if (configSslCertInfoLabel) configSslCertInfoLabel.textContent = t("configSslCertInfo");
      if (configCountryFlagLabel) configCountryFlagLabel.textContent = t("resultsIpColumnCountryFlag");
      if (configIspLabel) configIspLabel.textContent = t("resultsIpColumnIsp");
      if (configAsLabel) configAsLabel.textContent = t("resultsIpColumnAs");
      if (configDeviceIdentificationLabel) configDeviceIdentificationLabel.textContent = t("resultsIpColumnDeviceIdentification");
      if (configHttpPageTitleLabel) configHttpPageTitleLabel.textContent = t("resultsIpColumnHttpPageTitle");
      if (configAccessSnapshotLabel) configAccessSnapshotLabel.textContent = t("resultsIpColumnAccessSnapshot");
      if (configSecurityTitle) configSecurityTitle.textContent = t("configGroupSecurity");
      if (configRandomizePortsLabel) configRandomizePortsLabel.textContent = t("configRandomizePorts");
      if (configRandomizeHostsLabel) configRandomizeHostsLabel.textContent = t("configRandomizeHosts");
      if (configScanDelayLabel) configScanDelayLabel.textContent = t("configScanDelay");

      renderPortPresetOptions();

      renderRangeHistory();
    }

    function init() {
      initIpExtractor();
      initRangeHistoryUi();
      initProfilesUi();
      initScanModeToggle();
      initConfigPerformanceInputs();
      var portPreset = document.getElementById("v1PortPreset");
      if (portPreset && !portPresetListenerBound) {
        portPreset.addEventListener("change", function () {
          portPreset.dataset.userSelected = "1";
          syncSelectedPortsValue();
        });
        portPresetListenerBound = true;
      }
      if (!presetsListenerBound) {
        document.addEventListener("newui:presets-changed", function () {
          renderPortPresetOptions();
        });
        presetsListenerBound = true;
      }
      applyStaticTranslations();
    }

    return {
      init: init,
      applyStaticTranslations: applyStaticTranslations,
      addCurrentRangeFromInputs: addCurrentRangeFromInputs,
      applyDetectedRange: applyDetectedRange,
      getSelectedPreset: getSelectedPreset,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createScannerSidebarRuntime = createScannerSidebarRuntime;
})();
