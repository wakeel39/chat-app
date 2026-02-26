const API = '/api/auth';
let token = localStorage.getItem('chat_token');
let socket = null;
let currentUsername = null;

const authScreen = document.getElementById('auth-screen');
const chatScreen = document.getElementById('chat-screen');
const authForm = document.getElementById('auth-form');
const authError = document.getElementById('auth-error');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const btnRegister = document.getElementById('btn-register');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const currentUserEl = document.getElementById('current-user');
const currentRoomEl = document.getElementById('current-room');
const roomInput = document.getElementById('room-input');
const btnJoinRoom = document.getElementById('btn-join-room');
const roomList = document.getElementById('room-list');
const messagesEl = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');

function showError(msg) {
  authError.textContent = msg || '';
}

function renderAuth() {
  if (token) {
    authScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');
    connectSocket();
  } else {
    authScreen.classList.remove('hidden');
    chatScreen.classList.add('hidden');
  }
}

async function login(username, password) {
  const res = await fetch(API + '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}

async function register(username, password) {
  const res = await fetch(API + '/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  return data;
}

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) return;
  try {
    const data = await login(username, password);
    token = data.token;
    currentUsername = data.username;
    localStorage.setItem('chat_token', token);
    renderAuth();
  } catch (err) {
    showError(err.message);
  }
});

btnRegister.addEventListener('click', async () => {
  showError('');
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) {
    showError('Username and password required');
    return;
  }
  try {
    const data = await register(username, password);
    token = data.token;
    currentUsername = data.username;
    localStorage.setItem('chat_token', token);
    renderAuth();
  } catch (err) {
    showError(err.message);
  }
});

btnLogout.addEventListener('click', () => {
  if (socket) socket.disconnect();
  socket = null;
  token = null;
  currentUsername = null;
  localStorage.removeItem('chat_token');
  renderAuth();
});

function connectSocket() {
  if (socket) return;
  socket = io({
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect_error', (err) => {
    console.error('Socket error:', err.message);
    if (err.message === 'Invalid token') {
      localStorage.removeItem('chat_token');
      token = null;
      renderAuth();
    }
  });

  socket.on('error', (data) => {
    const msg = (data && data.message) || 'Something went wrong';
    appendMessage({ system: true, text: msg });
  });

  socket.on('authenticated', (data) => {
    currentUsername = data.username;
    currentUserEl.textContent = data.username;
    currentRoomEl.textContent = 'Room: general';
    socket.emit('join_room', 'general');
  });

  socket.on('room_joined', (data) => {
    currentRoomEl.textContent = 'Room: ' + data.room;
    addRoomToList(data.room);
    appendMessage({ system: true, text: 'You joined ' + data.room });
  });

  socket.on('message_history', (messages) => {
    if (Array.isArray(messages)) {
      messages.forEach((msg) => {
        appendMessage({
          username: msg.username,
          text: msg.text,
          own: msg.username === currentUsername,
        });
      });
    }
  });

  socket.on('user_joined', (data) => {
    appendMessage({ system: true, text: data.username + ' joined' });
  });

  socket.on('user_left', (data) => {
    appendMessage({ system: true, text: data.username + ' left' });
  });

  socket.on('chat_message', (msg) => {
    appendMessage({
      username: msg.username,
      text: msg.text,
      own: msg.username === currentUsername,
    });
  });
}

function addRoomToList(room) {
  if (!roomList.querySelector(`[data-room="${room}"]`)) {
    const li = document.createElement('li');
    li.setAttribute('data-room', room);
    li.textContent = room;
    roomList.appendChild(li);
  }
}

function appendMessage(msg) {
  const li = document.createElement('li');
  if (msg.system) {
    li.className = 'system';
    li.textContent = msg.text;
  } else {
    li.className = msg.own ? 'own' : 'other';
    const sender = document.createElement('div');
    sender.className = 'sender';
    sender.textContent = msg.username;
    li.appendChild(sender);
    li.appendChild(document.createTextNode(msg.text));
  }
  messagesEl.appendChild(li);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

btnJoinRoom.addEventListener('click', () => {
  const room = (roomInput.value || 'general').trim();
  if (!room || !socket) return;
  socket.emit('join_room', room);
  roomInput.value = '';
});

messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !socket) return;
  socket.emit('chat_message', { text });
  messageInput.value = '';
});

renderAuth();
