var Anthropic = require('@anthropic-ai/sdk');
var utils = require('./utils');

// Task: AI Chat Insights follow-up (2026-09-03). This function previously
// sent every message to Claude as a single isolated turn — no history was
// ever stored or replayed, so a user could correct/clarify something two
// messages ago and the AI would have no memory of it. Real persistence
// (supabase/migrations/20260903e_chat_conversations.sql) fixes that: prior
// messages for this conversationId are fetched and replayed as multi-turn
// context before the new message, and both the new user message and the
// assistant reply are written back afterward. This also gives
// admin-chat-insights.js real data to aggregate for the first time.
//
// The widget (www/helpdesk-widget.js) is used anonymously — no auth/session
// involved — so persistence is keyed purely by the client-generated
// conversationId string, best-effort: a Supabase outage must never block a
// reply from reaching the user, so every DB call here is wrapped and
// swallowed on failure (logged, not thrown).
var MAX_HISTORY_MESSAGES = 20; // last ~10 turns, bounds both DB read size and Claude token cost
var VALID_MODES = ['driver', 'provider', 'education'];

async function loadRecentHistory(supabase, conversationId) {
  if (!supabase || !conversationId) return [];
  try {
    var result = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(MAX_HISTORY_MESSAGES);
    if (result.error || !result.data) return [];
    return result.data.reverse(); // back to chronological order
  } catch (e) {
    console.error('[helpdesk] loadRecentHistory failed (non-fatal):', e.message);
    return [];
  }
}

async function persistTurn(supabase, conversationId, mode, userMessage, assistantReply) {
  if (!supabase || !conversationId) return;
  try {
    await supabase.from('chat_conversations').upsert({
      conversation_id: conversationId,
      mode: mode,
      last_message_at: new Date().toISOString()
    }, { onConflict: 'conversation_id', ignoreDuplicates: false });

    await supabase.from('chat_messages').insert([
      { conversation_id: conversationId, role: 'user', content: userMessage },
      { conversation_id: conversationId, role: 'assistant', content: assistantReply }
    ]);

    // Best-effort counter bump — a lost increment here just means the
    // insights panel's message_count reads slightly stale, never wrong in
    // a way that breaks anything downstream (recentActivity re-derives from
    // chat_messages directly, it doesn't trust this counter for ordering).
    var countResult = await supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId);
    if (!countResult.error && typeof countResult.count === 'number') {
      await supabase.from('chat_conversations')
        .update({ message_count: countResult.count })
        .eq('conversation_id', conversationId);
    }
  } catch (e) {
    console.error('[helpdesk] persistTurn failed (non-fatal, reply already sent):', e.message);
  }
}

var rateLimitMap = new Map();
function checkHelpdeskRateLimit(ip) {
  var now = Date.now();
  var entry = rateLimitMap.get(ip);
  if (!entry || entry.resetTime <= now) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + 60000 });
    return true;
  }
  entry.count++;
  if (entry.count > 10) return false;
  return true;
}

var HELPDESK_BASE_PROMPT = 'You are "My Car Concierge" — a friendly, practical car expert and helpdesk agent for a marketplace that connects drivers with vetted automotive service providers.\n\nYour goals:\n- Help drivers understand car issues, maintenance, quotes, and what to do next.\n- Help providers understand how to work with the My Car Concierge platform in general terms.\n- Reduce stress and confusion, and guide people toward the right type of service.\n\nStyle:\n- Talk like a real human. Be calm, clear, and concise.\n- Use short paragraphs and bullet points when helpful.\n- Avoid heavy jargon; explain terms simply.\n- Never shame the user for not knowing something.\n\nSafety:\n- You do NOT see or inspect the car; you give general guidance only.\n- You are not a replacement for a licensed mechanic or emergency service.\n- For anything that sounds unsafe (brakes/steering issues, smoke, burning smells, fuel leaks, overheating, airbags, etc.), clearly say "Stop driving and get the car checked immediately" or "Call roadside assistance."\n- Do not give legal, insurance, financial, or medical advice, and do not guarantee specific outcomes or costs.\n\nIf you need more info, ask focused follow-up questions (year/make/model, mileage, warning lights, recent work done, etc.) but keep the conversation moving.\n\nAlways end with a simple, practical next step (what to do, what kind of provider to see, and what kind of service they might book on My Car Concierge).';

var MODE_PROMPTS = {
  driver: 'MODE: DRIVER\nYou are helping a DRIVER (a vehicle owner).\n\nFocus on:\n- Explaining their symptoms, warning lights, or noises in simple terms.\n- Saying whether the issue sounds urgent or can probably wait.\n- Explaining typical maintenance for their situation.\n- Helping them understand repair quotes and what the parts mean.\n- Suggesting what type of service to book on My Car Concierge.\n\nStructure your answers:\n1) One-sentence summary.\n2) Simple explanation of what might be happening.\n3) What they should do next, including safety advice.\n4) 1-2 smart questions they can ask the shop or provider.',
  provider: 'MODE: PROVIDER\nYou are helping a SERVICE PROVIDER who wants to work with My Car Concierge.\n\nFocus on:\n- High-level explanation of how My Car Concierge works for providers.\n- Common categories of services they can offer.\n- General onboarding-style questions.\n\nIf exact policy details are not provided, answer in general terms and encourage them to review the official provider agreement.',
  education: 'MODE: CAR ACADEMY EDUCATOR\nYou are a friendly car education expert helping a driver learn about their vehicle. This is an educational context.\n\nYour teaching approach:\n- Explain concepts in plain English, as if talking to a curious friend\n- Use helpful analogies\n- Break down complex topics into digestible pieces\n- Never make them feel dumb for asking\n\nTopics you excel at teaching:\n1) MAINTENANCE BASICS: What each service is, why it matters, how often\n2) REPAIR COSTS: What factors affect pricing, red flags in quotes\n3) SYMPTOMS & DIAGNOSIS: What sounds, smells, and warning lights might mean\n4) AUTO CARE TIPS: Money-saving advice, DIY vs professional\n\nStructure your educational answers:\n1) Clear, jargon-free explanation\n2) Why this matters for their car and wallet\n3) Practical tips or things to watch for\n4) Encourage follow-up questions'
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: utils.headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return utils.errorResponse(405, 'Method not allowed');
  }

  var clientIP = (event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown').split(',')[0].trim();
  if (!checkHelpdeskRateLimit(clientIP)) {
    return {
      statusCode: 429,
      headers: utils.headers,
      body: JSON.stringify({ error: 'Too many requests', message: 'Please wait before sending another message.' })
    };
  }

  var apiKey = process.env.ANTHROPIC_API_KEY_MCC_FLEET1 || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return utils.errorResponse(500, 'AI service not configured');
  }

  var body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return utils.errorResponse(400, 'Invalid JSON');
  }

  var message = body.message;
  var mode = VALID_MODES.indexOf(body.mode) !== -1 ? body.mode : 'driver';
  var conversationId = typeof body.conversationId === 'string' ? body.conversationId.slice(0, 200) : null;

  if (!message || typeof message !== 'string') {
    return utils.errorResponse(400, 'Message is required');
  }

  if (message.length > 2000) {
    return utils.errorResponse(400, 'Message too long');
  }

  var systemPrompt = HELPDESK_BASE_PROMPT + '\n\n' + (MODE_PROMPTS[mode] || MODE_PROMPTS.driver);

  var supabase = null;
  try { supabase = utils.createSupabaseClient(); } catch (e) { /* insights/history are best-effort, not required */ }

  try {
    var client = new Anthropic({ apiKey: apiKey });

    var history = await loadRecentHistory(supabase, conversationId);
    var conversationMessages = history.map(function(m) { return { role: m.role, content: m.content }; });
    conversationMessages.push({ role: 'user', content: message });

    var response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: systemPrompt,
      messages: conversationMessages
    });

    var reply = response.content && response.content[0] && response.content[0].text
      ? response.content[0].text
      : 'I apologize, but I was unable to generate a response.';

    // Awaited, not fire-and-forget: Netlify Functions run on Lambda, where
    // work kicked off after the handler returns is not guaranteed to finish
    // (the execution environment can freeze/recycle immediately). persistTurn
    // already swallows its own errors internally, so awaiting it here can't
    // fail the response — it only guarantees the write actually completes
    // before this invocation ends.
    await persistTurn(supabase, conversationId, mode, message, reply);

    return {
      statusCode: 200,
      headers: utils.headers,
      body: JSON.stringify({ reply: reply })
    };
  } catch (err) {
    console.error('Helpdesk AI error:', err.message);
    return utils.errorResponse(500, 'AI service error');
  }
};
