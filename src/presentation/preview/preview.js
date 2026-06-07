import { fetchEntitlements, canUseQuality, GUEST_ENTITLEMENTS } from '../../infrastructure/entitlements/entitlements-service.js';
import { QUALITY_OPTIONS } from '../../domain/recording/presets.js';
import { normalizePlaybackMime, readVideoDuration, waitForVideoReady } from '../../domain/recording/blob-utils.js';
import { estimateSizeLabel } from '../../domain/recording/recorder-config.js';
import { prepareRecordingBlob } from '../../domain/recording/webm-duration-fix.js';
import { formatCostSummary } from '../../domain/meeting-cost/calculator.js';
import { initTheme } from '../shared/theme.js';
import { loadRecording, deleteRecording } from '../../infrastructure/recording/recording-store.js';
import { LOGIN_URL, PRICING_URL, POPUP_URL } from '../shared/urls.js';

let recordingBlob = null;
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
const qualityOptionsEl = document.getElementById('qualityOptions');
const formatOptionsEl = document.getElementById('formatOptions');
const filenameInput = document.getElementById('filenameInput');
const filenameHint = document.getElementById('filenameHint');
const filenameLock = document.getElementById('filenameLock');
const watermarkOverlay = document.getElementById('watermarkOverlay');
const meetingCostSummary = document.getElementById('meetingCostSummary');
const planBadge = document.getElementById('planBadge');
const exportProgress = document.getElementById('exportProgress');
const exportProgressFill = document.getElementById('exportProgressFill');
const exportProgressText = document.getElementById('exportProgressText');

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
  if (duration > resolvedDurationSeconds) {
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
      'recordingData',
      'recordingTimestamp',
      'recordingMeta'
    ]);

    recordingMeta = result.recordingMeta || {
      mimeType: 'video/webm',
      format: 'webm',
      quality: 'low',
      fileExtension: 'webm',
      watermarkRequired: true,
      entitlements: {}
    };

    let blob = null;

    if (result.recordingId) {
      recordingId = result.recordingId;
      const record = await loadRecording(recordingId);
      if (!record?.blob) {
        showError('Recording file missing. Please record again.');
        return;
      }
      blob = record.blob;
      recordingMeta = record.meta || recordingMeta;
    } else if (result.recordingData) {
      const res = await fetch(result.recordingData);
      blob = await res.blob();
    } else {
      showError('No recording found. Please record again.');
      return;
    }

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
    recordingBlob = prepared.blob;
    recordingMeta.mimeType = recordingBlob.type;
    recordingMeta.durationSeconds = prepared.durationSeconds;
    updateFileSize(recordingBlob.size);

    if (videoContainer) videoContainer.classList.add('is-loading');
    video.preload = 'auto';
    recordingUrl = URL.createObjectURL(recordingBlob);
    video.src = recordingUrl;
    video.load();

    await waitForVideoReady(video);

    const finalDuration = Math.max(
      prepared.durationSeconds,
      readVideoDuration(video),
      recordingMeta.durationSeconds || 0
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
  const recordedFormat = recordingMeta.format || 'webm';

  recordedFormatEl.textContent = `${recordedFormat.toUpperCase()} · ${capitalize(recordedQuality)}`;

  if (recordingMeta.watermarkRequired) {
    watermarkOverlay.classList.remove('hidden');
  }

  renderQualityOptions(recordedQuality);
  renderFormatOptions(recordedFormat);
  setupFilenameField(recordedFormat);
  renderMeetingCostSummary();

  qualityOptionsEl.addEventListener('change', updateEstimatedSize);
  formatOptionsEl.addEventListener('change', () => {
    setupFilenameField(getSelectedFormat());
    updateEstimatedSize();
  });
}

function renderPlanBadge() {
  const parts = [`<span class="re-badge">${entitlements.planName}</span>`];
  if (entitlements.isEarlyUser) {
    parts.push('<span class="re-badge re-badge-early">Early user · no watermark</span>');
  }
  planBadge.innerHTML = parts.join('');
}

function renderQualityOptions(recordedQuality) {
  const defaultQuality = canUseQuality(recordedQuality, entitlements)
    ? recordedQuality
    : entitlements.maxQuality;

  qualityOptionsEl.innerHTML = Object.values(QUALITY_OPTIONS)
    .map((q) => {
      const allowed = canUseQuality(q.id, entitlements);
      const isRecorded = q.id === recordedQuality;
      const checked = q.id === defaultQuality ? 'checked' : '';
      const lock = allowed
        ? ''
        : `<a class="option-lock" href="${PRICING_URL}" target="_blank" title="Upgrade">🔒</a>`;

      return `
        <label class="export-option ${allowed ? '' : 'locked'}">
          <input type="radio" name="quality" value="${q.id}" ${allowed ? '' : 'disabled'} ${checked} />
          <span class="export-option-text export-option-inline">
            <strong>${q.label}</strong>
            <span class="export-option-hint">— ${q.hint}${isRecorded ? ' · recorded' : ''}</span>
            ${lock}
          </span>
        </label>
      `;
    })
    .join('');

  updateEstimatedSize();
}

function renderFormatOptions(recordedFormat) {
  const formats = [
    { id: 'webm', label: 'WebM', allowed: true },
    { id: 'mp4', label: 'MP4', allowed: entitlements.mp4Enabled }
  ];

  const safeFormat = recordedFormat === 'mp4' ? 'mp4' : 'webm';

  formatOptionsEl.innerHTML = formats
    .map((f) => {
      const lock = f.allowed
        ? ''
        : `<a class="option-lock" href="${entitlements.isLoggedIn ? PRICING_URL : LOGIN_URL}" target="_blank">🔒</a>`;
      const checked = f.id === safeFormat ? 'checked' : '';

      return `
        <label class="export-option ${f.allowed ? '' : 'locked'}">
          <input type="radio" name="format" value="${f.id}" ${f.allowed ? '' : 'disabled'} ${checked} />
          <span class="export-option-text export-option-inline">
            <strong>${f.label}</strong>${lock}
          </span>
        </label>
      `;
    })
    .join('');
}

function setupFilenameField(format) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultName = `recordeasy-${timestamp}`;
  const ext = format === 'mp4' && entitlements.mp4Enabled ? 'mp4' : recordingMeta.fileExtension || 'webm';

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

function getSelectedQuality() {
  return qualityOptionsEl.querySelector('input[name="quality"]:checked')?.value || recordingMeta.quality;
}

function getSelectedFormat() {
  const selected = formatOptionsEl.querySelector('input[name="format"]:checked')?.value;
  if (selected === 'mp4' && entitlements.mp4Enabled) return 'mp4';
  return recordingMeta.fileExtension === 'mp4' ? 'mp4' : 'webm';
}

function updateEstimatedSize() {
  if (!recordingBlob) return;
  const quality = getSelectedQuality();
  fileSizeEl.textContent = estimateSizeLabel(recordingBlob.size, quality);
}

async function handleDownload() {
  if (!recordingBlob) {
    showError('No recording available.');
    return;
  }

  const quality = getSelectedQuality();
  if (!canUseQuality(quality, entitlements)) {
    showError('Upgrade your plan to use this quality tier.');
    window.open(PRICING_URL, '_blank');
    return;
  }

  try {
    downloadBtn.disabled = true;

    if (recordingBlob.size < 1024) {
      throw new Error('Recording file is empty. Please record again.');
    }

    // Download the original recording blob — no re-encode (keeps WebM compatible with Windows players).
    const exportBlob = recordingBlob;
    const filename = sanitizeFilename(filenameInput.value || 'recordeasy-recording.webm');
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
    showExportProgress(false);
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

function showExportProgress(show, pct = 0, text = 'Preparing export…') {
  exportProgress.classList.toggle('hidden', !show);
  exportProgressFill.style.width = `${pct}%`;
  exportProgressText.textContent = text;
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]+/g, '-').trim() || 'recordeasy-recording.webm';
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
    'recordingData',
    'recordingTimestamp',
    'recordingMeta'
  ]);
  recordingBlob = null;
  recordingUrl = null;
  recordingId = null;
}

function capitalize(value) {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

initialize();
