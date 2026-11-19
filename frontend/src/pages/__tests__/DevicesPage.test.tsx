// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DevicesPage } from '../DevicesPage';
import type { Packet } from '../../types';

const packets: Packet[] = [{
  id: 1,
  source: '192.168.1.10',
  destination: '142.250.190.46',
  protocol: 'HTTPS',
  size: '1,048,576 B',
  sizeBytes: 1024 * 1024,
  name: 'MacBook Pro (Spotify)',
  timestamp: Date.now(),
  time: 'now',
}];

const renderDevicesPage = (onNavigateDashboard = vi.fn()) => render(
  <DevicesPage packets={packets} onNavigateDashboard={onNavigateDashboard} />
);

describe('DevicesPage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows simulated devices, packet-derived bandwidth, and filters by search and status', () => {
    renderDevicesPage();

    expect(screen.getByRole('button', { name: '< Dashboard' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Device Inventory & Subnet Scanner' }).parentElement?.classList.contains('devices-heading-title')).toBe(true);
    expect(screen.getByText('192.168.1.10')).toBeTruthy();
    expect(screen.getByText('Workstation')).toBeTruthy();
    expect(screen.getByText('Game Console')).toBeTruthy();
    expect(screen.getByText('Network Printer')).toBeTruthy();
    expect(screen.getByText('Security Camera')).toBeTruthy();
    expect(screen.getAllByText('0.839', { exact: false }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Flagged (New)' }));
    expect(screen.getByText('Spotify Desktop')).toBeTruthy();
    expect(screen.queryByText('MacBook Pro')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search devices' }), {
      target: { value: 'A4:5E:60' },
    });
    expect(screen.getByText('MacBook Pro')).toBeTruthy();
    expect(screen.queryByText('Spotify Desktop')).toBeNull();
  });

  it('navigates back to the dashboard from the header button', () => {
    const onNavigateDashboard = vi.fn();
    renderDevicesPage(onNavigateDashboard);

    fireEvent.click(screen.getByRole('button', { name: '< Dashboard' }));

    expect(onNavigateDashboard).toHaveBeenCalledOnce();
  });

  it('trims and saves labels and lets an operator acknowledge a flagged device', () => {
    renderDevicesPage();
    fireEvent.click(screen.getByText('MacBook Pro'));
    fireEvent.change(screen.getByLabelText('Custom device label'), {
      target: { value: '  Office TV  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Label' }));

    expect(screen.getAllByText('Office TV').length).toBeGreaterThan(0);
    expect(screen.getByRole('status').textContent).toBe('Device label saved.');

    fireEvent.click(screen.getByRole('button', { name: 'Close device details' }));
    fireEvent.click(screen.getByText('Spotify Desktop'));
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge & Mark Known' }));
    expect(screen.queryByText('Unrecognized MAC address detected on subnet')).toBeNull();
  });

  it('simulates a subnet scan and adds a flagged newly discovered host', () => {
    vi.useFakeTimers();
    renderDevicesPage();
    fireEvent.click(screen.getByRole('button', { name: 'Scan Subnet' }));

    expect(screen.getByRole('button', { name: /Scanning Subnet/ })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(screen.getByText('192.168.1.100')).toBeTruthy();
    expect(screen.getByText('Unknown')).toBeTruthy();
    expect(screen.getByText(/Last scan:/)).toBeTruthy();
  });
});
