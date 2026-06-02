'use strict';
// POST /api/waitlist/join — pre-launch interest capture
// Public endpoint. Deduplicates on email (case-insensitive, silently).
const { createClient } = require('@supabase/supabase-js');

function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status, body) {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = new Set(['member', 'provider']);

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const { email, intended_role, zip_code, source } = body;

  if (!email || !EMAIL_RE.test(String(email))) return json(400, { error: 'Valid email required' });
  if (!intended_role || !VALID_ROLES.has(String(intended_role))) return json(400, { error: 'intended_role must be member or provider' });

  const supabase = getServiceClient();
  if (!supabase) return json(500, { error: 'Server configuration error' });

  const { error } = await supabase.from('waitlist').insert({
    email: String(email).toLowerCase().trim(),
    intended_role: String(intended_role),
    zip_code: zip_code ? String(zip_code).trim().slice(0, 10) : null,
    source: source ? String(source).slice(0, 50) : 'landing_page',
  });

  if (error) {
    if (error.code === '23505') return json(200, { success: true }); // duplicate — silent
    console.error('Waitlist insert error:', error.code, error.message);
    return json(500, { error: 'Could not save your signup. Please try again.' });
  }

  return json(200, { success: true });
};
