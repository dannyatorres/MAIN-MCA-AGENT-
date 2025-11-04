// server-new.js - MAIN FILE (This starts everything)
// This is the NEW modular version - we'll test it before replacing server.js

console.log('Starting MCA Command Center Server (NEW MODULAR VERSION)...');

// Load dependencies
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

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
const healthRoutes = require('./routes/health');
const conversationRoutes = require('./routes/conversations');
const messageRoutes = require('./routes/messages');
const documentRoutes = require('./routes/documents');
const fcsRoutes = require('./routes/fcs');
const lenderRoutes = require('./routes/lenders');
const csvImportRoutes = require('./routes/csv-import');
const lookupsRoutes = require('./routes/lookups');
const n8nRoutes = require('./routes/n8n-integration');
const aiRoutes = require('./routes/ai');

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
