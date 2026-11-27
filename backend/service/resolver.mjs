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

  get(ip) {
    if (!ip || this.closed) return null;
    const hit = this.cache.get(ip);
    if (hit && hit.expires > this.now()) return hit.name;
    if (!this.pending.has(ip) && this.pending.size < this.pendingLimit) {
      this.pending.add(ip);
      this.queue.push(ip);
      this.pump();
    }
    return null;
  }

  pump() {
    while (!this.closed && this.active < this.concurrency && this.queue.length) {
      const ip = this.queue.shift();
      this.active++;
      this.lookup(ip);
    }
  }

  async lookup(ip) {
    let name = null;
    try { name = (await this.resolver.reverse(ip))[0] || null; }
    catch { /* Missing PTR and timeout both use the negative cache. */ }
    if (!this.closed) {
      this.cache.delete(ip);
      if (this.cache.size >= this.capacity) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(ip, { name, expires: this.now() + (name ? 300000 : 30000) });
      if (name) this.onResult(ip,name);
    }
    this.active--;
    this.pending.delete(ip);
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
