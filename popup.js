document.addEventListener('DOMContentLoaded', () => {
    loadPinnedEmailsPopup();

    const refreshButton = document.getElementById('refreshButton');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            chrome.tabs.query({url: "*://mail.google.com/*"}, (tabs) => {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, {action: "updateRequested"});
                }
            });
            loadPinnedEmailsPopup();
        });
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "updatePopup") {
            loadPinnedEmailsPopup();
        }
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
            item.innerHTML = `
                <div class="email-info">
                    <div class="email-subject" title="${escapeHtml(email.subject)}">${escapeHtml(email.subject)}</div>
                    <div class="email-sender">From: ${escapeHtml(email.sender)}</div>
                    <div class="email-time">Pinned: ${formatTime(email.timestamp)}</div>
                </div>
                <button class="unpin-btn" data-id="${escapeHtml(email.id)}">Unpin</button>
            `;
            emailList.appendChild(item);
        });

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
    chrome.storage.local.get(['pinnedEmails'], (result) => {
        const pinnedEmails = result.pinnedEmails || [];
        const updated = pinnedEmails.filter(e => e.id !== emailId);
        chrome.storage.local.set({ pinnedEmails: updated }, () => {
            chrome.tabs.query({url: "*://mail.google.com/*"}, (tabs) => {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, {action: "emailUnpinned", emailId: emailId});
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
