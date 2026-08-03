(function () {
  // addon: IP Scanner Heuristic JS's own program - the 5 client-side probe
  // techniques below (fetch/img/link/websocket/iframe) are pure browser JS,
  // no Tauri/native backend involved, so they work identically on desktop
  // and real www. None of them can do what a real scanner does:
  //   - No raw TCP/SYN - only a protocol-level connection attempt
  //     (HTTP/WS), so this is "does something answer in this style", not
  //     a real port scan.
  //   - Browsers hard-block a fixed list of ports (mail/news/IRC ports
  //     etc., e.g. 21/22/23/25) at the network-stack level, for ANY of
  //     these techniques, regardless of whether something real is
  //     listening there - DEFAULT_PORTS below is chosen to exclude those.
  //   - CORS/same-origin means you can detect IF/how fast something
  //     answered, never read the actual response content.
  //   - Mixed content: an HTTPS page can't attempt plain http:///ws://
  //     targets at all - probeScheme() below matches the CURRENT page's
  //     scheme to avoid guaranteed blocking, but that then means a
  //     plain-HTTP-only service gets probed over https/wss and likely
  //     reports closed even if it's open. A local file:// page (or plain
  //     HTTP) has none of this restriction - the most reliable choice for
  //     these 5 techniques.
  var DEFAULT_PORTS = [80, 443, 445, 3306, 3389, 5432, 8080, 8443];
  var DEFAULT_TIMEOUT_MS = 1500;
  var SECURE_PORTS = [443, 8443];

  function probeScheme(port, secureScheme, plainScheme) {
    var pageIsSecure = typeof window !== "undefined" && window.location && window.location.protocol === "https:";
    var portWantsSecure = SECURE_PORTS.indexOf(port) !== -1;
    return (pageIsSecure || portWantsSecure) ? secureScheme : plainScheme;
  }

  // fetch: a no-cors request only resolves if SOMETHING answered on that
  // host:port within the timeout - can't read the response (no-cors
  // hides it), so this only tells you "open" vs "no answer", and only
  // works at all for ports that speak enough HTTP to send a response
  // (a bare TCP listener that never replies looks identical to closed).
  function fetchPortProbe(host, port, timeoutMs) {
    return new Promise(function (resolve) {
      var settled = false;
      var controller = (typeof AbortController === "function") ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        if (controller) controller.abort();
        resolve(false);
      }, timeoutMs);
      var url = probeScheme(port, "https://", "http://") + host + ":" + port + "/?_probe=" + Date.now();
      fetch(url, { mode: "no-cors", cache: "no-store", signal: controller ? controller.signal : undefined })
        .then(function () {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(true);
        })
        .catch(function () {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(false);
        });
    });
  }

  // img: loading an <img> isn't subject to CORS at all (unlike fetch), so
  // it can at least attempt any port, not just HTTP-ish ones - but it's a
  // cruder signal: both onload (valid image) AND onerror (got SOME
  // response back, just not a decodable image - still proves something
  // is listening and talking) count as "open"; only a full timeout with
  // neither event firing counts as "closed". A closed/filtered port and a
  // port that's open but silent are indistinguishable here - an honest
  // limitation of the technique, not a bug.
  function imgPortProbe(host, port, timeoutMs) {
    return new Promise(function (resolve) {
      var settled = false;
      var img = new Image();
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        img.src = "";
        resolve(false);
      }, timeoutMs);
      function finish(open) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(open);
      }
      img.onload = function () { finish(true); };
      img.onerror = function () { finish(true); };
      img.src = probeScheme(port, "https://", "http://") + host + ":" + port + "/?_probe=" + Date.now() + "-" + Math.random();
    });
  }

  // link/CSS: same onload/onerror-both-mean-open idea as img, using a
  // stylesheet <link> instead - practically identical accuracy profile,
  // offered as an alternative in case a target/network treats image and
  // stylesheet requests differently (e.g. some proxies/filters).
  function linkPortProbe(host, port, timeoutMs) {
    return new Promise(function (resolve) {
      var settled = false;
      var link = document.createElement("link");
      link.rel = "stylesheet";
      function cleanup() {
        if (link.parentNode) link.parentNode.removeChild(link);
      }
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(false);
      }, timeoutMs);
      function finish(open) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        resolve(open);
      }
      link.onload = function () { finish(true); };
      link.onerror = function () { finish(true); };
      link.href = probeScheme(port, "https://", "http://") + host + ":" + port + "/?_probe=" + Date.now() + "-" + Math.random();
      document.head.appendChild(link);
    });
  }

  // WebSocket: needs the target to actually complete an HTTP Upgrade
  // handshake, not just accept a TCP connection - a real, deliberately
  // conservative signal. Unlike img/link/iframe, onerror/onclose here is
  // NOT treated as "open": a genuinely closed port and an open port that
  // doesn't speak WebSocket both surface as the same generic error event
  // (browsers don't expose the difference to JS), so only a real onopen
  // counts - this technique likely UNDER-reports open (non-WS) ports
  // rather than over-reporting, the safer bias for a security tool.
  function websocketPortProbe(host, port, timeoutMs) {
    return new Promise(function (resolve) {
      var settled = false;
      var ws = null;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        try { if (ws) ws.close(); } catch (_) { /* ignore */ }
        resolve(false);
      }, timeoutMs);
      function finish(open) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { if (ws) ws.close(); } catch (_) { /* ignore */ }
        resolve(open);
      }
      try {
        ws = new WebSocket(probeScheme(port, "wss://", "ws://") + host + ":" + port + "/");
        ws.onopen = function () { finish(true); };
        ws.onerror = function () { finish(false); };
        ws.onclose = function () { finish(false); };
      } catch (_) {
        finish(false);
      }
    });
  }

  // iframe: sandbox="" (the most restrictive setting - no scripts, forms,
  // same-origin, popups) so a hostile/compromised target can't run
  // anything even though it's briefly loaded - this technique only ever
  // reads the load/error EVENT, never the frame's content. Same
  // onload/onerror-both-mean-open profile as img/link.
  function iframePortProbe(host, port, timeoutMs) {
    return new Promise(function (resolve) {
      var settled = false;
      var iframe = document.createElement("iframe");
      iframe.setAttribute("sandbox", "");
      iframe.style.display = "none";
      function cleanup() {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(false);
      }, timeoutMs);
      function finish(open) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        resolve(open);
      }
      iframe.onload = function () { finish(true); };
      iframe.onerror = function () { finish(true); };
      iframe.src = probeScheme(port, "https://", "http://") + host + ":" + port + "/?_probe=" + Date.now() + "-" + Math.random();
      document.body.appendChild(iframe);
    });
  }

  // Reads a user-editable "ports" field value (comma/whitespace-separated,
  // e.g. "80, 443, 8080") instead of the fixed DEFAULT_PORTS list - falls
  // back to DEFAULT_PORTS whenever the field is missing/empty or ends up
  // with nothing valid in it (blank field, or a target typed over the
  // ports box by mistake), so a command never silently scans zero ports.
  function parsePortsArg(raw) {
    var text = typeof raw === "string" ? raw : "";
    var parsed = text.split(/[,\s]+/).map(function (piece) {
      return parseInt(piece, 10);
    }).filter(function (n) {
      return Number.isInteger(n) && n >= 1 && n <= 65535;
    });
    return parsed.length ? parsed : DEFAULT_PORTS;
  }

  function makeHandler(probeFn) {
    return function (args) {
      var target = args && args.target ? String(args.target) : "";
      if (!target) return Promise.resolve("[]");
      var probePorts = parsePortsArg(args && args.ports);
      return Promise.all(probePorts.map(function (port) {
        return probeFn(target, port, DEFAULT_TIMEOUT_MS).then(function (open) {
          return { ip: target, port: port, open: open };
        });
      })).then(function (rows) { return JSON.stringify(rows); });
    };
  }

  if (window.NetReconNewUI && typeof window.NetReconNewUI.registerAddonCommands === "function") {
    window.NetReconNewUI.registerAddonCommands("ip-scanner-heuristic-js", {
      heuristicScanPortsFetch: makeHandler(fetchPortProbe),
      heuristicScanPortsImg: makeHandler(imgPortProbe),
      heuristicScanPortsLink: makeHandler(linkPortProbe),
      heuristicScanPortsWebsocket: makeHandler(websocketPortProbe),
      heuristicScanPortsIframe: makeHandler(iframePortProbe),
    });
  }
})();
