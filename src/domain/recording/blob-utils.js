/**
 * @param {string} [mimeType]
 */
export function normalizePlaybackMime(mimeType) {
  if (!mimeType) return 'video/webm';
  const base = mimeType.split(';')[0].trim().toLowerCase();
  if (base.includes('mp4')) return 'video/mp4';
  return 'video/webm';
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
    // Step 1: wait until we can at least read metadata
    await new Promise((resolve) => {
      probe.addEventListener('loadedmetadata', resolve, { once: true });
      probe.addEventListener('error', resolve, { once: true }); // still proceed on error
      probe.src = url;
      setTimeout(resolve, 6000);
    });

    // Step 2: seek to the very end to force Chrome to parse the full WebM index
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
    return Math.max(measured, fallbackSeconds);
  } catch {
    return fallbackSeconds;
  } finally {
    cleanup();
  }
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
