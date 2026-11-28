import { useEffect, useMemo, useRef, useState } from 'react';
import { isAlertPacket } from '../alertEvidence';
import type { SecurityEvent } from '../types';
import { isDevicePacket } from '../deviceIdentity';
import type { LocalDevice, CaptureMessage, CaptureMode, CaptureStats, MonitorView, Packet, RecordData } from '../types';

import { useAdministrator } from './useAdministrator';

function displayName(p:RecordData) {
  if (p.sni || p.flowSni) return 'TLS SNI: '+(p.sni || p.flowSni);
  if (p.observedDns) return 'Observed DNS: '+p.observedDns.name;
  if (p.destinationHostname || p.sourceHostname) return 'PTR: '+(p.destinationHostname || p.sourceHostname);
  return p.destination || p.source || p.destinationMac || 'Unknown';
}
function packetRow(p: RecordData): Packet {
  const timestamp = p.timestampUs / 1000;
  return { id: p.id, details:p, timestamp, time: new Date(timestamp).toLocaleTimeString(),
    source: p.source || p.sourceMac || '—', destination: p.destination || p.destinationMac || '—',
    protocol: p.transport || p.network || p.protocol,
    size: p.sizeBytes + ' B', sizeBytes:p.sizeBytes,
    name: displayName(p) };
}

const empty: CaptureStats = { packetCount: 0, bandwidthMbps: 0, activeConnections: 0, outputDrops: 0, retained:0, evicted:0, rejected:0 };
export function useCapture(showMonitor = false, showAlerts = false) {
  const [monitor,setMonitor] = useState<MonitorView>();
  const [eventOffset,setEventOffset] = useState(0);
  const [eventFilter,setEventFilter] = useState({status:'',severity:'',type:''});
  const [packetEvent,setPacketEvent] = useState<SecurityEvent | null>(null);
  const [deviceFilter,setDeviceFilter] = useState({term:'',trust:'',focus:'',compact:true});
  const [packetDevice,setPacketDevice] = useState<LocalDevice | null>(null);
  const [sourceIds,setSourceIds] = useState<string[]>([]);
  const [sourceNames,setSourceNames] = useState<Record<string,string>>({});
  const [offset,setOffset] = useState(0);
  const socket = useRef<WebSocket | null>(null);
  const admin = useAdministrator(socket);
  const {command,receive,reset} = admin;
  const [connected, connect] = useState(false);
  const [running, run] = useState(false);
  const stopping = useRef(false);
  const [pending, wait] = useState(false);
  const [error, fail] = useState('');
  const [sources, list] = useState<string[]>([]);
  const [selected, select] = useState(0);
  const [protocol, setProtocol] = useState('');
  const [query, setQuery] = useState('');
  const [activeDns, setDns] = useState(false);
  const [stats, update] = useState(empty);
  const [packets, setPackets] = useState<Packet[]>([]);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return packets.filter(packet => {
      if (packetEvent && !isAlertPacket(packet,packetEvent)) return false;
      if (packetDevice && !isDevicePacket(packet,packetDevice)) return false;
      const record = packet.details;
      if (protocol && ![packet.protocol, record?.network, record?.transport].includes(protocol)) return false;
      if (!term) return true;
      const text = [packet.source, packet.destination, packet.protocol, packet.name,
        record?.sourceHostname, record?.destinationHostname, record?.dnsQuestion, record?.observedDns?.name,
        record?.sni, record?.flowSni, record?.application];
      return text.some(value => value?.toLowerCase().includes(term)) ||
        [record?.sourcePort, record?.destinationPort].some(port => port != null && String(port) === term);
    });
  }, [packets, protocol, query, packetDevice, packetEvent]);
  const [mode, setMode] = useState<CaptureMode>();
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
        ws.send(JSON.stringify({type:'control',command:'admin_status'}));
      };
      ws.onmessage = event => {
        if (closed) return;
        try {
          const message = JSON.parse(event.data);
          if (receive(message)) return;
          const data: CaptureMessage = message;
          if (data.type === 'monitor') { setMonitor(data); return; }
          if (data.type === 'sources') {
            setMode(data.mode);
            setSourceIds(data.sources);
            list(data.sourceLabels ?? data.sources);
            setSourceNames(Object.fromEntries(data.sources.flatMap((id,i)=>{
              const name = data.sourceLabels?.[i]?.split(' · ')[0];
              return name && name !== id ? [[id,name]] : [];
            })));
            select(data.selected);
            if (typeof data.activeDns === 'boolean') setDns(data.activeDns);
            return;
          }
          if (data.type === 'dns_setting') { setDns(data.enabled); return; }
          if (data.type === 'ptr') {
            setPackets(rows => rows.map(row => {
              const p = row.details;
              if (!p || p.captureSource !== data.source || (p.source !== data.ip && p.destination !== data.ip)) return row;
              const next = {...p};
              if (next.source === data.ip) next.sourceHostname = data.name;
              if (next.destination === data.ip) next.destinationHostname = data.name;
              return {...row,details:next,name:displayName(next)};
            }));
            return;
          }
          if (data.type === 'error') { fail(data.message); wait(false); return; }
          if (data.type !== 'batch' || !Array.isArray(data.packets)) return;
          const rows = data.packets.map(packetRow);
          update({packetCount:data.packetCount, bandwidthMbps:data.bandwidthMbps, rollingMbps:data.rollingMbps,
            activeConnections:data.activeConnections, outputDrops:data.outputDrops, retained:data.retained, evicted:data.evicted, rejected:data.rejected});
          const replaceHistory = data.historyPage && data.offset === 0;
          if (rows.length || replaceHistory) {
            rows.reverse();
            setPackets(previous => replaceHistory ? rows : [...rows, ...previous].slice(0, 4096));
          }
          if (data.historyPage) {
            if (data.nextOffset != null) ws.send(JSON.stringify({type:'control',command:'history',offset:data.nextOffset}));
            else connect(true);
          }
          const active = data.captureState === 'RUNNING';
          run(active);
          if (!active || !stopping.current) wait(false);
          if (data.failed) fail(data.failureMessage || 'Capture failed. Check the backend console.');
        } catch { fail('Invalid backend message'); }
      };
      ws.onclose = event => {
        if (closed) return;
        reset(); connect(false); run(false); wait(false); list([]);
        if (event.reason) fail(event.reason);
        timer = setTimeout(open, 1200);
      };
    }
    open();
    return () => { closed = true; clearTimeout(timer); socket.current?.close(); };
  }, [receive,reset]);

  useEffect(() => {
    if (!connected || !showMonitor) return;
    const refresh = () => command('monitor',{offset,eventOffset:showAlerts ? eventOffset : 0,deviceFilter,eventFilter:showAlerts ? eventFilter : undefined});
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [connected,showMonitor,showAlerts,offset,eventOffset,deviceFilter,eventFilter,command]);

  function capture(start: boolean) {
    if (pending) return;

    if (command(start ? 'start_capture' : 'stop_capture')) {
      stopping.current = !start;
      wait(true);
      fail('');
    }
  }
  return { admin, monitor, eventFilter, setEventFilter, packetEvent, setPacketEvent, deviceFilter, setDeviceFilter, packetDevice, setPacketDevice, sourceIds, sourceNames, eventOffset, setEventOffset, offset, setOffset, connected, running, pending, error, sources, selected, protocol, setProtocol, activeDns, stats, packets, visible, query, setQuery, mode, command, capture };
}
export type Capture = ReturnType<typeof useCapture>;
