// Gmail Pin Extension - Content Script
(function() {
    'use strict';
    
    // Configuration
    const MAX_PINS = 5;
    const CHECK_INTERVAL = 2000;
    
    // Add custom styles
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        .gmail-pin-container {
            position: absolute;
            left: -30px;
            top: 50%;
            transform: translateY(-50%);
            z-index: 1000;
            width: 24px;
            height: 24px;
        }
        .gmail-pin-icon {
            width: 24px;
            height: 24px;
            cursor: pointer;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            transition: all 0.2s ease;
            background-color: white;
            border: 1px solid #dadce0;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }
        .gmail-pin-icon:hover {
            background-color: #f1f3f4;
            border-color: #9aa0a6;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
        }
        .gmail-pin-icon.pinned {
            background-color: #fce8e6;
            color: #ea4335;
            border-color: #ea4335;
        }
        .email-row-container {
            position: relative;
            margin-left: 38px !important;
        }
        .gmail-pin-icon::before {
            content: "📌";
            font-size: 14px;
            line-height: 1;
        }
        
        /* Force the pin button to be visible and clickable */
        .gmail-pin-icon {
            pointer-events: auto !important;
            visibility: visible !important;
            opacity: 1 !important;
        }
        
        /* Ensure our pin button is above Gmail's native buttons */
        .gmail-pin-container {
            z-index: 1002 !important;
        }
        
        /* Push Gmail's buttons to the right */
        div[role="button"][aria-label*="Select"],
        div[role="button"][aria-label*="Move"],
        div[data-tooltip*="Select"],
        div[data-tooltip*="Move"] {
            margin-left: 28px !important;
        }
        
        /* Make sure our pin is always visible */
        .gmail-pin-icon {
            display: flex !important;
            visibility: visible !important;
            opacity: 1 !important;
            pointer-events: auto !important;
        }
        
        /* Highlight pinned emails */
        .pinned-email-highlight {
            background-color: #fce8e6 !important;
            border-left: 3px solid #ea4335 !important;
        }
        
        /* Make sure pinned emails stay at the top */
        .pinned-email-container {
            order: -1 !important;
        }
    `;
    document.head.appendChild(styleElement);

    // State
    let pinnedEmails = [];
    let observer = null;

    // Initialize
    function init() {
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
            // Sort by timestamp to maintain order
            pinnedEmails.sort((a, b) => a.timestamp - b.timestamp);
            processEmails();
            
            // Reorder pinned emails to top on initial load
            setTimeout(reorderPinnedEmails, 1000);
        });
    }

    // Save pinned emails to storage
    function savePinnedEmails() {
        // Sort by timestamp before saving
        pinnedEmails.sort((a, b) => a.timestamp - b.timestamp);
        chrome.storage.local.set({pinnedEmails: pinnedEmails});
    }

    // Handle messages from popup
    function handleMessage(request, sender, sendResponse) {
        if (request.action === "emailUnpinned") {
            const emailId = request.emailId;
            unpinEmailById(emailId);
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
            'tr[class*="zA"]', 
            'div[role="main"] tr[role="row"]',
            'div[data-message-id]',
            'div[role="listitem"]'
        ];
        
        let rows = [];
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                rows = Array.from(elements);
                break;
            }
        }
        
        return rows;
    }

    // Process all emails and add pin icons
    function processEmails() {
        const emailRows = findEmailRows();
        
        emailRows.forEach(row => {
            // Skip if already processed
            if (row.hasAttribute('data-pin-processed')) {
                updatePinIcon(row);
                updateEmailHighlight(row);
                return;
            }
            
            // Mark as processed
            row.setAttribute('data-pin-processed', 'true');
            
            // Wrap the row for positioning
            if (!row.parentElement.classList.contains('email-row-container')) {
                const wrapper = document.createElement('div');
                wrapper.className = 'email-row-container';
                row.parentNode.insertBefore(wrapper, row);
                wrapper.appendChild(row);
            }
            
            // Get or create email ID
            let emailId = row.getAttribute('data-email-id');
            if (!emailId) {
                emailId = generateEmailId(row);
                row.setAttribute('data-email-id', emailId);
            }
            
            // Add pin icon
            addPinIcon(row, emailId);
            
            // Update highlight based on pin status
            updateEmailHighlight(row);
        });
        
        // Reorder pinned emails to top
        reorderPinnedEmails();
    }

    // Generate a unique ID for an email
    function generateEmailId(row) {
        const subject = row.querySelector('[data-tooltip]')?.textContent || 
                       row.querySelector('[aria-label]')?.getAttribute('aria-label') || 
                       '';
        const sender = row.querySelector('[email]')?.getAttribute('email') || 
                     row.querySelector('[data-hovercard-id]')?.getAttribute('data-hovercard-id') || 
                     '';
        return `email-${subject}-${sender}-${Date.now()}`;
    }

    // Add pin icon to email row
    function addPinIcon(row, emailId) {
        // Remove any existing pin icon first
        const existingPin = row.querySelector('.gmail-pin-icon');
        if (existingPin) {
            existingPin.remove();
        }
        
        // Check if container already exists
        let pinContainer = row.querySelector('.gmail-pin-container');
        if (!pinContainer) {
            // Create pin container
            pinContainer = document.createElement('div');
            pinContainer.className = 'gmail-pin-container';
            row.appendChild(pinContainer);
        } else {
            // Clear existing container
            pinContainer.innerHTML = '';
        }
        
        // Create pin icon
        const pinIcon = document.createElement('div');
        pinIcon.className = 'gmail-pin-icon';
        pinIcon.setAttribute('data-email-id', emailId);
        
        // Set initial state
        updatePinIconState(pinIcon, emailId);
        
        // Add click handler - make sure it's properly bound
        pinIcon.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            e.stopImmediatePropagation();
            togglePinEmail(row, emailId);
            return false;
        });
        
        // Add to container
        pinContainer.appendChild(pinIcon);
    }

    // Update pin icon visual state
    function updatePinIconState(pinIcon, emailId) {
        const isPinned = pinnedEmails.some(email => email.id === emailId);
        if (isPinned) {
            pinIcon.classList.add('pinned');
        } else {
            pinIcon.classList.remove('pinned');
        }
    }

    // Update pin icon
    function updatePinIcon(row) {
        const emailId = row.getAttribute('data-email-id');
        const pinIcon = row.querySelector('.gmail-pin-icon');
        if (pinIcon) {
            updatePinIconState(pinIcon, emailId);
        }
    }

    // Update email highlight based on pin status
    function updateEmailHighlight(row) {
        const emailId = row.getAttribute('data-email-id');
        const isPinned = pinnedEmails.some(email => email.id === emailId);
        
        if (isPinned) {
            row.classList.add('pinned-email-highlight');
            if (row.parentElement) {
                row.parentElement.classList.add('pinned-email-container');
            }
        } else {
            row.classList.remove('pinned-email-highlight');
            if (row.parentElement) {
                row.parentElement.classList.remove('pinned-email-container');
            }
        }
    }

    // Toggle email pin state
    function togglePinEmail(row, emailId) {
        const index = pinnedEmails.findIndex(email => email.id === emailId);
        
        if (index >= 0) {
            // Unpin the email
            pinnedEmails.splice(index, 1);
        } else {
            // Pin the email (if under limit)
            if (pinnedEmails.length >= MAX_PINS) {
                // Remove the oldest pinned email
                const oldestPin = pinnedEmails.shift();
                
                // Find and unpin the oldest email visually
                const oldestRow = findEmailRowById(oldestPin.id);
                if (oldestRow) {
                    updatePinIcon(oldestRow);
                    updateEmailHighlight(oldestRow);
                }
            }
            
            // Get email details
            const subject = row.querySelector('[data-tooltip]')?.textContent || 
                           row.querySelector('[aria-label]')?.getAttribute('aria-label') || 
                           'No subject';
            const sender = row.querySelector('[email]')?.getAttribute('email') || 
                         row.querySelector('[data-hovercard-id]')?.getAttribute('data-hovercard-id') || 
                         'Unknown sender';
            
            pinnedEmails.push({
                id: emailId,
                subject: subject,
                sender: sender,
                timestamp: Date.now()
            });
        }
        
        // Save and update UI
        savePinnedEmails();
        updatePinIcon(row);
        updateEmailHighlight(row);
        reorderPinnedEmails();
        
        // Notify popup
        chrome.runtime.sendMessage({action: "updatePopup"});
    }

    // Find email row by ID
    function findEmailRowById(emailId) {
        const emailRows = findEmailRows();
        return emailRows.find(row => row.getAttribute('data-email-id') === emailId);
    }

    // Unpin email by ID
    function unpinEmailById(emailId) {
        const index = pinnedEmails.findIndex(email => email.id === emailId);
        if (index >= 0) {
            pinnedEmails.splice(index, 1);
            savePinnedEmails();
            processEmails();
        }
    }

    // Reorder emails to put pinned ones at the top in correct order
    function reorderPinnedEmails() {
        const emailRows = findEmailRows();
        const pinnedIds = pinnedEmails.map(email => email.id);
        
        // Get the container that holds all emails
        const emailContainer = findEmailContainer();
        if (!emailContainer) return;
        
        // Collect pinned rows and their containers in the correct order
        const pinnedContainers = [];
        pinnedIds.forEach(emailId => {
            const row = emailRows.find(row => row.getAttribute('data-email-id') === emailId);
            if (row) {
                const container = row.closest('.email-row-container') || row.parentElement;
                pinnedContainers.push(container);
            }
        });
        
        // Move pinned containers to top in correct order
        pinnedContainers.reverse().forEach(container => {
            if (container && container.parentElement === emailContainer) {
                emailContainer.insertBefore(container, emailContainer.firstChild);
            }
        });
    }

    // Find the container that holds all emails
    function findEmailContainer() {
        const selectors = [
            'div[role="main"] > div > div > div:last-child',
            'div[gh="tl"] > div:last-child',
            'div[role="main"] > div:last-child',
            'table[role="grid"]'
        ];
        
        for (const selector of selectors) {
            const container = document.querySelector(selector);
            if (container) {
                return container;
            }
        }
        
        return document.body;
    }

    // Start MutationObserver to detect new emails
    function startObserver() {
        const targetNode = document.querySelector('div[role="main"]') || document.body;
        
        if (targetNode && !observer) {
            observer = new MutationObserver(function(mutations) {
                let shouldProcess = false;
                
                for (const mutation of mutations) {
                    if (mutation.addedNodes.length > 0) {
                        shouldProcess = true;
                        break;
                    }
                }
                
                if (shouldProcess) {
                    setTimeout(processEmails, 500);
                }
            });
            
            observer.observe(targetNode, { childList: true, subtree: true });
        }
    }

    // Start interval check as fallback
    function startIntervalCheck() {
        setInterval(processEmails, CHECK_INTERVAL);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();