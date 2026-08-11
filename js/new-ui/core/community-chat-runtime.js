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
  var POLL_INTERVAL_MS = 5000;
  var MAX_MESSAGES = 200;

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

  function createCommunityChatRuntime() {
    var nickname = loadNickname();
    var nicknameChangedAt = loadNicknameChangedAt();
    var messages = [];
    var messageIds = {};
    var pollTimer = null;
    var sending = false;
    var sendError = "";
    var loadError = "";
    var nicknameError = "";

    function emitChanged() {
      try {
        document.dispatchEvent(new CustomEvent("newui:community-chat-changed", {
          detail: { messages: messages.slice(), nickname: nickname, sending: sending, sendError: sendError, loadError: loadError, nicknameError: nicknameError, nicknameCooldownRemainingMs: getNicknameCooldownRemainingMs() }
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

    // No cooldown until a nickname has actually been set once - the first
    // pick is free, only *changing* an existing one is rate-limited.
    function getNicknameCooldownRemainingMs() {
      if (!nickname) return 0;
      var remaining = NICKNAME_CHANGE_COOLDOWN_MS - (Date.now() - nicknameChangedAt);
      return remaining > 0 ? remaining : 0;
    }

    function setNickname(nick) {
      // Clearing (the "change nickname" link) is how a change starts - gate
      // it behind the cooldown, since by the time a new value would be
      // submitted the old one is already gone and there'd be nothing left
      // to check against.
      if (!String(nick || "").trim()) {
        var remaining = getNicknameCooldownRemainingMs();
        if (remaining > 0) {
          nicknameError = "cooldown";
          emitChanged();
          return false;
        }
        nickname = "";
        nicknameError = "";
        saveNickname(nickname);
        emitChanged();
        return true;
      }

      var result = sanitizeNickname(nick);
      if (!result.value) {
        nicknameError = result.error || "invalid";
        emitChanged();
        return false;
      }

      nickname = result.value;
      nicknameError = "";
      nicknameChangedAt = Date.now();
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
      if (!nickname || !trimmed) return Promise.resolve(false);

      sending = true;
      sendError = "";
      emitChanged();

      return getTurnstileToken()
        .catch(function (err) {
          err.isTurnstileError = true;
          throw err;
        })
        .then(function (turnstileToken) {
          return fetch(WORKER_URL + "/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nickname: nickname, text: trimmed, turnstileToken: turnstileToken }),
          });
        })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          sending = false;
          emitChanged();
          return fetchMessages();
        })
        .then(function () { return true; })
        .catch(function (err) {
          sending = false;
          sendError = (err && err.isTurnstileError)
            ? "turnstile_failed"
            : ((err && err.message) ? err.message : String(err));
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
      startPolling: startPolling,
      sendMessage: sendMessage,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.communityChat = createCommunityChatRuntime();
})();
