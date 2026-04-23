const {
  createSupabaseClient,
  initEngineState,
  checkSchemaExists,
  runEngineCycle,
  runFollowUpDrafts,
  enrichAllLeads,
  sendMessage,
  draftMessageWithAI,
  scoreLeadsWithAI,
  importProviderLeadsFromPlaces,
  syncReengagementLeads,
  checkCrmDuplicate,
  getWarmupLimit,
  pushLeadsToInstantly,
  generateSocialCalendar,
  generateSocialProof,
  aiCircuitBreaker,
  UNSUBSCRIBE_URL,
  PHYSICAL_ADDRESS,
  SMS_OPT_OUT
} = require('./outreach-engine-core');

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    },
    body: JSON.stringify(data)
  };
}

function authenticateAdmin(event) {
  const token = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  return token === adminPassword;
}

exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return jsonResponse(204, '');
  }

  if (!authenticateAdmin(event)) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  const supabase = createSupabaseClient();
  if (!supabase) {
    return jsonResponse(500, { error: 'Database not configured' });
  }

  const rawPath = event.path || '';
  const path = rawPath
    .replace(/^\/?\.netlify\/functions\/outreach-admin\/?/, '')
    .replace(/^\/api\/admin\/outreach\/?/, '')
    .replace(/^\/+/, '');
  const method = event.httpMethod;
  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch (e) { body = {}; }
  }
  const params = event.queryStringParameters || {};

  try {
    if (method === 'GET' && path === 'schema-status') {
      const ready = await checkSchemaExists(supabase);
      return jsonResponse(200, { schema_ready: ready, message: ready ? 'Schema is set up' : 'Run outreach-schema.sql in your Supabase SQL Editor' });
    }

    if (method === 'GET' && path === 'engine-state') {
      await initEngineState(supabase);
      const { data, error } = await supabase.from('engine_state').select('*').eq('id', 1).single();
      if (error) return jsonResponse(500, { error: error.message });
      const { count: draftCount } = await supabase
        .from('outreach_messages')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'draft');
      return jsonResponse(200, { ...data, drafts_in_queue: draftCount || 0 });
    }

    if (method === 'POST' && path === 'engine-toggle') {
      const { is_running, pause_reason } = body;
      await initEngineState(supabase);
      const update = { is_running: !!is_running, updated_at: new Date().toISOString() };
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
      return jsonResponse(200, { success: !error, is_running: !!is_running });
    }

    if (method === 'POST' && path === 'engine-settings') {
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
      return jsonResponse(200, { success: !error });
    }

    if (method === 'POST' && path === 'engine-cycle') {
      const result = await runEngineCycle(supabase);
      return jsonResponse(200, result);
    }

    if (method === 'POST' && path === 'clear-and-redraft') {
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
      return jsonResponse(200, { success: true, cleared, cycle_result: result });
    }

    if (method === 'POST' && path === 'enrich-leads') {
      const result = await enrichAllLeads(supabase);
      return jsonResponse(200, { success: true, ...result });
    }

    if (method === 'GET' && path === 'leads') {
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '25');
      const type = params.type;
      const status = params.status;
      const crmStatus = params.crm_status;
      const search = params.search;
      const offset = (page - 1) * limit;

      let query = supabase.from('outreach_leads').select('*', { count: 'exact' });
      if (type) query = query.eq('type', type);
      if (status) query = query.eq('status', status);
      if (crmStatus) query = query.eq('crm_sync_status', crmStatus);
      if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);
      query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

      const { data, count, error } = await query;
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, { data: data || [], total: count, page, limit });
    }

    if (method === 'POST' && path === 'leads') {
      const { type, name, email, phone, company, location, notes } = body;
      if (!type || !name) return jsonResponse(400, { error: 'type and name are required' });

      if (email || phone) {
        const dup = await checkCrmDuplicate(supabase, email, phone);
        if (dup.exists_in_crm) {
          if (dup.profile_id) {
            return jsonResponse(409, { error: 'This contact already exists in the CRM', profile_id: dup.profile_id, role: dup.profile_role });
          }
          if (dup.lead_id) {
            return jsonResponse(409, { error: 'A lead with this email or phone already exists', lead_id: dup.lead_id });
          }
        }
      }

      const { data, error } = await supabase.from('outreach_leads').insert({
        type, name, email, phone, company, location, notes,
        source: 'manual', status: 'new', crm_sync_status: 'unlinked'
      }).select().single();

      if (error) return jsonResponse(500, { error: error.message });
      await supabase.from('outreach_activity_log').insert({
        lead_id: data.id, event_type: 'discovered', metadata: { source: 'manual' }
      });
      return jsonResponse(201, data);
    }

    if (method === 'PUT' && path.match(/^leads\/[a-f0-9-]+$/)) {
      const leadId = path.split('/')[1];
      const allowed = ['name', 'email', 'phone', 'company', 'location', 'notes', 'status'];
      const update = {};
      for (const key of allowed) {
        if (body[key] !== undefined) update[key] = body[key];
      }
      update.updated_at = new Date().toISOString();
      const { data, error } = await supabase.from('outreach_leads').update(update).eq('id', leadId).select().single();
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, data);
    }

    if (method === 'POST' && path === 'leads/import-places') {
      const { location, radius_meters } = body;
      if (!location) return jsonResponse(400, { error: 'location is required' });
      if (!process.env.GOOGLE_PLACES_API_KEY) return jsonResponse(503, { error: 'Google Places API key not configured' });
      const count = await importProviderLeadsFromPlaces(supabase, location, radius_meters || 15000);
      return jsonResponse(200, { imported: count, location });
    }

    if (method === 'POST' && path === 'leads/import-csv') {
      const { leads: csvLeads } = body;
      if (!Array.isArray(csvLeads) || csvLeads.length === 0) return jsonResponse(400, { error: 'leads array is required' });

      let imported = 0;
      let duplicates = 0;
      for (const lead of csvLeads) {
        if (!lead.name || !lead.type) continue;
        let isDuplicate = false;
        if (lead.email || lead.phone) {
          const dup = await checkCrmDuplicate(supabase, lead.email, lead.phone);
          if (dup.exists_in_crm) { duplicates++; isDuplicate = true; }
        }
        if (!isDuplicate) {
          await supabase.from('outreach_leads').insert({
            type: lead.type, name: lead.name, email: lead.email || null, phone: lead.phone || null,
            company: lead.company || null, location: lead.location || null, notes: lead.notes || null,
            source: 'csv_import', status: 'new', crm_sync_status: 'unlinked'
          });
          imported++;
        }
      }
      return jsonResponse(200, { imported, duplicates, total: csvLeads.length });
    }

    if (method === 'GET' && path === 'pipeline') {
      const priority = params.priority;
      const stage = params.stage;
      const type = params.type;
      const sort = params.sort || 'score';

      let query = supabase.from('opportunity_pipeline').select('*, outreach_leads(*)');
      if (priority) query = query.eq('priority', priority);
      if (stage) query = query.eq('stage', stage);
      if (type) query = query.eq('outreach_leads.type', type);
      if (sort === 'date') query = query.order('added_at', { ascending: false });
      else query = query.order('opportunity_score', { ascending: false });

      const { data, error } = await query;
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, data || []);
    }

    if (method === 'POST' && path === 'pipeline/score') {
      let leadsToScore = [];
      if (body.lead_ids && body.lead_ids.length > 0) {
        const { data } = await supabase
          .from('outreach_leads')
          .select('id, type, name, location, metadata, notes')
          .in('id', body.lead_ids);
        leadsToScore = data || [];
      } else {
        const { data: existing } = await supabase.from('opportunity_pipeline').select('lead_id');
        const existingIds = (existing || []).map(e => e.lead_id);
        const { data } = await supabase
          .from('outreach_leads')
          .select('id, type, name, location, metadata, notes')
          .eq('status', 'new')
          .neq('crm_sync_status', 'duplicate')
          .limit(50);
        leadsToScore = (data || []).filter(l => !existingIds.includes(l.id));
      }

      if (leadsToScore.length === 0) return jsonResponse(200, { scored: 0, message: 'No leads to score' });
      const scored = await scoreLeadsWithAI(supabase, leadsToScore);
      return jsonResponse(200, { scored });
    }

    if (method === 'GET' && path === 'messages') {
      const status = params.status;
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '50');
      const offset = (page - 1) * limit;

      let query = supabase.from('outreach_messages').select('*, outreach_leads(*)', { count: 'exact' });
      if (status) query = query.eq('status', status);
      query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

      const { data, count, error } = await query;
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, { data: data || [], total: count, page, limit });
    }

    if (method === 'POST' && path === 'preview-message') {
      const { lead_id } = body;
      if (!lead_id) return jsonResponse(400, { error: 'lead_id is required' });
      const { data: lead } = await supabase.from('outreach_leads').select('*').eq('id', lead_id).single();
      if (!lead) return jsonResponse(404, { error: 'Lead not found' });

      const emailDraft = await draftMessageWithAI(lead, 'email', 1);
      const smsDraft = await draftMessageWithAI(lead, 'sms', 1);

      const unsubLink = `${UNSUBSCRIBE_URL}?email=${encodeURIComponent(lead.email || '')}&id=${lead.id}`;
      const emailFooter = `\n\n---\n${PHYSICAL_ADDRESS}\nTo stop receiving these emails: ${unsubLink}`;

      return jsonResponse(200, {
        lead: { name: lead.name, type: lead.type, email: lead.email, phone: lead.phone, location: lead.location },
        email: emailDraft ? { subject: emailDraft.subject, body: emailDraft.body + emailFooter } : null,
        sms: smsDraft ? { body: smsDraft.body + SMS_OPT_OUT } : null
      });
    }

    if (method === 'POST' && path === 'messages/draft') {
      const { lead_id, channel } = body;
      if (!lead_id) return jsonResponse(400, { error: 'lead_id is required' });

      const { data: lead } = await supabase.from('outreach_leads').select('*').eq('id', lead_id).single();
      if (!lead) return jsonResponse(404, { error: 'Lead not found' });
      if (lead.crm_sync_status === 'duplicate') return jsonResponse(403, { error: 'Cannot draft messages for existing CRM users' });
      if (lead.status === 'unsubscribed') return jsonResponse(403, { error: 'Lead has unsubscribed' });

      const useChannel = channel || (lead.email ? 'email' : 'sms');
      const existingMsgCount = await supabase
        .from('outreach_messages')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', lead_id)
        .in('status', ['draft', 'approved']);

      const step = (existingMsgCount.count || 0) + 1;
      const result = await draftMessageWithAI(lead, useChannel, step);
      if (!result) return jsonResponse(500, { error: 'Failed to generate draft' });

      const { data: inserted, error } = await supabase.from('outreach_messages').insert({
        lead_id, channel: useChannel, sequence_step: step,
        subject: result.subject, body: result.body, status: 'draft'
      }).select().single();

      if (error) return jsonResponse(500, { error: error.message });
      await supabase.from('outreach_activity_log').insert({
        lead_id, message_id: inserted.id, event_type: 'drafted', metadata: { channel: useChannel, step }
      });
      return jsonResponse(201, inserted);
    }

    if (method === 'POST' && path === 'messages/approve') {
      const { message_id, edited_body, edited_subject } = body;
      if (!message_id) return jsonResponse(400, { error: 'message_id is required' });

      const update = { status: 'approved', approved_by: 'admin', approved_at: new Date().toISOString() };
      if (edited_body) update.body = edited_body;
      if (edited_subject) update.subject = edited_subject;

      const { data: msg, error } = await supabase.from('outreach_messages')
        .update(update).eq('id', message_id).eq('status', 'draft').select('*, outreach_leads(*)').single();
      if (error || !msg) return jsonResponse(404, { error: 'Message not found or already processed' });

      await supabase.from('outreach_activity_log').insert({
        lead_id: msg.lead_id, message_id: msg.id, event_type: 'approved'
      });

      const leadType = msg.outreach_leads?.type;
      const isProvider = leadType === 'provider';
      if (isProvider) {
        sendMessage(supabase, msg.id).then(() => {}).catch(() => {});
      }

      return jsonResponse(200, { approved: true, sent: isProvider, lead_type: leadType });
    }

    if (method === 'POST' && path === 'messages/approve-bulk') {
      const { message_ids } = body;
      if (!Array.isArray(message_ids) || message_ids.length === 0) return jsonResponse(400, { error: 'message_ids array is required' });

      const { data } = await supabase.from('outreach_messages')
        .update({ status: 'approved', approved_by: 'admin', approved_at: new Date().toISOString() })
        .in('id', message_ids).eq('status', 'draft').select('*, outreach_leads(*)');

      const approved = data || [];
      const providerMsgs = approved.filter(m => m.outreach_leads?.type === 'provider');

      (async () => {
        for (const msg of providerMsgs) {
          try { await sendMessage(supabase, msg.id); } catch (_) {}
          await new Promise(r => setTimeout(r, 300));
        }
      })().catch(() => {});

      return jsonResponse(200, { approved: approved.length, sent: providerMsgs.length, queued: approved.length - providerMsgs.length });
    }

    if (method === 'POST' && path === 'messages/send') {
      const { message_id } = body;
      if (!message_id) return jsonResponse(400, { error: 'message_id is required' });
      const result = await sendMessage(supabase, message_id);
      return jsonResponse(result.error ? 500 : 200, result);
    }

    if (method === 'POST' && path === 'messages/flush-queue') {
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
          .eq('id', 1)
          .then(() => {}).catch(() => {});
      }
      return jsonResponse(200, { success: true, sent, skipped, errors, total_approved: approvedMsgs?.length || 0 });
    }

    if (method === 'POST' && path === 'messages/skip') {
      const { message_id } = body;
      const { error } = await supabase.from('outreach_messages').update({ status: 'skipped' }).eq('id', message_id);
      return jsonResponse(200, { success: !error });
    }

    if (method === 'GET' && path === 'campaigns') {
      const { data, error } = await supabase.from('outreach_campaigns').select('*').order('created_at', { ascending: false });
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, data || []);
    }

    if (method === 'POST' && path === 'campaigns') {
      const { name, target_type, channel, message_template, auto_send_followups, first_touch_requires_approval } = body;
      if (!name || !target_type || !channel) return jsonResponse(400, { error: 'name, target_type, and channel are required' });

      if (target_type === 'investor') {
        body.first_touch_requires_approval = true;
        body.auto_send_followups = false;
      }

      const { data, error } = await supabase.from('outreach_campaigns').insert({
        name, target_type, channel,
        message_template: message_template || null,
        auto_send_followups: target_type === 'investor' ? false : (auto_send_followups || false),
        first_touch_requires_approval: first_touch_requires_approval !== false
      }).select().single();

      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(201, data);
    }

    if (method === 'PUT' && path.match(/^campaigns\/[a-f0-9-]+$/)) {
      const campaignId = path.split('/')[1];
      const allowed = ['name', 'status', 'message_template', 'auto_send_followups', 'first_touch_requires_approval'];
      const update = {};
      for (const key of allowed) {
        if (body[key] !== undefined) update[key] = body[key];
      }
      const { data, error } = await supabase.from('outreach_campaigns').update(update).eq('id', campaignId).select().single();
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, data);
    }

    if (method === 'POST' && path.match(/^campaigns\/[a-f0-9-]+\/add-leads$/)) {
      const campaignId = path.split('/')[1];
      const { lead_ids } = body;
      if (!Array.isArray(lead_ids)) return jsonResponse(400, { error: 'lead_ids array is required' });

      const rows = lead_ids.map(lid => ({ campaign_id: campaignId, lead_id: lid }));
      const { error } = await supabase.from('campaign_leads').upsert(rows, { onConflict: 'campaign_id,lead_id', ignoreDuplicates: true });
      return jsonResponse(200, { success: !error, added: lead_ids.length });
    }

    if (method === 'POST' && path === 'convert-lead') {
      const { lead_id, profile_id } = body;
      const { data: lead } = await supabase.from('outreach_leads').select('*').eq('id', lead_id).single();
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', profile_id).single();
      if (!lead || !profile) return jsonResponse(404, { error: 'Lead or profile not found' });

      await supabase.from('outreach_leads').update({
        status: 'converted', crm_profile_id: profile_id, crm_sync_status: 'converted'
      }).eq('id', lead_id);
      await supabase.from('profiles').update({
        outreach_lead_id: lead_id, outreach_source: lead.source, outreach_converted_at: new Date().toISOString()
      }).eq('id', profile_id);
      await supabase.from('opportunity_pipeline')
        .update({ stage: 'converted', last_action_at: new Date().toISOString() })
        .eq('lead_id', lead_id);
      await supabase.from('outreach_activity_log').insert({
        lead_id, event_type: 'converted', metadata: { profile_id, profile_role: profile.role }
      });
      return jsonResponse(200, { success: true, profile_id, lead_id });
    }

    if (method === 'POST' && path === 'sync-reengagement') {
      await syncReengagementLeads(supabase);
      return jsonResponse(200, { success: true });
    }

    if (method === 'GET' && path === 'analytics') {
      const { count: totalLeads } = await supabase.from('outreach_leads').select('id', { count: 'exact', head: true });
      const { count: messagesSent } = await supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('status', 'sent');
      const { count: pendingApproval } = await supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('status', 'draft');
      const { count: conversions } = await supabase.from('outreach_leads').select('id', { count: 'exact', head: true }).eq('status', 'converted');

      const { data: typeBreakdown } = await supabase.from('outreach_leads').select('type');
      const typeCounts = { member: 0, provider: 0, investor: 0 };
      (typeBreakdown || []).forEach(l => { if (typeCounts[l.type] !== undefined) typeCounts[l.type]++; });

      const { data: statusBreakdown } = await supabase.from('outreach_leads').select('status');
      const statusCounts = {};
      (statusBreakdown || []).forEach(l => { statusCounts[l.status] = (statusCounts[l.status] || 0) + 1; });

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentMessages } = await supabase.from('outreach_messages').select('sent_at').eq('status', 'sent').gte('sent_at', thirtyDaysAgo);
      const dailySends = {};
      (recentMessages || []).forEach(m => {
        if (m.sent_at) { const day = m.sent_at.substring(0, 10); dailySends[day] = (dailySends[day] || 0) + 1; }
      });

      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: sentLast24h } = await supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('sent_at', last24h);
      const { count: openedCount } = await supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('status', 'sent').not('opened_at', 'is', null);
      const { count: clickedCount } = await supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('status', 'sent').not('clicked_at', 'is', null);

      const totalSent = messagesSent || 0;
      const openRate = totalSent > 0 ? ((openedCount || 0) / totalSent * 100).toFixed(1) : '0.0';
      const clickRate = totalSent > 0 ? ((clickedCount || 0) / totalSent * 100).toFixed(1) : '0.0';

      const { count: bouncedCount } = await supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('status', 'bounced');
      const { count: respondedCount } = await supabase.from('outreach_leads').select('id', { count: 'exact', head: true }).eq('status', 'responded');
      const bounceRate = totalSent > 0 ? ((bouncedCount || 0) / totalSent * 100).toFixed(1) : '0.0';

      const { data: abMessages } = await supabase.from('outreach_messages').select('metadata, opened_at').eq('status', 'sent').not('metadata', 'is', null);
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

      return jsonResponse(200, {
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

    if (method === 'GET' && path.match(/^history\/[a-f0-9-]+$/)) {
      const profileId = path.split('/')[1];
      const { data: lead } = await supabase.from('outreach_leads').select('*').eq('crm_profile_id', profileId).maybeSingle();
      if (!lead) return jsonResponse(200, { lead: null, messages: [] });
      const { data: messages } = await supabase.from('outreach_messages').select('*').eq('lead_id', lead.id).order('created_at', { ascending: false });
      return jsonResponse(200, { lead, messages: messages || [] });
    }

    if (method === 'POST' && path === 'instantly-sync') {
      const { campaign_id, limit: syncLimit } = body;
      const { data: unsyncedLeads } = await supabase
        .from('outreach_leads')
        .select('*')
        .not('email', 'is', null)
        .not('score', 'is', null)
        .limit(syncLimit || 500);
      const leadsToSync = (unsyncedLeads || []).filter(l => l.email && !l.metadata?.instantly_synced);
      if (leadsToSync.length === 0) {
        return jsonResponse(200, { synced: 0, message: 'No unsynced leads with emails found' });
      }
      const result = await pushLeadsToInstantly(supabase, leadsToSync, campaign_id || null);
      return jsonResponse(200, result);
    }

    if (method === 'POST' && path === 'instantly-campaign') {
      const instantlyKey = process.env.INSTANTLY_API_KEY;
      if (!instantlyKey) return jsonResponse(400, { error: 'INSTANTLY_API_KEY not configured' });
      const { name, schedule } = body;
      if (!name) return jsonResponse(400, { error: 'Campaign name is required' });
      const campaignBody = { name };
      if (schedule) campaignBody.campaign_schedule = schedule;
      const res = await fetch('https://api.instantly.ai/api/v2/campaigns', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${instantlyKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(campaignBody)
      });
      const data = await res.json();
      if (!res.ok) return jsonResponse(res.status, { error: 'Instantly API error', details: data });
      return jsonResponse(200, { campaign: data });
    }

    if (method === 'POST' && path === 'instantly-campaign-leads') {
      const instantlyKey = process.env.INSTANTLY_API_KEY;
      if (!instantlyKey) return jsonResponse(400, { error: 'INSTANTLY_API_KEY not configured' });
      const { campaign_id, lead_ids, filters } = body;
      if (!campaign_id) return jsonResponse(400, { error: 'campaign_id is required' });
      let leadsToAdd;
      if (lead_ids && lead_ids.length > 0) {
        const { data } = await supabase.from('outreach_leads').select('*').in('id', lead_ids);
        leadsToAdd = data;
      } else {
        const query = supabase.from('outreach_leads').select('*').not('email', 'is', null);
        if (filters?.min_score) query.gte('score', filters.min_score);
        if (filters?.type) query.eq('type', filters.type);
        if (filters?.source) query.eq('source', filters.source);
        const { data } = await query.limit(filters?.limit || 1000);
        leadsToAdd = (data || []).filter(l => l.metadata?.instantly_synced);
      }
      if (!leadsToAdd || leadsToAdd.length === 0) {
        return jsonResponse(200, { added: 0, message: 'No matching leads found' });
      }
      const result = await pushLeadsToInstantly(supabase, leadsToAdd.map(l => {
        const meta = { ...(l.metadata || {}) };
        delete meta.instantly_synced;
        return { ...l, metadata: meta };
      }), campaign_id);
      return jsonResponse(200, { added: result.synced, campaign_id, errors: result.errors });
    }

    if (method === 'GET' && path === 'instantly-campaigns') {
      const instantlyKey = process.env.INSTANTLY_API_KEY;
      if (!instantlyKey) return jsonResponse(400, { error: 'INSTANTLY_API_KEY not configured' });
      const limit = params.limit || 20;
      const status = params.status || '';
      let url = `https://api.instantly.ai/api/v2/campaigns?limit=${limit}`;
      if (status) url += `&status=${status}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${instantlyKey}` }
      });
      const data = await res.json();
      if (!res.ok) return jsonResponse(res.status, { error: 'Instantly API error', details: data });
      return jsonResponse(200, data);
    }

    if (method === 'GET' && path === 'conversions') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [{ data: clickEvents }, { count: totalSent }, { count: totalConverted }, { count: sentLast30d }] = await Promise.all([
        supabase.from('outreach_activity_log').select('lead_id, metadata, created_at').eq('event_type', 'ref_click').gte('created_at', thirtyDaysAgo).order('created_at', { ascending: false }),
        supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('status', 'sent'),
        supabase.from('outreach_leads').select('id', { count: 'exact', head: true }).eq('status', 'converted'),
        supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('sent_at', thirtyDaysAgo)
      ]);

      const totalClicks = (clickEvents || []).length;
      const leadIds = [...new Set((clickEvents || []).map(e => e.lead_id).filter(Boolean))];

      const { data: clickedLeads } = leadIds.length
        ? await supabase.from('outreach_leads').select('id, name, email, type, location, company, status, crm_profile_id').in('id', leadIds)
        : { data: [] };

      const leadMap = {};
      (clickedLeads || []).forEach(l => { leadMap[l.id] = l; });

      const cityMap = {};
      const typeMap = {};
      const clickTimestampByLead = {};

      (clickEvents || []).forEach(e => {
        const lead = leadMap[e.lead_id];
        const city = (lead?.location || e.metadata?.city || 'Unknown').split(',')[0].trim();
        cityMap[city] = (cityMap[city] || 0) + 1;
        const type = lead?.type || 'unknown';
        typeMap[type] = (typeMap[type] || 0) + 1;
        if (!clickTimestampByLead[e.lead_id] || e.created_at > clickTimestampByLead[e.lead_id]) {
          clickTimestampByLead[e.lead_id] = e.created_at;
        }
      });

      const providerLeadsWithEmail = (clickedLeads || []).filter(l => l.type === 'provider' && l.email && l.status !== 'converted');
      const profileEmails = providerLeadsWithEmail.map(l => l.email).filter(Boolean);
      let signedUpEmails = new Set();
      if (profileEmails.length) {
        const { data: profiles } = await supabase.from('profiles').select('email').in('email', profileEmails);
        (profiles || []).forEach(p => { if (p.email) signedUpEmails.add(p.email.toLowerCase()); });
      }

      const warmList = providerLeadsWithEmail
        .filter(l => !signedUpEmails.has((l.email || '').toLowerCase()))
        .map(l => {
          const clickedAt = clickTimestampByLead[l.id];
          const daysSince = clickedAt ? Math.floor((Date.now() - new Date(clickedAt).getTime()) / 86400000) : null;
          return { lead_id: l.id, name: l.name, email: l.email, type: l.type, location: l.location, company: l.company, days_since_click: daysSince };
        })
        .sort((a, b) => (a.days_since_click ?? 999) - (b.days_since_click ?? 999));

      const ctrDenominator = sentLast30d || 0;
      const cityClickRate = Object.entries(cityMap)
        .sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([city, count]) => ({ city, count, ctr: ctrDenominator > 0 ? ((count / ctrDenominator) * 100).toFixed(2) + '%' : 'N/A' }));

      const { data: campaignRows } = await supabase.from('outreach_campaigns').select('id, name');
      const campaignNames = {};
      (campaignRows || []).forEach(c => { campaignNames[c.id] = c.name; });

      const { data: sentByCampaign } = await supabase.from('outreach_messages').select('campaign_id, lead_id').eq('status', 'sent');
      const sentCountByCampaign = {};
      const leadIdToCampaign = {};
      (sentByCampaign || []).forEach(m => {
        const cid = m.campaign_id || '__none__';
        sentCountByCampaign[cid] = (sentCountByCampaign[cid] || 0) + 1;
        if (m.lead_id && m.campaign_id) leadIdToCampaign[m.lead_id] = m.campaign_id;
      });

      const clicksByCampaign = {};
      (clickEvents || []).forEach(e => {
        if (!e.lead_id) return;
        const cid = leadIdToCampaign[e.lead_id] || '__none__';
        clicksByCampaign[cid] = (clicksByCampaign[cid] || 0) + 1;
      });

      const byCampaign = Object.entries(sentCountByCampaign).map(([cid, sent]) => {
        const clicks = clicksByCampaign[cid] || 0;
        return { campaign_id: cid === '__none__' ? null : cid, campaign_name: campaignNames[cid] || (cid === '__none__' ? 'No Campaign' : cid), sent, clicks, ctr: sent > 0 ? ((clicks / sent) * 100).toFixed(2) + '%' : '0%' };
      }).sort((a, b) => b.clicks - a.clicks).slice(0, 10);

      return jsonResponse(200, {
        total_clicks: totalClicks,
        total_converted: totalConverted || 0,
        warm_leads: warmList.length,
        total_sent: totalSent || 0,
        by_city: cityClickRate,
        by_type: Object.entries(typeMap).sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count })),
        by_campaign: byCampaign,
        warm_list: warmList
      });
    }

    if (method === 'GET' && path === 'instantly-analytics') {
      const instantlyKey = process.env.INSTANTLY_API_KEY;
      if (!instantlyKey) return jsonResponse(400, { error: 'INSTANTLY_API_KEY not configured' });
      const campaignId = params.campaign_id || '';
      const startDate = params.start_date || '';
      const endDate = params.end_date || '';
      let url = 'https://api.instantly.ai/api/v2/campaigns/analytics?';
      if (campaignId) url += `id=${campaignId}&`;
      if (startDate) url += `start_date=${startDate}&`;
      if (endDate) url += `end_date=${endDate}&`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${instantlyKey}` }
      });
      const data = await res.json();
      if (!res.ok) return jsonResponse(res.status, { error: 'Instantly API error', details: data });
      return jsonResponse(200, data);
    }

    if (method === 'POST' && path === 'social-calendar') {
      const { week_start_date } = body;
      const calendar = await generateSocialCalendar(week_start_date);
      return jsonResponse(200, calendar);
    }

    if (method === 'POST' && path === 'social-proof') {
      const proof = await generateSocialProof(supabase);
      return jsonResponse(200, proof);
    }

    return jsonResponse(404, { error: 'Endpoint not found' });
  } catch (err) {
    console.error('[OutreachEngine] Admin function error:', err);
    return jsonResponse(500, { error: 'Internal server error' });
  }
};
