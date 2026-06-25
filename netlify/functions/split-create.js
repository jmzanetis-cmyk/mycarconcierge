'use strict';

// POST /api/split/create
// Auth: Bearer JWT (member)
// Body: { package_id, participants: [{email, amount_cents, display_name?, is_guest?}] }
// Creates a split_payments row + split_participants rows.
// Returns: { success, split_id, participants }

var utils = require('./utils');
var { isFeatureEnabledForUser } = require('./_shared/feature-flag-check');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'POST') return utils.errorResponse(405, 'Method not allowed');

  var authHeader = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!authHeader.startsWith('Bearer ')) return utils.errorResponse(401, 'Authorization required');
  var token = authHeader.slice(7).trim();

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(503, 'Service temporarily unavailable');

  var userResult = await supabase.auth.getUser(token);
  if (userResult.error || !userResult.data?.user) return utils.errorResponse(401, 'Invalid or expired auth token');
  var userId = userResult.data.user.id;

  // Feature gate (ships dark for launch)
  var spEnabled = await isFeatureEnabledForUser(supabase, 'split_payments_enabled', userId);
  if (!spEnabled) return utils.errorResponse(403, 'feature_disabled');

  var body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return utils.errorResponse(400, 'Invalid JSON'); }

  var packageId   = (body.package_id || '').trim();
  var participants = Array.isArray(body.participants) ? body.participants : [];

  if (!packageId || !utils.isValidUUID(packageId))
    return utils.errorResponse(400, 'package_id is required and must be a valid UUID');
  if (participants.length < 1)
    return utils.errorResponse(400, 'At least one participant is required');
  if (participants.some(p => !p.email || !p.amount_cents || p.amount_cents < 100))
    return utils.errorResponse(400, 'Each participant requires email and amount_cents >= 100');

  // Verify the package belongs to this user
  var pkgRes = await supabase
    .from('maintenance_packages')
    .select('id, title')
    .eq('id', packageId)
    .eq('member_id', userId)
    .single();
  if (pkgRes.error || !pkgRes.data)
    return utils.errorResponse(404, 'Package not found or not owned by you');

  var totalCents = participants.reduce((sum, p) => sum + p.amount_cents, 0);
  var expiresAt  = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(); // 72 hours

  var splitRes = await supabase
    .from('split_payments')
    .insert({ package_id: packageId, created_by: userId, total_amount_cents: totalCents, status: 'pending', expires_at: expiresAt })
    .select('id')
    .single();
  if (splitRes.error) {
    console.error('[split-create] split_payments insert:', splitRes.error.message);
    return utils.errorResponse(500, 'Failed to create split payment');
  }
  var splitId = splitRes.data.id;

  // Link the package to this split
  await supabase.from('maintenance_packages').update({ split_payment_id: splitId }).eq('id', packageId);

  // Resolve member_id for each participant by email where possible
  var emails = participants.map(p => p.email.trim().toLowerCase());
  var profilesRes = await supabase.from('profiles').select('id, email').in('email', emails);
  var emailToMemberId = {};
  if (profilesRes.data) {
    for (var profile of profilesRes.data) {
      emailToMemberId[profile.email.toLowerCase()] = profile.id;
    }
  }

  var rows = participants.map(p => {
    var email     = p.email.trim().toLowerCase();
    var memberId  = emailToMemberId[email] || null;
    return {
      split_payment_id: splitId,
      email,
      display_name: p.display_name || null,
      amount_cents: p.amount_cents,
      member_id: memberId,
      status: 'invited',
      invited_at: new Date().toISOString()
    };
  });

  var partRes = await supabase.from('split_participants').insert(rows).select('id, email, amount_cents, member_id, status');
  if (partRes.error) {
    console.error('[split-create] split_participants insert:', partRes.error.message);
    return utils.errorResponse(500, 'Failed to create participants');
  }

  // Build invite tokens for guest participants
  var participantsOut = partRes.data.map(p => ({
    id: p.id,
    email: p.email,
    amount_cents: p.amount_cents,
    is_member: !!p.member_id,
    invite_token: p.member_id ? null : utils.generateGuestToken(p.id)
  }));

  return utils.successResponse({ success: true, split_id: splitId, participants: participantsOut });
};
