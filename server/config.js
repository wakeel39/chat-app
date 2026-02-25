require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/chatdb',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
};
