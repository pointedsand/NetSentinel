// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { SIMULATED_DEVICES } from '../simulationData';

function renderAppInDemoMode() {
  window.history.replaceState(null,'','/?workspace=simulation');
  try { return render(<App />); }
  finally { window.history.replaceState(null,'','/'); }
}

describe('Local workspace access', () => {
  it('opens the Dashboard without credentials and exposes Access Control in Settings', () => {
    render(<App />);
    const nav = screen.getByRole('navigation',{name:'Main navigation'});
    expect(within(nav).getByRole('button',{name:'Dashboard'})).toHaveAttribute('aria-current','page');
    expect(screen.queryByLabelText('Password')).toBeNull();
    fireEvent.click(within(nav).getByRole('button',{name:'Settings'}));
    fireEvent.click(screen.getByRole('tab',{name:'Access Control'}));
    expect(screen.getByRole('heading',{name:'Administrator Protection'})).toBeVisible();
    expect(screen.queryByRole('tab',{name:'Account'})).toBeNull();
  });
});

describe('Desktop application shell', () => {
  it('keeps the sidebar active page and capture action synchronized across routes', () => {
    renderAppInDemoMode();
    const sidebar = screen.getByRole('navigation',{name:'Main navigation'});
    expect(within(sidebar).getByRole('button',{name:'Dashboard'})).toHaveAttribute('aria-current','page');
    const header = screen.getByRole('banner',{name:'Workspace'});
    expect(within(header).getByRole('heading',{name:'Dashboard'})).toBeVisible();
    fireEvent.click(within(header).getByRole('button',{name:'Stop capture'}));
    fireEvent.click(within(sidebar).getByRole('button',{name:'Packets'}));
    expect(within(sidebar).getByRole('button',{name:'Packets'})).toHaveAttribute('aria-current','page');
    expect(within(header).getByRole('button',{name:'Start capture'})).toBeVisible();
    fireEvent.click(within(header).getByRole('button',{name:'Start capture'}));
    fireEvent.click(within(sidebar).getByRole('button',{name:'Dashboard'}));
    expect(within(header).getByRole('button',{name:'Stop capture'})).toBeVisible();
  });
});

describe('Packets tab virtualization', () => {
  it('displays packet hosts and labels from the shared simulation data', () => {
    const { container } = renderAppInDemoMode();
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
    const { container } = renderAppInDemoMode();
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
  it('changes the shared header while preserving page-specific actions and access settings', () => {
    renderAppInDemoMode();
    const nav = screen.getByRole('navigation',{name:'Main navigation'});
    const header = screen.getByRole('banner',{name:'Workspace'});
    fireEvent.click(within(nav).getByRole('button',{name:'Logs'}));
    expect(within(header).getByRole('heading',{name:'Logs'})).toBeVisible();
    expect(screen.getByRole('button',{name:'Upload'})).toBeVisible();
    fireEvent.click(within(nav).getByRole('button',{name:'Settings'}));
    expect(within(header).getByRole('heading',{name:'Settings'})).toBeVisible();
    fireEvent.click(screen.getByRole('tab',{name:'Access Control'}));
    expect(screen.getByRole('heading',{name:'Administrator Protection'})).toBeVisible();
  });
});

describe('Dashboard alert synchronization', () => {
  it('reflects alert acknowledgments made on the Alerts page', () => {
    renderAppInDemoMode();
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
    renderAppInDemoMode();
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
    const info = screen.getByRole('cell',{name:'Info'});
    expect(within(info).queryByRole('button')).toBeNull();
    expect(info.querySelector('a,input,[tabindex]')).toBeNull();
  });
});
