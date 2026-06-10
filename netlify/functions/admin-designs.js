// netlify/functions/admin-designs.js
//
// Routes:
//   GET    /api/admin/designs              — list uploaded design files
//   POST   /api/admin/designs/upload       — upload a design (multipart or base64)
//   DELETE /api/admin/designs/:filename    — remove a design
//
// Uses Supabase Storage bucket "designs" (create it in the Supabase dashboard first).
// Auth: Authorization: Bearer <supabase_token> → verify with getUser → profiles.role === 'admin'

'use strict';

const utils = require('./utils');

const BUCKET = 'designs';

function parsePath(event) {
  return (event.path || '')
    .replace(/^\/?\.netlify\/functions\/admin-designs\/?/, '')
    .replace(/^\/api\/admin\/designs\/?/, '')
    .replace(/^\/+|\/+$/g, '');
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();

  const supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  const admin = await utils.authenticateBearerAdmin(event, supabase);
  if (!admin) return utils.errorResponse(401, 'Authentication required');

  const path   = parsePath(event);
  const method = event.httpMethod;

  // ── GET /api/admin/designs ──────────────────────────────────────────────
  if (method === 'GET' && !path) {
    const { data: files, error } = await supabase.storage.from(BUCKET).list('', {
      limit: 200, sortBy: { column: 'created_at', order: 'desc' }
    });
    if (error) {
      if (error.message && error.message.includes('not found')) {
        return utils.successResponse({ designs: [], note: 'Create a "designs" bucket in Supabase Storage to enable design uploads.' });
      }
      return utils.errorResponse(500, error.message);
    }
    const designs = (files || []).filter(f => f.name).map(f => {
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(f.name);
      return { name: f.name, size: f.metadata?.size || 0, url: urlData?.publicUrl || null, created_at: f.created_at };
    });
    return utils.successResponse({ designs });
  }

  // ── POST /api/admin/designs/upload ─────────────────────────────────────
  if (method === 'POST' && path === 'upload') {
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch { return utils.errorResponse(400, 'Invalid JSON'); }
    const { filename, content_type, data: base64Data } = body;
    if (!filename || !base64Data) return utils.errorResponse(400, 'filename and data are required');
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
    const buf = Buffer.from(base64Data, 'base64');
    const { error } = await supabase.storage.from(BUCKET).upload(safeName, buf, {
      contentType: content_type || 'application/octet-stream', upsert: true
    });
    if (error) return utils.errorResponse(500, error.message);
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(safeName);
    return utils.successResponse({ filename: safeName, url: urlData?.publicUrl || null });
  }

  // ── DELETE /api/admin/designs/:filename ────────────────────────────────
  if (method === 'DELETE' && path) {
    const { error } = await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)]);
    if (error) return utils.errorResponse(500, error.message);
    return utils.successResponse({ deleted: true });
  }

  return utils.errorResponse(404, 'Not found');
};
