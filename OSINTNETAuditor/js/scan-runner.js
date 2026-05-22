(function () {
  const scanDom = window.__scanDom;
  const scanRuntime = window.__scanRuntime;

  if (!scanDom || !scanRuntime) return;

  const btnGo = document.getElementById('btnGo');
  const btnStop = document.getElementById('btnStop');

  const getStopRequested = () => !!scanRuntime.stopRequested;
  const setStopRequested = (value) => {
    scanRuntime.stopRequested = !!value;
  };

  function recomputeScanTotals() {
    totalFound = getResultCounts().activeHosts;
    totalOpenPorts = Object.values(foundHostsMap).reduce((sum, ports) => {
      return sum + (Array.isArray(ports) ? ports.length : 0);
    }, 0);
  }

  async function startScan() {
    window.__scanInvokeWarned = false;
    const startIp = getIP('f');
    const endIp = getIP('t');
    if (!isIPv4(startIp) || !isIPv4(endIp)) {
      setStatus(t('errInvalidIp'), 'err');
      return;
    }

    const startNum = ipToNum(startIp);
    const endNum = ipToNum(endIp);
    if (startNum > endNum) {
      setStatus(t('errIpRange'), 'err');
      return;
    }

    addToScanHistory(`${startIp} - ${endIp}`);

    if (endNum - startNum + 1 > 256) {
      const confirmed = await showLargeRangeConfirm(endNum - startNum + 1);
      if (!confirmed) return;
    }

    if (!isPrivateIp(startNum) || !isPrivateIp(endNum)) {
      const confirmed = await showExternalIpConfirm(startIp, endIp);
      if (!confirmed) return;
    }

    const selectedPorts = getActivePorts();
    if (!selectedPorts.length) {
      setStatus(t('errNoPorts'), 'err');
      return;
    }

    const total = endNum - startNum + 1;
    const concurrency = Math.min(+document.getElementById('concNum').value || 32, 64);
    const delayMs = Math.max(0, Math.min(5000, +document.getElementById('delayMs').value || 0));
    const defs = loadScanDefaults();
    const delayMsPerPort = defs.portScanMode === 'sequential' ? defs.delayMsPerPort : 0;
    const portChunkSize = defs.chunkSize || 100;
    const maxConcurrentProbes = Math.max(1, concurrency);
    let inFlightProbes = 0;
    const probeWaiters = [];

    async function withProbeSlot(task) {
      while (inFlightProbes >= maxConcurrentProbes) {
        await new Promise(resolve => probeWaiters.push(resolve));
      }
      inFlightProbes++;
      try {
        return await task();
      } finally {
        inFlightProbes--;
        const wake = probeWaiters.shift();
        if (wake) wake();
      }
    }

    function scanProbePort(ip, port, ms = 1400) {
      return withProbeSlot(() => probePort(ip, port, ms));
    }

    if (portsOverride !== null && defs.portScanMode === 'sequential' && delayMsPerPort > 50) {
      const estMs = selectedPorts.length * (delayMsPerPort + 1400);
      const estHours = Math.ceil(estMs / 1000 / 3600);
      const confirmed = await showLargeRangeConfirm(
        selectedPorts.length,
        `WARNING: Scanning all ${selectedPorts.length} ports sequentially with ${delayMsPerPort}ms/port delay = ~${estHours} hours per IP!`
      );
      if (!confirmed) return;
    }

    refreshTopologyFilterOptions();
    setStopRequested(false);
    if (scanDom.statTime) scanDom.statTime.textContent = '0.0s';
    recomputeScanTotals();
    updateProgress(0, total, totalFound, totalOpenPorts);
    setScanState(true);

    if (typeof appendCmdLog === 'function') {
      appendCmdLog(
        `Scan start: ${startIp} — ${endIp}  [${selectedPorts.length} port${selectedPorts.length === 1 ? '' : 's'}, conc: ${concurrency}]`,
        'scan'
      );
      appendCmdLog(
        `IP delay: ${delayMs}ms  |  Port mode: ${defs.portScanMode === 'sequential' ? `sequential, delay ${delayMsPerPort}ms/port` : 'parallel'}  |  Batch: ${portChunkSize}`,
        'scan'
      );
    }

    if (scanDom.emptyRow?.parentNode && Object.keys(foundHostsMap).length > 0) {
      scanDom.emptyRow.remove();
    }
    if (scanDom.emptyRow && !scanDom.emptyRow.parentNode && Object.keys(foundHostsMap).length === 0 && scanDom.listBody) {
      scanDom.listBody.appendChild(scanDom.emptyRow);
    }
    if (scanDom.emptyRow?.parentNode) scanDom.emptyRow.textContent = t('emptyScanning');

    if (total > 500) {
      const estSec = Math.round(total * (1500 / concurrency) / 1000);
      const estStr = estSec >= 60 ? `~${Math.ceil(estSec / 60)} min` : `~${estSec}s`;
      setStatus(t('statusLarge', total, selectedPorts.length, estStr), 'warn');
    } else {
      setStatus(t('statusScanning', total, selectedPorts.length), 'warn');
    }

    const portProgWrap = document.getElementById('portProgWrap');
    const portProgFill = document.getElementById('portProgFill');
    const portProgLabel = document.getElementById('portProgLabel');

    function showPortProgress(current, allPorts, ip) {
      if (!portProgWrap || !portProgFill || !portProgLabel) return;
      portProgWrap.classList.add('active');
      const pct = allPorts ? Math.round(current / allPorts * 100) : 0;
      portProgFill.style.width = `${pct}%`;
      portProgLabel.textContent = `Porty: ${current + 1}–${Math.min(current + portChunkSize, allPorts)} / ${allPorts}  (${ip})`;
    }

    function hidePortProgress() {
      if (!portProgWrap || !portProgFill) return;
      portProgWrap.classList.remove('active');
      portProgFill.style.width = '0%';
    }

    async function probeAllPorts(ip, ports, delayBetweenPorts = 0, onBatchResult = null) {
      const chunk = portChunkSize;
      const results = [];
      for (let i = 0; i < ports.length && !getStopRequested(); i += chunk) {
        showPortProgress(i, ports.length, ip);
        const batch = ports.slice(i, i + chunk);
        if (delayBetweenPorts > 0) {
          for (const port of batch) {
            if (getStopRequested()) break;
            const r = await scanProbePort(ip, port, 1400);
            results.push({ port, ok: r.ok, ms: r.ms });
            if (!getStopRequested()) {
              await new Promise(resolve => setTimeout(resolve, delayBetweenPorts));
            }
          }
        } else {
          // Parallel port probing with stop check
          const batchRes = await Promise.all(
            batch.map(port => {
              // Skip if stop already requested
              if (getStopRequested()) return { port, ok: false, ms: null };
              return scanProbePort(ip, port, 1400).then(r => ({ port, ok: r.ok, ms: r.ms }));
            })
          );
          results.push(...batchRes);
        }

        if (onBatchResult) onBatchResult(results);
      }
      hidePortProgress();
      return results;
    }

    let nextIdx = 0;
    let checked = 0;

    const worker = async () => {
      while (!getStopRequested()) {
        const idx = nextIdx++;
        if (idx >= total) return;
        const ip = numToIp(startNum + idx);
        let lastLiveRowUiUpdateAt = 0;

        let liveOpenCount = 0;
        const onBatch = portsOverride !== null ? (partialResults) => {
          const partialOpen = partialResults.filter(r => r.ok).map(r => r.port);
          const bestMs = partialResults.filter(r => r.ok).reduce((a, r) => (r.ms < a ? r.ms : a), Infinity);
          const pingMs = bestMs === Infinity ? null : bestMs;
          const hasAnyResponse = partialResults.some(r => r.ms !== null);
          const isAnomaly = partialOpen.length === 0 && hasAnyResponse;
          if (partialOpen.length === liveOpenCount) return;
          const now = Date.now();
          if (now - lastLiveRowUiUpdateAt < 180 && partialOpen.length < selectedPorts.length) return;
          lastLiveRowUiUpdateAt = now;
          liveOpenCount = partialOpen.length;
          foundHostsMap[ip] = partialOpen;
          foundAnomalyMap[ip] = isAnomaly;
          if (pingMs !== null) foundPingMap[ip] = pingMs;
          else delete foundPingMap[ip];
          recomputeScanTotals();
          addResultRow(ip, partialOpen, pingMs, false, isAnomaly);
        } : null;

        const res = (selectedPorts.length > 200 || delayMsPerPort > 0 || onBatch !== null)
          ? await probeAllPorts(ip, selectedPorts, delayMsPerPort, onBatch)
          : await Promise.all(selectedPorts.map(port => scanProbePort(ip, port, 1400).then(r => ({ port, ok: r.ok, ms: r.ms }))));
        const openPorts = res.filter(r => r.ok).map(r => r.port);
        const bestMs = res.filter(r => r.ok).reduce((a, r) => (r.ms < a ? r.ms : a), Infinity);
        const pingMs = bestMs === Infinity ? null : bestMs;
        const hasAnyResponse = res.some(r => r.ms !== null);
        const isAnomaly = openPorts.length === 0 && hasAnyResponse;

        foundHostsMap[ip] = openPorts;
        foundAnomalyMap[ip] = isAnomaly;
        if (pingMs !== null) foundPingMap[ip] = pingMs;
        else delete foundPingMap[ip];
        recomputeScanTotals();
        addResultRow(ip, openPorts, pingMs, false, isAnomaly);
        if (typeof appendCmdLog === 'function') {
          if (openPorts.length) appendCmdLog(`>> HOST  ${ip}  ports: [${openPorts.join(', ')}]${pingMs !== null ? `  ping: ${pingMs}ms` : ''}`, 'scan');
          else appendCmdLog(`>> DEAD  ${ip}${pingMs !== null ? `  ping: ${pingMs}ms` : ''}`, 'scan');
        }

        checked++;
        if (checked % 4 === 0 || checked === total) updateProgress(checked, total, totalFound, totalOpenPorts);
        if (delayMs > 0 && !getStopRequested() && nextIdx < total) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));
    setScanState(false);
    recomputeScanTotals();
    updateProgress(checked, total, totalFound, totalOpenPorts);

    if (totalFound === 0 && scanDom.emptyRow?.parentNode) scanDom.emptyRow.textContent = t('emptyNone');

    const checkedText = scanDom.statChecked?.textContent || String(checked);
    if (getStopRequested()) setStatus(t('statusStopped', checkedText), 'warn');
    else if (totalFound > 0) setStatus(t('statusDone', totalFound, totalOpenPorts), 'ok');
    else setStatus(t('statusNone'), 'err');

    if (typeof appendCmdLog === 'function') {
      if (getStopRequested()) appendCmdLog(`Scan stopped. Checked: ${checkedText}, found: ${totalFound} host${totalFound === 1 ? '' : 's'}`, 'scan');
      else if (totalFound > 0) appendCmdLog(`Scan complete. Hosts: ${totalFound}, open ports: ${totalOpenPorts}`, 'scan');
      else appendCmdLog('Scan complete. No hosts found.', 'scan');
      appendCmdLog('─'.repeat(52), 'scan');
    }

    if (typeof window.persistScanResultsSnapshotToDb === 'function') {
      await window.persistScanResultsSnapshotToDb({
        reason: getStopRequested() ? 'scan_stopped' : 'scan_completed',
        checkedHosts: Number(checkedText) || checked,
        activeHosts: totalFound,
        openPorts: totalOpenPorts,
      });
    }
  }

  window.startScan = startScan;

  btnGo?.addEventListener('click', () => {
    if (!window.__isScanInProgress?.()) {
      startScan().catch(e => {
        setStatus(`Error: ${e.message}`, 'err');
        setScanState(false);
      });
    }
  });

  btnStop?.addEventListener('click', () => {
    setStopRequested(true);
    const controllers = scanRuntime.activeControllers;
    if (controllers?.forEach) controllers.forEach(controller => controller.abort());
    if (window.__tauriInvoke) window.__tauriInvoke('stop_scan').catch(() => {});
  });
})();
