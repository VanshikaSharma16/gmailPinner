(function() {
    'use strict';

    const MAX_PINS = 5;
    const CHECK_INTERVAL = 3000;

    let pinnedEmails = [];
    let isProcessing = false;
    let processedEmails = new Set();

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
        .gmail-pin-button {
            display: inline-flex !important;
            width: 24px;
            height: 24px;
            margin-right: 12px;
            cursor: pointer;
            border-radius: 50%;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            background-color: white;
            border: 1px solid #dadce0;
            transition: all 0.2s ease;
            position: relative;
            z-index: 1000;
            vertical-align: middle;
        }
        .gmail-pin-button:hover {
            background-color: #f1f3f4;
            border-color: #9aa0a6;
        }
        .gmail-pin-button.pinned {
            background-color: #fce8e6;
            color: #ea4335;
            border-color: #ea4335;
        }
        .gmail-pin-button::before {
            content: "📌";
        }
        .pinned-email {
            background-color: #fce8e6 !important;
            border-left: 3px solid #ea4335 !important;
        }
    `;
    document.head.appendChild(style);

    function initContent() {
        console.log('Gmail Pin Extension: Initializing');
        loadPinnedEmailsContent();
        startObserver();
        startIntervalCheck();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                processVisibleEmails();
            }
        });
        chrome.runtime.onMessage.addListener(handleMessage);
    }

    function loadPinnedEmailsContent() {
        chrome.storage.local.get(['pinnedEmails'], function(result) {
            pinnedEmails = result.pinnedEmails || [];
            console.log('Loaded pinned emails:', pinnedEmails.length);
            setTimeout(() => processVisibleEmails(), 1000);
        });
    }

    function savePinnedEmailsContent() {
        chrome.storage.local.set({ pinnedEmails: pinnedEmails });
    }

    function handleMessage(request, sender, sendResponse) {
        if (request.action === "emailUnpinned") {
            unpinEmailById(request.emailId);
            sendResponse({status: "done"});
        } else if (request.action === "updateRequested") {
            processVisibleEmails();
            sendResponse({status: "done"});
        }
    }

    function findVisibleEmailRows() {
        const selectors = [
            'tr.zA',
            'tr[class*="zA"]',
            'div[role="main"] tr[role="row"]',
            'div[gh="tl"] div[role="listitem"]'
        ];
        let rows = [];
        for (const sel of selectors) {
            const elements = document.querySelectorAll(sel);
            if (elements.length > 0) {
                elements.forEach(el => {
                    if (el.offsetParent !== null) {
                        rows.push(el);
                    }
                });
                break;
            }
        }
        return rows;
    }

    function processVisibleEmails() {
        if (isProcessing) return;
        isProcessing = true;
        try {
            const rows = findVisibleEmailRows();
            const newProcessed = new Set();
            rows.forEach(row => {
                let emailId = row.getAttribute('data-pin-email-id');
                if (!emailId) {
                    emailId = generateEmailId(row);
                    row.setAttribute('data-pin-email-id', emailId);
                }
                if (processedEmails.has(emailId) && row.querySelector('.gmail-pin-button')) {
                    newProcessed.add(emailId);
                    return;
                }
                if (!row.querySelector('.gmail-pin-button')) {
                    addPinButton(row, emailId);
                }
                updatePinButton(row);
                updateEmailHighlight(row);
                newProcessed.add(emailId);
            });
            processedEmails = newProcessed;
        } catch (e) {
            console.error('Error processing emails:', e);
        } finally {
            isProcessing = false;
        }
    }

    function generateEmailId(row) {
        let id = row.getAttribute('data-message-id') || row.getAttribute('data-legacy-message-id');
        if (id) return id;
        const text = row.textContent || '';
        const subjectElement = row.querySelector('.bog') || row.querySelector('[data-tooltip]');
        const subject = subjectElement ? subjectElement.textContent : '';
        const hash = text.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
        return `email-${subject}-${hash}`;
    }

    function addPinButton(row, emailId) {
        try {
            const target = row.querySelector('td:first-child') || row.querySelector('div:first-child') || row;
            const btn = document.createElement('div');
            btn.className = 'gmail-pin-button';
            btn.setAttribute('data-email-id', emailId);
            btn.setAttribute('title', 'Pin this email');
            updatePinButtonState(btn, emailId);
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                const wasPinned = btn.classList.contains('pinned');
                if (wasPinned) {
                    btn.classList.remove('pinned');
                    row.classList.remove('pinned-email');
                } else {
                    btn.classList.add('pinned');
                    row.classList.add('pinned-email');
                }
                setTimeout(() => togglePinEmail(row, emailId), 50);
            });
            if (target.firstChild) {
                target.insertBefore(btn, target.firstChild);
            } else {
                target.appendChild(btn);
            }
        } catch (e) {
            console.error('Error adding pin button:', e);
        }
    }

    function updatePinButtonState(btn, emailId) {
        const pinned = pinnedEmails.some(e => e.id === emailId);
        if (pinned) {
            btn.classList.add('pinned');
        } else {
            btn.classList.remove('pinned');
        }
    }

    function updatePinButton(row) {
        const emailId = row.getAttribute('data-pin-email-id');
        const btn = row.querySelector('.gmail-pin-button');
        if (btn && emailId) {
            updatePinButtonState(btn, emailId);
        }
    }

    function updateEmailHighlight(row) {
        const emailId = row.getAttribute('data-pin-email-id');
        if (!emailId) return;
        const pinned = pinnedEmails.some(e => e.id === emailId);
        if (pinned && !row.classList.contains('pinned-email')) {
            row.classList.add('pinned-email');
        } else if (!pinned && row.classList.contains('pinned-email')) {
            row.classList.remove('pinned-email');
        }
    }

    function togglePinEmail(row, emailId) {
        const index = pinnedEmails.findIndex(e => e.id === emailId);
        if (index >= 0) {
            pinnedEmails.splice(index, 1);
        } else {
            if (pinnedEmails.length >= MAX_PINS) {
                const btn = row.querySelector('.gmail-pin-button');
                if (btn) btn.classList.remove('pinned');
                row.classList.remove('pinned-email');
                alert(`You can only pin up to ${MAX_PINS} emails.`);
                return;
            }
            const subjectElement = row.querySelector('.bog') || row.querySelector('[data-tooltip]');
            const subject = subjectElement ? subjectElement.textContent : 'No subject';
            const senderElement = row.querySelector('.yW') || row.querySelector('.zF');
            const sender = senderElement ? senderElement.textContent : 'Unknown sender';
            pinnedEmails.unshift({
                id: emailId,
                subject: subject,
                sender: sender,
                timestamp: Date.now()
            });
            moveToTop(row);
        }
        savePinnedEmailsContent();
        chrome.runtime.sendMessage({action: "updatePopup"});
    }

    function unpinEmailById(emailId) {
        const index = pinnedEmails.findIndex(e => e.id === emailId);
        if (index >= 0) {
            pinnedEmails.splice(index, 1);
            savePinnedEmailsContent();
            const rows = findVisibleEmailRows();
            const row = rows.find(r => r.getAttribute('data-pin-email-id') === emailId);
            if (row) {
                const btn = row.querySelector('.gmail-pin-button');
                if (btn) btn.classList.remove('pinned');
                row.classList.remove('pinned-email');
                processedEmails.delete(emailId);
            }
            chrome.runtime.sendMessage({action: "updatePopup"});
        }
    }

    function moveToTop(row) {
        const container = findEmailContainer();
        if (!container || !row.parentNode) return;
        try {
            if (row.parentNode === container) {
                container.insertBefore(row, container.firstChild);
            }
        } catch (e) {
            console.error('Error moving email to top:', e);
        }
    }

    function findEmailContainer() {
        const selectors = [
            'div[gh="tl"]',
            'div[role="main"]',
            'table[role="grid"]',
            'tbody'
        ];
        for (const sel of selectors) {
            const container = document.querySelector(sel);
            if (container && container.children.length > 3) {
                return container;
            }
        }
        return null;
    }

    function startObserver() {
        let timeout = null;
        const observer = new MutationObserver(mutations => {
            let shouldProcess = mutations.some(m => m.addedNodes.length > 0);
            if (shouldProcess) {
                clearTimeout(timeout);
                timeout = setTimeout(processVisibleEmails, 500);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function startIntervalCheck() {
        setInterval(processVisibleEmails, CHECK_INTERVAL);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initContent);
    } else {
        setTimeout(initContent, 2000);
    }
})();
