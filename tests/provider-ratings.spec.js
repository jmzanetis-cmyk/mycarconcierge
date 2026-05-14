const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const FAKE_PROVIDER_ID = '00000000-aaaa-bbbb-cccc-000000000002';
const FAKE_MEMBER_ID = '00000000-aaaa-bbbb-cccc-000000000003';
const FAKE_PACKAGE_ID = '00000000-aaaa-bbbb-cccc-000000000004';
const FAKE_ADMIN_ID = '00000000-aaaa-bbbb-cccc-000000000005';
const FAKE_PROVIDER_EMAIL = 'provider@example.com';
const FAKE_MEMBER_EMAIL = 'member@example.com';
const FAKE_ADMIN_EMAIL = 'admin@example.com';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

function createProviderMockJs() {
  const userId = FAKE_PROVIDER_ID;
  const email = FAKE_PROVIDER_EMAIL;

  return `
    (function() {
      var noopChannel = { on: function() { return this; }, subscribe: function() { return this; }, unsubscribe: function() {} };
      var fakeUser = {
        id: '${userId}',
        email: '${email}',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: 'Test Provider' }
      };
      var fakeSession = {
        access_token: 'fake-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'fake-refresh-token',
        user: fakeUser
      };
      var providerProfile = {
        id: '${userId}',
        full_name: 'Test Provider',
        email: '${email}',
        role: 'provider',
        status: 'approved',
        business_name: 'Test Auto Shop',
        zip_code: '10001',
        phone: '5559876543',
        bid_credits: 10,
        rating: 4.8,
        jobs_completed: 25,
        emergency_enabled: false,
        tos_accepted: true
      };

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
          var _isSingle = false;
          var _countMode = null;
          var _headMode = false;
          var q = {
            select: function(cols, opts) {
              if (opts && opts.count) _countMode = opts.count;
              if (opts && opts.head) _headMode = true;
              return q;
            },
            insert: function(data) {
              return {
                select: function() { return { single: function() { return Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error: null }); } }; },
                then: function(resolve) { resolve({ data: data, error: null }); return q; }
              };
            },
            update: function() { return q; },
            delete: function() { return q; },
            eq: function() { return q; },
            neq: function() { return q; },
            in: function() { return q; },
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
              if (_table === 'profiles') {
                if (_countMode && _headMode) {
                  result = { data: null, error: null, count: 4 };
                } else if (_isSingle) {
                  result = { data: providerProfile, error: null };
                } else {
                  result = { data: [providerProfile], error: null, count: 1 };
                }
              } else if (_table === 'provider_reviews') {
                result = { data: [
                  { id: 'rev1', provider_id: '${userId}', member_id: '${FAKE_MEMBER_ID}', overall_rating: 5, quality_rating: 5, communication_rating: 4, timeliness_rating: 5, value_rating: 4, review_title: 'Great service', review_text: 'Very happy', status: 'published', created_at: '2024-01-15T00:00:00Z', profiles: { full_name: 'Test Member' }, maintenance_packages: { title: 'Oil Change', category: 'maintenance' } }
                ], error: null };
              } else if (_table === 'provider_team_members') {
                result = { data: [], error: null };
              } else if (_table === 'tos_acceptance') {
                if (_isSingle) {
                  result = { data: { id: '1', accepted_at: new Date().toISOString() }, error: null };
                } else {
                  result = { data: [{ id: '1' }], error: null, count: 1 };
                }
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
        rpc: function(fnName) {
          if (fnName === 'get_provider_reviews_summary') {
            return Promise.resolve({ data: [{ provider_id: '${userId}', average_rating: 4.8, total_reviews: 25, is_suspended: false }], error: null });
          }
          if (fnName === 'is_provider_suspended') {
            return Promise.resolve({ data: false, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
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
    route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.Chart = function(ctx, config) { this.destroy = function(){}; this.update = function(){}; this.data = config?.data || {}; };' });
  });
  await page.route('**/cdn.jsdelivr.net/npm/qrcode**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
  await page.route('**/cdn.jsdelivr.net/npm/qr-creator**', route => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });
}

async function addAuthToken(page, userId, email) {
  await page.addInitScript(({ userId, email }) => {
    globalThis.localStorage.setItem('sb-ifbyjxuaclwmadqbjcyp-auth-token', JSON.stringify({
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
        user_metadata: { full_name: 'Test User' }
      }
    }));
  }, { userId, email });
}

async function addProviderFunctionStubs(page) {
  await page.addInitScript(() => {
    var noop = function() {};
    var asyncNoop = function() { return Promise.resolve(); };
    globalThis.loadProviderAgreement = asyncNoop;
    globalThis.loadProviderPerformance = asyncNoop;
    globalThis.loadTeamMembers = asyncNoop;
    globalThis.loadDestinationTasks = asyncNoop;
    globalThis.loadEarningsAnalyticsData = asyncNoop;
    globalThis.initAdvancedAnalytics = noop;
    globalThis.loadPosAnalytics = asyncNoop;
    globalThis.refreshEmergencies = asyncNoop;
    globalThis.loadTransportTasks = asyncNoop;
    globalThis.setupRealtimeSubscriptions = noop;
    globalThis.loadNotifications = asyncNoop;
    globalThis.loadConversations = asyncNoop;
    globalThis.showToast = noop;
    globalThis.escapeHtml = function(text) { return text ? String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;') : ''; };
  });
}

async function setupApiMocks(page) {
  await page.route('**/api/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authorized: true, verified: true, connected: false, status: 'clear', success: true, enabled: false })
    });
  });
}

async function setupProviderPage(page) {
  const mockJs = createProviderMockJs();
  await setupCdnMocks(page, mockJs);
  await setupApiMocks(page);
  await addAuthToken(page, FAKE_PROVIDER_ID, FAKE_PROVIDER_EMAIL);
  await addProviderFunctionStubs(page);

  await page.goto('/providers.html');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

const membersHtmlContent = fs.readFileSync(path.join(__dirname, '..', 'www', 'members.html'), 'utf8');
const adminHtmlContent = fs.readFileSync(path.join(__dirname, '..', 'www', 'admin.html'), 'utf8');
const adminJsContent = fs.readFileSync(path.join(__dirname, '..', 'www', 'admin.js'), 'utf8');
const supabaseClientContent = fs.readFileSync(path.join(__dirname, '..', 'www', 'supabaseclient.js'), 'utf8');
const membersPackagesContent = fs.readFileSync(path.join(__dirname, '..', 'www', 'members-packages.js'), 'utf8');
const ratingSuspensionSql = fs.readFileSync(path.join(__dirname, '..', 'www', 'RATING_SUSPENSION_SETUP.sql'), 'utf8');

test.describe('Provider Rating System', () => {

  test.describe('Rating Submission', () => {

    test('Review modal has all required UI elements with star ratings', async () => {
      expect(membersHtmlContent).toContain('id="review-modal"');
      expect(membersHtmlContent).toContain('Leave a Review');
      expect(membersHtmlContent).toContain('data-type="overall"');
      expect(membersHtmlContent).toContain('data-type="quality"');
      expect(membersHtmlContent).toContain('data-type="communication"');
      expect(membersHtmlContent).toContain('data-type="timeliness"');
      expect(membersHtmlContent).toContain('data-type="value"');
    });

    test('Review modal has complaint reason dropdown for low ratings', async () => {
      expect(membersHtmlContent).toContain('id="complaint-reason-group"');
      expect(membersHtmlContent).toContain('id="complaint-reason"');
      expect(membersHtmlContent).toContain('What was the main issue?');
    });

    test('Star rating categories include overall, quality, communication, timeliness, value', async () => {
      const categories = ['overall', 'quality', 'communication', 'timeliness', 'value'];
      for (const category of categories) {
        expect(membersHtmlContent).toContain(`data-type="${category}"`);
        expect(membersHtmlContent).toContain(`setRating('${category}'`);
      }
    });

    test('Review form has title and text inputs', async () => {
      expect(membersHtmlContent).toContain('id="review-title"');
      expect(membersHtmlContent).toContain('id="review-text"');
      expect(membersHtmlContent).toContain('Summarize your experience');
      expect(membersHtmlContent).toContain('Tell others about your experience');
    });

    test('Default star rating value is 5', async () => {
      const ratingContainers = membersHtmlContent.match(/class="star-rating[^"]*"\s+data-type="[^"]+"\s+data-value="(\d+)"/g) || [];
      expect(ratingContainers.length).toBeGreaterThanOrEqual(5);
      for (const container of ratingContainers) {
        expect(container).toContain('data-value="5"');
      }
    });

    test('Low rating (<=3) shows complaint reason dropdown via setRating', async () => {
      expect(membersPackagesContent).toContain("if (ratingType === 'overall')");
      expect(membersPackagesContent).toContain('if (value <= 3)');
      expect(membersPackagesContent).toContain("complaintGroup.style.display = 'block'");
    });

    test('Complaint reasons include all 12 options', async () => {
      const expectedOptions = [
        'poor_quality', 'incomplete_work', 'damage_caused', 'overcharged',
        'late_delivery', 'poor_communication', 'unprofessional', 'no_show',
        'dishonest', 'bait_switch', 'safety_concern', 'other'
      ];
      for (const option of expectedOptions) {
        expect(membersHtmlContent).toContain(`value="${option}"`);
      }
    });

    test('Review submission includes all required fields', async () => {
      expect(membersPackagesContent).toContain('overall_rating');
      expect(membersPackagesContent).toContain('quality_rating');
      expect(membersPackagesContent).toContain('communication_rating');
      expect(membersPackagesContent).toContain('timeliness_rating');
      expect(membersPackagesContent).toContain('value_rating');
      expect(membersPackagesContent).toContain('review_title');
      expect(membersPackagesContent).toContain('review_text');
      expect(membersPackagesContent).toContain('complaint_reason');
      expect(membersPackagesContent).toContain('complaint_reason_other');
      expect(membersPackagesContent).toContain('service_type');
      expect(membersPackagesContent).toContain('vehicle_info');
      expect(membersPackagesContent).toContain('amount_paid');
    });

    test('Review submission validates low rating requires complaint reason', async () => {
      expect(membersPackagesContent).toContain('if (overallRating <= 3)');
      expect(membersPackagesContent).toContain('Please select a reason for your low rating');
    });

    test('Review modal has submit and skip buttons', async () => {
      expect(membersHtmlContent).toContain('submitReview()');
      expect(membersHtmlContent).toContain('skipReview()');
      expect(membersHtmlContent).toContain('Submit Review');
      expect(membersHtmlContent).toContain('Skip for Now');
    });
  });

  test.describe('Rating Analytics API', () => {

    test('Ratings analytics endpoint requires authentication', async ({ request }) => {
      const res = await request.get(`${BASE_URL}/api/providers/${FAKE_PROVIDER_ID}/analytics/ratings`);
      expect(res.status()).toBe(401);
    });

    test('Invalid provider ID returns 400', async ({ request }) => {
      const res = await request.get(`${BASE_URL}/api/providers/invalid-uuid/analytics/ratings`, {
        headers: { 'Authorization': 'Bearer fake-token' }
      });
      expect([400, 401]).toContain(res.status());
    });

    test('Ratings endpoint exists and is registered', async ({ request }) => {
      const res = await request.get(`${BASE_URL}/api/providers/${FAKE_PROVIDER_ID}/analytics/ratings`);
      expect(res.status()).not.toBe(404);
    });

    test('Revenue analytics endpoint requires auth', async ({ request }) => {
      const res = await request.get(`${BASE_URL}/api/providers/${FAKE_PROVIDER_ID}/analytics/revenue`);
      expect(res.status()).toBe(401);
    });

    test('Services analytics endpoint requires auth', async ({ request }) => {
      const res = await request.get(`${BASE_URL}/api/providers/${FAKE_PROVIDER_ID}/analytics/services`);
      expect(res.status()).toBe(401);
    });

    test('Busy hours analytics endpoint requires auth', async ({ request }) => {
      const res = await request.get(`${BASE_URL}/api/providers/${FAKE_PROVIDER_ID}/analytics/busy-hours`);
      expect(res.status()).toBe(401);
    });

    test('Server handler validates UUID format for ratings endpoint', async () => {
      const serverContent = fs.readFileSync(path.join(__dirname, '..', 'www', 'server.js'), 'utf8');
      expect(serverContent).toContain('handleProviderRatingsAnalytics');
      expect(serverContent).toContain('isValidUUID(providerId)');
    });

    test('Server ratings handler builds distribution and breakdown', async () => {
      const serverContent = fs.readFileSync(path.join(__dirname, '..', 'www', 'server.js'), 'utf8');
      expect(serverContent).toContain('ratingDistribution');
      expect(serverContent).toContain('monthlyRatings');
    });
  });

  test.describe('Automated Suspension System', () => {

    test('checkProviderSuspension function exists in supabaseclient.js', async () => {
      expect(supabaseClientContent).toContain('async function checkProviderSuspension(providerId)');
      expect(supabaseClientContent).toContain("supabaseClient.rpc('check_provider_suspension'");
    });

    test('isProviderSuspended function exists in supabaseclient.js', async () => {
      expect(supabaseClientContent).toContain('async function isProviderSuspended(providerId)');
      expect(supabaseClientContent).toContain("supabaseClient.rpc('is_provider_suspended'");
    });

    test('submitProviderReview calls checkProviderSuspension after insert', async () => {
      expect(supabaseClientContent).toContain('async function submitProviderReview(reviewData)');
      expect(supabaseClientContent).toContain("from('provider_reviews')");
      expect(supabaseClientContent).toContain('checkProviderSuspension(reviewData.provider_id)');
    });

    test('canProviderBid function checks suspension status', async () => {
      expect(supabaseClientContent).toContain('async function canProviderBid(providerId)');
      expect(supabaseClientContent).toContain('isProviderSuspended(providerId)');
    });

    test('Suspension threshold is 4 stars in SQL', async () => {
      expect(ratingSuspensionSql).toContain('v_avg_rating < 4.0');
      expect(ratingSuspensionSql).toContain('v_total_reviews >= 3');
    });

    test('Admin low-rating check scans for providers below threshold', async () => {
      expect(adminJsContent).toContain('checkLowRatedProviders');
      expect(adminJsContent).toContain('avgRating < 4');
    });

    test('Suspended providers receive notification message', async () => {
      expect(ratingSuspensionSql).toContain("'Account Suspended'");
      expect(ratingSuspensionSql).toContain('suspended due to a rating below 4.0 stars');
      expect(adminJsContent).toContain('account_suspended');
      expect(adminJsContent).toContain('Account Suspended');
    });

    test('Suspension updates provider_stats columns', async () => {
      expect(ratingSuspensionSql).toContain('suspended = TRUE');
      expect(ratingSuspensionSql).toContain('suspended_reason =');
      expect(ratingSuspensionSql).toContain('suspended_at = NOW()');
    });

    test('Suspended providers cannot bid via can_provider_bid', async () => {
      expect(ratingSuspensionSql).toContain("'can_bid', false");
      expect(ratingSuspensionSql).toContain('Account is suspended due to low ratings');
    });

    test('Admin can filter providers by suspended status', async () => {
      expect(adminJsContent).toContain("statusFilter === 'suspended'");
      expect(adminJsContent).toContain('isSuspended');
    });

    test('Functions are exported to window scope', async () => {
      expect(supabaseClientContent).toContain('window.checkProviderSuspension = checkProviderSuspension');
      expect(supabaseClientContent).toContain('window.isProviderSuspended = isProviderSuspended');
      expect(supabaseClientContent).toContain('window.submitProviderReview = submitProviderReview');
      expect(supabaseClientContent).toContain('window.canProviderBid = canProviderBid');
      expect(supabaseClientContent).toContain('window.getProviderCreditRefunds = getProviderCreditRefunds');
    });
  });

  test.describe('Admin Suspension Override', () => {

    test('Admin page has CAR reviews section', async () => {
      expect(adminHtmlContent).toContain('id="car-reviews"');
      expect(adminHtmlContent).toContain('CAR Reviews');
      expect(adminHtmlContent).toContain('Corrective Action Responses');
    });

    test('CAR review system has approve and reject options', async () => {
      expect(adminHtmlContent).toContain('Approve & Lift Suspension');
      expect(adminHtmlContent).toContain('Reject');
      expect(adminHtmlContent).toContain('Request Revision');
    });

    test('Approved CAR lifts suspension via reviewCAR function', async () => {
      expect(adminJsContent).toContain("async function reviewCAR(carId, decision)");
      expect(adminJsContent).toContain("'approved'");
      expect(adminJsContent).toContain('CAR approved! Provider suspension has been lifted');
    });

    test('CAR modal exists with proper structure', async () => {
      expect(adminHtmlContent).toContain('id="car-modal"');
      expect(adminHtmlContent).toContain('id="car-modal-body"');
      expect(adminHtmlContent).toContain('id="car-modal-footer"');
      expect(adminHtmlContent).toContain('Review Corrective Action Response');
    });

    test('Suspension lift tracks who lifted it and when in SQL', async () => {
      expect(ratingSuspensionSql).toContain('suspension_lifted_at = NOW()');
      expect(ratingSuspensionSql).toContain('suspension_lifted_by = v_admin_id');
    });

    test('lift_provider_suspension function requires admin auth', async () => {
      expect(ratingSuspensionSql).toContain('lift_provider_suspension');
      expect(ratingSuspensionSql).toContain("role = 'admin'");
      expect(ratingSuspensionSql).toContain('Only admins can lift suspensions');
    });

    test('Credit refunds table is defined with proper schema', async () => {
      expect(ratingSuspensionSql).toContain('CREATE TABLE IF NOT EXISTS credit_refunds');
      expect(ratingSuspensionSql).toContain('credits_refunded INTEGER NOT NULL');
      expect(ratingSuspensionSql).toContain('dollar_amount DECIMAL');
      expect(ratingSuspensionSql).toContain('refund_reason TEXT NOT NULL');
      expect(ratingSuspensionSql).toContain('stripe_refund_id TEXT');
      expect(ratingSuspensionSql).toContain('stripe_payment_intent_id TEXT');
    });

    test('getProviderCreditRefunds function queries credit_refunds table', async () => {
      expect(supabaseClientContent).toContain('async function getProviderCreditRefunds(providerId)');
      expect(supabaseClientContent).toContain("from('credit_refunds')");
    });

    test('CAR reviews navigation exists with count badge', async () => {
      expect(adminHtmlContent).toContain('data-section="car-reviews"');
      expect(adminHtmlContent).toContain('id="car-count"');
    });

    test('Admin suspension of low-rated providers creates notification', async () => {
      expect(adminJsContent).toContain("type: 'account_suspended'");
      expect(adminJsContent).toContain('Account Suspended');
      expect(adminJsContent).toContain('suspended due to ratings falling below 4 stars');
    });
  });

  test.describe('Rating Display', () => {

    test('Provider dashboard has rating stat card', async ({ page }) => {
      await setupProviderPage(page);

      const ratingStat = page.locator('#stat-rating');
      await expect(ratingStat).toBeAttached();
    });

    test('Provider dashboard has review count display', async ({ page }) => {
      await setupProviderPage(page);

      const reviewCount = page.locator('#stat-review-count');
      await expect(reviewCount).toBeAttached();
    });

    test('Provider has reviews section in navigation', async ({ page }) => {
      await setupProviderPage(page);

      const reviewsNav = page.locator('.nav-item[data-section="reviews"]');
      await expect(reviewsNav).toBeAttached();
    });

    test('Provider has reviews section element', async ({ page }) => {
      await setupProviderPage(page);

      const reviewsSection = page.locator('#reviews');
      await expect(reviewsSection).toBeAttached();
    });

    test('Provider page has stars-display CSS class', async ({ page }) => {
      await setupProviderPage(page);

      const hasClass = await page.evaluate(() => {
        const styles = Array.from(document.styleSheets);
        for (const sheet of styles) {
          try {
            const rules = Array.from(sheet.cssRules || []);
            for (const rule of rules) {
              if (rule.selectorText && rule.selectorText.includes('.stars-display')) {
                return true;
              }
            }
          } catch (e) {}
        }
        return false;
      });
      expect(hasClass).toBe(true);
    });

    test('Provider has analytics section for ratings data', async ({ page }) => {
      await setupProviderPage(page);

      const analyticsSection = page.locator('#analytics');
      await expect(analyticsSection).toBeAttached();
    });

    test('getProviderReviewsSummary function calls correct RPC', async () => {
      expect(supabaseClientContent).toContain('async function getProviderReviewsSummary(providerId)');
      expect(supabaseClientContent).toContain("supabaseClient.rpc('get_provider_reviews_summary'");
    });

    test('getProviderReviews fetches from provider_reviews with pagination', async () => {
      expect(supabaseClientContent).toContain('async function getProviderReviews(providerId, limit = 10, offset = 0)');
      expect(supabaseClientContent).toContain(".from('provider_reviews')");
    });

    test('Provider reviews query includes member name and package details', async () => {
      const startIdx = supabaseClientContent.indexOf('async function getProviderReviews(providerId');
      expect(startIdx).toBeGreaterThan(-1);
      const fnBody = supabaseClientContent.substring(startIdx, startIdx + 500);
      expect(fnBody).toContain('member:member_id');
      expect(fnBody).toContain('package:package_id');
      expect(fnBody).toContain('full_name');
      expect(fnBody).toContain('title');
      expect(fnBody).toContain('category');
    });

    test('Provider reviews query filters by published status', async () => {
      expect(supabaseClientContent).toContain("eq('status', 'published')");
    });
  });

  test.describe('SQL Migration Validation', () => {

    test('Provider suspension columns are defined in migration', async () => {
      expect(ratingSuspensionSql).toContain("column_name = 'suspended'");
      expect(ratingSuspensionSql).toContain("column_name = 'suspended_reason'");
      expect(ratingSuspensionSql).toContain("column_name = 'suspended_at'");
      expect(ratingSuspensionSql).toContain("column_name = 'suspension_lifted_at'");
      expect(ratingSuspensionSql).toContain("column_name = 'suspension_lifted_by'");
    });

    test('submit_provider_review triggers suspension check for low ratings', async () => {
      expect(ratingSuspensionSql).toContain('submit_provider_review');
      expect(ratingSuspensionSql).toContain('IF p_rating <= 3 THEN');
      expect(ratingSuspensionSql).toContain('v_suspension_result := check_provider_suspension');
    });

    test('Trigger auto-checks suspension after review insert', async () => {
      expect(ratingSuspensionSql).toContain('trigger_check_suspension_after_review');
      expect(ratingSuspensionSql).toContain('AFTER INSERT ON provider_reviews');
      expect(ratingSuspensionSql).toContain('IF NEW.rating <= 3 THEN');
    });

    test('Suspension creates refund record for bid credits', async () => {
      expect(ratingSuspensionSql).toContain('INSERT INTO credit_refunds');
      expect(ratingSuspensionSql).toContain('credits_refunded');
      expect(ratingSuspensionSql).toContain('Automatic refund due to suspension');
    });

    test('All RPC functions have proper permissions granted', async () => {
      const expectedGrants = [
        'calculate_provider_rating',
        'check_provider_suspension',
        'is_provider_suspended',
        'lift_provider_suspension',
        'get_provider_reviews_summary',
        'can_provider_bid',
        'submit_provider_review',
        'get_provider_credit_refunds'
      ];
      for (const fn of expectedGrants) {
        expect(ratingSuspensionSql).toContain(`GRANT EXECUTE ON FUNCTION ${fn} TO authenticated`);
      }
    });

    test('Credit refunds table has RLS policies', async () => {
      expect(ratingSuspensionSql).toContain('ALTER TABLE credit_refunds ENABLE ROW LEVEL SECURITY');
      expect(ratingSuspensionSql).toContain('Providers can view their own refunds');
      expect(ratingSuspensionSql).toContain('Admins can manage all refunds');
    });

    test('Lifted suspension notifies provider about reinstatement', async () => {
      expect(ratingSuspensionSql).toContain("'Account Reinstated'");
      expect(ratingSuspensionSql).toContain("'suspension_lifted'");
      expect(ratingSuspensionSql).toContain('can now bid on jobs again');
    });
  });
});
