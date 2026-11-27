import { useState, type ReactNode } from 'react';
import netSentinelMark from './assets/netsentinel-mark.png';
import './App.css';
import './styles/auth.css';
import { MonitoringAlerts } from './components/MonitoringAlerts';
import { AlertsPage } from './pages/AlertsPage';
import { DashboardOverview } from './pages/DashboardOverview';
import { DevicesPage } from './pages/DevicesPage';
import { LogViewerPage } from './pages/LogViewerPage';
import { PacketsPage } from './pages/PacketsPage';
import { SettingsPage } from './pages/SettingsPage';
import { AuthPage } from './pages/AuthPage';
import { createSeedAlerts, DEFAULT_ALERT_RULES } from './pages/alertTypes';
import type { AlertItem, AlertRules } from './pages/alertTypes';
import { usePacketSimulation } from './hooks/usePacketSimulation';
import { useCapture } from './hooks/useCapture';
import { CaptureControls } from './components/CaptureControls';

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
  const [mode, setMode] = useState<"welcome"|"capture"|"simulation">(() => sessionStorage.getItem("netsentinel.workspace") === "capture" ? "capture" : "welcome");
  if (mode === "welcome") return <AuthPage onContinue={() => { sessionStorage.setItem("netsentinel.workspace","capture"); setMode("capture"); }} onSimulation={() => setMode("simulation")} />;
  return mode === "simulation" ? <DemoApp /> : <CaptureApp />;
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
      <p className="demo-badge">Offline simulation</p>
      {(() => {
        switch (activePage) {
          case 'dashboard':
            return <DashboardOverview packets={packets} alerts={alerts} />;
          case 'packets':
            return (
              <PacketsPage
                packets={packets}
                onClear={() => setPackets([])}
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

function CaptureApp() {
  const [importedLog,setImportedLog] = useState<import('./pages/importPackets').ImportedLog | null>(null);
  const [page, navigate] = useState<PageId>('dashboard');
  const capture = useCapture(page === 'devices' || page === 'alerts' || page === 'logs', page === 'alerts');
  const dashboard = () => navigate('dashboard');
  const [detailId, selectDetail] = useState<number | null>(null);
  const controls = <CaptureControls state={capture} startButton={page !== 'packets'} />;
  return <AppShell activePage={page} setActivePage={next => { selectDetail(null); navigate(next); }}>
    {(page === 'dashboard' || page === 'packets') && controls}
    {page === 'dashboard' && <DashboardOverview packets={capture.packets} alerts={[]} capture={capture} inspect={id => { selectDetail(id); navigate('packets'); }} />}
    {page === 'packets' && capture.packetEvent && <div className="device-packet-filter">{capture.packetEvent.type} · related observations
      <button className="tool-btn" onClick={()=>capture.setPacketEvent(null)}>Clear alert filter</button></div>}
    {page === 'packets' && capture.packetDevice && <div className="device-packet-filter">Device · {capture.packetDevice.mac} <button className="tool-btn" onClick={()=>capture.setPacketDevice(null)}>Clear device filter</button></div>}
    {page === 'packets' && <PacketsPage
      packets={capture.packets}
      matching={capture.visible}
      search={capture.query}
      onSearch={capture.setQuery}
      initialDetail={detailId}
      onClear={() => { selectDetail(null); capture.command('clear_packets'); }}
      isCapturing={capture.running} setIsCapturing={capture.capture} live disabled={!capture.connected || capture.pending}
      onNavigateDashboard={dashboard} />}
    {page === 'devices' && <DevicesPage observed onDevicePackets={d=>{capture.setPacketEvent(null); capture.setPacketDevice(d); capture.setProtocol(''); capture.setQuery(''); selectDetail(null); navigate('packets');}} capture={capture} packets={capture.packets} onNavigateDashboard={dashboard} />}
    {page === 'alerts' && <MonitoringAlerts capture={capture} onPackets={event=>{
      capture.setPacketDevice(null); capture.setPacketEvent(event); capture.setQuery(''); capture.setProtocol('');
      selectDetail(null); navigate('packets');
    }} />}
    {page === 'logs' && <LogViewerPage monitoringEvents={capture.monitor?.events} importedLog={importedLog} onImport={setImportedLog} archiveUnavailable initialLogs={[]} initialSecurityEvents={[]} />}
    {page === 'settings' && <SettingsPage monitoring={controls} onNavigateDashboard={dashboard} />}
  </AppShell>;
}

export default App;
