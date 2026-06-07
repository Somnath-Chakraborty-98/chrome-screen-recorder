/** @typedef {'low'|'medium'|'high'} QualityLevel */
/** @typedef {'webm'|'mp4'} RecordingFormat */

export const QUALITY_OPTIONS = Object.freeze({
  low: {
    id: 'low',
    label: 'Low',
    hint: 'Low — fastest share',
    sizeFactor: 0.6
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    hint: 'Medium — balanced',
    sizeFactor: 1
  },
  high: {
    id: 'high',
    label: 'High',
    hint: 'High — best clarity',
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
