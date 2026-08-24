(function () {
  // Left-panel list + center detail tab for the Community Catalog
  // (GitHub-topic-tagged addon repos + Supabase ratings/replies/
  // moderation). Mirrors the Agent Profiles master-detail pattern
  // (panel-interactions-runtime.js's wireAgentProfileLibrary/
  // wireAgentProfileDetail): the list sets a module-scope "selected"
  // var and dispatches a custom event; the detail tab listens and
  // re-renders from that var - state lives in JS, not the DOM, because
  // refreshActiveUI() rebuilds the center tab's whole subtree on every
  // tab switch.
  function createCommunityCatalogDetailRuntime(deps) {
    var tr = deps.tr;
    var setStatusLine = deps.setStatusLine;
    var extensionHost = deps.extensionHost;
    var addonCatalogRuntime = deps.addonCatalogRuntime;
    var authRuntime = deps.authRuntime;
    var dataRuntime = deps.dataRuntime;
    var switchTool = deps.switchTool;

    var config = (window.NetReconNewUICore && window.NetReconNewUICore.communityConfig) || {};
    var ADMIN_GITHUB_LOGIN = (config.ADMIN_GITHUB_LOGIN || "").toLowerCase();
    var COMMUNITY_GUIDELINES_URL = "https://github.com/michalstankiewicz4-cell/IPscanner/blob/main/docs/COMMUNITY_ADDON_GUIDELINES.md";

    var selectedRatingKey = "";
    var detailListenersBound = false;

    function isAdminSession(session) {
      return !!(session && session.login && ADMIN_GITHUB_LOGIN && session.login.toLowerCase() === ADMIN_GITHUB_LOGIN);
    }

    // Non-admins never see a blocked addon/author - admins still do, so
    // they have something to click "unblock" on.
    function isVisibleToViewer(entry, admin) {
      if (admin) return true;
      return !(entry.moderation && entry.moderation.blocked) && !entry.authorBlocked;
    }

    function findEntry(entries, ratingKey) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].ratingKey === ratingKey) return entries[i];
      }
      return null;
    }

    // Console tab (bottom pane) AND a blocking alert - the alert is easy
    // to miss/dismiss without reading, the console line is the persistent
    // record (matches how install/uninstall already log via setStatusLine
    // in addon-catalog-runtime.js).
    function alertError(err) {
      var message = String((err && err.message) || err || "Error");
      if (typeof setStatusLine === "function") setStatusLine(tr("menuPrefix") + ": " + message);
      window.alert(message);
    }

    // ---------- small shared builders ----------

    function starRow(interactive, onPick) {
      var row = document.createElement("div");
      row.className = interactive ? "v1-community-stars v1-community-stars--interactive" : "v1-community-stars";
      for (var i = 1; i <= 5; i++) {
        (function (value) {
          var star = document.createElement("span");
          star.textContent = "★";
          if (interactive) {
            star.addEventListener("click", function () { onPick(value); });
          }
          row.appendChild(star);
        })(i);
      }
      return row;
    }

    function filledStarRow(count) {
      var row = starRow(false, null);
      var children = row.children;
      for (var i = 0; i < children.length; i++) {
        if (i < count) children[i].classList.add("is-picked");
      }
      return row;
    }

    function renderVerifiedBadge() {
      var badge = document.createElement("span");
      badge.className = "v1-catalog-verified-badge";
      badge.textContent = "Verified";
      return badge;
    }

    function renderInstalledBadge() {
      var badge = document.createElement("span");
      badge.className = "v1-catalog-installed-badge-inline";
      badge.textContent = tr("communityCatalogInstalledBadge");
      return badge;
    }

    function renderRatingLabel(summary) {
      var el = document.createElement("span");
      el.className = "v1-catalog-rating";
      el.textContent = summary && summary.avg !== null
        ? summary.avg.toFixed(1) + "/5 (" + summary.count + ")"
        : tr("importToolRatingNone");
      return el;
    }

    // ---------- left panel list ----------

    function wireCommunityCatalogLibrary() {
      var mount = document.getElementById("v1CommunityCatalogList");
      var loginBarMount = document.getElementById("v1CommunityCatalogLoginBar");
      if (!mount) return;

      var latestEntries = [];

      function renderLoginBar() {
        if (!loginBarMount) return;
        loginBarMount.innerHTML = "";
        var session = authRuntime.getSession();
        if (session) {
          var wrap = document.createElement("div");
          wrap.className = "v1-community-session";
          if (session.avatarUrl) {
            var avatar = document.createElement("img");
            avatar.className = "v1-community-avatar";
            avatar.src = session.avatarUrl;
            avatar.alt = "";
            wrap.appendChild(avatar);
          }
          var name = document.createElement("span");
          name.textContent = session.login;
          wrap.appendChild(name);
          var logoutBtn = document.createElement("button");
          logoutBtn.type = "button";
          logoutBtn.textContent = tr("communityCatalogLogoutBtn");
          logoutBtn.addEventListener("click", function () { authRuntime.logout(); });
          wrap.appendChild(logoutBtn);
          loginBarMount.appendChild(wrap);
        } else {
          var loginBtn = document.createElement("button");
          loginBtn.type = "button";
          loginBtn.textContent = tr("communityCatalogLoginBtn");
          loginBtn.addEventListener("click", function () { authRuntime.loginWithGitHub(); });
          loginBarMount.appendChild(loginBtn);
        }

        var guidelinesRow = document.createElement("div");
        guidelinesRow.className = "v1-catalog-links-row";
        var guidelinesLink = document.createElement("a");
        guidelinesLink.href = COMMUNITY_GUIDELINES_URL;
        guidelinesLink.target = "_blank";
        guidelinesLink.rel = "noopener noreferrer";
        guidelinesLink.textContent = tr("communityCatalogGuidelinesLink");
        guidelinesRow.appendChild(guidelinesLink);
        loginBarMount.appendChild(guidelinesRow);
      }

      function renderList() {
        mount.innerHTML = "";
        var admin = isAdminSession(authRuntime.getSession());
        var visible = latestEntries.filter(function (entry) { return isVisibleToViewer(entry, admin); });

        // Verified first, otherwise keep the search API's own order.
        visible.sort(function (a, b) {
          var av = a.moderation && a.moderation.verified ? 1 : 0;
          var bv = b.moderation && b.moderation.verified ? 1 : 0;
          return bv - av;
        });

        if (!visible.length) {
          var emptyEl = document.createElement("div");
          emptyEl.className = "v1-import-empty";
          emptyEl.textContent = tr("communityCatalogEmpty");
          mount.appendChild(emptyEl);
          return;
        }

        var installedIds = extensionHost && extensionHost.listExtensions
          ? extensionHost.listExtensions().map(function (item) { return item.id; })
          : [];

        visible.forEach(function (entry) {
          var manifest = entry.manifest || {};
          var itemEl = document.createElement("div");
          itemEl.className = "v1-catalog-item v1-catalog-item--selectable";
          itemEl.setAttribute("data-community-rating-key", entry.ratingKey);
          if (entry.ratingKey === selectedRatingKey) itemEl.classList.add("is-selected");

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
          var nameRow = document.createElement("div");
          nameRow.className = "v1-catalog-name-row";
          var nameEl = document.createElement("strong");
          nameEl.textContent = manifest.name || manifest.id || "";
          nameRow.appendChild(nameEl);
          nameRow.appendChild(renderRatingLabel(entry.ratingSummary));
          if (entry.moderation && entry.moderation.verified) nameRow.appendChild(renderVerifiedBadge());
          if (installedIds.indexOf(manifest.id) !== -1) nameRow.appendChild(renderInstalledBadge());
          infoEl.appendChild(nameRow);
          itemEl.appendChild(infoEl);

          mount.appendChild(itemEl);
        });
      }

      function selectEntry(ratingKey) {
        selectedRatingKey = ratingKey;
        renderList();
        try {
          document.dispatchEvent(new CustomEvent("newui:community-catalog-selected", { detail: { ratingKey: ratingKey } }));
        } catch (_) {
          // ignore event dispatch failures
        }
        // Bring the detail tab into view too, same one-click UX as
        // clicking a row in results-ip's LS launcher list (bindResultTabs,
        // navigation-runtime.js) - no-ops harmlessly if the tab isn't
        // registered for some reason (switchTool's own contract).
        if (typeof switchTool === "function") switchTool("community-catalog");
      }

      if (mount.dataset.communityBound !== "1") {
        mount.dataset.communityBound = "1";
        mount.addEventListener("click", function (e) {
          var row = e.target && e.target.closest ? e.target.closest("[data-community-rating-key]") : null;
          if (!row) return;
          selectEntry(row.getAttribute("data-community-rating-key"));
        });
      }

      function reload() {
        mount.textContent = tr("communityCatalogLoading");
        // Wait for auth to settle too - the catalog can resolve almost
        // instantly from the localStorage cache, which could otherwise
        // race ahead of session restore and render a first pass as
        // "not admin" (hiding blocked entries) even for the actual admin.
        Promise.all([authRuntime.init(), addonCatalogRuntime.loadCommunityCatalogCached()]).then(function (results) {
          latestEntries = results[1];
          renderList();
        }).catch(function (err) {
          mount.textContent = tr("communityCatalogError");
          if (typeof setStatusLine === "function") {
            setStatusLine(tr("menuPrefix") + ": " + tr("communityCatalogError") + " - " + String((err && err.message) || err));
          }
        });
      }

      renderLoginBar();
      authRuntime.onSessionChange(function () {
        renderLoginBar();
        renderList();
      });
      authRuntime.init();

      // Fired by the detail tab (a separate mount with its own copy of the
      // catalog) after an install/review/moderation action - the cache is
      // already invalidated by then, so this is a real refetch, not stale
      // data.
      if (mount.dataset.communityChangeBound !== "1") {
        mount.dataset.communityChangeBound = "1";
        document.addEventListener("newui:community-catalog-changed", reload);
      }

      reload();
    }

    // ---------- center detail tab ----------

    function renderAdminPanel(entry, ctx) {
      var wrap = document.createElement("div");
      wrap.className = "v1-community-admin-panel v1-scanner-actions";

      var heading = document.createElement("h4");
      heading.textContent = tr("communityCatalogAdminHeading");
      wrap.appendChild(heading);

      var verified = !!(entry.moderation && entry.moderation.verified);
      var verifyBtn = document.createElement("button");
      verifyBtn.type = "button";
      verifyBtn.textContent = verified ? tr("communityCatalogUnverifyBtn") : tr("communityCatalogVerifyBtn");
      verifyBtn.addEventListener("click", function () {
        dataRuntime.setVerified(entry.ratingKey, !verified).then(function () {
          addonCatalogRuntime.invalidateCommunityCatalogCache();
          ctx.onChanged();
        }).catch(alertError);
      });
      wrap.appendChild(verifyBtn);

      var blocked = !!(entry.moderation && entry.moderation.blocked);
      var blockBtn = document.createElement("button");
      blockBtn.type = "button";
      blockBtn.className = blocked ? "" : "v1-community-danger-btn";
      blockBtn.textContent = blocked ? tr("communityCatalogUnblockAddonBtn") : tr("communityCatalogBlockAddonBtn");
      blockBtn.addEventListener("click", function () {
        dataRuntime.setBlocked(entry.ratingKey, !blocked).then(function () {
          addonCatalogRuntime.invalidateCommunityCatalogCache();
          ctx.onChanged();
        }).catch(alertError);
      });
      wrap.appendChild(blockBtn);

      var ownerLogin = entry.repoFullName ? entry.repoFullName.split("/")[0] : "";
      if (ownerLogin) {
        var authorBlocked = !!entry.authorBlocked;
        var authorBtn = document.createElement("button");
        authorBtn.type = "button";
        authorBtn.className = authorBlocked ? "" : "v1-community-danger-btn";
        authorBtn.textContent = (authorBlocked ? tr("communityCatalogUnblockAuthorBtn") : tr("communityCatalogBlockAuthorBtn")) + " (" + ownerLogin + ")";
        authorBtn.addEventListener("click", function () {
          var action = authorBlocked ? dataRuntime.unblockUser(ownerLogin) : dataRuntime.blockUser(ownerLogin);
          action.then(function () {
            addonCatalogRuntime.invalidateCommunityCatalogCache();
            ctx.onChanged();
          }).catch(alertError);
        });
        wrap.appendChild(authorBtn);
      }

      return wrap;
    }

    function renderReplyForm(commentEntry, entry, ctx) {
      var ownerLogin = entry.repoFullName ? entry.repoFullName.split("/")[0] : "";
      var form = document.createElement("form");
      form.className = "v1-community-reply-form";

      var textarea = document.createElement("textarea");
      textarea.placeholder = tr("communityCatalogReplyPlaceholder");
      textarea.value = commentEntry.reply ? commentEntry.reply.text : "";
      form.appendChild(textarea);

      var actions = document.createElement("div");
      actions.className = "v1-scanner-actions";
      var submit = document.createElement("button");
      submit.type = "submit";
      submit.textContent = tr("communityCatalogReplySubmitBtn");
      actions.appendChild(submit);
      form.appendChild(actions);

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        submit.disabled = true;
        dataRuntime.upsertReply(commentEntry.id, ownerLogin, textarea.value).then(ctx.onChanged).catch(function (err) {
          submit.disabled = false;
          alertError(err);
        });
      });

      return form;
    }

    function renderCommentItem(commentEntry, entry, isAuthor, isAdmin, ctx) {
      var item = document.createElement("li");
      var meta = document.createElement("div");
      meta.className = "v1-community-comment-meta v1-scanner-actions";
      var login = document.createElement("span");
      login.textContent = commentEntry.login;
      meta.appendChild(login);
      meta.appendChild(filledStarRow(commentEntry.stars));

      if (isAdmin) {
        var deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "v1-community-danger-btn v1-community-delete-btn";
        deleteBtn.textContent = tr("communityCatalogDeleteReviewBtn");
        deleteBtn.addEventListener("click", function () {
          if (!window.confirm(tr("communityCatalogDeleteConfirm"))) return;
          dataRuntime.deleteEntry(commentEntry.id).then(ctx.onChanged).catch(alertError);
        });
        meta.appendChild(deleteBtn);
      }

      item.appendChild(meta);

      if (commentEntry.comment) {
        var body = document.createElement("div");
        body.className = "v1-community-comment-body";
        body.textContent = commentEntry.comment;
        item.appendChild(body);
      }

      if (isAuthor) {
        item.appendChild(renderReplyForm(commentEntry, entry, ctx));
      } else if (commentEntry.reply) {
        var replyEl = document.createElement("div");
        replyEl.className = "v1-community-reply";
        var replyLabel = document.createElement("div");
        replyLabel.className = "v1-community-reply-label";
        replyLabel.textContent = tr("communityCatalogReplySavedLabel");
        replyEl.appendChild(replyLabel);
        var replyText = document.createElement("div");
        replyText.textContent = commentEntry.reply.text;
        replyEl.appendChild(replyText);
        item.appendChild(replyEl);
      }

      return item;
    }

    function renderReviewForm(entry, session, isAuthor, ctx) {
      if (!session) {
        var lockedNoSession = document.createElement("p");
        lockedNoSession.className = "v1-community-review-locked";
        lockedNoSession.textContent = tr("communityCatalogReviewLoginPrompt");
        return lockedNoSession;
      }
      if (isAuthor) {
        var lockedOwn = document.createElement("p");
        lockedOwn.className = "v1-community-review-locked";
        lockedOwn.textContent = tr("communityCatalogReviewOwnAddon");
        return lockedOwn;
      }

      var form = document.createElement("form");
      form.className = "v1-community-review-form";

      var picked = 0;
      var stars = starRow(true, function (value) {
        picked = value;
        var children = stars.children;
        for (var i = 0; i < children.length; i++) {
          if (i < value) children[i].classList.add("is-picked");
          else children[i].classList.remove("is-picked");
        }
      });
      form.appendChild(stars);

      var textarea = document.createElement("textarea");
      textarea.placeholder = tr("communityCatalogReviewPlaceholder");
      form.appendChild(textarea);

      var actions = document.createElement("div");
      actions.className = "v1-scanner-actions";
      var submit = document.createElement("button");
      submit.type = "submit";
      submit.textContent = tr("communityCatalogReviewSubmitBtn");
      actions.appendChild(submit);
      form.appendChild(actions);

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (picked === 0) return;
        submit.disabled = true;
        dataRuntime.upsertEntry(entry.ratingKey, {
          stars: picked,
          comment: textarea.value,
          userId: session.userId,
          login: session.login
        }).then(function () {
          addonCatalogRuntime.invalidateCommunityCatalogCache();
          ctx.onChanged();
        }).catch(function (err) {
          submit.disabled = false;
          alertError(err);
        });
      });

      return form;
    }

    function renderReviewsSection(entry, session, isAuthor, isAdmin, ctx) {
      var section = document.createElement("div");
      section.className = "v1-community-reviews";
      var heading = document.createElement("h4");
      heading.textContent = tr("communityCatalogReviewsHeading");
      section.appendChild(heading);

      var loadingEl = document.createElement("p");
      loadingEl.className = "v1-import-empty";
      loadingEl.textContent = tr("communityCatalogLoading");
      section.appendChild(loadingEl);

      dataRuntime.fetchEntries(entry.ratingKey).then(function (entries) {
        if (!document.body.contains(section)) return;
        section.innerHTML = "";
        section.appendChild(heading);

        var avg = dataRuntime.averageStars(entries);
        var summary = document.createElement("div");
        summary.className = "v1-community-rating-summary";
        summary.appendChild(filledStarRow(avg === null ? 0 : Math.round(avg)));
        var summaryLabel = document.createElement("span");
        summaryLabel.textContent = avg === null ? tr("importToolRatingNone") : avg.toFixed(1) + "/5 (" + entries.length + ")";
        summary.appendChild(summaryLabel);
        section.appendChild(summary);

        var list = document.createElement("ul");
        list.className = "v1-community-comments";
        if (!entries.length) {
          var emptyLi = document.createElement("li");
          emptyLi.className = "v1-community-comments-empty";
          emptyLi.textContent = tr("communityCatalogNoComments");
          list.appendChild(emptyLi);
        } else {
          entries.forEach(function (commentEntry) {
            list.appendChild(renderCommentItem(commentEntry, entry, isAuthor, isAdmin, ctx));
          });
        }
        section.appendChild(list);
        section.appendChild(renderReviewForm(entry, session, isAuthor, ctx));
      });

      return section;
    }

    function renderDetail(mount, entry, session, isAdmin, ctx) {
      mount.innerHTML = "";

      if (!entry) {
        var empty = document.createElement("p");
        empty.className = "v1-import-empty";
        empty.textContent = tr("communityCatalogSelectPrompt");
        mount.appendChild(empty);
        return;
      }

      var manifest = entry.manifest || {};
      var ownerLogin = entry.repoFullName ? entry.repoFullName.split("/")[0] : "";
      var isAuthor = !!(session && session.login && ownerLogin && session.login.toLowerCase() === ownerLogin.toLowerCase());

      var header = document.createElement("div");
      header.className = "v1-community-detail-header";

      var nameRow = document.createElement("div");
      nameRow.className = "v1-catalog-name-row";
      var nameEl = document.createElement("strong");
      nameEl.textContent = manifest.name || manifest.id || "";
      nameRow.appendChild(nameEl);
      if (entry.moderation && entry.moderation.verified) nameRow.appendChild(renderVerifiedBadge());
      header.appendChild(nameRow);

      if (entry.repoFullName) {
        var repoLink = document.createElement("a");
        repoLink.className = "v1-catalog-repo-link";
        repoLink.href = entry.repoHtmlUrl || ("https://github.com/" + entry.repoFullName);
        repoLink.target = "_blank";
        repoLink.rel = "noopener noreferrer";
        repoLink.textContent = entry.repoFullName;
        header.appendChild(repoLink);
      }

      var descEl = document.createElement("p");
      descEl.className = "v1-community-detail-desc";
      descEl.textContent = entry.repoDescription || manifest.description || "";
      header.appendChild(descEl);

      if ((entry.license && entry.license.htmlUrl) || entry.readmeUrl) {
        var linksRow = document.createElement("div");
        linksRow.className = "v1-catalog-links-row";
        if (entry.readmeUrl) {
          var readmeLink = document.createElement("a");
          readmeLink.href = entry.readmeUrl;
          readmeLink.target = "_blank";
          readmeLink.rel = "noopener noreferrer";
          readmeLink.textContent = "README";
          linksRow.appendChild(readmeLink);
        }
        if (entry.license && entry.license.htmlUrl) {
          var licenseLink = document.createElement("a");
          licenseLink.href = entry.license.htmlUrl;
          licenseLink.target = "_blank";
          licenseLink.rel = "noopener noreferrer";
          licenseLink.textContent = entry.license.spdxId || entry.license.name || "LICENSE";
          linksRow.appendChild(licenseLink);
        }
        header.appendChild(linksRow);
      }

      var installedIds = extensionHost && extensionHost.listExtensions
        ? extensionHost.listExtensions().map(function (item) { return item.id; })
        : [];
      var isInstalled = installedIds.indexOf(manifest.id) !== -1;

      var installBtn = document.createElement("button");
      installBtn.type = "button";
      installBtn.className = isInstalled ? "v1-import-item-uninstall" : "v1-catalog-install-btn";
      installBtn.textContent = isInstalled ? tr("importToolUninstallBtn") : tr("importToolInstallBtn");
      installBtn.addEventListener("click", function () {
        if (isInstalled) {
          addonCatalogRuntime.performUninstall(manifest.id, { afterUninstall: ctx.onChanged });
        } else {
          addonCatalogRuntime.installManifestObject(manifest, entry.iconUrl, entry.programSource, { afterInstall: ctx.onChanged });
        }
      });
      header.appendChild(installBtn);

      mount.appendChild(header);

      if (isAdmin) mount.appendChild(renderAdminPanel(entry, ctx));

      mount.appendChild(renderReviewsSection(entry, session, isAuthor, isAdmin, ctx));
    }

    function renderDetailNow(rootEl) {
      var root = rootEl && typeof rootEl.querySelector === "function" ? rootEl : document.getElementById("v1ToolDetail");
      if (!root) return;
      var mount = root.querySelector(".v1-community-detail-body");
      if (!mount) return;

      Promise.all([authRuntime.init(), addonCatalogRuntime.loadCommunityCatalogCached()]).then(function (results) {
        var entries = results[1];
        var session = authRuntime.getSession();
        var admin = isAdminSession(session);
        var entry = findEntry(entries, selectedRatingKey);
        if (entry && !isVisibleToViewer(entry, admin)) entry = null;
        renderDetail(mount, entry, session, admin, { onChanged: function () {
          renderDetailNow(root);
          // Installs/reviews/moderation done from THIS tab also need to
          // reach the left-panel list (rating/Verified/blocked shown
          // there, or the entry's visibility to a non-admin) - that list
          // is a separate mount with its own stale copy of the catalog,
          // see wireCommunityCatalogLibrary's listener for this event.
          try {
            document.dispatchEvent(new CustomEvent("newui:community-catalog-changed"));
          } catch (_) {
            // ignore event dispatch failures
          }
        } });
      }).catch(function (err) {
        mount.textContent = tr("communityCatalogError");
        if (typeof setStatusLine === "function") {
          setStatusLine(tr("menuPrefix") + ": " + tr("communityCatalogError") + " - " + String((err && err.message) || err));
        }
      });
    }

    function wireCommunityCatalogDetail(rootEl) {
      renderDetailNow(rootEl);

      if (detailListenersBound) return;
      detailListenersBound = true;

      document.addEventListener("newui:community-catalog-selected", function (event) {
        selectedRatingKey = (event && event.detail && event.detail.ratingKey) || "";
        renderDetailNow(document.getElementById("v1ToolDetail"));
      });

      authRuntime.onSessionChange(function () {
        renderDetailNow(document.getElementById("v1ToolDetail"));
      });
      authRuntime.init();
    }

    return {
      wireCommunityCatalogLibrary: wireCommunityCatalogLibrary,
      wireCommunityCatalogDetail: wireCommunityCatalogDetail
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createCommunityCatalogDetailRuntime = createCommunityCatalogDetailRuntime;
})();
