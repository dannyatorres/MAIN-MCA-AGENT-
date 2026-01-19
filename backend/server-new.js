// server-new.js - CLEAN PRODUCTION VERSION
console.log('Starting MCA Command Center Server...');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const emailRoutes = require('./routes/emailRoutes');
const usageRoutes = require('./routes/usage');
require('dotenv').config();

// Migration imports
// const { runStrategyMigration } = require('./migrations/strategy-schema'); // DISABLED
const { getDatabase } = require('./services/database');
const { startRuleLearner } = require('./services/ruleLearner');
const { updateTrainingOutcomes } = require('./services/outcomeTracker');

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

// --- 4. SESSION WITH POSTGRESQL STORE ---
app.use(session({
    store: new pgSession({
        pool: getDatabase(),
        tableName: 'session',
        createTableIfMissing: false
    }),
    secret: process.env.SESSION_SECRET || 'mca-secret-key-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// --- 4b. AUTH MIDDLEWARE ---
const { attachUser, requireAuth } = require('./middleware/auth');
const { runMorningFollowUp } = require('./services/morningFollowUp');
app.use(attachUser);

// Auth routes (BEFORE requireAuth - these are public)
app.use('/api/auth', require('./routes/auth'));

// Internal API endpoints (no user auth, uses secret key)
app.post('/api/agent/morning-followup', async (req, res) => {
    const secret = req.headers['x-internal-secret'];
    if (secret !== process.env.INTERNAL_API_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('🌅 Morning follow-up triggered');
    try {
        const result = await runMorningFollowUp();
        return res.json({ success: true, ...result });
    } catch (err) {
        console.error('Morning follow-up error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Apply auth check to all other routes
app.use(requireAuth);

// User management (admin only)
app.use('/api/users', require('./routes/users'));

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
app.use('/api/dialer', require('./routes/dialer'));

// CLEANED UP MODULES
app.use('/api/integrations', require('./routes/integrationRoutes'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/news', require('./routes/news'));
app.use('/api/commander', require('./routes/commander'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/usage', usageRoutes);
app.use('/api/strategies', require('./routes/strategies'));
app.use('/api/submissions', require('./routes/submissions'));
app.use('/api/formatter', require('./routes/lead-formatter'));

// Contact Form
app.post('/api/contact', (req, res) => {
    const { name, email, message } = req.body;
    console.log(`🔔 NEW INQUIRY: ${name} (${email}): ${message}`);
    res.json({ success: true, message: 'Received' });
});

// --- MOBILE PWA ROUTE ---
app.get('/mobile', requireAuth, (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, '../frontend/mobile.html'));
});

// --- 6. FRONTEND ROUTING ---
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        const file = req.user ? 'command-center.html' : 'index.html';
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

// Update training outcomes every 6 hours
setInterval(() => {
    updateTrainingOutcomes();
}, 6 * 60 * 60 * 1000);

// Also run once on startup (after 1 minute delay)
setTimeout(() => {
    updateTrainingOutcomes();
}, 60 * 1000);

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
