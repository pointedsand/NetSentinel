/**
 * Module: LogViewerPage.tsx
 * Author: George Salmi
 * Implements the browser-side log management view. Capture rows are summaries
 * derived from simulated packets; archive metadata is not backed by local files.
 */
import React, { useMemo, useRef, useState } from 'react';
import type { AlertItem } from './alertTypes';
import { createSeedAlerts } from './alertTypes';
import { SIMULATED_DEVICES } from '../simulationData';
import type { Packet } from '../types';

// Describes one archived packet capture stored in the local log history.
export interface PacketLogRecord {
  id: string;
  fileName: string;
  protocol: string;
  sizeMB: number;
  timestamp: string;
  compressed: boolean;
  deviceName?: string;
  ipAddress?: string;
}

interface SecurityEventRecord {
  id: string;
  timestamp: number;
  severity: AlertItem['severity'];
  message: AlertItem['details'];
  source: string;
  alertType: AlertItem['alertType'];
  deviceName: string;
}

// Allows the page to receive an initial list of logs for testing or integration scenarios.
interface LogViewerPageProps {
  packets?: Packet[];
  alerts?: AlertItem[];
  setAlerts?: React.Dispatch<React.SetStateAction<AlertItem[]>>;
  initialLogs?: PacketLogRecord[];
  initialSecurityEvents?: SecurityEventRecord[];
}

interface LogFilePickerOptions {
  multiple: boolean;
  startIn: 'downloads';
  types: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}

// Sample log records shown when the page is first opened without external data.
const DEFAULT_LOGS: PacketLogRecord[] = [
  ...SIMULATED_DEVICES.map((device, index) => ({
    id: `sample-${device.ipAddress}`,
    fileName: `capture_${device.ipAddress.replaceAll('.', '-')}_${device.hostname.replaceAll(' ', '-')}.pcap`,
    protocol: ['TCP', 'HTTPS', 'HTTP', 'DNS', 'TCP', 'HTTPS', 'TCP', 'HTTP', 'HTTPS'][index],
    sizeMB: [5.4, 4.1, 4.7, 3.2, 2.8, 3.1, 2.6, 1.8, 2.4][index],
    timestamp: '2026-11-03 09:12:33',
    compressed: true,
    deviceName: device.hostname,
    ipAddress: device.ipAddress,
  })),
];

const DEFAULT_SECURITY_EVENTS: SecurityEventRecord[] = createSeedAlerts().map((alert) => ({
  id: alert.id,
  timestamp: alert.timestamp,
  severity: alert.severity,
  message: alert.details,
  source: alert.ipAddress,
  alertType: alert.alertType,
  deviceName: alert.deviceName,
}));

function createCaptureLogs(packets: Packet[]): PacketLogRecord[] {
  const activityByIp = new Map<string, { bytes: number; lastSeen: number; protocolBytes: Map<string, number> }>();
  for (const packet of packets) {
    const activity = activityByIp.get(packet.source) ?? {
      bytes: 0,
      lastSeen: 0,
      protocolBytes: new Map<string, number>(),
    };
    activity.bytes += packet.sizeBytes;
    activity.lastSeen = Math.max(activity.lastSeen, packet.timestamp);
    activity.protocolBytes.set(
      packet.protocol,
      (activity.protocolBytes.get(packet.protocol) ?? 0) + packet.sizeBytes
    );
    activityByIp.set(packet.source, activity);
  }

  // Keep one summary per simulated host, using its most-used protocol and latest packet time.
  return SIMULATED_DEVICES.map((device) => {
    const activity = activityByIp.get(device.ipAddress);
    const primaryProtocol = [...(activity?.protocolBytes.entries() ?? [])]
      .sort((left, right) => right[1] - left[1])[0]?.[0] ?? '—';
    const timestamp = activity?.lastSeen ? new Date(activity.lastSeen).toLocaleString() : '—';

    return {
      id: `capture-${device.ipAddress}`,
      fileName: `capture_${device.ipAddress.replaceAll('.', '-')}_${device.hostname.replaceAll(' ', '-')}.pcap`,
      protocol: primaryProtocol,
      sizeMB: Number(((activity?.bytes ?? 0) / (1024 * 1024)).toFixed(2)),
      timestamp,
      compressed: true,
      deviceName: device.hostname,
      ipAddress: device.ipAddress,
    };
  });
}

export const LogViewerPage: React.FC<LogViewerPageProps> = ({
  packets,
  alerts,
  setAlerts,
  initialLogs = DEFAULT_LOGS,
  initialSecurityEvents = DEFAULT_SECURITY_EVENTS,
}) => {
  // Maintains the current list of stored packet logs shown in the viewer.
  const [logs, setLogs] = useState<PacketLogRecord[]>(() => packets ? createCaptureLogs(packets) : initialLogs);
  const [removedLogIds, setRemovedLogIds] = useState<Set<string>>(() => new Set());
  const [localSecurityEvents, setLocalSecurityEvents] = useState<SecurityEventRecord[]>(initialSecurityEvents);
  const [activeTab, setActiveTab] = useState<'captures' | 'security'>('captures');
  const [searchText, setSearchText] = useState('');
  const [protocolFilter, setProtocolFilter] = useState('All');
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Controls whether the delete confirmation modal is visible.
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);

  // Message displayed after a successful log cleanup so the empty state is clear to the user.
  const [statusMessage, setStatusMessage] = useState<string>('');
  const securityEvents = useMemo(() => alerts
    ? alerts.map((alert) => ({
      id: alert.id,
      timestamp: alert.timestamp,
      severity: alert.severity,
      message: alert.details,
      source: alert.ipAddress,
      alertType: alert.alertType,
      deviceName: alert.deviceName,
    }))
    : localSecurityEvents, [alerts, localSecurityEvents]);
  const captureLogs = useMemo(() => packets
    ? createCaptureLogs(packets).filter((log) => !removedLogIds.has(log.id))
    : logs, [logs, packets, removedLogIds]);
  const activeCount = activeTab === 'captures' ? captureLogs.length : securityEvents.length;
  const filteredLogs = captureLogs.filter((log) => (
    log.fileName.toLowerCase().includes(searchText.trim().toLowerCase()) &&
    (protocolFilter === 'All' || log.protocol === protocolFilter)
  ));
  const totalStorageMB = captureLogs.reduce((total, log) => total + log.sizeMB, 0);

  // Clears the log history after the user confirms the destructive action.
  const handleConfirmDelete = () => {
    if (activeTab === 'captures') {
      if (packets) {
        // Hide derived summaries locally; do not mutate the packet stream shared with other pages.
        setRemovedLogIds(new Set(captureLogs.map((log) => log.id)));
      } else {
        setLogs([]);
      }
    } else if (setAlerts) {
      setAlerts([]);
    } else {
      setLocalSecurityEvents([]);
    }
    setShowConfirmModal(false);
    setStatusMessage(activeTab === 'captures'
      ? 'No historical logs available. Storage cleared.'
      : 'No security event logs available.');
  };

  const handleRemoveLog = (logId: string) => {
    const remainingLogs = captureLogs.filter((log) => log.id !== logId);
    if (packets) {
      setRemovedLogIds((current) => new Set(current).add(logId));
    } else {
      setLogs(remainingLogs);
    }
    if (remainingLogs.length === 0) {
      setStatusMessage('No historical logs available. Storage cleared.');
    }
  };

  const handleExportLog = (log: PacketLogRecord) => {
    const csv = [
      ['File Name', 'Device', 'IP Address', 'Primary Protocol', 'Size (MB)', 'Archived At', 'Compression Status'],
      [log.fileName, log.deviceName ?? '', log.ipAddress ?? '', log.protocol, log.sizeMB.toFixed(1), log.timestamp, log.compressed ? 'Compressed (.gz)' : 'Uncompressed'],
    ].map((row) => row.map((field) => `"${String(field).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${log.fileName.replace(/\.[^.]+$/, '')}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleUploadClick = async () => {
    const filePickerWindow = window as Window & {
      showOpenFilePicker?: (options: LogFilePickerOptions) => Promise<unknown[]>;
    };

    if (!filePickerWindow.showOpenFilePicker) {
      uploadInputRef.current?.click();
      return;
    }

    // The picker is currently a UI affordance only; chosen file contents are not imported.
    try {
      await filePickerWindow.showOpenFilePicker({
        multiple: true,
        startIn: 'downloads',
        types: [{
          description: 'NetSentinel Logs (PCAP, CSV, JSON)',
          accept: {
            'application/vnd.tcpdump.pcap': ['.pcap', '.pcapng'],
            'text/csv': ['.csv'],
            'application/json': ['.json'],
          },
        }],
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      console.warn('Native log file picker failed; opening the standard file picker instead.', error);
      uploadInputRef.current?.click();
    }
  };

  return (
    <div className="dashboard">
      <div className="dashboard-heading page-heading-centered logs-heading">
        <div className="page-heading-back" aria-hidden="true" />
        <div className="page-heading-title">
          <span className="eyebrow">STORAGE & LOG MANAGEMENT (UC11)</span>
          <h1>Log Viewer</h1>
          <p>Manage archived capture files and clear historical logs to free local storage.</p>
        </div>

        <div className="page-heading-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            ref={uploadInputRef}
            type="file"
            accept=".pcap,.pcapng,.csv,.json"
            aria-label="Choose log files to upload"
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="tool-btn"
            onClick={handleUploadClick}
          >
            Upload
          </button>

          {/* Button opens the confirmation modal before clearing archived packet captures. */}
          <button
            type="button"
            className="tool-btn"
            onClick={() => setShowConfirmModal(true)}
            disabled={activeCount === 0}
            style={{
              backgroundColor: activeCount === 0 ? undefined : 'rgba(239, 68, 68, 0.16)',
              color: activeCount === 0 ? undefined : '#f87171',
              borderColor: activeCount === 0 ? undefined : 'rgba(239, 68, 68, 0.4)',
              cursor: activeCount === 0 ? 'not-allowed' : 'pointer',
              opacity: activeCount === 0 ? 0.5 : 1,
            }}
          >
            Clear History
          </button>
        </div>
      </div>

      <section className="dashboard-card">
        <div className="logs-tabs" role="tablist" aria-label="Log type">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'captures'}
            className={activeTab === 'captures' ? 'is-active' : ''}
            onClick={() => {
              setActiveTab('captures');
              setStatusMessage('');
            }}
          >
            Packet Captures
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'security'}
            className={activeTab === 'security' ? 'is-active' : ''}
            onClick={() => {
              setActiveTab('security');
              setStatusMessage('');
            }}
          >
            Security Event Logs
          </button>
        </div>

        {activeTab === 'captures' && (
          <>
            <div className="logs-management-toolbar">
              <input
                type="search"
                className="filter-input logs-search"
                placeholder="Search by filename..."
                aria-label="Search log filenames"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
              <label className="logs-protocol-filter">
                Protocol
                <select
                  aria-label="Filter logs by protocol"
                  className="modal-select"
                  value={protocolFilter}
                  onChange={(event) => setProtocolFilter(event.target.value)}
                >
                  <option>All</option>
                  <option>TCP</option>
                  <option>HTTPS</option>
                  <option>HTTP</option>
                  <option>DNS</option>
                  <option>UDP</option>
                  <option>ICMP</option>
                </select>
              </label>
            </div>
            <p className="logs-storage-summary" role="status">
              Total Storage Used: {totalStorageMB.toFixed(1)} MB across {logs.length} files
            </p>
            <p className="logs-demo-note">
              Storage totals and compression badges reflect simulated archive metadata, not on-disk files.
            </p>
            {logs.length === 0 ? (
              <div className="logs-empty-state">
                {statusMessage || 'No historical logs available. Storage cleared.'}
              </div>
            ) : (
              <div className="packet-table-container">
                <table className="packet-table logs-table">
                  <thead>
                    <tr>
                      <th>File Name</th>
                      <th>Device</th>
                      <th>IP Address</th>
                      <th>Primary Protocol</th>
                      <th>Size</th>
                      <th>Compression</th>
                      <th>Archived At</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.length > 0 ? filteredLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{log.fileName}</td>
                        <td>{log.deviceName ?? '—'}</td>
                        <td>{log.ipAddress ?? '—'}</td>
                        <td className="protocol-cell">{log.protocol}</td>
                        <td>{log.sizeMB.toFixed(1)} MB</td>
                        <td>
                          <span className={`compression-badge${log.compressed ? ' is-compressed' : ''}`}>
                            {log.compressed ? 'Compressed (.gz)' : 'Uncompressed'}
                          </span>
                        </td>
                        <td className="time-cell">{log.timestamp}</td>
                        <td className="logs-row-actions">
                          <button
                            type="button"
                            className="tool-btn"
                            onClick={() => handleExportLog(log)}
                            aria-label={`Export CSV ${log.fileName}`}
                          >
                            Export CSV
                          </button>
                          <button
                            type="button"
                            className="tool-btn"
                            onClick={() => handleRemoveLog(log.id)}
                            aria-label={`Remove ${log.fileName}`}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={8} className="no-data">No logs match this search or protocol.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {activeTab === 'security' && (
          securityEvents.length === 0 ? (
            <div className="logs-empty-state">
              {statusMessage || 'No security event logs available.'}
            </div>
          ) : (
            <div className="packet-table-container">
              <table className="packet-table logs-table">
                <thead>
                  <tr><th>Timestamp</th><th>Severity</th><th>Alert Type</th><th>Event</th><th>Source</th><th>Device</th></tr>
                </thead>
                <tbody>
                  {securityEvents.map((event) => (
                    <tr key={event.id}>
                      <td className="time-cell">{new Date(event.timestamp).toLocaleString()}</td>
                      <td><span className={`security-severity severity-${event.severity.toLowerCase()}`}>{event.severity}</span></td>
                      <td>{event.alertType}</td>
                      <td>{event.message}</td>
                      <td>{event.source}</td>
                      <td>{event.deviceName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>

      {/* Confirmation modal ensures the log purge is intentional before deleting historical records. */}
      {showConfirmModal && (
        <div className="modal-overlay" role="dialog" aria-label="Confirm Log Deletion">
          <div className="modal-box">
            <div className="modal-header">
              <h3>Confirm Log Cleanup</h3>
              <button type="button" onClick={() => setShowConfirmModal(false)} className="modal-close">✕</button>
            </div>
            <div className="modal-body">
              <p>
                Permanently delete {activeCount} {activeTab === 'captures' ? 'historical log files' : 'security event logs'}?
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" onClick={() => setShowConfirmModal(false)} className="btn-cancel">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="btn-export"
                style={{ backgroundColor: '#ef4444', color: '#ffffff' }}
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};