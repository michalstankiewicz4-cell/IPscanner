(function () {
  // Komunikator Phase 1: Google Sign-In only, no chat yet.
  //
  // Google actively blocks its OAuth consent screen from loading inside an
  // embedded webview (403 disallowed_useragent, enforced since 2023), so
  // Firebase's own signInWithPopup/signInWithRedirect can never work
  // directly inside this app's WebView2 window. Instead: open the consent
  // screen in the user's REAL system browser (platform.openExternalUrl,
  // already exists), catch the redirect via a one-shot local loopback
  // listener (start_oauth_listener in main.rs - same shape as the Mail XSS
  // Tester's beacon listener), exchange the code for tokens client-side
  // (PKCE, no client secret needed - the correct modern flow for installed
  // apps), then hand the resulting ID token to Firebase via
  // signInWithCredential. See src-tauri/src/main.rs's own comment block on
  // handle_oauth_callback_connection for the Rust side.
  //
  // Firebase's modern SDK (v9+) has no vendorable standalone build - even
  // its "compat" npm layer is ESM with bare-specifier imports that only
  // resolve through a bundler (this app has none). Firebase does publish
  // CDN-ready ES modules built for exactly this case, loaded lazily via
  // dynamic import() only when Komunikator is actually opened - same
  // "fetch only when the tab is first opened" precedent already used for
  // globe.gl/sql.js/novnc.
  var FIREBASE_VERSION = "12.17.1";
  var FIREBASE_APP_URL = "https://www.gstatic.com/firebasejs/" + FIREBASE_VERSION + "/firebase-app.js";
  var FIREBASE_AUTH_URL = "https://www.gstatic.com/firebasejs/" + FIREBASE_VERSION + "/firebase-auth.js";
  var FIREBASE_FIRESTORE_URL = "https://www.gstatic.com/firebasejs/" + FIREBASE_VERSION + "/firebase-firestore.js";

  // Phase 2: one fixed shared room (not multi-room management - matches
  // the actual ask, "kilku znajomych na jednym chacie"). Whoever first
  // opens Communicator while signed in and this room doc doesn't exist yet
  // becomes its founder (see ensureRoomAndMembership()) - everyone else
  // needs a valid invite code from an existing member. Enforced by
  // Firestore security rules (pasted into the Firebase console by the
  // user), not just this client-side code.
  var ROOM_ID = "main";

  function randomHex(byteLen) {
    var arr = new Uint8Array(byteLen);
    crypto.getRandomValues(arr);
    return Array.from(arr, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }

  function base64UrlEncode(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = "";
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function sha256(str) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  }

  function createKomunikatorRuntime() {
    var status = "signed-out"; // "signed-out" | "signing-in" | "signed-in" | "error"
    var user = null; // { uid, displayName, email, photoURL }
    var errorMessage = "";
    var firebaseModules = null; // cached { app, auth } CDN module namespaces, loaded once
    var authInstance = null;
    var authStateBound = false;

    // Phase 2 state - room/membership + chat.
    var firestoreModules = null; // cached firebase-firestore.js module namespace
    var dbInstance = null;
    var isMember = false;
    var members = [];
    var messages = [];
    var messagesUnsub = null;
    var membersUnsub = null;
    var lastInviteCode = "";
    // Separate from errorMessage (sign-in specific) - a failed "join with
    // code" or "send message" shouldn't stomp on/be confused with a
    // sign-in error, and vice versa.
    var actionError = "";

    function emitChanged() {
      try {
        document.dispatchEvent(new CustomEvent("newui:komunikator-changed", {
          detail: {
            status: status, user: user, error: errorMessage,
            isMember: isMember, members: members.slice(), messages: messages.slice(),
            lastInviteCode: lastInviteCode, actionError: actionError,
          }
        }));
      } catch (_) {
        // ignore event dispatch failures
      }
    }

    function getStatus() { return status; }
    function getUser() { return user; }
    function getError() { return errorMessage; }
    function getIsMember() { return isMember; }
    function getMembers() { return members.slice(); }
    function getMessages() { return messages.slice(); }
    function getLastInviteCode() { return lastInviteCode; }
    function getActionError() { return actionError; }

    function loadFirebaseModules() {
      if (firebaseModules) return Promise.resolve(firebaseModules);
      return Promise.all([import(FIREBASE_APP_URL), import(FIREBASE_AUTH_URL)]).then(function (mods) {
        firebaseModules = { app: mods[0], auth: mods[1] };
        return firebaseModules;
      });
    }

    // Lazily initializes the Firebase app + Auth instance from whatever is
    // currently saved in Options -> General, and binds onAuthStateChanged
    // exactly once (guarded by authStateBound) so re-entrant calls during a
    // sign-in attempt never register duplicate listeners.
    function ensureAuthInstance() {
      if (authInstance) return Promise.resolve(authInstance);
      return loadFirebaseModules().then(function (mods) {
        var cfgApi = window.NetReconNewUICore && window.NetReconNewUICore.firebaseConfig;
        var cfg = cfgApi ? cfgApi.getConfig() : {};
        if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId) {
          throw new Error("missing_firebase_config");
        }
        var app = mods.app.initializeApp({
          apiKey: cfg.apiKey,
          authDomain: cfg.authDomain,
          projectId: cfg.projectId,
        });
        authInstance = mods.auth.getAuth(app);
        if (!authStateBound) {
          authStateBound = true;
          mods.auth.onAuthStateChanged(authInstance, function (fbUser) {
            if (fbUser) {
              user = { uid: fbUser.uid, displayName: fbUser.displayName, email: fbUser.email, photoURL: fbUser.photoURL };
              status = "signed-in";
              emitChanged();
              ensureRoomAndMembership();
            } else if (status !== "signing-in") {
              // Firebase fires this callback once immediately with "no
              // user yet" as soon as onAuthStateChanged is registered -
              // which happens partway through signInWithGoogle() (inside
              // ensureAuthInstance()), so a bare "else" here would clobber
              // the "signing-in" status right after it was set, back to
              // "signed-out", while the browser tab is still open waiting
              // for the user to finish. Only downgrade to signed-out when
              // there's no sign-in attempt actively in flight.
              user = null;
              status = "signed-out";
              emitChanged();
            }
          });
        }
        return authInstance;
      });
    }

    // ensureAuthInstance() (and the onAuthStateChanged binding inside it)
    // previously only ever ran once the user clicked "Sign in with Google" -
    // meaning a persisted Firebase Auth session from a PREVIOUS run was
    // never even checked on a later launch/reload, since nothing called
    // ensureAuthInstance() until an explicit sign-in click. This restores a
    // session automatically the moment Communicator is opened (wired from
    // wireKomunikatorLibrary), silently doing nothing if Firebase isn't
    // configured yet - only an explicit sign-in click should surface that
    // as a visible error.
    function checkExistingSession() {
      if (authInstance) return;
      var cfgApi = window.NetReconNewUICore && window.NetReconNewUICore.firebaseConfig;
      var cfg = cfgApi ? cfgApi.getConfig() : {};
      if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId) return;
      ensureAuthInstance().catch(function () {
        // ignore - config missing or a transient load failure; the
        // explicit "Sign in" button still works and surfaces real errors
      });
    }

    // ─── Phase 2: room/membership + chat (Firestore) ──────────────────────

    function loadFirestoreModules() {
      if (firestoreModules) return Promise.resolve(firestoreModules);
      return import(FIREBASE_FIRESTORE_URL).then(function (mod) {
        firestoreModules = mod;
        return firestoreModules;
      });
    }

    function ensureDb() {
      if (dbInstance) return Promise.resolve(dbInstance);
      return ensureAuthInstance().then(function (auth) {
        return loadFirestoreModules().then(function (fs) {
          dbInstance = fs.getFirestore(auth.app);
          return dbInstance;
        });
      });
    }

    // Called on every "signed in" firing of onAuthStateChanged - which
    // Firebase can trigger more than once per session (e.g. on an ID token
    // refresh), not just once at sign-in. Without this guard, two
    // overlapping calls both see the room/member docs as "not created
    // yet", both attempt setDoc, and the second one arrives after the
    // first already created it - Firestore then classifies that second
    // write as an UPDATE (not a create), which the security rules
    // correctly reject (confirmed live: this was the actual cause of a
    // "Missing or insufficient permissions" error even with correct
    // rules published). Caching the in-flight/completed promise per
    // signed-in session makes every call after the first a no-op that
    // just reuses the same result.
    var roomEnsurePromise = null;

    // Firestore rules (pasted by the user into the Firebase console)
    // mirror this exact logic - the room doc's founderUid is what lets its
    // creator self-add as a member with no invite code, since there's
    // nobody yet to invite them.
    function ensureRoomAndMembership() {
      if (roomEnsurePromise) return roomEnsurePromise;
      roomEnsurePromise = ensureDb().then(function (db) {
        var fs = firestoreModules;
        var roomRef = fs.doc(db, "rooms", ROOM_ID);
        return fs.getDoc(roomRef).then(function (roomSnap) {
          if (!roomSnap.exists()) {
            return fs.setDoc(roomRef, { founderUid: user.uid, createdAt: fs.serverTimestamp() }).then(function () {
              return true;
            });
          }
          return roomSnap.data().founderUid === user.uid;
        }).then(function (isFounder) {
          var memberRef = fs.doc(db, "rooms", ROOM_ID, "members", user.uid);
          return fs.getDoc(memberRef).then(function (memberSnap) {
            if (memberSnap.exists()) {
              isMember = true;
              emitChanged();
              return;
            }
            if (!isFounder) {
              isMember = false;
              emitChanged();
              return;
            }
            return fs.setDoc(memberRef, {
              displayName: user.displayName || "",
              email: user.email || "",
              photoURL: user.photoURL || "",
              joinedAt: fs.serverTimestamp(),
            }).then(function () {
              isMember = true;
              emitChanged();
            });
          });
        });
      }).catch(function (err) {
        // Let a future call retry from scratch rather than staying
        // permanently cached-failed for the rest of the session.
        roomEnsurePromise = null;
        actionError = (err && err.message) ? err.message : String(err);
        emitChanged();
      });
      return roomEnsurePromise;
    }

    function startListeningToMessages() {
      if (messagesUnsub) return;
      ensureDb().then(function (db) {
        var fs = firestoreModules;
        var q = fs.query(fs.collection(db, "rooms", ROOM_ID, "messages"), fs.orderBy("createdAt", "desc"), fs.limit(50));
        messagesUnsub = fs.onSnapshot(q, function (snap) {
          var list = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
          list.reverse(); // query is newest-first (for the limit), display wants oldest-first
          messages = list;
          emitChanged();
        }, function (err) {
          actionError = (err && err.message) ? err.message : String(err);
          emitChanged();
        });
      });
    }

    function stopListeningToMessages() {
      if (messagesUnsub) {
        messagesUnsub();
        messagesUnsub = null;
      }
    }

    function startListeningToMembers() {
      if (membersUnsub) return;
      ensureDb().then(function (db) {
        var fs = firestoreModules;
        membersUnsub = fs.onSnapshot(fs.collection(db, "rooms", ROOM_ID, "members"), function (snap) {
          members = snap.docs.map(function (d) { return Object.assign({ uid: d.id }, d.data()); });
          emitChanged();
        }, function (err) {
          actionError = (err && err.message) ? err.message : String(err);
          emitChanged();
        });
      });
    }

    function stopListeningToMembers() {
      if (membersUnsub) {
        membersUnsub();
        membersUnsub = null;
      }
    }

    function sendMessage(text) {
      var trimmed = String(text || "").trim();
      if (!trimmed || !user || !dbInstance || !firestoreModules) return;
      var fs = firestoreModules;
      fs.addDoc(fs.collection(dbInstance, "rooms", ROOM_ID, "messages"), {
        text: trimmed,
        senderUid: user.uid,
        senderName: user.displayName || user.email || "?",
        senderPhotoURL: user.photoURL || "",
        createdAt: fs.serverTimestamp(),
      }).catch(function (err) {
        actionError = (err && err.message) ? err.message : String(err);
        emitChanged();
      });
    }

    // Single-use by default (maxUses: 1) - generate one per friend you
    // invite. expiresAt is stored for display only (not enforced by the
    // security rules, which only check usedCount < maxUses) - fine at
    // this scale, matches the already-agreed "best-effort for a few
    // friends" scope.
    function generateInviteCode() {
      if (!isMember || !dbInstance || !firestoreModules || !user) return;
      var fs = firestoreModules;
      var code = randomHex(6);
      fs.setDoc(fs.doc(dbInstance, "invites", code), {
        roomId: ROOM_ID,
        createdBy: user.uid,
        createdAt: fs.serverTimestamp(),
        maxUses: 1,
        usedCount: 0,
      }).then(function () {
        lastInviteCode = code;
        actionError = "";
        emitChanged();
      }).catch(function (err) {
        actionError = (err && err.message) ? err.message : String(err);
        emitChanged();
      });
    }

    function redeemInviteCode(code) {
      var trimmedCode = String(code || "").trim();
      if (!trimmedCode || !dbInstance || !firestoreModules || !user) return;
      var fs = firestoreModules;
      var inviteRef = fs.doc(dbInstance, "invites", trimmedCode);
      fs.getDoc(inviteRef).then(function (snap) {
        if (!snap.exists()) throw new Error("invite_not_found");
        var data = snap.data();
        if (data.roomId !== ROOM_ID) throw new Error("invite_wrong_room");
        if (data.usedCount >= data.maxUses) throw new Error("invite_exhausted");
        var memberRef = fs.doc(dbInstance, "rooms", ROOM_ID, "members", user.uid);
        return fs.setDoc(memberRef, {
          displayName: user.displayName || "",
          email: user.email || "",
          photoURL: user.photoURL || "",
          joinedAt: fs.serverTimestamp(),
          viaInviteCode: trimmedCode,
        }).then(function () {
          return fs.updateDoc(inviteRef, { usedCount: data.usedCount + 1 });
        });
      }).then(function () {
        isMember = true;
        actionError = "";
        emitChanged();
      }).catch(function (err) {
        actionError = (err && err.message) ? err.message : String(err);
        emitChanged();
      });
    }

    // Waits for exactly one "oauth-callback" event (emitted by main.rs once
    // the loopback listener catches the browser's redirect), then
    // self-unlistens - a fresh call per sign-in attempt, never a persistent
    // listener, since each attempt gets its own local port/listener too.
    function waitForOauthCallback() {
      var platform = window.NetReconNewUICore && window.NetReconNewUICore.platform;
      return new Promise(function (resolve, reject) {
        if (!platform || typeof platform.listen !== "function") {
          reject(new Error("platform_listen_unavailable"));
          return;
        }
        var unlisten = null;
        Promise.resolve(platform.listen("oauth-callback", function (payload) {
          if (unlisten) unlisten();
          if (payload && payload.error) reject(new Error(payload.error));
          else if (payload && payload.code) resolve(payload.code);
          else reject(new Error("no_code_received"));
        })).then(function (fn) { unlisten = fn; });
      });
    }

    function signInWithGoogle() {
      var platform = window.NetReconNewUICore && window.NetReconNewUICore.platform;
      if (!platform) return;

      var cfgApi = window.NetReconNewUICore && window.NetReconNewUICore.firebaseConfig;
      var cfg = cfgApi ? cfgApi.getConfig() : {};
      if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId || !cfg.oauthClientId || !cfg.clientSecret) {
        status = "error";
        errorMessage = "missing_config";
        emitChanged();
        return;
      }

      status = "signing-in";
      errorMessage = "";
      emitChanged();

      var codeVerifier = randomHex(32);
      var redirectUri = "";

      ensureAuthInstance()
        .then(function () { return platform.invoke("start_oauth_listener", {}); })
        .then(function (port) {
          // Must match the "http://localhost:53682/" authorized redirect
          // URI added in Google Cloud Console during setup EXACTLY -
          // confirmed live that Firebase's auto-created "Web application"-
          // type OAuth client requires exact scheme+host+port+path
          // matching (not the port-agnostic loopback matching a genuine
          // "Desktop app"-type client would get), which is why the Rust
          // side binds a fixed port (OAUTH_LOOPBACK_PORT) instead of an
          // OS-assigned one.
          redirectUri = "http://localhost:" + port + "/";
          return sha256(codeVerifier);
        })
        .then(function (digest) {
          var codeChallenge = base64UrlEncode(digest);
          var authUrl = "https://accounts.google.com/o/oauth2/v2/auth"
            + "?client_id=" + encodeURIComponent(cfg.oauthClientId)
            + "&redirect_uri=" + encodeURIComponent(redirectUri)
            + "&response_type=code"
            + "&scope=" + encodeURIComponent("openid email profile")
            + "&code_challenge=" + encodeURIComponent(codeChallenge)
            + "&code_challenge_method=S256"
            + "&prompt=select_account";
          platform.openExternalUrl(authUrl);
          return waitForOauthCallback();
        })
        .then(function (code) {
          return fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              code: code,
              client_id: cfg.oauthClientId,
              // Confirmed live: Google's OAuth token endpoint requires
              // client_secret in the exchange for EVERY client type,
              // including "Desktop app" - a documented deviation from the
              // pure PKCE spec (see general-settings-runtime.js's comment
              // on FIREBASE_CONFIG_FIELDS). code_verifier below still
              // matters (Google validates it against the code_challenge
              // sent at authorization time), it's client_secret AND PKCE
              // together here, not PKCE instead of a secret.
              client_secret: cfg.clientSecret,
              redirect_uri: redirectUri,
              grant_type: "authorization_code",
              code_verifier: codeVerifier,
            }).toString(),
          }).then(function (resp) {
            return resp.json().then(function (data) {
              if (!resp.ok) throw new Error((data && (data.error_description || data.error)) || "token_exchange_failed");
              return data;
            });
          });
        })
        .then(function (tokenData) {
          return firebaseModules.auth.signInWithCredential(
            authInstance,
            firebaseModules.auth.GoogleAuthProvider.credential(tokenData.id_token)
          );
          // onAuthStateChanged (bound in ensureAuthInstance) picks up the
          // resulting signed-in state and emits the change itself.
        })
        .catch(function (err) {
          status = "error";
          errorMessage = (err && err.message) ? err.message : String(err);
          emitChanged();
        });
    }

    function signOutOfGoogle() {
      if (!authInstance || !firebaseModules) return;
      stopListeningToMessages();
      stopListeningToMembers();
      roomEnsurePromise = null;
      isMember = false;
      members = [];
      messages = [];
      lastInviteCode = "";
      actionError = "";
      firebaseModules.auth.signOut(authInstance);
    }

    return {
      getStatus: getStatus,
      getUser: getUser,
      getError: getError,
      signInWithGoogle: signInWithGoogle,
      signOut: signOutOfGoogle,
      checkExistingSession: checkExistingSession,
      getIsMember: getIsMember,
      getMembers: getMembers,
      getMessages: getMessages,
      getLastInviteCode: getLastInviteCode,
      getActionError: getActionError,
      startListeningToMessages: startListeningToMessages,
      stopListeningToMessages: stopListeningToMessages,
      startListeningToMembers: startListeningToMembers,
      stopListeningToMembers: stopListeningToMembers,
      sendMessage: sendMessage,
      generateInviteCode: generateInviteCode,
      redeemInviteCode: redeemInviteCode,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.komunikator = createKomunikatorRuntime();
})();
