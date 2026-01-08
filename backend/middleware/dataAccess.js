// backend/middleware/dataAccess.js
const { getDatabase } = require('../services/database');

/**
 * Build WHERE clause for conversation access based on user role
 * @param {object} user - req.user object
 * @param {string} tableAlias - optional table alias (e.g., 'c' for 'c.id')
 * @returns {object} { clause: string, params: array, paramOffset: number }
 */
function getConversationAccessClause(user, tableAlias = '') {
  const prefix = tableAlias ? `${tableAlias}.` : '';

  if (user.role === 'admin') {
    return { clause: '1=1', params: [], paramOffset: 0 };
  }

  // Non-admins see: created by them OR assigned to them
  return {
    clause: `(${prefix}created_by_user_id = $1 OR ${prefix}assigned_user_id = $1)`,
    params: [user.id],
    paramOffset: 1
  };
}

/**
 * Check if user can access a specific conversation
 * @param {string} conversationId
 * @param {object} user - req.user object
 * @returns {Promise<boolean>}
 */
async function canAccessConversation(conversationId, user) {
  if (user.role === 'admin') return true;

  const db = getDatabase();
  const result = await db.query(
    `SELECT id FROM conversations
     WHERE id = $1 AND (created_by_user_id = $2 OR assigned_user_id = $2)`,
    [conversationId, user.id]
  );

  return result.rows.length > 0;
}

/**
 * Middleware to verify conversation access
 * Use on routes with :id or :conversationId param
 */
function requireConversationAccess(paramName = 'id') {
  return async (req, res, next) => {
    const conversationId = req.params[paramName];

    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID required' });
    }

    try {
      const hasAccess = await canAccessConversation(conversationId, req.user);

      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this conversation' });
      }

      next();
    } catch (error) {
      console.error('Error checking conversation access:', error);
      res.status(500).json({ error: 'Failed to verify access' });
    }
  };
}

/**
 * Check if user can modify (not just view)
 * Viewers cannot modify
 */
function requireModifyPermission(req, res, next) {
  if (req.user.role === 'viewer') {
    return res.status(403).json({ error: 'Viewers cannot modify data' });
  }
  next();
}

module.exports = {
  getConversationAccessClause,
  canAccessConversation,
  requireConversationAccess,
  requireModifyPermission
};
