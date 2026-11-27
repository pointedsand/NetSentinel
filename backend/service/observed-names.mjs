// Associations are scoped to an interface, client address and capture time.
export class ObservedNames {
  constructor(limit = 2048) { this.limit = limit; this.entries = new Map(); }
  remember(key, entry) {
    this.entries.delete(key);
    if (entry.end <= entry.start) return;
    if (this.entries.size >= this.limit) this.entries.delete(this.entries.keys().next().value);
    this.entries.set(key,entry);
  }
  inspect(p, source) {
    const key = (client, address) => JSON.stringify([source,client,address]);
    const now = p.timestampUs;
    if (p.protocol === 'TCP' && p.sourcePort != null && p.destinationPort != null) {
      const endpoints = [[p.source,p.sourcePort],[p.destination,p.destinationPort]].sort();
      const flow = JSON.stringify([source,'tcp',endpoints]);
      if ((p.tcpFlags & 2) && !(p.tcpFlags & 16)) this.entries.delete(flow);
      if (p.sni) this.remember(flow,{name:p.sni,start:now,end:now+300e6});
      const entry = this.entries.get(flow);
      if (entry && now >= entry.start && now < entry.end) p.flowSni = entry.name;
      if (p.tcpFlags & 5) this.entries.delete(flow);
    }
    if (p.application !== 'mDNS response' && p.dnsQuestion && p.dnsAnswers?.length && p.destination) {
      let name = p.dnsQuestion.toLowerCase(), ttl = Infinity;
      for (let depth=0; depth<8; depth++) {
        for (const a of p.dnsAnswers) {
          if (a.owner.toLowerCase() === name && [1,28].includes(a.type))
            this.remember(key(p.destination,a.value), {name:p.dnsQuestion,canonical:a.owner,
              start:now,end:now+Math.min(ttl,a.ttl)*1e6});
        }
        const alias = p.dnsAnswers.find(a => a.type === 5 && a.owner.toLowerCase() === name);
        if (!alias) break;
        ttl = Math.min(ttl,alias.ttl); name = alias.value.toLowerCase();
      }
    }
    for (const [client,address] of [[p.source,p.destination],[p.destination,p.source]]) {
      const entry=this.entries.get(key(client,address));
      if (entry && now>=entry.start && now<entry.end) {
        p.observedDns={name:entry.name,canonical:entry.canonical,address,client,expiresUs:entry.end}; break;
      }
    }
  }
}
