(function () {
  function isValidIpv4(value) {
    var parts = String(value || "").trim().split(".");
    if (parts.length !== 4) return false;
    return parts.every(function (part) {
      return /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255;
    });
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

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.utils = window.NetReconNewUICore.utils || {};
  window.NetReconNewUICore.utils.net = {
    isValidIpv4: isValidIpv4,
    lookupPortService: lookupPortService,
  };
})();
