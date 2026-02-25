const path = require('path');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const config = require('./config');
const { connectMongo } = require('./db/mongo');
const { getRedis } = require('./db/redis');
const { router: authRouter } = require('./routes/auth');
const { attachSocket } = require('./socket');

const app = express();
const httpServer = createServer(app);

// Default Socket.io — no Redis adapter (issue #3)
const io = new Server(httpServer, {
  cors: { origin: config.port === 3000 ? '*' : undefined },
});

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRouter);

// Serve client
app.use(express.static(path.join(__dirname, '..', 'client')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

attachSocket(io);

async function start() {
  await connectMongo();
  await getRedis(); // Redis connected but not used for socket sessions (issue #1)
  httpServer.listen(config.port, () => {
    console.log(`Server running at http://localhost:${config.port}`);
  });
}

start().catch((err) => {
  console.error('Startup error:', err);
  process.exit(1);
});
