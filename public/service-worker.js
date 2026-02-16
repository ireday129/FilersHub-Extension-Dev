// Background service worker for FilersHub Chrome Extension.
// Manages GHL context lifecycle: clears stored context when user leaves GHL pages.

console.log('FilersHub Extension Service Worker Loaded');

var GHL_PATTERNS = [
  /^https:\/\/app\.gohighlevel\.com\/location\//,
  /^https:\/\/[^/]+\.leadconnectorhq\.com\/location\//,
];

function isGhlLocationUrl(url) {
  if (!url) return false;
  return GHL_PATTERNS.some(function (pattern) {
    return pattern.test(url);
  });
}

function clearGhlContext() {
  chrome.storage.local.remove('ghlContext');
}

function checkActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs.length > 0 && tabs[0].url) {
      if (!isGhlLocationUrl(tabs[0].url)) {
        clearGhlContext();
      }
    }
  });
}

// When the user switches to a different tab
chrome.tabs.onActivated.addListener(function (activeInfo) {
  chrome.tabs.get(activeInfo.tabId, function (tab) {
    if (chrome.runtime.lastError) return;
    if (tab && tab.url) {
      if (!isGhlLocationUrl(tab.url)) {
        clearGhlContext();
      }
    }
  });
});

// When a tab's URL changes (navigation within the same tab)
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
  if (changeInfo.url) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (activeTabs) {
      if (activeTabs.length > 0 && activeTabs[0].id === tabId) {
        if (!isGhlLocationUrl(changeInfo.url)) {
          clearGhlContext();
        }
      }
    });
  }
});

// When a tab is closed, check if the remaining active tab is still GHL
chrome.tabs.onRemoved.addListener(function () {
  setTimeout(function () {
    checkActiveTab();
  }, 100);
});
