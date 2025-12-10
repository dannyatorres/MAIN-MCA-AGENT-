const express = require('express');
const router = express.Router();
const GmailInboxService = require('../services/gmailInboxService');

// Instantiate the service once. It will handle reconnections internally.
const gmail = new GmailInboxService();

// GET /api/email/list - Fetch emails (supports ?limit=20&unreadOnly=true)
router.get('/list', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 50;
        const unreadOnly = req.query.unreadOnly === 'true';

        const emails = await gmail.fetchEmails({ limit, unreadOnly });
        res.json({ success: true, count: emails.length, emails });
    } catch (error) {
        console.error('API Error fetching emails:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/email/search - Search emails (?q=keyword)
router.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) {
            return res.status(400).json({ success: false, error: 'Query parameter \"q\" is required' });
        }

        const emails = await gmail.searchEmails(query);
        res.json({ success: true, count: emails.length, emails });
    } catch (error) {
        console.error('API Error searching emails:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/email/:id/mark-read - Mark specific email as read
router.post('/:id/mark-read', async (req, res) => {
    try {
        const { id } = req.params;
        await gmail.markAsRead(id);
        res.json({ success: true, message: 'Email marked as read' });
    } catch (error) {
        console.error('API Error marking read:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/email/:id/mark-unread - Mark specific email as unread
router.post('/:id/mark-unread', async (req, res) => {
    try {
        const { id } = req.params;
        await gmail.markAsUnread(id);
        res.json({ success: true, message: 'Email marked as unread' });
    } catch (error) {
        console.error('API Error marking unread:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/email/:id - Move email to trash
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await gmail.deleteEmail(id);
        res.json({ success: true, message: 'Email deleted' });
    } catch (error) {
        console.error('API Error deleting email:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/email/unread-count - Get total unread count for badges
router.get('/unread-count', async (req, res) => {
    try {
        const count = await gmail.getUnreadCount();
        res.json({ success: true, count });
    } catch (error) {
        console.error('API Error getting unread count:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
