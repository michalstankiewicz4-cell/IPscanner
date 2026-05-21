(function () {
  function createExtensionManagerRuntime(deps) {
    var tr = deps.tr;
    var extensionHost = deps.extensionHost;
    var i18n = deps.i18n;
    var applyStaticTranslations = deps.applyStaticTranslations;
    var setStatusLine = deps.setStatusLine;
    var setTooltips = deps.setTooltips;
    var refreshActiveUI = deps.refreshActiveUI;
    var switchTool = deps.switchTool;
    var getActiveTool = deps.getActiveTool;
    var hasTool = deps.hasTool;

    function elements() {
      return {
        root: document.getElementById("v1ExtModal"),
        manifest: document.getElementById("v1ExtManifest"),
        uninstallId: document.getElementById("v1ExtUninstallId"),
        langCode: document.getElementById("v1LangCode"),
        langDict: document.getElementById("v1LangDict"),
        output: document.getElementById("v1ExtOutput"),
        installBtn: document.getElementById("v1ExtInstallBtn"),
        listBtn: document.getElementById("v1ExtListBtn"),
        uninstallBtn: document.getElementById("v1ExtUninstallBtn"),
        langAddBtn: document.getElementById("v1LangAddBtn"),
        langActivateBtn: document.getElementById("v1LangActivateBtn"),
        langListBtn: document.getElementById("v1LangListBtn"),
        closeBtn: document.getElementById("v1ExtCloseBtn"),
        closeIconBtn: document.getElementById("v1ExtClose"),
      };
    }

    function defaultManifestText() {
      return "{\n  \"id\": \"com.example.demo\",\n  \"name\": \"Demo Extension\",\n  \"version\": \"0.1.0\",\n  \"contributions\": {\n    \"tools\": {},\n    \"menuActions\": {}\n  }\n}";
    }

    function writeOutput(text) {
      var els = elements();
      if (els.output) {
        els.output.textContent = text;
        els.output.scrollTop = 0;
      }
    }

    function close() {
      var els = elements();
      if (els.root) els.root.setAttribute("hidden", "hidden");
    }

    function isOpen() {
      var modal = document.getElementById("v1ExtModal");
      return !!modal && !modal.hasAttribute("hidden");
    }

    function open(section) {
      if (!extensionHost) {
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("extInstallFail") + " (host unavailable)");
        return;
      }

      var els = elements();
      if (!els.root) return;

      if (els.manifest && !els.manifest.value.trim()) {
        els.manifest.value = defaultManifestText();
      }

      if (els.langDict && !els.langDict.value.trim()) {
        els.langDict.value = "{\n  \"menuFile\": \"Datei\",\n  \"menuOptions\": \"Optionen\",\n  \"menuTools\": \"Werkzeuge\",\n  \"menuHelp\": \"Hilfe\"\n}";
      }

      els.root.removeAttribute("hidden");
      writeOutput(tr("extManagerReady"));
      if (section === "languages" && els.langCode) {
        els.langCode.focus();
        return;
      }
      if (els.manifest) els.manifest.focus();
    }

    function installExtensionFromModal() {
      var els = elements();
      if (!els.manifest) return;

      var manifest = null;
      try {
        manifest = JSON.parse(els.manifest.value || "{}");
      } catch (_) {
        writeOutput(tr("extInvalidJson"));
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("extInvalidJson"));
        return;
      }

      var result = extensionHost.installExtension(manifest);
      if (!result.ok) {
        writeOutput(tr("extInstallFail") + "\n" + result.error);
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("extInstallFail") + " - " + result.error);
        return;
      }

      if (setTooltips) setTooltips();
      if (refreshActiveUI) refreshActiveUI();
      writeOutput(tr("extInstallOk") + "\n" + result.manifest.id + "@" + result.manifest.version);
      if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("extInstallOk") + " - " + result.manifest.id);
    }

    function listExtensionsFromModal() {
      var list = extensionHost.listExtensions();
      if (!list.length) {
        writeOutput(tr("extListEmpty"));
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("extListEmpty"));
        return;
      }

      var lines = [tr("extListHeader") + ":"];
      list.forEach(function (item) {
        lines.push("- " + item.id + " @ " + item.version + " (" + item.name + ")");
      });

      writeOutput(lines.join("\n"));
      if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("extListHeader") + " - " + list.length);
    }

    function uninstallExtensionFromModal() {
      var els = elements();
      var id = els.uninstallId ? (els.uninstallId.value || "").trim() : "";
      if (!id) {
        writeOutput(tr("extUninstallPrompt"));
        return;
      }

      var result = extensionHost.uninstallExtension(id);
      if (!result.ok) {
        writeOutput(tr("extUninstallFail") + "\n" + result.error);
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("extUninstallFail") + " - " + result.error);
        return;
      }

      var current = getActiveTool ? getActiveTool() : "scan-runner";
      if (hasTool && !hasTool(current)) {
        if (switchTool) switchTool("scan-runner");
      } else {
        if (setTooltips) setTooltips();
        if (refreshActiveUI) refreshActiveUI();
      }

      writeOutput(tr("extUninstallOk") + "\n" + result.id);
      if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("extUninstallOk") + " - " + result.id);
    }

    function addLanguageFromModal() {
      var els = elements();
      if (!els.langCode || !els.langDict || !i18n || !i18n.addLanguage) return;

      var code = (els.langCode.value || "").trim();
      if (!code) {
        writeOutput(tr("langInvalidCode"));
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langAddFail") + " - " + tr("langInvalidCode"));
        return;
      }

      var dict = null;
      try {
        dict = JSON.parse(els.langDict.value || "{}");
      } catch (_) {
        writeOutput(tr("langInvalidDict"));
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langAddFail") + " - " + tr("langInvalidDict"));
        return;
      }

      var result = i18n.addLanguage(code, dict);
      if (!result.ok) {
        writeOutput(tr("langAddFail") + "\n" + result.error);
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langAddFail") + " - " + result.error);
        return;
      }

      writeOutput(tr("langAddOk") + "\n" + result.code);
      if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langAddOk") + " - " + result.code);
    }

    function activateLanguageFromModal() {
      var els = elements();
      if (!els.langCode || !i18n || !i18n.setLang) return;

      var code = (els.langCode.value || "").trim();
      if (!code) {
        writeOutput(tr("langInvalidCode"));
        return;
      }

      var before = i18n.getLang ? i18n.getLang() : "";
      var after = i18n.setLang(code);
      if (before === after && code.toLowerCase() !== after.toLowerCase()) {
        writeOutput(tr("langActivateFail") + "\n" + code);
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langActivateFail") + " - " + code);
        return;
      }

      if (applyStaticTranslations) applyStaticTranslations();
      if (setTooltips) setTooltips();
      if (refreshActiveUI) refreshActiveUI();
      writeOutput(tr("langActivateOk") + "\n" + after);
      if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langActivateOk") + " - " + after);
    }

    function listLanguagesFromModal() {
      var langs = i18n && i18n.listLanguages ? i18n.listLanguages() : [];
      if (!langs.length) {
        writeOutput(tr("langListHeader") + ": -");
        return;
      }

      writeOutput(tr("langListHeader") + ":\n- " + langs.join("\n- "));
    }

    function init() {
      var els = elements();
      if (!els.root) return;

      if (els.installBtn) els.installBtn.addEventListener("click", installExtensionFromModal);
      if (els.listBtn) els.listBtn.addEventListener("click", listExtensionsFromModal);
      if (els.uninstallBtn) els.uninstallBtn.addEventListener("click", uninstallExtensionFromModal);
      if (els.langAddBtn) els.langAddBtn.addEventListener("click", addLanguageFromModal);
      if (els.langActivateBtn) els.langActivateBtn.addEventListener("click", activateLanguageFromModal);
      if (els.langListBtn) els.langListBtn.addEventListener("click", listLanguagesFromModal);
      if (els.closeBtn) els.closeBtn.addEventListener("click", close);
      if (els.closeIconBtn) els.closeIconBtn.addEventListener("click", close);

      els.root.addEventListener("click", function (event) {
        if (event.target === els.root) close();
      });
    }

    return {
      init: init,
      open: open,
      close: close,
      isOpen: isOpen,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createExtensionManagerRuntime = createExtensionManagerRuntime;
})();
