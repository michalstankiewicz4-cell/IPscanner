# Community Chat - one-time setup (Discord + Cloudflare Worker + Turnstile)

This is a **one-time, developer-only** setup. Once done, every user of the
app gets a working chat with zero configuration of their own. Nobody needs
to touch anything below except you, once.

## 1. Discord side

1. Create a Discord server for the app's community (or use an existing
   one), and a text channel for the in-app chat, e.g. `#app-chat`.
2. **Webhook**: channel settings -> Integrations -> Webhooks -> New
   Webhook -> copy the Webhook URL. Keep it secret - it goes into
   Cloudflare, never into the app.
3. **Bot**: go to the [Discord Developer Portal](https://discord.com/developers/applications) ->
   New Application -> Bot tab -> Reset Token -> copy the token. Under
   "Privileged Gateway Intents", enable **"Message Content Intent"**
   (without it, the Bot API returns messages with empty `content`) -
   nothing else needed (this bot only reads via REST, it never connects to
   the gateway). Then invite it to your server with just "View Channel" +
   "Read Message History" permission (OAuth2 -> URL Generator -> scope
   `bot`, those two permissions only) - open the generated URL in a new
   browser tab and actually complete the "add to server" flow, it's easy to
   generate the link and forget this step.
3b. **OAuth2 login (optional, for the "verified sender" checkmark feature)**:
   same Application as the bot above - OAuth2 tab -> add a redirect URI
   `https://<your-worker>.workers.dev/oauth/callback` (use the real Worker
   URL from section 3, not this placeholder) -> note the **Client ID** and
   (under "Reset Secret") the **Client Secret**. Only the `identify` scope
   is needed at runtime (username only - no email, no guild list). Both
   values go into the Worker's secrets below, never into the app.
4. **Channel ID**: enable Developer Mode (User Settings -> Advanced),
   right-click the channel -> Copy Channel ID.
5. Optional but recommended before going live: Server Settings -> Safety
   Setup -> AutoMod -> add a keyword-filter rule on that channel.

You now have three values: webhook URL, bot token, channel ID. They go into
Cloudflare below, not into the app.

## 2. Cloudflare Turnstile (proves a request came from the real app, not a script)

The Worker's URL is necessarily public (embedded in the app), so anyone who
extracts it could otherwise `curl` it directly, bypassing the app entirely.
Turnstile is Cloudflare's free CAPTCHA-alternative, run invisibly - a bare
script can't complete its challenge, only a real browser/webview running the
app's JS can.

1. Cloudflare dashboard -> **Turnstile** -> Add a site.
2. Domain: add the domain(s) the app calls from - `localhost` (desktop
   webview) and your www domain if you have one.
3. Widget mode: **Invisible**.
4. You get two values: a **Site Key** (public - goes into the app) and a
   **Secret Key** (private - goes into the Worker, next section).
5. **Send me the Site Key** so it can be set in
   `community-chat-runtime.js` (currently a placeholder,
   `REPLACE_WITH_TURNSTILE_SITE_KEY`).

## 3. Cloudflare Worker (the proxy that hides the Discord + Turnstile secrets)

1. Sign up at [cloudflare.com](https://cloudflare.com) (free, no credit
   card needed for Workers' free tier).
2. Dashboard -> Workers & Pages -> Create -> Create Worker -> give it a
   name (e.g. `ipscanner-chat`) -> Deploy (this deploys a placeholder
   first, you'll edit it next).
3. Click "Edit code" and replace everything with the script below.
4. Settings -> Variables and Secrets -> add 6 **encrypted** secrets:
   - `DISCORD_WEBHOOK_URL` = the webhook URL from step 1.2
   - `DISCORD_BOT_TOKEN` = the bot token from step 1.3
   - `DISCORD_CHANNEL_ID` = the channel ID from step 1.4
   - `TURNSTILE_SECRET_KEY` = the Secret Key from step 2.4
   - `DISCORD_CLIENT_ID` = the Client ID from step 3b
   - `DISCORD_CLIENT_SECRET` = the Client Secret from step 3b
5. Settings -> Bindings -> Add binding -> **KV namespace**, variable name
   `OAUTH_SESSIONS`, create a new namespace if you don't have one yet (this
   is where OAuth login state and sessions live - it needs no manual
   entries, the Worker manages it).
6. Deploy. Your Worker now has a public URL like
   `https://ipscanner-chat.<your-subdomain>.workers.dev`.
7. Optional hardening: dashboard -> your Worker -> Settings -> Triggers/
   Security -> add a Rate Limiting rule (e.g. 10 requests/minute per IP)
   on the route - a second layer on top of Turnstile.
8. **Send me the Worker's URL** (the `https://....workers.dev` one) -
   that's the only thing that goes into the app besides the Turnstile Site
   Key. The OAuth Client ID/Secret and the KV namespace stay Worker-side
   only - the app never learns them, same trust boundary as the Discord
   webhook/bot token.

### Worker script (paste this in step 3.3)

```js
// Discord rejects webhook usernames containing these (confirmed live) or
// these characters - mirrors community-chat-runtime.js's sanitizeNickname(),
// but this copy is the AUTHORITATIVE one: the client-side check is only a
// UX nicety, since anyone with a valid Turnstile token can call this Worker
// directly, bypassing the app's own JS entirely. The leading-checkmark ban
// is what keeps an anonymous sender from typing "✓ SomeoneElse" to fake
// the verified-login look - real verified identities never go through this
// path at all (see the sessionToken branch below), so the character has no
// legitimate anonymous use.
function validateNickname(nickname) {
  if (!nickname) return "required";
  const lower = nickname.toLowerCase();
  if (lower.indexOf("discord") !== -1 || lower.indexOf("clyde") !== -1) return "forbidden_substring";
  if (/[@#:`]/.test(nickname)) return "forbidden_chars";
  if (nickname.indexOf("✓") === 0) return "reserved_prefix";
  return null;
}

function escapeHtmlBasic(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === "/send" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return new Response(JSON.stringify({ error: "invalid json" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const text = String(body.text || "").trim().slice(0, 500);
      const turnstileToken = String(body.turnstileToken || "");
      const sessionToken = String(body.sessionToken || "");
      if (!text) {
        return new Response(JSON.stringify({ error: "text required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!turnstileToken) {
        return new Response(JSON.stringify({ error: "missing verification token" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Turnstile runs unconditionally, on BOTH the anonymous and the
      // logged-in path - identity verification and bot-proofing are
      // orthogonal, a leaked sessionToken must not become a script-friendly,
      // checkmark-badged spam credential.
      const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: env.TURNSTILE_SECRET_KEY,
          response: turnstileToken,
          remoteip: request.headers.get("CF-Connecting-IP") || "",
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        return new Response(JSON.stringify({ error: "verification failed" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let username;
      if (sessionToken) {
        const session = await env.OAUTH_SESSIONS.get(sessionToken, "json");
        if (!session || !session.discordUsername) {
          return new Response(JSON.stringify({ error: "invalid session" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // A real Discord username can't contain "discord"/"clyde" (Discord
        // blocks that at account-creation time) so it skips validateNickname
        // entirely - it's not user-supplied free text on this path.
        username = "✓ " + session.discordUsername;
      } else {
        const nickname = String(body.nickname || "").trim().slice(0, 32);
        const nicknameError = validateNickname(nickname);
        if (nicknameError) {
          return new Response(JSON.stringify({ error: nicknameError }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        username = nickname;
      }

      const discordRes = await fetch(env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, username: username }),
      });

      if (!discordRes.ok) {
        return new Response(JSON.stringify({ error: "discord rejected the message" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1 of login: mint a short-lived `state`, hand back the Discord
    // authorize URL built server-side (the app never learns the Client ID).
    if (url.pathname === "/oauth/start" && request.method === "POST") {
      const state = crypto.randomUUID();
      await env.OAUTH_SESSIONS.put(state, JSON.stringify({ status: "pending" }), { expirationTtl: 600 });
      const redirectUri = url.origin + "/oauth/callback";
      const authorizeUrl = "https://discord.com/api/oauth2/authorize?" + new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "identify",
        state: state,
      }).toString();
      return new Response(JSON.stringify({ state, authorizeUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Discord redirects the user's browser here after they approve.
    // `state` must still be "pending" - guards against an expired, replayed,
    // or forged state being used to overwrite a KV entry that either never
    // existed or already resolved.
    if (url.pathname === "/oauth/callback" && request.method === "GET") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code || !state) {
        return new Response("Missing code or state.", { status: 400 });
      }

      const pending = await env.OAUTH_SESSIONS.get(state, "json");
      if (!pending || pending.status !== "pending") {
        return new Response("This login link has expired - close this tab and try again.", { status: 400 });
      }

      const redirectUri = url.origin + "/oauth/callback";
      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env.DISCORD_CLIENT_ID,
          client_secret: env.DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code: code,
          redirect_uri: redirectUri,
        }),
      });
      if (!tokenRes.ok) {
        return new Response("Discord login failed - close this tab and try again.", { status: 502 });
      }
      const tokenData = await tokenRes.json();

      const meRes = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (!meRes.ok) {
        return new Response("Discord login failed - close this tab and try again.", { status: 502 });
      }
      const me = await meRes.json();
      const discordUsername = me.username;

      // Two independent KV writes, each with its OWN explicit expirationTtl
      // (a put() on an existing key does not carry forward a previous key's
      // TTL): `sessionToken` is the real long-lived credential (30 days);
      // `state` just needs to survive long enough for the app's poll to
      // pick up the "done" result (10 min, same window as step 1).
      const sessionToken = crypto.randomUUID();
      await env.OAUTH_SESSIONS.put(sessionToken, JSON.stringify({ discordUsername }), { expirationTtl: 2592000 });
      await env.OAUTH_SESSIONS.put(state, JSON.stringify({ status: "done", sessionToken, discordUsername }), { expirationTtl: 600 });

      return new Response(
        "<html><body style=\"font-family:sans-serif;padding:40px;text-align:center;\">Logged in as " +
          escapeHtmlBasic(discordUsername) +
          " - you can close this tab.</body></html>",
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // Step 3: the app polls this while the user is off in their browser.
    if (url.pathname === "/oauth/status" && request.method === "GET") {
      const state = url.searchParams.get("state") || "";
      const record = await env.OAUTH_SESSIONS.get(state, "json");
      if (!record) {
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(record), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/messages" && request.method === "GET") {
      const after = url.searchParams.get("after");
      let discordUrl = `https://discord.com/api/v10/channels/${env.DISCORD_CHANNEL_ID}/messages?limit=50`;
      if (after) discordUrl += `&after=${encodeURIComponent(after)}`;

      const discordRes = await fetch(discordUrl, {
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
      });

      if (!discordRes.ok) {
        return new Response(JSON.stringify({ error: "failed to fetch messages" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const messages = await discordRes.json();
      const simplified = messages
        .map((m) => ({
          id: m.id,
          author: (m.author && m.author.username) || "?",
          content: m.content,
          timestamp: m.timestamp,
        }))
        .reverse();

      return new Response(JSON.stringify(simplified), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
};
```

## What happens if the Worker ever needs to change

Unlike the direct-embed approach, rotating the Discord webhook/bot token or
the Turnstile secret does **not** require a new app release - just update
the secrets in the Cloudflare dashboard (step 4 above) and the existing app
keeps working, since it only ever talks to the stable Worker URL. Only the
Turnstile **Site Key** (public, step 2.4) is baked into the app - rotating
that one does need a new release.
