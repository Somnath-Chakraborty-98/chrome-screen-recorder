import { GUEST_ENTITLEMENTS } from '../../infrastructure/entitlements/entitlements-service.js';
import { normalizePlaybackMime } from '../../domain/recording/blob-utils.js';
import { prepareRecordingBlob } from '../../domain/recording/webm-duration-fix.js';
import { isMp4RecordingSupported, resolveRecordingConfig } from '../../domain/recording/recorder-config.js';
import { calculateMeetingCost, persistMeetingCostSession } from '../../domain/meeting-cost/calculator.js';
import { PREVIEW_URL } from '../../infrastructure/extension-paths.js';
import { saveRecording } from '../../infrastructure/recording/recording-store.js';
import { initAccountBar } from './account-bar.js';
import { renderRecordingOptions, readRecordingOptions } from './recording-options.js';

// ============================================================
// SCREEN RECORDER - Main Controller
// ============================================================

/** @type {import('../../infrastructure/entitlements/entitlements-service.js').Entitlements} */
let activeEntitlements = { ...GUEST_ENTITLEMENTS };

let recordingStartedAt = null;
let recordingTimerId = null;
let recordingElapsedSeconds = 0;
let recordingPausedAt = null;
let accumulatedPauseMs = 0;
/** @type {{ mimeType: string, format: string, quality: string, fileExtension: string }|null} */
let activeRecordingConfig = null;
/** @type {{ enabled: boolean, hourlyRate: number }|null} */
let activeMeetingCost = null;
const pauseBtn = document.getElementById('pauseBtn');
const recordingTimerEl = document.getElementById('recordingTimer');
const recordingLimitEl = document.getElementById('recordingLimit');

renderRecordingOptions(activeEntitlements);
if (recordingLimitEl) {
  recordingLimitEl.textContent = `/ ${activeEntitlements.durationMinutes}:00 max`;
}

initAccountBar()
  .then((entitlements) => {
    activeEntitlements = entitlements;
    renderRecordingOptions(entitlements);
    if (recordingLimitEl) {
      recordingLimitEl.textContent = `/ ${entitlements.durationMinutes}:00 max`;
    }
    console.log('Active entitlements:', entitlements);
  })
  .catch((error) => {
    console.warn('Account bar init failed:', error);
    renderRecordingOptions(activeEntitlements);
  });
// This script manages screen recording with audio mixing
// capabilities for Chrome extension popup/window interface.
// ============================================================

// ============================================================
// DOM ELEMENTS & STATE VARIABLES
// ============================================================

// UI Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const preview = document.getElementById('preview');
const statusEl = document.getElementById('status');
const includeSystemAudioCheckbox = document.getElementById('includeSystemAudio');
const includeMicCheckbox = document.getElementById('includeMic');

function registerRecordingSession() {
  try {
    chrome.windows.getCurrent((win) => {
      if (chrome.runtime.lastError || !win?.id) return;
      chrome.runtime.sendMessage({
        action: 'registerRecordingWindow',
        windowId: win.id
      });
      chrome.windows.update(
        win.id,
        { focused: false, drawAttention: false },
        () => {
          chrome.windows.update(win.id, { state: 'minimized' }, () => {
            if (chrome.runtime.lastError) {
              console.warn('Could not minimize recording window:', chrome.runtime.lastError);
            }
          });
        }
      );
    });
  } catch (e) {
    console.warn('Could not register recording session:', e);
  }
}

function setRecordingOptionsLocked(locked) {
  if (includeSystemAudioCheckbox) includeSystemAudioCheckbox.disabled = locked;
  if (includeMicCheckbox) includeMicCheckbox.disabled = locked;
}

function closeRecordingWindow() {
  try {
    chrome.windows.getCurrent((win) => {
      if (chrome.runtime.lastError || !win?.id) return;
      chrome.windows.remove(win.id);
    });
  } catch (e) {
    console.warn('Could not close recording window:', e);
  }
}

function openPreviewAndClosePopup() {
  chrome.runtime.sendMessage({ action: 'recordingFinished' }, () => {
    if (chrome.runtime.lastError) {
      chrome.tabs.create({ url: PREVIEW_URL }, () => {
        closeRecordingWindow();
      });
    }
  });
}

function notifyRecordingStopping() {
  chrome.runtime.sendMessage({
    action: 'recordingStopping',
    since: Date.now() - 5000
  });
}

let stopHandlingScheduled = false;
let finalizeInProgress = false;

function scheduleHandleRecorderStop() {
  if (stopHandlingScheduled || finalizeInProgress) return;
  stopHandlingScheduled = true;
  logStatus('Stopping...');

  setTimeout(() => {
    if (finalizeInProgress) {
      stopHandlingScheduled = false;
      return;
    }
    finalizeInProgress = true;
    handleRecorderStop()
      .finally(() => {
        finalizeInProgress = false;
        stopHandlingScheduled = false;
      });
  }, 500);
}

function resetIdleRecordingUi() {
  setRecordingOptionsLocked(false);
  startBtn.disabled = false;
  stopBtn.disabled = true;
  if (pauseBtn) {
    pauseBtn.disabled = true;
    pauseBtn.textContent = 'Pause';
  }
}

// Recording State
let recorder = null;
let recordedChunks = [];
let combinedStream = null;
let displayStream = null;
let micStream = null;

// ============================================================
// PREFERENCE MANAGEMENT
// ============================================================

/**
 * Loads saved preferences from Chrome storage
 * Restores checkbox states to user's last selection
 */
async function loadPreferences() {
  try {
    const result = await chrome.storage.local.get({
      includeSystemAudio: false,  // Default: off
      includeMic: true             // Default: on
    });

    includeSystemAudioCheckbox.checked = result.includeSystemAudio;
    includeMicCheckbox.checked = result.includeMic;

    console.log('Preferences loaded:', result);
  } catch (e) {
    console.warn('Error loading preferences:', e);
  }
}

/**
 * Saves current checkbox states to Chrome storage
 * Called whenever a checkbox is changed
 */
async function savePreferences() {
  try {
    const preferences = {
      includeSystemAudio: includeSystemAudioCheckbox.checked,
      includeMic: includeMicCheckbox.checked
    };

    await chrome.storage.local.set(preferences);
    console.log('Preferences saved:', preferences);
  } catch (e) {
    console.warn('Error saving preferences:', e);
  }
}

/**
 * Initialize preference management
 * Load saved preferences and attach change listeners
 */
(function initializePreferences() {
  // Load saved preferences on popup open
  loadPreferences();

  // Save preferences when checkboxes change
  includeSystemAudioCheckbox.addEventListener('change', savePreferences);
  includeMicCheckbox.addEventListener('change', savePreferences);

  console.log('Preference management initialized');
})();


// ============================================================
// INITIALIZATION - Meeting Detection Display
// ============================================================

/**
 * Shows meeting platform information if opened from meeting detection
 * Displays which platform (Google Meet, Zoom, Teams) triggered the popup
 */
(function initializeMeetingInfo() {
  try {
    const params = new URL(location.href).searchParams;
    const meetingType = params.get('meeting');

    if (meetingType && meetingType !== 'manual') {
      const meetingInfo = document.getElementById('meetingInfo');
      const meetingTypeSpan = document.getElementById('meetingType');

      if (meetingInfo && meetingTypeSpan) {
        const platformNames = {
          'google-meet': 'Google Meet',
          'zoom': 'Zoom',
          'teams': 'Microsoft Teams'
        };

        meetingTypeSpan.textContent = platformNames[meetingType] || meetingType;
        meetingInfo.style.display = 'block';
      }
    }
  } catch (e) {
    console.warn('Error displaying meeting info:', e);
  }
})();

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Updates the status message displayed to the user
 * @param {string} msg - Status message to display
 */
function logStatus(msg) {
  statusEl.textContent = msg;
}

/**
 * Safely stops all tracks in a MediaStream
 * @param {MediaStream} stream - Stream whose tracks should be stopped
 */
function stopAllTracks(stream) {
  if (!stream) return;

  try {
    stream.getTracks().forEach(track => {
      try {
        track.stop();
      } catch (e) {
        console.warn('Error stopping track:', e);
      }
    });
  } catch (e) {
    console.warn('Error iterating tracks:', e);
  }
}

/**
 * Checks if current page is in persistent window mode
 * @returns {boolean} True if in persistent window mode
 */
function isPersistentWindow() {
  return new URL(location.href).searchParams.get('mode') === 'window';
}

// ============================================================
// RECORDING TIMER, PAUSE, DURATION LIMIT
// ============================================================

function formatTimer(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function resetRecordingTimerUi() {
  recordingElapsedSeconds = 0;
  recordingStartedAt = null;
  recordingPausedAt = null;
  accumulatedPauseMs = 0;
  if (recordingTimerId) {
    clearInterval(recordingTimerId);
    recordingTimerId = null;
  }
  if (recordingTimerEl) recordingTimerEl.textContent = '00:00';
  if (pauseBtn) {
    pauseBtn.disabled = true;
    pauseBtn.textContent = 'Pause';
  }
}

function startRecordingTimer() {
  recordingStartedAt = Date.now();
  recordingElapsedSeconds = 0;
  const maxSeconds = activeEntitlements.durationMinutes * 60;

  recordingTimerId = setInterval(() => {
    if (recordingPausedAt) return;

    const now = Date.now();
    const elapsed = Math.floor((now - recordingStartedAt - accumulatedPauseMs) / 1000);
    recordingElapsedSeconds = elapsed;
    if (recordingTimerEl) recordingTimerEl.textContent = formatTimer(elapsed);

    if (elapsed >= maxSeconds) {
      logStatus('Duration limit reached — stopping recording.');
      stopRecordingFlow();
    }
  }, 250);
}

function togglePauseRecording() {
  if (!recorder || recorder.state === 'inactive') return;

  if (recorder.state === 'recording') {
    recorder.pause();
    recordingPausedAt = Date.now();
    pauseBtn.textContent = 'Resume';
    logStatus('Recording paused.');
    return;
  }

  if (recorder.state === 'paused') {
    recorder.resume();
    accumulatedPauseMs += Date.now() - recordingPausedAt;
    recordingPausedAt = null;
    pauseBtn.textContent = 'Pause';
    logStatus('Recording resumed.');
  }
}

// ============================================================
// PERMISSION MANAGEMENT
// ============================================================

/**
 * Checks the current microphone permission state
 * @returns {Promise<string|null>} Permission state ('granted', 'denied', 'prompt') or null
 */
async function checkMicPermissionState() {
  if (!navigator.permissions) {
    console.warn('Permissions API not available');
    return null;
  }

  try {
    const status = await navigator.permissions.query({ name: 'microphone' });
    return status && status.state;
  } catch (e) {
    console.warn('Error checking microphone permission:', e);
    return null;
  }
}

/**
 * Displays UI instructions when microphone access is permanently denied
 * Shows step-by-step guide to re-enable microphone in Chrome settings
 */
function showMicDeniedUI() {
  const instructions = `
Microphone access is blocked.
1) Open chrome://settings/content/microphone
2) Allow microphone for this profile or site
3) Re-open this extension and start again.
  `.trim();

  const instructionsEl = document.getElementById('settingsInstructions');
  if (instructionsEl) {
    instructionsEl.style.display = 'block';
    instructionsEl.textContent = instructions;
  }

  logStatus('Microphone permission denied. See instructions below.');
}

// ============================================================
// AUDIO MIXING - Web Audio API
// ============================================================

/**
 * Creates a combined MediaStream with mixed audio tracks
 * Uses Web Audio API to mix display audio and microphone audio
 * 
 * @param {MediaStream} displayStream - Screen capture stream (video + optional system audio)
 * @param {MediaStream} micStream - Microphone audio stream
 * @returns {Promise<MediaStream>} Combined stream with video and mixed audio
 */
async function createCombinedStreamUsingAudioContext(displayStream, micStream) {
  const outputStream = new MediaStream();

  // Add video track from display capture
  const videoTrack = displayStream.getVideoTracks()[0];
  if (videoTrack) {
    outputStream.addTrack(videoTrack);
    console.log('Added video track to output stream');
  }

  // Check if we have any audio to mix
  const hasDisplayAudio = displayStream.getAudioTracks().length > 0;
  const hasMicAudio = micStream && micStream.getAudioTracks && micStream.getAudioTracks().length > 0;

  // If no audio from any source, return video-only stream
  if (!hasDisplayAudio && !hasMicAudio) {
    console.log('No audio tracks available, returning video-only stream');
    return outputStream;
  }

  // Create audio mixing context
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const destination = audioContext.createMediaStreamDestination();

  /**
   * Connects a MediaStream's audio to the audio mixing destination
   * @param {MediaStream} stream - Stream to connect
   */
  function connectAudioSource(stream) {
    if (!stream) return;

    // Verify stream has audio tracks
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks || audioTracks.length === 0) {
      console.log('Stream has no audio tracks, skipping connection');
      return;
    }

    try {
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(destination);
      console.log('Connected audio source to mixer');
    } catch (err) {
      console.warn('Could not create MediaStreamSource:', err);
    }
  }

  // Connect both audio sources (if available)
  connectAudioSource(displayStream);  // System audio
  if (hasMicAudio) {
    connectAudioSource(micStream);     // Microphone audio
  }

  // Add the mixed audio track to output
  const mixedAudioTrack = destination.stream.getAudioTracks()[0];
  if (mixedAudioTrack) {
    outputStream.addTrack(mixedAudioTrack);
    console.log('Added mixed audio track to output stream');
  }

  // Store references for cleanup later
  outputStream._audioContext = audioContext;
  outputStream._audioDestination = destination;

  return outputStream;
}

// ============================================================
// SCREEN SHARE END DETECTION
// ============================================================

/**
 * Attaches event handlers to detect when user stops screen sharing
 * Uses both event listeners and polling for reliable detection
 * 
 * @param {MediaStream} displayStream - The display capture stream to monitor
 */
function attachDisplayEndHandlers(displayStream) {
  if (!displayStream) return;

  const videoTrack = displayStream.getVideoTracks()[0];
  if (!videoTrack) {
    console.warn('No video track found to monitor');
    return;
  }

  let shareEndedHandled = false;

  function onShareEnded() {
    if (shareEndedHandled) return;
    shareEndedHandled = true;

    console.log('Screen share ended - user stopped sharing');
    notifyRecordingStopping();
    stopRecordingFlow();
  }

  // Method 1: Event-based detection
  // Fires when user clicks "Stop sharing" in browser UI
  videoTrack.addEventListener('ended', onShareEnded);

  // Method 2: Polling-based detection (backup)
  // Some scenarios may not fire 'ended' event reliably
  const pollInterval = setInterval(() => {
    if (videoTrack.readyState === 'ended') {
      console.log('Video track detected as ended via polling');
      clearInterval(pollInterval);
      onShareEnded();
    }
  }, 500);

  // Store interval ID for cleanup
  displayStream.__shareEndPollId = pollInterval;
  console.log('Screen share end detection attached');
}

// ============================================================
// RECORDING LIFECYCLE - Stop & Save
// ============================================================

/**
 * Handles cleanup when recording stops
 * Opens preview page instead of auto-downloading
 */
async function handleRecorderStop() {
  console.log('Recorder stopped, opening preview...');
  let openPreview = false;
  const capturedElapsedSeconds = recordingElapsedSeconds;
  const capturedStartedAt = recordingStartedAt;
  const capturedAccumulatedPauseMs = accumulatedPauseMs;
  resetRecordingTimerUi();

  const mimeType = normalizePlaybackMime(
    activeRecordingConfig?.mimeType || recorder?.mimeType || 'video/mp4'
  );
  const endedAt = Date.now();
  const durationSeconds = capturedStartedAt
    ? Math.max(
        1,
        Math.round((endedAt - capturedStartedAt - capturedAccumulatedPauseMs) / 1000)
      )
    : Math.max(1, capturedElapsedSeconds || 1);

  let meetingCostMeta = null;
  if (activeMeetingCost?.enabled && activeMeetingCost.hourlyRate > 0) {
    const calculatedCost = calculateMeetingCost(activeMeetingCost.hourlyRate, durationSeconds);
    meetingCostMeta = {
      hourlyRate: activeMeetingCost.hourlyRate,
      durationSeconds,
      calculatedCost,
      startedAt: capturedStartedAt || endedAt - durationSeconds * 1000,
      endedAt
    };
    persistMeetingCostSession({
      ...meetingCostMeta,
      sessionTitle: 'Screen recording'
    }).catch((e) => console.warn('Meeting cost save failed:', e));
  }

  try {
    if (!recordedChunks.length) {
      logStatus('Recording failed: no video data captured. Try again.');
      return;
    }

    const rawBlob = new Blob(recordedChunks, {
      type: activeRecordingConfig?.mimeType || mimeType
    });

    const prepared = await prepareRecordingBlob(rawBlob, mimeType, durationSeconds);
    const blob = prepared.blob;
    const savedDurationSeconds = prepared.durationSeconds;
    console.log(
      'Recording blob created, size:',
      blob.size,
      'bytes',
      'duration:',
      savedDurationSeconds,
      's'
    );

    if (blob.size === 0) {
      logStatus('Recording failed: empty file. Please try again.');
      return;
    }

    const recordingMeta = {
      mimeType,
      format: 'mp4',
      quality: activeRecordingConfig?.quality || 'low',
      fileExtension: 'mp4',
      durationSeconds: savedDurationSeconds,
      entitlements: {
        planCode: activeEntitlements.planCode,
        customFilenameEnabled: activeEntitlements.customFilenameEnabled,
        maxQuality: activeEntitlements.maxQuality,
        mp4Enabled: activeEntitlements.mp4Enabled
      },
      meetingCost: meetingCostMeta
    };

    const recordingId = await saveRecording(blob, recordingMeta);

    await chrome.storage.local.set({
      recordingId,
      recordingTimestamp: Date.now(),
      recordingMeta
    });

    console.log('Recording saved to IndexedDB:', recordingId);

    openPreviewAndClosePopup();
    openPreview = true;
  } catch (e) {
    console.error('Error processing recording:', e);
    if (recordedChunks.length) {
      try {
        const fallbackBlob = new Blob(recordedChunks, {
          type: activeRecordingConfig?.mimeType || 'video/mp4'
        });
        fallbackDownload(fallbackBlob);
      } catch {
        alert('Recording finished but failed to save: ' + e);
      }
    } else {
      logStatus('Recording failed to save. Please try again.');
    }
  } finally {
    cleanupRecordingResources();
    activeRecordingConfig = null;
    activeMeetingCost = null;
    recordedChunks = [];
    if (!openPreview) {
      resetIdleRecordingUi();
    }
  }
}

/**
 * Fallback download function if preview fails
 * @param {Blob} blob - Recording blob to download
 */
function fallbackDownload(blob) {
  console.log('Using fallback download method');

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `screen-recording-${timestamp}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    alert('Recording saved! (Preview unavailable)');
  } catch (e) {
    console.error('Fallback download failed:', e);
    alert('Failed to save recording: ' + e);
  }
}

/**
 * Cleans up all recording-related resources
 * Stops tracks, closes audio context, clears intervals
 */
function cleanupRecordingResources() {
  console.log('Cleaning up recording resources...');

  // Close audio context
  if (combinedStream && combinedStream._audioContext) {
    try {
      combinedStream._audioContext.close();
      console.log('Audio context closed');
    } catch (e) {
      console.warn('Error closing audio context:', e);
    }
  }

  // Stop combined stream tracks
  stopAllTracks(combinedStream);

  // Clear screen share end detection interval
  try {
    if (displayStream && displayStream.__shareEndPollId) {
      clearInterval(displayStream.__shareEndPollId);
      console.log('Cleared share-end poll interval');
    }
  } catch (e) {
    console.warn('Error clearing poll interval:', e);
  }

  // Stop display and mic streams
  stopAllTracks(displayStream);
  stopAllTracks(micStream);

  // Clear stream references
  combinedStream = null;
  displayStream = null;
  micStream = null;

  // Clear preview
  preview.srcObject = null;

  setRecordingOptionsLocked(false);

  console.log('Resource cleanup complete');
}

// ============================================================
// RECORDING LIFECYCLE - Start Recording
// ============================================================

/**
 * Main recording flow - handles permissions, stream capture, and recording start
 * Coordinates microphone access, screen capture, and MediaRecorder initialization
 */
async function startRecordingFlow() {
  console.log('Starting recording flow...');

  // Disable UI during setup
  startBtn.disabled = true;
  stopBtn.disabled = true;
  setRecordingOptionsLocked(true);
  document.getElementById('settingsInstructions').style.display = 'none';
  logStatus('Preparing...');

  // Get user preferences from checkboxes
  const includeSystemAudio = document.getElementById('includeSystemAudio').checked;
  const includeMic = document.getElementById('includeMic').checked;
  // ========================================
  // STEP 1: Request Microphone Permission
  // ========================================
  micStream = null;
  if (includeMic) {
    console.log('Requesting microphone access...');

    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Microphone access granted');
    } catch (err) {
      console.error('Microphone request failed:', err);

      // Check if permission was explicitly denied
      const permissionState = await checkMicPermissionState();
      if (permissionState === 'denied') {
        showMicDeniedUI();
        resetIdleRecordingUi();
        logStatus('Microphone permission is denied.');
        return;
      } else {
        // Ask user if they want to continue without microphone
        const proceed = confirm('Microphone access failed or was blocked. Continue without microphone?');
        if (!proceed) {
          logStatus('Recording cancelled because microphone is required.');
          resetIdleRecordingUi();
          return;
        }
        micStream = null;
        console.log('Continuing without microphone');
      }
    }
  }

  // ========================================
  // STEP 2: Request Screen Capture
  // ========================================
  console.log('Requesting display capture...');

  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: includeSystemAudio
    });
    console.log('Display capture started');

    // Attach handlers to detect when user stops sharing
    attachDisplayEndHandlers(displayStream);

  } catch (err) {
    // Handle screen capture errors
    const errorName = err && (err.name || (err.constructor && err.constructor.name)) || '';
    const silentErrorNames = ['AbortError', 'NotAllowedError', 'SecurityError', 'NotFoundError', 'NotReadableError'];
    const isUserCancellation = silentErrorNames.includes(errorName);

    if (!isUserCancellation) {
      // Unexpected error - log for debugging
      console.warn('Display capture failed:', err);
      logStatus('Failed to start display capture: ' + (err && err.message ? err.message : err));
    } else {
      // User cancelled screen sharing - handle silently
      console.log('User cancelled screen sharing');
      logStatus('Ready. Screen sharing was cancelled.');
    }

    // Clean up microphone stream if opened
    if (micStream) {
      stopAllTracks(micStream);
      micStream = null;
    }

    resetIdleRecordingUi();
    return;
  }

  // ========================================
  // STEP 3: Mix Audio Streams
  // ========================================
  console.log('Creating combined stream with audio mixing...');

  try {
    combinedStream = await createCombinedStreamUsingAudioContext(displayStream, micStream);
    console.log('Combined stream created successfully');
  } catch (err) {
    console.error('Failed to create combined stream:', err);
    logStatus('Failed to prepare audio mixing: ' + (err && err.message ? err.message : err));

    // Cleanup
    stopAllTracks(displayStream);
    if (micStream) stopAllTracks(micStream);

    resetIdleRecordingUi();
    return;
  }

  // ========================================
  // STEP 4: Setup Preview
  // ========================================
  preview.srcObject = combinedStream;
  preview.muted = true;
  console.log('Preview stream attached');

  // ========================================
  // STEP 5: Create MediaRecorder
  // ========================================
  console.log('Creating MediaRecorder...');

  if (!isMp4RecordingSupported()) {
    logStatus('MP4 recording is not supported. Please use Chrome 126 or newer.');
    stopAllTracks(combinedStream);
    stopAllTracks(displayStream);
    if (micStream) stopAllTracks(micStream);
    resetIdleRecordingUi();
    return;
  }

  const options = readRecordingOptions(activeEntitlements);
  activeMeetingCost = options.meetingCost;
  activeRecordingConfig = resolveRecordingConfig(options.quality, activeEntitlements);

  const { recorderOptions } = activeRecordingConfig;
  try {
    recorder = new MediaRecorder(combinedStream, recorderOptions);
    activeRecordingConfig.mimeType = recorder.mimeType || activeRecordingConfig.mimeType;
    console.log('MediaRecorder created with', recorder.mimeType, recorderOptions);
  } catch (err) {
    console.error('MediaRecorder creation failed:', err);
    logStatus('Recording failed: ' + (err && err.message ? err.message : err));

    // Cleanup
    stopAllTracks(combinedStream);
    stopAllTracks(displayStream);
    if (micStream) stopAllTracks(micStream);

    resetIdleRecordingUi();
    return;
  }

  // ========================================
  // STEP 6: Setup Recorder Event Handlers
  // ========================================
  recordedChunks = [];

  // Collect data chunks as they become available
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordedChunks.push(event.data);
      console.log(`Recorded chunk: ${event.data.size} bytes`);
    }
  };

  recorder.onstop = () => {
    scheduleHandleRecorderStop();
  };

  // Handle recorder errors
  recorder.onerror = (event) => {
    console.error('Recorder error:', event);
    logStatus('Recorder error: ' + (event && event.error && event.error.name ? event.error.name : event));
  };

  // ========================================
  // STEP 7: Start Recording
  // ========================================
  console.log('Starting MediaRecorder...');

  try {
    // 1-second timeslice keeps MP4 fragments seekable in the preview player.
    recorder.start(1000);
    console.log('Recording started successfully');
    registerRecordingSession();
  } catch (err) {
    console.error('recorder.start() failed:', err);
    logStatus('Could not start recorder: ' + (err && err.message ? err.message : err));

    // Cleanup
    stopAllTracks(combinedStream);
    stopAllTracks(displayStream);
    if (micStream) stopAllTracks(micStream);

    resetIdleRecordingUi();
    return;
  }

  startBtn.disabled = true;
  stopBtn.disabled = false;
  if (pauseBtn) pauseBtn.disabled = false;
  startRecordingTimer();
  logStatus(`Recording (${activeRecordingConfig.quality} · MP4)…`);
  console.log('Recording flow complete - now recording');
}

// ============================================================
// RECORDING LIFECYCLE - Stop Recording
// ============================================================

/**
 * Stops the active recording and cleans up resources
 * Can be called manually (Stop button) or automatically (share ended)
 */
function stopRecordingFlow() {
  console.log('Stopping recording flow...');
  notifyRecordingStopping();

  if (recorder && recorder.state !== 'inactive') {
    try {
      if (typeof recorder.requestData === 'function') {
        recorder.requestData();
      }
      recorder.stop();
      console.log('Recorder stopped');
    } catch (e) {
      console.warn('Error stopping recorder:', e);
      scheduleHandleRecorderStop();
    }
    return;
  }

  // Track may have ended first (Stop sharing) — recorder already inactive
  console.log('Recorder already inactive, scheduling save and preview');
  scheduleHandleRecorderStop();
}

// ============================================================
// AUTO-START LOGIC
// ============================================================

/**
 * Automatically starts recording if opened with autostart parameter
 * Used when extension is triggered from meeting detection
 */
(function initializeAutoStart() {
  try {
    const params = new URL(location.href).searchParams;
    const isWindow = params.get('mode') === 'window';
    const shouldAutoStart = params.get('autostart') === '1';

    if (isWindow && shouldAutoStart) {
      console.log('Auto-start requested, starting recording...');

      // Small delay to ensure UI is fully loaded
      setTimeout(() => {
        if (!recorder && !startBtn.disabled) {
          startRecordingFlow().catch(err =>
            console.error('Auto-start failed:', err)
          );
        }
      }, 200);
    }
  } catch (e) {
    console.warn('Auto-start initialization error:', e);
  }
})();

// ============================================================
// EVENT HANDLERS - UI Interactions
// ============================================================

/**
 * Start button click handler
 * Opens persistent window if in popup mode, otherwise starts recording
 */
startBtn.addEventListener('click', async () => {
  console.log('Start button clicked');

  // Check if we're in popup mode (needs persistent window)
  if (!isPersistentWindow()) {
    console.log('Opening persistent window for recording...');

    try {
      // Create persistent popup window with max size
      chrome.windows.create({
        url: chrome.runtime.getURL('dist/src/presentation/popup/popup.html?mode=window&autostart=1'),
        type: 'popup',
        width: 640,
        height: 600,
        focused: true
      });

      // Close the small action popup
      window.close();
      return;
    } catch (e) {
      console.warn('Could not open persistent window, continuing in popup:', e);
      // Fallthrough to start in popup (may close during screen selection)
    }
  }

  // Already in persistent window - start recording directly
  await startRecordingFlow();
});

/**
 * Stop button click handler
 * Manually stops active recording
 */
stopBtn.addEventListener('click', () => {
  console.log('Stop button clicked');
  stopRecordingFlow();
});

pauseBtn?.addEventListener('click', () => {
  togglePauseRecording();
});

// ============================================================
// EVENT HANDLERS - Window Lifecycle
// ============================================================

/**
 * Cleanup on window/tab close
 * Ensures all streams are stopped and asks confirmation if recording
 */
window.addEventListener('beforeunload', (event) => {
  console.log('Window closing...');

  // If recording is active, ask for confirmation
  if (recorder && recorder.state !== 'inactive') {
    // Show confirmation dialog
    const confirmationMessage = 'Recording is in progress. If you close this window, your recording will be lost. Are you sure?';

    // Standard way to show confirmation dialog
    event.preventDefault();
    event.returnValue = confirmationMessage;

    // For older browsers
    return confirmationMessage;
  }

  // If not recording or user confirmed, clean up resources
  cleanupOnClose();
});

/**
 * Clean up all resources on window close
 */
function cleanupOnClose() {
  console.log('Cleaning up resources on window close...');

  // Stop active recording
  if (recorder && recorder.state !== 'inactive') {
    try {
      recorder.stop();
    } catch (e) {
      console.warn('Error stopping recorder on close:', e);
    }
  }

  // Close audio context
  if (combinedStream && combinedStream._audioContext) {
    try {
      combinedStream._audioContext.close();
    } catch (e) {
      console.warn('Error closing audio context on close:', e);
    }
  }

  // Stop all streams
  stopAllTracks(combinedStream);
  stopAllTracks(displayStream);
  stopAllTracks(micStream);

  console.log('Cleanup on close complete');
}

// ============================================================
// END OF POPUP.JS
// ============================================================
console.log('Screen Recorder extension loaded successfully');
