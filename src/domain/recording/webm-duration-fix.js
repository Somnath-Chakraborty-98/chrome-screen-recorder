import { ensurePlayableBlob, probeVideoDuration } from './blob-utils.js';

/**
 * Normalize recording and measure duration without patching the WebM container.
 * Patching duration metadata can break Windows apps (Films & TV, etc.).
 * @param {Blob} blob
 * @param {string} [mimeType]
 * @param {number} [fallbackSeconds]
 */
export async function prepareRecordingBlob(blob, mimeType, fallbackSeconds = 0) {
  const playable = await ensurePlayableBlob(blob, mimeType);
  const probed = await probeVideoDuration(playable, mimeType, fallbackSeconds);
  const safeFallback = Math.max(0, Number(fallbackSeconds) || 0);
  const safeProbed = Math.max(0, Number(probed) || 0);
  const durationSeconds = Math.max(1, Math.round(Math.max(safeProbed, safeFallback)));

  return { blob: playable, durationSeconds };
}
