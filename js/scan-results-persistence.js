(function () {
  let saveResultsTimer = null;

  function saveResultsNow() {
    try {
      const data = Object.entries(foundHostsMap).map(([ip, ports]) => ({
        ip,
        ports,
        ping: foundPingMap[ip] ?? null,
        hostname: hostnameCache[ip] ?? null,
        geo: ipGeoCoords[ip] ?? null,
      }));
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

      data.forEach(({ ip, ports, ping, hostname, geo }) => {
        foundHostsMap[ip] = ports;
        totalOpenPorts += ports.length;
        if (ping !== null) foundPingMap[ip] = ping;
        if (hostname !== null) hostnameCache[ip] = hostname;
        if (geo) ipGeoCoords[ip] = geo;
        addResultRow(ip, ports, ping);
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

  window.saveResultsNow = saveResultsNow;
  window.saveResults = saveResults;
  window.restoreResults = restoreResults;
})();
