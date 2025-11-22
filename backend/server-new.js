// server-new.js - FINAL CLOUD & SESSION VERSION

console.log('Starting MCA Command Center Server...');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const session = require('express-session'); // New Session Library
const path = require('path');
require('dotenv').config();

// RSS Parser for News Feed
const Parser = require('rss-parser');
const parser = new Parser();

// Create Express app
const app = express();
const server = http.createServer(app);

// --- TRUST PROXY (Required for Cloud/Load Balancers) ---
app.set('trust proxy', 1);

// --- 1. CLOUD CORS & ORIGIN SETUP ---
// We define allowed origins dynamically so it works on Localhost AND Cloud
const getAllowedOrigins = () => {
    const origins = [
        'http://localhost:3000',
        'http://localhost:8080'
    ];
    // Add Railway/Cloud domains if they exist
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
        origins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
    }
    if (process.env.RAILWAY_STATIC_URL) {
        origins.push(`https://${process.env.RAILWAY_STATIC_URL}`);
    }
    return origins;
};

// --- 2. SOCKET.IO SETUP ---
const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            // Allow requests with no origin (mobile apps, curl)
            if (!origin) return callback(null, true);

            const allowed = getAllowedOrigins();
            // Check if origin matches our allowed list OR is a railway subdomain
            if (allowed.includes(origin) || origin.includes('railway.app') || origin.includes('mcagent.io')) {
                callback(null, true);
            } else {
                console.log('CORS Blocked Socket:', origin);
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
    console.log('✅ Client connected:', socket.id);
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
        if (allowed.includes(origin) || origin.includes('railway.app') || origin.includes('mcagent.io')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

// Handle JSON and File Uploads
app.use((req, res, next) => {
    if (req.get('Content-Type')?.includes('multipart/form-data')) return next();
    return express.json({ limit: '50mb' })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve Static Files (Frontend)
app.use(express.static(path.join(__dirname, '../frontend')));

// --- 4. SESSION AUTHENTICATION (The Fix) ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'mca-secret-key-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Changed to false for Railway SSL handoff compatibility
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
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
        req.session.save();
        return res.json({ success: true });
    }
    return res.status(401).json({ error: 'Invalid credentials' });
});

// LOGOUT Route
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Auth Middleware (Protects the API)
const requireAuth = (req, res, next) => {
    const publicPaths = ['/api/auth/login', '/api/health', '/api/messages/webhook/receive', '/api/news'];

    // 1. Always allow public paths
    if (publicPaths.includes(req.path)) return next();

    // 🚀 LOCAL DEV BYPASS: Allow requests with X-Local-Dev header
    if (req.headers['x-local-dev'] === 'true') {
        console.log('🔓 Local dev bypass enabled for:', req.path);
        return next();
    }

    // 2. Allow if logged in
    if (req.session.isAuthenticated) return next();

    // 3. Allow Document Downloads (Optional - keep if needed for external viewing)
    if (req.path.includes('/documents/view/') || req.path.includes('/download')) return next();

    // 4. Reject API calls
    if (req.path.startsWith('/api')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // 5. Redirect browser requests to Login Page
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

// --- RSS NEWS FEED ENDPOINT ---
app.get('/api/news', async (req, res) => {
    console.log('📰 News Feed Request Received'); // <--- DEBUG LOG
    try {
        const FEED_URL = 'https://news.google.com/rss/search?q=Merchant+Cash+Advance+industry+OR+debanked+when:7d&hl=en-US&gl=US&ceid=US:en';
        const feed = await parser.parseURL(FEED_URL);
        const articles = feed.items.slice(0, 5).map(item => {
            const sourceMatch = item.title.match(/- ([^-]+)$/);
            const source = sourceMatch ? sourceMatch[1] : 'Industry News';
            const titleClean = item.title.replace(/- [^-]+$/, '').trim();

            let type = 'general';
            if (source.toLowerCase().includes('debanked')) type = 'debanked';
            if (source.toLowerCase().includes('funder')) type = 'lender';

            return {
                title: titleClean,
                source: source,
                link: item.link,
                pubDate: item.pubDate, // <--- Raw date for calculations
                date: new Date(item.pubDate).toLocaleDateString(), // Keep for display backup
                type: type
            };
        });

        res.json({ success: true, data: articles });
    } catch (error) {
        console.error('RSS Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch news' });
    }
});

// --- 6. FRONTEND ROUTING ---
// This decides which HTML page to show based on login status
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        if (req.session && req.session.isAuthenticated) {
            // Logged In? Show the App
            res.sendFile(path.join(__dirname, '../frontend/command-center.html'));
        } else {
            // Not Logged In? Show Login Page
            res.sendFile(path.join(__dirname, '../frontend/index.html'));
        }
    }
});

// --- 7. START SERVER ---
const PORT = process.env.PORT || 3000; // Cloud sets PORT, Local uses 3000
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
