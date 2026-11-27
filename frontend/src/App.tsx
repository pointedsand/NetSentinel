import { useState, type ReactNode } from 'react';
import netSentinelMark from './assets/netsentinel-mark.png';
import './App.css';
import { AlertsPage } from './pages/AlertsPage';
import { DashboardOverview } from './pages/DashboardOverview';
import { DevicesPage } from './pages/DevicesPage';
import { LogViewerPage } from './pages/LogViewerPage';
import { PacketsPage } from './pages/PacketsPage';
import { SettingsPage } from './pages/SettingsPage';
import { createSeedAlerts, DEFAULT_ALERT_RULES } from './pages/alertTypes';
import type { AlertItem, AlertRules } from './pages/alertTypes';
import { usePacketSimulation } from './hooks/usePacketSimulation';
import { LiveWorkspace } from './pages/LiveWorkspace';

type PageId = 'dashboard' | 'packets' | 'devices' | 'alerts' | 'logs' | 'settings';

const pages: { id: PageId; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'packets', label: 'Packets' },
  { id: 'devices', label: 'Devices' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'logs', label: 'Logs' },
  { id: 'settings', label: 'Settings' },
];

function AppShell({ children, activePage, setActivePage }: { children: ReactNode; activePage: PageId; setActivePage: (page: PageId) => void }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <button
            className="brand"
            type="button"
            aria-label="NetSentinel home"
            onClick={() => setActivePage('dashboard')}
          >
            <img src={netSentinelMark} alt="" />
            <span>NetSentinel</span>
          </button>
          <nav className="main-navigation" aria-label="Main navigation">
            {pages.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-current={activePage === id ? 'page' : undefined}
                onClick={() => setActivePage(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="page-content">{children}</main>
    </div>
  );
}

export function App() {
  const [live, setLive] = useState(() => new URLSearchParams(location.search).get('mode') === 'live');
  return live ? <LiveWorkspace onDemo={() => setLive(false)} /> : <>
    <button className="tool-btn" onClick={() => setLive(true)}>Connect to live backend</button>
    <DemoApp />
  </>;
}

function DemoApp() {
  // Shared state stays above page selection so navigation does not reset cross-page data.
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [alerts, setAlerts] = useState<AlertItem[]>(() => createSeedAlerts());
  const [alertRules, setAlertRules] = useState<AlertRules>(DEFAULT_ALERT_RULES);
  // PacketsPage receives only the shared stream generated from simulationData via this hook.
  const { packets, setPackets, isCapturing, setIsCapturing } = usePacketSimulation();

  return (
    <AppShell activePage={activePage} setActivePage={setActivePage}>
      {(() => {
        switch (activePage) {
          case 'dashboard':
            return <DashboardOverview packets={packets} alerts={alerts} />;
          case 'packets':
            return (
              <PacketsPage
                packets={packets}
                setPackets={setPackets}
                isCapturing={isCapturing}
                setIsCapturing={setIsCapturing}
                onNavigateDashboard={() => setActivePage('dashboard')}
              />
            );
          case 'devices':
            return <DevicesPage packets={packets} onNavigateDashboard={() => setActivePage('dashboard')} />;
          case 'alerts':
            return (
              <AlertsPage
                packets={packets}
                alerts={alerts}
                setAlerts={setAlerts}
                rules={alertRules}
                setRules={setAlertRules}
              />
            );
          case 'logs':
            return (
              <LogViewerPage
                packets={packets}
                alerts={alerts}
                setAlerts={setAlerts}
              />
            );
          case 'settings':
            return <SettingsPage onNavigateDashboard={() => setActivePage('dashboard')} />;
          default:
            return <DashboardOverview packets={packets} alerts={alerts} />;
        }
      })()}
    </AppShell>
  );
}

export default App;
