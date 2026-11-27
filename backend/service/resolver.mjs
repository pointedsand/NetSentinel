import { Resolver } from 'node:dns/promises';

export class Hostnames {
  constructor({ resolver = new Resolver({ timeout: 1500, tries: 1 }), capacity = 512,
                pendingLimit = 64, concurrency = 2, now = Date.now, onResult = () => {} } = {}) {
    this.onResult = onResult;
    Object.assign(this, { resolver, capacity, pendingLimit, concurrency, now });
    this.cache = new Map();
    this.pending = new Set();
    this.queue = [];
    this.active = 0;
    this.closed = false;
  }

  get(ip,key = ip) {
    if (!ip || this.closed) return null;
    const hit = this.cache.get(key);
    if (hit && hit.expires > this.now()) return hit.name;
    if (!this.pending.has(key) && this.pending.size < this.pendingLimit) {
      this.pending.add(key);
      this.queue.push({ip,key});
      this.pump();
    }
    return null;
  }

  pump() {
    while (!this.closed && this.active < this.concurrency && this.queue.length) {
      const {ip,key} = this.queue.shift();
      this.active++;
      this.lookup(ip,key);
    }
  }

  async lookup(ip,key) {
    let name = null;
    try { name = (await this.resolver.reverse(ip))[0] || null; }
    catch { /* Missing PTR and timeout both use the negative cache. */ }
    if (!this.closed) {
      this.cache.delete(key);
      if (this.cache.size >= this.capacity) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(key, { name, expires: this.now() + (name ? 300000 : 30000) });
      if (name) this.onResult(ip,name,key);
    }
    this.active--;
    this.pending.delete(key);
    this.pump();
  }

  close() {
    this.closed = true;
    this.queue.length = 0;
    this.pending.clear();
    this.cache.clear();
    this.resolver.cancel();
  }
}
