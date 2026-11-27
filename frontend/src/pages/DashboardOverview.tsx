import type { Capture } from '../hooks/useCapture';
import { TrafficSummary } from './DashboardPage';
import { eventLabel } from '../alertEvidence';
import { useState, useRef, useEffect } from 'react';
import type { Packet } from '../types';
import type { AlertItem } from './alertTypes';

interface TrafficSample {
  time: number;
  packets: number;
  kbps: number;
}

type TimeRange = '2m' | '1h' | '1d';

/** Simulated overview route; the separate backend telemetry view is DashboardPage. */
export function DashboardOverview({ packets, alerts, capture, inspect, navigate }: { navigate:(page:'alerts'|'packets')=>void; packets: Packet[]; alerts: AlertItem[]; capture?: Capture; inspect?: (id: number) => void }) {
  const [selectedTime, setSelectedTime] = useState<number>(() => packets[0]?.timestamp ?? 0);
  const [timeRange, setTimeRange] = useState<TimeRange>('2m');

  const [metric,setMetric] = useState('packets');
  const plot = useRef<HTMLDivElement>(null);
  const [width,setWidth] = useState(850);
  useEffect(()=>{
    if (!plot.current || typeof ResizeObserver==='undefined') return;
    const observer=new ResizeObserver(([entry])=>setWidth(Math.max(300,entry.contentRect.width)));
    observer.observe(plot.current);
    return ()=>observer.disconnect();
  },[]);
  const now = packets.reduce((latest, packet) => Math.max(latest, packet.timestamp), 0);

  // Configure sample count and bucket intervals based on selected range
  let sampleCount = 12;
  let intervalMs = 10_000; // 2m mode: 10-second buckets

  if (timeRange === '1h') {
    sampleCount = 12;
    intervalMs = 5 * 60 * 1000; // 1h mode: 5-minute buckets
  } else if (timeRange === '1d') {
    sampleCount = 24;
    intervalMs = 30 * 60 * 1000; // 24h mode: 30-minute buckets
  }

  // Anchor buckets to wall-clock interval boundaries so packet counts stay stable between updates.
  const latestBucketEnd = (Math.floor(now / intervalMs) + (capture ? 1 : 0)) * intervalMs;
  const samples: TrafficSample[] = [];
  const firstBucketStart = latestBucketEnd - sampleCount * intervalMs;
  const counts = new Array<number>(sampleCount).fill(0);
  const bytes = new Array<number>(sampleCount).fill(0);
  for (const packet of packets) {
    const index = Math.floor((packet.timestamp - firstBucketStart) / intervalMs);
    if (index >= 0 && index < sampleCount) { counts[index]++; bytes[index]+=packet.sizeBytes; }
  }

  for (let i = sampleCount - 1; i >= 0; i--) {
    const bucketEnd = latestBucketEnd - i * intervalMs;
    const count = counts[sampleCount - 1 - i];
    // Empty intervals use a deterministic demo baseline instead of appearing as missing data.
    const baseline = 75 + Math.floor(bucketEnd / intervalMs) % 10;

    samples.push({
      time: bucketEnd,
      kbps: bytes[sampleCount-1-i]*8/intervalMs,
      packets: count > 0 || capture ? count : baseline
    });
  }

  const selection = samples.findIndex(sample => sample.time === selectedTime);
  const selectedIndex = selection >= 0 ? selection : capture ? samples.length - 1 : 0;
  const selectedSample = samples[selectedIndex] || samples[samples.length - 1];

  // Estimate display bandwidth from packet count and average packet size for the demo.
  const intervalSeconds = intervalMs / 1000;
  const totalBits = selectedSample.packets * 1150 * 8;
  const synchronizedBandwidth = Math.max(12.50, (totalBits / intervalSeconds) / 1_000_000).toFixed(2);

  const chart = { left: 70, top: 12, width: width-92, height: 110 };
  const valueOf = (s:TrafficSample) => metric==='bandwidth'?s.kbps:s.packets/intervalSeconds;
  const peak = Math.max(...samples.map(valueOf));
  const maxPackets = peak > 0 ? 2 ** Math.ceil(Math.log2(peak)) : 1;
  const formatRate = (rate: number) => rate===0?'0':Number(rate.toPrecision(3)).toString();

  const points = samples.map((sample, index) => ({
    x: chart.left + (index / (samples.length - 1)) * chart.width,
    y: chart.top + chart.height - (valueOf(sample) / maxPackets) * chart.height,
  }));

  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${linePath} L ${chart.left + chart.width} ${chart.top + chart.height} L ${chart.left} ${chart.top + chart.height} Z`;
  const tickIndexes = [0, Math.floor((samples.length - 1) / 2), samples.length - 1];

  const recentAlerts = capture ? (capture.monitor?.events ?? []).slice(0,5).map(e=>({id:e.id,label:eventLabel(e),subject:e.deviceName||e.ip||e.origin,time:e.time})) :
    alerts.filter(e=>!e.acknowledged).sort((a,b)=>b.timestamp-a.timestamp).slice(0,5).map(e=>({id:e.id,label:e.alertType,subject:e.deviceName,time:e.timestamp}));
  return (
    <div className="dashboard desktop-overview">
      <section className="dashboard-card traffic-card" aria-labelledby="traffic-title">
        <div className="section-heading">
          <div>

            <h2 id="traffic-title">Traffic activity</h2>
            <p>{capture ? 'Retained observations · '+(metric==='bandwidth'?'kb/s':'packets/s') : 'Simulated packets/s'}</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {capture && <select className="modal-select" aria-label="Chart metric" value={metric} onChange={e=>setMetric(e.target.value)}><option value="packets">Packet rate</option><option value="bandwidth">Bandwidth</option></select>}
            <span style={{ fontSize: '11px', color: '#8998b2', fontWeight: 600 }}>Range:</span>
            <select
              aria-label="Time range" value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              className="modal-select"
              style={{ width: '110px', padding: '4px 8px', fontSize: '11px' }}
            >
              <option value="2m">Last 2 Minutes</option>
              <option value="1h">Last 1 Hour</option>
              <option value="1d">Last 24 Hours</option>
            </select>
          </div>
        </div>

        <div className="chart-container" ref={plot}>
          {capture && !packets.length && <p className="chart-empty">Waiting for captured frames</p>}
          <svg
            className="traffic-chart"
            viewBox={'0 0 '+width+' 158'}
            role="group"
            aria-label={'Interactive '+(metric==='bandwidth'?'bandwidth':'packet rate')+' chart'}
          >
            {[0, 0.5, 1].map((fraction) => {
              const y = chart.top + chart.height * fraction;
              const value = formatRate(maxPackets * (1 - fraction));
              return (
                <g key={fraction}>
                  <line className="chart-gridline" x1={chart.left} x2={chart.left + chart.width} y1={y} y2={y} />
                  <text className="chart-axis-label" x={chart.left - 12} y={y + 4} textAnchor="end">{value}</text>
                </g>
              );
            })}
            <path className="chart-area" d={areaPath} />
            <path className="chart-line" d={linePath} />
            {samples.map((sample, index) => {
              const point = points[index];
              const isSelected = index === selectedIndex;
              return (
                <g key={sample.time}>
                  <circle
                    className="chart-hit-target"
                    cx={point.x}
                    cy={point.y}
                    r="12"
                    tabIndex={packets.length?0:-1}
                    aria-pressed={isSelected}
                    aria-label={new Date(sample.time).toLocaleTimeString()+' · '+formatRate(valueOf(sample))+(metric==='bandwidth'?' kb/s':' packets/s')}
                    onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelectedTime(sample.time);}}}
                    role="button"
                    onClick={() => setSelectedTime(sample.time)}
                  />
                  <circle
                    className={`chart-point${isSelected ? ' is-selected' : ''}`}
                    cx={point.x}
                    cy={point.y}
                    r={isSelected ? 5 : 3.5}
                    aria-hidden="true"
                  />
                </g>
              );
            })}
            {tickIndexes.map((index) => {
              const sampleTime = samples[index]?.time || now;
              const timeString = timeRange === '1d'
                ? new Date(sampleTime).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit' })
                : new Date(sampleTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: timeRange === '2m' ? '2-digit' : undefined });
              return (
                <text
                  className="chart-axis-label"
                  key={index}
                  x={points[index].x}
                  y={chart.top + chart.height + 28}
                  textAnchor={index === 0 ? 'start' : index === samples.length - 1 ? 'end' : 'middle'}
                >
                  {now?timeString:'—'}
                </text>
              );
            })}
          </svg>
        </div>

        <div className="chart-detail" aria-live="polite">
          <div>
            <span className="detail-label">SELECTED SAMPLE</span>
            <strong>{now?new Date(selectedSample.time).toLocaleTimeString():'—'}</strong>
          </div>
          <div>
            <span className="detail-label">PACKETS / INTERVAL</span>
            <strong>{selectedSample.packets}</strong>
          </div>
          <div>
            <span className="detail-label">AVERAGE RATE</span>
            <strong>{formatRate(valueOf(selectedSample))} <span>{metric==='bandwidth'?'kb/s':'packets/s'}</span></strong>
          </div>

        </div>
      </section>

      {capture ? <TrafficSummary captureMode={capture.mode} telemetry={{ ...capture.stats, packetCount: capture.stats.packetCount + capture.stats.rejected }} /> : <section className="metric-grid" aria-label="Traffic summary">
        <article className="dashboard-card metric-card">
          <div className="card-kicker">PACKETS CAPTURED</div>
          <div className="metric-value" aria-live="polite">{(12584 + packets.length).toLocaleString()}</div>
          <p className="metric-note">Live home network packet count (~80 pkts / 10s)</p>
        </article>

        <article className="dashboard-card metric-card">
          <div className="card-kicker">BANDWIDTH</div>
          <div className="metric-value" aria-live="polite">
            {synchronizedBandwidth} <span>Mbps</span>
          </div>
          <p className="metric-note">Synchronized home Wi-Fi throughput (~15 Mbps)</p>
        </article>
        <article className="dashboard-card metric-card"><div className="card-kicker">ACTIVE CONNECTIONS</div><div className="metric-value">—</div><p className="metric-note">Unavailable in simulation</p></article>
      </section>}

      <section className="overview-previews">
        <article className="dashboard-card"><header><h2>Recent packets</h2><button onClick={()=>navigate('packets')}>View all packets ↗</button></header>
          {packets.length ? <ol className="preview-list">{packets.slice(0,6).map(p=><li key={p.id}>
            <button className="preview-packet" aria-label={String(p.id)} onClick={()=>inspect ? inspect(p.id) : navigate('packets')}>
              <span className="protocol-tag">{p.protocol}</span><span title={p.source+' → '+p.destination}>{p.source} → {p.destination}</span><time>{p.time}</time>
            </button></li>)}</ol> : <p className="preview-empty">Captured packets will appear here.</p>}
        </article>
        <article className="dashboard-card"><header><h2>Recent security alerts</h2><button onClick={()=>navigate('alerts')}>View all alerts ↗</button></header>
          {recentAlerts.length ? <ol className="preview-list">{recentAlerts.map(e=><li key={e.id} className="preview-alert"><i aria-hidden="true"/><span><strong>{e.label}</strong><small>{e.subject}</small></span><time>{new Date(e.time).toLocaleTimeString()}</time></li>)}</ol> :
            <p className="preview-empty">{capture && !capture.connected?'Monitoring disconnected.':capture && !capture.monitor?'Waiting for monitoring data.':'No recent security alerts.'}</p>}
        </article>
      </section>
    </div>
  );
}
