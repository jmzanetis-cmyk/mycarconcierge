const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FAKE_PROVIDER_ID = '00000000-aaaa-bbbb-cccc-000000000002';
const FAKE_PROVIDER_EMAIL = 'provider@example.com';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

const providersHtmlContent = fs.readFileSync(path.join(__dirname, '..', 'www', 'providers.html'), 'utf8');
const providersSettingsJs = fs.readFileSync(path.join(__dirname, '..', 'www', 'providers-settings.js'), 'utf8');
const serverJsContent = fs.readFileSync(path.join(__dirname, '..', 'www', 'server.js'), 'utf8');

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
              } else if (_table === 'notifications') {
                result = { data: [
                  { id: 'n1', user_id: '${userId}', type: 'bid_accepted', title: 'Bid Accepted', message: 'Your bid was accepted', read: false, created_at: '2024-01-15T00:00:00Z' },
                  { id: 'n2', user_id: '${userId}', type: 'new_package', title: 'New Package', message: 'New service request', read: false, created_at: '2024-01-14T00:00:00Z' },
                  { id: 'n3', user_id: '${userId}', type: 'message_received', title: 'New Message', message: 'You have a message', read: true, created_at: '2024-01-13T00:00:00Z' }
                ], error: null };
              } else if (_table === 'team_members') {
                result = { data: [], error: null };
              } else if (_table === 'team_invites') {
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
        user_metadata: { full_name: 'Test User' }
      }
    }));
  }, { userId, email });
}

async function addProviderFunctionStubs(page) {
  await page.addInitScript(() => {
    var noop = function() {};
    var asyncNoop = function() { return Promise.resolve(); };
    window.loadProviderAgreement = asyncNoop;
    window.loadProviderPerformance = asyncNoop;
    window.loadTeamMembers = asyncNoop;
    window.loadDestinationTasks = asyncNoop;
    window.loadEarningsAnalyticsData = asyncNoop;
    window.initAdvancedAnalytics = noop;
    window.loadPosAnalytics = asyncNoop;
    window.refreshEmergencies = asyncNoop;
    window.loadTransportTasks = asyncNoop;
    window.setupRealtimeSubscriptions = noop;
    window.loadNotifications = asyncNoop;
    window.loadConversations = asyncNoop;
    window.showToast = noop;
    window.escapeHtml = function(text) { return text ? String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; };
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

test.describe('Provider Settings Module', () => {

  test.describe('Provider Profile Management', () => {

    test('Profile form fields exist in providers.html for business_name, phone, and address', async () => {
      expect(providersHtmlContent).toContain('id="profile-business-name"');
      expect(providersHtmlContent).toContain('id="profile-phone"');
      expect(providersHtmlContent).toContain('id="profile-address"');
    });

    test('saveProviderProfile function reads all profile fields from DOM', async () => {
      expect(providersSettingsJs).toContain('async function saveProviderProfile()');
      expect(providersSettingsJs).toContain("getElementById('profile-business-name')");
      expect(providersSettingsJs).toContain("getElementById('profile-phone')");
      expect(providersSettingsJs).toContain("getElementById('profile-address')");
      expect(providersSettingsJs).toContain("getElementById('profile-city')");
      expect(providersSettingsJs).toContain("getElementById('profile-state')");
      expect(providersSettingsJs).toContain("getElementById('profile-zip-code')");
      expect(providersSettingsJs).toContain("getElementById('profile-bio')");
      expect(providersSettingsJs).toContain("getElementById('profile-hourly-rate')");
    });

    test('Profile save updates display name after successful save', async () => {
      expect(providersSettingsJs).toContain("fields.business_name || providerProfile.full_name || 'Provider'");
      expect(providersSettingsJs).toContain("getElementById('user-name').textContent = displayName");
    });

    test('Profile save includes validation and error handling', async () => {
      expect(providersSettingsJs).toContain("from('profiles')");
      expect(providersSettingsJs).toContain('.update(fields)');
      expect(providersSettingsJs).toContain("showToast('Profile saved!', 'success')");
      expect(providersSettingsJs).toContain("showToast('Failed to save profile', 'error')");
    });
  });

  test.describe('Emergency Settings', () => {

    test('Emergency settings UI elements exist in providers.html', async () => {
      expect(providersHtmlContent).toContain('id="emergency-accept-calls"');
      expect(providersHtmlContent).toContain('id="emergency-radius"');
      expect(providersHtmlContent).toContain('id="emergency-24-7"');
      expect(providersHtmlContent).toContain('id="emergency-can-tow"');
    });

    test('Emergency service checkboxes exist for all service types', async () => {
      const emergencyServices = ['flat_tire', 'dead_battery', 'lockout', 'tow_needed', 'fuel_delivery', 'other'];
      for (const service of emergencyServices) {
        expect(providersHtmlContent).toContain(`value="${service}" class="emergency-service-check"`);
      }
    });

    test('saveEmergencySettings function exists and saves to Supabase', async () => {
      expect(providersSettingsJs).toContain('async function saveEmergencySettings()');
      expect(providersSettingsJs).toContain('emergency_enabled: enabled');
      expect(providersSettingsJs).toContain('emergency_radius: radius');
      expect(providersSettingsJs).toContain('emergency_services: services');
      expect(providersSettingsJs).toContain('is_24_seven: is24Seven');
      expect(providersSettingsJs).toContain('can_tow: canTow');
      expect(providersSettingsJs).toContain("showToast('Emergency settings saved!', 'success')");
    });

    test('Emergency radius defaults to 15 miles when not set', async () => {
      expect(providersSettingsJs).toContain("parseInt(document.getElementById('emergency-radius')?.value) || 15");
    });
  });

  test.describe('Team Management', () => {

    test('Team members list container and rendering function exist', async () => {
      expect(providersSettingsJs).toContain("getElementById('team-members-list')");
      expect(providersSettingsJs).toContain('function renderTeamMembers()');
      expect(providersSettingsJs).toContain("from('team_members')");
    });

    test('Team invite modal has email and role fields', async () => {
      expect(providersSettingsJs).toContain("getElementById('invite-email')");
      expect(providersSettingsJs).toContain("getElementById('invite-role')");
      expect(providersSettingsJs).toContain("openModal('invite-team-modal')");
    });

    test('sendTeamInvite validates email is required', async () => {
      expect(providersSettingsJs).toContain('async function sendTeamInvite()');
      expect(providersSettingsJs).toContain('if (!email)');
      expect(providersSettingsJs).toContain("showToast('Please enter an email address', 'error')");
    });

    test('Team member edit modal has name and role fields', async () => {
      expect(providersSettingsJs).toContain("getElementById('edit-member-id')");
      expect(providersSettingsJs).toContain("getElementById('edit-member-name')");
      expect(providersSettingsJs).toContain("getElementById('edit-member-role')");
      expect(providersSettingsJs).toContain("openModal('edit-team-modal')");
    });

    test('Team member removal requires confirmation dialog', async () => {
      expect(providersSettingsJs).toContain('async function removeTeamMember(memberId)');
      expect(providersSettingsJs).toContain("confirm(`Remove ${member.name || 'this team member'}?`)");
      expect(providersSettingsJs).toContain("showToast('Team member removed', 'success')");
    });

    test('Empty state shows proper message when no team members', async () => {
      expect(providersSettingsJs).toContain('if (!teamMembers.length)');
      expect(providersSettingsJs).toContain('No team members yet. Invite your first team member!');
      expect(providersSettingsJs).toContain('empty-state');
    });
  });

  test.describe('Background Checks', () => {

    test('Background check status is fetched via GET /api/background-check-status', async () => {
      expect(providersSettingsJs).toContain("fetch(`/api/background-check-status?provider_id=${currentUser.id}`)");
      expect(providersSettingsJs).toContain('async function loadBackgroundCheckStatus()');
    });

    test('Background check initiation uses POST /api/initiate-background-check', async () => {
      expect(providersSettingsJs).toContain('/api/initiate-background-check');
      expect(providersSettingsJs).toContain("method: 'POST'");
      expect(providersSettingsJs).toContain('async function submitBackgroundCheck()');
    });

    test('Background check modal has type selector for provider/employee', async () => {
      expect(providersHtmlContent).toContain('id="bg-check-type"');
      expect(providersHtmlContent).toContain('id="bg-check-email"');
      expect(providersHtmlContent).toContain('id="bg-check-employee-fields"');
      expect(providersHtmlContent).toContain('id="background-check-modal"');
    });

    test('Background check status renders with proper icons and colors for each status', async () => {
      const statuses = ['pending', 'clear', 'consider', 'suspended'];
      const icons = { 'pending': '⏳', 'clear': '✅', 'consider': '⚠️', 'suspended': '🚫' };
      for (const status of statuses) {
        expect(providersSettingsJs).toContain(`'${status}'`);
      }
      expect(providersSettingsJs).toContain("'pending': '⏳'");
      expect(providersSettingsJs).toContain("'clear': '✅'");
      expect(providersSettingsJs).toContain("'consider': '⚠️'");
      expect(providersSettingsJs).toContain("'suspended': '🚫'");
    });
  });

  test.describe('Verification Badge', () => {

    test('Verification badge status endpoint is called with provider ID', async () => {
      expect(providersSettingsJs).toContain('/api/provider-verification-status/');
      expect(providersSettingsJs).toContain('async function loadVerificationBadgeStatus()');
    });

    test('Verification badge endpoint exists in server.js', async () => {
      expect(serverJsContent).toContain('/api/provider-verification-status/');
    });

    test('Badge progress bar renders correctly based on verified employees', async () => {
      expect(providersSettingsJs).toContain('data.verifiedEmployees');
      expect(providersSettingsJs).toContain('data.totalEmployees');
      expect(providersSettingsJs).toContain('data.verifiedEmployees / data.totalEmployees * 100');
      expect(providersSettingsJs).toContain('data.badgeEarned');
      expect(providersSettingsJs).toContain('data.pendingEmployees');
    });
  });

  test.describe('Notifications', () => {

    test('Notifications are loaded from Supabase notifications table', async () => {
      expect(providersSettingsJs).toContain('async function loadNotifications()');
      expect(providersSettingsJs).toContain("from('notifications')");
      expect(providersSettingsJs).toContain("eq('user_id', currentUser.id)");
      expect(providersSettingsJs).toContain('.limit(50)');
    });

    test('Notification badge shows unread count with 9+ cap', async () => {
      expect(providersSettingsJs).toContain('function updateNotificationBadge()');
      expect(providersSettingsJs).toContain('notifications.filter(n => !n.read).length');
      expect(providersSettingsJs).toContain("unreadCount > 9 ? '9+' : unreadCount");
      expect(providersHtmlContent).toContain('id="notif-count"');
    });

    test('Notification icons are mapped by type for all expected types', async () => {
      const notifTypes = ['bid_accepted', 'new_package', 'message_received', 'payment_received', 'review_received'];
      for (const type of notifTypes) {
        expect(providersSettingsJs).toContain(`'${type}'`);
      }
      expect(providersSettingsJs).toContain("'bid_accepted': '🎉'");
      expect(providersSettingsJs).toContain("'new_package': '📦'");
      expect(providersSettingsJs).toContain("'message_received': '💬'");
      expect(providersSettingsJs).toContain("'payment_received': '💰'");
      expect(providersSettingsJs).toContain("'review_received': '⭐'");
      expect(providersSettingsJs).toContain("'default': '📢'");
    });

    test('markAllNotificationsRead function exists and updates all unread', async () => {
      expect(providersSettingsJs).toContain('async function markAllNotificationsRead()');
      expect(providersSettingsJs).toContain("notifications.filter(n => !n.read).map(n => n.id)");
      expect(providersSettingsJs).toContain("showToast('All marked as read', 'success')");
    });

    test('Notification click marks as read and navigates based on link type', async () => {
      expect(providersSettingsJs).toContain('async function handleNotificationClick(notifId, linkType, linkId)');
      expect(providersSettingsJs).toContain("update({ read: true, read_at:");
      expect(providersSettingsJs).toContain("linkType === 'package'");
      expect(providersSettingsJs).toContain("linkType === 'message'");
      expect(providersSettingsJs).toContain("showSection('jobs')");
      expect(providersSettingsJs).toContain("showSection('messages')");
    });
  });

  test.describe('Loyalty Network & Referrals', () => {

    test('Loyalty QR code section exists in providers.html', async () => {
      expect(providersHtmlContent).toContain('loyalty-qr');
      expect(providersHtmlContent).toContain('Loyal Customer Uses');
      expect(providersHtmlContent).toContain('New Member Uses');
      expect(providersHtmlContent).toContain('Provider Uses');
    });

    test('Referral link generation uses correct URL pattern with signup-loyal-customer', async () => {
      expect(providersSettingsJs).toContain('signup-loyal-customer.html?ref=');
      expect(providersSettingsJs).toContain('window.location.origin');
      expect(providersSettingsJs).toContain('currentUser.id');
    });

    test('copyLoyaltyLink function exists and copies to clipboard', async () => {
      expect(providersSettingsJs).toContain('function copyLoyaltyLink()');
      expect(providersSettingsJs).toContain('navigator.clipboard.writeText(link)');
      expect(providersSettingsJs).toContain('signup-loyal-customer.html?ref=');
    });
  });
});
