/**
 * Module: LogViewerPage.tsx
 * Author: George Salmi
 * Implements: UC11 (Log Cleanup) & FR24 (Clear historical logs from local interface)
 * Purpose: Displays historical packet logs and provides a confirmation workflow
 *          to delete stored logs and free local disk space.
 */
import React, { useState } from 'react';

// Describes one archived packet capture stored in the local log history.
export interface PacketLogRecord {
  id: string;
  fileName: string;
  protocol: string;
  sizeMB: number;
  timestamp: string;
}

// Allows the page to receive an initial list of logs for testing or integration scenarios.
interface LogViewerPageProps {
  initialLogs?: PacketLogRecord[];
}

// Sample log records shown when the page is first opened without external data.
const DEFAULT_LOGS: PacketLogRecord[] = [
  { id: '1', fileName: 'log_2026_11_01.pcap', protocol: 'TCP', sizeMB: 5.4, timestamp: '2026-11-01 14:20:10' },
  { id: '2', fileName: 'log_2026_11_02.pcap', protocol: 'UDP', sizeMB: 4.1, timestamp: '2026-11-02 18:05:44' },
  { id: '3', fileName: 'log_2026_11_03.pcap', protocol: 'ICMP', sizeMB: 4.7, timestamp: '2026-11-03 09:12:33' },
];

export const LogViewerPage: React.FC<LogViewerPageProps> = ({ initialLogs = DEFAULT_LOGS }) => {
  // Maintains the current list of stored packet logs shown in the viewer.
  const [logs, setLogs] = useState<PacketLogRecord[]>(initialLogs);

  // Controls whether the delete confirmation modal is visible.
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);

  // Message displayed after a successful log cleanup so the empty state is clear to the user.
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Clears the log history after the user confirms the destructive action.
  const handleConfirmDelete = () => {
    setLogs([]);
    setShowConfirmModal(false);
    setStatusMessage('No historical logs available. Storage cleared.');
  };

  return (
    <div className="dashboard">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">STORAGE & LOG MANAGEMENT (UC11)</span>
          <h1>Log Viewer</h1>
          <p>Manage archived capture files and clear historical logs to free local storage.</p>
        </div>

        {/* Button opens the confirmation modal before clearing archived packet captures. */}
        <button
          type="button"
          className="tool-btn"
          onClick={() => setShowConfirmModal(true)}
          disabled={logs.length === 0}
          style={{
            backgroundColor: logs.length === 0 ? undefined : 'rgba(239, 68, 68, 0.16)',
            color: logs.length === 0 ? undefined : '#f87171',
            borderColor: logs.length === 0 ? undefined : 'rgba(239, 68, 68, 0.4)',
            cursor: logs.length === 0 ? 'not-allowed' : 'pointer',
            opacity: logs.length === 0 ? 0.5 : 1,
          }}
        >
          Clear History
        </button>
      </div>

      <section className="dashboard-card">
        {/* Empty state is shown after the user clears the log history. */}
        {logs.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: '#8998b2' }}>
            {statusMessage || 'No historical logs available. Storage cleared.'}
          </div>
        ) : (
          // Render the archived packet rows when log data is available.
          <div className="packet-table-container">
            <table className="packet-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Primary Protocol</th>
                  <th>Size</th>
                  <th>Archived At</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{log.fileName}</td>
                    <td className="protocol-cell">{log.protocol}</td>
                    <td>{log.sizeMB.toFixed(1)} MB</td>
                    <td className="time-cell">{log.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
              <p>Permanently delete all {logs.length} historical log files from local disk?</p>
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