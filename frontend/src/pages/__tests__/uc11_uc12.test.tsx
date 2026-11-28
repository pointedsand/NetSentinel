// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LogViewerPage } from '../LogViewerPage';
import { NetworkAuthorizationPanel } from '../../components/NetworkAuthorizationPanel';
import { SettingsPage } from '../SettingsPage';
import { parseStartupConfig, SAFE_DEFAULT_CONFIG } from '../startupConfig';

describe('UC11: Log Cleanup (LogViewerPage)', () => {
  const macBookCapture = 'capture_192-168-1-10_MacBook-Pro.pcap';
  const iphoneCapture = 'capture_192-168-1-15_iPhone-15.pcap';
  const smartTvCapture = 'capture_192-168-1-22_Smart-TV.pcap';

  // TC01: Normal Flow
  it('TC01: deletes all historical logs after user confirmation', () => {
    render(<LogViewerPage />);
    expect(screen.getByText(macBookCapture)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Clear History/i }));
    expect(screen.getByRole('dialog', { name: 'Confirm Log Deletion' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Confirm Delete/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Confirm Delete/i }));

    expect(screen.queryByText(macBookCapture)).toBeNull();
    expect(screen.getByText(/No historical logs available\. Storage cleared\./i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Clear History/i }).hasAttribute('disabled')).toBe(true);
  });

  // TC02: Alternative Flow (Cancel)
  it('TC02: preserves existing historical logs when deletion is canceled', () => {
    render(<LogViewerPage />);
    fireEvent.click(screen.getByRole('button', { name: /Clear History/i }));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

    expect(screen.getByText(macBookCapture)).toBeTruthy();
    expect(screen.getByText(iphoneCapture)).toBeTruthy();
  });

  // TC03: Edge Case (Empty Repository)
  it('TC03: disables Clear History button when log repository is already empty', () => {
    render(<LogViewerPage initialLogs={[]} />);
    const clearButton = screen.getByRole('button', { name: /Clear History/i });

    expect(clearButton.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/No historical logs available\. Storage cleared\./i)).toBeTruthy();
  });

  it('removes only the selected archived log', () => {
    render(<LogViewerPage />);

    fireEvent.click(screen.getByRole('button', { name: `Remove ${macBookCapture}` }));

    expect(screen.queryByText(macBookCapture)).toBeNull();
    expect(screen.getByText(iphoneCapture)).toBeTruthy();
    expect(screen.getByText(smartTvCapture)).toBeTruthy();
  });

  it('shows the empty state and disables Clear History after the last log is removed', () => {
    render(<LogViewerPage initialLogs={[{
      id: 'only',
      fileName: 'only.pcap',
      protocol: 'TCP',
      sizeMB: 1.2,
      timestamp: '2026-11-03 09:12:33',
      compressed: true,
    }]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove only.pcap' }));

    expect(screen.getByText('No historical logs available. Storage cleared.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Clear History/i }).hasAttribute('disabled')).toBe(true);
  });

  it('filters archived logs by filename and protocol and summarizes stored sizes', () => {
    render(<LogViewerPage />);

    expect(screen.getByText('Total Storage Used: 30.1 MB across 9 files')).toBeTruthy();
    expect(screen.getAllByText('Compressed (.gz)').length).toBe(9);
    expect(screen.getByText(/reflect simulated archive metadata/)).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search log filenames' }), {
      target: { value: 'iPhone-15' },
    });
    expect(screen.getByText(iphoneCapture)).toBeTruthy();
    expect(screen.queryByText(macBookCapture)).toBeNull();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search log filenames' }), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter logs by protocol' }), {
      target: { value: 'DNS' },
    });
    expect(screen.getByText('capture_192-168-1-8_iPad.pcap')).toBeTruthy();
    expect(screen.queryByText(iphoneCapture)).toBeNull();
  });

  it('downloads the selected log metadata as a CSV file', () => {
    const createObjectURL = vi.fn(() => 'blob:log-export');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<LogViewerPage />);

    fireEvent.click(screen.getByRole('button', { name: `Export CSV ${macBookCapture}` }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:log-export');
    vi.unstubAllGlobals();
    clickSpy.mockRestore();
  });

  it('shows and clears security event logs independently', () => {
    render(<LogViewerPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Security Event Logs' }));

    expect(screen.getByText('Device first-time connection detected on the local subnet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Clear History/i }));
    expect(screen.getByText(/Permanently delete 5 security event logs/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Confirm Delete/i }));

    expect(screen.getByText('No security event logs available.')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Packet Captures' }));
    expect(screen.getByText(macBookCapture)).toBeTruthy();
  });

  it('opens the file picker for CSV and JSON packet metadata when Upload is clicked', () => {
    render(<LogViewerPage />);
    const fileInput = screen.getByLabelText('Choose log files to upload') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, 'click');

    expect(fileInput.accept).toBe('.csv,.json');
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(clickSpy).toHaveBeenCalledOnce();
  });

  it('uses the file input even when the browser exposes a restricted native picker', () => {
    const native = vi.fn();
    vi.stubGlobal('showOpenFilePicker',native);
    try {
      render(<LogViewerPage />);
      const select = vi.spyOn(screen.getByLabelText('Choose log files to upload'),'click');
      fireEvent.click(screen.getByRole('button',{name:'Upload'}));
      expect(select).toHaveBeenCalledOnce();
      expect(native).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
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

  it('keeps credential management unavailable while the backend is disconnected', () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Access Control' }));
    expect(screen.getByRole('status')).toHaveTextContent('Connect to the local bridge');
    expect(screen.queryByLabelText('New password')).toBeNull();
  });

  it('lets the user add and select a network in the sample network panel without claiming it was verified', () => {
    render(<NetworkAuthorizationPanel mode="manage" />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add a network' }));
    fireEvent.change(screen.getByLabelText('Network name (SSID)'), { target: { value: 'My-Home-WiFi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add SSID' }));

    expect(screen.getByText('My-Home-WiFi')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/hasn’t been saved or verified/);

    fireEvent.click(screen.getByRole('button', { name: 'Authorize selected networks' }));
    expect(screen.getByRole('status').textContent).toMatch(/can’t verify your connection or save the selection/);
  });
});