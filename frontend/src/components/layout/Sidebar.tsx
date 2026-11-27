import React from 'react';
import mark from '../../assets/netsentinel-mark.png';

/** Route identifiers used by the alternate sidebar prototype. */
export type PageId = 'dashboard' | 'packets' | 'devices' | 'alerts' | 'logs' | 'settings';

/** Props for the sidebar navigation control. */
interface SidebarProps {
  connection: string;
  connected?: boolean;
  activePage: PageId;
  onSelectPage: (page: PageId) => void;
}

/** Renders the page navigation for the alternate AppShell prototype. */
export const Sidebar: React.FC<SidebarProps> = ({ activePage, onSelectPage, connection, connected }) => {
  const items: [PageId,string,string][] = [
    ['dashboard','Dashboard','M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z'],
    ['packets','Packets','m3 7 9-4 9 4-9 4z M3 12l9 4 9-4 M3 17l9 4 9-4'],
    ['devices','Devices','M3 4h15v11H3z M7 20h7 M10 15v5 M19 10h3v11h-6v-5'],
    ['alerts','Alerts','m12 3 10 17H2z M12 9v5 M12 17v.1'],
    ['logs','Logs','M5 2h10l4 4v16H5z M8 10h8 M8 14h8 M8 18h5'],
    ['settings','Settings','M3 6h9m5 0h4M3 12h2m6 0h10M3 18h11m5 0h2 M12 4h5v4h-5z M5 10h6v4H5z M14 16h5v4h-5z'],
  ];
  return <aside className="desktop-sidebar">
    <button className="brand" onClick={()=>onSelectPage('dashboard')} aria-label="NetSentinel home">
      <img src={mark} alt=""/><span>NetSentinel</span></button>
    <nav aria-label="Main navigation">{items.map(([id,label,path])=><button key={id} title={label} aria-label={label}
      aria-current={activePage===id?'page':undefined} onClick={()=>onSelectPage(id)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d={path}/></svg><span>{label}</span>
    </button>)}</nav>
    <div className="sidebar-connection" title={connection}><i className={connected?'signal online':'signal'}/><span>{connection}</span></div>
  </aside>;
};
