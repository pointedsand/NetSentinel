import React from 'react';

/** Props for the capture-status toolbar. */
interface HeaderProps {
  title: string;
  status: string;
  source?: React.ReactNode;
  running: boolean;
  disabled?: boolean;
  toggle: () => void;
}

/** Capture-status toolbar used by the alternate AppShell prototype. */
export const Header: React.FC<HeaderProps> = ({title,status,source,running,disabled,toggle}) => (
  <header className="desktop-header" aria-label="Workspace"><h1>{title}</h1><div className="header-session">
    {source}<span className="session-state" role="status"><i className={running?'signal online':'signal'}/>{status}</span>
    <button className={'session-toggle'+(running?' stopping':'')} disabled={disabled} onClick={toggle}>
      <span aria-hidden="true">{running?'■':'▶'}</span>{running?'Stop capture':'Start capture'}
    </button></div></header>
);
