console.log('Starting basic HTTP server...');
const http = require('http');

const server = http.createServer((req, res) => {
    console.log('Request:', req.method, req.url);

    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
            status: 'OK',
            timestamp: new Date().toISOString(),
            message: 'Basic HTTP server is running'
        }));
    } else if (req.url === '/api/conversations' && req.method === 'GET') {
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify([
            {
                id: '1',
                business_name: 'Test Business',
                lead_phone: '555-0100',
                state: 'NEW'
            }
        ]));
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(3001, () => {
    console.log('✅ Basic server running on port 3001');
    console.log('📊 Health Check: http://localhost:3001/health');
});