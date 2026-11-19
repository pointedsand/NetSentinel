import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Packet } from '../types';
import type { AlertItem, AlertFilter, AlertRules, AlertType } from './alertTypes';
import { DEVICE_DETAILS, DEVICE_LATENCIES, getAlertTimestamp } from './alertTypes';

interface AlertsPageProps {
  packets: Packet[];
  alerts: AlertItem[];
  setAlerts: React.Dispatch<React.SetStateAction<AlertItem[]>>;
  rules: AlertRules;
  setRules: React.Dispatch<React.SetStateAction<AlertRules>>;
}

const FILTERS: Array<{ id: AlertFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unacknowledged', label: 'Unacknowledged' },
  { id: 'acknowledged', label: 'Acknowledged' },
  { id: 'high', label: 'Critical / High' },
  { id: 'new-device', label: 'New Device' },
];

const ALERT_TYPES: AlertType[] = [
  'Bandwidth Exceeded',
  'High Latency',
  'New Device Connected',
  'Malicious Traffic',
  'System Scan Complete',
  'DHCP Range Low',
];

/** Format displayed alert times using the UI's Central-time display convention. */
function formatAlertTime(timestamp: number): string {
  return `${new Date(timestamp).toLocaleTimeString('en-US', { timeZone: 'America/Chicago' })} CST`;
}

export const AlertsPage: React.FC<AlertsPageProps> = ({ packets, alerts, setAlerts, rules, setRules }) => {
  const [searchText, setSearchText] = useState('');
  const [filter, setFilter] = useState<AlertFilter>('all');
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [bandwidthInput, setBandwidthInput] = useState(String(rules.bandwidthThresholdMbps));
  const [latencyInput, setLatencyInput] = useState(String(rules.latencyThresholdMs));
  const [newDeviceEnabled, setNewDeviceEnabled] = useState(rules.newDeviceAlertsEnabled);
  const [ruleError, setRuleError] = useState('');
  const lastBandwidthAlert = useRef(0);
  const seenUnknownDevices = useRef(new Set<string>());

  // Approximate a rolling 10-second rate from the most recent timestamp in the shared stream.
  const currentBandwidthMbps = useMemo(() => {
    const latestPacketTime = packets.reduce((latest, packet) => Math.max(latest, packet.timestamp), 0);
    const bytes = packets.reduce(
      (total, packet) => total + (packet.timestamp >= latestPacketTime - 10_000 ? packet.sizeBytes : 0),
      0
    );
    return bytes * 8 / 10_000 / 1000;
  }, [packets]);

  useEffect(() => {
    if (
      currentBandwidthMbps <= rules.bandwidthThresholdMbps ||
      rules.mutedTypes.includes('Bandwidth Exceeded') ||
      getAlertTimestamp() - lastBandwidthAlert.current < 30_000
    ) return;

    const now = getAlertTimestamp();
    lastBandwidthAlert.current = now;
    setAlerts((current) => [{
      id: `bandwidth-${now}`,
      ipAddress: '(No device)',
      alertType: 'Bandwidth Exceeded',
      protocol: '—',
      severity: 'High',
      deviceName: '(None)',
      timestamp: now,
      details: `Aggregate traffic reached ${currentBandwidthMbps.toFixed(2)} Mbps, above the ${rules.bandwidthThresholdMbps} Mbps threshold.`,
      acknowledged: false,
    }, ...current]);
  }, [currentBandwidthMbps, rules.bandwidthThresholdMbps, rules.mutedTypes, setAlerts]);

  // Re-evaluate the mock latency values when the threshold or mute configuration changes.
  useEffect(() => {
    if (rules.mutedTypes.includes('High Latency')) return;
    const now = getAlertTimestamp();
    const highLatencyAlerts = Object.entries(DEVICE_LATENCIES)
      .filter(([, latency]) => latency > rules.latencyThresholdMs)
      .map(([ipAddress, latency]) => ({
        id: `latency-${ipAddress}-${now}`,
        ipAddress,
        alertType: 'High Latency' as const,
        protocol: 'ICMP',
        severity: 'Medium' as const,
        deviceName: DEVICE_DETAILS[ipAddress].name,
        timestamp: now,
        details: `Gateway response latency is ${latency} ms, above the ${rules.latencyThresholdMs} ms threshold.`,
        acknowledged: false,
      }));

    if (highLatencyAlerts.length === 0) return;
    setAlerts((current) => {
      const currentActiveDevices = new Set(current
        .filter((alert) => !alert.acknowledged && alert.alertType === 'High Latency')
        .map((alert) => alert.ipAddress));
      const newAlerts = highLatencyAlerts.filter((alert) => !currentActiveDevices.has(alert.ipAddress));
      return newAlerts.length > 0 ? [...newAlerts, ...current] : current;
    });
  }, [rules.latencyThresholdMs, rules.mutedTypes, setAlerts]);

  // Alert only once per previously unseen local source, even if later batches repeat it.
  useEffect(() => {
    const newDeviceAlerts = packets.filter((packet) => {
      const sourceIsUnknownLocal = /^192\.168\.1\.\d+$/.test(packet.source) &&
        !DEVICE_DETAILS[packet.source] &&
        !seenUnknownDevices.current.has(packet.source);
      if (sourceIsUnknownLocal) seenUnknownDevices.current.add(packet.source);
      return sourceIsUnknownLocal;
    });

    if (!rules.newDeviceAlertsEnabled || rules.mutedTypes.includes('New Device Connected')) return;
    if (newDeviceAlerts.length === 0) return;

    setAlerts((current) => [
      ...newDeviceAlerts.map((packet) => ({
        id: `new-device-${packet.source}-${packet.id}`,
        ipAddress: packet.source,
        alertType: 'New Device Connected' as const,
        protocol: packet.protocol,
        severity: 'High' as const,
        deviceName: 'Unknown Host',
        timestamp: packet.timestamp,
        details: 'First-time device connection detected from the live packet stream.',
        acknowledged: false,
      })),
      ...current,
    ]);
  }, [packets, rules.mutedTypes, rules.newDeviceAlertsEnabled, setAlerts]);

  const activeAlerts = alerts.filter((alert) => !alert.acknowledged);
  const highAlerts = alerts.filter((alert) => alert.severity === 'Critical' || alert.severity === 'High');
  const unauthorizedCount = activeAlerts.filter((alert) => alert.alertType === 'New Device Connected').length;
  const selectedAlert = alerts.find((alert) => alert.id === selectedAlertId);

  const visibleAlerts = alerts.filter((alert) => {
    const query = searchText.trim().toLowerCase();
    const searchable = [
      alert.ipAddress,
      alert.deviceName,
      alert.alertType,
      alert.protocol,
      alert.details,
    ];
    const matchesSearch = !query || searchable.some((value) => value.toLowerCase().includes(query));
    const matchesFilter = filter === 'all' ||
      (filter === 'unacknowledged' && !alert.acknowledged) ||
      (filter === 'acknowledged' && alert.acknowledged) ||
      (filter === 'high' && (alert.severity === 'Critical' || alert.severity === 'High')) ||
      (filter === 'new-device' && alert.alertType === 'New Device Connected');
    return matchesSearch && matchesFilter;
  });

  const acknowledgeAlert = (alertId: string) => {
    const acknowledgedAt = getAlertTimestamp();
    setAlerts((current) => current.map((alert) => (
      alert.id === alertId ? { ...alert, acknowledged: true, acknowledgedAt } : alert
    )));
  };

  const saveRules = (event: React.FormEvent) => {
    event.preventDefault();
    const bandwidth = Number(bandwidthInput);
    const latency = Number(latencyInput);
    if (!Number.isFinite(bandwidth) || bandwidth <= 0 || !Number.isFinite(latency) || latency <= 0) {
      setRuleError('Bandwidth and latency thresholds must be positive numbers.');
      return;
    }

    setRules((current) => ({
      ...current,
      bandwidthThresholdMbps: bandwidth,
      latencyThresholdMs: latency,
      newDeviceAlertsEnabled: newDeviceEnabled,
    }));
    setRuleError('');
    setShowRules(false);
  };

  const toggleMutedType = (type: AlertType) => {
    setRules((current) => ({
      ...current,
      mutedTypes: current.mutedTypes.includes(type)
        ? current.mutedTypes.filter((mutedType) => mutedType !== type)
        : [...current.mutedTypes, type],
    }));
  };

  return (
    <div className="dashboard alerts-page">
      <div className="dashboard-heading page-heading-centered alerts-heading">
        <div className="page-heading-back" aria-hidden="true" />
        <div className="page-heading-title">
          <span className="eyebrow">SECURITY MONITORING (UC7 / UC8)</span>
          <h1>Security Alerts</h1>
          <p>Review, acknowledge, and configure local network security warnings.</p>
        </div>
        <div className="alerts-heading-actions">
          <button
            type="button"
            className="btn-export"
            onClick={() => {
              setBandwidthInput(String(rules.bandwidthThresholdMbps));
              setLatencyInput(String(rules.latencyThresholdMs));
              setNewDeviceEnabled(rules.newDeviceAlertsEnabled);
              setShowRules(true);
            }}
          >
            Configure Alert Rules
          </button>
        </div>
      </div>

      <section className="devices-metrics alerts-metrics" aria-label="Alert summary">
        <article className="dashboard-card devices-metric"><span className="card-kicker">ACTIVE / UNACKNOWLEDGED</span><strong>{activeAlerts.length}</strong><small>Awaiting operator review</small></article>
        <article className="dashboard-card devices-metric"><span className="card-kicker">CRITICAL / HIGH</span><strong>{highAlerts.length}</strong><small>High-priority warnings</small></article>
        <article className="dashboard-card devices-metric"><span className="card-kicker">UNAUTHORIZED DEVICES</span><strong>{unauthorizedCount}</strong><small>New-device alerts not acknowledged</small></article>
        <article className="dashboard-card devices-metric"><span className="card-kicker">MUTED RULES</span><strong>{rules.mutedTypes.length}</strong><small>Alert categories currently muted</small></article>
      </section>

      <section className="dashboard-card alerts-card">
        <div className="alerts-toolbar">
          <input
            type="search"
            className="filter-input alerts-search"
            aria-label="Search alerts"
            placeholder="Search IP, device, type, protocol, or details..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <div className="devices-filter-pills" role="group" aria-label="Filter alerts">
            {FILTERS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`devices-filter-pill${filter === id ? ' is-active' : ''}`}
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="alerts-muted-types" aria-label="Muted alert types">
          <strong>Mute alert types:</strong>
          {ALERT_TYPES.map((type) => (
            <label key={type}>
              <input
                type="checkbox"
                checked={rules.mutedTypes.includes(type)}
                onChange={() => toggleMutedType(type)}
              />
              {type}
            </label>
          ))}
        </div>

        {visibleAlerts.length === 0 ? (
          <div className="logs-empty-state">No active security alerts matching current filters.</div>
        ) : (
          <div className="packet-table-container alerts-table-container">
            <table className="packet-table alerts-table">
              <thead>
                <tr><th>No. / Severity</th><th>IP Address</th><th>Alert Type</th><th>Protocol</th><th>Device Name</th><th>Time</th><th>Info</th><th>Status &amp; Actions</th></tr>
              </thead>
              <tbody>
                {visibleAlerts.map((alert, index) => (
                  <tr
                    key={alert.id}
                    className="alerts-table-row"
                    tabIndex={0}
                    onClick={() => setSelectedAlertId(alert.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedAlertId(alert.id);
                      }
                    }}
                  >
                    <td><span className={`alert-severity severity-${alert.severity.toLowerCase()}`}>{String(index + 1).padStart(2, '0')} · {alert.severity}</span></td>
                    <td>{alert.ipAddress}</td>
                    <td>{alert.alertType}</td>
                    <td>{alert.protocol}</td>
                    <td>{alert.deviceName}</td>
                    <td className="time-cell">{formatAlertTime(alert.timestamp)}</td>
                    <td className="alert-details-cell">{alert.details}</td>
                    <td>
                      {alert.acknowledged
                        ? <span className="alert-acknowledged">Acknowledged</span>
                        : (
                          <button
                            type="button"
                            className="tool-btn"
                            onClick={(event) => {
                              event.stopPropagation();
                              acknowledgeAlert(alert.id);
                            }}
                          >
                            Acknowledge
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dashboard-card alerts-audit">
        <div className="section-heading">
          <div><div className="card-kicker">FR18 AUDIT TRAIL</div><h2>Acknowledged Warnings</h2></div>
          <span className="placeholder-tag">{alerts.filter((alert) => alert.acknowledged).length} reviewed</span>
        </div>
        {alerts.some((alert) => alert.acknowledged) ? (
          <ul className="alerts-audit-list">
            {alerts.filter((alert) => alert.acknowledged).map((alert) => (
              <li key={alert.id}>
                <span><strong>{alert.alertType}</strong><small>{alert.ipAddress} · {alert.deviceName}</small></span>
                <time>{alert.acknowledgedAt ? formatAlertTime(alert.acknowledgedAt) : 'Acknowledgment time unavailable'}</time>
              </li>
            ))}
          </ul>
        ) : <p className="placeholder-note">No warnings have been acknowledged.</p>}
      </section>

      {selectedAlert && (
        <div className="device-drawer-overlay" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedAlertId(null);
        }}>
          <aside className="device-drawer" role="dialog" aria-modal="true" aria-labelledby="alert-drawer-title">
            <div className="device-drawer-header">
              <div>
                <span className="eyebrow">ALERT INSPECTION &amp; AUDIT</span>
                <h2 id="alert-drawer-title">{selectedAlert.alertType}</h2>
                <p>{selectedAlert.id} · {selectedAlert.ipAddress}</p>
              </div>
              <button type="button" className="modal-close" aria-label="Close alert details" onClick={() => setSelectedAlertId(null)}>✕</button>
            </div>
            <div className="device-drawer-content">
              <div className="alert-inspection-grid">
                <div><span>Severity</span><strong>{selectedAlert.severity}</strong></div>
                <div><span>Protocol</span><strong>{selectedAlert.protocol}</strong></div>
                <div><span>Device</span><strong>{selectedAlert.deviceName}</strong></div>
                <div><span>Time</span><strong>{formatAlertTime(selectedAlert.timestamp)}</strong></div>
                <div><span>Details</span><strong>{selectedAlert.details}</strong></div>
              </div>
              <section className="alert-device-context">
                <h3>Associated Device</h3>
                {DEVICE_DETAILS[selectedAlert.ipAddress] ? (
                  <>
                    <p>{DEVICE_DETAILS[selectedAlert.ipAddress].name}</p>
                    <p>{DEVICE_DETAILS[selectedAlert.ipAddress].mac}</p>
                    <p>{DEVICE_DETAILS[selectedAlert.ipAddress].status}</p>
                  </>
                ) : <p>System-level event; no device associated.</p>}
              </section>
              <button
                type="button"
                className="tool-btn"
                onClick={() => toggleMutedType(selectedAlert.alertType)}
              >
                {rules.mutedTypes.includes(selectedAlert.alertType) ? 'Unmute' : 'Mute'} {selectedAlert.alertType}
              </button>
              {!selectedAlert.acknowledged && (
                <button type="button" className="btn-export" onClick={() => acknowledgeAlert(selectedAlert.id)}>
                  Acknowledge Alert
                </button>
              )}
              {selectedAlert.acknowledgedAt && (
                <p className="alert-audit-time">Acknowledged at {formatAlertTime(selectedAlert.acknowledgedAt)}</p>
              )}
            </div>
          </aside>
        </div>
      )}

      {showRules && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="alert-rules-title">
          <form className="modal-box alerts-rules-modal" onSubmit={saveRules}>
            <div className="modal-header">
              <h3 id="alert-rules-title">Configure Alert Rules</h3>
              <button type="button" className="modal-close" aria-label="Close alert rules" onClick={() => setShowRules(false)}>✕</button>
            </div>
            <div className="modal-body">
              <label className="alert-rule-field">
                Bandwidth threshold (Mbps)
                <input type="number" step="any" value={bandwidthInput} onChange={(event) => setBandwidthInput(event.target.value)} />
              </label>
              <label className="alert-rule-field">
                Latency threshold (ms)
                <input type="number" step="any" value={latencyInput} onChange={(event) => setLatencyInput(event.target.value)} />
              </label>
              <label className="alert-rule-toggle">
                <input type="checkbox" checked={newDeviceEnabled} onChange={(event) => setNewDeviceEnabled(event.target.checked)} />
                Enable new-device alerts
              </label>
              <p>Current simulated aggregate bandwidth: {currentBandwidthMbps.toFixed(3)} Mbps</p>
              {ruleError && <p className="alert-rule-error" role="alert">{ruleError}</p>}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-cancel" onClick={() => setShowRules(false)}>Cancel</button>
              <button type="submit" className="btn-export">Save Rules</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
