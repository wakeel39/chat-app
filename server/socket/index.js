const jwt = require('jsonwebtoken');
const config = require('../config');
const { setSession, removeSession } = require('./sessions');
const { wrapWithRateLimit } = require('./rateLimit');
const ChatMessage = require('../models/ChatMessage');

/**
 * If the room has zero sockets, remove it from the adapter so empty rooms don't accumulate.
 * Safe to call after socket.leave(room) or in setImmediate after disconnect.
 */
function pruneRoomIfEmpty(io, roomName) {
  if (!roomName) return;
  const adapter = io.sockets.adapter;
  const room = adapter.rooms.get(roomName);
  if (room && room.size === 0) {
    adapter.rooms.delete(roomName);
  }
}

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
    setSession(socket.userId, socket.id).catch((err) => console.error('Session set error', err));

    socket.emit('authenticated', { username: socket.username });

    socket.on('join_room', wrapWithRateLimit(async function (roomName) {
      if (!roomName || typeof roomName !== 'string') return;
      const room = roomName.trim().slice(0, 64) || 'general';
      socket.join(room);
      socket.currentRoom = room;
      socket.to(room).emit('user_joined', { username: socket.username, room });
      socket.emit('room_joined', { room });
      const recent = await ChatMessage.find({ room }).sort({ createdAt: -1 }).limit(50).lean();
      const history = recent.reverse().map((doc) => ({
        username: doc.username,
        text: doc.text,
        room: doc.room,
        ts: doc.createdAt.getTime(),
      }));
      socket.emit('message_history', history);
    }, 'join_room'));

    socket.on('chat_message', wrapWithRateLimit(async function (payload) {
      const text = (payload && payload.text) ? String(payload.text).slice(0, 2000) : '';
      if (!text) return;
      const room = socket.currentRoom || 'general';
      const doc = await ChatMessage.create({
        room,
        userId: socket.userId,
        username: socket.username,
        text,
      });
      const message = {
        username: doc.username,
        text: doc.text,
        room: doc.room,
        ts: doc.createdAt.getTime(),
      };
      io.to(room).emit('chat_message', message);
    }, 'chat_message'));

    socket.on('leave_room', wrapWithRateLimit(function () {
      const room = socket.currentRoom;
      if (room) {
        socket.leave(room);
        socket.to(room).emit('user_left', { username: socket.username, room });
        socket.currentRoom = null;
        pruneRoomIfEmpty(io, room);
      }
    }, 'leave_room'));

    socket.on('disconnect', () => {
      removeSession(socket.userId, socket.id).catch((err) => console.error('Session remove error', err));
      const room = socket.currentRoom;
      if (room) {
        socket.to(room).emit('user_left', { username: socket.username, room });
        setImmediate(() => pruneRoomIfEmpty(io, room));
      }
    });
  });
}

module.exports = { attachSocket };
