(function () {
  var SKIN_KEY = "netrecon_newui_skin";
  var DEFAULT_SKIN = "default";

  function getCurrentSkin() {
    return localStorage.getItem(SKIN_KEY) || DEFAULT_SKIN;
  }

  function skinHref(name) {
    return "css/new-ui/skins/" + name + ".css";
  }

  function applySkin(name) {
    var skin = name || DEFAULT_SKIN;
    var link = document.getElementById("newUiSkinLink");
    if (!link) return skin;

    link.setAttribute("href", skinHref(skin));
    localStorage.setItem(SKIN_KEY, skin);
    document.documentElement.setAttribute("data-newui-skin", skin);
    return skin;
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.theme = {
    getCurrentSkin: getCurrentSkin,
    applySkin: applySkin,
    DEFAULT_SKIN: DEFAULT_SKIN,
  };
})();
