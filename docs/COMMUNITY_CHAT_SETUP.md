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
4. Settings -> Variables and Secrets -> add 4 **encrypted** secrets:
   - `DISCORD_WEBHOOK_URL` = the webhook URL from step 1.2
   - `DISCORD_BOT_TOKEN` = the bot token from step 1.3
   - `DISCORD_CHANNEL_ID` = the channel ID from step 1.4
   - `TURNSTILE_SECRET_KEY` = the Secret Key from step 2.4
5. Deploy. Your Worker now has a public URL like
   `https://ipscanner-chat.<your-subdomain>.workers.dev`.
6. Optional hardening: dashboard -> your Worker -> Settings -> Triggers/
   Security -> add a Rate Limiting rule (e.g. 10 requests/minute per IP)
   on the route - a second layer on top of Turnstile.
7. **Send me the Worker's URL** (the `https://....workers.dev` one) -
   that's the only thing that goes into the app besides the Turnstile Site
   Key.

### Worker script (paste this in step 3.3)

```js
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

      const nickname = String(body.nickname || "").trim().slice(0, 32);
      const text = String(body.text || "").trim().slice(0, 500);
      const turnstileToken = String(body.turnstileToken || "");
      if (!nickname || !text) {
        return new Response(JSON.stringify({ error: "nickname and text required" }), {
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

      const discordRes = await fetch(env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, username: nickname }),
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
