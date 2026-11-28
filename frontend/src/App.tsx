import { useState } from 'react';
import { AppShell } from './components/layout/AppShell';
import type { PageId } from './components/layout/Sidebar';
import './App.css';
import './styles/auth.css';
import { MonitoringAlerts } from './components/MonitoringAlerts';
import { AlertsPage } from './pages/AlertsPage';
import { DashboardOverview } from './pages/DashboardOverview';
import { DevicesPage } from './pages/DevicesPage';
import { LogViewerPage } from './pages/LogViewerPage';
import { PacketsPage } from './pages/PacketsPage';
import { SettingsPage } from './pages/SettingsPage';
import { UnlockDialog } from './pages/AuthPage';
import './styles/access-control.css';
import { createSeedAlerts, DEFAULT_ALERT_RULES } from './pages/alertTypes';
import type { AlertItem, AlertRules } from './pages/alertTypes';
import { usePacketSimulation } from './hooks/usePacketSimulation';
import { sourceName } from './deviceIdentity';
import { useCapture } from './hooks/useCapture';
import { CaptureControls, CaptureSource, NameResolution } from './components/CaptureControls';

export function App() {
  return new URLSearchParams(window.location.search).get('workspace') === 'simulation' ? <DemoApp /> : <CaptureApp />;
}

function DemoApp() {
  // Shared state stays above page selection so navigation does not reset cross-page data.
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [alerts, setAlerts] = useState<AlertItem[]>(() => createSeedAlerts());
  const [alertRules, setAlertRules] = useState<AlertRules>(DEFAULT_ALERT_RULES);
  // PacketsPage receives only the shared stream generated from simulationData via this hook.
  const { packets, setPackets, isCapturing, setIsCapturing } = usePacketSimulation();

  return (
    <AppShell activePage={activePage} setActivePage={setActivePage} running={isCapturing} toggle={()=>setIsCapturing(!isCapturing)} status={isCapturing?'Simulating':'Paused'}>
      {(() => {
        switch (activePage) {
          case 'dashboard':
            return <DashboardOverview navigate={setActivePage} packets={packets} alerts={alerts} />;
          case 'packets':
            return (
              <PacketsPage inShell
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
            return <DashboardOverview navigate={setActivePage} packets={packets} alerts={alerts} />;
        }
      })()}
    </AppShell>
  );
}

function CaptureApp() {
  const [importedLog,setImportedLog] = useState<import('./pages/importPackets').ImportedLog | null>(null);
  const [page, navigate] = useState<PageId>('dashboard');
  const capture = useCapture(page === 'dashboard' || page === 'devices' || page === 'alerts' || page === 'logs', page === 'alerts');
  const dashboard = () => navigate('dashboard');
  const [detailId, selectDetail] = useState<number | null>(null);
  return <AppShell activePage={page} setActivePage={next => { capture.admin.cancel(); selectDetail(null); navigate(next); }}
    connected={capture.connected} pending={capture.pending} running={capture.running} toggle={()=>capture.capture(!capture.running)}
    status={capture.error ? 'Capture error' : !capture.connected ? 'Reconnecting' : (capture.mode==='--replay'?'Replay':'Live')+' · '+(capture.running?'Running':'Paused')}
    source={page==='dashboard' ? <CaptureSource state={capture}/> : <span className="session-source" title={capture.sourceIds[capture.selected]}>{sourceName(capture,capture.selected)}</span>}
    notice={<>{capture.error && <p role="alert" className="session-notice">{capture.error}</p>}
      {capture.stats.outputDrops>0 && <p className="session-notice">{capture.stats.outputDrops.toLocaleString()} output packets dropped</p>}</>}>
    <UnlockDialog admin={capture.admin}/>
    {page === 'dashboard' && <DashboardOverview navigate={navigate} packets={capture.packets} alerts={[]} capture={capture} inspect={id => { selectDetail(id); navigate('packets'); }} />}
    {page === 'packets' && capture.packetEvent && <div className="device-packet-filter">{capture.packetEvent.type} · related observations
      <button className="tool-btn" onClick={()=>capture.setPacketEvent(null)}>Clear alert filter</button></div>}
    {page === 'packets' && capture.packetDevice && <div className="device-packet-filter">Device · {capture.packetDevice.mac} <button className="tool-btn" onClick={()=>capture.setPacketDevice(null)}>Clear device filter</button></div>}
    {page === 'packets' && <PacketsPage inShell
      packets={capture.packets}
      rail={<CaptureControls state={capture}/>}
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
    {page === 'logs' && <LogViewerPage monitoringEvents={capture.monitor?.events} eventTotal={capture.monitor?.eventTotal}
      onDeleteEvents={(newest,total)=>capture.command('clear_events',{newest,total})} importedLog={importedLog} onImport={setImportedLog} archiveUnavailable initialLogs={[]} initialSecurityEvents={[]} />}
    {page === 'settings' && <SettingsPage admin={capture.admin} monitoring={<NameResolution state={capture}/>} onNavigateDashboard={dashboard} />}
  </AppShell>;
}

export default App;
