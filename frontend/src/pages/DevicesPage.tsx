import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Capture } from '../hooks/useCapture';
import { interfaceName } from '../deviceIdentity';
import { LocalInventory } from '../components/LocalInventory';
import type { LocalDevice, Packet } from '../types';
import { SIMULATED_DEVICES } from '../simulationData';

type DeviceFilter = 'all' | 'online' | 'offline' | 'flagged';

interface DeviceRecord {
  id: string;
  ipAddress: string;
  macAddress: string;
  hostname: string;
  customLabel: string;
  latencyMs: number;
  isFlagged: boolean;
  firstSeen: number;
  lastSeen: number;
}

interface DeviceActivity {
  firstSeen: number;
  lastSeen: number;
  dailyBytes: number;
  recentPackets: Array<Pick<Packet, 'timestamp' | 'source' | 'destination' | 'sizeBytes'>>;
}

interface DevicesPageProps {
  onDevicePackets?: (d: LocalDevice, id?:number) => void;
  observed?: boolean;
  capture?: Capture;
  packets: Packet[];
  onNavigateDashboard: () => void;
}

const LOCAL_INTERFACE = 'eth0 · 192.168.1.1';
const ONLINE_WINDOW_MS = 15_000;
const BANDWIDTH_WINDOW_MS = 10_000;

/** Creates the initial inventory from the same host profiles used by packet simulation. */
function createInitialDevices(packets: Packet[]): DeviceRecord[] {
  const now = Date.now();
  return SIMULATED_DEVICES.map((seed) => {
    let firstObserved = now;
    for (const packet of packets) {
      if (packet.source === seed.ipAddress || packet.destination === seed.ipAddress) {
        firstObserved = Math.min(firstObserved, packet.timestamp);
      }
    }

    return {
      ...seed,
      id: seed.ipAddress,
      customLabel: '',
      firstSeen: firstObserved,
      lastSeen: now,
    };
  });
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function formatUsage(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 1024 ? `${(megabytes / 1024).toFixed(2)} GB` : `${megabytes.toFixed(1)} MB`;
}

export const DevicesPage: React.FC<DevicesPageProps> = props => props.observed ? <ObservedDevices {...props} /> : <DemoDevices {...props} />;

const DemoDevices: React.FC<DevicesPageProps> = ({ packets, onNavigateDashboard }) => {
  const [devices, setDevices] = useState<DeviceRecord[]>(() => createInitialDevices(packets));
  const [searchText, setSearchText] = useState('');
  const [deviceFilter, setDeviceFilter] = useState<DeviceFilter>('all');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [labelMessage, setLabelMessage] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [lastScan, setLastScan] = useState<number | null>(null);
  const [clock, setClock] = useState(Date.now);
  const dayKey = (() => {
    const date = new Date(clock);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  })();
  const scanTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanProgressRef = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => () => {
    if (scanTimer.current) clearInterval(scanTimer.current);
  }, []);

  const localIps = useMemo(() => new Set(devices.map((device) => device.ipAddress)), [devices]);
  const activityByIp = useMemo(() => {
    const activity = new Map<string, DeviceActivity>();
    const dayStart = new Date(`${dayKey}T00:00:00`).getTime();
    let latestPacketTime = 0;
    for (const packet of packets) latestPacketTime = Math.max(latestPacketTime, packet.timestamp);
    // Attribute each local packet to its local endpoint(s), then reuse the aggregate per device.
    const bandwidthStart = latestPacketTime - BANDWIDTH_WINDOW_MS;

    for (const packet of packets) {
      const sourceIsLocal = localIps.has(packet.source);
      const destinationIsLocal = localIps.has(packet.destination);
      if (!sourceIsLocal && !destinationIsLocal) continue;

      const relatedIps = new Set<string>();
      if (sourceIsLocal) relatedIps.add(packet.source);
      if (destinationIsLocal) relatedIps.add(packet.destination);

      for (const ip of relatedIps) {
        const current = activity.get(ip) ?? {
          firstSeen: packet.timestamp,
          lastSeen: packet.timestamp,
          dailyBytes: 0,
          recentPackets: [],
        };
        current.firstSeen = Math.min(current.firstSeen, packet.timestamp);
        current.lastSeen = Math.max(current.lastSeen, packet.timestamp);
        if (packet.timestamp >= dayStart) {
          current.dailyBytes += packet.sizeBytes;
        }
        if (packet.timestamp >= bandwidthStart) current.recentPackets.push(packet);
        activity.set(ip, current);
      }
    }

    return activity;
  }, [dayKey, localIps, packets]);

  const deviceRows = useMemo(() => devices.map((device) => {
    const activity = activityByIp.get(device.ipAddress);
    const lastSeen = Math.max(device.lastSeen, activity?.lastSeen ?? 0);
    const online = clock - lastSeen <= ONLINE_WINDOW_MS;
    const recentPackets = activity?.recentPackets.filter(
      (packet) => packet.timestamp >= clock - BANDWIDTH_WINDOW_MS && packet.timestamp <= clock
    ) ?? [];
    const uploadBytes = recentPackets.reduce(
      (total, packet) => total + (packet.source === device.ipAddress ? packet.sizeBytes : 0),
      0
    );
    const downloadBytes = recentPackets.reduce(
      (total, packet) => total + (packet.destination === device.ipAddress ? packet.sizeBytes : 0),
      0
    );
    return {
      ...device,
      online,
      lastSeen,
      firstSeen: Math.min(device.firstSeen, activity?.firstSeen ?? device.firstSeen),
      uploadMbps: (uploadBytes * 8 / BANDWIDTH_WINDOW_MS / 1000).toFixed(3),
      downloadMbps: (downloadBytes * 8 / BANDWIDTH_WINDOW_MS / 1000).toFixed(3),
      dailyBytes: activity?.dailyBytes ?? 0,
    };
  }), [activityByIp, clock, devices]);

  const onlineCount = deviceRows.filter((device) => device.online).length;
  const flaggedCount = deviceRows.filter((device) => device.isFlagged).length;
  const totalUploadMbps = deviceRows.reduce((total, device) => total + Number(device.uploadMbps), 0);
  const totalDownloadMbps = deviceRows.reduce((total, device) => total + Number(device.downloadMbps), 0);
  const selectedDevice = deviceRows.find((device) => device.id === selectedDeviceId);

  const visibleDevices = deviceRows.filter((device) => {
    const query = searchText.trim().toLowerCase();
    const matchesSearch = !query || [
      device.customLabel,
      device.hostname,
      device.ipAddress,
      device.macAddress,
    ].some((value) => value.toLowerCase().includes(query));
    const matchesFilter = deviceFilter === 'all' ||
      (deviceFilter === 'online' && device.online) ||
      (deviceFilter === 'offline' && !device.online) ||
      (deviceFilter === 'flagged' && device.isFlagged);
    return matchesSearch && matchesFilter;
  });

  const startScan = () => {
    if (isScanning) return;
    setIsScanning(true);
    scanProgressRef.current = 0;
    setScanProgress(0);
    scanTimer.current = setInterval(() => {
      scanProgressRef.current = Math.min(scanProgressRef.current + 10, 100);
      setScanProgress(scanProgressRef.current);
      if (scanProgressRef.current < 100) return;

      if (scanTimer.current) clearInterval(scanTimer.current);
      scanTimer.current = null;
      setIsScanning(false);
      setLastScan(Date.now());
      // The scan is simulated: its completion introduces one fixed unknown host at most once.
      setDevices((currentDevices) => {
        if (currentDevices.some((device) => device.id === '192.168.1.100')) {
          return currentDevices;
        }
        const now = Date.now();
        return [...currentDevices, {
          id: '192.168.1.100',
          ipAddress: '192.168.1.100',
          macAddress: '02:5A:91:7C:40:64',
          hostname: 'Unknown',
          customLabel: '',
          latencyMs: 24,
          isFlagged: true,
          firstSeen: now,
          lastSeen: now,
        }];
      });
    }, 150);
  };

  const openDevice = (deviceId: string) => {
    const device = deviceRows.find((row) => row.id === deviceId);
    if (!device) return;
    setSelectedDeviceId(deviceId);
    setLabelInput(device.customLabel);
    setLabelMessage('');
  };

  const saveLabel = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedDevice) return;
    const label = labelInput.trim();
    if (label.length > 32) {
      setLabelMessage('Labels must be 32 characters or fewer.');
      return;
    }
    setDevices((currentDevices) => currentDevices.map((device) => (
      device.id === selectedDevice.id
        ? { ...device, customLabel: label, isFlagged: label ? false : device.isFlagged }
        : device
    )));
    setLabelInput(label);
    setLabelMessage(label ? 'Device label saved.' : 'Device label cleared.');
  };

  const acknowledgeDevice = (deviceId: string) => {
    setDevices((currentDevices) => currentDevices.map((device) => (
      device.id === deviceId ? { ...device, isFlagged: false } : device
    )));
  };

  return (
    <div className="dashboard devices-page">
      <div className="devices-heading">
        <div className="page-heading-back">
          <button type="button" onClick={onNavigateDashboard} className="back-link">
            &lt; Dashboard
          </button>
        </div>
        <div className="devices-heading-title">
          <span className="eyebrow">NETWORK DISCOVERY (UC3)</span>
          <h1>Device Inventory &amp; Subnet Scanner</h1>
          <p>Active interface: <strong>{LOCAL_INTERFACE}</strong></p>
        </div>
        <div className="devices-scan-controls page-heading-actions">
          <button type="button" className="btn-export" onClick={startScan} disabled={isScanning}>
            {isScanning ? `Scanning Subnet... ${scanProgress}%` : 'Scan Subnet'}
          </button>
          <span className="devices-last-scan">
            {lastScan ? `Last scan: ${formatTimestamp(lastScan)}` : 'No scan completed this session'}
          </span>
        </div>
      </div>

      {devices.length === 0 && (
        <div className="devices-empty-prompt">
          No devices cataloged yet. Run a subnet scan to discover active hosts.
          <button type="button" className="tool-btn" onClick={startScan}>Scan Subnet</button>
        </div>
      )}

      <section className="devices-metrics" aria-label="Device summary">
        <article className="dashboard-card devices-metric">
          <span className="card-kicker">TOTAL DISCOVERED</span>
          <strong>{devices.length}</strong>
          <small>Hosts on the local subnet</small>
        </article>
        <article className="dashboard-card devices-metric">
          <span className="card-kicker">ONLINE HOSTS</span>
          <strong>{onlineCount}</strong>
          <small>Recently active devices</small>
        </article>
        <article className="dashboard-card devices-metric">
          <span className="card-kicker">UNRECOGNIZED / FLAGGED</span>
          <strong>{flaggedCount}</strong>
          <small>Require operator review</small>
        </article>
        <article className="dashboard-card devices-metric">
          <span className="card-kicker">SUBNET BANDWIDTH</span>
          <strong>{(totalUploadMbps + totalDownloadMbps).toFixed(3)} <span>Mbps</span></strong>
          <small>↓ {totalDownloadMbps.toFixed(3)} down · ↑ {totalUploadMbps.toFixed(3)} up</small>
        </article>
      </section>

      <section className="dashboard-card devices-inventory">
        <div className="devices-inventory-toolbar">
          <input
            type="search"
            className="filter-input devices-search"
            placeholder="Search label, hostname, IP, or MAC..."
            aria-label="Search devices"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <div className="devices-filter-pills" role="group" aria-label="Filter devices">
            {([
              ['all', 'All'],
              ['online', 'Online'],
              ['offline', 'Offline'],
              ['flagged', 'Flagged (New)'],
            ] as const).map(([filter, label]) => (
              <button
                type="button"
                key={filter}
                className={`devices-filter-pill${deviceFilter === filter ? ' is-active' : ''}`}
                aria-pressed={deviceFilter === filter}
                onClick={() => setDeviceFilter(filter)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="packet-table-container devices-table-container">
          <table className="packet-table devices-table">
            <thead>
              <tr>
                <th>Status / Trust</th>
                <th>Device Name / Label</th>
                <th>IP Address</th>
                <th>MAC Address</th>
                <th>Ping</th>
                <th>Live Bandwidth</th>
                <th>Daily Usage</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleDevices.length > 0 ? visibleDevices.map((device) => (
                <tr
                  key={device.id}
                  className="devices-table-row"
                  tabIndex={0}
                  onClick={() => openDevice(device.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openDevice(device.id);
                    }
                  }}
                >
                  <td>
                    <span className={`device-status ${device.online ? 'is-online' : 'is-offline'}`}>
                      {device.online ? 'Online' : 'Offline'}
                    </span>
                    {device.isFlagged && <span className="device-new-badge">NEW / UNVERIFIED</span>}
                  </td>
                  <td>
                    <strong className="device-name">{device.customLabel || device.hostname || 'Unlabeled Device'}</strong>
                    {device.customLabel && <small className="device-hostname">{device.hostname}</small>}
                  </td>
                  <td>{device.ipAddress}</td>
                  <td className="device-mac">{device.macAddress}</td>
                  <td>{device.online ? `${device.latencyMs} ms` : '—'}</td>
                  <td className="device-bandwidth">
                    <span>↓ {device.downloadMbps} Mbps</span>
                    <span>↑ {device.uploadMbps} Mbps</span>
                  </td>
                  <td>{formatUsage(device.dailyBytes)}</td>
                  <td>
                    <button
                      type="button"
                      className="tool-btn device-inspect-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openDevice(device.id);
                      }}
                    >
                      Edit / Inspect
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} className="no-data">No devices match this search or filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedDevice && (
        <div className="device-drawer-overlay" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedDeviceId(null);
        }}>
          <aside className="device-drawer" role="dialog" aria-modal="true" aria-labelledby="device-drawer-title">
            <div className="device-drawer-header">
              <div>
                <span className="eyebrow">DEVICE INSPECTION</span>
                <h2 id="device-drawer-title">{selectedDevice.customLabel || selectedDevice.hostname}</h2>
                <p>{selectedDevice.macAddress} · {selectedDevice.ipAddress}</p>
              </div>
              <button type="button" className="modal-close" aria-label="Close device details" onClick={() => setSelectedDeviceId(null)}>✕</button>
            </div>

            <div className="device-drawer-content">
              <div className="device-detail-status">
                <span className={`device-status ${selectedDevice.online ? 'is-online' : 'is-offline'}`}>
                  {selectedDevice.online ? 'Online' : 'Offline'}
                </span>
                <span>{selectedDevice.online ? `${selectedDevice.latencyMs} ms ping` : 'Ping unavailable'}</span>
              </div>

              {selectedDevice.isFlagged && (
                <div className="device-warning">
                  <strong>Unrecognized MAC address detected on subnet</strong>
                  <p>Verify this host before trusting it on the network.</p>
                  <button type="button" className="btn-export" onClick={() => acknowledgeDevice(selectedDevice.id)}>
                    Acknowledge &amp; Mark Known
                  </button>
                </div>
              )}

              <form className="device-label-form" onSubmit={saveLabel}>
                <label htmlFor="device-custom-label">Custom device label</label>
                <input
                  id="device-custom-label"
                  className="filter-input"
                  value={labelInput}
                  maxLength={32}
                  placeholder="e.g. Gateway_Router"
                  onChange={(event) => {
                    setLabelInput(event.target.value);
                    setLabelMessage('');
                  }}
                />
                <small>Up to 32 characters. Leading and trailing spaces are trimmed.</small>
                <button type="submit" className="btn-export">Save Label</button>
                {labelMessage && <span className="device-label-message" role="status">{labelMessage}</span>}
              </form>

              <div className="device-detail-grid">
                <div><span>Download</span><strong>{selectedDevice.downloadMbps} Mbps</strong></div>
                <div><span>Upload</span><strong>{selectedDevice.uploadMbps} Mbps</strong></div>
                <div><span>Daily Usage</span><strong>{formatUsage(selectedDevice.dailyBytes)}</strong></div>
                <div><span>Connection</span><strong>{selectedDevice.online ? 'Reachable' : 'Unreachable'}</strong></div>
                <div><span>First Seen</span><strong>{formatTimestamp(selectedDevice.firstSeen)}</strong></div>
                <div><span>Last Seen</span><strong>{formatTimestamp(selectedDevice.lastSeen)}</strong></div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

const addressOrder = new Intl.Collator(undefined, { numeric: true });

function ObservedDevices({ packets,onNavigateDashboard,capture,onDevicePackets }: DevicesPageProps) {
  const [query,search] = useState('');
  const [order,setOrder] = useState('recent');
  const names = {...capture?.sourceNames,...capture?.monitor?.interfaceNames};
  const hosts = useMemo(() => {
    const result = new Map<string,{address:string;name:string;source:string;last:number;frames:number}>();
    for (const packet of packets) {
      const d = packet.details;
      if (!d) continue;
      for (const address of new Set([d.source,d.destination])) {
        if (!address) continue;
        const key = JSON.stringify([d.captureSource,address]);
        const host = result.get(key) ?? {address,name:'',source:d.captureSource,last:0,frames:0};
        host.frames++;
        host.last = Math.max(host.last,packet.timestamp);
        host.name ||= (address === d.source ? d.sourceHostname : d.destinationHostname) || '';
        result.set(key,host);
      }
    }
    return [...result.values()];
  },[packets]);
  const term = query.trim().toLowerCase();
  const matches = hosts.filter(h => [h.address,h.name,h.source,interfaceName(h.source,names)].some(s => s.toLowerCase().includes(term)));
  matches.sort((a,b) => order === 'address' ? addressOrder.compare(a.address,b.address) :
    order === 'frames' ? b.frames-a.frames : b.last-a.last);
  return <section className="dashboard devices-page live-devices">
    <header className="inventory-page-heading"><div><button className="back-link" onClick={onNavigateDashboard}>&lt; Dashboard</button>
      <h1>Observed devices</h1></div></header>
    {capture && <LocalInventory capture={capture} onPackets={onDevicePackets} />}
    <section className="dashboard-card endpoint-panel"><header className="inventory-toolbar">
      <div><h2>Observed endpoints</h2><p>Local and remote IPs in retained packets</p></div>
      <div className="inventory-filters">
        <input aria-label="Search endpoints" placeholder="Search endpoints…" type="search" className="filter-input" value={query} onChange={e=>search(e.target.value)}/>
        <select aria-label="Sort endpoints" className="modal-select" value={order} onChange={e=>setOrder(e.target.value)}>
          <option value="recent">Last observed</option><option value="frames">Most packets</option><option value="address">IP address</option>
        </select>
      </div></header>
      <div className="endpoint-scroll" tabIndex={0} aria-label="Observed endpoint records"><table className="packet-table"><thead><tr>{['IP address','Reverse DNS','Interface','Packets','Last observed'].map(h=><th key={h}>{h}</th>)}</tr></thead>
      <tbody>{matches.map(h=><tr key={JSON.stringify([h.source,h.address])}><td title={h.address}>{h.address}</td><td title={h.name}>{h.name || '—'}</td><td title={h.source}>{interfaceName(h.source,names)}</td><td>{h.frames}</td><td title={formatTimestamp(h.last)}>{formatTimestamp(h.last)}</td></tr>)}</tbody></table></div>
      {!matches.length && <p>No matching endpoints in retained packets.</p>}</section>
  </section>;
}
