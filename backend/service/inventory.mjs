export function normalizeMac(value) {
  const mac = typeof value === 'string' ? value.toLowerCase().replaceAll('-',':') : '';
  return /^([\da-f]{2}:){5}[\da-f]{2}$/.test(mac) && mac !== '00:00:00:00:00:00' &&
    !(parseInt(mac.slice(0,2),16) & 1) ? mac : '';
}

export class Inventory {
  constructor(saved = []) {
    this.devices = new Map(saved.map(d => [d.id,d]));
  }
  observe(context, ip, hardware, time, evidence, hostname) {
    const mac = normalizeMac(hardware);
    if (!mac || !context?.local(ip) || !Number.isFinite(time)) return;
    const id = context.scope + '/' + mac;
    let device = this.devices.get(id);
    const fresh = !device;
    if (fresh) {
      if (this.devices.size >= 512) return {device:{mac,trusted:false}, fresh:false, previousLast:time, overflow:true};
      device = {id, scope:context.scope, source:context.source, mac, ips:[], label:'', trusted:false,
        hostname:'', first:time, last:time, evidence};
      this.devices.set(id, device);
    }
    const previousLast = device.last;
    if (!device.ips.includes(ip)) device.ips = [...device.ips.slice(-15),ip];
    device.first = Math.min(device.first,time);
    if (time >= device.last) { device.last = time; device.evidence = evidence; }
    if (typeof hostname === 'string' && hostname) device.hostname = hostname.slice(0,253);
    return {device, fresh, previousLast};
  }
  edit(id, label, trusted) {
    const device = this.devices.get(id);
    if (!device || (label === undefined && trusted === undefined) ||
        (label !== undefined && (typeof label !== 'string' || label.length > 80)) ||
        (trusted !== undefined && typeof trusted !== 'boolean')) throw Error('Invalid device preference.');
    if (label !== undefined) device.label = label.trim();
    if (trusted !== undefined) device.trusted = trusted;
  }
}
