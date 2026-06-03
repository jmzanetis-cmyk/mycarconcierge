// vehicle-photos.js
//
// GET    /api/vehicle-photos/:vehicleId         — list photos (signed URLs)
// POST   /api/vehicle-photos/:vehicleId         — register photo after storage upload
// PATCH  /api/vehicle-photos/:photoId/primary   — set photo as primary
// DELETE /api/vehicle-photos/:photoId           — remove photo record from DB
//
// Security model:
//   - JWT required on every request; verified via auth.getUser()
//   - service-role client for DB + signed URL generation (private bucket)
//   - ownership enforced server-side: member_id = auth.uid()
//   - max 6 photos per vehicle enforced on POST
//   - storage deletion is handled client-side after a successful DELETE

'use strict';

const { createClient } = require('@supabase/supabase-js');

const BUCKET = 'vehicle-photos';
const SIGNED_URL_TTL = 3600; // 1 hour — photos are displayed in a grid
const MAX_PHOTOS = 6;

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function resp(status, body) {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

async function getUser(event, sb) {
  const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const { data, error } = await sb.auth.getUser(m[1].trim());
  if (error || !data?.user) return null;
  return data.user;
}

async function signPhotos(sb, rows) {
  return Promise.all(rows.map(async (p) => {
    const { data } = await sb.storage.from(BUCKET).createSignedUrl(p.storage_path, SIGNED_URL_TTL);
    return {
      id: p.id,
      url: data?.signedUrl || '',
      storage_path: p.storage_path,
      is_primary: p.is_primary,
      created_at: p.created_at,
    };
  }));
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return resp(200, {});

  const sb = serviceClient();
  const user = await getUser(event, sb);
  if (!user) return resp(401, { error: 'Unauthorized' });

  // Parse path: /api/vehicle-photos/<id>[/primary]
  const parts = event.path.replace(/^\/api\/vehicle-photos\/?/, '').split('/').filter(Boolean);
  const firstId = parts[0];
  const isPrimaryRoute = parts[1] === 'primary';

  if (!firstId) return resp(400, { error: 'ID required' });

  // ── GET /api/vehicle-photos/:vehicleId ───────────────────────────────────
  if (event.httpMethod === 'GET') {
    const { data: vehicle } = await sb.from('vehicles').select('id').eq('id', firstId).eq('owner_id', user.id).maybeSingle();
    if (!vehicle) return resp(403, { error: 'Not your vehicle' });

    const { data: rows, error } = await sb.from('vehicle_photos')
      .select('id, storage_path, is_primary, created_at')
      .eq('vehicle_id', firstId)
      .eq('member_id', user.id)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) return resp(500, { error: error.message });

    const photos = await signPhotos(sb, rows || []);
    return resp(200, { photos });
  }

  // ── POST /api/vehicle-photos/:vehicleId ──────────────────────────────────
  if (event.httpMethod === 'POST' && !isPrimaryRoute) {
    const { data: vehicle } = await sb.from('vehicles').select('id').eq('id', firstId).eq('owner_id', user.id).maybeSingle();
    if (!vehicle) return resp(403, { error: 'Not your vehicle' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return resp(400, { error: 'Invalid JSON' }); }
    const { storage_path, is_primary } = body;
    if (!storage_path) return resp(400, { error: 'storage_path required' });

    const { count } = await sb.from('vehicle_photos').select('id', { count: 'exact', head: true }).eq('vehicle_id', firstId).eq('member_id', user.id);
    if ((count || 0) >= MAX_PHOTOS) return resp(400, { error: `Maximum ${MAX_PHOTOS} photos per vehicle` });

    if (is_primary) {
      await sb.from('vehicle_photos').update({ is_primary: false }).eq('vehicle_id', firstId).eq('member_id', user.id);
    }

    const { data: photo, error } = await sb.from('vehicle_photos').insert({
      vehicle_id: firstId,
      member_id: user.id,
      storage_path,
      is_primary: is_primary === true,
    }).select('id, storage_path, is_primary, created_at').single();
    if (error) return resp(500, { error: error.message });

    const { data: signData } = await sb.storage.from(BUCKET).createSignedUrl(photo.storage_path, SIGNED_URL_TTL);
    return resp(201, { success: true, photo: { ...photo, url: signData?.signedUrl || '' } });
  }

  // ── PATCH /api/vehicle-photos/:photoId/primary ───────────────────────────
  if (event.httpMethod === 'PATCH' && isPrimaryRoute) {
    const { data: photo } = await sb.from('vehicle_photos').select('id, vehicle_id, member_id').eq('id', firstId).eq('member_id', user.id).maybeSingle();
    if (!photo) return resp(403, { error: 'Photo not found or not yours' });

    await sb.from('vehicle_photos').update({ is_primary: false }).eq('vehicle_id', photo.vehicle_id).eq('member_id', user.id);
    const { error } = await sb.from('vehicle_photos').update({ is_primary: true }).eq('id', firstId);
    if (error) return resp(500, { error: error.message });

    return resp(200, { success: true });
  }

  // ── DELETE /api/vehicle-photos/:photoId ──────────────────────────────────
  if (event.httpMethod === 'DELETE') {
    const { data: photo } = await sb.from('vehicle_photos').select('id, vehicle_id, member_id').eq('id', firstId).eq('member_id', user.id).maybeSingle();
    if (!photo) return resp(403, { error: 'Photo not found or not yours' });

    const { error } = await sb.from('vehicle_photos').delete().eq('id', firstId);
    if (error) return resp(500, { error: error.message });

    return resp(200, { success: true });
  }

  return resp(405, { error: 'Method not allowed' });
};
