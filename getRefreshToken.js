const http = require('http');
const url = require('url');
const { exec } = require('child_process');

// 👇 PASTE YOUR VALUES HERE (from Google Cloud Console)
const CLIENT_ID = 'PASTE_YOUR_CLIENT_ID_HERE';
const CLIENT_SECRET = 'PASTE_YOUR_CLIENT_SECRET_HERE';

const REDIRECT_URI = 'http://localhost:3000/oauth2callback';
const SCOPES = 'https://www.googleapis.com/auth/cloud-platform';

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}&` +
  `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
  `response_type=code&` +
  `scope=${encodeURIComponent(SCOPES)}&` +
  `access_type=offline&` +
  `prompt=consent`;

console.log('\n🔐 OAuth 2.0 Token Generator\n');
console.log('📋 If browser doesn\'t open, copy this URL:\n');
console.log(authUrl + '\n');

const server = http.createServer(async (req, res) => {
  const queryParams = url.parse(req.url, true).query;

  if (queryParams.code) {
    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: queryParams.code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code'
        })
      });

      const tokens = await tokenResponse.json();

      if (tokens.error) {
        console.error('\n❌ Error:', tokens.error, '-', tokens.error_description);
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h1>Error: ${tokens.error}</h1>`);
        server.close();
        return;
      }

      console.log('\n✅ SUCCESS! Copy these to Railway:\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`);
      console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1 style="color: green;">✅ Success!</h1>
            <p>Check your terminal for the tokens.</p>
            <p>You can close this window.</p>
          </body>
        </html>
      `);

      setTimeout(() => {
        server.close();
        process.exit(0);
      }, 2000);

    } catch (error) {
      console.error('\n❌ Error:', error.message);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end('<h1>Server Error</h1>');
      server.close();
    }
  }
});

server.listen(3000, () => {
  console.log('🌐 Server running on http://localhost:3000\n');

  // Auto-open browser
  const cmd = process.platform === 'darwin' ? 'open' :
              process.platform === 'win32' ? 'start' :
              'xdg-open';
  exec(`${cmd} "${authUrl}"`);
});
