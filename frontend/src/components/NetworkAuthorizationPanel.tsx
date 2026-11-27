import { useState, type FormEvent } from 'react';

interface NetworkAuthorizationPanelProps {
  mode: 'setup' | 'manage';
  onComplete?: (networks: string[]) => void;
}

interface NetworkOption {
  id: string;
  ssid: string;
}

const SAMPLE_NETWORKS: NetworkOption[] = [
  { id: 'sample-maple-home', ssid: 'Maple-Home-WiFi' },
  { id: 'sample-cedar-guest', ssid: 'Cedar-Guest-5G' },
];

export function NetworkAuthorizationPanel({ mode, onComplete }: NetworkAuthorizationPanelProps) {
  const [networks, setNetworks] = useState(SAMPLE_NETWORKS);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addingNetwork, setAddingNetwork] = useState(false);
  const [newSsid, setNewSsid] = useState('');
  const [message, setMessage] = useState('');

  const toggleNetwork = (id: string) => {
    setSelectedIds((selected) => (
      selected.includes(id) ? selected.filter((selectedId) => selectedId !== id) : [...selected, id]
    ));
    setMessage('');
  };

  const addNetwork = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ssid = newSsid.trim();
    if (!ssid) {
      setMessage('Enter a network name before adding it.');
      return;
    }

    const id = `custom-${Date.now()}-${networks.length}`;
    setNetworks((current) => [...current, { id, ssid }]);
    setSelectedIds((current) => [...current, id]);
    setNewSsid('');
    setAddingNetwork(false);
    setMessage('Network added to this screen only. It hasn’t been saved or verified.');
  };

  const confirmSelection = () => {
    const selectedNetworks = networks
      .filter(({ id }) => selectedIds.includes(id))
      .map(({ ssid }) => ssid);

    if (onComplete) {
      onComplete(selectedNetworks);
      return;
    }

    setMessage(
      `${selectedNetworks.length} network${selectedNetworks.length === 1 ? '' : 's'} selected. ` +
      'This preview can’t verify your connection or save the selection.',
    );
  };

  return (
    <section className="network-access-panel" aria-labelledby={`${mode}-network-title`}>
      <div className="network-access-heading">
        <div>
          <span className="eyebrow">{mode === 'setup' ? 'NETWORK SETUP' : 'NETWORK ACCESS'}</span>
          <h3 id={`${mode}-network-title`}>
            {mode === 'setup' ? 'Choose a network to authorize' : 'Your networks'}
          </h3>
          <p>
            {mode === 'setup'
              ? 'Connect this device to a network you’re authorized to monitor, then select it below.'
              : 'Add or select networks you’re authorized to monitor.'}
          </p>
        </div>
        {mode === 'manage' && (
          <button
            type="button"
            className="network-add-button"
            onClick={() => {
              setAddingNetwork((current) => !current);
              setMessage('');
            }}
          >
            {addingNetwork ? 'Cancel' : '+ Add a network'}
          </button>
        )}
      </div>

      <p className="network-access-notice">
        Sample SSIDs are shown for now. By selecting the network you’re connected to, you confirm that you’re authorized
        to monitor its traffic.
      </p>

      {addingNetwork && (
        <form className="network-add-form" onSubmit={addNetwork}>
          <label htmlFor={`${mode}-new-ssid`}>Network name (SSID)</label>
          <div className="network-add-controls">
            <input
              id={`${mode}-new-ssid`}
              autoComplete="off"
              maxLength={32}
              placeholder="Enter the network name"
              value={newSsid}
              onChange={(event) => setNewSsid(event.target.value)}
              required
            />
            <button type="submit" className="btn-export">Add SSID</button>
          </div>
        </form>
      )}

      <div className="network-option-list" role="group" aria-label="Available network names">
        {networks.map(({ id, ssid }, index) => (
          <label className="network-option" key={id}>
            <input
              type="checkbox"
              checked={selectedIds.includes(id)}
              onChange={() => toggleNetwork(id)}
            />
            <span className="network-option-icon" aria-hidden="true">⌁</span>
            <span className="network-option-copy">
              <strong>{ssid}</strong>
              <small>{index < SAMPLE_NETWORKS.length ? 'Sample SSID' : 'Added on this screen'}</small>
            </span>
            <span className="network-option-tag">{selectedIds.includes(id) ? 'SELECTED' : 'NOT SELECTED'}</span>
          </label>
        ))}
      </div>

      {mode === 'setup' && (
        <p className="network-selection-hint">You can select more than one network.</p>
      )}

      {message && <p className="network-access-result" role="status">{message}</p>}

      <button
        className="network-confirm-button"
        type="button"
        disabled={selectedIds.length === 0}
        onClick={confirmSelection}
      >
        {mode === 'setup' ? 'Continue with selected networks' : 'Authorize selected networks'}
      </button>
    </section>
  );
}
