import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import RecorderControls from './components/RecorderControls';
import RecordingList from './components/RecordingList';
import TranscriptView from './components/TranscriptView';
import '../popup/popup.css';
import type { RecorderController } from '../shared/recorder/recorder';

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

      // Create object URL for quick preview & store (in IndexedDB in your storage layer)
      const id = `rec-${Date.now()}`;
      const url = URL.createObjectURL(blob);
      setRecordings((r) => [{ id, name: `${id}.webm`, url }, ...r]);

      // Optionally, save blob to IndexedDB via storage wrapper
      const dbMod = await import('../shared/storage/indexeddb');
      await dbMod.saveRecording(id, blob, { name: `${id}.webm` });

      // Optionally, start transcription/upload flow here
      // Example placeholder that sets transcript to null
      setTranscript(null);
    } catch (err) {
      console.error('Failed to stop recorder', err);
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