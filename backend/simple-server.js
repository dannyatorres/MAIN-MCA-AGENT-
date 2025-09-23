console.log('🔍 Starting MCA Command Center Server...');
const express = require('express');
const cors = require('cors');

console.log('🔧 Setting up CORS...');
const app = express();
console.log('✅ Express app created');

const corsOptions = {
    origin: ['http://localhost:8080', 'http://localhost:3000', 'http://localhost:8000', 'http://127.0.0.1:8080', 'http://127.0.0.1:8000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        message: 'MCA Command Center Server is running'
    });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`✅ MCA Command Center Server running on port ${PORT}`);
    console.log(`📊 Health Check: http://localhost:${PORT}/health`);
});