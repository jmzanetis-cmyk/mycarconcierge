// facebook-deletion-scheduled.js
//
// Daily safety-net for Facebook data deletion requests that were not
// immediately processed (e.g., the webhook handler timed out or errored).
//
// Queries fb_data_deletion_requests WHERE status IN ('pending', 'error')
// and retries the account-deletion cascade for each. Marks rows 'completed'
// on success or 'error' on failure.
//
// Schedule: 03:00 UTC daily (before the anthropic-health run at 04:00).
// Auth: scheduled invocation only (no public HTTP endpoint needed).

'use strict';

let utils = require('./utils');
let core  = require('./account-deletion-core');

exports.handler = async function (event) {
  let supabase = utils.createSupabaseClient();
  if (!supabase) {
    console.error('[facebook-deletion-scheduled] Supabase not configured');
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no_database' }) };
  }

  // Fetch pending and previously-errored rows (limit 50 per run to stay within timeout)
  let { data: requests, error } = await supabase
    .from('fb_data_deletion_requests')
    .select('id, facebook_user_id, user_id, confirmation_code, status')
    .in('status', ['pending', 'error'])
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) {
    console.error('[facebook-deletion-scheduled] query error:', error.message);
    return { statusCode: 200, body: JSON.stringify({ error: error.message }) };
  }

  let processed = 0, succeeded = 0, failed = 0, skipped = 0;

  for (let req of (requests || [])) {
    processed++;

    // Resolve user_id if not already set (may have been null at webhook time)
    let userId = req.user_id;
    if (!userId && req.facebook_user_id) {
      let { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('facebook_user_id', req.facebook_user_id)
        .maybeSingle();
      userId = profile?.id || null;
    }

    if (!userId) {
      // No MCC user linked — mark not_found so we stop retrying
      await supabase
        .from('fb_data_deletion_requests')
        .update({ status: 'not_found', completed_at: new Date().toISOString() })
        .eq('id', req.id)
        .catch(() => {});
      skipped++;
      continue;
    }

    try {
      let result = await core.performAccountDeletion(supabase, userId, 'facebook_callback');
      let update = result?.success
        ? { status: 'completed', completed_at: new Date().toISOString(), error_message: null }
        : { status: 'error', completed_at: new Date().toISOString(), error_message: (result?.error || 'Unknown error').slice(0, 500) };
      await supabase.from('fb_data_deletion_requests').update(update).eq('id', req.id).catch(() => {});
      if (result?.success) succeeded++;
      else failed++;
    } catch (err) {
      console.error('[facebook-deletion-scheduled] cascade error for', req.id, ':', err.message);
      await supabase
        .from('fb_data_deletion_requests')
        .update({ status: 'error', error_message: err.message.slice(0, 500), completed_at: new Date().toISOString() })
        .eq('id', req.id)
        .catch(() => {});
      failed++;
    }
  }

  let summary = { processed, succeeded, failed, skipped };
  console.log('[facebook-deletion-scheduled] done:', JSON.stringify(summary));
  return { statusCode: 200, body: JSON.stringify(summary) };
};
