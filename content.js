// Gmail Pin Extension - Content Script
(function() {
    'use strict';
    
    // Configuration
    const MAX_PINS = 5;
    const CHECK_INTERVAL = 1500;
    
    // Add custom styles
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        .gmail-pin-button {
            display: inline-block;
            width: 24px;
            height: 24px;
            margin-right: 12px;
            cursor: pointer;
            border-radius: 50%;
            text-align: center;
            line-height: 24px;
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
        
        /* Make pin button more visible */
        .gmail-pin-button {
            opacity: 1 !important;
            visibility: visible !important;
            pointer-events: auto !important;
        }
    `;
    document.head.appendChild(styleElement);

    // State
    let pinnedEmails = [];
    let isProcessing = false;

    // Initialize
    function init() {
        console.log('Gmail Pin Extension: Initializing');
        loadPinnedEmails();
        startObserver();
        startIntervalCheck();
        
        // Listen for messages
        chrome.runtime.onMessage.addListener(handleMessage);
    }

    // Load pinned emails from storage
    function loadPinnedEmails() {
        chrome.storage.local.get(['pinnedEmails'], function(result) {
            pinnedEmails = result.pinnedEmails || [];
            console.log('Gmail Pin Extension: Loaded', pinnedEmails.length, 'pinned emails');
            processEmails();
        });
    }

    // Save pinned emails to storage
    function savePinnedEmails() {
        chrome.storage.local.set({pinnedEmails: pinnedEmails});
    }

    // Handle messages from popup
    function handleMessage(request, sender, sendResponse) {
        if (request.action === "emailUnpinned") {
            const emailId = request.emailId;
            console.log('Gmail Pin Extension: Unpinning email from popup', emailId);
            unpinEmailById(emailId, true);
            return true;
        }
        if (request.action === "updateRequested") {
            processEmails();
            return true;
        }
    }

    // Find all email rows in Gmail
    function findEmailRows() {
        // Try multiple selectors for different Gmail layouts
        const selectors = [
            'tr.zA', 
            'tr[class*="zA"]', 
            'div[role="main"] tr[role="row"]',
            'div[gh="tl"] div[role="listitem"]',
            'div[data-tooltip][data-tooltip*="Subject:"]',
            // More specific selectors
            'div[gh="tl"] > div > div > div',
            'div[role="main"] > div > div > div > div'
        ];
        
        let rows = [];
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                elements.forEach(el => {
                    // Check if this looks like an email row (not too tall, has certain classes)
                    const style = window.getComputedStyle(el);
                    const height = parseInt(style.height) || 0;
                    
                    if (height > 40 && height < 120 && !el.querySelector('.gmail-pin-button')) {
                        rows.push(el);
                    }
                });
                if (rows.length > 0) break;
            }
        }
        
        return rows;
    }

    // Process all emails and add pin buttons
    function processEmails() {
        if (isProcessing) return;
        isProcessing = true;
        
        try {
            const emailRows = findEmailRows();
            console.log('Gmail Pin Extension: Found', emailRows.length, 'email rows');
            
            emailRows.forEach(row => {
                // Get or create email ID
                let emailId = row.getAttribute('data-email-id');
                if (!emailId) {
                    emailId = generateEmailId(row);
                    row.setAttribute('data-email-id', emailId);
                }
                
                // Add pin button if not exists
                if (!row.querySelector('.gmail-pin-button')) {
                    addPinButton(row, emailId);
                }
                
                // Update pin button and highlight
                updatePinButton(row);
                updateEmailHighlight(row);
            });
            
            // Reorder pinned emails to top
            reorderPinnedEmails();
        } catch (error) {
            console.error('Gmail Pin Extension: Error processing emails', error);
        } finally {
            isProcessing = false;
        }
    }

    // Generate a unique ID for an email
    function generateEmailId(row) {
        // Create ID based on content and timestamp
        const text = row.textContent || '';
        const shortText = text.length > 50 ? text.substring(0, 50) : text;
        return `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // Add pin button to email row
    function addPinButton(row, emailId) {
        try {
            // Try to find the best place to put the pin button
            const possibleContainers = [
                row.querySelector('td:first-child'),
                row.querySelector('div:first-child'),
                row.querySelector('[role="gridcell"]:first-child'),
                row
            ];
            
            let targetElement = null;
            for (const element of possibleContainers) {
                if (element && element.offsetParent !== null) {
                    targetElement = element;
                    break;
                }
            }
            
            if (!targetElement) return;
            
            // Create pin button
            const pinButton = document.createElement('div');
            pinButton.className = 'gmail-pin-button';
            pinButton.setAttribute('data-email-id', emailId);
            pinButton.setAttribute('title', 'Pin this email');
            
            // Set initial state
            updatePinButtonState(pinButton, emailId);
            
            // Add click handler
            pinButton.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                togglePinEmail(row, emailId);
            });
            
            // Insert at the beginning
            if (targetElement.firstChild) {
                targetElement.insertBefore(pinButton, targetElement.firstChild);
            } else {
                targetElement.appendChild(pinButton);
            }
        } catch (error) {
            console.error('Gmail Pin Extension: Error adding pin button', error);
        }
    }

    // Update pin button visual state
    function updatePinButtonState(pinButton, emailId) {
        const isPinned = pinnedEmails.some(email => email.id === emailId);
        if (isPinned) {
            pinButton.classList.add('pinned');
        } else {
            pinButton.classList.remove('pinned');
        }
    }

    // Update pin button
    function updatePinButton(row) {
        const emailId = row.getAttribute('data-email-id');
        const pinButton = row.querySelector('.gmail-pin-button');
        if (pinButton) {
            updatePinButtonState(pinButton, emailId);
        }
    }

    // Update email highlight based on pin status
    function updateEmailHighlight(row) {
        const emailId = row.getAttribute('data-email-id');
        const isPinned = pinnedEmails.some(email => email.id === emailId);
        
        if (isPinned) {
            row.classList.add('pinned-email');
            row.style.backgroundColor = '#fce8e6';
            row.style.borderLeft = '3px solid #ea4335';
        } else {
            row.classList.remove('pinned-email');
            row.style.backgroundColor = '';
            row.style.borderLeft = '';
        }
    }

    // Toggle email pin state
    function togglePinEmail(row, emailId) {
        const index = pinnedEmails.findIndex(email => email.id === emailId);
        
        if (index >= 0) {
            // Unpin the email
            pinnedEmails.splice(index, 1);
            console.log('Email unpinned:', emailId);
            
            // Update UI immediately
            updatePinButton(row);
            updateEmailHighlight(row);
        } else {
            // Pin the email (if under limit)
            if (pinnedEmails.length >= MAX_PINS) {
                alert(`You can only pin up to ${MAX_PINS} emails. Unpin one first to pin this email.`);
                return;
            }
            
            // Get email details
            const subjectElement = row.querySelector('.bog') || 
                                 row.querySelector('[data-tooltip]') ||
                                 row.querySelector('[aria-label]');
            const subject = subjectElement ? subjectElement.textContent : 'No subject';
            
            const senderElement = row.querySelector('.yW') || 
                                row.querySelector('.zF') ||
                                row.querySelector('[email]');
            const sender = senderElement ? senderElement.textContent : 'Unknown sender';
            
            pinnedEmails.unshift({
                id: emailId,
                subject: subject,
                sender: sender,
                timestamp: Date.now()
            });
            console.log('Email pinned:', emailId);
            
            // Update UI immediately
            updatePinButton(row);
            updateEmailHighlight(row);
            
            // Move to top immediately
            moveToTop(row);
        }
        
        // Save and notify
        savePinnedEmails();
        chrome.runtime.sendMessage({action: "updatePopup"});
    }

    // Move email to top immediately
    function moveToTop(row) {
        const container = findEmailContainer();
        if (!container || !row.parentNode) return;
        
        try {
            // Move to the very top
            if (row.parentNode === container) {
                container.insertBefore(row, container.firstChild);
            } else {
                // If row is wrapped, move the wrapper instead
                const wrapper = row.closest('.email-wrapper') || row.parentElement;
                if (wrapper && wrapper.parentNode === container) {
                    container.insertBefore(wrapper, container.firstChild);
                }
            }
        } catch (error) {
            console.error('Gmail Pin Extension: Error moving email to top', error);
        }
    }

    // Unpin email by ID
    function unpinEmailById(emailId, fromPopup = false) {
        const index = pinnedEmails.findIndex(email => email.id === emailId);
        if (index >= 0) {
            pinnedEmails.splice(index, 1);
            savePinnedEmails();
            
            // Find the email row and update it
            const emailRows = findEmailRows();
            const row = emailRows.find(row => row.getAttribute('data-email-id') === emailId);
            
            if (row) {
                updatePinButton(row);
                updateEmailHighlight(row);
            }
            
            // Re-process emails to ensure UI is updated
            processEmails();
        }
    }

    // Reorder emails to put pinned ones at the top
    function reorderPinnedEmails() {
        try {
            const emailRows = findEmailRows();
            const pinnedIds = pinnedEmails.map(email => email.id);
            
            const container = findEmailContainer();
            if (!container) return;
            
            // Move pinned emails to top
            pinnedEmails.forEach(pinnedEmail => {
                const row = emailRows.find(row => row.getAttribute('data-email-id') === pinnedEmail.id);
                if (row && row.parentNode === container) {
                    container.insertBefore(row, container.firstChild);
                }
            });
        } catch (error) {
            console.error('Gmail Pin Extension: Error reordering emails', error);
        }
    }

    // Find the container that holds all emails
    function findEmailContainer() {
        const selectors = [
            'div[gh="tl"]',
            'div[role="main"]',
            'table[role="grid"]',
            'tbody',
            'div[jscontroller]',
            'div[jsmodel]'
        ];
        
        for (const selector of selectors) {
            const container = document.querySelector(selector);
            if (container && container.children.length > 3) {
                return container;
            }
        }
        
        // Fallback to body if no container found
        return document.body;
    }

    // Start MutationObserver to detect new emails
    function startObserver() {
        const observer = new MutationObserver(function(mutations) {
            let shouldProcess = false;
            
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    shouldProcess = true;
                    break;
                }
            }
            
            if (shouldProcess) {
                setTimeout(processEmails, 300);
            }
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // Start interval check as fallback
    function startIntervalCheck() {
        setInterval(processEmails, CHECK_INTERVAL);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // Wait a bit longer for Gmail to fully load
        setTimeout(init, 4000);
    }
})();