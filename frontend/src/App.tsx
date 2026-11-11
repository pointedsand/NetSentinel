import { useEffect, useState, type ReactNode } from 'react';
import netSentinelMark from './assets/netsentinel-mark.png';
import './App.css';

// Supported top-level pages in the application. This defines the valid navigation targets.
type PageId = 'dashboard' | 'packets' | 'devices' | 'alerts' | 'logs' | 'settings';

// Navigation entries displayed in the main app menu.
const pages: { id: PageId; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'packets', label: 'Packets' },
  { id: 'devices', label: 'Devices' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'logs', label: 'Logs' },
  { id: 'settings', label: 'Settings' },
];

// Shared layout wrapper that manages the active page and renders the selected panel.
function AppShell({ children }: { children: (activePage: PageId) => ReactNode }) {
  // Keeps track of the currently selected navigation item.
  const [activePage, setActivePage] = useState<PageId>('dashboard');

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <button
            className="brand"
            type="button"
            aria-label="NetSentinel home"
            onClick={() => setActivePage('dashboard')}
          >
            <img src={netSentinelMark} alt="" />
            <span>NetSentinel</span>
          </button>

          {/* Main app navigation bar for switching between sections. */}
          <nav className="main-navigation" aria-label="Main navigation">
            {pages.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-current={activePage === id ? 'page' : undefined}
                onClick={() => setActivePage(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Renders the content associated with the active page. */}
      <main className="page-content">{children(activePage)}</main>
    </div>
  );
}

const SAMPLE_INTERVAL_MS = 10_000;

interface TrafficSample {
  time: number;
  packets: number;
}

interface DashboardState {
  packetCount: number;
  samples: TrafficSample[];
  selectedTime: number;
}

function createInitialDashboardState(): DashboardState {
  const packetSamples = [14, 19, 16, 23, 18, 27, 21, 17, 25, 20, 29, 24];
  const now = Date.now();
  const samples = packetSamples.map((packets, index) => ({
    time: now - (packetSamples.length - index - 1) * SAMPLE_INTERVAL_MS,
    packets,
  }));

  return {
    packetCount: 12_584,
    samples,
    selectedTime: samples[samples.length - 1].time,
  };
}

function Dashboard() {
  const [dashboard, setDashboard] = useState(createInitialDashboardState);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setDashboard((current) => {
        const packets = 12 + (current.packetCount % 19);
        const nextSample = { time: Date.now(), packets };
        const samples = [...current.samples.slice(1), nextSample];
        const selectedSampleIsLatest =
          current.selectedTime === current.samples[current.samples.length - 1].time;

        return {
          packetCount: current.packetCount + packets,
          samples,
          selectedTime:
            selectedSampleIsLatest || !samples.some((sample) => sample.time === current.selectedTime)
              ? nextSample.time
              : current.selectedTime,
        };
      });
    }, SAMPLE_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  const selectedIndex = Math.max(
    0,
    dashboard.samples.findIndex((sample) => sample.time === dashboard.selectedTime),
  );
  const selectedSample = dashboard.samples[selectedIndex];
  const chart = { left: 58, top: 20, width: 700, height: 184 };
  const maxPackets = Math.ceil(Math.max(...dashboard.samples.map((sample) => sample.packets)) / 10) * 10;
  const points = dashboard.samples.map((sample, index) => ({
    x: chart.left + (index / (dashboard.samples.length - 1)) * chart.width,
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
        <span className="demo-badge"><span aria-hidden="true" /> Frontend demo data</span>
      </div>

      <section className="metric-grid" aria-label="Traffic summary">
        <article className="dashboard-card metric-card">
          <div className="card-kicker">PACKETS CAPTURED</div>
          <div className="metric-value" aria-live="polite">{dashboard.packetCount.toLocaleString()}</div>
          <p className="metric-note">Demo count · refreshes every 10 seconds</p>
        </article>
        <article className="dashboard-card metric-card">
          <div className="card-kicker">BANDWIDTH</div>
          <div className="metric-value metric-placeholder">— <span>Mbps</span></div>
          <p className="metric-note">Placeholder · waiting for bandwidth data</p>
        </article>
      </section>

      <section className="dashboard-card traffic-card" aria-labelledby="traffic-title">
        <div className="section-heading">
          <div>
            <div className="card-kicker">TRAFFIC ACTIVITY</div>
            <h2 id="traffic-title">Packet rate</h2>
            <p>Packets per 10 seconds · last 2 minutes · simulated demo data</p>
          </div>
          <span className="chart-period">LIVE DEMO</span>
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
            {dashboard.samples.map((sample, index) => {
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
                    aria-label={`${new Date(sample.time).toLocaleTimeString()}, ${sample.packets} packets in 10 seconds`}
                    aria-pressed={isSelected}
                    onClick={() => setDashboard((current) => ({ ...current, selectedTime: sample.time }))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setDashboard((current) => ({ ...current, selectedTime: sample.time }));
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
            <span className="detail-label">PACKETS / 10 SEC</span>
            <strong>{selectedSample.packets}</strong>
          </div>
          <div>
            <span className="detail-label">AVERAGE RATE</span>
            <strong>{(selectedSample.packets / 10).toFixed(1)} <span>packets/sec</span></strong>
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

export function App() {
  return (
    <AppShell>
      {(activePage: PageId) => {
        // Render the appropriate content panel based on the selected page.
        switch (activePage) {
          case 'dashboard':
            return <Dashboard />;
          case 'packets':
            return <div><h1>Packet Inspector</h1><p>Live stream table goes here.</p></div>;
          case 'devices':
            return <div><h1>Device Inventory</h1><p>Subnet scan list goes here.</p></div>;
          case 'alerts':
            return <div><h1>Security Warnings</h1><p>Alert logs go here.</p></div>;
          case 'logs':
            return <div><h1>Log Viewer</h1><p>Clear historical logs interface goes here.</p></div>;
          case 'settings':
            return <div><h1>Configuration Settings</h1><p>Startup & threshold config forms go here.</p></div>;
          default:
            // Fallback ensures a valid view is always displayed.
            return <div><h1>Dashboard View</h1><p>Real-time traffic metrics go here.</p></div>;
        }
      }}
    </AppShell>
  );
}

export default App;