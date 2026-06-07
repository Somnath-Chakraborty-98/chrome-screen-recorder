import { capQuality } from './presets.js';

/** @typedef {'low'|'medium'|'high'} QualityLevel */
/** @typedef {'webm'|'mp4'} RecordingFormat */

export const QUALITY_BITRATES = Object.freeze({
  low: { videoBitsPerSecond: 800_000, audioBitsPerSecond: 64_000 },
  medium: { videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 },
  high: { videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 192_000 }
});

// VP8 + Opus first — best Chrome <video> playback compatibility
const WEBM_CANDIDATES = {
  high: [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8',
    'video/webm'
  ],
  medium: [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm'
  ],
  low: [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm'
  ]
};

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
 * @param {RecordingFormat} format
 * @param {QualityLevel} quality
 * @param {{ mp4Enabled: boolean, maxQuality: QualityLevel }} entitlements
 */
export function resolveRecordingConfig(format, quality, entitlements) {
  const cappedQuality = capQuality(quality, entitlements.maxQuality);
  let requestedFormat = format;

  if (format === 'mp4' && !entitlements.mp4Enabled) {
    requestedFormat = 'webm';
  }

  const bitrates = QUALITY_BITRATES[cappedQuality];
  let mimeType = '';
  let actualFormat = requestedFormat;

  if (requestedFormat === 'mp4') {
    mimeType = pickSupportedMimeType(MP4_CANDIDATES);
    if (!mimeType) {
      actualFormat = 'webm';
      mimeType = pickSupportedMimeType(WEBM_CANDIDATES[cappedQuality]);
    }
  } else {
    mimeType = pickSupportedMimeType(WEBM_CANDIDATES[cappedQuality]);
  }

  if (!mimeType) {
    mimeType = pickSupportedMimeType([...WEBM_CANDIDATES.high, 'video/webm']);
    actualFormat = 'webm';
  }

  const fileExtension = actualFormat === 'mp4' || mimeType.includes('mp4') ? 'mp4' : 'webm';

  return {
    mimeType,
    format: actualFormat,
    quality: cappedQuality,
    fileExtension,
    recorderOptions: {
      mimeType,
      videoBitsPerSecond: bitrates.videoBitsPerSecond,
      audioBitsPerSecond: bitrates.audioBitsPerSecond
    }
  };
}

/**
 * @param {number} bytes
 * @param {QualityLevel} quality
 */
export function estimateSizeLabel(bytes, quality) {
  const factors = { low: 0.6, medium: 1, high: 1.6 };
  const adjusted = bytes * (factors[quality] || 1);
  if (adjusted < 1024 * 1024) {
    return `~${(adjusted / 1024).toFixed(0)} KB`;
  }
  return `~${(adjusted / (1024 * 1024)).toFixed(1)} MB`;
}
