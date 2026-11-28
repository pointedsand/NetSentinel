import { useMemo } from 'react';
import { DeviceCard, DeviceDetails } from './DeviceCard';
import { interfaceName, isDevicePacket } from '../deviceIdentity';
import type { Capture } from '../hooks/useCapture';
import type { LocalDevice } from '../types';

export function LocalInventory({capture,onPackets}: {capture: Capture; onPackets?: (d:LocalDevice,id?:number)=>void}) {
  const view = capture.monitor;
  const filter = capture.deviceFilter;
  const device = view?.devices.find(d=>d.id===filter.focus) ?? (view?.focused?.id===filter.focus ? view?.focused : undefined);
  const packets = useMemo(()=>device ? capture.packets.filter(p=>isDevicePacket(p,device)) : [],[device,capture.packets]);
  const adapter = (d:LocalDevice) => d.interfaceName || interfaceName(d.source,{...capture.sourceNames,...view?.interfaceNames});
  function search(fields: Partial<typeof filter>) {
    capture.setOffset(0);
    capture.setDeviceFilter(current=>({...current,...fields}));
  }
  const error = capture.admin.preferenceError || view?.storageError || capture.error;
  const disabled = !capture.connected || capture.admin.preferencePending;
  function change(d:LocalDevice,fields:{label?:string;trusted?:boolean}) {
    capture.command('device_preference',{id:d.id,...fields,offset:view?.offset,deviceFilter:filter});
  }
  const close = () => capture.setDeviceFilter(current=>({...current,focus:''}));
  return <section className="inventory-section" aria-label="Local device inventory">
    <header className="inventory-toolbar"><div><h2>Local device inventory</h2><p>Historical observations on monitored interfaces</p></div>
      {view && <dl className="inventory-counts" aria-label="Inventory summary">
        <div><dt>Discovered</dt><dd>{view.deviceTotal}</dd></div>
        <div><dt>Trusted</dt><dd>{view.trustedTotal}</dd></div>
        <div><dt>Unknown</dt><dd>{view.deviceTotal-view.trustedTotal}</dd></div>
      </dl>}
    </header>
    <div className="inventory-toolbar inventory-search"><input type="search" aria-label="Search local devices" className="filter-input" placeholder="Search name, IP or MAC…" maxLength={256} value={filter.term} onChange={e=>search({term:e.target.value})}/>
      <div className="devices-filter-pills" role="group" aria-label="Filter by trust">
        {[['','All devices'],['trusted','Trusted'],['unknown','Unknown']].map(([value,text])=><button type="button" key={value} className={'devices-filter-pill'+(filter.trust===value?' is-active':'')} aria-pressed={filter.trust===value} onClick={()=>search({trust:value})}>{text}</button>)}
      </div></div>
    {error && <p role="alert">{error}</p>}
    {!!view?.missed && <p>{view.missed} neighbor records missed pending adapter metadata.</p>}
    {view?.capacityReached && <p>Inventory capacity reached (512 identities).</p>}
    {view && <div className="device-grid">{view.devices.map(d=><DeviceCard key={d.id} device={d} adapter={adapter(d)}
      disabled={disabled} change={fields=>change(d,fields)} open={()=>capture.setDeviceFilter(current=>({...current,focus:d.id}))}/>)}</div>}
    {view && !view.devices.length && <p className="logs-empty-state">{view.deviceTotal ? 'No devices match these filters.' : 'No local devices observed yet.'}</p>}
    <div className="inventory-bottom"><small>{capture.connected ? view?.status ?? 'Loading inventory…' : 'Backend disconnected'}</small>
      {view && view.matchingTotal>6 && <nav aria-label="Device pages">
        <button className="tool-btn" disabled={!view.offset} onClick={()=>capture.setOffset(view.offset-6)}>Previous</button>
        <span>{view.offset+1}–{view.offset+view.devices.length} of {view.matchingTotal}</span>
        <button className="tool-btn" disabled={view.offset+6>=view.matchingTotal} onClick={()=>capture.setOffset(view.offset+6)}>Next</button>
      </nav>}</div>
    {device && <DeviceDetails key={device.id} device={device} adapter={adapter(device)} packets={packets} inspect={onPackets ? id=>{close();onPackets(device,id);} : undefined}
      error={error} connected={!disabled} close={close}
      save={(label,trusted)=>change(device,{label,trusted})}
      showPackets={onPackets ? ()=>{close();onPackets(device);} : undefined}/>}
  </section>;
}
