import { ensurePlayableBlob, probeVideoDuration, resolveDurationSeconds } from './blob-utils.js';

/**
 * Normalize recording and measure duration.
 * @param {Blob} blob
 * @param {string} [mimeType]
 * @param {number} [fallbackSeconds]
 */
export async function prepareRecordingBlob(blob, mimeType, fallbackSeconds = 0) {
  const playable = await ensurePlayableBlob(blob, mimeType);
  const probed = await probeVideoDuration(playable, mimeType, 0);
  const durationSeconds = resolveDurationSeconds(probed, fallbackSeconds);

  return { blob: playable, durationSeconds };
}

/**
 * MP4 recordings from MediaRecorder include duration metadata — return as-is.
 * @param {Blob} blob
 */
export async function createPreviewBlob(blob) {
  return blob;
}
