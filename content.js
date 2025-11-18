(function() {
    'use strict';

    const MAX_PINS = 5;
    const CHECK_INTERVAL = 2000;
    const DEBOUNCE_DELAY = 300;

    let pinnedEmails = [];
    let isProcessing = false;
    let reorderTimeout = null;

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
            flex-shrink: 0;
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
    `;
    document.head.appendChild(style);

    function initContent() {
        loadPinnedEmailsContent();
        startObserver();
        startIntervalCheck();
        chrome.runtime.onMessage.addListener(handleMessage);
    }

    function loadPinnedEmailsContent() {
        chrome.storage.local.get(['pinnedEmails'], (result) => {
            pinnedEmails = result.pinnedEmails || [];
            
            setTimeout(() => {
                processVisibleEmails();
                reorderPinnedEmails();
            }, 1500);
        });
    }

    function savePinnedEmailsContent() {
        chrome.storage.local.set({ pinnedEmails: pinnedEmails });
    }

    function handleMessage(request, sender, sendResponse) {
        if (request.action === "emailUnpinned") {
            unpinEmailById(request.emailId);
            sendResponse({status: "done"});
            return true;
        } else if (request.action === "updateRequested") {
            processVisibleEmails();
            sendResponse({status: "done"});
            return true;
        } else if (request.action === "navigateToEmail") {
            navigateToEmailById(request.emailId);
            sendResponse({status: "done"});
            return true;
        }
        return false;
    }

    function findVisibleEmailRows() {
        const selectors = ['tr.zA', 'tr[class*="zA"]'];
        for (const sel of selectors) {
            const elements = document.querySelectorAll(sel);
            if (elements.length > 0) {
                return Array.from(elements).filter(el => el.offsetParent !== null);
            }
        }
        return [];
    }

    function generateUniqueEmailId(row) {
        // Try Gmail's native IDs first (most reliable)
        let id = row.getAttribute('data-message-id') || 
                 row.getAttribute('data-legacy-message-id') ||
                 row.getAttribute('data-thread-id');
        
        if (id) {
            row.setAttribute('data-pin-email-id', id);
            return id;
        }
        
        // Generate unique ID from multiple sources
        const subjectElement = row.querySelector('.bog') || row.querySelector('[data-tooltip]');
        const subject = subjectElement ? subjectElement.textContent.trim() : '';
        const senderElement = row.querySelector('.yW') || row.querySelector('.zF');
        const sender = senderElement ? senderElement.textContent.trim() : '';
        
        // Get date/time info for uniqueness
        const dateElement = row.querySelector('.bqe') || row.querySelector('[title*=":"]');
        const dateStr = dateElement ? dateElement.textContent.trim() : '';
        
        // Create a unique hash from all available data
        const uniqueData = `${subject}|${sender}|${dateStr}|${row.textContent.substring(0, 100)}`;
        const hash = uniqueData.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
        
        // Include row position for extra uniqueness
        const rowIndex = Array.from(row.parentNode?.children || []).indexOf(row);
        id = `email-${hash}-${rowIndex}-${Date.now()}`;
        
        row.setAttribute('data-pin-email-id', id);
        return id;
    }

    function getEmailId(row) {
        let id = row.getAttribute('data-pin-email-id');
        if (id) return id;
        return generateUniqueEmailId(row);
    }

    function findPinnedEmailMatch(row) {
        // Only match by content if we have a stored pinned email
        // This should only be used on reload, not during normal operation
        const subjectElement = row.querySelector('.bog') || row.querySelector('[data-tooltip]');
        const subject = subjectElement ? subjectElement.textContent.trim() : '';
        const senderElement = row.querySelector('.yW') || row.querySelector('.zF');
        const sender = senderElement ? senderElement.textContent.trim() : '';
        
        if (!subject && !sender) return null;
        
        // Find exact match by subject AND sender
        return pinnedEmails.find(e => 
            e.subject && e.sender && 
            e.subject.trim() === subject && 
            e.sender.trim() === sender
        );
    }

    function isEmailPinned(emailId) {
        return pinnedEmails.some(e => e.id === emailId);
    }

    function processVisibleEmails() {
        if (isProcessing) return;
        isProcessing = true;
        
        try {
            const rows = findVisibleEmailRows();
            rows.forEach(row => {
                try {
                    let emailId = getEmailId(row);
                    
                    // Only try content matching on reload if email doesn't have an ID match
                    // This prevents multiple emails from getting the same ID
                    if (!isEmailPinned(emailId) && pinnedEmails.length > 0) {
                        // Check if this row already has a button with a different ID
                        const existingBtn = row.querySelector('.gmail-pin-button');
                        if (existingBtn) {
                            const existingId = existingBtn.getAttribute('data-email-id');
                            if (existingId && existingId !== emailId) {
                                // Use the existing ID if it's pinned
                                if (isEmailPinned(existingId)) {
                                    emailId = existingId;
                                    row.setAttribute('data-pin-email-id', emailId);
                                }
                            }
                        } else {
                            // Only match by content if no button exists (first time seeing this row)
                            const match = findPinnedEmailMatch(row);
                            if (match && !row.querySelector('.gmail-pin-button')) {
                                emailId = match.id;
                                row.setAttribute('data-pin-email-id', emailId);
                            }
                        }
                    }
                    
                    // Ensure button exists
                    if (!row.querySelector('.gmail-pin-button')) {
                        addPinButton(row, emailId);
                    } else {
                        // Update button's email ID if it changed
                        const btn = row.querySelector('.gmail-pin-button');
                        const btnId = btn.getAttribute('data-email-id');
                        if (btnId !== emailId) {
                            btn.setAttribute('data-email-id', emailId);
                        }
                    }
                    
                    // Sync button state and highlight
                    syncEmailState(row, emailId);
                } catch (e) {
                    console.error('Error processing email row:', e);
                }
            });
        } catch (e) {
            console.error('Error processing emails:', e);
        } finally {
            isProcessing = false;
        }
    }

    function syncEmailState(row, emailId) {
        const pinned = isEmailPinned(emailId);
        const btn = row.querySelector('.gmail-pin-button');
        
        if (btn) {
            if (pinned) {
                btn.classList.add('pinned');
                btn.setAttribute('title', 'Unpin this email');
            } else {
                btn.classList.remove('pinned');
                btn.setAttribute('title', 'Pin this email');
            }
        }
        
        if (pinned) {
            row.style.backgroundColor = '#fce8e6';
            row.style.borderLeft = '3px solid #ea4335';
        } else {
            row.style.backgroundColor = '';
            row.style.borderLeft = '';
        }
    }

    function addPinButton(row, emailId) {
        if (row.querySelector('.gmail-pin-button')) return;
        
        try {
            const target = row.querySelector('td:first-child') || row.querySelector('div:first-child');
            if (!target) return;
            
            const btn = document.createElement('div');
            btn.className = 'gmail-pin-button';
            btn.setAttribute('data-email-id', emailId);
            btn.setAttribute('role', 'button');
            
            let isClicking = false;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                e.stopImmediatePropagation();
                
                if (isClicking) return;
                isClicking = true;
                
                // Get the current email ID from the row (not the button)
                const currentEmailId = row.getAttribute('data-pin-email-id') || emailId;
                togglePinEmail(row, currentEmailId);
                
                setTimeout(() => {
                    isClicking = false;
                }, 500);
            }, true);
            
            btn.addEventListener('mousedown', (e) => e.stopPropagation(), true);
            
            if (target.firstChild) {
                target.insertBefore(btn, target.firstChild);
            } else {
                target.appendChild(btn);
            }
            
            syncEmailState(row, emailId);
        } catch (e) {
            console.error('Error adding pin button:', e);
        }
    }

    function findEmailContainer() {
        const rows = findVisibleEmailRows();
        if (rows.length === 0) return null;
        
        let container = rows[0].parentNode;
        let depth = 0;
        
        while (container && container !== document.body && depth < 10) {
            if (container.tagName?.toLowerCase() === 'tbody') {
                return container;
            }
            
            const children = Array.from(container.children || []);
            const emailCount = children.filter(c => 
                c.getAttribute('data-pin-email-id') || 
                c.querySelector('.gmail-pin-button') || 
                c.classList.contains('zA')
            ).length;
            
            if (emailCount > 1) return container;
            
            container = container.parentNode;
            depth++;
        }
        
        return rows[0].parentNode;
    }

    function moveUnpinnedEmailToOriginalPosition(row) {
        const container = findEmailContainer();
        if (!container || row.parentNode !== container) return;
        
        try {
            const allRows = Array.from(container.children);
            const pinnedRows = allRows.filter(r => {
                if (r === row) return false;
                const rId = r.getAttribute('data-pin-email-id');
                return rId && isEmailPinned(rId);
            });
            
            if (pinnedRows.length > 0) {
                pinnedRows.sort((a, b) => {
                    const idA = a.getAttribute('data-pin-email-id');
                    const idB = b.getAttribute('data-pin-email-id');
                    return pinnedEmails.findIndex(e => e.id === idA) - 
                           pinnedEmails.findIndex(e => e.id === idB);
                });
                
                const lastPinned = pinnedRows[pinnedRows.length - 1];
                if (lastPinned.nextSibling) {
                    container.insertBefore(row, lastPinned.nextSibling);
                } else {
                    container.appendChild(row);
                }
            }
        } catch (e) {
            console.error('Error moving unpinned email:', e);
        }
    }

    function togglePinEmail(row, emailId) {
        if (!row || !emailId) return;
        
        // Make sure we're using the correct email ID from the row
        const actualEmailId = row.getAttribute('data-pin-email-id') || emailId;
        
        const index = pinnedEmails.findIndex(e => e.id === actualEmailId);
        
        if (index >= 0) {
            // Unpinning - only this specific email
            pinnedEmails.splice(index, 1);
            savePinnedEmailsContent();
            syncEmailState(row, actualEmailId);
            setTimeout(() => moveUnpinnedEmailToOriginalPosition(row), 100);
        } else {
            // Pinning - only this specific email
            if (pinnedEmails.length >= MAX_PINS) {
                alert(`You can only pin up to ${MAX_PINS} emails.`);
                return;
            }
            
            const subjectElement = row.querySelector('.bog') || row.querySelector('[data-tooltip]');
            const subject = subjectElement ? subjectElement.textContent.trim() : 'No subject';
            const senderElement = row.querySelector('.yW') || row.querySelector('.zF');
            const sender = senderElement ? senderElement.textContent.trim() : 'Unknown sender';
            
            // Only add this specific email
            pinnedEmails.unshift({
                id: actualEmailId,
                subject: subject,
                sender: sender,
                timestamp: Date.now()
            });
            
            savePinnedEmailsContent();
            syncEmailState(row, actualEmailId);
            reorderPinnedEmails();
        }
        
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
                syncEmailState(row, emailId);
                setTimeout(() => moveUnpinnedEmailToOriginalPosition(row), 100);
            }
            
            reorderPinnedEmails();
            chrome.runtime.sendMessage({action: "updatePopup"});
        }
    }

    function navigateToEmailById(emailId) {
        const rows = findVisibleEmailRows();
        const row = rows.find(r => r.getAttribute('data-pin-email-id') === emailId);
        if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const originalBg = row.style.backgroundColor;
            row.style.backgroundColor = '#fff3cd';
            setTimeout(() => {
                row.style.backgroundColor = originalBg || '';
            }, 2000);
        }
    }

    function reorderPinnedEmails() {
        if (pinnedEmails.length === 0) return;
        
        clearTimeout(reorderTimeout);
        reorderTimeout = setTimeout(performReorder, DEBOUNCE_DELAY);
    }

    function performReorder() {
        const container = findEmailContainer();
        if (!container) return;
        
        try {
            const allRows = Array.from(container.children);
            const emailRows = allRows.filter(row => 
                row.getAttribute('data-pin-email-id') || 
                row.querySelector('.gmail-pin-button') ||
                row.classList.contains('zA')
            );
            
            if (emailRows.length === 0) return;
            
            // Only get rows that are actually pinned (by exact ID match)
            const pinnedRows = emailRows.filter(row => {
                const emailId = row.getAttribute('data-pin-email-id');
                return emailId && isEmailPinned(emailId);
            });
            
            if (pinnedRows.length === 0) return;
            
            // Sort by pin order
            pinnedRows.sort((a, b) => {
                const idA = a.getAttribute('data-pin-email-id');
                const idB = b.getAttribute('data-pin-email-id');
                const indexA = pinnedEmails.findIndex(e => e.id === idA);
                const indexB = pinnedEmails.findIndex(e => e.id === idB);
                return indexA - indexB;
            });
            
            // Move only pinned rows to top
            for (let i = pinnedRows.length - 1; i >= 0; i--) {
                const pinnedRow = pinnedRows[i];
                if (pinnedRow.parentNode !== container) continue;
                
                let insertBefore = null;
                
                // Find first non-pinned row
                for (const child of allRows) {
                    if (child === pinnedRow) continue;
                    
                    const childId = child.getAttribute('data-pin-email-id');
                    const childPinned = childId && isEmailPinned(childId);
                    
                    if (!childPinned) {
                        insertBefore = child;
                        break;
                    } else {
                        // If it's a pinned row, check order
                        const childIndex = pinnedEmails.findIndex(e => e.id === childId);
                        const currentIndex = pinnedEmails.findIndex(e => e.id === pinnedRow.getAttribute('data-pin-email-id'));
                        if (childIndex > currentIndex) {
                            insertBefore = child;
                            break;
                        }
                    }
                }
                
                if (insertBefore && insertBefore !== pinnedRow && insertBefore.parentNode === container) {
                    container.insertBefore(pinnedRow, insertBefore);
                } else if (container.firstChild !== pinnedRow) {
                    container.insertBefore(pinnedRow, container.firstChild);
                }
            }
        } catch (e) {
            console.error('Error reordering pinned emails:', e);
        }
    }

    function startObserver() {
        let timeout = null;
        const observer = new MutationObserver(() => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                processVisibleEmails();
                if (pinnedEmails.length > 0) {
                    reorderPinnedEmails();
                }
            }, DEBOUNCE_DELAY);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function startIntervalCheck() {
        setInterval(() => {
            if (pinnedEmails.length > 0) {
                processVisibleEmails();
                reorderPinnedEmails();
            }
        }, CHECK_INTERVAL);
        
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && pinnedEmails.length > 0) {
                setTimeout(() => {
                    processVisibleEmails();
                    reorderPinnedEmails();
                }, 500);
            }
        });
    }

    function waitForGmail() {
        if (document.body && (document.querySelector('div[gh="tl"]') || document.querySelector('div[role="main"]'))) {
            initContent();
            
            let lastUrl = location.href;
            setInterval(() => {
                if (location.href !== lastUrl) {
                    lastUrl = location.href;
                    setTimeout(() => {
                        if (pinnedEmails.length > 0) {
                            processVisibleEmails();
                            reorderPinnedEmails();
                        }
                    }, 1000);
                }
            }, 1000);
        } else {
            setTimeout(waitForGmail, 500);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(waitForGmail, 1000);
        });
    } else {
        setTimeout(waitForGmail, 1000);
    }
})();
