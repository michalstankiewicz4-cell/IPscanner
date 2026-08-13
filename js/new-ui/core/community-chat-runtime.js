(function () {
  // Community Chat: a shared chat backed by a Discord channel, without the
  // app ever holding a Discord webhook URL or bot token. Both live only in
  // a small Cloudflare Worker (see docs/COMMUNITY_CHAT_SETUP.md for its
  // source + one-time setup) that this file calls instead of Discord
  // directly - the Worker's own URL below is NOT sensitive (it carries no
  // access on its own; the Worker itself validates/forwards every
  // request), so it's fine for it to be visible in distributed app code on
  // both desktop and www, unlike the Discord secrets it fronts.
  var WORKER_URL = "https://polished-bar-e29a.michalstankiewicz4-f5b.workers.dev";

  var NICKNAME_STORAGE_KEY = "netrecon_community_chat_nickname_v1";
  var NICKNAME_CHANGED_AT_STORAGE_KEY = "netrecon_community_chat_nickname_changed_at_v1";
  var NICKNAME_CHANGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
  var IGNORED_STORAGE_KEY = "netrecon_community_chat_ignored_v1";
  var POLL_INTERVAL_MS = 5000;
  var MAX_MESSAGES = 200;

  // Discord OAuth login ("verified sender" upgrade over the free-text
  // nickname above - see docs/COMMUNITY_CHAT_SETUP.md section 3b/4). The
  // client poll timeout deliberately MATCHES the Worker's KV pending-state
  // TTL (both 10 min) - a shorter client timeout would show "login timed
  // out" while the callback could still silently succeed seconds later with
  // nobody polling for it anymore.
  var DISCORD_SESSION_STORAGE_KEY = "netrecon_community_chat_discord_session_v1";
  var OAUTH_POLL_INTERVAL_MS = 2000;
  var OAUTH_POLL_TIMEOUT_MS = 10 * 60 * 1000;

  // Cloudflare Turnstile: proves a /send request came from a real
  // browser/webview running this app's JS, not a bare script hitting the
  // Worker URL directly (the Worker URL itself is necessarily public - see
  // the comment above - so it's otherwise trivial to curl). The Site Key
  // below is meant to be public (same status as the Worker URL); only the
  // matching Secret Key is sensitive, and that lives solely in the Worker
  // (see docs/COMMUNITY_CHAT_SETUP.md), verified server-side via Cloudflare's
  // siteverify API before a message is ever forwarded to Discord.
  var TURNSTILE_SITE_KEY = "0x4AAAAAAENV2FSTvWjBAyA2";
  var TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";

  // Discord rejects webhook usernames containing these (anti-impersonation -
  // confirmed live: a webhook post with username "InnyUser-Discord" came
  // back 400 {"username": ["Username cannot contain \"discord\""]}) or
  // containing these characters. Caught here so the user gets an immediate,
  // specific error instead of a generic "message failed" after a round trip
  // to the Worker.
  var FORBIDDEN_NICKNAME_SUBSTRINGS = ["discord", "clyde"];
  var FORBIDDEN_NICKNAME_CHARS = /[@#:`]/;

  function sanitizeNickname(raw) {
    var value = String(raw || "").trim().slice(0, 32);
    if (!value) return { value: "", error: "" };
    var lower = value.toLowerCase();
    for (var i = 0; i < FORBIDDEN_NICKNAME_SUBSTRINGS.length; i += 1) {
      if (lower.indexOf(FORBIDDEN_NICKNAME_SUBSTRINGS[i]) !== -1) {
        return { value: "", error: "forbidden_substring" };
      }
    }
    if (FORBIDDEN_NICKNAME_CHARS.test(value)) {
      return { value: "", error: "forbidden_chars" };
    }
    return { value: value, error: "" };
  }

  // Module-level (not per-runtime-instance) since the script tag and the
  // widget itself are page-global resources - loaded lazily on the first
  // send attempt rather than at app boot, since most launches never open
  // Community Chat at all.
  var turnstileScriptPromise = null;
  var turnstileWidgetId = null;
  var turnstileContainer = null;
  var turnstilePendingResolvers = [];

  function loadTurnstileScript() {
    if (turnstileScriptPromise) return turnstileScriptPromise;
    turnstileScriptPromise = new Promise(function (resolve, reject) {
      if (window.turnstile) { resolve(); return; }
      var script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error("failed to load Turnstile script")); };
      document.head.appendChild(script);
    });
    return turnstileScriptPromise;
  }

  // The site's Widget Mode (Managed, chosen in the Cloudflare dashboard -
  // see docs/COMMUNITY_CHAT_SETUP.md) is what actually governs verification
  // behavior server-side, not anything passed here - Managed shows nothing
  // to most visitors but CAN escalate to a real interactive challenge for
  // risky-looking traffic (the exact case this exists to catch). The
  // container is kept hidden for the common case; a flagged legitimate
  // visitor would see their send fail with "couldn't verify" rather than
  // an interactive challenge to solve - an accepted tradeoff for a
  // low-stakes community chat, not worth a visible-fallback UI for now.
  function ensureTurnstileWidget() {
    return loadTurnstileScript().then(function () {
      if (turnstileWidgetId !== null) return turnstileWidgetId;
      turnstileContainer = document.createElement("div");
      turnstileContainer.style.display = "none";
      document.body.appendChild(turnstileContainer);
      turnstileWidgetId = window.turnstile.render(turnstileContainer, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: function (token) {
          var resolvers = turnstilePendingResolvers;
          turnstilePendingResolvers = [];
          resolvers.forEach(function (r) { r.resolve(token); });
        },
        "error-callback": function () {
          var resolvers = turnstilePendingResolvers;
          turnstilePendingResolvers = [];
          resolvers.forEach(function (r) { r.reject(new Error("verification failed")); });
        },
      });
      return turnstileWidgetId;
    });
  }

  // Every send needs its own fresh token (Turnstile tokens are single-use
  // and short-lived) - reset() re-runs the challenge on the same widget
  // rather than rendering a new one each time.
  function getTurnstileToken() {
    return ensureTurnstileWidget().then(function (widgetId) {
      return new Promise(function (resolve, reject) {
        var settled = false;
        var timeoutId = window.setTimeout(function () {
          if (settled) return;
          settled = true;
          turnstilePendingResolvers = turnstilePendingResolvers.filter(function (r) { return r.resolve !== wrappedResolve; });
          reject(new Error("verification timed out"));
        }, 15000);

        function wrappedResolve(token) {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          resolve(token);
        }
        function wrappedReject(err) {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          reject(err);
        }

        turnstilePendingResolvers.push({ resolve: wrappedResolve, reject: wrappedReject });
        window.turnstile.reset(widgetId);
      });
    });
  }

  function loadNickname() {
    try {
      return (window.localStorage && window.localStorage.getItem(NICKNAME_STORAGE_KEY)) || "";
    } catch (_) {
      return "";
    }
  }

  function saveNickname(nick) {
    try {
      if (!window.localStorage) return;
      window.localStorage.setItem(NICKNAME_STORAGE_KEY, nick);
    } catch (_) {
      // ignore persistence failures
    }
  }

  function loadNicknameChangedAt() {
    try {
      var raw = window.localStorage && window.localStorage.getItem(NICKNAME_CHANGED_AT_STORAGE_KEY);
      return raw ? Number(raw) : 0;
    } catch (_) {
      return 0;
    }
  }

  function saveNicknameChangedAt(ts) {
    try {
      if (!window.localStorage) return;
      window.localStorage.setItem(NICKNAME_CHANGED_AT_STORAGE_KEY, String(ts));
    } catch (_) {
      // ignore persistence failures
    }
  }

  // Purely a local display filter (persisted per-device, never sent
  // anywhere) - not real moderation. There's no way to actually block one
  // person server-side here (every message shares the same webhook
  // identity - see docs/COMMUNITY_CHAT_SETUP.md), so this is the honest,
  // achievable version: hide messages from a nickname on MY screen only.
  function loadIgnored() {
    try {
      var raw = window.localStorage && window.localStorage.getItem(IGNORED_STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveIgnored(list) {
    try {
      if (!window.localStorage) return;
      window.localStorage.setItem(IGNORED_STORAGE_KEY, JSON.stringify(list));
    } catch (_) {
      // ignore persistence failures
    }
  }

  function loadDiscordSession() {
    try {
      var raw = window.localStorage && window.localStorage.getItem(DISCORD_SESSION_STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      return (parsed && parsed.sessionToken && parsed.discordUsername) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function saveDiscordSession(session) {
    try {
      if (!window.localStorage) return;
      if (session) window.localStorage.setItem(DISCORD_SESSION_STORAGE_KEY, JSON.stringify(session));
      else window.localStorage.removeItem(DISCORD_SESSION_STORAGE_KEY);
    } catch (_) {
      // ignore persistence failures
    }
  }

  function createCommunityChatRuntime() {
    var nickname = loadNickname();
    var nicknameChangedAt = loadNicknameChangedAt();
    var ignored = loadIgnored();
    var discordSession = loadDiscordSession();
    var loginPromise = null;
    var loginPollTimer = null;
    var loginPending = false;
    var loginError = "";
    var messages = [];
    var messageIds = {};
    var pollTimer = null;
    var sending = false;
    var sendError = "";
    var loadError = "";
    var nicknameError = "";
    // Transient (not persisted) "show the identity picker even though a
    // nickname is already set" flag - lets someone who already picked a
    // nickname reach the setup card (to switch nickname or log in with
    // Discord instead) WITHOUT first destructively clearing their current
    // nickname, which used to be the only way in and was itself gated by
    // the 24h cooldown - meaning a cooldown-blocked user had no way to even
    // see the Discord login option. Only opening/closing this view is free;
    // actually landing on a genuinely different nickname is still
    // cooldown-gated inside setNickname() below.
    var showSwitcher = false;

    // Mirrors each error code into the app's own Console pane (the same
    // "[HH:MM:SS] ..." log the menu/status runtimes already write to,
    // window.NetReconNewUI.setStatusLine - see bootstrap-runtime.js) so a
    // rejected send/nickname/login shows up somewhere visible even if the
    // chat tab isn't the one currently open. Centralized here (once per
    // emitChanged(), diffed against the last-logged value) rather than at
    // every individual assignment site, so a persisting error never logs
    // twice and a genuinely NEW one always logs exactly once.
    var lastLoggedSendError = "";
    var lastLoggedNicknameError = "";
    var lastLoggedLoginError = "";

    function logChatErrorToConsole(label, code) {
      var ui = window.NetReconNewUI;
      if (ui && typeof ui.setStatusLine === "function") {
        ui.setStatusLine("Community Chat: " + label + " (" + code + ")");
      }
    }

    function emitChanged() {
      if (sendError && sendError !== lastLoggedSendError) logChatErrorToConsole("send failed", sendError);
      lastLoggedSendError = sendError;
      if (nicknameError && nicknameError !== lastLoggedNicknameError) logChatErrorToConsole("nickname rejected", nicknameError);
      lastLoggedNicknameError = nicknameError;
      if (loginError && loginError !== lastLoggedLoginError) logChatErrorToConsole("Discord login failed", loginError);
      lastLoggedLoginError = loginError;

      try {
        document.dispatchEvent(new CustomEvent("newui:community-chat-changed", {
          detail: { messages: messages.slice(), nickname: nickname, sending: sending, sendError: sendError, loadError: loadError, nicknameError: nicknameError, nicknameCooldownRemainingMs: getNicknameCooldownRemainingMs(), ignored: ignored.slice(), discordSession: discordSession, discordLoginPending: loginPending, discordLoginError: loginError, showSwitcher: showSwitcher }
        }));
      } catch (_) {
        // ignore event dispatch failures
      }
    }

    function getMessages() { return messages.slice(); }
    function getNickname() { return nickname; }
    function getSending() { return sending; }
    function getSendError() { return sendError; }
    function getNicknameError() { return nicknameError; }
    function getIgnored() { return ignored.slice(); }
    function getDiscordSession() { return discordSession; }
    function getDiscordLoginPending() { return loginPending; }
    function getDiscordLoginError() { return loginError; }
    function getShowSwitcher() { return showSwitcher; }

    function openIdentitySwitcher() {
      if (showSwitcher) return;
      showSwitcher = true;
      nicknameError = "";
      emitChanged();
    }

    function closeIdentitySwitcher() {
      if (!showSwitcher) return;
      showSwitcher = false;
      nicknameError = "";
      emitChanged();
    }

    function logoutDiscord() {
      if (!discordSession) return;
      discordSession = null;
      saveDiscordSession(null);
      showSwitcher = false;
      emitChanged();
    }

    // Guarded by a single in-flight promise, NOT the Turnstile-style shared
    // resolver queue further up this file - that shape exists specifically
    // because Turnstile's widget is one shared DOM singleton multiple
    // sendMessage() calls must wait on together. Login has no equivalent
    // shared resource (each call mints its own independent `state`), so
    // reusing that machinery here would either be dead complexity or a real
    // bug (a double-click could attach one attempt's resolution to another
    // attempt's poll loop / wrong state).
    function startDiscordLogin() {
      if (loginPromise) return loginPromise;
      loginError = "";
      loginPending = true;
      emitChanged();

      loginPromise = fetch(WORKER_URL + "/oauth/start", { method: "POST" })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(function (data) {
          var platform = window.NetReconNewUICore && window.NetReconNewUICore.platform;
          if (platform && platform.openExternalUrl) platform.openExternalUrl(data.authorizeUrl);

          return new Promise(function (resolve, reject) {
            var settled = false;
            var startedAt = Date.now();

            function finish(fn, arg) {
              if (settled) return;
              settled = true;
              if (loginPollTimer) { window.clearInterval(loginPollTimer); loginPollTimer = null; }
              fn(arg);
            }

            loginPollTimer = window.setInterval(function () {
              if (Date.now() - startedAt > OAUTH_POLL_TIMEOUT_MS) {
                finish(reject, new Error("timeout"));
                return;
              }
              fetch(WORKER_URL + "/oauth/status?state=" + encodeURIComponent(data.state))
                .then(function (statusRes) {
                  if (statusRes.status === 404) return null;
                  if (!statusRes.ok) throw new Error("HTTP " + statusRes.status);
                  return statusRes.json();
                })
                .then(function (statusData) {
                  if (statusData && statusData.status === "done" && statusData.sessionToken) {
                    finish(resolve, { sessionToken: statusData.sessionToken, discordUsername: statusData.discordUsername });
                  }
                  // "pending", or not-found-yet (null) - keep polling.
                })
                .catch(function () {
                  // A single failed poll tick isn't fatal - keep trying until the timeout above.
                });
            }, OAUTH_POLL_INTERVAL_MS);
          });
        })
        .then(function (session) {
          discordSession = session;
          saveDiscordSession(session);
          loginPending = false;
          loginError = "";
          showSwitcher = false;
          emitChanged();
          return true;
        })
        .catch(function (err) {
          loginPending = false;
          loginError = (err && err.message === "timeout") ? "timeout" : "failed";
          emitChanged();
          return false;
        })
        .then(function (result) {
          loginPromise = null;
          return result;
        });

      return loginPromise;
    }

    function ignoreNickname(nick) {
      var value = String(nick || "").trim();
      if (!value || ignored.indexOf(value) !== -1) return;
      ignored.push(value);
      saveIgnored(ignored);
      emitChanged();
    }

    function unignoreNickname(nick) {
      var idx = ignored.indexOf(String(nick || "").trim());
      if (idx === -1) return;
      ignored.splice(idx, 1);
      saveIgnored(ignored);
      emitChanged();
    }

    // No cooldown until a nickname has actually been set once - the first
    // pick is free, only *changing* an existing one is rate-limited.
    function getNicknameCooldownRemainingMs() {
      if (!nickname) return 0;
      var remaining = NICKNAME_CHANGE_COOLDOWN_MS - (Date.now() - nicknameChangedAt);
      return remaining > 0 ? remaining : 0;
    }

    function setNickname(nick) {
      var trimmed = String(nick || "").trim();

      if (!trimmed) {
        var remaining = getNicknameCooldownRemainingMs();
        if (remaining > 0) {
          nicknameError = "cooldown";
          emitChanged();
          return false;
        }
        nickname = "";
        nicknameError = "";
        showSwitcher = false;
        saveNickname(nickname);
        emitChanged();
        return true;
      }

      var result = sanitizeNickname(trimmed);
      if (!result.value) {
        nicknameError = result.error || "invalid";
        emitChanged();
        return false;
      }

      // Re-submitting the exact nickname already in use (e.g. the identity
      // switcher's prefilled input, sent back unedited) is a no-op - just
      // close the switcher, don't burn the cooldown for nothing.
      if (nickname && result.value === nickname) {
        nicknameError = "";
        showSwitcher = false;
        emitChanged();
        return true;
      }

      // The once-a-day cooldown protects OVERWRITING an existing nickname
      // with a different one - the very first pick (nickname still unset)
      // stays free.
      if (nickname) {
        var remaining2 = getNicknameCooldownRemainingMs();
        if (remaining2 > 0) {
          nicknameError = "cooldown";
          emitChanged();
          return false;
        }
      }

      nickname = result.value;
      nicknameError = "";
      nicknameChangedAt = Date.now();
      showSwitcher = false;
      saveNickname(nickname);
      saveNicknameChangedAt(nicknameChangedAt);
      emitChanged();
      return true;
    }

    // Discord message IDs are snowflakes (monotonically increasing with
    // time) - comparing as BigInt rather than assuming the Worker's
    // response is already in a particular order keeps this correct
    // regardless of how Discord orders an `after=`-filtered page.
    function mergeMessages(fetched) {
      var added = false;
      (fetched || []).forEach(function (m) {
        if (!m || !m.id || messageIds[m.id]) return;
        messageIds[m.id] = true;
        messages.push(m);
        added = true;
      });
      if (!added) return false;
      messages.sort(function (a, b) {
        var ai = BigInt(a.id), bi = BigInt(b.id);
        return ai < bi ? -1 : (ai > bi ? 1 : 0);
      });
      if (messages.length > MAX_MESSAGES) {
        messages.splice(0, messages.length - MAX_MESSAGES).forEach(function (m) {
          delete messageIds[m.id];
        });
      }
      return true;
    }

    function fetchMessages() {
      var lastId = messages.length ? messages[messages.length - 1].id : "";
      var url = WORKER_URL + "/messages" + (lastId ? "?after=" + encodeURIComponent(lastId) : "");
      return fetch(url)
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(function (data) {
          loadError = "";
          if (mergeMessages(data)) emitChanged();
        })
        .catch(function (err) {
          loadError = (err && err.message) ? err.message : String(err);
          emitChanged();
        });
    }

    function startPolling() {
      if (pollTimer) return;
      fetchMessages();
      pollTimer = window.setInterval(fetchMessages, POLL_INTERVAL_MS);
    }

    function sendMessage(text) {
      var trimmed = String(text || "").trim().slice(0, 500);
      if (!trimmed || (!nickname && !discordSession)) return Promise.resolve(false);

      sending = true;
      sendError = "";
      emitChanged();

      return getTurnstileToken()
        .catch(function (err) {
          err.isTurnstileError = true;
          throw err;
        })
        .then(function (turnstileToken) {
          var payload = { text: trimmed, turnstileToken: turnstileToken };
          if (discordSession) payload.sessionToken = discordSession.sessionToken;
          else payload.nickname = nickname;
          return fetch(WORKER_URL + "/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        })
        .then(function (res) {
          if (!res.ok) {
            // The Worker's sessionToken record can outlive our local copy's
            // usefulness (e.g. its 30-day KV TTL lapsed) - a 401 here means
            // the login this device thinks it has is no longer valid, so
            // drop it rather than let every future send keep failing silently.
            if (res.status === 401 && discordSession) {
              discordSession = null;
              saveDiscordSession(null);
            }
            // Read the Worker's own {"error":"code"} body instead of just
            // throwing "HTTP 400" - without this, a real reason (a nickname
            // rejected by the content filter, say) never reached the UI,
            // only an opaque status code.
            return res.json().catch(function () { return null; }).then(function (body) {
              var err = new Error((body && body.error) || ("HTTP " + res.status));
              if (body && body.error) err.code = body.error;
              throw err;
            });
          }
          sending = false;
          emitChanged();
          return fetchMessages();
        })
        .then(function () { return true; })
        .catch(function (err) {
          sending = false;
          sendError = (err && err.isTurnstileError)
            ? "turnstile_failed"
            : ((err && err.code) || (err && err.message) || String(err));
          emitChanged();
          return false;
        });
    }

    return {
      getMessages: getMessages,
      getNickname: getNickname,
      setNickname: setNickname,
      getSending: getSending,
      getSendError: getSendError,
      getNicknameError: getNicknameError,
      getNicknameCooldownRemainingMs: getNicknameCooldownRemainingMs,
      getIgnored: getIgnored,
      ignoreNickname: ignoreNickname,
      unignoreNickname: unignoreNickname,
      getDiscordSession: getDiscordSession,
      getDiscordLoginPending: getDiscordLoginPending,
      getDiscordLoginError: getDiscordLoginError,
      startDiscordLogin: startDiscordLogin,
      logoutDiscord: logoutDiscord,
      getShowSwitcher: getShowSwitcher,
      openIdentitySwitcher: openIdentitySwitcher,
      closeIdentitySwitcher: closeIdentitySwitcher,
      startPolling: startPolling,
      sendMessage: sendMessage,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.communityChat = createCommunityChatRuntime();
})();
