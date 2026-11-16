import { useEffect, useState, type ReactNode } from 'react';
import netSentinelMark from './assets/netsentinel-mark.png';
import './App.css';
import { LogViewerPage } from './pages/LogViewerPage';
import { SettingsPage } from './pages/SettingsPage';

type PageId = 'dashboard' | 'packets' | 'devices' | 'alerts' | 'logs' | 'settings';
type TimeRange = '2m' | '1h' | '1d';

const pages: { id: PageId; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'packets', label: 'Packets' },
  { id: 'devices', label: 'Devices' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'logs', label: 'Logs' },
  { id: 'settings', label: 'Settings' },
];

function AppShell({ children, activePage, setActivePage }: { children: ReactNode; activePage: PageId; setActivePage: (page: PageId) => void }) {
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

      <main className="page-content">{children}</main>
    </div>
  );
}

interface TrafficSample {
  time: number;
  packets: number;
}

interface Packet {
  id: number;
  source: string;
  destination: string;
  protocol: string;
  size: string;
  sizeBytes: number;
  name: string;
  timestamp: number;
  time: string;
}

function Dashboard({ packets }: { packets: Packet[] }) {
  const [selectedTime, setSelectedTime] = useState<number>(Date.now());
  const [timeRange, setTimeRange] = useState<TimeRange>('2m');

  const now = Date.now();

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

  // True rolling buckets anchored strictly to the interval boundary so updates happen per interval, not per second
  const latestBucketEnd = Math.floor(now / intervalMs) * intervalMs;
  const samples: TrafficSample[] = [];

  for (let i = sampleCount - 1; i >= 0; i--) {
    const bucketEnd = latestBucketEnd - i * intervalMs;
    const bucketStart = bucketEnd - intervalMs;
    
    const count = packets.filter(p => p.timestamp >= bucketStart && p.timestamp < bucketEnd).length;
    const baseline = Math.floor(Math.random() * 10) + 75;

    samples.push({ 
      time: bucketEnd, 
      packets: count > 0 ? count : baseline 
    });
  }

  const selectedIndex = Math.max(0, samples.findIndex((sample) => sample.time === selectedTime));
  const selectedSample = samples[selectedIndex] || samples[samples.length - 1];

  // Mathematically derive bandwidth to match ~80 packets / 10s (~15 Mbps)
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
      <div className="dashboard-heading">
        <div>
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

function LivePacketCapture({
  packets,
  setPackets,
  isCapturing,
  setIsCapturing,
  onNavigateDashboard
}: {
  packets: Packet[];
  setPackets: React.Dispatch<React.SetStateAction<Packet[]>>;
  isCapturing: boolean;
  setIsCapturing: (val: boolean) => void;
  onNavigateDashboard: () => void;
}) {
  const [filterText, setFilterText] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('PCAP');
  const [exportRange, setExportRange] = useState('all');
  const [selectedPacketIds, setSelectedPacketIds] = useState<number[]>([]);

  const filteredPackets = packets.filter(p => {
    const q = filterText.toLowerCase();
    return (
      p.source.toLowerCase().includes(q) ||
      p.destination.toLowerCase().includes(q) ||
      p.protocol.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q)
    );
  });

  // Fully functional file export handler with native file location picker
  const handleExport = async () => {
    let dataToExport = packets;
    if (exportRange === 'filtered') {
      dataToExport = filteredPackets;
    } else if (exportRange === 'selected') {
      dataToExport = packets.filter(p => selectedPacketIds.includes(p.id));
    }

    let fileContent = '';
    let mimeType = 'text/plain';
    let defaultExtension = 'txt';
    let description = 'Text File';

    if (exportFormat === 'JSON') {
      fileContent = JSON.stringify(dataToExport, null, 2);
      mimeType = 'application/json';
      defaultExtension = 'json';
      description = 'JSON Capture Log';
    } else if (exportFormat === 'CSV') {
      const headers = ['ID', 'Source', 'Destination', 'Protocol', 'Size', 'Name', 'Timestamp', 'Time'];
      const rows = dataToExport.map(p => [p.id, p.source, p.destination, p.protocol, `"${p.size}"`, `"${p.name}"`, p.timestamp, `"${p.time}"`]);
      fileContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      mimeType = 'text/csv';
      defaultExtension = 'csv';
      description = 'CSV Spreadsheet';
    } else {
      fileContent = dataToExport.map(p => `[${p.time}] ${p.protocol} ${p.source} -> ${p.destination} (${p.size}) - ${p.name}`).join('\n');
      mimeType = 'application/vnd.tcpdump.pcap';
      defaultExtension = 'pcap';
      description = 'PCAP Packet Capture';
    }

    // Check if the browser supports the File System Access API for custom save dialogs
    if ('showSaveFilePicker' in window) {
      try {
        const options = {
          suggestedName: `netsentinel-capture-${Date.now()}.${defaultExtension}`,
          types: [{
            description: description,
            accept: { [mimeType]: [`.${defaultExtension}`] },
          }],
        };

        // Opens native OS save location dialog
        const handle = await (window as any).showSaveFilePicker(options);
        const writableStream = await handle.createWritable();
        await writableStream.write(fileContent);
        await writableStream.close();

        setShowExportModal(false);
        return;
      } catch (err: any) {
        // If user cancels the prompt, don't throw an error
        if (err.name === 'AbortError') return;
        console.warn('File picker failed or was denied, falling back to standard download.', err);
      }
    }

    // Fallback for browsers that don't support showSaveFilePicker (e.g., Firefox, Safari)
    const blob = new Blob([fileContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `netsentinel-capture-${Date.now()}.${defaultExtension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setShowExportModal(false);
  };

  return (
    <div className="packet-capture-view">
      <div className="capture-header-bar">
        <button onClick={onNavigateDashboard} className="back-link">&lt; Dashboard</button>
        <h2>Live Packet Capture</h2>
        <span className="time-display">{new Date().toLocaleTimeString()} CST</span>
      </div>

      <div className="capture-toolbar">
        <div className="toolbar-left">
          <button
            onClick={() => setIsCapturing(!isCapturing)}
            className={`control-btn ${isCapturing ? 'btn-stop' : 'btn-start'}`}
          >
            {isCapturing ? 'Stop' : 'Start'}
          </button>
          <div className="filter-group">
            <span>Filter:</span>
            <input
              type="text"
              placeholder="Filter by name, protocol, or IP..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="filter-input"
            />
          </div>
        </div>

        <div className="toolbar-right">
          <span className="packet-counter">Captured: <strong>{packets.length}</strong></span>
          <span className={`status-pill ${isCapturing ? 'status-started' : 'status-paused'}`}>
            {isCapturing ? 'Started' : 'Paused'}
          </span>
          <button onClick={() => setPackets([])} className="tool-btn">Clear Logs</button>
          <button onClick={() => setShowExportModal(true)} className="tool-btn">Export</button>
        </div>
      </div>

      <div className="packet-table-container">
        <table className="packet-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>
                <input
                  type="checkbox"
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedPacketIds(filteredPackets.map(p => p.id));
                    } else {
                      setSelectedPacketIds([]);
                    }
                  }}
                />
              </th>
              <th>No.</th>
              <th>Source</th>
              <th>Destination</th>
              <th>Protocol</th>
              <th>Size</th>
              <th>Name</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {filteredPackets.length > 0 ? (
              filteredPackets.map((pkt, index) => (
                <tr key={pkt.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedPacketIds.includes(pkt.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPacketIds(prev => [...prev, pkt.id]);
                        } else {
                          setSelectedPacketIds(prev => prev.filter(id => id !== pkt.id));
                        }
                      }}
                    />
                  </td>
                  <td className="row-num">{index + 1}.</td>
                  <td>{pkt.source}</td>
                  <td>{pkt.destination}</td>
                  <td className="protocol-cell">{pkt.protocol}</td>
                  <td>{pkt.size}</td>
                  <td className="name-cell">{pkt.name}</td>
                  <td className="time-cell">{pkt.time}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="no-data">No matching packets found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showExportModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h3>Export Packet Logs</h3>
              <button onClick={() => setShowExportModal(false)} className="modal-close">✕</button>
            </div>
            
            <div className="modal-body">
              <div className="form-row">
                <label>Format:</label>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                  className="modal-select"
                >
                  <option value="PCAP">PCAP (.pcap)</option>
                  <option value="CSV">CSV (.csv)</option>
                  <option value="JSON">JSON (.json)</option>
                </select>
              </div>

              <div className="form-row">
                <label>Range:</label>
                <div className="radio-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label>
                    <input
                      type="radio"
                      name="exportRange"
                      checked={exportRange === 'all'}
                      onChange={() => setExportRange('all')}
                    /> All Packets ({packets.length})
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="exportRange"
                      checked={exportRange === 'filtered'}
                      onChange={() => setExportRange('filtered')}
                    /> Filtered View ({filteredPackets.length})
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="exportRange"
                      checked={exportRange === 'selected'}
                      onChange={() => setExportRange('selected')}
                    /> Selected Packets ({selectedPacketIds.length})
                  </label>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setShowExportModal(false)} className="btn-cancel">Cancel</button>
              <button
                onClick={handleExport}
                className="btn-export"
              >
                Download Export
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function App() {
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [isCapturing, setIsCapturing] = useState(true);
  
  const [packets, setPackets] = useState<Packet[]>(() => {
    const initialPackets: Packet[] = [];
    const now = Date.now();
    const protocols = ['TCP', 'HTTPS', 'HTTP', 'DNS'];
    const devices = ['MacBook Pro (Spotify)', 'iPhone 15 (Web Surfing)', 'Smart TV (Stream)', 'iPad (Browsing)', 'Spotify Desktop'];
    const sources = ['192.168.1.10', '192.168.1.15', '192.168.1.22', '192.168.1.8', '192.168.1.35'];

    for (let i = 0; i < 400; i++) {
      const pastTime = now - Math.floor(Math.random() * 120_000);
      const byteSize = Math.floor(Math.random() * 1200 + 300);
      initialPackets.push({
        id: pastTime + i,
        source: sources[Math.floor(Math.random() * sources.length)],
        destination: '142.250.190.46',
        protocol: protocols[Math.floor(Math.random() * protocols.length)],
        size: `${byteSize.toLocaleString()} B`,
        sizeBytes: byteSize,
        name: devices[Math.floor(Math.random() * devices.length)],
        timestamp: pastTime,
        time: new Date(pastTime).toLocaleTimeString('en-US', { timeZoneName: 'short' })
      });
    }
    return initialPackets;
  });

  useEffect(() => {
    if (!isCapturing) return;

    const interval = setInterval(() => {
      const protocols = ['TCP', 'HTTPS', 'HTTP', 'DNS'];
      const devices = ['MacBook Pro (Spotify)', 'iPhone 15 (Web Surfing)', 'Smart TV (Stream)', 'iPad (Browsing)', 'Spotify Desktop'];
      const sources = ['192.168.1.10', '192.168.1.15', '192.168.1.22', '192.168.1.8', '192.168.1.35'];
      
      const now = Date.now();
      const batch: Packet[] = [];

      for (let i = 0; i < 8; i++) {
        const byteSize = Math.floor(Math.random() * 1200 + 300);
        batch.push({
          id: now + i + Math.random(),
          source: sources[Math.floor(Math.random() * sources.length)],
          destination: `142.250.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
          protocol: protocols[Math.floor(Math.random() * protocols.length)],
          size: `${byteSize.toLocaleString()} B`,
          sizeBytes: byteSize,
          name: devices[Math.floor(Math.random() * devices.length)],
          timestamp: now,
          time: new Date(now).toLocaleTimeString('en-US', { timeZoneName: 'short' })
        });
      }

      setPackets(prev => [...batch, ...prev]);
    }, 1000);

    return () => clearInterval(interval);
  }, [isCapturing]);

  return (
    <AppShell activePage={activePage} setActivePage={setActivePage}>
      {(() => {
        switch (activePage) {
          case 'dashboard':
            return <Dashboard packets={packets} />;
          case 'packets':
            return (
              <LivePacketCapture
                packets={packets}
                setPackets={setPackets}
                isCapturing={isCapturing}
                setIsCapturing={setIsCapturing}
                onNavigateDashboard={() => setActivePage('dashboard')}
              />
            );
          case 'devices':
            return <div><h1>Device Inventory</h1><p>Subnet scan list goes here.</p></div>;
          case 'alerts':
            return <div><h1>Security Warnings</h1><p>Alert logs go here.</p></div>;
          case 'logs':
            return <LogViewerPage />;
          case 'settings':
            return <SettingsPage />;
          default:
            return <Dashboard packets={packets} />;
        }
      })()}
    </AppShell>
  );
}

export default App;
