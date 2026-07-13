(function () {
  var STORAGE_KEY = "netrecon_general_settings_v1";

  function makeDefaultState() {
    return {
      autoLoadLastSession: false,
      panelSideRight: false,
      checkForUpdates: true,
      rememberLanguage: true,
      rememberSkin: true,
      rememberPanelSizes: true,
      rememberBlurIp: true,
      rememberShowUnfinishedTools: true,
      rememberDetachedWindows: true,
      rememberWindowState: true,
      rememberOpenTabs: true,
      rememberClippyEnabled: true,
      rememberExtensions: true,
      rememberRangeHistory: true,
    };
  }

  function safeBool(value, fallback) {
    return typeof value === "boolean" ? value : !!fallback;
  }

  function cloneState(state) {
    var fallback = makeDefaultState();
    var input = state && typeof state === "object" ? state : {};
    var result = {};
    Object.keys(fallback).forEach(function (key) {
      result[key] = safeBool(input[key], fallback[key]);
    });
    return result;
  }

  function loadState() {
    try {
      var raw = window.localStorage ? window.localStorage.getItem(STORAGE_KEY) : "";
      if (!raw) return cloneState(makeDefaultState());
      return cloneState(JSON.parse(raw));
    } catch (_) {
      return cloneState(makeDefaultState());
    }
  }

  function saveState(state) {
    try {
      if (!window.localStorage) return;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // ignore persistence failures
    }
  }

  var currentState = loadState();

  function emitChanged() {
    try {
      document.dispatchEvent(new CustomEvent("newui:general-settings-changed", { detail: getState() }));
    } catch (_) {
      // ignore event dispatch failures
    }
  }

  function getState() {
    return cloneState(currentState);
  }

  function replaceState(nextState) {
    currentState = cloneState(nextState);
    saveState(currentState);
    emitChanged();
    return getState();
  }

  function resetDefaults() {
    return replaceState(makeDefaultState());
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.generalSettings = {
    STORAGE_KEY: STORAGE_KEY,
    getState: getState,
    getDefaultState: makeDefaultState,
    replaceState: replaceState,
    resetDefaults: resetDefaults,
  };
})();
