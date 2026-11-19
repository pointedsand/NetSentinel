import { useState } from 'react';
import type { Packet } from '../types';
import type { AlertItem } from './alertTypes';

interface TrafficSample {
  time: number;
  packets: number;
}

type TimeRange = '2m' | '1h' | '1d';

/** Simulated overview route; the separate backend telemetry view is DashboardPage. */
export function DashboardOverview({ packets, alerts }: { packets: Packet[]; alerts: AlertItem[] }) {
  const [selectedTime, setSelectedTime] = useState<number>(() => packets[0]?.timestamp ?? 0);
  const [timeRange, setTimeRange] = useState<TimeRange>('2m');

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
  const latestBucketEnd = Math.floor(now / intervalMs) * intervalMs;
  const samples: TrafficSample[] = [];

  for (let i = sampleCount - 1; i >= 0; i--) {
    const bucketEnd = latestBucketEnd - i * intervalMs;
    const bucketStart = bucketEnd - intervalMs;

    const count = packets.filter(p => p.timestamp >= bucketStart && p.timestamp < bucketEnd).length;
    // Empty intervals use a deterministic demo baseline instead of appearing as missing data.
    const baseline = 75 + Math.floor(bucketEnd / intervalMs) % 10;

    samples.push({
      time: bucketEnd,
      packets: count > 0 ? count : baseline
    });
  }

  const selectedIndex = Math.max(0, samples.findIndex((sample) => sample.time === selectedTime));
  const selectedSample = samples[selectedIndex] || samples[samples.length - 1];

  // Estimate display bandwidth from packet count and average packet size for the demo.
  const intervalSeconds = intervalMs / 1000;
  const totalBits = selectedSample.packets * 1150 * 8;
  const synchronizedBandwidth = Math.max(12.50, (totalBits / intervalSeconds) / 1_000_000).toFixed(2);

  const chart = { left: 58, top: 20, width: 700, height: 184 };
  const maxPackets = Math.ceil(Math.max(...samples.map((s) => s.packets), 120) / 25) * 25;

  const points = samples.map((sample, index) => ({
    x: chart.left + (index / (samples.length - 1)) * chart.width,
    y: chart.top + chart.height - (sample.packets / maxPackets) * chart.height,
  }));

  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${linePath} L ${chart.left + chart.width} ${chart.top + chart.height} L ${chart.left} ${chart.top + chart.height} Z`;
  const tickIndexes = [0, Math.floor((samples.length - 1) / 2), samples.length - 1];

  return (
    <div className="dashboard">
      <div className="dashboard-heading dashboard-heading-centered">
        <div className="dashboard-title">
          <span className="eyebrow">NETWORK OVERVIEW</span>
          <h1>Dashboard</h1>
          <p>At-a-glance traffic, device, and security activity.</p>
        </div>
        <span className="demo-badge"><span aria-hidden="true" /> Home Wi-Fi Simulation Active</span>
      </div>

      <section className="metric-grid" aria-label="Traffic summary">
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
      </section>

      <section className="dashboard-card traffic-card" aria-labelledby="traffic-title">
        <div className="section-heading">
          <div>
            <div className="card-kicker">TRAFFIC ACTIVITY</div>
            <h2 id="traffic-title">Packet rate</h2>
            <p>Packets per interval · active home Wi-Fi stream</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#8998b2', fontWeight: 600 }}>Range:</span>
            <select
              value={timeRange}
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

        <div className="chart-container">
          <svg
            className="traffic-chart"
            viewBox="0 0 800 250"
            role="group"
            aria-label="Interactive packet rate chart. Select a point to inspect its data."
          >
            {[0, 0.5, 1].map((fraction) => {
              const y = chart.top + chart.height * fraction;
              const value = Math.round(maxPackets * (1 - fraction));
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
                    tabIndex={0}
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
                  {timeString}
                </text>
              );
            })}
          </svg>
        </div>

        <div className="chart-detail" aria-live="polite">
          <div>
            <span className="detail-label">SELECTED SAMPLE</span>
            <strong>{new Date(selectedSample.time).toLocaleTimeString()}</strong>
          </div>
          <div>
            <span className="detail-label">PACKETS / INTERVAL</span>
            <strong>{selectedSample.packets}</strong>
          </div>
          <div>
            <span className="detail-label">AVERAGE RATE</span>
            <strong>{(selectedSample.packets / intervalSeconds).toFixed(1)} <span>packets/sec</span></strong>
          </div>
          <span className="chart-hint">Select a chart point to inspect its data</span>
        </div>
      </section>

      <section className="overview-grid" aria-label="Device and alert placeholders">
        <article className="dashboard-card overview-card">
          <div className="section-heading">
            <div>
              <div className="card-kicker">DEVICE ACTIVITY</div>
              <h2>Top data users</h2>
            </div>
            <span className="placeholder-tag">PLACEHOLDER</span>
          </div>
          <p className="placeholder-note">Show the 3 devices using the most data here.</p>
          <ol className="placeholder-list">
            {[
              { name: 'MacBook Pro (Spotify Streaming)', usage: '42.8 MB' },
              { name: 'iPhone 15 (Web Surfing / Social)', usage: '18.2 MB' },
              { name: 'Smart TV (Buffer Stream)', usage: '94.5 MB' }
            ].map((dev, number) => (
              <li key={number}>
                <span className="list-index">{String(number + 1).padStart(2, '0')}</span>
                <span><strong>{dev.name}</strong><small>Active home Wi-Fi client</small></span>
                <span className="waiting-value">{dev.usage}</span>
              </li>
            ))}
          </ol>
        </article>

        <article className="dashboard-card overview-card">
          <div className="section-heading">
            <div>
              <div className="card-kicker">SECURITY</div>
              <h2>Critical alerts</h2>
            </div>
            <span className="placeholder-tag">LIVE</span>
          </div>
          <p className="placeholder-note">Top unacknowledged critical and high-severity alerts.</p>
          <ol className="placeholder-list alert-list">
            {alerts
              .filter((alert) => !alert.acknowledged && (alert.severity === 'Critical' || alert.severity === 'High'))
              .slice(0, 3)
              .map((alert) => (
                <li key={alert.id}>
                  <span className="alert-indicator" aria-hidden="true" />
                  <span><strong>{alert.alertType}</strong><small>{alert.ipAddress} · {alert.deviceName}</small></span>
                  <span className="severity-label">{alert.severity.toUpperCase()}</span>
                </li>
              ))}
            {alerts.filter((alert) => !alert.acknowledged && (alert.severity === 'Critical' || alert.severity === 'High')).length === 0 && (
              <li><span><strong>No active critical alerts</strong><small>All high-priority warnings are acknowledged.</small></span></li>
            )}
          </ol>
        </article>
      </section>
    </div>
  );
}
