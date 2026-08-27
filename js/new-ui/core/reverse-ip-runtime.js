(function () {
  // Reverse IP Lookup: type an IP, get back its reverse-DNS (PTR) hostname
  // and every other domain historically seen resolving to that address.
  // Both lookups run entirely client-side (no Rust backend, no CORS
  // problem - see tool-catalog.js's comment) so this works identically on
  // desktop and www.
  //
  // PTR via Cloudflare's DNS-over-HTTPS JSON API: a PTR record only ever
  // exists for the REVERSED IP inside the special in-addr.arpa zone (e.g.
  // 8.8.8.8 -> "8.8.8.8.in-addr.arpa"), and it's set by whoever controls
  // the IP block (almost always the hosting provider/ISP) - useful, but
  // rarely the actual site's own domain name.
  //
  // "Other domains" via HackerTarget's reverseiplookup API: a free,
  // rate-limited passive-DNS lookup - every domain the service has ever
  // seen resolve to this IP, which is what actually answers "what's
  // hosted here" for shared hosting. Plain-text response, one domain per
  // line; error/quota messages come back as plain text too (no distinct
  // HTTP status), so they're detected by shape rather than status code.
  //
  // "IP ownership" via RDAP (the modern, structured successor to WHOIS) -
  // rdap.org bootstraps to whichever regional registry (ARIN/RIPE/APNIC/
  // LACNIC/AfriNIC) actually holds the record for this IP and redirects
  // there; both hops send CORS headers, so a plain fetch() follows it
  // automatically. Gives the org name/network range/handle that owns
  // this IP block - complementary to the domain list above, not a
  // replacement (an IP's owner and the domains hosted on it are
  // different questions).

  function isValidIPv4(ip) {
    var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip || "").trim());
    if (!m) return false;
    for (var i = 1; i <= 4; i++) {
      var n = parseInt(m[i], 10);
      if (n < 0 || n > 255 || String(n) !== m[i].replace(/^0+(?=\d)/, "")) return false;
    }
    return true;
  }

  function reverseIPv4ForPtr(ip) {
    return ip.trim().split(".").reverse().join(".") + ".in-addr.arpa";
  }

  function createReverseIpRuntime() {
    var lastIp = "";
    var loading = false;
    var error = "";

    var ptrHostname = null; // null = not looked up / none found
    var domains = null; // array of strings, or null
    var domainsNote = ""; // set when HackerTarget returns an error/quota message instead of a domain list
    var ownership = null; // { orgName, name, handle, range, country } or null
    var ownershipNote = ""; // set when RDAP has nothing / the request failed

    function emitChanged() {
      try {
        document.dispatchEvent(new CustomEvent("newui:reverse-ip-changed", {}));
      } catch (_) {
        // ignore event dispatch failures
      }
    }

    function getLastIp() { return lastIp; }
    function getLoading() { return loading; }
    function getError() { return error; }
    function getPtrHostname() { return ptrHostname; }
    function getDomains() { return domains; }
    function getDomainsNote() { return domainsNote; }
    function getOwnership() { return ownership; }
    function getOwnershipNote() { return ownershipNote; }

    function fetchPtr(ip) {
      var name = reverseIPv4ForPtr(ip);
      return fetch("https://cloudflare-dns.com/dns-query?name=" + encodeURIComponent(name) + "&type=PTR", {
        headers: { accept: "application/dns-json" },
      }).then(function (res) {
        if (!res.ok) throw new Error("DNS-over-HTTPS request failed: " + res.status);
        return res.json();
      }).then(function (data) {
        var answers = Array.isArray(data.Answer) ? data.Answer : [];
        var ptr = answers.filter(function (a) { return a.type === 12; })[0]; // type 12 = PTR
        return ptr ? String(ptr.data || "").replace(/\.$/, "") : null;
      });
    }

    // HackerTarget has no JSON mode for this endpoint - a genuine domain
    // list is one hostname-looking token per line; anything else (an
    // error sentence, an HTML error page, an empty body) is surfaced as a
    // note instead of being parsed as data.
    function looksLikeDomain(line) {
      return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(line.trim());
    }

    function fetchDomains(ip) {
      return fetch("https://api.hackertarget.com/reverseiplookup/?q=" + encodeURIComponent(ip)).then(function (res) {
        return res.text();
      }).then(function (text) {
        var lines = String(text || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
        var allLookLikeDomains = lines.length > 0 && lines.every(looksLikeDomain);
        if (allLookLikeDomains) {
          return { domains: lines, note: "" };
        }
        return { domains: [], note: lines.join(" ") || "" };
      });
    }

    // Pulls just the handful of RDAP fields worth showing - org name (from
    // the first entity's vCard "fn" property, RDAP's rather buried way of
    // encoding a plain name), the allocated range, and the registry's own
    // short network name/handle as a fallback when no org name is present
    // (some registries return org info under a nested "entities[].entities"
    // instead of top-level, e.g. RIPE - not chased here, a fallback name is
    // still useful on its own).
    function extractOwnership(data) {
      var orgName = "";
      var entity = Array.isArray(data.entities) ? data.entities[0] : null;
      var vcard = entity && Array.isArray(entity.vcardArray) ? entity.vcardArray[1] : null;
      if (Array.isArray(vcard)) {
        var fnEntry = vcard.filter(function (v) { return Array.isArray(v) && v[0] === "fn"; })[0];
        if (fnEntry) orgName = String(fnEntry[3] || "");
      }

      var range = "";
      if (Array.isArray(data.cidr0_cidrs) && data.cidr0_cidrs.length) {
        range = data.cidr0_cidrs.map(function (c) {
          var prefix = c.v4prefix || c.v6prefix || "";
          return prefix ? prefix + "/" + c.length : "";
        }).filter(Boolean).join(", ");
      } else if (data.startAddress && data.endAddress) {
        range = data.startAddress + " - " + data.endAddress;
      }

      return {
        orgName: orgName,
        name: String(data.name || ""),
        handle: String(data.handle || ""),
        range: range,
        country: String(data.country || ""),
      };
    }

    function fetchOwnership(ip) {
      return fetch("https://rdap.org/ip/" + encodeURIComponent(ip), {
        headers: { accept: "application/rdap+json" },
      }).then(function (res) {
        if (!res.ok) throw new Error("RDAP request failed: " + res.status);
        return res.json();
      }).then(function (data) {
        var result = extractOwnership(data);
        if (!result.orgName && !result.name && !result.range) {
          return { ownership: null, note: "no ownership data returned" };
        }
        return { ownership: result, note: "" };
      });
    }

    function runLookup(ip) {
      var trimmed = String(ip || "").trim();
      if (!isValidIPv4(trimmed)) {
        error = "invalid-ip";
        emitChanged();
        return;
      }

      lastIp = trimmed;
      loading = true;
      error = "";
      ptrHostname = null;
      domains = null;
      domainsNote = "";
      ownership = null;
      ownershipNote = "";
      emitChanged();

      Promise.allSettled([fetchPtr(trimmed), fetchDomains(trimmed), fetchOwnership(trimmed)]).then(function (results) {
        var ptrResult = results[0];
        var domainsResult = results[1];
        var ownershipResult = results[2];

        ptrHostname = ptrResult.status === "fulfilled" ? ptrResult.value : null;

        if (domainsResult.status === "fulfilled") {
          domains = domainsResult.value.domains;
          domainsNote = domainsResult.value.note;
        } else {
          domains = [];
          domainsNote = (domainsResult.reason && domainsResult.reason.message) ? domainsResult.reason.message : String(domainsResult.reason);
        }

        if (ownershipResult.status === "fulfilled") {
          ownership = ownershipResult.value.ownership;
          ownershipNote = ownershipResult.value.note;
        } else {
          ownership = null;
          ownershipNote = (ownershipResult.reason && ownershipResult.reason.message) ? ownershipResult.reason.message : String(ownershipResult.reason);
        }

        loading = false;
        emitChanged();
      });
    }

    return {
      getLastIp: getLastIp,
      getLoading: getLoading,
      getError: getError,
      getPtrHostname: getPtrHostname,
      getDomains: getDomains,
      getDomainsNote: getDomainsNote,
      getOwnership: getOwnership,
      getOwnershipNote: getOwnershipNote,
      runLookup: runLookup,
      isValidIPv4: isValidIPv4,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.reverseIp = createReverseIpRuntime();
})();
