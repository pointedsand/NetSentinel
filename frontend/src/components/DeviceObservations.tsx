import { useMemo, useState } from 'react';
import type { LocalDevice, Packet } from '../types';

const pageSize = 20;

function ObservedPeers({device,packets}: {device:LocalDevice; packets:Packet[]}) {
  const [page,setPage] = useState(0);
  const peers = useMemo(()=>{
    const unique = new Map<string,{address:string; port?:number|null; protocol:string}>();
    for (const {details,protocol} of packets) {
      if (!details) continue;
      const outgoing = details.sourceMac===device.mac && device.ips.includes(details.source);
      const address = outgoing ? details.destination : details.source;
      if (!address) continue;
      const port = outgoing ? details.destinationPort : details.sourcePort;
      const key = JSON.stringify([address,port,protocol]);
      if (!unique.has(key)) unique.set(key,{address,port,protocol});
    }
    return [...unique].sort(([a],[b])=>a.localeCompare(b));
  },[device,packets]);
  const current = Math.min(page,Math.max(0,Math.ceil(peers.length/pageSize)-1));
  return <>
    <p>Known device addresses · {device.ips.join(', ') || 'None recorded'}</p>
    {peers.length ? <div className="observation-scroll"><table><thead><tr><th>Observed peer</th><th>Peer port</th><th>Protocol</th></tr></thead>
      <tbody>{peers.slice(current*pageSize,(current+1)*pageSize).map(([key,peer])=><tr key={key}>
        <td>{peer.address}</td><td>{peer.port ?? '—'}</td><td>{peer.protocol || '—'}</td></tr>)}</tbody></table></div>
      : <p>No peers in retained packets for this device.</p>}
    {peers.length>pageSize && <nav className="observation-pages" aria-label="Endpoint pages">
      <button className="tool-btn" disabled={!current} onClick={()=>setPage(current-1)}>Previous peers</button>
      <button className="tool-btn" disabled={(current+1)*pageSize>=peers.length} onClick={()=>setPage(current+1)}>Next peers</button>
    </nav>}
  </>;
}

function ObservedPackets({packets,inspect}: {packets:Packet[]; inspect?:(id:number)=>void}) {
  const [anchor,setAnchor] = useState<number|null>(null);
  const index = anchor===null ? 0 : packets.findIndex(p=>p.id<=anchor);
  const start = index<0 ? Math.max(0,packets.length-pageSize) : index;
  const end = Math.min(start+pageSize,packets.length);
  return <>
    <p>{packets.length.toLocaleString()} matching packets currently in memory</p>
    {!!packets.length && <div className="observation-scroll" onScroll={e=>{
      if (anchor===null && e.currentTarget.scrollTop>0) setAnchor(packets[0].id);
    }}><table><thead><tr><th>Time</th><th>Source</th><th>Destination</th><th>Protocol</th><th>Size</th></tr></thead>
      <tbody>{packets.slice(start,end).map(p=><tr key={p.id}><td>{inspect ?
        <button className="tool-btn" aria-label={'Inspect packet '+p.id} onClick={()=>inspect(p.id)}>{p.time}</button> : p.time}</td>
        <td>{p.source}</td><td>{p.destination}</td><td>{p.protocol}</td><td>{p.size}</td></tr>)}</tbody></table></div>}
    {(packets.length>pageSize || (packets.length>0 && anchor!==null)) && <nav className="observation-pages" aria-label="Associated packet pages">
      <button className="tool-btn" disabled={anchor===null} onClick={()=>setAnchor(null)}>Latest</button>
      <button className="tool-btn" disabled={!start} onClick={()=>setAnchor(start<=pageSize ? null : packets[start-pageSize].id)}>Newer</button>
      <span>{start+1}–{end}</span>
      <button className="tool-btn" disabled={end>=packets.length} onClick={()=>setAnchor(packets[end].id)}>Older</button>
    </nav>}
  </>;
}

export function DeviceObservations({device,packets,inspect}: {device:LocalDevice; packets:Packet[]; inspect?:(id:number)=>void}) {
  const [endpoints,showEndpoints] = useState(false);
  const [history,showHistory] = useState(false);
  return <>
    <details className="device-evidence" onToggle={e=>showEndpoints(e.currentTarget.open)}><summary>Associated Endpoints</summary>
      {endpoints && <ObservedPeers device={device} packets={packets}/>}</details>
    <details className="device-evidence" onToggle={e=>showHistory(e.currentTarget.open)}><summary>Associated Packets</summary>
      {history && <ObservedPackets packets={packets} inspect={inspect}/>}</details>
  </>;
}
