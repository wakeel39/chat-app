const jwt = require('jsonwebtoken');
const config = require('../config');
const { setSession, removeSession } = require('./sessions');

/**
 * No rate limiting on socket events (deliberate issue #2) — flood attack possible.
 * Default Socket.io config, no Redis adapter (deliberate issue #3) — single node only.
 * No message persistence to MongoDB (deliberate issue #4) — messages lost on crash.
 * No room cleanup logic (deliberate issue #5) — ghost rooms accumulate.
 */
function attachSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      socket.userId = payload.sub;
      socket.username = payload.username;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    // In-memory session (issue #1)
    setSession(socket.userId, socket.id);

    socket.emit('authenticated', { username: socket.username });

    socket.on('join_room', (roomName) => {
      if (!roomName || typeof roomName !== 'string') return;
      const room = roomName.trim().slice(0, 64) || 'general';
      socket.join(room);
      socket.currentRoom = room;
      socket.to(room).emit('user_joined', { username: socket.username, room });
      socket.emit('room_joined', { room });
    });

    socket.on('chat_message', (payload) => {
      const text = (payload && payload.text) ? String(payload.text).slice(0, 2000) : '';
      if (!text) return;
      const room = socket.currentRoom || 'general';
      // No persistence to MongoDB (issue #4)
      const message = {
        username: socket.username,
        text,
        room,
        ts: Date.now(),
      };
      io.to(room).emit('chat_message', message);
    });

    socket.on('leave_room', () => {
      const room = socket.currentRoom;
      if (room) {
        socket.leave(room);
        socket.to(room).emit('user_left', { username: socket.username, room });
        socket.currentRoom = null;
      }
      // No room cleanup (issue #5) — empty rooms never removed
    });

    socket.on('disconnect', () => {
      removeSession(socket.userId, socket.id);
      const room = socket.currentRoom;
      if (room) {
        socket.to(room).emit('user_left', { username: socket.username, room });
      }
    });
  });
}

module.exports = { attachSocket };
