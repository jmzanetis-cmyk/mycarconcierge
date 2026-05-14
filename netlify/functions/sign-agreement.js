var createClient = require('@supabase/supabase-js').createClient;

function generatePDF(agreementData) {
  return new Promise(function(resolve, reject) {
    var PDFDocument = require('pdfkit');
    var doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    var buffers = [];
    doc.on('data', function(chunk) { buffers.push(chunk); });
    doc.on('end', function() {
      var pdfBuffer = Buffer.concat(buffers);
      resolve(pdfBuffer);
    });
    doc.on('error', reject);

    var gold = '#b8942d';
    var darkText = '#1a1a1a';
    var grayText = '#555555';
    var lightGray = '#999999';

    doc.rect(0, 0, doc.page.width, 100).fill('#12161c');
    doc.fillColor('#d4a855').fontSize(22).font('Helvetica-Bold').text('My Car Concierge', 50, 30, { align: 'center' });
    doc.fillColor('#ffffff').fontSize(11).font('Helvetica').text('Founding Provider Partner Agreement', 50, 58, { align: 'center' });
    doc.fillColor('#d4a855').fontSize(9).text('FOUNDING PROVIDER PARTNER', 50, 76, { align: 'center' });

    doc.moveDown(3);
    doc.y = 120;

    doc.fillColor(darkText).fontSize(10).font('Helvetica');
    doc.text('Effective Date: ' + (agreementData.signed_date || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })), 50);
    doc.moveDown(0.3);
    doc.text('BETWEEN: Zanetis Holdings LLC d/b/a My Car Concierge, 107 Almond Drive, Somerset, NJ 08873 ("MCC")', 50);
    doc.moveDown(0.3);
    doc.text('AND: ', { continued: true });
    doc.font('Helvetica-Bold').fillColor(gold).text(agreementData.full_name || 'Provider', { continued: true });
    doc.font('Helvetica').fillColor(darkText).text(' ("Founding Provider")');
    doc.moveDown(0.3);
    doc.fillColor(lightGray).fontSize(8).text('Reference ID: ' + (agreementData.reference_id || 'N/A') + '  |  IP: ' + (agreementData.ip_address || 'N/A'), 50);

    doc.moveDown(1.5);

    function sectionHeader(text) {
      doc.moveDown(0.8);
      doc.fillColor(gold).fontSize(12).font('Helvetica-Bold').text(text, 50);
      doc.moveTo(50, doc.y + 2).lineTo(562, doc.y + 2).strokeColor(gold).lineWidth(0.5).stroke();
      doc.moveDown(0.5);
    }

    function sectionBody(label, text) {
      doc.fillColor(gold).fontSize(10).font('Helvetica-Bold').text(label, 50, doc.y, { continued: true });
      doc.fillColor(darkText).font('Helvetica').text(' ' + text, { align: 'justify' });
      doc.moveDown(0.4);
    }

    sectionHeader('1. FOUNDING PROVIDER BENEFITS');

    sectionBody('1.1 Zero Fees.', 'Founding Provider receives unlimited bid credits at no cost and pays zero transaction fees. Founding Provider keeps 100% of customer payments minus only credit card payment processing fees when applied.');

    sectionBody('1.2 Referral Commissions.', 'Founding Provider receives 90% of total revenue from bid pack purchases made by any provider Founding Provider refers to MCC, for the lifetime of the respective provider\'s account. Commissions paid monthly within 15 business days.');

    sectionBody('1.3 Milestone Bonuses.', 'Founding Provider receives one-time bonuses when MCC achieves total aggregate revenue milestones:');

    var milestones = [
      ['$1,000', '$100'],
      ['$5,000', '$500'],
      ['$10,000', '$1,000'],
      ['$25,000', '$2,500'],
      ['$50,000', '$5,000'],
      ['$100,000', '$12,500'],
      ['$250,000', '$30,000'],
      ['$500,000', '$60,000'],
      ['$1,000,000', '$125,000']
    ];

    var tableTop = doc.y + 5;
    var col1X = 150;
    var col2X = 350;
    var colWidth1 = 200;
    var colWidth2 = 200;
    var rowHeight = 18;

    doc.rect(col1X, tableTop, colWidth1, rowHeight).fill('#12161c');
    doc.rect(col2X, tableTop, colWidth2, rowHeight).fill('#12161c');
    doc.fillColor('#d4a855').fontSize(8).font('Helvetica-Bold');
    doc.text('PLATFORM REVENUE MILESTONE', col1X + 5, tableTop + 5, { width: colWidth1 - 10, align: 'center' });
    doc.text('BONUS AMOUNT', col2X + 5, tableTop + 5, { width: colWidth2 - 10, align: 'center' });

    for (var mi = 0; mi < milestones.length; mi++) {
      var rowY = tableTop + rowHeight + (mi * rowHeight);
      if (mi % 2 === 0) {
        doc.rect(col1X, rowY, colWidth1, rowHeight).fill('#f9f6ef');
        doc.rect(col2X, rowY, colWidth2, rowHeight).fill('#f9f6ef');
      }
      doc.fillColor(darkText).fontSize(9).font('Helvetica');
      doc.text(milestones[mi][0], col1X + 5, rowY + 5, { width: colWidth1 - 10, align: 'center' });
      doc.text(milestones[mi][1], col2X + 5, rowY + 5, { width: colWidth2 - 10, align: 'center' });
    }

    doc.y = tableTop + rowHeight + (milestones.length * rowHeight) + 10;

    doc.fillColor(grayText).fontSize(8).font('Helvetica').text('Milestone bonuses are revenue-based, paid when cumulative company revenue reaches each threshold. Bonus reserve funds are held in a secure, interest-bearing account, earning interest until milestones are reached. Bonuses will be paid within 30 days of achieving each milestone. Additional milestone amounts and bonus structures beyond $1,000,000 in cumulative company revenue will be discussed by mutual written agreement as the company grows.', 50, doc.y, { align: 'justify' });

    doc.addPage();

    sectionHeader('2. FOUNDING PROVIDER OBLIGATIONS');

    sectionBody('2.1 Service Standards.', 'Founding Provider shall maintain required licenses, insurance, and certifications, and comply with all applicable laws.');

    sectionBody('2.2 Platform Compliance.', 'Founding Provider shall maintain accurate profile information.');

    sectionBody('2.3 Provider Recruitment.', 'Founding Provider shall actively recruit qualified service providers to the MCC platform.');

    sectionHeader('3. TERMS & CONDITIONS');

    sectionBody('3.1 Independent Contractor.', 'Founding Provider is an independent contractor, not an employee. MCC will issue Form 1099-NEC for payments exceeding $600/year. Founding Provider provides Form W-9 before first payment and is responsible for all taxes, insurance, and business expenses.');

    sectionBody('3.2 Duration.', 'This Agreement continues indefinitely and may only be terminated by mutual written agreement of both parties.');

    sectionBody('3.3 Commission Protection.', 'The 90% commission rate on already-referred providers continues for life, even if this Agreement terminates. All other benefits (zero fees, milestone bonuses) end upon termination.');

    sectionBody('3.4 Confidentiality.', 'Both parties maintain confidentiality of business information, customer data, and proprietary processes.');

    sectionBody('3.5 Intellectual Property.', 'All MCC trademarks, platform technology, and IP remain MCC\'s exclusive property. Founding Provider may use MCC branding only for recruiting providers.');

    sectionBody('3.6 Indemnification.', 'Founding Provider shall indemnify, defend, and hold harmless MCC and its officers, directors, employees, and agents from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys\' fees) arising out of or related to Founding Provider\'s services, operations, or breach of this Agreement. Founding Provider shall maintain adequate insurance coverage as required by applicable law.');

    sectionBody('3.7 Modification.', 'This Agreement may only be modified by written agreement signed by both parties.');

    sectionBody('3.8 Governing Law.', 'This Agreement is governed by New Jersey law. Disputes resolved first through negotiation, then mediation, then New Jersey courts.');

    doc.moveDown(2);

    doc.fillColor(gold).fontSize(12).font('Helvetica-Bold').text('SIGNATURES', 50);
    doc.moveTo(50, doc.y + 2).lineTo(562, doc.y + 2).strokeColor(gold).lineWidth(0.5).stroke();
    doc.moveDown(1);

    var sigY = doc.y;
    doc.rect(50, sigY, 240, 120).strokeColor('#cccccc').lineWidth(0.5).stroke();
    doc.fillColor(darkText).fontSize(9).font('Helvetica-Bold').text('Zanetis Holdings LLC d/b/a My Car Concierge', 60, sigY + 10, { width: 220 });
    doc.moveDown(0.5);
    doc.fillColor(gold).fontSize(16).font('Helvetica-Oblique').text('Jordan Zanetis', 60, sigY + 35, { width: 220 });
    doc.fillColor(darkText).fontSize(9).font('Helvetica-Bold').text('Jordan Zanetis', 60, sigY + 58, { continued: true });
    doc.font('Helvetica').text(', Founder & CEO');
    doc.fillColor(grayText).fontSize(8).text('Date: ' + (agreementData.signed_date || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })), 60, sigY + 78);
    doc.fillColor(lightGray).fontSize(7).text('Pre-signed by MCC', 60, sigY + 95);

    doc.rect(310, sigY, 240, 120).strokeColor('#cccccc').lineWidth(0.5).stroke();
    doc.fillColor(darkText).fontSize(9).font('Helvetica-Bold').text('Founding Provider', 320, sigY + 10, { width: 220 });

    var sigData = agreementData.signature_data || '';
    var sigType = agreementData.signature_type || 'type';
    if (sigType === 'draw' && sigData && sigData.indexOf('data:image') === 0) {
      try {
        var base64Part = sigData.split(',')[1];
        if (base64Part) {
          var imgBuffer = Buffer.from(base64Part, 'base64');
          doc.image(imgBuffer, 320, sigY + 28, { width: 180, height: 40, fit: [180, 40] });
        }
      } catch (imgErr) {
        doc.fillColor(gold).fontSize(16).font('Helvetica-Oblique').text(agreementData.full_name || 'Provider', 320, sigY + 35, { width: 220 });
      }
    } else if (sigData && sigData.indexOf('typed:') === 0) {
      var typedName = sigData.substring(6);
      doc.fillColor(gold).fontSize(18).font('Helvetica-Oblique').text(typedName, 320, sigY + 35, { width: 220 });
    } else {
      doc.fillColor(gold).fontSize(16).font('Helvetica-Bold').text(agreementData.full_name || 'Provider', 320, sigY + 35, { width: 220 });
    }

    doc.fillColor(darkText).fontSize(9).font('Helvetica-Bold').text(agreementData.full_name || 'Provider', 320, sigY + 72);
    doc.fillColor(grayText).fontSize(8).font('Helvetica').text('Date: ' + (agreementData.signed_date || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })), 320, sigY + 85);
    doc.fillColor(lightGray).fontSize(7).text('Electronically signed', 320, sigY + 100);

    doc.moveDown(6);

    var footerY = doc.page.height - 40;
    doc.fillColor(lightGray).fontSize(7).font('Helvetica');
    doc.text('Reference ID: ' + (agreementData.reference_id || 'N/A') + '  |  Signed: ' + (agreementData.signed_date || 'N/A') + '  |  My Car Concierge - mycarconcierge.com', 50, footerY, { align: 'center', width: 512 });

    doc.end();
  });
}

function sendEmailWithResend(apiKey, emailData) {
  return new Promise(function(resolve, reject) {
    var https = require('node:https');
    var postData = JSON.stringify(emailData);
    var options = {
      hostname: 'api.resend.com',
      port: 443,
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    var req = https.request(options, function(res) {
      var body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve({ id: 'unknown' });
          }
        } else {
          reject(new Error('Resend API error: ' + res.statusCode + ' ' + body));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function buildEmailHtml(agreementData) {
  var refId = agreementData.reference_id || 'N/A';
  var fullName = agreementData.full_name || 'Provider';
  var signedDate = agreementData.signed_date || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return '<!DOCTYPE html>' +
    '<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>' +
    '<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">' +
    '<tr><td align="center">' +
    '<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">' +

    '<tr><td style="background:#12161c;padding:30px 40px;text-align:center;">' +
    '<h1 style="color:#d4a855;margin:0;font-size:24px;font-weight:700;">My Car Concierge</h1>' +
    '<p style="color:#ffffff;margin:8px 0 0;font-size:13px;letter-spacing:1px;">FOUNDING PROVIDER PARTNER</p>' +
    '</td></tr>' +

    '<tr><td style="padding:40px;">' +
    '<h2 style="color:#1a1a1a;margin:0 0 20px;font-size:20px;">Welcome, ' + fullName + '!</h2>' +
    '<p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px;">Your Founding Provider Partner Agreement has been successfully signed and recorded. We are thrilled to have you as a founding partner in the My Car Concierge network.</p>' +

    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f6ef;border-radius:8px;padding:20px;margin:0 0 25px;">' +
    '<tr><td style="padding:15px 20px;">' +
    '<p style="margin:0 0 8px;color:#b8942d;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Agreement Details</p>' +
    '<p style="margin:0 0 5px;color:#333;font-size:14px;"><strong>Reference ID:</strong> ' + refId + '</p>' +
    '<p style="margin:0 0 5px;color:#333;font-size:14px;"><strong>Provider:</strong> ' + fullName + '</p>' +
    '<p style="margin:0;color:#333;font-size:14px;"><strong>Date Signed:</strong> ' + signedDate + '</p>' +
    '</td></tr></table>' +

    '<p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 15px;">Your signed agreement PDF is attached to this email for your records. As a Founding Provider, you enjoy:</p>' +
    '<ul style="color:#555;font-size:14px;line-height:1.8;padding-left:20px;margin:0 0 25px;">' +
    '<li><strong style="color:#b8942d;">Zero Fees</strong> - Keep 100% of customer payments</li>' +
    '<li><strong style="color:#b8942d;">90% Referral Commissions</strong> - On providers you refer</li>' +
    '<li><strong style="color:#b8942d;">Milestone Bonuses</strong> - Up to $125,000 as the platform grows</li>' +
    '</ul>' +

    '<p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 25px;">If you have not already, please complete your provider account setup to start receiving service requests.</p>' +

    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">' +
    '<a href="https://mycarconcierge.com/signup-provider.html?founding_provider=true" style="display:inline-block;background:linear-gradient(135deg,#d4a855,#b8942d);color:#12161c;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;">Complete Account Setup</a>' +
    '</td></tr></table>' +
    '</td></tr>' +

    '<tr><td style="background:#12161c;padding:20px 40px;text-align:center;">' +
    '<p style="color:#888;font-size:12px;margin:0 0 5px;">My Car Concierge | mycarconcierge.com</p>' +
    '<p style="color:#666;font-size:11px;margin:0;">This is an automated confirmation. Please do not reply to this email.</p>' +
    '</td></tr>' +

    '</table></td></tr></table></body></html>';
}

exports.handler = async function(event) {
  var headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    var supabaseUrl = process.env.SUPABASE_URL;
    var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    var resendApiKey = process.env.RESEND_API_KEY;

    if (!supabaseUrl || !serviceKey) {
      return { statusCode: 503, headers: headers, body: JSON.stringify({ error: 'Service temporarily unavailable' }) };
    }

    var supabase = createClient(supabaseUrl, serviceKey);
    var data = JSON.parse(event.body);
    var agreement_type = data.agreement_type;
    var full_name = data.full_name;
    var business_name = data.business_name;
    var ein_last4 = data.ein_last4;
    var email = data.email;
    var country = data.country;
    var role_scope = data.role_scope;
    var website = data.website;
    var signature_data = data.signature_data;
    var signature_type = data.signature_type;
    var acknowledgments = data.acknowledgments;
    var user_id = data.user_id;

    var MAX_SIGNATURE_SIZE = 500000;
    var VALID_AGREEMENT_TYPES = ['founding_partner', 'member_founder', 'provider', 'founding_provider_chris_agrapidis', 'contractor', 'designer'];
    var VALID_SIGNATURE_TYPES = ['draw', 'type'];

    if (!agreement_type || !full_name || !signature_data) {
      return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Missing required fields: agreement_type, full_name, and signature are required' }) };
    }

    if (VALID_AGREEMENT_TYPES.indexOf(agreement_type) === -1) {
      return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid agreement type' }) };
    }

    if (signature_type && VALID_SIGNATURE_TYPES.indexOf(signature_type) === -1) {
      return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid signature type' }) };
    }

    if (signature_data.length > MAX_SIGNATURE_SIZE) {
      return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Signature data too large' }) };
    }

    if (full_name.length > 255 || (business_name && business_name.length > 255)) {
      return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Name fields too long' }) };
    }

    if (ein_last4 && !/^\d{4}$/.test(ein_last4)) {
      return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'EIN last 4 must be exactly 4 digits' }) };
    }

    if (acknowledgments && (!Array.isArray(acknowledgments) || acknowledgments.length > 20)) {
      return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'Invalid acknowledgments format' }) };
    }

    var ip_address = (event.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
                     event.headers['x-real-ip'] ||
                     event.headers['client-ip'] ||
                     'unknown';
    var user_agent = (event.headers['user-agent'] || 'unknown').substring(0, 500);

    var signedDate = new Date().toISOString();
    var signedDateFormatted = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    var insertData = {
      user_id: user_id || null,
      agreement_type: agreement_type,
      full_name: full_name.trim(),
      business_name: business_name ? business_name.trim() : null,
      signature_data: signature_data,
      ein_last4: ein_last4 || null,
      country: country ? String(country).trim().substring(0, 255) : null,
      role_scope: role_scope ? String(role_scope).trim().substring(0, 255) : null,
      email: email ? String(email).trim().substring(0, 255) : null,
      website: website ? String(website).trim().substring(0, 500) : null,
      signed_at: signedDate,
      ip_address: ip_address,
      user_agent: user_agent,
      acknowledgments: JSON.stringify(acknowledgments || []),
      email_sent: false
    };

    var result = await supabase
      .from('signed_agreements')
      .insert(insertData)
      .select('id')
      .single();

    if (result.error) {
      console.error('Error saving agreement:', result.error);
      return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Failed to save agreement' }) };
    }

    var agreementId = result.data.id;

    var agreementPdfData = {
      full_name: full_name.trim(),
      reference_id: agreementId,
      signed_date: signedDateFormatted,
      ip_address: ip_address,
      signature_data: signature_data,
      signature_type: signature_type || 'type'
    };

    var pdfUrl = null;
    var emailSent = false;

    try {
      var pdfBuffer = await generatePDF(agreementPdfData);

      try {
        var fileName = 'agreements/' + agreement_type + '/' + agreementId + '.pdf';
        var uploadResult = await supabase.storage
          .from('documents')
          .upload(fileName, pdfBuffer, { contentType: 'application/pdf', upsert: true });

        if (uploadResult.error) {
          await supabase.storage.createBucket('documents', { public: true, fileSizeLimit: 10485760 });
          var retryResult = await supabase.storage
            .from('documents')
            .upload(fileName, pdfBuffer, { contentType: 'application/pdf', upsert: true });
          if (!retryResult.error) {
            pdfUrl = supabase.storage.from('documents').getPublicUrl(fileName).data?.publicUrl || fileName;
          }
        } else {
          pdfUrl = supabase.storage.from('documents').getPublicUrl(fileName).data?.publicUrl || fileName;
        }
      } catch (uploadErr) {
        console.error('PDF upload failed:', uploadErr);
      }

      var recipientEmail = email || null;
      if (!recipientEmail && user_id) {
        try {
          var profileResult2 = await supabase.from('profiles').select('email').eq('id', user_id).single();
          recipientEmail = profileResult2.data?.email || null;
        } catch (pe) {}
      }

      if (recipientEmail && resendApiKey) {
        var base64Pdf = pdfBuffer.toString('base64');
        var emailHtml = buildEmailHtml(agreementPdfData);

        await sendEmailWithResend(resendApiKey, {
          from: 'My Car Concierge <noreply@mycarconcierge.com>',
          to: [recipientEmail],
          subject: 'Your Founding Provider Partner Agreement - My Car Concierge',
          html: emailHtml,
          attachments: [{ filename: 'MCC-Founding-Provider-Agreement.pdf', content: base64Pdf }]
        });
        emailSent = true;
        console.log('Agreement email sent to: ' + recipientEmail);
      }

      await supabase
        .from('signed_agreements')
        .update({ pdf_url: pdfUrl || null, email_sent: emailSent })
        .eq('id', agreementId);
    } catch (postErr) {
      console.error('Agreement post-processing failed:', postErr);
    }

    if (agreement_type === 'founding_provider_chris_agrapidis') {
      try {
        var signingDate = new Date(insertData.signed_at).toISOString().split('T')[0];
        var partnerEmail = email || null;

        if (!partnerEmail && user_id) {
          var profileResult = await supabase
            .from('profiles')
            .select('email')
            .eq('id', user_id)
            .single();
          partnerEmail = profileResult.data?.email || null;
        }

        await supabase.from('founding_provider_partners').upsert({
          user_id: user_id || null,
          full_name: 'Chris Agrapidis',
          email: partnerEmail,
          agreement_date: signingDate,
          anniversary_date: signingDate,
          commission_rate: 0.90,
          milestone_bonus_eligible: true,
          zero_fees: true,
          status: 'active',
          notes: 'Founding Provider Partner Agreement signed ' + signingDate
        }, { onConflict: 'full_name' });

        console.log('Created founding provider partner record for Chris Agrapidis');
      } catch (partnerErr) {
        console.error('Founding provider partner record error:', partnerErr);
      }
    }

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({
        success: true,
        id: agreementId,
        message: 'Agreement signed successfully'
      })
    };
  } catch (err) {
    console.error('Agreement sign error:', err);
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
