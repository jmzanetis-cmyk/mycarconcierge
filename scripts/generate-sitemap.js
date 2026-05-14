#!/usr/bin/env node
/**
 * Generate www/sitemap.xml from the public pages declared in
 * scripts/inject-seo-meta.js. Run after editing PAGES classification:
 *
 *   node scripts/generate-sitemap.js
 *
 * The two scripts share their classification by importing the same module —
 * so adding a page to PAGES with public:true automatically includes it in
 * both the meta injection AND the sitemap on the next run.
 */

const fs   = require('node:fs');
const path = require('node:path');

const SITE_URL = 'https://www.mycarconcierge.com';
const WWW_DIR  = path.join(__dirname, '..', 'www');

// Re-derive PAGES by static-parsing inject-seo-meta.js so we don't have to
// require() it as a module (it has top-level side effects). Simpler approach:
// hardcode the public-page list here and keep it in sync. Or, parse the file.
//
// We take the cleanest route: read the inject script, evaluate just the PAGES
// constant in a fresh sandbox.
const injectSrc = fs.readFileSync(path.join(__dirname, 'inject-seo-meta.js'), 'utf8');
const pagesMatch = injectSrc.match(/const PAGES = ({[\s\S]*?^};)/m);
if (!pagesMatch) {
  console.error('ERROR: could not parse PAGES from inject-seo-meta.js');
  process.exit(1);
}
 
const PAGES = eval('(' + pagesMatch[1].replace(/;\s*$/, '') + ')');

const publicFiles = Object.entries(PAGES)
  .filter(([, cfg]) => cfg.public === true)
  .map(([file]) => file);

// Verify each declared public file actually exists on disk (catch typos)
const missing = publicFiles.filter(f => !fs.existsSync(path.join(WWW_DIR, f)));
if (missing.length) {
  console.warn(`⚠ Declared public but not on disk: ${missing.join(', ')}`);
}
const valid = publicFiles.filter(f => fs.existsSync(path.join(WWW_DIR, f)));

// Priority + changefreq policy
function priorityFor(file) {
  if (file === 'index.html') return '1.0';
  if (['how-it-works.html','for-shops.html','members.html','providers.html','about.html'].includes(file)) return '0.9';
  if (file.startsWith('signup-') || file === 'login.html') return '0.7';
  if (['privacy.html','terms.html','sms-consent.html','data-rights.html','contractor-agreement.html','designer-agreement.html','founding-partner-agreement.html','provider-agreement.html','member-founder-agreement.html','background-check-disclosure.html'].includes(file)) return '0.3';
  return '0.6';
}
function changefreqFor(file) {
  if (file === 'index.html') return 'daily';
  if (file === 'job-board.html' || file === 'providers-directory.html') return 'daily';
  if (file === 'shop.html' || file === 'faq.html') return 'weekly';
  return 'monthly';
}

const today = new Date().toISOString().slice(0, 10);
const urls = valid.map(file => {
  const loc = `${SITE_URL}/${file === 'index.html' ? '' : file}`;
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreqFor(file)}</changefreq>
    <priority>${priorityFor(file)}</priority>
  </url>`;
}).join('\n');

// ----- /blog/ — listing (0.8 weekly), every post (0.6 monthly) -----
const BLOG_DIR = path.join(WWW_DIR, 'blog');
let blogUrls = '';
let blogCount = 0;
if (fs.existsSync(BLOG_DIR)) {
  const blogFiles = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.html'));
  blogCount = blogFiles.length;
  blogUrls = '\n' + blogFiles.map(file => {
    const loc = `${SITE_URL}/blog/${file === 'index.html' ? '' : file}`;
    const isListing = file === 'index.html';
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${isListing ? 'weekly' : 'monthly'}</changefreq>
    <priority>${isListing ? '0.8' : '0.6'}</priority>
  </url>`;
  }).join('\n');
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}${blogUrls}
</urlset>
`;

const outPath = path.join(WWW_DIR, 'sitemap.xml');
fs.writeFileSync(outPath, xml, 'utf8');
console.log(`✓ Wrote ${valid.length} core + ${blogCount} blog URLs to www/sitemap.xml`);
