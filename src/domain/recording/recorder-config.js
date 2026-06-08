import { capQuality } from './presets.js';

/** @typedef {'low'|'medium'|'high'} QualityLevel */

export const QUALITY_BITRATES = Object.freeze({
  low: { videoBitsPerSecond: 800_000, audioBitsPerSecond: 64_000 },
  medium: { videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 },
  high: { videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 192_000 }
});

// H.264 + AAC only — Films & TV / Windows native playback (Chrome 126+)
const MP4_CANDIDATES = [
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs=h264,aac',
  'video/mp4'
];

/**
 * @param {string[]} candidates
 */
function pickSupportedMimeType(candidates) {
  for (const mimeType of candidates) {
    try {
      if (MediaRecorder.isTypeSupported?.(mimeType)) {
        return mimeType;
      }
    } catch {
      // ignore
    }
  }
  return '';
}

/**
 * @param {QualityLevel} quality
 * @param {{ maxQuality: QualityLevel }} entitlements
 */
export function resolveRecordingConfig(quality, entitlements) {
  const cappedQuality = capQuality(quality, entitlements.maxQuality);
  const bitrates = QUALITY_BITRATES[cappedQuality];
  const mimeType = pickSupportedMimeType(MP4_CANDIDATES);

  if (!mimeType) {
    throw new Error('MP4 recording is not supported in this browser. Please use Chrome 126 or newer.');
  }

  return {
    mimeType,
    format: 'mp4',
    quality: cappedQuality,
    fileExtension: 'mp4',
    recorderOptions: {
      mimeType,
      videoBitsPerSecond: bitrates.videoBitsPerSecond,
      audioBitsPerSecond: bitrates.audioBitsPerSecond
    }
  };
}

/**
 * @returns {boolean}
 */
export function isMp4RecordingSupported() {
  return Boolean(pickSupportedMimeType(MP4_CANDIDATES));
}
