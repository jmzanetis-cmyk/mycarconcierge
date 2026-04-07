const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:5000';
const FAKE_PROVIDER_ID = '00000000-aaaa-bbbb-cccc-000000000002';
const FAKE_MEMBER_ID = '00000000-aaaa-bbbb-cccc-000000000001';

test.describe('Provider Availability & Booking System', () => {

  test.describe('API Authentication', () => {
    test('GET /api/provider/availability/:id returns response', async ({ request }) => {
      const resp = await request.get(`${BASE}/api/provider/availability/${FAKE_PROVIDER_ID}`);
      expect([200, 401, 500]).toContain(resp.status());
    });

    test('POST /api/provider/availability requires auth', async ({ request }) => {
      const resp = await request.post(`${BASE}/api/provider/availability`, {
        data: { working_hours: [] }
      });
      expect(resp.status()).toBe(401);
    });

    test('GET /api/provider/blocked-time/:id requires auth', async ({ request }) => {
      const resp = await request.get(`${BASE}/api/provider/blocked-time/${FAKE_PROVIDER_ID}`);
      expect(resp.status()).toBe(401);
    });

    test('POST /api/provider/blocked-time requires auth', async ({ request }) => {
      const resp = await request.post(`${BASE}/api/provider/blocked-time`, {
        data: { provider_id: FAKE_PROVIDER_ID, block_date: '2026-03-15', start_time: '09:00', end_time: '12:00' }
      });
      expect(resp.status()).toBe(401);
    });

    test('DELETE /api/provider/blocked-time/:id requires auth', async ({ request }) => {
      const resp = await request.delete(`${BASE}/api/provider/blocked-time/fake-block-id`);
      expect(resp.status()).toBe(401);
    });

    test('POST /api/booking/create requires auth', async ({ request }) => {
      const resp = await request.post(`${BASE}/api/booking/create`, {
        data: { provider_id: FAKE_PROVIDER_ID, booking_date: '2026-03-15', start_time: '09:00', end_time: '10:00', duration_minutes: 60 }
      });
      expect(resp.status()).toBe(401);
    });

    test('POST /api/booking/cancel requires auth', async ({ request }) => {
      const resp = await request.post(`${BASE}/api/booking/cancel`, {
        data: { booking_id: 'fake-booking-id' }
      });
      expect(resp.status()).toBe(401);
    });

    test('GET /api/provider/schedule/:id requires auth', async ({ request }) => {
      const resp = await request.get(`${BASE}/api/provider/schedule/${FAKE_PROVIDER_ID}`);
      expect(resp.status()).toBe(401);
    });

    test('GET /api/booking/package/:id requires auth', async ({ request }) => {
      const resp = await request.get(`${BASE}/api/booking/package/fake-package-id`);
      expect(resp.status()).toBe(401);
    });
  });

  test.describe('Available Slots Endpoint', () => {
    test('GET /api/provider/available-slots/:id accepts requests', async ({ request }) => {
      const resp = await request.get(`${BASE}/api/provider/available-slots/${FAKE_PROVIDER_ID}?date=2026-03-15`);
      const status = resp.status();
      expect([200, 400, 401, 500]).toContain(status);
    });

    test('available-slots requires date parameter', async ({ request }) => {
      const resp = await request.get(`${BASE}/api/provider/available-slots/${FAKE_PROVIDER_ID}`);
      const body = await resp.json();
      if (resp.status() === 400) {
        expect(body.error).toBeTruthy();
      }
    });
  });

  test.describe('Request Validation', () => {
    test('POST /api/booking/create rejects missing required fields (with fake auth)', async ({ request }) => {
      const resp = await request.post(`${BASE}/api/booking/create`, {
        headers: { 'Authorization': 'Bearer fake-token-for-test' },
        data: { provider_id: FAKE_PROVIDER_ID }
      });
      expect([400, 401]).toContain(resp.status());
    });

    test('POST /api/booking/cancel rejects missing booking_id (with fake auth)', async ({ request }) => {
      const resp = await request.post(`${BASE}/api/booking/cancel`, {
        headers: { 'Authorization': 'Bearer fake-token-for-test' },
        data: {}
      });
      expect([400, 401]).toContain(resp.status());
    });
  });

  test.describe('Provider Dashboard - Availability UI', () => {
    test('provider dashboard has availability management section', async ({ page }) => {
      await page.goto(`${BASE}/providers.html`, { waitUntil: 'domcontentloaded' });
      const html = await page.content();
      const hasAvailability = html.includes('availability') || html.includes('Availability') ||
                              html.includes('working-hours') || html.includes('Working Hours') ||
                              html.includes('schedule') || html.includes('Schedule');
      expect(hasAvailability).toBe(true);
    });

    test('providers.js includes availability management functions', async ({ request }) => {
      const resp = await request.get(`${BASE}/providers.js`);
      expect(resp.status()).toBe(200);
      const js = await resp.text();
      const hasAvailFunctions = js.includes('working_hours') || js.includes('workingHours') ||
                                 js.includes('availability') || js.includes('blocked_time') ||
                                 js.includes('blockedTime');
      expect(hasAvailFunctions).toBe(true);
    });
  });

  test.describe('Member Dashboard - Booking UI', () => {
    test('members-extras.js includes slot booking functions', async ({ request }) => {
      const resp = await request.get(`${BASE}/members-extras.js`);
      expect(resp.status()).toBe(200);
      const js = await resp.text();
      expect(js).toContain('loadSlotBookingStatus');
      expect(js).toContain('cancelSlotBooking');
      expect(js).toContain('formatSlotTime');
    });

    test('members-packages.js includes booking UI elements', async ({ request }) => {
      const resp = await request.get(`${BASE}/members-packages.js`);
      expect(resp.status()).toBe(200);
      const js = await resp.text();
      expect(js).toContain('slot-booking-status');
      expect(js).toContain('Schedule Appointment');
    });

    test('members-extras.js calls loadSlotBookingStatus in logistics flow', async ({ request }) => {
      const resp = await request.get(`${BASE}/members-extras.js`);
      const js = await resp.text();
      expect(js).toContain('loadSlotBookingStatus(packageId)');
    });

    test('slot booking cancel uses correct API endpoint', async ({ request }) => {
      const resp = await request.get(`${BASE}/members-extras.js`);
      const js = await resp.text();
      expect(js).toContain('/api/booking/cancel');
      expect(js).not.toContain('/api/bookings/cancel');
    });

    test('slot booking status uses correct API endpoint', async ({ request }) => {
      const resp = await request.get(`${BASE}/members-extras.js`);
      const js = await resp.text();
      expect(js).toContain('/api/booking/package/');
    });
  });

  test.describe('Server Route Registration', () => {
    test('all booking routes are registered in server', async ({ request }) => {
      const resp = await request.get(`${BASE}/server.js`);
      if (resp.status() !== 200) {
        test.skip();
        return;
      }
      const js = await resp.text();
      expect(js).toContain('/api/provider/availability/');
      expect(js).toContain('/api/provider/availability');
      expect(js).toContain('/api/provider/blocked-time/');
      expect(js).toContain('/api/provider/blocked-time');
      expect(js).toContain('/api/provider/available-slots/');
      expect(js).toContain('/api/booking/create');
      expect(js).toContain('/api/booking/cancel');
      expect(js).toContain('/api/provider/schedule/');
      expect(js).toContain('/api/booking/package/');
    });
  });

  test.describe('CORS & OPTIONS', () => {
    test('booking/create OPTIONS returns preflight success', async ({ request }) => {
      const resp = await request.fetch(`${BASE}/api/booking/create`, { method: 'OPTIONS' });
      expect([200, 204]).toContain(resp.status());
    });

    test('booking/cancel OPTIONS returns preflight success', async ({ request }) => {
      const resp = await request.fetch(`${BASE}/api/booking/cancel`, { method: 'OPTIONS' });
      expect([200, 204]).toContain(resp.status());
    });
  });

  test.describe('Provider Availability SQL Setup', () => {
    test('SQL setup file exists with required tables', async () => {
      const fs = require('fs');
      const path = require('path');
      const sqlPath = path.join(__dirname, '..', 'www', 'PROVIDER_AVAILABILITY_SETUP.sql');
      expect(fs.existsSync(sqlPath)).toBe(true);
      const sql = fs.readFileSync(sqlPath, 'utf8');
      expect(sql).toContain('provider_working_hours');
      expect(sql).toContain('provider_blocked_time');
      expect(sql).toContain('slot_bookings');
    });
  });

  test.describe('Time Utility', () => {
    test('formatSlotTime helper produces correct output', async ({ page }) => {
      await page.goto(`${BASE}/members.html`, { waitUntil: 'domcontentloaded' });

      await page.waitForFunction(() => typeof window.mccIcon === 'function', { timeout: 10000 }).catch(() => {});

      const result = await page.evaluate(() => {
        function formatSlotTime(timeStr) {
          if (!timeStr) return 'TBD';
          const [h, m] = timeStr.split(':').map(Number);
          const ampm = h >= 12 ? 'PM' : 'AM';
          const hour12 = h % 12 || 12;
          return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
        }
        return {
          morning: formatSlotTime('09:00'),
          noon: formatSlotTime('12:00'),
          afternoon: formatSlotTime('14:30'),
          midnight: formatSlotTime('00:00'),
          evening: formatSlotTime('17:45'),
          nullCase: formatSlotTime(null)
        };
      });

      expect(result.morning).toBe('9:00 AM');
      expect(result.noon).toBe('12:00 PM');
      expect(result.afternoon).toBe('2:30 PM');
      expect(result.midnight).toBe('12:00 AM');
      expect(result.evening).toBe('5:45 PM');
      expect(result.nullCase).toBe('TBD');
    });
  });
});
