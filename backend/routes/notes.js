const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');

// Get notes for a conversation
router.get('/:conversationId', async (req, res) => {
    try {
        const db = getDatabase();
        const { conversationId } = req.params;

        const result = await db.query(`
            SELECT n.*, u.name as created_by_name
            FROM notes n
            LEFT JOIN users u ON n.created_by = u.id
            WHERE n.conversation_id = $1
            ORDER BY n.created_at DESC
        `, [conversationId]);

        res.json({ success: true, notes: result.rows });
    } catch (err) {
        console.error('Error fetching notes:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Add a note
router.post('/:conversationId', async (req, res) => {
    try {
        const db = getDatabase();
        const { conversationId } = req.params;
        const { content } = req.body;
        const userId = req.user?.id || null;

        const result = await db.query(`
            INSERT INTO notes (conversation_id, content, created_by)
            VALUES ($1, $2, $3)
            RETURNING *
        `, [conversationId, content, userId]);

        res.json({ success: true, note: result.rows[0] });
    } catch (err) {
        console.error('Error saving note:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Delete a note
router.delete('/:noteId', async (req, res) => {
    try {
        const db = getDatabase();
        const { noteId } = req.params;

        await db.query('DELETE FROM notes WHERE id = $1', [noteId]);

        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting note:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
