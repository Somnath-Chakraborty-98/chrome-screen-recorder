import { fetchEntitlements, GUEST_ENTITLEMENTS } from '../../infrastructure/entitlements/entitlements-service.js';
import {
  normalizePlaybackMime,
  readVideoDuration,
  resolveDurationSeconds,
  waitForVideoReady
} from '../../domain/recording/blob-utils.js';
import { createPreviewBlob, prepareRecordingBlob } from '../../domain/recording/webm-duration-fix.js';
import { formatCostSummary } from '../../domain/meeting-cost/calculator.js';
import { initTheme } from '../shared/theme.js';
import { loadRecording, deleteRecording } from '../../infrastructure/recording/recording-store.js';
import { LOGIN_URL, PRICING_URL, POPUP_URL } from '../shared/urls.js';

let downloadBlob = null;
let recordingUrl = null;
let recordingMeta = null;
let recordingId = null;
let entitlements = { ...GUEST_ENTITLEMENTS };
let resolvedDurationSeconds = 0;
let exportUiReady = false;

const video = document.getElementById('recordedVideo');
const videoContainer = document.querySelector('.video-container');
const downloadBtn = document.getElementById('downloadBtn');
const discardBtn = document.getElementById('discardBtn');
const newRecordingBtn = document.getElementById('newRecordingBtn');
const durationEl = document.getElementById('duration');
const fileSizeEl = document.getElementById('fileSize');
const recordedFormatEl = document.getElementById('recordedFormat');
const statusMessage = document.getElementById('statusMessage');
const filenameInput = document.getElementById('filenameInput');
const filenameHint = document.getElementById('filenameHint');
const filenameLock = document.getElementById('filenameLock');
const meetingCostSummary = document.getElementById('meetingCostSummary');
const planBadge = document.getElementById('planBadge');

initTheme();

document.getElementById('copyFilenameBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(filenameInput.value);
    showSuccess('File name copied.');
  } catch {
    showError('Could not copy file name.');
  }
});

downloadBtn.addEventListener('click', () => handleDownload());
discardBtn.addEventListener('click', handleDiscard);
newRecordingBtn.addEventListener('click', handleNewRecording);

video.addEventListener('durationchange', syncDurationFromVideo);
video.addEventListener('loadedmetadata', syncDurationFromVideo);

function syncDurationFromVideo() {
  const duration = readVideoDuration(video);
  if (duration <= 0) return;

  if (
    resolvedDurationSeconds <= 0 ||
    duration < resolvedDurationSeconds - 0.5
  ) {
    updateDurationDisplay(duration);
  }
}

async function initialize() {
  disableActions();
  durationEl.textContent = 'Loading…';
  video.removeAttribute('src');

  entitlements = await fetchEntitlements();
  renderPlanBadge();

  try {
    const result = await chrome.storage.local.get([
      'recordingId',
      'recordingTimestamp',
      'recordingMeta'
    ]);

    recordingMeta = result.recordingMeta || {
      mimeType: 'video/mp4',
      format: 'mp4',
      quality: 'low',
      fileExtension: 'mp4',
      entitlements: {}
    };

    if (!result.recordingId) {
      showError('No recording found. Please record again.');
      return;
    }

    recordingId = result.recordingId;
    const record = await loadRecording(recordingId);
    if (!record?.blob) {
      showError('Recording file missing. Please record again.');
      return;
    }

    const blob = record.blob;
    recordingMeta = record.meta || recordingMeta;

    if (!blob || blob.size === 0) {
      showError('Recording is empty. Please record again.');
      return;
    }

    const mimeType = normalizePlaybackMime(recordingMeta.mimeType || blob.type);
    const prepared = await prepareRecordingBlob(
      blob,
      mimeType,
      recordingMeta.durationSeconds || 0
    );
    downloadBlob = prepared.blob;
    recordingMeta.mimeType = downloadBlob.type;
    recordingMeta.durationSeconds = prepared.durationSeconds;
    updateFileSize(downloadBlob.size);

    if (videoContainer) videoContainer.classList.add('is-loading');
    video.preload = 'auto';
    const previewBlob = await createPreviewBlob(downloadBlob);
    recordingUrl = URL.createObjectURL(previewBlob);
    video.src = recordingUrl;
    video.load();

    await waitForVideoReady(video);

    const videoDuration = readVideoDuration(video);
    const finalDuration = resolveDurationSeconds(
      videoDuration,
      prepared.durationSeconds || recordingMeta.durationSeconds || 0
    );
    updateDurationDisplay(finalDuration);

    if (videoContainer) videoContainer.classList.remove('is-loading');
    setupExportUi();
    downloadBtn.disabled = false;
    discardBtn.disabled = false;
    newRecordingBtn.disabled = false;
  } catch (error) {
    console.error('Preview load error:', error);
    if (videoContainer) videoContainer.classList.remove('is-loading');
    showError('Failed to load recording.');
  }
}

function updateDurationDisplay(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  durationEl.textContent = formatDuration(seconds);
  resolvedDurationSeconds = seconds;
  if (recordingMeta) recordingMeta.durationSeconds = Math.round(seconds);
}

function setupExportUi() {
  if (exportUiReady) return;
  exportUiReady = true;

  const recordedQuality = recordingMeta.quality || 'low';
  recordedFormatEl.textContent = `MP4 · ${capitalize(recordedQuality)}`;

  setupFilenameField();
  renderMeetingCostSummary();
  updateEstimatedSize();
}

function renderPlanBadge() {
  const parts = [`<span class="re-badge">${entitlements.planName}</span>`];
  if (entitlements.isEarlyUser) {
    parts.push('<span class="re-badge re-badge-early">Early user</span>');
  }
  planBadge.innerHTML = parts.join('');
}

function setupFilenameField() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultName = `recordeasy-${timestamp}`;
  const ext = 'mp4';

  filenameInput.value = `${defaultName}.${ext}`;

  if (entitlements.customFilenameEnabled) {
    filenameInput.disabled = false;
    filenameLock.classList.add('hidden');
    filenameHint.textContent = 'Custom file names are saved with your download.';
  } else {
    filenameInput.disabled = true;
    filenameLock.classList.remove('hidden');
    filenameLock.href = entitlements.isLoggedIn ? PRICING_URL : LOGIN_URL;
    filenameHint.textContent = 'Custom file name is available on Plus and Pro. Copy the name below.';
  }
}

function renderMeetingCostSummary() {
  const mc = recordingMeta.meetingCost;
  if (!mc) return;

  meetingCostSummary.classList.remove('hidden');
  meetingCostSummary.textContent =
    formatCostSummary(mc.durationSeconds, {
      enabled: true,
      hourlyRate: mc.hourlyRate,
      startedAt: mc.startedAt,
      elapsedSeconds: mc.durationSeconds
    }) + ` — Total: ₹${Number(mc.calculatedCost).toLocaleString('en-IN')}`;
}

function updateEstimatedSize() {
  if (!downloadBlob) return;
  fileSizeEl.textContent = `${(downloadBlob.size / (1024 * 1024)).toFixed(2)} MB`;
}

async function handleDownload() {
  if (!downloadBlob) {
    showError('No recording available.');
    return;
  }

  try {
    downloadBtn.disabled = true;

    if (downloadBlob.size < 1024) {
      throw new Error('Recording file is empty. Please record again.');
    }

    const exportBlob = downloadBlob;
    const filename = sanitizeFilename(filenameInput.value || 'recordeasy-recording.mp4');
    const url = URL.createObjectURL(exportBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    showSuccess('Download started. Closing…');
    setTimeout(async () => {
      await cleanup();
      window.close();
    }, 1500);
  } catch (error) {
    console.error('Download failed:', error);
    showError(error.message || 'Export failed.');
    downloadBtn.disabled = false;
  }
}

function handleDiscard() {
  if (!confirm('Discard this recording? This cannot be undone.')) return;
  showSuccess('Recording discarded.');
  cleanup().then(() => setTimeout(() => window.close(), 400));
}

function handleNewRecording() {
  chrome.windows.create({
    url: `${POPUP_URL}?mode=window`,
    type: 'popup',
    width: 640,
    height: 720
  });
  cleanup().then(() => setTimeout(() => window.close(), 400));
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]+/g, '-').trim() || 'recordeasy-recording.mp4';
}

function formatDuration(seconds) {
  if (Number.isNaN(seconds) || seconds < 0) return '--:--';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function updateFileSize(bytes) {
  fileSizeEl.textContent = `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function showSuccess(message) {
  statusMessage.textContent = message;
  statusMessage.className = 'status-message success';
  statusMessage.classList.remove('hidden');
}

function showError(message) {
  statusMessage.textContent = message;
  statusMessage.className = 'status-message error';
  statusMessage.classList.remove('hidden');
}

function disableActions() {
  downloadBtn.disabled = true;
  discardBtn.disabled = true;
  newRecordingBtn.disabled = true;
}

async function cleanup() {
  if (recordingUrl) URL.revokeObjectURL(recordingUrl);
  if (recordingId) {
    await deleteRecording(recordingId).catch(() => {});
  }
  await chrome.storage.local.remove([
    'recordingId',
    'recordingTimestamp',
    'recordingMeta'
  ]);
  downloadBlob = null;
  recordingUrl = null;
  recordingId = null;
}

function capitalize(value) {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

initialize();
