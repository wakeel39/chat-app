/**
 * Redis-backed rate limiter for socket events.
 * Per-socket and per-IP limits; shared across server instances.
 */
const { getRedis } = require('../db/redis');

const PREFIX = 'ratelimit';
const WINDOW_SEC = 60;
const BUCKET_SEC = 60;

// Max events per window: per-socket (then per-IP in parentheses)
const LIMITS = {
  chat_message: { socket: 30, ip: 100 },
  join_room: { socket: 10, ip: 30 },
  leave_room: { socket: 20, ip: 60 },
};

function getBucket() {
  return Math.floor(Date.now() / (BUCKET_SEC * 1000));
}

function getIp(socket) {
  if (!socket) return 'unknown';
  const addr = socket.handshake?.address || socket.conn?.remoteAddress || 'unknown';
  // Normalize IPv6-mapped IPv4 addresses like ::ffff:192.168.0.1
  if (typeof addr === 'string' && addr.startsWith('::ffff:')) {
    return addr.slice(7);
  }
  return addr;
}

async function incrAndCheck(key, limit) {
  const redis = await getRedis();
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, WINDOW_SEC + 10);
  return count <= limit;
}

/**
 * Returns true if the event is allowed, false if rate limited.
 * Checks both per-socket and per-IP.
 */
async function checkRateLimit(socket, eventName) {
  const limits = LIMITS[eventName];
  if (!limits) return true;

  const bucket = getBucket();
  const socketKey = `${PREFIX}:socket:${socket.id}:${eventName}:${bucket}`;
  const ip = getIp(socket);
  const ipKey = `${PREFIX}:ip:${ip}:${eventName}:${bucket}`;

  const [socketOk, ipOk] = await Promise.all([
    incrAndCheck(socketKey, limits.socket),
    incrAndCheck(ipKey, limits.ip),
  ]);

  return socketOk && ipOk;
}

function wrapWithRateLimit(handler, eventName) {
  return async function (...args) {
    const socket = this;
    try {
      const allowed = await checkRateLimit(socket, eventName);
      if (!allowed) {
        socket.emit('error', { message: 'Rate limit exceeded. Please slow down.' });
        return;
      }
    } catch (err) {
      // In case Redis or rate limit logic fails, do not crash the socket handler
      console.error('Rate limit error:', err);
    }
    return handler.apply(this, args);
  };
}

module.exports = { checkRateLimit, wrapWithRateLimit, LIMITS };
