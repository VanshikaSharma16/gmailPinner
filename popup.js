document.addEventListener('DOMContentLoaded', () => {
    loadPinnedEmailsPopup();

    const refreshButton = document.getElementById('refreshButton');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            chrome.tabs.query({url: "*://mail.google.com/*"}, (tabs) => {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, {action: "updateRequested"}, (response) => {
                        if (chrome.runtime.lastError) {
                            console.log('Gmail Pin: Could not send message to content script');
                        }
                    });
                }
            });
            loadPinnedEmailsPopup();
        });
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "updatePopup") {
            loadPinnedEmailsPopup();
            sendResponse({status: "done"});
        }
        return true; // Required for async response
    });
});

function loadPinnedEmailsPopup() {
    chrome.storage.local.get(['pinnedEmails'], (result) => {
        const pinnedEmails = result.pinnedEmails || [];
        const emailList = document.getElementById('pinnedEmailsList');
        if (!emailList) return;
        if (pinnedEmails.length === 0) {
            emailList.innerHTML = '<div class="empty-state">No emails pinned yet</div>';
            return;
        }
        emailList.innerHTML = '';
        pinnedEmails.slice().reverse().forEach((email) => {
            const item = document.createElement('div');
            item.className = 'email-item';
            item.setAttribute('data-email-id', email.id);
            item.innerHTML = `
                <div class="email-info">
                    <div class="email-subject" title="${escapeHtml(email.subject)}">${escapeHtml(email.subject)}</div>
                    <div class="email-sender">From: ${escapeHtml(email.sender)}</div>
                    <div class="email-time">Pinned: ${formatTime(email.timestamp)}</div>
                </div>
                <button class="unpin-btn" data-id="${escapeHtml(email.id)}">Unpin</button>
            `;
            emailList.appendChild(item);
            
            // Make email item clickable (except when clicking unpin button)
            const emailInfo = item.querySelector('.email-info');
            if (emailInfo) {
                emailInfo.style.cursor = 'pointer';
                emailInfo.addEventListener('click', function(e) {
                    e.stopPropagation();
                    navigateToEmail(email.id);
                });
            }
        });

        const unpinButtons = document.getElementsByClassName('unpin-btn');
        Array.from(unpinButtons).forEach(button => {
            button.addEventListener('click', function(e) {
                e.stopPropagation();
                const emailId = this.getAttribute('data-id');
                unpinEmail(emailId);
            });
        });
    });
}

function unpinEmail(emailId) {
    chrome.storage.local.get(['pinnedEmails'], (result) => {
        const pinnedEmails = result.pinnedEmails || [];
        const updated = pinnedEmails.filter(e => e.id !== emailId);
        chrome.storage.local.set({ pinnedEmails: updated }, () => {
            chrome.tabs.query({url: "*://mail.google.com/*"}, (tabs) => {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, {action: "emailUnpinned", emailId: emailId}, (response) => {
                        if (chrome.runtime.lastError) {
                            console.log('Gmail Pin: Could not send message to content script');
                        }
                    });
                }
            });
            loadPinnedEmailsPopup();
        });
    });
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;")
               .replace(/</g, "&lt;")
               .replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;")
               .replace(/'/g, "&#039;");
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function navigateToEmail(emailId) {
    chrome.tabs.query({url: "*://mail.google.com/*"}, (tabs) => {
        if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, {action: "navigateToEmail", emailId: emailId}, (response) => {
                if (chrome.runtime.lastError) {
                    console.log('Gmail Pin: Could not send message to content script');
                } else {
                    // Focus the Gmail tab
                    chrome.tabs.update(tabs[0].id, {active: true});
                }
            });
        } else {
            // Open Gmail in a new tab if not already open
            chrome.tabs.create({url: "https://mail.google.com"});
        }
    });
}
