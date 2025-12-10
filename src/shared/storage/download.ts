export async function saveBlobWithChromeDownloads(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url,
        filename,      // e.g. "recordings/myfile.webm"
        saveAs: true   // ALWAYS show Save As dialog for testing
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        resolve();
      }
    );
  });
}
