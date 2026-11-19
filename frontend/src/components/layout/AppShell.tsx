import React, { useState } from 'react';
import { Sidebar, type PageId } from './Sidebar';
import { Header } from './Header';

/** Props for the alternate sidebar shell prototype. */
interface AppShellProps {
  children: (activePage: PageId) => React.ReactNode;
}

/** Alternate sidebar shell; the active navigation shell is defined in App.tsx. */
export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [isCapturing, setIsCapturing] = useState<boolean>(false);

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', fontFamily: 'sans-serif', backgroundColor: '#11111b', margin: 0, padding: 0 }}>
      <Sidebar activePage={activePage} onSelectPage={setActivePage} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header isCapturing={isCapturing} onToggleCapture={() => setIsCapturing(!isCapturing)} />

        <main style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', color: '#cdd6f4' }}>
          {children(activePage)}
        </main>
      </div>
    </div>
  );
};