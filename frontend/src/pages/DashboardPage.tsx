/**
 * @file DashboardPage.tsx
 * Dashboard Monitoring (UC9) and Session Control (UC10).
 * Renders live packet / bandwidth / connection telemetry and start/stop capture controls.
 */
import { useEffect, useState } from 'react';
import {
  createWebSocketClient,
  type TelemetryClient,
  type TelemetryMessage,
} from '../services/telemetryClient';

const MAX_SAMPLES = 12;

interface TrafficSample {
  time: number;
  packets: number;
}

interface DashboardState {
  telemetry: TelemetryMessage;
  samples: TrafficSample[];
  selectedTime: number | null;
}

const EMPTY_TELEMETRY: TelemetryMessage = { packetCount: 0, bandwidthMbps: 0, activeConnections: 0 };

const defaultClient = createWebSocketClient();

/**
 * Dashboard page.
 * @param client Telemetry/control transport; defaults to the WebSocket client.
 */
function DashboardPage({ client = defaultClient }: { client?: TelemetryClient }) {
  const [dashboard, setDashboard] = useState<DashboardState>({
    telemetry: EMPTY_TELEMETRY,
    samples: [],
    selectedTime: null,
  });
  const [connected, setConnected] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return client.subscribe(
      (telemetry) => {
        if (telemetry.captureState) setRunning(telemetry.captureState === 'RUNNING');
        setDashboard((current) => {
          const packets = Math.max(0, telemetry.packetCount - current.telemetry.packetCount);
          const nextSample = { time: Date.now(), packets };
          const latest = current.samples[current.samples.length - 1];
          const followLatest = current.selectedTime === null || current.selectedTime === latest?.time;
          return {
            telemetry,
            samples: [...current.samples, nextSample].slice(-MAX_SAMPLES),
            selectedTime: followLatest ? nextSample.time : current.selectedTime,
          };
        });
      },
      (isConnected) => {
        setConnected(isConnected);
        if (!isConnected) {
          setRunning(false);
          setDashboard({ telemetry: EMPTY_TELEMETRY, samples: [], selectedTime: null });
        }
      },
    );
  }, [client]);

  /** Sends a start/stop control signal; the status flag changes only on success. */
  const toggleCapture = async (start: boolean) => {
    try {
      await client.sendControl(start ? 'start_capture' : 'stop_capture');
      setRunning(start);
      setError(null);
    } catch (err) {
      setError(`Could not ${start ? 'start' : 'stop'} capture: ${err instanceof Error ? err.message : 'IPC error'}`);
    }
  };

  const { telemetry } = dashboard;
  const hasChart = dashboard.samples.length >= 2;
  const selectedIndex = Math.max(
    0,
    dashboard.samples.findIndex((sample) => sample.time === dashboard.selectedTime),
  );
  const selectedSample = dashboard.samples[selectedIndex] ?? { time: 0, packets: 0 };
  const chart = { left: 58, top: 20, width: 700, height: 184 };
  const maxPackets = Math.ceil(Math.max(10, ...dashboard.samples.map((sample) => sample.packets)) / 10) * 10;
  const points = dashboard.samples.map((sample, index) => ({
    x: chart.left + (index / Math.max(1, dashboard.samples.length - 1)) * chart.width,
    y: chart.top + chart.height - (sample.packets / maxPackets) * chart.height,
  }));
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${linePath} L ${chart.left + chart.width} ${chart.top + chart.height} L ${chart.left} ${chart.top + chart.height} Z`;
  const tickIndexes = [0, Math.floor((dashboard.samples.length - 1) / 2), dashboard.samples.length - 1];

  return (
    <div className="dashboard">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">NETWORK OVERVIEW</span>
          <h1>Dashboard</h1>
          <p>At-a-glance traffic, device, and security activity.</p>
        </div>
        <span className="demo-badge">
          <span aria-hidden="true" />
          <span data-testid="capture-status">{running ? 'RUNNING' : 'PAUSED'}</span>
        </span>
      </div>

      <div className="session-controls">
        <button type="button" onClick={() => toggleCapture(true)} disabled={running}>Start capture</button>
        <button type="button" onClick={() => toggleCapture(false)} disabled={!running}>Stop capture</button>
      </div>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setError(null)}>×</button>
        </div>
      )}
      {!connected && <div className="idle-warning" role="status">Backend disconnected · capture idle</div>}

      <section className="metric-grid" aria-label="Traffic summary">
        <article className="dashboard-card metric-card">
          <div className="card-kicker">PACKETS CAPTURED</div>
          <div className="metric-value" aria-live="polite" data-testid="packet-count">{telemetry.packetCount.toLocaleString()}</div>
          <p className="metric-note">Live count from backend telemetry</p>
        </article>
        <article className="dashboard-card metric-card">
          <div className="card-kicker">BANDWIDTH</div>
          <div className="metric-value" data-testid="bandwidth">{telemetry.bandwidthMbps.toFixed(1)} <span>Mbps</span></div>
          <p className="metric-note">Live bandwidth from backend telemetry</p>
        </article>
        <article className="dashboard-card metric-card">
          <div className="card-kicker">ACTIVE CONNECTIONS</div>
          <div className="metric-value" data-testid="active-connections">{telemetry.activeConnections.toLocaleString()}</div>
          <p className="metric-note">Live connections from backend telemetry</p>
        </article>
      </section>

      <section className="dashboard-card traffic-card" aria-labelledby="traffic-title">
        <div className="section-heading">
          <div>
            <div className="card-kicker">TRAFFIC ACTIVITY</div>
            <h2 id="traffic-title">Packet rate</h2>
            <p>Packets per telemetry update · last {MAX_SAMPLES} updates</p>
          </div>
          <span className="chart-period">LIVE</span>
        </div>

        {hasChart ? (
          <>
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
                {dashboard.samples.map((sample, index) => {
                  const point = points[index];
                  const isSelected = index === selectedIndex;
                  const select = () => setDashboard((current) => ({ ...current, selectedTime: sample.time }));
                  return (
                    <g key={`${sample.time}-${index}`}>
                      <circle
                        className="chart-hit-target"
                        cx={point.x}
                        cy={point.y}
                        r="12"
                        tabIndex={0}
                        role="button"
                        aria-label={`${new Date(sample.time).toLocaleTimeString()}, ${sample.packets} packets`}
                        aria-pressed={isSelected}
                        onClick={select}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            select();
                          }
                        }}
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
                {tickIndexes.map((index) => (
                  <text
                    className="chart-axis-label"
                    key={index}
                    x={points[index].x}
                    y={chart.top + chart.height + 28}
                    textAnchor={index === 0 ? 'start' : index === dashboard.samples.length - 1 ? 'end' : 'middle'}
                  >
                    {new Date(dashboard.samples[index].time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </text>
                ))}
              </svg>
            </div>

            <div className="chart-detail" aria-live="polite">
              <div>
                <span className="detail-label">SELECTED SAMPLE</span>
                <strong>{new Date(selectedSample.time).toLocaleTimeString()}</strong>
              </div>
              <div>
                <span className="detail-label">PACKETS / UPDATE</span>
                <strong>{selectedSample.packets}</strong>
              </div>
              <span className="chart-hint">Select a chart point to inspect its data</span>
            </div>
          </>
        ) : (
          <p className="placeholder-note">Waiting for telemetry samples…</p>
        )}
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
            {[1, 2, 3].map((number) => (
              <li key={number}>
                <span className="list-index">{String(number).padStart(2, '0')}</span>
                <span><strong>Device placeholder</strong><small>Waiting for device usage data</small></span>
                <span className="waiting-value">—</span>
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
            <span className="placeholder-tag">PLACEHOLDER</span>
          </div>
          <p className="placeholder-note">Show the 3 most critical alerts here.</p>
          <ol className="placeholder-list alert-list">
            {[1, 2, 3].map((number) => (
              <li key={number}>
                <span className="alert-indicator" aria-hidden="true" />
                <span><strong>Alert placeholder</strong><small>Waiting for security alert data</small></span>
                <span className="severity-label">CRITICAL</span>
              </li>
            ))}
          </ol>
        </article>
      </section>
    </div>
  );
}

export default DashboardPage;
