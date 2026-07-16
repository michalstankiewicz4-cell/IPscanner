(function () {
  function createIpLibraryRuntime(deps) {
    var tr = deps.tr;
    var setStatusLine = deps.setStatusLine;
    var platform = deps.platform;
    var storageGet = deps.storageGet;
    var storageSet = deps.storageSet;
    var panelRenderersRuntime = deps.panelRenderersRuntime;

    // IP Library raw-shape parsing, used by flattenIpLibraryEntries below
    // (session-runtime.js's collectSessionData) and wireIpLibraryButtons.
    function extractRanges(item) {
      if (!item || typeof item !== "object") return [];

      var direct = String(item.cidr || item.range || item.network || item.address || item.ip_range || "").trim();
      if (direct) return [direct];

      if (Array.isArray(item.ranges) && item.ranges.length) {
        return item.ranges.map(function (entry) {
          if (entry && typeof entry === "object") {
            return String(entry.cidr || entry.range || entry.network || entry.address || entry.ip_range || "").trim();
          }
          return String(entry || "").trim();
        }).filter(Boolean);
      }

      return [];
    }

    function pickCountryFromItem(item) {
      if (!item || typeof item !== "object") return "-";
      return String(
        item.country_code ||
        item.countryCode ||
        item.country ||
        item.code ||
        item.flag ||
        item.name ||
        "-"
      ).toUpperCase();
    }

    function flattenIpLibraryEntries(rawArray) {
      var items = Array.isArray(rawArray) ? rawArray : [];
      var entries = [];
      items.forEach(function (item) {
        var countryCode = pickCountryFromItem(item);
        extractRanges(item).forEach(function (cidr) {
          if (!cidr) return;
          entries.push({ cidr: cidr, countryCode: countryCode });
        });
      });
      return entries;
    }

    // IP Library wiring, incl. PowerShell invocation for
    // update-country-ip-library.ps1.
    function wireIpLibraryButtons(rootEl) {
      var root = rootEl && typeof rootEl.querySelector === "function" ? rootEl : document;

      var countriesEl = root.querySelector("#v1IpLibraryCountryCodes") || root.querySelector(".v1-iplib-countries");
      var topRangesEl = root.querySelector("#v1IpLibraryTopRanges") || root.querySelector(".v1-iplib-topranges");
      var actionButtons = root.querySelectorAll("[data-iplib-action]");

      function getLastUpdateEls() {
        var sidebar = root.querySelector("#v1IpLibraryLastUpdate") || root.querySelector('[data-iplib-role="last-update-sidebar"]');
        var center = root.querySelector("#v1IpLibraryCenterLastUpdate") || root.querySelector('[data-iplib-role="last-update-center"]');
        if (root !== document) {
          if (!sidebar) sidebar = document.getElementById("v1IpLibraryLastUpdate");
          if (!center) center = document.getElementById("v1IpLibraryCenterLastUpdate");
        }
        return {
          sidebar: sidebar,
          center: center,
        };
      }

      function getStatusEls() {
        var sidebar = root.querySelector("#v1IpLibraryStatus") || root.querySelector('[data-iplib-role="status-sidebar"]');
        var center = root.querySelector("#v1IpLibraryCenterStatus") || root.querySelector('[data-iplib-role="status-center"]');
        if (root !== document) {
          if (!sidebar) sidebar = document.getElementById("v1IpLibraryStatus");
          if (!center) center = document.getElementById("v1IpLibraryCenterStatus");
        }
        return {
          sidebar: sidebar,
          center: center,
        };
      }

      function getCenterRowsEl() {
        return root.querySelector("#v1IpLibraryCenterRows") || root.querySelector('[data-iplib-role="rows"]');
      }

      if (!actionButtons.length && !getCenterRowsEl()) return;

      var DEFAULT_CODES = "pl,cn,ru,us,de,fr,gb,jp,kr,br,in,au,nl,ua,cz,se,no,fi,tr,ir,sa,za,ar,mx,ca,it,es";
      var CACHE_KEY = "netrecon_country_ip_library_json";
      var CACHE_UPDATED_KEY = "netrecon_country_ip_library_updated_at";
      var MEMORY_CACHE_KEY = "__netreconIpLibraryCache";

      if (countriesEl && !countriesEl.value.trim()) countriesEl.value = DEFAULT_CODES;
      if (topRangesEl && !topRangesEl.value.trim()) topRangesEl.value = "120";

      function writeStatus(text) {
        var value = String(text || "");
        var statusEls = getStatusEls();
        if (statusEls.sidebar) statusEls.sidebar.textContent = value;
        if (statusEls.center) statusEls.center.textContent = value;
      }

      function nowStamp() {
        var d = new Date();
        return d.toLocaleTimeString();
      }

      function appendTerminalLine(line) {
        var value = String(line || "");
        if (!value) return;

        var out = document.getElementById("v1PsOutput");
        if (out) {
          var next = (out.textContent ? out.textContent + "\n" : "") + value;
          var rows = next.split("\n");
          out.textContent = rows.length > 400 ? rows.slice(rows.length - 400).join("\n") : next;
          out.scrollTop = out.scrollHeight;
        }

        document.dispatchEvent(new CustomEvent("newui:console-pane-update", {
          detail: {
            pane: "console",
            source: "ip-library",
            text: value,
          },
        }));
      }

      function writeOutput(text) {
        var value = String(text || "").trim();
        if (!value) return;

        var clipped = value.length > 12000 ? (value.slice(0, 12000) + "\n...[truncated]") : value;
        appendTerminalLine(clipped);
      }

      function readMemoryCache() {
        try {
          var core = window.NetReconNewUICore = window.NetReconNewUICore || {};
          var payload = core[MEMORY_CACHE_KEY];
          if (!payload || typeof payload !== "object") return null;
          var data = Array.isArray(payload.data) ? payload.data : [];
          var updatedAt = String(payload.updatedAt || "-");
          return { data: data, updatedAt: updatedAt };
        } catch (_) {
          return null;
        }
      }

      function writeMemoryCache(data, updatedAt) {
        try {
          var core = window.NetReconNewUICore = window.NetReconNewUICore || {};
          core[MEMORY_CACHE_KEY] = {
            data: Array.isArray(data) ? data : [],
            updatedAt: String(updatedAt || "-")
          };
        } catch (_) {
          // ignore memory-cache write failures
        }
      }

      function setLastUpdate(value) {
        var text = String(value || "-");
        var lastUpdateEls = getLastUpdateEls();
        if (lastUpdateEls.sidebar) lastUpdateEls.sidebar.textContent = text;
        if (lastUpdateEls.center) lastUpdateEls.center.textContent = text;
      }

      function renderCenterRows(data) {
        var centerRowsEl = getCenterRowsEl();
        if (!centerRowsEl || !panelRenderersRuntime) return;

        var rows = Array.isArray(data) ? data : [];
        centerRowsEl.innerHTML = panelRenderersRuntime.renderIpLibraryRows(rows);
      }

      function getInvoke() {
        if (platform && typeof platform.getInvoke === "function") {
          return platform.getInvoke();
        }
        return null;
      }

      function emitBusyDelta(delta) {
        try {
          document.dispatchEvent(new CustomEvent("newui:busy-state", {
            detail: {
              source: "panels-runtime",
              delta: delta,
            },
          }));
        } catch (_) {
          // ignore busy-state event errors
        }
      }

      function runPowerShell(command) {
        emitBusyDelta(1);

        var promise;
        try {
          if (platform && typeof platform.invoke === "function") {
            promise = platform.invoke("run_powershell", { command: command });
          } else {
            var invoke = getInvoke();
            if (!invoke) {
              promise = Promise.reject(new Error("tauri invoke unavailable"));
            } else {
              promise = invoke("run_powershell", { command: command });
            }
          }
        } catch (err) {
          promise = Promise.reject(err);
        }

        return Promise.resolve(promise).finally(function () {
          emitBusyDelta(-1);
        });
      }

      function parseCountries(text) {
        return String(text || "")
          .split(/[\s,;]+/)
          .map(function (v) { return v.trim().toLowerCase(); })
          .filter(function (v) { return /^[a-z]{2}$/.test(v); });
      }

      function loadCached() {
        var memory = readMemoryCache();
        if (memory && Array.isArray(memory.data) && memory.data.length) {
          var memCount = memory.data.length;
          setLastUpdate(memory.updatedAt || "-");
          writeStatus(tr("ipLibraryStatusLoaded") + " " + memCount + " | " + tr("ipLibraryStatusUpdatedAt") + " " + (memory.updatedAt || "-"));
          renderCenterRows(memory.data);
          return;
        }

        var raw = storageGet(CACHE_KEY) || "";
        var updatedAt = storageGet(CACHE_UPDATED_KEY) || "-";
        setLastUpdate(updatedAt);
        if (!raw) {
          writeStatus(tr("ipLibraryStatusEmpty"));
          renderCenterRows([]);
          return;
        }

        try {
          var data = JSON.parse(raw);
          var normalized = Array.isArray(data) ? data : (data && typeof data === "object" ? [data] : []);
          var count = normalized.length;
          writeMemoryCache(normalized, updatedAt);
          writeStatus(tr("ipLibraryStatusLoaded") + " " + count + " | " + tr("ipLibraryStatusUpdatedAt") + " " + updatedAt);
          renderCenterRows(normalized);
        } catch (_) {
          writeStatus(tr("ipLibraryStatusInvalidCache"));
          renderCenterRows([]);
        }
      }

      actionButtons.forEach(function (button) {
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";

        button.addEventListener("click", function () {
          var actionName = button.getAttribute("data-iplib-action");
          if (actionName === "load") {
            loadCached();
            return;
          }

          if (actionName === "clear") {
            storageSet(CACHE_KEY, "");
            storageSet(CACHE_UPDATED_KEY, "");
            writeMemoryCache([], "-");
            setLastUpdate("-");
            writeStatus(tr("ipLibraryStatusCleared"));
            renderCenterRows([]);
            appendTerminalLine("[" + nowStamp() + "] " + tr("ipLibraryStatusCleared"));
            if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("ipLibraryStatusCleared"));
            return;
          }

          var countryCodes = parseCountries(countriesEl ? countriesEl.value : "");
          if (!countryCodes.length) {
            writeStatus(tr("ipLibraryStatusBadCountries"));
            return;
          }

          var topRanges = Number(topRangesEl ? topRangesEl.value : "120");
          if (!Number.isFinite(topRanges)) topRanges = 120;
          topRanges = Math.max(10, Math.min(500, Math.round(topRanges)));
          if (topRangesEl) topRangesEl.value = String(topRanges);

          var countriesArg = "@('" + countryCodes.join("','") + "')";
          var psCommand = [
            "$ErrorActionPreference='Stop'",
            "$scriptPath = Join-Path (Get-Location) 'scripts\\update-country-ip-library.ps1'",
            "if (!(Test-Path $scriptPath)) { throw \"Missing script: $scriptPath\" }",
            "& $scriptPath -TopRanges " + topRanges + " -CountryCodes " + countriesArg
          ].join('; ');

          writeStatus(tr("ipLibraryStatusUpdating"));
          appendTerminalLine("[" + nowStamp() + "] PS> " + psCommand);
          appendTerminalLine("[" + nowStamp() + "] " + tr("psConsoleRunning"));

          runPowerShell(psCommand).then(function (res) {
            var stdout = res && res.stdout ? String(res.stdout).trim() : "";
            var stderr = res && res.stderr ? String(res.stderr).trim() : "";
            var exitCode = (res && typeof res.exit_code === "number") ? res.exit_code : -1;

            if (stdout) writeOutput(stdout);
            if (stderr) writeOutput(stderr);
            appendTerminalLine("[" + nowStamp() + "] exit code: " + exitCode);

            var jsonText = stdout;
            var arrayStart = stdout.indexOf("[");
            var arrayEnd = stdout.lastIndexOf("]");
            var objectStart = stdout.indexOf("{");
            var objectEnd = stdout.lastIndexOf("}");
            if (arrayStart >= 0 && arrayEnd > arrayStart) {
              jsonText = stdout.slice(arrayStart, arrayEnd + 1);
            } else if (objectStart >= 0 && objectEnd > objectStart) {
              jsonText = stdout.slice(objectStart, objectEnd + 1);
            }

            try {
              var parsed = JSON.parse(jsonText || "[]");
              var normalized = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === "object" ? [parsed] : []);
              var count = normalized.length;
              if (count === 0) {
                var mergedEmpty = [stdout, stderr].filter(Boolean).join("\n\n");
                writeStatus(tr("ipLibraryStatusUpdateFailed"));
                writeOutput(mergedEmpty || tr("ipLibraryStatusUpdateFailed"));
                renderCenterRows([]);
                if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("ipLibraryStatusUpdateFailed"));
                return;
              }

              var payload = JSON.stringify(normalized);
              storageSet(CACHE_KEY, payload);
              var updatedAt = new Date().toISOString();
              storageSet(CACHE_UPDATED_KEY, updatedAt);
              writeMemoryCache(normalized, updatedAt);
              setLastUpdate(updatedAt);

              writeStatus(tr("ipLibraryStatusUpdated") + " " + count + " | " + tr("ipLibraryStatusUpdatedAt") + " " + updatedAt);
              var mergedSuccess = [JSON.stringify(normalized, null, 2)].filter(Boolean).join("\n\n");
              writeOutput(mergedSuccess);
              loadCached();
              if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("ipLibraryStatusUpdated") + " " + count);
            } catch (_) {
              var merged = [stdout, stderr].filter(Boolean).join("\n\n");
              writeStatus(tr("ipLibraryStatusUpdateFailed"));
              writeOutput(merged || tr("ipLibraryStatusUpdateFailed"));
              renderCenterRows([]);
            }
          }).catch(function (err) {
            var errMsg = (err && err.message) ? String(err.message) : "";
            if (errMsg.toLowerCase().indexOf("tauri invoke unavailable") >= 0) {
              writeStatus(tr("statusDesktopOnlyShort"));
              writeOutput(tr("psConsoleDesktopOnly"));
              renderCenterRows([]);
              return;
            }

            writeStatus(tr("ipLibraryStatusUpdateFailed"));
            writeOutput(errMsg || tr("ipLibraryStatusUpdateFailed"));
            renderCenterRows([]);
          });
        });
      });

      loadCached();
    }

    return {
      wireIpLibraryButtons: wireIpLibraryButtons,
      flattenIpLibraryEntries: flattenIpLibraryEntries,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createIpLibraryRuntime = createIpLibraryRuntime;
})();
