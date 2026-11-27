const zero = () => ({type:'batch',captureState:'PAUSED',packetCount:0,bytes:0,rejected:0,
  outputDrops:0,protocolCounts:[0,0,0,0],activeConnections:0,bandwidthMbps:0,elapsedSeconds:0});

export class PacketHistory {
  constructor(limit = 4096) { this.limit = limit; this.clear(); }
  clear() {
    this.rows = []; this.evicted = 0; this.next = 1;
    this.stats = zero(); this.begin();
  }
  begin() { this.base = this.stats; }
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
    stats.protocolCounts = batch.protocolCounts.map((n,i) => n+this.base.protocolCounts[i]);
    stats.bandwidthMbps = stats.elapsedSeconds ? stats.bytes*8e-6/stats.elapsedSeconds : 0;
    this.stats = stats;
    return this.message(packets);
  }
  message(packets) {
    return {...this.stats, packets, retained:this.rows.length, evicted:this.evicted};
  }
}
