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
            WHERE table_name IN ('lead_details', 'fcs_analyses', 'lenders', 'lender_submissions')
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

// =========================================================
// 🕵️ TROJAN HORSE: Add CC Email Column & Show Schema
// URL: https://mcagent.io/api/fix/lender-update
// =========================================================
app.get('/api/fix/lender-update', async (req, res) => {
    try {
        const db = getDatabase();
        console.log('🕵️ Updating Lenders Table...');

        // 1. Add the 'cc_email' column if it doesn't exist
        // We use TEXT so you can store multiple emails like "abc@test.com, xyz@test.com"
        await db.query(`
            ALTER TABLE lenders
            ADD COLUMN IF NOT EXISTS cc_email TEXT;
        `);

        // 2. Fetch the updated schema to prove it's there
        const result = await db.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'lenders'
            ORDER BY ordinal_position;
        `);

        res.json({
            success: true,
            message: "✅ Column 'cc_email' exists/added successfully.",
            columns: result.rows.map(r => `${r.column_name} (${r.data_type})`)
        });

    } catch (error) {
        console.error("Trojan Horse Failed:", error);
        res.status(500).json({ error: error.message });
    }
});
// =========================================================

// =========================================================
// 🕵️ TROJAN HORSE: FCS Schema Inspector
// URL: https://mcagent.io/api/fix/fcs-schema
// =========================================================
app.get('/api/fix/fcs-schema', async (req, res) => {
    try {
        const db = getDatabase();
        console.log('🕵️ Inspecting FCS Schema...');

        // Get column info
        const schemaResult = await db.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'fcs_analyses'
            ORDER BY ordinal_position;
        `);

        // Get a sample row
        const sampleResult = await db.query(`
            SELECT * FROM fcs_analyses
            ORDER BY created_at DESC
            LIMIT 1
        `);

        res.json({
            success: true,
            columns: schemaResult.rows.map(r => `${r.column_name} (${r.data_type})`),
            sample_row: sampleResult.rows[0] || 'No data yet'
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// =========================================================

// =========================================================
// 🚀 BULK LENDER IMPORT
// URL: https://mcagent.io/api/fix/bulk-import-lenders
// =========================================================
app.get('/api/fix/bulk-import-lenders', async (req, res) => {
    try {
        const db = getDatabase();
        console.log('🚀 Bulk importing lenders...');

        const lenders = [
            { name: 'App Funding', email: 'Subs@appfunding.com', cc_email: 'Peter@appfunding.com,Ben@appfunding.com,david@appfunding.com' },
            { name: 'BizFund', email: 's.anz@bizfund.com', cc_email: '' },
            { name: 'Blackbridge Investment Group', email: 'subs@bbigm.com', cc_email: '' },
            { name: 'Capitalize', email: 'subs@capitalizegroup.com', cc_email: 'isaac@capitalizegroup.com' },
            { name: 'Capybara Capital', email: 'Deals@capybarausa.com', cc_email: 'jc@capybarausa.com,marcus@capybarausa.com' },
            { name: 'Credia Capital', email: 'submissions@crediacapital.com', cc_email: '' },
            { name: 'CFG', email: 'ISOEmail@CFGMS.Com', cc_email: 'aisakov@cfgms.com' },
            { name: 'Diamond Advances', email: 'Newdeals@diamondadvances.com', cc_email: 'Justin@diamondadvances.com' },
            { name: 'eFinancial Tree', email: 'submissions@efinancialtree.com', cc_email: 'craig@efinancialtree.com' },
            { name: 'Elevate Funding', email: 'newdeals@elevatefunding.com', cc_email: '' },
            { name: 'Emmy Capital Group', email: 'processing@emmycapitalgroup.com', cc_email: 'john@emmycapitalgroup.com,william@emmycapitalgroup.com,uw@emmycapitalgroup.com' },
            { name: 'Essential Funding Group', email: 'submissions@myessentialfunding.com', cc_email: 'rkim@myessentialfunding.com' },
            { name: 'Fintap', email: 'Submissions@FinTap.com', cc_email: 'ASilverstein@FinTap.com' },
            { name: 'Fox Business Fund', email: 'underwriting@foxbusinessfunding.com', cc_email: 'goldie@foxbusinessfunding.com' },
            { name: 'Fundkite', email: 'submissions@fundkite.com', cc_email: '' },
            { name: 'Fundworks', email: 'newdeals@thefundworks.com', cc_email: 'jlee@thefundworks.com' },
            { name: 'Instagreen Capital', email: 'isabel@instagreencapital.com', cc_email: 'submit@instagreencapital.com' },
            { name: 'Kalamata Capital Group', email: 'deals@kalamatacapitalgroup.com', cc_email: 'amy.erlich@kalamatacapitalgroup.com' },
            { name: 'Lendbug', email: 'iso@lendbug.com', cc_email: 'newdeals@lendbug.com' },
            { name: 'Lendini', email: 'submissions@lendini.com', cc_email: 'gianna.simmers@fundingmetrics.com' },
            { name: 'Merchant Marketplace', email: 'deals@merchantmarketplace.com', cc_email: 'Paul@merchantmarketplace.com' },
            { name: 'Mercury Funding', email: 'sara@mercuryfundingllc.com', cc_email: 'subs@mercuryfundingllc.com' },
            { name: 'Mint Funding', email: 'rafael@mintfunding.com', cc_email: 'deals@mintfunding.com' },
            { name: 'Mr Advance', email: 'avi@mradvancellc.com', cc_email: '' },
            { name: 'Nationwide Capital Solutions', email: 'tony@nationwidecapitalsolution.com', cc_email: '' },
            { name: 'Newport Business Capital', email: 'submissions@newportbc.com', cc_email: '' },
            { name: 'Pinnacle Business Funding', email: 'submissions@pbffunding.com', cc_email: 'brandon@pbffunding.com' },
            { name: 'PDM Capital', email: 'Submissions@pdmcapital.com', cc_email: '' },
            { name: 'Simply Funding', email: 'Submissions@simplyfunding.com', cc_email: '' },
            { name: 'SWIFT FUNDING SOURCE', email: 'submissions@swiftfundingsource.com', cc_email: 'mf@swiftfundingsource.com' },
            { name: 'The Smarter Merchant', email: 'submissions@thesmartermerchant.com', cc_email: 'ari@thesmartermerchant.com' },
            { name: 'Trust Capital Funding', email: 'newdeals@trustcapitalfunding.com', cc_email: '' },
            { name: 'UFS', email: 'autosubs@ufsfunding.com', cc_email: 'ari@ufsfunding.com,subs@ufsfunding.com' },
            { name: 'UFS (Texas)', email: 'ari@trupathlend.com', cc_email: '' },
            { name: 'Velocity Capital Group', email: 'subs@velocitycg.com', cc_email: 'Shensky@velocitycg.com' },
            { name: 'Vital Cap', email: 'submissions@vitalcapfund.com', cc_email: 'mary.sheprow@vitalcapfund.com' },
            { name: 'Wall Funding', email: 'iso@wallfunding.com', cc_email: 'stephen@wallfunding.com' },
            { name: 'Westwood Funding', email: 'subs@masoncapitalfp.com', cc_email: '' }
        ];

        let inserted = 0;
        let skipped = 0;
        const errors = [];

        for (const lender of lenders) {
            try {
                // Check if lender already exists
                const existing = await db.query(
                    'SELECT id FROM lenders WHERE LOWER(name) = LOWER($1) OR LOWER(email) = LOWER($2)',
                    [lender.name, lender.email]
                );

                if (existing.rows.length > 0) {
                    skipped++;
                    continue;
                }

                // Insert new lender
                await db.query(
                    'INSERT INTO lenders (name, email, cc_email, created_at) VALUES ($1, $2, $3, NOW())',
                    [lender.name, lender.email, lender.cc_email || null]
                );
                inserted++;
            } catch (err) {
                errors.push({ name: lender.name, error: err.message });
            }
        }

        res.json({
            success: true,
            message: `Bulk import complete: ${inserted} inserted, ${skipped} skipped`,
            inserted,
            skipped,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('Bulk import failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// =========================================================
// 🧠 COMMANDER: Create lead_strategy Table
// URL: https://mcagent.io/api/fix/create-lead-strategy
// =========================================================
app.get('/api/fix/create-lead-strategy', async (req, res) => {
    try {
        const db = getDatabase();
        console.log('🧠 Creating lead_strategy table...');

        // Create the table
        await db.query(`
            CREATE TABLE IF NOT EXISTS lead_strategy (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,

                -- Commander's Analysis
                lead_grade VARCHAR(1),
                strategy_type VARCHAR(50),

                -- The Game Plan (JSON)
                game_plan JSONB,

                -- Offer tracking
                offer_amount INTEGER,
                offer_generated_at TIMESTAMP,
                offer_sent_at TIMESTAMP,

                -- Timestamps
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),

                -- One strategy per lead
                CONSTRAINT unique_conversation_strategy UNIQUE (conversation_id)
            );
        `);

        // Create index for faster lookups
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_lead_strategy_conversation
            ON lead_strategy(conversation_id);
        `);

        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_lead_strategy_grade
            ON lead_strategy(lead_grade);
        `);

        // Verify it was created
        const result = await db.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'lead_strategy'
            ORDER BY ordinal_position;
        `);

        res.json({
            success: true,
            message: "✅ lead_strategy table created successfully",
            columns: result.rows.map(r => `${r.column_name} (${r.data_type})`)
        });

    } catch (error) {
        console.error("❌ Migration Failed:", error);
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
