import fixWebmDuration from 'fix-webm-duration';
import { readVideoDuration } from './blob-utils.js';

const WATERMARK_TEXT = 'RecordEasy';

/**
 * Burns a bottom-right watermark into a video blob via canvas re-encode (real-time playback).
 * @param {Blob} sourceBlob
 * @param {string} mimeType
 * @param {(pct: number) => void} [onProgress]
 * @param {number} [durationSeconds]
 */
export async function burnWatermarkIntoVideo(
  sourceBlob,
  mimeType,
  onProgress,
  durationSeconds = 0
) {
  const sourceUrl = URL.createObjectURL(sourceBlob);
  const video = document.createElement('video');
  video.src = sourceUrl;
  // Keep playback silent for the user, but do not mute so captureStream can expose audio.
  video.muted = false;
  video.volume = 0;
  video.playsInline = true;
  video.preload = 'auto';

  await new Promise((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Failed to load video for watermark'));
  });

  const duration = Math.max(durationSeconds, readVideoDuration(video));
  if (!duration || duration <= 0) {
    URL.revokeObjectURL(sourceUrl);
    throw new Error('Could not determine video duration for watermark.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext('2d');

  const fps = 30;
  const stream = canvas.captureStream(fps);
  const mediaElementStream = getMediaElementStream(video);
  const audioTracks = mediaElementStream?.getAudioTracks?.() ?? [];
  for (const track of audioTracks) {
    stream.addTrack(track);
  }

  const outputMime = pickOutputMime(audioTracks.length > 0, mimeType);
  const recorder = new MediaRecorder(stream, {
    mimeType: outputMime,
    videoBitsPerSecond: 2_500_000
  });
  const chunks = [];

  recorder.ondataavailable = (e) => {
    if (e.data?.size) chunks.push(e.data);
  };

  const done = new Promise((resolve, reject) => {
    recorder.onstop = () => {
      URL.revokeObjectURL(sourceUrl);
      resolve(new Blob(chunks, { type: outputMime }));
    };
    recorder.onerror = () => reject(new Error('Watermark export failed'));
  });

  recorder.start(200);
  video.currentTime = 0;
  await video.play();

  await new Promise((resolve) => {
    const draw = () => {
      if (video.ended || video.currentTime >= duration - 0.05) {
        resolve();
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      drawWatermark(ctx, canvas.width, canvas.height);

      if (onProgress) {
        onProgress(Math.min(99, (video.currentTime / duration) * 100));
      }

      requestAnimationFrame(draw);
    };

    video.onended = () => resolve();
    draw();
  });

  await sleep(400);
  if (typeof recorder.requestData === 'function') {
    recorder.requestData();
  }
  recorder.stop();

  let result = await done;
  if (onProgress) onProgress(100);

  if (result.size < 1024) {
    throw new Error('Watermark export produced an empty file.');
  }

  try {
    result = await fixWebmDuration(result, duration * 1000, { logger: false });
  } catch (error) {
    console.warn('Watermark output duration fix failed:', error);
  }

  return result;
}

/**
 * @param {HTMLVideoElement} video
 */
function getMediaElementStream(video) {
  try {
    if (typeof video.captureStream === 'function') {
      return video.captureStream();
    }
    if (typeof video.mozCaptureStream === 'function') {
      return video.mozCaptureStream();
    }
  } catch {
    // ignore
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 */
function drawWatermark(ctx, width, height) {
  const padding = Math.max(12, Math.floor(width * 0.02));
  const fontSize = Math.max(14, Math.floor(width * 0.022));
  const text = WATERMARK_TEXT;

  ctx.save();
  ctx.font = `600 ${fontSize}px Inter, Arial, sans-serif`;
  const metrics = ctx.measureText(text);
  const boxWidth = metrics.width + padding * 2;
  const boxHeight = fontSize + padding;
  const x = width - boxWidth - padding;
  const y = height - boxHeight - padding;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(x, y, boxWidth, boxHeight);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.fillText(text, x + padding, y + fontSize);
  ctx.restore();
}

function pickOutputMime(includeAudio, requestedMime) {
  const candidates = [];
  if (requestedMime && MediaRecorder.isTypeSupported?.(requestedMime)) {
    candidates.push(requestedMime);
  }
  if (includeAudio) {
    candidates.push('video/webm;codecs=vp8,opus');
  }
  candidates.push('video/webm;codecs=vp8', 'video/webm');

  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported?.(mime)) return mime;
  }
  return 'video/webm';
}
