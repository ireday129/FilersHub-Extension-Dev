// Content script injected into GHL pages to detect the current location context.
// Extracts locationId from URL and stores it in chrome.storage.local
// so the FilersHub extension popup can read it.

(function () {
  'use strict';

  function extractLocationId() {
    var match = window.location.pathname.match(/\/location\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }

  function updateGhlContext() {
    var locationId = extractLocationId();
    if (locationId) {
      chrome.storage.local.set({
        ghlContext: {
          locationId: locationId,
          url: window.location.href,
          timestamp: Date.now(),
        },
      });
    }
  }

  // Run on initial page load
  updateGhlContext();

  // GHL is a SPA — detect client-side navigation via pushState/replaceState overrides
  var lastUrl = window.location.href;

  var originalPushState = history.pushState;
  var originalReplaceState = history.replaceState;

  history.pushState = function () {
    originalPushState.apply(this, arguments);
    onUrlChange();
  };

  history.replaceState = function () {
    originalReplaceState.apply(this, arguments);
    onUrlChange();
  };

  window.addEventListener('popstate', onUrlChange);

  function onUrlChange() {
    var currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      updateGhlContext();
    }
  }
})();
