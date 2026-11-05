/*
 * FilersHub "Sync to FilersHub" button for GHL contact pages.
 *
 * Install once in GHL: Agency Settings -> Company -> Custom JS:
 *   <script src="https://app.filershub.com/ghl-contact-button.js"></script>
 *
 * Shows a floating button on contact pages of sub-accounts connected to
 * FilersHub. Clicking it opens a FilersHub popup that links (or creates) the
 * FilersHub client for that contact. This file holds no secrets: the popup
 * checks the person's own FilersHub sign-in before doing anything.
 */
(function () {
  if (window.__filershubContactButton) return;

  var APP = 'https://app.filershub.com';
  var BUTTON_ID = 'filershub-sync-contact-btn';
  var CONTACT_PATH = /\/location\/([A-Za-z0-9]+)\/contacts\/detail\/([A-Za-z0-9]+)/;
  var activeByLocation = {};

  function parse(pathname) {
    var m = String(pathname || '').match(CONTACT_PATH);
    return m ? { locationId: m[1], contactId: m[2] } : null;
  }

  function syncUrl(locationId, contactId) {
    return APP + '/ghl/sync-contact?location_id=' + encodeURIComponent(locationId) +
      '&contact_id=' + encodeURIComponent(contactId);
  }

  // Only show the button in sub-accounts that use FilersHub. If the check is
  // blocked, show it anyway (without remembering that): the popup still
  // enforces sign-in and firm access. One check per location at a time.
  function isActive(locationId) {
    if (activeByLocation[locationId]) return activeByLocation[locationId];
    var cacheKey = 'filershub-active:' + locationId;
    try {
      var cached = window.sessionStorage.getItem(cacheKey);
      if (cached === '1' || cached === '0') {
        activeByLocation[locationId] = Promise.resolve(cached === '1');
        return activeByLocation[locationId];
      }
    } catch (e) { /* storage blocked */ }
    activeByLocation[locationId] = window.fetch(APP + '/api/check-location?locationId=' + encodeURIComponent(locationId))
      .then(function (r) { return r.json(); })
      .then(function (body) {
        var active = !!(body && body.active);
        try { window.sessionStorage.setItem(cacheKey, active ? '1' : '0'); } catch (e) { /* ignore */ }
        return active;
      }, function () {
        return true;
      });
    return activeByLocation[locationId];
  }

  function createButton() {
    var btn = document.createElement('button');
    btn.setAttribute('id', BUTTON_ID);
    btn.setAttribute('type', 'button');
    btn.setAttribute('title', 'Link this contact to a FilersHub client');
    btn.textContent = 'Sync to FilersHub';
    var s = btn.style;
    s.position = 'fixed';
    s.right = '24px';
    s.bottom = '24px';
    s.zIndex = '2147483000';
    s.padding = '10px 16px';
    s.borderRadius = '999px';
    s.border = 'none';
    s.background = '#42ab30';
    s.color = '#ffffff';
    s.font = '600 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    s.boxShadow = '0 4px 14px rgba(0,0,0,0.18)';
    s.cursor = 'pointer';
    btn.addEventListener('click', function () {
      var ids = parse(window.location.pathname);
      if (!ids) return;
      window.open(syncUrl(ids.locationId, ids.contactId), '_blank', 'width=440,height=600,noopener,noreferrer');
    });
    document.body.appendChild(btn);
    return btn;
  }

  function render() {
    var ids = parse(window.location.pathname);
    var existing = document.getElementById(BUTTON_ID);
    if (!ids) {
      if (existing) existing.remove();
      return Promise.resolve();
    }
    return isActive(ids.locationId).then(function (active) {
      var current = parse(window.location.pathname);
      var btn = document.getElementById(BUTTON_ID);
      if (!active || !current || current.locationId !== ids.locationId) {
        if (btn) btn.remove();
        return;
      }
      if (!btn) createButton();
    });
  }

  window.__filershubContactButton = { parse: parse, syncUrl: syncUrl, render: render };
  render();
  // GHL is a single-page app: re-check the page as the user navigates.
  window.setInterval(render, 1000);
})();
