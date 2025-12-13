// background.js
// Listens for meeting detection and opens recorder window

let recorderWindowId = null;

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'meetingDetected') {
        console.log('Meeting detected:', message.meetingType, 'on tab', sender.tab.id);

        // Open recorder window if not already open
        openRecorderWindow(message.meetingType);
    }
});

function openRecorderWindow(meetingType) {
    // Check if recorder window is already open
    if (recorderWindowId) {
        chrome.windows.get(recorderWindowId, (win) => {
            if (chrome.runtime.lastError || !win) {
                // Window was closed, create new one
                createRecorderWindow(meetingType);
            } else {
                // Window exists, just focus it
                chrome.windows.update(recorderWindowId, { focused: true });
                console.log('Recorder window already open, focusing...');
            }
        });
    } else {
        createRecorderWindow(meetingType);
    }
}

function createRecorderWindow(meetingType) {
    chrome.windows.create({
        url: chrome.runtime.getURL('src/presentation/popup/popup.html?mode=window&meeting=' + meetingType),
        type: 'popup',
        width: 640,
        height: 600,
        focused: true,
        top: 100,
        left: 100,
        setSelfAsOpener: true
    }, (window) => {
        if (window) {
            recorderWindowId = window.id;
            console.log('Recorder window opened:', recorderWindowId);

            // Set max size immediately after creation
            chrome.windows.update(window.id, {
                width: 640,
                height: 600
            });
        }
    });
}

// Clean up window ID when closed
chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === recorderWindowId) {
        recorderWindowId = null;
        console.log('Recorder window closed');
    }
});

// Handle extension icon click (keep existing functionality)
chrome.action.onClicked.addListener(() => {
    openRecorderWindow('manual');
});
