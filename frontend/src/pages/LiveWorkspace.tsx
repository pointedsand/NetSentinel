import { useEffect, useRef, useState } from 'react';
import { PacketsPage } from './PacketsPage';
import { TrafficSummary } from './DashboardPage';
import type { Packet } from '../types';

interface RecordData {
  source: string; destination: string; protocol: string; timestampUs: number; sizeBytes: number;
  id:number; captureSource:string; sourceHostname?: string; destinationHostname?: string;
  network?:string; transport?:string; sourceMac?:string; destinationMac?:string; sni?:string;
  flowSni?:string; observedDns?:{name:string};
}
function displayName(p:RecordData) {
  if (p.sni || p.flowSni) return 'TLS SNI: '+(p.sni || p.flowSni);
  if (p.observedDns) return 'Observed DNS: '+p.observedDns.name;
  if (p.destinationHostname || p.sourceHostname) return 'PTR: '+(p.destinationHostname || p.sourceHostname);
  return p.destination || p.source || p.destinationMac || 'Unknown';
}
const empty = { packetCount: 0, bandwidthMbps: 0, activeConnections: 0, outputDrops: 0, retained:0, evicted:0, rejected:0 };
export function LiveWorkspace({ onDemo }: { onDemo: () => void }) {
  const socket = useRef<WebSocket | null>(null);
  const [connected, connect] = useState(false);
  const [running, run] = useState(false);
  const [pending, wait] = useState(false);
  const [error, fail] = useState('');
  const [sources, list] = useState<string[]>([]);
  const [selected, select] = useState(0);
  const [protocol, setProtocol] = useState('');
  const [activeDns, setDns] = useState(false);
  const [stats, update] = useState(empty);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [page, navigate] = useState<'Dashboard'|'Packets'>('Dashboard');
  useEffect(() => {
    let closed = false, timer: ReturnType<typeof setTimeout>;
    function open() {
      const ws = new WebSocket('ws://127.0.0.1:8080');
      socket.current = ws;
      ws.onopen = () => {
        if (closed) return;
        fail('');
        ws.send(JSON.stringify({type:'control',command:'history'}));
        ws.send(JSON.stringify({type:'control',command:'list_sources'}));
      };
      ws.onmessage = event => {
        if (closed) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'sources') {
            list(data.sources); select(data.selected); if (typeof data.activeDns==='boolean') setDns(data.activeDns); return;
          }
          if (data.type === 'dns_setting') { setDns(data.enabled); return; }
          if (data.type === 'ptr') {
            setPackets(rows => rows.map(row => {
              const p = row.details as RecordData;
              if (p.captureSource !== data.source || (p.source !== data.ip && p.destination !== data.ip)) return row;
              const next = {...p};
              if (next.source === data.ip) next.sourceHostname = data.name;
              if (next.destination === data.ip) next.destinationHostname = data.name;
              return {...row,details:next,name:displayName(next)};
            }));
            return;
          }
          if (data.type === 'error') { fail(data.message); wait(false); return; }
          if (data.type !== 'batch' || !Array.isArray(data.packets)) return;
          const rows: Packet[] = data.packets.map((p: RecordData) => {
            const timestamp = p.timestampUs / 1000;
            return { id: p.id, details:p, timestamp, time: new Date(timestamp).toLocaleTimeString(),
              source: p.source || p.sourceMac || '—', destination: p.destination || p.destinationMac || '—',
              protocol: p.transport || p.network || p.protocol,
              size: p.sizeBytes + ' B', sizeBytes:p.sizeBytes,
              name: displayName(p) };
          });
          update({packetCount:data.packetCount, bandwidthMbps:data.bandwidthMbps,
            activeConnections:data.activeConnections, outputDrops:data.outputDrops, retained:data.retained, evicted:data.evicted, rejected:data.rejected});
          rows.reverse();
          setPackets(previous => [...rows, ...(data.historyPage && data.offset === 0 ? [] : previous)].slice(0,4096));
          if (data.historyPage) {
            if (data.nextOffset !== null) ws.send(JSON.stringify({type:'control',command:'history',offset:data.nextOffset}));
            else connect(true);
          }
          run(data.captureState === 'RUNNING'); wait(false);
          if (data.failed) fail('Capture failed. Check the backend console.');
        } catch { fail('Invalid backend message'); }
      };
      ws.onclose = event => {
        if (closed) return;
        connect(false); run(false); wait(false); list([]);
        if (event.reason) fail(event.reason);
        timer = setTimeout(open, 1200);
      };
    }
    open();
    return () => { closed = true; clearTimeout(timer); socket.current?.close(); };
  }, []);

  function command(command: string, fields = {}) {
    if (socket.current?.readyState !== WebSocket.OPEN) return false;
    socket.current.send(JSON.stringify({type:'control',command,...fields})); return true;
  }
  function capture(start: boolean) {
    if (pending) return;

    if (command(start ? 'start_capture' : 'stop_capture')) {
      wait(true); fail('');

    }
  }
  return <main className="page-content">
    <nav className="main-navigation" aria-label="Live navigation">
      {(['Dashboard','Packets'] as const).map(p => <button key={p} onClick={() => navigate(p)}>{p}</button>)}
      <button onClick={onDemo}>Return to simulation</button>
    </nav>
    <p role="status">{connected ? 'Backend connected' : 'Backend disconnected · reconnecting'} · {running ? 'Running' : 'Paused'} · Output drops: {stats.outputDrops}</p>
    {error && <p role="alert">{error}</p>}
    <label><input type="checkbox" checked={activeDns} disabled={!connected}
      onChange={e => command('active_dns',{enabled:e.target.checked})} /> Active reverse DNS lookups</label>
    <label>Capture source <select value={selected} disabled={!connected || running || pending}
      onChange={e => command('select_source', {index:Number(e.target.value)})}>
      {sources.map((s,i) => <option key={i} value={i}>{s}</option>)}
    </select></label>
    <p>Captured frames: {stats.packetCount + stats.rejected} · Retained: {stats.retained} · Evicted: {stats.evicted}</p>
    <label>Display protocol <select value={protocol}
      onChange={e => setProtocol(e.target.value)}>
      <option value="">All protocols</option>
      {['IPv4','IPv6','TCP','UDP','ICMP','ICMPv6','ARP','LLDP','IGMP','ESP','OTHER'].map(p => <option key={p}>{p}</option>)}
    </select></label>
    {page === 'Packets' ? <PacketsPage packets={packets.filter(p => {
      const d = p.details as RecordData;
      return !protocol || [p.protocol,d.network,d.transport].includes(protocol);
    })} setPackets={() => command('clear_packets')} isCapturing={running}
      setIsCapturing={capture} onNavigateDashboard={() => navigate('Dashboard')} live disabled={!connected || pending} /> :
      <section className="dashboard"><h1>Live dashboard</h1>
        <button disabled={!connected || pending} onClick={() => capture(!running)}>{running ? 'Stop capture' : 'Start capture'}</button>
        <TrafficSummary telemetry={{...stats,packetCount:stats.packetCount+stats.rejected}} />
      </section>}
  </main>;
}
