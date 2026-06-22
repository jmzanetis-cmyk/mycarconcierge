// ============================================================================
// receipt-pdf — generate a downloadable PDF receipt for a completed care plan
//
// GET /api/receipt/:planId
// Auth: Bearer JWT (member must own the care plan)
//
// Queries care_plans + plan_bids + profiles + vehicles, then renders a
// single-page pdfkit receipt and returns it as an application/pdf attachment.
// ============================================================================
'use strict';

const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function getSupabaseAnon() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function generateReceiptPDF(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    const buffers = [];
    doc.on('data', chunk => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const gold    = '#d4a855';
    const dark    = '#1a1a2e';
    const gray    = '#555555';
    const light   = '#888888';
    const green   = '#16a34a';
    const white   = '#ffffff';
    const offWhite = '#f9fafb';

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const L = 50;
    const R = pageW - 50;
    const contentW = R - L;

    // ---- Header bar ----
    doc.rect(0, 0, pageW, 90).fill(dark);
    doc.fillColor(gold).fontSize(20).font('Helvetica-Bold')
      .text('My Car Concierge', L, 22, { width: contentW, align: 'left' });
    doc.fillColor(white).fontSize(10).font('Helvetica')
      .text('Service Receipt', L, 48, { width: contentW, align: 'left' });
    doc.fillColor(gold).fontSize(9)
      .text('mycarconcierge.com', L, 64, { width: contentW, align: 'left' });

    // Receipt label top-right
    doc.fillColor(gold).fontSize(24).font('Helvetica-Bold')
      .text('RECEIPT', 0, 28, { width: pageW - 50, align: 'right' });

    let y = 110;

    // ---- Status badge ----
    doc.roundedRect(L, y, 80, 20, 4).fill(green);
    doc.fillColor(white).fontSize(9).font('Helvetica-Bold')
      .text('PAID', L, y + 5, { width: 80, align: 'center' });
    y += 30;

    // ---- Two-column: left = receipt details, right = service address ----
    const col1W = contentW * 0.55;
    const col2X = L + col1W + 20;
    const col2W = contentW - col1W - 20;

    function label(text, x, yPos, w) {
      doc.fillColor(light).fontSize(8).font('Helvetica').text(text, x, yPos, { width: w });
    }
    function value(text, x, yPos, w) {
      doc.fillColor(dark).fontSize(10).font('Helvetica-Bold').text(text || '—', x, yPos, { width: w });
    }

    label('Receipt No.',        L,     y,      col1W);
    label('Date',               L+150, y,      col1W);
    value(data.packageId.slice(0, 8).toUpperCase(), L, y + 10, 140);
    value(data.paymentDate,     L+150, y + 10, 140);
    y += 32;

    label('Member',             L,     y,      col1W);
    label('Transaction ID',     L+150, y,      col1W);
    value(data.memberName,      L,     y + 10, 140);
    doc.fillColor(dark).fontSize(8).font('Helvetica')
      .text(data.transactionId || 'N/A', L+150, y + 10, { width: 200 });
    y += 32;

    label('Vehicle',            L,     y,      col1W);
    label('Provider',           L+150, y,      col1W);
    value(data.vehicleLabel,    L,     y + 10, 140);
    value(data.providerName,    L+150, y + 10, 140);
    y += 40;

    // ---- Divider ----
    doc.moveTo(L, y).lineTo(R, y).strokeColor('#e5e7eb').lineWidth(1).stroke();
    y += 16;

    // ---- Services header ----
    doc.rect(L, y, contentW, 22).fill('#f3f4f6');
    doc.fillColor(gray).fontSize(9).font('Helvetica-Bold')
      .text('SERVICE', L + 8, y + 6, { width: contentW * 0.55 });
    doc.fillColor(gray).fontSize(9).font('Helvetica-Bold')
      .text('AMOUNT', R - 80, y + 6, { width: 80, align: 'right' });
    y += 22;

    // ---- Service rows ----
    const services = Array.isArray(data.services) && data.services.length
      ? data.services
      : [{ name: data.title || 'Service', price: null }];

    services.forEach((svc, i) => {
      const rowBg = i % 2 === 0 ? white : offWhite;
      doc.rect(L, y, contentW, 20).fill(rowBg);
      doc.fillColor(dark).fontSize(9).font('Helvetica')
        .text(svc.name || svc.description || 'Service', L + 8, y + 5, { width: contentW * 0.65 });
      if (svc.price != null) {
        doc.fillColor(dark).fontSize(9).font('Helvetica')
          .text('$' + Number(svc.price).toFixed(2), R - 80, y + 5, { width: 80, align: 'right' });
      }
      y += 20;
    });

    y += 10;

    // ---- Totals block ----
    const totalsX = L + contentW * 0.55;
    const totalsW = contentW * 0.45;

    function totalRow(labelTxt, amtVal, bold, colorVal) {
      doc.fillColor(colorVal || gray).fontSize(9).font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(labelTxt, totalsX, y, { width: totalsW * 0.55 });
      doc.fillColor(colorVal || dark).fontSize(9).font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(amtVal, R - 80, y, { width: 80, align: 'right' });
      y += 16;
    }

    if (data.laborTotal)  totalRow('Labor',    '$' + data.laborTotal.toFixed(2));
    if (data.partsTotal)  totalRow('Parts',    '$' + data.partsTotal.toFixed(2));
    if (data.subtotal)    totalRow('Subtotal', '$' + data.subtotal.toFixed(2));
    if (data.taxTotal)    totalRow('Tax',      '$' + data.taxTotal.toFixed(2));

    // Total row with accent line above
    doc.moveTo(totalsX, y).lineTo(R, y).strokeColor(gold).lineWidth(1).stroke();
    y += 8;
    totalRow('TOTAL PAID', '$' + (data.amountTotal || 0).toFixed(2), true, dark);

    y += 16;

    // ---- Payment method ----
    if (data.paymentMethod) {
      doc.fillColor(light).fontSize(8).font('Helvetica')
        .text('Paid via ' + data.paymentMethod, totalsX, y);
      y += 16;
    }

    // ---- Notes ----
    if (data.technicianNotes) {
      y += 10;
      doc.moveTo(L, y).lineTo(R, y).strokeColor('#e5e7eb').lineWidth(1).stroke();
      y += 12;
      doc.fillColor(light).fontSize(8).font('Helvetica-Bold').text('PROVIDER NOTES', L, y);
      y += 12;
      doc.fillColor(gray).fontSize(9).font('Helvetica')
        .text(data.technicianNotes, L, y, { width: contentW, lineGap: 3 });
      y += doc.heightOfString(data.technicianNotes, { width: contentW }) + 12;
    }

    // ---- Footer ----
    const footerY = pageH - 60;
    doc.moveTo(L, footerY).lineTo(R, footerY).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    doc.fillColor(light).fontSize(8).font('Helvetica')
      .text('Thank you for using My Car Concierge. For questions, contact support@mycarconcierge.com', L, footerY + 8, { width: contentW, align: 'center' });
    doc.fillColor(light).fontSize(7)
      .text('Zanetis Holdings LLC d/b/a My Car Concierge  •  107 Almond Drive, Somerset, NJ 08873', L, footerY + 22, { width: contentW, align: 'center' });

    doc.end();
  });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Extract packageId from path: /api/receipt/:packageId → /receipt-pdf/:packageId
  const pathParts = (event.path || '').split('/').filter(Boolean);
  const packageId = pathParts[pathParts.length - 1];
  if (!packageId || packageId === 'receipt-pdf') {
    return { statusCode: 400, body: JSON.stringify({ error: 'packageId required' }) };
  }

  // Authenticate the member
  const authHeader = event.headers && (event.headers.authorization || event.headers.Authorization);
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) };
  }

  const anonClient = getSupabaseAnon();
  if (!anonClient) {
    return { statusCode: 503, body: JSON.stringify({ error: 'service_unavailable' }) };
  }

  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
  if (authErr || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { statusCode: 503, body: JSON.stringify({ error: 'service_unavailable' }) };
  }

  // Fetch care plan — security: must belong to this member
  const { data: pkg, error: pkgErr } = await supabase
    .from('care_plans')
    .select('id, member_id, provider_id, title, status, vehicle_id, accepted_bid_id, escrow_amount, payment_status, stripe_payment_intent_id, completion_notes, accepted_at, updated_at')
    .eq('id', packageId)
    .eq('member_id', user.id)
    .maybeSingle();

  if (pkgErr || !pkg) {
    return { statusCode: 404, body: JSON.stringify({ error: 'plan_not_found' }) };
  }

  // Load related data in parallel — accepted bid (authoritative amount),
  // member/provider profiles, vehicle.
  const [memberResult, providerResult, bidResult, vehicleResult] = await Promise.all([
    supabase.from('profiles').select('full_name, first_name, last_name, email').eq('id', user.id).maybeSingle(),
    pkg.provider_id
      ? supabase.from('profiles').select('full_name, first_name, last_name, provider_alias, business_name').eq('id', pkg.provider_id).maybeSingle()
      : Promise.resolve({ data: null }),
    pkg.accepted_bid_id
      ? supabase.from('plan_bids').select('amount').eq('id', pkg.accepted_bid_id).maybeSingle()
      : Promise.resolve({ data: null }),
    pkg.vehicle_id
      ? supabase.from('vehicles').select('nickname, year, make, model').eq('id', pkg.vehicle_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const memberProfile  = memberResult.data;
  const providerProfile = providerResult.data;
  const acceptedBid    = bidResult.data;
  const vehicle        = vehicleResult.data;

  // Build member name
  const memberName = memberProfile
    ? (memberProfile.full_name || [memberProfile.first_name, memberProfile.last_name].filter(Boolean).join(' ') || memberProfile.email || 'Member')
    : 'Member';

  // Build provider name — prefer business_name on the new schema, then
  // alias (privacy parity), then personal name.
  const providerName = providerProfile
    ? (providerProfile.business_name || providerProfile.provider_alias || providerProfile.full_name || [providerProfile.first_name, providerProfile.last_name].filter(Boolean).join(' ') || 'Provider')
    : 'Provider';

  // Build vehicle label
  const vehicleLabel = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model, vehicle.nickname ? `(${vehicle.nickname})` : ''].filter(Boolean).join(' ')
    : 'Vehicle';

  // Receipt date: updated_at moves on capture/dispute; otherwise fall back
  // to accepted_at (set on bid acceptance).
  const completedAt = (pkg.status === 'completed' || pkg.payment_status === 'captured')
    ? pkg.updated_at
    : pkg.accepted_at;
  const paymentDate = completedAt
    ? new Date(completedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'N/A';

  // care_plans has no services JSONB column; PDF renderer falls back to
  // title when services is empty.
  const services = [];

  // Authoritative amount: accepted plan_bids.amount (dollars). escrow_amount
  // is the same value mirrored onto care_plans on accept; use it as backup.
  const amountTotal = Number(acceptedBid?.amount ?? pkg.escrow_amount ?? 0);

  const pdfData = {
    packageId,
    memberName,
    providerName,
    vehicleLabel,
    title: pkg.title || 'Service',
    services,
    laborTotal:      null,
    partsTotal:      null,
    subtotal:        null,
    taxTotal:        null,
    amountTotal,
    paymentDate,
    transactionId:   pkg.stripe_payment_intent_id || null,
    paymentMethod:   null,
    technicianNotes: pkg.completion_notes || null,
  };

  try {
    const pdfBuffer = await generateReceiptPDF(pdfData);
    const safeTitle = (pkg.title || 'service').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
    const filename  = `MCC_Receipt_${safeTitle}_${packageId.slice(0, 8)}.pdf`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Access-Control-Allow-Origin': '*',
      },
      body: pdfBuffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (pdfErr) {
    console.error('[receipt-pdf] PDF generation failed:', pdfErr.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'pdf_generation_failed' }) };
  }
};
