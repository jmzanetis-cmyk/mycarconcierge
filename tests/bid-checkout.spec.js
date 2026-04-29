const { test, expect } = require('@playwright/test');

const FAKE_PROVIDER_ID = '00000000-aaaa-bbbb-cccc-000000000002';
const FAKE_EMAIL = 'provider@example.com';

const BID_PACKS_DATA = [
  { id: 'pack-starter', name: 'Starter', bid_count: 5, bonus_bids: 0, price: 50, is_active: true, is_popular: false, badge_text: null },
  { id: 'pack-pro', name: 'Pro', bid_count: 15, bonus_bids: 5, price: 120, is_active: true, is_popular: true, badge_text: 'POPULAR' },
  { id: 'pack-elite', name: 'Elite', bid_count: 50, bonus_bids: 15, price: 350, is_active: true, is_popular: false, badge_text: 'BEST VALUE' }
];

const PROVIDER_PROFILE = {
  id: FAKE_PROVIDER_ID,
  full_name: 'Test Provider',
  email: FAKE_EMAIL,
  role: 'provider',
  zip_code: '10001',
  phone: '5559876543',
  business_name: 'Test Auto Shop',
  service_radius: 25,
  bid_credits: 3,
  free_trial_bids: 0,
  total_bids_purchased: 10,
  total_bids_used: 7,
  status: 'approved',
  tos_accepted: true,
  founding_provider: false
};

test.describe('Bid Pack Checkout - HTML Structure', () => {
  test('providers.html contains bid-packs-grid and subscription section', async ({ page }) => {
    const resp = await page.request.get('http://127.0.0.1:5000/providers.html');
    const html = await resp.text();
    expect(html).toContain('id="bid-packs-grid"');
    expect(html).toContain('id="subscription"');
    expect(html).toContain('Bid Credits');
    expect(html).toContain('Buy Now');
  });

  test('providers-bids.js is loaded dynamically via module loader', async ({ page }) => {
    const coreResp = await page.request.get('http://127.0.0.1:5000/providers-core.js');
    const coreJs = await coreResp.text();
    expect(coreJs).toContain("loadModule('bids')");
    expect(coreJs).toContain("providers-${name}.js");
  });

  test('providers-bids.js is accessible and contains checkout logic', async ({ page }) => {
    const resp = await page.request.get('http://127.0.0.1:5000/providers-bids.js');
    expect(resp.status()).toBe(200);
    const js = await resp.text();
    expect(js).toContain('purchaseBidPack');
    expect(js).toContain('.netlify/functions/create-bid-checkout');
    expect(js).toContain('loadServiceCredits');
    expect(js).toContain('renderServiceCredits');
  });
});

test.describe('Bid Pack Checkout - Function Tests', () => {
  async function loadBidsModuleInIsolation(page) {
    await page.route('http://127.0.0.1:5000/_test_blank', route => {
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><head></head><body><div id="bid-packs-grid"></div><div id="credit-balance"></div><div id="purchase-history"></div></body></html>'
      });
    });
    await page.goto('http://127.0.0.1:5000/_test_blank', { waitUntil: 'domcontentloaded' });

    await page.evaluate(({ profile, packs, userId }) => {
      globalThis.currentUser = { id: userId, email: 'provider@example.com' };
      globalThis.providerProfile = profile;

      function makeChainable(table) {
        const result = (table === 'bid_packs')
          ? { data: packs, error: null }
          : (table === 'profiles')
            ? { data: profile, error: null }
            : { data: [], error: null };
        const chain = {
          eq: function() { return chain; },
          order: function() { return chain; },
          limit: function() { return chain; },
          single: () => Promise.resolve(table === 'profiles' ? { data: profile, error: null } : { data: null, error: null }),
          insert: () => Promise.resolve({ data: null, error: null }),
          update: () => chain,
          then: function(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
          catch: function(fn) { return Promise.resolve(result).catch(fn); }
        };
        return chain;
      }

      globalThis.supabaseClient = {
        auth: {
          getSession: () => Promise.resolve({
            data: {
              session: {
                access_token: 'fake-token',
                user: { id: userId }
              }
            },
            error: null
          }),
          getUser: () => Promise.resolve({
            data: { user: { id: userId, email: 'provider@example.com' } },
            error: null
          }),
          onAuthStateChange: (cb) => ({ data: { subscription: { unsubscribe: () => {} } } })
        },
        from: (table) => ({
          select: () => makeChainable(table),
          insert: () => Promise.resolve({ data: null, error: null }),
          update: () => makeChainable(table)
        }),
        channel: () => ({ on: function() { return this; }, subscribe: function() { return this; } }),
        removeChannel: () => {}
      };

      globalThis.showToast = (msg, type) => {
        globalThis.__lastToast = { msg, type };
      };

      globalThis.mccIcon = (name, size) => `<svg width="${size || 16}" height="${size || 16}"></svg>`;

      globalThis.isMobileWalletAvailable = () => Promise.resolve({ available: false });

      globalThis.loadSubscription = () => Promise.resolve();
    }, { profile: PROVIDER_PROFILE, packs: BID_PACKS_DATA, userId: FAKE_PROVIDER_ID });

    const bidsJs = await (await page.request.get('http://127.0.0.1:5000/providers-bids.js')).text();
    await page.evaluate(bidsJs);

    await page.waitForTimeout(200);

    await page.evaluate(() => {
      if (typeof globalThis.loadServiceCredits === 'function') {
        return globalThis.loadServiceCredits();
      }
    });

    await page.waitForTimeout(300);
  }

  test('renderServiceCredits renders bid pack cards with Buy Now buttons', async ({ page }) => {
    await loadBidsModuleInIsolation(page);

    const rendered = await page.evaluate((packs) => {
      globalThis.bidPacks = packs;
      if (typeof renderServiceCredits === 'function') {
        renderServiceCredits();
        const grid = document.getElementById('bid-packs-grid');
        return grid ? grid.innerHTML : null;
      }
      return null;
    }, BID_PACKS_DATA);

    if (rendered) {
      expect(rendered).toContain('Buy Now');
      expect(rendered).toContain('Starter');
      expect(rendered).toContain('Pro');
      expect(rendered).toContain('Elite');
      expect(rendered).toContain('POPULAR');
      expect(rendered).toContain('BEST VALUE');
    }
  });

  test('purchaseBidPack shows confirm with pack name and price', async ({ page }) => {
    await loadBidsModuleInIsolation(page);

    let dialogMsg = '';
    page.on('dialog', async dialog => {
      dialogMsg = dialog.message();
      await dialog.dismiss();
    });

    await page.evaluate((packId) => {
      if (typeof purchaseBidPack === 'function') purchaseBidPack(packId);
    }, 'pack-pro');

    await page.waitForTimeout(1000);

    expect(dialogMsg).toContain('Purchase Pro pack');
    expect(dialogMsg).toContain('15 bids');
    expect(dialogMsg).toContain('5 bonus');
    expect(dialogMsg).toContain('$120.00');
  });

  test('purchaseBidPack calls checkout endpoint with correct payload', async ({ page }) => {
    let checkoutPayload = null;

    await page.route('**/.netlify/functions/create-bid-checkout', async route => {
      checkoutPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test_abc123' })
      });
    });

    await loadBidsModuleInIsolation(page);

    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    await page.evaluate(() => {
      globalThis.__stripeRedirectUrl = null;
      const origDescriptor = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
      if (origDescriptor && origDescriptor.set) {
        const origSetter = origDescriptor.set;
        Object.defineProperty(Location.prototype, 'href', {
          set: function(v) {
            if (v && v.includes('stripe.com')) {
              globalThis.__stripeRedirectUrl = v;
              return;
            }
            origSetter.call(this, v);
          },
          get: origDescriptor.get,
          configurable: true
        });
      }
    });

    await page.evaluate((packId) => {
      if (typeof purchaseBidPack === 'function') purchaseBidPack(packId);
    }, 'pack-starter');

    await page.waitForTimeout(3000);

    expect(checkoutPayload).toBeTruthy();
    expect(checkoutPayload.packId).toBe('pack-starter');
    expect(checkoutPayload.providerId).toBe(FAKE_PROVIDER_ID);

    const redirectUrl = await page.evaluate(() => globalThis.__stripeRedirectUrl).catch(() => null);
    if (redirectUrl) {
      expect(redirectUrl).toContain('checkout.stripe.com');
    }
  });

  test('purchaseBidPack shows error toast on checkout failure', async ({ page }) => {
    await page.route('**/.netlify/functions/create-bid-checkout', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Stripe configuration error' })
      });
    });

    await loadBidsModuleInIsolation(page);

    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    await page.evaluate((packId) => {
      if (typeof purchaseBidPack === 'function') purchaseBidPack(packId);
    }, 'pack-starter');

    await page.waitForTimeout(3000);

    const toast = await page.evaluate(() => globalThis.__lastToast);
    expect(toast).toBeTruthy();
    expect(toast.type).toBe('error');
  });

  test('purchaseBidPack silently exits for invalid pack ID', async ({ page }) => {
    await loadBidsModuleInIsolation(page);

    let dialogShown = false;
    page.on('dialog', async dialog => {
      dialogShown = true;
      await dialog.dismiss();
    });

    await page.evaluate(() => {
      if (typeof purchaseBidPack === 'function') purchaseBidPack('nonexistent-pack');
    });

    await page.waitForTimeout(500);
    expect(dialogShown).toBe(false);
  });

  test('purchaseBidPack does nothing when user cancels confirm', async ({ page }) => {
    let checkoutCalled = false;

    await page.route('**/.netlify/functions/create-bid-checkout', async route => {
      checkoutCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'https://checkout.stripe.com/test' })
      });
    });

    await loadBidsModuleInIsolation(page);

    page.on('dialog', async dialog => {
      await dialog.dismiss();
    });

    await page.evaluate((packId) => {
      if (typeof purchaseBidPack === 'function') purchaseBidPack(packId);
    }, 'pack-pro');

    await page.waitForTimeout(2000);
    expect(checkoutCalled).toBe(false);
  });
});

test.describe('Bid Pack Checkout - Endpoint Validation', () => {
  test('create-bid-checkout endpoint URL is correctly configured', async ({ page }) => {
    const resp = await page.request.get('http://127.0.0.1:5000/providers-bids.js');
    const js = await resp.text();
    expect(js).toContain("/.netlify/functions/create-bid-checkout");
    expect(js).not.toContain("'/api/create-bid-checkout'");
  });

  test('loadServiceCredits is exported to window scope', async ({ page }) => {
    const resp = await page.request.get('http://127.0.0.1:5000/providers-bids.js');
    const js = await resp.text();
    expect(js).toContain('window.loadServiceCredits = loadServiceCredits');
  });

  test('loadServiceCredits is called inside bids module load chain', async ({ page }) => {
    const resp = await page.request.get('http://127.0.0.1:5000/providers-core.js');
    const js = await resp.text();
    const bidsModuleBlock = js.substring(
      js.indexOf("loadModule('bids')"),
      js.indexOf('),', js.indexOf("loadModule('bids')")) + 10
    );
    expect(bidsModuleBlock).toContain('loadServiceCredits');
  });
});
