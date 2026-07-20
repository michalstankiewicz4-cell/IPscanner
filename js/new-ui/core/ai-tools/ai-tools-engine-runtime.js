(function () {
  // Orchestrates one full AI Assistant exchange: send the conversation +
  // tool catalog to whichever provider is configured, execute any tool
  // call(s) the model requests (gated by ai-permissions-runtime.js),
  // send the results back, and repeat until a final text reply comes
  // back. Provider differences (Claude tool_use vs. Gemini functionCall)
  // are fully contained in ai-tools-provider-claude.js/-gemini.js - this
  // file only knows the provider-agnostic loop.
  //
  // Intermediate tool_use/tool_result turns are NOT written into the
  // visible/persisted chat history (navigation-runtime.js's flat,
  // plain-text `.v1-ai-msg` bubbles) - only the caller's original prompt
  // and this function's final text reply are. Each resolved tool call
  // instead surfaces as a small isMeta chat bubble via onMeta(), the same
  // "Mode switched to X" chrome pattern already used for non-conversational
  // notices, so the user can see what happened without the raw protocol
  // turns corrupting the plain-text history model.

  var MAX_ROUNDS = 6;

  function core() { return window.NetReconNewUICore || {}; }

  function adapterFor(providerKey) {
    return providerKey === "google" ? core().aiToolsProviderGemini : core().aiToolsProviderClaude;
  }

  function toolLabel(tr, permissionId) {
    var permissions = core().aiPermissions;
    var node = permissions && permissions.findNode ? permissions.findNode(permissionId) : null;
    if (!node) return permissionId;
    return tr(node.labelKey) !== node.labelKey ? tr(node.labelKey) : (node.fallback || permissionId);
  }

  // Resolves the gate for one tool call and, if it requires confirmation,
  // awaits the real confirm dialog (window.NetReconNewUI.openConfirmDialog -
  // the same accessible, keyboard-trapped modal every other "are you sure"
  // prompt in the app already uses). Returns a Promise<{allowed, reason}>.
  function gateCall(tr, permissionId, args) {
    var permissions = core().aiPermissions;
    if (!permissions) return Promise.resolve({ allowed: false, reason: "permissions_unavailable" });

    var level = permissions.resolveLevel(permissionId);
    if (level === "off") return Promise.resolve({ allowed: false, reason: "blocked_by_permission" });

    var state = permissions.getState();
    if (permissions.getActionCount() >= state.maxActionsPerConversation) {
      return Promise.resolve({ allowed: false, reason: "guardrail_max_actions" });
    }

    if (level === "auto") return Promise.resolve({ allowed: true, reason: "auto" });

    // "ask"
    var ui = window.NetReconNewUI || {};
    if (!ui.openConfirmDialog) return Promise.resolve({ allowed: false, reason: "confirm_dialog_unavailable" });

    var label = toolLabel(tr, permissionId);
    var argsText = Object.keys(args || {}).length ? JSON.stringify(args) : "";
    var message = tr("aiToolConfirmMessage").replace("{action}", label).replace("{args}", argsText);
    return ui.openConfirmDialog(tr("aiToolConfirmTitle"), message, tr("aiToolConfirmOk"), tr("exitPromptCancel"))
      .then(function (confirmed) { return { allowed: confirmed, reason: confirmed ? "user_confirmed" : "declined_by_user" }; });
  }

  function metaLineFor(tr, label, reason, result) {
    if (reason === "blocked_by_permission") return "🚫 " + tr("aiToolMetaBlocked").replace("{action}", label);
    if (reason === "guardrail_max_actions") return "⚠️ " + tr("aiToolMetaGuardrail").replace("{action}", label);
    if (reason === "declined_by_user") return "❌ " + tr("aiToolMetaDeclined").replace("{action}", label);
    if (result && result.ok) return "🔧 " + tr("aiToolMetaDone").replace("{action}", label);
    var reasonText = (result && (result.message || result.reason)) || "";
    return "⚠️ " + tr("aiToolMetaFailed").replace("{action}", label).replace("{reason}", reasonText);
  }

  // Runs every requested tool call for one round (sequentially - simplest
  // and safest given some calls open confirm dialogs that need the user's
  // full attention one at a time), returning the {id, name, result} list
  // the provider adapter needs to build the next tool-result message.
  function executeToolCalls(tr, toolCalls, onMeta) {
    var catalog = core().aiToolsCatalog;
    var handlers = core().aiToolsHandlers;
    var permissions = core().aiPermissions;

    var chain = Promise.resolve();
    var executed = [];

    toolCalls.forEach(function (call) {
      chain = chain.then(function () {
        var entry = catalog && catalog.getTool ? catalog.getTool(call.name) : null;
        if (!entry) {
          var result = { ok: false, reason: "unknown_tool" };
          executed.push({ id: call.id, name: call.name, result: result });
          return;
        }

        var label = toolLabel(tr, entry.permissionId);
        return gateCall(tr, entry.permissionId, call.input).then(function (gate) {
          if (!gate.allowed) {
            var blockedResult = { ok: false, reason: gate.reason };
            if (permissions) permissions.appendAuditLog({ toolId: entry.permissionId, args: call.input, outcome: gate.reason });
            if (onMeta) onMeta(metaLineFor(tr, label, gate.reason, blockedResult));
            executed.push({ id: call.id, name: call.name, result: blockedResult });
            return;
          }

          return handlers.runHandler(call.name, call.input).then(function (result) {
            if (permissions) {
              permissions.incrementActionCount();
              permissions.appendAuditLog({ toolId: entry.permissionId, args: call.input, outcome: result.ok ? "executed" : "executed_failed", detail: result });
            }
            if (onMeta) onMeta(metaLineFor(tr, label, "executed", result));
            executed.push({ id: call.id, name: call.name, result: result });
          });
        });
      });
    });

    return chain.then(function () { return executed; });
  }

  // opts: { provider, modelKey, apiKey, systemPrompt, textHistory (array of
  // {role, content} strings, ending with the new user turn), isFreshConversation,
  // tr, onMeta }. Returns { promise, abort } rather than a bare promise -
  // one exchange can be up to MAX_ROUNDS sequential paid API calls, so the
  // caller (navigation-runtime.js's Stop button) needs a way to actually
  // cut the in-flight network request rather than just ignoring its result
  // client-side (which still gets billed for tokens already generated
  // server-side either way).
  function runConversationTurn(opts) {
    var aiConfig = core().aiAssistantConfig;
    var permissions = core().aiPermissions;
    if (!aiConfig) return { promise: Promise.reject(new Error("ai_assistant_unavailable")), abort: function () {} };

    var tr = opts.tr || function (k) { return k; };
    if (opts.isFreshConversation && permissions) permissions.resetActionCount();

    var providerKey = aiConfig.normalizeProvider(opts.provider);
    var adapter = adapterFor(providerKey);
    var catalogTools = (core().aiToolsCatalog && core().aiToolsCatalog.getTools()) || [];
    var wireTools = adapter.buildTools(catalogTools);

    var messages = (opts.textHistory || []).map(function (h) { return adapter.textMessage(h.role, h.content); });

    var controller = (typeof AbortController === "function") ? new AbortController() : null;

    function round(n) {
      if (controller && controller.signal.aborted) return Promise.resolve(tr("aiToolStoppedNote"));
      if (n > MAX_ROUNDS) return Promise.resolve(tr("aiToolMaxRoundsReached"));

      return aiConfig.sendChatMessageRaw(opts.provider, opts.modelKey, opts.apiKey, messages, opts.systemPrompt, wireTools, controller && controller.signal)
        .then(function (response) {
          var toolCalls = adapter.extractToolCalls(response);
          if (!toolCalls.length) return adapter.extractText(response);

          messages.push(adapter.buildAssistantToolUseMessage(response));
          return executeToolCalls(tr, toolCalls, opts.onMeta).then(function (executed) {
            messages.push(adapter.buildToolResultMessage(executed));
            return round(n + 1);
          });
        })
        .catch(function (err) {
          if (controller && controller.signal.aborted) return tr("aiToolStoppedNote");
          throw err;
        });
    }

    return {
      promise: round(1),
      abort: function () { if (controller) controller.abort(); },
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.aiToolsEngine = {
    runConversationTurn: runConversationTurn,
  };
})();
