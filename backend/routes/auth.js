// backend/routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { getDatabase } = require('../services/database');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password, username } = req.body;
    console.log('🔐 Login attempt:', { email, username });

    const db = getDatabase();

    // Support login by email OR username
    const loginField = email || username;
    if (!loginField || !password) {
      console.log('❌ Missing credentials');
      return res.status(400).json({ error: 'Email/username and password required' });
    }

    const result = await db.query(
      'SELECT id, email, username, name, role, password_hash, is_active, session_version FROM users WHERE email = $1 OR username = $1',
      [loginField]
    );

    console.log('🔍 User found:', result.rows.length > 0);

    if (result.rows.length === 0) {
      console.log('❌ No user found for:', loginField);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    console.log('👤 User details:', { email: user.email, hasHash: !!user.password_hash, isActive: user.is_active });

    if (!user.is_active) {
      console.log('❌ Account disabled');
      return res.status(401).json({ error: 'Account is disabled' });
    }

    if (!user.password_hash) {
      console.log('❌ No password hash');
      return res.status(401).json({ error: 'Password not set - contact admin' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    console.log('🔑 Password valid:', validPassword);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last_login
    await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    // Set session
    req.session.userId = user.id;
    req.session.sessionVersion = user.session_version || 1;
    req.session.isAuthenticated = true;

    console.log('✅ Login successful:', { userId: user.id, email: user.email });

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        role: user.role
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const db = getDatabase();
    const result = await db.query('SELECT session_version FROM users WHERE id = $1', [req.user.id]);

    if (result.rows.length > 0) {
      const dbVersion = result.rows[0].session_version || 1;
      const sessionVersion = req.session.sessionVersion || 1;

      if (dbVersion > sessionVersion) {
        req.session.destroy(() => {});
        return res.status(401).json({ error: 'Session expired' });
      }
    }
  } catch (err) {
    console.error('Session check error:', err);
  }

  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      username: req.user.username,
      name: req.user.name,
      role: req.user.role
    }
  });
});

module.exports = router;
