(function () {
  // Topology's live desktop preview: owns "which nodes are currently being
  // watched" independent of which UI surface is showing them (RS thumbnail
  // wall vs. the CS big view), so both are just different-sized mount
  // points for the SAME live session rather than duplicate connections to
  // the same VNC server. A session's real container div (with noVNC's own
  // canvas inside it) is created once per node and re-parented via
  // mountSurface() into whichever wrapper element currently wants to show
  // it - moving a DOM node via appendChild does not reset its content or
  // tear down the live RFB connection, unlike replacing innerHTML would.
  //
  // Desktop-only, unconditionally: a raw TCP connection to the node's VNC
  // server has to be opened by the native Rust process (see
  // spawn_vnc_bridge in src-tauri/src/main.rs) - no browser, including the
  // www/GitHub Pages build, can open a raw TCP socket itself. Every entry
  // point here checks platform.isDesktop() and no-ops otherwise; callers
  // (panel-content-runtime.js) additionally hide the UI entirely on www so
  // this is a defensive backstop, not the only guard.
  var BRIDGE_PORT = 17900; // must match VNC_BRIDGE_PORT in src-tauri/src/main.rs
  var MAX_CONCURRENT_SESSIONS = 6;

  function createPulpitPreviewRuntime() {
    var sessions = Object.create(null); // nodeId -> { rfb, surfaceEl }
    var focusedNodeId = "";

    function emitChanged() {
      try {
        document.dispatchEvent(new CustomEvent("newui:pulpit-preview-changed", {
          detail: { activeNodeIds: getActiveNodeIds(), focusedNodeId: focusedNodeId }
        }));
      } catch (_) {
        // ignore event dispatch failures
      }
    }

    function isDesktop() {
      var platform = window.NetReconNewUICore && window.NetReconNewUICore.platform;
      return !!(platform && typeof platform.isDesktop === "function" && platform.isDesktop());
    }

    function getActiveNodeIds() {
      return Object.keys(sessions);
    }

    function isActive(nodeId) {
      return !!sessions[nodeId];
    }

    function getFocusedNodeId() {
      return focusedNodeId;
    }

    function setFocusedNodeId(nodeId) {
      if (!sessions[nodeId]) return;
      focusedNodeId = nodeId;
      emitChanged();
    }

    // Appended, not innerHTML-assigned - see the file-level comment. If
    // the node has no active session, wrapperEl is left untouched (caller
    // decides what an empty slot looks like).
    function mountSurface(nodeId, wrapperEl) {
      var session = sessions[nodeId];
      if (!session || !wrapperEl) return false;
      wrapperEl.appendChild(session.surfaceEl);
      return true;
    }

    // A small overlay on top of (not replacing) the RFB canvas already
    // attached to surfaceEl - VNC servers commonly require a password and
    // noVNC surfaces that via this event rather than accepting it upfront.
    // Never persisted anywhere (same one-time, read-at-use-only discipline
    // as the remote-install password field).
    function showCredentialsOverlay(surfaceEl, onSubmit) {
      // No deps-injected `tr` here (unlike the panel-*-runtime.js factories)
      // - this module registers directly onto window.NetReconNewUICore, so
      // it calls the i18n module's own createI18n() fresh each time,
      // reflecting whatever language is current at that moment.
      var i18nApi = window.NetReconNewUICore && window.NetReconNewUICore.i18n;
      var tr = (i18nApi && typeof i18nApi.createI18n === "function") ? i18nApi.createI18n().t : function (k) { return k; };
      var overlay = document.createElement("div");
      overlay.className = "v1-pulpit-preview-credentials";

      var input = document.createElement("input");
      input.type = "password";
      input.autocomplete = "off";
      input.placeholder = tr("pulpitPreviewPasswordPlaceholder");

      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = tr("pulpitRemoteRunSubmitBtn");

      function submit() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        onSubmit(input.value);
      }
      btn.addEventListener("click", submit);
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") submit();
      });

      overlay.appendChild(input);
      overlay.appendChild(btn);
      surfaceEl.appendChild(overlay);
      input.focus();
    }

    function stopPreview(nodeId) {
      var session = sessions[nodeId];
      if (!session) return;
      try {
        session.rfb.disconnect();
      } catch (_) {
        // ignore - already torn down
      }
      if (session.surfaceEl.parentNode) session.surfaceEl.parentNode.removeChild(session.surfaceEl);
      delete sessions[nodeId];
      if (focusedNodeId === nodeId) {
        var remaining = getActiveNodeIds();
        focusedNodeId = remaining.length ? remaining[0] : "";
      }
      emitChanged();
    }

    // A QEMU-managed VM and a VirtualBox-managed VM are physically
    // different machines (native loopback VNC vs. a bridged-LAN guest
    // running its own VNC server), so the actual target depends on which
    // hypervisor is currently checked - null if none is picked yet.
    // Duplicated (not shared via import) in panel-content-runtime.js's own
    // pulpitResolveVncTarget - same small-logic-duplication convention
    // already used between independent runtime modules elsewhere in this
    // codebase.
    function resolveVncTarget(node) {
      if (node.hypervisor === "qemu") return { host: node.vncQemuHost, port: node.vncQemuPort };
      if (node.hypervisor === "vb") return { host: node.vncVbHost, port: node.vncVbPort };
      return null;
    }

    function startPreview(nodeId) {
      if (!isDesktop()) return;
      if (sessions[nodeId]) {
        focusedNodeId = nodeId;
        emitChanged();
        return;
      }
      if (getActiveNodeIds().length >= MAX_CONCURRENT_SESSIONS) return;

      var canvasApi = window.NetReconNewUICore && window.NetReconNewUICore.pulpitCanvas;
      if (!canvasApi) return;
      var node = canvasApi.getState().nodes.find(function (n) { return n.id === nodeId; });
      if (!node) return;
      var target = resolveVncTarget(node);
      if (!target || !target.host || !target.port) return;

      var surfaceEl = document.createElement("div");
      surfaceEl.className = "v1-pulpit-preview-surface";

      var url = "ws://127.0.0.1:" + BRIDGE_PORT + "/vnc?host=" + encodeURIComponent(target.host) + "&port=" + encodeURIComponent(target.port);

      import("../vendor/novnc/core/rfb.js").then(function (mod) {
        var RFB = mod.default;
        var rfb = new RFB(surfaceEl, url);
        rfb.scaleViewport = true;

        rfb.addEventListener("credentialsrequired", function () {
          showCredentialsOverlay(surfaceEl, function (password) {
            try {
              rfb.sendCredentials({ password: password });
            } catch (_) {
              // ignore - connection likely already failing independently
            }
          });
        });

        rfb.addEventListener("disconnect", function () {
          stopPreview(nodeId);
        });

        sessions[nodeId] = { rfb: rfb, surfaceEl: surfaceEl };
        focusedNodeId = nodeId;
        emitChanged();
      }).catch(function () {
        // noVNC failed to load - nothing to tear down, session was never
        // registered in `sessions`.
      });
    }

    return {
      startPreview: startPreview,
      stopPreview: stopPreview,
      isActive: isActive,
      getActiveNodeIds: getActiveNodeIds,
      getFocusedNodeId: getFocusedNodeId,
      setFocusedNodeId: setFocusedNodeId,
      mountSurface: mountSurface,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.pulpitPreview = createPulpitPreviewRuntime();
})();
