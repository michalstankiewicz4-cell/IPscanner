(function () {
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Viewport-clamped positioning for a "fixed" popover anchored to a
  // trigger button - right-aligns to the trigger, flips above it if there's
  // more room up than down, and clamps both axes into the viewport with an
  // 8px margin. Was duplicated verbatim in panel-interactions-runtime.js
  // and panels-runtime.js (IP Results columns/filter menus, both docked
  // and detached-window copies) - shared here so a future fix to the
  // clamping/flip math only needs to happen once. Not used for
  // scanner-sidebar-runtime.js's profile-select dropdown, which
  // deliberately matches the trigger's width instead of the menu's own
  // content width - a real behavioral difference, not just a copy.
  function positionFloatingMenu(toggleBtn, menu) {
    if (!toggleBtn || !menu || menu.hasAttribute("hidden")) return;

    var margin = 8;
    var gap = 4;
    var viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
    var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 768;
    var triggerRect = toggleBtn.getBoundingClientRect();

    menu.style.position = "fixed";
    menu.style.left = "0px";
    menu.style.top = "0px";
    menu.style.visibility = "hidden";
    menu.style.maxHeight = "";
    menu.style.overflowY = "";

    var menuWidth = Math.max(220, Math.ceil(menu.offsetWidth || 0));
    var menuHeight = Math.max(160, Math.ceil(menu.offsetHeight || 0));
    var openUp = (triggerRect.bottom + gap + menuHeight + margin > viewportHeight)
      && (triggerRect.top - gap - menuHeight > margin);

    var top = openUp ? (triggerRect.top - menuHeight - gap) : (triggerRect.bottom + gap);
    var left = triggerRect.right - menuWidth;

    top = Math.max(margin, Math.min(top, viewportHeight - margin - menuHeight));
    left = Math.max(margin, Math.min(left, viewportWidth - margin - menuWidth));

    menu.style.left = Math.round(left) + "px";
    menu.style.top = Math.round(top) + "px";
    menu.style.maxHeight = Math.max(120, viewportHeight - margin - top) + "px";
    menu.style.overflowY = "auto";
    menu.style.visibility = "";
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.utils = window.NetReconNewUICore.utils || {};
  window.NetReconNewUICore.utils.dom = {
    escapeHtml: escapeHtml,
    positionFloatingMenu: positionFloatingMenu,
  };
})();
