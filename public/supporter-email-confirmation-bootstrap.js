(function captureAndClearSupporterConfirmationUrl() {
  Object.defineProperty(window, "__voiceupSupporterConfirmationRequest", {
    configurable: true,
    value: {
      search: window.location.search,
      hash: window.location.hash
    }
  });
  window.history.replaceState(null, "", window.location.pathname);
})();
