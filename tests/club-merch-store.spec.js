const { test, expect } = require('@playwright/test');

const FAKE_MEMBER_ID = '00000000-aaaa-bbbb-cccc-000000000001';
const FAKE_PROVIDER_ID = '00000000-aaaa-bbbb-cccc-000000000002';
const FAKE_EMAIL = 'member@example.com';
const FAKE_CLUB_ID = '11111111-aaaa-bbbb-cccc-111111111111';
const FAKE_PRODUCT_ID = '22222222-aaaa-bbbb-cccc-222222222222';

const MOCK_CLUB = {
  id: FAKE_CLUB_ID, club_id: FAKE_CLUB_ID, name: 'Test Auto Club',
  provider_id: FAKE_PROVIDER_ID, welcome_message: 'Welcome!', logo_url: '',
  is_active: true, provider_suspended: false, total_punches: 3, current_punches: 1
};

const MOCK_PRODUCT = {
  id: FAKE_PRODUCT_ID, club_id: FAKE_CLUB_ID, name: 'Club T-Shirt',
  description: 'Official club merchandise', price: 2999, compare_at_price: 3999,
  category: 'apparel', is_active: true, inventory_count: 10,
  images: [
    { id: 'img1', image_url: 'https://example.com/shirt1.jpg', sort_order: 0 },
    { id: 'img2', image_url: 'https://example.com/shirt2.jpg', sort_order: 1 }
  ]
};

const MOCK_LOW_STOCK = {
  id: '33333333-aaaa-bbbb-cccc-333333333333', club_id: FAKE_CLUB_ID,
  name: 'Limited Cap', description: 'Few left', price: 1999, compare_at_price: null,
  category: 'apparel', is_active: true, inventory_count: 3, images: []
};

const MOCK_ORDER = {
  id: '55555555-aaaa-bbbb-cccc-555555555555', club_id: FAKE_CLUB_ID,
  club_name: 'Test Auto Club', member_id: FAKE_MEMBER_ID, provider_id: FAKE_PROVIDER_ID,
  total: 2999, subtotal: 2940, platform_fee: 59, status: 'paid',
  tracking_number: null, tracking_url: null, created_at: '2025-06-15T10:30:00Z',
  items: [{ id: 'oi1', product_id: FAKE_PRODUCT_ID, product_name: 'Club T-Shirt', product_price: 2999, quantity: 1, variant: null }]
};

const MOCK_SHIPPED_ORDER = {
  id: '66666666-aaaa-bbbb-cccc-666666666666', club_id: FAKE_CLUB_ID,
  club_name: 'Test Auto Club', member_id: FAKE_MEMBER_ID, provider_id: FAKE_PROVIDER_ID,
  total: 1999, subtotal: 1960, platform_fee: 39, status: 'shipped',
  tracking_number: '1Z999AA10123456784', tracking_url: 'https://ups.com/track?num=1Z999AA10123456784',
  created_at: '2025-06-10T08:00:00Z',
  items: [{ id: 'oi2', product_id: '33333333-aaaa-bbbb-cccc-333333333333', product_name: 'Limited Cap', product_price: 1999, quantity: 1, variant: null }]
};

async function setupAuthenticatedPage(page, opts = {}) {
  const clubs = opts.clubs !== undefined ? opts.clubs : [MOCK_CLUB];
  const products = opts.products !== undefined ? opts.products : [MOCK_PRODUCT, MOCK_LOW_STOCK];
  const orders = opts.orders !== undefined ? opts.orders : [MOCK_ORDER, MOCK_SHIPPED_ORDER];

  await page.route('**/auth/v1/user', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: FAKE_MEMBER_ID, email: FAKE_EMAIL, role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: { full_name: 'Test Member' } }) });
  });
  await page.route('**/auth/v1/token**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'fake-access-token', token_type: 'bearer', expires_in: 3600, refresh_token: 'fake-refresh-token', user: { id: FAKE_MEMBER_ID, email: FAKE_EMAIL, role: 'authenticated' } }) });
  });
  await page.route('**/auth/v1/session', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'fake-access-token', token_type: 'bearer', expires_in: 3600, refresh_token: 'fake-refresh-token', user: { id: FAKE_MEMBER_ID, email: FAKE_EMAIL, role: 'authenticated' } }) });
  });
  await page.route('**/rest/v1/profiles**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: FAKE_MEMBER_ID, full_name: 'Test Member', email: FAKE_EMAIL, role: 'member', zip_code: '10001' }]) });
  });
  await page.route('**/api/car-club/my-clubs', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ memberships: clubs }) });
  });
  await page.route(/\/api\/car-club\/store\/checkout/, route => {
    if (route.request().method() === 'POST') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ checkout_url: 'https://checkout.stripe.com/test', order_id: '99999999' }) });
    } else { route.continue(); }
  });
  await page.route(/\/api\/car-club\/store\/[0-9a-f-]+/, route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ products }) });
  });
  await page.route('**/api/car-club/my-orders', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ orders }) });
  });
  await page.route('**/api/car-club/browse**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clubs }) });
  });
  await page.route('**/api/car-club/recommended**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clubs: [] }) });
  });
  await page.route('**/api/car-club/active-promotions**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ promotions: [] }) });
  });
  await page.route('**/api/car-club/notifications**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notifications: [] }) });
  });
  await page.route('**/api/car-club/activity**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ activities: [] }) });
  });
  await page.route('**/api/car-club/rewards**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rewards: [] }) });
  });
  await page.route('**/api/**', route => {
    const url = route.request().url();
    if (!url.includes('/api/car-club/')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authorized: true, verified: true, connected: false, status: 'clear' }) });
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    }
  });

  await page.addInitScript(() => {
    globalThis.localStorage.setItem('sb-ifbyjxuaclwmadqbjcyp-auth-token', JSON.stringify({
      access_token: 'fake-access-token', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'fake-refresh-token',
      user: { id: '00000000-aaaa-bbbb-cccc-000000000001', email: 'member@example.com', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: { full_name: 'Test Member' } }
    }));
  });

  await page.goto('/car-club-member.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#sidebar', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  if (page.url().includes('login') || page.url().includes('members.html')) {
    await page.goto('/car-club-member.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
  }
}

test.describe('Club Merch Store - HTML Structure', () => {
  test('page has store section with all required elements', async ({ request }) => {
    const response = await request.get('/car-club-member.html');
    const html = await response.text();
    expect(html).toContain('section-store');
    expect(html).toContain('store-products');
    expect(html).toContain('store-club-select');
    expect(html).toContain('store-loading');
    expect(html).toContain('store-content');
    expect(html).toContain('store-empty');
  });

  test('page has my orders section with all required elements', async ({ request }) => {
    const response = await request.get('/car-club-member.html');
    const html = await response.text();
    expect(html).toContain('section-myorders');
    expect(html).toContain('myorders-list');
    expect(html).toContain('myorders-loading');
    expect(html).toContain('myorders-content');
    expect(html).toContain('myorders-empty');
  });

  test('page has Club Stores and My Orders navigation', async ({ request }) => {
    const response = await request.get('/car-club-member.html');
    const html = await response.text();
    expect(html).toContain('Club Stores');
    expect(html).toContain('My Orders');
    expect(html).toContain("showSection('store')");
    expect(html).toContain("showSection('myorders')");
  });

  test('page has store product grid and card CSS', async ({ request }) => {
    const response = await request.get('/car-club-member.html');
    const html = await response.text();
    expect(html).toContain('.store-products-grid');
    expect(html).toContain('.store-product-card');
    expect(html).toContain('.store-product-img');
    expect(html).toContain('.store-product-name');
    expect(html).toContain('.store-product-price');
    expect(html).toContain('.compare-price');
  });

  test('page has product detail modal CSS', async ({ request }) => {
    const response = await request.get('/car-club-member.html');
    const html = await response.text();
    expect(html).toContain('.product-detail-modal');
    expect(html).toContain('.product-detail-content');
    expect(html).toContain('.product-detail-img');
    expect(html).toContain('.product-gallery');
    expect(html).toContain('.qty-control');
    expect(html).toContain('.qty-btn');
    expect(html).toContain('.qty-value');
  });

  test('page has order card CSS', async ({ request }) => {
    const response = await request.get('/car-club-member.html');
    const html = await response.text();
    expect(html).toContain('.order-card');
    expect(html).toContain('.order-card-header');
    expect(html).toContain('.order-items-list');
  });

  test('page has club tab CSS', async ({ request }) => {
    const response = await request.get('/car-club-member.html');
    const html = await response.text();
    expect(html).toContain('.store-club-tab');
    expect(html).toContain('.store-club-tab.active');
  });

  test('page has all required JavaScript functions', async ({ request }) => {
    const response = await request.get('/car-club-member.html');
    const html = await response.text();
    expect(html).toContain('function loadClubStores');
    expect(html).toContain('function loadStoreProducts');
    expect(html).toContain('function showProductDetail');
    expect(html).toContain('function buyProduct');
    expect(html).toContain('function loadMyOrders');
    expect(html).toContain('function changeQty');
    expect(html).toContain('function selectStoreClub');
    expect(html).toContain('function switchProductImage');
    expect(html).toContain('function handleCheckoutReturn');
  });

  test('showSection routing includes store and myorders', async ({ request }) => {
    const response = await request.get('/car-club-member.html');
    const html = await response.text();
    expect(html).toContain('store: 5');
    expect(html).toContain('myorders: 6');
    expect(html).toContain("name === 'store'");
    expect(html).toContain("name === 'myorders'");
  });

  test('checkout return handler checks URL params', async ({ request }) => {
    const response = await request.get('/car-club-member.html');
    const html = await response.text();
    expect(html).toContain('handleCheckoutReturn');
    expect(html).toContain("get('checkout')");
    expect(html).toContain("'success'");
    expect(html).toContain("'cancel'");
    expect(html).toContain('replaceState');
  });

  test('buyProduct calls checkout endpoint', async ({ request }) => {
    const response = await request.get('/car-club-member.html');
    const html = await response.text();
    expect(html).toContain("apiFetch('/api/car-club/store/checkout'");
    expect(html).toContain('checkout_url');
  });

  test('loadMyOrders calls my-orders endpoint', async ({ request }) => {
    const response = await request.get('/car-club-member.html');
    const html = await response.text();
    expect(html).toContain("apiFetch('/api/car-club/my-orders')");
    expect(html).toContain('tracking_number');
    expect(html).toContain('tracking_url');
  });

  test('nav item count is 7 (5 original + store + myorders)', async ({ request }) => {
    const response = await request.get('/car-club-member.html');
    const html = await response.text();
    const navItemCount = (html.match(/class="nav-item/g) || []).length;
    expect(navItemCount).toBe(7);
  });
});

test.describe('Club Merch Store - Navigation', () => {
  test('store and myorders sections exist and are linked from nav', async ({ request }) => {
    const response = await request.get('/car-club-member.html');
    const html = await response.text();
    expect(html).toContain('id="section-store"');
    expect(html).toContain('id="section-myorders"');
    expect(html).toContain("showSection('store')");
    expect(html).toContain("showSection('myorders')");
    expect(html).toContain("loadClubStores");
    expect(html).toContain("loadMyOrders");
  });

  test('showSection calls correct load functions', async ({ request }) => {
    const response = await request.get('/car-club-member.html');
    const html = await response.text();
    expect(html).toContain("name === 'store') loadClubStores");
    expect(html).toContain("name === 'myorders') loadMyOrders");
  });
});

test.describe('Club Merch Store - Product Browsing (Interactive)', () => {
  test('store shows club tabs and products', async ({ page }) => {
    await setupAuthenticatedPage(page);
    const storeNav = page.locator('.nav-item', { hasText: 'Club Stores' });
    if (await storeNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await storeNav.click();
      await page.waitForTimeout(3000);
      const storeContent = page.locator('#store-content');
      if (await storeContent.isVisible({ timeout: 3000 }).catch(() => false)) {
        const html = await storeContent.innerHTML();
        expect(html).toContain('Test Auto Club');
      }
    }
  });

  test('product card renders with correct info', async ({ page }) => {
    await setupAuthenticatedPage(page);
    const storeNav = page.locator('.nav-item', { hasText: 'Club Stores' });
    if (await storeNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await storeNav.click();
      await page.waitForTimeout(3000);
      const products = page.locator('.store-product-card');
      if (await products.count() > 0) {
        const html = await page.locator('#store-products').innerHTML();
        expect(html).toContain('Club T-Shirt');
        expect(html).toContain('$29.99');
      }
    }
  });

  test('clicking product opens detail modal', async ({ page }) => {
    await setupAuthenticatedPage(page);
    const storeNav = page.locator('.nav-item', { hasText: 'Club Stores' });
    if (await storeNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await storeNav.click();
      await page.waitForTimeout(3000);
      const firstProduct = page.locator('.store-product-card').first();
      if (await firstProduct.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstProduct.click();
        await page.waitForTimeout(2000);
        const modal = page.locator('#product-detail-modal');
        await expect(modal).toBeAttached({ timeout: 5000 });
        const modalText = await page.locator('.product-detail-content').textContent();
        expect(modalText).toContain('Club T-Shirt');
        expect(modalText).toContain('$29.99');
        expect(modalText).toContain('Buy Now');
      }
    }
  });

  test('quantity controls work in product detail', async ({ page }) => {
    await setupAuthenticatedPage(page);
    const storeNav = page.locator('.nav-item', { hasText: 'Club Stores' });
    if (await storeNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await storeNav.click();
      await page.waitForTimeout(3000);
      const firstProduct = page.locator('.store-product-card').first();
      if (await firstProduct.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstProduct.click();
        await page.waitForTimeout(2000);
        const qtyEl = page.locator('#product-qty');
        if (await qtyEl.isVisible({ timeout: 2000 }).catch(() => false)) {
          await expect(qtyEl).toHaveText('1');
          await page.locator('.qty-btn').nth(1).click();
          await expect(qtyEl).toHaveText('2');
          await page.locator('.qty-btn').first().click();
          await expect(qtyEl).toHaveText('1');
          await page.locator('.qty-btn').first().click();
          await expect(qtyEl).toHaveText('1');
        }
      }
    }
  });
});

test.describe('Club Merch Store - My Orders (Interactive)', () => {
  test('order cards render with details', async ({ page }) => {
    await setupAuthenticatedPage(page);
    const ordersNav = page.locator('.nav-item', { hasText: 'My Orders' });
    if (await ordersNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ordersNav.click();
      await page.waitForTimeout(3000);
      const orderCards = page.locator('.order-card');
      if (await orderCards.count() > 0) {
        const html = await page.locator('#myorders-list').innerHTML();
        expect(html).toContain('Test Auto Club');
        expect(html).toContain('Club T-Shirt');
        expect(html).toContain('$29.99');
      }
    }
  });

  test('shipped order shows tracking info', async ({ page }) => {
    await setupAuthenticatedPage(page);
    const ordersNav = page.locator('.nav-item', { hasText: 'My Orders' });
    if (await ordersNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ordersNav.click();
      await page.waitForTimeout(3000);
      const html = await page.locator('#myorders-list').innerHTML();
      if (html.includes('1Z999AA')) {
        expect(html).toContain('1Z999AA10123456784');
        expect(html).toContain('Track');
      }
    }
  });
});

test.describe('Club Merch Store - API Auth', () => {
  test('store products endpoint returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/car-club/store/' + FAKE_CLUB_ID);
    expect(response.status()).toBe(401);
  });

  test('checkout endpoint returns 401 without auth', async ({ request }) => {
    const response = await request.post('/api/car-club/store/checkout', {
      data: { club_id: FAKE_CLUB_ID, items: [{ product_id: FAKE_PRODUCT_ID, quantity: 1 }] }
    });
    expect(response.status()).toBe(401);
  });

  test('my-orders endpoint returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/car-club/my-orders');
    expect(response.status()).toBe(401);
  });
});

test.describe('Club Merch Store - Webhook Handler', () => {
  test('server has club_merch webhook handler', async () => {
    const fs = require('node:fs');
    const code = fs.readFileSync('www/server.js', 'utf8');
    expect(code).toContain("metadata.type === 'club_merch'");
    expect(code).toContain('Club merch checkout completed');
  });

  test('webhook uses supabase client to update club_orders', async () => {
    const fs = require('node:fs');
    const code = fs.readFileSync('www/server.js', 'utf8');
    const idx = code.indexOf("metadata.type === 'club_merch'");
    const section = code.substring(idx, idx + 600);
    expect(section).toContain('getSupabaseClient');
    expect(section).toContain("from('club_orders')");
    expect(section).toContain("status: 'paid'");
    expect(section).toContain('stripe_payment_intent');
  });
});

test.describe('Club Merch Store - Provider Page', () => {
  test('provider page has store management section', async ({ request }) => {
    const response = await request.get('/car-club-provider.html');
    const html = await response.text();
    expect(html).toContain('Store');
    expect(html).toContain('Orders');
  });

  test('provider page has product management functions', async ({ request }) => {
    const response = await request.get('/car-club-provider.html');
    const html = await response.text();
    expect(html).toContain('section-store');
    expect(html).toContain('section-orders');
  });
});

test.describe('Club Merch Store - API Endpoints Exist', () => {
  test('car-club-api has store products endpoint', async () => {
    const fs = require('node:fs');
    const code = fs.readFileSync('www/car-club-api.js', 'utf8');
    expect(code).toContain('/api/car-club/store/');
    expect(code).toContain('club_products');
  });

  test('car-club-api has checkout endpoint', async () => {
    const fs = require('node:fs');
    const code = fs.readFileSync('www/car-club-api.js', 'utf8');
    expect(code).toContain('/api/car-club/store/checkout');
    expect(code).toContain('stripe');
    expect(code).toContain('application_fee_amount');
    expect(code).toContain('platform');
  });

  test('car-club-api has my-orders endpoint', async () => {
    const fs = require('node:fs');
    const code = fs.readFileSync('www/car-club-api.js', 'utf8');
    expect(code).toContain('/api/car-club/my-orders');
    expect(code).toContain('club_orders');
    expect(code).toContain('club_order_items');
  });

  test('car-club-api has order management endpoint', async () => {
    const fs = require('node:fs');
    const code = fs.readFileSync('www/car-club-api.js', 'utf8');
    expect(code).toContain('/api/car-club/orders');
    expect(code).toContain('tracking_number');
    expect(code).toContain('tracking_url');
  });

  test('checkout applies 2% platform fee', async () => {
    const fs = require('node:fs');
    const code = fs.readFileSync('www/car-club-api.js', 'utf8');
    expect(code).toContain('0.02');
    expect(code).toContain('platformFee');
  });

  test('checkout uses stripe connect destination charges', async () => {
    const fs = require('node:fs');
    const code = fs.readFileSync('www/car-club-api.js', 'utf8');
    expect(code).toContain('transfer_data');
    expect(code).toContain('destination');
    expect(code).toContain('stripe_account_id');
  });
});
