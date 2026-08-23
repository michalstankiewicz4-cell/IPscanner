(function () {
  // Ratings/replies/moderation for the Community Catalog - plain fetch()
  // against Supabase's REST API, no SDK (that's only needed for the OAuth
  // dance, see community-auth-runtime.js). Reads use the anon key; writes
  // use the logged-in user's own access token as the Authorization bearer
  // (the `apikey` header stays the anon key regardless - it identifies the
  // Supabase project, `Authorization` identifies the acting user for RLS's
  // auth.uid()). All the actual access rules (self-rating block, one
  // rating per user per repo, admin-only moderation writes) are enforced
  // server-side by Row Level Security policies already in the database -
  // this file only needs to call the right endpoint with the right token.
  function createCommunityDataRuntime(deps) {
    var authRuntime = deps.authRuntime;
    var config = (window.NetReconNewUICore && window.NetReconNewUICore.communityConfig) || {};
    var SUPABASE_URL = config.SUPABASE_URL;
    var SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY;

    function readHeaders() {
      return { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY };
    }

    function writeHeaders(token, prefer) {
      return {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Prefer: prefer
      };
    }

    function requireToken() {
      return authRuntime.getAccessToken().then(function (token) {
        if (!token) throw new Error("not-authenticated");
        return token;
      });
    }

    function expectOk(res) {
      if (res.ok) return;
      return res.text().then(function (text) {
        throw new Error(text || ("HTTP " + res.status));
      });
    }

    // PostgREST embeds a 1:1 relation sometimes as an object, sometimes as
    // a one-element array, depending on version - handle both.
    function normalizeReply(row) {
      var raw = Array.isArray(row.rating_replies) ? row.rating_replies[0] : row.rating_replies;
      if (!raw) return null;
      return { text: raw.reply, createdAt: raw.created_at };
    }

    function fetchEntries(repoFullName) {
      var url = SUPABASE_URL + "/rest/v1/ratings"
        + "?select=id,github_login,stars,comment,created_at,rating_replies(reply,created_at)"
        + "&repo_full_name=eq." + encodeURIComponent(repoFullName)
        + "&order=created_at.desc";
      return fetch(url, { headers: readHeaders() }).then(function (res) {
        return res.ok ? res.json() : [];
      }).then(function (rows) {
        return rows.map(function (row) {
          return {
            id: row.id,
            login: row.github_login,
            stars: row.stars,
            comment: row.comment,
            createdAt: row.created_at,
            reply: normalizeReply(row)
          };
        });
      }).catch(function () {
        return [];
      });
    }

    // Upsert on (repo_full_name, user_id) - a second review from the same
    // user on the same addon replaces the first instead of duplicating.
    function upsertEntry(repoFullName, entry) {
      return requireToken().then(function (token) {
        var url = SUPABASE_URL + "/rest/v1/ratings?on_conflict=repo_full_name,user_id";
        return fetch(url, {
          method: "POST",
          headers: writeHeaders(token, "resolution=merge-duplicates"),
          body: JSON.stringify({
            repo_full_name: repoFullName,
            user_id: entry.userId,
            github_login: entry.login,
            stars: entry.stars,
            comment: entry.comment || ""
          })
        }).then(expectOk);
      });
    }

    function upsertReply(ratingId, repoOwnerLogin, replyText) {
      return requireToken().then(function (token) {
        var url = SUPABASE_URL + "/rest/v1/rating_replies?on_conflict=rating_id";
        return fetch(url, {
          method: "POST",
          headers: writeHeaders(token, "resolution=merge-duplicates"),
          body: JSON.stringify({ rating_id: ratingId, repo_owner_login: repoOwnerLogin, reply: replyText })
        }).then(expectOk);
      });
    }

    // Owner of the rating, or the fixed admin UUID (RLS - see
    // ratings_delete_own policy), may delete.
    function deleteEntry(ratingId) {
      return requireToken().then(function (token) {
        var url = SUPABASE_URL + "/rest/v1/ratings?id=eq." + encodeURIComponent(ratingId);
        return fetch(url, { method: "DELETE", headers: writeHeaders(token, "return=minimal") }).then(expectOk);
      });
    }

    function averageStars(entries) {
      if (!entries.length) return null;
      var sum = entries.reduce(function (acc, e) { return acc + e.stars; }, 0);
      return sum / entries.length;
    }

    function moderationUpsert(repoFullName, patch) {
      return requireToken().then(function (token) {
        var url = SUPABASE_URL + "/rest/v1/addon_moderation?on_conflict=repo_full_name";
        var body = { repo_full_name: repoFullName };
        for (var key in patch) {
          if (Object.prototype.hasOwnProperty.call(patch, key)) body[key] = patch[key];
        }
        return fetch(url, {
          method: "POST",
          headers: writeHeaders(token, "resolution=merge-duplicates"),
          body: JSON.stringify(body)
        }).then(expectOk);
      });
    }

    function setVerified(repoFullName, verified) {
      return moderationUpsert(repoFullName, { verified: verified });
    }

    function setBlocked(repoFullName, blocked) {
      return moderationUpsert(repoFullName, { blocked: blocked });
    }

    function blockUser(githubLogin, reason) {
      return requireToken().then(function (token) {
        var url = SUPABASE_URL + "/rest/v1/blocked_users?on_conflict=github_login";
        return fetch(url, {
          method: "POST",
          headers: writeHeaders(token, "resolution=merge-duplicates"),
          body: JSON.stringify({ github_login: String(githubLogin).toLowerCase(), reason: reason || null })
        }).then(expectOk);
      });
    }

    function unblockUser(githubLogin) {
      return requireToken().then(function (token) {
        var url = SUPABASE_URL + "/rest/v1/blocked_users?github_login=eq." + encodeURIComponent(String(githubLogin).toLowerCase());
        return fetch(url, { method: "DELETE", headers: writeHeaders(token, "return=minimal") }).then(expectOk);
      });
    }

    return {
      fetchEntries: fetchEntries,
      upsertEntry: upsertEntry,
      upsertReply: upsertReply,
      deleteEntry: deleteEntry,
      averageStars: averageStars,
      setVerified: setVerified,
      setBlocked: setBlocked,
      blockUser: blockUser,
      unblockUser: unblockUser
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createCommunityDataRuntime = createCommunityDataRuntime;
})();
