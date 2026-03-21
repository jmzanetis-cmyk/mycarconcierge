const Anthropic = require('@anthropic-ai/sdk');
const { Resend } = require('resend');

let anthropicClient = null;
let resendClient = null;
let aiCircuitBreaker = { failures: 0, pausedUntil: null };

function getAnthropic() {
  if (!anthropicClient && process.env.ANTHROPIC_API_KEY) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

function getResend() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

async function callAI(prompt, maxTokens = 4000) {
  if (aiCircuitBreaker.pausedUntil && Date.now() < aiCircuitBreaker.pausedUntil) {
    throw new Error('AI circuit breaker active — paused for cooldown');
  }

  const anthropic = getAnthropic();
  if (anthropic) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      });
      aiCircuitBreaker.failures = 0;
      return { text: response.content[0]?.type === 'text' ? response.content[0].text : '', provider: 'anthropic' };
    } catch (err) {
      const isCreditsOrRate = err.message?.includes('credit balance') || err.message?.includes('rate_limit') || err.status === 429 || err.status === 400;
      if (isCreditsOrRate) {
        console.log('[OutreachEngine] Anthropic unavailable, trying Gemini fallback...');
      } else {
        throw err;
      }
    }
  }

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (geminiKey) {
    try {
      const { GoogleGenAI } = require('@google/genai');
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { temperature: 0.4 }
      });
      aiCircuitBreaker.failures = 0;
      return { text: response.text || '', provider: 'gemini' };
    } catch (err) {
      aiCircuitBreaker.failures++;
      if (aiCircuitBreaker.failures >= 3) {
        aiCircuitBreaker.pausedUntil = Date.now() + 5 * 60 * 1000;
        console.error('[OutreachEngine] Circuit breaker tripped — pausing AI calls for 5 minutes');
      }
      throw err;
    }
  }

  aiCircuitBreaker.failures++;
  if (aiCircuitBreaker.failures >= 3) {
    aiCircuitBreaker.pausedUntil = Date.now() + 5 * 60 * 1000;
    console.error('[OutreachEngine] Circuit breaker tripped — pausing AI calls for 5 minutes');
  }
  throw new Error('No AI provider available');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 100000) reject(new Error('Too large'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
  res.end(JSON.stringify(data));
}

const BRAND_INFO = 'Brand: "My Car Concierge" — Your complete auto ownership platform. Tagline: "One app. Every auto need. Zero hassle." IMPORTANT: Always write the full name "My Car Concierge" — never abbreviate. My Car Concierge is in its early startup stage and actively building its founding community. We are looking for founding members and founding providers who want to get in on the ground floor. Founding members and providers get preferred status, early-adopter perks, and the opportunity to shape the platform as it grows. Value proposition: Car owners post what they need and receive competitive bids from vetted, local service providers — no more calling around or overpaying. Providers get a steady stream of pre-qualified customers with secure escrow payments. Key features: competitive bidding from multiple providers, Car Club loyalty rewards (punch cards, exclusive perks), vehicle maintenance tracking, OBD diagnostic scanner, snow removal and property services, merch store, and a referral program with lifetime commissions. No platform fees — providers keep 100% of what they earn. Website: mycarconcierge.com. FUNDRAISING: My Car Concierge has an active community fundraising campaign on Wefunder (wefunder.com/my.car.concierge) — a crowdfunding round open to everyday investors. Only reference this when relevant to the audience; do not fabricate or imply investment commitments that have not been stated.';

const PHYSICAL_ADDRESS = 'My Car Concierge, East Rutherford, NJ 07073';
const BASE_URL = 'https://mycarconcierge.com';
const UNSUBSCRIBE_URL = `${BASE_URL}/unsubscribe`;
const EMAIL_FOOTER = `\n\n---\n${PHYSICAL_ADDRESS}\nTo stop receiving these emails: ${UNSUBSCRIBE_URL}`;
const SMS_OPT_OUT = '\nReply STOP to opt out.';

let engineCycleInterval = null;
let followUpInterval = null;
let cleanupInterval = null;
let apolloDiscoveryInterval = null;
let wefunderBlastInterval = null;
let dailyDigestTimeout = null;

let schemaReady = false;

async function checkSchemaExists(supabase) {
  if (schemaReady) return true;
  const { error } = await supabase.from('engine_state').select('id').eq('id', 1).maybeSingle();
  if (!error) { schemaReady = true; return true; }
  return false;
}

async function initEngineState(supabase) {
  const exists = await checkSchemaExists(supabase);
  if (!exists) {
    console.log('[OutreachEngine] Schema not found. Run outreach-schema.sql in Supabase SQL Editor.');
    return;
  }

  const { data } = await supabase
    .from('engine_state')
    .select('id')
    .eq('id', 1)
    .maybeSingle();

  if (!data) {
    await supabase.from('engine_state').insert({
      id: 1,
      is_running: true,
      discovery_interval_minutes: 30,
      max_drafts_per_cycle: 20,
      target_cities: ['East Rutherford, NJ', 'Newark, NJ', 'Jersey City, NJ', 'New York, NY', 'Hoboken, NJ', 'Paterson, NJ', 'Edison, NJ', 'Trenton, NJ', 'Philadelphia, PA', 'Stamford, CT'],
      search_radius_meters: 15000,
      total_leads_discovered: 0,
      total_messages_drafted: 0,
      total_messages_sent: 0,
      warmup_start_date: new Date().toISOString(),
      metadata: { city_rotation_index: 0 }
    });
  }
}

async function runEngineCycle(supabase) {
  try {
    const { data: state } = await supabase
      .from('engine_state')
      .select('*')
      .eq('id', 1)
      .single();

    if (!state || !state.is_running) return { skipped: true, reason: 'engine_paused' };
    if (state.auto_send === undefined) state.auto_send = true;

    const now = new Date();
    const lastDiscovery = state.last_discovery_run ? new Date(state.last_discovery_run) : null;
    const minutesSinceDiscovery = lastDiscovery
      ? (now.getTime() - lastDiscovery.getTime()) / 60000
      : Infinity;

    const results = { cycle_at: now.toISOString() };

    const { count: unscoredCount } = await supabase
      .from('outreach_leads')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new');
    const { count: pipelineCount } = await supabase
      .from('opportunity_pipeline')
      .select('lead_id', { count: 'exact', head: true });
    const backlogSize = (unscoredCount || 0) - (pipelineCount || 0);

    if (backlogSize > 1000) {
      results.discovery = `skipped (backlog: ${backlogSize} unscored leads)`;
    } else if (minutesSinceDiscovery >= (state.discovery_interval_minutes || 360)) {
      let discovered = 0;
      if (process.env.GOOGLE_PLACES_API_KEY) {
        const allCities = state.target_cities || [];
        const cityIndex = (state.metadata?.city_rotation_index || 0) % allCities.length;
        const citiesToDiscover = allCities.slice(cityIndex, cityIndex + 3);
        if (citiesToDiscover.length < 3 && allCities.length > 3) {
          citiesToDiscover.push(...allCities.slice(0, 3 - citiesToDiscover.length));
        }
        const nextIndex = (cityIndex + citiesToDiscover.length) % allCities.length;

        for (const city of citiesToDiscover) {
          const providerCount = await importProviderLeadsFromPlaces(supabase, city, state.search_radius_meters || 15000);
          const memberCount = await importMemberLeadsFromPlaces(supabase, city, state.search_radius_meters || 15000);
          const communityCount = await discoverCarOwnerCommunities(supabase, city);
          discovered += providerCount + memberCount + communityCount;
        }

        await supabase.from('engine_state').update({
          metadata: { ...(state.metadata || {}), city_rotation_index: nextIndex }
        }).eq('id', 1);
        results.cities_searched = citiesToDiscover;
      }
      await supabase.from('engine_state').update({
        last_discovery_run: now.toISOString(),
        total_leads_discovered: (state.total_leads_discovered || 0) + discovered
      }).eq('id', 1);
      results.discovery = `ran (${discovered} new leads from ${(results.cities_searched || []).length} cities)`;
    } else {
      results.discovery = 'skipped (interval not reached)';
    }

    await syncReengagementLeads(supabase);

    const { data: alreadyScoredIds } = await supabase
      .from('opportunity_pipeline')
      .select('lead_id');
    const scoredArray = (alreadyScoredIds || []).map(r => r.lead_id);
    const scoredSet = new Set(scoredArray);

    let leadsQuery = supabase
      .from('outreach_leads')
      .select('id, type, name, location, metadata, notes')
      .eq('status', 'new');
    if (scoredArray.length > 0) {
      const filterChunks = [];
      for (let ci = 0; ci < scoredArray.length; ci += 200) {
        filterChunks.push(scoredArray.slice(ci, ci + 200));
      }
      leadsQuery = leadsQuery.not('id', 'in', `(${filterChunks[0].join(',')})`);
    }
    const { data: allNewLeads } = await leadsQuery.limit(500);

    const toScore = (allNewLeads || []).filter(l => !scoredSet.has(l.id)).slice(0, 200);
    if (toScore.length > 0) {
      const scored = await scoreLeadsWithAI(supabase, toScore);
      results.scored = scored;
    }

    const { data: draftTargets } = await supabase
      .from('opportunity_pipeline')
      .select('lead_id, recommended_channel, outreach_leads(*)')
      .in('stage', ['new', 'draft_ready'])
      .in('priority', ['high', 'medium', 'low'])
      .order('opportunity_score', { ascending: false })
      .limit(state.max_drafts_per_cycle || 20);

    let drafted = 0;
    let autoSent = 0;
    for (const opp of (draftTargets || [])) {
      const { data: freshState } = await supabase.from('engine_state').select('is_running').eq('id', 1).single();
      if (!freshState?.is_running) break;

      const lead = opp.outreach_leads;
      if (!lead?.email && !lead?.phone) continue;
      if (lead.crm_sync_status === 'duplicate') continue;
      if (lead.status === 'unsubscribed' || lead.status === 'contacted' || lead.status === 'converted' || lead.status === 'bounced' || lead.status === 'responded') continue;

      const { count } = await supabase
        .from('outreach_messages')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', opp.lead_id)
        .in('status', ['draft', 'approved', 'sent']);
      if (count && count > 0) continue;

      const result = await draftMessageWithAI(lead, opp.recommended_channel || 'email', 1);
      if (!result) break;
      {
        const isInvestor = lead.type === 'investor';
        const shouldAutoSend = state.auto_send && !isInvestor;
        const msgStatus = shouldAutoSend ? 'approved' : 'draft';

        const useVariantB = drafted % 2 === 1 && result.subjectB;
        const chosenSubject = useVariantB ? result.subjectB : result.subject;

        const { data: inserted } = await supabase.from('outreach_messages').insert({
          lead_id: opp.lead_id,
          channel: opp.recommended_channel || 'email',
          subject: chosenSubject,
          body: result.body,
          status: msgStatus,
          metadata: result.subjectB ? {
            ab_variant: useVariantB ? 'B' : 'A',
            subject_a: result.subject,
            subject_b: result.subjectB
          } : null
        }).select('id').single();

        await supabase.from('opportunity_pipeline')
          .update({ stage: 'message_queued', last_action_at: new Date().toISOString() })
          .eq('lead_id', opp.lead_id);
        drafted++;

        if (shouldAutoSend && inserted) {
          const sendResult = await sendMessage(supabase, inserted.id);
          if (sendResult.success) {
            autoSent++;
            await supabase.from('outreach_activity_log').insert({
              lead_id: opp.lead_id,
              message_id: inserted.id,
              event_type: 'auto_sent',
              metadata: { channel: opp.recommended_channel || 'email', lead_type: lead.type }
            });
          }
        }
      }
    }

    results.drafted = drafted;
    results.auto_sent = autoSent;

    // Flush approved queue — retry messages stuck in 'approved' status
    let queueFlushed = 0;
    let queueSkipped = 0;
    let queueErrors = 0;
    if (state.auto_send) {
      try {
        const { data: approvedMsgs } = await supabase
          .from('outreach_messages')
          .select('id')
          .eq('status', 'approved')
          .order('created_at', { ascending: true })
          .limit(20);
        for (const msg of (approvedMsgs || [])) {
          try {
            const sr = await sendMessage(supabase, msg.id);
            if (sr.success) {
              queueFlushed++;
            } else if (sr.skipped) {
              queueSkipped++;
              console.log(`[OutreachEngine] Queue flush skipped (msg ${msg.id}): ${sr.error}`);
            } else {
              queueErrors++;
              console.error(`[OutreachEngine] Queue flush send failed (msg ${msg.id}): ${sr.error}`);
              if (sr.error && sr.error.includes('Daily send limit')) break;
            }
          } catch (sendErr) {
            queueErrors++;
            console.error(`[OutreachEngine] Queue flush exception (msg ${msg.id}):`, sendErr.message);
          }
          await new Promise(r => setTimeout(r, 300));
        }
      } catch (flushErr) {
        console.error('[OutreachEngine] Queue flush error:', flushErr.message);
      }
    }
    results.queue_flushed = queueFlushed;
    results.queue_skipped = queueSkipped;
    results.queue_errors = queueErrors;

    await supabase.from('engine_state').update({
      last_draft_run: now.toISOString(),
      total_messages_drafted: (state.total_messages_drafted || 0) + drafted,
      total_messages_sent: (state.total_messages_sent || 0) + autoSent + queueFlushed,
      updated_at: now.toISOString()
    }).eq('id', 1);

    // AI decision layer — evaluate provider pipeline health
    try {
      const aiDecision = await runOutreachAiDecisionLayer(supabase);
      if (aiDecision) results.ai_decision = aiDecision;
    } catch (aiErr) {
      console.error('[OutreachEngine] AI decision layer error:', aiErr.message);
    }

    console.log('[OutreachEngine] Cycle complete:', JSON.stringify(results));
    return { success: true, ...results };
  } catch (err) {
    console.error('[OutreachEngine] Cycle error:', err.message);
    return { error: err.message };
  }
}

async function sendOutreachSMS(toPhone, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from || !toPhone) return false;
  try {
    const clean = toPhone.replace(/\D/g, '');
    const to = clean.startsWith('1') ? `+${clean}` : `+1${clean}`;
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const form = new URLSearchParams({ To: to, From: from, Body: body });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST', headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString()
    });
    return r.ok;
  } catch { return false; }
}

async function getAdminNotificationPhone(supabase) {
  try {
    const { data } = await supabase.from('engine_state').select('metadata').eq('id', 1).single();
    return data?.metadata?.admin_notification_phone || null;
  } catch (_) { return null; }
}

async function saveAdminNotificationPhone(supabase, phone) {
  try {
    const { data } = await supabase.from('engine_state').select('metadata').eq('id', 1).single();
    const currentMeta = data?.metadata || {};
    await supabase.from('engine_state').update({ metadata: { ...currentMeta, admin_notification_phone: phone || null } }).eq('id', 1);
    return true;
  } catch (err) {
    console.error('[AdminSMS] Failed to save notification phone:', err.message);
    return false;
  }
}

async function sendAdminSMS(supabase, message) {
  try {
    const phone = await getAdminNotificationPhone(supabase);
    if (!phone) return false;
    const ok = await sendOutreachSMS(phone, message);
    if (ok) console.log('[AdminSMS] Notification sent to admin phone');
    else console.warn('[AdminSMS] Failed to send notification (Twilio error)');
    return ok;
  } catch (err) {
    console.warn('[AdminSMS] Error:', err.message);
    return false;
  }
}

async function runOutreachAiDecisionLayer(supabase) {
  // Respect confidence threshold — in shadow mode (threshold >= 1.0) only log, never side-effect
  const threshold = parseFloat(process.env.AI_CONFIDENCE_THRESHOLD || '1.0');
  const shadowMode = threshold >= 1.0;

  try {
    // Gather pipeline stats
    const { count: activeProviders } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'provider')
      .eq('is_active', true);

    const staleThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { count: staleApplications } = await supabase
      .from('outreach_leads')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'provider')
      .eq('status', 'new')
      .lt('created_at', staleThreshold);

    const inactiveThreshold = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { count: inactiveProviders } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'provider')
      .lt('updated_at', inactiveThreshold);

    const pipelineStats = {
      active_providers: activeProviders || 0,
      stale_applications: staleApplications || 0,
      inactive_providers: inactiveProviders || 0,
      pipeline_target: 5,
      shadow_mode: shadowMode
    };

    const prompt = `You are the AI Ops Outreach Coordinator for My Car Concierge, an automotive service marketplace.
Review the current provider pipeline health and recommend actions.

PIPELINE STATS:
- Active providers: ${pipelineStats.active_providers} (target: ${pipelineStats.pipeline_target}+)
- Stale provider applications (48h+ uncontacted): ${pipelineStats.stale_applications}
- Inactive providers (no activity in 14+ days): ${pipelineStats.inactive_providers}

Respond ONLY with valid JSON:
{"provider_actions":["follow_up_sms"|"re_engagement"|"enroll_sequence"|"pipeline_alert"],"confidence":0.0-1.0,"priority":"high"|"medium"|"low","reasoning":"one concise sentence","sms_message":"brief SMS text for providers (required if follow_up_sms or re_engagement in actions)"}

Rules:
- pipeline_alert if active_providers < 3
- follow_up_sms if stale_applications > 5
- re_engagement if inactive_providers > 10
- enroll_sequence if stale_applications > 0 and active_providers < 5
- If no issues detected, return empty provider_actions array`;

    const response = await callAI(prompt, 512);
    let decision;
    try { const m = response.text.match(/\{[\s\S]*\}/); decision = JSON.parse(m ? m[0] : response.text); }
    catch { return null; }

    const actions = decision.provider_actions || [];
    const aiConfidence = decision.confidence || 0.8;
    const executedActions = [];
    const shadowedActions = [];

    // In shadow mode, log but do not execute side effects
    for (const action of actions) {
      if (shadowMode) {
        shadowedActions.push(action);
        continue;
      }

      if (action === 'pipeline_alert') {
        await supabase.from('ai_escalations').insert({
          module: 'outreach_engine',
          target_id: 'provider_pipeline',
          recommendation: { action, stats: pipelineStats, reasoning: decision.reasoning },
          confidence: aiConfidence,
          status: 'pending',
          created_at: new Date().toISOString()
        });
        executedActions.push('pipeline_alert_escalated');
      }

      if ((action === 'follow_up_sms' || action === 're_engagement') && decision.sms_message) {
        // Get provider leads with phone numbers for follow-up or re-engagement
        let leadsQuery = supabase
          .from('outreach_leads')
          .select('id, name, phone')
          .eq('type', 'provider')
          .not('phone', 'is', null)
          .limit(10);

        if (action === 'follow_up_sms') {
          leadsQuery = leadsQuery.eq('status', 'new').lt('created_at', staleThreshold);
        } else {
          // re_engagement: leads that were contacted but didn't convert
          leadsQuery = leadsQuery.in('status', ['contacted', 'responded']);
        }

        const { data: targetLeads } = await leadsQuery;
        let smsSent = 0;
        for (const lead of (targetLeads || [])) {
          if (!lead.phone) continue;
          const sent = await sendOutreachSMS(lead.phone, `${decision.sms_message} Reply STOP to opt out.`);
          if (sent) smsSent++;
        }
        executedActions.push(`${action}:sms_sent=${smsSent}`);
      }

      if (action === 'enroll_sequence') {
        // Enroll stale provider leads into Instantly.ai sequence
        const { data: staleLeads } = await supabase
          .from('outreach_leads')
          .select('id, name, email, location')
          .eq('type', 'provider')
          .eq('status', 'new')
          .lt('created_at', staleThreshold)
          .not('email', 'is', null)
          .limit(20);

        const instantlyKey = process.env.INSTANTLY_API_KEY;
        let enrolled = 0;
        if (instantlyKey && staleLeads && staleLeads.length > 0) {
          for (const lead of staleLeads) {
            if (!lead.email) continue;
            try {
              await fetch('https://api.instantly.ai/api/v2/leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${instantlyKey}` },
                body: JSON.stringify({ email: lead.email, first_name: lead.name, personalization: `Provider opportunity in ${lead.location || 'your area'}` })
              });
              enrolled++;
            } catch {}
          }
        }
        executedActions.push(`enroll_sequence:enrolled=${enrolled}`);
      }
    }

    // Log AI decision
    const outcome = shadowMode ? 'shadow_logged' : (executedActions.length > 0 ? 'executed' : 'no_action');
    await supabase.from('ai_action_log').insert({
      module: 'outreach_engine',
      action_type: 'ai_decision_layer',
      target_id: 'pipeline',
      decision: { ...decision, stats: pipelineStats, executed: executedActions, shadowed: shadowedActions },
      confidence: aiConfidence,
      auto_executed: !shadowMode && executedActions.length > 0,
      escalated: actions.includes('pipeline_alert'),
      outcome,
      execution_time_ms: 0,
      created_at: new Date().toISOString()
    });

    console.log(`[OutreachEngine] AI decision layer (shadow=${shadowMode}):`, decision.reasoning, '| Actions:', (shadowMode ? shadowedActions : executedActions).join(', ') || 'none');
    return { actions: shadowMode ? shadowedActions : executedActions, reasoning: decision.reasoning, priority: decision.priority, shadow_mode: shadowMode };
  } catch (err) {
    console.error('[OutreachEngine] AI decision layer error:', err.message);
    return null;
  }
}

const CHAIN_BLOCKLIST = [
  'pep boys', 'firestone', 'midas', 'jiffy lube', 'valvoline', 'ntb', 'meineke',
  'maaco', 'aamco', 'goodyear', 'autozone', 'o\'reilly', 'advance auto parts',
  'caliber collision', 'service king', 'safelite', 'take 5', 'walmart', 'costco',
  'bj\'s', 'sam\'s club', 'bridgestone', 'brake masters', 'brakes plus',
  'christian brothers', 'big o tires', 'les schwab', 'monro', 'tires plus',
  'speedee', 'express oil change', 'grease monkey', 'napa auto', 'sears auto',
  'town fair tire', 'sullivan tire', 'discount tire', 'americas tire', 'belle tire',
  'tire kingdom', 'tire barn', 'kauffman tire', 'pepboys', 'jiffylube',
  'meineke car care', 'precision tune', 'tuffy', 'sun devil auto', 'car-x',
  'mr. tire', 'pep boys', 'national tire', 'dtlr', 'icahn automotive'
];

function isChainShop(name) {
  const lower = (name || '').toLowerCase();
  return CHAIN_BLOCKLIST.some(chain => lower.includes(chain));
}

async function importProviderLeadsFromPlaces(supabase, location, radiusMeters) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return 0;

  try {
    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`
    );
    const geoData = await geoRes.json();
    const coords = geoData.results?.[0]?.geometry?.location;
    if (!coords) return 0;

    const searches = [
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${coords.lat},${coords.lng}&radius=${radiusMeters}&type=car_repair&key=${apiKey}`,
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=snow+removal+snow+plow+near+${encodeURIComponent(location)}&location=${coords.lat},${coords.lng}&radius=${radiusMeters}&key=${apiKey}`
    ];
    const searchResults = await Promise.all(searches.map(url => fetch(url).then(r => r.json())));
    const places = [];
    const seenIds = new Set();
    for (const result of searchResults) {
      for (const p of (result.results || [])) {
        if (!seenIds.has(p.place_id)) {
          seenIds.add(p.place_id);
          places.push(p);
        }
      }
    }

    let newCount = 0;
    let skippedChains = 0;
    for (const p of places) {
      if (isChainShop(p.name)) {
        skippedChains++;
        continue;
      }

      const { data: existingLead } = await supabase
        .from('outreach_leads')
        .select('id')
        .eq('name', p.name)
        .eq('location', p.vicinity || location)
        .maybeSingle();
      if (existingLead) continue;

      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('business_name', p.name)
        .maybeSingle();

      const leadData = {
        type: 'provider',
        name: p.name,
        location: p.vicinity || location,
        source: 'google_places',
        status: 'new',
        metadata: {
          place_id: p.place_id,
          rating: p.rating,
          user_ratings_total: p.user_ratings_total,
          open_now: p.opening_hours?.open_now
        }
      };

      if (existingProfile) {
        leadData.crm_profile_id = existingProfile.id;
        leadData.crm_sync_status = 'duplicate';
      } else {
        leadData.crm_sync_status = 'unlinked';
        newCount++;
      }

      const { data: inserted } = await supabase.from('outreach_leads').insert(leadData).select('*').single();
      if (inserted && p.place_id) {
        await enrichLeadFromPlaceDetails(supabase, inserted);
        await new Promise(r => setTimeout(r, 300));
      }
    }

    if (skippedChains > 0) console.log(`[OutreachEngine] Skipped ${skippedChains} chain/franchise shops in ${location}`);
    return newCount;
  } catch (err) {
    console.error('[OutreachEngine] Places import error:', err.message);
    return 0;
  }
}

async function importMemberLeadsFromPlaces(supabase, location, radiusMeters) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return 0;

  try {
    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`
    );
    const geoData = await geoRes.json();
    const coords = geoData.results?.[0]?.geometry?.location;
    if (!coords) return 0;

    const memberSearches = [
      { query: 'property management company', note: 'Property management company — potential snow removal and fleet maintenance customer.' },
      { query: 'HOA homeowners association', note: 'HOA / homeowners association — potential snow removal and community maintenance customer.' },
      { query: 'car dealership', note: 'Car dealership — potential source of new car owners needing maintenance services.' },
      { query: 'fleet management company', note: 'Fleet management company — high-value multi-vehicle account potential.' },
      { query: 'car rental agency', note: 'Car rental company — fleet maintenance and vehicle care needs.' },
      { query: 'apartment complex management', note: 'Apartment/condo management — snow removal and property maintenance customer.' },
      { query: 'commercial real estate management', note: 'Commercial property manager — snow removal and lot maintenance customer.' },
      { query: 'car wash detailing', note: 'Car wash / detailing shop — their customers are car owners who care about vehicle appearance. Great channel to reach car-proud owners.' },
      { query: 'auto parts store', note: 'Auto parts store — serves DIY car owners who may want professional help for bigger jobs. Potential partnership to reach their customer base.' },
      { query: 'car insurance agency', note: 'Car insurance agency — serves car owners directly. Partnership potential to recommend My Car Concierge to their policyholders.' },
      { query: 'parking garage valet', note: 'Parking garage / valet service — serves car owners daily. Partnership potential to promote My Car Concierge to their regular customers.' },
      { query: 'tire shop', note: 'Tire shop — their customers are car owners needing vehicle maintenance. Strong referral partnership potential.' },
      { query: 'gas station service center', note: 'Gas station / service center — high foot traffic from car owners. Partnership potential for referrals.' }
    ];

    let newCount = 0;
    for (const search of memberSearches) {
      const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(search.query + ' near ' + location)}&location=${coords.lat},${coords.lng}&radius=${radiusMeters}&key=${apiKey}`;
      const placesRes = await fetch(searchUrl);
      const placesData = await placesRes.json();
      const places = placesData.results || [];

      for (const p of places.slice(0, 10)) {
        const { data: existingLead } = await supabase
          .from('outreach_leads')
          .select('id')
          .eq('name', p.name)
          .eq('location', p.vicinity || location)
          .maybeSingle();
        if (existingLead) continue;

        const leadData = {
          type: 'member',
          name: p.name,
          location: p.vicinity || location,
          source: 'google_places',
          crm_sync_status: 'unlinked',
          status: 'new',
          notes: search.note,
          metadata: {
            place_id: p.place_id,
            rating: p.rating,
            user_ratings_total: p.user_ratings_total,
            open_now: p.opening_hours?.open_now,
            search_category: search.query
          }
        };

        const { data: inserted } = await supabase.from('outreach_leads').insert(leadData).select('*').single();
        if (inserted && p.place_id) {
          await enrichLeadFromPlaceDetails(supabase, inserted);
          await new Promise(r => setTimeout(r, 300));
        }
        newCount++;
      }
      await new Promise(r => setTimeout(r, 200));
    }

    if (newCount > 0) console.log(`[OutreachEngine] Discovered ${newCount} potential member leads in ${location}`);
    return newCount;
  } catch (err) {
    console.error('[OutreachEngine] Member Places import error:', err.message);
    return 0;
  }
}

async function discoverCarOwnerCommunities(supabase, location) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return 0;

  try {
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const searchQueries = [
      `car clubs and automotive enthusiast groups in ${location} with contact information or websites`,
      `car meetup groups and car show organizers in ${location} with email or website`,
      `Facebook groups for car owners and automotive community in ${location}`,
      `local automotive forums and car owner communities near ${location}`
    ];

    let newCount = 0;
    for (const query of searchQueries) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: query,
          config: {
            tools: [{ googleSearch: {} }],
            temperature: 0.3
          }
        });

        const text = response.text || '';
        if (!text || text.length < 50) continue;

        const parsePrompt = `Extract community/group leads from this search result. Return ONLY a valid JSON array of objects with these fields: name (string), website (string or null), email (string or null), description (string, brief), type (one of: car_club, meetup_group, facebook_group, forum, car_show, community_page).

If no leads can be extracted, return an empty array [].

Search result:
${text.substring(0, 3000)}`;

        const parseResult = await callAI(parsePrompt, 2000);
        const parsed = parseResult.text;
        const clean = parsed.replace(/```json|```/g, '').trim();
        let communities = [];
        try {
          communities = JSON.parse(clean);
        } catch (e) {
          const match = clean.match(/\[[\s\S]*\]/);
          if (match) try { communities = JSON.parse(match[0]); } catch (e2) { continue; }
        }

        if (!Array.isArray(communities)) continue;

        for (const c of communities) {
          if (!c.name) continue;

          const { data: existing } = await supabase
            .from('outreach_leads')
            .select('id')
            .eq('name', c.name)
            .maybeSingle();
          if (existing) continue;

          const leadData = {
            type: 'member',
            name: c.name,
            email: c.email || null,
            location: location,
            source: 'community_discovery',
            crm_sync_status: 'unlinked',
            status: 'new',
            notes: `${c.type?.replace(/_/g, ' ') || 'Car community'}: ${c.description || 'Local automotive community'}. Reach out to organizer/admin to promote My Car Concierge to their car-owner members.`,
            metadata: {
              community_type: c.type,
              website: c.website,
              search_query: query
            }
          };

          await supabase.from('outreach_leads').insert(leadData);
          newCount++;
        }

        await new Promise(r => setTimeout(r, 1000));
      } catch (queryErr) {
        console.error(`[OutreachEngine] Community search error for query: ${queryErr.message}`);
      }
    }

    if (newCount > 0) console.log(`[OutreachEngine] Discovered ${newCount} car owner communities in ${location}`);
    return newCount;
  } catch (err) {
    console.error('[OutreachEngine] Community discovery error:', err.message);
    return 0;
  }
}

async function enrichLeadFromPlaceDetails(supabase, lead) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;
  const placeId = lead.metadata?.place_id;
  if (!placeId) return null;

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=formatted_phone_number,website,formatted_address&key=${apiKey}`
    );
    const data = await res.json();
    const result = data.result;
    if (!result) return null;

    const update = {};
    if (result.formatted_phone_number && !lead.phone) {
      update.phone = result.formatted_phone_number;
    }
    if (result.formatted_address) {
      update.location = result.formatted_address;
    }

    const meta = { ...(lead.metadata || {}) };
    if (result.website) meta.website = result.website;
    update.metadata = meta;

    if (result.website && !lead.email) {
      const email = await extractEmailFromWebsite(result.website);
      if (email) update.email = email;
    }

    if (Object.keys(update).length > 0) {
      await supabase.from('outreach_leads').update(update).eq('id', lead.id);
    }

    return update;
  } catch (err) {
    console.error(`[OutreachEngine] Enrich error for ${lead.name}:`, err.message);
    return null;
  }
}

async function extractEmailFromWebsite(websiteUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const pagesToCheck = [websiteUrl];
    const baseUrl = new URL(websiteUrl).origin;
    pagesToCheck.push(baseUrl + '/contact');
    pagesToCheck.push(baseUrl + '/about');
    pagesToCheck.push(baseUrl + '/contact-us');

    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const skipPatterns = ['example.com', 'domain.com', 'email.com', 'yourdomain', 'sentry.io', 'wixpress', 'googleapis'];

    for (const pageUrl of pagesToCheck) {
      try {
        const res = await fetch(pageUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MyConciergeBot/1.0)' },
          redirect: 'follow'
        });
        if (!res.ok) continue;
        const html = await res.text();
        const emails = html.match(emailRegex) || [];
        const validEmails = emails.filter(e => {
          const lower = e.toLowerCase();
          return !skipPatterns.some(p => lower.includes(p)) && !lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.endsWith('.css') && !lower.endsWith('.js');
        });
        if (validEmails.length > 0) {
          clearTimeout(timeout);
          return validEmails[0];
        }
      } catch (e) {
        continue;
      }
    }

    clearTimeout(timeout);
    return null;
  } catch (err) {
    return null;
  }
}

async function enrichAllLeads(supabase) {
  const { data: leads } = await supabase
    .from('outreach_leads')
    .select('*')
    .eq('source', 'google_places')
    .or('email.is.null,phone.is.null')
    .limit(100);

  if (!leads || leads.length === 0) return { enriched: 0, total: 0 };

  let enriched = 0;
  for (const lead of leads) {
    const result = await enrichLeadFromPlaceDetails(supabase, lead);
    if (result && (result.phone || result.email)) {
      enriched++;
      console.log(`[OutreachEngine] Enriched: ${lead.name} — phone: ${result.phone || 'none'}, email: ${result.email || 'none'}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  return { enriched, total: leads.length };
}

async function syncReengagementLeads(supabase) {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const { data: dormantMembers } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, created_at')
      .eq('role', 'member')
      .is('outreach_lead_id', null)
      .not('email', 'like', '%@sim-mcc.test')
      .not('email', 'is', null)
      .lt('created_at', threeDaysAgo)
      .order('created_at', { ascending: true })
      .limit(100);

    let memberCount = 0;
    for (const m of (dormantMembers || [])) {
      const { data: existing } = await supabase
        .from('outreach_leads')
        .select('id')
        .eq('crm_profile_id', m.id)
        .maybeSingle();
      if (existing) continue;

      const { count: vehicleCount } = await supabase
        .from('vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', m.id);

      const daysSinceSignup = Math.floor((Date.now() - new Date(m.created_at).getTime()) / (1000 * 60 * 60 * 24));
      let notes = '';
      if ((vehicleCount || 0) === 0) {
        notes = `Signed up ${daysSinceSignup} days ago but never added a vehicle or completed their profile. Needs a gentle nudge to explore the platform.`;
      } else {
        notes = `Signed up ${daysSinceSignup} days ago and added ${vehicleCount} vehicle(s) but never requested a service quote. Ready to be shown the value of getting quotes.`;
      }

      await supabase.from('outreach_leads').insert({
        type: 'member',
        name: m.full_name || m.email.split('@')[0],
        email: m.email,
        phone: m.phone,
        source: 'crm_reengagement',
        crm_profile_id: m.id,
        crm_sync_status: 'linked',
        notes,
        status: 'new'
      });
      memberCount++;
    }
    if (memberCount > 0) console.log(`[OutreachEngine] Found ${memberCount} dormant members for re-engagement`);

    const { data: stalledApps } = await supabase
      .from('provider_applications')
      .select('user_id, status, updated_at')
      .not('status', 'in', '("rejected","approved")')
      .lt('updated_at', new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString());

    for (const app of (stalledApps || [])) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, business_name, email, phone')
        .eq('id', app.user_id)
        .is('outreach_lead_id', null)
        .maybeSingle();
      if (!profile) continue;

      const { data: existing } = await supabase
        .from('outreach_leads')
        .select('id')
        .eq('crm_profile_id', profile.id)
        .maybeSingle();
      if (existing) continue;

      await supabase.from('outreach_leads').insert({
        type: 'provider',
        name: profile.business_name || profile.full_name || 'Unknown',
        email: profile.email,
        phone: profile.phone,
        source: 'crm_reengagement',
        crm_profile_id: profile.id,
        crm_sync_status: 'linked',
        notes: `Provider application stalled. Current status: ${app.status}.`,
        status: 'new'
      });
    }

    await syncReferralNudges(supabase);
  } catch (err) {
    console.error('[OutreachEngine] Re-engagement sync error:', err.message);
  }
}

async function syncReferralNudges(supabase) {
  try {
    const { data: activeMembers } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone')
      .eq('role', 'member')
      .not('email', 'is', null)
      .not('email', 'like', '%@sim-mcc.test');

    let nudgeCount = 0;
    for (const m of (activeMembers || [])) {
      const { count: serviceCount } = await supabase
        .from('service_requests')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', m.id);

      if (!serviceCount || serviceCount === 0) continue;

      const { data: recentNudge } = await supabase
        .from('outreach_leads')
        .select('id, created_at')
        .eq('crm_profile_id', m.id)
        .eq('source', 'referral_nudge')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentNudge) {
        const daysSinceNudge = (Date.now() - new Date(recentNudge.created_at).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceNudge < 30) continue;
      }

      await supabase.from('outreach_leads').insert({
        type: 'member',
        name: m.full_name || m.email.split('@')[0],
        email: m.email,
        phone: m.phone,
        source: 'referral_nudge',
        crm_profile_id: m.id,
        crm_sync_status: 'linked',
        notes: `Active member who has completed ${serviceCount} service request(s). Encourage them to refer friends and family using the referral program for rewards.`,
        status: 'new'
      });
      nudgeCount++;
    }
    if (nudgeCount > 0) console.log(`[OutreachEngine] Created ${nudgeCount} referral nudge leads`);
  } catch (err) {
    console.error('[OutreachEngine] Referral nudge sync error:', err.message);
  }
}

async function scoreLeadsWithAI(supabase, leads) {
  if (leads.length === 0) return 0;

  const BATCH_SIZE = 25;
  let totalScored = 0;

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    try {
      const prompt = `You are a lead qualification assistant for My Car Concierge, an automotive service marketplace.

Score each of the following leads from 0-100 based on how likely they are to convert and how valuable they would be.

For providers (auto repair shops): high scores for shops with many reviews, good ratings, and locations in target markets.
For members (vehicle owners / businesses): high scores for fleet companies (multiple vehicles = recurring revenue), property management companies and HOAs (snow removal + property maintenance contracts), car dealerships (steady stream of new car buyers needing maintenance), tire shops and auto parts stores (high-volume referral partners), car washes and detailing shops (cross-promotion with car-proud owners), insurance agencies (value-add for policyholders), car clubs and communities (access to engaged car enthusiasts), and parking/valet services (daily car owner interactions). Leads with complete contact info (email + phone) score higher. Community leads (car clubs, forums, Facebook groups) score well because they provide access to many individual car owners through one relationship.
For investors: high scores for leads with specific company/title context.

Respond ONLY with a valid JSON array, one object per lead. Keep score_rationale and ai_notes brief (under 30 words each):
[
  {
    "lead_id": "uuid",
    "opportunity_score": 75,
    "priority": "high",
    "recommended_channel": "email",
    "score_rationale": "brief reason",
    "ai_notes": "brief outreach tip"
  }
]

Priority rules: score >= 70 = "high", 40-69 = "medium", < 40 = "low"
Channel rules: use "email" if email available, "sms" if only phone, "both" if both available

Leads to score:
${JSON.stringify(batch, null, 2)}`;

      const aiResult = await callAI(prompt, 4000);
      const clean = aiResult.text.replace(/```json|```/g, '').trim();
      let scores;
      try {
        scores = JSON.parse(clean);
      } catch (parseErr) {
        const arrayMatch = clean.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          try { scores = JSON.parse(arrayMatch[0]); }
          catch (e) { console.error('[OutreachEngine] Batch parse recovery failed, raw:', clean.substring(0, 500)); continue; }
        } else {
          console.error('[OutreachEngine] Batch parse failed, raw:', clean.substring(0, 500));
          continue;
        }
      }

      const pipelineRows = scores.map(s => ({
        lead_id: s.lead_id,
        opportunity_score: Math.min(100, Math.max(0, s.opportunity_score || 50)),
        priority: ['high', 'medium', 'low'].includes(s.priority) ? s.priority : 'medium',
        recommended_channel: ['email', 'sms', 'both'].includes(s.recommended_channel) ? s.recommended_channel : 'email',
        score_rationale: s.score_rationale || '',
        ai_notes: s.ai_notes || '',
        stage: 'draft_ready'
      }));

      if (pipelineRows.length > 0) {
        await supabase.from('opportunity_pipeline').upsert(pipelineRows, {
          onConflict: 'lead_id',
          ignoreDuplicates: false
        });
      }

      for (const s of scores) {
        await supabase.from('outreach_activity_log').insert({
          lead_id: s.lead_id,
          event_type: 'scored',
          metadata: { score: s.opportunity_score, priority: s.priority }
        });
      }

      totalScored += scores.length;
      console.log(`[OutreachEngine] Scored batch ${Math.floor(i / BATCH_SIZE) + 1}: ${scores.length} leads (via ${aiResult.provider})`);
    } catch (err) {
      console.error(`[OutreachEngine] Scoring batch error:`, err.message);
      break;
    }
  }

  return totalScored;
}

async function draftMessageWithAI(lead, channel, sequenceStep) {
  try {
    const audienceContext = {
      member: 'a potential founding member — a vehicle owner, property manager, fleet operator, or business invited to join My Car Concierge while it is still in its early startup stage. Founding members get in on the ground floor: early access, the chance to shape the platform, and loyalty perks from day one. They benefit from posting their auto or property service needs and receiving competitive bids from vetted local providers, with secure escrow payments and vehicle maintenance tracking all in one platform',
      provider: 'a potential founding provider — an auto service provider (mechanic, body shop, detailer, etc.) invited to join My Car Concierge while it is still in its early startup stage. Founding providers get priority visibility, early access to new customers as the platform grows, and the chance to build their reputation before the competition arrives. They benefit from a steady stream of pre-qualified local customers, secure escrow payments, and tools like Car Club loyalty programs to build repeat business — with no platform fees',
      investor: 'a potential investor or strategic partner evaluating My Car Concierge — an early-stage automotive marketplace startup with a growing founding community, escrow payments, Car Club loyalty, AI-powered customer acquisition, and a clear path to scale. My Car Concierge is actively raising on Wefunder at wefunder.com/my.car.concierge?utm_source=email&utm_medium=outreach&utm_campaign=followup — direct them there to learn more and invest. This is a community crowdfunding round open to everyday investors, not just institutions'
    };

    const channelInstruction = channel === 'sms'
      ? 'Write a brief SMS message under 160 characters. Be direct, friendly, and include a call to action.'
      : 'Write a professional email. Include TWO subject line variants on the first two lines in the format "Subject A: [subject]" and "Subject B: [subject]". Make them meaningfully different in tone or angle. Then a blank line, then the body.';

    let followUpNote;
    if (sequenceStep === 1) {
      followUpNote = 'This is the first outreach. Introduce My Car Concierge warmly and clearly.';
    } else if (sequenceStep === 2) {
      followUpNote = 'This is follow-up #2. Reference that we reached out a few days ago. Add a new angle or benefit they may have missed. Keep it shorter than the original.';
    } else {
      followUpNote = 'This is the FINAL follow-up (#3). Reference that My Car Concierge has an active community fundraising round live on Wefunder (wefunder.com/my.car.concierge?utm_source=email&utm_medium=outreach&utm_campaign=followup) — the team is actively investing in growing the platform and this is the time to get in early as a founding partner before it scales. Create genuine urgency — founding partner perks exist specifically for the early stage and will not carry the same weight once the platform is established. Keep it concise and respectful of their time. Make it clear this is the last message unless they respond.';
    }

    let contextNote = '';
    if (lead.source === 'referral_nudge') {
      contextNote = 'IMPORTANT: This person is an ACTIVE My Car Concierge member who has used the platform. Do NOT pitch the platform. Instead, thank them for being a valued member and encourage them to share My Car Concierge with friends and family. Mention that they can earn rewards through the referral program. Keep it appreciative, not transactional.';
    } else if (lead.source === 'crm_reengagement' && lead.type === 'member') {
      contextNote = 'IMPORTANT: This person signed up for My Car Concierge but has not fully engaged. Do NOT pitch the platform as if they have never heard of it. Instead, re-engage them warmly based on their activity level (see Notes). If they never added a vehicle, highlight how easy it is to get started. If they added vehicles but never got a quote, highlight the value of comparing bids from verified providers.';
    } else if (lead.source === 'crm_reengagement') {
      contextNote = 'IMPORTANT: This person is an existing My Car Concierge user. Do NOT pitch the platform as if they have never heard of it. Instead, re-engage them warmly.';
    } else if (lead.source === 'google_places' && lead.type === 'member') {
      const searchCat = lead.metadata?.search_category || '';
      if (searchCat.includes('property') || searchCat.includes('HOA') || searchCat.includes('apartment') || searchCat.includes('real estate')) {
        contextNote = 'IMPORTANT: This is a property management company, HOA, or real estate manager discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and we are actively recruiting founding partners. Pitch snow removal services and property maintenance — explain how My Car Concierge connects them with vetted local snow removal and maintenance providers, with competitive bidding and guaranteed service. Emphasize seasonal contracts, reliable scheduling, and one platform for all property maintenance needs. As an early partner, they get priority attention and help shape the platform.';
      } else if (searchCat.includes('fleet')) {
        contextNote = 'IMPORTANT: This is a fleet management company discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and building its founding community. Pitch fleet vehicle maintenance — explain how My Car Concierge connects them with vetted local mechanics and shops, with competitive bidding across their entire fleet. Emphasize cost savings from comparing multiple providers, centralized maintenance tracking, and guaranteed quality service. As a founding member, they get early access and priority support while the platform is still growing.';
      } else if (searchCat.includes('dealership')) {
        contextNote = 'IMPORTANT: This is a car dealership discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and looking for founding partners. Pitch a partnership — their customers (new car buyers) need ongoing maintenance after the warranty period. My Car Concierge can be a value-add they recommend to buyers, keeping their customers in a trusted service ecosystem. As an early partner, they get ground-floor access and can help shape how the platform serves their customers. Also mention fleet/lot maintenance needs.';
      } else if (searchCat.includes('rental')) {
        contextNote = 'IMPORTANT: This is a car rental company discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and building its founding community. Pitch fleet maintenance services — explain how My Car Concierge helps them maintain their rental fleet with vetted providers, competitive pricing, and streamlined scheduling across multiple vehicles. As a founding member, they get priority support and early access to new features.';
      } else if (searchCat.includes('car wash') || searchCat.includes('detailing')) {
        contextNote = 'IMPORTANT: This is a car wash or detailing business discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and actively looking for founding providers and partners. Their customers already care about their vehicles — that makes them ideal My Car Concierge members. Pitch a cross-promotion partnership: we send our members their way for detailing, they recommend My Car Concierge to their customers for mechanical repairs, maintenance, and other services they don\'t offer. As a founding partner, they get in on the ground floor — early visibility, priority placement, and the chance to build their reputation on the platform before the competition. Mention our Car Club loyalty program — they could create their own loyalty punch card on My Car Concierge to reward repeat customers and drive retention.';
      } else if (searchCat.includes('auto parts')) {
        contextNote = 'IMPORTANT: This is an auto parts store discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and building its founding community. Their customers are hands-on car owners — some DIY, some need professional help for bigger jobs. Pitch a referral partnership: when their customers need a mechanic for installation or complex repairs, they can recommend My Car Concierge as a trusted resource for finding vetted local shops with competitive pricing. As an early referral partner, they get ground-floor commissions and visibility as the platform grows. Mention there are no platform fees — providers keep 100% of what they earn.';
      } else if (searchCat.includes('insurance')) {
        contextNote = 'IMPORTANT: This is a car insurance agency discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and looking for founding partners. Every one of their policyholders owns a vehicle that needs maintenance. Pitch My Car Concierge as a value-add for their clients — by recommending My Car Concierge, they help policyholders find trusted repair shops with competitive bidding, which can mean better-quality repairs and fewer claims from shoddy work. As an early partner, they get to be among the first to offer this resource to their clients. Position My Car Concierge as a resource that complements their service, not competes with it.';
      } else if (searchCat.includes('parking') || searchCat.includes('valet')) {
        contextNote = 'IMPORTANT: This is a parking garage or valet service discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and looking for founding partners. They interact with car owners daily. Pitch a partnership where they share My Car Concierge with their customers — perhaps through signage, flyers, or a digital display. Their customers trust them with their vehicles already, so a recommendation for trusted auto services is a natural fit. As a founding referral partner, they get in early and earn commissions as the platform grows.';
      } else if (searchCat.includes('tire')) {
        contextNote = 'IMPORTANT: This is a tire shop discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and actively recruiting founding providers. Their customers are already spending on vehicle maintenance. Pitch a dual opportunity: join as a founding provider to receive new customers for tire services with priority visibility and early-mover advantage, AND refer customers who need services beyond tires (brakes, alignment, engine work) to earn referral commissions. Mention the Car Club loyalty program as a retention tool for building repeat business from day one.';
      } else if (searchCat.includes('gas station')) {
        contextNote = 'IMPORTANT: This is a gas station or service center discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and building its founding community. They see hundreds of car owners daily. Pitch a simple partnership — display My Car Concierge info at the pump or in-store to connect their customers with trusted auto services. If they have a service center, pitch joining as a founding provider with early-mover advantage — priority visibility and the chance to build their reputation on the platform before competitors. Highlight the high visibility and low effort of the partnership.';
      } else {
        contextNote = 'IMPORTANT: This is a business that serves car owners, discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and actively building its founding community of members, providers, and partners. Introduce My Car Concierge as a new platform where car owners get competitive bids from vetted local service providers for any auto need — maintenance, repairs, detailing, and more. As an early partner, they get ground-floor access, priority visibility, and the chance to grow with the platform. Pitch a partnership based on their business type: cross-promotion, referral commissions, or joining as a founding provider.';
      }
    } else if (lead.source === 'community_discovery') {
      contextNote = 'IMPORTANT: This is a car owner community, club, or group discovered online. The lead is the community organizer or admin — NOT an individual car owner. My Car Concierge is in its early startup stage and actively looking for founding community partners. Pitch a partnership: their members already love their vehicles and would benefit from a trusted platform to find vetted local mechanics, compare competitive repair quotes, and track vehicle maintenance. Offer concrete founding-partner benefits: a dedicated Car Club loyalty program on My Car Concierge with custom punch card rewards for their members, a co-branded landing page, referral commissions for the club, and the opportunity to shape how My Car Concierge serves car enthusiast communities as it grows. Being an early community partner means more influence, more visibility, and preferred status. Be respectful of their community — position My Car Concierge as a resource that enhances the ownership experience, not as advertising.';
    } else if (lead.source === 'google_places' && lead.type === 'provider') {
      contextNote = 'IMPORTANT: This is an auto service shop or provider discovered online. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and actively recruiting founding providers. Pitch the founding provider opportunity: they get in on the ground floor of a growing marketplace, with early-mover advantage — priority visibility, first access to new customers in their area, and the ability to build their reputation and reviews before competitors join. Emphasize there are no platform fees — providers keep 100% of what they earn, plus secure escrow payments, Car Club loyalty tools to build repeat business, and a steady pipeline of pre-qualified local customers. CONTEXT: My Car Concierge currently has an active community fundraising round on Wefunder (wefunder.com/my.car.concierge?utm_source=email&utm_medium=outreach&utm_campaign=followup), which reflects the team\'s commitment to growing the platform — mention it as a signal that the platform is serious and actively building. Frame this as a rare chance to be among the first providers on a platform that is actively investing in its growth — not just another listing site.';
    } else if (lead.source === 'Apollo' && lead.type === 'investor') {
      contextNote = 'IMPORTANT: This is a potential angel investor, VC, or financial professional discovered via Apollo.io. They may NOT have heard of My Car Concierge before. My Car Concierge is an early-stage automotive marketplace startup currently raising on Wefunder at wefunder.com/my.car.concierge?utm_source=email&utm_medium=outreach&utm_campaign=followup — a community crowdfunding round open to everyday investors, not just institutions. Describe what the platform actually is: a marketplace connecting car owners with vetted local service providers, featuring competitive bidding, escrow payments, Car Club loyalty programs, AI-powered tools, and vehicle maintenance tracking. Explain that the platform is in its early stage, actively building its founding community of members and providers, and seeking capital to fuel growth. Direct them to wefunder.com/my.car.concierge?utm_source=email&utm_medium=outreach&utm_campaign=followup to learn more and invest if interested. Do NOT make specific ROI promises, guaranteed return claims, earnings projections, or any securities-law-violating statements. Stick only to factual descriptions of what the platform does and what the Wefunder campaign is. Be warm, direct, and concise — this is an introduction, not a pitch deck.';
    } else if (lead.source === 'Apollo' && lead.type === 'provider') {
      contextNote = 'IMPORTANT: This is an auto service business owner or manager discovered via Apollo.io. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and actively recruiting founding providers. Pitch the founding provider opportunity: they get in on the ground floor of a marketplace that is actively building and growing, with early-mover advantage — priority visibility, first access to new local customers in their area, and the chance to build their reputation and reviews before competitors join. No platform fees — providers keep 100% of what they earn. Secure escrow payments protect both parties. Car Club loyalty tools help build repeat business. You may mention that My Car Concierge has an active fundraising campaign on Wefunder (wefunder.com/my.car.concierge?utm_source=email&utm_medium=outreach&utm_campaign=followup) as a factual signal that the platform is in active growth mode — but do NOT claim or imply that investors have committed funds or that the platform is "backed by investors."';
    } else if (lead.source === 'Apollo') {
      contextNote = 'IMPORTANT: This person was discovered via Apollo.io. They have NOT heard of My Car Concierge before. My Car Concierge is in its early startup stage and actively building its founding community. Mention the Wefunder campaign (wefunder.com/my.car.concierge?utm_source=email&utm_medium=outreach&utm_campaign=followup) as a credibility signal. Pitch based on their apparent role — if they are in the auto industry, invite them as a founding provider; if they appear to be an investor or in finance, direct them to the Wefunder investment opportunity.';
    }

    const prompt = `You are a growth outreach assistant for My Car Concierge. ${BRAND_INFO}

You are writing a ${channel} message to ${audienceContext[lead.type] || audienceContext.member}.

Lead details:
- Name: ${lead.name}
- Company/Location: ${lead.company || lead.location || 'Not provided'}
- Notes: ${lead.notes || 'None'}
- Source: ${lead.source}

${contextNote}

Instructions:
- ${channelInstruction}
- ${followUpNote}
- Tone: warm, professional, concise — like a friendly introduction, not a sales pitch
- NEVER abbreviate the brand name. Always write "My Car Concierge" in full, NEVER "MCC"
- NEVER mention phone calls, scheduling a call, or "let's hop on a call" — keep the next step as visiting mycarconcierge.com
- Do NOT be pushy, salesy, or use fake urgency
- Keep the email short and clear — explain what My Car Concierge does in plain language (car owners post service needs, vetted local providers submit competitive bids, secure escrow payments handle the rest)
- Explain how they specifically benefit (for providers: priority visibility, first access to customers, no platform fees; for members: competitive bids from vetted local shops, no more calling around)
- For investors: do NOT make specific ROI promises, earnings claims, or securities claims
- End with a simple call to action pointing to mycarconcierge.com
- Use the lead's name or team name naturally in the greeting (e.g., "Hi [Name] Team," or "Hi [Name],")
- Sign off as "Best regards,\nMy Car Concierge Team"
- Platform link: mycarconcierge.com

STYLE REFERENCE (follow this tone and structure for provider emails):
Hi [Business Name] Team,

I'm reaching out from My Car Concierge, a new auto service marketplace launching in the [area] area. Car owners post their service needs, and vetted local providers like you submit competitive bids — we handle secure escrow payments so there's no chasing invoices.

We're inviting select providers to join as founding members, giving you priority visibility and first access to customers before competitors arrive — with no platform fees.

Learn more and get started at mycarconcierge.com.

Best regards,
My Car Concierge Team

LEGAL COMPLIANCE (REQUIRED):
- The message MUST clearly identify it is from "My Car Concierge" (sender identification)
- Do NOT use deceptive subject lines that misrepresent the content
- Do NOT make false claims, fake urgency, or misleading promises
- Do NOT include any income claims, guaranteed results, or earnings projections
- For SMS: keep message truthful, non-deceptive, and under 160 characters (opt-out notice will be appended automatically — do NOT include one yourself)
- For email: do NOT include an unsubscribe link or physical address (those are appended automatically)
- The message must be truthful, non-deceptive, and clearly commercial in nature
- Never impersonate or imply endorsement by any third party

Write the message now:`;

    const aiResult = await callAI(prompt, 600);
    const text = aiResult.text;
    let subject = null;
    let body = text;

    if (channel === 'email') {
      const lines = text.split('\n');
      const subjectLines = lines.filter(l => l.startsWith('Subject:') || l.startsWith('Subject A:') || l.startsWith('Subject B:'));
      let subjectA = null;
      let subjectB = null;

      if (subjectLines.length >= 2) {
        subjectA = subjectLines[0].replace(/^Subject\s*[AB]?:/, '').trim();
        subjectB = subjectLines[1].replace(/^Subject\s*[AB]?:/, '').trim();
        const lastSubjectIdx = lines.indexOf(subjectLines[subjectLines.length - 1]);
        body = lines.slice(lastSubjectIdx + 1).join('\n').trim();
      } else if (subjectLines.length === 1) {
        subjectA = subjectLines[0].replace('Subject:', '').trim();
        const idx = lines.indexOf(subjectLines[0]);
        body = lines.slice(idx + 1).join('\n').trim();
      }

      subject = subjectA;
      return { subject, subjectB, body };
    }

    return { subject, body };
  } catch (err) {
    console.error('[OutreachEngine] Draft error:', err.message);
    return null;
  }
}

const MAX_DAILY_SENDS = 100;

function getWarmupLimit() {
  return MAX_DAILY_SENDS;
}

async function checkDailySendLimit(supabase) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data: state } = await supabase.from('engine_state').select('warmup_start_date').eq('id', 1).single();
  const limit = getWarmupLimit(state?.warmup_start_date);
  const { count } = await supabase
    .from('outreach_messages')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent')
    .gte('sent_at', todayStart.toISOString());
  const sentToday = count || 0;
  if (sentToday >= limit) {
    console.log(`[OutreachEngine] Warmup limit reached: ${sentToday}/${limit} sends today`);
  }
  return sentToday < limit;
}

async function sendMessage(supabase, messageId) {
  const { data: msg } = await supabase
    .from('outreach_messages')
    .select('*, outreach_leads(*)')
    .eq('id', messageId)
    .single();

  if (!msg || msg.status !== 'approved') {
    return { error: 'Message not found or not approved' };
  }

  const lead = msg.outreach_leads;
  if (!lead) {
    await supabase.from('outreach_messages').update({ status: 'skipped' }).eq('id', messageId);
    return { error: 'Lead not found', skipped: true };
  }

  if (lead.status === 'unsubscribed' || lead.status === 'bounced') {
    await supabase.from('outreach_messages').update({ status: 'skipped' }).eq('id', messageId);
    return { error: `Lead has ${lead.status} — message blocked`, skipped: true };
  }

  const withinLimit = await checkDailySendLimit(supabase);
  if (!withinLimit) {
    console.log('[OutreachEngine] Daily send limit reached (' + MAX_DAILY_SENDS + '). Message queued for tomorrow.');
    return { error: 'Daily send limit reached. Message will be sent tomorrow.' };
  }

  const firstName = lead.name ? lead.name.split(' ')[0] : 'there';
  const bodyBase = msg.body
    .replace(/\[FIRST_NAME\]/g, firstName)
    .replace(/\[MCC_LINK\]/g, 'https://mycarconcierge.com')
    .replace(/\[LINK\]/g, 'https://mycarconcierge.com');

  let externalId = null;
  let error = null;

  if (msg.channel === 'email' && lead.email) {
    const resend = getResend();
    if (!resend) return { error: 'Email service not configured' };

    const unsubLink = `${UNSUBSCRIBE_URL}?email=${encodeURIComponent(lead.email)}&id=${lead.id}`;
    const textBody = bodyBase + `\n\n---\n${PHYSICAL_ADDRESS}\nTo stop receiving these emails: ${unsubLink}`;
    const openPixel = `<img src="${BASE_URL}/t/o?m=${messageId}" width="1" height="1" style="display:none;" alt="">`;
    const clickUrl = `${BASE_URL}/t/c?m=${messageId}&u=${encodeURIComponent('https://mycarconcierge.com')}`;
    const htmlBody = bodyBase
      .replace(/\n/g, '<br>')
      .replace(/https:\/\/mycarconcierge\.com/g, `<a href="${clickUrl}" style="color:#c9a84c;">mycarconcierge.com</a>`)
      + `<br><br><hr style="border-color:#333;"><p style="font-size:12px;color:#888;">${PHYSICAL_ADDRESS}<br><a href="${unsubLink}" style="color:#888;">Unsubscribe</a></p>${openPixel}`;

    try {
      const result = await resend.emails.send({
        from: 'My Car Concierge <jordan@mycarconcierge.com>',
        to: [lead.email],
        subject: msg.subject || 'My Car Concierge — Let\'s Connect',
        text: textBody,
        html: htmlBody,
        headers: {
          'List-Unsubscribe': `<${unsubLink}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        }
      });
      externalId = result.data?.id || result.id;
    } catch (err) {
      error = err.message;
    }
  } else if (msg.channel === 'sms' && lead.phone) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromPhone) {
      return { error: 'SMS service not configured' };
    }

    const body = bodyBase + SMS_OPT_OUT;

    try {
      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({ From: fromPhone, To: lead.phone, Body: body })
        }
      );
      const result = await twilioRes.json();
      if (twilioRes.ok) {
        externalId = result.sid;
      } else {
        error = result.message || 'SMS send failed';
      }
    } catch (err) {
      error = err.message;
    }
  } else {
    await supabase.from('outreach_messages').update({
      status: 'skipped',
      sent_at: null
    }).eq('id', messageId);
    try {
      await supabase.from('outreach_activity_log').insert({
        lead_id: lead.id,
        message_id: messageId,
        event_type: 'skipped',
        metadata: { reason: `No ${msg.channel} contact info for lead` }
      });
    } catch (_) {}
    return { error: 'No valid contact method for this channel', skipped: true };
  }

  await supabase.from('outreach_messages').update({
    status: error ? 'failed' : 'sent',
    sent_at: error ? null : new Date().toISOString(),
    resend_message_id: msg.channel === 'email' ? externalId : null,
    twilio_message_sid: msg.channel === 'sms' ? externalId : null
  }).eq('id', messageId);

  await supabase.from('outreach_activity_log').insert({
    lead_id: lead.id,
    message_id: msg.id,
    event_type: error ? 'send_failed' : 'sent',
    metadata: error ? { error } : { external_id: externalId }
  });

  if (!error) {
    await supabase.from('outreach_leads').update({ status: 'contacted' }).eq('id', lead.id);
    await supabase.from('opportunity_pipeline')
      .update({ stage: 'contacted', last_action_at: new Date().toISOString() })
      .eq('lead_id', lead.id);

    const { data: engineState } = await supabase.from('engine_state').select('total_messages_sent').eq('id', 1).single();
    await supabase.from('engine_state').update({
      total_messages_sent: (engineState?.total_messages_sent || 0) + 1
    }).eq('id', 1);
  }

  return { success: !error, error };
}

async function runFollowUpDrafts(supabase) {
  try {
    const { data: state } = await supabase.from('engine_state').select('*').eq('id', 1).single();
    if (!state?.is_running) return { skipped: true };
    if (state.auto_send === undefined) state.auto_send = true;

    const { data: step2Candidates } = await supabase.rpc('get_followup_candidates');

    const { data: step3Candidates } = await supabase
      .from('outreach_leads')
      .select('id, name, email, phone, type, outreach_messages!inner(channel, sequence_step, sent_at, opened_at)')
      .eq('status', 'contacted')
      .eq('outreach_messages.status', 'sent')
      .eq('outreach_messages.sequence_step', 2)
      .is('outreach_messages.opened_at', null)
      .lt('outreach_messages.sent_at', new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString());

    const step3Filtered = [];
    for (const lead of (step3Candidates || [])) {
      const { data: respondedCheck } = await supabase
        .from('opportunity_pipeline')
        .select('stage')
        .eq('lead_id', lead.id)
        .eq('stage', 'responded')
        .maybeSingle();
      if (respondedCheck) continue;

      const { count } = await supabase
        .from('outreach_messages')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', lead.id)
        .eq('sequence_step', 3);
      if (!count || count === 0) {
        const msg = Array.isArray(lead.outreach_messages) ? lead.outreach_messages[0] : lead.outreach_messages;
        step3Filtered.push({ ...lead, last_channel: msg?.channel || 'email', next_step: 3 });
      }
    }

    const allCandidates = [
      ...(step2Candidates || []).map(c => ({ ...c, next_step: 2 })),
      ...step3Filtered
    ];

    let drafted = 0;
    let autoSent = 0;

    for (const lead of allCandidates) {
      const step = lead.next_step;
      const isInvestor = lead.type === 'investor';
      const shouldAutoSend = state.auto_send && !isInvestor;
      const msgStatus = shouldAutoSend ? 'approved' : 'draft';

      const result = await draftMessageWithAI(lead, lead.last_channel || 'email', step);
      if (result) {
        const { data: inserted } = await supabase.from('outreach_messages').insert({
          lead_id: lead.id,
          channel: lead.last_channel || 'email',
          sequence_step: step,
          subject: result.subject,
          body: result.body,
          status: msgStatus
        }).select('id').single();
        drafted++;

        if (shouldAutoSend && inserted) {
          const sendResult = await sendMessage(supabase, inserted.id);
          if (sendResult.success) {
            autoSent++;
            await supabase.from('outreach_activity_log').insert({
              lead_id: lead.id,
              message_id: inserted.id,
              event_type: 'auto_sent',
              metadata: { channel: lead.last_channel || 'email', lead_type: lead.type, sequence_step: step }
            });
          }
        }
      }
    }

    return { drafted, auto_sent: autoSent, step2: (step2Candidates || []).length, step3: step3Filtered.length };
  } catch (err) {
    console.error('[OutreachEngine] Follow-up draft error:', err.message);
    return { error: err.message };
  }
}

async function runPipelineCleanup(supabase) {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('opportunity_pipeline')
      .update({ stage: 'dead' })
      .in('stage', ['new', 'draft_ready', 'message_queued'])
      .lt('added_at', thirtyDaysAgo)
      .select('id');

    return { cleaned: data?.length || 0, error };
  } catch (err) {
    return { error: err.message };
  }
}

// ─── Apollo.io Automated Discovery & Enrichment ───────────────────────────────

const DEFAULT_APOLLO_CONFIG = {
  enabled: false,
  interval_hours: 6,
  per_page: 25,
  auto_enrich: true,
  enrich_batch: 15,
  profile_rotation_index: 0,
  city_rotation_index: 0,
  page_rotation_index: 1,
  last_run: null,
  search_profiles: [
    {
      name: 'Providers',
      lead_type: 'provider',
      cities: [
        'Newark, NJ', 'Jersey City, NJ', 'East Rutherford, NJ', 'Paterson, NJ', 'Trenton, NJ',
        'New York, NY', 'Brooklyn, NY', 'Queens, NY', 'Bronx, NY', 'Staten Island, NY',
        'Philadelphia, PA', 'Stamford, CT', 'Bridgeport, CT', 'Hartford, CT',
        'Edison, NJ', 'Hoboken, NJ', 'Elizabeth, NJ', 'Woodbridge, NJ', 'Hackensack, NJ',
        'Long Island City, NY', 'White Plains, NY', 'Yonkers, NY'
      ],
      titles: ['owner', 'co-owner', 'founder', 'president', 'ceo', 'managing partner', 'general manager', 'operator', 'proprietor', 'shop foreman', 'service manager'],
      industries: ['auto repair', 'automotive', 'car repair', 'auto body', 'tire shop', 'oil change', 'vehicle maintenance', 'collision repair', 'auto detailing', 'car wash']
    },
    {
      name: 'Angel Investors',
      lead_type: 'investor',
      cities: [
        'New York, NY', 'Brooklyn, NY', 'Hoboken, NJ', 'Princeton, NJ', 'Short Hills, NJ',
        'San Francisco, CA', 'Palo Alto, CA', 'Menlo Park, CA', 'San Jose, CA',
        'Boston, MA', 'Cambridge, MA',
        'Austin, TX', 'Chicago, IL', 'Miami, FL', 'Los Angeles, CA',
        'Atlanta, GA', 'Seattle, WA', 'Denver, CO', 'Nashville, TN'
      ],
      titles: [
        'angel investor', 'active investor', 'general partner', 'managing partner', 'venture partner',
        'principal', 'investment director', 'managing director', 'chief investment officer',
        'portfolio manager', 'fund manager', 'founder', 'co-founder', 'partner',
        'limited partner', 'family office', 'startup advisor', 'board member'
      ],
      industries: [
        'venture capital', 'private equity', 'investment management', 'financial services',
        'angel investing', 'family office', 'startup', 'automotive', 'marketplace',
        'mobile applications', 'consumer technology', 'on-demand services'
      ]
    }
  ]
};

async function getApolloConfig(supabase) {
  try {
    const { data } = await supabase.from('engine_state').select('metadata').eq('id', 1).single();
    const cfg = data?.metadata?.apollo_config || {};
    return { ...DEFAULT_APOLLO_CONFIG, ...cfg };
  } catch (_) {
    return DEFAULT_APOLLO_CONFIG;
  }
}

async function saveApolloConfig(supabase, updates) {
  try {
    const { data } = await supabase.from('engine_state').select('metadata').eq('id', 1).single();
    const currentMeta = data?.metadata || {};
    const currentCfg = currentMeta.apollo_config || {};
    const newCfg = { ...DEFAULT_APOLLO_CONFIG, ...currentCfg, ...updates, last_saved: new Date().toISOString() };
    await supabase.from('engine_state').update({ metadata: { ...currentMeta, apollo_config: newCfg } }).eq('id', 1);
    return newCfg;
  } catch (err) {
    throw new Error('Failed to save Apollo config: ' + err.message);
  }
}

async function runWefunderBlastForEligible(supabase, { notify = true } = {}) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600000).toISOString();

  const { data: investorLeads } = await supabase
    .from('outreach_leads')
    .select('*')
    .eq('type', 'investor')
    .not('email', 'is', null)
    .neq('status', 'unsubscribed');

  const ids = (investorLeads || []).map(l => l.id);
  let recentLeadIds = new Set();
  if (ids.length > 0) {
    const { data: recent } = await supabase
      .from('outreach_messages')
      .select('lead_id')
      .eq('channel', 'email')
      .gte('created_at', thirtyDaysAgo)
      .in('lead_id', ids);
    recentLeadIds = new Set((recent || []).map(m => m.lead_id));
  }

  const eligible = (investorLeads || []).filter(l => !recentLeadIds.has(l.id));
  if (eligible.length === 0) return { drafted: 0, failed: 0, skipped: 0, total: ids.length };

  let drafted = 0, failed = 0;
  for (const lead of eligible) {
    try {
      const result = await draftWefunderBlastEmail(lead);
      if (!result || result.error) { failed++; continue; }
      await supabase.from('outreach_messages').insert({
        lead_id: lead.id,
        channel: 'email',
        subject: result.subject,
        body: result.body,
        status: 'draft',
        metadata: {
          blast_type: 'wefunder',
          subject_a: result.subject,
          subject_b: result.subjectB || null,
          ab_variant: 'A',
          auto_drafted: true
        }
      });
      drafted++;
    } catch (_) { failed++; }
    await new Promise(r => setTimeout(r, 350));
  }

  if (notify && drafted > 0) {
    try {
      await sendAdminSMS(supabase, `MCC Weekly Blast: ${drafted} new Wefunder draft${drafted !== 1 ? 's' : ''} queued for ${eligible.length} eligible investor leads. Review & approve in the admin Messages tab.`);
    } catch (_) {}
  }

  console.log(`[Wefunder] Blast run complete — drafted:${drafted} failed:${failed} eligible:${eligible.length}`);
  return { drafted, failed, skipped: recentLeadIds.size, total: ids.length };
}

async function draftWefunderBlastEmail(lead) {
  const firstName = lead.name?.split(' ')[0] || 'there';
  const companyCtx = lead.company ? ` at ${lead.company}` : '';
  const wefunderUrl = `wefunder.com/my.car.concierge?utm_source=email&utm_medium=outreach&utm_campaign=apollo_blast&utm_content=${lead.id}`;
  const prompt = `You are writing a cold outreach email on behalf of My Car Concierge to ${firstName}${companyCtx} — a potential angel investor or financial professional.

${BRAND_INFO}

My Car Concierge has an active community fundraising campaign live on Wefunder at ${wefunderUrl} — open to everyday investors and professionals alike.

Write a short, direct, warm email introducing My Car Concierge and pointing them to the Wefunder campaign. Keep it to 3–4 short paragraphs:
1. A brief personalized intro (use their first name; reference their company if available)
2. What My Car Concierge actually is and what problem it solves for car owners and service providers
3. That there is an active community funding round on Wefunder they can review at their own pace
4. A clear, soft CTA — check it out at ${wefunderUrl}, and offer to answer any questions

STRICT RULES:
- Do NOT make ROI promises, earnings projections, or guaranteed return claims
- Do NOT imply that investors have already committed funds — you do not know this
- Stick only to factual descriptions of what the platform does
- Be concise and respectful — this is an introduction, not a pitch deck
- Write as Jordan from My Car Concierge
- Sign off warmly

Write TWO subject line variants on the first two lines:
Subject A: [subject]
Subject B: [subject]
Then a blank line, then the email body starting with "Hi ${firstName},"`;

  try {
    const anthropic = getAnthropic();
    if (!anthropic) return { error: 'AI not configured' };

    const resp = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }]
    });
    const text = resp.content[0]?.text || '';

    const lines = text.trim().split('\n');
    let subject = '', subjectB = '', bodyLines = [], pastHeaders = false;
    for (const line of lines) {
      if (!pastHeaders && line.startsWith('Subject A:')) {
        subject = line.replace('Subject A:', '').trim();
      } else if (!pastHeaders && line.startsWith('Subject B:')) {
        subjectB = line.replace('Subject B:', '').trim();
      } else if (subject && subjectB && line.trim() === '') {
        pastHeaders = true;
      } else if (pastHeaders || (subject && line.trim() !== '')) {
        pastHeaders = true;
        bodyLines.push(line);
      }
    }

    const body = bodyLines.join('\n').trim();
    const urlPattern = /wefunder\.com\/my\.car\.concierge(?!\?)/g;
    const finalBody = body.replace(urlPattern, wefunderUrl);
    const finalSubject = (subject || 'My Car Concierge — Community Round Now Live on Wefunder').replace(urlPattern, wefunderUrl);
    const finalSubjectB = subjectB ? subjectB.replace(urlPattern, wefunderUrl) : null;

    return {
      subject: finalSubject,
      subjectB: finalSubjectB,
      body: finalBody
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function runApolloDiscoveryCycle(supabase) {
  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) return { skipped: true, reason: 'no_api_key' };

  const cfg = await getApolloConfig(supabase);
  if (!cfg.enabled) return { skipped: true, reason: 'automation_disabled' };

  const now = new Date();
  const lastRun = cfg.last_run ? new Date(cfg.last_run) : null;
  const hoursSinceLast = lastRun ? (now - lastRun) / 3600000 : Infinity;
  if (hoursSinceLast < cfg.interval_hours) {
    return { skipped: true, reason: 'not_due', next_run_in_hours: (cfg.interval_hours - hoursSinceLast).toFixed(1) };
  }

  console.log('[Apollo] Starting automated discovery cycle...');
  const results = { started_at: now.toISOString(), search_results: 0, with_email: 0, added: 0, enriched: 0, wefunder_drafted: 0, errors: [] };

  const apolloHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': apolloKey };

  try {
    // ── Select current search profile (rotates each cycle) ──
    const profiles = cfg.search_profiles || DEFAULT_APOLLO_CONFIG.search_profiles;
    const profileIdx = (cfg.profile_rotation_index || 0) % profiles.length;
    const profile = profiles[profileIdx];
    const leadType = profile.lead_type || 'provider';

    // ── Search phase: rotate through profile's cities ──
    const cities = profile.cities;
    const cityIdx = cfg.city_rotation_index % cities.length;
    const city = cities[cityIdx];
    const page = cfg.page_rotation_index || 1;

    console.log(`[Apollo] Profile "${profile.name}" — city "${city}" page ${page}...`);

    const searchPayload = {
      page,
      per_page: Math.min(cfg.per_page || 25, 100),
      person_titles: profile.titles,
      q_organization_keyword_tags: profile.industries,
      person_locations: [city]
    };

    const searchResp = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
      method: 'POST', headers: apolloHeaders, body: JSON.stringify(searchPayload)
    });
    const searchData = await searchResp.json();
    const people = searchData.people || [];

    results.search_results = people.length;
    results.profile = profile.name;
    console.log(`[Apollo] Found ${people.length} ${leadType} contacts in "${city}"`);

    const totalPages = Math.ceil((searchData.pagination?.total_entries || 25) / (cfg.per_page || 25));
    const nextPage = page >= totalPages ? 1 : page + 1;
    const nextCityIdx = nextPage === 1 ? (cityIdx + 1) % cities.length : cityIdx;
    const nextProfileIdx = nextPage === 1 && nextCityIdx === 0 ? (profileIdx + 1) % profiles.length : profileIdx;

    for (const person of people) {
      try {
        let email = person.email || null;
        let phone = person.phone_numbers?.[0]?.sanitized_number || null;
        const org = person.organization || {};
        const name = person.name || `${person.first_name || ''} ${person.last_name || ''}`.trim() || null;
        const website = org.website_url || null;
        const domain = website ? website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : null;
        const apolloPersonId = person.id || null;
        const metadata = { title: person.title, industry: org.industry, apollo_org_id: org.id, domain, apollo_id: apolloPersonId, apollo_profile: profile.name };

        const baseScore = leadType === 'investor' ? (email ? 85 : 40) : (email ? 72 : 32);

        const leadData = {
          name: name || org.name || 'Unknown',
          email: email || null,
          phone: phone || org.phone || null,
          company: org.name || null,
          type: leadType,
          source: 'Apollo',
          location: city,
          status: email ? 'new' : 'email_unknown',
          score: baseScore,
          apollo_id: apolloPersonId || null,
          linkedin_url: person.linkedin_url || null,
          website: website || null,
          metadata
        };

        let existing = null;
        if (apolloPersonId) {
          const { data: byId } = await supabase.from('outreach_leads').select('id,email').eq('apollo_id', apolloPersonId).maybeSingle();
          existing = byId;
        }
        if (!existing && email) {
          const { data: byEmail } = await supabase.from('outreach_leads').select('id,email').eq('email', email).maybeSingle();
          existing = byEmail;
        }

        if (!existing) {
          const { data: inserted } = await supabase.from('outreach_leads').insert(leadData).select('id').single();
          results.added++;
          if (email) {
            results.with_email++;
            // Auto-draft Wefunder blast email for new investor leads with email
            if (leadType === 'investor' && inserted?.id) {
              try {
                const { count: existingDraft } = await supabase
                  .from('outreach_messages')
                  .select('id', { count: 'exact', head: true })
                  .eq('lead_id', inserted.id)
                  .eq('channel', 'email')
                  .in('status', ['draft', 'approved', 'sent'])
                  .filter('metadata->>blast_type', 'eq', 'wefunder');
                if (!existingDraft || existingDraft === 0) {
                  const draft = await draftWefunderBlastEmail({ ...leadData, id: inserted.id });
                  if (draft && !draft.error) {
                    await supabase.from('outreach_messages').insert({
                      lead_id: inserted.id,
                      channel: 'email',
                      subject: draft.subject,
                      body: draft.body,
                      status: 'draft',
                      metadata: {
                        blast_type: 'wefunder',
                        subject_a: draft.subject,
                        subject_b: draft.subjectB || null,
                        ab_variant: 'A',
                        auto_drafted: true
                      }
                    });
                    results.wefunder_drafted++;
                  }
                }
              } catch (_) {}
              await new Promise(r => setTimeout(r, 350));
            }
            if (leadType === 'provider' && inserted?.id && process.env.INSTANTLY_API_KEY) {
              try {
                const { data: stateRow } = await supabase.from('engine_state').select('instantly_campaign_id').eq('id', 1).single();
                const campaignId = stateRow?.instantly_campaign_id || null;
                await pushLeadsToInstantly(supabase, [{ ...leadData, id: inserted.id }], campaignId);
                results.instantly_enrolled = (results.instantly_enrolled || 0) + 1;
              } catch (_) {}
            }
          }
        } else if (email && !existing.email) {
          await supabase.from('outreach_leads').update({ email, apollo_id: apolloPersonId || undefined, status: 'new', score: 72 }).eq('id', existing.id);
          results.with_email++;
        }
      } catch (personErr) {
        results.errors.push(personErr.message);
      }
    }

    // ── Enrichment phase ──
    if (cfg.auto_enrich) {
      console.log(`[Apollo] Running enrichment on email-less leads...`);
      const { data: toEnrich } = await supabase
        .from('outreach_leads')
        .select('id, name, email, company, website, phone, location, linkedin_url, metadata')
        .is('email', null)
        .not('company', 'is', null)
        .neq('status', 'unsubscribed')
        .neq('status', 'bounced')
        .order('score', { ascending: false })
        .limit(cfg.enrich_batch || 15);

      for (const lead of (toEnrich || [])) {
        try {
          const domain = lead.website ? lead.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : null;
          const ap = lead.metadata?.apollo_id;
          const enrichPayload = { reveal_personal_emails: true };
          if (ap) enrichPayload.id = ap;
          if (lead.name) enrichPayload.name = lead.name;
          if (lead.company) enrichPayload.organization_name = lead.company;
          if (domain) enrichPayload.domain = domain;
          if (lead.linkedin_url) enrichPayload.linkedin_url = lead.linkedin_url;

          const er = await fetch('https://api.apollo.io/api/v1/people/match', {
            method: 'POST', headers: apolloHeaders, body: JSON.stringify(enrichPayload)
          });
          if (er.ok) {
            const ed = await er.json();
            const foundEmail = ed.person?.email;
            const foundPhone = ed.person?.phone_numbers?.[0]?.sanitized_number;
            if (foundEmail) {
              await supabase.from('outreach_leads').update({ email: foundEmail, phone: foundPhone || lead.phone, status: 'new', score: 75 }).eq('id', lead.id);
              results.enriched++;
            }
          }
          await new Promise(r => setTimeout(r, 250));
        } catch (_) {}
      }
    }

    // ── Update config state ──
    await saveApolloConfig(supabase, { last_run: now.toISOString(), city_rotation_index: nextCityIdx, page_rotation_index: nextPage, profile_rotation_index: nextProfileIdx });

    // ── Log to activity log ──
    try {
      await supabase.from('outreach_activity_log').insert({ event_type: 'apollo_discovery_cycle', metadata: { city, page, ...results } });
    } catch (_) {}

    console.log(`[Apollo] Cycle complete — found:${results.search_results} added:${results.added} enriched:${results.enriched} wefunder_drafted:${results.wefunder_drafted} instantly_enrolled:${results.instantly_enrolled || 0}`);

    // ── Post-cycle admin SMS notification ──
    try {
      const newInvestors = leadType === 'investor' ? results.added : 0;
      const newProviders = leadType === 'provider' ? results.added : 0;
      const parts = [
        `MCC Outreach (${profile.name} · ${city}):`,
        `+${newInvestors} investor${newInvestors !== 1 ? 's' : ''}`,
        `+${newProviders} provider${newProviders !== 1 ? 's' : ''}`
      ];
      if (results.enriched > 0) parts.push(`${results.enriched} enriched`);
      if (results.wefunder_drafted > 0) parts.push(`⚡ ${results.wefunder_drafted} Wefunder draft${results.wefunder_drafted !== 1 ? 's' : ''} queued`);
      if (results.instantly_enrolled > 0) parts.push(`📧 ${results.instantly_enrolled} enrolled in Instantly`);
      if (results.added === 0 && results.enriched === 0) parts.push('no new leads this cycle');
      await sendAdminSMS(supabase, parts.join(' | '));
    } catch (_) {}

    return { success: true, city, page, ...results };

  } catch (err) {
    console.error('[Apollo] Discovery cycle error:', err.message);
    try { await supabase.from('outreach_activity_log').insert({ event_type: 'apollo_discovery_error', metadata: { error: err.message } }); } catch (_) {}
    return { success: false, error: err.message };
  }
}

// ──────────────────────────────────────────────────────────────────────────────

function startEngineSchedulers(getSupabaseClient) {
  if (engineCycleInterval) clearInterval(engineCycleInterval);
  if (followUpInterval) clearInterval(followUpInterval);
  if (cleanupInterval) clearInterval(cleanupInterval);
  if (apolloDiscoveryInterval) clearInterval(apolloDiscoveryInterval);
  if (wefunderBlastInterval) clearInterval(wefunderBlastInterval);
  if (dailyDigestTimeout) clearTimeout(dailyDigestTimeout);

  engineCycleInterval = setInterval(async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      console.log('[OutreachEngine] Running scheduled engine cycle...');
      await runEngineCycle(supabase);
    }
  }, 15 * 60 * 1000);

  setTimeout(async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      console.log('[OutreachEngine] Running initial follow-up check...');
      const result = await runFollowUpDrafts(supabase);
      console.log('[OutreachEngine] Initial follow-up check complete:', JSON.stringify(result));
    }
  }, 5 * 60 * 1000);

  followUpInterval = setInterval(async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      console.log('[OutreachEngine] Running follow-up draft cycle...');
      await runFollowUpDrafts(supabase);
    }
  }, 6 * 60 * 60 * 1000);

  cleanupInterval = setInterval(async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      console.log('[OutreachEngine] Running pipeline cleanup...');
      await runPipelineCleanup(supabase);
    }
  }, 7 * 24 * 60 * 60 * 1000);

  // Apollo discovery scheduler — checks every 30min whether a cycle is due
  apolloDiscoveryInterval = setInterval(async () => {
    const supabase = getSupabaseClient();
    if (supabase && process.env.APOLLO_API_KEY) {
      const result = await runApolloDiscoveryCycle(supabase);
      if (result.success) {
        console.log(`[Apollo] Scheduled cycle done — added:${result.added} enriched:${result.enriched}`);
      } else if (!result.skipped) {
        console.error('[Apollo] Scheduled cycle failed:', result.error);
      }
    }
  }, 30 * 60 * 1000);

  // Run Apollo initial check after 2 minutes
  setTimeout(async () => {
    const supabase = getSupabaseClient();
    if (supabase && process.env.APOLLO_API_KEY) {
      const result = await runApolloDiscoveryCycle(supabase);
      if (result.success) console.log(`[Apollo] Initial cycle done — added:${result.added} enriched:${result.enriched}`);
    }
  }, 2 * 60 * 1000);

  // ── Weekly Wefunder blast refresh ──
  // Initial run after 10 minutes, then every 7 days
  setTimeout(async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      console.log('[Wefunder] Running initial weekly blast check...');
      try {
        const r = await runWefunderBlastForEligible(supabase, { notify: true });
        console.log(`[Wefunder] Initial blast check done — drafted:${r.drafted} eligible:${r.total}`);
      } catch (err) {
        console.error('[Wefunder] Initial blast check error:', err.message);
      }
    }
  }, 10 * 60 * 1000);

  wefunderBlastInterval = setInterval(async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      console.log('[Wefunder] Running weekly blast refresh...');
      try {
        const r = await runWefunderBlastForEligible(supabase, { notify: true });
        console.log(`[Wefunder] Weekly blast done — drafted:${r.drafted} skipped:${r.skipped}`);
      } catch (err) {
        console.error('[Wefunder] Weekly blast error:', err.message);
      }
    }
  }, 7 * 24 * 60 * 60 * 1000);

  // ── Nightly admin digest SMS (configurable UTC hour, default 01:00 ≈ 8 PM ET) ──
  async function scheduleNightlyDigest() {
    let digestHourUtc = 1; // default
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data } = await supabase.from('engine_state').select('metadata').eq('id', 1).single();
        const cfg = data?.metadata?.digest_config || {};
        if (typeof cfg.hour_utc === 'number') digestHourUtc = cfg.hour_utc;
      }
    } catch (_) {}

    const now = new Date();
    const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), digestHourUtc, 0, 0, 0));
    if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
    const msUntil = target - now;

    dailyDigestTimeout = setTimeout(async function runDigest() {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const todayStart = new Date();
          todayStart.setUTCHours(0, 0, 0, 0);
          const todayISO = todayStart.toISOString();

          const [
            { count: totalInvestors },
            { count: pendingDrafts },
            { count: sentToday },
            { count: providersToday }
          ] = await Promise.all([
            supabase.from('outreach_leads').select('id', { count: 'exact', head: true }).eq('type', 'investor').not('email', 'is', null),
            supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('status', 'draft').eq('channel', 'email'),
            supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('sent_at', todayISO),
            supabase.from('outreach_leads').select('id', { count: 'exact', head: true }).eq('type', 'provider').gte('created_at', todayISO)
          ]);

          const msg = [
            `MCC Daily Digest (${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}):`,
            `${totalInvestors || 0} investor leads total`,
            `${pendingDrafts || 0} draft${pendingDrafts !== 1 ? 's' : ''} awaiting approval`,
            `${sentToday || 0} message${sentToday !== 1 ? 's' : ''} sent today`,
            `${providersToday || 0} provider lead${providersToday !== 1 ? 's' : ''} discovered today`
          ].join(' | ');

          await sendAdminSMS(supabase, msg);
          console.log('[AdminSMS] Nightly digest sent:', msg);
        } catch (err) {
          console.error('[AdminSMS] Nightly digest error:', err.message);
        }
      }
      // Reschedule for next night (re-reads config each time to pick up changes)
      scheduleNightlyDigest();
    }, msUntil);
    console.log(`[AdminSMS] Nightly digest scheduled in ${Math.round(msUntil / 60000)}min (${digestHourUtc}:00 UTC)`);
  }
  scheduleNightlyDigest();

  console.log('[OutreachEngine] Schedulers started: cycle=15min, follow-ups=6h, cleanup=7d, apollo=30min-check, wefunder-blast=weekly, digest=nightly');
}

async function handleOutreachRequest(req, res, { getSupabaseClient, handleAdminAuth, setCorsHeaders, requestId }) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace('/api/admin/outreach', '');

  if (req.method === 'OPTIONS') {
    setCorsHeaders(res, req);
    res.writeHead(204);
    res.end();
    return true;
  }

  setCorsHeaders(res, req);

  return new Promise((resolve) => {
    handleAdminAuth(req, res, requestId, async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) {
          json(res, 500, { error: 'Database not configured' });
          resolve(true);
          return;
        }

        if (req.method === 'GET' && pathname === '/schema-status') {
          const ready = await checkSchemaExists(supabase);
          json(res, 200, { schema_ready: ready, message: ready ? 'Schema is set up' : 'Run outreach-schema.sql in your Supabase SQL Editor' });
          resolve(true);
          return;
        }

        if (req.method === 'GET' && pathname === '/engine-state') {
          await initEngineState(supabase);
          const { data, error } = await supabase.from('engine_state').select('*').eq('id', 1).single();
          if (error) { json(res, 500, { error: error.message }); }
          else {
            const { count: draftCount } = await supabase
              .from('outreach_messages')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'draft');
            json(res, 200, { ...data, drafts_in_queue: draftCount || 0 });
          }
        }

        else if (req.method === 'POST' && pathname === '/engine-toggle') {
          const body = await parseBody(req);
          const { is_running, pause_reason } = body;
          await initEngineState(supabase);

          const update = {
            is_running: !!is_running,
            updated_at: new Date().toISOString()
          };

          if (!is_running) {
            update.paused_at = new Date().toISOString();
            update.paused_by = 'admin';
            update.pause_reason = pause_reason || null;
          } else {
            update.paused_at = null;
            update.paused_by = null;
            update.pause_reason = null;
          }

          const { error } = await supabase.from('engine_state').update(update).eq('id', 1);
          await supabase.from('outreach_activity_log').insert({
            event_type: is_running ? 'engine_resumed' : 'engine_paused',
            metadata: { pause_reason }
          });

          json(res, 200, { success: !error, is_running: !!is_running });
        }

        else if (req.method === 'POST' && pathname === '/engine-settings') {
          const body = await parseBody(req);
          const { discovery_interval_minutes, max_drafts_per_cycle, target_cities, search_radius_meters, auto_send } = body;
          const update = { updated_at: new Date().toISOString() };
          if (discovery_interval_minutes !== undefined) update.discovery_interval_minutes = discovery_interval_minutes;
          if (max_drafts_per_cycle !== undefined) update.max_drafts_per_cycle = max_drafts_per_cycle;
          if (target_cities !== undefined) update.target_cities = target_cities;
          if (search_radius_meters !== undefined) update.search_radius_meters = search_radius_meters;
          const { error } = await supabase.from('engine_state').update(update).eq('id', 1);
          if (auto_send !== undefined) {
            await supabase.from('engine_state').update({ auto_send: !!auto_send }).eq('id', 1).then(() => {}).catch(() => {});
          }
          json(res, 200, { success: !error });
        }

        else if (req.method === 'POST' && pathname === '/engine-cycle') {
          const result = await runEngineCycle(supabase);
          json(res, 200, result);
        }

        else if (req.method === 'POST' && pathname === '/clear-and-redraft') {
          const { data: draftMsgs } = await supabase
            .from('outreach_messages')
            .select('id, lead_id')
            .in('status', ['draft', 'approved']);

          let cleared = 0;
          if (draftMsgs && draftMsgs.length > 0) {
            const msgIds = draftMsgs.map(m => m.id);
            const leadIds = [...new Set(draftMsgs.map(m => m.lead_id))];

            await supabase.from('outreach_messages').delete().in('id', msgIds);
            cleared = msgIds.length;

            await supabase.from('opportunity_pipeline')
              .update({ stage: 'new', last_action_at: new Date().toISOString() })
              .in('lead_id', leadIds)
              .in('stage', ['draft_ready', 'message_queued']);
          }

          const result = await runEngineCycle(supabase);
          json(res, 200, { success: true, cleared, cycle_result: result });
        }

        else if (req.method === 'POST' && pathname === '/enrich-leads') {
          const result = await enrichAllLeads(supabase);
          json(res, 200, { success: true, ...result });
        }

        else if (req.method === 'GET' && pathname === '/leads') {
          const page = parseInt(url.searchParams.get('page') || '1');
          const limit = parseInt(url.searchParams.get('limit') || '25');
          const type = url.searchParams.get('type');
          const status = url.searchParams.get('status');
          const crmStatus = url.searchParams.get('crm_status');
          const search = url.searchParams.get('search');
          const offset = (page - 1) * limit;

          let query = supabase.from('outreach_leads').select('*', { count: 'exact' });
          if (type) query = query.eq('type', type);
          if (status) query = query.eq('status', status);
          if (crmStatus) query = query.eq('crm_sync_status', crmStatus);
          if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);
          query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

          const { data, count, error } = await query;
          if (error) json(res, 500, { error: error.message });
          else json(res, 200, { data: data || [], total: count, page, limit });
        }

        else if (req.method === 'POST' && pathname === '/leads') {
          const body = await parseBody(req);
          const { type, name, email, phone, company, location, notes } = body;
          if (!type || !name) {
            json(res, 400, { error: 'type and name are required' });
            resolve(true);
            return;
          }

          if (email) {
            const { data: existingProfile } = await supabase
              .from('profiles')
              .select('id, role')
              .eq('email', email)
              .maybeSingle();

            if (existingProfile) {
              json(res, 409, {
                error: 'This contact already exists in the CRM',
                profile_id: existingProfile.id,
                role: existingProfile.role
              });
              resolve(true);
              return;
            }

            const { data: existingLead } = await supabase
              .from('outreach_leads')
              .select('id')
              .eq('email', email)
              .maybeSingle();

            if (existingLead) {
              json(res, 409, { error: 'A lead with this email already exists', lead_id: existingLead.id });
              resolve(true);
              return;
            }
          }

          const { data, error } = await supabase.from('outreach_leads').insert({
            type, name, email, phone, company, location, notes,
            source: 'manual',
            status: 'new',
            crm_sync_status: 'unlinked'
          }).select().single();

          if (error) json(res, 500, { error: error.message });
          else {
            await supabase.from('outreach_activity_log').insert({
              lead_id: data.id,
              event_type: 'discovered',
              metadata: { source: 'manual' }
            });
            json(res, 201, data);
          }
        }

        else if (req.method === 'PUT' && pathname.match(/^\/leads\/[a-f0-9-]+$/)) {
          const leadId = pathname.split('/')[2];
          const body = await parseBody(req);
          const allowed = ['name', 'email', 'phone', 'company', 'location', 'notes', 'status'];
          const update = {};
          for (const key of allowed) {
            if (body[key] !== undefined) update[key] = body[key];
          }
          update.updated_at = new Date().toISOString();

          const { data, error } = await supabase.from('outreach_leads').update(update).eq('id', leadId).select().single();
          if (error) json(res, 500, { error: error.message });
          else json(res, 200, data);
        }

        else if (req.method === 'POST' && pathname === '/leads/import-places') {
          const body = await parseBody(req);
          const { location, radius_meters } = body;
          if (!location) {
            json(res, 400, { error: 'location is required' });
            resolve(true);
            return;
          }
          if (!process.env.GOOGLE_PLACES_API_KEY) {
            json(res, 503, { error: 'Google Places API key not configured' });
            resolve(true);
            return;
          }
          const count = await importProviderLeadsFromPlaces(supabase, location, radius_meters || 15000);
          json(res, 200, { imported: count, location });
        }

        else if (req.method === 'POST' && pathname === '/leads/import-csv') {
          const body = await parseBody(req);
          const { leads: csvLeads } = body;
          if (!Array.isArray(csvLeads) || csvLeads.length === 0) {
            json(res, 400, { error: 'leads array is required' });
            resolve(true);
            return;
          }

          let imported = 0;
          let duplicates = 0;
          for (const lead of csvLeads) {
            if (!lead.name || !lead.type) continue;

            let isDuplicate = false;
            if (lead.email) {
              const { data: existingProfile } = await supabase
                .from('profiles')
                .select('id')
                .eq('email', lead.email)
                .maybeSingle();
              if (existingProfile) { duplicates++; isDuplicate = true; }

              if (!isDuplicate) {
                const { data: existingLead } = await supabase
                  .from('outreach_leads')
                  .select('id')
                  .eq('email', lead.email)
                  .maybeSingle();
                if (existingLead) { duplicates++; isDuplicate = true; }
              }
            }

            if (!isDuplicate) {
              await supabase.from('outreach_leads').insert({
                type: lead.type,
                name: lead.name,
                email: lead.email || null,
                phone: lead.phone || null,
                company: lead.company || null,
                location: lead.location || null,
                notes: lead.notes || null,
                source: 'csv_import',
                status: 'new',
                crm_sync_status: 'unlinked'
              });
              imported++;
            }
          }

          json(res, 200, { imported, duplicates, total: csvLeads.length });
        }

        else if (req.method === 'GET' && pathname === '/pipeline') {
          const priority = url.searchParams.get('priority');
          const stage = url.searchParams.get('stage');
          const type = url.searchParams.get('type');
          const sort = url.searchParams.get('sort') || 'score';

          let query = supabase.from('opportunity_pipeline').select('*, outreach_leads(*)');
          if (priority) query = query.eq('priority', priority);
          if (stage) query = query.eq('stage', stage);
          if (type) query = query.eq('outreach_leads.type', type);

          if (sort === 'date') query = query.order('added_at', { ascending: false });
          else query = query.order('opportunity_score', { ascending: false });

          const { data, error } = await query;
          if (error) json(res, 500, { error: error.message });
          else json(res, 200, data || []);
        }

        else if (req.method === 'POST' && pathname === '/pipeline/score') {
          const body = await parseBody(req);
          let leadsToScore = [];

          if (body.lead_ids && body.lead_ids.length > 0) {
            const { data } = await supabase
              .from('outreach_leads')
              .select('id, type, name, location, metadata, notes')
              .in('id', body.lead_ids);
            leadsToScore = data || [];
          } else {
            const { data: existing } = await supabase
              .from('opportunity_pipeline')
              .select('lead_id');
            const existingIds = (existing || []).map(e => e.lead_id);

            let query = supabase
              .from('outreach_leads')
              .select('id, type, name, location, metadata, notes')
              .eq('status', 'new')
              .neq('crm_sync_status', 'duplicate')
              .limit(50);

            const { data } = await query;
            leadsToScore = (data || []).filter(l => !existingIds.includes(l.id));
          }

          if (leadsToScore.length === 0) {
            json(res, 200, { scored: 0, message: 'No leads to score' });
            resolve(true);
            return;
          }

          const scored = await scoreLeadsWithAI(supabase, leadsToScore);
          json(res, 200, { scored });
        }

        else if (req.method === 'GET' && pathname === '/messages') {
          const status = url.searchParams.get('status');
          const page = parseInt(url.searchParams.get('page') || '1');
          const limit = parseInt(url.searchParams.get('limit') || '50');
          const offset = (page - 1) * limit;

          let query = supabase.from('outreach_messages').select('*, outreach_leads(*)', { count: 'exact' });
          if (status) query = query.eq('status', status);
          query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

          const { data, count, error } = await query;
          if (error) json(res, 500, { error: error.message });
          else json(res, 200, { data: data || [], total: count, page, limit });
        }

        else if (req.method === 'POST' && pathname === '/preview-message') {
          const body = await parseBody(req);
          const { lead_id } = body;
          if (!lead_id) { json(res, 400, { error: 'lead_id is required' }); resolve(true); return; }

          const { data: lead } = await supabase.from('outreach_leads').select('*').eq('id', lead_id).single();
          if (!lead) { json(res, 404, { error: 'Lead not found' }); resolve(true); return; }

          const emailDraft = await draftMessageWithAI(lead, 'email', 1);
          const smsDraft = await draftMessageWithAI(lead, 'sms', 1);

          const unsubLink = `${UNSUBSCRIBE_URL}?email=${encodeURIComponent(lead.email || '')}&id=${lead.id}`;
          const emailFooter = `\n\n---\n${PHYSICAL_ADDRESS}\nTo stop receiving these emails: ${unsubLink}`;

          json(res, 200, {
            lead: { name: lead.name, type: lead.type, email: lead.email, phone: lead.phone, location: lead.location },
            email: emailDraft ? {
              subject: emailDraft.subject,
              body: emailDraft.body + emailFooter
            } : null,
            sms: smsDraft ? {
              body: smsDraft.body + SMS_OPT_OUT
            } : null
          });
        }

        else if (req.method === 'POST' && pathname === '/messages/draft') {
          const body = await parseBody(req);
          const { lead_id, channel } = body;
          if (!lead_id) {
            json(res, 400, { error: 'lead_id is required' });
            resolve(true);
            return;
          }

          const { data: lead } = await supabase.from('outreach_leads').select('*').eq('id', lead_id).single();
          if (!lead) {
            json(res, 404, { error: 'Lead not found' });
            resolve(true);
            return;
          }
          if (lead.crm_sync_status === 'duplicate') {
            json(res, 403, { error: 'Cannot draft messages for existing CRM users' });
            resolve(true);
            return;
          }
          if (lead.status === 'unsubscribed') {
            json(res, 403, { error: 'Lead has unsubscribed' });
            resolve(true);
            return;
          }

          const useChannel = channel || (lead.email ? 'email' : 'sms');
          const existingMsgCount = await supabase
            .from('outreach_messages')
            .select('id', { count: 'exact', head: true })
            .eq('lead_id', lead_id)
            .in('status', ['draft', 'approved']);

          const step = (existingMsgCount.count || 0) + 1;
          const result = await draftMessageWithAI(lead, useChannel, step);
          if (!result) {
            json(res, 500, { error: 'Failed to generate draft' });
            resolve(true);
            return;
          }

          const { data: inserted, error } = await supabase.from('outreach_messages').insert({
            lead_id,
            channel: useChannel,
            sequence_step: step,
            subject: result.subject,
            body: result.body,
            status: 'draft'
          }).select().single();

          if (error) json(res, 500, { error: error.message });
          else {
            await supabase.from('outreach_activity_log').insert({
              lead_id,
              message_id: inserted.id,
              event_type: 'drafted',
              metadata: { channel: useChannel, step }
            });
            json(res, 201, inserted);
          }
        }

        else if (req.method === 'POST' && pathname === '/messages/approve') {
          const body = await parseBody(req);
          const { message_id, edited_body, edited_subject } = body;
          if (!message_id) {
            json(res, 400, { error: 'message_id is required' });
            resolve(true);
            return;
          }

          const update = { status: 'approved', approved_by: 'admin', approved_at: new Date().toISOString() };
          if (edited_body) update.body = edited_body;
          if (edited_subject) update.subject = edited_subject;

          const { data: msg, error } = await supabase.from('outreach_messages')
            .update(update)
            .eq('id', message_id)
            .eq('status', 'draft')
            .select('*, outreach_leads(*)')
            .single();

          if (error || !msg) {
            json(res, 404, { error: 'Message not found or already processed' });
            resolve(true);
            return;
          }

          await supabase.from('outreach_activity_log').insert({
            lead_id: msg.lead_id,
            message_id: msg.id,
            event_type: 'approved'
          });

          const leadType = msg.outreach_leads?.type;
          const isProvider = leadType === 'provider';
          if (isProvider) {
            sendMessage(supabase, msg.id).then(() => {}).catch(() => {});
          }

          json(res, 200, { approved: true, sent: isProvider, lead_type: leadType });
        }

        else if (req.method === 'POST' && pathname === '/messages/approve-bulk') {
          const body = await parseBody(req);
          const { message_ids } = body;
          if (!Array.isArray(message_ids) || message_ids.length === 0) {
            json(res, 400, { error: 'message_ids array is required' });
            resolve(true);
            return;
          }

          const { data } = await supabase.from('outreach_messages')
            .update({ status: 'approved', approved_by: 'admin', approved_at: new Date().toISOString() })
            .in('id', message_ids)
            .eq('status', 'draft')
            .select('*, outreach_leads(*)');

          const approvedMsgs = data || [];
          const providerMsgs = approvedMsgs.filter(m => m.outreach_leads?.type === 'provider');

          (async () => {
            for (const msg of providerMsgs) {
              try { await sendMessage(supabase, msg.id); } catch (_) {}
              await new Promise(r => setTimeout(r, 300));
            }
          })().catch(() => {});

          json(res, 200, { approved: approvedMsgs.length, sent: providerMsgs.length, queued: providerMsgs.length });
        }

        else if (req.method === 'POST' && pathname === '/messages/send') {
          const body = await parseBody(req);
          const { message_id } = body;
          if (!message_id) {
            json(res, 400, { error: 'message_id is required' });
            resolve(true);
            return;
          }
          const result = await sendMessage(supabase, message_id);
          json(res, result.error ? 500 : 200, result);
        }

        else if (req.method === 'POST' && pathname === '/messages/flush-queue') {
          const body = await parseBody(req);
          const batchSize = Math.min(parseInt(body.batch_size || '50', 10), 200);
          const { data: approvedMsgs } = await supabase
            .from('outreach_messages')
            .select('id')
            .eq('status', 'approved')
            .order('created_at', { ascending: true })
            .limit(batchSize);
          let sent = 0, skipped = 0, errors = 0;
          for (const msg of (approvedMsgs || [])) {
            try {
              const sr = await sendMessage(supabase, msg.id);
              if (sr.success) { sent++; }
              else {
                skipped++;
                if (sr.error && sr.error.includes('Daily send limit')) break;
              }
            } catch (e) { errors++; }
            await new Promise(r => setTimeout(r, 600));
          }
          if (sent > 0) {
            const { data: st } = await supabase.from('engine_state').select('total_messages_sent').eq('id', 1).single();
            await supabase.from('engine_state')
              .update({ total_messages_sent: (st?.total_messages_sent || 0) + sent, updated_at: new Date().toISOString() })
              .eq('id', 1).then(() => {}).catch(() => {});
          }
          json(res, 200, { success: true, sent, skipped, errors, total_approved: approvedMsgs?.length || 0 });
        }

        else if (req.method === 'POST' && pathname === '/messages/skip') {
          const body = await parseBody(req);
          const { message_id } = body;
          const { error } = await supabase.from('outreach_messages')
            .update({ status: 'skipped' })
            .eq('id', message_id);
          json(res, 200, { success: !error });
        }

        else if (req.method === 'GET' && pathname === '/campaigns') {
          const { data, error } = await supabase
            .from('outreach_campaigns')
            .select('*')
            .order('created_at', { ascending: false });
          if (error) json(res, 500, { error: error.message });
          else json(res, 200, data || []);
        }

        else if (req.method === 'POST' && pathname === '/campaigns') {
          const body = await parseBody(req);
          const { name, target_type, channel, message_template, auto_send_followups, first_touch_requires_approval } = body;
          if (!name || !target_type || !channel) {
            json(res, 400, { error: 'name, target_type, and channel are required' });
            resolve(true);
            return;
          }

          if (target_type === 'investor') {
            body.first_touch_requires_approval = true;
            body.auto_send_followups = false;
          }

          const { data, error } = await supabase.from('outreach_campaigns').insert({
            name,
            target_type,
            channel,
            message_template: message_template || null,
            auto_send_followups: target_type === 'investor' ? false : (auto_send_followups || false),
            first_touch_requires_approval: first_touch_requires_approval !== false
          }).select().single();

          if (error) json(res, 500, { error: error.message });
          else json(res, 201, data);
        }

        else if (req.method === 'PUT' && pathname.match(/^\/campaigns\/[a-f0-9-]+$/)) {
          const campaignId = pathname.split('/')[2];
          const body = await parseBody(req);
          const allowed = ['name', 'status', 'message_template', 'auto_send_followups', 'first_touch_requires_approval'];
          const update = {};
          for (const key of allowed) {
            if (body[key] !== undefined) update[key] = body[key];
          }

          const { data, error } = await supabase.from('outreach_campaigns').update(update).eq('id', campaignId).select().single();
          if (error) json(res, 500, { error: error.message });
          else json(res, 200, data);
        }

        else if (req.method === 'POST' && pathname.match(/^\/campaigns\/[a-f0-9-]+\/add-leads$/)) {
          const campaignId = pathname.split('/')[2];
          const body = await parseBody(req);
          const { lead_ids } = body;
          if (!Array.isArray(lead_ids)) {
            json(res, 400, { error: 'lead_ids array is required' });
            resolve(true);
            return;
          }

          const rows = lead_ids.map(lid => ({ campaign_id: campaignId, lead_id: lid }));
          const { error } = await supabase.from('campaign_leads').upsert(rows, { onConflict: 'campaign_id,lead_id', ignoreDuplicates: true });
          json(res, 200, { success: !error, added: lead_ids.length });
        }

        else if (req.method === 'GET' && pathname === '/notification-config') {
          const phone = await getAdminNotificationPhone(supabase);
          const { data: stateRow } = await supabase.from('engine_state').select('metadata').eq('id', 1).single();
          const digestCfg = stateRow?.metadata?.digest_config || {};
          json(res, 200, {
            admin_notification_phone: phone || '',
            digest_hour_utc: typeof digestCfg.hour_utc === 'number' ? digestCfg.hour_utc : 1
          });
        }

        else if (req.method === 'POST' && pathname === '/notification-config') {
          const body = await parseBody(req);
          const { admin_notification_phone, digest_hour_utc } = body;
          const { data: stateRow } = await supabase.from('engine_state').select('metadata').eq('id', 1).single();
          const currentMeta = stateRow?.metadata || {};
          const updates = { ...currentMeta, admin_notification_phone: admin_notification_phone || null };
          if (typeof digest_hour_utc === 'number' && digest_hour_utc >= 0 && digest_hour_utc <= 23) {
            updates.digest_config = { ...currentMeta.digest_config, hour_utc: digest_hour_utc };
          }
          const { error: saveErr } = await supabase.from('engine_state').update({ metadata: updates }).eq('id', 1);
          json(res, saveErr ? 500 : 200, { success: !saveErr });
        }

        else if (req.method === 'GET' && pathname === '/wefunder-blast/status') {
          const { data: investorLeads } = await supabase
            .from('outreach_leads')
            .select('id')
            .eq('type', 'investor')
            .not('email', 'is', null)
            .neq('status', 'unsubscribed');

          const ids = (investorLeads || []).map(l => l.id);
          let recentLeadIds = new Set();
          if (ids.length > 0) {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600000).toISOString();
            const { data: recent } = await supabase
              .from('outreach_messages')
              .select('lead_id')
              .eq('channel', 'email')
              .gte('created_at', thirtyDaysAgo)
              .in('lead_id', ids);
            recentLeadIds = new Set((recent || []).map(m => m.lead_id));
          }

          json(res, 200, {
            total_investor_leads: ids.length,
            eligible: ids.filter(id => !recentLeadIds.has(id)).length,
            recently_contacted: recentLeadIds.size
          });
        }

        else if (req.method === 'POST' && pathname === '/wefunder-blast') {
          const body = await parseBody(req);
          const { dry_run } = body;

          if (dry_run) {
            // Dry-run: compute eligibility stats only, no drafting
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600000).toISOString();
            const { data: investorLeads } = await supabase
              .from('outreach_leads')
              .select('id, name, company, email, location')
              .eq('type', 'investor')
              .not('email', 'is', null)
              .neq('status', 'unsubscribed');
            const ids = (investorLeads || []).map(l => l.id);
            let recentLeadIds = new Set();
            if (ids.length > 0) {
              const { data: recent } = await supabase
                .from('outreach_messages')
                .select('lead_id')
                .eq('channel', 'email')
                .gte('created_at', thirtyDaysAgo)
                .in('lead_id', ids);
              recentLeadIds = new Set((recent || []).map(m => m.lead_id));
            }
            const eligible = (investorLeads || []).filter(l => !recentLeadIds.has(l.id));
            json(res, 200, {
              dry_run: true,
              eligible: eligible.length,
              recently_contacted: recentLeadIds.size,
              sample_leads: eligible.slice(0, 5).map(l => ({ name: l.name, company: l.company, email: l.email, location: l.location }))
            });
            resolve(true);
            return;
          }

          // Respond immediately, draft async in background
          json(res, 202, { started: true, message: 'Drafting Wefunder blast emails in background — check the Messages tab shortly.' });
          resolve(true);

          try {
            const r = await runWefunderBlastForEligible(supabase, { notify: true });
            await supabase.from('outreach_activity_log').insert({
              event_type: 'wefunder_blast_launched',
              metadata: { drafted: r.drafted, failed: r.failed, eligible: r.total }
            }).catch(() => {});
          } catch (_) {}
        }

        else if (req.method === 'POST' && pathname === '/convert-lead') {
          const body = await parseBody(req);
          const { lead_id, profile_id } = body;

          const { data: lead } = await supabase.from('outreach_leads').select('*').eq('id', lead_id).single();
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', profile_id).single();

          if (!lead || !profile) {
            json(res, 404, { error: 'Lead or profile not found' });
            resolve(true);
            return;
          }

          await supabase.from('outreach_leads').update({
            status: 'converted',
            crm_profile_id: profile_id,
            crm_sync_status: 'converted'
          }).eq('id', lead_id);

          await supabase.from('profiles').update({
            outreach_lead_id: lead_id,
            outreach_source: lead.source,
            outreach_converted_at: new Date().toISOString()
          }).eq('id', profile_id);

          await supabase.from('opportunity_pipeline')
            .update({ stage: 'converted', last_action_at: new Date().toISOString() })
            .eq('lead_id', lead_id);

          await supabase.from('outreach_activity_log').insert({
            lead_id,
            event_type: 'converted',
            metadata: { profile_id, profile_role: profile.role }
          });

          json(res, 200, { success: true, profile_id, lead_id });
        }

        else if (req.method === 'POST' && pathname === '/sync-reengagement') {
          await syncReengagementLeads(supabase);
          json(res, 200, { success: true });
        }

        else if (req.method === 'GET' && pathname === '/analytics') {
          const { count: totalLeads } = await supabase
            .from('outreach_leads')
            .select('id', { count: 'exact', head: true });

          const { count: messagesSent } = await supabase
            .from('outreach_messages')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'sent');

          const { count: pendingApproval } = await supabase
            .from('outreach_messages')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'draft');

          const { count: conversions } = await supabase
            .from('outreach_leads')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'converted');

          const { data: typeBreakdown } = await supabase
            .from('outreach_leads')
            .select('type');

          const typeCounts = { member: 0, provider: 0, investor: 0 };
          (typeBreakdown || []).forEach(l => { if (typeCounts[l.type] !== undefined) typeCounts[l.type]++; });

          const { data: statusBreakdown } = await supabase
            .from('outreach_leads')
            .select('status');

          const statusCounts = {};
          (statusBreakdown || []).forEach(l => { statusCounts[l.status] = (statusCounts[l.status] || 0) + 1; });

          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          const { data: recentMessages } = await supabase
            .from('outreach_messages')
            .select('sent_at')
            .eq('status', 'sent')
            .gte('sent_at', thirtyDaysAgo);

          const dailySends = {};
          (recentMessages || []).forEach(m => {
            if (m.sent_at) {
              const day = m.sent_at.substring(0, 10);
              dailySends[day] = (dailySends[day] || 0) + 1;
            }
          });

          const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { count: sentLast24h } = await supabase
            .from('outreach_messages')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'sent')
            .gte('sent_at', last24h);

          const { count: openedCount } = await supabase
            .from('outreach_messages')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'sent')
            .not('opened_at', 'is', null);

          const { count: clickedCount } = await supabase
            .from('outreach_messages')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'sent')
            .not('clicked_at', 'is', null);

          const totalSent = messagesSent || 0;
          const openRate = totalSent > 0 ? ((openedCount || 0) / totalSent * 100).toFixed(1) : '0.0';
          const clickRate = totalSent > 0 ? ((clickedCount || 0) / totalSent * 100).toFixed(1) : '0.0';

          const { count: bouncedCount } = await supabase
            .from('outreach_messages')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'bounced');

          const { count: respondedCount } = await supabase
            .from('outreach_leads')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'responded');

          const bounceRate = totalSent > 0 ? ((bouncedCount || 0) / totalSent * 100).toFixed(1) : '0.0';

          const { data: abMessages } = await supabase
            .from('outreach_messages')
            .select('metadata, opened_at')
            .eq('status', 'sent')
            .not('metadata', 'is', null);

          const abResults = { A: { sent: 0, opened: 0 }, B: { sent: 0, opened: 0 } };
          (abMessages || []).forEach(m => {
            const variant = m.metadata?.ab_variant;
            if (variant && abResults[variant]) {
              abResults[variant].sent++;
              if (m.opened_at) abResults[variant].opened++;
            }
          });
          abResults.A.open_rate = abResults.A.sent > 0 ? ((abResults.A.opened / abResults.A.sent) * 100).toFixed(1) + '%' : 'N/A';
          abResults.B.open_rate = abResults.B.sent > 0 ? ((abResults.B.opened / abResults.B.sent) * 100).toFixed(1) + '%' : 'N/A';

          const { data: engineSt } = await supabase.from('engine_state').select('warmup_start_date').eq('id', 1).single();
          const warmupLimit = getWarmupLimit(engineSt?.warmup_start_date);

          json(res, 200, {
            total_leads: totalLeads || 0,
            messages_sent: totalSent,
            pending_approval: pendingApproval || 0,
            conversions: conversions || 0,
            opened: openedCount || 0,
            clicked: clickedCount || 0,
            open_rate: openRate + '%',
            click_rate: clickRate + '%',
            bounced: bouncedCount || 0,
            bounce_rate: bounceRate + '%',
            responded: respondedCount || 0,
            type_breakdown: typeCounts,
            status_funnel: statusCounts,
            daily_sends: dailySends,
            high_volume_warning: (sentLast24h || 0) > 50,
            warmup_daily_limit: warmupLimit,
            sent_today: sentLast24h || 0,
            ab_test_results: abResults,
            ai_circuit_breaker: {
              failures: aiCircuitBreaker.failures,
              paused_until: aiCircuitBreaker.pausedUntil ? new Date(aiCircuitBreaker.pausedUntil).toISOString() : null
            }
          });
        }

        else if (req.method === 'GET' && pathname.match(/^\/history\/[a-f0-9-]+$/)) {
          const profileId = pathname.split('/')[2];
          const { data: lead } = await supabase
            .from('outreach_leads')
            .select('*')
            .eq('crm_profile_id', profileId)
            .maybeSingle();

          if (!lead) {
            json(res, 200, { lead: null, messages: [] });
            resolve(true);
            return;
          }

          const { data: messages } = await supabase
            .from('outreach_messages')
            .select('*')
            .eq('lead_id', lead.id)
            .order('created_at', { ascending: false });

          json(res, 200, { lead, messages: messages || [] });
        }

        else {
          json(res, 404, { error: 'Endpoint not found' });
        }

        resolve(true);
      } catch (err) {
        console.error(`[${requestId}] Outreach engine error:`, err);
        json(res, 500, { error: 'Internal server error' });
        resolve(true);
      }
    });
  });
}

async function handleUnsubscribe(req, res, { getSupabaseClient, setCorsHeaders }) {
  setCorsHeaders(res, req);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    json(res, 500, { error: 'Service unavailable' });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET') {
    const email = url.searchParams.get('email') || '';
    const leadId = url.searchParams.get('id') || '';
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribe — My Car Concierge</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#12161c;color:#e5e5e5;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:20px;}
.card{background:#1a1f2e;border-radius:12px;padding:40px;max-width:480px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.4);}
h1{color:#c9a84c;font-size:24px;margin-bottom:16px;}
p{color:#9ca3af;line-height:1.6;}
button{background:#c9a84c;color:#12161c;border:none;padding:14px 32px;font-size:16px;font-weight:600;border-radius:8px;cursor:pointer;margin-top:20px;}
button:hover{background:#b8942d;}
.done{color:#4ade80;font-weight:600;}
</style></head><body>
<div class="card">
<h1>Unsubscribe</h1>
<p>We're sorry to see you go. Click below to unsubscribe from My Car Concierge outreach emails.</p>
<form method="POST" action="/unsubscribe">
<input type="hidden" name="email" value="${email.replace(/"/g, '&quot;')}">
<input type="hidden" name="id" value="${leadId.replace(/"/g, '&quot;')}">
<button type="submit">Unsubscribe Me</button>
</form>
</div></body></html>`);
    return;
  }

  if (req.method === 'POST') {
    let email = '';
    let leadId = '';

    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const body = await new Promise(resolve => {
        let d = '';
        req.on('data', c => d += c.toString());
        req.on('end', () => resolve(d));
      });
      const params = new URLSearchParams(body);
      email = params.get('email') || '';
      leadId = params.get('id') || '';
    } else {
      try {
        const body = await parseBody(req);
        email = body.email || '';
        leadId = body.id || '';
      } catch (e) {}
    }

    if (leadId) {
      await supabase.from('outreach_leads').update({ status: 'unsubscribed' }).eq('id', leadId);
      await supabase.from('outreach_activity_log').insert({
        lead_id: leadId,
        event_type: 'unsubscribed',
        metadata: { email, method: 'link' }
      });
    } else if (email) {
      const { data: leads } = await supabase.from('outreach_leads').select('id').eq('email', email);
      for (const lead of (leads || [])) {
        await supabase.from('outreach_leads').update({ status: 'unsubscribed' }).eq('id', lead.id);
        await supabase.from('outreach_activity_log').insert({
          lead_id: lead.id,
          event_type: 'unsubscribed',
          metadata: { email, method: 'link' }
        });
      }
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribed — My Car Concierge</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#12161c;color:#e5e5e5;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:20px;}
.card{background:#1a1f2e;border-radius:12px;padding:40px;max-width:480px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.4);}
h1{color:#4ade80;font-size:24px;margin-bottom:16px;}
p{color:#9ca3af;line-height:1.6;}
</style></head><body>
<div class="card">
<h1>You've been unsubscribed</h1>
<p>You will no longer receive outreach emails from My Car Concierge. This may take up to 24 hours to fully process.</p>
<p style="margin-top:24px;font-size:14px;">If this was a mistake, contact us at <a href="mailto:jordan@mycarconcierge.com" style="color:#c9a84c;">jordan@mycarconcierge.com</a></p>
</div></body></html>`);
    return;
  }

  res.writeHead(405);
  res.end('Method not allowed');
}

const TRACKING_PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

async function handleEmailTracking(req, res, { getSupabaseClient }) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (pathname === '/t/o') {
    const msgId = url.searchParams.get('m');
    if (msgId) {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data: msg } = await supabase
          .from('outreach_messages')
          .select('id, lead_id, opened_at')
          .eq('id', msgId)
          .single();
        if (msg && !msg.opened_at) {
          await supabase.from('outreach_messages').update({ opened_at: new Date().toISOString() }).eq('id', msgId);
          await supabase.from('outreach_activity_log').insert({
            lead_id: msg.lead_id,
            message_id: msgId,
            event_type: 'opened',
            metadata: {}
          });
        }
      }
    }
    res.writeHead(200, { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Content-Length': TRACKING_PIXEL.length });
    res.end(TRACKING_PIXEL);
    return true;
  }

  if (pathname === '/t/c') {
    const msgId = url.searchParams.get('m');
    const dest = url.searchParams.get('u') || 'https://mycarconcierge.com';
    if (msgId) {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data: msg } = await supabase
          .from('outreach_messages')
          .select('id, lead_id, clicked_at')
          .eq('id', msgId)
          .single();
        if (msg && !msg.clicked_at) {
          await supabase.from('outreach_messages').update({ clicked_at: new Date().toISOString() }).eq('id', msgId);
          await supabase.from('outreach_activity_log').insert({
            lead_id: msg.lead_id,
            message_id: msgId,
            event_type: 'clicked',
            metadata: { destination: dest }
          });
        }
      }
    }
    res.writeHead(302, { 'Location': dest });
    res.end();
    return true;
  }

  return false;
}

async function handleResendWebhook(req, res, { getSupabaseClient, setCorsHeaders }) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res, req);
    res.writeHead(204);
    res.end();
    return;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    res.writeHead(200);
    res.end('ok');
    return;
  }

  try {
    const body = await parseBody(req);
    const eventType = body.type;
    const data = body.data || {};

    if (eventType === 'email.bounced') {
      const emailId = data.email_id;
      if (emailId) {
        const { data: msg } = await supabase
          .from('outreach_messages')
          .select('id, lead_id')
          .eq('resend_message_id', emailId)
          .maybeSingle();

        if (msg) {
          await supabase.from('outreach_messages').update({ status: 'bounced' }).eq('id', msg.id);
          await supabase.from('outreach_leads').update({ status: 'bounced' }).eq('id', msg.lead_id);
          await supabase.from('outreach_activity_log').insert({
            lead_id: msg.lead_id,
            message_id: msg.id,
            event_type: 'bounced',
            metadata: { bounce_type: data.bounce?.type, reason: data.bounce?.message }
          });
        }
      }
    } else if (eventType === 'email.complained') {
      const emailId = data.email_id;
      if (emailId) {
        const { data: msg } = await supabase
          .from('outreach_messages')
          .select('id, lead_id')
          .eq('resend_message_id', emailId)
          .maybeSingle();

        if (msg) {
          await supabase.from('outreach_leads').update({ status: 'unsubscribed' }).eq('id', msg.lead_id);
          await supabase.from('outreach_activity_log').insert({
            lead_id: msg.lead_id,
            message_id: msg.id,
            event_type: 'complaint',
            metadata: {}
          });
        }
      }
    } else if (eventType === 'email.delivered') {
      const emailId = data.email_id;
      const toEmail = data.to?.[0];
      if (toEmail) {
        const { data: leads } = await supabase
          .from('outreach_leads')
          .select('id')
          .eq('email', toEmail)
          .eq('status', 'contacted');

        if (leads && leads.length > 0) {
          const replyHeaders = data.headers || {};
          const inReplyTo = replyHeaders['in-reply-to'] || replyHeaders['In-Reply-To'];
          const references = replyHeaders['references'] || replyHeaders['References'];

          if (inReplyTo || references) {
            for (const lead of leads) {
              await supabase.from('outreach_leads').update({ status: 'responded' }).eq('id', lead.id);
              await supabase.from('opportunity_pipeline')
                .update({ stage: 'responded', last_action_at: new Date().toISOString() })
                .eq('lead_id', lead.id);
              await supabase.from('outreach_activity_log').insert({
                lead_id: lead.id,
                event_type: 'response_detected',
                metadata: { from: toEmail }
              });
            }
          }
        }
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ received: true }));
  } catch (err) {
    console.error('[OutreachEngine] Resend webhook error:', err.message);
    res.writeHead(200);
    res.end('ok');
  }
}

module.exports = { handleOutreachRequest, handleUnsubscribe, handleEmailTracking, handleResendWebhook, startEngineSchedulers, initEngineState, runApolloDiscoveryCycle, getApolloConfig, saveApolloConfig };
