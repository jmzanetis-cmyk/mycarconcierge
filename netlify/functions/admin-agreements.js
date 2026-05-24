// netlify/functions/admin-agreements.js
//
// Admin agreements list, manual add, and PDF download.
// Ported from server.js:
//   handleAdminGetAllAgreements (line 1213)
//   handleAdminGetAgreementPDF  (line 1304)
//   POST /api/admin/agreements  (inline handler, server.js ~line 30561)
//
// Routes (via _redirects):
//   GET  /api/admin/agreements         → paginated list from signed_agreements
//   POST /api/admin/agreements         → manual admin insert
//   GET  /api/admin/agreements/:id/pdf → generate and stream PDF
//
// Auth:
//   GET list + GET pdf + POST add: Authorization: Bearer <supabase_token> →
//     getUser → profiles.role === 'admin'

'use strict';

var utils = require('./utils');

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

function parsePath(event) {
  var raw = event.path || '';
  return raw
    .replace(/^\/?\.netlify\/functions\/admin-agreements\/?/, '')
    .replace(/^\/api\/admin\/agreements\/?/, '')
    .replace(/^\/+|\/+$/g, '');
}

async function handleList(supabase, qs) {
  var page          = Math.max(1, parseInt(qs.page) || 1);
  var limit         = Math.min(parseInt(qs.limit) || 25, 100);
  var agreementType = qs.type   || null;
  var search        = qs.search || null;
  var offset        = (page - 1) * limit;

  var query = supabase
    .from('signed_agreements')
    .select('*', { count: 'exact' })
    .order('signed_at', { ascending: false })
    .range(offset, page * limit - 1);

  if (agreementType) query = query.eq('agreement_type', agreementType);
  if (search)        query = query.or('full_name.ilike.%' + search + '%,business_name.ilike.%' + search + '%');

  var result = await query;
  if (result.error) throw result.error;

  return {
    success: true,
    agreements: result.data || [],
    total: result.count || 0,
    page,
    limit,
    totalPages: Math.ceil((result.count || 0) / limit)
  };
}

async function handleAdd(supabase, body) {
  var full_name      = (body.full_name || '').trim();
  var agreement_type = (body.agreement_type || '').trim();

  if (!full_name || !agreement_type) {
    var err = new Error('full_name and agreement_type are required');
    err.statusCode = 400;
    throw err;
  }

  var insert = {
    full_name,
    agreement_type,
    business_name: body.business_name || null,
    signed_at:     body.signed_at     || new Date().toISOString(),
    pdf_url:       body.pdf_url       || null,
    notes:         body.notes         || null
  };

  var result = await supabase.from('signed_agreements').insert(insert).select().single();
  if (result.error) throw result.error;

  return { success: true, agreement: result.data };
}

async function handlePdf(supabase, agreementId) {
  var PDFDocument = require('pdfkit');

  var result = await supabase.from('signed_agreements').select('*').eq('id', agreementId).single();
  if (result.error || !result.data) {
    var notFound = new Error('Agreement not found');
    notFound.statusCode = 404;
    throw notFound;
  }

  var agreement = result.data;

  var signedDateFormatted = agreement.signed_at
    ? new Date(agreement.signed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'N/A';

  var pdfBuffer = await new Promise(function(resolve, reject) {
    var doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    var buffers = [];
    doc.on('data', function(chunk) { buffers.push(chunk); });
    doc.on('end',  function()      { resolve(Buffer.concat(buffers)); });
    doc.on('error', reject);

    var gold      = '#b8942d';
    var darkText  = '#1a1a1a';
    var grayText  = '#555555';
    var lightGray = '#999999';

    var isFoundingProvider = agreement.agreement_type === 'founding_provider_chris_agrapidis';

    doc.rect(0, 0, doc.page.width, 100).fill('#12161c');
    doc.fillColor('#d4a855').fontSize(22).font('Helvetica-Bold').text('My Car Concierge', 50, 30, { align: 'center' });

    if (isFoundingProvider) {
      doc.fillColor('#ffffff').fontSize(11).font('Helvetica').text('Founding Provider Partner Agreement', 50, 58, { align: 'center' });
      doc.fillColor('#d4a855').fontSize(9).text('FOUNDING PROVIDER PARTNER', 50, 76, { align: 'center' });
    } else {
      var typeLabel = (agreement.agreement_type || '').replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
      doc.fillColor('#ffffff').fontSize(11).font('Helvetica').text(typeLabel + ' Agreement', 50, 58, { align: 'center' });
      doc.fillColor('#d4a855').fontSize(9).text(typeLabel.toUpperCase(), 50, 76, { align: 'center' });
    }

    doc.moveDown(3);
    doc.y = 120;

    doc.fillColor(darkText).fontSize(10).font('Helvetica');
    doc.text('Effective Date: ' + signedDateFormatted, 50);
    doc.moveDown(0.3);
    doc.text('BETWEEN: Zanetis Holdings LLC d/b/a My Car Concierge, 107 Almond Drive, Somerset, NJ 08873 ("MCC")', 50);
    doc.moveDown(0.3);
    doc.text('AND: ', { continued: true });
    doc.font('Helvetica-Bold').fillColor(gold).text(agreement.full_name || 'Provider', { continued: true });
    doc.font('Helvetica').fillColor(darkText).text(isFoundingProvider ? ' ("Founding Provider")' : ' ("Provider")');
    doc.moveDown(0.3);
    doc.fillColor(lightGray).fontSize(8).text('Reference ID: ' + (agreement.id || 'N/A') + '  |  IP: ' + (agreement.ip_address || 'N/A'), 50);

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

    if (isFoundingProvider) {
      sectionHeader('1. FOUNDING PROVIDER BENEFITS');

      sectionBody('1.1 Unlimited Bid Credits.', 'Founding Provider receives unlimited bid credits at no cost (every other provider purchases bid-credit packs to compete for jobs). MCC charges no platform fee on completed jobs for any provider; Founding Provider keeps 100% of customer payments minus only standard credit-card payment processing fees.');
      sectionBody('1.2 Referral Commissions.', "Founding Provider receives 90% of total revenue from bid pack purchases made by any provider Founding Provider refers to MCC, for the lifetime of the respective provider's account. Commissions paid monthly within 15 business days.");
      sectionBody('1.3 Milestone Bonuses.', 'Founding Provider receives one-time bonuses when MCC achieves total aggregate revenue milestones:');

      var milestones = [
        ['$1,000','$100'], ['$5,000','$500'], ['$10,000','$1,000'],
        ['$25,000','$2,500'], ['$50,000','$5,000'], ['$100,000','$12,500'],
        ['$250,000','$30,000'], ['$500,000','$60,000'], ['$1,000,000','$125,000']
      ];

      var tableTop  = doc.y + 5;
      var col1X     = 150;
      var col2X     = 350;
      var colWidth  = 200;
      var rowHeight = 18;

      doc.rect(col1X, tableTop, colWidth, rowHeight).fill('#12161c');
      doc.rect(col2X, tableTop, colWidth, rowHeight).fill('#12161c');
      doc.fillColor('#d4a855').fontSize(8).font('Helvetica-Bold');
      doc.text('PLATFORM REVENUE MILESTONE', col1X + 5, tableTop + 5, { width: colWidth - 10, align: 'center' });
      doc.text('BONUS AMOUNT', col2X + 5, tableTop + 5, { width: colWidth - 10, align: 'center' });

      for (var mi = 0; mi < milestones.length; mi++) {
        var rowY = tableTop + rowHeight + (mi * rowHeight);
        if (mi % 2 === 0) {
          doc.rect(col1X, rowY, colWidth, rowHeight).fill('#f9f6ef');
          doc.rect(col2X, rowY, colWidth, rowHeight).fill('#f9f6ef');
        }
        doc.fillColor(darkText).fontSize(9).font('Helvetica');
        doc.text(milestones[mi][0], col1X + 5, rowY + 5, { width: colWidth - 10, align: 'center' });
        doc.text(milestones[mi][1], col2X + 5, rowY + 5, { width: colWidth - 10, align: 'center' });
      }

      doc.y = tableTop + rowHeight + (milestones.length * rowHeight) + 10;
      doc.fillColor(grayText).fontSize(8).font('Helvetica').text('Milestone bonuses are revenue-based, paid when cumulative company revenue reaches each threshold. Bonus reserve funds are held in a secure, interest-bearing account, earning interest until milestones are reached. Bonuses will be paid within 30 days of achieving each milestone. Additional milestone amounts and bonus structures beyond $1,000,000 in cumulative company revenue will be discussed by mutual written agreement as the company grows.', 50, doc.y, { align: 'justify' });

      doc.addPage();

      sectionHeader('2. FOUNDING PROVIDER OBLIGATIONS');
      sectionBody('2.1 Service Standards.',   'Founding Provider shall maintain required licenses, insurance, and certifications, and comply with all applicable laws.');
      sectionBody('2.2 Platform Compliance.', 'Founding Provider shall maintain accurate profile information.');
      sectionBody('2.3 Provider Recruitment.','Founding Provider shall actively recruit qualified service providers to the MCC platform.');

      sectionHeader('3. TERMS & CONDITIONS');
      sectionBody('3.1 Independent Contractor.', 'Founding Provider is an independent contractor, not an employee. MCC will issue Form 1099-NEC for payments exceeding $600/year. Founding Provider provides Form W-9 before first payment and is responsible for all taxes, insurance, and business expenses.');
      sectionBody('3.2 Duration.',              'This Agreement continues indefinitely and may only be terminated by mutual written agreement of both parties.');
      sectionBody('3.3 Commission Protection.', 'The 90% commission rate on already-referred providers continues for life, even if this Agreement terminates. All other Founding Provider benefits (unlimited free bid credits, milestone bonuses) end upon termination.');
      sectionBody('3.4 Confidentiality.',       'Both parties maintain confidentiality of business information, customer data, and proprietary processes.');
      sectionBody('3.5 Intellectual Property.', "All MCC trademarks, platform technology, and IP remain MCC's exclusive property. Founding Provider may use MCC branding only for recruiting providers.");
      sectionBody('3.6 Indemnification.',       "Founding Provider shall indemnify, defend, and hold harmless MCC and its officers, directors, employees, and agents from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys' fees) arising out of or related to Founding Provider's services, operations, or breach of this Agreement. Founding Provider shall maintain adequate insurance coverage as required by applicable law.");
      sectionBody('3.7 Modification.',          'This Agreement may only be modified by written agreement signed by both parties.');
      sectionBody('3.8 Governing Law.',         'This Agreement is governed by New Jersey law. Disputes resolved first through negotiation, then mediation, then New Jersey courts.');
    } else {
      var typeLabelGeneric = (agreement.agreement_type || '').replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
      sectionHeader('AGREEMENT DETAILS');
      sectionBody('Agreement Type:', typeLabelGeneric);
      sectionBody('Full Name:', agreement.full_name || 'N/A');
      if (agreement.business_name) sectionBody('Business Name:', agreement.business_name);
      sectionBody('Date Signed:', signedDateFormatted);
      sectionBody('Reference ID:', String(agreement.id || 'N/A'));
      if (agreement.ip_address) sectionBody('IP Address:', agreement.ip_address);
    }

    doc.moveDown(2);
    doc.fillColor(gold).fontSize(12).font('Helvetica-Bold').text('SIGNATURES', 50);
    doc.moveTo(50, doc.y + 2).lineTo(562, doc.y + 2).strokeColor(gold).lineWidth(0.5).stroke();
    doc.moveDown(1);

    var sigY = doc.y;
    doc.rect(50, sigY, 240, 120).strokeColor('#cccccc').lineWidth(0.5).stroke();
    doc.fillColor(darkText).fontSize(9).font('Helvetica-Bold').text('Zanetis Holdings LLC d/b/a My Car Concierge', 60, sigY + 10, { width: 220 });
    doc.fillColor(gold).fontSize(16).font('Helvetica-Oblique').text('Jordan Zanetis', 60, sigY + 35, { width: 220 });
    doc.fillColor(darkText).fontSize(9).font('Helvetica-Bold').text('Jordan Zanetis', 60, sigY + 58, { continued: true });
    doc.font('Helvetica').text(', Founder & CEO');
    doc.fillColor(grayText).fontSize(8).text('Date: ' + signedDateFormatted, 60, sigY + 78);
    doc.fillColor(lightGray).fontSize(7).text('Pre-signed by MCC', 60, sigY + 95);

    doc.rect(310, sigY, 240, 120).strokeColor('#cccccc').lineWidth(0.5).stroke();
    doc.fillColor(darkText).fontSize(9).font('Helvetica-Bold').text(isFoundingProvider ? 'Founding Provider' : 'Provider', 320, sigY + 10, { width: 220 });

    var sigData = agreement.signature_data || '';
    if (sigData && sigData.indexOf('data:image') === 0) {
      try {
        var base64Part = sigData.split(',')[1];
        if (base64Part) {
          var imgBuffer = Buffer.from(base64Part, 'base64');
          doc.image(imgBuffer, 320, sigY + 28, { width: 180, height: 40, fit: [180, 40] });
        }
      } catch (imgErr) {
        doc.fillColor(gold).fontSize(16).font('Helvetica-Oblique').text(agreement.full_name || 'Provider', 320, sigY + 35, { width: 220 });
      }
    } else if (sigData && sigData.indexOf('typed:') === 0) {
      doc.fillColor(gold).fontSize(18).font('Helvetica-Oblique').text(sigData.substring(6), 320, sigY + 35, { width: 220 });
    } else {
      doc.fillColor(gold).fontSize(16).font('Helvetica-Bold').text(agreement.full_name || 'Provider', 320, sigY + 35, { width: 220 });
    }

    doc.fillColor(darkText).fontSize(9).font('Helvetica-Bold').text(agreement.full_name || 'Provider', 320, sigY + 72);
    doc.fillColor(grayText).fontSize(8).font('Helvetica').text('Date: ' + signedDateFormatted, 320, sigY + 85);
    doc.fillColor(lightGray).fontSize(7).text('Electronically signed', 320, sigY + 100);

    doc.moveDown(6);
    var footerY = doc.page.height - 40;
    doc.fillColor(lightGray).fontSize(7).font('Helvetica');
    doc.text('Reference ID: ' + (agreement.id || 'N/A') + '  |  Signed: ' + signedDateFormatted + '  |  My Car Concierge - mycarconcierge.com', 50, footerY, { align: 'center', width: 512 });

    doc.end();
  });

  return pdfBuffer;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return utils.optionsResponse();

  var supabase = utils.createSupabaseClient();
  if (!supabase) return utils.errorResponse(500, 'Server configuration error');

  var user = await authenticateBearerAdmin(event, supabase);
  if (!user) return utils.errorResponse(401, 'Authentication required');

  var path   = parsePath(event);
  var method = event.httpMethod;
  var qs     = event.queryStringParameters || {};

  try {
    // GET /api/admin/agreements — list
    if (method === 'GET' && path === '') {
      return utils.successResponse(await handleList(supabase, qs));
    }

    // POST /api/admin/agreements — add
    if (method === 'POST' && path === '') {
      var body = {};
      try { body = event.body ? JSON.parse(event.body) : {}; } catch (e) { return utils.errorResponse(400, 'Invalid JSON'); }
      return utils.successResponse(await handleAdd(supabase, body));
    }

    // GET /api/admin/agreements/:id/pdf — download PDF
    var pdfMatch = path.match(/^([^/]+)\/pdf$/);
    if (method === 'GET' && pdfMatch) {
      var agreementId = pdfMatch[1];
      var pdfBuffer = await handlePdf(supabase, agreementId);
      return {
        statusCode: 200,
        headers: {
          'Content-Type':        'application/pdf',
          'Content-Disposition': 'attachment; filename="MCC-Agreement-' + agreementId + '.pdf"',
          'Access-Control-Allow-Origin': '*'
        },
        body: pdfBuffer.toString('base64'),
        isBase64Encoded: true
      };
    }

    return utils.errorResponse(404, 'Unknown route');
  } catch (err) {
    if (err.statusCode) return utils.errorResponse(err.statusCode, err.message);
    console.error('[admin-agreements] error:', err.message);
    return utils.errorResponse(500, 'Something went wrong');
  }
};
