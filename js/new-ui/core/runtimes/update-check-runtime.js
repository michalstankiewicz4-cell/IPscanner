(function () {
  var OWNER = "michalstankiewicz4-cell";
  var REPO = "IPscanner";
  var RELEASES_API_URL = "https://api.github.com/repos/" + OWNER + "/" + REPO + "/releases/latest";
  var RELEASES_PAGE_URL = "https://github.com/" + OWNER + "/" + REPO + "/releases";
  var LAST_NOTIFIED_KEY = "netrecon_last_notified_version_v1";

  function parseVersion(raw) {
    var value = String(raw || "").trim().replace(/^v/i, "");
    var match = /^(\d+)\.(\d+)\.(\d+)/.exec(value);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  }

  function compareVersions(a, b) {
    for (var i = 0; i < 3; i += 1) {
      if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    }
    return 0;
  }

  function isNewer(remoteRaw, localRaw) {
    var remote = parseVersion(remoteRaw);
    var local = parseVersion(localRaw);
    if (!remote || !local) return false;
    return compareVersions(remote, local) > 0;
  }

  function getForcedVersion() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      return params.get("nr_force_update_version") || null;
    } catch (_) {
      return null;
    }
  }

  function alreadyNotifiedFor(tag) {
    try {
      return window.localStorage && window.localStorage.getItem(LAST_NOTIFIED_KEY) === tag;
    } catch (_) {
      return false;
    }
  }

  function markNotified(tag) {
    try {
      if (window.localStorage) window.localStorage.setItem(LAST_NOTIFIED_KEY, tag);
    } catch (_) {
      // ignore persistence failures
    }
  }

  function fetchLatestTag() {
    var forced = getForcedVersion();
    if (forced) return Promise.resolve(forced);

    return fetch(RELEASES_API_URL, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (res) {
        if (!res.ok) throw new Error("GitHub API " + res.status);
        return res.json();
      })
      .then(function (data) { return data && data.tag_name; });
  }

  // The updater plugin can only silently re-run a downloaded NSIS installer -
  // it has nothing to overwrite for a portable .exe, and process.relaunch()
  // afterwards would restart the OLD portable copy while a second copy sits
  // newly installed elsewhere. main.rs's is_installer_install command
  // detects this (the NSIS template always installs to
  // %LOCALAPPDATA%\OSINT NET Auditor\, a portable zip unzipped anywhere else
  // won't match) so a portable desktop build falls back to the same
  // open-releases-page prompt the www build uses instead of offering a
  // native install it can't safely complete.
  function getUpdaterApi() {
    var t = window.__TAURI__;
    return t && t.updater && typeof t.updater.check === "function" ? t.updater : null;
  }

  function getProcessApi() {
    var t = window.__TAURI__;
    return t && t.process && typeof t.process.relaunch === "function" ? t.process : null;
  }

  function createUpdateCheckRuntime(deps) {
    var tr = deps.tr;
    var platform = deps.platform;
    var generalSettings = deps.generalSettings;
    var setStatusLine = typeof deps.setStatusLine === "function" ? deps.setStatusLine : function () {};

    function promptOpenReleasesPage(tag) {
      var title = tr("updateAvailableTitle");
      var message = tr("updateAvailableMessage") + " " + tag;
      var okLabel = tr("updateAvailableDownload");
      var cancelLabel = tr("updateAvailableLater");

      return window.NetReconNewUI && window.NetReconNewUI.openConfirmDialog
        ? window.NetReconNewUI.openConfirmDialog(title, message, okLabel, cancelLabel).then(function (confirmed) {
            if (confirmed && platform && platform.openExternalUrl) {
              platform.openExternalUrl(RELEASES_PAGE_URL);
            }
            return true;
          })
        : false;
    }

    function installAndRelaunch(update) {
      setStatusLine(tr("updateDownloading"));
      return update.downloadAndInstall(function (event) {
        if (event && event.event === "Finished") setStatusLine(tr("updateInstalling"));
      })
        .then(function () {
          setStatusLine(tr("updateRestarting"));
          var proc = getProcessApi();
          return proc ? proc.relaunch() : null;
        })
        .catch(function (err) {
          setStatusLine(tr("updateFailed") + (err && err.message ? " (" + err.message + ")" : ""));
        });
    }

    function promptNativeInstall(update, tag) {
      var title = tr("updateAvailableTitle");
      var message = tr("updateAvailableMessage") + " " + tag;

      if (!window.NetReconNewUI || !window.NetReconNewUI.openUpdateDialog) return false;

      return window.NetReconNewUI.openUpdateDialog(
        title,
        message,
        tr("updateAvailableInstallRestart"),
        tr("updateAvailableWhatsNew"),
        tr("updateAvailableLater"),
        tr("updateAvailableStopChecking")
      ).then(function (result) {
        var choice = result && result.choice;
        // Checking this box turns off Options -> General's own "Check for
        // updates on startup" - same setting, same effect either way -
        // applied regardless of which button was also clicked, same as the
        // startup disclaimer's own "don't show again" checkbox.
        if (result && result.checkboxChecked && generalSettings && typeof generalSettings.replaceState === "function") {
          var next = generalSettings.getState();
          next.checkForUpdates = false;
          generalSettings.replaceState(next);
          // Reflect it on the marker right away rather than leaving it
          // stuck on "outdated" until the next launch's check runs and
          // finds checking turned off - matches the install branch's own
          // relaunch making this moot for that one case.
          if (choice !== "install") {
            var disabledApi = markerApi();
            if (disabledApi && disabledApi.setDisabled) disabledApi.setDisabled();
          }
        }
        if (choice === "install") return installAndRelaunch(update).then(function () { return true; });
        if (choice === "whatsnew") {
          if (platform && platform.openExternalUrl) platform.openExternalUrl(RELEASES_PAGE_URL);
          // Re-prompt after sending them to the release notes, rather than
          // treating "What's new" as a final answer - they still need to
          // say install-or-not once they're done reading.
          return promptNativeInstall(update, tag);
        }
        return true;
      });
    }

    // Passive status-bar reminder (the ⓘ next to "active: X",
    // statusbar-loader-runtime.js owns its actual rendering/CSS state) -
    // the modal below only ever shows ONCE per version (alreadyNotifiedFor
    // gates it), so clicking "Later" means it never comes back on its own.
    // The marker is intentionally NOT gated by that same check - it goes
    // amber/blinking on every launch for as long as a genuinely newer
    // version exists, regardless of whether the one-time modal already
    // ran for that tag, and green again once a check confirms there's
    // nothing newer.
    function markerApi() {
      return window.NetReconNewUICore && window.NetReconNewUICore.updateAvailableStatusBar;
    }

    // Shared by the automatic on-launch check and the manual "click the
    // status bar marker" path below - given an Update the updater plugin
    // already confirmed exists, decide native-install-vs-open-releases-page
    // (same is_installer_install branch either way) and show it.
    function offerDesktopUpdate(update, tag) {
      return platform.invoke("is_installer_install")
        .catch(function () { return false; })
        .then(function (isInstaller) {
          return isInstaller ? promptNativeInstall(update, tag) : promptOpenReleasesPage(tag);
        });
    }

    function checkForUpdateDesktop() {
      var updater = getUpdaterApi();
      if (!updater) return Promise.resolve(false);

      return updater.check()
        .then(function (update) {
          if (!update) {
            var api1 = markerApi();
            if (api1) api1.setCurrent(window.NetReconNewUICore.APP_VERSION);
            return false;
          }

          var tag = "v" + String(update.version || "").replace(/^v/i, "");
          var api2 = markerApi();
          if (api2) api2.setOutdated(tag);
          if (alreadyNotifiedFor(tag)) return false;
          markNotified(tag);

          return offerDesktopUpdate(update, tag);
        })
        .catch(function () {
          // No latest.json yet, network error, bad signature, etc. - stay
          // silent, matching the web path's catch-all below. Leaves the
          // marker in its default green state, same as "not checked yet".
          return false;
        });
    }

    // Manually triggered by clicking the status bar's update marker
    // (statusbar-loader-runtime.js, only wired while it's in its "outdated"
    // state) - re-checks fresh rather than reusing a possibly-stale Update
    // object from the last automatic check, and always offers the prompt
    // regardless of the "Check for updates on startup" setting or whether
    // the one-time automatic notification already fired for this version:
    // an explicit click is always allowed to ask again, that's the whole
    // point of making the marker clickable.
    function promptUpdateNow() {
      if (platform && platform.isDesktop && platform.isDesktop()) {
        var updater = getUpdaterApi();
        if (!updater) return Promise.resolve(false);
        return updater.check().then(function (update) {
          if (!update) {
            // The re-check came back clean (e.g. it was somehow installed
            // moments ago through another path) - flip the marker back to
            // "current" exactly like the automatic on-launch check would,
            // rather than leaving it stuck showing "outdated" with nothing
            // left for another click to do.
            var api = markerApi();
            if (api) api.setCurrent(window.NetReconNewUICore.APP_VERSION);
            return false;
          }
          var tag = "v" + String(update.version || "").replace(/^v/i, "");
          return offerDesktopUpdate(update, tag);
        }).catch(function () { return false; });
      }

      var localVersion = (window.NetReconNewUICore && window.NetReconNewUICore.APP_VERSION) || "";
      return fetchLatestTag().then(function (remoteTag) {
        if (!remoteTag || !isNewer(remoteTag, localVersion)) {
          var api = markerApi();
          if (api) api.setCurrent(localVersion);
          return false;
        }
        return promptOpenReleasesPage(remoteTag);
      }).catch(function () { return false; });
    }

    function checkForUpdateWeb() {
      var localVersion = (window.NetReconNewUICore && window.NetReconNewUICore.APP_VERSION) || "";

      return fetchLatestTag()
        .then(function (remoteTag) {
          if (!remoteTag || !isNewer(remoteTag, localVersion)) {
            var api1 = markerApi();
            if (api1) api1.setCurrent(localVersion);
            return false;
          }
          var api2 = markerApi();
          if (api2) api2.setOutdated(remoteTag);
          if (alreadyNotifiedFor(remoteTag)) return false;

          markNotified(remoteTag);
          return promptOpenReleasesPage(remoteTag);
        })
        .catch(function () {
          return false;
        });
    }

    function checkForUpdate() {
      var settings = generalSettings && generalSettings.getState ? generalSettings.getState() : {};
      if (!settings.checkForUpdates) {
        var disabledApi = markerApi();
        if (disabledApi && disabledApi.setDisabled) disabledApi.setDisabled();
        return Promise.resolve(false);
      }

      return platform && platform.isDesktop && platform.isDesktop()
        ? checkForUpdateDesktop()
        : checkForUpdateWeb();
    }

    return {
      checkForUpdate: checkForUpdate,
      promptUpdateNow: promptUpdateNow,
      isNewer: isNewer,
      parseVersion: parseVersion,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createUpdateCheckRuntime = createUpdateCheckRuntime;
})();
