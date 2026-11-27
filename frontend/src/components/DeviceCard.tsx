import { useEffect, useRef, useState } from 'react';
import { deviceName } from '../deviceIdentity';
import type { LocalDevice } from '../types';

const observedTime = (time: number) => new Date(time).toLocaleString(undefined,{
  month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'
});

export function DeviceCard({ device, adapter, open }: { device: LocalDevice; adapter: string; open: () => void }) {
  return <button type="button" className="inventory-card" onClick={open} aria-label={'Details for '+deviceName(device)+' · '+device.mac}>
    <span className="inventory-card-head"><span className="network-node-icon" aria-hidden="true"/>
      <strong title={deviceName(device)}>{deviceName(device)}</strong>
      <span className={'trust-chip'+(device.trusted ? ' trusted' : '')}>{device.trusted ? 'Trusted' : 'Unknown'}</span>
    </span>
    <span className="identity-line"><span>IP</span><code title={device.ips.join(', ')}>{device.ips[0]}{device.ips.length>1 && '  +'+(device.ips.length-1)}</code></span>
    <span className="identity-line"><span>MAC</span><code>{device.mac}</code></span>
    <span className="inventory-card-foot"><span title={adapter}>Observed via {adapter}</span><time title={'Last observed '+new Date(device.last).toLocaleString()} dateTime={new Date(device.last).toISOString()}>{observedTime(device.last)}</time><span className="details-link">Details ›</span></span>
  </button>;
}

interface DetailsProps {
  device: LocalDevice; adapter: string; count: number; connected: boolean; error: string;
  close: () => void; showPackets?: () => void; save: (label: string, trusted: boolean) => void;
}

export function DeviceDetails({device,adapter,count,connected,error,close,showPackets,save}: DetailsProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [label,setLabel] = useState(device.label);
  const [trusted,setTrusted] = useState(device.trusted);
  const [submitted,setSubmitted] = useState(false);
  const changed = label.trim() !== device.label || trusted !== device.trusted;
  useEffect(()=>{
    const el = dialog.current;
    const opener = document.activeElement;
    if (el && !el.open) el.showModal();
    return () => {
      if (el?.open) el.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  return <dialog ref={dialog} className="device-dialog" aria-labelledby="device-title" onCancel={e=>{e.preventDefault(); close();}}>
    <header><div><span className="card-kicker">Device details</span><h2 id="device-title">{deviceName(device)}</h2></div>
      <button type="button" className="tool-btn" aria-label="Close device details" onClick={close}>Close</button></header>
    <form className="device-editor" onSubmit={e=>{e.preventDefault(); setSubmitted(true); save(label.trim(),trusted);}}>
      <label>Device label<input autoFocus className="filter-input" maxLength={80} placeholder="Add a name" value={label} onChange={e=>{setLabel(e.target.value);setSubmitted(false);}}/></label>
      <label>Trust status<select className="modal-select" value={trusted ? 'trusted' : 'unknown'} onChange={e=>{setTrusted(e.target.value==='trusted');setSubmitted(false);}}>
        <option value="unknown">Unknown / untrusted</option><option value="trusted">Trusted</option></select></label>
      <button disabled={!connected || !changed} className="btn-export">Save changes</button>
    </form>
    {submitted && !changed && <p role="status">Preferences saved.</p>}
    {error && <p role="alert">{error}</p>}
    <dl className="device-facts">
      <div><dt>Discovered hostname</dt><dd>{device.hostname || 'Unavailable'}</dd></div>
      <div><dt>Name source</dt><dd>{device.nameMethod || (device.hostname ? 'Previously recorded' : '—')}{device.nameExpired ? ' · expired' : ''}</dd></div>
      <div><dt>MAC address</dt><dd><code>{device.mac}</code></dd></div>
      <div><dt>Observed via</dt><dd>{adapter}</dd></div>
      <div className="fact-wide"><dt>Observed IP addresses</dt><dd>{device.ips.join(' · ')}</dd></div>
      <div><dt>First observed</dt><dd>{new Date(device.first).toLocaleString()}</dd></div>
      <div><dt>Last observed</dt><dd>{new Date(device.last).toLocaleString()}</dd></div>
    </dl>
    <details className="device-evidence"><summary>Technical evidence</summary><dl className="device-facts">
      <div className="fact-wide"><dt>Capture source</dt><dd><code>{device.source}</code></dd></div>
      <div><dt>Discovery method</dt><dd>{device.evidence}</dd></div>
      <div><dt>Discovery phase</dt><dd>{device.discovery || 'Previously observed'}</dd></div>
      {device.nameObserved && <div><dt>Hostname observed</dt><dd>{new Date(device.nameObserved).toLocaleString()}</dd></div>}
    </dl></details>
    <footer><span>{count} associated retained packet{count===1 ? '' : 's'}</span>
      <button type="button" className="tool-btn" disabled={!showPackets || !count} onClick={showPackets}>View packets</button></footer>
  </dialog>;
}
