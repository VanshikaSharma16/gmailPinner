// DOM changes ko observe karega
const observer = new MutationObserver(function(mutations) {
    addPinButtons();
});

observer.observe(document.body, {childList: true, subtree: true});

// pin button add karne ke liye function
function addPinButtons() {
    const emailRows = document.querySelectorAll('tr.zA, tr.msg, div[role="main"] tr');
    const pinLimit = 5;
    const topPins = 3;

    emailRows.forEach(row => {
        // Skip if this row already has a pin button
        if (row.querySelector('.pin-container')) return;
        
        const emailId = row.getAttribute('data-message-id') || row.id || Math.random().toString(36).substring(2);
        
        // Create pin container outside the email row
        const pinContainer = document.createElement('div');
        pinContainer.className = 'pin-container';
        pinContainer.style.position = 'absolute';
        pinContainer.style.left = '-40px';
        pinContainer.style.top = '50%';
        pinContainer.style.transform = 'translateY(-50%)';
        
        const pinButton = document.createElement('button');
        pinButton.className = 'pin-btn';
        pinButton.innerHTML = '📌';
        pinButton.style.cursor = 'pointer';
        pinButton.style.background = 'none';
        pinButton.style.border = 'none';
        pinButton.style.fontSize = '16px';
        pinButton.style.width = '32px';
        pinButton.style.height = '32px';
        pinButton.style.borderRadius = '50%';
        pinButton.style.display = 'flex';
        pinButton.style.alignItems = 'center';
        pinButton.style.justifyContent = 'center';
        pinButton.title = 'Pin Email';
        
        pinContainer.appendChild(pinButton);
        
        // Position the row relatively so we can position the pin absolutely
        row.style.position = 'relative';
        
        // Insert pin container before the row
        row.parentNode.insertBefore(pinContainer, row);
        
        // Check if this email is already pinned
        chrome.storage.local.get(['pinnedEmails'], function(result) {
            const pinnedEmails = result.pinnedEmails || [];
            if (pinnedEmails.includes(emailId)) {
                pinButton.classList.add('pinned');
                pinButton.style.color = '#1a73e8';
                pinButton.style.backgroundColor = '#e8f0fe';
                row.classList.add('pinned');
                
                // Add to top if it's one of the first 3 pins
                if (pinnedEmails.indexOf(emailId) < topPins) {
                    row.classList.add('pinned-top');
                }
            }
        });

        pinButton.addEventListener('click', async () => {
            const result = await chrome.storage.local.get(['pinnedEmails']);
            const pinnedEmails = result.pinnedEmails || [];

            // If already pinned, unpin it
            if (pinnedEmails.includes(emailId)) {
                const index = pinnedEmails.indexOf(emailId);
                pinnedEmails.splice(index, 1);
                await chrome.storage.local.set({pinnedEmails: pinnedEmails});
                pinButton.classList.remove('pinned');
                pinButton.style.color = '';
                pinButton.style.backgroundColor = '';
                row.classList.remove('pinned', 'pinned-top');
                reorderPinnedEmails(topPins);
                return;
            }

            // Check if pin limit has been reached
            if (pinnedEmails.length >= pinLimit) {
                showCustomPopup("Pin limit reached (5). You cannot pin more than 5 emails.");
                return;
            }

            // Pin the email
            pinnedEmails.push(emailId);
            await chrome.storage.local.set({pinnedEmails: pinnedEmails});
            pinButton.classList.add('pinned');
            pinButton.style.color = '#1a73e8';
            pinButton.style.backgroundColor = '#e8f0fe';
            row.classList.add('pinned');
            reorderPinnedEmails(topPins);
        });
    });
}

// Function to show custom popup message
function showCustomPopup(message) {
    // Remove any existing popup
    const existingPopup = document.getElementById('custom-popup');
    if (existingPopup) {
        existingPopup.remove();
    }
    
    const popup = document.createElement('div');
    popup.id = 'custom-popup';
    popup.innerHTML = `
        <div style="position:fixed; top:20px; right:20px; background:#fff; border-left:4px solid #ea4335; 
                    box-shadow:0 4px 12px rgba(0,0,0,0.15); padding:16px 20px; border-radius:8px; 
                    display:flex; align-items:center; max-width:380px; z-index:1000;">
            <div style="color:#ea4335; font-size:24px; margin-right:15px;">⚠️</div>
            <div style="flex-grow:1;">
                <div style="font-weight:600; margin-bottom:4px; color:#202124; font-size:16px;">
                    Pin Limit Reached
                </div>
                <div style="color:#5f6368; font-size:14px; line-height:1.4;">
                    ${message}
                </div>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" 
                    style="background:none; border:none; color:#5f6368; cursor:pointer; font-size:20px; 
                           margin-left:15px; padding:5px;">×</button>
        </div>
    `;
    document.body.appendChild(popup);
    
    // Auto-close after 5 seconds
    setTimeout(() => {
        if (popup.parentElement) {
            popup.parentElement.removeChild(popup);
        }
    }, 5000);
}

// Function to reorder pinned emails
function reorderPinnedEmails(topPins) {
    const emailRows = document.querySelectorAll('tr.zA, tr.msg, div[role="main"] tr');
    const pinnedRows = [];
    const normalRows = [];
    
    chrome.storage.local.get(['pinnedEmails'], function(result) {
        const pinnedEmails = result.pinnedEmails || [];
        
        // Separate pinned and normal emails
        emailRows.forEach(row => {
            const emailId = row.getAttribute('data-message-id') || row.id;
            if (pinnedEmails.includes(emailId)) {
                pinnedRows.push(row);
            } else {
                normalRows.push(row);
            }
        });
        
        // Get the parent container
        const parent = emailRows[0]?.parentNode;
        if (!parent) return;
        
        // Also get all pin containers
        const pinContainers = document.querySelectorAll('.pin-container');
        
        // Reorder the emails: first top pinned, then other pinned, then normal
        pinnedRows.forEach((row, index) => {
            if (index < topPins) {
                row.classList.add('pinned-top');
            } else {
                row.classList.remove('pinned-top');
            }
            
            // Find the corresponding pin container
            const pinContainer = Array.from(pinContainers).find(container => 
                container.nextElementSibling === row
            );
            
            // Move both the pin container and the row
            if (pinContainer) {
                parent.insertBefore(pinContainer, parent.firstChild);
            }
            parent.insertBefore(row, parent.firstChild);
        });
        
        // Append normal emails
        normalRows.forEach(row => {
            // Find the corresponding pin container
            const pinContainer = Array.from(pinContainers).find(container => 
                container.nextElementSibling === row
            );
            
            if (pinContainer) {
                parent.appendChild(pinContainer);
            }
            parent.appendChild(row);
        });
    });
}

// Initialize the extension
addPinButtons();