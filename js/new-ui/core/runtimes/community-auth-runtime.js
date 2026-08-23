(function () {
  function createCommunityAuthRuntime(deps) {
    var platform = deps.platform;
    var config = (window.NetReconNewUICore && window.NetReconNewUICore.communityConfig) || {};
    var SUPABASE_URL = config.SUPABASE_URL;
    var SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY;

    // Desktop only. NSIS/MSI don't register this at install time - the Rust
    // side calls app.deep_link().register() on every launch instead (see
    // main.rs). The Supabase project's Authentication -> URL Configuration
    // must list this exact redirect URL, or the provider will refuse to
    // send the browser back to it after login.
    var DEEP_LINK_SCHEME = "osintnetauditor";
    var DEEP_LINK_REDIRECT = DEEP_LINK_SCHEME + "://auth-callback";

    // supabase-js is loaded from esm.sh at runtime (CSP explicitly trusts
    // this host, see tauri.conf.json) rather than vendored, per an explicit
    // choice made when this was built - only the auth/session machinery
    // (OAuth redirect handling, PKCE, token refresh) uses the SDK; all
    // *data* calls (ratings/replies/moderation, community-data-runtime.js)
    // stay plain fetch() against the REST API, no SDK needed there.
    var supabaseClientPromise = null;
    function getSupabaseClient() {
      if (!supabaseClientPromise) {
        supabaseClientPromise = import("https://esm.sh/@supabase/supabase-js@2").then(function (mod) {
          return mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        });
      }
      return supabaseClientPromise;
    }

    var currentSession = null;
    var listeners = [];

    function toSession(user) {
      if (!user) return null;
      var meta = user.user_metadata || {};
      return {
        userId: user.id,
        login: meta.user_name || meta.preferred_username || "",
        avatarUrl: meta.avatar_url || ""
      };
    }

    function notify() {
      listeners.forEach(function (cb) {
        try {
          cb(currentSession);
        } catch (_) {
          // one bad listener shouldn't break the others
        }
      });
    }

    function getSession() {
      return currentSession;
    }

    function onSessionChange(cb) {
      listeners.push(cb);
      return function () {
        var idx = listeners.indexOf(cb);
        if (idx !== -1) listeners.splice(idx, 1);
      };
    }

    // community-data-runtime.js's writes need the user's live access token
    // as the Authorization bearer (not part of the login/avatar-only
    // session object above) - fetched fresh each call so it's never stale
    // after supabase-js's own background token refresh.
    function getAccessToken() {
      return getSupabaseClient().then(function (client) {
        return client.auth.getSession();
      }).then(function (res) {
        return (res && res.data && res.data.session && res.data.session.access_token) || null;
      }).catch(function () {
        return null;
      });
    }

    // shell (desktop only): the app's own webview can't complete a GitHub
    // OAuth redirect round-trip, so loginWithGitHub() below opens the
    // authorize URL in the SYSTEM browser instead (open_browser, an
    // existing Tauri command). This function catches the provider's final
    // redirect back to DEEP_LINK_REDIRECT three different ways, because
    // Windows always launches a SECOND process for a custom URL scheme
    // while the original app window is still running (mid-login) - that's
    // the path that actually fires on every real login, not the "cold
    // start" one:
    //  - getCurrent() covers a genuine cold start (app wasn't running at
    //    all before the redirect - rare in practice here, but cheap to
    //    keep as a fallback).
    //  - onOpenUrl() covers the deep-link plugin's own warm-start path, if
    //    the OS/plugin ever does route it to the existing process directly.
    //  - "single-instance-deep-link" is the one that actually fires in
    //    practice: tauri-plugin-single-instance (registered first, see
    //    main.rs) intercepts the second process Windows spawns, forwards
    //    its argv here, and lets the second process exit without ever
    //    opening a window.
    function wireDesktopDeepLink(client) {
      var tauri = window.__TAURI__;

      function handleUrls(urls) {
        var url = (urls || []).filter(function (u) {
          return typeof u === "string" && u.indexOf(DEEP_LINK_SCHEME + "://") === 0;
        })[0];
        if (url) exchangeCallbackUrl(client, url);
      }

      var deepLink = tauri && tauri.deepLink;
      if (deepLink && typeof deepLink.getCurrent === "function") {
        deepLink.getCurrent().then(function (urls) {
          if (urls && urls.length) handleUrls(urls);
        }).catch(function () {
          // no cold-start URL, nothing to do
        });
      }
      if (deepLink && typeof deepLink.onOpenUrl === "function") {
        deepLink.onOpenUrl(handleUrls);
      }

      if (tauri && tauri.event && typeof tauri.event.listen === "function") {
        tauri.event.listen("single-instance-deep-link", function (event) {
          handleUrls(event && event.payload);
        });
      }

      return null;
    }

    // Handles both OAuth flow shapes Supabase might redirect with: PKCE
    // (a ?code= query param - the current supabase-js default) and, as a
    // defensive fallback, implicit flow (#access_token=/#refresh_token= in
    // the fragment).
    function exchangeCallbackUrl(client, url) {
      var parsed;
      try {
        parsed = new URL(url);
      } catch (_) {
        return;
      }

      var code = parsed.searchParams.get("code");
      if (code) {
        client.auth.exchangeCodeForSession(code).catch(function () {
          // surfaced to the user as "still logged out" - nothing more
          // actionable to do client-side on a failed exchange
        });
        return;
      }

      var hashParams = new URLSearchParams((parsed.hash || "").replace(/^#/, ""));
      var accessToken = hashParams.get("access_token");
      var refreshToken = hashParams.get("refresh_token");
      if (accessToken && refreshToken) {
        client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).catch(function () {});
      }
    }

    var initPromise = null;
    function init() {
      if (initPromise) return initPromise;
      initPromise = getSupabaseClient().then(function (client) {
        client.auth.onAuthStateChange(function (_event, authSession) {
          currentSession = toSession(authSession && authSession.user);
          notify();
        });

        if (platform && platform.isDesktop && platform.isDesktop()) {
          wireDesktopDeepLink(client);
        }
        // www build: supabase-js's own detectSessionInUrl (default true)
        // already parses window.location on load after a plain redirect -
        // nothing else to do here.
        return client;
      }).catch(function () {
        return null;
      });
      return initPromise;
    }

    function loginWithGitHub() {
      return init().then(function () {
        return getSupabaseClient();
      }).then(function (client) {
        var isDesktop = !!(platform && platform.isDesktop && platform.isDesktop());
        return client.auth.signInWithOAuth({
          provider: "github",
          options: {
            redirectTo: isDesktop ? DEEP_LINK_REDIRECT : window.location.href,
            skipBrowserRedirect: isDesktop
          }
        }).then(function (res) {
          if (res.error) throw res.error;
          var url = res.data && res.data.url;
          if (isDesktop && url) {
            platform.invoke("open_browser", { url: url });
          }
          // non-desktop: skipBrowserRedirect is false, supabase-js already
          // navigated window.location itself.
        });
      });
    }

    function logout() {
      return getSupabaseClient().then(function (client) {
        return client.auth.signOut();
      });
    }

    return {
      init: init,
      getSession: getSession,
      onSessionChange: onSessionChange,
      getAccessToken: getAccessToken,
      loginWithGitHub: loginWithGitHub,
      logout: logout
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createCommunityAuthRuntime = createCommunityAuthRuntime;
})();
