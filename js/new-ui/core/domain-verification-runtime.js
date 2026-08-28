(function () {
  // Domain ownership verification (Options > General > Domain
  // verification): a local, self-enforced gate - NOT a hard security
  // control - proving the user can place a file at a domain's root before
  // features that act on someone else's site (Browser Inspect,
  // eventually - not wired up yet, that's a separate follow-up) are
  // allowed to target it. One file_name/key pair is generated for the
  // whole app (not per-domain); the same file gets uploaded to the root
  // of every site the user wants to use those features on, and each
  // domain is checked independently against it via verify_domain_file in
  // Rust (a plain browser fetch() would hit CORS on almost any real
  // site). Regenerating the key clears every previously-verified domain -
  // they were proven against the OLD file, which no longer matches what
  // this app now expects uploaded, so leaving them "verified" would be a
  // stale, no-longer-provable claim.
  var STORAGE_KEY = "netrecon_domain_verification_v1";

  function emptyState() {
    return { fileName: "", key: "", generatedAt: 0, verifiedDomains: [] };
  }

  function randomHex(byteCount) {
    var arr = new Uint8Array(byteCount);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(arr);
    } else {
      for (var i = 0; i < byteCount; i++) arr[i] = Math.floor(Math.random() * 256);
    }
    return Array.prototype.map.call(arr, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }

  function cloneVerifiedDomains(list) {
    return (Array.isArray(list) ? list : []).map(function (d) {
      d = d || {};
      return { domain: String(d.domain || ""), verifiedAt: Number(d.verifiedAt) || 0 };
    }).filter(function (d) { return !!d.domain; });
  }

  function cloneState(input) {
    input = input || {};
    return {
      fileName: String(input.fileName || ""),
      key: String(input.key || ""),
      generatedAt: Number(input.generatedAt) || 0,
      verifiedDomains: cloneVerifiedDomains(input.verifiedDomains),
    };
  }

  function loadState() {
    try {
      var raw = window.localStorage ? window.localStorage.getItem(STORAGE_KEY) : "";
      if (!raw) return emptyState();
      return cloneState(JSON.parse(raw));
    } catch (_) {
      return emptyState();
    }
  }

  function saveState(state) {
    try {
      if (window.localStorage) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // ignore persistence failures
    }
  }

  var currentState = loadState();

  function emitChanged() {
    try {
      document.dispatchEvent(new CustomEvent("newui:domain-verification-changed", { detail: getState() }));
    } catch (_) {
      // ignore event dispatch failures
    }
  }

  function getState() { return cloneState(currentState); }

  // Bare host only - strips scheme, path, and a trailing slash, so
  // "https://Example.com/foo" and "example.com" are treated as the same
  // domain both when verifying and when looking a domain up afterward.
  function normalizeDomain(input) {
    return String(input || "").trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/\/.*$/, "");
  }

  function generateKey() {
    currentState = {
      fileName: randomHex(6) + ".txt",
      key: randomHex(20),
      generatedAt: Date.now(),
      verifiedDomains: [],
    };
    saveState(currentState);
    emitChanged();
    return getState();
  }

  function isDomainVerified(domain) {
    var norm = normalizeDomain(domain);
    if (!norm) return false;
    return currentState.verifiedDomains.some(function (d) { return d.domain === norm; });
  }

  function removeDomain(domain) {
    var norm = normalizeDomain(domain);
    currentState.verifiedDomains = currentState.verifiedDomains.filter(function (d) { return d.domain !== norm; });
    saveState(currentState);
    emitChanged();
  }

  // Resolves to { matched, httpStatus, error } - never rejects, so call
  // sites can always just render the result. matched=true also records
  // the domain as verified (deduped) before resolving.
  function verifyDomain(domain) {
    var norm = normalizeDomain(domain);
    if (!norm) return Promise.resolve({ matched: false, error: "empty" });
    if (!currentState.fileName || !currentState.key) return Promise.resolve({ matched: false, error: "no-key" });

    var platform = window.NetReconNewUICore && window.NetReconNewUICore.platform;
    if (!platform || !platform.isDesktop || !platform.isDesktop()) return Promise.resolve({ matched: false, error: "desktop-only" });

    return Promise.resolve(platform.invoke("verify_domain_file", {
      domain: norm,
      fileName: currentState.fileName,
      expectedKey: currentState.key,
    })).then(function (result) {
      result = result || {};
      if (result.matched) {
        var already = currentState.verifiedDomains.some(function (d) { return d.domain === norm; });
        if (!already) {
          currentState.verifiedDomains.push({ domain: norm, verifiedAt: Date.now() });
          saveState(currentState);
          emitChanged();
        }
      }
      return { matched: !!result.matched, httpStatus: result.http_status || null, error: result.error || null };
    }).catch(function (e) {
      return { matched: false, httpStatus: null, error: (e && e.message) ? e.message : String(e) };
    });
  }

  // Session file round-trip - same shape as HTTPS Auditor's own
  // getHistoryForSession()/restoreHistoryFromSession() pair in
  // https-auditor-runtime.js, consumed by session-runtime.js.
  function getStateForSession() { return getState(); }

  function restoreFromSession(data) {
    currentState = cloneState(data);
    saveState(currentState);
    emitChanged();
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.domainVerification = {
    getState: getState,
    generateKey: generateKey,
    verifyDomain: verifyDomain,
    removeDomain: removeDomain,
    isDomainVerified: isDomainVerified,
    normalizeDomain: normalizeDomain,
    getStateForSession: getStateForSession,
    restoreFromSession: restoreFromSession,
  };
})();
