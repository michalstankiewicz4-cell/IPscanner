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

  // Covers every real-world IPv6 form (full 8-group, "::" compression
  // anywhere, IPv4-embedded like "::ffff:192.168.1.1"), plus an optional
  // Windows zone/scope id suffix ("%9", "%13", ...) - link-local addresses
  // (fe80::/10) are only meaningful per network interface, and Windows
  // always reports/requires them in that "%<interface-index>" form (see
  // ipconfig's own output) - without this, a real link-local address
  // copy-pasted straight off a user's own machine would silently fail
  // validation. Same "good enough for a form input" philosophy as
  // isValidEmail above, not a full RFC 4291 parser.
  var IPV6_RE = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9]))$/;

  function isValidIpv6(value) {
    var v = String(value || "").trim();
    var zoneIdx = v.indexOf("%");
    if (zoneIdx === -1) return IPV6_RE.test(v);
    return IPV6_RE.test(v.slice(0, zoneIdx)) && /^[0-9a-zA-Z]{1,16}$/.test(v.slice(zoneIdx + 1));
  }

  // Shared freeform-text -> clean IPv4 list parser (one per line, or
  // separated by spaces/commas/semicolons). Used by the IP Extractor
  // (scanner-sidebar-runtime.js) - the Memory notepad uses parseMemoryIpList
  // below instead, so a CIDR block or an IPv6 address typed there also
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

  // Same tokenizing as parseIpv4List above, but a token can be an IPv6
  // address (bare, or with a Windows zone id like "fe80::1%9" for
  // link-local addresses) OR an IPv4 "a.b.c.d/n" CIDR block (a bare
  // "a.b.c.d" is treated as /32) - CIDR blocks get expanded into every
  // address in the range; IPv6 entries are kept exactly as typed, never
  // expanded as a range - an IPv6 /64 alone is 2^64 addresses, so
  // brute-forcing a subnet the way IPv4 CIDR does isn't remotely feasible,
  // only an explicit hand-picked IPv6 address makes sense here. Everything
  // dedupes into one merged list. Used by the Memory notepad
  // (panel-interactions-runtime.js's wireMemoryTool, panel-content-
  // runtime.js's renderMemoryTool, ip-inputs-runtime.js's sidebar mirror,
  // and navigation-runtime.js's scan-start path) so a mixed list of plain
  // IPs, a CIDR block, and IPv6 addresses all just work together.
  // `maxTotal` caps the returned list (default 2000, matching Memory
  // mode's own existing scan-size limit) - checked on every address added,
  // INSIDE the IPv4 expansion loop, so a mistyped wide range (e.g.
  // "10.0.0.0/8") can't hang the UI on every keystroke; the resulting list
  // is simply truncated.
  function parseMemoryIpList(raw, maxTotal) {
    var cap = Number.isFinite(maxTotal) && maxTotal > 0 ? maxTotal : 2000;
    var tokens = String(raw || "").split(/[\s,;]+/).map(function (part) {
      return part.trim();
    }).filter(Boolean);
    var seen = new Set();
    var result = [];
    for (var i = 0; i < tokens.length && result.length < cap; i++) {
      var token = tokens[i];
      if (isValidIpv6(token)) {
        if (!seen.has(token)) {
          seen.add(token);
          result.push(token);
        }
        continue;
      }
      var range = cidrToRange(token);
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
    isValidIpv6: isValidIpv6,
    parseMemoryIpList: parseMemoryIpList,
  };
})();
