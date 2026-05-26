// netlify/functions/admin-saas.js
//
// Route:  GET /api/admin/saas/subscriptions
//
// Auth: x-admin-password or x-admin-token

'use strict';

const utils = require('./utils');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'GET') return utils.errorResponse(405, 'Method not allowed');

  const adminPassword = process.env.ADMIN_PASSWORD;
  const incomingPw = (event.headers['x-admin-password'] || event.headers['X-Admin-Password'] || '').trim();
  const incomingTk = (event.headers['x-admin-token']    || event.headers['X-Admin-Token']    || '').trim();
  const teamTokens = (process.env.ADMIN_TEAM_TOKENS || '').split(',').map(t => t.trim()).filter(Boolean);

  const authed = (adminPassword && incomingPw === adminPassword)
              || (incomingTk && teamTokens.includes(incomingTk));
  if (!authed) return utils.errorResponse(401, 'Unauthorized');

  const supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  const { data: subs, error } = await supabase
    .from('saas_subscriptions')
    .select('id, user_id, product, plan, status, stripe_subscription_id, current_period_start, current_period_end, cancel_at_period_end, trial_end, canceled_at, created_at')
    .order('created_at', { ascending: false });

  if (error) return utils.errorResponse(500, error.message);

  const subscriptions = subs || [];
  const now = new Date();
  const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const stats = {
    total:         subscriptions.length,
    active:        subscriptions.filter(s => s.status === 'active').length,
    trialing:      subscriptions.filter(s => s.status === 'trialing').length,
    past_due:      subscriptions.filter(s => s.status === 'past_due').length,
    recent_churns: subscriptions.filter(s => s.canceled_at && new Date(s.canceled_at) >= cutoff30d).length,
    mrr_dollars:   '0.00'
  };

  const by_product = {};
  for (const s of subscriptions) {
    if (!by_product[s.product]) by_product[s.product] = { active: 0, trialing: 0, canceled: 0, past_due: 0 };
    const bucket = by_product[s.product];
    if (bucket[s.status] !== undefined) bucket[s.status]++;
  }

  const recent_churns = subscriptions
    .filter(s => s.canceled_at && new Date(s.canceled_at) >= cutoff30d)
    .map(s => ({ user_id: s.user_id, product: s.product, plan: s.plan, canceled_at: s.canceled_at }));

  return utils.successResponse({ subscriptions, stats, by_product, recent_churns });
};
