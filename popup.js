document.addEventListener('DOMContentLoaded', function() {
    chrome.storage.local.get(['pinnedEmails'], function(result) {
        const pinnedEmails = result.pinnedEmails || [];
        const messageElement = document.getElementById('message');
        
        if (pinnedEmails.length === 0) {
            messageElement.innerHTML = '<p>No emails pinned yet.</p>';
        } else {
            let html = '<ul>';
            pinnedEmails.forEach(emailId => {
                html += `<li>${emailId}</li>`;
            });
            html += '</ul>';
            messageElement.innerHTML = html;
        }
    });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.message) {
        document.getElementById('message').innerText = request.message;
    }
});