import React, { useState } from 'react';
import { Sidebar, type PageId } from './Sidebar';
import { Header } from './Header';

// Props for the app layout shell. A render function receives the selected page so child content can change dynamically.
interface AppShellProps {
  children: (activePage: PageId) => React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  // Tracks the currently selected navigation page.
  const [activePage, setActivePage] = useState<PageId>('dashboard');

  // Tracks whether packet capture is currently enabled.
  const [isCapturing, setIsCapturing] = useState<boolean>(false);

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', fontFamily: 'sans-serif', backgroundColor: '#11111b', margin: 0, padding: 0 }}>
      {/* Left navigation rail for switching between sections. */}
      <Sidebar activePage={activePage} onSelectPage={setActivePage} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top toolbar showing interface status and capture actions. */}
        <Header isCapturing={isCapturing} onToggleCapture={() => setIsCapturing(!isCapturing)} />

        {/* Main content area for the active page. */}
        <main style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', color: '#cdd6f4' }}>
          {children(activePage)}
        </main>
      </div>
    </div>
  );
};