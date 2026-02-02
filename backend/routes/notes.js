const express = require('express');
const router = express.Router();
const { getDatabase } = require('../services/database');

// Get notes for a conversation
router.get('/:conversationId', async (req, res) => {
    try {
        const db = getDatabase();
        const { conversationId } = req.params;

        const result = await db.query(`
            SELECT 
                n.*,
                CASE 
                    WHEN n.source = 'email_processor' THEN 'Inbox Bot'
                    WHEN n.created_by IS NULL THEN 'Lola'
                    ELSE u.name
                END as created_by_name
            FROM notes n
            LEFT JOIN users u ON u.id = n.created_by
            WHERE n.conversation_id = $1
            ORDER BY n.created_at ASC
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
        const userName = req.user?.name || 'Lola';

        const result = await db.query(`
            INSERT INTO notes (conversation_id, content, created_by)
            VALUES ($1, $2, $3)
            RETURNING *
        `, [conversationId, content, userId]);

        const note = result.rows[0];
        note.created_by_name = userName;

        const io = req.app.get('io');
        console.log('📝 NOTE SAVED - io exists:', !!io, 'room:', `conversation_${conversationId}`);
        if (io) {
            io.to(`conversation_${conversationId}`).emit('new_note', {
                conversationId,
                note
            });
            console.log('📝 NOTE EMITTED via socket');
        }

        res.json({ success: true, note });
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
