import { useState, type ReactNode } from 'react';

// Supported top-level pages in the application. This defines the valid navigation targets.
type PageId = 'dashboard' | 'packets' | 'devices' | 'alerts' | 'logs' | 'settings';

// Navigation entries displayed in the main app menu.
const pages: { id: PageId; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'packets', label: 'Packets' },
  { id: 'devices', label: 'Devices' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'logs', label: 'Logs' },
  { id: 'settings', label: 'Settings' },
];

// Shared layout wrapper that manages the active page and renders the selected panel.
function AppShell({ children }: { children: (activePage: PageId) => ReactNode }) {
  // Keeps track of the currently selected navigation item.
  const [activePage, setActivePage] = useState<PageId>('dashboard');

  return (
    <div className="app-shell">
      {/* Main app navigation bar for switching between sections. */}
      <nav aria-label="Main navigation">
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

      {/* Renders the content associated with the active page. */}
      <main>{children(activePage)}</main>
    </div>
  );
}

export function App() {
  return (
    <AppShell>
      {(activePage: PageId) => {
        // Render the appropriate content panel based on the selected page.
        switch (activePage) {
          case 'dashboard':
            return <div><h1>Dashboard View</h1><p>Real-time traffic metrics go here.</p></div>;
          case 'packets':
            return <div><h1>Packet Inspector</h1><p>Live stream table goes here.</p></div>;
          case 'devices':
            return <div><h1>Device Inventory</h1><p>Subnet scan list goes here.</p></div>;
          case 'alerts':
            return <div><h1>Security Warnings</h1><p>Alert logs go here.</p></div>;
          case 'logs':
            return <div><h1>Log Viewer</h1><p>Clear historical logs interface goes here.</p></div>;
          case 'settings':
            return <div><h1>Configuration Settings</h1><p>Startup & threshold config forms go here.</p></div>;
          default:
            // Fallback ensures a valid view is always displayed.
            return <div><h1>Dashboard View</h1><p>Real-time traffic metrics go here.</p></div>;
        }
      }}
    </AppShell>
  );
}

export default App;