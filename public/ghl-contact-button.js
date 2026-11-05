/*
 * FilersHub "Sync to FilersHub" button for GHL contact pages.
 *
 * Install once in GHL: Agency Settings -> Company -> Custom JS:
 *   <script src="https://app.filershub.com/ghl-contact-button.js"></script>
 *
 * On contact pages of sub-accounts connected to FilersHub, adds a button to the
 * "Contact Details" heading of the contact card (or, if that heading can't be
 * found, a floating button in the corner). Clicking it opens a FilersHub popup
 * that links (or creates) the FilersHub client for that contact. Below the
 * card's header it also shows a FilersHub panel listing the client's tax
 * returns and their status. This file holds no secrets: the popup and the
 * panel check the person's own FilersHub sign-in.
 */
(function () {
  if (window.__filershubContactButton) return;

  var APP = 'https://app.filershub.com';
  var BUTTON_ID = 'filershub-sync-contact-btn';      // floating corner button
  var INLINE_ID = 'filershub-sync-contact-inline';   // button inside the contact card
  var PANEL_ID = 'filershub-contact-returns';        // tax-returns panel inside the contact card
  // Must match HEIGHT_MESSAGE in components/GhlContactReturns.tsx.
  var HEIGHT_MESSAGE = 'filershub-contact-returns:height';
  var MAX_PANEL_HEIGHT = 600;
  var CARD_HEADING = 'Contact Details';
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

  function returnsUrl(locationId, contactId) {
    return APP + '/ghl/contact-returns?location_id=' + encodeURIComponent(locationId) +
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

  function openPopup() {
    var ids = parse(window.location.pathname);
    if (!ids) return;
    window.open(syncUrl(ids.locationId, ids.contactId), '_blank', 'width=440,height=600,noopener,noreferrer');
  }

  function makeButton(id, label) {
    var btn = document.createElement('button');
    btn.setAttribute('id', id);
    btn.setAttribute('type', 'button');
    btn.setAttribute('title', 'Link this contact to a FilersHub client');
    btn.textContent = label;
    var s = btn.style;
    s.border = 'none';
    s.borderRadius = '999px';
    s.background = '#42ab30';
    s.color = '#ffffff';
    s.cursor = 'pointer';
    s.whiteSpace = 'nowrap';
    btn.addEventListener('click', openPopup);
    return btn;
  }

  function addCornerButton() {
    var btn = makeButton(BUTTON_ID, 'Sync to FilersHub');
    var s = btn.style;
    s.position = 'fixed';
    s.right = '24px';
    s.bottom = '24px';
    s.zIndex = '2147483000';
    s.padding = '10px 16px';
    s.font = '600 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    s.boxShadow = '0 4px 14px rgba(0,0,0,0.18)';
    document.body.appendChild(btn);
  }

  // The row holding the card's "Contact Details" heading (matched by its text,
  // since GHL's element names change between releases).
  function findCardHeadingRow() {
    var nodes = document.querySelectorAll('div,span,p,h1,h2,h3,h4,h5,h6');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.childElementCount === 0 && String(el.textContent || '').trim() === CARD_HEADING) {
        return el.parentElement;
      }
    }
    return null;
  }

  function addInlineButton(row) {
    var btn = makeButton(INLINE_ID, 'Sync to FilersHub');
    var s = btn.style;
    s.marginLeft = 'auto';
    s.padding = '4px 10px';
    s.font = '600 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    row.appendChild(btn);
  }

  function removeById(id) {
    var el = document.getElementById(id);
    if (el) el.remove();
  }

  function removeAll() {
    removeById(INLINE_ID);
    removeById(BUTTON_ID);
    removeById(PANEL_ID);
  }

  // The tax-returns panel goes right below the card's header (the element
  // holding the heading row with the inline button). Moving an iframe reloads
  // it, so it is only placed when missing or out of place.
  function ensurePanel(ids) {
    var inline = document.getElementById(INLINE_ID);
    var header = inline && inline.parentElement && inline.parentElement.parentElement;
    if (!header || !header.parentElement) {
      removeById(PANEL_ID);
      return;
    }
    var panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('iframe');
      panel.setAttribute('id', PANEL_ID);
      panel.setAttribute('title', 'FilersHub tax returns');
      var s = panel.style;
      s.display = 'block';
      s.flexShrink = '0'; // the card is a fixed-height flex column; don't let it squash the panel
      s.width = 'calc(100% - 24px)';
      s.height = '72px';
      s.margin = '0 12px 8px';
      s.border = '0';
      s.background = 'transparent';
    }
    if (panel.parentElement !== header.parentElement || panel.previousElementSibling !== header) {
      header.parentElement.insertBefore(panel, header.nextSibling);
    }
    var src = returnsUrl(ids.locationId, ids.contactId);
    if (panel.getAttribute('src') !== src) panel.setAttribute('src', src);
  }

  // The panel reports its height so the card shows it without a scrollbar.
  // Only messages from the FilersHub page inside our own panel count.
  window.addEventListener('message', function (event) {
    if (event.origin !== APP) return;
    var data = event.data;
    if (!data || data.type !== HEIGHT_MESSAGE) return;
    var panel = document.getElementById(PANEL_ID);
    if (!panel || event.source !== panel.contentWindow) return;
    var height = Math.ceil(Number(data.height));
    if (!(height > 0)) return;
    panel.style.height = Math.min(height, MAX_PANEL_HEIGHT) + 'px';
  });

  function render() {
    var ids = parse(window.location.pathname);
    if (!ids) {
      removeAll();
      return Promise.resolve();
    }
    return isActive(ids.locationId).then(function (active) {
      var current = parse(window.location.pathname);
      if (!active || !current || current.locationId !== ids.locationId) {
        removeAll();
        return;
      }
      // GHL re-renders the card as you move around, so re-add the button when it disappears.
      if (!document.getElementById(INLINE_ID)) {
        var row = findCardHeadingRow();
        if (row) addInlineButton(row);
      }
      if (document.getElementById(INLINE_ID)) {
        removeById(BUTTON_ID);
        ensurePanel(current);
      } else {
        removeById(PANEL_ID);
        if (!document.getElementById(BUTTON_ID)) addCornerButton();
      }
    });
  }

  window.__filershubContactButton = { parse: parse, syncUrl: syncUrl, returnsUrl: returnsUrl, render: render };
  render();
  // GHL is a single-page app: re-check the page as the user navigates.
  window.setInterval(render, 1000);
})();
