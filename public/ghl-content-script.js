// Content script injected into GHL pages to:
// 1. Detect the current location context (locationId)
// 2. Customize the GHL sidebar for active FilersHub locations only

(function () {
  'use strict';

  var APP_URL = 'https://app.filershub.com';
  var CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

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

      // Check if this location uses FilersHub and apply sidebar CSS
      applySidebarIfActive(locationId);
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
  // SIDEBAR CUSTOMIZATION (only for active FilersHub locations)
  // =====================================================

  var sidebarStyleEl = null;
  var sidebarObserver = null;

  function injectSidebarCSS() {
    if (sidebarStyleEl) return; // Already injected

    sidebarStyleEl = document.createElement('style');
    sidebarStyleEl.id = 'filershub-sidebar-css';
    sidebarStyleEl.textContent = [
      // Make the sidebar nav a flex column so CSS order works
      '#sidebar-v2 .hl_nav-header > nav {',
      '  display: flex !important;',
      '  flex-flow: column nowrap !important;',
      '}',
      '',
      // Give all nav items a default order
      '#sidebar-v2 .hl_nav-header > nav > a {',
      '  order: 1;',
      '}',
      '',
      // Hide Launchpad
      '#sidebar-v2 .hl_nav-header > nav > a#sb_launchpad,',
      '.hl_navItem[data-id="launchpad"] {',
      '  display: none !important;',
      '}',
      '',
      // Hide App Marketplace
      '#sidebar-v2 .hl_nav-header > nav > a#sb_app-marketplace {',
      '  display: none !important;',
      '}',
      '',
      // Hide AI Agents
      '#sidebar-v2 .hl_nav-header > nav > a[id="sb_AI Agents"] {',
      '  display: none !important;',
      '}',
    ].join('\n');
    document.head.appendChild(sidebarStyleEl);

    // CML links use a meta attribute with a UUID, not "filershub" in href.
    // We need JS to find the FilersHub link by its text and pin it to the top.
    pinFilersHubLink();
    startSidebarObserver();
  }

  function pinFilersHubLink() {
    var nav = document.querySelector('#sidebar-v2 .hl_nav-header > nav');
    if (!nav) return;

    var links = nav.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      // Match by visible text or title/aria-label containing "FilersHub"
      var text = (link.textContent || '').trim();
      var title = link.getAttribute('title') || '';
      if (text.toLowerCase().indexOf('filershub') !== -1 ||
          title.toLowerCase().indexOf('filershub') !== -1) {
        link.style.setProperty('order', '-99', 'important');
        return; // Found it, done
      }
    }
  }

  function startSidebarObserver() {
    if (sidebarObserver) return; // Already observing

    // GHL is a SPA — the sidebar may re-render. Watch for changes and re-pin.
    var sidebar = document.querySelector('#sidebar-v2');
    if (!sidebar) return;

    sidebarObserver = new MutationObserver(function () {
      pinFilersHubLink();
    });
    sidebarObserver.observe(sidebar, { childList: true, subtree: true });
  }

  function removeSidebarCSS() {
    if (sidebarStyleEl) {
      sidebarStyleEl.remove();
      sidebarStyleEl = null;
    }
    if (sidebarObserver) {
      sidebarObserver.disconnect();
      sidebarObserver = null;
    }
  }

  function applySidebarIfActive(locationId) {
    if (!locationId) return;

    var cacheKey = 'fh_location_' + locationId;

    // Check cache first
    chrome.storage.local.get(cacheKey, function (result) {
      var cached = result[cacheKey];

      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        // Use cached result
        if (cached.active) {
          injectSidebarCSS();
        } else {
          removeSidebarCSS();
        }
        return;
      }

      // No cache or expired — check the API
      fetch(APP_URL + '/api/check-location?locationId=' + encodeURIComponent(locationId))
        .then(function (res) { return res.json(); })
        .then(function (data) {
          var isActive = data.active === true;

          // Cache the result
          var cacheObj = {};
          cacheObj[cacheKey] = { active: isActive, timestamp: Date.now() };
          chrome.storage.local.set(cacheObj);

          if (isActive) {
            injectSidebarCSS();
          } else {
            removeSidebarCSS();
          }
        })
        .catch(function () {
          // On network error, don't inject CSS (safe default)
          removeSidebarCSS();
        });
    });
  }
})();
