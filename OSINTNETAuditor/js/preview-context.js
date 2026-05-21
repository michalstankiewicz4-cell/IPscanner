(function () {
  const previewContext = window.__previewContext || (window.__previewContext = {
    selectedRowEl: null,
    targetIp: '',
    targetPorts: []
  });

  const previewWrap = document.getElementById('previewWrap');
  const previewFrame = document.getElementById('previewFrame');
  const previewUrl = document.getElementById('previewUrl');
  const btnPreviewOpen = document.getElementById('btnPreviewOpen');
  const btnPreviewClose = document.getElementById('btnPreviewClose');
  const previewExtLink = document.getElementById('previewExtLink');
  const ctxMenu = document.getElementById('ctxMenu');

  function openInBrowser(url) {
    if (window.__TAURI__) {
      window.__TAURI__.core.invoke('open_browser', { url });
    } else {
      window.open(url, '_blank', 'noopener');
    }
  }

  function openPreview(url) {
    if (!previewWrap || !previewFrame || !previewUrl || !btnPreviewOpen || !previewExtLink) return;
    previewUrl.textContent = url;
    previewWrap.classList.remove('preview-blocked-active');
    previewFrame.src = url;
    previewExtLink.href = url;
    btnPreviewOpen.onclick = () => openInBrowser(url);
    previewWrap.classList.add('open');
    previewFrame.onload = () => {
      try {
        void previewFrame.contentDocument;
      } catch {
        previewWrap.classList.add('preview-blocked-active');
      }
    };
    setTimeout(() => previewWrap.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  function showEnrichPopup(popupId, label, asyncFn) {
    const existing = document.getElementById(popupId);
    if (existing) {
      existing.remove();
      return;
    }

    const win = document.createElement('div');
    win.id = popupId;
    win.className = 'enrich-popup';
    const offset = document.querySelectorAll('.enrich-popup').length * 24;
    win.style.top = (90 + offset) + 'px';
    win.style.left = Math.max(10, (window.innerWidth / 2 - 160)) + 'px';

    const bar = document.createElement('div');
    bar.className = 'enrich-popup-bar';
    bar.innerHTML = `<span class="enrich-bar-label">${label}</span>` +
      `<span class="title-btn enrich-bar-close">✕</span>`;
    bar.querySelector('.title-btn').addEventListener('click', () => win.remove());

    const body = document.createElement('div');
    body.className = 'enrich-popup-body';
    body.innerHTML = '<span class="enrich-body-loading">Ladowanie...</span>';

    win.append(bar, body);
    document.body.appendChild(win);

    let drag = false;
    let ox = 0;
    let oy = 0;
    bar.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (e.target.classList.contains('title-btn')) return;
      drag = true;
      const r = win.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!drag) return;
      win.style.left = (e.clientX - ox) + 'px';
      win.style.top = (e.clientY - oy) + 'px';
    });
    document.addEventListener('mouseup', () => { drag = false; });

    asyncFn()
      .then(html => { body.innerHTML = html || '<span class="enrich-body-empty">Brak danych</span>'; })
      .catch(() => { body.innerHTML = '<span class="enrich-body-error">Blad ladowania danych</span>'; });
  }

  function getTargetPorts() {
    return Array.isArray(previewContext.targetPorts) ? previewContext.targetPorts : [];
  }

  function hideContextMenu() {
    ctxMenu?.classList.remove('open');
  }

  if (btnPreviewClose) {
    btnPreviewClose.addEventListener('click', () => {
      if (!previewWrap || !previewFrame) return;
      previewWrap.classList.remove('open');
      previewFrame.src = 'about:blank';
      if (previewContext.selectedRowEl) {
        previewContext.selectedRowEl.classList.remove('selected');
        previewContext.selectedRowEl = null;
      }
    });
  }

  document.getElementById('ctxCopyIp')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(previewContext.targetIp || '');
    hideContextMenu();
  });

  document.getElementById('ctxCopyPorts')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(getTargetPorts().join(', '));
    hideContextMenu();
  });

  document.getElementById('ctxHostname')?.addEventListener('click', () => {
    const ip = previewContext.targetIp;
    hideContextMenu();
    showEnrichPopup(`enrich-host-${ip}`, `🧭 Hostname - ${ip}`, async () => {
      const name = await lookupHostname(ip);
      return name
        ? `<div><b>Hostname:</b> ${name}</div>`
        : '<span class="detail-muted">Brak rekordu reverse DNS</span>';
    });
  });

  document.getElementById('ctxOpenBrowser')?.addEventListener('click', () => {
    const ports = getTargetPorts();
    if (!previewContext.targetIp || !ports.length) return;
    const proto = (ports[0] === 443 || ports[0] === 8443) ? 'https' : 'http';
    openInBrowser(`${proto}://${previewContext.targetIp}:${ports[0]}/`);
    hideContextMenu();
  });

  document.getElementById('ctxPreview')?.addEventListener('click', () => {
    const ports = getTargetPorts();
    if (!previewContext.targetIp || !ports.length) return;
    const proto = (ports[0] === 443 || ports[0] === 8443) ? 'https' : 'http';
    openPreview(`${proto}://${previewContext.targetIp}:${ports[0]}/`);
    hideContextMenu();
  });

  document.getElementById('ctxScanAllPorts')?.addEventListener('click', async () => {
    const ip = previewContext.targetIp;
    const scanning = typeof window.__isScanInProgress === 'function' ? window.__isScanInProgress() : false;
    if (!ip || scanning) {
      hideContextMenu();
      return;
    }

    const confirmed = await (typeof showFullPortScanConfirm === 'function'
      ? showFullPortScanConfirm(ip)
      : Promise.resolve(window.confirm(`Scan all 65535 TCP ports on ${ip}?`)));
    if (!confirmed) {
      hideContextMenu();
      return;
    }

    if (typeof window.__setPortsOverride === 'function') {
      window.__setPortsOverride(Array.from({ length: 65535 }, (_, i) => i + 1));
    }

    setIP('f', ip);
    setIP('t', ip);
    hideContextMenu();

    startScan()
      .catch(e => {
        setStatus(`Error: ${e.message}`, 'err');
        setScanState(false);
      })
      .finally(() => {
        if (typeof window.__clearPortsOverride === 'function') {
          window.__clearPortsOverride();
        }
      });
  });

  document.addEventListener('click', hideContextMenu);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideContextMenu();
  });

  document.getElementById('ctxDetailGeo')?.addEventListener('click', () => {
    const ip = previewContext.targetIp;
    hideContextMenu();
    showEnrichPopup(`enrich-geo-${ip}`, `🌍 Geolokalizacja - ${ip}`, async () => {
      const geo = await geoLookup(ip);
      if (!geo) {
        return isPrivateIP(ip)
          ? `<span class="detail-muted">${t('geoLocal')}</span>`
          : `<span class="status-error">${t('geoError')}</span>`;
      }
      const vpn = geo.proxy ? '<span class="badge badge-vpn">VPN/Proxy</span>' : '';
      const dc = geo.hosting ? '<span class="badge badge-dc">DC</span>' : '';
      return `<div class="geo-info-line">` +
        `<b>${t('geoCountry')}</b> ${geo.country || '?'} - ${geo.city || '?'}${vpn}${dc}<br>` +
        `<b>${t('geoIsp')}</b> ${geo.isp || '?'}<br>` +
        `<b>${t('geoAs')}</b> ${geo.as || '?'}</div>`;
    });
  });

  document.getElementById('ctxDetailDevice')?.addEventListener('click', () => {
    const ip = previewContext.targetIp;
    const ports = getTargetPorts().slice();
    hideContextMenu();
    showEnrichPopup(`enrich-dev-${ip}`, `🖥 Urzadzenie - ${ip}`, async () => {
      const [deviceLabel, hasFavicon] = await Promise.all([
        fingerprintByImage(ip, ports),
        checkFavicon(ip, ports[0]),
      ]);
      let html = '';
      if (deviceLabel) {
        html += `<div><b>${t('deviceType')}</b> ${deviceLabel} <span class="badge badge-recognized">${t('tagRecognized')}</span></div>`;
      }
      html += `<div><b>${t('deviceFavicon')}</b> ${hasFavicon ? t('deviceFaviconYes') : t('deviceFaviconNo')}</div>`;
      const portGuess = ports.includes(554)
        ? t('portRtsp')
        : ports.includes(631)
          ? t('portIpp')
          : ports.includes(9100)
            ? t('portRaw')
            : ports.includes(5000) || ports.includes(5001)
              ? t('portSyn')
              : ports.includes(8006)
                ? t('portProx')
                : null;
      if (portGuess) html += `<div><b>${t('deviceSuggestion')}</b> ${portGuess}</div>`;
      return html || `<span class="detail-muted">${t('deviceUnknown')}</span>`;
    });
  });

  document.getElementById('ctxDetailTitle')?.addEventListener('click', () => {
    const ip = previewContext.targetIp;
    const ports = getTargetPorts().slice();
    hideContextMenu();
    showEnrichPopup(`enrich-title-${ip}`, `📄 Tytul HTTP - ${ip}`, async () => {
      if (isPrivateIP(ip)) return `<span class="detail-muted">${t('titleExtOnly')}</span>`;
      const title = await fetchTitle(ip, ports[0]);
      return title
        ? `<b>${t('titleLabel')}</b> &ldquo;${title}&rdquo;`
        : `<span class="detail-muted">${t('titleUnavailable')}</span>`;
    });
  });

  document.getElementById('ctxDetailAccess')?.addEventListener('click', () => {
    const ip = previewContext.targetIp;
    const ports = getTargetPorts().slice();
    hideContextMenu();
    showEnrichPopup(`enrich-acc-${ip}`, `🔑 Dostep - ${ip}`, async () => {
      const isOpen = await checkAuth(ip, ports);
      return isOpen
        ? `<b>${t('accessLabel')}</b> <span class="text-ok">${t('accessOpen')}</span>`
        : `<b>${t('accessLabel')}</b> ${t('accessClosed')}`;
    });
  });

  window.openInBrowser = openInBrowser;
  window.openPreview = openPreview;
  window.showEnrichPopup = showEnrichPopup;
})();
