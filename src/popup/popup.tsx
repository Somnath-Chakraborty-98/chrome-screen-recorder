import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import RecorderControls from './components/RecorderControls';
import RecordingList from './components/RecordingList';
import TranscriptView from './components/TranscriptView';
import '../popup/popup.css';
import type { RecorderController } from '../shared/recorder/recorder';
import { saveBlobWithChromeDownloads } from '../shared/storage/download';
import { saveRecording, deleteRecording } from '../shared/storage/indexeddb'; // existing storage API

function PopupApp() {
  const [recordings, setRecordings] = useState<Array<{ id: string; name: string; url?: string }>>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const recorderRef = useRef<RecorderController | null>(null);

  useEffect(() => {
    // load saved recordings metadata from IndexedDB if implemented
    // placeholder: assume empty for now
  }, []);

  async function handleStart() {
    try {
      // dynamic import to avoid bundling background-only code incorrectly
      const mod = await import('../shared/recorder/recorder');
      const controller = await mod.startRecorder({
        onChunk: (blob: Blob) => {
          // optional: show progress or temporary preview
        },
        onError: (e) => console.error('Recorder error', e),
      });

      recorderRef.current = controller;
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recorder', err);
      alert('Unable to start recording. Please grant permissions and try again.');
    }
  }

 async function handleStop() {
  if (!recorderRef.current) return;
  try {
    const blob = await recorderRef.current.stop();
    setIsRecording(false);
    recorderRef.current = null;

    // create an ID & filename
    const id = `rec-${Date.now()}`;
    const filename = `${id}.webm`;

    // 1) Option A: Save to IndexedDB first (optional) --- existing behavior
    // await saveRecording(id, blob, { name: filename });

    // 2) Immediately save to local machine (prompt Save As)
    try {
      // prompt user Save As dialog (true). Use false to attempt silent save.
      await saveBlobWithChromeDownloads(blob, filename, true);
    } catch (err) {
      console.error('Download failed:', err);
      // Optionally fallback: still save to IndexedDB
      await saveRecording(id, blob, { name: filename });
      // Inform user
      alert('Automatic download failed; recording saved locally inside the extension.');
    }

    // 3) If you saved to IndexedDB earlier (or for any reason you previously had saved),
    // delete the stored copy to free chrome storage. We attempt deletion to ensure no duplicate.
    try {
      // If you did save earlier, delete it. If not present, deleteRecording should be a no-op.
      await deleteRecording(id);
    } catch (delErr) {
      // If delete fails, log but continue
      console.warn('Failed to delete indexeddb entry:', delErr);
    }

    // 4) Update UI state: remove objectURL previews and entries (we created none now)
    setRecordings((r) => r.filter((rec) => rec.id !== id));

    // 5) (Optional) show success message
    // alert('Recording saved to your machine.');
  } catch (err) {
    console.error('Failed to stop recorder', err);
    alert('Failed to finalize recording: ' + String(err));
  }
}

  return (
    <div className="popup-root">
      <header className="header">
        <h1>Screen Recorder</h1>
      </header>

      <main>
        <RecorderControls
          isRecording={isRecording}
          onStart={handleStart}
          onStop={handleStop}
        />

        <section className="section">
          <h2>Recordings</h2>
          <RecordingList recordings={recordings} />
        </section>

        <section className="section">
          <h2>Transcript</h2>
          <TranscriptView transcript={transcript} />
        </section>
      </main>

      <footer className="footer">v0.1 — Local only</footer>
    </div>
  );
}

const container = document.getElementById('root')!;
createRoot(container).render(<PopupApp />);