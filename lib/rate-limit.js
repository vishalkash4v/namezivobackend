const stores = new Map();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function rateLimit({ key, limit, windowMs, cost = 1 }) {
  const now = Date.now();
  let record = stores.get(key);

  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + windowMs };
    stores.set(key, record);
  }

  if (record.count + cost > limit) {
    return { allowed: false, remaining: 0 };
  }

  record.count += cost;
  return { allowed: true, remaining: limit - record.count };
}

module.exports = { getClientIp, rateLimit };
