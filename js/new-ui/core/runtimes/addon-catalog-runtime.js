(function () {
  function createAddonCatalogRuntime(deps) {
    var tr = deps.tr;
    var setStatusLine = deps.setStatusLine;
    var extensionHost = deps.extensionHost;
    var commandBus = deps.commandBus;
    var refreshActiveUI = deps.refreshActiveUI;
    var registerExtensionCommands = deps.registerExtensionCommands;

    // If GitHub returned 403 because the unauthenticated rate limit ran
    // out, the response carries the exact reset time in its headers - show
    // that instead of a bare status code, so a user hitting this (e.g.
    // after a lot of browsing/reloading) knows how long to actually wait
    // rather than just seeing a dead catalog.
    function rateLimitWaitMessage(res) {
      if (res.headers.get("x-ratelimit-remaining") !== "0") return null;
      var resetHeader = res.headers.get("x-ratelimit-reset");
      if (!resetHeader) return null;

      var resetAt = new Date(Number(resetHeader) * 1000);
      var waitMin = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 60000));
      var resetTime = resetAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      return tr("communityCatalogRateLimited").replace("{min}", String(waitMin)).replace("{time}", resetTime);
    }

    function githubError(res) {
      return new Error(rateLimitWaitMessage(res) || ("GitHub API " + res.status));
    }

    // localStorage cache with TTL, on top of the in-memory
    // communityEntriesCache below - the in-memory one only survives within
    // one running app session (refreshActiveUI() rebuilds tabs on every
    // switch, which is what THAT one protects against); this one survives
    // an app restart too, so reopening the app repeatedly doesn't re-burn
    // the unauthenticated GitHub quota from zero every time. Only ever
    // stores a SUCCESSFUL fetch result - a rate-limited/failed fetch is
    // never cached, so the next load attempt (or app restart) gets a real
    // retry instead of a cached failure.
    var communityConfigForCache = (window.NetReconNewUICore && window.NetReconNewUICore.communityConfig) || {};
    var LOCAL_CACHE_TTL_MS = communityConfigForCache.CACHE_TTL_MS || (5 * 60 * 1000);
    var LOCAL_CACHE_PREFIX = "netrecon_addon_catalog_cache:";

    function readLocalCache(key) {
      try {
        var raw = window.localStorage.getItem(LOCAL_CACHE_PREFIX + key);
        if (!raw) return undefined;
        var entry = JSON.parse(raw);
        if (Date.now() > entry.expiresAt) {
          window.localStorage.removeItem(LOCAL_CACHE_PREFIX + key);
          return undefined;
        }
        return entry.value;
      } catch (_) {
        return undefined;
      }
    }

    function writeLocalCache(key, value) {
      try {
        window.localStorage.setItem(LOCAL_CACHE_PREFIX + key, JSON.stringify({ value: value, expiresAt: Date.now() + LOCAL_CACHE_TTL_MS }));
      } catch (_) {
        // localStorage full/unavailable - this cache is only an optimization
      }
    }

    function clearLocalCache(key) {
      try {
        window.localStorage.removeItem(LOCAL_CACHE_PREFIX + key);
      } catch (_) {
        // ignore
      }
    }

    // Community Catalog - dodatki z DOWOLNEGO repo na GitHubie otagowanego
    // tym topicem. Konwencja repo: jeden dodatek = jedno repo,
    // manifest.json + main.js (opcjonalnie) + icon.png (opcjonalnie) w
    // roocie. Uzywa raw.githubusercontent.com (nie api.github.com/.../
    // contents) dla manifest/icon/main.js celowo - to osobny serwis bez
    // tego samego 60/h limitu co REST API, jedyne zapytanie ktore
    // faktycznie zuzywa ten limit to samo search ponizej.
    var communityConfig = (window.NetReconNewUICore && window.NetReconNewUICore.communityConfig) || {};
    var COMMUNITY_TOPIC = communityConfig.ADDON_TOPIC || "osintnetauditor-addon";
    var COMMUNITY_SEARCH_URL = "https://api.github.com/search/repositories?q=topic:" + encodeURIComponent(COMMUNITY_TOPIC) + "&sort=updated&order=desc";
    var COMMUNITY_MANIFEST_NAME = "manifest.json";
    var COMMUNITY_PROGRAM_NAME = "main.js";
    var COMMUNITY_ICON_NAME = "icon.png";

    // Oceny (Supabase) - klucz "anon"/"publishable", bezpieczny w kodzie
    // klienckim, ograniczenia daje RLS (select jest publiczne z zalozenia).
    // Zwykly REST fetch (nie supabase-js z CDN) - jedno zapytanie GET na
    // wpis katalogu, bez zadnej dodatkowej zaleznosci.
    var RATINGS_SUPABASE_URL = communityConfig.SUPABASE_URL;
    var RATINGS_SUPABASE_ANON_KEY = communityConfig.SUPABASE_ANON_KEY;

    function fetchRatingSummary(ratingKey) {
      var url = RATINGS_SUPABASE_URL + "/rest/v1/ratings?select=stars&repo_full_name=eq." + encodeURIComponent(ratingKey);
      return fetch(url, {
        headers: { apikey: RATINGS_SUPABASE_ANON_KEY, Authorization: "Bearer " + RATINGS_SUPABASE_ANON_KEY }
      }).then(function (res) {
        return res.ok ? res.json() : [];
      }).then(function (rows) {
        if (!rows || !rows.length) return { avg: null, count: 0 };
        var sum = rows.reduce(function (acc, r) { return acc + r.stars; }, 0);
        return { avg: sum / rows.length, count: rows.length };
      }).catch(function () {
        return { avg: null, count: 0 };
      });
    }

    // shell: Verified/blocked flags set by the catalog admin (Supabase
    // `addon_moderation`, read here - writing them happens in
    // community-catalog-detail-runtime.js's admin panel). Blocked entries
    // are filtered out entirely in loadCommunityCatalogCached below, not
    // just hidden with a badge.
    function fetchModerationFlags(ratingKey) {
      var url = RATINGS_SUPABASE_URL + "/rest/v1/addon_moderation?select=verified,blocked&repo_full_name=eq." + encodeURIComponent(ratingKey);
      return fetch(url, {
        headers: { apikey: RATINGS_SUPABASE_ANON_KEY, Authorization: "Bearer " + RATINGS_SUPABASE_ANON_KEY }
      }).then(function (res) {
        return res.ok ? res.json() : [];
      }).then(function (rows) {
        var row = rows && rows[0];
        return { verified: !!(row && row.verified), blocked: !!(row && row.blocked) };
      }).catch(function () {
        return { verified: false, blocked: false };
      });
    }

    // shell: whole-author blocklist (Supabase `blocked_users`) - separate
    // from per-addon `addon_moderation.blocked` above. Fetched ONCE per
    // catalog load (not per-entry like the two above) since it's a flat
    // list, not keyed by repo.
    function fetchBlockedUsers() {
      var url = RATINGS_SUPABASE_URL + "/rest/v1/blocked_users?select=github_login";
      return fetch(url, {
        headers: { apikey: RATINGS_SUPABASE_ANON_KEY, Authorization: "Bearer " + RATINGS_SUPABASE_ANON_KEY }
      }).then(function (res) {
        return res.ok ? res.json() : [];
      }).then(function (rows) {
        var set = {};
        (rows || []).forEach(function (row) {
          if (row && row.github_login) set[String(row.github_login).toLowerCase()] = true;
        });
        return set;
      }).catch(function () {
        return {};
      });
    }

    // Community Catalog's own cache - different source and lifecycle from
    // anything else in this file.
    var communityEntriesCache = null;
    var communityFetchPromise = null;

    // shell: link + name of the repo's LICENSE (if GitHub detects one from
    // its content) and a link to its README, both via the api.github.com
    // contents endpoints (not raw.githubusercontent.com) because only
    // those return the SPDX-detected license name, not just the file.
    function fetchCommunityLicense(repo) {
      return fetch("https://api.github.com/repos/" + repo.full_name + "/license", { headers: { Accept: "application/vnd.github+json" } })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) {
          if (!data) return null;
          return {
            htmlUrl: data.html_url || "",
            name: (data.license && data.license.name) || "",
            spdxId: (data.license && data.license.spdx_id) || ""
          };
        }).catch(function () { return null; });
    }

    function fetchCommunityReadmeUrl(repo) {
      return fetch("https://api.github.com/repos/" + repo.full_name + "/readme", { headers: { Accept: "application/vnd.github+json" } })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) { return (data && data.html_url) || ""; })
        .catch(function () { return ""; });
    }

    // shell: fetches one Community Catalog entry from a search-result repo.
    // Manifest is validated with the SAME core.extensions.validateManifest
    // used by installManifestObject below - a repo with a missing/broken
    // manifest.json is silently dropped, not shown with an error card.
    function fetchCommunityEntry(repo) {
      var rawBase = "https://raw.githubusercontent.com/" + repo.full_name + "/" + repo.default_branch + "/";

      return fetch(rawBase + COMMUNITY_MANIFEST_NAME).then(function (res) {
        return res.ok ? res.json() : null;
      }).then(function (raw) {
        if (!raw) return null;
        var core = window.NetReconNewUICore || {};
        var validated = core.extensions && core.extensions.validateManifest ? core.extensions.validateManifest(raw) : null;
        if (!validated || !validated.ok) return null;

        return Promise.all([
          fetch(rawBase + COMMUNITY_ICON_NAME).then(function (r) { return r.ok ? rawBase + COMMUNITY_ICON_NAME : ""; }).catch(function () { return ""; }),
          fetch(rawBase + COMMUNITY_PROGRAM_NAME).then(function (r) { return r.ok ? r.text() : ""; }).catch(function () { return ""; }),
          fetchCommunityLicense(repo),
          fetchCommunityReadmeUrl(repo)
        ]).then(function (results) {
          return {
            manifest: validated.manifest,
            iconUrl: results[0],
            programSource: results[1],
            ratingKey: repo.full_name,
            repoFullName: repo.full_name,
            repoHtmlUrl: repo.html_url,
            repoDescription: repo.description || "",
            license: results[2],
            readmeUrl: results[3]
          };
        });
      }).catch(function () { return null; });
    }

    // shell: search never throws past this function - a rate-limited or
    // failed Community Catalog fetch just contributes zero entries instead
    // of throwing.
    function fetchCommunityCatalog() {
      return fetch(COMMUNITY_SEARCH_URL, { headers: { Accept: "application/vnd.github+json" } }).then(function (res) {
        if (!res.ok) throw githubError(res);
        return res.json();
      }).then(function (data) {
        var repos = (data && Array.isArray(data.items)) ? data.items : [];
        return Promise.all(repos.map(fetchCommunityEntry));
      }).then(function (results) {
        return results.filter(Boolean);
      }).catch(function (err) {
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + ((err && err.message) || err));
        return [];
      });
    }

    // shell: returns the cached Community Catalog if already fetched this
    // session (memory) or recently enough (localStorage, survives an app
    // restart), otherwise fetches once and caches both (also caches the
    // in-flight promise so concurrent mounts - e.g. the left-panel list
    // and the detail tab both loading at once - don't fire duplicate
    // requests). Attaches a rating summary + moderation flags to every
    // entry. Consumed by community-catalog-detail-runtime.js (left-panel
    // list + detail tab).
    function loadCommunityCatalogCached() {
      if (communityEntriesCache) return Promise.resolve(communityEntriesCache);
      if (communityFetchPromise) return communityFetchPromise;

      var cached = readLocalCache("community-catalog");
      if (cached) {
        communityEntriesCache = cached;
        return Promise.resolve(cached);
      }

      communityFetchPromise = Promise.all([fetchCommunityCatalog(), fetchBlockedUsers()]).then(function (results) {
        var entries = results[0];
        var blockedUsers = results[1];
        return Promise.all(entries.map(function (entry) {
          return Promise.all([
            fetchRatingSummary(entry.ratingKey),
            fetchModerationFlags(entry.ratingKey)
          ]).then(function (r) {
            entry.ratingSummary = r[0];
            entry.moderation = r[1];
            entry.authorBlocked = !!(entry.repoFullName && blockedUsers[entry.repoFullName.split("/")[0].toLowerCase()]);
            return entry;
          });
        }));
      }).then(function (entries) {
        // NOT filtered here on purpose - an admin needs to still see a
        // blocked entry (moderation.blocked / authorBlocked flags) to be
        // able to unblock it. Non-admin visibility filtering happens in
        // community-catalog-detail-runtime.js's list rendering instead.
        communityEntriesCache = entries;
        communityFetchPromise = null;
        writeLocalCache("community-catalog", entries);
        return entries;
      }).catch(function (err) {
        communityFetchPromise = null;
        throw err;
      });
      return communityFetchPromise;
    }

    // shell: forces the next loadCommunityCatalogCached() call to refetch -
    // used after an admin write (verify/block/delete) so the left-panel
    // list and detail tab reflect the change without a full app restart.
    function invalidateCommunityCatalogCache() {
      communityEntriesCache = null;
      communityFetchPromise = null;
      clearLocalCache("community-catalog");
    }

    // shell: uninstalls one extension by id. `hooks` lets the caller
    // supply its own status output / list-refresh without this function
    // needing to know which UI called it.
    function performUninstall(id, hooks) {
      hooks = hooks || {};
      var setOutput = hooks.setOutput || function () {};
      var afterUninstall = hooks.afterUninstall || function () {};

      if (!id) {
        setOutput(tr("extUninstallPrompt"));
        return;
      }

      var removeResult = extensionHost && extensionHost.uninstallExtension ? extensionHost.uninstallExtension(id) : { ok: false, error: tr("extUninstallFail") };
      if (!removeResult.ok) {
        setOutput(tr("extUninstallFail") + "\n" + removeResult.error);
        return;
      }

      if (commandBus && commandBus.unregisterAllFor) {
        commandBus.unregisterAllFor(removeResult.id);
      }
      setOutput(tr("extUninstallOk") + "\n" + removeResult.id);
      if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("extUninstallOk") + " - " + removeResult.id);
      if (window.NetReconNewUI && typeof window.NetReconNewUI.syncExtensionToolUi === "function") {
        window.NetReconNewUI.syncExtensionToolUi();
      }
      afterUninstall();
      refreshActiveUI();
    }

    // shell: installs an already-parsed manifest object - shared by the
    // Community Catalog detail tab (its only caller now). All visibility
    // flags (Tools menu / activity bar / left panel / tab) are fully
    // manifest-controlled - only fills in the shell's own baseline
    // defaults for whatever a tool key leaves unset, confirms permissions,
    // then registers commands and syncs the dynamic UI. iconUrl becomes
    // each tool's default icon, so the addon's own icon shows up in the
    // activity bar/Tools menu without the manifest needing to reference it
    // itself. programSource gets persisted alongside the manifest and run
    // via window.NetReconNewUI.registerAddonCommands - see extensions.js
    // and panels-runtime.js's loadAddonProgram/registerExtensionCommands.
    // `hooks` lets the caller supply its own status output / list-refresh
    // without this function needing to know which UI called it.
    function installManifestObject(manifest, iconUrl, programSource, hooks) {
      hooks = hooks || {};
      var setOutput = hooks.setOutput || function () {};
      var afterInstall = hooks.afterInstall || function () {};

      if (!manifest || typeof manifest !== "object") {
        setOutput(tr("extInvalidJson"));
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
          setOutput(tr("extInstallFail") + "\n" + result.error);
          return false;
        }

        registerExtensionCommands(result.manifest, programSource);
        setOutput(tr("extInstallOk") + "\n" + result.manifest.id + "@" + result.manifest.version);
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("extInstallOk") + " - " + result.manifest.id);
        if (window.NetReconNewUI && typeof window.NetReconNewUI.syncExtensionToolUi === "function") {
          window.NetReconNewUI.syncExtensionToolUi();
        }
        afterInstall();
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
          setOutput(tr("extPermissionDeclined"));
          return false;
        }
        return finishInstall();
      });
    }

    return {
      loadCommunityCatalogCached: loadCommunityCatalogCached,
      invalidateCommunityCatalogCache: invalidateCommunityCatalogCache,
      fetchRatingSummary: fetchRatingSummary,
      fetchModerationFlags: fetchModerationFlags,
      installManifestObject: installManifestObject,
      performUninstall: performUninstall
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createAddonCatalogRuntime = createAddonCatalogRuntime;
})();
