// src/shared/storage/download.ts
export async function saveBlobWithChromeDownloads(
  blob: Blob,
  filename: string,
  prompt = true
): Promise<number | undefined> {
  // Create blob URL for download
  const url = URL.createObjectURL(blob);

  // If chrome.downloads exists (extension context), use it
  if (typeof chrome !== 'undefined' && chrome.downloads && typeof chrome.downloads.download === 'function') {
    return new Promise<number | undefined>((resolve, reject) => {
      try {
        chrome.downloads.download(
          {
            url,
            filename,        // e.g. 'Recordings/rec-123.webm'
            saveAs: !!prompt
          },
          (downloadId) => {
            // Revoke after a short delay to ensure Chromium starts the download
            setTimeout(() => URL.revokeObjectURL(url), 1500);

            if (chrome.runtime && chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(downloadId);
          }
        );
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    });
  }

  // Fallback: use File System Access API if available (requires user gesture)
  // This fallback is useful if you run the popup as a normal page during dev.
  if ('showSaveFilePicker' in window) {
    try {
      // @ts-ignore - TS types for showSaveFilePicker may not be present
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'WebM video',
            accept: { 'video/webm': ['.webm'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      // revoke blob URL
      URL.revokeObjectURL(url);
      return undefined;
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  }

  // Final fallback: create an anchor and click it (will download to default location)
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return undefined;
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}
