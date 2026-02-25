# Real-time Chat Application

Node.js real-time chat using **Express**, **Socket.io**, **MongoDB**, and **Redis**, with **JWT** authentication.

## Stack

- **Backend:** Node.js, Express, Socket.io
- **Database:** MongoDB (user data), Redis (sessions & pub/sub wiring)
- **Auth:** JWT via express-jwt

## Project structure

```
chat-app/
  server/           # Express REST API + Socket.io
    db/             # MongoDB and Redis connections
    models/         # User model
    routes/         # Auth (register, login, /me)
    socket/         # Socket.io handlers + in-memory sessions
  client/           # Plain HTML/JS chat UI (no framework)
```

## Run

```bash
npm install
npm start
```

Requires **MongoDB** and **Redis** running (default: `localhost:27017`, `localhost:6379`). Optional env: `PORT`, `JWT_SECRET`, `MONGO_URI`, `REDIS_URL`.

Open http://localhost:3000 — register or log in, then chat. Join rooms via the sidebar.

---

## Known issues (for next iteration)

These are deliberate limitations to fix in a follow-up.

### 1. Socket sessions stored in memory (not Redis)

**Issue:** Socket session state lives in process memory (`server/socket/sessions.js`). With multiple server instances (e.g. behind a load balancer), each instance has its own map; users can be tied to different nodes and room/message state is not shared.

**How to reproduce:**

1. Start two instances: `PORT=3001 npm start` and `PORT=3002 npm start`.
2. Log in from the browser to instance 1 (e.g. http://localhost:3001), join a room, send a message.
3. Point the same browser (or another client) to instance 2 (http://localhost:3002) with the same user (or a different user).
4. Messages and presence are not consistent across instances; “who is in which room” and delivery depend on which node the client is connected to.

**Fix (next iteration):** Store socket session data in Redis (e.g. Redis adapter or a Redis-backed session store) so all instances share the same view of sessions/rooms.

---

### 2. No rate limiting on Socket.io events

**Issue:** Socket event handlers (`chat_message`, `join_room`, etc.) do not enforce any rate limit. A single client can flood the server with events and degrade or DoS the service.

**How to reproduce:**

1. Log in and open the browser console.
2. Run a loop that emits as fast as possible, e.g.:
   ```js
   for (let i = 0; i < 10000; i++) socket.emit('chat_message', { text: 'flood ' + i });
   ```
3. Observe high CPU, many messages in the room, and possible impact on other clients.

**Fix (next iteration):** Add per-socket (and optionally per-IP) rate limiting for socket events (e.g. limit `chat_message` and `join_room` per second/minute).

---

### 3. Default Socket.io config (no Redis adapter)

**Issue:** Socket.io uses its default in-memory adapter. Rooms and broadcast state are per process. With multiple nodes, only clients connected to the same node receive each other’s events.

**How to reproduce:**

1. Run two servers: `PORT=3001 npm start` and `PORT=3002 npm start`.
2. Client A connects to :3001 and joins room “test”.
3. Client B connects to :3002 and joins room “test”.
4. A sends a message; B never receives it (and vice versa), because each server only broadcasts to its own connections.

**Fix (next iteration):** Use `@socket.io/redis-adapter` (or similar) so that Socket.io broadcasts and room joins are synced across instances via Redis pub/sub.

---

### 4. No message persistence to MongoDB

**Issue:** Chat messages are only broadcast in memory. They are not written to MongoDB. On server restart or crash, all messages are lost and there is no history.

**How to reproduce:**

1. Log in, join a room, send several messages.
2. Stop the server (Ctrl+C) or kill the process.
3. Restart with `npm start`.
4. Re-open the app and join the same room — no previous messages; only new ones appear.

**Fix (next iteration):** Persist each `chat_message` to a MongoDB collection (e.g. with room, user, text, timestamp) and, on `join_room`, optionally load and emit recent messages from the DB.

---

### 5. No room cleanup logic

**Issue:** When users leave a room (or disconnect), the code never removes or prunes empty rooms. Socket.io keeps room state forever; over time, ghost rooms and metadata can accumulate.

**How to reproduce:**

1. Join several rooms with different names (e.g. “room1”, “room2”, “test”, “ghost”).
2. Leave some rooms or close tabs so that some rooms have zero participants.
3. Restart the server and/or inspect Socket.io’s internal room list (e.g. via admin/debug) — empty rooms may still be present; with more usage, the list grows without cleanup.

**Fix (next iteration):** On `leave_room` or `disconnect`, check if the room has zero sockets; if so, delete the room or clear its state so that empty rooms do not accumulate.

---

## Summary

| # | Issue                         | Impact                    | Reproduce                          |
|---|-------------------------------|---------------------------|------------------------------------|
| 1 | In-memory socket sessions     | Multi-instance broken     | Run 2 servers, use both in browser |
| 2 | No socket rate limiting       | Flood/DoS possible        | Loop `socket.emit('chat_message')` |
| 3 | No Redis adapter for Socket.io| Single-node only          | 2 servers, 2 clients in same room |
| 4 | No MongoDB message persistence| Messages lost on crash    | Send messages, restart server      |
| 5 | No room cleanup               | Ghost rooms accumulate    | Join/leave many rooms over time    |
