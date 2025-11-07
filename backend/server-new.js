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

// Setup Socket.io
const io = new Server(server, {
    cors: {
        origin: ['http://localhost:8080', 'http://localhost:3000', 'http://localhost:8000'],
        credentials: true
    }
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
const corsOptions = {
    origin: ['http://localhost:8080', 'http://localhost:3000', 'http://localhost:8000'],
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

// Authentication setup
const basicAuth = require('express-basic-auth');

// Authentication middleware
const authenticate = basicAuth({
    users: {
        'admin': process.env.ADMIN_PASSWORD || 'Ronpaul2025!',
        'agent': process.env.AGENT_PASSWORD || 'Ronpaul2025!'
    },
    challenge: true,
    realm: 'MCA Command Center',
    unauthorizedResponse: (req) => {
        return { error: 'Unauthorized - Please login' };
    }
});

// Apply authentication to ALL /api routes EXCEPT:
// - /api/health (Railway needs this for monitoring)
// - /api/messages/webhook/receive (Twilio needs this)
// - /api/documents/view/* (Document preview)
// - /api/documents/download/* (Document download)
// - /api/conversations/*/documents/*/download (Conversation document download)
app.use('/api', (req, res, next) => {
    // Skip auth for health check
    if (req.path === '/health') {
        return next();
    }

    // Skip auth for Twilio webhook
    if (req.path === '/messages/webhook/receive') {
        return next();
    }

    // Skip auth for document viewing/downloading
    if (req.path.startsWith('/documents/view/') ||
        req.path.startsWith('/documents/download/') ||
        req.path.match(/^\/conversations\/[^/]+\/documents\/[^/]+\/download$/)) {
        return next();
    }

    // Everything else requires auth
    return authenticate(req, res, next);
});

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

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 MCA Command Center Server running on port ${PORT}`);
    console.log(`✅ Health check: http://localhost:${PORT}/api/health`);
});
