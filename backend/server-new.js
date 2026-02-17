// server-new.js - CLEAN PRODUCTION VERSION
console.log('Starting MCA Command Center Server...');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const nodemailer = require('nodemailer');
const emailRoutes = require('./routes/emailRoutes');
const usageRoutes = require('./routes/usage');
const notesRoutes = require('./routes/notes');
const GmailInboxService = require('./services/gmailInboxService');
require('dotenv').config();

// Migration imports
// const { runStrategyMigration } = require('./migrations/strategy-schema'); // DISABLED
const { getDatabase } = require('./services/database');
const { startRuleLearner } = require('./services/ruleLearner');
const { updateTrainingOutcomes } = require('./services/outcomeTracker');
const { 
    scheduleDailyAgent,
    generateBrokerBriefing,
    generateOwnerAnalytics,
    buildBrokerActionBriefing 
} = require('./services/dailyAgent');
const { startAgentLoop } = require('./services/aiAgent');
const { startDripLoop } = require('./services/dripCampaign');

// Create Express app
const app = express();
const server = http.createServer(app);
const gmailService = new GmailInboxService();

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
app.set('io', io);
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

// GET /logout - Browser redirect logout (for mobile and direct links)
app.get('/logout', (req, res) => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(req.headers['user-agent']);

    req.session.destroy(() => {
        res.clearCookie('connect.sid');

        if (isMobile) {
            res.redirect('/mobile'); // Will redirect to login since no session
        } else {
            res.redirect('/'); // Goes to index.html (login page)
        }
    });
});

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

// Broker Action Briefing — broker or admin can access
app.get('/api/broker-briefing/:userId', async (req, res) => {
    try {
        const requestingUser = req.user;
        const targetUserId = req.params.userId;
        const dateStr = req.query.date || null;

        // Brokers can only see their own, admin can see anyone
        if (requestingUser.role !== 'admin' && requestingUser.id !== targetUserId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const result = await generateBrokerBriefing(targetUserId, dateStr);
        res.json(result);
    } catch (err) {
        console.error('❌ Broker briefing error:', err);
        res.status(500).json({ error: 'Failed to generate briefing' });
    }
});

// Admin-only Broker Action Briefing
app.get('/api/admin/broker-briefing/:userId', async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin only' });
        }

        const { userId } = req.params;
        const dateStr = req.query.date || null;
        const result = await generateBrokerBriefing(userId, dateStr);
        res.json(result);
    } catch (err) {
        console.error('❌ Admin broker briefing error:', err);
        res.status(500).json({ error: 'Failed to generate briefing' });
    }
});

// Owner Analytics — admin only
app.get('/api/admin/broker-analytics/:userId', async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin only' });
        }

        const { userId } = req.params;
        const { start, end } = req.query;

        if (!start || !end) {
            return res.status(400).json({ error: 'start and end query params required (YYYY-MM-DD)' });
        }

        const result = await generateOwnerAnalytics(userId, start, end);
        res.json(result);
    } catch (err) {
        console.error('❌ Owner analytics error:', err);
        res.status(500).json({ error: 'Failed to generate analytics' });
    }
});

// Send Offer Email (Gmail API)
app.post('/api/send-offer-email', async (req, res) => {
    try {
        const { to, subject, html } = req.body;
        if (!to || !html) {
            return res.status(400).json({ success: false, error: 'Missing to or html' });
        }

        const safeSubject = subject || 'Your Funding Offer - JMS Global';
        await gmailService.sendEmail(to, safeSubject, html);

        res.json({ success: true });
    } catch (err) {
        console.error('❌ Send offer email failed:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Raw briefing data (no Gemini, for quick loading)
app.get('/api/broker-briefing/:userId/raw', async (req, res) => {
    try {
        const requestingUser = req.user;
        const targetUserId = req.params.userId;
        const dateStr = req.query.date || null;

        if (requestingUser.role !== 'admin' && requestingUser.id !== targetUserId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const db = getDatabase();
        const data = await buildBrokerActionBriefing(db, targetUserId, dateStr);
        res.json(data);
    } catch (err) {
        console.error('❌ Raw briefing error:', err);
        res.status(500).json({ error: 'Failed to build briefing data' });
    }
});

// Admin-only Raw Broker Briefing (no Gemini)
app.get('/api/admin/broker-briefing/:userId/raw', async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin only' });
        }

        const { userId } = req.params;
        const dateStr = req.query.date || null;
        const db = getDatabase();
        const data = await buildBrokerActionBriefing(db, userId, dateStr);
        res.json(data);
    } catch (err) {
        console.error('❌ Admin raw briefing error:', err);
        res.status(500).json({ error: 'Failed to build briefing data' });
    }
});

// Admin-only Email Briefing
app.post('/api/admin/email-briefing', async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin only' });
        }

        const { to, brokerName, date, html } = req.body;
        if (!to || !html) {
            return res.status(400).json({ error: 'Missing fields' });
        }

        const subject = `Daily Briefing — ${brokerName || 'Broker'} — ${date || ''}`.trim();
        const emailBody = `
      <div style="font-family: -apple-system, sans-serif; max-width: 700px; margin: 0 auto; background: #0f1115; color: #e6edf3; padding: 32px;">
        <h1 style="font-size: 20px;">Briefing: ${brokerName || 'Broker'}</h1>
        <p style="color: #8b949e;">${date || ''}</p>
        <hr style="border-color: #30363d; margin: 20px 0;">
        ${html}
      </div>`;

        await gmailService.sendEmail(to, subject, emailBody);
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Email briefing error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

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
app.use('/api/notes', notesRoutes);
app.use('/api/agent', require('./routes/agent'));
app.use('/api/cleaner', require('./routes/cleaner'));
app.use('/api/rules', require('./routes/rule-suggestions'));
app.use('/api/dialer', require('./routes/dialer'));
app.use('/api/daily-reports', require('./routes/dailyReports'));

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
app.post('/api/contact', async (req, res) => {
    const { name, email, message } = req.body;
    
    const transporter = nodemailer.createTransport({
        host: 'smtp.office365.com',
        port: 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        },
        tls: {
            ciphers: 'SSLv3'
        }
    });

    try {
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: 'danny@mcagent.io',
            replyTo: email,
            subject: `MCAgent Contact: ${name}`,
            text: `From: ${name} (${email})\n\n${message}`
        });
        console.log(`📬 Contact form sent: ${name} (${email})`);
        res.json({ success: true });
    } catch (err) {
        console.error('Contact form error:', err);
        res.status(500).json({ message: 'Failed to send email' });
    }
});

// --- MOBILE PWA ROUTE (with auto cache-busting) ---
const fs = require('fs');
const MOBILE_VERSION = Date.now(); // Updates on server restart

app.get('/mobile', requireAuth, (req, res) => {
    const htmlPath = path.join(__dirname, '../frontend/mobile.html');

    fs.readFile(htmlPath, 'utf8', (err, html) => {
        if (err) {
            console.error('Failed to load mobile.html:', err);
            return res.status(500).send('Error loading mobile app');
        }

        // Replace all ?v=XXXX with current version
        const updatedHtml = html.replace(/\?v=\d+/g, `?v=${MOBILE_VERSION}`);

        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Content-Type', 'text/html');
        res.send(updatedHtml);
    });
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

// Start Daily Operations Agent (10pm ET)
try {
    scheduleDailyAgent();
    console.log('✅ Daily Operations Agent: SCHEDULED');
} catch (e) { console.error('⚠️ Failed to schedule Daily Agent:', e.message); }

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
startAgentLoop(30000);
startDripLoop(30000);
