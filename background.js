chrome.runtime.onInstalled.addListener(function() {
    chrome.storage.local.set({ pinnedEmails: [] });
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete' && tab.url.includes('mail.google.com')) {
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        });
    }
});
