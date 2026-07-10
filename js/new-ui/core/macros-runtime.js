(function () {
  // Fixed, curated list - not a user-extensible CRUD engine. Each macro
  // reproduces the identical effect of clicking one of the real
  // [data-scanner-action] Detect buttons (see runMacro below); there are
  // exactly 3 real targets to shortcut today, nothing more.
  var MACROS = [
    { id: "ext-ip", scannerAction: "ext-ip", nameKey: "macroExtIpName", iconGlyph: "🌐" },
    { id: "local-ip", scannerAction: "local-ip", nameKey: "macroLocalIpName", iconGlyph: "🖥" },
    { id: "subnets", scannerAction: "subnets", nameKey: "macroSubnetsName", iconGlyph: "🔗" },
  ];

  function getMacros() {
    return MACROS.map(function (m) {
      return { id: m.id, scannerAction: m.scannerAction, nameKey: m.nameKey, iconGlyph: m.iconGlyph };
    });
  }

  function getMacro(macroId) {
    return MACROS.find(function (m) { return m.id === macroId; }) || null;
  }

  // Synthetic click on the real detect button - identical effect to the
  // user clicking it directly, since bindScannerActions() (navigation-
  // runtime.js) binds real addEventListener("click", ...) on that exact
  // element, not delegation checking event.target from a distant ancestor.
  function runMacro(macroId) {
    var macro = getMacro(macroId);
    if (!macro) return false;
    var btn = document.querySelector('[data-scanner-action="' + macro.scannerAction + '"]');
    if (!btn) return false;
    btn.click();
    return true;
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.macros = {
    getMacros: getMacros,
    getMacro: getMacro,
    runMacro: runMacro,
  };
})();
