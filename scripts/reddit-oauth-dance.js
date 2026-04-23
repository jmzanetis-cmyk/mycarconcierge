#!/usr/bin/env node
// ============================================================================
// Reddit OAuth Dance — one-shot helper to mint a permanent refresh token.
//
// Usage:
//   1. At https://www.reddit.com/prefs/apps create a "web app" (NOT "script").
//      Set redirect URI to exactly:  http://localhost:8765/callback
//   2. Set env vars (or edit the constants below):
//        export REDDIT_CLIENT_ID=xxx
//        export REDDIT_CLIENT_SECRET=yyy
//        export REDDIT_USER_AGENT="MyCarConcierge/1.0 by u/your_handle"
//   3. node scripts/reddit-oauth-dance.js
//   4. Open the printed URL in a browser, log in to the Reddit account that
//      will own the posts (probably u/your_handle), click "Allow".
//   5. The script captures the callback, exchanges the code, and prints the
//      REFRESH TOKEN. Paste it into Replit Secrets as REDDIT_REFRESH_TOKEN.
//
// Scopes requested: identity, read, submit, edit, history.
// duration=permanent  →  refresh token never expires (until you revoke it).
// ============================================================================

const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = 8765;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET;
const USER_AGENT = process.env.REDDIT_USER_AGENT || 'MyCarConcierge/1.0 (oauth-dance)';
const SCOPES = 'identity read submit edit history';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\nERROR: Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET first.\n');
  console.error('  export REDDIT_CLIENT_ID=...');
  console.error('  export REDDIT_CLIENT_SECRET=...');
  console.error('  export REDDIT_USER_AGENT="MyCarConcierge/1.0 by u/your_handle"\n');
  process.exit(1);
}

const state = crypto.randomBytes(16).toString('hex');
const authUrl = new URL('https://www.reddit.com/api/v1/authorize');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('state', state);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('duration', 'permanent');
authUrl.searchParams.set('scope', SCOPES);

async function exchangeCode(code) {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI
  }).toString();
  const r = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT
    },
    body
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Token exchange ${r.status}: ${text}`);
  return JSON.parse(text);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  if (u.pathname !== '/callback') {
    res.writeHead(404).end('Not found');
    return;
  }
  const err = u.searchParams.get('error');
  const code = u.searchParams.get('code');
  const gotState = u.searchParams.get('state');

  if (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end(`Reddit returned error: ${err}`);
    console.error('\nReddit returned error:', err);
    process.exit(1);
  }
  if (gotState !== state) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end('state mismatch');
    console.error('\nstate mismatch — possible CSRF, aborting.');
    process.exit(1);
  }
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end('missing code');
    process.exit(1);
  }

  try {
    const tok = await exchangeCode(code);
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(
      `<h1>OK — refresh token captured.</h1>
       <p>Return to your terminal. You can close this tab.</p>`
    );
    console.log('\n========================================================');
    console.log('SUCCESS. Token response:');
    console.log('--------------------------------------------------------');
    console.log('access_token  :', tok.access_token?.slice(0, 12) + '…');
    console.log('refresh_token :', tok.refresh_token);
    console.log('expires_in    :', tok.expires_in, 'sec');
    console.log('scope         :', tok.scope);
    console.log('========================================================');
    console.log('\nNEXT STEP: paste the refresh_token above into Replit Secrets:');
    console.log('  Key:   REDDIT_REFRESH_TOKEN');
    console.log('  Value: <the refresh_token above>\n');
    console.log('Then verify by re-running the smoke test:');
    console.log('  node _smoke-test.js\n');
    server.close();
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' }).end(String(e.message));
    console.error('\nExchange failed:', e.message);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log('\nReddit OAuth dance — listening on', REDIRECT_URI);
  console.log('\n>>> Open this URL in your browser, log in, click "Allow":\n');
  console.log(authUrl.toString());
  console.log('\nWaiting for the redirect…\n');
});
