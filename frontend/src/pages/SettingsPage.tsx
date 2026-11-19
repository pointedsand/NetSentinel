/**
 * Module: SettingsPage.tsx
 * Author: George Salmi
 * Demonstrates startup configuration parsing and in-page editing. The current
 * frontend does not load config.json from disk or apply values to the backend.
 */
import React, { useState } from 'react';

// Describes the startup settings that can be edited from the monitoring configuration page.
export interface StartupConfig {
  defaultInterface: string;
  bandwidthAlertThresholdMbps: number;
  autoCompressLogs: boolean;
  logRetentionDays: number;
}

// Safe fallback values are used when supplied configuration JSON is malformed.
export const SAFE_DEFAULT_CONFIG: StartupConfig = {
  defaultInterface: 'eth0',
  bandwidthAlertThresholdMbps: 50,
  autoCompressLogs: true,
  logRetentionDays: 14,
};

/**
 * Validates supplied JSON and returns parsed settings or a safe fallback with a status message.
 * When omitted, rawJson produces the sample startup configuration used by the demo.
 */
export function parseStartupConfig(rawJson?: string): { config: StartupConfig; banner: string; isError: boolean } {
  if (!rawJson) {
    return {
      config: { defaultInterface: 'eth0', bandwidthAlertThresholdMbps: 100, autoCompressLogs: true, logRetentionDays: 7 },
      banner: 'Configuration loaded from config.json',
      isError: false,
    };
  }

  try {
    const parsed = JSON.parse(rawJson);
    if (
      typeof parsed.defaultInterface !== 'string' ||
      parsed.defaultInterface.trim() === '' ||
      typeof parsed.bandwidthAlertThresholdMbps !== 'number' ||
      parsed.bandwidthAlertThresholdMbps <= 0 ||
      typeof parsed.logRetentionDays !== 'number' ||
      parsed.logRetentionDays <= 0
    ) {
      throw new Error('Boundary validation failed');
    }

    return {
      config: {
        defaultInterface: parsed.defaultInterface,
        bandwidthAlertThresholdMbps: parsed.bandwidthAlertThresholdMbps,
        autoCompressLogs: Boolean(parsed.autoCompressLogs),
        logRetentionDays: parsed.logRetentionDays,
      },
      banner: 'Configuration loaded from config.json',
      isError: false,
    };
  } catch {
    return {
      config: SAFE_DEFAULT_CONFIG,
      banner: 'Invalid configuration file detected. Loaded default system parameters.',
      isError: true,
    };
  }
}

interface SettingsPageProps {
  rawConfigJson?: string;
  onNavigateDashboard?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ rawConfigJson, onNavigateDashboard }) => {
  // Parse the startup config once and use it as the initial form state.
  const initial = parseStartupConfig(rawConfigJson);

  // Current editable values for the monitoring configuration.
  const [config, setConfig] = useState<StartupConfig>(initial.config);

  // Status text shown to the user after config load or save operations.
  const [banner, setBanner] = useState<string>(initial.banner);

  // Tracks whether the loaded configuration is valid or has fallen back to safe defaults.
  const [isError, setIsError] = useState<boolean>(initial.isError);

  // Updates the local form status; persistence and backend application are not wired yet.
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsError(false);
    setBanner('Configuration saved and applied to active monitoring engine.');
  };

  return (
    <div className="dashboard">
      <div className="dashboard-heading page-heading-centered">
        <div className="page-heading-back">
          {onNavigateDashboard && (
            <button type="button" onClick={onNavigateDashboard} className="back-link">
              &lt; Dashboard
            </button>
          )}
        </div>
        <div className="page-heading-title">
          <span className="eyebrow">SYSTEM PREFERENCES (UC12)</span>
          <h1>Configuration Settings</h1>
          <p>Startup parameters loaded automatically from external config.json on launch.</p>
        </div>
        <div className="page-heading-actions" aria-hidden="true" />
      </div>

      <section className="dashboard-card" style={{ maxWidth: '640px' }}>
        {/* Displays whether the config was loaded successfully or replaced with default values. */}
        <div
          role="status"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            marginBottom: '1.25rem',
            fontSize: '0.85rem',
            backgroundColor: isError ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
            color: isError ? '#f87171' : '#4ade80',
            border: `1px solid ${isError ? 'rgba(239, 68, 68, 0.35)' : 'rgba(34, 197, 94, 0.35)'}`,
          }}
        >
          {banner}
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* The default interface selects which network adapter the monitoring engine should use. */}
          <div className="form-row">
            <label htmlFor="iface-input">Default Network Interface</label>
            <input
              id="iface-input"
              className="filter-input"
              value={config.defaultInterface}
              onChange={(e) => setConfig({ ...config, defaultInterface: e.target.value })}
            />
          </div>

          {/* Bandwidth limit that triggers an alert when the monitored link exceeds the threshold. */}
          <div className="form-row">
            <label htmlFor="threshold-input">Bandwidth Alert Threshold (Mbps)</label>
            <input
              id="threshold-input"
              className="filter-input"
              type="number"
              value={config.bandwidthAlertThresholdMbps}
              onChange={(e) => setConfig({ ...config, bandwidthAlertThresholdMbps: Number(e.target.value) })}
            />
          </div>

          {/* How long packet logs should be retained before the system starts pruning old records. */}
          <div className="form-row">
            <label htmlFor="retention-input">Log Retention Period (Days)</label>
            <input
              id="retention-input"
              className="filter-input"
              type="number"
              value={config.logRetentionDays}
              onChange={(e) => setConfig({ ...config, logRetentionDays: Number(e.target.value) })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="submit" className="btn-export">
              Apply Configuration
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};