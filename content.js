// Gmail Pin Extension - Content Script
(function() {
    'use strict';
    
    // Configuration
    const MAX_PINS = 5;
    const CHECK_INTERVAL = 1000;
    
    // Add custom styles
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        .gmail-pin-button {
            display: inline-block;
            width: 22px;
            height: 22px;
            margin-right: 10px;
            cursor: pointer;
            border-radius: 50%;
            text-align: center;
            line-height: 22px;
            font-size: 13px;
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
            unpinEmailById(emailId);
            return true;
        }
        if (request.action === "updateRequested") {
            processEmails();
            return true;
        }
    }

    // Find all email rows in Gmail (only actual email rows, not content)
    function findEmailRows() {
        // Specific selectors for Gmail's email rows only
        const selectors = [
            'tr.zA', // Primary Gmail email row selector
            'tr[class*="zA"]', // Variants
            'div[role="main"] tr[role="row"]', // Rows with role="row"
            'div[gh="tl"] div[role="listitem"]', // List items in thread list
            'div[data-tooltip][data-tooltip*="Subject:"]', // Elements with subject tooltips
        ];
        
        let rows = [];
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                elements.forEach(el => {
                    // Only add elements that are definitely email rows
                    if (isDefinitelyEmailRow(el) && !el.querySelector('.gmail-pin-button')) {
                        rows.push(el);
                    }
                });
                if (rows.length > 0) break;
            }
        }
        
        return rows;
    }

    // Strict check if element is definitely an email row
    function isDefinitelyEmailRow(element) {
        // Check for Gmail-specific classes and attributes
        const hasGmailClass = element.classList.contains('zA') || 
                             Array.from(element.classList).some(cls => cls.startsWith('zA'));
        
        const hasCheckbox = element.querySelector('input[type="checkbox"]') || 
                           element.querySelector('[role="checkbox"]');
        
        const hasStar = element.querySelector('[aria-label*="Star"]') || 
                       element.querySelector('[title*="Star"]');
        
        const isInThreadList = element.closest('div[gh="tl"]') !== null;
        
        // Must be in thread list AND have either checkbox or star
        return isInThreadList && (hasCheckbox || hasStar || hasGmailClass);
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
                
                // Remove any existing pin buttons first
                removeExistingPinButtons(row);
                
                // Add pin button
                addPinButton(row, emailId);
                
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

    // Remove any existing pin buttons
    function removeExistingPinButtons(row) {
        const existingPins = row.querySelectorAll('.gmail-pin-button');
        existingPins.forEach(pin => pin.remove());
    }

    // Generate a unique ID for an email
    function generateEmailId(row) {
        // Create ID based on timestamp and content hash
        const text = row.textContent || '';
        const hash = text.length > 0 ? text.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0) : 0;
        
        return `email-${hash}-${Date.now()}`;
    }

    // Add pin button to email row
    function addPinButton(row, emailId) {
        try {
            // Find the checkbox area - this is where Gmail puts its checkboxes
            const checkboxArea = row.querySelector('td:first-child') || 
                               row.querySelector('div[role="gridcell"]:first-child') ||
                               row.querySelector('.oZ-jc') || // Gmail's checkbox container
                               row.querySelector('.T-Jo') || // Another Gmail checkbox selector
                               row.querySelector('div:first-child');
            
            // Only add if we found a proper container
            if (checkboxArea && isCheckboxArea(checkboxArea)) {
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
                
                // Insert at the beginning of checkbox area
                if (checkboxArea.firstChild) {
                    checkboxArea.insertBefore(pinButton, checkboxArea.firstChild);
                } else {
                    checkboxArea.appendChild(pinButton);
                }
            }
        } catch (error) {
            console.error('Gmail Pin Extension: Error adding pin button', error);
        }
    }

    // Check if element is a checkbox area (not email content)
    function isCheckboxArea(element) {
        // Checkbox areas are usually small and contain checkboxes
        const hasCheckbox = element.querySelector('input[type="checkbox"]') !== null;
        const isSmall = element.textContent.length < 10; // Checkbox areas have little text
        const hasGmailCheckboxClass = element.classList.contains('oZ-jc') || 
                                     element.classList.contains('T-Jo');
        
        return hasCheckbox || isSmall || hasGmailCheckboxClass;
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
            // Force the highlight to stay
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
                                 row.querySelector('[data-tooltip]');
            const subject = subjectElement ? subjectElement.textContent : 'No subject';
            
            const senderElement = row.querySelector('.yW') || 
                                row.querySelector('.zF');
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
        }
        
        // Save and reorder
        savePinnedEmails();
        reorderPinnedEmails();
        
        // Notify popup
        chrome.runtime.sendMessage({action: "updatePopup"});
    }

    // Unpin email by ID
    function unpinEmailById(emailId) {
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
            
            // Get the container that holds all emails
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
            'div[gh="tl"]', // Gmail thread list
            'div[role="main"]', // Main content area
            'table[role="grid"]', // Email grid
            'tbody' // Table body
        ];
        
        for (const selector of selectors) {
            const container = document.querySelector(selector);
            if (container && container.children.length > 3) {
                return container;
            }
        }
        
        return null;
    }

    // Start MutationObserver to detect new emails
    function startObserver() {
        const observer = new MutationObserver(function(mutations) {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    setTimeout(processEmails, 500);
                    break;
                }
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
        // Wait for Gmail to load completely
        setTimeout(init, 3000);
    }
})();