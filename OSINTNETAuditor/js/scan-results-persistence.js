(function () {
  let saveResultsTimer = null;

  function getTauriInvoke() {
    return window.__TAURI_INTERNALS__?.invoke
      ?? window.__TAURI__?.invoke
      ?? window.__TAURI__?.core?.invoke
      ?? null;
  }

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

  function downloadJsonFile(filename, content) {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8;' });
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

  function buildResultsPayload(meta = {}) {
    const results = collectResultsExportData();
    const scanHistory = typeof window.getScanHistoryForExport === 'function'
      ? window.getScanHistoryForExport()
      : JSON.parse(localStorage.getItem('netrecon_scan_history') || '[]');

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      reason: meta.reason || 'manual',
      ...meta,
      results,
      scanHistory: Array.isArray(scanHistory) ? scanHistory : [],
    };
  }

  async function persistCurrentResultsSnapshotToDb(meta = {}) {
    saveResultsNow();
    const invoke = getTauriInvoke();
    if (!invoke) return false;

    try {
      const payload = buildResultsPayload(meta);
      await invoke('db_store_scan_results_snapshot', {
        payloadJson: JSON.stringify(payload, null, 2),
      });
      return true;
    } catch {
      return false;
    }
  }

  async function tryRestoreResultsFromDatabase() {
    const invoke = getTauriInvoke();
    if (!invoke) return false;

    try {
      const latestRaw = await invoke('db_load_latest_scan_results_snapshot');
      if (!latestRaw) return false;

      let parsed;
      try {
        parsed = JSON.parse(latestRaw);
      } catch {
        return false;
      }

      const results = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.results)
          ? parsed.results
          : null;

      if (!Array.isArray(results) || results.length === 0) return false;

      const importedHistory = Array.isArray(parsed?.scanHistory) ? parsed.scanHistory : null;
      localStorage.setItem('netrecon_results', JSON.stringify(results));
      localStorage.setItem('netrecon_results_ts', Date.now());

      if (importedHistory) {
        if (typeof window.setScanHistoryFromImport === 'function') {
          window.setScanHistoryFromImport(importedHistory);
        } else {
          localStorage.setItem('netrecon_scan_history', JSON.stringify(importedHistory));
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  function restoreResults() {
    try {
      const raw = localStorage.getItem('netrecon_results');
      if (!raw) {
        // Fallback path: restore latest persisted export snapshot from SQLite.
        tryRestoreResultsFromDatabase().then((restored) => {
          if (restored) restoreResults();
        });
        return;
      }
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

  async function exportResultsToJson() {
    saveResultsNow();
    const payload = buildResultsPayload({ reason: 'manual_export' });
    const results = payload.results;
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const filename = `netrecon-results-${ts}.json`;
    const content = JSON.stringify(payload, null, 2);
    const invoke = getTauriInvoke();

    await persistCurrentResultsSnapshotToDb({ reason: 'manual_export' });

    if (invoke) {
      try {
        await invoke('save_scan_results_dialog', {
          defaultFilename: filename,
          content,
        });
      } catch (err) {
        if (String(err || '').toLowerCase().includes('cancelled')) return null;
        throw err;
      }
    } else if (typeof window.showSaveFilePicker === 'function') {
      try {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
        });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
      } catch (err) {
        if (err?.name === 'AbortError') return null;
        throw err;
      }
    } else {
      downloadJsonFile(filename, content);
    }
    return results.length;
  }

  async function importResultsFromFile(file) {
    const invoke = getTauriInvoke();
    let raw = '';

    if (file) {
      raw = await file.text();
    } else if (invoke) {
      try {
        raw = await invoke('open_scan_results_dialog');
      } catch (err) {
        if (String(err || '').toLowerCase().includes('cancelled')) return null;
        throw err;
      }
    } else if (typeof window.showOpenFilePicker === 'function') {
      try {
        const [fileHandle] = await window.showOpenFilePicker({
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
          multiple: false,
        });
        const f = await fileHandle.getFile();
        raw = await f.text();
      } catch (err) {
        if (err?.name === 'AbortError') return null;
        throw err;
      }
    } else {
      throw new Error('No file selected');
    }

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

    await persistCurrentResultsSnapshotToDb({
      reason: 'manual_import',
      importedAt: new Date().toISOString(),
      scanHistory: importedHistory || [],
    });

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
  window.persistScanResultsSnapshotToDb = persistCurrentResultsSnapshotToDb;
  window.exportScanResults = exportResultsToJson;
  window.importScanResultsFromFile = importResultsFromFile;
})();
