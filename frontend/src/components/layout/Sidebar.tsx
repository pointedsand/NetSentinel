import React from 'react';

// Represents the available application pages that can be selected from the sidebar.
export type PageId = 'dashboard' | 'packets' | 'devices' | 'alerts' | 'logs' | 'settings';

// Props passed to the sidebar so it can reflect the active page and notify parent changes.
interface SidebarProps {
  activePage: PageId;
  onSelectPage: (page: PageId) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activePage, onSelectPage }) => {
  // Navigation items shown in the left rail. Each item maps to a page id, display label, and emoji icon.
  const navItems: { id: PageId; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'packets', label: 'Packets', icon: '📦' },
    { id: 'devices', label: 'Devices', icon: '💻' },
    { id: 'alerts', label: 'Security Alerts', icon: '⚠️' },
    { id: 'logs', label: 'Log Viewer', icon: '📜' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <aside style={{ width: '220px', backgroundColor: '#1e1e2e', color: '#fff', height: '100vh', padding: '1rem', boxSizing: 'border-box' }}>
      {/* Brand title shown at the top of the menu. */}
      <h2 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        🛡️ NetSentinel
      </h2>

      {/* Main navigation list for switching between core monitoring sections. */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectPage(item.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.6rem 1rem',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: activePage === item.id ? '#313244' : 'transparent',
              color: activePage === item.id ? '#89b4fa' : '#cdd6f4',
              cursor: 'pointer',
              textAlign: 'left',
              fontWeight: activePage === item.id ? 'bold' : 'normal',
            }}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
};