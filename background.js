// Background service worker for the extension
chrome.runtime.onInstalled.addListener(function() {
    // Initialize storage with empty array for pinned emails
    chrome.storage.local.set({pinnedEmails: []});
});