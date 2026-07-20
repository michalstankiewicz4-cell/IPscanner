(function () {
  // Google (Gemini) function-calling wire format - see ai-tools-provider-
  // claude.js's file-top comment for why this is a separate file (the
  // provider's wire shape differs, not the model within a provider: Pro
  // and Flash both share this one file).
  //
  // The catalog (ai-tools-catalog.js) only ever uses plain
  // {type, properties, description, required} - a subset both Claude's
  // full-JSON-Schema input_schema and Gemini's narrower `parameters`
  // format already accept as-is, so no schema translation/stripping step
  // is needed here today. If a future tool ever needed a JSON Schema
  // feature Gemini doesn't support (e.g. $ref, oneOf), that sanitizing
  // step would belong in buildTools() below.

  function buildTools(catalogTools) {
    return [{
      functionDeclarations: catalogTools.map(function (t) {
        return { name: t.name, description: t.description, parameters: t.parameters };
      }),
    }];
  }

  function textMessage(role, text) {
    return { role: role === "assistant" ? "model" : "user", parts: [{ text: String(text || "") }] };
  }

  function extractText(responseData) {
    return ((responseData && responseData.candidates) || [])
      .map(function (c) {
        var parts = (c.content && c.content.parts) || [];
        return parts.map(function (p) { return p.text || ""; }).join("");
      })
      .join("");
  }

  // Gemini's functionCall parts carry no call id (unlike Claude's tool_use
  // blocks) - responses are matched back to calls by name/position instead,
  // so this synthesizes a local-only index id purely for the engine's own
  // bookkeeping; it's never sent back over the wire.
  function extractToolCalls(responseData) {
    var candidate = ((responseData && responseData.candidates) || [])[0];
    var parts = (candidate && candidate.content && candidate.content.parts) || [];
    return parts
      .filter(function (p) { return !!p.functionCall; })
      .map(function (p, idx) { return { id: "call_" + idx, name: p.functionCall.name, input: p.functionCall.args || {} }; });
  }

  function buildAssistantToolUseMessage(responseData) {
    var candidate = ((responseData && responseData.candidates) || [])[0];
    return { role: "model", parts: (candidate && candidate.content && candidate.content.parts) || [] };
  }

  function buildToolResultMessage(executed) {
    return {
      role: "function",
      parts: executed.map(function (e) {
        return { functionResponse: { name: e.name, response: e.result } };
      }),
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.aiToolsProviderGemini = {
    buildTools: buildTools,
    textMessage: textMessage,
    extractText: extractText,
    extractToolCalls: extractToolCalls,
    buildAssistantToolUseMessage: buildAssistantToolUseMessage,
    buildToolResultMessage: buildToolResultMessage,
  };
})();
