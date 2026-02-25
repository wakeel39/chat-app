// IN-MEMORY socket session store (deliberate issue #1).
// Will break when running multiple server instances.
const socketSessions = new Map(); // userId -> Set of socketIds

function setSession(userId, socketId) {
  if (!socketSessions.has(userId)) {
    socketSessions.set(userId, new Set());
  }
  socketSessions.get(userId).add(socketId);
}

function removeSession(userId, socketId) {
  const set = socketSessions.get(userId);
  if (set) {
    set.delete(socketId);
    if (set.size === 0) socketSessions.delete(userId);
  }
}

function getSocketsByUser(userId) {
  return socketSessions.get(userId) || new Set();
}

module.exports = { setSession, removeSession, getSocketsByUser };
