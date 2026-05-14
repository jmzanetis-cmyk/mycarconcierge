#!/usr/bin/env node
/**
 * One-shot SEO meta injection for My Car Concierge.
 *
 * Reads every www/*.html file, classifies it as PUBLIC or PRIVATE,
 * and injects:
 *  - <link rel="canonical">
 *  - <meta name="robots"> (index/noindex per classification)
 *  - <meta name="description"> (only if missing — never overwrites existing)
 *  - <meta property="og:*">
 *  - <meta name="twitter:*">
 *
 * Idempotent: safe to re-run. Existing tags are detected and skipped/replaced
 * based on a marker comment. Pages already carrying SEO from a prior run are
 * updated in-place rather than duplicated.
 *
 * Run:  node scripts/inject-seo-meta.js
 */

const fs   = require('node:fs');
const path = require('node:path');

const SITE_URL    = 'https://www.mycarconcierge.com';
const OG_IMAGE    = `${SITE_URL}/og-card.png`;
const SITE_NAME   = 'My Car Concierge';
const TWITTER     = '@mycarconcierge';
const WWW_DIR     = path.join(__dirname, '..', 'www');
const MARKER_OPEN = '<!-- SEO-INJECT:START -->';
const MARKER_CLOSE = '<!-- SEO-INJECT:END -->';

// Per-page metadata. Pages NOT listed here are auto-classified PRIVATE (noindex)
// to be safe — better to under-index than expose internal/admin pages.
const PAGES = {
  // ============== CORE MARKETING (PUBLIC) ==============
  'index.html': {
    public: true,
    title: 'My Car Concierge — Your Complete Auto Ownership Platform',
    description: 'One app. Every auto need. Zero hassle. Get quotes from vetted providers, manage your vehicles, schedule maintenance, and shop smarter — all in one place.',
  },
  'about.html': {
    public: true,
    description: 'Learn the story behind My Car Concierge — the complete platform for vehicle owners. Get quotes, manage your ride, schedule service, and shop smarter.',
  },
  'how-it-works.html': {
    public: true,
    description: 'See how My Car Concierge works: post your auto need, vetted providers compete with quotes, you choose the best price and book in minutes.',
  },
  'for-shops.html': {
    public: true,
    description: 'Grow your auto repair shop with My Car Concierge. Get qualified leads, run a loyalty club, accept payments, and manage your team — no monthly fee to get started.',
  },
  'fleet-landing.html': {
    public: true,
    description: 'Fleet management made simple. Track every vehicle, manage drivers, schedule maintenance, and control spend across your entire fleet from one dashboard.',
  },
  'founders.html': {
    public: true,
    description: 'Meet the founding members of My Car Concierge — vehicle owners who get lifetime perks, founder pricing, and direct access to the team building the platform.',
  },
  'founding-provider-chris-agrapidis.html': {
    public: true,
    description: 'Meet Chris Agrapidis — a founding provider on My Car Concierge — and the auto-care services his team offers through the platform.',
  },
  'members.html': {
    public: true,
    description: 'My Car Concierge for vehicle owners: get quotes, manage vehicles, schedule maintenance, and shop smarter from one app.',
  },
  'providers.html': {
    public: true,
    description: 'Become a vetted provider on My Car Concierge. Win more jobs, manage your team, and grow your business through our marketplace.',
  },
  'providers-directory.html': {
    public: true,
    description: 'Browse vetted automotive service providers in our directory. Compare ratings, services, and shop profiles before you book.',
  },
  'provider-info.html': {
    public: true,
    description: 'Everything you need to know about joining My Car Concierge as a provider — onboarding, payouts, ratings, and team tools.',
  },
  'provider-pilot.html': {
    public: true,
    description: 'Join the My Car Concierge provider pilot program. Be among the first vetted shops on the platform with founding-provider perks.',
  },
  'provider-faq.html': {
    public: true,
    description: 'Answers to common provider questions about My Car Concierge: bidding, payouts, background checks, ratings, and team management.',
  },
  'provider-tips.html': {
    public: true,
    description: 'Pro tips for service providers on My Car Concierge: how to write winning bids, build your reputation, and grow repeat business.',
  },
  'developers.html': {
    public: true,
    description: 'Developer API for My Car Concierge: VIN lookup, recall data, OBD-II code lookup, and AI-powered vehicle price estimation.',
  },
  'car-club-member.html': {
    public: true,
    description: 'Join your favorite shop\'s Car Club on My Car Concierge. Punch-card rewards, member-only pricing, and exclusive perks from the providers you trust.',
  },
  'car-club-provider.html': {
    public: true,
    description: 'Launch a Car Club for your shop on My Car Concierge. Run a loyalty program with punch-card rewards and turn one-time customers into regulars.',
  },
  'contact.html': {
    public: true,
    description: 'Get in touch with My Car Concierge. We\'re here to help vehicle owners and service providers get the most out of the platform.',
  },
  'faq.html': {
    public: true,
    description: 'Frequently asked questions about My Car Concierge: how it works, pricing, provider vetting, payments, and account management.',
  },
  'shop.html': {
    public: true,
    description: 'Shop My Car Concierge merch. Premium auto-themed apparel and accessories for the people who actually love their car.',
  },
  'rideshare.html': {
    public: true,
    description: 'My Car Concierge for rideshare drivers: tools to keep your vehicle running, find qualified mechanics, and protect your earnings on the road.',
  },
  'service-credits.html': {
    public: true,
    description: 'Buy and use service credits on My Car Concierge. Pre-pay for vehicle maintenance and unlock founding-member pricing.',
  },
  'MCC-Service-Credits.html': {
    public: true,
    description: 'My Car Concierge service credits: pre-pay for auto maintenance and lock in founder pricing on services you\'ll need anyway.',
  },
  'signup-member.html': {
    public: true,
    description: 'Sign up for My Car Concierge and start getting quotes from vetted auto service providers in your area. Free to join.',
  },
  'signup-provider.html': {
    public: true,
    description: 'Apply to become a vetted provider on My Car Concierge. Background-checked professionals only — start winning more jobs today.',
  },
  'signup-loyal-customer.html': {
    public: true,
    description: 'Join the My Car Concierge loyalty program through your favorite local shop and start earning rewards on every visit.',
  },
  'login.html': {
    public: true,
    description: 'Sign in to My Car Concierge. Manage your vehicles, bids, appointments, and providers from one secure account.',
  },
  'job-board.html': {
    public: true,
    description: 'Live job board on My Car Concierge — see open auto-service jobs in your area and bid to win the work.',
  },
  'trust-safety.html': {
    public: true,
    description: 'Trust and safety on My Car Concierge: provider background checks, insurance verification, secure payments, and dispute resolution.',
  },
  'background-check-disclosure.html': {
    public: true,
    description: 'Background check disclosure for My Car Concierge providers and team members.',
  },
  'data-rights.html': {
    public: true,
    description: 'Your data rights on My Car Concierge. Request, export, or delete your personal data at any time.',
  },
  'privacy.html': {
    public: true,
    description: 'My Car Concierge privacy policy. How we collect, use, and protect your personal and vehicle data.',
  },
  'terms.html': {
    public: true,
    description: 'My Car Concierge terms of service. The rules of the road for using our platform.',
  },
  'sms-consent.html': {
    public: true,
    description: 'SMS consent and messaging policy for My Car Concierge text-message notifications.',
  },
  'contractor-agreement.html': {
    public: true,
    description: 'Independent contractor agreement for service providers on the My Car Concierge platform.',
  },
  'designer-agreement.html': {
    public: true,
    description: 'Designer collaboration agreement for partners working on My Car Concierge merchandise and brand assets.',
  },
  'founding-partner-agreement.html': {
    public: true,
    description: 'Founding partner agreement outlining lifetime benefits and terms for early supporters of My Car Concierge.',
  },
  'provider-agreement.html': {
    public: true,
    description: 'Service provider agreement governing the relationship between vetted providers and the My Car Concierge platform.',
  },
  'member-founder-agreement.html': {
    public: true,
    description: 'Member founder agreement detailing lifetime perks and terms for founding members of My Car Concierge.',
  },
  'member-founder.html': {
    public: true,
    description: 'Become a Member Founder of My Car Concierge. Lifetime perks, founder pricing, and a direct line to the team building the platform.',
  },
  'member-founder-deck.html': {
    public: true,
    description: 'The Member Founder program for My Car Concierge — what you get, what it costs, and why it\'s worth it.',
  },

  // ============== PRIVATE / NOINDEX ==============
  // App shells, auth flows, admin tools, internal docs, sales decks
  'admin.html':                                  { public: false },
  'admin-invite.html':                           { public: false },
  'generate-admin-hash.html':                    { public: false },
  'founder-dashboard.html':                      { public: false },
  'accept-invite.html':                          { public: false },
  'check-in.html':                               { public: false },
  'email-template.html':                         { public: false },
  'forgot-password.html':                        { public: false },
  'reset-password.html':                         { public: false },
  'onboarding-member.html':                      { public: false },
  'onboarding-provider.html':                    { public: false },
  'p.html':                                      { public: false },
  'split-pay.html':                              { public: false },
  'signed-agreements.html':                      { public: false },
  'survey.html':                                 { public: false },
  'fleet.html':                                  { public: false }, // app shell, fleet-landing.html is the marketing page
  'fleet-driver.html':                           { public: false },
  'fleet-join.html':                             { public: false },
  'fleet-signup.html':                           { public: false },
  'iOS_App_Store_Submission_Guide.html':         { public: false },
  'My_Car_Concierge_Complete_Outline.html':     { public: false },
  'ad-deck.html':                                { public: false },
  'MCC-Brand-Assets.html':                       { public: false },
  'MCC-Brand-Assets-ES.html':                    { public: false },
  'MCC-Provider-Brochure.html':                  { public: false },
  'MCC-Provider-Brochure-V2.html':               { public: false },
  'MCC-Provider-Presentation.html':              { public: false },
  'MCC-Provider-Presentation-Visual.html':       { public: false },
  'MCC-Provider-Presentation-Visual-ES.html':    { public: false },
  'MCC-Services-Proposal.html':                  { public: false },
};

// ----- helpers -----
function extractTitle(html) {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  return m ? m[1].trim() : null;
}
function extractMetaDescription(html) {
  // Backreference matches the same quote style and lets the value contain the OTHER quote (e.g. apostrophes inside double-quoted attrs).
  const m = html.match(/<meta\s+name=["']description["']\s+content=(["'])([\s\S]*?)\1/i);
  return m ? m[2].trim() : null;
}
function extractFirstH1(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? m[1].replaceAll(/<[^>]+>/g, '').trim() : null;
}
function extractFirstParagraph(html) {
  // First <p> that isn't empty and isn't inside a <header>/<nav>; simple heuristic: pick any <p> with > 80 chars of text.
  const matches = html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
  for (const m of matches) {
    const text = m[1].replaceAll(/<[^>]+>/g, '').trim();
    if (text.length >= 80) return text.length > 200 ? text.slice(0, 197) + '...' : text;
  }
  return null;
}
function escapeAttr(s) {
  return String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function buildBlock({ url, title, description, isPublic }) {
  const robots = isPublic ? 'index, follow, max-image-preview:large' : 'noindex, nofollow';
  const lines = [
    MARKER_OPEN,
    `  <link rel="canonical" href="${escapeAttr(url)}" />`,
    `  <meta name="robots" content="${robots}" />`,
  ];
  if (description) {
    lines.push(`  <meta name="description" content="${escapeAttr(description)}" />`);
  }
  if (isPublic) {
    lines.push(
      `  <meta property="og:type" content="website" />`,
      `  <meta property="og:site_name" content="${escapeAttr(SITE_NAME)}" />`,
      `  <meta property="og:url" content="${escapeAttr(url)}" />`,
      `  <meta property="og:title" content="${escapeAttr(title)}" />`,
      `  <meta property="og:description" content="${escapeAttr(description || '')}" />`,
      `  <meta property="og:image" content="${escapeAttr(OG_IMAGE)}" />`,
      `  <meta property="og:image:width" content="1200" />`,
      `  <meta property="og:image:height" content="630" />`,
      `  <meta property="og:image:alt" content="My Car Concierge — Your complete auto ownership platform" />`,
      `  <meta property="og:locale" content="en_US" />`,
      `  <meta name="twitter:card" content="summary_large_image" />`,
      `  <meta name="twitter:site" content="${TWITTER}" />`,
      `  <meta name="twitter:title" content="${escapeAttr(title)}" />`,
      `  <meta name="twitter:description" content="${escapeAttr(description || '')}" />`,
      `  <meta name="twitter:image" content="${escapeAttr(OG_IMAGE)}" />`,
    );
  }
  lines.push(MARKER_CLOSE);
  return lines.join('\n');
}

function injectIntoHead(html, block) {
  // If a previous SEO-INJECT block exists, replace it
  const re = new RegExp(`${MARKER_OPEN}[\\s\\S]*?${MARKER_CLOSE}`, 'g');
  if (re.test(html)) {
    return html.replaceAll(re, block);
  }
  // Otherwise insert just before </head>
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${block}\n</head>`);
  }
  // No <head>? Prepend (defensive — every HTML page should have one).
  return block + '\n' + html;
}

// ----- main -----
const files = fs.readdirSync(WWW_DIR).filter(f => f.endsWith('.html'));
let publicCount = 0, privateCount = 0, unclassifiedCount = 0, skippedCount = 0;
const unclassified = [];

for (const file of files) {
  const filePath = path.join(WWW_DIR, file);
  const html = fs.readFileSync(filePath, 'utf8');

  const cfg = PAGES[file];
  if (!cfg) {
    // Auto-classify as PRIVATE noindex (safe default)
    unclassified.push(file);
    unclassifiedCount++;
  }

  const isPublic = cfg ? cfg.public : false;
  const url = `${SITE_URL}/${file === 'index.html' ? '' : file}`;
  const existingTitle = extractTitle(html) || cfg?.title || SITE_NAME;
  const existingDesc  = extractMetaDescription(html);
  const description   = existingDesc || cfg?.description || null;

  // For private pages with no title, don't bother with og: — just noindex
  const block = buildBlock({
    url,
    title: existingTitle,
    description,
    isPublic,
  });

  const next = injectIntoHead(html, block);
  if (next === html) {
    skippedCount++;
    continue;
  }
  fs.writeFileSync(filePath, next, 'utf8');
  if (isPublic) publicCount++; else privateCount++;
}

// ----- /blog/ — every file is PUBLIC, indexable, og:type=article -----
const BLOG_DIR = path.join(WWW_DIR, 'blog');
let blogCount = 0;
if (fs.existsSync(BLOG_DIR)) {
  const blogFiles = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.html'));
  for (const file of blogFiles) {
    const filePath = path.join(BLOG_DIR, file);
    const html = fs.readFileSync(filePath, 'utf8');
    const url = `${SITE_URL}/blog/${file === 'index.html' ? '' : file}`;
    // Title: prefer <title>, fall back to first <h1>, then site name.
    const title = extractTitle(html) || extractFirstH1(html) || SITE_NAME;
    // Description: prefer existing meta description, fall back to first real <p>.
    const description = extractMetaDescription(html) || extractFirstParagraph(html);
    // If the file already carries a <meta name="description">, do not emit a duplicate;
    // og:/twitter: descriptions still get the extracted value.
    const hadOriginalMetaDescription = /<meta\s+name=["']description["']/i.test(html);
    // Blog posts use og:type=article; the listing page uses og:type=website
    const isListing = file === 'index.html';
    const ogType = isListing ? 'website' : 'article';
    const block = [
      MARKER_OPEN,
      `  <link rel="canonical" href="${escapeAttr(url)}" />`,
      `  <meta name="robots" content="index, follow, max-image-preview:large" />`,
      description && !hadOriginalMetaDescription ? `  <meta name="description" content="${escapeAttr(description)}" />` : null,
      `  <meta property="og:type" content="${ogType}" />`,
      `  <meta property="og:site_name" content="${escapeAttr(SITE_NAME)}" />`,
      `  <meta property="og:url" content="${escapeAttr(url)}" />`,
      `  <meta property="og:title" content="${escapeAttr(title)}" />`,
      description ? `  <meta property="og:description" content="${escapeAttr(description)}" />` : null,
      `  <meta property="og:image" content="${escapeAttr(OG_IMAGE)}" />`,
      `  <meta property="og:image:width" content="1200" />`,
      `  <meta property="og:image:height" content="630" />`,
      `  <meta property="og:image:alt" content="My Car Concierge — Your complete auto ownership platform" />`,
      `  <meta property="og:locale" content="en_US" />`,
      `  <meta name="twitter:card" content="summary_large_image" />`,
      `  <meta name="twitter:site" content="${TWITTER}" />`,
      `  <meta name="twitter:title" content="${escapeAttr(title)}" />`,
      description ? `  <meta name="twitter:description" content="${escapeAttr(description)}" />` : null,
      `  <meta name="twitter:image" content="${escapeAttr(OG_IMAGE)}" />`,
      MARKER_CLOSE,
    ].filter(Boolean).join('\n');
    const next = injectIntoHead(html, block);
    if (next !== html) {
      fs.writeFileSync(filePath, next, 'utf8');
      blogCount++;
    }
  }
}

console.log(`✓ Injected SEO into ${publicCount} public + ${privateCount} private pages (${skippedCount} unchanged)`);
console.log(`✓ Injected SEO into ${blogCount} blog pages`);
if (unclassified.length) {
  console.log(`⚠ Auto-classified as private (noindex): ${unclassified.join(', ')}`);
}
