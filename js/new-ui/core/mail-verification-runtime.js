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

  // Draft copies of this form's own sender fields (provider/address/
  // password) - same "read at use time, never persisted to disk" RAM-only
  // discipline as pendingEmail/pendingCode above, and the exact same
  // reason Mail XSS Tester keeps its own draftGmailAddress/draftAppPassword:
  // #v1ToolDetail (the whole "General" CS tab, this section included) gets
  // fully torn down and rebuilt via innerHTML on every center-tab switch
  // AND every UI language change (refreshActiveUI() in panels-runtime.js) -
  // without this, typing in Onet/Gmail credentials here and switching to
  // any other tab and back silently emptied both fields.
  var draftProvider = "gmail";
  var draftSenderAddress = "";
  var draftSenderPassword = "";

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

  // Deliberately no emitChanged() on any of these three - same reasoning
  // as Mail XSS Tester's own draft setters: they fire on every keystroke/
  // selection change, and re-rendering the whole shell each time would
  // fight the caret in the very field being typed into. The draft is only
  // ever read back on this section's own NEXT natural re-render.
  function getDraftProvider() { return draftProvider; }
  function setDraftProvider(value) { draftProvider = String(value || "gmail"); }
  function getDraftSenderAddress() { return draftSenderAddress; }
  function setDraftSenderAddress(value) { draftSenderAddress = String(value || ""); }
  function getDraftSenderPassword() { return draftSenderPassword; }
  function setDraftSenderPassword(value) { draftSenderPassword = String(value || ""); }

  // Resolves to { ok, error } - never rejects. On success, pendingEmail/
  // pendingCode are armed so a matching verifyCode() call can complete the
  // exchange, and newui:mail-verification-changed fires so the code input
  // shows up even if the caller's own UI reference went stale during the
  // real SMTP round trip (which can take several seconds - long enough for
  // the panel to have re-rendered in between).
  // smtpHost must match whichever provider gmailAddress/appPassword actually
  // belong to (this form's own provider dropdown, see
  // mailVerificationSection() in panel-content-runtime.js) - this used to be
  // hardcoded to Gmail's relay regardless of what was typed in, so filling
  // in Onet credentials and picking "Onet" still tried (and failed) to
  // authenticate them against smtp.gmail.com.
  //
  // Deliberately does NOT require Mail XSS Tester's tunnel to be running -
  // the verification code is a plain email with no beacon URL in it at all,
  // so unlike an actual XSS probe it never needs a publicly reachable
  // endpoint. That requirement used to be here purely because this feature
  // was originally tightly coupled to Mail XSS Tester's credentials/tunnel;
  // now that it has its own independent sender fields, gating it on an
  // unrelated tunnel's status was just an artificial blocker.
  function sendCode(email, gmailAddress, appPassword, smtpHost) {
    var norm = normalizeEmail(email);
    if (!norm) return Promise.resolve({ ok: false, error: "empty" });

    var platform = window.NetReconNewUICore && window.NetReconNewUICore.platform;
    if (!platform || !platform.isDesktop || !platform.isDesktop()) return Promise.resolve({ ok: false, error: "desktop-only" });

    if (!gmailAddress || !appPassword) return Promise.resolve({ ok: false, error: "missing-credentials" });

    var code = randomCode();
    return Promise.resolve(platform.invoke("send_test_email", {
      gmailAddress: gmailAddress,
      appPassword: appPassword,
      to: norm,
      subject: "OSINT NET Auditor - mailbox verification code",
      htmlBody: "<p>Your verification code is: <b>" + code + "</b></p>",
      smtpHost: smtpHost,
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
    getDraftProvider: getDraftProvider,
    setDraftProvider: setDraftProvider,
    getDraftSenderAddress: getDraftSenderAddress,
    setDraftSenderAddress: setDraftSenderAddress,
    getDraftSenderPassword: getDraftSenderPassword,
    setDraftSenderPassword: setDraftSenderPassword,
  };
})();
