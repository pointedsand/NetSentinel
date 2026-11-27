import { randomUUID } from 'node:crypto';

const minute = 60000;
export const defaults = { discovery:'unknown', arp:true, gateway:true, spike:true, pps:1000 };

export function validateRules(value) {
  if (!value || !['unknown','all','off'].includes(value.discovery) ||
      !['arp','gateway','spike'].every(k=>typeof value[k] === 'boolean') ||
      !Number.isInteger(value.pps) || value.pps < 1 || value.pps > 10000000) throw Error('Invalid monitoring rules.');
  const { discovery, arp, gateway, spike, pps } = value;
  return { discovery, arp, gateway, spike, pps };
}

function remember(map,key,value,limit=1024) {
  map.delete(key);
  map.set(key,value);
  if (map.size > limit) map.delete(map.keys().next().value);
}

export class Detections {
  constructor(saved = {}, changed = () => {}) {
    this.changed = changed;
    this.rules = saved.rules ? validateRules(saved.rules) : {...defaults};
    this.events = saved.events ?? [];
    this.reset();
  }
  reset() {
    this.scope = undefined;
    this.started = undefined;
    this.claims = new Map();
    this.gateways = new Map();
    this.cooldowns = new Map();
    this.arrivals = [];
    this.suppressed = 0;
    this.hotSince = undefined;
  }
  clock(context,time) {
    if (this.scope !== context.scope) {
      this.reset();
      this.scope = context.scope;
    }
    this.started ??= time;
    return time >= this.started + minute;
  }
  event(context,time,type,severity,ip,mac,evidence,measurement) {
    const key = JSON.stringify([type,ip]);
    if (time - (this.cooldowns.get(key) ?? -Infinity) < minute) return;
    remember(this.cooldowns,key,time);
    this.events.unshift({id:randomUUID(),time,type,severity,ip,mac,source:context.source,
      scope:context.scope,interfaceName:context.interfaceName,measurement,origin:context.replay ? 'Replay' : 'Live',evidence,acknowledged:false});
    if (this.events.length > 512) this.events.pop();
    this.changed();
  }
  observe(context, {device,fresh,previousLast}, ip, time, evidence) {
    const ready = this.clock(context,time);
    if (fresh) device.discovery = ready ? 'First observed after baseline' : 'Initial baseline';
    const returning = !fresh && time - previousLast >= 86400000;
    if (ready && (fresh || returning) && this.rules.discovery !== 'off' &&
        (this.rules.discovery === 'all' || !device.trusted)) {
      this.arrivals = this.arrivals.filter(t=>time-t < minute);
      if (this.arrivals.length < 5) {
        this.arrivals.push(time);
        this.event(context,time,'Device arrival','Info',ip,device.mac,
          (fresh ? 'First observation after baseline' : 'Observed after at least 24 hours away') +
          ' via ' + evidence + '. Trust: ' + (device.trusted ? 'trusted.' : 'untrusted.'));
      } else this.suppressed++;
    }
    if (evidence === 'ARP sender') this.arp(context,ip,device.mac,time,ready);
    if (context.gateways.includes(ip)) this.gateway(context,ip,device.mac,time,ready,evidence);
  }
  arp(context,ip,mac,time,ready) {
    const old = this.claims.get(ip);
    if (old && time < old.last) return;
    if (old?.mac === mac) { old.last = time; return; }
    if (ready && this.rules.arp && old?.previous === mac && time-old.previousTime <= 30000) {
      this.event(context,time,'Conflicting ARP claims','Medium',ip,mac,
        mac+' and '+old.mac+' alternated as senders for '+ip+' within 30 seconds. Check for duplicate addresses or failover.');
    }
    remember(this.claims,ip,{mac,last:time,previous:old?.mac,previousTime:old?.last});
  }
  gateway(context,ip,mac,time,ready,evidence) {
    const old = this.gateways.get(ip);
    if (!old || !ready) { this.gateways.set(ip,{mac,time}); return; }
    if (time < old.time) return;
    if (old.mac === mac) { old.candidate = undefined; old.time = time; return; }
    if (old.candidate !== mac || time-old.since > 120000) {
      old.candidate = mac; old.since = time; return;
    }
    if (time-old.since < 1000) return;
    if (this.rules.gateway) this.event(context,time,'Gateway MAC changed','Medium',ip,mac,
      'Default route next hop '+ip+' changed from '+old.mac+' to '+mac+
      ' on two observations at least one second apart ('+evidence+'). Router replacement or failover can explain this.');
    this.gateways.set(ip,{mac,time});
  }
  rate(context,stats,time) {
    if (!context || context.replay || !this.clock(context,time) || !this.rules.spike ||
        stats.rateSeconds < 2.8 || stats.packetsPerSecond < this.rules.pps) {
      this.hotSince = undefined;
      return;
    }
    this.hotSince ??= time;
    if (time-this.hotSince >= 1000) this.event(context,time,'Capture rate above threshold','Medium','','',
      Math.round(stats.packetsPerSecond)+' frames/s over '+stats.rateSeconds.toFixed(1)+
      ' s exceeded '+this.rules.pps+' frames/s for at least one second. Includes frames hidden by display filters.',
      {from:time-stats.rateSeconds*1000,thresholdPps:this.rules.pps});
  }
  acknowledge(id) {
    const event = this.events.find(e=>e.id===id);
    if (!event) throw Error('Unknown security event.');
    event.acknowledged = true;
    this.changed();
  }
}
