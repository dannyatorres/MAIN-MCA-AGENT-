// backend/routes/users.js
const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { getDatabase } = require('../services/database');
const { requireRole } = require('../middleware/auth');
const { clearSettingsCache, getDefaultSettings } = require('../middleware/serviceAccess');
const { google } = require('googleapis');

// All routes require admin role
router.use(requireRole('admin'));

// GET /api/users - List all users
router.get('/', async (req, res) => {
  try {
    const db = getDatabase();
    const result = await db.query(`
      SELECT id, email, username, name, role, is_active, created_at, last_login, agent_name
      FROM users
      ORDER BY created_at DESC
    `);
    res.json({ users: result.rows });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/users/:id - Get single user
router.get('/:id', async (req, res) => {
  try {
    const db = getDatabase();
    const result = await db.query(`
      SELECT id, email, username, name, role, is_active, created_at, last_login, agent_name
      FROM users WHERE id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST /api/users - Create new user
router.post('/', async (req, res) => {
  try {
    const { email, username, name, password, role, agent_name } = req.body;

    // Validation
    if (!email || !username || !name || !password) {
      return res.status(400).json({ error: 'Email, username, name, and password are required' });
    }

    // Password validation (Standard: min 8 chars, 1 uppercase, 1 number)
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/[A-Z]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one uppercase letter' });
    }
    if (!/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one number' });
    }

    const validRoles = ['admin', 'agent', 'viewer', 'manager'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${validRoles.join(', ')}` });
    }

    const db = getDatabase();

    // Check for existing email/username
    const existing = await db.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email or username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await db.query(`
      INSERT INTO users (email, username, name, password_hash, role, is_active, created_by, agent_name)
      VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7)
      RETURNING id, email, username, name, role, is_active, created_at, agent_name
    `, [email, username, name, passwordHash, role || 'agent', req.user.id, agent_name || 'Dan Torres']);

    res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT /api/users/:id - Update user
router.put('/:id', async (req, res) => {
  try {
    const { email, username, name, role, is_active, agent_name } = req.body;
    const db = getDatabase();

    // Check user exists
    const existing = await db.query('SELECT id FROM users WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent admin from deactivating themselves
    if (req.params.id === req.user.id && is_active === false) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    // Check for duplicate email/username
    if (email || username) {
      const duplicate = await db.query(
        'SELECT id FROM users WHERE (email = $1 OR username = $2) AND id != $3',
        [email, username, req.params.id]
      );
      if (duplicate.rows.length > 0) {
        return res.status(409).json({ error: 'Email or username already in use' });
      }
    }

    const result = await db.query(`
      UPDATE users SET
        email = COALESCE($1, email),
        username = COALESCE($2, username),
        name = COALESCE($3, name),
        role = COALESCE($4, role),
        is_active = COALESCE($5, is_active),
        agent_name = COALESCE($6, agent_name),
        updated_at = NOW()
      WHERE id = $7
      RETURNING id, email, username, name, role, is_active, created_at, last_login, agent_name
    `, [email, username, name, role, is_active, agent_name, req.params.id]);

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// PUT /api/users/:id/password - Reset password
router.put('/:id/password', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    // Password validation
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/[A-Z]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one uppercase letter' });
    }
    if (!/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one number' });
    }

    const db = getDatabase();

    const existing = await db.query('SELECT id FROM users WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db.query(
      'UPDATE users SET password_hash = $1, session_version = COALESCE(session_version, 1) + 1, updated_at = NOW() WHERE id = $2',
      [passwordHash, req.params.id]
    );

    res.json({ success: true, message: 'Password updated' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// DELETE /api/users/:id - Deactivate user (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const db = getDatabase();

    // Prevent self-deletion
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const existing = await db.query('SELECT id, role FROM users WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Soft delete - just deactivate
    await db.query(
      'UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1',
      [req.params.id]
    );

    res.json({ success: true, message: 'User deactivated' });
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

// GET /api/users/:id/settings - Get user service settings
router.get('/:id/settings', async (req, res) => {
  try {
    const db = getDatabase();
    const result = await db.query(
      'SELECT service_settings FROM users WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0].service_settings || getDefaultSettings());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/users/:id/settings - Update user service settings
router.put('/:id/settings', async (req, res) => {
  try {
    const { drive_folder_id, services } = req.body;
    const db = getDatabase();

    const settings = {
      drive_folder_id: drive_folder_id || null,
      services: {
        aiAgent: services?.aiAgent !== false,
        commander: services?.commander !== false,
        fcs: services?.fcs !== false,
        driveSync: services?.driveSync !== false,
        lenderMatcher: services?.lenderMatcher !== false,
        successPredictor: services?.successPredictor !== false
      }
    };

    await db.query(
      'UPDATE users SET service_settings = $1 WHERE id = $2',
      [JSON.stringify(settings), req.params.id]
    );

    clearSettingsCache(req.params.id);

    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test Drive connection for a user
router.post('/test-drive/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { getDriveFolderId } = require('../middleware/serviceAccess');

    // Get the folder ID for this user
    let folderId = await getDriveFolderId(userId);

    if (!folderId) {
      return res.json({ success: false, error: 'No folder ID configured for this user' });
    }

    // Extract folder ID if full URL was provided
    const urlMatch = folderId.match(/\/folders\/([a-zA-Z0-9-_]+)/);
    if (urlMatch) {
      folderId = urlMatch[1];
    }

    // Parse credentials (handle both raw JSON and base64)
    let credentials;
    const rawVar = process.env.GOOGLE_CREDENTIALS_JSON;

    if (!rawVar) {
      return res.json({ success: false, error: 'GOOGLE_CREDENTIALS_JSON not configured' });
    }

    try {
      if (rawVar.trim().startsWith('{')) {
        credentials = JSON.parse(rawVar);
      } else {
        credentials = JSON.parse(Buffer.from(rawVar, 'base64').toString('utf8'));
      }
    } catch (parseErr) {
      return res.json({ success: false, error: 'Failed to parse Google credentials' });
    }

    // Try to list folders
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });

    const drive = google.drive({ version: 'v3', auth });

    const result = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 5
    });

    const folderCount = result.data.files?.length || 0;

    res.json({
      success: true,
      folderId,
      message: `Connected! Found ${folderCount} sub-folders.`,
      sampleFolders: result.data.files?.slice(0, 3).map(f => f.name) || []
    });

  } catch (error) {
    console.error('Drive test error:', error);
    res.json({ success: false, error: error.message });
  }
});

module.exports = router;
