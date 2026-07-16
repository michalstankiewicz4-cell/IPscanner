(function () {
  function createAddonCatalogRuntime(deps) {
    var tr = deps.tr;
    var setStatusLine = deps.setStatusLine;
    var platform = deps.platform;
    var extensionHost = deps.extensionHost;
    var commandBus = deps.commandBus;
    var panelRenderersRuntime = deps.panelRenderersRuntime;
    var refreshActiveUI = deps.refreshActiveUI;
    var registerExtensionCommands = deps.registerExtensionCommands;

    var CATALOG_OWNER = "michalstankiewicz4-cell";
    var CATALOG_REPO = "IPscanner";
    var CATALOG_BRANCH = "main";
    var CATALOG_FOLDER = "tools";
    var CATALOG_API_URL = "https://api.github.com/repos/" + CATALOG_OWNER + "/" + CATALOG_REPO + "/contents/" + CATALOG_FOLDER + "?ref=" + CATALOG_BRANCH;
    var CATALOG_IMAGE_EXTENSIONS = ["png", "svg", "jpg", "jpeg", "gif", "webp"];
    // shell: catalog fetch is cached at module scope (outside any single
    // Import Tool mount) because refreshActiveUI() rebuilds #v1ToolDetail's
    // whole subtree - including #v1ImportCatalog - on every tab switch and
    // after every install/uninstall, which would otherwise re-trigger a full
    // GitHub API fetch each time and risk the unauthenticated 60/hour quota.
    var catalogEntriesCache = null;
    var catalogFetchPromise = null;

    // shell: fetches the addon catalog from the repo's own tools/ GitHub
    // folder - groups files by basename so "<name>.json" pairs with a
    // same-name image file ("<name>.png" etc.) as that addon's icon. Uses a
    // null-prototype object for grouping so a file literally named
    // "__proto__.json" can't shadow/pollute Object.prototype.
    function fetchCatalog() {
      return fetch(CATALOG_API_URL).then(function (res) {
        if (!res.ok) throw new Error("GitHub API " + res.status);
        return res.json();
      }).then(function (files) {
        var groups = Object.create(null);
        (Array.isArray(files) ? files : []).forEach(function (f) {
          if (!f || f.type !== "file" || typeof f.name !== "string") return;
          var dot = f.name.lastIndexOf(".");
          if (dot < 0) return;
          var base = f.name.slice(0, dot);
          var ext = f.name.slice(dot + 1).toLowerCase();
          groups[base] = groups[base] || {};
          if (ext === "json") groups[base].json = f;
          else if (CATALOG_IMAGE_EXTENSIONS.indexOf(ext) !== -1) groups[base].icon = f;
        });
        var entries = Object.keys(groups).map(function (k) { return groups[k]; }).filter(function (g) { return g.json; });
        return Promise.all(entries.map(function (entry) {
          return fetch(entry.json.download_url).then(function (r) { return r.json(); }).then(function (manifest) {
            return { manifest: manifest, iconUrl: entry.icon ? entry.icon.download_url : "" };
          }).catch(function () { return null; });
        }));
      }).then(function (results) {
        return results.filter(Boolean);
      });
    }

    // shell: returns the cached catalog if already fetched this session,
    // otherwise fetches once and caches (also caches the in-flight promise
    // so concurrent mounts don't fire duplicate requests).
    function loadCatalogCached() {
      if (catalogEntriesCache) return Promise.resolve(catalogEntriesCache);
      if (catalogFetchPromise) return catalogFetchPromise;
      catalogFetchPromise = fetchCatalog().then(function (entries) {
        catalogEntriesCache = entries;
        catalogFetchPromise = null;
        return entries;
      }).catch(function (err) {
        catalogFetchPromise = null;
        throw err;
      });
      return catalogFetchPromise;
    }

    function wireImportToolButtons(rootEl) {
      var root = rootEl && typeof rootEl.querySelector === "function"
        ? rootEl
        : document.getElementById("v1ToolDetail");
      if (!root) return;

      var outputEl = root.querySelector('[data-import-role="output"]') || root.querySelector("#v1ImportOutput");
      var catalogEl = root.querySelector('[data-import-role="catalog"]') || root.querySelector("#v1ImportCatalog");
      var catalogEntries = catalogEntriesCache || [];

      function listInstalled() {
        var items = extensionHost && extensionHost.listExtensions ? extensionHost.listExtensions() : [];
        if (!outputEl) return;
        if (panelRenderersRuntime && typeof panelRenderersRuntime.renderExtensionList === "function") {
          outputEl.innerHTML = panelRenderersRuntime.renderExtensionList(items);
          return;
        }

        outputEl.textContent = "";

        if (!items.length) {
          var emptyEl = document.createElement("div");
          emptyEl.className = "v1-import-empty";
          emptyEl.textContent = "No imported tools yet.";
          outputEl.appendChild(emptyEl);
          return;
        }

        items.forEach(function (item) {
          var itemEl = document.createElement("div");
          itemEl.className = "v1-import-item";

          var strong = document.createElement("strong");
          strong.textContent = item.id;
          itemEl.appendChild(strong);

          var ver = document.createElement("span");
          ver.textContent = "@ " + item.version;
          itemEl.appendChild(ver);

          var name = document.createElement("div");
          name.textContent = item.name;
          itemEl.appendChild(name);

          var uninstallBtn = document.createElement("button");
          uninstallBtn.type = "button";
          uninstallBtn.className = "v1-import-item-uninstall";
          uninstallBtn.setAttribute("data-import-uninstall-id", item.id);
          uninstallBtn.textContent = tr("importToolUninstallBtn");
          itemEl.appendChild(uninstallBtn);

          outputEl.appendChild(itemEl);
        });
      }

      // shell: uninstalls one extension by id - shared by the per-item
      // Uninstall button in the installed-extensions list and the catalog
      // list's Uninstall button.
      function performUninstall(id) {
        if (!id) {
          if (outputEl) outputEl.textContent = tr("extUninstallPrompt");
          return;
        }

        var removeResult = extensionHost && extensionHost.uninstallExtension ? extensionHost.uninstallExtension(id) : { ok: false, error: tr("extUninstallFail") };
        if (!removeResult.ok) {
          if (outputEl) outputEl.textContent = tr("extUninstallFail") + "\n" + removeResult.error;
          return;
        }

        if (commandBus && commandBus.unregisterAllFor) {
          commandBus.unregisterAllFor(removeResult.id);
        }
        listInstalled();
        renderCatalog();
        if (outputEl) outputEl.textContent = tr("extUninstallOk") + "\n" + removeResult.id;
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("extUninstallOk") + " - " + removeResult.id);
        if (window.NetReconNewUI && typeof window.NetReconNewUI.syncExtensionToolUi === "function") {
          window.NetReconNewUI.syncExtensionToolUi();
        }
        refreshActiveUI();
      }

      // shell: installs an already-parsed manifest object - shared by
      // "Load from file..." and clicking Install on a catalog entry. All
      // visibility flags (Tools menu / activity bar / left panel / tab) are
      // fully manifest-controlled - only fills in the shell's own baseline
      // defaults for whatever a tool key leaves unset, confirms permissions,
      // then registers commands and syncs the dynamic UI. iconUrl (only set
      // for catalog installs) becomes each tool's default icon, so the
      // addon's own tools/<name>.png shows up in the activity bar/Tools menu
      // without the manifest needing to reference it itself.
      function installManifestObject(manifest, iconUrl) {
        if (!manifest || typeof manifest !== "object") {
          if (outputEl) outputEl.textContent = tr("extInvalidJson");
          return Promise.resolve(false);
        }

        if (manifest.contributions && manifest.contributions.tools && typeof manifest.contributions.tools === "object") {
          Object.keys(manifest.contributions.tools).forEach(function (toolKey) {
            var meta = manifest.contributions.tools[toolKey] || {};
            meta.ui = meta.ui && typeof meta.ui === "object" ? meta.ui : {};
            if (meta.ui.showInLeftPanel === undefined) meta.ui.showInLeftPanel = false;
            if (meta.ui.showAsTab === undefined) meta.ui.showAsTab = true;
            if (iconUrl && meta.icon === undefined) meta.icon = iconUrl;
            manifest.contributions.tools[toolKey] = meta;
          });
        }

        function finishInstall() {
          var result = extensionHost && extensionHost.installExtension ? extensionHost.installExtension(manifest) : { ok: false, error: tr("extInstallFail") };
          if (!result.ok) {
            if (outputEl) outputEl.textContent = tr("extInstallFail") + "\n" + result.error;
            return false;
          }

          registerExtensionCommands(result.manifest);
          if (outputEl) outputEl.textContent = tr("extInstallOk") + "\n" + result.manifest.id + "@" + result.manifest.version;
          if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("extInstallOk") + " - " + result.manifest.id);
          if (window.NetReconNewUI && typeof window.NetReconNewUI.syncExtensionToolUi === "function") {
            window.NetReconNewUI.syncExtensionToolUi();
          }
          listInstalled();
          renderCatalog();
          refreshActiveUI();
          return true;
        }

        // Show only permissions that are actually recognized/enforced (per
        // extensions.js's validateManifest), not the manifest's raw request -
        // otherwise the dialog could overstate what's really being granted.
        var core = window.NetReconNewUICore || {};
        var validated = core.extensions && core.extensions.validateManifest ? core.extensions.validateManifest(manifest) : null;
        var requestedPermissions = validated && validated.ok ? validated.manifest.permissions : [];
        if (!requestedPermissions.length) {
          return Promise.resolve(finishInstall());
        }

        var confirmMsg = tr("extPermissionConfirmPrefix") + "\n\n- " + requestedPermissions.join("\n- ") + "\n\n" + tr("extPermissionConfirmSuffix");
        var confirmDialog = window.NetReconNewUI && window.NetReconNewUI.openConfirmDialog;
        var confirmed = confirmDialog
          ? confirmDialog(tr("extPermissionConfirmTitle"), confirmMsg, tr("extPermissionConfirmOk"), tr("exitPromptCancel"))
          : Promise.resolve(window.confirm(confirmMsg));

        return confirmed.then(function (ok) {
          if (!ok) {
            if (outputEl) outputEl.textContent = tr("extPermissionDeclined");
            return false;
          }
          return finishInstall();
        });
      }

      function renderCatalog() {
        if (!catalogEl) return;
        var installedIds = extensionHost && extensionHost.listExtensions
          ? extensionHost.listExtensions().map(function (item) { return item.id; })
          : [];

        catalogEl.innerHTML = "";
        if (!catalogEntries.length) {
          var emptyEl = document.createElement("div");
          emptyEl.className = "v1-import-empty";
          emptyEl.textContent = tr("importToolCatalogEmpty");
          catalogEl.appendChild(emptyEl);
          return;
        }

        catalogEntries.forEach(function (entry, idx) {
          var manifest = entry.manifest || {};
          var isInstalled = installedIds.indexOf(manifest.id) !== -1;

          var itemEl = document.createElement("div");
          itemEl.className = "v1-catalog-item";

          var iconCell = document.createElement("div");
          iconCell.className = "v1-catalog-icon-cell";
          if (window.NetReconNewUI && typeof window.NetReconNewUI.renderExtIcon === "function") {
            window.NetReconNewUI.renderExtIcon(iconCell, entry.iconUrl || "🧩");
          } else {
            iconCell.textContent = entry.iconUrl ? "" : "🧩";
          }
          itemEl.appendChild(iconCell);

          var infoEl = document.createElement("div");
          infoEl.className = "v1-catalog-info";
          var nameEl = document.createElement("strong");
          nameEl.textContent = manifest.name || manifest.id || "";
          var descEl = document.createElement("div");
          descEl.textContent = manifest.description || "";
          infoEl.appendChild(nameEl);
          infoEl.appendChild(descEl);
          itemEl.appendChild(infoEl);

          var actionBtn = document.createElement("button");
          actionBtn.type = "button";
          actionBtn.className = isInstalled ? "v1-import-item-uninstall" : "v1-catalog-install-btn";
          actionBtn.textContent = isInstalled ? tr("importToolUninstallBtn") : tr("importToolInstallBtn");
          actionBtn.setAttribute("data-catalog-index", String(idx));
          actionBtn.setAttribute("data-catalog-action", isInstalled ? "uninstall" : "install");
          itemEl.appendChild(actionBtn);

          catalogEl.appendChild(itemEl);
        });
      }

      if (catalogEl && catalogEl.dataset.catalogBound !== "1") {
        catalogEl.dataset.catalogBound = "1";
        catalogEl.addEventListener("click", function (e) {
          var btn = e.target && e.target.closest ? e.target.closest("[data-catalog-index]") : null;
          if (!btn) return;
          var idx = Number(btn.getAttribute("data-catalog-index"));
          var entry = catalogEntries[idx];
          if (!entry) return;
          if (btn.getAttribute("data-catalog-action") === "uninstall") {
            performUninstall(entry.manifest && entry.manifest.id);
          } else {
            installManifestObject(entry.manifest, entry.iconUrl);
          }
        });
      }

      if (outputEl && outputEl.dataset.uninstallBound !== "1") {
        outputEl.dataset.uninstallBound = "1";
        outputEl.addEventListener("click", function (e) {
          var btn = e.target && e.target.closest ? e.target.closest("[data-import-uninstall-id]") : null;
          if (!btn) return;
          performUninstall(btn.getAttribute("data-import-uninstall-id") || "");
        });
      }

      if (catalogEl) {
        if (catalogEntriesCache) {
          renderCatalog();
        } else {
          loadCatalogCached()
            .then(function (entries) {
              catalogEntries = entries;
              renderCatalog();
            })
            .catch(function () {
              if (catalogEl) catalogEl.textContent = tr("importToolCatalogError");
            });
        }
      }

      root.querySelectorAll("[data-import-action]").forEach(function (button) {
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";
        button.addEventListener("click", function () {
          var actionName = button.getAttribute("data-import-action");

          if (actionName === "load-file") {
            Promise.resolve(platform.invoke("open_extension_manifest_dialog", {}))
              .then(function (text) {
                var manifest = null;
                try {
                  manifest = JSON.parse(String(text || ""));
                } catch (_) {
                  if (outputEl) outputEl.textContent = tr("extInvalidJson");
                  return;
                }
                installManifestObject(manifest);
              })
              .catch(function (err) {
                var message = (err && err.message) || err || "";
                var cancelled = message === "cancelled";
                var unavailable = message === "tauri invoke unavailable";
                if (cancelled || !outputEl) return;
                outputEl.textContent = unavailable ? tr("extDesktopOnlyFeature") : tr("extInvalidJson");
              });
            return;
          }
        });
      });
    }

    return {
      wireImportToolButtons: wireImportToolButtons,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createAddonCatalogRuntime = createAddonCatalogRuntime;
})();
