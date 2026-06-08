/**
 * @param {string} [mimeType]
 */
export function normalizePlaybackMime(mimeType) {
  if (!mimeType) return 'video/mp4';
  const base = mimeType.split(';')[0].trim().toLowerCase();
  if (base.includes('mp4')) return 'video/mp4';
  return base || 'video/mp4';
}

/**
 * Re-wrap blob with a browser-friendly MIME for <video> playback.
 * @param {Blob} blob
 * @param {string} [mimeType]
 */
export async function ensurePlayableBlob(blob, mimeType) {
  const normalized = normalizePlaybackMime(mimeType || blob.type);
  if (blob.size === 0) return blob;

  const buffer = await blob.arrayBuffer();
  return new Blob([buffer], { type: normalized });
}

/**
 * @param {HTMLVideoElement} video
 */
export function getSeekableEnd(video) {
  try {
    if (video.seekable?.length > 0) {
      return video.seekable.end(video.seekable.length - 1);
    }
  } catch {
    /* ignore */
  }
  return 0;
}

/**
 * Best available duration from a loaded video element.
 * @param {HTMLVideoElement} video
 */
export function readVideoDuration(video) {
  const seekableEnd = getSeekableEnd(video);
  const reported =
    Number.isFinite(video.duration) && video.duration > 0 && video.duration !== Infinity
      ? video.duration
      : 0;
  return Math.max(seekableEnd, reported);
}

/**
 * Probe duration on a detached video element so the preview player is never seeked.
 * Resolves only AFTER seeking to the end so WebM files without a Duration header
 * still return the correct length.
 * @param {Blob} blob
 * @param {string} [mimeType]
 * @param {number} [fallbackSeconds]
 */
export async function probeVideoDuration(blob, mimeType, fallbackSeconds = 0) {
  const normalized = normalizePlaybackMime(mimeType || blob.type);
  const url = URL.createObjectURL(blob);
  const probe = document.createElement('video');
  probe.preload = 'auto';
  probe.muted = true;
  probe.playsInline = true;

  const cleanup = () => {
    URL.revokeObjectURL(url);
    probe.removeAttribute('src');
    probe.load();
  };

  try {
    await new Promise((resolve) => {
      probe.addEventListener('loadedmetadata', resolve, { once: true });
      probe.addEventListener('error', resolve, { once: true });
      probe.src = url;
      setTimeout(resolve, 6000);
    });

    if (normalized === 'video/mp4') {
      const measured = readVideoDuration(probe);
      return measured > 0 ? measured : Math.max(0, fallbackSeconds);
    }

    await new Promise((resolve) => {
      probe.addEventListener('seeked', resolve, { once: true });
      probe.addEventListener('error', resolve, { once: true });
      try {
        const end = getSeekableEnd(probe);
        probe.currentTime = end > 0 ? end : Number.MAX_SAFE_INTEGER;
      } catch {
        resolve();
      }
      setTimeout(resolve, 4000);
    });

    const measured = readVideoDuration(probe);
    return measured > 0 ? measured : Math.max(0, fallbackSeconds);
  } catch {
    return Math.max(0, fallbackSeconds);
  } finally {
    cleanup();
  }
}

/**
 * Pick the best duration from probe vs timer — never inflate past actual media.
 * @param {number} probedSeconds
 * @param {number} fallbackSeconds
 */
export function resolveDurationSeconds(probedSeconds, fallbackSeconds = 0) {
  const probed = Math.max(0, Number(probedSeconds) || 0);
  const fallback = Math.max(0, Number(fallbackSeconds) || 0);

  if (probed > 0 && fallback > 0) {
    return Math.max(1, Math.round(Math.min(probed, fallback)));
  }

  return Math.max(1, Math.round(probed || fallback || 1));
}

/**
 * Wait until the preview video has enough data to start playback.
 * @param {HTMLVideoElement} video
 */
export function waitForVideoReady(video) {
  return new Promise((resolve) => {
    if (video.readyState >= 2) {
      resolve();
      return;
    }

    const done = () => {
      cleanup();
      resolve();
    };

    const cleanup = () => {
      video.removeEventListener('loadeddata', done);
      video.removeEventListener('canplay', done);
      video.removeEventListener('error', done);
    };

    video.addEventListener('loadeddata', done, { once: true });
    video.addEventListener('canplay', done, { once: true });
    video.addEventListener('error', done, { once: true });
    setTimeout(done, 5000);
  });
}
