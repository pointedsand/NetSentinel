// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { AlertsPage } from '../AlertsPage';
import { createSeedAlerts, DEFAULT_ALERT_RULES } from '../alertTypes';
import type { AlertItem, AlertRules } from '../alertTypes';
import type { Packet } from '../../types';

const packets: Packet[] = [{
  id: 1,
  source: '192.168.1.10',
  destination: '142.250.190.46',
  protocol: 'HTTPS',
  size: '1,000 B',
  sizeBytes: 1000,
  name: 'MacBook Pro (Spotify)',
  timestamp: Date.now(),
  time: 'now',
}];

function TestAlertsPage({ packetList = packets }: { packetList?: Packet[] }) {
  const [alerts, setAlerts] = useState<AlertItem[]>(() => createSeedAlerts());
  const [rules, setRules] = useState<AlertRules>(DEFAULT_ALERT_RULES);
  return <AlertsPage packets={packetList} alerts={alerts} setAlerts={setAlerts} rules={rules} setRules={setRules} />;
}

describe('AlertsPage', () => {
  it('shows seeded alerts and filters them by search and severity', () => {
    render(<TestAlertsPage />);

    const alertRows = () => Array.from(document.querySelectorAll('.alerts-table tbody tr'));
    expect(alertRows().some((row) => row.textContent?.includes('Malicious Traffic'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Critical / High' }));
    expect(alertRows().some((row) => row.textContent?.includes('High Latency'))).toBe(false);
    expect(alertRows().some((row) => row.textContent?.includes('Malicious Traffic'))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search alerts' }), {
      target: { value: '192.168.1.15' },
    });
    expect(alertRows().some((row) => row.textContent?.includes('High Latency'))).toBe(true);
    expect(alertRows().some((row) => row.textContent?.includes('Malicious Traffic'))).toBe(false);
  });

  it('acknowledges an alert and records it in the audit trail and detail drawer', () => {
    render(<TestAlertsPage />);
    const alertRow = Array.from(document.querySelectorAll('.alerts-table tbody tr'))
      .find((row) => row.textContent?.includes('Malicious Traffic'));
    expect(alertRow).toBeTruthy();

    fireEvent.click(alertRow!);
    expect(screen.getByRole('dialog', { name: 'Malicious Traffic' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge Alert' }));

    expect(screen.getAllByText('Acknowledged').length).toBeGreaterThan(0);
    expect(screen.getByText('Acknowledged at', { exact: false })).toBeTruthy();
  });

  it('validates rule thresholds and saves valid rule values', () => {
    render(<TestAlertsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Configure Alert Rules' }));
    fireEvent.change(screen.getByLabelText('Bandwidth threshold (Mbps)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Rules' }));
    expect(screen.getByRole('alert').textContent).toContain('must be positive');

    fireEvent.change(screen.getByLabelText('Bandwidth threshold (Mbps)'), { target: { value: '75' } });
    fireEvent.change(screen.getByLabelText('Latency threshold (ms)'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Rules' }));
    expect(screen.queryByRole('dialog', { name: 'Configure Alert Rules' })).toBeNull();
  });

  it('creates a bandwidth alert when live packet rate exceeds the saved threshold', () => {
    render(<TestAlertsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Configure Alert Rules' }));
    fireEvent.change(screen.getByLabelText('Bandwidth threshold (Mbps)'), { target: { value: '0.0001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Rules' }));

    expect(Array.from(document.querySelectorAll('.alerts-table tbody tr'))
      .some((row) => row.textContent?.includes('above the 0.0001 Mbps threshold'))).toBe(true);
  });

  it('derives new-device alerts from packet data and suppresses muted categories', () => {
    const { rerender } = render(<TestAlertsPage />);
    expect(screen.queryByRole('button', { name: 'Simulate Security Event' })).toBeNull();
    const newPacket: Packet = {
      ...packets[0],
      id: 2,
      source: '192.168.1.99',
      name: 'Unrecognized host',
      timestamp: Date.now(),
    };
    rerender(<TestAlertsPage packetList={[...packets, newPacket]} />);
    expect(Array.from(document.querySelectorAll('.alerts-table tbody tr'))
      .some((row) => row.textContent?.includes('192.168.1.99'))).toBe(true);

    cleanup();
    const mutedRender = render(<TestAlertsPage />);
    fireEvent.click(screen.getByLabelText('New Device Connected'));
    mutedRender.rerender(<TestAlertsPage packetList={[...packets, newPacket]} />);
    expect(Array.from(document.querySelectorAll('.alerts-table tbody tr'))
      .some((row) => row.textContent?.includes('192.168.1.99'))).toBe(false);
  });
});
