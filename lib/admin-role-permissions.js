// lib/admin-role-permissions.js
//
// Shared source of truth for which admin-panel nav sections (data-section
// values in www/admin.html) each admin role can see. Extracted 2026-09-03
// (Team Login build) so both server.js (the legacy dev-only admin server,
// which originated this map) and the real Netlify Functions that gate
// team-member access (netlify/functions/utils.js's authenticateAdminSection,
// used by admin-team-login.js and every admin function retrofitted for
// team-login access) read the exact same list — no drift between "what the
// UI shows" and "what the backend actually allows".
//
// super_admin has every one of the 44 real sections (Jordan's own
// super-admin login bypasses this map entirely via applyRolePermissions(null)
// in www/admin.js, so this entry only matters once a super_admin role is
// ever granted through Team Login rather than the password login).
//
// marketing is scoped to Jordan's explicit instructions (2026-09-03): today
// it's him plus one marketing/communications hire, who should see survey/lead
// data and marketing tools only — explicitly NOT agreements (where the Chris
// contract lives), payments, disputes, refunds, commission-payouts, or any
// founder-related section.
//
// crm_manager / operations / finance / support are placeholders — nobody is
// in those seats yet, so these are left as originally defined rather than
// guessed at; define them for real once Jordan actually hires for a role.
// A role having a section here is necessary but not sufficient for backend
// access: netlify/functions/utils.js's authenticateAdminSection() is what
// actually enforces this map against a caller's token, and only the admin
// Netlify functions that have been explicitly retrofitted to call it check
// it at all — every other admin function still hard-requires
// profiles.role === 'admin' via authenticateBearerAdmin, rejecting every
// team-member role outright. See that file for the current retrofitted list.
const ADMIN_ROLE_PERMISSIONS = {
  super_admin: ['dashboard', 'analytics', 'applications', 'pilot-applications', 'member-founders', 'commission-payouts', 'providers', 'violations', 'car-reviews', 'packages', 'payments', 'disputes', 'refunds', 'registration-verifications', 'tickets', 'ai-chat-insights', 'members', 'user-roles', 'user-management', 'agreements', 'merch-manager', 'crm', 'documents', 'settings', 'team-management', 'marketing-outreach', 'active-drivers', 'agent-fleet', 'ai-ops', 'api-usage', 'audit-log', 'bgc-dashboard', 'car-clubs', 'driver-applications', 'driver-payouts', 'feature-flags', 'member-surveys', 'referrals', 'saas-subscriptions', 'sms-log', 'survey-analytics', 'traffic', 'transport', 'white-label'],
  crm_manager: ['dashboard', 'crm'],
  marketing: ['dashboard', 'crm', 'ai-chat-insights', 'analytics', 'merch-manager', 'marketing-outreach', 'traffic', 'survey-analytics', 'member-surveys'],
  operations: ['dashboard', 'analytics', 'applications', 'providers', 'violations', 'car-reviews', 'packages', 'members', 'user-roles', 'user-management', 'registration-verifications'],
  finance: ['dashboard', 'analytics', 'payments', 'disputes', 'refunds', 'commission-payouts', 'pilot-applications', 'member-founders'],
  support: ['dashboard', 'tickets', 'ai-chat-insights', 'members', 'user-management', 'violations']
};

module.exports = ADMIN_ROLE_PERMISSIONS;
