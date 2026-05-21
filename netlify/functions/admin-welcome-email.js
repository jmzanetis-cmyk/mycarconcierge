// netlify/functions/admin-welcome-email.js
//
// Bulk welcome email send for the admin Settings tab.
// Ported from server.js handleAdminSendBulkWelcomeEmails (line 25169)
// and sendWelcomeEmail (line 5746).
//
// Route (via _redirects):
//   POST /api/admin/send-bulk-welcome-emails
//
// Auth: Authorization: Bearer <supabase_token> → getUser → profiles.role === 'admin'
//
// Note: HubSpot contact sync is omitted (server.js-only helper, not portable).
// Netlify function timeout limits the batch to ~50 accounts before timing out;
// for larger lists run multiple times (already-sent accounts are skipped).

'use strict';

var utils = require('./utils');

var BASE_URL = 'https://www.mycarconcierge.com';

async function authenticateBearerAdmin(event, supabase) {
  var authHeader = (event.headers['authorization'] || event.headers['Authorization'] || '').trim();
  if (!authHeader.startsWith('Bearer ')) return null;
  var token = authHeader.slice(7).trim();
  if (!token) return null;
  var authResult = await supabase.auth.getUser(token);
  var user = authResult.data && authResult.data.user;
  if (authResult.error || !user) return null;
  var profileResult = await supabase.from('profiles').select('role').eq('id', user.id).single();
  var profile = profileResult.data;
  if (!profile || profile.role !== 'admin') return null;
  return user;
}

function buildReferralSection(referralCode, baseUrl, founderType) {
  if (!referralCode) return '';
  var signupUrl  = baseUrl + '/signup-provider.html?ref=' + encodeURIComponent(referralCode);
  var qrCodeUrl  = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + encodeURIComponent(signupUrl) + '&bgcolor=fefdfb&color=1e3a5f';
  return '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">' +
    '<tr><td style="padding:24px;background-color:#1e3a5f;border-radius:8px;text-align:center;">' +
    '<h3 style="margin:0 0 12px 0;font-size:18px;color:#ffffff;font-weight:600;">Become a ' + founderType + '!</h3>' +
    '<p style="margin:0 0 16px 0;font-size:14px;color:#e2e8f0;line-height:1.5;">Refer service providers and earn <strong style="color:#b8942d;">50% of every bid pack</strong> they purchase—forever!</p>' +
    '<img src="' + qrCodeUrl + '" alt="Your Referral QR Code" width="120" height="120" style="border-radius:8px;background:#ffffff;padding:8px;">' +
    '<p style="margin:16px 0 0 0;font-size:20px;font-weight:700;color:#b8942d;letter-spacing:3px;">' + referralCode + '</p>' +
    '<p style="margin:8px 0 0 0;font-size:12px;color:#94a3b8;">Your unique referral code</p>' +
    '</td></tr></table>';
}

function buildProviderEmail(userName, dashboardUrl, helpUrl, unsubscribeUrl, logoUrl, currentYear, referralSection) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Welcome Provider - My Car Concierge</title></head>' +
    '<body style="margin:0;padding:0;background-color:#fefdfb;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fefdfb;padding:40px 20px;"><tr><td align="center">' +
    '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;">' +
    '<tr><td align="center" style="padding-bottom:30px;">' +
    '<img src="' + logoUrl + '" alt="My Car Concierge" width="80" height="80" style="display:block;margin-bottom:12px;">' +
    '<span style="font-family:Georgia,serif;font-size:26px;color:#1e3a5f;">My Car <span style="color:#b8942d;">Concierge</span></span>' +
    '</td></tr>' +
    '<tr><td style="background-color:#ffffff;padding:40px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);border-top:4px solid #b8942d;">' +
    '<h1 style="margin:0 0 16px 0;font-size:28px;font-weight:600;color:#1e3a5f;text-align:center;line-height:1.3;">Welcome to My Car Concierge, ' + (userName || 'Provider') + '!</h1>' +
    '<p style="margin:0 0 30px 0;font-size:16px;line-height:1.7;color:#4a5568;text-align:center;">Your provider account is ready! Here\'s how to start winning new customers and growing your business.</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">' +
    '<tr><td style="padding:20px;background-color:#f8f9fa;border-radius:8px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td width="50" valign="top"><span style="display:inline-block;width:32px;height:32px;line-height:32px;text-align:center;border-radius:50%;background:#1e3a5f;color:#fff;font-size:16px;font-weight:bold;">1</span></td>' +
    '<td><h3 style="margin:0 0 8px 0;font-size:18px;color:#1e3a5f;font-weight:600;">Complete Your Profile</h3>' +
    '<p style="margin:0;font-size:14px;color:#4a5568;line-height:1.5;">Add your business details, service areas, specialties, and upload photos. Complete profiles get 3x more opportunities.</p></td>' +
    '</tr></table></td></tr><tr><td style="height:12px;"></td></tr>' +
    '<tr><td style="padding:20px;background-color:#f8f9fa;border-radius:8px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td width="50" valign="top"><span style="display:inline-block;width:32px;height:32px;line-height:32px;text-align:center;border-radius:50%;background:#1e3a5f;color:#fff;font-size:16px;font-weight:bold;">2</span></td>' +
    '<td><h3 style="margin:0 0 8px 0;font-size:18px;color:#1e3a5f;font-weight:600;">Connect Your Payment Account</h3>' +
    '<p style="margin:0;font-size:14px;color:#4a5568;line-height:1.5;">Link your Stripe account to receive payments directly. Funds are released as soon as customers confirm job completion.</p></td>' +
    '</tr></table></td></tr><tr><td style="height:12px;"></td></tr>' +
    '<tr><td style="padding:20px;background-color:#f8f9fa;border-radius:8px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td width="50" valign="top"><span style="display:inline-block;width:32px;height:32px;line-height:32px;text-align:center;border-radius:50%;background:#1e3a5f;color:#fff;font-size:16px;font-weight:bold;">3</span></td>' +
    '<td><h3 style="margin:0 0 8px 0;font-size:18px;color:#1e3a5f;font-weight:600;">Browse & Bid on Jobs</h3>' +
    '<p style="margin:0;font-size:14px;color:#4a5568;line-height:1.5;">View available maintenance packages in your area and submit competitive bids. Win customers by offering great prices and service.</p></td>' +
    '</tr></table></td></tr><tr><td style="height:12px;"></td></tr>' +
    '<tr><td style="padding:20px;background-color:#f8f9fa;border-radius:8px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td width="50" valign="top"><span style="display:inline-block;width:32px;height:32px;line-height:32px;text-align:center;border-radius:50%;background:#1e3a5f;color:#fff;font-size:16px;font-weight:bold;">4</span></td>' +
    '<td><h3 style="margin:0 0 8px 0;font-size:18px;color:#1e3a5f;font-weight:600;">Build Your Reputation</h3>' +
    '<p style="margin:0;font-size:14px;color:#4a5568;line-height:1.5;">Deliver excellent service and earn positive reviews. Higher ratings mean more visibility and winning more bids.</p></td>' +
    '</tr></table></td></tr></table>' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0;">' +
    '<a href="' + dashboardUrl + '" style="display:inline-block;padding:16px 48px;background-color:#b8942d;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">Go to Provider Dashboard</a>' +
    '</td></tr></table>' +
    referralSection +
    '</td></tr>' +
    '<tr><td style="padding:30px 0;text-align:center;">' +
    '<p style="margin:0 0 10px 0;font-size:14px;color:#6b7280;">Questions? Reply to this email or visit <a href="' + helpUrl + '" style="color:#1e3a5f;text-decoration:none;">our help center</a></p>' +
    '<p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ' + currentYear + ' My Car Concierge &middot; <a href="' + unsubscribeUrl + '" style="color:#9ca3af;text-decoration:none;">Unsubscribe</a></p>' +
    '</td></tr></table></td></tr></table></body></html>';
}

function buildMemberEmail(userName, dashboardUrl, helpUrl, unsubscribeUrl, logoUrl, currentYear, referralSection) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Welcome to My Car Concierge</title></head>' +
    '<body style="margin:0;padding:0;background-color:#fefdfb;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fefdfb;padding:40px 20px;"><tr><td align="center">' +
    '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;">' +
    '<tr><td align="center" style="padding-bottom:30px;">' +
    '<img src="' + logoUrl + '" alt="My Car Concierge" width="80" height="80" style="display:block;margin-bottom:12px;">' +
    '<span style="font-family:Georgia,serif;font-size:26px;color:#1e3a5f;">My Car <span style="color:#b8942d;">Concierge</span></span>' +
    '</td></tr>' +
    '<tr><td style="background-color:#ffffff;padding:40px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);border-top:4px solid #b8942d;">' +
    '<h1 style="margin:0 0 16px 0;font-size:28px;font-weight:600;color:#1e3a5f;text-align:center;line-height:1.3;">Welcome to My Car Concierge, ' + (userName || 'Member') + '!</h1>' +
    '<p style="margin:0 0 30px 0;font-size:16px;line-height:1.7;color:#4a5568;text-align:center;">Thank you for joining! We\'re thrilled to have you as a new member. Below are some quick links to help you get started.</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">' +
    '<tr><td style="padding:20px;background-color:#f8f9fa;border-radius:8px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td width="50" valign="top"><span style="display:inline-block;width:32px;height:32px;line-height:32px;text-align:center;border-radius:50%;background:#b8942d;color:#fff;font-size:16px;font-weight:bold;">1</span></td>' +
    '<td><h3 style="margin:0 0 8px 0;font-size:18px;color:#1e3a5f;font-weight:600;">Add Your Vehicle</h3>' +
    '<p style="margin:0;font-size:14px;color:#4a5568;line-height:1.5;">Start by adding your vehicle to your Digital Garage. Track maintenance, store documents, and get personalized service recommendations.</p></td>' +
    '</tr></table></td></tr><tr><td style="height:12px;"></td></tr>' +
    '<tr><td style="padding:20px;background-color:#f8f9fa;border-radius:8px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td width="50" valign="top"><span style="display:inline-block;width:32px;height:32px;line-height:32px;text-align:center;border-radius:50%;background:#b8942d;color:#fff;font-size:16px;font-weight:bold;">2</span></td>' +
    '<td><h3 style="margin:0 0 8px 0;font-size:18px;color:#1e3a5f;font-weight:600;">Get Competitive Bids</h3>' +
    '<p style="margin:0;font-size:14px;color:#4a5568;line-height:1.5;">Need a service? Create a maintenance package and receive anonymous bids from vetted providers who compete for your business.</p></td>' +
    '</tr></table></td></tr><tr><td style="height:12px;"></td></tr>' +
    '<tr><td style="padding:20px;background-color:#f8f9fa;border-radius:8px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td width="50" valign="top"><span style="display:inline-block;width:32px;height:32px;line-height:32px;text-align:center;border-radius:50%;background:#b8942d;color:#fff;font-size:16px;font-weight:bold;">3</span></td>' +
    '<td><h3 style="margin:0 0 8px 0;font-size:18px;color:#1e3a5f;font-weight:600;">Learn at Vehicle Maintenance</h3>' +
    '<p style="margin:0;font-size:14px;color:#4a5568;line-height:1.5;">Become a smarter auto owner with our educational resources covering maintenance tips, buying guides, and money-saving advice.</p></td>' +
    '</tr></table></td></tr><tr><td style="height:12px;"></td></tr>' +
    '<tr><td style="padding:20px;background-color:#f8f9fa;border-radius:8px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td width="50" valign="top"><span style="display:inline-block;width:32px;height:32px;line-height:32px;text-align:center;border-radius:50%;background:#b8942d;color:#fff;font-size:16px;font-weight:bold;">4</span></td>' +
    '<td><h3 style="margin:0 0 8px 0;font-size:18px;color:#1e3a5f;font-weight:600;">Pay with Confidence</h3>' +
    '<p style="margin:0;font-size:14px;color:#4a5568;line-height:1.5;">Your payment is held in escrow until you confirm the work is complete. No surprises, no hassle—just peace of mind.</p></td>' +
    '</tr></table></td></tr></table>' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 0;">' +
    '<a href="' + dashboardUrl + '" style="display:inline-block;padding:16px 48px;background-color:#b8942d;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">Go to My Dashboard</a>' +
    '</td></tr></table>' +
    referralSection +
    '</td></tr>' +
    '<tr><td style="padding:30px 0;text-align:center;">' +
    '<p style="margin:0 0 10px 0;font-size:14px;color:#6b7280;">Questions? Reply to this email or visit <a href="' + helpUrl + '" style="color:#1e3a5f;text-decoration:none;">our help center</a></p>' +
    '<p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ' + currentYear + ' My Car Concierge &middot; <a href="' + unsubscribeUrl + '" style="color:#9ca3af;text-decoration:none;">Unsubscribe</a></p>' +
    '</td></tr></table></td></tr></table></body></html>';
}

async function sendWelcomeEmail(supabase, account) {
  var resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return { sent: false, reason: 'not_configured' };

  var userId    = account.id;
  var userEmail = account.email;
  var userName  = account.full_name;
  var userRole  = account.role;

  // Double-check welcome_email_sent (it may have changed since the initial query)
  var profileCheck = await supabase.from('profiles').select('welcome_email_sent').eq('id', userId).single();
  if (profileCheck.data && profileCheck.data.welcome_email_sent) {
    return { sent: false, reason: 'already_sent' };
  }

  var isProvider   = userRole === 'provider' || userRole === 'pending_provider';
  var baseUrl      = BASE_URL;
  var currentYear  = new Date().getFullYear();
  var dashboardUrl = isProvider ? baseUrl + '/providers.html' : baseUrl + '/members.html';
  var helpUrl      = baseUrl + '/help.html';
  var unsubscribeUrl = baseUrl + '/settings.html#notifications';
  var logoUrl      = baseUrl + '/logo.png';

  // Generate or fetch referral code
  var referralCode = null;
  try {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    if (isProvider) {
      var existingCode = await supabase.from('provider_referral_codes')
        .select('code').eq('provider_id', userId).eq('code_type', 'provider').single();
      if (existingCode.data && existingCode.data.code) {
        referralCode = existingCode.data.code;
      } else {
        var baseCode = Array.from({ length: 6 }, function() { return chars.charAt(Math.floor(Math.random() * chars.length)); }).join('');
        referralCode = 'PR' + baseCode;
        await supabase.from('provider_referral_codes').insert({
          provider_id: userId, code: referralCode, code_type: 'provider', uses_count: 0
        });
      }
    } else {
      var existingFounder = await supabase.from('member_founder_profiles')
        .select('referral_code').eq('user_id', userId).single();
      if (existingFounder.data && existingFounder.data.referral_code) {
        referralCode = existingFounder.data.referral_code;
      } else {
        var baseCode2 = Array.from({ length: 6 }, function() { return chars.charAt(Math.floor(Math.random() * chars.length)); }).join('');
        referralCode = 'MF' + baseCode2;
        await supabase.from('member_founder_profiles').insert({
          user_id: userId, full_name: userName, email: userEmail, referral_code: referralCode,
          status: 'active', total_provider_referrals: 0, total_member_referrals: 0,
          total_commissions_earned: 0, total_commissions_paid: 0, pending_balance: 0
        });
      }
    }
  } catch (refErr) {
    console.log('[admin-welcome-email] referral code error for', userEmail, ':', refErr.message);
  }

  var founderType     = isProvider ? 'Provider Founder' : 'Member Founder';
  var referralSection = buildReferralSection(referralCode, baseUrl, founderType);
  var subject         = isProvider ? 'Welcome to My Car Concierge - Provider Account Activated!' : 'Welcome to My Car Concierge!';
  var emailHtml       = isProvider
    ? buildProviderEmail(userName, dashboardUrl, helpUrl, unsubscribeUrl, logoUrl, currentYear, referralSection)
    : buildMemberEmail(userName, dashboardUrl, helpUrl, unsubscribeUrl, logoUrl, currentYear, referralSection);

  var response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + resendApiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'My Car Concierge <noreply@mycarconcierge.com>',
      to:   userEmail,
      subject: subject,
      html: emailHtml
    })
  });

  if (response.ok) {
    var result = await response.json();
    await supabase.from('profiles').update({ welcome_email_sent: true }).eq('id', userId);
    console.log('[admin-welcome-email] sent to', userEmail, 'id:', result.id);
    return { sent: true, id: result.id };
  } else {
    var errData = await response.json().catch(function() { return {}; });
    console.error('[admin-welcome-email] Resend error for', userEmail, ':', JSON.stringify(errData));
    return { sent: false, reason: 'resend_error' };
  }
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();
  if (event.httpMethod !== 'POST') return utils.errorResponse(405, 'Method not allowed');

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  var user = await authenticateBearerAdmin(event, supabase);
  if (!user) return utils.errorResponse(401, 'Authentication required');

  console.log('[admin-welcome-email] bulk send triggered by', user.email);

  try {
    var accountsResult = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .or('welcome_email_sent.is.null,welcome_email_sent.eq.false')
      .not('email', 'is', null)
      .order('created_at', { ascending: true });

    if (accountsResult.error) throw accountsResult.error;

    var accounts = accountsResult.data || [];
    console.log('[admin-welcome-email] found', accounts.length, 'accounts to process');

    var sent    = 0;
    var errors  = 0;
    var skipped = 0;
    var results = [];

    for (var i = 0; i < accounts.length; i++) {
      var account = accounts[i];
      if (account.role === 'admin') { skipped++; continue; }

      try {
        var outcome = await sendWelcomeEmail(supabase, account);
        if (outcome.sent) {
          sent++;
          results.push({ email: account.email, status: 'sent' });
        } else if (outcome.reason === 'already_sent') {
          skipped++;
          results.push({ email: account.email, status: 'already_sent' });
        } else {
          errors++;
          results.push({ email: account.email, status: 'error', reason: outcome.reason });
        }
      } catch (emailErr) {
        console.error('[admin-welcome-email] error for', account.email, ':', emailErr.message);
        errors++;
        results.push({ email: account.email, status: 'error', reason: emailErr.message });
      }
    }

    console.log('[admin-welcome-email] complete:', sent, 'sent,', skipped, 'skipped,', errors, 'errors');

    return utils.successResponse({
      success: true,
      total: accounts.length,
      sent,
      skipped,
      errors,
      results
    });

  } catch (err) {
    console.error('[admin-welcome-email] fatal error:', err.message);
    return utils.errorResponse(500, 'Failed to send bulk welcome emails');
  }
};
