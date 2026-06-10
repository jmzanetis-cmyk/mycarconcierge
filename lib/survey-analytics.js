'use strict';

const SURVEY_ANALYTICS_KEYS = [
  'provider_discovery',
  'provider_satisfaction',
  'service_frequency',
  'service_types',
  'pricing_confidence',
  'estimate_surprise',
  'quote_behavior',
  'provider_honesty',
  'provider_vetting',
  'history_tracking',
  'maintenance_avoidance',
  'job_status_updates',
  'maintenance_reminders',
  'competitive_bids',
  'app_usage',
  'payment_comfort',
  'dispute_history',
  'annual_spend',
  'decision_maker',
  'near_term_need',
  'top_priority',
  'vehicle_count'
];

const SURVEY_ANALYTICS_SELECT = SURVEY_ANALYTICS_KEYS.concat(['created_at']).join(', ');

const DEFAULT_SAMPLE_LIMIT = 1000;

function isMissingColumnError(err) {
  if (!err) return false;
  if (err.code === '42703' || err.code === 'PGRST204') return true;
  if (err.message && (err.message.includes('does not exist') || err.message.includes('schema cache'))) return true;
  return false;
}

async function computeSurveyAnalytics(supabase, { sampleLimit = DEFAULT_SAMPLE_LIMIT, now = Date.now() } = {}) {
  let rows = [];
  let total = 0;
  let schemaPending = false;

  const countResult = await supabase
    .from('survey_responses')
    .select('*', { count: 'exact', head: true });
  const cErr = countResult.error;
  if (cErr) {
    if (cErr.code === '42P01') {
      schemaPending = true;
    } else {
      return { error: { code: cErr.code, message: cErr.message } };
    }
  } else {
    total = countResult.count || 0;
  }

  if (!schemaPending) {
    const sampleResult = await supabase
      .from('survey_responses')
      .select(SURVEY_ANALYTICS_SELECT)
      .order('created_at', { ascending: false })
      .limit(sampleLimit);
    const qErr = sampleResult.error;
    if (qErr) {
      if (isMissingColumnError(qErr)) {
        schemaPending = true;
      } else {
        return { error: { code: qErr.code, message: qErr.message } };
      }
    } else {
      rows = sampleResult.data || [];
    }
  }

  const agg = {};
  for (const k of SURVEY_ANALYTICS_KEYS) agg[k] = {};
  for (const r of rows) {
    for (const k of SURVEY_ANALYTICS_KEYS) {
      if (r[k]) agg[k][r[k]] = (agg[k][r[k]] || 0) + 1;
    }
  }
  const weekAgo = now - 7 * 86400000;
  const recentWeek = rows.filter(r => new Date(r.created_at).getTime() > weekAgo).length;

  const payload = {
    total,
    recent_week: recentWeek,
    schema_pending: schemaPending,
    sample_size: rows.length
  };
  for (const k of SURVEY_ANALYTICS_KEYS) payload['by_' + k] = agg[k];
  return { payload };
}

module.exports = {
  SURVEY_ANALYTICS_KEYS,
  SURVEY_ANALYTICS_SELECT,
  DEFAULT_SAMPLE_LIMIT,
  computeSurveyAnalytics
};
