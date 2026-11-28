import { useEffect, useRef, useState } from 'react';
import { deviceName } from '../deviceIdentity';
import { DeviceObservations } from './DeviceObservations';
import type { LocalDevice, Packet } from '../types';

const observedTime = (time: number) => new Date(time).toLocaleString(undefined,{
  month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'
});

interface CardProps {
  device: LocalDevice; adapter: string; open: () => void; disabled: boolean;
  change: (fields: {label?: string; trusted?: boolean}) => void;
}

export function DeviceCard({device,adapter,open,disabled,change}: CardProps) {
  const name = deviceName(device);
  const [draft,setDraft] = useState<string|null>(null);
  const [error,setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const editing = useRef(false);
  const active = draft !== null;
  useEffect(()=>{
    if (active) {input.current?.focus(); input.current?.select();}
  },[active]);
  function begin() {
    if (disabled) return;
    editing.current=true; setDraft(name); setError('');
  }
  function finish(save:boolean) {
    if (!editing.current) return;
    editing.current=false;
    const label=draft?.trim() ?? '';
    setDraft(null);
    if (!save || label===name) return;
    if (!label || label.length>80 || Array.from(label).some(c=>c.charCodeAt(0)<32 || c.charCodeAt(0)===127)) {
      setError('Use 1–80 printable characters.'); return;
    }
    change({label});
  }
  return <article className="inventory-card">
    <div className="inventory-card-head"><span className="network-node-icon" aria-hidden="true"/>
      {active ? <input className="filter-input card-name-input" ref={input} aria-label="Edit device name" value={draft}
        onChange={e=>setDraft(e.target.value)} onBlur={()=>finish(true)}
        onKeyDown={e=>{
          if (e.nativeEvent.isComposing) return;
          if (e.key==='Escape' || e.key==='Enter') {e.preventDefault();finish(e.key==='Enter');}
        }}/> :
        <button type="button" className="card-name" disabled={disabled} title={'Double-click to rename '+name}
          onDoubleClick={begin} onKeyDown={e=>{
            if (e.key==='F2' || e.key==='Enter') {e.preventDefault();begin();}
          }}>{name}</button>}
      <span className={'trust-chip'+(device.trusted ? ' trusted' : '')}>{device.trusted ? 'Trusted' : 'Unknown'}</span>
    </div>
    {error && <small role="alert">{error}</small>}
    <span className="identity-line"><span>IP</span><code title={device.ips.join(', ')}>{device.ips[0]}{device.ips.length>1 && '  +'+(device.ips.length-1)}</code></span>
    <span className="identity-line"><span>MAC</span><code>{device.mac}</code></span>
    <div className="inventory-card-foot"><span className="card-observation" title={'Observed via '+adapter}>
      Observed via {adapter}<time dateTime={new Date(device.last).toISOString()}>{observedTime(device.last)}</time></span>
      <button type="button" className={'tool-btn card-trust'+(device.trusted ? '' : ' grant')} disabled={disabled}
        onClick={()=>change({trusted:!device.trusted})}>{device.trusted ? 'Untrust' : 'Trust'}</button>
      <button type="button" className="tool-btn" onClick={open} aria-label={'Details for '+name+' · '+device.mac}>Details ›</button>
    </div>
  </article>;
}

interface DetailsProps {
  device: LocalDevice; adapter: string; packets: Packet[]; inspect?: (id:number)=>void; connected: boolean; error: string;
  close: () => void; showPackets?: () => void; save: (label: string, trusted: boolean) => void;
}

export function DeviceDetails({device,adapter,packets,inspect,connected,error,close,showPackets,save}: DetailsProps) {
  const count = packets.length;
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
    <DeviceObservations device={device} packets={packets} inspect={inspect}/>
    <footer><span>{count} associated retained packet{count===1 ? '' : 's'}</span>
      <button type="button" className="tool-btn" disabled={!showPackets || !count} onClick={showPackets}>View packets</button></footer>
  </dialog>;
}
