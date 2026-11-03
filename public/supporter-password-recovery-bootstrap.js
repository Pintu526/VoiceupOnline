(function captureAndClearSupporterRecoveryUrl() {
  Object.defineProperty(window, "__voiceupSupporterRecoveryRequest", {
    configurable: true,
    value: {
      search: window.location.search,
      hash: window.location.hash
    }
  });
  window.history.replaceState(null, "", window.location.pathname);
})();
