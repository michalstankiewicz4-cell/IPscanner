(function () {
  function getTauriInvoke() {
    return window.__TAURI_INTERNALS__?.invoke
      ?? window.__TAURI__?.invoke
      ?? window.__TAURI__?.core?.invoke
      ?? null;
  }

  function isPrivateIpAddress(ip) {
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return false;
    const parts = ip.split('.').map(Number);
    if (parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return false;
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    return false;
  }

  function ipToNumLocal(ip) {
    return ip.split('.').reduce((a, p) => ((a << 8) + Number(p)) >>> 0, 0);
  }

  function extractIpv4(text) {
    if (!text) return null;
    const m = text.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
    return m ? m[1] : null;
  }

  function ipToSubnetBase(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return null;
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  }

  async function detectLocalIP() {
    const invoke = getTauriInvoke();
    if (invoke) {
      try {
        const ip = await invoke('get_local_ip');
        if (ip && isPrivateIpAddress(ip)) return ip;
        throw new Error('No local private IPv4 found');
      } catch {
        // Fall through to WebRTC fallback for browser mode / dev diagnostics.
      }
    }

    return new Promise((resolve, reject) => {
      if (!window.RTCPeerConnection) {
        reject(new Error('RTCPeerConnection unavailable'));
        return;
      }
      let pc;
      try {
        pc = new RTCPeerConnection({ iceServers: [] });
      } catch (err) {
        reject(err);
        return;
      }

      let done = false;
      const finish = (ip) => {
        if (done) return;
        done = true;
        clearTimeout(timeoutId);
        try { pc.close(); } catch {}
        resolve(ip);
      };

      const fail = (err) => {
        if (done) return;
        done = true;
        clearTimeout(timeoutId);
        try { pc.close(); } catch {}
        reject(err || new Error('Local IP not found'));
      };

      const checkCandidateText = (text) => {
        const ip = extractIpv4(text);
        if (ip && isPrivateIpAddress(ip)) finish(ip);
      };

      pc.onicecandidate = (evt) => {
        if (!evt || !evt.candidate) return;
        checkCandidateText(evt.candidate.candidate);
        if (evt.candidate.address) checkCandidateText(evt.candidate.address);
      };

      pc.onicecandidateerror = () => {
        // Ignore transient ICE errors; timeout/fallback will handle final state.
      };

      const timeoutId = setTimeout(async () => {
        try {
          const stats = await pc.getStats();
          for (const report of stats.values()) {
            if (report.type === 'local-candidate' || report.type === 'candidate-pair') {
              const ip = report.address || report.ip || extractIpv4(report.candidateType || '');
              if (ip && isPrivateIpAddress(ip)) {
                finish(ip);
                return;
              }
            }
          }
        } catch {}
        fail(new Error('Timeout'));
      }, 5000);

      pc.createDataChannel('local-ip-probe');
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch((err) => fail(err));
    });
  }

  async function detectLocalSubnets() {
    const invoke = getTauriInvoke();
    if (invoke) {
      try {
        const subnets = await invoke('get_local_subnets');
        if (Array.isArray(subnets)) {
          return [...new Set(subnets.filter(Boolean))]
            .sort((a, b) => ipToNumLocal(a + '.0') - ipToNumLocal(b + '.0'));
        }
      } catch {
        // Fall through to WebRTC fallback for browser mode / dev diagnostics.
      }
    }

    return new Promise((resolve, reject) => {
      if (!window.RTCPeerConnection) {
        reject(new Error('RTCPeerConnection unavailable'));
        return;
      }
      let pc;
      try {
        pc = new RTCPeerConnection({ iceServers: [] });
      } catch (err) {
        reject(err);
        return;
      }

      const ips = new Set();
      let done = false;

      const addIp = (ip) => {
        if (ip && isPrivateIpAddress(ip)) ips.add(ip);
      };

      const addFromText = (text) => {
        const ip = extractIpv4(text);
        addIp(ip);
      };

      const finish = async () => {
        if (done) return;
        done = true;
        clearTimeout(timeoutId);
        try {
          const stats = await pc.getStats();
          for (const report of stats.values()) {
            if (report.type === 'local-candidate' || report.type === 'candidate-pair') {
              addIp(report.address || report.ip || null);
            }
          }
        } catch {}
        try { pc.close(); } catch {}

        const subnets = [...new Set([...ips]
          .map(ipToSubnetBase)
          .filter(Boolean))]
          .sort((a, b) => ipToNumLocal(a + '.0') - ipToNumLocal(b + '.0'));
        resolve(subnets);
      };

      pc.onicecandidate = (evt) => {
        if (!evt || !evt.candidate) return;
        addFromText(evt.candidate.candidate);
        if (evt.candidate.address) addFromText(evt.candidate.address);
      };

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          finish();
        }
      };

      pc.onicecandidateerror = () => {
        // Ignore ICE transient errors.
      };

      const timeoutId = setTimeout(finish, 4500);
      pc.createDataChannel('local-subnet-probe');
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => finish());
    });
  }

  const btnMyIp = document.getElementById('btnMyIp');
  const myIpResult = document.getElementById('myIpResult');
  const btnCopyMyIp = document.getElementById('btnCopyMyIp');
  const btnUseMyIp = document.getElementById('btnUseMyIp');

    function persistSelfIpState(ip, geo) {
      try {
        if (ip) localStorage.setItem('netrecon_self_public_ip', ip);
        if (geo && typeof geo === 'object') {
          localStorage.setItem('netrecon_self_public_geo', JSON.stringify(geo));
        }
      } catch {}
    }

  const btnMyLocalIp = document.getElementById('btnMyLocalIp');
  const myLocalIpResult = document.getElementById('myLocalIpResult');
  const btnCopyMyLocalIp = document.getElementById('btnCopyMyLocalIp');
  const btnUseMyLocalIp = document.getElementById('btnUseMyLocalIp');
  const btnLocalSubnets = document.getElementById('btnLocalSubnets');
  const localSubnetsResult = document.getElementById('localSubnetsResult');
  const localSubnetSelect = document.getElementById('localSubnetSelect');
  const btnUseLocalSubnet = document.getElementById('btnUseLocalSubnet');

  btnMyIp?.addEventListener('click', async () => {
    myIpResult.className = 'status-loading';
    myIpResult.textContent = t('loading');
    btnCopyMyIp.classList.add('initially-hidden');
    btnUseMyIp.classList.add('initially-hidden');
    btnMyIp.disabled = true;
    try {
      let data = null;
      try {
        const resAny = await fetch('https://api64.ipify.org?format=json');
        data = await resAny.json();
      } catch {
        const resLegacy = await fetch('https://api.ipify.org?format=json');
        data = await resLegacy.json();
      }

      let chosenIp = String(data?.ip || '').trim();
      if (!(typeof isIPv4 === 'function' && isIPv4(chosenIp))) {
        try {
          const res4 = await fetch('https://api4.ipify.org?format=json');
          const data4 = await res4.json();
          const ip4 = String(data4?.ip || '').trim();
          if (typeof isIPv4 === 'function' && isIPv4(ip4)) {
            chosenIp = ip4;
          }
        } catch {
          // Keep previously detected IP when IPv4 endpoint is unavailable.
        }
      }

      window.__selfPublicIp = chosenIp;
      persistSelfIpState(chosenIp, null);
      myIpResult.className = 'status-ok';
      myIpResult.textContent = chosenIp;
      btnCopyMyIp.classList.remove('initially-hidden');
      btnCopyMyIp.onclick = () => {
        navigator.clipboard?.writeText(chosenIp);
        btnCopyMyIp.textContent = '✔ OK';
        setTimeout(() => { btnCopyMyIp.textContent = t('btnCopy'); }, 1500);
      };
      btnUseMyIp.classList.remove('initially-hidden');
      btnUseMyIp.onclick = () => {
        const parts = chosenIp.split('.').map(Number);
        if (parts.length !== 4 || parts.some(v => !Number.isFinite(v))) return;
        setIP('f', `${parts[0]}.${parts[1]}.${parts[2]}.1`);
        setIP('t', `${parts[0]}.${parts[1]}.${parts[2]}.254`);
      };
      if (typeof geoLookup === 'function') {
        const geo = await geoLookup(chosenIp).catch(() => null);
        persistSelfIpState(chosenIp, geo);
        if (!geo && _tauriInvoke && chosenIp) {
          try {
            const d = await _tauriInvoke('geo_lookup', { ip: chosenIp });
            if (d && d.status === 'success') {
              const coords = typeof resolveGeoCoords === 'function'
                ? resolveGeoCoords(d)
                : (Number.isFinite(Number(d.lat)) && Number.isFinite(Number(d.lon))
                  ? { lat: Number(d.lat), lon: Number(d.lon) }
                  : null);
              if (coords && typeof ipGeoCoords !== 'undefined') {
                ipGeoCoords[chosenIp] = {
                  lat: coords.lat,
                  lon: coords.lon,
                  country: d.country || ''
                };
                persistSelfIpState(chosenIp, d);
                if (typeof updateGlobeDots === 'function') updateGlobeDots();
              }
            }
          } catch {
            // Ignore fallback failures.
          }
        }
      }
    } catch {
      myIpResult.className = 'status-error';
      myIpResult.textContent = t('geoError');
    } finally {
      btnMyIp.disabled = false;
    }
  });

  btnMyLocalIp?.addEventListener('click', async () => {
    myLocalIpResult.className = 'status-loading';
    myLocalIpResult.textContent = t('loading');
    btnCopyMyLocalIp.classList.add('initially-hidden');
    btnUseMyLocalIp.classList.add('initially-hidden');
    btnMyLocalIp.disabled = true;

    try {
      const localIP = await detectLocalIP();
      myLocalIpResult.className = 'status-ok';
      myLocalIpResult.textContent = localIP;

      btnCopyMyLocalIp.classList.remove('initially-hidden');
      btnCopyMyLocalIp.onclick = () => {
        navigator.clipboard?.writeText(localIP);
        btnCopyMyLocalIp.textContent = '✔ OK';
        setTimeout(() => { btnCopyMyLocalIp.textContent = t('btnCopy'); }, 1500);
      };

      btnUseMyLocalIp.classList.remove('initially-hidden');
      btnUseMyLocalIp.onclick = () => {
        const parts = localIP.split('.').map(Number);
        setIP('f', `${parts[0]}.${parts[1]}.${parts[2]}.1`);
        setIP('t', `${parts[0]}.${parts[1]}.${parts[2]}.254`);
      };
    } catch (error) {
      myLocalIpResult.className = 'status-error';
      myLocalIpResult.textContent = /RTCPeerConnection unavailable/i.test(String(error && error.message || ''))
        ? t('localDetectUnsupported')
        : t('localIpDetectError');
    } finally {
      btnMyLocalIp.disabled = false;
    }
  });

  btnLocalSubnets?.addEventListener('click', async () => {
    localSubnetsResult.className = 'status-loading';
    localSubnetsResult.textContent = t('loading');
    localSubnetSelect.classList.add('initially-hidden');
    btnUseLocalSubnet.classList.add('initially-hidden');
    btnLocalSubnets.disabled = true;

    try {
      const subnets = await detectLocalSubnets();
      if (!subnets.length) {
        localSubnetsResult.className = 'status-error';
        localSubnetsResult.textContent = t('localSubnetsNone');
        return;
      }

      localSubnetSelect.innerHTML = '';
      subnets.forEach((base) => {
        const opt = document.createElement('option');
        opt.value = base;
        opt.textContent = `${base}.0/24`;
        localSubnetSelect.appendChild(opt);
      });

      localSubnetsResult.className = 'status-ok';
      localSubnetsResult.textContent = t('localSubnetsFound', subnets.length);
      localSubnetSelect.classList.remove('initially-hidden');
      btnUseLocalSubnet.classList.remove('initially-hidden');

      btnUseLocalSubnet.onclick = () => {
        const base = localSubnetSelect.value;
        if (!base) return;
        setIP('f', `${base}.1`);
        setIP('t', `${base}.254`);
        setStatus(`Range set: ${base}.1 - ${base}.254`, 'ok');
      };
    } catch {
      localSubnetsResult.className = 'status-error';
      localSubnetsResult.textContent = t('localIpDetectError');
    } finally {
      btnLocalSubnets.disabled = false;
    }
  });
})();
