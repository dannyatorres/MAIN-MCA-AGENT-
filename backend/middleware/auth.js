// backend/middleware/auth.js
const { getDatabase } = require('../services/database');

// Attach full user object to request
async function attachUser(req, res, next) {
  if (req.session?.userId) {
    try {
      const db = getDatabase();
      const result = await db.query(
        'SELECT id, email, username, name, role, is_active FROM users WHERE id = $1',
        [req.session.userId]
      );
      if (result.rows.length > 0 && result.rows[0].is_active) {
        req.user = result.rows[0];
      } else {
        // User not found or inactive - clear session
        req.session.destroy();
      }
    } catch (err) {
      console.error('Error attaching user:', err);
    }
  }
  next();
}

// Check if user is authenticated
function requireAuth(req, res, next) {
  const publicPaths = [
    '/api/auth/login',
    '/api/auth/logout',
    '/api/health',
    '/api/messages/webhook/receive',
    '/api/news',
    '/api/contact',
    '/api/agent/trigger'
  ];

  // Allow public paths
  if (publicPaths.includes(req.path)) return next();

  // Allow calling routes
  if (req.path.startsWith('/api/calling/')) return next();

  // Allow document viewing
  if (req.path.includes('/documents/view/') || req.path.includes('/download')) return next();

  // Local dev bypass
  if (req.headers['x-local-dev'] === 'true') return next();

  // Check authentication
  if (req.user) return next();

  // Not authenticated
  if (req.path.startsWith('/api')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.redirect('/');
}

// Check if user has required role(s)
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden - insufficient permissions' });
    }

    next();
  };
}

module.exports = { attachUser, requireAuth, requireRole };
