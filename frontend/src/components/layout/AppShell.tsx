import React, { useEffect, useRef } from 'react';
import { Sidebar, type PageId } from './Sidebar';
import { Header } from './Header';

/** Props for the alternate sidebar shell prototype. */
interface AppShellProps {
  children: React.ReactNode;
  activePage: PageId;
  setActivePage: (page:PageId)=>void;
  running: boolean;
  toggle: ()=>void;
  connected?: boolean;
  pending?: boolean;
  status: string;
  source?: React.ReactNode;
  notice?: React.ReactNode;

}

/** Alternate sidebar shell; the active navigation shell is defined in App.tsx. */
export const AppShell: React.FC<AppShellProps> = ({children,activePage,setActivePage,running,toggle,connected,pending,status,source,notice}) => {
  const titles = {dashboard:'Dashboard',packets:'Packet Capture',devices:'Devices',alerts:'Security Alerts',logs:'Logs',settings:'Settings'};
  const content=useRef<HTMLElement>(null);
  useEffect(()=>{ if (content.current) content.current.scrollTop=0; },[activePage]);
  const connection = connected === undefined ? 'Offline simulation' : connected ? 'Backend connected' : 'Backend disconnected';
  return <div className="app-shell desktop-shell">
    <Sidebar activePage={activePage} onSelectPage={setActivePage} connected={connected} connection={connection}/>
    <Header title={titles[activePage]} source={source} running={running} toggle={toggle} disabled={connected===false || pending} status={status}/>
    <main ref={content} className="desktop-content">{notice}{children}</main>
  </div>;
};
