// Background service worker for the extension
chrome.runtime.onInstalled.addListener(function() {
    // Initialize storage with empty array for pinned emails
    chrome.storage.local.set({pinnedEmails: []});
});

// Listen for Gmail tab updates
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete' && tab.url.includes('mail.google.com')) {
        // Inject content script when Gmail loads
        chrome.scripting.executeScript({
            target: {tabId: tabId},
            files: ['content.js']
        });
    }
});