#!/usr/bin/env node
/**
 * Build per-shop indexable static pages for SEO.
 *
 * Reads active provider profiles from Supabase and generates a static HTML
 * page for each at www/shops/<slug>.html. Each page carries:
 *   - Server-rendered visible content (Googlebot can read it without JS)
 *   - LocalBusiness JSON-LD with only the fields that have real values
 *   - BreadcrumbList JSON-LD (Home > Provider Directory > Shop)
 *   - Prominent CTAs: Request a Quote, Get Directions, tap-to-call
 *
 * A shop is "indexable" only if:
 *   role = 'provider'
 *   AND directory_opt_in = true
 *   AND directory_slug IS NOT NULL
 *   AND marketplace_visible <> false
 *   AND shop_only_mode <> true
 *   AND business_name IS NOT NULL
 *   AND city IS NOT NULL
 *   AND phone IS NOT NULL
 *
 * Anything else is excluded — keeps the index high-quality and avoids
 * empty/incomplete shells getting crawled.
 *
 * Run: node scripts/build-shop-pages.js
 *
 * Env required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * If env is missing the script logs a warning and exits 0 (no-op) so it
 * never breaks local dev or CI without DB access.
 */

const fs   = require('fs');
const path = require('path');

const SITE_URL  = 'https://www.mycarconcierge.com';
const SITE_NAME = 'My Car Concierge';
const OG_IMAGE  = `${SITE_URL}/og-card.png`;
const OUT_DIR   = path.join(__dirname, '..', 'www', 'shops');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('⚠ build-shop-pages: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — skipping (no-op).');
  process.exit(0);
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------- helpers ----------
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
function escapeJsonLd(s) {
  // Inside a <script type="application/ld+json"> block, the only thing we have
  // to guard is the literal sequence "</" which would close the script tag.
  if (s == null) return s;
  return String(s).replace(/<\//g, '<\\/');
}
function formatService(svc) {
  return String(svc || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
function safeStars(rating) {
  const r = Math.round(Number(rating) || 0);
  return '\u2605'.repeat(Math.max(0, Math.min(5, r))) + '\u2606'.repeat(Math.max(0, 5 - Math.min(5, r)));
}

// Convert business_hours JSONB { monday: { open, close, closed } } into
// schema.org openingHoursSpecification array. Times are accepted as already
// 24h ("09:00") or 12h ("9:00 AM") — best-effort 12h->24h.
const DAY_LD = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};
function to24h(t) {
  if (!t || typeof t !== 'string') return null;
  const trimmed = t.trim();
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) return trimmed.padStart(5, '0');
  const m = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return String(h).padStart(2, '0') + ':' + min;
}
function buildOpeningHours(business_hours) {
  if (!business_hours || typeof business_hours !== 'object') return [];
  const out = [];
  for (const [day, ld] of Object.entries(DAY_LD)) {
    const h = business_hours[day];
    if (!h || h.closed) continue;
    const opens  = to24h(h.open);
    const closes = to24h(h.close);
    if (!opens || !closes) continue;
    out.push({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ld,
      opens, closes,
    });
  }
  return out;
}
function buildPriceRange(hourly_rate) {
  const r = Number(hourly_rate);
  if (!Number.isFinite(r) || r <= 0) return null;
  if (r < 75)   return '$';
  if (r < 125)  return '$$';
  if (r < 200)  return '$$$';
  return '$$$$';
}
function buildAddressLd(shop) {
  if (!shop.city && !shop.state && !shop.address) return null;
  const out = { '@type': 'PostalAddress', addressCountry: 'US' };
  if (shop.address) out.streetAddress  = shop.address;
  if (shop.city)    out.addressLocality = shop.city;
  if (shop.state)   out.addressRegion   = shop.state;
  return out;
}
function buildLocalBusinessLd(shop, reviewStats) {
  const url = `${SITE_URL}/shop/${shop.directory_slug}`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'AutoRepair',
    '@id': url + '#business',
    name: shop.business_name,
    url,
  };

  const address = buildAddressLd(shop);
  if (address) ld.address = address;

  if (shop.phone) ld.telephone = shop.phone;

  const image = shop.avatar_url || OG_IMAGE;
  ld.image = image;

  if (shop.bio || shop.description) {
    ld.description = (shop.bio || shop.description).slice(0, 500);
  }

  const hours = buildOpeningHours(shop.business_hours);
  if (hours.length) ld.openingHoursSpecification = hours;

  const priceRange = buildPriceRange(shop.hourly_rate);
  if (priceRange) ld.priceRange = priceRange;

  if (Array.isArray(shop.services) && shop.services.length) {
    ld.makesOffer = shop.services.map(svc => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: formatService(svc) },
    }));
  }

  // Aggregate rating ONLY when there are real reviews — Google penalises
  // synthetic / empty rating markup.
  if (reviewStats && reviewStats.count > 0) {
    ld.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: reviewStats.avg.toFixed(1),
      reviewCount: reviewStats.count,
      bestRating: '5',
      worstRating: '1',
    };
  }

  return ld;
}
function buildBreadcrumbLd(shop) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Provider Directory', item: `${SITE_URL}/providers-directory.html` },
      { '@type': 'ListItem', position: 3, name: shop.business_name, item: `${SITE_URL}/shop/${shop.directory_slug}` },
    ],
  };
}

// ---------- HTML template ----------
function renderHtml(shop, reviews) {
  const url = `${SITE_URL}/shop/${shop.directory_slug}`;
  const locationStr = [shop.city, shop.state].filter(Boolean).join(', ');
  const titleLine = locationStr
    ? `${shop.business_name} — Auto Service in ${locationStr} | ${SITE_NAME}`
    : `${shop.business_name} | ${SITE_NAME}`;
  const descSource = shop.bio || shop.description ||
    `Book auto services with ${shop.business_name}${locationStr ? ' in ' + locationStr : ''} on ${SITE_NAME}.`;
  const description = descSource.slice(0, 280);

  const reviewStats = reviews.length
    ? { count: reviews.length, avg: reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / reviews.length }
    : { count: 0, avg: 0 };

  const localBusinessLd = buildLocalBusinessLd(shop, reviewStats);
  const breadcrumbLd    = buildBreadcrumbLd(shop);

  const services = Array.isArray(shop.services) ? shop.services : [];
  const certifications = Array.isArray(shop.certifications) ? shop.certifications : [];

  const ogImage = shop.avatar_url || OG_IMAGE;

  // Visible HTML — Googlebot reads this even without JS.
  const servicesHtml = services.length
    ? `<ul class="services-list">${services.map(s => `<li>${escapeHtml(formatService(s))}</li>`).join('')}</ul>`
    : '';

  const certsHtml = certifications.length
    ? `<ul class="certs-list">${certifications.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul>`
    : '';

  const hoursRows = (() => {
    const bh = shop.business_hours;
    if (!bh || typeof bh !== 'object') return '';
    const order = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    const labels = { monday:'Mon', tuesday:'Tue', wednesday:'Wed', thursday:'Thu', friday:'Fri', saturday:'Sat', sunday:'Sun' };
    return order.map(d => {
      const h = bh[d];
      if (!h) return '';
      const v = h.closed ? 'Closed' : `${escapeHtml(h.open || '9:00 AM')} – ${escapeHtml(h.close || '5:00 PM')}`;
      return `<div class="hours-row"><span>${labels[d]}</span><span>${v}</span></div>`;
    }).filter(Boolean).join('');
  })();

  const ratingHtml = reviewStats.count > 0
    ? `<div class="rating"><span class="stars">${safeStars(reviewStats.avg)}</span> <strong>${reviewStats.avg.toFixed(1)}</strong> <span class="muted">(${reviewStats.count} review${reviewStats.count !== 1 ? 's' : ''})</span></div>`
    : '';

  const reviewsHtml = reviews.length
    ? reviews.slice(0, 5).map(r => `
        <article class="review">
          <header><span class="stars" aria-label="${r.rating} out of 5 stars">${safeStars(r.rating)}</span> <time datetime="${escapeAttr(r.created_at)}">${escapeHtml(new Date(r.created_at).toLocaleDateString())}</time></header>
          ${r.comment ? `<p>${escapeHtml(r.comment)}</p>` : ''}
        </article>`).join('')
    : '<p class="muted">No reviews yet — be the first to book.</p>';

  const directionsQuery = encodeURIComponent([shop.address, shop.city, shop.state].filter(Boolean).join(', ') || shop.business_name);
  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${directionsQuery}`;

  const phoneHref = shop.phone ? `tel:${String(shop.phone).replace(/[^0-9+]/g, '')}` : null;

  const yearsHtml = shop.years_in_business
    ? `<span class="badge gold">${parseInt(shop.years_in_business, 10)}+ years in business</span>`
    : '';
  const verifiedHtml = shop.is_verified ? '<span class="badge green">Verified Provider</span>' : '';
  const emergencyHtml = shop.emergency_enabled ? '<span class="badge teal">Emergency Service</span>' : '';

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(titleLine)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="description" content="${escapeAttr(description)}" />
  <link rel="canonical" href="${escapeAttr(url)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <meta name="theme-color" content="#12161c" />

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${escapeAttr(SITE_NAME)}" />
  <meta property="og:url" content="${escapeAttr(url)}" />
  <meta property="og:title" content="${escapeAttr(titleLine)}" />
  <meta property="og:description" content="${escapeAttr(description)}" />
  <meta property="og:image" content="${escapeAttr(ogImage)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content="en_US" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@mycarconcierge" />
  <meta name="twitter:title" content="${escapeAttr(titleLine)}" />
  <meta name="twitter:description" content="${escapeAttr(description)}" />
  <meta name="twitter:image" content="${escapeAttr(ogImage)}" />

  <script>(function(){var t=localStorage.getItem('theme')||'dark';document.documentElement.setAttribute('data-theme',t);})();</script>
  <link rel="manifest" href="/manifest.json" />
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
  <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Playfair+Display:wght@500;600&display=swap" rel="stylesheet">

  <script type="application/ld+json">${escapeJsonLd(JSON.stringify(localBusinessLd))}</script>
  <script type="application/ld+json">${escapeJsonLd(JSON.stringify(breadcrumbLd))}</script>

  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{--bg-deep:#12161c;--bg-card:rgba(26,32,42,.95);--bg-elev:rgba(36,44,56,.95);--text:#f5f5f7;--text-2:#a0a8b8;--muted:#6b7280;--gold:#c9a227;--green:#34d399;--teal:#22d3ee;--border:rgba(160,168,184,.15)}
    [data-theme="light"]{--bg-deep:#fefdfb;--bg-card:#fff;--bg-elev:#f3f4f6;--text:#1a1a2e;--text-2:#3d3d5c;--muted:#5c5c7a;--gold:#b8942d;--border:rgba(30,58,95,.15)}
    body{font-family:'Outfit',system-ui,sans-serif;background:var(--bg-deep);color:var(--text);line-height:1.6;min-height:100vh}
    nav.topnav{display:flex;justify-content:space-between;align-items:center;padding:14px 32px;border-bottom:1px solid var(--border)}
    nav.topnav .brand{display:flex;gap:10px;align-items:center;text-decoration:none;color:inherit}
    nav.topnav .brand img{height:34px;border-radius:8px}
    nav.topnav .brand-name{font-family:'Playfair Display',serif;font-size:1.05rem}
    nav.topnav .top-cta{display:flex;gap:10px}
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px 18px;border-radius:10px;font-family:inherit;font-size:.9rem;font-weight:600;text-decoration:none;border:none;cursor:pointer}
    .btn-primary{background:linear-gradient(135deg,var(--gold),#e8bc5a);color:#12161c}
    .btn-outline{background:transparent;color:var(--text);border:1px solid var(--border)}
    .crumbs{padding:14px 32px;font-size:.85rem;color:var(--muted)}
    .crumbs a{color:var(--muted);text-decoration:none}
    .crumbs a:hover{color:var(--gold)}
    .hero{padding:32px 24px 24px;text-align:center;background:radial-gradient(ellipse 90% 60% at 50% 0%,rgba(201,162,39,.10) 0%,transparent 70%)}
    .hero .avatar{width:96px;height:96px;border-radius:50%;background:linear-gradient(135deg,var(--gold),#c49a45);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:2.4rem;color:#12161c;margin:0 auto 16px;overflow:hidden}
    .hero .avatar img{width:100%;height:100%;object-fit:cover}
    .hero h1{font-family:'Playfair Display',serif;font-size:clamp(1.6rem,4vw,2.4rem);margin-bottom:6px}
    .hero .loc{color:var(--text-2);margin-bottom:14px}
    .badges{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:14px}
    .badge{padding:4px 12px;border-radius:100px;font-size:.78rem;font-weight:600;border:1px solid transparent}
    .badge.gold{background:rgba(201,162,39,.14);color:var(--gold);border-color:rgba(201,162,39,.3)}
    .badge.green{background:rgba(52,211,153,.12);color:var(--green);border-color:rgba(52,211,153,.3)}
    .badge.teal{background:rgba(34,211,238,.12);color:var(--teal);border-color:rgba(34,211,238,.3)}
    .rating{display:inline-flex;gap:8px;align-items:center;font-size:.95rem}
    .stars{color:var(--gold);letter-spacing:1px}
    .muted{color:var(--muted)}
    .cta-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:20px}
    main{max-width:960px;margin:0 auto;padding:24px 24px 80px}
    .layout{display:grid;grid-template-columns:1fr 320px;gap:24px;align-items:start}
    @media(max-width:768px){.layout{grid-template-columns:1fr}}
    .card{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:22px;margin-bottom:18px}
    .card h2{font-size:1.05rem;font-weight:600;margin-bottom:14px}
    .services-list,.certs-list{list-style:none;display:flex;flex-wrap:wrap;gap:8px}
    .services-list li,.certs-list li{padding:5px 12px;background:var(--bg-elev);border:1px solid var(--border);border-radius:100px;font-size:.83rem;color:var(--text-2)}
    .hours-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);color:var(--text-2);font-size:.9rem}
    .hours-row:last-child{border-bottom:none}
    .info{display:flex;flex-direction:column;gap:8px;font-size:.9rem;color:var(--text-2)}
    .info a{color:var(--text-2);text-decoration:none;border-bottom:1px dotted var(--border)}
    .info a:hover{color:var(--gold)}
    .review{padding:14px 0;border-bottom:1px solid var(--border)}
    .review:last-child{border-bottom:none}
    .review header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
    .review time{font-size:.8rem;color:var(--muted)}
    .sidecard{background:linear-gradient(145deg,rgba(201,162,39,.10),var(--bg-card));border:1px solid rgba(201,162,39,.3);border-radius:18px;padding:24px;position:sticky;top:24px}
    .sidecard h3{font-size:1.05rem;font-weight:700;margin-bottom:6px}
    .sidecard p{font-size:.85rem;color:var(--text-2);margin-bottom:14px}
    .form-group{margin-bottom:12px}
    .form-group label{display:block;font-size:.82rem;color:var(--text-2);margin-bottom:5px}
    .form-group input,.form-group select,.form-group textarea{width:100%;padding:10px 12px;background:var(--bg-elev);color:var(--text);border:1px solid var(--border);border-radius:10px;font-family:inherit;font-size:.9rem}
    .form-group textarea{min-height:70px;resize:vertical}
    .toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:12px 24px;border-radius:10px;background:var(--green);color:#022c22;z-index:9999;font-weight:600}
    .toast.error{background:#f87171;color:#3f0a0a}
    footer{padding:30px 0;border-top:1px solid var(--border);text-align:center;color:var(--muted);font-size:.85rem}
    footer a{color:var(--muted);margin:0 8px;text-decoration:none}
    footer a:hover{color:var(--gold)}
  </style>
</head>
<body>

<nav class="topnav">
  <a href="/" class="brand">
    <img src="/logo.png" alt="${escapeAttr(SITE_NAME)}" />
    <span class="brand-name">${escapeAttr(SITE_NAME)}</span>
  </a>
  <div class="top-cta">
    <a href="/providers-directory.html" class="btn btn-outline">Find more shops</a>
    <a href="/signup-member.html" class="btn btn-primary">Join free</a>
  </div>
</nav>

<nav class="crumbs" aria-label="Breadcrumb">
  <a href="/">Home</a> &rsaquo;
  <a href="/providers-directory.html">Provider Directory</a> &rsaquo;
  <span>${escapeHtml(shop.business_name)}</span>
</nav>

<header class="hero">
  <div class="avatar">${shop.avatar_url ? `<img src="${escapeAttr(shop.avatar_url)}" alt="${escapeAttr(shop.business_name)}">` : escapeHtml((shop.business_name || 'S').charAt(0).toUpperCase())}</div>
  <h1>${escapeHtml(shop.business_name)}</h1>
  ${locationStr ? `<div class="loc">${escapeHtml(locationStr)}</div>` : ''}
  <div class="badges">${yearsHtml}${verifiedHtml}${emergencyHtml}</div>
  ${ratingHtml}
  <div class="cta-row">
    <a href="#request-quote" class="btn btn-primary">Request a Quote</a>
    ${phoneHref ? `<a href="${escapeAttr(phoneHref)}" class="btn btn-outline">Call ${escapeHtml(shop.phone)}</a>` : ''}
    ${shop.address || shop.city ? `<a href="${escapeAttr(directionsHref)}" class="btn btn-outline" rel="noopener" target="_blank">Get Directions</a>` : ''}
  </div>
</header>

<main>
  <div class="layout">
    <div>
      ${shop.bio || shop.description ? `<section class="card"><h2>About ${escapeHtml(shop.business_name)}</h2><p>${escapeHtml(shop.bio || shop.description)}</p></section>` : ''}

      ${services.length ? `<section class="card"><h2>Services Offered</h2>${servicesHtml}</section>` : ''}

      ${certifications.length ? `<section class="card"><h2>Certifications</h2>${certsHtml}</section>` : ''}

      ${hoursRows ? `<section class="card"><h2>Business Hours</h2>${hoursRows}</section>` : ''}

      <section class="card">
        <h2>Business Info</h2>
        <div class="info">
          ${shop.address || shop.city ? `<div><strong>Location:</strong> ${escapeHtml([shop.address, shop.city, shop.state].filter(Boolean).join(', '))}</div>` : ''}
          ${phoneHref ? `<div><strong>Phone:</strong> <a href="${escapeAttr(phoneHref)}">${escapeHtml(shop.phone)}</a></div>` : ''}
          ${shop.hourly_rate ? `<div><strong>Starting at:</strong> $${escapeHtml(String(shop.hourly_rate))}/hr</div>` : ''}
          ${shop.years_in_business ? `<div><strong>Experience:</strong> ${parseInt(shop.years_in_business, 10)}+ years</div>` : ''}
        </div>
      </section>

      <section class="card">
        <h2>Customer Reviews ${reviewStats.count ? `(${reviewStats.count})` : ''}</h2>
        ${reviewsHtml}
      </section>
    </div>

    <aside>
      <div class="sidecard" id="request-quote">
        <h3>Request a Service</h3>
        <p>The shop will contact you to confirm.</p>
        <form id="book-form" onsubmit="submitShopBooking(event)">
          <input type="hidden" id="book-slug" value="${escapeAttr(shop.directory_slug)}" />
          <div class="form-group"><label>Your Name *</label><input type="text" id="book-name" required /></div>
          <div class="form-group"><label>Phone Number *</label><input type="tel" id="book-phone" required /></div>
          <div class="form-group"><label>Email</label><input type="email" id="book-email" /></div>
          <div class="form-group"><label>Vehicle (Year, Make, Model) *</label><input type="text" id="book-vehicle" required /></div>
          <div class="form-group">
            <label>Service Needed *</label>
            <select id="book-service" required>
              <option value="">Select a service…</option>
              ${services.map(s => `<option value="${escapeAttr(s)}">${escapeHtml(formatService(s))}</option>`).join('')}
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-group"><label>Details (optional)</label><textarea id="book-details"></textarea></div>
          <button type="submit" class="btn btn-primary" style="width:100%" id="book-submit">Request Service</button>
        </form>
        <p class="muted" style="font-size:.78rem;margin-top:10px;text-align:center">By submitting you agree to our <a href="/terms.html" style="color:var(--muted)">Terms</a>.</p>
      </div>
    </aside>
  </div>
</main>

<footer>
  <a href="/">Home</a>|<a href="/providers-directory.html">All Shops</a>|<a href="/how-it-works.html">How It Works</a>|<a href="/privacy.html">Privacy</a>|<a href="/terms.html">Terms</a>
  <div style="margin-top:10px">&copy; ${new Date().getFullYear()} ${escapeHtml(SITE_NAME)}. All rights reserved.</div>
</footer>

<script>
async function submitShopBooking(e){
  e.preventDefault();
  var btn = document.getElementById('book-submit');
  btn.disabled = true; var orig = btn.textContent; btn.textContent = 'Submitting…';
  var payload = {
    slug: document.getElementById('book-slug').value,
    name: document.getElementById('book-name').value.trim(),
    phone: document.getElementById('book-phone').value.trim(),
    email: document.getElementById('book-email').value.trim(),
    vehicle: document.getElementById('book-vehicle').value.trim(),
    service: document.getElementById('book-service').value,
    details: document.getElementById('book-details').value.trim()
  };
  try {
    var res = await fetch('/api/shop/book', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    showToast('Request sent! The shop will contact you to confirm.');
    document.getElementById('book-form').reset();
  } catch (err) {
    showToast(err.message || 'Could not send request.', true);
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}
function showToast(msg, isError){
  var t = document.createElement('div');
  t.className = 'toast' + (isError ? ' error' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function(){t.remove();}, 3500);
}
</script>

</body>
</html>
`;
}

// ---------- main ----------
async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('Querying active shops…');
  const { data: shops, error } = await supabase
    .from('profiles')
    .select('id, business_name, full_name, bio, description, city, state, address, phone, services, certifications, hourly_rate, years_in_business, directory_slug, marketplace_visible, shop_only_mode, is_verified, business_hours, avatar_url, emergency_enabled, updated_at')
    .eq('role', 'provider')
    .eq('directory_opt_in', true)
    .not('directory_slug', 'is', null)
    .not('marketplace_visible', 'eq', false)
    .not('shop_only_mode', 'eq', true)
    .not('business_name', 'is', null)
    .not('city', 'is', null)
    .not('phone', 'is', null);

  if (error) {
    console.error('✗ Supabase query failed:', error.message);
    process.exit(1);
  }

  const eligible = (shops || []).filter(s =>
    typeof s.directory_slug === 'string' &&
    /^[a-z0-9-]{2,80}$/i.test(s.directory_slug)
  );

  console.log(`Found ${eligible.length} eligible shops (of ${shops ? shops.length : 0} returned).`);

  // Track existing slugs so we can delete files for shops that became inactive
  // (or had their slug changed) since the last build.
  const expectedFiles = new Set();
  let written = 0, unchanged = 0;

  for (const shop of eligible) {
    const slug = shop.directory_slug;
    expectedFiles.add(slug + '.html');

    // Pull up to 20 recent reviews for aggregateRating + review block.
    const { data: reviews } = await supabase
      .from('reviews')
      .select('rating, comment, created_at')
      .eq('provider_id', shop.id)
      .order('created_at', { ascending: false })
      .limit(20);

    const html = renderHtml(shop, reviews || []);
    const filePath = path.join(OUT_DIR, slug + '.html');
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
    if (existing !== html) {
      fs.writeFileSync(filePath, html, 'utf8');
      written++;
    } else {
      unchanged++;
    }
  }

  // Garbage-collect stale shop pages (shop deactivated, suspended, slug changed).
  let removed = 0;
  for (const file of fs.readdirSync(OUT_DIR)) {
    if (!file.endsWith('.html')) continue;
    if (!expectedFiles.has(file)) {
      fs.unlinkSync(path.join(OUT_DIR, file));
      removed++;
    }
  }

  console.log(`✓ Wrote ${written} shop pages, ${unchanged} unchanged, ${removed} removed (stale).`);
}

main().catch(err => {
  console.error('✗ build-shop-pages failed:', err);
  process.exit(1);
});
