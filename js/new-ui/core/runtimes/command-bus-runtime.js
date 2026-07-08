(function () {
  // shell: generic named-command registry, per FUTURE_PLUGIN_SHELL.md's
  // "Command bus" design. Purely additive infrastructure - nothing existing
  // is wired through this yet (today's menu actions/keybindings still call
  // their handlers directly). This is the shared foundation the future
  // Command Palette, keybindings, and activity-bar-icon-to-command wiring
  // will all sit on top of, plus the eventual WASM addon bridge (an addon's
  // `contributions.commands` entries register here the same way base/shell
  // commands do).
  function createCommandBusRuntime() {
    var registry = Object.create(null);

    function register(commandId, handler, ownerId) {
      var id = String(commandId || "").trim();
      if (!id) throw new Error("command-bus: commandId is required");
      if (typeof handler !== "function") {
        throw new Error("command-bus: handler for \"" + id + "\" must be a function");
      }

      registry[id] = {
        id: id,
        handler: handler,
        ownerId: ownerId != null ? String(ownerId) : "shell",
      };
    }

    function unregister(commandId) {
      var id = String(commandId || "").trim();
      if (registry[id]) delete registry[id];
    }

    function unregisterAllFor(ownerId) {
      var owner = String(ownerId || "");
      Object.keys(registry).forEach(function (id) {
        if (registry[id].ownerId === owner) delete registry[id];
      });
    }

    function has(commandId) {
      return !!registry[String(commandId || "").trim()];
    }

    function invoke(commandId, args) {
      var id = String(commandId || "").trim();
      var entry = registry[id];
      if (!entry) {
        throw new Error("command-bus: no command registered for \"" + id + "\"");
      }
      return entry.handler(args);
    }

    function list() {
      return Object.keys(registry).map(function (id) {
        return { id: id, ownerId: registry[id].ownerId };
      });
    }

    return {
      register: register,
      unregister: unregister,
      unregisterAllFor: unregisterAllFor,
      has: has,
      invoke: invoke,
      list: list,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createCommandBusRuntime = createCommandBusRuntime;
})();
