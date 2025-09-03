document.addEventListener('DOMContentLoaded', function() {
    loadPinnedEmails();
    
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
                    <div class="email-subject" title="${email.subject}">${email.subject}</div>
                    <div class="email-sender">From: ${email.sender}</div>
                </div>
                <button class="unpin-btn" data-id="${email.id}">Unpin</button>
            `;
            emailList.appendChild(emailItem);
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
    chrome.storage.local.get(['pinnedEmails'], function(result) {
        const pinnedEmails = result.pinnedEmails || [];
        const updatedEmails = pinnedEmails.filter(email => email.id !== emailId);
        
        chrome.storage.local.set({pinnedEmails: updatedEmails}, function() {
            chrome.tabs.query({url: "*://mail.google.com/*"}, function(tabs) {
                if (tabs.length > 0) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: "emailUnpinned",
                        emailId: emailId
                    });
                }
            });
            
            loadPinnedEmails();
        });
    });
}