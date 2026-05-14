const http = require('node:http');
const { createClient } = require('@supabase/supabase-js');
const { startEngineSchedulers, initEngineState, handleOutreachRequest, handleUnsubscribe, handleEmailTracking, handleResendWebhook } = require('./outreach-engine-api');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[Runner] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

let supabase = null;

function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return supabase;
}

async function handleAdminAuth(req, res, requestId, callback) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const token = url.searchParams.get('token') || req.headers['x-admin-token'];
  if (!token) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Admin authentication required' }));
    return;
  }
  const client = getSupabaseClient();
  const { data } = await client
    .from('admin_sessions')
    .select('*')
    .eq('session_token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (!data) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid or expired admin session' }));
    return;
  }
  req.adminUser = data;
  await callback();
}

function setCorsHeaders(res, req) {
  const origin = req?.headers?.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

let requestCounter = 0;
function generateRequestId() {
  return (++requestCounter).toString(16).padStart(16, '0');
}

const server = http.createServer(async (req, res) => {
  const requestId = generateRequestId();
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/health' || url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'outreach-engine', uptime: process.uptime() }));
    return;
  }

  if (url.pathname.startsWith('/api/admin/outreach')) {
    await handleOutreachRequest(req, res, { getSupabaseClient, handleAdminAuth, setCorsHeaders, requestId });
    return;
  }

  if (url.pathname === '/unsubscribe') {
    await handleUnsubscribe(req, res, { getSupabaseClient, setCorsHeaders });
    return;
  }

  if (url.pathname === '/t/o' || url.pathname === '/t/c') {
    await handleEmailTracking(req, res, { getSupabaseClient });
    return;
  }

  if (url.pathname === '/api/webhooks/resend') {
    await handleResendWebhook(req, res, { getSupabaseClient, setCorsHeaders });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

const PORT = process.env.PORT || 5000;

async function start() {
  const client = getSupabaseClient();
  console.log('[Runner] Initializing outreach engine state...');
  await initEngineState(client);

  console.log('[Runner] Starting engine schedulers...');
  startEngineSchedulers(getSupabaseClient);

  const { data } = await client
    .from('engine_state')
    .select('is_running, auto_send')
    .eq('id', 1)
    .maybeSingle();

  if (data?.is_running) {
    console.log('[Runner] Outreach Engine is ACTIVE (auto_send:', data.auto_send, ')');
  } else {
    console.log('[Runner] Outreach Engine is PAUSED — enable via admin portal');
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Runner] Outreach engine running on port ${PORT}`);
    console.log('[Runner] Health check: http://0.0.0.0:' + PORT + '/health');
  });
}

start().catch(err => {
  console.error('[Runner] Fatal startup error:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('[Runner] Uncaught exception:', err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('[Runner] Unhandled rejection:', err?.message || err);
});
