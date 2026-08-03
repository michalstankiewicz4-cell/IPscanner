(function () {
  function createLanguageCatalogRuntime(deps) {
    var tr = deps.tr;
    var i18n = deps.i18n;
    var setStatusLine = deps.setStatusLine;
    var escapeHtml = deps.escapeHtml;
    var platform = deps.platform;

    // shell: Language Manager's "Import language" catalog - same repo/branch
    // as the tools/ catalog (addon-catalog-runtime.js), but pointed at
    // languages/ and simpler: no icon-file pairing (flag is a manifest
    // field, not a paired image) and no extensionHost/permissions
    // involvement (a language dictionary isn't an extension, just data).
    var CATALOG_OWNER = "michalstankiewicz4-cell";
    var CATALOG_REPO = "IPscanner";
    var CATALOG_BRANCH = "main";
    var LANG_CATALOG_FOLDER = "languages";
    var LANG_CATALOG_API_URL = "https://api.github.com/repos/" + CATALOG_OWNER + "/" + CATALOG_REPO + "/contents/" + LANG_CATALOG_FOLDER + "?ref=" + CATALOG_BRANCH;
    var langCatalogEntriesCache = null;
    var langCatalogFetchPromise = null;

    function fetchLanguageCatalog() {
      return fetch(LANG_CATALOG_API_URL).then(function (res) {
        if (!res.ok) throw new Error("GitHub API " + res.status);
        return res.json();
      }).then(function (files) {
        var jsonFiles = (Array.isArray(files) ? files : []).filter(function (f) {
          return f && f.type === "file" && typeof f.name === "string" && /\.json$/i.test(f.name);
        });
        return Promise.all(jsonFiles.map(function (f) {
          return fetch(f.download_url).then(function (r) { return r.json(); }).catch(function () { return null; });
        }));
      }).then(function (results) {
        return results.filter(function (m) {
          return m && typeof m === "object" && typeof m.code === "string" && m.code.trim();
        });
      });
    }

    // shell: returns the cached catalog if already fetched this session,
    // otherwise fetches once and caches (also caches the in-flight promise
    // so concurrent mounts don't fire duplicate requests).
    function loadLanguageCatalogCached() {
      if (langCatalogEntriesCache) return Promise.resolve(langCatalogEntriesCache);
      if (langCatalogFetchPromise) return langCatalogFetchPromise;
      langCatalogFetchPromise = fetchLanguageCatalog().then(function (entries) {
        langCatalogEntriesCache = entries;
        langCatalogFetchPromise = null;
        return entries;
      }).catch(function (err) {
        langCatalogFetchPromise = null;
        throw err;
      });
      return langCatalogFetchPromise;
    }

    // Reads a JSON file the user picks: native dialog on desktop (Tauri),
    // <input type=file> on www (mirrors session-sqlite-runtime.js's pickFile
    // pattern, but this needs a filename to derive the language code from,
    // which the desktop dialog path doesn't give us - so path/File.name is
    // returned alongside the text).
    function pickLanguageFileText() {
      var invoke = platform.getInvoke ? platform.getInvoke() : null;
      if (invoke) {
        return platform.invoke("open_language_file_dialog", {}).then(function (result) {
          return { name: (result && result.path) || "", text: (result && result.text) || "" };
        });
      }
      return new Promise(function (resolve, reject) {
        var input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.addEventListener("change", function () {
          var file = input.files && input.files[0];
          if (!file) { reject(new Error("cancelled")); return; }
          file.text().then(function (text) {
            resolve({ name: file.name, text: text });
          }, reject);
        });
        input.addEventListener("cancel", function () { reject(new Error("cancelled")); });
        input.click();
      });
    }

    function deriveLanguageCodeFromFilename(name) {
      var base = String(name || "").split(/[\\/]/).pop() || "";
      return base.replace(/\.json$/i, "").trim().toLowerCase();
    }

    function wireLanguageManagerButtons(rootEl) {
      var root = rootEl && typeof rootEl.querySelector === "function"
        ? rootEl
        : document.getElementById("v1ToolDetail");
      if (!root) return;

      var installedListEl = root.querySelector('[data-lang-role="installed-list"]') || root.querySelector("#v1LangInstalledList");
      var catalogEl = root.querySelector('[data-lang-role="catalog"]') || root.querySelector("#v1LangCatalog");
      var langCatalogEntries = langCatalogEntriesCache || [];

      function renderInstalledList() {
        if (!installedListEl) return;
        var current = i18n && i18n.getLang ? i18n.getLang() : (document.documentElement.getAttribute("lang") || "en");
        var details = i18n && i18n.listLanguageDetails ? i18n.listLanguageDetails() : [];
        installedListEl.innerHTML = details.map(function (item) {
          var checked = item.code === current ? " checked" : "";
          var versionHtml = item.version ? " <span>" + escapeHtml(tr("forAppVersionPrefix")) + " " + escapeHtml(item.version) + "</span>" : "";
          return "<label class=\"v1-lang-item\">"
            + "<input type=\"radio\" name=\"v1LangActive\" data-lang-radio=\"" + escapeHtml(item.code) + "\"" + checked + " />"
            + "<span class=\"v1-lang-flag\" aria-hidden=\"true\">" + escapeHtml(item.flag || "🌐") + "</span>"
            + "<strong>" + escapeHtml(item.name || item.code.toUpperCase()) + "</strong>"
            + versionHtml
            + "</label>";
        }).join("");
      }

      function activate(code) {
        var before = i18n && i18n.getLang ? i18n.getLang() : "";
        var after = i18n && i18n.setLang ? i18n.setLang(code) : before;
        if (before === after && code.toLowerCase() !== after.toLowerCase()) {
          if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langActivateFail") + " - " + code);
          return false;
        }
        renderInstalledList();
        if (window.NetReconNewUI && typeof window.NetReconNewUI.refreshLanguageUi === "function") {
          window.NetReconNewUI.refreshLanguageUi();
        }
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langActivateOk") + " - " + after);
        return true;
      }

      function renderCatalog() {
        if (!catalogEl) return;
        var installedCodes = i18n && i18n.listLanguages ? i18n.listLanguages() : [];
        catalogEl.innerHTML = "";
        if (!langCatalogEntries.length) {
          var emptyEl = document.createElement("div");
          emptyEl.className = "v1-import-empty";
          emptyEl.textContent = tr("langCatalogEmpty");
          catalogEl.appendChild(emptyEl);
          return;
        }
        langCatalogEntries.forEach(function (manifest, idx) {
          var isInstalled = installedCodes.indexOf(manifest.code) !== -1;

          var itemEl = document.createElement("div");
          itemEl.className = "v1-catalog-item";

          var iconCell = document.createElement("div");
          iconCell.className = "v1-catalog-icon-cell";
          iconCell.textContent = manifest.flag || "🌐";
          itemEl.appendChild(iconCell);

          var infoEl = document.createElement("div");
          infoEl.className = "v1-catalog-info";
          var nameEl = document.createElement("strong");
          nameEl.textContent = manifest.name || manifest.code;
          var descEl = document.createElement("div");
          descEl.textContent = manifest.version ? tr("forAppVersionPrefix") + " " + manifest.version : "";
          infoEl.appendChild(nameEl);
          infoEl.appendChild(descEl);
          itemEl.appendChild(infoEl);

          if (isInstalled) {
            var badge = document.createElement("span");
            badge.className = "v1-catalog-installed-badge";
            badge.textContent = tr("langCatalogInstalledBadge");
            itemEl.appendChild(badge);
          } else {
            var installBtn = document.createElement("button");
            installBtn.type = "button";
            installBtn.className = "v1-catalog-install-btn";
            installBtn.textContent = tr("importToolInstallBtn");
            installBtn.setAttribute("data-lang-catalog-index", String(idx));
            itemEl.appendChild(installBtn);
          }

          catalogEl.appendChild(itemEl);
        });
      }

      function installLanguageManifest(manifest) {
        if (!manifest || typeof manifest.code !== "string" || !manifest.code.trim()) return;
        if (!manifest.dictionary || typeof manifest.dictionary !== "object" || Array.isArray(manifest.dictionary)) return;
        var addResult = i18n && i18n.addLanguage
          ? i18n.addLanguage(manifest.code, manifest.dictionary, { name: manifest.name, version: manifest.version, flag: manifest.flag, rtl: !!manifest.rtl })
          : { ok: false, error: tr("langAddFail") };
        if (!addResult.ok) {
          if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langAddFail") + " - " + addResult.error);
          return;
        }
        renderInstalledList();
        renderCatalog();
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langCatalogInstallOk") + " - " + addResult.code);
      }

      if (installedListEl && installedListEl.dataset.bound !== "1") {
        installedListEl.dataset.bound = "1";
        installedListEl.addEventListener("change", function (event) {
          var radio = event.target && event.target.closest ? event.target.closest("[data-lang-radio]") : null;
          if (!radio) return;
          activate(radio.getAttribute("data-lang-radio"));
        });
      }

      root.querySelectorAll("[data-lang-action]").forEach(function (button) {
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";
        button.addEventListener("click", function () {
          if (button.getAttribute("data-lang-action") !== "import") return;

          pickLanguageFileText().then(function (picked) {
            var parsed;
            try {
              parsed = JSON.parse(picked.text || "{}");
            } catch (_) {
              if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langInvalidDict"));
              return;
            }

            // Accept both local-import shapes: a flat key->text dictionary
            // (the documented local-import format, CONTRIBUTING §5), and
            // the "rich" catalog manifest shape (code/name/version/flag/
            // rtl/dictionary, CONTRIBUTING §5's languages/<code>.json) - a
            // user pointing this file picker at a catalog-style file (e.g.
            // one they downloaded from languages/) should get the real
            // translations and metadata, not a silent dictionary-shaped
            // wrapper with no matching keys (which used to fall back to
            // English with no error).
            var isRichManifest = parsed && typeof parsed === "object" && !Array.isArray(parsed)
              && parsed.dictionary && typeof parsed.dictionary === "object" && !Array.isArray(parsed.dictionary);
            var dict = isRichManifest ? parsed.dictionary : parsed;
            var code = isRichManifest && typeof parsed.code === "string" && parsed.code.trim()
              ? parsed.code.trim().toLowerCase()
              : deriveLanguageCodeFromFilename(picked.name);
            if (!code) {
              if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langInvalidCode"));
              return;
            }
            var meta = isRichManifest ? { name: parsed.name, version: parsed.version, flag: parsed.flag, rtl: !!parsed.rtl } : undefined;

            var addResult = i18n && i18n.addLanguage ? i18n.addLanguage(code, dict, meta) : { ok: false, error: tr("langAddFail") };
            if (!addResult.ok) {
              if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langAddFail") + " - " + addResult.error);
              return;
            }

            renderCatalog();
            activate(addResult.code);
          }).catch(function (err) {
            if (err && err.message === "cancelled") return;
            if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("langAddFail"));
          });
        });
      });

      if (catalogEl && catalogEl.dataset.langCatalogBound !== "1") {
        catalogEl.dataset.langCatalogBound = "1";
        catalogEl.addEventListener("click", function (e) {
          var btn = e.target && e.target.closest ? e.target.closest("[data-lang-catalog-index]") : null;
          if (!btn) return;
          var idx = Number(btn.getAttribute("data-lang-catalog-index"));
          var manifest = langCatalogEntries[idx];
          if (manifest) installLanguageManifest(manifest);
        });
      }

      renderInstalledList();
      renderCatalog();

      loadLanguageCatalogCached().then(function (entries) {
        langCatalogEntries = entries;
        renderCatalog();
      }).catch(function () {
        if (catalogEl) {
          catalogEl.innerHTML = "";
          var errEl = document.createElement("div");
          errEl.className = "v1-import-empty";
          errEl.textContent = tr("langCatalogError");
          catalogEl.appendChild(errEl);
        }
      });
    }

    return {
      wireLanguageManagerButtons: wireLanguageManagerButtons,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createLanguageCatalogRuntime = createLanguageCatalogRuntime;
})();
