const path = require('path');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const cors = require('cors');

const config = require('./config');
const { connectMongo } = require('./db/mongo');
const { getRedis } = require('./db/redis');
const { router: authRouter } = require('./routes/auth');
const { attachSocket } = require('./socket');

const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRouter);

app.use(express.static(path.join(__dirname, '..', 'client')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

async function start() {
  await connectMongo();
  const redis = await getRedis();

  const io = new Server(httpServer, {
    cors: { origin: config.port === 3000 ? '*' : undefined },
  });

  const sub = redis.duplicate();
  await sub.connect();
  io.adapter(createAdapter(redis, sub));

  attachSocket(io);

  httpServer.listen(config.port, () => {
    console.log(`Server running at http://localhost:${config.port}`);
  });
}

start().catch((err) => {
  console.error('Startup error:', err);
  process.exit(1);
});
