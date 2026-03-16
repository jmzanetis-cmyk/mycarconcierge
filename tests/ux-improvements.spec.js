const { test, expect } = require('@playwright/test');
const BASE_URL = 'http://localhost:5000';

async function setupMinimalMocks(page) {
  await page.route('**/@supabase/supabase-js**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: `
      window.supabase = { createClient: function() { return {
        auth: { getSession: function() { return Promise.resolve({ data: { session: null }, error: null }); }, onAuthStateChange: function(cb) { return { data: { subscription: { unsubscribe: function() {} } } }; }, getUser: function() { return Promise.resolve({ data: { user: null }, error: null }); } },
        from: function() { var q = { select: function() { return q; }, eq: function() { return q; }, single: function() { return q; }, maybeSingle: function() { return q; }, order: function() { return q; }, limit: function() { return q; }, range: function() { return q; }, in: function() { return q; }, gt: function() { return q; }, gte: function() { return q; }, lt: function() { return q; }, lte: function() { return q; }, like: function() { return q; }, ilike: function() { return q; }, is: function() { return q; }, not: function() { return q; }, or: function() { return q; }, contains: function() { return q; }, filter: function() { return q; }, insert: function() { return q; }, update: function() { return q; }, delete: function() { return q; }, then: function(r) { r({ data: null, error: null }); return q; }, catch: function() { return q; } }; return q; },
        channel: function() { return { on: function() { return this; }, subscribe: function() { return this; } }; },
        removeChannel: function() {},
        rpc: function() { return Promise.resolve({ data: null, error: null }); },
        storage: { from: function() { return { upload: function() { return Promise.resolve({ data: null, error: null }); }, getPublicUrl: function() { return { data: { publicUrl: '' } }; } }; } },
        functions: { invoke: function() { return Promise.resolve({ data: null, error: null }); } }
      }; } };
    ` });
  });
  await page.route('**/js.stripe.com/**', route => route.abort());
  await page.route('**/cdnjs.cloudflare.com/**', route => route.abort());
  await page.route('**/fonts.googleapis.com/**', route => route.abort());
  await page.route('**/fonts.gstatic.com/**', route => route.abort());
  await page.route('**/cdn.jsdelivr.net/**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
}

async function gotoWithMocks(page, path) {
  await setupMinimalMocks(page);
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
}

async function gotoWithUtils(page, path) {
  await setupMinimalMocks(page);
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const hasUtils = await page.evaluate(() => typeof MCCUtils !== 'undefined');
  if (!hasUtils) {
    await page.addScriptTag({ url: '/utils.js' });
    await page.waitForTimeout(500);
  }
}

function getAllCSSText() {
  return `
    (function() {
      var css = '';
      for (var i = 0; i < document.styleSheets.length; i++) {
        try {
          var rules = document.styleSheets[i].cssRules || document.styleSheets[i].rules;
          if (rules) {
            for (var j = 0; j < rules.length; j++) {
              css += rules[j].cssText + '\\n';
            }
          }
        } catch(e) {}
      }
      var styleTags = document.querySelectorAll('style');
      for (var k = 0; k < styleTags.length; k++) {
        css += styleTags[k].textContent + '\\n';
      }
      return css;
    })()
  `;
}

test.describe('Accessibility - Skip to Content & ARIA', () => {
  test('Homepage has a skip-to-content link with correct href', async ({ page }) => {
    await gotoWithUtils(page, '/');
    await page.evaluate(() => MCCUtils.initAccessibility());
    await page.waitForTimeout(500);

    const skipLink = page.locator('.skip-to-content');
    await expect(skipLink).toBeAttached();
    await expect(skipLink).toHaveAttribute('href', '#main-content');
  });

  test('Main content areas have id="main-content" on key pages', async ({ page }) => {
    await gotoWithUtils(page, '/');
    await page.evaluate(() => MCCUtils.initAccessibility());
    await page.waitForTimeout(500);

    const mainContentIndex = page.locator('#main-content');
    expect(await mainContentIndex.count()).toBeGreaterThan(0);

    await gotoWithUtils(page, '/login.html');
    await page.evaluate(() => MCCUtils.initAccessibility());
    await page.waitForTimeout(500);

    const mainContentLogin = page.locator('#main-content');
    expect(await mainContentLogin.count()).toBeGreaterThan(0);
  });

  test('Toast notifications have proper ARIA roles', async ({ page }) => {
    await gotoWithUtils(page, '/');

    const errorRole = await page.evaluate(() => {
      const toast = MCCUtils.showToast('Error message', 'error');
      return toast.getAttribute('role');
    });
    expect(errorRole).toBe('alert');

    const infoRole = await page.evaluate(() => {
      const toast = MCCUtils.showToast('Info message', 'info');
      return toast.getAttribute('role');
    });
    expect(infoRole).toBe('status');
  });

  test('Focus-visible styles are defined in CSS', async ({ page }) => {
    await gotoWithMocks(page, '/');

    const hasFocusVisible = await page.evaluate(getAllCSSText());
    expect(hasFocusVisible).toContain('focus-visible');
  });

  test('Screen reader utility class .sr-only exists in CSS', async ({ page }) => {
    await gotoWithMocks(page, '/');

    const cssText = await page.evaluate(getAllCSSText());
    expect(cssText).toContain('.sr-only');
  });
});

test.describe('Micro-interactions & Visual Feedback', () => {
  test('Button active state CSS exists with transform', async ({ page }) => {
    await gotoWithMocks(page, '/');

    const cssText = await page.evaluate(getAllCSSText());
    const hasBtnActive = cssText.includes('.btn:active') || cssText.includes('button:active');
    expect(hasBtnActive).toBe(true);
  });

  test('Error shake animation exists in CSS', async ({ page }) => {
    await gotoWithMocks(page, '/');

    const cssText = await page.evaluate(getAllCSSText());
    expect(cssText).toContain('errorShake');
  });

  test('Success pulse animation exists in CSS', async ({ page }) => {
    await gotoWithMocks(page, '/');

    const cssText = await page.evaluate(getAllCSSText());
    expect(cssText).toContain('successPulse');
  });

  test('Page fade-in animation exists in CSS with .page-enter class', async ({ page }) => {
    await gotoWithMocks(page, '/');

    const cssText = await page.evaluate(getAllCSSText());
    expect(cssText).toContain('pageFadeIn');
    expect(cssText).toContain('.page-enter');
  });
});

test.describe('Error Recovery', () => {
  test('MCCUtils.friendlyError maps error codes to human-readable messages', async ({ page }) => {
    await gotoWithUtils(page, '/');

    const results = await page.evaluate(() => {
      return {
        fetch: MCCUtils.friendlyError({ message: 'Failed to fetch' }),
        auth: MCCUtils.friendlyError({ status: 401 }),
        notFound: MCCUtils.friendlyError({ status: 404 }),
        rateLimit: MCCUtils.friendlyError({ status: 429 }),
        server: MCCUtils.friendlyError({ status: 500 }),
        unknown: MCCUtils.friendlyError('random error')
      };
    });

    expect(results.fetch).toContain('internet');
    expect(results.auth).toContain('session');
    expect(results.notFound).toContain('not found');
    expect(results.rateLimit).toContain('Too many');
    expect(results.server).toContain('servers');
    expect(results.unknown).toContain('unexpected');
  });

  test('MCCUtils.showErrorBanner creates visible error banner with dismiss button', async ({ page }) => {
    await gotoWithUtils(page, '/');

    await page.evaluate(() => {
      MCCUtils.initErrorRecovery();
      MCCUtils.showErrorBanner('Test error message');
    });
    await page.waitForTimeout(500);

    const banner = page.locator('.error-banner.visible');
    await expect(banner).toBeAttached();

    const dismissBtn = page.locator('.error-banner-dismiss');
    await expect(dismissBtn).toBeAttached();

    const message = page.locator('.error-banner-message');
    await expect(message).toContainText('Test error message');
  });

  test('Offline indicator element exists after initErrorRecovery', async ({ page }) => {
    await gotoWithUtils(page, '/');

    await page.evaluate(() => {
      MCCUtils.initErrorRecovery();
    });
    await page.waitForTimeout(500);

    const offlineIndicator = page.locator('.offline-indicator');
    await expect(offlineIndicator).toBeAttached();
  });

  test('Error banner has proper ARIA role="alert"', async ({ page }) => {
    await gotoWithUtils(page, '/');

    await page.evaluate(() => {
      MCCUtils.initErrorRecovery();
    });
    await page.waitForTimeout(500);

    const banner = page.locator('.error-banner');
    await expect(banner).toHaveAttribute('role', 'alert');
  });
});

test.describe('Onboarding Tooltips', () => {
  test('MCCUtils.startOnboardingTour function exists', async ({ page }) => {
    await gotoWithUtils(page, '/');

    const fnType = await page.evaluate(() => typeof MCCUtils.startOnboardingTour);
    expect(fnType).toBe('function');
  });

  test('Starting a tour creates overlay and tooltip elements', async ({ page }) => {
    await gotoWithUtils(page, '/');

    await page.evaluate(() => {
      MCCUtils.initAccessibility();
      MCCUtils.startOnboardingTour('test-tour', [
        { target: 'header', title: 'Welcome', text: 'This is a test tour step' },
        { target: 'nav', title: 'Navigation', text: 'This is navigation' }
      ]);
    });
    await page.waitForTimeout(500);

    const overlay = page.locator('.onboarding-overlay');
    await expect(overlay).toBeAttached();

    const tooltip = page.locator('.onboarding-tooltip');
    await expect(tooltip).toBeAttached();
  });

  test('Tour can be skipped and records completion in localStorage', async ({ page }) => {
    await gotoWithUtils(page, '/');

    await page.evaluate(() => {
      localStorage.removeItem('mcc_tour_skip-test');
      MCCUtils.initAccessibility();
      MCCUtils.startOnboardingTour('skip-test', [
        { target: 'header', title: 'Step 1', text: 'First step' }
      ]);
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      MCCUtils.endOnboardingTour('skip-test');
    });
    await page.waitForTimeout(300);

    const completed = await page.evaluate(() => localStorage.getItem('mcc_tour_skip-test'));
    expect(completed).toBe('completed');
  });
});

test.describe('Mobile UX', () => {
  test('Mobile bottom nav CSS is defined', async ({ page }) => {
    await gotoWithMocks(page, '/');

    const cssText = await page.evaluate(getAllCSSText());
    expect(cssText).toContain('.mobile-bottom-nav');
  });

  test('Touch target minimum sizes are enforced on mobile', async ({ page }) => {
    await gotoWithMocks(page, '/');

    const cssText = await page.evaluate(getAllCSSText());
    expect(cssText).toContain('min-height: 44px');
  });

  test('Input font-size is 16px on mobile to prevent iOS zoom', async ({ page }) => {
    await gotoWithMocks(page, '/');

    const cssText = await page.evaluate(getAllCSSText());
    const hasInputFontSize = cssText.includes('font-size: 16px');
    expect(hasInputFontSize).toBe(true);
  });

  test('Pull-to-refresh indicator CSS exists', async ({ page }) => {
    await gotoWithMocks(page, '/');

    const cssText = await page.evaluate(getAllCSSText());
    expect(cssText).toContain('.pull-refresh-indicator');
  });

  test('MCCUtils.initMobileBottomNav function exists', async ({ page }) => {
    await gotoWithUtils(page, '/');

    const fnType = await page.evaluate(() => typeof MCCUtils.initMobileBottomNav);
    expect(fnType).toBe('function');
  });
});

test.describe('Step Progress Indicators', () => {
  test('MCCUtils.createStepProgress function exists', async ({ page }) => {
    await gotoWithUtils(page, '/');

    const fnType = await page.evaluate(() => typeof MCCUtils.createStepProgress);
    expect(fnType).toBe('function');
  });

  test('Step progress creates proper HTML structure with circles and lines', async ({ page }) => {
    await gotoWithUtils(page, '/');

    await page.evaluate(() => {
      MCCUtils.initAccessibility();
      const container = document.createElement('div');
      container.id = 'test-step-progress';
      document.body.appendChild(container);
      MCCUtils.createStepProgress(container, ['Account', 'Vehicle', 'Confirm'], 2);
    });
    await page.waitForTimeout(500);

    const container = page.locator('#test-step-progress');
    await expect(container).toBeAttached();

    const circles = page.locator('#test-step-progress .step-progress-circle');
    expect(await circles.count()).toBe(3);

    const lines = page.locator('#test-step-progress .step-progress-line');
    expect(await lines.count()).toBe(2);

    const items = page.locator('#test-step-progress .step-progress-item');
    expect(await items.count()).toBe(3);
  });

  test('Step progress has ARIA progressbar role', async ({ page }) => {
    await gotoWithUtils(page, '/');

    await page.evaluate(() => {
      MCCUtils.initAccessibility();
      const container = document.createElement('div');
      container.id = 'test-aria-progress';
      document.body.appendChild(container);
      MCCUtils.createStepProgress(container, ['Step 1', 'Step 2', 'Step 3'], 1);
    });
    await page.waitForTimeout(500);

    const container = page.locator('#test-aria-progress');
    await expect(container).toHaveAttribute('role', 'progressbar');
    await expect(container).toHaveAttribute('aria-valuenow', '1');
    await expect(container).toHaveAttribute('aria-valuemax', '3');
  });
});
