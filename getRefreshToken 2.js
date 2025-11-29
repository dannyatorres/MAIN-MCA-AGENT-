const http = require('http');
const url = require('url');
const { exec } = require('child_process');

// 👇 PASTE YOUR NEW CLIENT ID AND SECRET HERE
const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
const CLIENT_SECRET = 'GOCSPX-YOUR_SECRET';

const REDIRECT_URI = 'http://localhost:3000/oauth2callback';
const SCOPES = 'https://www.googleapis.com/auth/cloud-platform';

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}&` +
  `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
  `response_type=code&` +
  `scope=${encodeURIComponent(SCOPES)}&` +
  `access_type=offline&` +
  `prompt=consent`;

console.log('\n🔐 OAuth 2.0 Token Generator for Railway\n');
console.log('📋 If browser doesn\'t open automatically, copy this URL:\n');
console.log(authUrl + '\n');

const server = http.createServer(async (req, res) => {
  const queryParams = url.parse(req.url, true).query;

  if (queryParams.code) {
    console.log('✅ Authorization code received');

    try {
      console.log('🔄 Exchanging code for tokens...');

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
        console.error('\n❌ Token exchange failed:');
        console.error('Error:', tokens.error);
        console.error('Description:', tokens.error_description);
        console.error('\nFull response:', JSON.stringify(tokens, null, 2));

        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: Arial; padding: 40px;">
              <h1 style="color: red;">❌ Token Exchange Failed</h1>
              <p><strong>Error:</strong> ${tokens.error}</p>
              <p><strong>Description:</strong> ${tokens.error_description}</p>
              <p>Check your terminal for details.</p>
            </body>
          </html>
        `);

        setTimeout(() => {
          server.close();
          process.exit(1);
        }, 5000);
        return;
      }

      console.log('\n✅ SUCCESS! Tokens received\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📋 Copy these EXACT values to Railway:\n');
      console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`);
      console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('💡 Access Token (for testing):', tokens.access_token?.substring(0, 40) + '...\n');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1 style="color: green;">✅ Authorization Successful!</h1>
            <p style="font-size: 18px;">Check your terminal for the tokens.</p>
            <p>You can close this window now.</p>
          </body>
        </html>
      `);

      setTimeout(() => {
        console.log('🔒 Closing server...');
        server.close();
        process.exit(0);
      }, 3000);

    } catch (error) {
      console.error('\n❌ Token exchange error:', error.message);
      console.error('Stack:', error.stack);

      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end('<h1>❌ Server Error</h1><p>Check terminal for details</p>');

      setTimeout(() => {
        server.close();
        process.exit(1);
      }, 5000);
    }

  } else if (queryParams.error) {
    console.error('\n❌ Authorization failed:', queryParams.error);
    console.error('Description:', queryParams.error_description);

    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`
      <h1>❌ Authorization Failed</h1>
      <p>${queryParams.error}: ${queryParams.error_description}</p>
    `);

    setTimeout(() => {
      server.close();
      process.exit(1);
    }, 5000);
  }
});

server.listen(3000, () => {
  console.log('🌐 Server running on http://localhost:3000\n');
  console.log('⏳ Waiting for authorization...\n');

  // Try to open browser
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' :
              platform === 'win32' ? 'start' :
              'xdg-open';

  exec(`${cmd} "${authUrl}"`, (error) => {
    if (error) {
      console.log('⚠️  Browser didn\'t open automatically.');
      console.log('Please copy the URL above and paste it in your browser.\n');
    }
  });
});
