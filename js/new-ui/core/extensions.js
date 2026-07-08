(function () {
  var STORAGE_KEY = "netrecon_newui_extensions";

  function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function cloneObject(source) {
    return Object.assign({}, source || {});
  }

  function validateManifest(raw) {
    if (!isObject(raw)) {
      return { ok: false, error: "Manifest must be an object." };
    }

    var id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!id) {
      return { ok: false, error: "Manifest id is required." };
    }

    var name = typeof raw.name === "string" ? raw.name.trim() : id;
    var version = typeof raw.version === "string" ? raw.version.trim() : "0.0.0";
    var description = typeof raw.description === "string" ? raw.description.trim() : "";
    var contributions = isObject(raw.contributions) ? raw.contributions : {};
    var SUPPORTED_PERMISSIONS = ["powershell"];
    var permissions = Array.isArray(raw.permissions)
      ? raw.permissions.filter(function (p) { return SUPPORTED_PERMISSIONS.indexOf(p) !== -1; })
      : [];

    return {
      ok: true,
      manifest: {
        id: id,
        name: name,
        version: version,
        description: description,
        permissions: permissions,
        contributions: {
          tools: isObject(contributions.tools) ? cloneObject(contributions.tools) : {},
          menuActions: isObject(contributions.menuActions) ? cloneObject(contributions.menuActions) : {},
          i18n: isObject(contributions.i18n) ? cloneObject(contributions.i18n) : {},
          commands: isObject(contributions.commands) ? cloneObject(contributions.commands) : {},
          optionsMenu: isObject(contributions.optionsMenu) ? cloneObject(contributions.optionsMenu) : {}
        }
      }
    };
  }

  function createExtensionHost(options) {
    var opts = options || {};
    var baseTools = cloneObject(opts.baseTools);
    var baseMenuActions = cloneObject(opts.baseMenuActions);
    var tools = cloneObject(baseTools);
    var menuActions = cloneObject(baseMenuActions);
    var installed = [];
    var onLanguageContribution = typeof opts.onLanguageContribution === "function" ? opts.onLanguageContribution : null;
    var onResetLanguages = typeof opts.onResetLanguages === "function" ? opts.onResetLanguages : null;

    function rebuildContributions() {
      tools = cloneObject(baseTools);
      menuActions = cloneObject(baseMenuActions);

      if (onResetLanguages) {
        try {
          onResetLanguages();
        } catch (_) {}
      }

      installed.forEach(function (item) {
        applyContributions(item);
      });
    }

    function applyContributions(manifest) {
      var nextTools = manifest.contributions.tools;
      var nextMenuActions = manifest.contributions.menuActions;
      var nextI18n = manifest.contributions.i18n;

      Object.keys(nextTools).forEach(function (toolKey) {
        tools[toolKey] = nextTools[toolKey];
      });

      Object.keys(nextMenuActions).forEach(function (actionKey) {
        menuActions[actionKey] = nextMenuActions[actionKey];
      });

      if (onLanguageContribution) {
        Object.keys(nextI18n).forEach(function (langCode) {
          try {
            onLanguageContribution(langCode, nextI18n[langCode]);
          } catch (_) {}
        });
      }
    }

    function registerExtension(rawManifest) {
      var checked = validateManifest(rawManifest);
      if (!checked.ok) return checked;

      var manifest = checked.manifest;
      if (installed.some(function (item) { return item.id === manifest.id; })) {
        return { ok: false, error: "Extension already installed: " + manifest.id };
      }

      installed.push({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        permissions: manifest.permissions,
        contributions: manifest.contributions
      });

      rebuildContributions();
      return { ok: true, manifest: manifest };
    }

    function persist() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(installed));
      } catch (_) {}
    }

    function installExtension(rawManifest) {
      var result = registerExtension(rawManifest);
      if (result.ok) persist();
      return result;
    }

    function loadFromStorage() {
      var payload = null;
      try {
        payload = localStorage.getItem(STORAGE_KEY);
      } catch (_) {
        payload = null;
      }

      if (!payload) return [];

      var parsed = [];
      try {
        parsed = JSON.parse(payload) || [];
      } catch (_) {
        parsed = [];
      }

      if (!Array.isArray(parsed)) return [];

      var loaded = [];
      parsed.forEach(function (manifest) {
        var result = registerExtension(manifest);
        if (result.ok) loaded.push(result.manifest.id);
      });
      return loaded;
    }

    function uninstallExtension(id) {
      var targetId = typeof id === "string" ? id.trim() : "";
      if (!targetId) {
        return { ok: false, error: "Extension id is required." };
      }

      var beforeCount = installed.length;
      installed = installed.filter(function (item) {
        return item.id !== targetId;
      });

      if (installed.length === beforeCount) {
        return { ok: false, error: "Extension not found: " + targetId };
      }

      rebuildContributions();
      persist();
      return { ok: true, id: targetId };
    }

    function getTools() {
      return cloneObject(tools);
    }

    function getMenuActions() {
      return cloneObject(menuActions);
    }

    function listExtensions() {
      return installed.map(function (item) {
        return {
          id: item.id,
          name: item.name,
          version: item.version,
          description: item.description || ""
        };
      });
    }

    function getInstalledManifests() {
      return installed.map(function (item) {
        return {
          id: item.id,
          name: item.name,
          version: item.version,
          description: item.description || "",
          permissions: (item.permissions || []).slice(),
          contributions: item.contributions
        };
      });
    }

    return {
      installExtension: installExtension,
      uninstallExtension: uninstallExtension,
      loadFromStorage: loadFromStorage,
      getTools: getTools,
      getMenuActions: getMenuActions,
      listExtensions: listExtensions,
      getInstalledManifests: getInstalledManifests
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.extensions = {
    createExtensionHost: createExtensionHost,
    validateManifest: validateManifest
  };
})();
