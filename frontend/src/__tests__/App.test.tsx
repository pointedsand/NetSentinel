// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { SIMULATED_DEVICES } from '../simulationData';

function renderAppInDemoMode() {
  const result = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Explore offline simulation' }));
  return result;
}

describe('Account access screen', () => {
  it('offers sign-in and account creation before entering the app', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByLabelText('Email address')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Explore offline simulation' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeTruthy();
    expect(screen.getByLabelText('Confirm password')).toBeTruthy();
  });

  it('does not imply sign-in succeeded without account services and allows the demo to continue', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'example-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('status').textContent).toMatch(/haven’t been saved/);
    fireEvent.click(screen.getByRole('button', { name: 'Explore offline simulation' }));
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
  });

  it('checks that account creation passwords match', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Demo User' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'first-password' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'second-password' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Continue' }).closest('form')!);

    expect(screen.getByRole('alert').textContent).toMatch(/passwords don’t match/i);
  });

  it('moves account creation into network authorization using sample SSIDs', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Demo User' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'valid-password' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'valid-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByRole('heading', { name: 'Authorize a network' })).toBeTruthy();
    expect(screen.getByText('Maple-Home-WiFi')).toBeTruthy();
    expect(screen.getByText(/By selecting the network you’re connected to, you confirm/)).toBeTruthy();

    fireEvent.click(screen.getByRole('checkbox', { name: /Maple-Home-WiFi/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue with selected networks' }));

    expect(screen.getByRole('heading', { name: 'Network selected' })).toBeTruthy();
    expect(screen.getByText(/haven’t been saved/)).toBeTruthy();
  });
});

describe('Dashboard title layout', () => {
  it('centers the dashboard title while keeping the simulation badge on the right', () => {
    const { container } = renderAppInDemoMode();

    expect(container.querySelector('.dashboard-heading-centered .dashboard-title')).toBeTruthy();
    expect(container.querySelector('.dashboard-heading-centered > .demo-badge')).toBeTruthy();
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
  it('keeps the Logs title centered without a redundant Dashboard button', () => {
    const { container } = renderAppInDemoMode();
    fireEvent.click(screen.getByRole('button', { name: 'Logs' }));

    expect(screen.queryByRole('button', { name: '< Dashboard' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Log Viewer' }).parentElement?.classList.contains('page-heading-title')).toBe(true);
    expect(container.querySelector('.dashboard-heading.page-heading-centered')).toBeTruthy();
  });

  it('keeps a centered Settings title and its Dashboard back button', () => {
    const { container } = renderAppInDemoMode();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(screen.getByRole('button', { name: '< Dashboard' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Configuration Settings' }).parentElement?.classList.contains('page-heading-title')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '< Dashboard' }));
    expect(container.querySelector('.dashboard-heading.page-heading-centered')).toBeNull();
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
  });
});
