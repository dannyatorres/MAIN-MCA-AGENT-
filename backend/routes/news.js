const express = require('express');
const router = express.Router();
const Parser = require('rss-parser');
const parser = new Parser();

router.get('/', async (req, res) => {
    try {
        const sources = [
            { url: 'https://debanked.com/feed/', tag: 'deBanked', icon: 'fa-university', priority: 1 },
            { url: 'https://www.lendsaas.com/category/mca-industry-news/feed/', tag: 'LendSaaS', icon: 'fa-microchip', priority: 2 },
            { url: 'https://news.google.com/rss/search?q=\"Merchant+Cash+Advance\"+OR+\"Revenue+Based+Financing\"+when:7d&hl=en-US&gl=US&ceid=US:en', tag: 'Industry', icon: 'fa-rss', priority: 3 },
            { url: 'https://news.google.com/rss/search?q=\"FTC\"+AND+\"Small+Business+Lending\"+when:14d&hl=en-US&gl=US&ceid=US:en', tag: 'Legal', icon: 'fa-balance-scale', priority: 4 }
        ];

        const feedPromises = sources.map(async (source) => {
            try {
                const feed = await Promise.race([
                    parser.parseURL(source.url),
                    new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 5000))
                ]);
                return feed.items.map(item => ({
                    title: item.title.replace(/- [^-]+$/, '').trim(),
                    link: item.link,
                    pubDate: item.pubDate,
                    source: source.tag,
                    icon: source.icon,
                    priority: source.priority,
                    snippet: item.contentSnippet || ''
                }));
            } catch (err) { return []; }
        });

        const results = await Promise.all(feedPromises);
        let allArticles = results.flat().sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

        // Deduplicate
        const seen = new Set();
        const unique = allArticles.filter(item => {
            const sig = item.title.toLowerCase().substring(0, 20);
            if (seen.has(sig)) return false;
            seen.add(sig);
            return true;
        });

        res.json({ success: true, data: unique.slice(0, 25) });
    } catch (error) {
        console.error('RSS Error:', error);
        res.status(500).json({ success: false, message: 'Wire sync failed' });
    }
});

module.exports = router;
