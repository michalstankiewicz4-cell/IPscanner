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
  // { from, to } - or null if the CIDR string is malformed. Used to let the
  // "IP Range" section's CIDR mode feed the same #v1ScanFrom/#v1ScanTo
  // hidden inputs the From/To octet boxes already write to.
  function cidrToRange(cidrStr) {
    var match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(String(cidrStr || "").trim());
    if (!match) return null;
    var octets = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
    if (octets.some(function (o) { return o < 0 || o > 255; })) return null;
    var prefix = Number(match[5]);
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

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.utils = window.NetReconNewUICore.utils || {};
  window.NetReconNewUICore.utils.net = {
    isValidIpv4: isValidIpv4,
    isValidEmail: isValidEmail,
    lookupPortService: lookupPortService,
    cidrToRange: cidrToRange,
  };
})();
