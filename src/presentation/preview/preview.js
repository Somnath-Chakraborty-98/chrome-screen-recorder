// ============================================================
// RECORDING PREVIEW PAGE
// ============================================================
// Displays recorded video with download/discard options
// ============================================================

let recordingBlob = null;
let recordingUrl = null;

// DOM Elements
const video = document.getElementById('recordedVideo');
const downloadBtn = document.getElementById('downloadBtn');
const discardBtn = document.getElementById('discardBtn');
const newRecordingBtn = document.getElementById('newRecordingBtn');
const durationEl = document.getElementById('duration');
const fileSizeEl = document.getElementById('fileSize');
const statusMessage = document.getElementById('statusMessage');

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Initialize preview page
 * Retrieves recording data from chrome.storage
 */
(function initialize() {
    console.log('Preview page loaded');

    try {
        // Get recording data from chrome.storage.local
        chrome.storage.local.get(['recordingData', 'recordingTimestamp'], function (result) {
            if (chrome.runtime.lastError) {
                console.error('Storage error:', chrome.runtime.lastError);
                showError('Failed to load recording data.');
                disableActions();
                return;
            }

            const recordingDataUrl = result.recordingData;

            if (!recordingDataUrl) {
                console.error('No recording data found in storage');
                showError('No recording data found. Please record again.');
                disableActions();
                return;
            }

            console.log('Recording data retrieved, size:', recordingDataUrl.length);

            // Convert data URL back to blob
            fetch(recordingDataUrl)
                .then(res => res.blob())
                .then(blob => {
                    recordingBlob = blob;
                    recordingUrl = URL.createObjectURL(blob);

                    console.log('Blob created, size:', blob.size, 'bytes');

                    // Set video source
                    video.src = recordingUrl;

                    // Update file size
                    updateFileSize(blob.size);

                    console.log('Recording loaded successfully');
                })
                .catch(err => {
                    console.error('Error converting to blob:', err);
                    showError('Failed to load recording.');
                    disableActions();
                });
        });

    } catch (e) {
        console.error('Initialization error:', e);
        showError('An error occurred while loading the preview.');
        disableActions();
    }
})();

// ============================================================
// VIDEO EVENT HANDLERS
// ============================================================

/**
 * Update duration display when video metadata is loaded
 */
video.addEventListener('loadedmetadata', () => {
    const duration = video.duration;
    durationEl.textContent = formatDuration(duration);
    console.log('Video duration:', duration);
});

/**
 * Handle video loading errors
 */
video.addEventListener('error', (e) => {
    console.error('Video error:', e);
    showError('Failed to play video preview.');
});

// ============================================================
// BUTTON ACTIONS
// ============================================================

/**
 * Download button handler
 * Downloads the recording with timestamp filename
 */
downloadBtn.addEventListener('click', () => {
    if (!recordingBlob) {
        showError('No recording available to download.');
        return;
    }

    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `screen-recording-${timestamp}.webm`;

        // Create download link
        const a = document.createElement('a');
        a.href = recordingUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        showSuccess('Download started! Check your downloads folder.');
        console.log('Download initiated:', filename);

        // Clean up after short delay
        setTimeout(cleanup, 2000);

    } catch (e) {
        console.error('Download error:', e);
        showError('Failed to download recording.');
    }
});

/**
 * Discard button handler
 * Deletes recording and closes window
 */
discardBtn.addEventListener('click', () => {
    const confirmed = confirm('Are you sure you want to discard this recording? This cannot be undone.');

    if (confirmed) {
        console.log('Recording discarded by user');
        showSuccess('Recording discarded.');
        cleanup();

        // Close window after short delay
        setTimeout(() => {
            window.close();
        }, 1000);
    }
});

/**
 * New Recording button handler
 * Opens recorder window and closes preview
 */
newRecordingBtn.addEventListener('click', () => {
    try {
        // Open recorder window
        chrome.windows.create({
            url: chrome.runtime.getURL('src/presentation/popup/popup.html?mode=window'),
            type: 'popup',
            width: 640,
            height: 600
        });

        console.log('Opening new recording window');
        cleanup();

        // Close preview window
        setTimeout(() => {
            window.close();
        }, 500);

    } catch (e) {
        console.error('Error opening recorder:', e);
        showError('Failed to open recorder window.');
    }
});

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Formats duration in seconds to MM:SS format
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration string
 */
function formatDuration(seconds) {
    if (isNaN(seconds) || seconds < 0) return '--:--';

    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Updates file size display
 * @param {number} bytes - File size in bytes
 */
function updateFileSize(bytes) {
    const mb = (bytes / (1024 * 1024)).toFixed(2);
    fileSizeEl.textContent = `${mb} MB`;
}

/**
 * Shows success message to user
 * @param {string} message - Success message text
 */
function showSuccess(message) {
    statusMessage.textContent = message;
    statusMessage.className = 'status-message success';
    statusMessage.classList.remove('hidden');
}

/**
 * Shows error message to user
 * @param {string} message - Error message text
 */
function showError(message) {
    statusMessage.textContent = message;
    statusMessage.className = 'status-message error';
    statusMessage.classList.remove('hidden');
}

/**
 * Disables all action buttons
 */
function disableActions() {
    downloadBtn.disabled = true;
    discardBtn.disabled = true;
    newRecordingBtn.disabled = true;
}

/**
 * Cleanup function
 * Revokes object URLs and clears chrome.storage
 */
function cleanup() {
    console.log('Cleaning up preview resources');

    // Revoke object URL
    if (recordingUrl) {
        URL.revokeObjectURL(recordingUrl);
        recordingUrl = null;
    }

    // Clear chrome.storage
    try {
        chrome.storage.local.remove(['recordingData', 'recordingTimestamp'], function () {
            console.log('Storage cleared');
        });
    } catch (e) {
        console.warn('Error clearing storage:', e);
    }

    recordingBlob = null;
}

/**
 * Cleanup on window close
 */
window.addEventListener('beforeunload', cleanup);

// ============================================================
// END OF PREVIEW.JS
// ============================================================
console.log('Preview page script loaded');
