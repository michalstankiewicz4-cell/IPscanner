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

  function createUpdateCheckRuntime(deps) {
    var tr = deps.tr;
    var platform = deps.platform;
    var generalSettings = deps.generalSettings;

    function checkForUpdate() {
      var settings = generalSettings && generalSettings.getState ? generalSettings.getState() : {};
      if (!settings.checkForUpdates) return Promise.resolve(false);

      var localVersion = (window.NetReconNewUICore && window.NetReconNewUICore.APP_VERSION) || "";

      return fetchLatestTag()
        .then(function (remoteTag) {
          if (!remoteTag || !isNewer(remoteTag, localVersion)) return false;
          if (alreadyNotifiedFor(remoteTag)) return false;

          markNotified(remoteTag);

          var title = tr("updateAvailableTitle");
          var message = tr("updateAvailableMessage") + " " + remoteTag;
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
        })
        .catch(function () {
          return false;
        });
    }

    return {
      checkForUpdate: checkForUpdate,
      isNewer: isNewer,
      parseVersion: parseVersion,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createUpdateCheckRuntime = createUpdateCheckRuntime;
})();
