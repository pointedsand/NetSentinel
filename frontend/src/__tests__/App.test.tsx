// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { SIMULATED_DEVICES } from '../simulationData';

describe('Dashboard title layout', () => {
  it('centers the dashboard title while keeping the simulation badge on the right', () => {
    const { container } = render(<App />);

    expect(container.querySelector('.dashboard-heading-centered .dashboard-title')).toBeTruthy();
    expect(container.querySelector('.dashboard-heading-centered > .demo-badge')).toBeTruthy();
  });
});

describe('Packets tab virtualization', () => {
  it('displays packet hosts and labels from the shared simulation data', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Packets' }));

    const rows = Array.from(container.querySelectorAll<HTMLTableRowElement>(
      '.packet-virtualized-container tbody tr:not(.packet-virtual-spacer)'
    ));
    const packetsByHost = new Map(
      rows.map((row) => [row.cells[2].textContent, row.cells[6].textContent])
    );

    for (const device of SIMULATED_DEVICES) {
      expect(packetsByHost.get(device.ipAddress)).toBe(device.packetName);
    }
  });

  it('renders only nearby packet rows and renders later rows when scrolled', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Packets' }));

    const tableContainer = container.querySelector('.packet-virtualized-container') as HTMLDivElement;
    const renderedRows = () => container.querySelectorAll(
      '.packet-virtualized-container tbody tr:not(.packet-virtual-spacer)'
    );

    expect(renderedRows().length).toBeLessThan(40);
    expect(screen.queryByText('400.')).toBeNull();

    tableContainer.scrollTop = 15_800;
    fireEvent.scroll(tableContainer);

    expect(screen.getByText('400.')).toBeTruthy();
    expect(renderedRows().length).toBeLessThan(40);
  });
});

describe('Logs and Settings navigation', () => {
  it('keeps the Logs title centered without a redundant Dashboard button', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Logs' }));

    expect(screen.queryByRole('button', { name: '< Dashboard' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Log Viewer' }).parentElement?.classList.contains('page-heading-title')).toBe(true);
    expect(container.querySelector('.dashboard-heading.page-heading-centered')).toBeTruthy();
  });

  it('keeps a centered Settings title and its Dashboard back button', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(screen.getByRole('button', { name: '< Dashboard' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Configuration Settings' }).parentElement?.classList.contains('page-heading-title')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '< Dashboard' }));
    expect(container.querySelector('.dashboard-heading.page-heading-centered')).toBeNull();
  });
});

describe('Dashboard alert synchronization', () => {
  it('reflects alert acknowledgments made on the Alerts page', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Alerts' }));

    const maliciousAlertRow = Array.from(document.querySelectorAll<HTMLTableRowElement>('.alerts-table tbody tr'))
      .find((row) => row.textContent?.includes('Malicious Traffic'));
    expect(maliciousAlertRow).toBeTruthy();
    fireEvent.click(within(maliciousAlertRow!).getByRole('button', { name: 'Acknowledge' }));

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    expect(screen.queryByText('Malicious Traffic')).toBeNull();
    expect(screen.getByText('Bandwidth Exceeded')).toBeTruthy();
  });
});

describe('Shared simulated data in Logs', () => {
  it('shows the shared simulated hosts and alert feed in the Logs page', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Logs' }));

    const captureRows = Array.from(document.querySelectorAll('.logs-table tbody tr'));
    for (const ipAddress of [
      '192.168.1.10',
      '192.168.1.15',
      '192.168.1.22',
      '192.168.1.8',
      '192.168.1.35',
    ]) {
      expect(captureRows.some((row) => row.textContent?.includes(ipAddress))).toBe(true);
    }

    fireEvent.click(screen.getByRole('tab', { name: 'Security Event Logs' }));
    const securityRows = Array.from(document.querySelectorAll('.logs-table tbody tr'));
    expect(securityRows.some((row) => row.textContent?.includes('Malicious Traffic'))).toBe(true);
    expect(securityRows.some((row) => row.textContent?.includes('192.168.1.100'))).toBe(true);
  });
});
