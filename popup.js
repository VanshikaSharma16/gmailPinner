document.addEventListener('DOMContentLoaded', function() {
    loadPinnedEmails();
    
    // Add refresh button functionality
    const refreshButton = document.getElementById('refreshButton');
    if (refreshButton) {
        refreshButton.addEventListener('click', function() {
            chrome.tabs.query({url: "*://mail.google.com/*"}, function(tabs) {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: "updateRequested"
                    });
                }
                loadPinnedEmails();
            });
        });
    }
    
    // Listen for messages from content script
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.action === "updatePopup") {
            loadPinnedEmails();
        }
    });
});

function loadPinnedEmails() {
    chrome.storage.local.get(['pinnedEmails'], function(result) {
        const pinnedEmails = result.pinnedEmails || [];
        const emailList = document.getElementById('pinnedEmailsList');
        
        if (pinnedEmails.length === 0) {
            emailList.innerHTML = '<div class="empty-state">No emails pinned yet</div>';
            return;
        }
        
        emailList.innerHTML = '';
        pinnedEmails.forEach((email, index) => {
            const emailItem = document.createElement('div');
            emailItem.className = 'email-item';
            emailItem.innerHTML = `
                <div class="email-info">
                    <div class="email-subject" title="${escapeHtml(email.subject)}">${escapeHtml(email.subject)}</div>
                    <div class="email-sender">From: ${escapeHtml(email.sender)}</div>
                </div>
                <button class="unpin-btn" data-id="${escapeHtml(email.id)}">Unpin</button>
            `;
            emailList.appendChild(emailItem);
        });
        
        // Add event listeners to unpin buttons
        const unpinButtons = document.getElementsByClassName('unpin-btn');
        Array.from(unpinButtons).forEach(button => {
            button.addEventListener('click', function() {
                const emailId = this.getAttribute('data-id');
                unpinEmail(emailId);
            });
        });
    });
}

function unpinEmail(emailId) {
    chrome.storage.local.get(['pinnedEmails'], function(result) {
        const pinnedEmails = result.pinnedEmails || [];
        const updatedEmails = pinnedEmails.filter(email => email.id !== emailId);
        
        chrome.storage.local.set({pinnedEmails: updatedEmails}, function() {
            // Notify content script about the change
            chrome.tabs.query({url: "*://mail.google.com/*"}, function(tabs) {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: "emailUnpinned",
                        emailId: emailId
                    });
                }
            });
            
            // Update the popup
            loadPinnedEmails();
        });
    });
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}