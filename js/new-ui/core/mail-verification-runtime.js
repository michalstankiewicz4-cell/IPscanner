(function () {
  // Mailbox ownership verification (Options > General > Mail verification):
  // same self-enforced-gate idea as domain-verification-runtime.js, but
  // proven by sending yourself a one-time code instead of uploading a file.
  // Sending reuses Mail XSS Tester's own Gmail/tunnel infrastructure
  // (send_test_email + the shared beacon tunnel in mail-xss-tester-runtime.js)
  // rather than a second, tunnel-free SMTP path - deliberately, so there is
  // only ever one mail-sending mechanism in the app to reason about. Once a
  // mailbox is verified it can be picked as Mail XSS Tester's "Send to"
  // address (see wireMailXssTesterLibrary in panel-interactions-runtime.js) -
  // that field is locked to verified addresses only, same as this feature's
  // whole point: proving you actually own the mailbox you're about to send
  // XSS-probe emails to.
  var STORAGE_KEY = "netrecon_mail_verification_v1";

  function emptyState() {
    return { verifiedEmails: [] };
  }

  function cloneVerifiedEmails(list) {
    return (Array.isArray(list) ? list : []).map(function (e) {
      e = e || {};
      return { email: String(e.email || ""), verifiedAt: Number(e.verifiedAt) || 0 };
    }).filter(function (e) { return !!e.email; });
  }

  function cloneState(input) {
    input = input || {};
    return { verifiedEmails: cloneVerifiedEmails(input.verifiedEmails) };
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
  // The in-flight send/verify code exchange is short-lived (send, check
  // inbox, type it back within minutes) and never needs to survive an app
  // restart, unlike the domain-verification key/file pair - kept purely in
  // memory, not localStorage, so a stale unconfirmed code never lingers on
  // disk.
  var pendingEmail = "";
  var pendingCode = "";

  function emitChanged() {
    try {
      document.dispatchEvent(new CustomEvent("newui:mail-verification-changed", { detail: getState() }));
    } catch (_) {
      // ignore event dispatch failures
    }
  }

  function getState() { return cloneState(currentState); }

  function normalizeEmail(input) {
    return String(input || "").trim().toLowerCase();
  }

  function isEmailVerified(email) {
    var norm = normalizeEmail(email);
    if (!norm) return false;
    return currentState.verifiedEmails.some(function (e) { return e.email === norm; });
  }

  function removeEmail(email) {
    var norm = normalizeEmail(email);
    currentState.verifiedEmails = currentState.verifiedEmails.filter(function (e) { return e.email !== norm; });
    saveState(currentState);
    emitChanged();
  }

  function randomCode() {
    var arr = new Uint32Array(1);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(arr);
    } else {
      arr[0] = Math.floor(Math.random() * 1000000);
    }
    return String(arr[0] % 1000000).padStart(6, "0");
  }

  function getPendingEmail() { return pendingEmail; }

  // Resolves to { ok, error } - never rejects. On success, pendingEmail/
  // pendingCode are armed so a matching verifyCode() call can complete the
  // exchange, and newui:mail-verification-changed fires so the code input
  // shows up even if the caller's own UI reference went stale during the
  // real SMTP round trip (which can take several seconds - long enough for
  // the panel to have re-rendered in between).
  function sendCode(email, gmailAddress, appPassword) {
    var norm = normalizeEmail(email);
    if (!norm) return Promise.resolve({ ok: false, error: "empty" });

    var platform = window.NetReconNewUICore && window.NetReconNewUICore.platform;
    if (!platform || !platform.isDesktop || !platform.isDesktop()) return Promise.resolve({ ok: false, error: "desktop-only" });

    var mailXss = window.NetReconNewUICore && window.NetReconNewUICore.mailXssTester;
    if (!mailXss || mailXss.getTunnelStatus() !== "running") return Promise.resolve({ ok: false, error: "tunnel-not-running" });

    if (!gmailAddress || !appPassword) return Promise.resolve({ ok: false, error: "missing-credentials" });

    var code = randomCode();
    return Promise.resolve(platform.invoke("send_test_email", {
      gmailAddress: gmailAddress,
      appPassword: appPassword,
      to: norm,
      subject: "OSINT NET Auditor - mailbox verification code",
      htmlBody: "<p>Your verification code is: <b>" + code + "</b></p>",
    })).then(function () {
      pendingEmail = norm;
      pendingCode = code;
      emitChanged();
      return { ok: true };
    }).catch(function (e) {
      return { ok: false, error: (e && e.message) ? e.message : String(e) };
    });
  }

  // Resolves synchronously to { matched, email, error } - matched=true also
  // records the mailbox as verified (deduped) and fires
  // newui:mail-verified with the address, so Mail XSS Tester's "Send to"
  // field can pick it up live.
  function verifyCode(code) {
    if (!pendingEmail || !pendingCode) return { matched: false, error: "no-pending" };
    if (String(code || "").trim() !== pendingCode) return { matched: false, error: "mismatch" };

    var email = pendingEmail;
    var already = currentState.verifiedEmails.some(function (e) { return e.email === email; });
    if (!already) {
      currentState.verifiedEmails.push({ email: email, verifiedAt: Date.now() });
      saveState(currentState);
    }
    pendingEmail = "";
    pendingCode = "";
    emitChanged();
    try {
      document.dispatchEvent(new CustomEvent("newui:mail-verified", { detail: { email: email } }));
    } catch (_) {
      // ignore event dispatch failures
    }
    return { matched: true, email: email };
  }

  // Session file round-trip - same shape as domain-verification-runtime.js's
  // own pair, consumed by session-runtime.js.
  function getStateForSession() { return getState(); }

  function restoreFromSession(data) {
    currentState = cloneState(data);
    saveState(currentState);
    emitChanged();
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.mailVerification = {
    getState: getState,
    isEmailVerified: isEmailVerified,
    removeEmail: removeEmail,
    sendCode: sendCode,
    verifyCode: verifyCode,
    getPendingEmail: getPendingEmail,
    normalizeEmail: normalizeEmail,
    getStateForSession: getStateForSession,
    restoreFromSession: restoreFromSession,
  };
})();
