/** @typedef {'low'|'medium'|'high'} QualityLevel */
/** @typedef {'mp4'} RecordingFormat */

export const QUALITY_OPTIONS = Object.freeze({
  low: {
    id: 'low',
    label: 'Low',
    hint: '800 Kbps — smaller files',
    sizeFactor: 0.6
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    hint: '2.5 Mbps — balanced',
    sizeFactor: 1
  },
  high: {
    id: 'high',
    label: 'High',
    hint: '5 Mbps — best clarity',
    sizeFactor: 1.6
  }
});

const QUALITY_ORDER = { low: 1, medium: 2, high: 3 };

/**
 * @param {QualityLevel} quality
 * @param {QualityLevel} maxQuality
 */
export function capQuality(quality, maxQuality) {
  return QUALITY_ORDER[quality] <= QUALITY_ORDER[maxQuality] ? quality : maxQuality;
}
