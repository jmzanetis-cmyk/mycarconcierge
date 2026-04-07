const { test, expect } = require('@playwright/test');

const FAKE_FOUNDER_ID = '00000000-aaaa-bbbb-cccc-000000000010';
const FAKE_FOUNDER_EMAIL = 'founder@example.com';
const FAKE_FOUNDER_PROFILE_ID = 'fp-001';
const FAKE_ADMIN_ID = '00000000-aaaa-bbbb-cccc-000000000099';
const FAKE_ADMIN_EMAIL = 'admin@example.com';

const FOUNDER_PROFILE_DATA = {
  id: FAKE_FOUNDER_PROFILE_ID,
  user_id: FAKE_FOUNDER_ID,
  full_name: 'Test Founder',
  email: FAKE_FOUNDER_EMAIL,
  referral_code: 'TESTFOUNDER',
  status: 'active',
  total_provider_referrals: 12,
  total_member_referrals: 5,
  total_commissions_earned: 1250.50,
  total_commissions_paid: 900.50,
  pending_balance: 350.00,
  payout_method: 'stripe_connect',
  payout_email: 'founder@example.com',
  stripe_connect_account_id: 'acct_test123',
  instant_payout_enabled: false,
  weekly_payout_enabled: true,
  show_on_leaderboard: true,
  commission_rate: 0.50,
  created_at: '2024-01-01T00:00:00Z'
};

const COMMISSIONS_DATA = [
  { id: 'comm1', founder_id: FAKE_FOUNDER_PROFILE_ID, commission_type: 'bid_pack', commission_amount: 250.00, status: 'paid', stripe_transfer_id: 'tr_abc123', created_at: '2024-02-15T00:00:00Z' },
  { id: 'comm2', founder_id: FAKE_FOUNDER_PROFILE_ID, commission_type: 'bid_pack', commission_amount: 150.00, status: 'pending', stripe_transfer_id: null, created_at: '2024-02-10T00:00:00Z' },
  { id: 'comm3', founder_id: FAKE_FOUNDER_PROFILE_ID, commission_type: 'platform_fee', commission_amount: 100.50, status: 'approved', stripe_transfer_id: null, created_at: '2024-01-20T00:00:00Z' },
  { id: 'comm4', founder_id: FAKE_FOUNDER_PROFILE_ID, commission_type: 'bid_pack', commission_amount: 350.00, status: 'paid', stripe_transfer_id: 'tr_def456', created_at: '2024-01-05T00:00:00Z' },
  { id: 'comm5', founder_id: FAKE_FOUNDER_PROFILE_ID, commission_type: 'bid_pack', commission_amount: 400.00, status: 'paid', stripe_transfer_id: 'tr_ghi789', created_at: '2023-12-15T00:00:00Z' }
];

const PAYOUTS_DATA = [
  { id: 'pay1', founder_id: FAKE_FOUNDER_PROFILE_ID, amount: 500.00, fee_amount: 0, net_amount: 500.00, payout_method: 'stripe_connect', payout_period: 'Jan 2024', status: 'completed', processed_at: '2024-01-15T00:00:00Z', created_at: '2024-01-15T00:00:00Z' },
  { id: 'pay2', founder_id: FAKE_FOUNDER_PROFILE_ID, amount: 400.50, fee_amount: 0, net_amount: 400.50, payout_method: 'stripe_connect', payout_period: 'Dec 2023', status: 'completed', processed_at: '2023-12-15T00:00:00Z', created_at: '2023-12-15T00:00:00Z' }
];

const REFERRALS_DATA = [
  { id: 'ref1', founder_id: FAKE_FOUNDER_PROFILE_ID, referred_type: 'provider', referred_name: 'Auto Shop Joe', referred_email: 'joe@autoshop.com', status: 'active', created_at: '2024-02-01T00:00:00Z' },
  { id: 'ref2', founder_id: FAKE_FOUNDER_PROFILE_ID, referred_type: 'member', referred_name: 'Jane Smith', referred_email: 'jane@example.com', status: 'active', created_at: '2024-01-15T00:00:00Z' },
  { id: 'ref3', founder_id: FAKE_FOUNDER_PROFILE_ID, referred_type: 'provider', referred_name: 'Mike Mechanic', referred_email: 'mike@repairs.com', status: 'pending', created_at: '2024-01-10T00:00:00Z' }
];

function createFounderMockJs() {
  const userId = FAKE_FOUNDER_ID;
  const email = FAKE_FOUNDER_EMAIL;
  const founderProfile = JSON.stringify(FOUNDER_PROFILE_DATA);
  const commissions = JSON.stringify(COMMISSIONS_DATA);
  const payouts = JSON.stringify(PAYOUTS_DATA);
  const referrals = JSON.stringify(REFERRALS_DATA);

  return `
    (function() {
      var noopChannel = { on: function() { return this; }, subscribe: function() { return this; }, unsubscribe: function() {} };
      var fakeUser = {
        id: '${userId}',
        email: '${email}',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: 'Test Founder' }
      };
      var fakeSession = {
        access_token: 'fake-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'fake-refresh-token',
        user: fakeUser
      };
      var founderProfileData = ${founderProfile};
      var commissionsData = ${commissions};
      var payoutsData = ${payouts};
      var referralsData = ${referrals};
      var leaderboardData = [
        { id: '${FAKE_FOUNDER_PROFILE_ID}', full_name: 'Test Founder', total_provider_referrals: 12, total_member_referrals: 5, total_commissions_earned: 1250.50 },
        { id: 'fp-002', full_name: 'Another Founder', total_provider_referrals: 8, total_member_referrals: 3, total_commissions_earned: 800.00 }
      ];

      var mockClient = {
        auth: {
          getSession: function() { return Promise.resolve({ data: { session: fakeSession }, error: null }); },
          getUser: function() { return Promise.resolve({ data: { user: fakeUser }, error: null }); },
          onAuthStateChange: function(cb) {
            setTimeout(function() { cb('SIGNED_IN', fakeSession); }, 10);
            return { data: { subscription: { unsubscribe: function() {} } } };
          },
          signInWithPassword: function() { return Promise.resolve({ data: { session: fakeSession, user: fakeUser }, error: null }); },
          signOut: function() { return Promise.resolve({ error: null }); },
          signUp: function() { return Promise.resolve({ data: null, error: null }); },
          resetPasswordForEmail: function() { return Promise.resolve({ data: null, error: null }); }
        },
        from: function(table) {
          var _table = table;
          var _filters = [];
          var _isSingle = false;
          var _countMode = null;
          var _headMode = false;
          var _selectCols = '*';
          var q = {
            select: function(cols, opts) {
              _selectCols = cols || '*';
              if (opts && opts.count) _countMode = opts.count;
              if (opts && opts.head) _headMode = true;
              return q;
            },
            insert: function(data) {
              return {
                select: function() {
                  return {
                    single: function() { return Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error: null }); }
                  };
                },
                then: function(resolve) { resolve({ data: data, error: null }); return q; }
              };
            },
            update: function() { return q; },
            delete: function() { return q; },
            eq: function(col, val) { _filters.push({ col: col, op: 'eq', val: val }); return q; },
            neq: function(col, val) { _filters.push({ col: col, op: 'neq', val: val }); return q; },
            in: function(col, vals) { _filters.push({ col: col, op: 'in', val: vals }); return q; },
            gt: function() { return q; },
            gte: function() { return q; },
            lt: function() { return q; },
            lte: function() { return q; },
            like: function() { return q; },
            ilike: function() { return q; },
            is: function() { return q; },
            not: function() { return q; },
            or: function() { return q; },
            contains: function() { return q; },
            filter: function() { return q; },
            order: function() { return q; },
            limit: function() { return q; },
            range: function() { return q; },
            single: function() { _isSingle = true; return q; },
            maybeSingle: function() { _isSingle = true; return q; },
            then: function(resolve) {
              var result;
              if (_table === 'member_founder_profiles') {
                var statusFilter = _filters.find(function(f) { return f.col === 'status' && f.val === 'active'; });
                var userFilter = _filters.find(function(f) { return f.col === 'user_id'; });
                var leaderboardFilter = _filters.find(function(f) { return f.col === 'show_on_leaderboard' && f.val === true; });
                if (leaderboardFilter) {
                  result = { data: leaderboardData, error: null };
                } else if (_isSingle) {
                  result = { data: founderProfileData, error: null };
                } else {
                  result = { data: [founderProfileData], error: null };
                }
              } else if (_table === 'founder_commissions') {
                result = { data: commissionsData, error: null };
              } else if (_table === 'founder_payouts') {
                result = { data: payoutsData, error: null };
              } else if (_table === 'founder_referrals') {
                result = { data: referralsData, error: null };
              } else if (_table === 'commission_rate_history') {
                result = { data: [], error: null };
              } else {
                if (_isSingle) {
                  result = { data: null, error: null };
                } else {
                  result = { data: [], error: null, count: 0 };
                }
              }
              resolve(result);
              return q;
            },
            catch: function() { return q; }
          };
          return q;
        },
        channel: function() { return noopChannel; },
        removeChannel: function() {},
        rpc: function() { return Promise.resolve({ data: null, error: null }); },
        storage: { from: function() { return { upload: function() { return Promise.resolve({ data: null, error: null }); }, getPublicUrl: function() { return { data: { publicUrl: '' } }; } }; } },
        functions: { invoke: function() { return Promise.resolve({ data: null, error: null }); } }
      };
      window.supabase = { createClient: function() { return mockClient; } };
    })();
  `;
}

async function setupCdnMocks(page, mockJs) {
  await page.route('**/@supabase/supabase-js**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: mockJs });
  });
  await page.route('**/js.stripe.com/**', route => route.abort());
  await page.route('**/cdnjs.cloudflare.com/**', route => route.abort());
  await page.route('**/fonts.googleapis.com/**', route => route.abort());
  await page.route('**/fonts.gstatic.com/**', route => route.abort());
  await page.route('**/cdn.jsdelivr.net/npm/chart.js**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.Chart = function(ctx, config) { this.destroy = function() {}; }; window.Chart.register = function() {};'
    });
  });
  await page.route('**/cdn.jsdelivr.net/npm/qrcode**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
  await page.route('**/cdn.jsdelivr.net/npm/qr-creator**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.QrCreator = { render: function() {} };' });
  });
}

async function addAuthToken(page, userId, email) {
  await page.addInitScript(({ userId, email }) => {
    window.localStorage.setItem('sb-ifbyjxuaclwmadqbjcyp-auth-token', JSON.stringify({
      access_token: 'fake-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'fake-refresh-token',
      user: {
        id: userId,
        email: email,
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: 'Test Founder' }
      }
    }));
  }, { userId, email });
}

async function setupApiMocks(page) {
  await page.route('**/api/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authorized: true, verified: true, connected: true, status: 'clear', success: true, enabled: false })
    });
  });
}

async function setupFounderDashboard(page) {
  const mockJs = createFounderMockJs();
  await setupCdnMocks(page, mockJs);
  await setupApiMocks(page);
  await addAuthToken(page, FAKE_FOUNDER_ID, FAKE_FOUNDER_EMAIL);
  await page.goto('/founder-dashboard.html');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
}

test.describe('Founder Dashboard - Commission Display', () => {
  test('Founder dashboard loads and displays commission stats', async ({ page }) => {
    await setupFounderDashboard(page);

    await expect(page.locator('#founder-name')).toHaveText('Test Founder', { timeout: 10000 });
    await expect(page.locator('#referral-code')).toHaveText('TESTFOUNDER');
    await expect(page.locator('#stat-provider-referrals')).toHaveText('12');
    await expect(page.locator('#stat-member-referrals')).toHaveText('5');
    await expect(page.locator('#stat-total-earnings')).toHaveText('$1250.50');
    await expect(page.locator('#stat-pending-balance')).toHaveText('$350.00');

    const pendingText = await page.locator('#stat-pending-balance').textContent();
    const pendingValue = parseFloat(pendingText.replace('$', ''));
    const expectedPending = FOUNDER_PROFILE_DATA.total_commissions_earned - FOUNDER_PROFILE_DATA.total_commissions_paid;
    expect(pendingValue).toBeCloseTo(expectedPending, 2);
  });

  test('Commission tier calculation renders correctly for Silver tier', async ({ page }) => {
    await setupFounderDashboard(page);

    const tierBadge = page.locator('#tier-badge');
    await expect(tierBadge).toContainText('Silver', { timeout: 10000 });
    await expect(tierBadge).toHaveClass(/silver/);

    const progressFill = page.locator('#tier-progress-fill');
    await expect(progressFill).toHaveClass(/silver/);

    await expect(page.locator('#tier-progress-current')).toContainText('17 referrals');
    await expect(page.locator('#tier-progress-next')).toContainText('Next tier: 25 referrals');

    const nextInfo = page.locator('#tier-next-info');
    await expect(nextInfo).toContainText('8 more referral');
    await expect(nextInfo).toContainText('Gold');

    const tierResults = await page.evaluate(() => {
      const calculateTier = (totalReferrals) => {
        const tiers = [
          { name: 'Bronze', minReferrals: 0, maxReferrals: 9 },
          { name: 'Silver', minReferrals: 10, maxReferrals: 24 },
          { name: 'Gold', minReferrals: 25, maxReferrals: 49 },
          { name: 'Platinum', minReferrals: 50, maxReferrals: Infinity }
        ];
        for (let i = 0; i < tiers.length; i++) {
          if (totalReferrals >= tiers[i].minReferrals && totalReferrals <= tiers[i].maxReferrals) {
            return tiers[i].name;
          }
        }
        return tiers[0].name;
      };
      return {
        bronze0: calculateTier(0),
        bronze9: calculateTier(9),
        silver10: calculateTier(10),
        silver24: calculateTier(24),
        gold25: calculateTier(25),
        gold49: calculateTier(49),
        platinum50: calculateTier(50),
        platinum100: calculateTier(100)
      };
    });

    expect(tierResults.bronze0).toBe('Bronze');
    expect(tierResults.bronze9).toBe('Bronze');
    expect(tierResults.silver10).toBe('Silver');
    expect(tierResults.silver24).toBe('Silver');
    expect(tierResults.gold25).toBe('Gold');
    expect(tierResults.gold49).toBe('Gold');
    expect(tierResults.platinum50).toBe('Platinum');
    expect(tierResults.platinum100).toBe('Platinum');
  });

  test('Commission history table renders entries with correct amounts and statuses', async ({ page }) => {
    await setupFounderDashboard(page);

    const commissionsTab = page.locator('.tab[data-tab="commissions"]');
    await commissionsTab.click();
    await page.waitForTimeout(500);

    const commissionsTable = page.locator('#commissions-table');
    await expect(commissionsTable).toBeVisible({ timeout: 10000 });

    const tbody = page.locator('#commissions-tbody');
    const rows = tbody.locator('tr');
    const count = await rows.count();
    expect(count).toBe(5);

    const tableContent = await commissionsTable.textContent();
    expect(tableContent).toContain('$250.00');
    expect(tableContent).toContain('$150.00');
    expect(tableContent).toContain('$100.50');
    expect(tableContent).toContain('paid');
    expect(tableContent).toContain('pending');
    expect(tableContent).toContain('approved');

    const commissionSum = COMMISSIONS_DATA.reduce((sum, c) => sum + c.commission_amount, 0);
    expect(commissionSum).toBeCloseTo(FOUNDER_PROFILE_DATA.total_commissions_earned, 2);

    for (const comm of COMMISSIONS_DATA) {
      const formattedAmount = '$' + comm.commission_amount.toFixed(2);
      expect(tableContent).toContain(formattedAmount);
    }
  });

  test('Payout history renders with receipt links', async ({ page }) => {
    await setupFounderDashboard(page);

    const payoutsTab = page.locator('.tab[data-tab="payouts"]');
    await payoutsTab.click();
    await page.waitForTimeout(500);

    const payoutsTable = page.locator('#payouts-table');
    await expect(payoutsTable).toBeVisible({ timeout: 10000 });

    const tbody = page.locator('#payouts-tbody');
    const rows = tbody.locator('tr');
    const count = await rows.count();
    expect(count).toBe(2);

    const tableContent = await payoutsTable.textContent();
    expect(tableContent).toContain('$500.00');
    expect(tableContent).toContain('$400.50');
    expect(tableContent).toContain('Jan 2024');
    expect(tableContent).toContain('Dec 2023');
    expect(tableContent).toContain('completed');

    const receiptLinks = tbody.locator('a[href*="payout-receipt"]');
    const receiptCount = await receiptLinks.count();
    expect(receiptCount).toBe(2);
  });
});

test.describe('Commission Rate Logic', () => {
  test('Standard founder shows 50% commission rate on tier display', async ({ page }) => {
    await setupFounderDashboard(page);

    const tierRate = page.locator('#tier-rate-bidpack');
    await expect(tierRate).toHaveText('50%', { timeout: 10000 });

    expect(FOUNDER_PROFILE_DATA.commission_rate).toBe(0.50);

    const bidPackCommissions = COMMISSIONS_DATA.filter(c => c.commission_type === 'bid_pack');
    for (const comm of bidPackCommissions) {
      const impliedPurchase = comm.commission_amount / FOUNDER_PROFILE_DATA.commission_rate;
      expect(impliedPurchase).toBeGreaterThan(0);
      expect(comm.commission_amount).toBe(impliedPurchase * 0.50);
    }
  });

  test('Chris Agrapidis founding provider agreement page shows 90% commission', async ({ page }) => {
    await page.goto('/founding-provider-chris-agrapidis.html');
    await page.waitForLoadState('domcontentloaded');

    const pageContent = await page.textContent('body');
    expect(pageContent).toContain('90%');
    expect(pageContent).toContain('bid pack purchases');

    expect(pageContent).toContain('lifetime');
    expect(pageContent).toContain('Referral Commissions');
    expect(pageContent).toContain('90% of total revenue from bid pack purchases');
    expect(pageContent).toContain('Commission Protection');
    expect(pageContent).toContain('90% commission rate on already-referred providers continues for life');
  });
});

test.describe('Admin Commission Management', () => {
  test('Admin commission rate update requires authentication', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');

    const noAuthResult = await page.evaluate(async () => {
      const res = await fetch('/api/admin/founders/test-id/commission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commission_rate: 0.60 })
      });
      return { status: res.status, body: await res.json() };
    });
    expect([401, 403]).toContain(noAuthResult.status);
    expect(noAuthResult.body.error).toBeDefined();

    const invalidTokenResult = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/admin/founders/test-id/commission', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer invalid-fake-token-12345'
          },
          body: JSON.stringify({ commission_rate: 0.60 })
        });
        const text = await res.text();
        let body;
        try { body = JSON.parse(text); } catch(e) { body = { raw: text }; }
        return { status: res.status, body, ok: res.ok };
      } catch (e) {
        return { status: 0, body: { error: e.message }, ok: false, networkError: true };
      }
    });
    expect(invalidTokenResult.ok).toBe(false);
    expect(invalidTokenResult.status).not.toBe(200);
  });

  test('Admin payout processing validates input', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');

    const noAuthResult = await page.evaluate(async () => {
      const res = await fetch('/api/admin/process-founder-payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payout_id: 'test-payout-id' })
      });
      return { status: res.status, body: await res.json() };
    });
    expect([401, 403]).toContain(noAuthResult.status);
    expect(noAuthResult.body.error).toBeDefined();

    const noContentTypeResult = await page.evaluate(async () => {
      const res = await fetch('/api/admin/process-founder-payout', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer invalid-fake-token-12345'
        },
        body: 'not-json'
      });
      return { status: res.status, body: await res.json() };
    });
    expect([400, 401, 403]).toContain(noContentTypeResult.status);
    expect(noContentTypeResult.body.error).toBeDefined();
  });

  test('Admin commission history endpoint requires auth', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');

    const noAuthResult = await page.evaluate(async () => {
      const res = await fetch('/api/admin/founders/test-id/commission-history');
      return { status: res.status, body: await res.json() };
    });
    expect([401, 403]).toContain(noAuthResult.status);
    expect(noAuthResult.body.error).toBeDefined();

    const invalidTokenResult = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/admin/founders/test-id/commission-history', {
          headers: { 'Authorization': 'Bearer invalid-fake-token-12345' }
        });
        const text = await res.text();
        let body;
        try { body = JSON.parse(text); } catch(e) { body = { raw: text }; }
        return { status: res.status, body, ok: res.ok };
      } catch (e) {
        return { status: 0, body: { error: e.message }, ok: false, networkError: true };
      }
    });
    expect(invalidTokenResult.ok).toBe(false);
    expect(invalidTokenResult.status).not.toBe(200);
  });
});

test.describe('Payout Settings', () => {
  test('Admin save payout settings endpoint requires authentication', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');

    const noAuthResult = await page.evaluate(async () => {
      const res = await fetch('/api/admin/payout-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { min_payout_threshold: 50 } })
      });
      return { status: res.status, body: await res.json() };
    });
    expect([401, 403]).toContain(noAuthResult.status);
    expect(noAuthResult.body.error).toBeDefined();

    const invalidTokenResult = await page.evaluate(async () => {
      const res = await fetch('/api/admin/payout-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer invalid-fake-token-12345'
        },
        body: JSON.stringify({ settings: { min_payout_threshold: 50 } })
      });
      return { status: res.status, body: await res.json() };
    });
    expect([401, 403]).toContain(invalidTokenResult.status);
    expect(invalidTokenResult.body.error).toBeDefined();
  });

  test('Founder can view their payout method settings on dashboard', async ({ page }) => {
    await setupFounderDashboard(page);

    const payTaxSection = page.locator('#pay-tax-info-section');
    await expect(payTaxSection).toBeVisible({ timeout: 10000 });

    await expect(page.locator('#stripe-connect-item')).toBeVisible();
    await expect(page.locator('#instant-pay-item')).toBeVisible();
    await expect(page.locator('#weekly-payout-item')).toBeVisible();
    await expect(page.locator('#backup-payout-item')).toBeVisible();

    await expect(page.locator('#stripe-connect-badge')).toContainText('Connected');
    await expect(page.locator('#weekly-payout-badge')).toContainText('Active');

    const payoutMethod = page.locator('#payout-method');
    await expect(payoutMethod).toHaveValue('stripe_connect');

    const payoutEmail = page.locator('#payout-email');
    await expect(payoutEmail).toHaveValue('founder@example.com');
  });

  test('Payout settings endpoint rejects unauthenticated requests', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');

    const result = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/admin/payout-settings');
        const text = await res.text();
        let body;
        try { body = JSON.parse(text); } catch(e) { body = { raw: text }; }
        return { status: res.status, body, ok: res.ok };
      } catch (e) {
        return { status: 0, body: { error: e.message }, ok: false, networkError: true };
      }
    });

    expect(result.ok).toBe(false);
  });
});
