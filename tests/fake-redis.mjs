// In-memory stand-in for the Upstash Redis client (only the commands the API uses).

export class FakeRedis {
  constructor() { this.m = new Map(); }
  async get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  async set(k, v) { this.m.set(k, String(v)); return "OK"; }
  async incr(k) { const v = Number(this.m.get(k) || 0) + 1; this.m.set(k, String(v)); return v; }
  async expire() { return 1; }
  async del(k) { return this.m.delete(k) ? 1 : 0; }
  _h(k) { if (!this.m.has(k)) this.m.set(k, {}); return this.m.get(k); }
  async hset(k, obj) { Object.assign(this._h(k), Object.fromEntries(Object.entries(obj).map(([a, b]) => [a, String(b)]))); return 1; }
  async hgetall(k) { const h = this.m.get(k); return h && Object.keys(h).length ? { ...h } : null; }
  async hincrby(k, f, n) { const h = this._h(k); h[f] = String(Number(h[f] || 0) + n); return Number(h[f]); }
  async hdel(k, f) { const h = this.m.get(k); if (h) delete h[f]; return 1; }
  _l(k) { if (!this.m.has(k)) this.m.set(k, []); return this.m.get(k); }
  async rpush(k, v) { return this._l(k).push(v); }
  async llen(k) { return (this.m.get(k) || []).length; }
  async lrange(k, a, b) { const l = this.m.get(k) || []; return l.slice(a, b === -1 ? undefined : b + 1); }
  _z(k) { if (!this.m.has(k)) this.m.set(k, new Map()); return this.m.get(k); }
  async zadd(k, { score, member }) { this._z(k).set(member, score); return 1; }
  async zrem(k, member) { this._z(k).delete(member); return 1; }
  async zrange(k, a, b, opts = {}) {
    let ids = [...this._z(k).entries()].sort((x, y) => x[1] - y[1]).map((e) => e[0]);
    if (opts.rev) ids.reverse();
    return ids.slice(a, b === -1 ? undefined : b + 1);
  }
}

