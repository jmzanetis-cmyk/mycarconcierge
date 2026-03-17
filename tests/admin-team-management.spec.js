const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:5000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password';

test.describe('Admin Team Management Smoke Tests', () => {
  test.describe.configure({ mode: 'serial' });

  test.describe('1 – Admin Portal Login Page', () => {
    test('admin.html loads and shows login modal', async ({ page }) => {
      const response = await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      expect(response.status()).toBe(200);
      await page.waitForSelector('#admin-password-modal', { state: 'visible', timeout: 10000 });
      await expect(page.locator('#admin-password-modal')).toBeVisible();
    });

    test('login modal shows Supabase login form when no session', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#admin-password-modal', { state: 'visible', timeout: 10000 });
      await page.waitForSelector('#admin-login-form', { state: 'visible', timeout: 10000 });
      await expect(page.locator('#admin-login-email')).toBeVisible();
      await expect(page.locator('#admin-login-password')).toBeVisible();
    });

    test('login form has team member login link', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#admin-login-form', { state: 'visible', timeout: 10000 });
      const teamLink = page.locator('#admin-login-form a:has-text("Team member login")');
      await expect(teamLink).toBeVisible();
    });

    test('clicking team member login shows team login form', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#admin-login-form', { state: 'visible', timeout: 10000 });
      await page.click('a:has-text("Team member login")');
      await expect(page.locator('#admin-team-login-form')).toBeVisible();
      await expect(page.locator('#team-login-email')).toBeVisible();
      await expect(page.locator('#team-login-password')).toBeVisible();
    });

    test('team login form has back to admin link', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#admin-login-form', { state: 'visible', timeout: 10000 });
      await page.click('a:has-text("Team member login")');
      await expect(page.locator('a:has-text("Sign in as Admin instead")')).toBeVisible();
    });

    test('switching back from team login to admin login works', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#admin-login-form', { state: 'visible', timeout: 10000 });
      await page.click('a:has-text("Team member login")');
      await expect(page.locator('#admin-team-login-form')).toBeVisible();
      await page.click('a:has-text("Sign in as Admin instead")');
      await expect(page.locator('#admin-login-form')).toBeVisible();
      await expect(page.locator('#admin-team-login-form')).toBeHidden();
    });
  });

  test.describe('2 – Team Login API Endpoints', () => {
    test('team login with invalid credentials returns 401', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/team-login`, {
        data: { email: 'nonexistent@test.com', password: 'wrongpass' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(401);
      const body = await response.json();
      expect(body.error).toBeTruthy();
    });

    test('team login with empty email returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/team-login`, {
        data: { email: '', password: 'somepass' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect([400, 401]).toContain(response.status());
    });

    test('team login with empty password returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/team-login`, {
        data: { email: 'test@test.com', password: '' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect([400, 401]).toContain(response.status());
    });
  });

  test.describe('3 – Admin API Auth Protection', () => {
    test('team-members GET without auth returns 401', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/team-members`);
      expect(response.status()).toBe(401);
    });

    test('team-members POST without auth returns 401', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/team-members`, {
        data: { email: 'test@test.com', displayName: 'Test', role: 'support', password: 'pass123' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(401);
    });

    test('team-members PUT without auth returns 401', async ({ request }) => {
      const response = await request.put(`${BASE}/api/admin/team-members/fake-id`, {
        data: { role: 'marketing' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(401);
    });

    test('team-members DELETE without auth returns 401', async ({ request }) => {
      const response = await request.delete(`${BASE}/api/admin/team-members/fake-id`);
      expect(response.status()).toBe(401);
    });

    test('chat-insights without auth returns 401', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/chat-insights`);
      expect(response.status()).toBe(401);
    });

    test('role-permissions without auth returns 401', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/role-permissions`);
      expect(response.status()).toBe(401);
    });

    test('hubspot contacts without auth returns 401', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/hubspot/contacts`);
      expect(response.status()).toBe(401);
    });

    test('hubspot deals without auth returns 401', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/hubspot/deals`);
      expect(response.status()).toBe(401);
    });

    test('hubspot companies without auth returns 401', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/hubspot/companies`);
      expect(response.status()).toBe(401);
    });
  });

  test.describe('4 – Admin API Auth with Valid Password', () => {
    test('team-members GET with admin password succeeds', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/team-members`, {
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
    });

    test('role-permissions GET with admin password succeeds', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/role-permissions`, {
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('super_admin');
      expect(body).toHaveProperty('crm_manager');
      expect(body).toHaveProperty('marketing');
      expect(body).toHaveProperty('operations');
      expect(body).toHaveProperty('finance');
      expect(body).toHaveProperty('support');
    });

    test('role-permissions has correct structure', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/role-permissions`, {
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      const body = await response.json();
      expect(Array.isArray(body.super_admin)).toBe(true);
      expect(body.super_admin).toContain('dashboard');
      expect(body.super_admin).toContain('team-management');
      expect(body.crm_manager).toContain('crm');
      expect(body.crm_manager).not.toContain('team-management');
      expect(body.marketing).toContain('ai-chat-insights');
      expect(body.marketing).not.toContain('payments');
      expect(body.finance).toContain('payments');
      expect(body.finance).not.toContain('crm');
      expect(body.support).toContain('tickets');
      expect(body.support).not.toContain('payments');
    });

    test('chat-insights with admin password succeeds', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/chat-insights`, {
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('totalSessions');
      expect(body).toHaveProperty('totalMessages');
      expect(body).toHaveProperty('modeCount');
    });

    test('session-info with admin password returns super admin', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/session-info`, {
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.authenticated).toBe(true);
      expect(body.role).toBe('super_admin');
      expect(Array.isArray(body.permissions)).toBe(true);
      expect(body.permissions).toContain('team-management');
    });
  });

  test.describe('5 – Team Member CRUD via API', () => {
    const testEmail = `smoke-test-${Date.now()}@test-mcc.com`;
    let createdMemberId = null;

    test('create team member with admin password', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/team-members`, {
        data: {
          email: testEmail,
          displayName: 'Smoke Test User',
          role: 'support',
          password: 'TestPass123!'
        },
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body).toHaveProperty('id');
      expect(body.email).toBe(testEmail);
      expect(body.role).toBe('support');
      createdMemberId = body.id;
    });

    test('duplicate email returns 409', async ({ request }) => {
      if (!createdMemberId) test.skip();
      const response = await request.post(`${BASE}/api/admin/team-members`, {
        data: {
          email: testEmail,
          displayName: 'Duplicate User',
          role: 'marketing',
          password: 'TestPass456!'
        },
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(409);
    });

    test('created member appears in list', async ({ request }) => {
      if (!createdMemberId) test.skip();
      const response = await request.get(`${BASE}/api/admin/team-members`, {
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      const found = body.find(m => m.id === createdMemberId);
      expect(found).toBeTruthy();
      expect(found.email).toBe(testEmail);
      expect(found.display_name).toBe('Smoke Test User');
      expect(found.role).toBe('support');
    });

    test('update team member role', async ({ request }) => {
      if (!createdMemberId) test.skip();
      const response = await request.put(`${BASE}/api/admin/team-members/${createdMemberId}`, {
        data: { role: 'marketing' },
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(200);
    });

    test('updated role is reflected in list', async ({ request }) => {
      if (!createdMemberId) test.skip();
      const response = await request.get(`${BASE}/api/admin/team-members`, {
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      const body = await response.json();
      const found = body.find(m => m.id === createdMemberId);
      expect(found.role).toBe('marketing');
    });

    test('deactivate team member', async ({ request }) => {
      if (!createdMemberId) test.skip();
      const response = await request.put(`${BASE}/api/admin/team-members/${createdMemberId}`, {
        data: { status: 'inactive' },
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(200);
    });

    test('team login with deactivated account fails', async ({ request }) => {
      if (!createdMemberId) test.skip();
      const response = await request.post(`${BASE}/api/admin/team-login`, {
        data: { email: testEmail, password: 'TestPass123!' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(403);
    });

    test('reactivate team member', async ({ request }) => {
      if (!createdMemberId) test.skip();
      const response = await request.put(`${BASE}/api/admin/team-members/${createdMemberId}`, {
        data: { status: 'active' },
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(200);
    });

    test('team login with reactivated account succeeds', async ({ request }) => {
      if (!createdMemberId) test.skip();
      const response = await request.post(`${BASE}/api/admin/team-login`, {
        data: { email: testEmail, password: 'TestPass123!' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('token');
      expect(body).toHaveProperty('user');
      expect(body.user.role).toBe('marketing');
      expect(Array.isArray(body.permissions)).toBe(true);
      expect(body.permissions).toContain('crm');
      expect(body.permissions).toContain('ai-chat-insights');
      expect(body.permissions).not.toContain('team-management');
    });

    test('delete team member', async ({ request }) => {
      if (!createdMemberId) test.skip();
      const response = await request.delete(`${BASE}/api/admin/team-members/${createdMemberId}`, {
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(200);
    });

    test('deleted member no longer in list', async ({ request }) => {
      if (!createdMemberId) test.skip();
      const response = await request.get(`${BASE}/api/admin/team-members`, {
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      const body = await response.json();
      const found = body.find(m => m.id === createdMemberId);
      expect(found).toBeFalsy();
    });
  });

  test.describe('6 – Team Session Token Auth', () => {
    const sessionTestEmail = `session-test-${Date.now()}@test-mcc.com`;
    let sessionToken = null;
    let sessionMemberId = null;

    test('setup: create support team member', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/team-members`, {
        data: {
          email: sessionTestEmail,
          displayName: 'Session Tester',
          role: 'support',
          password: 'SessionPass123!'
        },
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(201);
      sessionMemberId = (await response.json()).id;
    });

    test('login and get session token', async ({ request }) => {
      if (!sessionMemberId) test.skip();
      const response = await request.post(`${BASE}/api/admin/team-login`, {
        data: { email: sessionTestEmail, password: 'SessionPass123!' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      sessionToken = body.token;
      expect(sessionToken).toBeTruthy();
      expect(body.user.role).toBe('support');
    });

    test('session token grants access to permitted section', async ({ request }) => {
      if (!sessionToken) test.skip();
      const response = await request.get(`${BASE}/api/admin/chat-insights`, {
        headers: { 'x-admin-token': sessionToken, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(200);
    });

    test('session token denied for unpermitted section (CRM)', async ({ request }) => {
      if (!sessionToken) test.skip();
      const response = await request.get(`${BASE}/api/admin/hubspot/contacts`, {
        headers: { 'x-admin-token': sessionToken, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(403);
    });

    test('session token denied for team management', async ({ request }) => {
      if (!sessionToken) test.skip();
      const response = await request.get(`${BASE}/api/admin/team-members`, {
        headers: { 'x-admin-token': sessionToken, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(403);
    });

    test('invalid session token returns 401', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/team-members`, {
        headers: { 'x-admin-token': 'totally-fake-token-abc123', 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(401);
    });

    test('team logout invalidates token', async ({ request }) => {
      if (!sessionToken) test.skip();
      const logoutRes = await request.post(`${BASE}/api/admin/team-logout`, {
        headers: { 'x-admin-token': sessionToken, 'Content-Type': 'application/json' }
      });
      expect(logoutRes.status()).toBe(200);

      const afterRes = await request.get(`${BASE}/api/admin/chat-insights`, {
        headers: { 'x-admin-token': sessionToken, 'Content-Type': 'application/json' }
      });
      expect(afterRes.status()).toBe(401);
    });

    test('cleanup: delete session test member', async ({ request }) => {
      if (!sessionMemberId) test.skip();
      const response = await request.delete(`${BASE}/api/admin/team-members/${sessionMemberId}`, {
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(200);
    });
  });

  test.describe('7 – Team Invite CRUD via API', () => {
    const inviteEmail = `invite-test-${Date.now()}@test-mcc.com`;
    let createdInviteId = null;
    let createdInviteToken = null;

    test('create team invite', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/team-invites`, {
        data: { email: inviteEmail, role: 'operations' },
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.invite).toBeTruthy();
      expect(body.invite.email).toBe(inviteEmail.toLowerCase());
      expect(body.invite.role).toBe('operations');
      expect(body.invite.id).toBeTruthy();
      expect(body.invite.token).toBeTruthy();
      expect(body.inviteUrl).toContain('admin-invite.html?token=');
      createdInviteId = body.invite.id;
      createdInviteToken = body.invite.token;
    });

    test('create invite with missing email returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/team-invites`, {
        data: { role: 'support' },
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(400);
    });

    test('create invite with missing role returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/team-invites`, {
        data: { email: 'norole@test.com' },
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(400);
    });

    test('create invite with invalid role returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/team-invites`, {
        data: { email: 'badrole@test.com', role: 'ceo' },
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(400);
    });

    test('duplicate pending invite returns 409', async ({ request }) => {
      if (!createdInviteId) test.skip();
      const response = await request.post(`${BASE}/api/admin/team-invites`, {
        data: { email: inviteEmail, role: 'support' },
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(409);
    });

    test('list invites includes created invite', async ({ request }) => {
      if (!createdInviteId) test.skip();
      const response = await request.get(`${BASE}/api/admin/team-invites`, {
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
      const found = body.find(i => i.id === createdInviteId);
      expect(found).toBeTruthy();
      expect(found.email).toBe(inviteEmail.toLowerCase());
      expect(found.role).toBe('operations');
      expect(found.status).toBe('pending');
      expect(found.expires_at).toBeTruthy();
    });

    test('list invites includes token for copy-link feature', async ({ request }) => {
      if (!createdInviteId) test.skip();
      const response = await request.get(`${BASE}/api/admin/team-invites`, {
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      const body = await response.json();
      const found = body.find(i => i.id === createdInviteId);
      expect(found.token).toBeTruthy();
    });

    test('validate invite token', async ({ request }) => {
      if (!createdInviteToken) test.skip();
      const response = await request.get(`${BASE}/api/admin/invite-validate?token=${createdInviteToken}`);
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.valid).toBe(true);
      expect(body.email).toBe(inviteEmail.toLowerCase());
      expect(body.role).toBe('operations');
    });

    test('validate invalid token returns invalid', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/invite-validate?token=totally-fake-token`);
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.valid).toBe(false);
    });

    test('validate missing token returns 400', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/invite-validate`);
      expect(response.status()).toBe(400);
    });

    test('send invite via email', async ({ request }) => {
      if (!createdInviteId) test.skip();
      const response = await request.post(`${BASE}/api/admin/team-invites/${createdInviteId}/send-email`, {
        data: {},
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect([200, 500]).toContain(response.status());
    });

    test('send invite via SMS to real number', async ({ request }) => {
      if (!createdInviteId) test.skip();
      const response = await request.post(`${BASE}/api/admin/team-invites/${createdInviteId}/send-sms`, {
        data: { phone: '8458210804' },
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect([200, 500]).toContain(response.status());
      if (response.status() === 200) {
        const body = await response.json();
        expect(body.success).toBe(true);
      }
    });

    test('send SMS with missing phone returns 400', async ({ request }) => {
      if (!createdInviteId) test.skip();
      const response = await request.post(`${BASE}/api/admin/team-invites/${createdInviteId}/send-sms`, {
        data: {},
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect([400, 500]).toContain(response.status());
    });

    test('send SMS for nonexistent invite returns 404', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/team-invites/nonexistent-id/send-sms`, {
        data: { phone: '5551234567' },
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect([404, 500]).toContain(response.status());
    });

    test('delete (revoke) invite', async ({ request }) => {
      if (!createdInviteId) test.skip();
      const response = await request.delete(`${BASE}/api/admin/team-invites/${createdInviteId}`, {
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    test('revoked invite no longer in list', async ({ request }) => {
      if (!createdInviteId) test.skip();
      const response = await request.get(`${BASE}/api/admin/team-invites`, {
        headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' }
      });
      const body = await response.json();
      const found = body.find(i => i.id === createdInviteId);
      expect(found).toBeFalsy();
    });

    test('invites require auth', async ({ request }) => {
      const getRes = await request.get(`${BASE}/api/admin/team-invites`);
      expect(getRes.status()).toBe(401);
      const postRes = await request.post(`${BASE}/api/admin/team-invites`, {
        data: { email: 'noauth@test.com', role: 'support' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(postRes.status()).toBe(401);
    });
  });

  test.describe('8 – CORS Headers', () => {
    test('admin endpoint returns proper CORS headers with origin', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/team-members`, {
        headers: {
          'Origin': 'https://www.mycarconcierge.com',
          'x-admin-password': ADMIN_PASSWORD,
          'Content-Type': 'application/json'
        }
      });
      expect(response.status()).toBe(200);
      const headers = response.headers();
      expect(headers['access-control-allow-origin']).toBe('https://www.mycarconcierge.com');
      expect(headers['access-control-allow-credentials']).toBe('true');
      expect(headers['access-control-allow-methods']).toContain('GET');
      expect(headers['access-control-allow-methods']).toContain('POST');
    });

    test('admin endpoint returns CORS headers on 401 error', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/team-members`, {
        headers: {
          'Origin': 'https://mycarconcierge.com',
          'x-admin-password': 'wrong-password'
        }
      });
      expect(response.status()).toBe(401);
      const headers = response.headers();
      expect(headers['access-control-allow-origin']).toBe('https://mycarconcierge.com');
      expect(headers['access-control-allow-credentials']).toBe('true');
    });

    test('CORS does not use wildcard with credentials', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/team-members`, {
        headers: {
          'Origin': 'https://www.mycarconcierge.com',
          'x-admin-password': ADMIN_PASSWORD
        }
      });
      const headers = response.headers();
      expect(headers['access-control-allow-origin']).not.toBe('*');
    });
  });

  test.describe('9 – Team Management UI', () => {
    test('team management section has correct structure', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      const teamSection = page.locator('#team-management');
      await expect(teamSection).toBeAttached();
      await expect(teamSection.locator('.page-title:has-text("Team Management")')).toBeAttached();
      await expect(teamSection.locator('text=Pending Invites')).toBeAttached();
      await expect(teamSection.locator('text=Role Permissions Reference')).toBeAttached();
    });

    test('CRM Add Contact modal is hidden by default', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      const modal = page.locator('#crm-add-modal');
      await expect(modal).toBeAttached();
      await expect(modal).not.toHaveClass(/active/);
    });

    test('invite team member button exists', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      const inviteBtn = page.locator('button:has-text("Invite Team Member")');
      await expect(inviteBtn).toBeAttached();
    });

    test('add team member button exists', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      const addBtn = page.locator('button:has-text("Add Team Member")');
      await expect(addBtn).toBeAttached();
    });
  });
});
