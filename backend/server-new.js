// server-new.js - FINAL ROOT DOMAIN VERSION (mcagent.io)
console.log('Starting MCA Command Center Server...');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const emailRoutes = require('./routes/emailRoutes');
const { getDatabase } = require('./services/database'); 
require('dotenv').config();

// RSS Parser for News Feed
const Parser = require('rss-parser');
const parser = new Parser();

// Create Express app
const app = express();
const server = http.createServer(app);

// =========================================================
// 🕵️ TROJAN HORSE: Schema Inspector
// URL: https://mcagent.io/api/fix/show-schema
// =========================================================
app.get('/api/fix/show-schema', async (req, res) => {
    try {
        const db = getDatabase();
        console.log('🕵️ Inspecting Database Schema...');

        const result = await db.query(`
            SELECT table_name, column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name IN ('lead_details', 'fcs_analyses')
            ORDER BY table_name, ordinal_position;
        `);

        const schema = {};
        result.rows.forEach(row => {
            if (!schema[row.table_name]) schema[row.table_name] = [];
            schema[row.table_name].push(`${row.column_name} (${row.data_type})`);
        });

        res.json({ success: true, schema });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// =========================================================

// --- TRUST PROXY ---
app.set('trust proxy', 1);

// --- 1. CLOUD CORS & ORIGIN SETUP ---
const getAllowedOrigins = () => {
    const origins = [
        'http://localhost:3000',
        'http://localhost:8080',
        'https://mcagent.io',
        'https://www.mcagent.io'
    ];
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
        origins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
    }
    return origins;
};

// --- 2. SOCKET.IO SETUP ---
const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            const allowed = getAllowedOrigins();
            if (allowed.includes(origin) || origin.endsWith('.mcagent.io') || origin.includes('railway.app')) {
                callback(null, true);
            } else {
                console.warn(`⚠️ CORS Blocked Socket Connection: ${origin}`);
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
});
global.io = io;

io.on('connection', (socket) => {
    socket.on('join_conversation', (id) => {
        socket.join(`conversation_${id}`);
    });
    socket.on('disconnect', () => { /* check disconnect */ });
});

// --- 3. EXPRESS MIDDLEWARE ---
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const allowed = getAllowedOrigins();
        if (allowed.includes(origin) || origin.endsWith('.mcagent.io') || origin.includes('railway.app')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use((req, res, next) => {
    if (req.get('Content-Type')?.includes('multipart/form-data')) return next();
    return express.json({ limit: '50mb' })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(express.static(path.join(__dirname, '../frontend')));

// --- 4. SESSION AUTHENTICATION ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'mca-secret-key-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// LOGIN Route
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'Ronpaul2025!';

    if (username === adminUser && password === adminPass) {
        req.session.isAuthenticated = true;
        req.session.user = username;
        req.session.save((err) => {
            if (err) return res.status(500).json({ error: 'Session save failed' });
            return res.json({ success: true });
        });
    } else {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
});

// LOGOUT Route
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Auth Middleware (Protects the API)
const requireAuth = (req, res, next) => {
    // Log Twilio-related requests to debug auth blocks
    if (req.path.includes('/calling')) {
        console.log(`🔒 Auth Check: ${req.method} ${req.path}`);
    }

    const publicPaths = [
        '/api/auth/login',
        '/api/health',
        '/api/messages/webhook/receive',
        '/api/news',
        '/api/calling/voice',      // Standard
        '/api/calling/voice/',     // Trailing slash for Twilio
        '/api/calling/status',
        '/api/calling/recording-status',
        '/api/contact',
        '/api/agent/trigger'      // Dispatcher AI Agent endpoint
    ];

    // Allow exact matches or any calling webhook paths
    if (publicPaths.includes(req.path) || req.path.startsWith('/api/calling/')) {
        return next();
    }

    if (req.headers['x-local-dev'] === 'true') return next();
    if (req.session && req.session.isAuthenticated) return next();
    if (req.path.includes('/documents/view/') || req.path.includes('/download')) return next();

    if (req.path.startsWith('/api')) {
        console.warn(`⛔ BLOCKED: ${req.method} ${req.path}`);
        return res.status(401).json({ error: 'Unauthorized' });
    }

    res.redirect('/');
};

// Apply Auth Check
app.use(requireAuth);

// --- 5. ROUTES ---
app.use('/api', require('./routes/health'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/fcs', require('./routes/fcs'));
app.use('/api/lenders', require('./routes/lenders'));
app.use('/api/csv-import', require('./routes/csv-import'));
app.use('/api/lookups', require('./routes/lookups'));
app.use('/api/n8n', require('./routes/n8n-integration'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/calling', require('./routes/calling'));
app.use('/api/email', emailRoutes);
app.use('/api/agent', require('./routes/agent')); // AI Agent for Dispatcher

// --- CONTACT FORM ROUTE (LOG ONLY) ---
app.post('/api/contact', (req, res) => {
    const { name, email, message } = req.body;

    console.log('------------------------------------------------');
    console.log('🔔 NEW WEBSITE INQUIRY (Log Only)');
    console.log(`👤 Name: ${name}`);
    console.log(`📧 Email: ${email}`);
    console.log(`📝 Message: ${message}`);
    console.log('------------------------------------------------');

    res.json({ success: true, message: 'Received' });
});

// --- RSS NEWS FEED ENDPOINT ---
app.get('/api/news', async (req, res) => {
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
        let allArticles = results.flat().sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return new Date(b.pubDate) - new Date(a.pubDate);
        });

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

// --- 6. FRONTEND ROUTING ---
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        if (req.session && req.session.isAuthenticated) {
            res.sendFile(path.join(__dirname, '../frontend/command-center.html'));
        } else {
            res.sendFile(path.join(__dirname, '../frontend/index.html'));
        }
    }
});

// --- 8. START BACKGROUND PROCESSORS ---
// ✅ START THE EMAIL PROCESSOR AGENT
try {
    require('./services/processorAgent').startProcessor();
    console.log('✅ Processor Agent Service: INITIALIZED');
} catch (e) {
    console.error('⚠️ Failed to start Processor Agent:', e.message);
}

// --- 7. START SERVER ---
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
