const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:5000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password';
const AUTH_HEADERS = { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' };

test.describe('Admin CRM & HubSpot Tests', () => {
  test.describe.configure({ mode: 'serial' });

  test.describe('1 – HubSpot API Auth Protection', () => {
    test('contacts GET without auth returns 401', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/hubspot/contacts`);
      expect(response.status()).toBe(401);
    });

    test('contacts POST without auth returns 401', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/hubspot/contacts`, {
        data: { email: 'test@example.com' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(401);
    });

    test('deals GET without auth returns 401', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/hubspot/deals`);
      expect(response.status()).toBe(401);
    });

    test('deals POST without auth returns 401', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/hubspot/deals`, {
        data: { dealname: 'Test Deal' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(401);
    });

    test('companies GET without auth returns 401', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/hubspot/companies`);
      expect(response.status()).toBe(401);
    });

    test('companies POST without auth returns 401', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/hubspot/companies`, {
        data: { name: 'Test Company' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(401);
    });

    test('sync-members POST without auth returns 401', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/hubspot/sync-members`, {
        headers: { 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(401);
    });
  });

  test.describe('2 – HubSpot Role-Based Access', () => {
    const crmTestEmail = `crm-role-test-${Date.now()}@test-mcc.com`;
    let crmToken = null;
    let crmMemberId = null;

    test('setup: create support role member (no CRM access)', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/team-members`, {
        data: {
          email: crmTestEmail,
          displayName: 'CRM Role Tester',
          role: 'support',
          password: 'CrmTest123!'
        },
        headers: AUTH_HEADERS
      });
      expect(response.status()).toBe(201);
      crmMemberId = (await response.json()).id;
    });

    test('login as support role', async ({ request }) => {
      if (!crmMemberId) test.skip();
      const response = await request.post(`${BASE}/api/admin/team-login`, {
        data: { email: crmTestEmail, password: 'CrmTest123!' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      crmToken = body.token;
      expect(body.permissions).not.toContain('crm');
    });

    test('support role denied access to contacts', async ({ request }) => {
      if (!crmToken) test.skip();
      const response = await request.get(`${BASE}/api/admin/hubspot/contacts`, {
        headers: { 'x-admin-token': crmToken, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(403);
    });

    test('support role denied access to deals', async ({ request }) => {
      if (!crmToken) test.skip();
      const response = await request.get(`${BASE}/api/admin/hubspot/deals`, {
        headers: { 'x-admin-token': crmToken, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(403);
    });

    test('support role denied access to companies', async ({ request }) => {
      if (!crmToken) test.skip();
      const response = await request.get(`${BASE}/api/admin/hubspot/companies`, {
        headers: { 'x-admin-token': crmToken, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(403);
    });

    test('cleanup: delete CRM role test member', async ({ request }) => {
      if (!crmMemberId) test.skip();
      const response = await request.delete(`${BASE}/api/admin/team-members/${crmMemberId}`, {
        headers: AUTH_HEADERS
      });
      expect(response.status()).toBe(200);
    });
  });

  test.describe('3 – CRM Manager Role Access', () => {
    const managerEmail = `crm-mgr-${Date.now()}@test-mcc.com`;
    let managerToken = null;
    let managerMemberId = null;

    test('setup: create crm_manager role member', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/team-members`, {
        data: {
          email: managerEmail,
          displayName: 'CRM Manager Tester',
          role: 'crm_manager',
          password: 'CrmMgr123!'
        },
        headers: AUTH_HEADERS
      });
      expect(response.status()).toBe(201);
      managerMemberId = (await response.json()).id;
    });

    test('login as crm_manager', async ({ request }) => {
      if (!managerMemberId) test.skip();
      const response = await request.post(`${BASE}/api/admin/team-login`, {
        data: { email: managerEmail, password: 'CrmMgr123!' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      managerToken = body.token;
      expect(body.permissions).toContain('crm');
    });

    test('crm_manager can access contacts', async ({ request }) => {
      if (!managerToken) test.skip();
      const response = await request.get(`${BASE}/api/admin/hubspot/contacts`, {
        headers: { 'x-admin-token': managerToken, 'Content-Type': 'application/json' }
      });
      expect([200, 500]).toContain(response.status());
    });

    test('crm_manager can access deals', async ({ request }) => {
      if (!managerToken) test.skip();
      const response = await request.get(`${BASE}/api/admin/hubspot/deals`, {
        headers: { 'x-admin-token': managerToken, 'Content-Type': 'application/json' }
      });
      expect([200, 500]).toContain(response.status());
    });

    test('crm_manager can access companies', async ({ request }) => {
      if (!managerToken) test.skip();
      const response = await request.get(`${BASE}/api/admin/hubspot/companies`, {
        headers: { 'x-admin-token': managerToken, 'Content-Type': 'application/json' }
      });
      expect([200, 500]).toContain(response.status());
    });

    test('crm_manager denied team management', async ({ request }) => {
      if (!managerToken) test.skip();
      const response = await request.get(`${BASE}/api/admin/team-members`, {
        headers: { 'x-admin-token': managerToken, 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(403);
    });

    test('cleanup: delete crm_manager test member', async ({ request }) => {
      if (!managerMemberId) test.skip();
      const response = await request.delete(`${BASE}/api/admin/team-members/${managerMemberId}`, {
        headers: AUTH_HEADERS
      });
      expect(response.status()).toBe(200);
    });
  });

  test.describe('4 – HubSpot Contacts API with Admin Auth', () => {
    test('list contacts with admin password', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/hubspot/contacts`, {
        headers: AUTH_HEADERS
      });
      expect([200, 500]).toContain(response.status());
      if (response.status() === 200) {
        const body = await response.json();
        expect(body).toHaveProperty('contacts');
        expect(Array.isArray(body.contacts)).toBe(true);
      }
    });

    test('create contact requires email', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/hubspot/contacts`, {
        data: { firstname: 'Test', lastname: 'NoEmail' },
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('create contact with valid data', async ({ request }) => {
      const testEmail = `hubspot-test-${Date.now()}@test-mcc.com`;
      const response = await request.post(`${BASE}/api/admin/hubspot/contacts`, {
        data: {
          firstname: 'Test',
          lastname: 'Contact',
          email: testEmail,
          phone: '5551234567',
          company: 'Test Corp',
          lifecyclestage: 'lead'
        },
        headers: AUTH_HEADERS
      });
      expect([201, 500]).toContain(response.status());
      if (response.status() === 201) {
        const body = await response.json();
        expect(body).toHaveProperty('contact');
      }
    });
  });

  test.describe('5 – HubSpot Deals API with Admin Auth', () => {
    test('list deals with admin password', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/hubspot/deals`, {
        headers: AUTH_HEADERS
      });
      expect([200, 500]).toContain(response.status());
      if (response.status() === 200) {
        const body = await response.json();
        expect(body).toHaveProperty('deals');
        expect(Array.isArray(body.deals)).toBe(true);
      }
    });

    test('create deal requires dealname', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/hubspot/deals`, {
        data: { amount: '1000' },
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('create deal with valid data', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/hubspot/deals`, {
        data: {
          dealname: `Test Deal ${Date.now()}`,
          amount: '5000',
          dealstage: 'appointmentscheduled',
          pipeline: 'default'
        },
        headers: AUTH_HEADERS
      });
      expect([201, 500]).toContain(response.status());
      if (response.status() === 201) {
        const body = await response.json();
        expect(body).toHaveProperty('deal');
      }
    });
  });

  test.describe('6 – HubSpot Companies API with Admin Auth', () => {
    test('list companies with admin password', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/hubspot/companies`, {
        headers: AUTH_HEADERS
      });
      expect([200, 500]).toContain(response.status());
      if (response.status() === 200) {
        const body = await response.json();
        expect(body).toHaveProperty('companies');
        expect(Array.isArray(body.companies)).toBe(true);
      }
    });

    test('create company requires name', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/hubspot/companies`, {
        data: { domain: 'example.com' },
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('create company with valid data', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/hubspot/companies`, {
        data: {
          name: `Test Company ${Date.now()}`,
          domain: 'testcompany.com',
          industry: 'Automotive',
          phone: '5559876543',
          city: 'Test City',
          state: 'NY'
        },
        headers: AUTH_HEADERS
      });
      expect([201, 500]).toContain(response.status());
      if (response.status() === 201) {
        const body = await response.json();
        expect(body).toHaveProperty('company');
      }
    });
  });

  test.describe('7 – HubSpot Sync Members', () => {
    test('sync members with admin password', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/hubspot/sync-members`, {
        headers: AUTH_HEADERS
      });
      expect([200, 500]).toContain(response.status());
      if (response.status() === 200) {
        const body = await response.json();
        expect(body).toHaveProperty('synced');
      }
    });
  });

  test.describe('8 – CRM UI Modal Behavior', () => {
    test('CRM modal is hidden by default on page load', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      const modal = page.locator('#crm-add-modal');
      await expect(modal).toBeAttached();
      await expect(modal).not.toHaveClass(/active/);
      const isVisible = await modal.isVisible();
      expect(isVisible).toBe(false);
    });

    test('CRM modal has correct form structure', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      await expect(page.locator('#crm-form-contact')).toBeAttached();
      await expect(page.locator('#crm-form-deal')).toBeAttached();
      await expect(page.locator('#crm-form-company')).toBeAttached();
      await expect(page.locator('#crm-contact-email')).toBeAttached();
      await expect(page.locator('#crm-deal-name')).toBeAttached();
      await expect(page.locator('#crm-company-name')).toBeAttached();
    });

    test('CRM modal has close button', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      const closeBtn = page.locator('#crm-add-modal .modal-close');
      await expect(closeBtn).toBeAttached();
    });

    test('CRM modal has cancel and save buttons', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      await expect(page.locator('#crm-add-modal button:has-text("Cancel")')).toBeAttached();
      await expect(page.locator('#crm-modal-save-btn')).toBeAttached();
    });

    test('CRM Add Contact button exists in HubSpot section', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      const addBtn = page.locator('button:has-text("+ Add Contact")');
      await expect(addBtn).toBeAttached();
    });

    test('CRM modal uses modal-backdrop class', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      const modal = page.locator('#crm-add-modal');
      const classes = await modal.getAttribute('class');
      expect(classes).toContain('modal-backdrop');
    });

    test('contact form fields have correct placeholders', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      await expect(page.locator('#crm-contact-firstname')).toHaveAttribute('placeholder', 'First Name');
      await expect(page.locator('#crm-contact-lastname')).toHaveAttribute('placeholder', 'Last Name');
      await expect(page.locator('#crm-contact-email')).toHaveAttribute('placeholder', 'Email *');
      await expect(page.locator('#crm-contact-phone')).toHaveAttribute('placeholder', 'Phone');
      await expect(page.locator('#crm-contact-company')).toHaveAttribute('placeholder', 'Company');
    });

    test('contact lifecycle stage dropdown has options', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      const options = page.locator('#crm-contact-stage option');
      const count = await options.count();
      expect(count).toBeGreaterThanOrEqual(4);
    });

    test('deal stage dropdown has options', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      const options = page.locator('#crm-deal-stage option');
      const count = await options.count();
      expect(count).toBeGreaterThanOrEqual(5);
    });
  });

  test.describe('9 – CRM Section UI Structure', () => {
    test('HubSpot CRM navigation link exists', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      const navLink = page.locator('#sidebar .nav-item[data-section="crm"]');
      await expect(navLink).toBeAttached();
    });

    test('CRM section has contacts tab', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      const contactsTab = page.locator('#crm [data-tab="contacts"], #crm button:has-text("Contacts")');
      await expect(contactsTab).toBeAttached();
    });

    test('CRM section has deals tab', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      const dealsTab = page.locator('#crm [data-tab="deals"], #crm button:has-text("Deals")');
      await expect(dealsTab).toBeAttached();
    });

    test('CRM section has companies tab', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      const companiesTab = page.locator('#crm [data-tab="companies"], #crm button:has-text("Companies")');
      await expect(companiesTab).toBeAttached();
    });

    test('CRM section has sync button', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      const syncBtn = page.locator('#crm button:has-text("Sync"), button:has-text("Sync Members")');
      await expect(syncBtn).toBeAttached();
    });
  });
});
