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

    // shell: "Load from file..." has two backends - the native folder
    // dialog (open_extension_manifest_folder_dialog, desktop-only) and this
    // plain <input type="file" webkitdirectory> fallback, which needs no
    // Tauri IPC at all and works identically on www. A folder picker (not a
    // single-file one) so a locally-imported addon can bring its own
    // program too, exactly mirroring the GitHub catalog's own
    // tools/<id>.json + tools/<id>/main.js layout (see fetchCatalog above) -
    // a folder copied straight out of that repo's tools/ folder imports
    // identically here. One hidden input lives at module scope (not
    // recreated per Import Tool mount, which would otherwise leak an
    // orphaned <input> into <body> every time #v1ToolDetail re-renders) -
    // its change handler always reads the CURRENT mount's outputEl/
    // installManifestObject via the two mutable refs below, updated at the
    // top of every wireImportToolButtons() call, so it never acts on a
    // stale closure from a torn-down previous mount.
    var webFileInput = null;
    var activeOutputEl = null;
    var activeInstallManifestObject = null;

    // Finds the single .json manifest file directly inside the picked
    // folder (shallowest relative path, i.e. exactly one segment after the
    // root folder name) and, if the manifest's basename has a matching
    // sibling folder, that folder's main.js anywhere in the selection -
    // mirrors fetchCatalog()'s own basename-matching discipline.
    function pickManifestAndProgramFromFileList(files) {
      var manifestFile = null;
      var manifestDepth = Infinity;
      for (var i = 0; i < files.length; i++) {
        var relPath = files[i].webkitRelativePath || files[i].name;
        if (!/\.json$/i.test(relPath)) continue;
        var depth = relPath.split("/").length;
        if (depth < manifestDepth) {
          manifestFile = files[i];
          manifestDepth = depth;
        }
      }
      if (!manifestFile) return Promise.resolve(null);

      var manifestName = manifestFile.name.replace(/\.json$/i, "");
      var programFile = null;
      for (var j = 0; j < files.length; j++) {
        var segments = (files[j].webkitRelativePath || files[j].name).split("/");
        if (segments.length >= 2
          && segments[segments.length - 1] === "main.js"
          && segments[segments.length - 2] === manifestName) {
          programFile = files[j];
          break;
        }
      }

      return manifestFile.text().then(function (manifestText) {
        return (programFile ? programFile.text() : Promise.resolve("")).then(function (programSource) {
          return { manifestText: manifestText, programSource: programSource };
        });
      });
    }

    function triggerWebFileImport() {
      if (!webFileInput) {
        webFileInput = document.createElement("input");
        webFileInput.type = "file";
        webFileInput.webkitdirectory = true;
        webFileInput.style.display = "none";
        webFileInput.addEventListener("change", function () {
          var files = webFileInput.files;
          if (!files || !files.length) return;
          // Clearing .value resets the SAME live FileList in place (not a
          // fresh object) - do it only after every file has actually been
          // read, or the async .text() reads below race against it and
          // silently see zero files.
          pickManifestAndProgramFromFileList(files).then(function (picked) {
            webFileInput.value = "";
            if (!picked) {
              if (activeOutputEl) activeOutputEl.textContent = tr("extInvalidJson");
              return;
            }
            var manifest = null;
            try {
              manifest = JSON.parse(picked.manifestText || "");
            } catch (_) {
              if (activeOutputEl) activeOutputEl.textContent = tr("extInvalidJson");
              return;
            }
            if (activeInstallManifestObject) activeInstallManifestObject(manifest, "", picked.programSource);
          }).catch(function () {
            if (activeOutputEl) activeOutputEl.textContent = tr("extInvalidJson");
          });
        });
        document.body.appendChild(webFileInput);
      }
      webFileInput.click();
    }

    // shell: fetches the addon catalog from the repo's own tools/ GitHub
    // folder - groups files by basename so "<name>.json" pairs with a
    // same-name image file ("<name>.png" etc.) as that addon's icon, AND
    // (new) a same-name subfolder as that addon's own program. Uses a
    // null-prototype object for grouping so a file literally named
    // "__proto__.json" can't shadow/pollute Object.prototype.
    var CATALOG_RAW_BASE_URL = "https://raw.githubusercontent.com/" + CATALOG_OWNER + "/" + CATALOG_REPO + "/" + CATALOG_BRANCH + "/" + CATALOG_FOLDER + "/";

    function fetchCatalog() {
      return fetch(CATALOG_API_URL).then(function (res) {
        if (!res.ok) throw new Error("GitHub API " + res.status);
        return res.json();
      }).then(function (files) {
        var groups = Object.create(null);
        (Array.isArray(files) ? files : []).forEach(function (f) {
          if (!f || typeof f.name !== "string") return;
          if (f.type === "dir") {
            groups[f.name] = groups[f.name] || {};
            groups[f.name].hasProgramDir = true;
            return;
          }
          if (f.type !== "file") return;
          var dot = f.name.lastIndexOf(".");
          if (dot < 0) return;
          var base = f.name.slice(0, dot);
          var ext = f.name.slice(dot + 1).toLowerCase();
          groups[base] = groups[base] || {};
          if (ext === "json") groups[base].json = f;
          else if (CATALOG_IMAGE_EXTENSIONS.indexOf(ext) !== -1) groups[base].icon = f;
        });
        var entries = Object.keys(groups).map(function (k) {
          var g = groups[k];
          g.base = k;
          return g;
        }).filter(function (g) { return g.json; });
        return Promise.all(entries.map(function (entry) {
          return fetch(entry.json.download_url).then(function (r) { return r.json(); }).then(function (manifest) {
            if (!entry.hasProgramDir) {
              return { manifest: manifest, iconUrl: entry.icon ? entry.icon.download_url : "", programSource: "" };
            }
            // A 404 here just means the folder exists but has no main.js
            // (or isn't laid out as expected) - stays a purely declarative
            // addon, same as one with no program folder at all.
            return fetch(CATALOG_RAW_BASE_URL + entry.base + "/main.js").then(function (r) {
              return r.ok ? r.text() : "";
            }).catch(function () { return ""; }).then(function (programSource) {
              return { manifest: manifest, iconUrl: entry.icon ? entry.icon.download_url : "", programSource: programSource };
            });
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
      activeOutputEl = outputEl;

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
          ver.textContent = tr("forAppVersionPrefix") + " " + item.version;
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
      // without the manifest needing to reference it itself. programSource
      // (the addon's own tools/<id>/main.js text, if it shipped one) gets
      // persisted alongside the manifest and run via
      // window.NetReconNewUI.registerAddonCommands - see extensions.js and
      // panels-runtime.js's loadAddonProgram/registerExtensionCommands.
      function installManifestObject(manifest, iconUrl, programSource) {
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
          var result = extensionHost && extensionHost.installExtension ? extensionHost.installExtension(manifest, programSource) : { ok: false, error: tr("extInstallFail") };
          if (!result.ok) {
            if (outputEl) outputEl.textContent = tr("extInstallFail") + "\n" + result.error;
            return false;
          }

          registerExtensionCommands(result.manifest, programSource);
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
      activeInstallManifestObject = installManifestObject;

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
          infoEl.appendChild(nameEl);
          if (manifest.version) {
            var verEl = document.createElement("div");
            verEl.className = "v1-catalog-version";
            verEl.textContent = tr("forAppVersionPrefix") + " " + manifest.version;
            infoEl.appendChild(verEl);
          }
          var descEl = document.createElement("div");
          descEl.textContent = manifest.description || "";
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
            installManifestObject(entry.manifest, entry.iconUrl, entry.programSource);
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
            // Prefer the native folder dialog on desktop (matches the exact
            // path shown/reviewed, and can bring along the addon's own
            // program - see open_extension_manifest_folder_dialog,
            // src-tauri/src/main.rs) - only reach for the web <input
            // type="file" webkitdirectory> fallback when Tauri invoke
            // genuinely isn't there, not on every platform.invoke rejection
            // (a real desktop error should still surface as extInvalidJson,
            // not silently swap to the web picker).
            if (!platform.isDesktop()) {
              triggerWebFileImport();
              return;
            }
            Promise.resolve(platform.invoke("open_extension_manifest_folder_dialog", {}))
              .then(function (picked) {
                var manifest = null;
                try {
                  manifest = JSON.parse(String((picked && picked.manifestText) || ""));
                } catch (_) {
                  if (outputEl) outputEl.textContent = tr("extInvalidJson");
                  return;
                }
                installManifestObject(manifest, "", picked && picked.programSource);
              })
              .catch(function (err) {
                var message = (err && err.message) || err || "";
                var cancelled = message === "cancelled";
                var unavailable = message === "tauri invoke unavailable";
                if (unavailable) {
                  triggerWebFileImport();
                  return;
                }
                if (cancelled || !outputEl) return;
                outputEl.textContent = tr("extInvalidJson");
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
