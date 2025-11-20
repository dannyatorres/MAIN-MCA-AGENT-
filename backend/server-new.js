// server-new.js - MAIN FILE (This starts everything)
// This is the NEW modular version - we'll test it before replacing server.js

console.log('Starting MCA Command Center Server (NEW MODULAR VERSION)...');

// Load dependencies
console.log('Loading express...');
const express = require('express');
console.log('✅ express loaded');

console.log('Loading http...');
const http = require('http');
console.log('✅ http loaded');

console.log('Loading socket.io...');
const { Server } = require('socket.io');
console.log('✅ socket.io loaded');

console.log('Loading cors...');
const cors = require('cors');
console.log('✅ cors loaded');

console.log('Loading dotenv...');
require('dotenv').config();
console.log('✅ dotenv loaded');

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Setup Socket.io with improved timeout settings for Railway stability
const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            // Allow same origins as Express CORS
            if (!origin) return callback(null, true);
            // ✅ FIX: Added 'mcagent.io' to the allow list
            if (origin.includes('localhost') || origin.includes('railway.app') || origin.includes('mcagent.io')) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true
    },
    // Timeout settings for better Railway stability
    pingTimeout: 60000,      // How long to wait for ping response (60s)
    pingInterval: 25000,     // How often to send ping (25s)
    upgradeTimeout: 30000,   // Time to wait for upgrade (30s)
    transports: ['websocket', 'polling']  // Support both transports
});

// Make io available globally for routes to use
global.io = io;

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);

    socket.on('join_conversation', (conversationId) => {
        socket.join(`conversation_${conversationId}`);
        console.log(`User joined conversation: ${conversationId}`);
    });

    socket.on('disconnect', () => {
        console.log('❌ Client disconnected:', socket.id);
    });
});

// CORS configuration
const allowedOrigins = [
    'http://localhost:8080',
    'http://localhost:3000',
    'http://localhost:8000'
];

// Add Railway domain if deployed
if (process.env.RAILWAY_STATIC_URL) {
    allowedOrigins.push(`https://${process.env.RAILWAY_STATIC_URL}`);
}
if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    allowedOrigins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
}

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);

        // ✅ FIX: Added 'mcagent.io' to the allow list
        if (allowedOrigins.includes(origin) || origin.includes('railway.app') || origin.includes('mcagent.io')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// JSON parsing middleware
app.use((req, res, next) => {
    const contentType = req.get('Content-Type') || '';
    if (contentType.includes('multipart/form-data')) {
        return next();
    }
    return express.json({ limit: '50mb' })(req, res, next);
});

app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Import routes
console.log('Loading health routes...');
const healthRoutes = require('./routes/health');

console.log('Loading conversation routes...');
const conversationRoutes = require('./routes/conversations');

console.log('Loading message routes...');
const messageRoutes = require('./routes/messages');

console.log('Loading document routes...');
const documentRoutes = require('./routes/documents');

console.log('Loading fcs routes...');
const fcsRoutes = require('./routes/fcs');

console.log('Loading lender routes...');
const lenderRoutes = require('./routes/lenders');

console.log('Loading csv-import routes...');
const csvImportRoutes = require('./routes/csv-import');

console.log('Loading lookups routes...');
const lookupsRoutes = require('./routes/lookups');

console.log('Loading n8n routes...');
const n8nRoutes = require('./routes/n8n-integration');

console.log('Loading ai routes...');
const aiRoutes = require('./routes/ai');

console.log('✅ All routes loaded successfully!');

// --- SESSION-BASED AUTHENTICATION SETUP ---
const session = require('express-session');

// 1. Configure Session Middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'mca-secret-key-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true if using HTTPS in production
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// 2. Create the Login Route
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'Ronpaul2025!';

    if (username === adminUser && password === adminPass) {
        req.session.isAuthenticated = true;
        req.session.user = username;
        req.session.save(() => {
            return res.json({ success: true });
        });
    } else {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
});

// 3. Create the Logout Route
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// 4. The Middleware to Protect Routes
const requireAuth = (req, res, next) => {
    console.log('🔐 Auth check for:', req.method, req.path, '| Authenticated:', req.session?.isAuthenticated);

    // Allow public endpoints
    const publicPaths = [
        '/api/auth/login',
        '/api/health',
        '/api/messages/webhook/receive'
    ];

    if (publicPaths.includes(req.path)) {
        console.log('✅ Public endpoint, skipping auth');
        return next();
    }

    // Allow document viewing/downloading
    if (req.path.startsWith('/api/documents/view/') ||
        req.path.startsWith('/api/documents/download/') ||
        req.path.match(/^\/api\/conversations\/[^/]+\/documents\/[^/]+\/download$/)) {
        console.log('✅ Document route, skipping auth');
        return next();
    }

    // Check if user is authenticated
    if (req.session.isAuthenticated) {
        return next();
    }

    // If accessing API without login -> 401
    if (req.path.startsWith('/api')) {
        console.log('❌ Unauthorized API access');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // If accessing pages without login -> Redirect to login
    console.log('❌ Unauthorized page access, redirecting to login');
    return res.redirect('/');
};

// Apply Auth Middleware globally
app.use(requireAuth);

// Serve static frontend files
const path = require('path');
app.use(express.static(path.join(__dirname, '../frontend')));

// Mount routes
app.use('/api', healthRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/fcs', fcsRoutes);
app.use('/api/lenders', lenderRoutes);
app.use('/api/csv-import', csvImportRoutes);
app.use('/api/lookups', lookupsRoutes);
app.use('/api/n8n', n8nRoutes);
app.use('/api/ai', aiRoutes);

// Catch-all route for SPA
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        if (req.session && req.session.isAuthenticated) {
            // If logged in, show the command center
            if (req.path === '/' || req.path === '/index.html') {
                res.redirect('/command-center.html');
            } else {
                res.sendFile(path.join(__dirname, '../frontend/command-center.html'));
            }
        } else {
            // If NOT logged in, show the login page
            res.sendFile(path.join(__dirname, '../frontend/index.html'));
        }
    }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 MCA Command Center Server running on port ${PORT}`);
    console.log(`✅ Health check: http://localhost:${PORT}/api/health`);
});
