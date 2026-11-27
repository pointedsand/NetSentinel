import { interfaceName } from '../deviceIdentity';
import type { Capture } from '../hooks/useCapture';

export function CaptureControls({ state, startButton = true }: { state: Capture; startButton?: boolean }) {
  const { connected,running,pending,error,sources,selected,protocol,setProtocol,activeDns,stats,mode,command,capture } = state;
  return <section className="dashboard-card capture-controls" aria-label="Capture controls">
    <p role="status">{connected ? 'Backend connected' : 'Backend disconnected · reconnecting'} · {mode === '--replay' ? 'PCAP replay' : mode ? 'Live interface' : 'Waiting for source'} · {running ? 'Running' : 'Paused'} · Output drops: {stats.outputDrops}</p>
    {error && <p role="alert">{error}</p>}
    <label><input type="checkbox" checked={activeDns} disabled={!connected}
      onChange={e => command('active_dns',{enabled:e.target.checked})} /> Active reverse DNS lookups</label>
    <label>Capture source <select className="modal-select" value={selected} disabled={!connected || running || pending}
      onChange={e => command('select_source', {index:Number(e.target.value)})}>
      {sources.map((s,i) => <option key={state.sourceIds[i]} title={state.sourceIds[i]} value={i}>{interfaceName(state.sourceIds[i] ?? s,{...state.sourceNames,...state.monitor?.interfaceNames})}</option>)}
    </select></label>
    <p>Captured frames: {stats.packetCount + stats.rejected} · Retained: {stats.retained} · Evicted: {stats.evicted}</p>
    <label>Display protocol <select className="modal-select" value={protocol}
      onChange={e => setProtocol(e.target.value)}>
      <option value="">All protocols</option>
      {['IPv4','IPv6','TCP','UDP','ICMP','ICMPv6','ARP','LLDP','IGMP','ESP','OTHER'].map(p => <option key={p}>{p}</option>)}
    </select></label>
    {startButton && <button className={`control-btn ${running ? "btn-stop" : "btn-start"}`} disabled={!connected || pending} onClick={() => capture(!running)}>{running ? "Stop capture" : "Start capture"}</button>}
  </section>;
}
