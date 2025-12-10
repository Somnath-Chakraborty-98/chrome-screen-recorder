import React from 'react';

export default function RecordingList({ recordings }: { recordings: Array<{ id: string; name: string; url?: string }> }) {
  if (!recordings.length) return <div style={{color:'#94a3b8'}}>No recordings yet</div>;

  return (
    <div>
      {recordings.map(r => (
        <div key={r.id} className="recording-item">
          <div>
            <div style={{fontSize:13}}>{r.name}</div>
            <div className="meta">{new Date(Number(r.id.split('-')[1])).toLocaleString()}</div>
          </div>

          <div style={{display:'flex',gap:6}}>
            {r.url && (
              <a href={r.url} target="_blank" rel="noreferrer"><button className="secondary">Play</button></a>
            )}
            <button className="secondary" onClick={() => { navigator.clipboard.writeText(r.url || ''); alert('URL copied'); }}>Copy URL</button>
          </div>
        </div>
      ))}
    </div>
  );
}
