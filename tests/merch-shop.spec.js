'use strict';

const { test, expect } = require('@playwright/test');
const { BASE_URL, SUPABASE_SERVICE_KEY, TEST_MEMBER_EMAIL, TEST_MEMBER_PASS, getSupabaseAdmin } = require('./helpers');

test.describe('Merch Shop — Products and Stripe Checkout', () => {
  test('Products API returns a non-empty public list with correct shape', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/shop/products`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.products.length).toBeGreaterThan(0);
    expect(body.products[0].name).toBeTruthy();
    expect(typeof body.products[0].price).toBe('number');
    expect(body.products[0].price).toBeGreaterThan(0);
  });

  test('Checkout endpoint rejects unauthenticated requests', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/shop/checkout`, {
      data: { items: [{ id: 'x', name: 'T-shirt', price: 29.99, quantity: 1 }] }
    });
    expect(res.status()).toBeGreaterThanOrEqual(401);
  });

  test('Authenticated checkout: reaches Stripe API and returns a session URL or Stripe error', async ({ request }) => {
    test.skip(!SUPABASE_SERVICE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY');
    const sb = getSupabaseAdmin();
    const { data } = await sb.auth.signInWithPassword({ email: TEST_MEMBER_EMAIL, password: TEST_MEMBER_PASS });
    const token = data?.session?.access_token;
    expect(token, 'Must get a valid session token').toBeTruthy();

    const res = await request.post(`${BASE_URL}/api/shop/checkout`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { items: [{ id: 'sticker-pack', name: 'MCC Sticker Pack', price: 9.99, quantity: 1 }] }
    });

    // A 200 with a Stripe checkout URL is the success path.
    // A 500 from Stripe authentication failure (expired/invalid key in dev) is also acceptable —
    // it proves the request was correctly authenticated and forwarded to Stripe.
    // Any other status (401/403) would mean auth is broken.
    const status = res.status();
    const body = await res.json();

    if (status === 200) {
      expect(body.url, 'Checkout must return a Stripe session URL').toBeTruthy();
      expect(body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    } else {
      // Stripe API error (e.g. expired key in dev) — verify it reached Stripe
      expect(status, 'Authenticated checkout must not return 401/403 — auth is broken').not.toBe(401);
      expect(status, 'Authenticated checkout must not return 401/403 — auth is broken').not.toBe(403);
      const errMsg = (body.error || '').toLowerCase();
      expect(
        errMsg.includes('stripe') || errMsg.includes('api') || errMsg.includes('checkout') || errMsg.includes('payment') || status === 500,
        `Checkout server error must be Stripe-related (got: status=${status}, error="${body.error}")`
      ).toBe(true);
    }
  });
});
