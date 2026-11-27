import { useState } from 'react';
import type { MonitoringRules } from '../types';

export function AlertRuleSettings({rules, disabled, save}: {
  rules: MonitoringRules; disabled: boolean; save: (rules: MonitoringRules)=>void;
}) {
  const [submitted,setSubmitted] = useState<MonitoringRules>();
  const confirmed = submitted && JSON.stringify(submitted) === JSON.stringify(rules);
  return <details className="security-rules"><summary>Configure alert rules</summary>
    <form key={JSON.stringify(rules)} onChange={()=>setSubmitted(undefined)} onSubmit={e=>{
      e.preventDefault();
      const fields = new FormData(e.currentTarget);
      const draft = {discovery:fields.get('discovery') as MonitoringRules['discovery'], arp:fields.has('arp'),
        gateway:fields.has('gateway'), spike:fields.has('spike'), pps:Number(fields.get('pps'))};
      setSubmitted(draft);
      save(draft);
    }}>
      <fieldset disabled={disabled}><legend>Device discovery notifications</legend>
        <label>Device arrivals <select name="discovery" defaultValue={rules.discovery}>
          <option value="unknown">Unknown or untrusted devices</option><option value="all">All device arrivals</option>
          <option value="off">Disabled</option></select></label>
        <p>Arrival notifications start after the first minute of observation and are limited to five per minute.</p>
      </fieldset>
      <fieldset disabled={disabled}><legend>Security detection</legend>
        <label><input type="checkbox" name="arp" defaultChecked={rules.arp}/> Conflicting ARP claims</label>
        <p>Flag alternating MAC addresses claiming the same IP within 30 seconds.</p>
        <label><input type="checkbox" name="gateway" defaultChecked={rules.gateway}/> Gateway MAC changes</label>
        <p>Confirm a changed gateway MAC on two observations at least one second apart.</p>
        <label><input type="checkbox" name="spike" defaultChecked={rules.spike}/> Capture rate spikes</label>
        <label>Frames per second <input name="pps" type="number" min="1" max="10000000" required defaultValue={rules.pps}/></label>
        <p>Flag sustained rates at or above this threshold during live capture. Repeat alerts for the same type and IP have a one-minute cooldown.</p>
      </fieldset>
      <button type="submit" disabled={disabled} className="btn-export">Save monitoring rules</button>
      {confirmed && !disabled && <p role="status">Current rules match the submitted settings.</p>}
    </form></details>;
}
