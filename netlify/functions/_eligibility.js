// ============================================================================
// netlify/functions/_eligibility.js
// Shared bid-eligibility helpers (Step 1d-3 v1; Phase 2.6.1 rewrite).
//
// IMPORTED BY:
//   - plan-bids.js          — the bid gate (server-side; rejects bids that
//                             don't pass service-fit)
//   - provider-packages.js  — the provider open-jobs board (filters the list
//                             the provider sees)
//   - job-board.js          — the standalone Job Board feed
//   - care-plans.js         — the match-preferences "preview" counter
//
// CRITICAL: every consumer MUST use the same function. Drift between the
// gate and the boards produces the worst possible UX — "I see this job on
// my board but get 403 when I click bid", or vice versa. This file is the
// single source of truth for the DECISION; _taxonomy.js is the single
// source of truth for the VOCABULARY.
//
// 2.6.1: the 8 legacy "match buckets" are gone. Plans carry explicit
// care_plans.categories (20 slugs, written by the member form and backfilled
// by migration 20260920a); provider_match_preferences.match_categories uses
// the same 20 slugs. planCategories() handles legacy rows (empty categories
// → classify service_types) and providerCategories() handles legacy
// preference rows, so nothing changes for data written before the migration.
//
// Underscore prefix signals "not a Netlify handler". esbuild bundles it into
// each consumer at build time; no separate function deploys.
// ============================================================================
'use strict';

const tax = require('./_taxonomy');

// Back-compat alias. Historically returned the 8 buckets; now returns the
// 20-slug categories derived from a legacy service_types array. Kept so any
// caller not yet migrated to planCategories() still compiles and still
// agrees with the gate.
function serviceTypesToBuckets(types) {
  return tax.serviceTypesToCategories(types);
}

// Effective categories for a plan row (explicit column first, legacy fallback).
function planCategories(plan) {
  return tax.planCategories(plan);
}

// Effective categories for a provider's stored preferences.
function providerCategories(matchCategories) {
  return tax.expandProviderCategories(matchCategories);
}

// THE decision. Same semantics as before:
//   - plan with no category signal → eligible for everyone (permissive)
//   - provider with no declared categories → not eligible (callers decide
//     whether that's 403 categories_required or an empty board)
//   - otherwise any overlap
function isServiceFit(plan, matchCategories) {
  return tax.hasCategoryOverlap(planCategories(plan), providerCategories(matchCategories));
}

module.exports = {
  serviceTypesToBuckets,
  planCategories,
  providerCategories,
  isServiceFit,
  CATEGORIES: tax.CATEGORIES,
};
