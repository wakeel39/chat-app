// Redis-backed socket session store — shared across all server instances.
// Key: socket:user:{userId} = Redis SET of socket IDs.
const { getRedis } = require('../db/redis');

const KEY_PREFIX = 'socket:user:';

async function setSession(userId, socketId) {
  const redis = await getRedis();
  await redis.sAdd(KEY_PREFIX + userId, socketId);
}

async function removeSession(userId, socketId) {
  const redis = await getRedis();
  const key = KEY_PREFIX + userId;
  await redis.sRem(key, socketId);
  const count = await redis.sCard(key);
  if (count === 0) await redis.del(key);
}

async function getSocketsByUser(userId) {
  const redis = await getRedis();
  const members = await redis.sMembers(KEY_PREFIX + userId);
  return new Set(members);
}

module.exports = { setSession, removeSession, getSocketsByUser };
