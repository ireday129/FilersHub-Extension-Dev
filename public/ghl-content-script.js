// Content script injected into GHL pages to:
// 1. Detect the current location context (locationId)
// 2. Customize the GHL sidebar (hide Launchpad, pin FilersHub to top)

(function () {
  'use strict';

  // =====================================================
  // LOCATION CONTEXT DETECTION
  // =====================================================

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

  // =====================================================
  // SIDEBAR CUSTOMIZATION
  // =====================================================

  // Inject CSS to hide Launchpad
  var style = document.createElement('style');
  style.textContent =
    '.hl_navItem[data-id="launchpad"] { display: none !important; }';
  document.head.appendChild(style);

  // Move FilersHub CML to the top of the sidebar nav
  function pinFilersHubToTop() {
    // Find all sidebar nav items
    var navItems = document.querySelectorAll('.hl_navItem');
    var sidebar = null;
    var filershubItem = null;

    for (var i = 0; i < navItems.length; i++) {
      var item = navItems[i];
      // Match by link text or URL containing filershub
      var text = item.textContent || '';
      var link = item.querySelector('a');
      var href = link ? link.getAttribute('href') || '' : '';

      if (
        text.toLowerCase().indexOf('filershub') !== -1 ||
        href.toLowerCase().indexOf('filershub') !== -1
      ) {
        filershubItem = item;
        sidebar = item.parentElement;
        break;
      }
    }

    if (filershubItem && sidebar) {
      // Move to first position in the sidebar
      sidebar.insertBefore(filershubItem, sidebar.firstChild);
    }
  }

  // GHL sidebar loads dynamically — retry until found
  var pinAttempts = 0;
  var pinInterval = setInterval(function () {
    pinFilersHubToTop();
    pinAttempts++;
    // Stop after 30 seconds (60 attempts at 500ms)
    if (pinAttempts > 60) {
      clearInterval(pinInterval);
    }
  }, 500);

  // Also re-run on SPA navigation in case sidebar re-renders
  var origOnUrlChange = onUrlChange;
  onUrlChange = function () {
    origOnUrlChange();
    pinAttempts = 0;
    pinInterval = setInterval(function () {
      pinFilersHubToTop();
      pinAttempts++;
      if (pinAttempts > 60) {
        clearInterval(pinInterval);
      }
    }, 500);
  };
})();
