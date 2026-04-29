var utils = require('./utils');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: utils.headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return utils.errorResponse(405, 'Method not allowed');
  }

  var resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return utils.errorResponse(500, 'Email service not configured');
  }

  var body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return utils.errorResponse(400, 'Invalid JSON');
  }

  var email = body.email;
  var name = body.name || '';
  var conversation = body.conversation;
  var mode = body.mode || 'driver';

  if (!email || !conversation || !Array.isArray(conversation)) {
    return utils.errorResponse(400, 'Email and conversation are required');
  }

  var modeLabels = { driver: 'Car Expert', provider: 'Provider Support', education: 'Car Academy' };
  var modeLabel = modeLabels[mode] || 'Chat';

  function escapeHtml(text) {
    return String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  }

  var messagesHtml = conversation.map(function(m) {
    var label = m.role === 'user' ? escapeHtml(name || 'You') : 'My Car Concierge';
    var bgColor = m.role === 'user' ? '#f0f0f0' : '#fff3cd';
    var content = escapeHtml(m.content || '').replaceAll('\n', '<br>');
    return '<div style="background:' + bgColor + ';padding:12px 16px;border-radius:8px;margin-bottom:8px;"><strong>' + label + ':</strong><br>' + content + '</div>';
  }).join('');

  var subject = 'Your ' + modeLabel + ' Conversation - My Car Concierge';
  var htmlContent = '<p>Hi ' + escapeHtml(name || 'there') + ',</p>' +
    '<p>Here\'s your saved conversation from <strong>My Car Concierge ' + modeLabel + '</strong>:</p>' +
    '<div style="margin:20px 0;">' + messagesHtml + '</div>' +
    '<p style="color:#6c757d;font-size:12px;">Exported on ' + new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + '</p>';

  var fullHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f8f9fa}.container{background:white;border-radius:12px;padding:30px;box-shadow:0 2px 8px rgba(0,0,0,0.1)}.header{text-align:center;margin-bottom:24px;padding-bottom:20px;border-bottom:2px solid #d4a855}.logo{color:#d4a855;font-weight:bold;font-size:20px;margin-bottom:8px}.footer{margin-top:30px;padding-top:20px;border-top:1px solid #e9ecef;text-align:center;color:#6c757d;font-size:12px}</style></head><body><div class="container"><div class="header"><div class="logo">My Car Concierge</div><h1 style="margin:0;font-size:20px;">' + subject + '</h1></div><div class="content">' + htmlContent + '</div><div class="footer"><p>My Car Concierge - Your Trusted Auto Care Platform</p></div></div></body></html>';

  try {
    var response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + resendApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'My Car Concierge <noreply@mycarconcierge.com>',
        to: email,
        subject: subject,
        html: fullHtml
      })
    });

    if (response.ok) {
      return {
        statusCode: 200,
        headers: utils.headers,
        body: JSON.stringify({ success: true })
      };
    } else {
      var errorData = await response.text();
      console.error('Resend email error:', errorData);
      return utils.errorResponse(500, 'Failed to send email');
    }
  } catch (err) {
    console.error('Email export error:', err.message);
    return utils.errorResponse(500, 'Failed to send email');
  }
};
