(function () {
  function createStore(initialState) {
    var state = Object.assign({}, initialState || {});
    var listeners = [];

    function getState() {
      return Object.assign({}, state);
    }

    function setState(patch) {
      var prev = Object.assign({}, state);
      state = Object.assign({}, state, patch || {});
      listeners.forEach(function (listener) {
        try {
          listener(Object.assign({}, state), prev);
        } catch (_) {}
      });
      return getState();
    }

    function subscribe(listener) {
      if (typeof listener !== "function") return function () {};
      listeners.push(listener);
      return function () {
        listeners = listeners.filter(function (l) { return l !== listener; });
      };
    }

    return {
      getState: getState,
      setState: setState,
      subscribe: subscribe,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.createStore = createStore;
})();
