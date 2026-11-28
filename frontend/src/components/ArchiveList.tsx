import { useEffect, useState } from 'react';
import type { ArchiveEntry } from '../services/archives';

export function ArchiveList({open,opened}:{open:(entry:ArchiveEntry)=>void; opened?:{name:string;stamp:string;count:number}}) {
  const api=window.netSentinelArchives!;
  const [files,setFiles]=useState<ArchiveEntry[]>([]);
  const [revision,refresh]=useState(0), [page,setPage]=useState(0);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    api.list().then(items=>{
      if (active) {setFiles(items);setError('');setPage(0);}
    }).catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[api,revision]);
  return <section aria-label="Local archives">
    <div className="logs-management-toolbar"><h2>Local archives</h2>
      <div className="archive-actions">
        <button className="tool-btn" onClick={()=>refresh(n=>n+1)}>Refresh Archives</button>
        <button className="tool-btn" onClick={()=>api.show().catch(e=>setError(e.message))}>Open Logs Folder</button>
      </div></div>
    <p>Documents / NetSentinel_Logs</p>
    {error && <p role="alert">{error}</p>}
    {files.length ? <><div className="packet-table-container log-scroll"><table className="packet-table logs-table">
      <thead><tr><th>Filename</th><th>Format</th><th>Modified</th><th>Size</th><th>Packets</th><th></th></tr></thead>
      <tbody>{files.slice(page*20,page*20+20).map(f=><tr key={f.name}><td>{f.name}</td><td>{f.name.split('.').pop()?.toUpperCase()}</td>
        <td>{new Date(f.modified).toLocaleString()}</td><td>{f.size.toLocaleString()} B</td>
        <td>{(opened?.name===f.name && opened.stamp===f.stamp ? opened.count : f.count)?.toLocaleString() ?? '—'}</td>
        <td><button className="tool-btn" aria-label={'Open '+f.name} onClick={()=>open(f)}>Open</button></td></tr>)}</tbody></table></div>
      <div className="log-pagination"><span>Page {page+1} of {Math.ceil(files.length/20)}</span>
        <button className="tool-btn" disabled={!page} onClick={()=>setPage(n=>n-1)}>Previous archives</button>
        <button className="tool-btn" disabled={(page+1)*20>=files.length} onClick={()=>setPage(n=>n+1)}>Next archives</button></div>
    </> : !error && <p>No saved archives.</p>}
  </section>;
}
