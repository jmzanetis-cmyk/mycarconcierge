// netlify/functions/admin-marketing.js
//
// AI marketing content generation + outreach pipeline admin routes.
// Ported from server.js lines 30604–31538.
//
// Routes (via _redirects):
//   POST /api/admin/marketing/generate         → AI content generation
//   POST /api/admin/marketing/send-email       → Send marketing email via Resend
//   POST /api/admin/marketing/strategy         → AI marketing strategy
//   GET  /api/admin/marketing/saved-campaigns  → List saved campaigns (stub — in-memory in server.js)
//   POST /api/admin/marketing/save-campaign    → Save campaign (stub — returns ID, no persistence)
//   POST /api/admin/marketing/research         → 501 (requires Gemini grounded search, not portable)
//   GET  /api/admin/marketing/outreach-queue   → List draft outreach from outreach_leads table
//   POST /api/admin/marketing/outreach-send    → Send email via Resend + log to outreach_messages
//   POST /api/admin/marketing/outreach-update  → Update outreach_leads status
//   GET  /api/admin/marketing/outreach-leads   → Query outreach_leads table
//   GET  /api/admin/marketing/pipeline-metrics → Pipeline analytics from outreach tables
//   POST /api/admin/marketing/campaign-to-leads → Bulk email send to leads + log to outreach_messages
//   POST /api/admin/marketing/check-dedup      → Dedup check against outreach_leads
//
// Auth: x-admin-password or x-admin-token header matching ADMIN_PASSWORD env var

'use strict';

var utils = require('./utils');

var BRAND_INFO = 'Brand: "My Car Concierge" - Your complete auto ownership platform. Tagline: "One app. Every auto need. Zero hassle." Four Pillars: Get Quotes, Manage Vehicles, Maintaining Your Ride, Shop Smarter. Website: mycarconcierge.com. Value propositions: connects vehicle owners with vetted service providers, escrow payments for trust and security, Car Club loyalty program with rewards and points, AI-powered diagnostics and maintenance tracking.';

function authenticateAdmin(event) {
  var pw = process.env.ADMIN_PASSWORD;
  if (!pw) return false;
  var headers = event.headers || {};
  var provided = headers['x-admin-password'] || headers['x-admin-token'] || '';
  return provided === pw;
}

function parsePath(event) {
  var raw = event.path || '';
  return raw
    .replace(/^\/?\.netlify\/functions\/admin-marketing\/?/, '')
    .replace(/^\/api\/admin\/marketing\/?/, '')
    .replace(/^\/+|\/+$/g, '');
}

function getAnthropicClient() {
  var key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try { return require('@anthropic-ai/sdk'); } catch (e) { return null; }
}

async function generateWithAI(prompt, maxTokens) {
  var Anthropic = getAnthropicClient();
  if (!Anthropic) throw Object.assign(new Error('AI service not configured'), { statusCode: 503 });
  var client = new Anthropic.Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  var msg = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: maxTokens || 2048,
    messages: [{ role: 'user', content: prompt }]
  });
  return (msg.content[0] && msg.content[0].text) || '';
}

function buildPrompt(type, topic, platform, tone, targetAudience, additionalContext) {
  var toneInstruction     = tone             ? 'Use a ' + tone + ' tone throughout.'               : 'Use a professional tone throughout.';
  var audienceInstruction = targetAudience   ? 'Target audience: ' + targetAudience + '.'          : 'Target audience: general consumers.';
  var contextInstruction  = additionalContext ? 'Additional context: ' + additionalContext          : '';
  var platformName        = platform || 'general';

  var templates = {
    social_post: 'Create a compelling social media post for ' + platformName + ' about "' + topic + '" for My Car Concierge. ' + BRAND_INFO + ' ' + toneInstruction + ' ' + audienceInstruction + ' ' + contextInstruction + '\n\nPlatform-specific requirements:\n- Instagram: Up to 2200 characters, use line breaks for readability, include 20-30 relevant hashtags at the end, use emojis strategically, include a clear CTA\n- Twitter/X: Stay within 280 characters, be punchy and engaging, use 2-3 hashtags max, include a link placeholder [LINK]\n- Facebook: 1-3 paragraphs, conversational tone, ask a question to drive engagement, include CTA\n- LinkedIn: Professional tone, 1-3 paragraphs, industry insights angle, include relevant hashtags (5-10)\n\nProvide the post formatted specifically for ' + platformName + '. Include hashtag suggestions, emoji placement, and a strong call-to-action directing users to mycarconcierge.com.',

    email_campaign: 'Create a complete HTML marketing email about "' + topic + '" for My Car Concierge. ' + BRAND_INFO + ' ' + toneInstruction + ' ' + audienceInstruction + ' ' + contextInstruction + '\n\nGenerate a full HTML email with:\n- A compelling subject line (provide 3 options)\n- Preview text (50-90 characters)\n- Header section with My Car Concierge branding\n- Hero section with headline and subheadline\n- Body content with 2-3 key sections highlighting benefits\n- A prominent CTA button linking to mycarconcierge.com\n- Social proof section (testimonial placeholder or stats)\n- Footer with company info, social links, and unsubscribe link placeholder\n- Use inline CSS for email compatibility\n- Mobile-responsive design considerations\n- Color scheme: use professional automotive colors (blues, blacks, whites)',

    ad_copy: 'Create advertising copy about "' + topic + '" for My Car Concierge on ' + platformName + '. ' + BRAND_INFO + ' ' + toneInstruction + ' ' + audienceInstruction + ' ' + contextInstruction + '\n\nGenerate 3 ad variations, each with:\n- Headline (max 30 characters for Google Ads, 40 for Facebook Ads)\n- Description/Primary text (max 90 characters for Google Ads, 125 for Facebook Ads)\n- Call-to-action text\n- Display URL suggestion\n\nFor each variation, use a different angle:\n1. Problem-focused (highlight the pain point)\n2. Solution-focused (highlight the benefit)\n3. Social proof/urgency-focused\n\nInclude targeting suggestions: demographics, interests, and keywords for the ' + platformName + ' platform.',

    blog_outline: 'Create a comprehensive blog post outline about "' + topic + '" for My Car Concierge. ' + BRAND_INFO + ' ' + toneInstruction + ' ' + audienceInstruction + ' ' + contextInstruction + '\n\nProvide:\n- SEO-optimized title (60 characters max)\n- Meta description (155 characters max)\n- Target keywords (primary + 5 secondary keywords)\n- Introduction hook (2-3 sentences)\n- 5-7 main sections, each with:\n  - H2 heading\n  - 3-5 bullet points of content to cover\n  - Key takeaway for each section\n- Conclusion with CTA to My Car Concierge\n- Internal linking suggestions to mycarconcierge.com pages\n- Suggested word count: 1500-2500 words\n- Featured image description suggestion',

    outreach_email: 'Create a personalized outreach email about "' + topic + '" for My Car Concierge. ' + BRAND_INFO + ' ' + toneInstruction + ' ' + audienceInstruction + ' ' + contextInstruction + '\n\nGenerate:\n- 3 subject line options (keep under 50 characters, avoid spam triggers)\n- Personalized opening line with [NAME] and [COMPANY] placeholders\n- Value proposition paragraph connecting their needs to My Car Concierge\n- Specific benefit or data point that would interest them\n- Clear, specific CTA (meeting request, demo, partnership discussion)\n- Professional sign-off\n- P.S. line with an additional hook\n\nAlso provide:\n- Best send time recommendation\n- Follow-up email timing (suggest 3-5-7 day cadence)\n- Follow-up email brief template',

    press_release: 'Write a professional press release about "' + topic + '" for My Car Concierge. ' + BRAND_INFO + ' ' + toneInstruction + ' ' + audienceInstruction + ' ' + contextInstruction + '\n\nFormat as a standard press release:\n- "FOR IMMEDIATE RELEASE" header\n- Headline (compelling, newsworthy, under 80 characters)\n- Subheadline\n- Dateline (city, state, date)\n- Opening paragraph (who, what, when, where, why)\n- 2-3 body paragraphs with details, benefits, and market context\n- Quote from CEO/founder (placeholder name: [CEO NAME])\n- Quote from a partner or customer (placeholder)\n- About My Car Concierge boilerplate paragraph\n- Media contact information placeholder\n- Include relevant statistics or market data\n- ### end mark',

    kickstarter_campaign: 'Create a compelling Kickstarter/crowdfunding campaign page about "' + topic + '" for My Car Concierge. ' + BRAND_INFO + ' ' + toneInstruction + ' ' + audienceInstruction + ' ' + contextInstruction + '\n\nGenerate a complete campaign with:\n- Campaign Title (catchy, clear, under 60 characters)\n- Tagline/subtitle (one sentence value prop)\n- Campaign Story sections:\n  1. THE PROBLEM: Pain points vehicle owners face\n  2. OUR SOLUTION: How My Car Concierge solves it\n  3. HOW IT WORKS: Step-by-step user journey\n  4. KEY FEATURES: Bullet list of platform features\n  5. TRACTION: Placeholder for metrics\n  6. TIMELINE/ROADMAP: 6-12 month milestones\n  7. THE TEAM: Team section placeholder\n  8. RISKS & CHALLENGES: Honest assessment\n- Reward Tier Suggestions (5-7 tiers)\n- Stretch Goals (3-4 milestones)\n- FAQ section (5-7 common questions)',

    grant_application: 'Write a comprehensive grant application about "' + topic + '" for My Car Concierge. ' + BRAND_INFO + ' ' + toneInstruction + ' ' + audienceInstruction + ' ' + contextInstruction + '\n\nGenerate a complete grant application with:\n- Executive Summary (250 words max)\n- Problem Statement with data placeholders\n- Proposed Solution\n- Market Opportunity\n- Innovation & Differentiation\n- Team & Organizational Capacity\n- Project Timeline (12-month plan)\n- Budget Breakdown\n- Impact Metrics\n- Sustainability Plan\n- Community Impact',

    investor_pitch: 'Create a compelling investor pitch about "' + topic + '" for My Car Concierge. ' + BRAND_INFO + ' ' + toneInstruction + ' ' + audienceInstruction + ' ' + contextInstruction + '\n\nGenerate a complete investor pitch deck script with:\n- Elevator Pitch (30 seconds)\n- Problem Slide\n- Solution Slide\n- Market Size (TAM, SAM, SOM)\n- Business Model\n- Product Demo Script\n- Traction Slide\n- Competitive Landscape\n- Go-to-Market Strategy\n- Financial Projections (3-5 year template)\n- Team Slide\n- The Ask (funding amount, use of funds)',

    funding_research: 'Research and list relevant funding opportunities for "' + topic + '" related to My Car Concierge. ' + BRAND_INFO + ' ' + toneInstruction + ' Provide a list of 10 relevant funding opportunities, each with: Name, Type, Description, Typical Funding Amount, Application Deadline, Eligibility Requirements, Fit Analysis score (1-10), Website placeholder, Key contact tips. Rank by fit score.',

    campaign_strategy: 'Develop a comprehensive marketing campaign strategy about "' + topic + '" for My Car Concierge. ' + BRAND_INFO + ' ' + toneInstruction + ' ' + audienceInstruction + ' ' + contextInstruction + '\n\nCreate a detailed multi-phase marketing strategy:\n\nPHASE 1 - FOUNDATION (Weeks 1-4): Brand awareness, content calendar, social media, email list building.\nPHASE 2 - GROWTH (Weeks 5-8): Paid advertising, influencer outreach, community building, referral program.\nPHASE 3 - SCALE (Weeks 9-12): Performance optimization, advanced targeting, strategic partnerships, PR.\n\nFor each tactic include specific action items, estimated budget allocation, expected timeline, KPIs, and tools. Provide overall budget allocation recommendation and ROI projections.'
  };

  return templates[type] || ('Create ' + type + ' content about "' + topic + '" for My Car Concierge. ' + BRAND_INFO + ' ' + toneInstruction + ' ' + audienceInstruction + ' ' + contextInstruction + ' Make the content detailed, professional, and ready to use.');
}

async function handleGenerate(body) {
  var type              = body.type;
  var topic             = body.topic;
  var platform          = body.platform;
  var tone              = body.tone;
  var targetAudience    = body.targetAudience;
  var additionalContext = body.additionalContext;

  if (!type || !topic) throw Object.assign(new Error('type and topic are required'), { statusCode: 400 });

  var prompt  = buildPrompt(type, topic, platform, tone, targetAudience, additionalContext);
  var content = await generateWithAI(prompt, 2048);

  return { success: true, content, type, platform: platform || 'general' };
}

async function handleSendEmail(body) {
  var to       = body.to;
  var subject  = body.subject;
  var html     = body.html;
  var fromName = body.fromName || 'My Car Concierge';

  if (!to || !Array.isArray(to) || to.length === 0) throw Object.assign(new Error('to must be a non-empty array of email addresses'), { statusCode: 400 });
  if (!subject || !html) throw Object.assign(new Error('subject and html are required'), { statusCode: 400 });
  if (to.length > 50) throw Object.assign(new Error('Maximum 50 recipients per call'), { statusCode: 400 });

  var key = process.env.RESEND_API_KEY;
  if (!key) throw Object.assign(new Error('Email service not configured'), { statusCode: 503 });

  var res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromName + ' <no-reply@mycarconcierge.com>', to, subject, html })
  });

  if (!res.ok) {
    var errData = await res.json().catch(function() { return {}; });
    throw new Error((errData && errData.message) || 'Email send failed');
  }

  return { success: true, sent: to.length };
}

async function handleStrategy(body) {
  var goal      = body.goal;
  var budget    = body.budget;
  var timeline  = body.timeline;
  var channels  = body.channels;

  if (!goal) throw Object.assign(new Error('goal is required'), { statusCode: 400 });

  var channelList = (channels && channels.length > 0) ? channels.join(', ') : 'social media, email, content marketing, paid advertising, partnerships';

  var prompt = 'Develop a comprehensive, actionable marketing strategy for My Car Concierge. ' + BRAND_INFO + '\n\nGoal: ' + goal + '\nBudget: ' + (budget || 'Not specified - provide recommendations for multiple budget levels') + '\nTimeline: ' + (timeline || '3 months') + '\nChannels to focus on: ' + channelList + '\n\nCreate a detailed strategy document with: 1. EXECUTIVE SUMMARY, 2. TARGET AUDIENCE ANALYSIS, 3. CHANNEL STRATEGY (for each channel: specific tactics, content themes, posting frequency, budget allocation %, expected KPIs), 4. PHASED IMPLEMENTATION PLAN (Month 1: Foundation, Month 2: Growth, Month 3: Scale - with weekly action items), 5. BUDGET ALLOCATION (detailed breakdown), 6. KPIs AND MEASUREMENT, 7. RISK ASSESSMENT.';

  var strategy = await generateWithAI(prompt, 4096);
  return { success: true, strategy };
}

async function handleOutreachLeads(supabase, qs) {
  var type      = qs.type;
  var status    = qs.status;
  var minScore  = qs.min_score;
  var source    = qs.source;
  var limit     = Math.min(parseInt(qs.limit) || 100, 500);

  var query = supabase.from('outreach_leads').select('*');
  if (type)     query = query.eq('type', type);
  if (status)   query = query.eq('status', status);
  if (minScore) query = query.gte('score', parseInt(minScore));
  if (source)   query = query.eq('source', source);
  query = query.order('score', { ascending: false }).limit(limit);

  var result = await query;
  if (result.error) throw result.error;
  return { success: true, leads: result.data || [], total: (result.data || []).length };
}

async function handlePipelineMetrics(supabase) {
  var results = await Promise.all([
    supabase.from('outreach_leads').select('id, type, source, status, city, state, score'),
    supabase.from('outreach_messages').select('id, channel, status, lead_id, sent_at'),
    supabase.from('outreach_pipeline').select('stage').limit(500)
  ]);

  var allLeads   = results[0].data || [];
  var allMsgs    = results[1].data || [];
  var allPipeline = results[2].data || [];

  var leads_by_type   = {};
  var leads_by_source = {};
  var leads_by_status = {};
  var regionMap = {};

  allLeads.forEach(function(l) {
    leads_by_type[l.type || 'unknown']     = (leads_by_type[l.type || 'unknown'] || 0) + 1;
    leads_by_source[l.source || 'unknown'] = (leads_by_source[l.source || 'unknown'] || 0) + 1;
    leads_by_status[l.status || 'unknown'] = (leads_by_status[l.status || 'unknown'] || 0) + 1;
    if (l.city || l.state) {
      var regionKey = [l.city, l.state].filter(Boolean).join(', ');
      regionMap[regionKey] = (regionMap[regionKey] || 0) + 1;
    }
  });

  var top_regions = Object.entries(regionMap)
    .map(function(e) { return { region: e[0], count: e[1] }; })
    .sort(function(a, b) { return b.count - a.count; })
    .slice(0, 20);

  var total_messages_sent = allMsgs.filter(function(m) { return m.status === 'sent' || m.status === 'delivered'; }).length;
  var messages_by_channel = {};
  var respondedCount = 0;
  allMsgs.forEach(function(m) {
    messages_by_channel[m.channel || 'unknown'] = (messages_by_channel[m.channel || 'unknown'] || 0) + 1;
    if (m.status === 'responded') respondedCount++;
  });

  var response_rate = allMsgs.length > 0 ? Math.round((respondedCount / allMsgs.length) * 10000) / 100 : 0;

  var stageCount = {};
  allPipeline.forEach(function(p) {
    stageCount[p.stage || 'unknown'] = (stageCount[p.stage || 'unknown'] || 0) + 1;
  });

  return {
    success: true,
    total_leads: allLeads.length,
    leads_by_type,
    leads_by_source,
    leads_by_status,
    top_regions,
    total_messages_sent,
    messages_by_channel,
    response_rate,
    conversion_funnel: {
      discovered: leads_by_status['discovered'] || leads_by_status['new'] || allLeads.length,
      contacted:  leads_by_status['contacted']  || 0,
      responded:  leads_by_status['responded']  || 0,
      qualified:  leads_by_status['qualified']  || 0,
      converted:  leads_by_status['converted']  || 0
    },
    pipeline_stages: stageCount
  };
}

async function handleOutreachSend(supabase, body) {
  var to        = body.to;
  var subject   = body.subject;
  var emailBody = body.body;
  var leadId    = body.id;

  if (!to || !subject || !emailBody) throw Object.assign(new Error('Missing to, subject, or body'), { statusCode: 400 });

  var key = process.env.RESEND_API_KEY;
  if (!key) throw Object.assign(new Error('Email service not configured'), { statusCode: 503 });

  var htmlBody = emailBody.replace(/\n/g, '<br>');
  var res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'My Car Concierge <no-reply@mycarconcierge.com>', to: [to], subject, html: htmlBody })
  });

  var resData = await res.json().catch(function() { return {}; });
  if (!res.ok) throw new Error((resData && resData.message) || 'Email send failed');

  // Log to outreach_messages if we have a lead_id
  if (leadId && supabase) {
    supabase.from('outreach_messages').insert({
      lead_id: leadId, channel: 'email', subject, body: htmlBody, status: 'sent', sent_at: new Date().toISOString()
    }).then(function(r) {
      if (r.error) console.error('[admin-marketing] outreach message log failed:', r.error.message);
    });
  }

  return { success: true, messageId: resData.id };
}

async function handleOutreachUpdate(supabase, body) {
  var id      = body.id;
  var status  = body.status;
  if (!id) throw Object.assign(new Error('id is required'), { statusCode: 400 });

  var update = {};
  if (status !== undefined) update.status = status;
  if (body.emailSubject !== undefined) update.email_subject = body.emailSubject;
  if (body.emailBody    !== undefined) update.email_body    = body.emailBody;

  if (Object.keys(update).length > 0) {
    var result = await supabase.from('outreach_leads').update(update).eq('id', id).select().single();
    if (result.error && !result.error.message.includes('0 rows')) throw result.error;
    return { success: true, item: result.data || { id } };
  }

  return { success: true, item: { id } };
}

async function handleCampaignToLeads(supabase, body) {
  var subject  = body.subject;
  var html     = body.html;
  var lead_ids = body.lead_ids;
  var fromName = body.fromName || 'My Car Concierge';

  if (!subject || !html || !lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
    throw Object.assign(new Error('subject, html, and lead_ids (non-empty array) are required'), { statusCode: 400 });
  }
  if (lead_ids.length > 100) throw Object.assign(new Error('Maximum 100 leads per campaign send'), { statusCode: 400 });

  var key = process.env.RESEND_API_KEY;
  if (!key) throw Object.assign(new Error('Email service not configured'), { statusCode: 503 });

  var leadsResult = await supabase.from('outreach_leads').select('id, name, email').in('id', lead_ids);
  if (leadsResult.error) throw leadsResult.error;

  var results = { sent: 0, skipped: 0, failed: 0, details: [] };

  for (var i = 0; i < (leadsResult.data || []).length; i++) {
    var lead = leadsResult.data[i];
    if (!lead.email) {
      results.skipped++;
      results.details.push({ lead_id: lead.id, status: 'skipped', reason: 'no email' });
      continue;
    }

    try {
      var res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromName + ' <no-reply@mycarconcierge.com>', to: [lead.email], subject, html })
      });

      if (!res.ok) {
        results.failed++;
        results.details.push({ lead_id: lead.id, status: 'failed', reason: 'send error' });
        continue;
      }

      supabase.from('outreach_messages').insert({
        lead_id: lead.id, channel: 'email', subject, body: html, status: 'sent', sent_at: new Date().toISOString()
      }).then(function(r) {
        if (r.error) console.error('[admin-marketing] message log failed:', r.error.message);
      });

      results.sent++;
      results.details.push({ lead_id: lead.id, status: 'sent', email: lead.email });
    } catch (sendErr) {
      results.failed++;
      results.details.push({ lead_id: lead.id, status: 'failed', reason: sendErr.message });
    }
  }

  return Object.assign({ success: true }, results);
}

async function handleCheckDedup(supabase, body) {
  var emails = body.emails;
  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    throw Object.assign(new Error('emails must be a non-empty array'), { statusCode: 400 });
  }

  var normalizedEmails = emails.map(function(e) { return e.toLowerCase().trim(); });

  var thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  var results = await Promise.all([
    supabase.from('outreach_leads').select('email').in('email', normalizedEmails),
    supabase.from('outreach_messages').select('lead_id, sent_at').gte('sent_at', thirtyDaysAgo).eq('channel', 'email')
  ]);

  var leadEmailSet         = new Set((results[0].data || []).map(function(l) { return l.email && l.email.toLowerCase().trim(); }).filter(Boolean));
  var recentLeadIds        = [...new Set((results[1].data || []).map(function(m) { return m.lead_id; }))];
  var recentlyContactedSet = new Set();

  if (recentLeadIds.length > 0) {
    var recentLeadsResult = await supabase.from('outreach_leads').select('email').in('id', recentLeadIds);
    (recentLeadsResult.data || []).forEach(function(l) {
      if (l.email) recentlyContactedSet.add(l.email.toLowerCase().trim());
    });
  }

  var duplicates = [];
  normalizedEmails.forEach(function(email) {
    var inLeads            = leadEmailSet.has(email);
    var recentlyContacted  = recentlyContactedSet.has(email);
    if (inLeads || recentlyContacted) {
      duplicates.push({ email, in_outreach_leads: inLeads, recently_contacted: recentlyContacted });
    }
  });

  return { success: true, total_checked: normalizedEmails.length, duplicates_found: duplicates.length, duplicates };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();

  if (!authenticateAdmin(event)) return utils.errorResponse(401, 'Authentication required');

  var path   = parsePath(event);
  var method = event.httpMethod;
  var qs     = event.queryStringParameters || {};

  var body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch (e) { return utils.errorResponse(400, 'Invalid JSON'); }
  }

  var supabase = null; // lazy-init only when needed

  function getSb() {
    if (!supabase) supabase = utils.createSupabaseClient();
    return supabase;
  }

  try {

    if (method === 'POST' && path === 'generate') {
      return utils.successResponse(await handleGenerate(body));
    }

    if (method === 'POST' && path === 'send-email') {
      return utils.successResponse(await handleSendEmail(body));
    }

    if (method === 'POST' && path === 'strategy') {
      return utils.successResponse(await handleStrategy(body));
    }

    // saved-campaigns uses in-memory Map in server.js — no persistent DB table.
    // Return empty list; campaigns won't persist across serverless invocations.
    if (method === 'GET' && path === 'saved-campaigns') {
      return utils.successResponse({ success: true, campaigns: [] });
    }

    if (method === 'POST' && path === 'save-campaign') {
      if (!body.title || !body.content) return utils.errorResponse(400, 'title and content are required');
      var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      return utils.successResponse({ success: true, id, note: 'Campaign saved in-memory only — will not persist across requests.' });
    }

    // research requires Gemini grounded search (searchWithGrounding), not portable
    if (method === 'POST' && path === 'research') {
      return utils.errorResponse(501, 'Research endpoint requires Gemini grounded search — not yet ported to serverless.');
    }

    // outreach-queue was in-memory (outreachQueue Map) in server.js — return draft leads from DB
    if (method === 'GET' && path === 'outreach-queue') {
      var sb = getSb();
      if (!sb) return utils.errorResponse(500, 'Server configuration error');
      var qResult = await sb.from('outreach_leads').select('*').eq('status', 'draft').order('created_at', { ascending: false }).limit(100);
      return utils.successResponse({ success: true, items: qResult.data || [] });
    }

    if (method === 'POST' && path === 'outreach-send') {
      return utils.successResponse(await handleOutreachSend(getSb(), body));
    }

    if (method === 'POST' && path === 'outreach-update') {
      var sb2 = getSb();
      if (!sb2) return utils.errorResponse(500, 'Server configuration error');
      return utils.successResponse(await handleOutreachUpdate(sb2, body));
    }

    if (method === 'GET' && path === 'outreach-leads') {
      var sb3 = getSb();
      if (!sb3) return utils.errorResponse(500, 'Server configuration error');
      return utils.successResponse(await handleOutreachLeads(sb3, qs));
    }

    if (method === 'GET' && path === 'pipeline-metrics') {
      var sb4 = getSb();
      if (!sb4) return utils.errorResponse(500, 'Server configuration error');
      return utils.successResponse(await handlePipelineMetrics(sb4));
    }

    if (method === 'POST' && path === 'campaign-to-leads') {
      var sb5 = getSb();
      if (!sb5) return utils.errorResponse(500, 'Server configuration error');
      return utils.successResponse(await handleCampaignToLeads(sb5, body));
    }

    if (method === 'POST' && path === 'check-dedup') {
      var sb6 = getSb();
      if (!sb6) return utils.errorResponse(500, 'Server configuration error');
      return utils.successResponse(await handleCheckDedup(sb6, body));
    }

    // POST outreach-cycle — trigger outreach engine cycle
    if (method === 'POST' && path === 'outreach-cycle') {
      var sb7 = getSb();
      if (!sb7) return utils.errorResponse(500, 'Server configuration error');
      try {
        var { runEngineCycle } = require('./outreach-engine-core');
        var cycleResult = await runEngineCycle(sb7);
        return utils.successResponse(cycleResult);
      } catch (cycleErr) {
        console.error('[admin-marketing] outreach-cycle error:', cycleErr.message);
        return utils.errorResponse(500, 'Cycle failed: ' + cycleErr.message);
      }
    }

    // POST instantly-sync — sync outreach leads to Instantly.ai
    if (method === 'POST' && path === 'instantly-sync') {
      var instantlyKey = process.env.INSTANTLY_API_KEY;
      if (!instantlyKey) return utils.errorResponse(400, 'INSTANTLY_API_KEY not configured');
      var sb8 = getSb();
      if (!sb8) return utils.errorResponse(500, 'Server configuration error');

      var campaignId  = body.campaign_id || null;
      var syncLimit   = Math.min(parseInt(body.limit) || 500, 1000);

      var leadsResult = await sb8.from('outreach_leads')
        .select('*').not('email', 'is', null).not('score', 'is', null).limit(syncLimit);
      var leadsToSync = (leadsResult.data || []).filter(function(l) { return l.email && !(l.metadata && l.metadata.instantly_synced); });

      if (leadsToSync.length === 0) return utils.successResponse({ synced: 0, message: 'No unsynced leads with emails found' });

      var totalSynced = 0;
      var batchErrors = [];
      for (var bi = 0; bi < leadsToSync.length; bi += 100) {
        var batch = leadsToSync.slice(bi, bi + 100);
        var instantlyLeads = batch.map(function(lead) {
          var nameParts = (lead.name || '').split(' ');
          return {
            email: lead.email, first_name: nameParts[0] || '', last_name: nameParts.slice(1).join(' ') || '',
            company_name: lead.company || lead.name || '', website: lead.website || '',
            custom_variables: { lead_type: lead.type || '', source: lead.source || '', score: String(lead.score || ''), mcc_lead_id: lead.id }
          };
        });
        var batchBody = { leads: instantlyLeads };
        if (campaignId) batchBody.campaign_id = campaignId;
        try {
          var batchRes = await fetch('https://api.instantly.ai/api/v2/leads/bulk-add', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + instantlyKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(batchBody)
          });
          if (batchRes.ok) {
            totalSynced += batch.length;
            for (var li = 0; li < batch.length; li++) {
              var existingMeta = batch[li].metadata || {};
              sb8.from('outreach_leads').update({ metadata: Object.assign({}, existingMeta, { instantly_synced: true, instantly_synced_at: new Date().toISOString(), instantly_campaign_id: campaignId }) }).eq('id', batch[li].id).then(function() {}).catch(function() {});
            }
          } else {
            var batchErrText = await batchRes.text();
            batchErrors.push('Batch ' + (bi / 100 + 1) + ': ' + batchRes.status + ' - ' + batchErrText);
          }
        } catch (batchErr) {
          batchErrors.push('Batch ' + (bi / 100 + 1) + ': ' + batchErr.message);
        }
      }

      return utils.successResponse({ synced: totalSynced, total: leadsToSync.length, errors: batchErrors.length > 0 ? batchErrors : undefined });
    }

    // POST instantly-create-campaign — create a campaign in Instantly.ai
    if (method === 'POST' && path === 'instantly-create-campaign') {
      var iKey = process.env.INSTANTLY_API_KEY;
      if (!iKey) return utils.errorResponse(400, 'INSTANTLY_API_KEY not configured');
      if (!body.name) return utils.errorResponse(400, 'Campaign name is required');

      var campaignPayload = { name: body.name };
      if (body.schedule) campaignPayload.campaign_schedule = body.schedule;

      var iRes = await fetch('https://api.instantly.ai/api/v2/campaigns', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + iKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(campaignPayload)
      });
      var iData = await iRes.json().catch(function() { return {}; });
      if (!iRes.ok) return utils.errorResponse(iRes.status >= 500 ? 502 : iRes.status, (iData && iData.message) || 'Instantly API error');
      return utils.successResponse({ campaign: iData });
    }

    return utils.errorResponse(404, 'Unknown route: ' + method + ' ' + path);

  } catch (err) {
    if (err.statusCode) return utils.errorResponse(err.statusCode, err.message);
    console.error('[admin-marketing] error on', path, ':', err.message);
    return utils.errorResponse(500, 'Something went wrong');
  }
};
