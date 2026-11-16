/**
 * @file uc09_uc10.test.tsx
 * Tests TC08–TC13 for Dashboard Monitoring (UC9) and Session Control (UC10).
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import DashboardPage from '../DashboardPage';
import type { CaptureCommand, TelemetryClient, TelemetryMessage } from '../../services/telemetryClient';

/** Builds a fake client whose telemetry/status feeds the test drives manually. */
function createFakeClient(sendControl: (c: CaptureCommand) => Promise<void> = async () => {}) {
  let onMessage: (m: TelemetryMessage) => void = () => {};
  let onStatus: (c: boolean) => void = () => {};
  const client: TelemetryClient = {
    subscribe: (m, s) => {
      onMessage = m;
      onStatus = s;
      return () => {};
    },
    sendControl: vi.fn(sendControl),
  };
  return {
    client,
    push: (m: TelemetryMessage) => act(() => onMessage(m)),
    setConnected: (c: boolean) => act(() => onStatus(c)),
  };
}

const frame = (packetCount: number, bandwidthMbps = 0, activeConnections = 0): TelemetryMessage => ({
  packetCount,
  bandwidthMbps,
  activeConnections,
});

describe('UC9 Dashboard Monitoring', () => {
  it('TC08: renders packet, bandwidth and connection telemetry', () => {
    const fake = createFakeClient();
    render(<DashboardPage client={fake.client} />);
    fake.setConnected(true);
    fake.push(frame(12584, 42.5, 37));

    expect(screen.getByTestId('packet-count')).toHaveTextContent('12,584');
    expect(screen.getByTestId('bandwidth')).toHaveTextContent('42.5 Mbps');
    expect(screen.getByTestId('active-connections')).toHaveTextContent('37');
    expect(screen.queryByText(/backend disconnected/i)).not.toBeInTheDocument();
  });

  it('TC09: keeps up with a high-frequency telemetry stream', () => {
    const fake = createFakeClient();
    render(<DashboardPage client={fake.client} />);
    fake.setConnected(true);

    for (let i = 1; i <= 200; i++) fake.push(frame(i * 100, i / 10, i));

    expect(screen.getByTestId('packet-count')).toHaveTextContent('20,000');
    expect(screen.getByTestId('bandwidth')).toHaveTextContent('20.0 Mbps');
    expect(screen.getByTestId('active-connections')).toHaveTextContent('200');
  });

  it('TC10: shows zero counts and an idle warning when disconnected', () => {
    const fake = createFakeClient();
    render(<DashboardPage client={fake.client} />);

    expect(screen.getByTestId('packet-count')).toHaveTextContent('0');
    expect(screen.getByTestId('bandwidth')).toHaveTextContent('0.0 Mbps');
    expect(screen.getByTestId('active-connections')).toHaveTextContent('0');
    expect(screen.getByRole('status')).toHaveTextContent(/disconnected/i);
    expect(screen.getByTestId('capture-status')).toHaveTextContent('PAUSED');

    fake.setConnected(true);
    fake.push(frame(500, 5, 5));
    fake.setConnected(false);
    expect(screen.getByTestId('packet-count')).toHaveTextContent('0');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('UC10 Session Control', () => {
  it('TC11: start dispatches the control signal and flags RUNNING', async () => {
    const fake = createFakeClient();
    render(<DashboardPage client={fake.client} />);

    await userEvent.click(screen.getByRole('button', { name: /start capture/i }));

    expect(fake.client.sendControl).toHaveBeenCalledWith('start_capture');
    expect(screen.getByTestId('capture-status')).toHaveTextContent('RUNNING');
    expect(screen.getByRole('button', { name: /start capture/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /stop capture/i })).toBeEnabled();
  });

  it('TC12: stop dispatches the control signal and flags PAUSED', async () => {
    const fake = createFakeClient();
    render(<DashboardPage client={fake.client} />);

    await userEvent.click(screen.getByRole('button', { name: /start capture/i }));
    await userEvent.click(screen.getByRole('button', { name: /stop capture/i }));

    expect(fake.client.sendControl).toHaveBeenLastCalledWith('stop_capture');
    expect(screen.getByTestId('capture-status')).toHaveTextContent('PAUSED');
    expect(screen.getByRole('button', { name: /start capture/i })).toBeEnabled();
  });

  it('TC13: IPC failure shows a dismissible banner and keeps the status unchanged', async () => {
    const fake = createFakeClient(async () => {
      throw new Error('IPC transmission failed');
    });
    render(<DashboardPage client={fake.client} />);

    await userEvent.click(screen.getByRole('button', { name: /start capture/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/IPC transmission failed/);
    expect(screen.getByTestId('capture-status')).toHaveTextContent('PAUSED');
    // Page stays usable (non-blocking).
    expect(screen.getByRole('button', { name: /start capture/i })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: /dismiss error/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
