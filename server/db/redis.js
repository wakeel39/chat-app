const { createClient } = require('redis');
const config = require('../config');

let redisClient;

async function getRedis() {
  if (!redisClient) {
    redisClient = createClient({ url: config.redisUrl });
    redisClient.on('error', (err) => console.error('Redis error:', err));
    await redisClient.connect();
    console.log('Redis connected');
  }
  return redisClient;
}

module.exports = { getRedis };
