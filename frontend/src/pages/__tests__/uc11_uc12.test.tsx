// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LogViewerPage } from '../LogViewerPage';
import { SettingsPage, parseStartupConfig, SAFE_DEFAULT_CONFIG } from '../SettingsPage';

describe('UC11: Log Cleanup (LogViewerPage)', () => {
  // TC01: Normal Flow
  it('TC01: deletes all historical logs after user confirmation', () => {
    render(<LogViewerPage />);
    expect(screen.getByText('log_2026_11_01.pcap')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Clear History/i }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm Delete/i }));

    expect(screen.queryByText('log_2026_11_01.pcap')).toBeNull();
    expect(screen.getByText(/No historical logs available\. Storage cleared\./i)).toBeTruthy();
  });

  // TC02: Alternative Flow (Cancel)
  it('TC02: preserves existing historical logs when deletion is canceled', () => {
    render(<LogViewerPage />);
    fireEvent.click(screen.getByRole('button', { name: /Clear History/i }));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

    expect(screen.getByText('log_2026_11_01.pcap')).toBeTruthy();
    expect(screen.getByText('log_2026_11_02.pcap')).toBeTruthy();
  });

  // TC03: Edge Case (Empty Repository)
  it('TC03: disables Clear History button when log repository is already empty', () => {
    render(<LogViewerPage initialLogs={[]} />);
    const clearButton = screen.getByRole('button', { name: /Clear History/i });

    expect(clearButton.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/No historical logs available\. Storage cleared\./i)).toBeTruthy();
  });
});

describe('UC12: Configuration Startup (SettingsPage)', () => {
  // TC04: Normal Flow
  it('TC04: parses valid config.json values accurately', () => {
    const validJson = JSON.stringify({
      defaultInterface: 'eth0',
      bandwidthAlertThresholdMbps: 100,
      autoCompressLogs: true,
      logRetentionDays: 7,
    });

    const result = parseStartupConfig(validJson);
    expect(result.isError).toBe(false);
    expect(result.config.defaultInterface).toBe('eth0');
    expect(result.config.bandwidthAlertThresholdMbps).toBe(100);
  });

  // TC05: Invalid Input / Exception Flow
  it('TC05: falls back to SAFE_DEFAULT_CONFIG on invalid JSON or negative thresholds', () => {
    const badJson = JSON.stringify({
      defaultInterface: 'eth0',
      bandwidthAlertThresholdMbps: -50,
      logRetentionDays: 7,
    });

    const result = parseStartupConfig(badJson);
    expect(result.isError).toBe(true);
    expect(result.config).toEqual(SAFE_DEFAULT_CONFIG);

    render(<SettingsPage rawConfigJson={badJson} />);
    expect(screen.getByRole('status').textContent).toContain(
      'Invalid configuration file detected. Loaded default system parameters.'
    );
  });
});