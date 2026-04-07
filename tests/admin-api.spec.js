'use strict';

const { test, expect } = require('@playwright/test');
const { BASE_URL, ADMIN_PASSWORD } = require('./helpers');

test.describe('Admin Stats API — Authentication Gate', () => {
  for (const endpoint of ['overview', 'revenue', 'users', 'orders']) {
    test(`/api/admin/stats/${endpoint}: 401 without credentials`, async ({ request }) => {
      const res = await request.get(`${BASE_URL}/api/admin/stats/${endpoint}`);
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test(`/api/admin/stats/${endpoint}: 200 with admin password`, async ({ request }) => {
      test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD not set');
      const res = await request.get(`${BASE_URL}/api/admin/stats/${endpoint}?period=month`, {
        headers: { 'x-admin-password': ADMIN_PASSWORD }
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  }

  test('Overview: returns real counts with admin auth', async ({ request }) => {
    test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD not set');
    const res = await request.get(`${BASE_URL}/api/admin/stats/overview`, {
      headers: { 'x-admin-password': ADMIN_PASSWORD }
    });
    const { data } = await res.json();
    expect(data.totalMembers).toBeGreaterThan(0);
    expect(data.totalProviders).toBeGreaterThan(0);
    expect(data.totalPackages).toBeGreaterThan(0);
  });
});
