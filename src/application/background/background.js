// background.js

const PREVIEW_URL = chrome.runtime.getURL('dist/src/presentation/preview/preview.html');

let recorderWindowId = null;
let previewOpenedForSession = false;
let recordingStopWatchId = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'meetingDetected') {
    console.log('Meeting detected:', message.meetingType, 'on tab', sender.tab?.id);
    openRecorderWindow(message.meetingType);
    return;
  }

  if (message.action === 'registerRecordingWindow') {
    if (message.windowId) {
      recorderWindowId = message.windowId;
      previewOpenedForSession = false;
    }
    return;
  }

  if (message.action === 'recordingStopping') {
    previewOpenedForSession = false;
    // Restore the minimized popup so its JS can run and save the recording.
    // Once saved it sends recordingFinished; storage watcher is the fallback.
    restoreRecorderWindow();
    watchForRecordingComplete(message.since || Date.now() - 5000);
    return;
  }

  if (message.action === 'recordingFinished') {
    stopRecordingWatch();
    openPreviewAndCloseRecorder();
    sendResponse({ ok: true });
    return true;
  }
});

function restoreRecorderWindow() {
  if (!recorderWindowId) return;
  chrome.windows.update(
    recorderWindowId,
    { state: 'normal', focused: true },
    () => {
      if (chrome.runtime.lastError) {
        console.warn('Could not restore recorder window:', chrome.runtime.lastError);
      }
    }
  );
}

function stopRecordingWatch() {
  if (recordingStopWatchId) {
    clearInterval(recordingStopWatchId);
    recordingStopWatchId = null;
  }
}

function watchForRecordingComplete(sinceMs) {
  stopRecordingWatch();

  const deadline = Date.now() + 120000;
  recordingStopWatchId = setInterval(() => {
    chrome.storage.local.get(['recordingId', 'recordingTimestamp'], (data) => {
      if (
        data.recordingId &&
        data.recordingTimestamp &&
        data.recordingTimestamp >= sinceMs
      ) {
        stopRecordingWatch();
        openPreviewAndCloseRecorder();
        return;
      }

      if (Date.now() > deadline) {
        stopRecordingWatch();
      }
    });
  }, 300);
}

function openPreviewAndCloseRecorder() {
  if (previewOpenedForSession) return;
  previewOpenedForSession = true;
  stopRecordingWatch();

  chrome.tabs.create({ url: PREVIEW_URL, active: true }, () => {
    const winId = recorderWindowId;
    if (!winId) return;

    chrome.windows.remove(winId, () => {
      if (chrome.runtime.lastError) {
        console.warn('Could not close recorder window:', chrome.runtime.lastError);
      }
      recorderWindowId = null;
    });
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('zoom.us')) {
    chrome.scripting
      .executeScript({
        target: { tabId },
        func: () => window.meetingDetectionLoaded
      })
      .then((results) => {
        if (!results || !results[0] || !results[0].result) {
          chrome.scripting
            .executeScript({
              target: { tabId },
              files: ['dist/src/application/content/content.js']
            })
            .catch((err) => console.error('Injection failed:', err));
        }
      });
  }
});

function openRecorderWindow(meetingType) {
  if (recorderWindowId) {
    chrome.windows.get(recorderWindowId, (win) => {
      if (chrome.runtime.lastError || !win) {
        createRecorderWindow(meetingType);
      } else {
        chrome.windows.update(recorderWindowId, { focused: true });
      }
    });
  } else {
    createRecorderWindow(meetingType);
  }
}

function createRecorderWindow(meetingType) {
  chrome.windows.create(
    {
      url: chrome.runtime.getURL(
        'dist/src/presentation/popup/popup.html?mode=window&meeting=' + meetingType
      ),
      type: 'popup',
      width: 640,
      height: 600,
      focused: true,
      top: 100,
      left: 100
    },
    (window) => {
      if (window) {
        recorderWindowId = window.id;
        previewOpenedForSession = false;
      }
    }
  );
}

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === recorderWindowId) {
    recorderWindowId = null;
  }
});

chrome.action.onClicked.addListener(() => {
  openRecorderWindow('manual');
});
