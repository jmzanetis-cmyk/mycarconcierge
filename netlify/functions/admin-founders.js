// netlify/functions/admin-founders.js
//
// Founders/payout tab endpoints.
// Ported from server.js:
//   handleGetFounderCommissionHistory (line 1724)
//   handleUpdateFounderCommission     (line 1580)
//   handleAdminGetPayoutSettings      (line 13103)
//   handleAdminSavePayoutSettings     (line 13129)
//   handleAdminGetMilestones          (line 7417)
//   handleAdminGetBonusReserve        (line 7528)  — DB only; Stripe Treasury skipped
//   handleAdminAdjustBonusReserve     (line 7799)
//
// Routes (via _redirects):
//   GET  /api/admin/founders/:id/commission-history
//   POST /api/admin/founders/:id/commission
//   GET  /api/admin/payout-settings
//   POST /api/admin/payout-settings
//   GET  /api/admin/milestones
//   GET  /api/admin/bonus-reserve
//   POST /api/admin/bonus-reserve/adjust
//
// Auth: Authorization: Bearer <supabase_token> → getUser → profiles.role === 'admin'

'use strict';

var utils = require('./utils');

var DEFAULT_PAYOUT_SETTINGS = {
  min_payout_threshold:      10.00,
  instant_payout_fee_percent: 1.00,
  instant_payout_fee_min:     0.50,
  instant_payout_fee_max:    10.00,
  weekly_payout_fee:          0.00
};

async function authenticateBearerAdmin(event, supabase) {
  var authHeader = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!authHeader.startsWith('Bearer ')) return null;
  var token = authHeader.slice(7).trim();
  if (!token) return null;
  var authResult = await supabase.auth.getUser(token);
  var user = authResult.data && authResult.data.user;
  if (authResult.error || !user) return null;
  var profileResult = await supabase.from('profiles').select('role').eq('id', user.id).single();
  var profile = profileResult.data;
  if (!profile || profile.role !== 'admin') return null;
  return user;
}

function parsePath(event) {
  var raw = event.path || '';
  return raw
    .replace(/^\/?\.netlify\/functions\/admin-founders\/?/, '')
    .replace(/^\/api\/admin\/?/, '')
    .replace(/^\/+|\/+$/g, '');
}

async function getPayoutSettings(supabase) {
  var result = await supabase.from('payout_settings').select('*').limit(1).single();
  if (result.error || !result.data) return DEFAULT_PAYOUT_SETTINGS;
  var d = result.data;
  return {
    min_payout_threshold:       parseFloat(d.min_payout_threshold)       || DEFAULT_PAYOUT_SETTINGS.min_payout_threshold,
    instant_payout_fee_percent: parseFloat(d.instant_payout_fee_percent) || DEFAULT_PAYOUT_SETTINGS.instant_payout_fee_percent,
    instant_payout_fee_min:     parseFloat(d.instant_payout_fee_min)     || DEFAULT_PAYOUT_SETTINGS.instant_payout_fee_min,
    instant_payout_fee_max:     parseFloat(d.instant_payout_fee_max)     || DEFAULT_PAYOUT_SETTINGS.instant_payout_fee_max,
    weekly_payout_fee:          parseFloat(d.weekly_payout_fee)          || DEFAULT_PAYOUT_SETTINGS.weekly_payout_fee
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  // ── Body-password-authenticated payout routes ───────────────────────────
  // These routes are called from the admin UI with admin_password in the body
  // (no Bearer token) because the payout confirmation prompt collects it inline.
  var earlyBody = {};
  if (event.body) { try { earlyBody = JSON.parse(event.body); } catch (e) { earlyBody = {}; } }
  var bodyPassword = (earlyBody.admin_password || '').trim();
  var envPassword  = (process.env.ADMIN_PASSWORD || '').trim();
  var bodyAuthed   = envPassword && bodyPassword === envPassword;

  if (bodyAuthed) {
    var earlyPath   = parsePath(event);
    var earlyMethod = event.httpMethod;

    // ── POST /api/admin/process-founder-payout ──────────────────────────
    if (earlyMethod === 'POST' && earlyPath === 'process-founder-payout') {
      var payoutId   = earlyBody.payout_id;
      var payoutType = earlyBody.payout_type || 'weekly';

      if (!payoutId) return utils.errorResponse(400, 'payout_id required');

      var payoutRow = await supabase.from('founder_payouts')
        .select('id, founder_id, amount, net_amount, fee_amount, status, payout_type')
        .eq('id', payoutId)
        .maybeSingle();
      if (payoutRow.error) return utils.errorResponse(500, payoutRow.error.message);
      if (!payoutRow.data) return utils.errorResponse(404, 'Payout not found');
      var payout = payoutRow.data;
      if (payout.status === 'completed') return utils.errorResponse(409, 'Payout already completed');

      var profileRow = await supabase.from('member_founder_profiles')
        .select('stripe_connect_account_id, full_name')
        .eq('id', payout.founder_id)
        .maybeSingle();
      if (profileRow.error) return utils.errorResponse(500, profileRow.error.message);
      if (!profileRow.data || !profileRow.data.stripe_connect_account_id) {
        return utils.errorResponse(422, 'Founder does not have a Stripe Connect account configured');
      }
      var stripeAccount = profileRow.data.stripe_connect_account_id;

      var settings = await getPayoutSettings(supabase);
      var grossAmount = parseFloat(payout.amount || 0);
      var feeAmount = 0;
      if (payoutType === 'instant') {
        var feeRate = (settings.instant_payout_fee_percent || 1) / 100;
        feeAmount = Math.min(
          settings.instant_payout_fee_max || 10,
          Math.max(settings.instant_payout_fee_min || 0.50, grossAmount * feeRate)
        );
      }
      var netAmount = grossAmount - feeAmount;
      if (netAmount < 0.50) return utils.errorResponse(422, 'Net payout amount is below minimum ($0.50)');

      try {
        var { STRIPE_API_VERSION } = require('../../lib/stripe-api-version');
        var Stripe = require('stripe');
        var stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });

        var transfer = await stripe.transfers.create({
          amount:      Math.round(netAmount * 100),
          currency:    'usd',
          destination: stripeAccount,
          metadata:    { payout_id: payoutId, payout_type: payoutType, founder_id: payout.founder_id }
        });

        var now = new Date().toISOString();
        await supabase.from('founder_payouts').update({
          status:             'completed',
          stripe_transfer_id: transfer.id,
          processed_at:       now,
          payout_type:        payoutType,
          fee_amount:         feeAmount,
          net_amount:         netAmount,
          receipt_url:        transfer.metadata && transfer.metadata.receipt_url || null
        }).eq('id', payoutId);

        return utils.successResponse({ success: true, transfer_id: transfer.id, net_amount: netAmount, fee_amount: feeAmount });
      } catch (stripeErr) {
        await supabase.from('founder_payouts').update({ status: 'failed', notes: stripeErr.message }).eq('id', payoutId);
        return utils.errorResponse(502, 'Stripe transfer failed: ' + stripeErr.message);
      }
    }

    // ── POST /api/admin/process-bulk-payouts ────────────────────────────
    if (earlyMethod === 'POST' && earlyPath === 'process-bulk-payouts') {
      var threshold   = parseFloat(earlyBody.threshold || 10);
      var bulkType    = earlyBody.payout_type || 'weekly';

      var pendingResult = await supabase.from('founder_payouts')
        .select('id, founder_id, amount')
        .eq('status', 'pending')
        .gte('amount', threshold);
      if (pendingResult.error) return utils.errorResponse(500, pendingResult.error.message);
      var pending = pendingResult.data || [];

      if (pending.length === 0) return utils.successResponse({ summary: { succeeded: 0, failed: 0, total_amount: 0, results: [] } });

      var settings = await getPayoutSettings(supabase);
      var { STRIPE_API_VERSION: SV } = require('../../lib/stripe-api-version');
      var StripeB = require('stripe');
      var stripeB = new StripeB(process.env.STRIPE_SECRET_KEY, { apiVersion: SV });

      var results = [];
      for (var pi = 0; pi < pending.length; pi++) {
        var p = pending[pi];
        try {
          var pRow = await supabase.from('member_founder_profiles')
            .select('stripe_connect_account_id')
            .eq('id', p.founder_id)
            .maybeSingle();
          if (!pRow.data || !pRow.data.stripe_connect_account_id) {
            results.push({ payout_id: p.id, status: 'failed', error: 'No Stripe Connect account' });
            continue;
          }
          var gross = parseFloat(p.amount || 0);
          var fee   = 0;
          if (bulkType === 'instant') {
            var fr = (settings.instant_payout_fee_percent || 1) / 100;
            fee = Math.min(settings.instant_payout_fee_max || 10, Math.max(settings.instant_payout_fee_min || 0.50, gross * fr));
          }
          var net = gross - fee;
          if (net < 0.50) { results.push({ payout_id: p.id, status: 'failed', error: 'Net below minimum' }); continue; }

          var txfer = await stripeB.transfers.create({
            amount: Math.round(net * 100), currency: 'usd',
            destination: pRow.data.stripe_connect_account_id,
            metadata: { payout_id: p.id, payout_type: bulkType, founder_id: p.founder_id }
          });
          await supabase.from('founder_payouts').update({
            status: 'completed', stripe_transfer_id: txfer.id,
            processed_at: new Date().toISOString(), payout_type: bulkType, fee_amount: fee, net_amount: net
          }).eq('id', p.id);
          results.push({ payout_id: p.id, status: 'completed', transfer_id: txfer.id, net_amount: net });
        } catch (e) {
          await supabase.from('founder_payouts').update({ status: 'failed', notes: e.message }).eq('id', p.id);
          results.push({ payout_id: p.id, status: 'failed', error: e.message });
        }
      }

      var succeeded = results.filter(function(r) { return r.status === 'completed'; });
      var failed    = results.filter(function(r) { return r.status === 'failed'; });
      return utils.successResponse({
        summary: {
          succeeded:    succeeded.length,
          failed:       failed.length,
          total_amount: succeeded.reduce(function(s, r) { return s + (r.net_amount || 0); }, 0),
          results
        }
      });
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  var user = await authenticateBearerAdmin(event, supabase);
  if (!user) return utils.errorResponse(401, 'Authentication required');

  var path   = parsePath(event);
  var method = event.httpMethod;

  var body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch (e) { return utils.errorResponse(400, 'Invalid JSON'); }
  }

  try {

    // ── GET /api/admin/founders/:id/commission-history ─────────────────────
    var commHistMatch = path.match(/^founders\/([^/]+)\/commission-history$/);
    if (method === 'GET' && commHistMatch) {
      var founderId = commHistMatch[1];
      var result = await supabase
        .from('commission_rate_history')
        .select('id, old_rate, new_rate, admin_email, created_at')
        .eq('founder_id', founderId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (result.error) throw result.error;
      return utils.successResponse({ history: result.data || [] });
    }

    // ── POST /api/admin/founders/:id/commission ────────────────────────────
    var commMatch = path.match(/^founders\/([^/]+)\/commission$/);
    if (method === 'POST' && commMatch) {
      var fId = commMatch[1];
      var rate = body.commission_rate;
      if (typeof rate !== 'number' || rate < 0 || rate > 1) {
        return utils.errorResponse(400, 'commission_rate must be between 0 and 1');
      }

      var currentResult = await supabase
        .from('member_founder_profiles')
        .select('commission_rate, user_id')
        .eq('id', fId)
        .single();
      if (!currentResult.data) return utils.errorResponse(404, 'Founder not found');
      var oldRate = currentResult.data.commission_rate || 0.50;
      var founderUserId = currentResult.data.user_id;

      // Agreement-lock: if the founder has a signed agreement with an agreement_date,
      // their rate is contractually locked. Require admin_override: true to proceed.
      if (founderUserId) {
        var agreementResult = await supabase
          .from('signed_agreements')
          .select('id, agreement_date, commission_rate')
          .eq('user_id', founderUserId)
          .not('agreement_date', 'is', null)
          .limit(1);
        var hasAgreement = agreementResult.data && agreementResult.data.length > 0;
        if (hasAgreement && !body.admin_override) {
          return utils.errorResponse(403, 'This founder has a signed agreement locking their commission rate. Pass admin_override: true to override.');
        }
      }

      var updateResult = await supabase
        .from('member_founder_profiles')
        .update({ commission_rate: rate, updated_at: new Date().toISOString() })
        .eq('id', fId)
        .select()
        .single();
      if (updateResult.error) throw updateResult.error;
      if (!updateResult.data) return utils.errorResponse(404, 'Founder not found');

      // fire-and-forget audit log
      supabase.from('commission_rate_history').insert({
        founder_id:   fId,
        admin_id:     user.id,
        admin_email:  user.email,
        old_rate:     oldRate,
        new_rate:     rate,
        reason:       body.reason || null,
        admin_override: body.admin_override ? true : false
      }).then(function(r) {
        if (r.error) console.error('[admin-founders] commission history log failed:', r.error.message);
      });

      return utils.successResponse({
        success: true,
        founder_id:     fId,
        old_rate:       oldRate,
        commission_rate: rate,
        admin_override:  body.admin_override ? true : false,
        message: 'Commission rate updated from ' + Math.round(oldRate * 100) + '% to ' + Math.round(rate * 100) + '%'
      });
    }

    // ── GET /api/admin/payout-settings ─────────────────────────────────────
    if (method === 'GET' && path === 'payout-settings') {
      var settings = await getPayoutSettings(supabase);
      return utils.successResponse({ success: true, settings });
    }

    // ── POST /api/admin/payout-settings ────────────────────────────────────
    if (method === 'POST' && path === 'payout-settings') {
      var s = body.settings;
      if (!s) return utils.errorResponse(400, 'settings object is required');

      var toSave = {
        min_payout_threshold:       parseFloat(s.min_payout_threshold)       || DEFAULT_PAYOUT_SETTINGS.min_payout_threshold,
        instant_payout_fee_percent: parseFloat(s.instant_payout_fee_percent) || DEFAULT_PAYOUT_SETTINGS.instant_payout_fee_percent,
        instant_payout_fee_min:     parseFloat(s.instant_payout_fee_min)     || DEFAULT_PAYOUT_SETTINGS.instant_payout_fee_min,
        instant_payout_fee_max:     parseFloat(s.instant_payout_fee_max)     || DEFAULT_PAYOUT_SETTINGS.instant_payout_fee_max,
        weekly_payout_fee:          parseFloat(s.weekly_payout_fee)          || 0,
        updated_at: new Date().toISOString(),
        updated_by: user.id
      };

      var existingResult = await supabase.from('payout_settings').select('id').limit(1).single();
      if (existingResult.data) {
        var upd = await supabase.from('payout_settings').update(toSave).eq('id', existingResult.data.id);
        if (upd.error) throw upd.error;
      } else {
        var ins = await supabase.from('payout_settings').insert(Object.assign({}, toSave, { created_at: new Date().toISOString() }));
        if (ins.error) throw ins.error;
      }

      return utils.successResponse({ success: true, settings: toSave });
    }

    // ── GET /api/admin/milestones ──────────────────────────────────────────
    if (method === 'GET' && path === 'milestones') {
      var mResults = await Promise.all([
        supabase.from('platform_revenue_tracking').select('*').single(),
        supabase.from('milestone_thresholds').select('*').eq('is_active', true).order('threshold_amount', { ascending: true }),
        supabase.from('milestone_achievements').select('*').order('threshold_amount', { ascending: true }),
        supabase.from('founding_provider_partners').select('*').eq('status', 'active')
      ]);

      var revenueData    = mResults[0].data;
      var thresholds     = mResults[1].data || [];
      var achievements   = mResults[2].data || [];
      var partners       = mResults[3].data || [];

      var totalRevenue = parseFloat(revenueData && revenueData.total_bid_pack_revenue || 0);

      var milestones = thresholds.map(function(t) {
        var achievement = achievements.find(function(a) { return a.milestone_id === t.id; });
        return Object.assign({}, t, {
          is_achieved: totalRevenue >= t.threshold_amount,
          is_paid:     achievement && achievement.status === 'paid',
          achievement: achievement || null
        });
      });

      var nextMilestone   = milestones.find(function(m) { return !m.is_achieved; });
      var progressPercent = nextMilestone ? Math.min(100, (totalRevenue / nextMilestone.threshold_amount) * 100) : 100;

      var now = new Date();
      var nextAnniversary = new Date(now.getFullYear(), 0, 23);
      if (nextAnniversary <= now) nextAnniversary = new Date(now.getFullYear() + 1, 0, 23);
      var daysUntilAnniversary = Math.ceil((nextAnniversary - now) / (1000 * 60 * 60 * 24));

      return utils.successResponse({
        success: true,
        total_bid_pack_revenue:  totalRevenue,
        milestones,
        next_milestone:          nextMilestone || null,
        progress_percent:        progressPercent,
        founding_partners:       partners,
        next_anniversary:        nextAnniversary.toISOString(),
        days_until_anniversary:  daysUntilAnniversary
      });
    }

    // ── GET /api/admin/bonus-reserve ──────────────────────────────────────
    if (method === 'GET' && path === 'bonus-reserve') {
      var brResults = await Promise.all([
        supabase.from('bonus_reserve').select('*').order('month_year', { ascending: false }).limit(12),
        supabase.from('bonus_reserve_transactions').select('*').order('created_at', { ascending: false }).limit(50)
      ]);

      var monthlyReserve = brResults[0].data || [];
      var transactions   = brResults[1].data || [];

      var totalAccruals    = transactions.filter(function(t) { return t.transaction_type === 'accrual'; })
                              .reduce(function(s, t) { return s + parseFloat(t.amount || 0); }, 0);
      var totalPayouts     = transactions.filter(function(t) { return t.transaction_type === 'payout'; })
                              .reduce(function(s, t) { return s + Math.abs(parseFloat(t.amount || 0)); }, 0);
      var totalAdjustments = transactions.filter(function(t) { return t.transaction_type === 'adjustment'; })
                              .reduce(function(s, t) { return s + parseFloat(t.amount || 0); }, 0);

      var latestTx      = transactions[0];
      var currentBalance = transactions.length > 0
        ? parseFloat(latestTx && latestTx.balance_after || 0)
        : totalAccruals - totalPayouts + totalAdjustments;

      return utils.successResponse({
        success:            true,
        current_balance:    currentBalance,
        reserve_rate:       0.15,
        monthly_breakdown:  monthlyReserve,
        transactions,
        total_accruals:     totalAccruals,
        total_payouts:      totalPayouts,
        total_adjustments:  totalAdjustments,
        treasury: {
          active: false,
          balance: 0,
          pendingBalance: 0,
          financialAccountId: null,
          status: 'not_configured',
          message: 'Stripe Treasury is not available in the serverless environment'
        }
      });
    }

    // ── POST /api/admin/bonus-reserve/adjust ──────────────────────────────
    if (method === 'POST' && path === 'bonus-reserve/adjust') {
      var amount = body.amount;
      var notes  = (body.notes || '').trim();

      if (typeof amount !== 'number' || amount === 0) {
        return utils.errorResponse(400, 'amount must be a non-zero number');
      }
      if (!notes) {
        return utils.errorResponse(400, 'notes are required for adjustments');
      }

      var latestResult = await supabase
        .from('bonus_reserve_transactions')
        .select('balance_after')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      var currentBal = parseFloat(latestResult.data && latestResult.data.balance_after || 0);
      var newBal     = currentBal + amount;

      var txResult = await supabase
        .from('bonus_reserve_transactions')
        .insert({ transaction_type: 'adjustment', amount, balance_after: newBal, notes, created_by: user.id })
        .select()
        .single();
      if (txResult.error) throw txResult.error;

      return utils.successResponse({
        success:     true,
        transaction: txResult.data,
        new_balance: newBal,
        message:     'Reserve balance adjusted by $' + (amount > 0 ? '+' : '') + amount.toFixed(2)
      });
    }

    return utils.errorResponse(404, 'Unknown route: ' + method + ' ' + path);

  } catch (err) {
    console.error('[admin-founders] error on', path, ':', err.message);
    return utils.errorResponse(500, 'Something went wrong');
  }
};
