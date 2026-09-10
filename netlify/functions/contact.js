// netlify/functions/contact.js
//
// Real backend for the site-wide "Contact Us" form (www/contact.html —
// provider / member / general tabs, linked from the footer on nearly every
// public page). The form previously posted to a hardcoded personal Replit
// dev-sandbox URL with no corresponding backend in this repo — submissions
// had no reliable, monitored destination. This replaces that with a real
// Netlify function, mounted at POST /api/contact via www/_redirects.
//
// Sends the submission to ADMIN_EMAIL (falling back to MCC_FROM_EMAIL, then
// a hardcoded final fallback) via Resend — same provider/pattern already
// used by helpdesk-email.js — with reply-to set to the submitter's own
// email so replying is a single click.
//
// Public, unauthenticated endpoint: rate-limited per IP via the shared
// public-tier limiter (utils.publicRateLimit), same as survey-area-check.js
// and friends.

var utils = require('./utils');

var TOPIC_LABELS = {
  provider: 'Provider Inquiry',
  member: 'Member Inquiry',
  general: 'General Inquiry'
};

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'POST') return utils.errorResponse(405, 'Method not allowed');

  var rl = utils.publicRateLimit('contact', utils.getClientIp(event));
  if (!rl.allowed) return utils.rateLimitedResponse(rl);

  var resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return utils.errorResponse(500, 'Email service not configured');

  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return utils.errorResponse(400, 'Invalid JSON');
  }

  var name = (body.name || '').toString().trim().slice(0, 200);
  var company = (body.company || '').toString().trim().slice(0, 200);
  var email = (body.email || '').toString().trim().slice(0, 320);
  var phone = (body.phone || '').toString().trim().slice(0, 40);
  var topic = (body.topic || '').toString().trim().slice(0, 200);
  var message = (body.message || '').toString().trim().slice(0, 5000);
  var formType = (body.formType || 'general').toString().trim();

  if (!name || !email || !message) {
    return utils.errorResponse(400, 'Name, email, and message are required');
  }
  if (!isValidEmail(email)) {
    return utils.errorResponse(400, 'A valid email is required');
  }

  var formLabel = TOPIC_LABELS[formType] || 'General Inquiry';
  var subject = '[Contact] ' + formLabel + (name ? ' from ' + name : '');

  var rows = [
    ['Type', formLabel],
    ['Name', name],
    ['Email', email],
    ['Company', company],
    ['Phone', phone],
    ['Topic', topic]
  ].filter(function (pair) { return pair[1]; });

  var rowsHtml = rows.map(function (pair) {
    return '<tr><td style="padding:4px 12px 4px 0;color:#6c757d;white-space:nowrap;"><strong>' + escapeHtml(pair[0]) + '</strong></td>' +
      '<td style="padding:4px 0;">' + escapeHtml(pair[1]) + '</td></tr>';
  }).join('');

  var messageHtml = escapeHtml(message).replaceAll('\n', '<br>');

  var fullHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    'body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f8f9fa}' +
    '.container{background:white;border-radius:12px;padding:30px;box-shadow:0 2px 8px rgba(0,0,0,0.1)}' +
    '.header{text-align:center;margin-bottom:24px;padding-bottom:20px;border-bottom:2px solid #d4a855}' +
    '.logo{color:#d4a855;font-weight:bold;font-size:20px;margin-bottom:8px}' +
    '.footer{margin-top:30px;padding-top:20px;border-top:1px solid #e9ecef;text-align:center;color:#6c757d;font-size:12px}' +
    '</style></head><body><div class="container">' +
    '<div class="header"><div class="logo">My Car Concierge</div><h1 style="margin:0;font-size:20px;">New Contact Form Submission</h1></div>' +
    '<table style="width:100%;border-collapse:collapse;margin-bottom:20px;">' + rowsHtml + '</table>' +
    '<div style="background:#f8f9fa;padding:16px;border-radius:8px;"><strong>Message:</strong><br>' + messageHtml + '</div>' +
    '<div class="footer"><p>Submitted via the Contact form at mycarconcierge.com on ' +
    new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }) + '</p></div>' +
    '</div></body></html>';

  var toEmail = process.env.ADMIN_EMAIL || process.env.MCC_FROM_EMAIL || 'jm.zanetis@gmail.com';

  try {
    var response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + resendApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'My Car Concierge <noreply@mycarconcierge.com>',
        to: toEmail,
        reply_to: email,
        subject: subject,
        html: fullHtml
      })
    });

    if (response.ok) {
      return utils.successResponse({ success: true });
    }
    var errorData = await response.text();
    console.error('[contact] Resend email error:', errorData);
    return utils.errorResponse(500, 'Failed to send message. Please try again.');
  } catch (err) {
    console.error('[contact] Email send error:', err.message);
    return utils.errorResponse(500, 'Failed to send message. Please try again.');
  }
};
