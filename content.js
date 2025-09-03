chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "emailUnpinned") {
        updatePinIcons();
    }
});

function injectPinIcons() {
    const emailRows = document.querySelectorAll('tr.zA');
    
    emailRows.forEach(row => {
        if (row.querySelector('.gmail-pin-icon')) {
            return;
        }
        
        const checkboxCell = row.querySelector('td');
        if (!checkboxCell) return;
        
        const pinIcon = document.createElement('div');
        pinIcon.className = 'gmail-pin-icon';
        pinIcon.innerHTML = '📌';
        pinIcon.style.cssText = `
            cursor: pointer;
            margin-right: -8px;
            display: inline-block;
            font-size: 16px;
        `;
        
        const emailId = row.getAttribute('data-id') || generateEmailId(row);
        
        chrome.storage.local.get(['pinnedEmails'], function(result) {
            const pinnedEmails = result.pinnedEmails || [];
            const isPinned = pinnedEmails.some(email => email.id === emailId);
            
            if (isPinned) {
                pinIcon.style.color = '#ea4335';
                const table = row.closest('table');
                if (table && table.firstChild) {
                    table.insertBefore(row, table.firstChild);
                }
            }
        });
        
        pinIcon.addEventListener('click', function(event) {
            event.stopPropagation();
            
            const subjectElement = row.querySelector('.bog');
            const senderElement = row.querySelector('.yW span');
            
            const subject = subjectElement ? subjectElement.textContent : 'No subject';
            const sender = senderElement ? senderElement.textContent : 'Unknown sender';
            
            chrome.storage.local.get(['pinnedEmails'], function(result) {
                const pinnedEmails = result.pinnedEmails || [];
                const existingIndex = pinnedEmails.findIndex(email => email.id === emailId);
                
                if (existingIndex >= 0) {
                    pinnedEmails.splice(existingIndex, 1);
                    pinIcon.style.color = '';
                } else {
                    if (pinnedEmails.length >= 5) {
                        alert('You can only pin up to 5 emails. Unpin one first to pin this email.');
                        return;
                    }
                    
                    pinnedEmails.push({
                        id: emailId,
                        subject: subject,
                        sender: sender
                    });
                    pinIcon.style.color = '#ea4335';
                    
                    const table = row.closest('table');
                    if (table && table.firstChild) {
                        table.insertBefore(row, table.firstChild);
                    }
                }
                
                chrome.storage.local.set({pinnedEmails: pinnedEmails}, function() {
                    chrome.runtime.sendMessage({action: "updatePopup"});
                });
            });
        });
        
        checkboxCell.insertBefore(pinIcon, checkboxCell.firstChild);
    });
}

function generateEmailId(row) {
    const subjectElement = row.querySelector('.bog');
    const subject = subjectElement ? subjectElement.textContent : '';
    return `${subject}-${Date.now()}`;
}

function updatePinIcons() {
    const existingIcons = document.querySelectorAll('.gmail-pin-icon');
    existingIcons.forEach(icon => icon.remove());
    injectPinIcons();
}

setTimeout(injectPinIcons, 3000);

const observer = new MutationObserver(injectPinIcons);
observer.observe(document.body, { childList: true, subtree: true });