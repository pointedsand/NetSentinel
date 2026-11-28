import { useMemo, useState } from 'react';
import { eventLabel, alertSummary, isAlertPacket, severityLabel } from '../alertEvidence';
import { interfaceName } from '../deviceIdentity';
import type { Capture } from '../hooks/useCapture';
import type { Packet, SecurityEvent } from '../types';
import { AlertRuleSettings } from './AlertRuleSettings';
import '../styles/monitoring-alerts.css';

interface CardProps {
  event: SecurityEvent; adapter: string; packets: Packet[]; connected: boolean;
  acknowledge: ()=>void; onPackets:(event:SecurityEvent)=>void;
}

function AlertCard({event,adapter,packets,connected,acknowledge,onPackets}: CardProps) {
  const [expanded,setExpanded] = useState(false);
  const related = useMemo(()=>expanded ? packets.filter(p=>isAlertPacket(p,event)).length : 0,[packets,event,expanded]);
  const time = new Date(event.time);
  const severity = severityLabel(event.severity);
  return <article className="security-entry" data-severity={severity}>
    <div className="security-entry-body">
      <button type="button" className="security-open" aria-expanded={expanded} aria-controls={'details-'+event.id}
        onClick={()=>setExpanded(!expanded)}>
        <span className="security-event-heading"><strong>{eventLabel(event)}</strong>
          {!event.acknowledged && event.type==='Device arrival' && event.evidence.includes('Trust: untrusted.') && <small className="needs-review">Needs review</small>}</span>
        <span className="security-meta"><time dateTime={time.toISOString()}>{time.toLocaleString()}</time>
          <span>{event.origin}</span><span>{event.deviceName || event.ip || event.mac || adapter}</span></span>
        <span className="security-description">{alertSummary(event)}</span>
        <span className="security-disclosure">{expanded ? 'Hide details' : 'Show details'}</span>
      </button>
      <div className="security-review"><span>{event.acknowledged ? 'Acknowledged' : 'Unacknowledged'}</span>
        {!event.acknowledged && <button className="tool-btn" disabled={!connected} onClick={acknowledge}>Acknowledge</button>}</div>
    </div>
    {expanded && <section id={'details-'+event.id} className="security-details" aria-label="Alert details">
      <dl>
        <div><dt>Detection rule</dt><dd>{event.type}</dd></div>
        <div><dt>Recorded severity</dt><dd>{event.severity}</dd></div>
        <div><dt>Exact time (UTC)</dt><dd>{time.toISOString()}</dd></div>
        <div><dt>Observed via</dt><dd>{adapter}</dd></div>
        <div><dt>Affected IP</dt><dd>{event.ip || 'Interface-wide'}</dd></div>
        <div><dt>Affected MAC</dt><dd>{event.mac || 'Unavailable'}</dd></div>
        {event.deviceName && <div><dt>Related device</dt><dd>{event.deviceName}</dd></div>}
        {event.measurement && <div><dt>Threshold at detection</dt><dd>{event.measurement.thresholdPps} frames/s</dd></div>}
        <div className="security-wide"><dt>Technical evidence</dt><dd>{event.evidence}</dd></div>
        <div className="security-wide"><dt>Capture source</dt><dd>{event.source}</dd></div>
      </dl>
      {related > 0 && event.measurement && <p>Retained observations in the measurement window. The detector used aggregate counters.</p>}
      {related ? <button className="tool-btn" onClick={()=>onPackets(event)}>View related packets ({related})</button> :
        <p>{event.type === 'Capture rate above threshold' ? 'Aggregate counter observation. No individual packet attribution.' : 'No matching retained packet records for this observation.'}</p>}
    </section>}
  </article>;
}

export function MonitoringAlerts({capture,onPackets}: {capture:Capture; onPackets:(event:SecurityEvent)=>void}) {
  const outdated = Boolean(capture.monitor && !capture.monitor.severityCounts);
  const view = outdated ? undefined : capture.monitor;
  const filters = capture.eventFilter;
  const names = {...capture.sourceNames,...view?.interfaceNames};
  function filter(field:keyof typeof filters, value:string) {
    capture.setEventOffset(0);
    capture.setEventFilter(previous=>({...previous,[field]:value}));
  }
  const fields = {eventOffset:view?.eventOffset,eventFilter:filters};
  const unavailable = view?.status.includes('unavailable');
  const empty = !capture.connected ? 'Security monitoring disconnected.' :
    outdated ? 'Monitoring unavailable. Restart the local backend to load the updated alert history.' :
    !view ? 'Waiting for monitoring data…' : unavailable ? 'Monitoring unavailable on this adapter.' :
    view.eventTotal ? 'No alerts match the current filters.' : 'No security events recorded.';
  return <section className="dashboard security-workspace">
    <header className="security-heading"><div><h1>Security Alerts</h1>
      <p role="status">{capture.connected ? view?.status || (outdated ? 'Monitoring unavailable' : 'Loading monitoring state…') : 'Security monitoring disconnected.'}</p></div>
      {view && <dl className="security-counts"><div><dt>Retained</dt><dd>{view.eventTotal}</dd></div>
        <div><dt>Unacknowledged</dt><dd>{view.unacknowledged}</dd></div>
        {Object.entries(view.severityCounts).map(([level,n])=><div key={level}><dt>{severityLabel(level)}</dt><dd>{n}</dd></div>)}</dl>}
    </header>
    {(view?.storageError || capture.error) && <p role="alert">{view?.storageError || capture.error}</p>}
    <section className="security-history" aria-label="Alert history">
      <header><h2>Alert history</h2><div className="security-filters">
        <label>Review status<select aria-label="Review status" value={filters.status} onChange={e=>filter('status',e.target.value)}>
          <option value="">All alerts</option><option value="unacknowledged">Unacknowledged</option>
          <option value="acknowledged">Acknowledged</option></select></label>
        <label>Severity<select aria-label="Severity" value={filters.severity} onChange={e=>filter('severity',e.target.value)}>
          <option value="">All severities</option>{Object.keys(view?.severityCounts || {}).map(s=><option key={s} value={s}>{severityLabel(s)}</option>)}</select></label>
        <label>Detection type<select aria-label="Detection type" value={filters.type} onChange={e=>filter('type',e.target.value)}>
          <option value="">All detections</option>{view?.eventTypes.map(t=><option key={t}>{t}</option>)}</select></label>
      </div></header>
      {view?.events.length ? <div className="security-list">{view.events.map(event=>
        <AlertCard key={event.id} event={event} adapter={event.interfaceName || interfaceName(event.source,names)}
          packets={capture.packets} connected={capture.connected} onPackets={onPackets}
          acknowledge={()=>capture.command('ack_event',{...fields,id:event.id})}/>)}</div> :
        <p className="security-empty">{empty}</p>}
      {view && <footer><span>{view.eventMatches} matching · {view.suppressed} arrival notifications rate-limited · {capture.stats.outputDrops} output drops</span>
        {view.eventMatches > 24 && <nav aria-label="Alert pages"><button className="tool-btn" disabled={!view.eventOffset}
          onClick={()=>capture.setEventOffset(view.eventOffset-24)}>Previous</button>
          <span>{view.eventOffset+1}–{view.eventOffset+view.events.length}</span>
          <button className="tool-btn" disabled={view.eventOffset+24>=view.eventMatches} onClick={()=>capture.setEventOffset(view.eventOffset+24)}>Next</button></nav>}</footer>}
    </section>
    {view && <AlertRuleSettings rules={view.rules} disabled={!capture.connected}
      save={rules=>capture.command('monitor_rules',{...fields,rules})}/>}
  </section>;
}
