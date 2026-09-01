// ============================================================================
// MCC — Upsell / Additional Work Approval Flow (route dispatcher)
//
// Thin HTTP router. All business logic lives in _shared/upsell-handlers.js
// so both this deployed function and offline test/verification scripts import
// the same handler surface without any test-only exports baked into the
// deployed file.
//
// Routes (mapped in www/_redirects):
//   POST   /api/upsell                          — provider submits an upsell/update request
//   POST   /api/upsell/:id/approve              — member approves; creates manual-capture PI
//   POST   /api/upsell/:id/confirm-authorization — member confirmed card via Stripe.js (reconcile)
//   POST   /api/upsell/:id/decline              — member declines; cancels PI if authorized
//   POST   /api/upsell/:id/respond              — non-money member action (acknowledge/reply/request_call)
//   POST   /api/upsell/:id/suspend-work         — provider suspends work after member miss-window
//   GET    /api/upsell/mine                     — member's own upsell list
//   GET    /api/upsell/for-package/:package_id  — participant view for one job
//
// Capture happens later, inside care-plans.js handleComplete — that handler
// iterates every approved supplemental PI on the same care_plan and captures
// them idempotently. A per-row failure records capture_error + notifies both
// parties but does NOT block the base job's completion.
// ============================================================================

'use strict';

const {
  handleSubmit,
  handleApprove,
  handleConfirmAuthorization,
  handleDecline,
  handleRespond,
  handleSuspendWork,
  handleListMine,
  handleListForPackage,
  supabase,
  json,
} = require('./_shared/upsell-handlers');

async function getUser(event, sb) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { error: json(401, { error: 'Missing token' }) };
  const { data: { user }, error } = await sb.auth.getUser(m[1].trim());
  if (error || !user) return { error: json(401, { error: 'Invalid token' }) };
  return { user };
}

function stripRoute(path) {
  return (path || '').replace(/.*\/api\/upsell\/?/, '').replace(/\/$/, '');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, {});

  const sb = supabase();
  const auth = await getUser(event, sb);
  if (auth.error) return auth.error;

  const route = stripRoute(event.path);
  const segments = route.split('/').filter(Boolean);
  const method = event.httpMethod;

  // GET /api/upsell/mine
  if (method === 'GET' && segments[0] === 'mine') return handleListMine(sb, auth.user);

  // GET /api/upsell/for-package/:package_id
  if (method === 'GET' && segments[0] === 'for-package' && segments[1]) {
    return handleListForPackage(sb, auth.user, segments[1]);
  }

  // POST /api/upsell — submit
  if (method === 'POST' && segments.length === 0) return handleSubmit(event, sb, auth.user);

  // POST /api/upsell/:id/<action>
  if (method === 'POST' && segments[0] && segments[1]) {
    const id = segments[0];
    const action = segments[1];
    switch (action) {
      case 'approve':                return handleApprove(event, sb, auth.user, id);
      case 'confirm-authorization':  return handleConfirmAuthorization(event, sb, auth.user, id);
      case 'decline':                return handleDecline(event, sb, auth.user, id);
      case 'respond':                return handleRespond(event, sb, auth.user, id);
      case 'suspend-work':           return handleSuspendWork(event, sb, auth.user, id);
      default:                       return json(404, { error: 'Unknown action: ' + action });
    }
  }

  return json(405, { error: 'Method not allowed' });
};
