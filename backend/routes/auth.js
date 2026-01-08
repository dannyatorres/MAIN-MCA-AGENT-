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
      'SELECT id, email, username, name, role, password_hash, is_active FROM users WHERE email = $1 OR username = $1',
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
    req.session.isAuthenticated = true; // Keep for backward compatibility

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

// TEMPORARY - Remove after setting password
router.post('/set-password', async (req, res) => {
  try {
    const { email, password } = req.body;
    const db = getDatabase();

    console.log('🔧 Setting password for:', email);

    const hash = await bcrypt.hash(password, 12);
    const result = await db.query('UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, email', [hash, email]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    console.log('✅ Password set for:', result.rows[0].email);
    res.json({ success: true, message: 'Password set', user: result.rows[0] });
  } catch (error) {
    console.error('❌ Set password error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
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
