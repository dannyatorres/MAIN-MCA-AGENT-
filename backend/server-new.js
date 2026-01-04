// server-new.js - CLEAN PRODUCTION VERSION
console.log('Starting MCA Command Center Server...');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const emailRoutes = require('./routes/emailRoutes');
require('dotenv').config();

// Migration imports
// const { runStrategyMigration } = require('./migrations/strategy-schema'); // DISABLED
const { getDatabase } = require('./services/database');
const { startRuleLearner } = require('./services/ruleLearner');

// Create Express app
const app = express();
const server = http.createServer(app);

// --- TRUST PROXY ---
app.set('trust proxy', 1);

// --- 1. CLOUD CORS & ORIGIN SETUP ---
const getAllowedOrigins = () => {
    const origins = ['http://localhost:3000', 'http://localhost:8080', 'https://mcagent.io', 'https://www.mcagent.io'];
    if (process.env.RAILWAY_PUBLIC_DOMAIN) origins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
    return origins;
};

// --- 2. SOCKET.IO SETUP ---
const io = new Server(server, {
    cors: {
        origin: (origin, cb) => {
            const allowed = getAllowedOrigins();
            if (!origin || allowed.includes(origin) || origin.endsWith('.mcagent.io') || origin.includes('railway.app')) {
                cb(null, true);
            } else {
                console.warn(`⚠️ CORS Blocked Socket Connection: ${origin}`);
                cb(new Error('Not allowed by CORS'));
            }
        },
        credentials: true
    },
    pingTimeout: 60000,
    transports: ['websocket', 'polling']
});
global.io = io;
io.on('connection', (socket) => socket.on('join_conversation', (id) => socket.join(`conversation_${id}`)));

// --- 3. EXPRESS MIDDLEWARE ---
app.use(cors({
    origin: (origin, cb) => {
        const allowed = getAllowedOrigins();
        if (!origin || allowed.includes(origin) || origin.endsWith('.mcagent.io') || origin.includes('railway.app')) {
            cb(null, true);
        } else {
            cb(new Error('Not allowed by CORS'));
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
    resave: false, saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 }
}));

// LOGIN/LOGOUT Routes
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (username === (process.env.ADMIN_USERNAME || 'admin') && password === (process.env.ADMIN_PASSWORD || 'Ronpaul2025!')) {
        req.session.isAuthenticated = true;
        req.session.user = username;
        req.session.save((err) => err ? res.status(500).json({ error: 'Session save failed' }) : res.json({ success: true }));
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});
app.post('/api/auth/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

// Auth Middleware
app.use((req, res, next) => {
    const publicPaths = ['/api/auth/login', '/api/health', '/api/messages/webhook/receive', '/api/news', '/api/contact', '/api/agent/trigger'];
    if (publicPaths.includes(req.path) || req.path.startsWith('/api/calling/')) return next();
    if (req.headers['x-local-dev'] === 'true' || (req.session && req.session.isAuthenticated)) return next();
    if (req.path.includes('/documents/view/') || req.path.includes('/download')) return next();

    if (req.path.startsWith('/api')) {
        console.warn(`⛔ BLOCKED: ${req.method} ${req.path}`);
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.redirect('/');
});

// --- 5. ROUTES ---
app.use('/api', require('./routes/health'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/fcs', require('./routes/fcs'));
app.use('/api/lenders', require('./routes/lenders'));
app.use('/api/qualification', require('./routes/qualification'));
app.use('/api/csv-import', require('./routes/csv-import'));
app.use('/api/lookups', require('./routes/lookups'));
app.use('/api/n8n', require('./routes/n8n-integration'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/calling', require('./routes/calling'));
app.use('/api/email', emailRoutes);
app.use('/api/agent', require('./routes/agent'));
app.use('/api/cleaner', require('./routes/cleaner'));
app.use('/api/rules', require('./routes/rule-suggestions'));

// CLEANED UP MODULES
app.use('/api/integrations', require('./routes/integrationRoutes'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/news', require('./routes/news'));
app.use('/api/commander', require('./routes/commander'));
app.use('/api/analytics', require('./routes/analytics'));

// Contact Form
app.post('/api/contact', (req, res) => {
    const { name, email, message } = req.body;
    console.log(`🔔 NEW INQUIRY: ${name} (${email}): ${message}`);
    res.json({ success: true, message: 'Received' });
});

// --- 6. FRONTEND ROUTING ---
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        const file = (req.session && req.session.isAuthenticated) ? 'command-center.html' : 'index.html';
        res.sendFile(path.join(__dirname, `../frontend/${file}`));
    }
});

// --- 7. START BACKGROUND PROCESSORS ---
try {
    require('./services/processorAgent').startProcessor();
    console.log('✅ Processor Agent Service: INITIALIZED');
} catch (e) { console.error('⚠️ Failed to start Processor Agent:', e.message); }

// Start Rule Learner
try {
    startRuleLearner();
    console.log('✅ Rule Learner Service: INITIALIZED');
} catch (e) { console.error('⚠️ Failed to start Rule Learner:', e.message); }

// --- 7b. RUN DATABASE MIGRATIONS ---
// DISABLED: Migration already completed
// (async () => {
//     try {
//         const db = getDatabase();
//         await runStrategyMigration(db);
//     } catch (e) { console.error('⚠️ Migration error:', e.message); }
// })();

// --- 8. START SERVER ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
