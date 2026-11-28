import { sourceName } from '../deviceIdentity';
import type { Capture } from '../hooks/useCapture';

export function CaptureSource({state}: {state:Capture}) {
  return <select aria-label="Capture source" title={state.sourceIds[state.selected]} className="source-select"
    value={state.selected} disabled={!state.connected || state.running || state.pending || !state.sources.length}
    onChange={e=>state.command('select_source',{index:Number(e.target.value)})}>
    {!state.sources.length && <option value={0}>Awaiting source</option>}
    {state.sources.map((_,i)=><option key={state.sourceIds[i]} value={i}>{sourceName(state,i)}</option>)}
  </select>;
}

export function NameResolution({state}: {state:Capture}) {
  return <section className="dashboard-card preferences-card"><h2>Name resolution</h2>
    <label><input type="checkbox" checked={state.activeDns} disabled={!state.connected}
      onChange={e=>state.command('active_dns',{enabled:e.target.checked})}/> Active reverse DNS lookups</label>
    <p>Look up hostnames for observed addresses in the background.</p></section>;
}

export function PacketHistorySettings({state}: {state:Capture}) {
  return <section className="dashboard-card preferences-card"><h2>Packet History &amp; Performance</h2>
    <label htmlFor="history-limit">Packet history limit</label>
    <select id="history-limit" disabled={!state.connected || !state.historyOptions.length}
      value={state.stats.historyCapacity ?? ''} onChange={e=>state.command('history_limit',{limit:Number(e.target.value)})}>
      {state.historyOptions.map(({limit,label})=><option key={limit} value={limit}>{limit.toLocaleString()} packets — {label}</option>)}
    </select>
    <p>Choose how many recent packet records NetSentinel keeps available for inspection.
      Reducing the limit immediately removes the oldest excess records.</p></section>;
}

export function CaptureControls({state}: {state:Capture}) {
  const {packetCount, rejected, retained, historyCapacity, evicted, outputDrops} = state.stats;
  const stored = historyCapacity == null ? retained.toLocaleString() :
    retained.toLocaleString() + ' / ' + historyCapacity.toLocaleString();
  return <><h2>Capture session</h2>
    <label>Capture source<CaptureSource state={state}/></label>
    <label>Display protocol<select aria-label="Display protocol" value={state.protocol} onChange={e=>state.setProtocol(e.target.value)}>
      <option value="">All protocols</option>{['IPv4','IPv6','TCP','UDP','ICMP','ICMPv6','ARP','LLDP','IGMP','ESP','OTHER'].map(p=><option key={p}>{p}</option>)}
    </select></label>
    <dl className="rail-totals">
      <div><dt>Captured frames</dt><dd>{(packetCount + rejected).toLocaleString()}</dd></div>
    </dl>
    <details className="session-diagnostics"><summary>Session details</summary><dl className="rail-totals">
      <div><dt>Retained / capacity</dt><dd>{stored}</dd></div>
      <div><dt>Output drops</dt><dd>{outputDrops.toLocaleString()}</dd></div>
      <div><dt>History evictions</dt><dd>{evicted.toLocaleString()}</dd></div>
      <div><dt>Rejected</dt><dd>{rejected.toLocaleString()}</dd></div>
      <div><dt>Reverse DNS</dt><dd>{state.activeDns?'On':'Off'}</dd></div></dl>
      <p>Output drops count records the worker could not queue for delivery. History evictions count older retained records removed from memory.</p>
      <p>{state.sourceIds[state.selected]}</p></details>
  </>;
}
