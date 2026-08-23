(function () {
  // Shared constants for the Community Catalog feature (GitHub-topic-tagged
  // addon repos + Supabase-backed ratings/replies/moderation). Used by
  // addon-catalog-runtime.js (discovery/rating reads), community-auth-runtime.js
  // (GitHub OAuth via Supabase) and community-data-runtime.js (ratings/replies/
  // moderation reads+writes) - one place to change the project/topic/admin.
  //
  // SUPABASE_ANON_KEY is the "anon"/"publishable" key - safe to ship in client
  // code, restrictions are enforced by Postgres Row Level Security policies on
  // the Supabase side, not by keeping this key secret.
  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.communityConfig = {
    SUPABASE_URL: "https://ujgzqqnnafzktgpmbixh.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_xX4DuUbRnXzK0XBxjN3pFg_ta98sweT",
    ADDON_TOPIC: "osintnetauditor-addon",
    // How long the catalog (tools/ + Community) stays cached in
    // localStorage before a reload/restart re-fetches from GitHub -
    // protects the unauthenticated 60/h (contents/license/readme) and
    // 10/min (search) quotas from being burned by every app restart, not
    // just repeated tab switches within one running session (those are
    // already covered by the in-memory cache in addon-catalog-runtime.js).
    CACHE_TTL_MS: 5 * 60 * 1000,
    // UI-only convenience (which login shows admin controls) - the actual
    // write permission is enforced server-side by RLS against a fixed UUID,
    // not by this string.
    ADMIN_GITHUB_LOGIN: "michalstankiewicz4-cell"
  };
})();
