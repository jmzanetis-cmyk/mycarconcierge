// ============================================================================
// provider-verification
//
// Phase 3 of signup consolidation. Two routes on one function:
//
//   GET  /api/provider/verification         → { status, requested_at,
//                                                documents, external_reviews,
//                                                references, is_ready,
//                                                readiness_message }
//   POST /api/provider/request-verification → { status:'pending',
//                                                requested_at:<iso> }
//
// GET is used by www/providers.html's Verification section to render the
// documents / external-reviews / references cards and to size the
// "Submit for verification" button (readiness rule: at least one
// verification document uploaded, plus at least one external review or
// reference).
//
// POST transitions the caller's profiles.verification_status from
// NULL/'rejected' to 'pending' and stamps verification_requested_at with
// NOW(). Idempotent: 200 if already 'pending' (timestamp refreshed);
// 409 if already 'verified'. The write goes through the service-role
// client because profiles.verification_status is guarded by 20260918c's
// BEFORE UPDATE trigger — client-side writes throw 42501 by design.
//
// Bearer JWT required on both routes; user_id always comes from the JWT
// (never the request body).
// ============================================================================

const { createClient } = require('@supabase/supabase-js');

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    },
    body: typeof data === 'string' ? data : JSON.stringify(data)
  };
}

function getBearerToken(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

async function _authenticate(event) {
  const supabase = getServiceSupabase();
  if (!supabase) return { error: jsonResponse(500, { error: 'Database not configured' }) };
  const token = getBearerToken(event);
  if (!token) return { error: jsonResponse(401, { error: 'Authorization Bearer token required' }) };
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return { error: jsonResponse(401, { error: 'invalid or expired token' }) };
    return { supabase, user: data.user };
  } catch (e) {
    return { error: jsonResponse(401, { error: 'token validation failed' }) };
  }
}

// Documents that count toward the readiness gate. Signup writes these
// three types; anything else (agreements, BGC reports, KYC) doesn't
// count because those aren't credentials the admin queue is reviewing.
const VERIFICATION_DOC_TYPES = new Set([
  'business_license', 'certification', 'insurance', 'portfolio'
]);

function readinessCheck(documents, externalReviews, references) {
  const hasDoc = documents.some(d => VERIFICATION_DOC_TYPES.has(d.document_type));
  const hasSocialProof = externalReviews.length > 0 || references.length > 0;
  if (hasDoc && hasSocialProof) {
    return { is_ready: true, readiness_message: null };
  }
  if (!hasDoc && !hasSocialProof) {
    return { is_ready: false, readiness_message: 'Upload at least one document, plus a review or reference.' };
  }
  if (!hasDoc) {
    return { is_ready: false, readiness_message: 'Upload at least one document to submit for verification.' };
  }
  return { is_ready: false, readiness_message: 'Add at least one external review or reference to submit for verification.' };
}

// --- GET /verification -----------------------------------------------------
async function handleGetVerification(event, supabase, user) {
  const [profileRes, docsRes, reviewsRes, refsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('verification_status, verification_requested_at')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('provider_documents')
      .select('id, document_type, document_name, file_url, created_at')
      .eq('provider_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('provider_external_reviews')
      .select('id, platform, profile_url, created_at')
      .eq('provider_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('provider_references')
      .select('id, reference_name, reference_company, reference_phone, relationship, created_at')
      .eq('application_id', null)  // placeholder to force include, replaced below
      .limit(0)
  ]);

  // provider_references is scoped by application_id (there's no direct
  // provider_id column on it — signup wrote it via app ownership). Look
  // up the caller's applications and fetch references keyed off those.
  let references = [];
  const { data: apps } = await supabase
    .from('provider_applications')
    .select('id')
    .eq('user_id', user.id);
  const appIds = (apps || []).map(a => a.id);
  if (appIds.length > 0) {
    const { data: refs } = await supabase
      .from('provider_references')
      .select('id, reference_name, reference_company, reference_phone, relationship, application_id, created_at')
      .in('application_id', appIds)
      .order('created_at', { ascending: false });
    references = refs || [];
  }

  const documents = docsRes.data || [];
  const externalReviews = reviewsRes.data || [];
  const readiness = readinessCheck(documents, externalReviews, references);

  return jsonResponse(200, {
    status: profileRes.data?.verification_status || null,
    requested_at: profileRes.data?.verification_requested_at || null,
    documents,
    external_reviews: externalReviews,
    references,
    ...readiness
  });
}

// --- POST /request-verification --------------------------------------------
async function handlePostRequestVerification(event, supabase, user) {
  // Re-fetch profile with role to enforce provider-only. A pending_provider
  // account hasn't finalised yet — asking for verification before finalize
  // is a UX ordering bug, not a real submission.
  const { data: profile, error: pe } = await supabase
    .from('profiles')
    .select('role, verification_status, verification_requested_at')
    .eq('id', user.id)
    .maybeSingle();
  if (pe) {
    console.error('[provider-verification] profile lookup failed:', pe.message);
    return jsonResponse(500, { error: 'profile lookup failed', details: pe.message });
  }
  if (!profile) return jsonResponse(404, { error: 'profile not found' });
  if (profile.role !== 'provider') {
    return jsonResponse(403, { error: 'provider role required — finish signup first' });
  }
  if (profile.verification_status === 'verified') {
    return jsonResponse(409, { error: 'already_verified' });
  }

  // Readiness re-check server-side. Belt-and-suspenders — the client
  // greys out the button too, but the server owns the gate.
  const [docsRes, reviewsRes] = await Promise.all([
    supabase
      .from('provider_documents')
      .select('document_type')
      .eq('provider_id', user.id),
    supabase
      .from('provider_external_reviews')
      .select('id')
      .eq('provider_id', user.id)
  ]);
  const { data: apps } = await supabase
    .from('provider_applications')
    .select('id')
    .eq('user_id', user.id);
  const appIds = (apps || []).map(a => a.id);
  let refCount = 0;
  if (appIds.length > 0) {
    const { count } = await supabase
      .from('provider_references')
      .select('id', { count: 'exact', head: true })
      .in('application_id', appIds);
    refCount = count || 0;
  }
  const documents = docsRes.data || [];
  const externalReviews = reviewsRes.data || [];
  const references = new Array(refCount);
  const readiness = readinessCheck(documents, externalReviews, references);
  if (!readiness.is_ready) {
    return jsonResponse(400, { error: 'not_ready', details: readiness.readiness_message });
  }

  const nowIso = new Date().toISOString();
  const { error: ue } = await supabase
    .from('profiles')
    .update({
      verification_status: 'pending',
      verification_requested_at: nowIso
    })
    .eq('id', user.id);
  if (ue) {
    console.error('[provider-verification] status update failed:', ue.message);
    return jsonResponse(500, { error: 'failed to update verification status', details: ue.message });
  }

  return jsonResponse(200, { status: 'pending', requested_at: nowIso });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const rawPath = event.path || '';
  // Route on the tail sub-path so both prod (/.netlify/functions/…/verification)
  // and dev-mirror (/api/provider/verification, /api/provider/request-verification)
  // resolve consistently.
  const isRequest = /request-verification\/?$/.test(rawPath);
  const isVerification = /\bverification\/?$/.test(rawPath) && !isRequest;

  const auth = await _authenticate(event);
  if (auth.error) return auth.error;

  if (isRequest && event.httpMethod === 'POST') {
    return handlePostRequestVerification(event, auth.supabase, auth.user);
  }
  if (isVerification && event.httpMethod === 'GET') {
    return handleGetVerification(event, auth.supabase, auth.user);
  }

  return jsonResponse(404, { error: 'unknown route or method' });
};

module.exports.readinessCheck = readinessCheck;
module.exports.VERIFICATION_DOC_TYPES = VERIFICATION_DOC_TYPES;
