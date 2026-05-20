(function () {
  function isValidIpv4(value) {
    var parts = String(value || "").trim().split(".");
    if (parts.length !== 4) return false;
    return parts.every(function (part) {
      return /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255;
    });
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.utils = window.NetReconNewUICore.utils || {};
  window.NetReconNewUICore.utils.net = {
    isValidIpv4: isValidIpv4,
  };
})();
