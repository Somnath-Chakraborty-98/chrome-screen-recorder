// popup.js
// Works with manifest.json and popup.html provided above.
// Implements runtime mic permission request (optional), display+mic capture, audio mixing and MediaRecorder.

const startBtn = document.getElementById('startBtn');
const stopBtn  = document.getElementById('stopBtn');
const preview  = document.getElementById('preview');
const statusEl = document.getElementById('status');
const openWindowBtn = document.getElementById('openWindowBtn');

let recorder = null;
let recordedChunks = [];
let combinedStream = null;
let displayStream = null;
let micStream = null;

// --- Utilities ---
function logStatus(msg) {
  statusEl.textContent = msg;
}
function stopAllTracks(stream) {
  if (!stream) return;
  try {
    stream.getTracks().forEach(t => {
      try { t.stop(); } catch (e) {}
    });
  } catch (e) {}
}
function isPersistentWindow() {
  return new URL(location.href).searchParams.get('mode') === 'window';
}

// Probe best mime for MediaRecorder
function getSupportedMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm'
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c;
    } catch (e) {}
  }
  return '';
}

// Check microphone permission state via Permissions API (may be unsupported)
async function checkMicPermissionState() {
  if (!navigator.permissions) return null;
  try {
    const s = await navigator.permissions.query({ name: 'microphone' });
    return s && s.state;
  } catch (e) {
    return null;
  }
}

// Request microphone optional permission via chrome.permissions (MV3 optional_permissions)
function requestChromeMicrophonePermission() {
  return new Promise(resolve => {
    if (!chrome || !chrome.permissions) {
      return resolve(false);
    }
    chrome.permissions.request({ permissions: ['microphone'] }, granted => resolve(!!granted));
  });
}

// Show UI instructions when mic permanently denied
function showMicDeniedUI() {
  const instructions = `
Microphone access is blocked.
1) Open chrome://settings/content/microphone
2) Allow microphone for this profile or site
3) Re-open this extension and start again.
  `.trim();
  const el = document.getElementById('settingsInstructions');
  if (el) {
    el.style.display = 'block';
    el.textContent = instructions;
  }
  logStatus('Microphone permission denied. See instructions below.');
}

// Create a mixed stream: video track from display + single mixed audio track from display audio + mic
async function createCombinedStreamUsingAudioContext(displayStream, micStream) {
  const out = new MediaStream();

  // Add the display video track (if any)
  const videoTrack = displayStream.getVideoTracks()[0];
  if (videoTrack) out.addTrack(videoTrack);

  // If no audio from either, return early
  const hasDisplayAudio = displayStream.getAudioTracks().length > 0;
  const hasMicAudio = micStream && micStream.getAudioTracks && micStream.getAudioTracks().length > 0;
  if (!hasDisplayAudio && !hasMicAudio) {
    return out;
  }

  // Mix using AudioContext
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const destination = audioContext.createMediaStreamDestination();

  function tryConnect(stream) {
    if (!stream) return;
    try {
      const src = audioContext.createMediaStreamSource(stream);
      src.connect(destination);
    } catch (err) {
      console.warn('Could not create MediaStreamSource (maybe no audio tracks):', err);
    }
  }

  tryConnect(displayStream);
  if (hasMicAudio) tryConnect(micStream);

  // Add mixed audio track
  const mixedTrack = destination.stream.getAudioTracks()[0];
  if (mixedTrack) out.addTrack(mixedTrack);

  // Keep references to close later
  out._audioContext = audioContext;
  out._audioDestination = destination;
  return out;
}

// Handle finalization (download blob) when recorder stops
function handleRecorderStop() {
  try {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `screen-recording-${ts}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) {
    console.error('Error creating download:', e);
    alert('Recording finished but failed to create download: ' + e);
  } finally {
    // cleanup
    if (combinedStream) {
      if (combinedStream._audioContext) {
        try { combinedStream._audioContext.close(); } catch (e) {}
      }
      stopAllTracks(combinedStream);
    }
    stopAllTracks(displayStream);
    stopAllTracks(micStream);
    combinedStream = null;
    displayStream = null;
    micStream = null;

    preview.srcObject = null;
    logStatus('Recording saved.');
    startBtn.disabled = false;
    stopBtn.disabled = true;
    recordedChunks = [];
  }
}

// --- Core start/stop functions ---
async function startRecordingFlow() {
  startBtn.disabled = true;
  stopBtn.disabled = true;
  document.getElementById('settingsInstructions').style.display = 'none';
  logStatus('Preparing...');

  const includeSystemAudio = document.getElementById('includeSystemAudio').checked;
  const includeMic = document.getElementById('includeMic').checked;

  // 1) Try to request microphone permission if requested by user
  micStream = null;
  if (includeMic) {
    // If we use optional_permissions, attempt chrome.permissions.request first
    try {
      // request optional microphone permission (this shows Chrome-level prompt to grant permission to extension)
      const chromeGranted = await requestChromeMicrophonePermission();
      // Even if chrome permission not granted, we can still attempt getUserMedia to trigger in-page prompt
      if (!chromeGranted) {
        // Not granted via chrome.permissions.request; we still attempt getUserMedia below to let site prompt (if allowed)
        // This might show the browser-level mic prompt.
      }
    } catch (e) {
      console.warn('chrome.permissions.request failed or unavailable:', e);
    }

    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Mic stream obtained', micStream);
    } catch (err) {
      console.error('Microphone request failed:', err);
      const state = await checkMicPermissionState();
      if (state === 'denied') {
        showMicDeniedUI();
        startBtn.disabled = false;
        stopBtn.disabled = true;
        logStatus('Microphone permission is denied.');
        return;
      } else {
        // Ask user whether to continue without mic
        const proceed = confirm('Microphone access failed or was blocked. Continue without microphone?');
        if (!proceed) {
          logStatus('Recording cancelled because microphone is required.');
          startBtn.disabled = false;
          stopBtn.disabled = true;
          return;
        }
        micStream = null;
      }
    }
  }

  // 2) Request display capture (screen) - this will trigger screen-share chooser
  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: includeSystemAudio
    });
  } catch (err) {
    console.error('Display capture failed:', err);
    logStatus('Failed to start display capture: ' + (err && err.message ? err.message : err));
    if (micStream) { stopAllTracks(micStream); micStream = null; }
    startBtn.disabled = false;
    stopBtn.disabled = true;
    return;
  }

  // 3) Create mixed combined stream (video + single mixed audio track)
  try {
    combinedStream = await createCombinedStreamUsingAudioContext(displayStream, micStream);
  } catch (err) {
    console.error('Failed to create combined stream:', err);
    logStatus('Failed to prepare audio mixing: ' + (err && err.message ? err.message : err));
    stopAllTracks(displayStream);
    if (micStream) stopAllTracks(micStream);
    startBtn.disabled = false;
    stopBtn.disabled = true;
    return;
  }

  // 4) Preview the stream (muted)
  preview.srcObject = combinedStream;
  preview.muted = true;

  // 5) Create MediaRecorder using best mime
  const mime = getSupportedMimeType();
  try {
    recorder = mime ? new MediaRecorder(combinedStream, { mimeType: mime }) : new MediaRecorder(combinedStream);
  } catch (err) {
    console.error('MediaRecorder creation failed:', err);
    logStatus('Recording failed: ' + (err && err.message ? err.message : err));
    stopAllTracks(combinedStream);
    stopAllTracks(displayStream);
    if (micStream) stopAllTracks(micStream);
    startBtn.disabled = false;
    stopBtn.disabled = true;
    return;
  }

  recordedChunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) recordedChunks.push(e.data); };
  recorder.onstop = handleRecorderStop;
  recorder.onerror = (ev) => {
    console.error('Recorder error:', ev);
    logStatus('Recorder error: ' + (ev && ev.error && ev.error.name ? ev.error.name : ev));
  };

  // start recording (timeslice 1000ms)
  try {
    recorder.start(1000);
  } catch (err) {
    console.error('recorder.start failed:', err);
    logStatus('Could not start recorder: ' + (err && err.message ? err.message : err));
    stopAllTracks(combinedStream);
    stopAllTracks(displayStream);
    if (micStream) stopAllTracks(micStream);
    startBtn.disabled = false;
    stopBtn.disabled = true;
    return;
  }

  startBtn.disabled = true;
  stopBtn.disabled = false;
  logStatus('Recording... Click Stop to finish.');
}

function stopRecordingFlow() {
  if (recorder && recorder.state !== 'inactive') {
    logStatus('Stopping...');
    try { recorder.stop(); } catch (e) { console.warn('Error stopping recorder', e); }
  } else {
    // Ensure everything stopped
    if (combinedStream && combinedStream._audioContext) {
      try { combinedStream._audioContext.close(); } catch (e) {}
    }
    stopAllTracks(combinedStream);
    stopAllTracks(displayStream);
    stopAllTracks(micStream);
    combinedStream = null;
    displayStream = null;
    micStream = null;
    preview.srcObject = null;
    logStatus('Stopped.');
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

// --- UI wiring ---
startBtn.addEventListener('click', async () => {
  // If popup mode and not persistent, open a persistent window to avoid popup auto-close during screen chooser
  if (!isPersistentWindow()) {
    // open a persistent window and ask user to click Start there (avoids popup closing)
    try {
      chrome.windows.create({
        url: chrome.runtime.getURL('popup.html?mode=window'),
        type: 'popup',
        width: 520,
        height: 640
      });
      window.close(); // close the small popup so user uses the persistent window
      return;
    } catch (e) {
      console.warn('Could not open persistent window, continuing in popup:', e);
      // fallthrough to start in popup (may cause popup to close during screen prompt)
    }
  }

  // If we are already in persistent window OR chrome.windows.create failed, start the flow directly
  await startRecordingFlow();
});

stopBtn.addEventListener('click', stopRecordingFlow);

// Open persistent window explicitly
openWindowBtn.addEventListener('click', () => {
  try {
    chrome.windows.create({
      url: chrome.runtime.getURL('popup.html?mode=window'),
      type: 'popup',
      width: 520,
      height: 640
    });
  } catch (e) {
    alert('Could not open window: ' + e);
  }
});

// In case of unexpected unload, try to stop streams (helpful while debugging)
window.addEventListener('beforeunload', () => {
  if (recorder && recorder.state !== 'inactive') {
    try { recorder.stop(); } catch (e) {}
  }
  if (combinedStream && combinedStream._audioContext) {
    try { combinedStream._audioContext.close(); } catch (e) {}
  }
  stopAllTracks(combinedStream);
  stopAllTracks(displayStream);
  stopAllTracks(micStream);
});
