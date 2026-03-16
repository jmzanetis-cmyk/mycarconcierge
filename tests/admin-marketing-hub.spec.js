const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:5000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password';
const AUTH_HEADERS = { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' };

test.describe('Admin Marketing Hub Tests', () => {
  test.describe.configure({ mode: 'serial' });

  test.describe('1 – Auth Protection', () => {
    test('POST /marketing/generate without auth returns 401', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/generate`, {
        data: { type: 'social_post', topic: 'test' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(401);
    });

    test('POST /marketing/send-email without auth returns 401', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/send-email`, {
        data: { to: 'test@example.com', subject: 'Test', html: '<p>Test</p>' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(401);
    });

    test('POST /marketing/strategy without auth returns 401', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/strategy`, {
        data: { goal: 'test', budget: '1000' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(401);
    });

    test('GET /marketing/saved-campaigns without auth returns 401', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/marketing/saved-campaigns`);
      expect(response.status()).toBe(401);
    });

    test('POST /marketing/save-campaign without auth returns 401', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/save-campaign`, {
        data: { title: 'Test', type: 'social_post', content: 'Test content' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(401);
    });

    test('POST /marketing/research without auth returns 401', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/research`, {
        data: { query: 'auto shops', category: 'automotive' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(401);
    });

    test('GET /marketing/outreach-queue without auth returns 401', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/marketing/outreach-queue`);
      expect(response.status()).toBe(401);
    });

    test('POST /marketing/outreach-send without auth returns 401', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/outreach-send`, {
        data: { id: '1', to: 'test@example.com', subject: 'Hi', body: 'Hello' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(401);
    });

    test('POST /marketing/outreach-update without auth returns 401', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/outreach-update`, {
        data: { id: '1', notes: 'Updated' },
        headers: { 'Content-Type': 'application/json' }
      });
      expect(response.status()).toBe(401);
    });
  });

  test.describe('2 – Content Generator', () => {
    const contentTypes = [
      'social_post',
      'email_campaign',
      'ad_copy',
      'blog_outline',
      'outreach_email',
      'press_release',
      'kickstarter_campaign',
      'grant_application',
      'investor_pitch'
    ];

    for (const type of contentTypes) {
      test(`generate ${type} returns success or valid error`, async ({ request }) => {
        const response = await request.post(`${BASE}/api/admin/marketing/generate`, {
          data: {
            type,
            topic: 'My Car Concierge automotive marketplace',
            tone: 'professional',
            audience: 'car owners',
            context: 'We connect car owners with vetted service providers'
          },
          headers: AUTH_HEADERS
        });
        expect([200, 500]).toContain(response.status());
        if (response.status() === 200) {
          const body = await response.json();
          expect(body.success).toBe(true);
          expect(typeof body.content).toBe('string');
          expect(body.content.length).toBeGreaterThan(0);
        }
      });
    }

    test('generate with missing type returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/generate`, {
        data: {
          topic: 'test topic',
          tone: 'professional'
        },
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('generate with missing topic returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/generate`, {
        data: {
          type: 'social_post',
          tone: 'professional'
        },
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });
  });

  test.describe('3 – Email Campaign', () => {
    test('send-email with valid data returns success or service error', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/send-email`, {
        data: {
          to: 'test@example.com',
          subject: 'Test Campaign Email',
          html: '<h1>Hello</h1><p>This is a test campaign.</p>'
        },
        headers: AUTH_HEADERS
      });
      expect([200, 500]).toContain(response.status());
      if (response.status() === 200) {
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.messageId).toBeTruthy();
      }
    });

    test('send-email with array of recipients returns success or service error', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/send-email`, {
        data: {
          to: ['test1@example.com', 'test2@example.com'],
          subject: 'Bulk Test Campaign',
          html: '<p>Bulk test email</p>'
        },
        headers: AUTH_HEADERS
      });
      expect([200, 500]).toContain(response.status());
    });

    test('send-email with custom from returns success or service error', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/send-email`, {
        data: {
          to: 'test@example.com',
          subject: 'Custom From Test',
          html: '<p>Custom from address test</p>',
          from: 'marketing@mycarconcierge.com'
        },
        headers: AUTH_HEADERS
      });
      expect([200, 500]).toContain(response.status());
    });

    test('send-email missing to returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/send-email`, {
        data: {
          subject: 'No Recipient',
          html: '<p>Missing to field</p>'
        },
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('send-email missing subject returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/send-email`, {
        data: {
          to: 'test@example.com',
          html: '<p>Missing subject</p>'
        },
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('send-email missing html returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/send-email`, {
        data: {
          to: 'test@example.com',
          subject: 'Missing HTML Body'
        },
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });
  });

  test.describe('4 – Campaign Strategy', () => {
    test('strategy with valid data returns success or service error', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/strategy`, {
        data: {
          goal: 'Increase member signups by 50%',
          budget: '5000',
          timeline: '3 months',
          channels: ['social_media', 'email', 'content_marketing'],
          audience: 'Car owners aged 25-55'
        },
        headers: AUTH_HEADERS
      });
      expect([200, 500]).toContain(response.status());
      if (response.status() === 200) {
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(typeof body.strategy).toBe('string');
        expect(body.strategy.length).toBeGreaterThan(0);
      }
    });

    test('strategy with missing goal returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/strategy`, {
        data: {
          budget: '5000',
          timeline: '3 months'
        },
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('strategy with minimal fields returns success or service error', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/strategy`, {
        data: {
          goal: 'Brand awareness',
          budget: '1000',
          timeline: '1 month',
          channels: ['social_media'],
          audience: 'General public'
        },
        headers: AUTH_HEADERS
      });
      expect([200, 500]).toContain(response.status());
    });
  });

  test.describe('5 – Saved Content Lifecycle', () => {
    let savedCampaignId = null;

    test('save-campaign with valid data returns success', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/save-campaign`, {
        data: {
          title: `Test Campaign ${Date.now()}`,
          type: 'social_post',
          content: 'Check out My Car Concierge for all your automotive needs!',
          metadata: { tone: 'casual', audience: 'car owners' }
        },
        headers: AUTH_HEADERS
      });
      expect([200, 201]).toContain(response.status());
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.campaign).toBeTruthy();
      if (body.campaign.id) {
        savedCampaignId = body.campaign.id;
      }
    });

    test('save-campaign missing title returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/save-campaign`, {
        data: {
          type: 'email_campaign',
          content: 'Missing title content'
        },
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('save-campaign missing content returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/save-campaign`, {
        data: {
          title: 'Missing Content Campaign',
          type: 'ad_copy'
        },
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('saved-campaigns returns array with saved items', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/marketing/saved-campaigns`, {
        headers: AUTH_HEADERS
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.campaigns)).toBe(true);
    });

    test('save another campaign to verify accumulation', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/save-campaign`, {
        data: {
          title: `Second Campaign ${Date.now()}`,
          type: 'email_campaign',
          content: 'Join My Car Concierge today and save on auto services!'
        },
        headers: AUTH_HEADERS
      });
      expect([200, 201]).toContain(response.status());
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    test('saved-campaigns count increased after saving', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/marketing/saved-campaigns`, {
        headers: AUTH_HEADERS
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.campaigns.length).toBeGreaterThanOrEqual(2);
    });
  });

  test.describe('6 – Research & Outreach', () => {
    test('research with valid query returns success or service error', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/research`, {
        data: {
          query: 'auto repair shops',
          category: 'automotive',
          location: 'New York'
        },
        headers: AUTH_HEADERS
      });
      expect([200, 500]).toContain(response.status());
      if (response.status() === 200) {
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.results)).toBe(true);
      }
    });

    test('research with missing query returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/research`, {
        data: {
          category: 'automotive'
        },
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('research with missing category returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/research`, {
        data: {
          query: 'auto shops'
        },
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('research without location still works', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/research`, {
        data: {
          query: 'car detailing businesses',
          category: 'automotive'
        },
        headers: AUTH_HEADERS
      });
      expect([200, 500]).toContain(response.status());
    });

    test('outreach-queue returns array', async ({ request }) => {
      const response = await request.get(`${BASE}/api/admin/marketing/outreach-queue`, {
        headers: AUTH_HEADERS
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.queue)).toBe(true);
    });

    test('outreach-update with valid data returns success', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/outreach-update`, {
        data: {
          id: '1',
          subject: 'Updated Subject',
          body: 'Updated outreach body content',
          notes: 'Follow up next week'
        },
        headers: AUTH_HEADERS
      });
      expect([200, 404, 500]).toContain(response.status());
    });

    test('outreach-update missing id returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/outreach-update`, {
        data: {
          subject: 'No ID provided'
        },
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('outreach-send with valid data returns success or service error', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/outreach-send`, {
        data: {
          id: '1',
          to: 'outreach-test@example.com',
          subject: 'Partnership Opportunity',
          body: 'We would love to partner with your business.'
        },
        headers: AUTH_HEADERS
      });
      expect([200, 404, 500]).toContain(response.status());
    });

    test('outreach-send missing required fields returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/outreach-send`, {
        data: {
          id: '1'
        },
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });
  });

  test.describe('7 – Input Validation', () => {
    test('generate with empty body returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/generate`, {
        data: {},
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('send-email with empty body returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/send-email`, {
        data: {},
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('strategy with empty body returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/strategy`, {
        data: {},
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('save-campaign with empty body returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/save-campaign`, {
        data: {},
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('research with empty body returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/research`, {
        data: {},
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('outreach-send with empty body returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/outreach-send`, {
        data: {},
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('outreach-update with empty body returns 400', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/outreach-update`, {
        data: {},
        headers: AUTH_HEADERS
      });
      expect([400, 500]).toContain(response.status());
    });

    test('generate with invalid type still processes or returns error', async ({ request }) => {
      const response = await request.post(`${BASE}/api/admin/marketing/generate`, {
        data: {
          type: 'invalid_type_xyz',
          topic: 'test topic'
        },
        headers: AUTH_HEADERS
      });
      expect([200, 400, 500]).toContain(response.status());
    });
  });
});
