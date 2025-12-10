import React from 'react';

type Props = {
  isRecording: boolean;
  onStart: () => Promise<void> | void;
  onStop: () => Promise<void> | void;
};

export default function RecorderControls({ isRecording, onStart, onStop }: Props) {
  return (
    <div style={{display:'flex',gap:8,alignItems:'center'}}>
      {!isRecording ? (
        <button onClick={() => void onStart()}>Start Recording</button>
      ) : (
        <button onClick={() => void onStop()}>Stop Recording</button>
      )}

      <button className="secondary" onClick={() => alert('Open options (not implemented)')}>Options</button>
    </div>
  );
}
