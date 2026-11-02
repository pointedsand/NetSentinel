import React from 'react';

// Props for the top header bar, including capture state and the toggle action.
interface HeaderProps {
  isCapturing: boolean;
  onToggleCapture: () => void;
}

export const Header: React.FC<HeaderProps> = ({ isCapturing, onToggleCapture }) => {
  return (
    <header style={{ height: '60px', backgroundColor: '#181825', borderBottom: '1px solid #313244', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', color: '#cdd6f4' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* Displays the active network interface and IP address. */}
        <span>Interface: <strong>eth0 (192.168.1.100)</strong></span>

        {/* Shows whether packet capture is currently active or paused. */}
        <span style={{ fontSize: '0.85rem', padding: '0.2rem 0.6rem', borderRadius: '12px', backgroundColor: isCapturing ? '#a6e3a122' : '#f38ba822', color: isCapturing ? '#a6e3a1' : '#f38ba8' }}>
          ● {isCapturing ? 'Sniffing Active' : 'Stopped'}
        </span>
      </div>

      {/* Toggle button for starting or stopping packet capture. */}
      <button
        onClick={onToggleCapture}
        style={{
          padding: '0.5rem 1rem',
          borderRadius: '6px',
          border: 'none',
          backgroundColor: isCapturing ? '#f38ba8' : '#a6e3a1',
          color: '#11111b',
          fontWeight: 'bold',
          cursor: 'pointer',
        }}
      >
        {isCapturing ? 'Stop Capture' : 'Start Capture'}
      </button>
    </header>
  );
};