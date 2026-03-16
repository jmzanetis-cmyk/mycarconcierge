const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:5000';

test.describe('Live Smoke Tests', () => {
  test.describe.configure({ mode: 'serial' });

  test.describe('1 – All Public Pages Return 200', () => {
    const pages = [
      '/',
      '/about.html',
      '/contact.html',
      '/how-it-works.html',
      '/login.html',
      '/signup-member.html',
      '/signup-provider.html',
      '/provider-info.html',
      '/provider-faq.html',
      '/provider-tips.html',
      '/provider-pilot.html',
      '/faq.html',
      '/privacy.html',
      '/terms.html',
      '/trust-safety.html',
      '/rideshare.html',
      '/member-founder.html',
      '/member-founder-agreement.html',
      '/founding-partner-agreement.html',
      '/split-pay.html',
      '/forgot-password.html',
      '/reset-password.html',
      '/sms-consent.html',
      '/check-in.html',
      '/fleet.html',
      '/service-credits.html',
      '/accept-invite.html',
      '/members.html',
      '/providers.html',
      '/admin.html',
      '/founder-dashboard.html',
      '/signed-agreements.html',
      '/marketing/services.html',
      '/marketing/providers.html',
      '/marketing/about.html',
    ];

    for (const path of pages) {
      test(`${path} returns 200`, async ({ page }) => {
        const response = await page.goto(`${BASE}${path}`, { timeout: 30000, waitUntil: 'commit' });
        expect(response.status(), `${path} should return 200`).toBe(200);
      });
    }
  });

  test.describe('2 – All Script Tags Resolve (no missing JS files)', () => {
    const keyPages = [
      '/index.html',
      '/members.html',
      '/providers.html',
      '/admin.html',
      '/login.html',
      '/split-pay.html',
      '/signup-member.html',
      '/signup-provider.html',
    ];

    for (const path of keyPages) {
      test(`scripts on ${path} all return 200`, async ({ page }) => {
        const resp = await page.request.get(`${BASE}${path}`);
        const html = await resp.text();
        const scriptMatches = html.match(/<script[^>]+src=["']([^"']+)["']/g) || [];
        const srcs = scriptMatches.map(tag => {
          const m = tag.match(/src=["']([^"']+)["']/);
          return m ? m[1] : null;
        }).filter(Boolean);

        for (const src of srcs) {
          if (src.startsWith('http') && !src.includes('127.0.0.1') && !src.includes('localhost')) {
            continue;
          }
          const url = src.startsWith('/') ? `${BASE}${src}` : src.startsWith('http') ? src : `${BASE}/${src}`;
          const scriptResp = await page.request.get(url);
          expect(scriptResp.status(), `Script ${src} on ${path} should load`).toBe(200);
        }
      });
    }
  });

  test.describe('3 – Members Page Has All Required Scripts', () => {
    test('members.html includes all required script files', async ({ page }) => {
      const resp = await page.request.get(`${BASE}/members.html`);
      const html = await resp.text();
      const scriptMatches = html.match(/<script[^>]+src=["']([^"']+)["']/g) || [];
      const allSrcs = scriptMatches.map(tag => {
        const m = tag.match(/src=["']([^"']+)["']/);
        return m ? m[1] : '';
      }).join(' ');

      expect(allSrcs).toContain('members-core.js');
      expect(allSrcs).toContain('members-extras.js');
      expect(allSrcs).toContain('members-packages.js');
      expect(allSrcs).toContain('supabaseclient.js');
      expect(allSrcs).toContain('mcc-config.js');
      expect(allSrcs.toLowerCase()).toContain('emailservice.js');
      expect(allSrcs).toContain('stripeutils.js');
    });
  });

  test.describe('4 – Providers Page Has All Required Scripts', () => {
    test('providers.html includes all required script files', async ({ page }) => {
      const resp = await page.request.get(`${BASE}/providers.html`);
      const html = await resp.text();
      const scriptMatches = html.match(/<script[^>]+src=["']([^"']+)["']/g) || [];
      const allSrcs = scriptMatches.map(tag => {
        const m = tag.match(/src=["']([^"']+)["']/);
        return m ? m[1] : '';
      }).join(' ');

      expect(allSrcs).toContain('providers-core.js');
      expect(allSrcs).toContain('supabaseclient.js');
      expect(allSrcs).toContain('mcc-config.js');
      expect(allSrcs).toContain('providers-bids.js');
      expect(allSrcs).toContain('providers-jobs.js');
      expect(allSrcs).toContain('providers-analytics.js');
      expect(allSrcs.toLowerCase()).toContain('emailservice.js');
      expect(allSrcs).toContain('stripeutils.js');
      expect(allSrcs).toContain('tos-modal.js');
    });
  });

  test.describe('5 – OnClick Handlers Have Matching Functions', () => {
    const onclickPages = ['/index.html', '/login.html', '/about.html', '/contact.html'];

    for (const path of onclickPages) {
      test(`onclick handlers on ${path} have matching global functions`, async ({ page }) => {
        await page.goto(`${BASE}${path}`, { timeout: 30000, waitUntil: 'networkidle' });

        const jsKeywords = ['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'return', 'try', 'catch', 'throw', 'new', 'delete', 'typeof', 'void', 'this', 'var', 'let', 'const', 'function', 'class', 'import', 'export', 'default', 'from', 'await', 'async', 'yield', 'with', 'debugger', 'true', 'false', 'null', 'undefined', 'NaN', 'Infinity', 'event', 'document', 'window', 'console', 'alert', 'confirm', 'prompt'];
        const onclickHandlers = await page.$$eval('[onclick]', els =>
          els.map(el => {
            const onclick = el.getAttribute('onclick');
            const match = onclick.match(/^(\w+)\s*\(/);
            return match ? match[1] : null;
          }).filter(Boolean)
        );

        const uniqueFunctions = [...new Set(onclickHandlers)].filter(fn => !jsKeywords.includes(fn));
        for (const fnName of uniqueFunctions) {
          const exists = await page.evaluate(fn => typeof window[fn] === 'function', fnName);
          expect(exists, `Function ${fnName}() should be globally available on ${path}`).toBe(true);
        }
      });
    }
  });

  test.describe('6 – Internal Links Don\'t 404', () => {
    const linkPages = ['/index.html', '/about.html', '/how-it-works.html', '/provider-info.html'];

    for (const path of linkPages) {
      test(`internal links on ${path} do not 404`, async ({ page }) => {
        await page.goto(`${BASE}${path}`, { timeout: 30000, waitUntil: 'domcontentloaded' });

        const links = await page.$$eval('a[href]', els =>
          els.map(el => el.getAttribute('href'))
            .filter(href =>
              href &&
              !href.startsWith('http') &&
              !href.startsWith('#') &&
              !href.startsWith('javascript:') &&
              !href.startsWith('mailto:') &&
              !href.startsWith('tel:')
            )
        );

        const uniqueLinks = [...new Set(links)];
        for (const link of uniqueLinks) {
          const url = link.startsWith('/') ? `${BASE}${link}` : `${BASE}/${link}`;
          const resp = await page.request.get(url);
          expect(resp.status(), `Link ${link} from ${path} should not 404`).not.toBe(404);
        }
      });
    }
  });

  test.describe('7 – CSS Files Load', () => {
    const cssPages = ['/index.html', '/members.html', '/providers.html'];

    for (const path of cssPages) {
      test(`CSS stylesheets on ${path} all return 200`, async ({ page }) => {
        const resp = await page.request.get(`${BASE}${path}`);
        const html = await resp.text();
        const linkMatches = html.match(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/g) || [];
        const hrefs = linkMatches.map(tag => {
          const m = tag.match(/href=["']([^"']+)["']/);
          return m ? m[1] : null;
        }).filter(Boolean);

        for (const href of hrefs) {
          if (href.startsWith('http') && !href.includes('127.0.0.1') && !href.includes('localhost')) {
            continue;
          }
          const url = href.startsWith('/') ? `${BASE}${href}` : href.startsWith('http') ? href : `${BASE}/${href}`;
          const cssResp = await page.request.get(url);
          expect(cssResp.status(), `Stylesheet ${href} on ${path} should load`).toBe(200);
        }
      });
    }
  });
});
