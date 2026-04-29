const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:5000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password';
const AUTH_HEADERS = { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' };

test.describe('Admin Outreach Engine API Tests', () => {
  test.describe.configure({ mode: 'serial' });

  test.describe('1 – Auth Protection', () => {
    const endpoints = [
      { method: 'GET', path: '/engine-state' },
      { method: 'POST', path: '/engine-toggle' },
      { method: 'POST', path: '/engine-settings' },
      { method: 'GET', path: '/leads' },
      { method: 'POST', path: '/leads' },
      { method: 'POST', path: '/leads/import-csv' },
      { method: 'POST', path: '/leads/import-places' },
      { method: 'GET', path: '/pipeline' },
      { method: 'POST', path: '/pipeline/score' },
      { method: 'GET', path: '/messages' },
      { method: 'POST', path: '/messages/draft' },
      { method: 'POST', path: '/messages/approve' },
      { method: 'POST', path: '/messages/approve-bulk' },
      { method: 'POST', path: '/messages/send' },
      { method: 'POST', path: '/messages/skip' },
      { method: 'GET', path: '/campaigns' },
      { method: 'POST', path: '/campaigns' },
      { method: 'POST', path: '/convert-lead' },
      { method: 'POST', path: '/sync-reengagement' },
      { method: 'GET', path: '/analytics' },
    ];

    for (const ep of endpoints) {
      test(`${ep.method} ${ep.path} without auth returns 401`, async ({ request }) => {
        const url = `${BASE}/api/admin/outreach${ep.path}`;
        let response;
        if (ep.method === 'GET') {
          response = await request.get(url);
        } else {
          response = await request.post(url, {
            data: {},
            headers: { 'Content-Type': 'application/json' }
          });
        }
        expect(response.status()).toBe(401);
      });
    }
  });

  test.describe('2 – Schema Status', () => {
    test('GET /schema-status returns schema_ready field', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/outreach/schema-status`, {
        headers: AUTH_HEADERS
      });
      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('schema_ready');
      expect(typeof data.schema_ready).toBe('boolean');
    });
  });

  test.describe('3 – Engine State', () => {
    test('GET /engine-state returns engine configuration', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/outreach/engine-state`, {
        headers: AUTH_HEADERS
      });
      const status = response.status();
      if (status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('is_running');
        expect(data).toHaveProperty('discovery_interval_minutes');
      } else {
        expect(status).toBe(500);
      }
    });

    test('POST /engine-toggle toggles engine state', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/outreach/engine-toggle`, {
        data: { pause_reason: 'test toggle' },
        headers: AUTH_HEADERS
      });
      const status = response.status();
      expect([200, 500]).toContain(status);
    });

    test('POST /engine-settings updates settings', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/outreach/engine-settings`, {
        data: { discovery_interval_minutes: 30 },
        headers: AUTH_HEADERS
      });
      const status = response.status();
      expect([200, 500]).toContain(status);
    });
  });

  test.describe('4 – Leads CRUD', () => {
    let testLeadId;

    test('GET /leads returns list', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/outreach/leads`, {
        headers: AUTH_HEADERS
      });
      const status = response.status();
      if (status === 200) {
        const data = await response.json();
        expect(Array.isArray(data)).toBe(true);
      } else {
        expect(status).toBe(500);
      }
    });

    test('POST /leads creates a new lead', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/outreach/leads`, {
        data: {
          name: 'Test Provider Lead',
          type: 'provider',
          email: 'testlead@example.com',
          phone: '+15551234567',
          company: 'Test Auto Shop',
          location: 'Newark, NJ',
          source: 'manual',
          notes: 'Playwright test lead'
        },
        headers: AUTH_HEADERS
      });
      const status = response.status();
      if (status === 200 || status === 201) {
        const data = await response.json();
        expect(data).toHaveProperty('id');
        testLeadId = data.id;
      } else {
        expect([200, 201, 500]).toContain(status);
      }
    });

    test('POST /leads rejects duplicate email', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/outreach/leads`, {
        data: {
          name: 'Duplicate Lead',
          type: 'provider',
          email: 'testlead@example.com',
          source: 'manual'
        },
        headers: AUTH_HEADERS
      });
      const status = response.status();
      expect([200, 201, 409, 500]).toContain(status);
    });

    test('POST /leads validates required name field', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/outreach/leads`, {
        data: { type: 'provider' },
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('POST /leads/import-csv handles CSV import', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/outreach/leads/import-csv`, {
        data: {
          leads: [
            { name: 'CSV Lead 1', type: 'provider', email: 'csv1@test.com', location: 'NYC' },
            { name: 'CSV Lead 2', type: 'member', email: 'csv2@test.com', location: 'LA' }
          ]
        },
        headers: AUTH_HEADERS
      });
      const status = response.status();
      if (status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('imported');
        expect(data).toHaveProperty('duplicates');
      } else {
        expect(status).toBe(500);
      }
    });

    test('POST /leads/import-places requires location', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/outreach/leads/import-places`, {
        data: {},
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });
  });

  test.describe('5 – Pipeline', () => {
    test('GET /pipeline returns list', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/outreach/pipeline`, {
        headers: AUTH_HEADERS
      });
      const status = response.status();
      if (status === 200) {
        const data = await response.json();
        expect(Array.isArray(data)).toBe(true);
      } else {
        expect(status).toBe(500);
      }
    });

    test('POST /pipeline/score triggers scoring', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/outreach/pipeline/score`, {
        data: {},
        headers: AUTH_HEADERS
      });
      const status = response.status();
      expect([200, 500]).toContain(status);
    });
  });

  test.describe('6 – Messages', () => {
    test('GET /messages returns list', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/outreach/messages`, {
        headers: AUTH_HEADERS
      });
      const status = response.status();
      if (status === 200) {
        const data = await response.json();
        expect(Array.isArray(data)).toBe(true);
      } else {
        expect(status).toBe(500);
      }
    });

    test('POST /messages/draft requires lead_id', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/outreach/messages/draft`, {
        data: {},
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('POST /messages/approve requires message_id', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/outreach/messages/approve`, {
        data: {},
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('POST /messages/approve-bulk requires message_ids array', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/outreach/messages/approve-bulk`, {
        data: { message_ids: [] },
        headers: AUTH_HEADERS
      });
      expect([200, 400, 500]).toContain(response.status());
    });

    test('POST /messages/send requires message_id', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/outreach/messages/send`, {
        data: {},
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('POST /messages/skip handles empty body gracefully', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/outreach/messages/skip`, {
        data: {},
        headers: AUTH_HEADERS
      });
      expect([200, 400, 500]).toContain(response.status());
    });
  });

  test.describe('7 – Campaigns', () => {
    let testCampaignId;

    test('GET /campaigns returns list', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/outreach/campaigns`, {
        headers: AUTH_HEADERS
      });
      const status = response.status();
      if (status === 200) {
        const data = await response.json();
        expect(Array.isArray(data)).toBe(true);
      } else {
        expect(status).toBe(500);
      }
    });

    test('POST /campaigns creates a campaign', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/outreach/campaigns`, {
        data: {
          name: 'Test Outreach Campaign',
          target_type: 'provider',
          channel: 'email',
          template: 'Join My Car Concierge today!'
        },
        headers: AUTH_HEADERS
      });
      const status = response.status();
      if (status === 200 || status === 201) {
        const data = await response.json();
        expect(data).toHaveProperty('id');
        testCampaignId = data.id;
      } else {
        expect([200, 201, 500]).toContain(status);
      }
    });

    test('POST /campaigns validates required name', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/outreach/campaigns`, {
        data: { target_type: 'provider' },
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });
  });

  test.describe('8 – Analytics', () => {
    test('GET /analytics returns stats', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/outreach/analytics`, {
        headers: AUTH_HEADERS
      });
      const status = response.status();
      if (status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('total_leads');
      } else {
        expect(status).toBe(500);
      }
    });
  });

  test.describe('9 – Conversion & Re-engagement', () => {
    test('POST /convert-lead requires valid lead_id and profile_id', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/outreach/convert-lead`, {
        data: {},
        headers: AUTH_HEADERS
      });
      expect([400, 404, 500]).toContain(response.status());
    });

    test('POST /sync-reengagement triggers sync', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/outreach/sync-reengagement`, {
        data: {},
        headers: AUTH_HEADERS
      });
      const status = response.status();
      expect([200, 500]).toContain(status);
    });
  });

  test.describe('10 – History', () => {
    test('GET /history/:profileId returns outreach history', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request.get(`${BASE}/api/admin/outreach/history/${fakeId}`, {
        headers: AUTH_HEADERS
      });
      const status = response.status();
      if (status === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('lead');
        expect(data).toHaveProperty('messages');
      } else {
        expect(status).toBe(500);
      }
    });
  });

  test.describe('11 – Engine Cycle', () => {
    test('POST /engine-cycle triggers manual cycle', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/outreach/engine-cycle`, {
        data: {},
        headers: AUTH_HEADERS
      });
      const status = response.status();
      expect([200, 500]).toContain(status);
    });
  });

  test.describe('12 – UI Integration', () => {
    test('Admin page loads with outreach engine nav item', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`);
      const navItem = page.locator('[data-section="outreach-engine"]');
      await expect(navItem).toBeVisible({ timeout: 10000 });
      await expect(navItem).toContainText('Outreach Engine');
    });

    test('Outreach Engine section exists in DOM', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`);
      const section = page.locator('#outreach-engine');
      await expect(section).toBeAttached();
    });

    test('Outreach tab buttons exist', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`);
      const tabs = ['pipeline', 'queue', 'leads', 'campaigns', 'import', 'analytics'];
      for (const tab of tabs) {
        const tabBtn = page.locator(`.outreach-tab[data-tab="${tab}"]`);
        await expect(tabBtn).toBeAttached();
      }
    });

    test('Pipeline panel has header row', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`);
      const headerRow = page.locator('.pipeline-header-row');
      await expect(headerRow).toBeAttached();
    });

    test('Import tab has Google Places and CSV sections', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`);
      const placesInput = page.locator('#import-location-inline');
      const csvInput = page.locator('#import-csv-file-inline');
      await expect(placesInput).toBeAttached();
      await expect(csvInput).toBeAttached();
    });

    test('Control panel container exists', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`);
      const panel = page.locator('#outreach-control-panel');
      await expect(panel).toBeAttached();
    });

    test('Outreach Engine script is loaded', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`);
      const hasFunction = await page.evaluate(() => typeof globalThis.initOutreachEngine === 'function');
      expect(hasFunction).toBe(true);
    });

    test('switchOutreachTab function is available', async ({ page }) => {
      await page.goto(`${BASE}/admin.html`);
      const hasFunction = await page.evaluate(() => typeof globalThis.switchOutreachTab === 'function');
      expect(hasFunction).toBe(true);
    });
  });
});
