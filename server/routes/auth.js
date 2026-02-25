const express = require('express');
const jwt = require('jsonwebtoken');
const { expressjwt: expressJwt } = require('express-jwt');
const User = require('../models/User');
const config = require('../config');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    const user = await User.create({ username, password });
    const token = jwt.sign(
      { sub: user._id.toString(), username: user.username },
      config.jwtSecret,
      { expiresIn: '7d' }
    );
    res.status(201).json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const user = await User.findOne({ username });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { sub: user._id.toString(), username: user.username },
      config.jwtSecret,
      { expiresIn: '7d' }
    );
    res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const requireAuth = expressJwt({
  secret: config.jwtSecret,
  algorithms: ['HS256'],
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.auth.sub).select('-password');
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ username: user.username, id: user._id });
});

module.exports = { router, requireAuth };
