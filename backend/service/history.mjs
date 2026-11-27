const zero = () => ({type:'batch',captureState:'PAUSED',packetCount:0,bytes:0,wireBytes:0,rejected:0,
  outputDrops:0,protocolCounts:[0,0,0,0],activeConnections:0,bandwidthMbps:0,elapsedSeconds:0});

export class PacketHistory {
  constructor(limit = 4096) { this.limit = limit; this.clear(); }
  clear() {
    this.rows = []; this.evicted = 0; this.next = 1;
    this.stats = zero(); this.begin();
  }
  begin() {
    this.base = this.stats;
    this.samples = [{ seconds: 0, bytes: 0, frames: 0 }];
  }
  rates(batch) {
    const seconds = batch.elapsedSeconds;
    const bytes = batch.wireBytes ?? batch.bytes;
    const frames = batch.packetCount + batch.rejected;
    this.samples.push({ seconds, bytes, frames });
    while (this.samples.length > 2 && (this.samples[1].seconds <= seconds - 3 || this.samples.length > 32)) {
      this.samples.shift();
    }
    const first = this.samples[0];
    const duration = seconds - first.seconds;
    return { rollingMbps: duration > 0 ? (bytes - first.bytes) * 8e-6 / duration : 0,
      packetsPerSecond: duration > 0 ? (frames - first.frames) / duration : 0, rateSeconds: duration };
  }
  applyPtr(source, ip, name) {
    for (const row of this.rows) {
      if (row.captureSource !== source) continue;
      if (row.source === ip) row.sourceHostname = name;
      if (row.destination === ip) row.destinationHostname = name;
    }
  }
  append(batch, source) {
    const packets = batch.packets.map(p => ({...p,id:this.next++,captureSource:source}));
    this.rows.push(...packets);
    const excess = Math.max(0,this.rows.length-this.limit);
    this.rows.splice(0,excess); this.evicted += excess;
    const stats = {...batch}; delete stats.packets;
    for (const key of ['packetCount','bytes','rejected','outputDrops','elapsedSeconds'])
      stats[key] = this.base[key] + batch[key];
    stats.wireBytes = this.base.wireBytes + (batch.wireBytes ?? batch.bytes);
    stats.protocolCounts = batch.protocolCounts.map((n,i) => n+this.base.protocolCounts[i]);
    stats.bandwidthMbps = stats.elapsedSeconds ? stats.bytes*8e-6/stats.elapsedSeconds : 0;
    Object.assign(stats, this.rates(batch));
    this.stats = stats;
    return this.message(packets);
  }
  message(packets) {
    return {...this.stats, packets, retained:this.rows.length, evicted:this.evicted};
  }
}
