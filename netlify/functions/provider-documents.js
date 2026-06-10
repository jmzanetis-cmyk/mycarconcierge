// provider-documents.js
//
// GET  /api/provider/documents        — list all doc metadata for the authenticated provider
// POST /api/provider/document-url     — { table, doc_id } → 120s signed URL
//
// Security model:
//   - JWT required on every request; auth.getUser() called with the Bearer token
//   - service-role client used for all DB + storage ops (RLS alone isn't enough for
//     signed URL generation, which requires service-role privilege in Supabase)
//   - ownership verified server-side before issuing any URL — client-supplied IDs
//     are cross-checked against the authenticated user's profile id
//   - documents bucket is private; signed URLs are 120 s TTL
//   - providers are view/download only — no delete, no metadata edit

'use strict';

var utils = require('./utils');

var CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

var SIGNED_URL_TTL = 120; // seconds

function resp(status, body) {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}

async function getAuthenticatedUser(event, supabase) {
  var auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  var m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  var result = await supabase.auth.getUser(m[1].trim());
  if (result.error || !result.data || !result.data.user) return null;
  return result.data.user;
}

// Resolve the authenticated user's provider profile id from the profiles table.
// We verify role = 'provider' (or 'pending_provider') so non-providers can't probe.
async function getProviderProfile(supabase, userId) {
  var res = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle();
  if (res.error || !res.data) return null;
  var role = res.data.role;
  if (role !== 'provider' && role !== 'pending_provider') return null;
  return res.data;
}

// ---- GET /api/provider/documents ----------------------------------------
async function handleList(event, supabase, userId) {
  var docs = [];

  // 1. Signed agreements (founding + any future agreements)
  var { data: agreements, error: ae } = await supabase
    .from('signed_agreements')
    .select('id, agreement_type, signed_at, email_sent')
    .eq('user_id', userId)
    .order('signed_at', { ascending: false });
  if (ae) console.error('[provider-docs] signed_agreements error:', ae.message);
  for (var ag of (agreements || [])) {
    docs.push({
      table:      'signed_agreements',
      doc_id:     ag.id,
      type:       'agreement',
      label:      formatAgreementLabel(ag.agreement_type),
      date:       ag.signed_at,
      email_sent: ag.email_sent,
    });
  }

  // 2. Background check records (provider-level)
  var { data: bgcs, error: be } = await supabase
    .from('provider_background_checks')
    .select('id, status, created_at, completed_at, report_url')
    .eq('provider_id', userId)
    .order('created_at', { ascending: false });
  if (be) console.error('[provider-docs] provider_background_checks error:', be.message);
  for (var bgc of (bgcs || [])) {
    docs.push({
      table:        'provider_background_checks',
      doc_id:       bgc.id,
      type:         'background_check',
      label:        'Background Check',
      date:         bgc.completed_at || bgc.created_at,
      status:       bgc.status,
      has_report:   !!bgc.report_url,
    });
  }

  // 3. Tax / legal documents (provider_documents table)
  var { data: pdocs, error: pe } = await supabase
    .from('provider_documents')
    .select('id, document_type, file_url, created_at, status')
    .eq('provider_id', userId)
    .order('created_at', { ascending: false });
  if (pe) console.error('[provider-docs] provider_documents error:', pe.message);
  for (var pd of (pdocs || [])) {
    docs.push({
      table:  'provider_documents',
      doc_id: pd.id,
      type:   'provider_document',
      label:  formatDocumentTypeLabel(pd.document_type),
      date:   pd.created_at,
      status: pd.status,
    });
  }

  // 4. Identity verifications (KYC — links to stored scan images/docs)
  var { data: idvs, error: ie } = await supabase
    .from('identity_verifications')
    .select('id, status, created_at, verified_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (ie) console.error('[provider-docs] identity_verifications error:', ie.message);
  for (var idv of (idvs || [])) {
    docs.push({
      table:       'identity_verifications',
      doc_id:      idv.id,
      type:        'identity_verification',
      label:       'Identity Verification (KYC)',
      date:        idv.verified_at || idv.created_at,
      status:      idv.status,
    });
  }

  return resp(200, { documents: docs });
}

// ---- POST /api/provider/document-url ------------------------------------
async function handleSignedUrl(event, supabase, userId) {
  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return resp(400, { error: 'Invalid JSON' });
  }

  var table  = body.table;
  var doc_id = body.doc_id;

  if (!table || !doc_id) return resp(400, { error: 'table and doc_id are required' });
  if (!utils.isValidUUID(doc_id)) return resp(400, { error: 'Invalid doc_id' });

  var storagePath = null;

  if (table === 'signed_agreements') {
    // Ownership check: user_id must match
    var { data: ag, error: agErr } = await supabase
      .from('signed_agreements')
      .select('id, agreement_type')
      .eq('id', doc_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (agErr || !ag) return resp(403, { error: 'Document not found or access denied' });
    storagePath = 'agreements/' + ag.agreement_type + '/' + ag.id + '.pdf';

  } else if (table === 'provider_background_checks') {
    var { data: bgc, error: bgcErr } = await supabase
      .from('provider_background_checks')
      .select('id, report_url')
      .eq('id', doc_id)
      .eq('provider_id', userId)
      .maybeSingle();
    if (bgcErr || !bgc) return resp(403, { error: 'Document not found or access denied' });
    if (!bgc.report_url) return resp(404, { error: 'No report available yet' });
    // report_url is a full storage URL — extract the path after the bucket name
    storagePath = extractStoragePath(bgc.report_url, 'documents');

  } else if (table === 'provider_documents') {
    var { data: pd, error: pdErr } = await supabase
      .from('provider_documents')
      .select('id, file_url')
      .eq('id', doc_id)
      .eq('provider_id', userId)
      .maybeSingle();
    if (pdErr || !pd) return resp(403, { error: 'Document not found or access denied' });
    if (!pd.file_url) return resp(404, { error: 'No file available' });
    // provider_documents uses the provider-documents bucket
    var pdSignRes = await supabase.storage
      .from('provider-documents')
      .createSignedUrl(extractStoragePath(pd.file_url, 'provider-documents'), SIGNED_URL_TTL);
    if (pdSignRes.error) {
      console.error('[provider-docs] provider-documents signed url error:', pdSignRes.error.message);
      return resp(500, { error: 'Could not generate download link' });
    }
    return resp(200, { url: pdSignRes.data.signedUrl, expires_in: SIGNED_URL_TTL });

  } else {
    return resp(400, { error: 'Unknown table' });
  }

  if (!storagePath) return resp(404, { error: 'No file on record for this document' });

  var signRes = await supabase.storage
    .from('documents')
    .createSignedUrl(storagePath, SIGNED_URL_TTL);

  if (signRes.error) {
    console.error('[provider-docs] signed url error:', signRes.error.message, 'path:', storagePath);
    return resp(500, { error: 'Could not generate download link' });
  }

  return resp(200, { url: signRes.data.signedUrl, expires_in: SIGNED_URL_TTL });
}

// ---- Helpers -----------------------------------------------------------

function extractStoragePath(fullUrl, bucketName) {
  // fullUrl: https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
  // or already a relative path
  if (!fullUrl) return null;
  var marker = '/object/public/' + bucketName + '/';
  var idx = fullUrl.indexOf(marker);
  if (idx !== -1) return fullUrl.slice(idx + marker.length);
  // also try /object/sign/ or /object/authenticated/
  var marker2 = '/' + bucketName + '/';
  var idx2 = fullUrl.lastIndexOf(marker2);
  if (idx2 !== -1) return fullUrl.slice(idx2 + marker2.length);
  return fullUrl;
}

function formatAgreementLabel(type) {
  if (!type) return 'Agreement';
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

function formatDocumentTypeLabel(type) {
  if (!type) return 'Document';
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

// ---- Handler -----------------------------------------------------------

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return resp(200, {});

  var supabase = utils.createSupabaseClient();
  if (!supabase) return resp(500, { error: 'Database not configured' });

  var user = await getAuthenticatedUser(event, supabase);
  if (!user) return resp(401, { error: 'Authentication required' });

  var profile = await getProviderProfile(supabase, user.id);
  if (!profile) return resp(403, { error: 'Provider account required' });

  if (event.httpMethod === 'GET') {
    return handleList(event, supabase, user.id);
  }

  if (event.httpMethod === 'POST') {
    return handleSignedUrl(event, supabase, user.id);
  }

  return resp(405, { error: 'Method not allowed' });
};
