import React from 'react';

export default function TranscriptView({ transcript }: { transcript: string | null }) {
  if (!transcript) return <div style={{color:'#94a3b8'}}>No transcript available</div>;
  return (
    <div style={{fontSize:13,lineHeight:1.35,whiteSpace:'pre-wrap'}}>{transcript}</div>
  );
}
