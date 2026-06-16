const fs = require('fs');
const http = require('http');
const path = require('path');
const { google } = require('googleapis');

const credentialsPath = path.resolve(__dirname, '../google-oauth-client.json');
const tokenPath = path.resolve(__dirname, '../google-drive-token.json');
const port = Number(process.env.GOOGLE_AUTH_PORT || 53682);
const redirectUri = `http://localhost:${port}/oauth2callback`;

if (!fs.existsSync(credentialsPath)) {
  console.error(`Missing credentials file: ${credentialsPath}`);
  process.exit(1);
}

const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
const clientConfig = credentials.installed || credentials.web;

if (!clientConfig?.client_id || !clientConfig?.client_secret) {
  console.error('Invalid OAuth client JSON. Expected installed.client_id and installed.client_secret.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  clientConfig.client_id,
  clientConfig.client_secret,
  redirectUri
);

const scopes = ['https://www.googleapis.com/auth/drive.file'];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: scopes,
});

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, redirectUri);
    if (url.pathname !== '/oauth2callback') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const code = url.searchParams.get('code');
    if (!code) {
      throw new Error(url.searchParams.get('error') || 'Missing authorization code');
    }

    const { tokens } = await oauth2Client.getToken(code);
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>AIO System Backup authorization complete</h1><p>You can close this tab and return to Codex.</p>');
    console.log(`TOKEN_SAVED=${tokenPath}`);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Authorization failed: ${err.message}`);
    console.error(err);
  } finally {
    server.close(() => process.exit(0));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`AUTH_URL=${authUrl}`);
  console.log(`CALLBACK_URL=${redirectUri}`);
});
