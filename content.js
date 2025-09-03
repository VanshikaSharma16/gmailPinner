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

    // Load pinned emails
    function loadPinnedEmails() {
        chrome.storage.local.get(['pinnedEmails'], function(result) {
            pinnedEmails = result.pinnedEmails || [];
            processEmails();
        });
    }

    // Save pinned emails
    function savePinnedEmails() {
        chrome.storage.local.set({pinnedEmails: pinnedEmails});
    }

    // Handle messages
    function handleMessage(request, sender, sendResponse) {
        if (request.action === "emailUnpinned") {
            unpinEmailById(request.emailId);
            return true;
        }
        if (request.action === "updateRequested") {
            processEmails();
            return true;
        }
    }

    // Find email rows
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

    // Process all emails
    function processEmails() {
        const emailRows = findEmailRows();
        
        emailRows.forEach(row => {
            // Skip if already processed
            if (row.hasAttribute('data-pin-processed')) {
                updatePinIcon(row);
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
        });
        
        // Reorder pinned emails to top
        reorderPinnedEmails();
    }

    // Generate email ID
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
        
        // Force the row to have proper layout
        if (!row.classList.contains('email-row-with-pin')) {
            row.classList.add('email-row-with-pin');
        }
    }

    // Update pin icon state
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

    // Toggle email pin state
    function togglePinEmail(row, emailId) {
        const index = pinnedEmails.findIndex(email => email.id === emailId);
        
        if (index >= 0) {
            // Unpin the email
            pinnedEmails.splice(index, 1);
        } else {
            // Pin the email (if under limit)
            if (pinnedEmails.length >= MAX_PINS) {
                alert(`You can only pin up to ${MAX_PINS} emails. Unpin one first to pin this email.`);
                return;
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
        processEmails();
        
        // Notify popup
        chrome.runtime.sendMessage({action: "updatePopup"});
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

    // Reorder emails to put pinned ones at the top
    function reorderPinnedEmails() {
        const emailRows = findEmailRows();
        const pinnedIds = pinnedEmails.map(email => email.id);
        
        // Get the container that holds all emails
        const container = document.querySelector('div[role="main"]') || 
                         document.querySelector('div[gh="tl"]') || 
                         document.body;
        
        if (!container) return;
        
        // Collect pinned rows
        const pinnedRows = emailRows.filter(row => {
            const emailId = row.getAttribute('data-email-id');
            return pinnedIds.includes(emailId);
        });
        
        // Move pinned rows to top
        pinnedRows.forEach(row => {
            const wrapper = row.closest('.email-row-container') || row.parentElement;
            container.insertBefore(wrapper, container.firstChild);
        });
    }

    // Start MutationObserver
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