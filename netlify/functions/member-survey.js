// POST /api/member/survey — save 22-question member survey answers
// Auth: Bearer JWT. Upserts into survey_responses (on conflict user_id, update answers).
'use strict';

const { createClient } = require('@supabase/supabase-js');
const MCCSurvey = require('../../www/shared/survey-questions');

const ALLOWED = MCCSurvey.ALLOWED;
const KEYS    = MCCSurvey.KEYS;

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

async function getUser(event, sb) {
  const auth = (event.headers?.authorization || event.headers?.Authorization || '');
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { error: json(401, { error: 'Missing token' }) };
  const { data: { user }, error } = await sb.auth.getUser(m[1].trim());
  if (error || !user) return { error: json(401, { error: 'Invalid token' }) };
  return { user };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return json(200, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const sb = supabase();
  const auth = await getUser(event, sb);
  if (auth.error) return auth.error;

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  // Validate and collect only recognised survey keys
  const answers = {};
  for (const key of KEYS) {
    const val = body[key];
    if (val === undefined || val === null || val === '') {
      answers[key] = null;
      continue;
    }
    if (!ALLOWED[key].includes(String(val))) {
      return json(400, { error: `Invalid value for ${key}: ${val}` });
    }
    answers[key] = String(val);
  }

  // Upsert — if the user already submitted, overwrite answer columns
  const { error } = await sb.from('survey_responses')
    .upsert({ user_id: auth.user.id, ...answers }, { onConflict: 'user_id' });

  if (error) {
    console.error('[member-survey] upsert error:', error.message);
    return json(500, { error: 'Failed to save survey' });
  }

  return json(200, { success: true });
};
