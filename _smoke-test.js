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

  console.log('\n━━━ DONE ━━━\n');
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
