(function () {
  let saveResultsTimer = null;

  function collectResultsExportData() {
    return Object.entries(foundHostsMap).map(([ip, ports]) => ({
      ip,
      ports,
      ping: foundPingMap[ip] ?? null,
      anomaly: foundAnomalyMap[ip] === true,
      hostname: hostnameCache[ip] ?? null,
      geo: geoCache[ip] ?? null,
    }));
  }

  function downloadJsonFile(filename, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function saveResultsNow() {
    try {
      const data = collectResultsExportData();
      localStorage.setItem('netrecon_results', JSON.stringify(data));
      localStorage.setItem('netrecon_results_ts', Date.now());
    } catch {}
  }

  function saveResults() {
    if (saveResultsTimer) clearTimeout(saveResultsTimer);
    saveResultsTimer = setTimeout(() => {
      saveResultsTimer = null;
      saveResultsNow();
    }, 180);
  }

  function restoreResults() {
    try {
      const raw = localStorage.getItem('netrecon_results');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data.length) return;
      const ts = +localStorage.getItem('netrecon_results_ts');
      const age = ts ? Math.round((Date.now() - ts) / 60000) : null;

      data.forEach(({ ip, ports, ping, anomaly, hostname, geo }) => {
        foundHostsMap[ip] = ports;
        totalOpenPorts += ports.length;
        if (ping !== null) foundPingMap[ip] = ping;
        foundAnomalyMap[ip] = anomaly === true;
        // Always restore hostnameCache including null (prevents re-querying on every restore)
        hostnameCache[ip] = hostname ?? null;
        // Restore full geo to geoCache (prevents re-querying API on every restore)
        geoCache[ip] = geo ?? null;
        const coords = resolveGeoCoords(geo || null);
        if (coords) {
          ipGeoCoords[ip] = { lat: coords.lat, lon: coords.lon, country: geo?.country };
        }
        // skipEnrich=true: no async enrichment queue — populate cells directly below
        const row = addResultRow(ip, ports, ping, true, anomaly === true);

        // Populate hostname and geo cells synchronously from saved data
        if (row) {
          if (colsEnabled.hostname) {
            const c = row.querySelector('.lv-extra-cell[data-col="hostname"]');
            if (c) {
              if (hostname) {
                c.textContent = hostname;
              } else {
                const msg = isPrivateIP(ip) ? t('hostnameLocal') : t('hostnameNone');
                c.innerHTML = `<span class="detail-muted">${msg}</span>`;
              }
            }
          }
          if (colsEnabled.geo) {
            const c = row.querySelector('.lv-extra-cell[data-col="geo"]');
            if (c) {
              renderGeoFlagCell(c, ip, geo || null);
            }
          }
          if (colsEnabled.isp) {
            const c = row.querySelector('.lv-extra-cell[data-col="isp"]');
            if (c) {
              renderIspCell(c, ip, geo || null);
            }
          }
          if (colsEnabled.asn) {
            const c = row.querySelector('.lv-extra-cell[data-col="asn"]');
            if (c) {
              renderAsnCell(c, ip, geo || null);
            }
          }
        }
      });

      const counts = getResultCounts();
      totalFound = counts.activeHosts;
      // Restored rows are visible immediately, so Checked should reflect restored host rows.
      updateProgress(counts.totalHosts, 0, totalFound, totalOpenPorts);
      const ageStr = age !== null ? ` (${age} min ago)` : '';
      setStatus(`Restored ${counts.totalHosts} results from last scan${ageStr}.`, 'ok');
      statusCount.textContent = t('statusHosts', totalFound);
      if (typeof appendCmdLog === 'function') {
        appendCmdLog(
          `Restored ${counts.totalHosts} result${counts.totalHosts === 1 ? '' : 's'} from last scan${ageStr}. Active hosts: ${counts.activeHosts}.`,
          'scan'
        );
      }
    } catch {}
  }

  function exportResultsToJson() {
    saveResultsNow();
    const results = collectResultsExportData();
    const scanHistory = typeof window.getScanHistoryForExport === 'function'
      ? window.getScanHistoryForExport()
      : JSON.parse(localStorage.getItem('netrecon_scan_history') || '[]');
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      results,
      scanHistory: Array.isArray(scanHistory) ? scanHistory : [],
    };
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    downloadJsonFile(`netrecon-results-${ts}.json`, payload);
    return results.length;
  }

  async function importResultsFromFile(file) {
    const raw = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Invalid JSON');
    }

    const results = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.results) ? parsed.results : null;
    if (!Array.isArray(results)) {
      throw new Error('Unexpected file format');
    }

    const importedHistory = Array.isArray(parsed?.scanHistory) ? parsed.scanHistory : null;

    document.getElementById('btnClear')?.click();
    localStorage.setItem('netrecon_results', JSON.stringify(results));
    localStorage.setItem('netrecon_results_ts', Date.now());
    if (importedHistory) {
      if (typeof window.setScanHistoryFromImport === 'function') {
        window.setScanHistoryFromImport(importedHistory);
      } else {
        localStorage.setItem('netrecon_scan_history', JSON.stringify(importedHistory));
      }
    }
    restoreResults();
    return results.length;
  }

  window.saveResultsNow = saveResultsNow;
  window.saveResults = saveResults;
  window.restoreResults = restoreResults;
  window.exportScanResults = exportResultsToJson;
  window.importScanResultsFromFile = importResultsFromFile;
})();
