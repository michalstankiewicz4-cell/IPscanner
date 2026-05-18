(function () {
  function createMenuRuntime(deps) {
    var tr = deps.tr;
    var uiDefinitions = deps.uiDefinitions || { menuGroups: {}, menuActions: {}, panelDefinitions: {} };
    var getActionMap = deps.getActionMap;
    var setStatusLine = deps.setStatusLine;
    var onOpenExtensionManager = deps.onOpenExtensionManager;
    var onOpenLanguageManager = deps.onOpenLanguageManager;
    var onSwitchTool = deps.onSwitchTool;

    function actionDefinition(action) {
      return (uiDefinitions.menuActions && uiDefinitions.menuActions[action]) || null;
    }

    function runMenuAction(action) {
      var actionMap = getActionMap ? getActionMap() : {};
      var label = action && actionMap[action] ? actionMap[action] : action;
      var def = actionDefinition(action);
      var behavior = def && def.behavior ? def.behavior : "status";

      if (behavior === "open-extension-manager") {
        if (onOpenExtensionManager) onOpenExtensionManager("extensions");
        return;
      }

      if (behavior === "open-language-manager") {
        if (onOpenLanguageManager) onOpenLanguageManager("languages");
        return;
      }

      if (behavior.indexOf("switch-tool:") === 0) {
        var tool = behavior.slice("switch-tool:".length);
        if (tool && onSwitchTool) onSwitchTool(tool);
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + label);
        return;
      }

      if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + label);
    }

    function applyMenuAndPanelDefinitions() {
      Object.keys(uiDefinitions.menuGroups || {}).forEach(function (menuKey) {
        var trigger = document.querySelector('[data-menu="' + menuKey + '"] .v1-menu-trigger');
        var def = uiDefinitions.menuGroups[menuKey];
        if (!trigger || !def || !def.purpose) return;
        trigger.setAttribute("title", def.purpose);
        trigger.setAttribute("aria-label", trigger.textContent + " - " + def.purpose);
      });

      Object.keys(uiDefinitions.menuActions || {}).forEach(function (actionKey) {
        var def = uiDefinitions.menuActions[actionKey];
        if (!def || !def.purpose) return;
        document.querySelectorAll('[data-menu-action="' + actionKey + '"]').forEach(function (item) {
          item.setAttribute("title", def.purpose);
          item.setAttribute("aria-label", def.purpose);
        });
      });

      Object.keys(uiDefinitions.panelDefinitions || {}).forEach(function (panelKey) {
        var panelDef = uiDefinitions.panelDefinitions[panelKey];
        if (!panelDef || !panelDef.selector || !panelDef.purpose) return;
        var panel = document.querySelector(panelDef.selector);
        if (!panel) return;
        panel.setAttribute("title", panelDef.purpose);
        panel.setAttribute("aria-label", panelDef.purpose);
      });
    }

    function initMenuBar() {
      var menubar = document.getElementById("v1Menubar");
      if (!menubar) return;

      var groups = Array.from(menubar.querySelectorAll(".v1-menu-group"));

      function closeAllMenus() {
        groups.forEach(function (group) { group.classList.remove("open"); });
      }

      function openMenu(group) {
        closeAllMenus();
        group.classList.add("open");
      }

      groups.forEach(function (group) {
        var trigger = group.querySelector(".v1-menu-trigger");
        if (!trigger) return;

        trigger.addEventListener("click", function (event) {
          event.stopPropagation();
          var willOpen = !group.classList.contains("open");
          closeAllMenus();
          if (willOpen) group.classList.add("open");
        });

        group.addEventListener("mouseenter", function () {
          var opened = groups.some(function (g) { return g.classList.contains("open"); });
          if (!opened) return;
          openMenu(group);
        });
      });

      document.addEventListener("click", function (event) {
        if (menubar.contains(event.target)) return;
        closeAllMenus();
      });

      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") closeAllMenus();
      });

      menubar.querySelectorAll(".v1-menu-dd-item").forEach(function (item) {
        item.addEventListener("click", function () {
          closeAllMenus();
        });
      });
    }

    function initMenuActions() {
      document.querySelectorAll("[data-menu-action]").forEach(function (item) {
        item.addEventListener("click", function () {
          var action = item.getAttribute("data-menu-action");
          if (!action) return;
          runMenuAction(action);
        });
      });
    }

    return {
      initMenuBar: initMenuBar,
      initMenuActions: initMenuActions,
      applyMenuAndPanelDefinitions: applyMenuAndPanelDefinitions,
      runMenuAction: runMenuAction,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createMenuRuntime = createMenuRuntime;
})();
