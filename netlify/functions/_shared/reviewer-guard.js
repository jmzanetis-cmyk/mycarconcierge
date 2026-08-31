'use strict';

// isReviewerAccount(supabase, userId) → boolean
//
// True when userId maps (via profiles.email) to an App Store reviewer account.
// Compared case-insensitively against REVIEWER_EMAILS env var (comma-separated)
// with a hardcoded fallback so the guard works even if the env var is unset.
//
// Fails CLOSED to false: a null/missing userId, a missing profile, or a DB
// error all return false so a real user's request is never blocked by a
// guard-side crash. Callers should treat true as "skip the side effect" and
// false as "proceed normally" — the guard must never *cause* a failure.
//
// Env-var format: REVIEWER_EMAILS="demo@example.com,reviewer-a@example.com"
// Whitespace and empty entries are tolerated. Case-insensitive match on both
// sides. If unset (typical for local/dev), the hardcoded fallback covers the
// three App Store reviewer accounts seeded by scripts/seed-app-store-reviewer.js.

var DEFAULT_REVIEWER_EMAILS = [
  'demo@mycarconcierge.com',
  'reviewer-member@mycarconcierge.com',
  'reviewer-provider@mycarconcierge.com'
];

function getReviewerEmailSet() {
  var raw = process.env.REVIEWER_EMAILS;
  var list;
  if (raw && typeof raw === 'string' && raw.trim().length > 0) {
    list = raw.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  } else {
    list = DEFAULT_REVIEWER_EMAILS.map(function (s) { return s.toLowerCase(); });
  }
  return new Set(list);
}

async function isReviewerAccount(supabase, userId) {
  if (!userId || !supabase) return false;
  try {
    var result = await supabase
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .maybeSingle();
    if (result.error || !result.data || !result.data.email) return false;
    var email = String(result.data.email).trim().toLowerCase();
    return getReviewerEmailSet().has(email);
  } catch (_e) {
    return false;
  }
}

// isReviewerEmail(email) — synchronous variant for call sites where the
// email is already in hand (e.g. Twilio SMS resolves recipient by phone
// number → profile → email, no need for a second lookup).
function isReviewerEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return getReviewerEmailSet().has(email.trim().toLowerCase());
}

module.exports = { isReviewerAccount, isReviewerEmail };
