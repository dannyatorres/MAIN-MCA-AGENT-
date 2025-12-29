const express = require('express');
const router = express.Router();
const Parser = require('rss-parser');
const parser = new Parser();

// Cache so you're not hitting deBanked on every page load
let cache = { data: null, timestamp: 0 };
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

router.get('/', async (req, res) => {
    try {
        // Return cache if fresh
        if (cache.data && Date.now() - cache.timestamp < CACHE_DURATION) {
            return res.json({ success: true, data: cache.data });
        }

        const feed = await parser.parseURL('https://debanked.com/feed/');

        const articles = feed.items.slice(0, 25).map(item => ({
            title: item.title,
            link: item.link,
            pubDate: item.pubDate,
            source: 'deBanked',
            icon: 'fa-university',
            snippet: item.contentSnippet || ''
        }));

        cache = { data: articles, timestamp: Date.now() };
        res.json({ success: true, data: articles });

    } catch (error) {
        console.error('RSS Error:', error.message);

        // If fetch fails but we have old cache, use it
        if (cache.data) {
            return res.json({ success: true, data: cache.data });
        }

        res.status(500).json({ success: false, message: 'Feed unavailable' });
    }
});

module.exports = router;
