(function () {
  function isValidIpv4(value) {
    var parts = String(value || "").trim().split(".");
    if (parts.length !== 4) return false;
    return parts.every(function (part) {
      return /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255;
    });
  }

  function ipToInt(octets) {
    return (octets[0] * 16777216) + (octets[1] * 65536) + (octets[2] * 256) + octets[3];
  }

  function intToIp(n) {
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
  }

  // Parses "a.b.c.d/n" and returns the network's first/last address as
  // { from, to } - or null if the CIDR string is malformed. The "/n" part
  // is optional - a bare "a.b.c.d" is treated as "/32" (that one address
  // only), so typing a single IP into CIDR mode just scans that host
  // instead of being rejected for missing a prefix. Used to let the
  // "IP Range" section's CIDR mode feed the same #v1ScanFrom/#v1ScanTo
  // hidden inputs the From/To octet boxes already write to.
  function cidrToRange(cidrStr) {
    var match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/.exec(String(cidrStr || "").trim());
    if (!match) return null;
    var octets = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
    if (octets.some(function (o) { return o < 0 || o > 255; })) return null;
    var prefix = match[5] === undefined ? 32 : Number(match[5]);
    if (prefix < 0 || prefix > 32) return null;

    var ipInt = ipToInt(octets);
    var mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
    var network = (ipInt & mask) >>> 0;
    var broadcast = (network | (~mask >>> 0)) >>> 0;
    return { from: intToIp(network), to: intToIp(broadcast) };
  }

  // Curated, not exhaustive - covers this app's default port presets
  // (cameras/printers/routers/NAS/Windows-SMB, see presets-runtime.js) plus
  // the standard IANA ports most relevant to network recon.
  var WELL_KNOWN_PORTS = {
    20: "FTP-DATA", 21: "FTP", 22: "SSH", 23: "Telnet", 25: "SMTP",
    53: "DNS", 67: "DHCP", 68: "DHCP", 69: "TFTP", 80: "HTTP",
    110: "POP3", 111: "RPC", 123: "NTP", 135: "RPC", 139: "NetBIOS",
    143: "IMAP", 161: "SNMP", 389: "LDAP", 443: "HTTPS", 445: "SMB",
    465: "SMTPS", 514: "Syslog", 554: "RTSP", 587: "SMTP", 631: "IPP",
    993: "IMAPS", 995: "POP3S", 1433: "MSSQL", 1723: "PPTP", 1900: "UPnP",
    3000: "HTTP-dev", 3306: "MySQL", 3389: "RDP", 5000: "UPnP", 5001: "HTTP-alt",
    5432: "PostgreSQL", 5900: "VNC", 5985: "WinRM", 5986: "WinRM-SSL",
    6379: "Redis", 8000: "HTTP-alt", 8006: "Proxmox", 8080: "HTTP-alt",
    8081: "HTTP-alt", 8443: "HTTPS-alt", 8888: "HTTP-alt", 9000: "HTTP-alt",
    9090: "HTTP-alt", 9100: "JetDirect", 10000: "Webmin", 27017: "MongoDB",
    34567: "Dahua", 37777: "Dahua",
  };

  function lookupPortService(port) {
    var key = Number(port);
    if (!Number.isFinite(key)) return "";
    return WELL_KNOWN_PORTS[key] || "";
  }

  // Pragmatic, not RFC-5322-complete - same "good enough for a form
  // input, not a mail-server parser" philosophy as isValidIpv4 above.
  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  }

  // Shared freeform-text -> clean IPv4 list parser (one per line, or
  // separated by spaces/commas/semicolons). Used by the IP Extractor
  // (scanner-sidebar-runtime.js) - the Memory notepad uses
  // parseIpv4ListWithCidr below instead, so a CIDR block typed there also
  // gets recognized. Invalid tokens are silently dropped, matching the
  // Extractor's existing UX.
  function parseIpv4List(raw) {
    var tokens = String(raw || "").split(/[\s,;]+/).map(function (part) {
      return part.trim();
    }).filter(Boolean);
    var seen = new Set();
    var result = [];
    tokens.forEach(function (token) {
      if (!isValidIpv4(token) || seen.has(token)) return;
      seen.add(token);
      result.push(token);
    });
    return result;
  }

  // Same tokenizing as parseIpv4List above, but each token can ALSO be an
  // "a.b.c.d/n" CIDR block (or a bare "a.b.c.d", which cidrToRange treats
  // as /32) - expanded into every address in that range, deduped and
  // merged with any plain addresses in the same list. Used by the Memory
  // notepad (panel-interactions-runtime.js's wireMemoryTool,
  // panel-content-runtime.js's renderMemoryTool, ip-inputs-runtime.js's
  // sidebar mirror, and navigation-runtime.js's scan-start path) so typing
  // a subnet alongside hand-picked addresses just works. `maxTotal` caps
  // the returned list (default 2000, matching Memory mode's own existing
  // scan-size limit) - checked on every address added, INSIDE the
  // expansion loop, so a mistyped wide range (e.g. "10.0.0.0/8") can't
  // hang the UI on every keystroke; the resulting list is simply
  // truncated, same as parseIpv4List's callers already silently capped it
  // before this function existed.
  function parseIpv4ListWithCidr(raw, maxTotal) {
    var cap = Number.isFinite(maxTotal) && maxTotal > 0 ? maxTotal : 2000;
    var tokens = String(raw || "").split(/[\s,;]+/).map(function (part) {
      return part.trim();
    }).filter(Boolean);
    var seen = new Set();
    var result = [];
    for (var i = 0; i < tokens.length && result.length < cap; i++) {
      var range = cidrToRange(tokens[i]);
      if (!range) continue;
      var fromInt = ipToInt(range.from.split(".").map(Number));
      var toInt = ipToInt(range.to.split(".").map(Number));
      for (var n = fromInt; n <= toInt && result.length < cap; n++) {
        var ip = intToIp(n);
        if (seen.has(ip)) continue;
        seen.add(ip);
        result.push(ip);
      }
    }
    return result;
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.utils = window.NetReconNewUICore.utils || {};
  window.NetReconNewUICore.utils.net = {
    isValidIpv4: isValidIpv4,
    isValidEmail: isValidEmail,
    lookupPortService: lookupPortService,
    cidrToRange: cidrToRange,
    parseIpv4List: parseIpv4List,
    parseIpv4ListWithCidr: parseIpv4ListWithCidr,
  };
})();
