/** Tiny in-memory token bucket. Good enough for a single VPS process. */
export function rateLimiter({ capacity, refillPerSec }) {
  const buckets = new Map();
  setInterval(() => {
    const cutoff = Date.now() - 10 * 60_000;
    for (const [k, b] of buckets) if (b.t < cutoff) buckets.delete(k);
  }, 60_000).unref();

  return function take(key, cost = 1) {
    const t = Date.now();
    let b = buckets.get(key);
    if (!b) { b = { tokens: capacity, t }; buckets.set(key, b); }
    b.tokens = Math.min(capacity, b.tokens + ((t - b.t) / 1000) * refillPerSec);
    b.t = t;
    if (b.tokens < cost) return false;
    b.tokens -= cost;
    return true;
  };
}

export function clientIp(req) {
  // Behind Caddy/nginx: trust proxy is enabled in server.js so req.ip is the client.
  return req.ip || req.socket.remoteAddress || 'unknown';
}
