import { hostname, networkInterfaces } from 'node:os';
import { advertisedName, recordName } from './device-names.mjs';
import { Detections, validateRules } from './detections.mjs';
import { Inventory } from './inventory.mjs';
import { networkContext, readNeighbors } from './neighbors.mjs';

function localAdapterAddresses(name) {
  try {
    return new Set((networkInterfaces()[name] ?? [])
      .map(address => address.mac.toLowerCase()+'|'+address.address.split('%')[0]));
  } catch {
    return new Set();
  }
}

export class Monitor {
  constructor({ store, discover = readNeighbors } = {}) {
    this.store = store;
    this.machineName = hostname();
    this.discover = discover;
    this.inventory = new Inventory(store?.saved.devices);
    this.detector = new Detections(store?.saved, () => this.changed());
    this.generation = 0;
    this.bindings = new Map();
    this.advertisements = new Map();
    this.interfaceNames = new Map();
    this.pendingNeighbors = [];
    this.missed = 0;
    this.status = 'Start capture to observe this network.';
  }
  changed() { this.store?.change(() => this.snapshot()); }
  snapshot() { return { version:1, devices:[...this.inventory.devices.values()], events:this.detector.events, rules:this.detector.rules }; }
  begin(source,replay) {
    this.stop();
    this.detector.reset();
    this.bindings.clear();
    this.advertisements.clear();
    this.localAddresses = new Set();
    this.missed = 0;
    this.context = undefined;
    if (replay) {
      this.context = networkContext(source,{prefixes:[],gateways:[]},true);
      this.status = 'Replay · neighbor evidence from this file only.';
      return;
    }
    this.lookup = new AbortController();
    this.loading = true;
    this.status = 'Reading adapter prefixes, routes and neighbor cache…';
    const generation = this.generation;
    const refresh = async () => {
      try {
        const data = await this.discover(source,this.lookup.signal);
        if (this.generation !== generation) return;
        const context = networkContext(source,data);
        if (this.context && this.context.scope !== context.scope) {
          this.bindings.clear();
          this.advertisements.clear();
        }
        if (context.interfaceName) this.interfaceNames.set(source,context.interfaceName);
        this.localAddresses = localAdapterAddresses(context.interfaceName);
        this.context = context;
        this.loading = false;
        this.detector.clock(context,Date.now());
        this.status = 'Passive inventory · ' + context.prefixes.join(', ');
        for (const packet of this.pendingNeighbors.splice(0)) this.packet(packet);
        for (const n of data.neighbors) this.observe(n.ip,n.mac,Date.now(),'OS neighbor cache');
      } catch {
        if (this.generation !== generation) return;
        this.context = undefined;
        this.bindings.clear();
        this.advertisements.clear();
        this.loading = false;
        this.missed += this.pendingNeighbors.length;
        this.pendingNeighbors = [];
        this.status = 'Adapter metadata unavailable. Local inventory is paused.';
      }
      if (this.generation === generation) this.timer = setTimeout(refresh,45000);
    };
    void refresh();
  }
  stop() {
    this.generation++;
    clearTimeout(this.timer);
    this.lookup?.abort();
    if (this.loading) this.status = 'Capture stopped before adapter metadata was available.';
    this.loading = false;
    this.missed += this.pendingNeighbors.length;
    this.pendingNeighbors = [];
  }
  applyPtr(source,ip,name,key) {
    if (this.context?.source !== source) return;
    const device = this.bindings.get(ip);
    if (device && (!key || key === device.id+'|'+ip) && recordName(device,name,'Reverse DNS',300)) this.changed();
  }
  observe(ip,mac,time,evidence) {
    const result = this.inventory.observe(this.context,ip,mac,time,evidence);
    if (result) {
      this.detector.observe(this.context,result,ip,time,evidence);
      if (!result.overflow) {
        if (this.bindings.size >= 8192 && !this.bindings.has(ip)) this.bindings.delete(this.bindings.keys().next().value);
        const d = result.device;
        this.bindings.set(ip,d);
        if (this.context.interfaceName) d.interfaceName = this.context.interfaceName;
        const key = d.mac+'|'+ip;
        const now = Date.now();
        const mdns = this.advertisements.get(key);
        const ad = mdns?.expires > now ? mdns : this.advertisements.get(d.mac);
        if (this.localAddresses?.has(key)) recordName(d,this.machineName,'Local OS hostname',300);
        else if (ad?.expires > now) recordName(d,ad.name,ad.method,(ad.expires-now)/1000,now);
        if (!this.context.replay) this.resolveNeighbor?.(d.source,ip,d.id);

        this.changed();
      } else this.bindings.delete(ip);
    }
    return result;
  }
  cacheName(key, name, method, ttl) {
    this.advertisements.delete(key);
    if (this.advertisements.size >= 512) this.advertisements.delete(this.advertisements.keys().next().value);
    this.advertisements.set(key,{name,method,expires:Date.now()+Math.min(ttl,86400)*1000});
  }
  rememberClientName(p,name,method,ttl) {
    if (!this.context && !this.loading) return;
    if (!p.sourceMac || p.vlanIds?.length || p.decodeStatus !== 'decoded') return;
    if (!(ttl > 0)) return;
    this.cacheName(p.sourceMac,name,method,ttl);
    const device = this.inventory.devices.get(this.context?.scope+'/'+p.sourceMac);
    if (device && recordName(device,name,method,ttl)) this.changed();
  }
  rememberAnnouncement(p, ad) {
    if (!this.loading && !this.context?.local(p.source)) return;
    const key = p.sourceMac+'|'+p.source;
    if (ad.ttl > 0) {
      this.cacheName(key,ad.owner,'Observed mDNS',ad.ttl);
    } else if (this.advertisements.get(key)?.name === ad.owner) {
      this.advertisements.delete(key);
    }
    const device = this.bindings.get(p.source);
    if (!device || device.mac !== p.sourceMac) return;
    if (ad.ttl === 0 && (device.hostname !== ad.owner || device.nameMethod !== 'Observed mDNS')) return;
    if (recordName(device,ad.owner,'Observed mDNS',ad.ttl)) this.changed();
  }
  packet(p) {
    if (this.context?.replay) this.detector.clock(this.context,p.timestampUs / 1000);
    if (p.dhcpHostname) this.rememberClientName(p,p.dhcpHostname,'DHCP client hostname',300);
    if (p.netbiosName) this.rememberClientName(p,p.netbiosName,'NetBIOS name response',p.netbiosTtl);
    const ad = advertisedName(p);
    if (ad) this.rememberAnnouncement(p,ad);
    if (p.vlanIds?.length || p.decodeStatus !== 'decoded' || !p.neighborIp || !p.neighborMac) return;
    if (!this.context) {
      if (this.pendingNeighbors.length < 256 && this.loading) this.pendingNeighbors.push(p);
      else this.missed++;
      return;
    }
    const time = p.timestampUs / 1000;
    const evidence = p.network === 'ARP' ? 'ARP sender' : 'IPv6 neighbor discovery';
    this.observe(p.neighborIp,p.neighborMac,time,evidence);
  }
  eventPage(offset, filter = {}) {
    const events = this.detector.events;
    const severityCounts = {};
    const eventTypes = new Set();
    let unacknowledged = 0;
    const matching = events.filter(event => {
      severityCounts[event.severity] = (severityCounts[event.severity] ?? 0) + 1;
      eventTypes.add(event.type);
      if (!event.acknowledged) unacknowledged++;
      return (!filter.type || event.type === filter.type) &&
        (!filter.severity || event.severity === filter.severity) &&
        (!filter.status || filter.status === (event.acknowledged ? 'acknowledged' : 'unacknowledged'));
    });
    const pageSize = 24;
    const eventOffset = Math.min(offset, Math.max(0,(Math.ceil(matching.length/pageSize)-1)*pageSize));
    const page = matching.slice(eventOffset,eventOffset+pageSize).map(event => {
      const device = this.inventory.devices.get(event.scope+'/'+event.mac);
      const deviceName = device?.label || (device?.nameExpires > Date.now() ? device.hostname : '');
      return {...event, deviceName, interfaceName:event.interfaceName || device?.interfaceName || this.interfaceNames.get(event.source)};
    });
    return {events:page,eventOffset,eventTotal:events.length,eventMatches:matching.length,
      unacknowledged,severityCounts,eventTypes:[...eventTypes].sort()};
  }
  view(offset = 0,eventOffset = 0,filter = {},eventFilter = {}) {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 512) throw Error('Invalid monitoring page.');
    if (!Number.isSafeInteger(eventOffset) || eventOffset < 0 || eventOffset > 512) throw Error('Invalid event page.');
    const devices = [...this.inventory.devices.values()].sort((a,b)=>b.last-a.last);
    const term = String(filter.term ?? '').toLowerCase().trim().slice(0,256);
    const now = Date.now();
    const present = d => d && ({...d,nameExpired:Boolean(d.hostname && !(d.nameExpires > now))});
    const matching = devices.filter(d => (!filter.trust || filter.trust === (d.trusted ? 'trusted' : 'unknown')) &&
      [d.label,d.hostname,d.mac,...d.ips,(!d.label && (!d.hostname || !(d.nameExpires > now))) ? 'Unknown Device' : ''].some(v=>v?.toLowerCase().includes(term)));
    const pageSize = filter.compact ? 6 : 24;
    offset = Math.min(offset,Math.max(0,(Math.ceil(matching.length/pageSize)-1)*pageSize));
    return {type:'monitor', trustedTotal:devices.filter(d=>d.trusted).length, matchingTotal:matching.length,
      interfaceNames:Object.fromEntries(this.interfaceNames), focused:present(this.inventory.devices.get(filter.focus)),
      status:this.status,storageError:this.store?.error || '',deviceTotal:devices.length,
      ...this.eventPage(eventOffset,eventFilter),
      rules:this.detector.rules, missed:this.missed, suppressed:this.detector.suppressed,
      devices:matching.slice(offset,offset+pageSize).map(present), offset, capacityReached:devices.length === 512 };
  }
  command(msg) {
    if (msg.command === 'device_preference') { this.inventory.edit(msg.id,msg.label,msg.trusted); this.changed(); }
    if (msg.command === 'monitor_rules') { this.detector.rules = validateRules(msg.rules); this.changed(); }
    if (msg.command === 'ack_event') this.detector.acknowledge(msg.id);
    return this.view(msg.offset,msg.eventOffset,msg.deviceFilter,msg.eventFilter);
  }
}
