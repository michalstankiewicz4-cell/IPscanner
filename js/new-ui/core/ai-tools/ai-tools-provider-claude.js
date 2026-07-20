(function () {
  // Anthropic Messages API tool-use wire format. See
  // ai-tools-provider-gemini.js for the Google equivalent - the two exist
  // side by side because the wire shapes genuinely differ (full JSON
  // Schema + tool_use/tool_result blocks here vs. a constrained schema
  // subset + functionCall/functionResponse there), not because the models
  // within a provider differ - Opus/Sonnet/Haiku all share this one file.

  function buildTools(catalogTools) {
    return catalogTools.map(function (t) {
      return { name: t.name, description: t.description, input_schema: t.parameters };
    });
  }

  // A plain-text turn from the visible chat history -> Claude's
  // {role, content} shape (content as a single text block, not a bare
  // string, so it can sit alongside tool_use/tool_result blocks from later
  // turns in the same messages array without a shape mismatch).
  function textMessage(role, text) {
    return { role: role === "assistant" ? "assistant" : "user", content: [{ type: "text", text: String(text || "") }] };
  }

  function extractText(responseData) {
    return ((responseData && responseData.content) || [])
      .filter(function (b) { return b.type === "text"; })
      .map(function (b) { return b.text || ""; })
      .join("");
  }

  // { id, name, input } per requested call - stop_reason "tool_use" is the
  // signal there's at least one; a plain text-only reply has none.
  function extractToolCalls(responseData) {
    if (!responseData || responseData.stop_reason !== "tool_use") return [];
    return ((responseData.content) || [])
      .filter(function (b) { return b.type === "tool_use"; })
      .map(function (b) { return { id: b.id, name: b.name, input: b.input || {} }; });
  }

  // The assistant's own turn must be replayed back verbatim (including any
  // text blocks alongside the tool_use ones) before the tool_result
  // follow-up - Claude rejects a tool_result with no matching prior
  // tool_use in the immediately preceding assistant turn.
  function buildAssistantToolUseMessage(responseData) {
    return { role: "assistant", content: responseData.content || [] };
  }

  function buildToolResultMessage(executed) {
    return {
      role: "user",
      content: executed.map(function (e) {
        return {
          type: "tool_result",
          tool_use_id: e.id,
          content: JSON.stringify(e.result),
          is_error: !(e.result && e.result.ok),
        };
      }),
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.aiToolsProviderClaude = {
    buildTools: buildTools,
    textMessage: textMessage,
    extractText: extractText,
    extractToolCalls: extractToolCalls,
    buildAssistantToolUseMessage: buildAssistantToolUseMessage,
    buildToolResultMessage: buildToolResultMessage,
  };
})();
