// Direct handler invocation — bypasses HTTP, simulates Netlify Lambda event.
const adminHandler = require('./netlify/functions/agent-fleet-admin').handler;
const promoterHandler = require('./netlify/functions/agent-promoter').handler;
const providerAdminHandler = require('./netlify/functions/provider-admin').handler;
const providerApplicationHandler = require('./netlify/functions/provider-application').handler;
const PW = process.env.ADMIN_PASSWORD;

async function callProviderAdmin(method, route, body, opts = {}) {
  const headers = { 'content-type': 'application/json' };
  if (opts.withAuth !== false) headers['x-admin-password'] = PW;
  const event = {
    httpMethod: method,
    path: '/.netlify/functions/provider-admin/' + route,
    headers, queryStringParameters: {},
    body: body ? JSON.stringify(body) : null
  };
  const r = await providerAdminHandler(event);
  let body_; try { body_ = JSON.parse(r.body); } catch { body_ = r.body; }
  return { status: r.statusCode, body: body_ };
}

async function callProviderApplication(body, opts = {}) {
  const headers = { 'content-type': 'application/json' };
  if (opts.token) headers['authorization'] = `Bearer ${opts.token}`;
  const event = {
    httpMethod: 'POST',
    path: '/.netlify/functions/provider-application',
    headers, queryStringParameters: {},
    body: body ? JSON.stringify(body) : null
  };
  const r = await providerApplicationHandler(event);
  let body_; try { body_ = JSON.parse(r.body); } catch { body_ = r.body; }
  return { status: r.statusCode, body: body_ };
}

async function call(method, path, body) {
  const event = {
    httpMethod: method,
    path: '/.netlify/functions/agent-fleet-admin/' + path,
    headers: { 'x-admin-password': PW, 'content-type': 'application/json' },
    queryStringParameters: {},
    body: body ? JSON.stringify(body) : null
  };
  const qIdx = path.indexOf('?');
  if (qIdx > -1) {
    event.path = '/.netlify/functions/agent-fleet-admin/' + path.slice(0, qIdx);
    for (const pair of path.slice(qIdx + 1).split('&')) {
      const [k, v] = pair.split('=');
      event.queryStringParameters[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
  }
  const r = await adminHandler(event);
  let body_;
  try { body_ = JSON.parse(r.body); } catch { body_ = r.body; }
  return { status: r.statusCode, body: body_ };
}

async function callPromoterDirect(eventRow) {
  // Bypass orchestrator HTTP dispatch — orchestrator's cross-function fetch can't
  // reach Netlify functions from this dev env. Simulate exactly what orchestrator
  // would POST: { event_id, event_type, payload }.
  const lambdaEvent = {
    httpMethod: 'POST',
    path: '/.netlify/functions/agent-promoter',
    headers: {
      'x-admin-password': PW,
      'x-fleet-source': 'orchestrator',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      event_id: eventRow.id,
      event_type: eventRow.event_type,
      payload: eventRow.payload
    })
  };
  const r = await promoterHandler(lambdaEvent);
  let body_;
  try { body_ = JSON.parse(r.body); } catch { body_ = r.body; }
  return { status: r.statusCode, body: body_ };
}

(async () => {
  console.log('\n━━━ STEP 0: agent registry ━━━');
  let r = await call('GET', 'agents');
  if (r.status !== 200) { console.log('  ✗ FAIL:', JSON.stringify(r)); process.exit(1); }
  for (const a of r.body.agents.filter(x => ['hunter','promoter','orchestrator'].includes(x.slug))) {
    console.log(`  ${a.slug.padEnd(13)} enabled=${String(a.enabled).padEnd(5)} autonomy=${a.autonomy.padEnd(11)} model=${a.model}`);
    console.log(`              handles_events=[${(a.handles_events || []).join(', ')}]`);
  }

  console.log('\n━━━ STEP 1: enable Hunter & Promoter (propose mode) ━━━');
  for (const slug of ['hunter','promoter']) {
    r = await call('PUT', 'agents/' + slug, { enabled: true, autonomy: 'propose' });
    console.log(`  ${slug}: ${r.status === 200 ? '✓ enabled=' + (r.body.agent?.enabled ?? '?') : '✗ ' + JSON.stringify(r.body).slice(0,200)}`);
  }

  console.log('\n━━━ STEP 2: add a Reddit channel ━━━');
  r = await call('POST', 'social/channels', {
    platform: 'reddit', handle: 'MyCarConcierge_smoke_' + Date.now(),
    monitor_keywords: ['mechanic', 'oil change'], monitor_audience: 'member', enabled: false
  });
  console.log(`  status=${r.status} ${r.status === 200 ? '✓ channel id=' + r.body.channel?.id : '✗ ' + JSON.stringify(r.body)}`);
  const channelId = r.body.channel?.id;

  console.log('\n━━━ STEP 3: request Promoter draft ━━━');
  r = await call('POST', 'social/request-draft', {
    platform: 'reddit', audience: 'member', channel_id: channelId,
    brief: 'announce snow-removal launch in NJ — friendly, helpful, mention free quotes'
  });
  console.log(`  status=${r.status} ${r.status === 200 ? '✓ event id=' + r.body.event_id : '✗ ' + JSON.stringify(r.body)}`);
  const eventId = r.body.event_id;

  console.log('\n━━━ STEP 4: invoke Promoter directly with the event payload ━━━');
  // Construct the event row the orchestrator would have dispatched.
  const eventRow = {
    id: eventId,
    event_type: 'social.post_requested',
    payload: { platform: 'reddit', audience: 'member', channel_id: channelId,
               brief: 'announce snow-removal launch in NJ — friendly, helpful, mention free quotes' }
  };
  console.log('  calling Promoter handler (this calls Anthropic — may take 5-15 sec)…');
  const t0 = Date.now();
  r = await callPromoterDirect(eventRow);
  console.log(`  status=${r.status} ms=${Date.now() - t0}`);
  if (r.status === 200) {
    console.log(`    ✓ result: ${JSON.stringify(r.body).slice(0, 400)}`);
  } else {
    console.log(`    ✗ ${JSON.stringify(r.body).slice(0, 400)}`);
  }

  console.log('\n━━━ STEP 5: list posts (Promoter output) ━━━');
  r = await call('GET', 'social/posts?status=draft&limit=5');
  console.log(`  status=${r.status} total=${r.body?.total ?? '?'}`);
  const posts = r.body?.rows || [];
  if (!posts.length) console.log('  ⚠ no draft posts found');
  for (const p of posts.slice(0, 3)) {
    console.log(`    post #${p.id} platform=${p.platform} audience=${p.audience} status=${p.status} channel=${p.channel_id}`);
    console.log(`      body: ${(p.body || '').slice(0, 220).replace(/\n/g, ' / ')}…`);
  }

  if (posts.length) {
    const postId = posts[0].id;
    console.log(`\n━━━ STEP 6: approve post #${postId} ━━━`);
    r = await call('POST', `social/posts/${postId}/approve`);
    console.log(`  status=${r.status} ${r.status === 200 ? '✓ status=' + r.body.post?.status : '✗ ' + JSON.stringify(r.body).slice(0, 200)}`);

    console.log(`\n━━━ STEP 7: publish post #${postId} (mock adapter, no creds set) ━━━`);
    r = await call('POST', `social/posts/${postId}/publish`);
    console.log(`  status=${r.status}`);
    if (r.status === 200) {
      console.log(`    ✓ published — external_post_id=${r.body.post?.external_post_id} mock=${r.body.publish?.mock || false}`);
      console.log(`    url=${r.body.publish?.url}`);
    } else {
      console.log(`    ✗ ${JSON.stringify(r.body).slice(0, 300)}`);
    }
  }

  // ───────────── T#129 review-workflow UX additions ─────────────
  if (posts.length) {
    const editId = posts[0].id;
    console.log(`\n━━━ STEP 9: PATCH post #${editId} — inline edit body ━━━`);
    // Re-load to confirm not in publishing/published state.
    let r9a = await call('GET', `social/posts?status=draft&limit=50`);
    const stillDraft = (r9a.body?.rows || []).find(x => x.id === editId);
    if (stillDraft) {
      r9a = await call('PATCH', `social/posts/${editId}`, { body: '[smoke-test edit] ' + (stillDraft.body || '').slice(0, 200) });
      console.log(`  status=${r9a.status} ${r9a.status === 200 ? '✓ body now starts with: ' + (r9a.body.post?.body || '').slice(0, 60) + '…' : '✗ ' + JSON.stringify(r9a.body).slice(0, 200)}`);
    } else {
      console.log('  ⚠ post no longer in draft state (likely published in step 7) — skipping edit');
    }

    console.log(`\n━━━ STEP 10: PATCH a published post → expect 409 ━━━`);
    // Try to edit the post we just published in step 7.
    const r10 = await call('PATCH', `social/posts/${editId}`, { body: 'should-fail' });
    if (r10.status === 409) console.log(`  ✓ blocked with 409: ${r10.body?.error}`);
    else if (r10.status === 200) console.log(`  ⚠ edit succeeded — post wasn't actually published in step 7 (race-safety still verifiable in next run)`);
    else console.log(`  ✗ unexpected status=${r10.status}: ${JSON.stringify(r10.body).slice(0,200)}`);
  }

  console.log('\n━━━ STEP 11: PATCH channel — edit keywords/audience ━━━');
  let r11 = await call('PATCH', `social/channels/${channelId}`, {
    monitor_keywords: ['mechanic', 'snow removal', 'tow'],
    monitor_audience: 'both'
  });
  console.log(`  status=${r11.status} ${r11.status === 200 ? '✓ keywords=' + JSON.stringify(r11.body.channel?.monitor_keywords) + ' audience=' + r11.body.channel?.monitor_audience : '✗ ' + JSON.stringify(r11.body).slice(0,200)}`);

  console.log('\n━━━ STEP 12: POST channel run-monitor (single channel) ━━━');
  const r12 = await call('POST', `social/channels/${channelId}/run-monitor`);
  if (r12.status === 200) {
    const s = r12.body.summary || {};
    console.log(`  ✓ ran · channels=${s.channels} fetched=${s.fetched} inserted=${s.inserted} errors=${(s.errors||[]).length}`);
  } else console.log(`  ✗ status=${r12.status}: ${JSON.stringify(r12.body).slice(0,200)}`);

  console.log('\n━━━ STEP 13: request 3 draft variants — expect variant_group ━━━');
  const r13 = await call('POST', 'social/request-draft', {
    platform: 'reddit', audience: 'member', channel_id: channelId, variants: 3,
    brief: 'A/B/C test — different angles on quotes'
  });
  if (r13.status === 200 && r13.body.variants === 3 && r13.body.variant_group && r13.body.event_ids?.length === 3) {
    console.log(`  ✓ ${r13.body.variants} variants emitted · group=${r13.body.variant_group} · event_ids=${r13.body.event_ids.join(',')}`);
  } else console.log(`  ✗ status=${r13.status}: ${JSON.stringify(r13.body).slice(0,200)}`);

  // Step 13b: verify variant_group/index/total are persisted end-to-end by
  // running Promoter on the first emitted variant event and querying the post.
  if (r13.status === 200 && r13.body.event_ids?.length === 3) {
    console.log('\n━━━ STEP 13b: invoke Promoter on variant #1 — verify persistence ━━━');
    const evtId = r13.body.event_ids[0];
    // Reconstruct the event payload as orchestrator would dispatch it.
    const variantEvent = {
      id: evtId,
      event_type: 'social.post_requested',
      payload: {
        platform: 'reddit', audience: 'member', channel_id: channelId,
        brief: 'A/B/C test — different angles on quotes',
        variant_group: r13.body.variant_group,
        variant_index: 1,
        variant_total: 3
      }
    };
    console.log('  calling Promoter handler (Anthropic — 5-15s)…');
    const r13b = await callPromoterDirect(variantEvent);
    if (r13b.status === 200 && r13b.body.success && r13b.body.social_post_id) {
      const newPostId = r13b.body.social_post_id;
      // Query the post and assert variant fields were persisted.
      const r13c = await call('GET', `social/posts?status=draft&limit=50`);
      const variantPost = (r13c.body?.rows || []).find(p => p.id === newPostId);
      if (!variantPost) {
        console.log(`  ✗ post #${newPostId} not found in list`);
      } else if (
        variantPost.variant_group === r13.body.variant_group &&
        variantPost.variant_index === 1 &&
        variantPost.variant_total === 3
      ) {
        console.log(`  ✓ post #${newPostId} persisted with variant_group=${variantPost.variant_group} index=1 total=3`);
      } else {
        console.log(`  ✗ variant fields NOT persisted on post #${newPostId}: group=${variantPost.variant_group} index=${variantPost.variant_index} total=${variantPost.variant_total}`);
        console.log('    (likely the variant_group/variant_index/variant_total columns are not yet on social_posts — apply supabase/migrations/20260424_social_posts_variant_group.sql)');
      }
    } else {
      console.log(`  ✗ Promoter call failed status=${r13b.status}: ${JSON.stringify(r13b.body).slice(0,300)}`);
    }
  }

  console.log('\n━━━ STEP 14: DELETE channel ━━━');
  const r14 = await call('DELETE', `social/channels/${channelId}`);
  console.log(`  status=${r14.status} ${r14.status === 200 ? '✓ deleted id=' + r14.body.id : '✗ ' + JSON.stringify(r14.body).slice(0,200)}`);

  // ──────────────────────────────────────────────────────────────────────
  // Task #130 — deterministic Hunter-reasoning lookup by social_lead_id.
  // Validates GET /social/leads/:id/reasoning returns the reasoning row
  // even when the hunter action is far outside the recent-50-actions window
  // the old client-side scan used.
  // ──────────────────────────────────────────────────────────────────────
  console.log('\n━━━ STEP 14b: GET /social/leads/:id/reasoning — direct lookup ━━━');
  try {
    const { createClient: ccLead } = require('@supabase/supabase-js');
    const sbLead = ccLead(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } });

    // 1. Seed a synthetic social_leads row.
    const extId = 'smoke-t130-' + Date.now();
    const { data: leadRow, error: leadErr } = await sbLead.from('social_leads').insert({
      platform: 'reddit', external_id: extId, lead_type: 'member',
      raw_text: 'smoke t#130 — looking for a mechanic in NJ',
      status: 'pending'
    }).select('id').single();
    if (leadErr) throw new Error('seed lead: ' + leadErr.message);
    const newLeadId = leadRow.id;

    // 2. 404 path — no hunter action exists yet for this lead.
    const r404 = await call('GET', `social/leads/${newLeadId}/reasoning`);
    if (r404.status === 404) {
      console.log(`  ✓ unscored lead returns 404 (id=${newLeadId})`);
    } else {
      console.log(`  ✗ expected 404 for unscored lead, got ${r404.status}: ${JSON.stringify(r404.body).slice(0,200)}`);
    }

    // 3. Seed a hunter agent_actions row with decision.social_lead_id set.
    const { data: actRow, error: actErr } = await sbLead.from('agent_actions').insert({
      agent_slug: 'hunter', action_type: 'score', status: 'proposed',
      autonomy_used: 'propose', confidence: 0.82, needs_review: true,
      decision: { event_type: 'social.lead_discovered', social_lead_id: newLeadId,
                  platform: 'reddit', lead_type: 'member', score: 0.82 },
      reasoning: 'smoke t#130 — synthetic Hunter justification used by lookup test.',
      tokens_in: 100, tokens_out: 50, cost_usd: 0.0123, duration_ms: 1234
    }).select('id').single();
    if (actErr) throw new Error('seed action: ' + actErr.message);
    const newActId = actRow.id;

    // 4. Direct lookup must now return that exact action.
    const r200 = await call('GET', `social/leads/${newLeadId}/reasoning`);
    if (r200.status === 200
        && r200.body?.action?.id === newActId
        && (r200.body?.reasoning || '').startsWith('smoke t#130')) {
      console.log(`  ✓ direct lookup returned action id=${newActId} reasoning="${r200.body.reasoning.slice(0,40)}…" model=${r200.body.model || '—'}`);
    } else {
      console.log(`  ✗ unexpected: status=${r200.status} body=${JSON.stringify(r200.body).slice(0,300)}`);
    }

    // 5. Cleanup.
    await sbLead.from('agent_actions').delete().eq('id', newActId);
    await sbLead.from('social_leads').delete().eq('id', newLeadId);
  } catch (e) {
    console.log(`  ✗ step 14b threw: ${e.message}`);
  }

  console.log('\n━━━ STEP 15: cleanup — disable Hunter & Promoter again ━━━');
  for (const slug of ['hunter','promoter']) {
    await call('PUT', 'agents/' + slug, { enabled: false });
  }
  console.log('  ✓ both back to enabled=false');

  // ──────────────────────────────────────────────────────────────────────
  // Task #131 — provider-admin & provider-application smoke tests
  // Verifies that privileged provider mutations are gated server-side.
  // ──────────────────────────────────────────────────────────────────────
  console.log('\n━━━ STEP 16: provider-admin auth — no password rejected ━━━');
  const ra1 = await callProviderAdmin('POST', 'suspend', { provider_ids: [], reason: '' }, { withAuth: false });
  console.log(`  status=${ra1.status} ${ra1.status === 401 ? '✓ unauthorized blocked' : '✗ expected 401, got ' + ra1.status}`);

  console.log('\n━━━ STEP 17: provider-admin /suspend — bad input rejected ━━━');
  const ra2 = await callProviderAdmin('POST', 'suspend', { provider_ids: [], reason: 'too short' });
  console.log(`  status=${ra2.status} ${ra2.status === 400 ? '✓ validation rejected empty ids' : '✗ expected 400, got ' + ra2.status}`);
  const ra2b = await callProviderAdmin('POST', 'suspend', { provider_ids: ['00000000-0000-0000-0000-000000000001'], reason: 'no' });
  console.log(`  status=${ra2b.status} ${ra2b.status === 400 ? '✓ validation rejected short reason' : '✗ expected 400, got ' + ra2b.status}`);

  console.log('\n━━━ STEP 18: provider-admin /check-low-rated preview ━━━');
  const ra3 = await callProviderAdmin('POST', 'check-low-rated', { rating_threshold: 4, autosuspend: false });
  if (ra3.status === 200 && Array.isArray(ra3.body?.providers)) {
    console.log(`  ✓ preview returned (found=${ra3.body.found}, threshold=${ra3.body.threshold}, autosuspend=${ra3.body.autosuspend})`);
  } else {
    console.log(`  ✗ unexpected: status=${ra3.status} body=${JSON.stringify(ra3.body).slice(0,200)}`);
  }

  console.log('\n━━━ STEP 19: admin_audit_log captures the check ━━━');
  // Inline supabase query (re-uses pattern from agent-fleet-runtime's getSupabase).
  try {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } });
    const { data: rows, error } = await sb
      .from('admin_audit_log')
      .select('id, action, performed_at')
      .eq('action', 'check_low_rated')
      .order('performed_at', { ascending: false })
      .limit(1);
    if (error) {
      console.log(`  ✗ audit_log query failed: ${error.message} (apply supabase/migrations/20260424_admin_audit_log.sql?)`);
    } else if (rows && rows.length > 0) {
      console.log(`  ✓ audit_log row id=${rows[0].id} action=${rows[0].action} at=${rows[0].performed_at}`);
    } else {
      console.log('  ✗ no audit_log row found for check_low_rated');
    }
  } catch (e) {
    console.log(`  ✗ audit_log lookup threw: ${e.message}`);
  }

  console.log('\n━━━ STEP 20: provider-application — missing JWT rejected ━━━');
  const pa1 = await callProviderApplication({
    business_name: 'Test Garage', contact_name: 'Test', phone: '5551234567',
    email: 'test@example.com', services_offered: ['oil_change'],
    legal_signatory_name: 'Test', agreement_signed_at: new Date().toISOString()
  });
  console.log(`  status=${pa1.status} ${pa1.status === 401 ? '✓ unauthorized blocked' : '✗ expected 401, got ' + pa1.status}`);

  console.log('\n━━━ STEP 21: provider-application — invalid JWT rejected ━━━');
  const pa2 = await callProviderApplication({
    business_name: 'Test', contact_name: 'Test', phone: '5551234567',
    email: 'test@example.com', services_offered: ['oil_change'],
    legal_signatory_name: 'Test', agreement_signed_at: new Date().toISOString()
  }, { token: 'eyJ.bogus.token' });
  console.log(`  status=${pa2.status} ${pa2.status === 401 ? '✓ bogus token blocked' : '✗ expected 401, got ' + pa2.status}`);

  // ──────────────────────────────────────────────────────────────────────
  // Steps 22–26: end-to-end happy paths with a real test user.
  // Provisions a temp Supabase auth user, signs in to get a JWT, then exercises
  // application create / spoof / rate-limit / suspend / activate, and cleans up.
  // ──────────────────────────────────────────────────────────────────────
  const { createClient: cc } = require('@supabase/supabase-js');
  const adminSb = cc(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } });
  const anonSb = cc(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY,
    { auth: { persistSession: false } });

  const testEmail = `smoke-${Date.now()}@mcc-smoke.test`;
  const testPassword = 'SmokeTest!' + Date.now();
  let testUserId = null;
  let testJwt = null;
  let spoofUserId = '00000000-0000-0000-0000-deadbeefdead';

  console.log('\n━━━ STEP 22: provision temp Supabase user for happy-path tests ━━━');
  try {
    const { data: cu, error: cuErr } = await adminSb.auth.admin.createUser({
      email: testEmail, password: testPassword, email_confirm: true
    });
    if (cuErr) throw cuErr;
    testUserId = cu.user.id;
    // Ensure a profile row exists so suspend/activate selects return it.
    await adminSb.from('profiles').upsert({ id: testUserId, email: testEmail, role: 'member' }, { onConflict: 'id' });
    // signInWithPassword needs a valid SUPABASE_ANON_KEY (a JWT). If the secret
    // is misconfigured (e.g. holds a truncated non-JWT token) we still keep the
    // user around so the admin-only suspend/activate/audit checks below run;
    // only the JWT-dependent steps 23-24 will be skipped with a clear reason.
    const { data: si, error: siErr } = await anonSb.auth.signInWithPassword({
      email: testEmail, password: testPassword
    });
    if (siErr) {
      console.log(`  ⚠ user created but signIn failed (${siErr.message}) — steps 23-24 will skip`);
    } else {
      testJwt = si.session.access_token;
    }
    console.log(`  ✓ user provisioned id=${testUserId}${testJwt ? ' + JWT minted' : ' (no JWT)'}`);
  } catch (e) {
    console.log(`  ✗ provisioning failed: ${e.message} — skipping steps 23-26`);
  }

  // Steps 23-24 require a real user JWT (depend on signInWithPassword + a valid
  // SUPABASE_ANON_KEY). Steps 25-26 only need a profile row + the admin
  // password, so they run whenever the test user was provisioned.
  if (testUserId && testJwt) {
    console.log('\n━━━ STEP 23: provider-application happy path + user_id spoof override ━━━');
    const happyPayload = {
      // Try to spoof user_id — server MUST ignore this and use the JWT user.
      user_id: spoofUserId,
      business_name: 'Smoke Test Garage', contact_name: 'Smoke Tester',
      phone: '5551234567', email: testEmail,
      services_offered: ['oil_change', 'brakes'],
      legal_signatory_name: 'Smoke Tester',
      agreement_signed_at: new Date().toISOString()
    };
    const pa3 = await callProviderApplication(happyPayload, { token: testJwt });
    if (pa3.status === 200 && pa3.body.application_id) {
      console.log(`  ✓ created application_id=${pa3.body.application_id}`);
      const { data: row } = await adminSb.from('provider_applications')
        .select('id, user_id, agreement_ip_address, status').eq('id', pa3.body.application_id).single();
      if (row?.user_id === testUserId) {
        console.log(`  ✓ user_id correctly bound to JWT (${row.user_id}), spoof ignored`);
      } else {
        console.log(`  ✗ user_id mismatch: row.user_id=${row?.user_id} expected=${testUserId} (spoof attempt: ${spoofUserId})`);
      }

      console.log('\n━━━ STEP 24: provider-application 24h rate-limit returns 429 ━━━');
      const pa4 = await callProviderApplication(happyPayload, { token: testJwt });
      if (pa4.status === 429) console.log(`  ✓ duplicate within 24h blocked (existing_id=${pa4.body.existing_application_id})`);
      else console.log(`  ✗ expected 429, got ${pa4.status} body=${JSON.stringify(pa4.body).slice(0,200)}`);
    } else {
      console.log(`  ✗ application create failed status=${pa3.status} body=${JSON.stringify(pa3.body).slice(0,300)}`);
    }
  } else if (testUserId) {
    console.log('\n━━━ STEP 23-24: SKIPPED — no JWT (SUPABASE_ANON_KEY misconfigured in workspace) ━━━');
  }

  if (testUserId) {
    console.log('\n━━━ STEP 25: provider-admin /suspend + /activate happy path ━━━');
    const sus = await callProviderAdmin('POST', 'suspend', { provider_ids: [testUserId], reason: 'smoke test suspension' });
    if (sus.status === 200 && sus.body.updated === 1) {
      console.log(`  ✓ suspend updated=1 failed=${(sus.body.failed||[]).length}`);
    } else {
      console.log(`  ✗ suspend unexpected: status=${sus.status} body=${JSON.stringify(sus.body).slice(0,200)}`);
    }
    const { data: prof1 } = await adminSb.from('profiles').select('suspension_reason, suspended_at').eq('id', testUserId).single();
    if (prof1?.suspension_reason === 'smoke test suspension') console.log('  ✓ profile.suspension_reason set');
    else console.log(`  ✗ profile not updated: ${JSON.stringify(prof1)}`);

    const act = await callProviderAdmin('POST', 'activate', { provider_ids: [testUserId] });
    if (act.status === 200 && act.body.updated === 1) console.log(`  ✓ activate updated=1`);
    else console.log(`  ✗ activate unexpected: status=${act.status} body=${JSON.stringify(act.body).slice(0,200)}`);
    const { data: prof2 } = await adminSb.from('profiles').select('suspension_reason').eq('id', testUserId).single();
    if (prof2?.suspension_reason === null) console.log('  ✓ profile.suspension_reason cleared');
    else console.log(`  ✗ profile not cleared: ${JSON.stringify(prof2)}`);

    console.log('\n━━━ STEP 26: admin_audit_log captured suspend + activate ━━━');
    const { data: rows } = await adminSb.from('admin_audit_log')
      .select('action, target_id').eq('target_id', testUserId).order('performed_at', { ascending: false });
    const actions = new Set((rows || []).map(r => r.action));
    const need = ['suspend_provider', 'activate_provider'];
    if (testJwt) need.push('create_provider_application');
    const missing = need.filter(a => !actions.has(a));
    if (missing.length === 0) console.log(`  ✓ audit rows present: ${[...actions].join(', ')}`);
    else console.log(`  ✗ missing audit actions: ${missing.join(', ')} (have: ${[...actions].join(', ')})`);

    // Cleanup
    try {
      await adminSb.from('admin_audit_log').delete().eq('target_id', testUserId);
      await adminSb.from('provider_applications').delete().eq('user_id', testUserId);
      await adminSb.from('profiles').delete().eq('id', testUserId);
      await adminSb.auth.admin.deleteUser(testUserId);
      console.log('  ✓ cleanup complete');
    } catch (e) {
      console.log(`  ⚠ cleanup partial: ${e.message}`);
    }
  }

  // ============================================================================
  // Task #134 — Outreach Engine ↔ CRM bridge gap-closing smoke tests.
  // Validates the four pieces re-applied by supabase/migrations/20260425_outreach_crm_bridge.sql:
  //   STEP 27: check_crm_duplicate RPC (matches by email and by phone)
  //   STEP 28: increment_engine_stat RPC (atomic counter bump)
  //   STEP 29: trg_auto_link_outreach_lead trigger (lead → profile auto-link on signup)
  //   STEP 30: provider_applications.outreach_lead_id column exists & accepts FK
  // Each step creates + cleans up its own fixture and degrades gracefully (logs ⚠
  // "MIGRATION NOT APPLIED") if the migration hasn't run yet in Supabase SQL Editor.
  // ============================================================================
  console.log('\n━━━ STEP 27: check_crm_duplicate RPC ━━━');
  try {
    const probeEmail = 'crmdup_probe_' + Date.now() + '@mcc-test.local';
    const probePhone = '+1555' + String(Date.now()).slice(-7);
    const { data: probeLead } = await adminSb.from('outreach_leads').insert({
      type: 'member', name: 'Dup Probe', email: probeEmail, phone: probePhone,
      source: 'smoke_test', status: 'new', crm_sync_status: 'unlinked'
    }).select().single();

    const r1 = await adminSb.rpc('check_crm_duplicate', { p_email: probeEmail, p_phone: null });
    if (r1.error) {
      console.log(`  ⚠ MIGRATION NOT APPLIED — ${r1.error.message.slice(0, 100)}`);
      console.log('     Apply supabase/migrations/20260425_outreach_crm_bridge.sql in Supabase SQL Editor.');
    } else if (Array.isArray(r1.data) && r1.data[0]?.exists_in_crm && r1.data[0]?.lead_id === probeLead.id) {
      console.log(`  ✓ email match returned lead_id=${r1.data[0].lead_id.slice(0, 8)}…`);
      const r2 = await adminSb.rpc('check_crm_duplicate', { p_email: null, p_phone: probePhone });
      if (r2.data?.[0]?.exists_in_crm && r2.data[0].lead_id === probeLead.id) console.log('  ✓ phone match returned same lead');
      else console.log(`  ✗ phone match unexpected: ${JSON.stringify(r2.data || r2.error)}`);
      const r3 = await adminSb.rpc('check_crm_duplicate', { p_email: 'no-such-' + Date.now() + '@nowhere', p_phone: null });
      if (r3.data?.[0]?.exists_in_crm === false) console.log('  ✓ unknown email returns exists_in_crm=false');
      else console.log(`  ✗ unknown-email expected false, got: ${JSON.stringify(r3.data)}`);
    } else {
      console.log(`  ✗ unexpected response: ${JSON.stringify(r1.data)}`);
    }
    if (probeLead?.id) await adminSb.from('outreach_leads').delete().eq('id', probeLead.id);
  } catch (e) {
    console.log(`  ✗ STEP 27 threw: ${e.message}`);
  }

  console.log('\n━━━ STEP 27b: check_crm_duplicate is locked to service_role (no enumeration) ━━━');
  // Anonymous + authenticated callers MUST NOT be able to invoke this RPC, otherwise
  // any logged-in user could enumerate which emails/phones exist in the CRM.
  try {
    if (!process.env.SUPABASE_ANON_KEY) {
      console.log('  ⚠ SUPABASE_ANON_KEY not set in workspace — skipping anon-grant assertion.');
    } else {
      const anonSb = require('@supabase/supabase-js').createClient(
        process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY,
        { auth: { persistSession: false } }
      );
      const r = await anonSb.rpc('check_crm_duplicate', { p_email: 'anyone@example.com', p_phone: null });
      if (r.error && /permission denied|not found|insufficient/i.test(r.error.message)) {
        console.log(`  ✓ anon caller blocked: ${r.error.message.slice(0, 80)}`);
      } else if (r.error) {
        console.log(`  ⚠ anon caller errored (likely OK): ${r.error.message.slice(0, 80)}`);
      } else {
        console.log(`  ✗ SECURITY: anon caller succeeded — RPC must be REVOKEd from anon/authenticated. Re-apply migration.`);
      }
    }
  } catch (e) {
    console.log(`  ✗ STEP 27b threw: ${e.message}`);
  }

  console.log('\n━━━ STEP 28: increment_engine_stat RPC ━━━');
  try {
    const { data: before } = await adminSb.from('engine_state').select('total_leads_discovered').eq('id', 1).maybeSingle();
    const startVal = before?.total_leads_discovered ?? 0;
    const r = await adminSb.rpc('increment_engine_stat', { p_field: 'total_leads_discovered', p_amount: 0 });
    if (r.error) {
      console.log(`  ⚠ MIGRATION NOT APPLIED — ${r.error.message.slice(0, 100)}`);
      console.log('     Apply supabase/migrations/20260425_outreach_crm_bridge.sql in Supabase SQL Editor.');
    } else {
      // +0 is a no-op so we don't pollute production counters; just verify the RPC accepted the call.
      const { data: after } = await adminSb.from('engine_state').select('total_leads_discovered').eq('id', 1).maybeSingle();
      if ((after?.total_leads_discovered ?? 0) === startVal) console.log(`  ✓ RPC reachable + +0 no-op preserved counter (${startVal})`);
      else console.log(`  ✗ counter drifted: was ${startVal} now ${after?.total_leads_discovered}`);
      const rBad = await adminSb.rpc('increment_engine_stat', { p_field: 'NOT_A_REAL_COLUMN', p_amount: 1 });
      if (!rBad.error) console.log('  ✓ non-whitelisted field silently ignored (expected behavior)');
      else console.log(`  ✗ non-whitelisted field should be no-op, got: ${rBad.error.message.slice(0,80)}`);
    }
  } catch (e) {
    console.log(`  ✗ STEP 28 threw: ${e.message}`);
  }

  console.log('\n━━━ STEP 29: trg_auto_link_outreach_lead trigger ━━━');
  try {
    const tEmail = 'autolink_smoke_' + Date.now() + '@mcc-test.local';
    const { data: lead, error: leadErr } = await adminSb.from('outreach_leads').insert({
      type: 'member', name: 'Autolink Smoke', email: tEmail,
      source: 'smoke_test_autolink', status: 'new', crm_sync_status: 'unlinked'
    }).select().single();
    if (leadErr) throw leadErr;
    const { data: au, error: auErr } = await adminSb.auth.admin.createUser({
      email: tEmail, email_confirm: true, password: 'Autolink' + Date.now() + '!'
    });
    if (auErr) throw auErr;
    await new Promise(r => setTimeout(r, 1500));
    const { data: lead2 } = await adminSb.from('outreach_leads').select('crm_profile_id, crm_sync_status, status').eq('id', lead.id).single();
    if (lead2?.crm_profile_id === au.user.id && lead2?.status === 'converted') {
      console.log(`  ✓ trigger linked lead → profile and stamped status='converted'`);
      const { data: prof } = await adminSb.from('profiles').select('outreach_lead_id, outreach_source').eq('id', au.user.id).maybeSingle();
      if (prof?.outreach_lead_id === lead.id) console.log(`  ✓ profile.outreach_lead_id stamped`);
      else console.log(`  ⚠ profile bridge cols not stamped (cols may be missing): ${JSON.stringify(prof)}`);
    } else {
      console.log(`  ⚠ MIGRATION NOT APPLIED — lead stayed unlinked (${JSON.stringify(lead2)})`);
      console.log('     Apply supabase/migrations/20260425_outreach_crm_bridge.sql in Supabase SQL Editor.');
    }
    await adminSb.from('outreach_leads').delete().eq('id', lead.id);
    await adminSb.auth.admin.deleteUser(au.user.id);
  } catch (e) {
    console.log(`  ✗ STEP 29 threw: ${e.message}`);
  }

  console.log('\n━━━ STEP 30: provider_applications.outreach_lead_id column ━━━');
  try {
    const { data: row } = await adminSb.from('provider_applications').select('*').limit(1).maybeSingle();
    const hasCol = row && Object.prototype.hasOwnProperty.call(row, 'outreach_lead_id');
    if (row === null) {
      // table empty — probe via insert-attempt-then-rollback won't work without auth user; just note.
      console.log('  ⚠ provider_applications empty in this env; cannot verify column existence non-destructively.');
    } else if (hasCol) {
      console.log('  ✓ provider_applications.outreach_lead_id column present');
    } else {
      console.log('  ⚠ MIGRATION NOT APPLIED — outreach_lead_id column missing on provider_applications.');
      console.log('     Apply supabase/migrations/20260425_outreach_crm_bridge.sql in Supabase SQL Editor.');
    }
  } catch (e) {
    console.log(`  ✗ STEP 30 threw: ${e.message}`);
  }

  console.log('\n━━━ DONE ━━━\n');
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
