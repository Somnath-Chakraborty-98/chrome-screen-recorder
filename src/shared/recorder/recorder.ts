// src/shared/recorder/recorder.ts
export type RecorderController = {
  stop: () => Promise<Blob>;
  pause: () => void;
  resume: () => void;
};

export type RecorderOptions = {
  mimeType?: string;
  onChunk?: (blob: Blob) => void;
  onError?: (e: Error) => void;
};

export async function startRecorder(options: RecorderOptions = {}): Promise<RecorderController> {
  const { onChunk, onError } = options;

  // 1) request screen (video + optional system audio)
  const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

  // 2) request microphone (optional, might fail if user denies)
  let micStream: MediaStream | null = null;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    // microphone permission denied / unavailable — continue with screen audio only
    console.warn('Mic access not granted or unavailable', err);
  }

  // 3) create AudioContext to mix audio tracks (if both exist)
  const audioCtx = new AudioContext();
  const destination = audioCtx.createMediaStreamDestination();

  // if screen has audio tracks, route them
  if (screenStream.getAudioTracks().length > 0) {
    const screenAudio = new MediaStream(screenStream.getAudioTracks());
    const screenSrc = audioCtx.createMediaStreamSource(screenAudio);
    screenSrc.connect(destination);
  }

  // if mic available, route it
  if (micStream && micStream.getAudioTracks().length > 0) {
    const micSrc = audioCtx.createMediaStreamSource(new MediaStream(micStream.getAudioTracks()));
    micSrc.connect(destination);
  }

  // 4) assemble final stream: video from screen + mixed audio
  const finalStream = new MediaStream();

  // add screen video track(s)
  screenStream.getVideoTracks().forEach((t) => finalStream.addTrack(t));

  // add mixed audio from destination
  destination.stream.getAudioTracks().forEach((t) => finalStream.addTrack(t));

  // 5) create MediaRecorder
  const mimeType = options.mimeType || 'video/webm; codecs=vp9,opus';
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(finalStream, { mimeType });
  } catch (err) {
    // fallback to default if specified mimeType unsupported
    recorder = new MediaRecorder(finalStream);
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size) {
      chunks.push(ev.data);
      onChunk?.(ev.data);
    }
  };
  recorder.onerror = (ev) => onError?.(new Error(String(ev)));

  // Start recording; using small timeslice so onChunk fires periodically
  recorder.start(1000);

  const stop = async (): Promise<Blob> => {
    return new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        try {
          // stop all tracks
          finalStream.getTracks().forEach((t) => t.stop());
          screenStream.getTracks().forEach((t) => t.stop());
          micStream?.getTracks().forEach((t) => t.stop());
          audioCtx.close().catch(() => {});
          const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
          resolve(blob);
        } catch (e) {
          reject(e);
        }
      };
      recorder.stop();
    });
  };

  const pause = () => {
    if (recorder.state === 'recording') recorder.pause();
  };

  const resume = () => {
    if (recorder.state === 'paused') recorder.resume();
  };

  return { stop, pause, resume };
}
