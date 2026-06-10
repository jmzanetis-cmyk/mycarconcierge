// ============================================================================
// apollo-admin
//
// Privileged endpoints that back the Apollo discovery controls in the
// Outreach engine control panel (www/admin-outreach.js renderEngineControlPanel).
// Before this existed, the panel referenced an `apolloConfig` global that was
// never loaded and an `enableApolloDiscovery()` button handler that didn't
// exist — so admin could see "Discovery Stalled" but had no working button to
// investigate or restart.
//
// Routes (mounted at /.netlify/functions/apollo-admin/* and proxied from
// /api/admin/apollo/* via www/_redirects):
//
//   GET  /config       -> { config: <apollo_config block> }
//   PUT  /config       { ...partial updates }     (merges into apollo_config)
//   POST /run-now      {}                         (triggers one discovery cycle)
//
// All routes require the x-admin-password (or x-admin-token) header to match
// ADMIN_PASSWORD. All routes use the service-role Supabase client so they
// bypass RLS, and every action writes an admin_audit_log row.
//
// Modeled on netlify/functions/provider-admin.js.
// ============================================================================

const {
  createSupabaseClient,
  getApolloConfig,
  saveApolloConfig,
  runApolloDiscoveryCycle
} = require('./outreach-engine-core');
const utils = require('./utils');

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token, x-admin-token, X-Admin-Password, x-admin-password',
      'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS'
    },
    body: typeof data === 'string' ? data : JSON.stringify(data)
  };
}

// Best-effort audit row writer. Audit failures must not block the privileged
// action they describe (the action already happened).
async function audit(supabase, row) {
  try {
    await supabase.from('admin_audit_log').insert(row);
  } catch (e) {
    console.error('[apollo-admin] audit write failed:', e.message);
  }
}

// Whitelist of fields the admin UI may persist into apollo_config. Anything
// outside this set is dropped so a malformed PUT can't accidentally clobber
// internal lock state (running_since, running_nonce) or rotation indices.
// search_profiles is intentionally NOT exposed — it's a large nested array
// best edited in code review, not via prompt() in the browser.
const ALLOWED_CONFIG_KEYS = new Set([
  'enabled',
  'interval_hours',
  'per_page',
  'auto_enrich',
  'enrich_batch',
  'instantly_auto_sync',
  'instantly_provider_campaign_id',
  // Dashboard tab also exposes the first (Provider) search profile's
  // cities/titles/industries as editable fields. We accept them at the
  // top level here and the handler routes them into search_profiles[0]
  // so the rotated cycle actually picks up the changes.
  'cities',
  'titles',
  'industries',
  // SMS digest fields surfaced by the dashboard's "Save Notifications"
  // button. Stored on apollo_config so the digest scheduler can read
  // them without a new table; null/empty phone disables SMS.
  'admin_phone',
  'digest_hour_utc'
]);

function parseStringList(value) {
  if (Array.isArray(value)) {
    return value.map(s => String(s).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  }
  return null;
}

function sanitizeConfigUpdates(body) {
  const out = {};
  const errors = [];
  for (const key of Object.keys(body || {})) {
    if (!ALLOWED_CONFIG_KEYS.has(key)) continue;
    const value = body[key];
    switch (key) {
      case 'enabled':
      case 'auto_enrich':
      case 'instantly_auto_sync':
        if (typeof value !== 'boolean') {
          errors.push(`${key} must be a boolean`);
        } else {
          out[key] = value;
        }
        break;
      case 'interval_hours': {
        const n = Number(value);
        if (!isFinite(n) || n < 1 || n > 168) {
          errors.push('interval_hours must be a number between 1 and 168');
        } else {
          out[key] = n;
        }
        break;
      }
      case 'per_page': {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 100) {
          errors.push('per_page must be an integer between 1 and 100');
        } else {
          out[key] = n;
        }
        break;
      }
      case 'enrich_batch': {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 0 || n > 100) {
          errors.push('enrich_batch must be an integer between 0 and 100');
        } else {
          out[key] = n;
        }
        break;
      }
      case 'instantly_provider_campaign_id':
        if (value === null || value === '') {
          out[key] = null;
        } else if (typeof value !== 'string' || value.length > 200) {
          errors.push('instantly_provider_campaign_id must be a string (max 200 chars) or null');
        } else {
          out[key] = value.trim();
        }
        break;
      case 'admin_phone':
        if (value === null || value === '') {
          out[key] = null;
        } else if (typeof value !== 'string') {
          errors.push('admin_phone must be a string or null');
        } else {
          const trimmed = value.trim();
          // E.164: leading +, 1-15 digits. Empty after trim → disable SMS.
          if (trimmed === '') {
            out[key] = null;
          } else if (!/^\+[1-9]\d{1,14}$/.test(trimmed)) {
            errors.push('admin_phone must be in E.164 format (e.g. +12015550100) or empty');
          } else {
            out[key] = trimmed;
          }
        }
        break;
      case 'digest_hour_utc': {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 0 || n > 23) {
          errors.push('digest_hour_utc must be an integer between 0 and 23');
        } else {
          out[key] = n;
        }
        break;
      }
      case 'cities':
      case 'titles':
      case 'industries': {
        const list = parseStringList(value);
        if (list === null) {
          errors.push(`${key} must be an array of strings or a delimited string`);
        } else if (list.length > 200) {
          errors.push(`${key} cannot have more than 200 entries`);
        } else {
          out[key] = list;
        }
        break;
      }
      default:
        break;
    }
  }
  return { updates: out, errors };
}

// Apollo API headers — used by /status, /search, /enrich.
function apolloApiHeaders() {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'X-Api-Key': process.env.APOLLO_API_KEY
  };
}

// Apply cities/titles/industries from the dashboard form into the first
// (Providers) search profile so the rotated cycle picks them up. Pulled
// out so PUT /config can splice them into the existing config object
// without clobbering the second (Investors) profile.
function applyProfileOverrides(currentCfg, updates) {
  const hasOverrides = ['cities', 'titles', 'industries'].some(k =>
    Object.prototype.hasOwnProperty.call(updates, k)
  );
  if (!hasOverrides) return updates;

  const profiles = Array.isArray(currentCfg.search_profiles) && currentCfg.search_profiles.length > 0
    ? currentCfg.search_profiles.map(p => ({ ...p }))
    : [{ name: 'Providers', lead_type: 'provider', cities: [], titles: [], industries: [] }];

  const target = profiles[0];
  if (Object.prototype.hasOwnProperty.call(updates, 'cities')) target.cities = updates.cities;
  if (Object.prototype.hasOwnProperty.call(updates, 'titles')) target.titles = updates.titles;
  if (Object.prototype.hasOwnProperty.call(updates, 'industries')) target.industries = updates.industries;

  const stripped = { ...updates };
  delete stripped.cities;
  delete stripped.titles;
  delete stripped.industries;
  stripped.search_profiles = profiles;
  return stripped;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, '');

  const supabase = createSupabaseClient();
  if (!supabase) return jsonResponse(500, { error: 'Database not configured' });

  const admin = await utils.authenticateBearerAdmin(event, supabase);
  if (!admin) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  // Strip both the netlify-functions prefix and the /api/admin/apollo proxy
  // prefix so the same handler works from either entry point.
  const route = (event.path || '')
    .replace(/^\/?\.netlify\/functions\/apollo-admin\/?/, '')
    .replace(/^\/?api\/admin\/apollo\/?/, '')
    .replace(/^\/+/, '');
  const method = event.httpMethod;
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); }
    catch { return jsonResponse(400, { error: 'invalid JSON body' }); }
  }

  try {
    if (route === 'config' && method === 'GET') {
      const config = await getApolloConfig(supabase);
      // Strip the lock fields from the response — they're internal mechanics,
      // not something admin should see or edit. Keep last_run/last_successful_*
      // because the UI badge needs them to compute "stalled" vs "active".
      const { running_since, running_nonce, ...visibleConfig } = config;
      return jsonResponse(200, { config: visibleConfig });
    }

    if (route === 'config' && method === 'PUT') {
      const { updates, errors } = sanitizeConfigUpdates(body);
      if (errors.length > 0) {
        return jsonResponse(400, { error: 'invalid config', details: errors });
      }
      if (Object.keys(updates).length === 0) {
        return jsonResponse(400, { error: 'no valid config fields supplied' });
      }
      // Splice cities/titles/industries into search_profiles[0] before save
      // so the form-level fields actually flow through to the rotated cycle.
      const currentCfg = await getApolloConfig(supabase);
      const finalUpdates = applyProfileOverrides(currentCfg, updates);
      const newCfg = await saveApolloConfig(supabase, finalUpdates);
      await audit(supabase, {
        action: 'update_apollo_config',
        target_type: 'engine_state',
        metadata: { updates },
        performed_by: 'admin'
      });
      const { running_since, running_nonce, ...visibleConfig } = newCfg;
      return jsonResponse(200, { config: visibleConfig, updated_keys: Object.keys(updates) });
    }

    // GET /status — verify the Apollo API key works and surface rate-limit
    // counters. The dashboard uses this to populate the status bar at the
    // top of the Apollo tab so admin can tell at a glance whether they
    // still have credits / requests left for the day.
    if (route === 'status' && method === 'GET') {
      if (!process.env.APOLLO_API_KEY) {
        return jsonResponse(503, { ok: false, error: 'APOLLO_API_KEY not configured' });
      }
      try {
        const resp = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
          method: 'POST',
          headers: apolloApiHeaders(),
          body: JSON.stringify({ page: 1, per_page: 1, person_titles: ['owner'], q_organization_keyword_tags: ['auto repair'] })
        });
        const text = await resp.text();
        let data = {};
        try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }

        const minuteLimit = resp.headers.get('x-minute-requests-left') || resp.headers.get('x-rate-limit-requests-left-minute');
        const hourLimit = resp.headers.get('x-hour-requests-left') || resp.headers.get('x-rate-limit-requests-left-hour');
        const dayLimit = resp.headers.get('x-day-requests-left') || resp.headers.get('x-rate-limit-requests-left-day');
        const credits = resp.headers.get('x-credits-remaining') || data.credits_remaining;

        return jsonResponse(200, {
          ok: resp.ok,
          http_status: resp.status,
          total_results: data.pagination?.total_entries || 0,
          minute_requests_left: minuteLimit != null ? parseInt(minuteLimit, 10) : undefined,
          hour_requests_left: hourLimit != null ? parseInt(hourLimit, 10) : undefined,
          day_requests_left: dayLimit != null ? parseInt(dayLimit, 10) : undefined,
          credits: credits != null ? parseInt(credits, 10) : undefined,
          error: resp.ok ? undefined : (data.error || data.message || `HTTP ${resp.status}`)
        });
      } catch (err) {
        return jsonResponse(500, { ok: false, error: err.message });
      }
    }

    // POST /search — manual Apollo search with optional inline enrichment.
    // Mirrors the dev-only handler in www/server.js (~L34536) so the
    // dashboard's "Search Apollo" button works in production. Inserts
    // discovered contacts into outreach_leads, dedup'd by apollo_id then
    // email so re-running a search is idempotent.
    if (route === 'search' && method === 'POST') {
      if (!process.env.APOLLO_API_KEY) {
        return jsonResponse(503, { error: 'APOLLO_API_KEY not configured' });
      }
      try {
        const {
          cities = [],
          titles = ['owner', 'co-owner', 'founder', 'president', 'ceo', 'manager', 'operator', 'proprietor'],
          industries = ['automotive', 'auto repair', 'car repair'],
          per_page = 25,
          page = 1,
          enrich = false
        } = body || {};

        const searchPayload = {
          page,
          per_page: Math.min(Number(per_page) || 25, 100),
          person_titles: titles,
          q_organization_keyword_tags: industries
        };
        if (Array.isArray(cities) && cities.length > 0) searchPayload.person_locations = cities;

        const apolloHeaders = apolloApiHeaders();
        const searchResp = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
          method: 'POST',
          headers: apolloHeaders,
          body: JSON.stringify(searchPayload)
        });
        const searchData = await searchResp.json().catch(() => ({}));
        if (!searchResp.ok) {
          return jsonResponse(searchResp.status, { error: searchData.error || searchData.message || `Apollo search failed (HTTP ${searchResp.status})` });
        }

        const people = searchData.people || [];
        const results = [];
        for (const person of people) {
          let email = person.email || null;
          let phone = person.phone_numbers?.[0]?.sanitized_number || null;
          const org = person.organization || {};
          const name = person.name || `${person.first_name || ''} ${person.last_name || ''}`.trim() || null;
          const website = org.website_url || null;
          const domain = website ? website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : null;

          if (enrich && !email && (person.id || domain)) {
            try {
              const enrichPayload = { reveal_personal_emails: true };
              if (person.id) enrichPayload.id = person.id;
              if (name) enrichPayload.name = name;
              if (org.name) enrichPayload.organization_name = org.name;
              if (domain) enrichPayload.domain = domain;
              const enrichResp = await fetch('https://api.apollo.io/api/v1/people/match', {
                method: 'POST',
                headers: apolloHeaders,
                body: JSON.stringify(enrichPayload)
              });
              if (enrichResp.ok) {
                const enrichData = await enrichResp.json();
                email = enrichData.person?.email || email;
                phone = phone || enrichData.person?.phone_numbers?.[0]?.sanitized_number;
              }
            } catch { /* enrichment is best-effort */ }
            await new Promise(r => setTimeout(r, 200));
          }

          const apolloPersonId = person.id || null;
          const leadData = {
            name: name || org.name || 'Unknown',
            email: email || null,
            phone: phone || org.phone || null,
            company: org.name || null,
            type: 'Provider',
            source: 'Apollo',
            location: [person.city, person.state].filter(Boolean).join(', ') || null,
            status: email ? 'new' : 'email_unknown',
            score: email ? 70 : 30,
            apollo_id: apolloPersonId || null,
            linkedin_url: person.linkedin_url || null,
            website: website || null
          };

          let existing = null;
          if (apolloPersonId) {
            const { data: byId } = await supabase.from('outreach_leads').select('id, email').eq('apollo_id', apolloPersonId).maybeSingle();
            existing = byId;
          }
          if (!existing && email) {
            const { data: byEmail } = await supabase.from('outreach_leads').select('id, email').eq('email', email).maybeSingle();
            existing = byEmail;
          }
          if (!existing) {
            await supabase.from('outreach_leads').insert(leadData);
          } else if (email && !existing.email) {
            await supabase.from('outreach_leads').update({ email, apollo_id: apolloPersonId || undefined, phone: phone || undefined, status: 'new', score: 70 }).eq('id', existing.id);
          }

          results.push({ name: leadData.name, email: email || null, company: leadData.company, title: person.title, location: leadData.location, has_email: !!email });
        }

        await audit(supabase, {
          action: 'apollo_manual_search',
          target_type: 'engine_state',
          metadata: { found: people.length, with_email: results.filter(r => r.has_email).length, page, per_page: searchPayload.per_page },
          performed_by: 'admin'
        });

        return jsonResponse(200, {
          success: true,
          found: people.length,
          with_email: results.filter(r => r.has_email).length,
          added: results.length,
          pagination: searchData.pagination || {},
          results
        });
      } catch (err) {
        console.error('[apollo-admin] search error:', err);
        return jsonResponse(500, { error: err.message });
      }
    }

    // POST /enrich — find verified emails for existing email-less leads.
    // Mirrors www/server.js (~L34659).
    if (route === 'enrich' && method === 'POST') {
      if (!process.env.APOLLO_API_KEY) {
        return jsonResponse(503, { error: 'APOLLO_API_KEY not configured' });
      }
      try {
        const { limit = 10 } = body || {};
        const cap = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 25);
        const { data: leads } = await supabase
          .from('outreach_leads')
          .select('id, name, email, company, website, phone, location, linkedin_url, apollo_id')
          .is('email', null)
          .not('company', 'is', null)
          .neq('status', 'unsubscribed')
          .neq('status', 'bounced')
          .order('score', { ascending: false })
          .limit(cap);

        const apolloHeaders = apolloApiHeaders();
        let enriched = 0;
        let failed = 0;
        const details = [];

        for (const lead of (leads || [])) {
          try {
            const domain = lead.website ? lead.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : null;
            const enrichPayload = { reveal_personal_emails: true };
            if (lead.apollo_id) enrichPayload.id = lead.apollo_id;
            if (lead.name) enrichPayload.name = lead.name;
            if (lead.company) enrichPayload.organization_name = lead.company;
            if (domain) enrichPayload.domain = domain;
            if (lead.linkedin_url) enrichPayload.linkedin_url = lead.linkedin_url;

            const enrichResp = await fetch('https://api.apollo.io/api/v1/people/match', {
              method: 'POST',
              headers: apolloHeaders,
              body: JSON.stringify(enrichPayload)
            });

            if (enrichResp.ok) {
              const enrichData = await enrichResp.json();
              const email = enrichData.person?.email;
              const phone = enrichData.person?.phone_numbers?.[0]?.sanitized_number;
              const apolloId = enrichData.person?.id;
              if (email) {
                await supabase.from('outreach_leads').update({
                  email,
                  phone: phone || lead.phone || null,
                  apollo_id: apolloId || lead.apollo_id || null,
                  status: 'new',
                  score: 75
                }).eq('id', lead.id);
                enriched++;
                details.push({ lead: lead.name || lead.company, email, status: 'enriched' });
              } else {
                failed++;
                details.push({ lead: lead.name || lead.company, status: 'no_email_found' });
              }
            } else {
              failed++;
              details.push({ lead: lead.name || lead.company, status: 'api_error' });
            }
            await new Promise(r => setTimeout(r, 300));
          } catch (leadErr) {
            failed++;
            details.push({ lead: lead.name || lead.company, status: 'error', error: leadErr.message });
          }
        }

        await audit(supabase, {
          action: 'apollo_manual_enrich',
          target_type: 'engine_state',
          metadata: { total: (leads || []).length, enriched, failed },
          performed_by: 'admin'
        });

        return jsonResponse(200, { success: true, total: (leads || []).length, enriched, failed, details });
      } catch (err) {
        console.error('[apollo-admin] enrich error:', err);
        return jsonResponse(500, { error: err.message });
      }
    }

    // GET /enrich-queue — count of email-less leads still eligible for
    // enrichment. The dashboard renders this so admin can decide whether
    // it's worth burning Apollo credits this hour.
    if (route === 'enrich-queue' && method === 'GET') {
      try {
        const { count, error: countErr } = await supabase
          .from('outreach_leads')
          .select('id', { count: 'exact', head: true })
          .is('email', null)
          .not('company', 'is', null)
          .neq('status', 'unsubscribed')
          .neq('status', 'bounced');
        if (countErr) throw new Error(countErr.message);
        return jsonResponse(200, { success: true, pending_enrichment: count || 0 });
      } catch (err) {
        return jsonResponse(500, { error: err.message });
      }
    }

    if (route === 'run-now' && method === 'POST') {
      // Audit FIRST so even crashes during the cycle leave a "tried to run"
      // breadcrumb. The cycle itself logs detailed outcomes into
      // outreach_activity_log via runApolloDiscoveryCycle.
      await audit(supabase, {
        action: 'apollo_run_now',
        target_type: 'engine_state',
        metadata: { triggered_at: new Date().toISOString() },
        performed_by: 'admin'
      });

      const cfgBefore = await getApolloConfig(supabase);
      // Refuse to run when disabled — flipping `enabled` is a separate,
      // auditable action via PUT /config. A silent enable from "Run now"
      // would hide that change from the audit trail.
      if (cfgBefore.enabled !== true) {
        return jsonResponse(409, {
          error: 'Apollo discovery is disabled. Enable it via /config first.',
          result: { skipped: true, reason: 'automation_disabled' }
        });
      }

      // Bypass the "not_due since last_run" guard so admin's manual "Run now"
      // actually runs even when scheduled cadence hasn't elapsed. We null
      // out last_run, then restore it ourselves if the cycle ended up not
      // writing a fresh last_run (e.g., HTTP error before the success path).
      const previousLastRun = cfgBefore.last_run || null;
      await saveApolloConfig(supabase, { last_run: null });

      let result;
      try {
        result = await runApolloDiscoveryCycle(supabase);
      } catch (err) {
        result = { success: false, error: err.message, error_kind: 'handler_exception' };
      }

      // The cycle writes last_run only on the success path. Re-read and, if
      // it wasn't updated, restore the previous value so a failed manual run
      // doesn't reset the scheduled cadence to "due now".
      try {
        const cfgAfter = await getApolloConfig(supabase);
        if (!cfgAfter.last_run && previousLastRun) {
          await saveApolloConfig(supabase, { last_run: previousLastRun });
        }
      } catch (e) {
        console.error('[apollo-admin] last_run restore failed:', e.message);
      }

      return jsonResponse(200, { result });
    }

    if (route === 'audit-log' && method === 'GET') {
      // Recent admin_audit_log rows for Apollo-related actions. Powers the
      // "Recent Apollo Admin Actions" card on the Apollo dashboard tab so
      // operators can see who flipped automation on/off and when manual
      // runs/searches/enrichments were triggered. Filter by ?action= to
      // narrow to a single action type; ?limit= caps rows (max 100).
      const params = event.queryStringParameters || {};
      const APOLLO_ACTIONS = ['update_apollo_config', 'apollo_run_now', 'apollo_manual_search', 'apollo_manual_enrich'];
      let actionFilter = APOLLO_ACTIONS;
      if (params.action && APOLLO_ACTIONS.includes(params.action)) {
        actionFilter = [params.action];
      }
      const limit = Math.min(Math.max(parseInt(params.limit, 10) || 25, 1), 100);
      try {
        const { data, error } = await supabase
          .from('admin_audit_log')
          .select('id,action,target_type,reason,metadata,performed_by,performed_at')
          .in('action', actionFilter)
          .order('performed_at', { ascending: false })
          .limit(limit);
        if (error) throw new Error(error.message);
        return jsonResponse(200, { success: true, rows: data || [], available_actions: APOLLO_ACTIONS });
      } catch (err) {
        return jsonResponse(500, { error: err.message });
      }
    }

    return jsonResponse(404, { error: 'Not found', path: route, method });
  } catch (e) {
    console.error('[apollo-admin] handler error:', e);
    return jsonResponse(500, { error: e.message });
  }
};
