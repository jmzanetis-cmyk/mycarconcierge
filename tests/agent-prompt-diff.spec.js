'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Task #176 — Side-by-side diff for prompt versions in the agent-fleet detail
// page. Mocks every /api/admin/agent-fleet/* route the page touches, then:
//   • verifies the new "Compare" picker renders when there are >=2 versions,
//   • clicks a non-active history row → asserts the diff panel renders with
//     +/− line markers,
//   • picks two versions in the dropdowns and clicks "Compare" → asserts the
//     diff panel re-renders with the picked pair,
//   • verifies the diff panel closes via the "Close diff" button.
// ─────────────────────────────────────────────────────────────────────────────

const { test, expect } = require('@playwright/test');
const { BASE_URL, ADMIN_PASSWORD } = require('./helpers');

test.describe('Agent Fleet detail — prompt-version diff viewer (T#176)', () => {
  test.beforeEach(({ page }) => {
    test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env required');
    page.on('dialog', d => d.accept()); // auto-confirm any rollback prompts
  });

  test('diff panel renders when an older version row is clicked', async ({ page }) => {
    const slug = 'analyst';
    const v1Body = 'You are an analyst.\nKeep answers concise.\nUse bullet points when helpful.\n';
    const v2Body = 'You are an analyst agent.\nKeep answers concise and direct.\nUse bullet points when helpful.\nAlways cite sources.\n';
    const v3Body = 'You are an analyst agent.\nKeep answers concise and direct.\nUse bullet points when helpful.\nAlways cite sources.\nReturn JSON when asked.\n';

    const versionsList = [
      { id: 3, version: 3, notes: 'Add JSON note',  is_active: true,  created_at: '2026-04-29T10:00:00Z', created_by: 'admin' },
      { id: 2, version: 2, notes: 'Cite sources',   is_active: false, created_at: '2026-04-28T10:00:00Z', created_by: 'admin' },
      { id: 1, version: 1, notes: 'Initial import', is_active: false, created_at: '2026-04-27T10:00:00Z', created_by: 'admin' }
    ];

    const bodyByVersion = { 1: v1Body, 2: v2Body, 3: v3Body };
    const versionFetches = []; // capture which per-version routes are hit

    await page.route('**/api/admin/agent-fleet/**', async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();
      const headers = req.headers();
      if (!headers['x-admin-password']) {
        return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Unauthorized' }) });
      }

      const pathPart = url.split('/api/admin/agent-fleet')[1] || '';

      // GET /agents
      if (method === 'GET' && pathPart.startsWith('/agents') && !pathPart.includes('/prompt')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          agents: [{
            slug, display_name: 'Analyst', enabled: true, autonomy: 'propose',
            daily_spend_cap_usd: 5, model: 'claude-sonnet-4',
            description: 'Test', triggers: ['nightly.tick'],
            today_spend: { actual_usd: 0, reserved_usd: 0, call_count: 0 }
          }]
        }) });
      }
      // GET /agents/:slug/prompt   → currently active
      if (method === 'GET' && /\/agents\/[^/]+\/prompt$/.test(pathPart)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          active: { id: 3, version: 3, body: v3Body, notes: 'Add JSON note', is_active: true, created_at: '2026-04-29T10:00:00Z' }
        }) });
      }
      // GET /agents/:slug/prompt-history
      if (method === 'GET' && /\/agents\/[^/]+\/prompt-history$/.test(pathPart)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ versions: versionsList }) });
      }
      // GET /agents/:slug/prompt/:version  ← the new endpoint
      const versionMatch = pathPart.match(/^\/agents\/[^/]+\/prompt\/(\d+)$/);
      if (method === 'GET' && versionMatch) {
        const v = Number.parseInt(versionMatch[1], 10);
        versionFetches.push(v);
        const body = bodyByVersion[v];
        if (body == null) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Version not found' }) });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          version: { id: v, version: v, body, notes: versionsList.find(x => x.version === v)?.notes, is_active: v === 3, created_at: versionsList.find(x => x.version === v)?.created_at }
        }) });
      }
      // The detail page also hits /actions, /spend, /memory, /briefing on load.
      if (method === 'GET' && pathPart.startsWith('/actions'))  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ actions: [], total: 0, limit: 50, offset: 0 }) });
      if (method === 'GET' && pathPart.startsWith('/spend'))    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ days: [] }) });
      if (method === 'GET' && pathPart.startsWith('/memory'))   return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], total: 0 }) });
      if (method === 'GET' && pathPart.startsWith('/briefing')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ briefing: null }) });

      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto(`${BASE_URL}/admin/agent-fleet-detail.html?slug=${slug}`);
    await page.waitForLoadState('domcontentloaded');

    // Sign in.
    await expect(page.locator('#loginShell')).toBeVisible();
    await page.locator('#pwInput').fill(ADMIN_PASSWORD);
    await page.locator('#pwSubmit').click();

    await expect(page.locator('#appShell')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#agentTitle')).toHaveText(/Analyst/i, { timeout: 10000 });

    // History list rendered with all three versions.
    await expect(page.locator('#promptHistory .version-row')).toHaveCount(3, { timeout: 10000 });

    // Compare picker is visible (>=2 versions).
    await expect(page.locator('#diffControls')).toBeVisible();
    await expect(page.locator('#diffLeft option')).toHaveCount(3);
    await expect(page.locator('#diffRight option')).toHaveCount(3);

    // Diff panel starts hidden.
    await expect(page.locator('#diffPanel')).toBeHidden();

    // Click on v1 (oldest) → diff renders against the active v3.
    await page.locator('#promptHistory .version-row[data-version="1"]').click();

    await expect(page.locator('#diffPanel')).toBeVisible({ timeout: 10000 });
    // Wait for the actual diff grid (not just the loading state).
    await expect(page.locator('#diffBody .diff-grid')).toBeVisible({ timeout: 10000 });

    // The diff summary should reference both versions.
    await expect(page.locator('#diffSummary')).toContainText('v1');
    await expect(page.locator('#diffSummary')).toContainText('v3');

    // There must be at least one removed and one added line between v1 and v3.
    expect(await page.locator('#diffBody .diff-cell.diff-rem').count()).toBeGreaterThan(0);
    expect(await page.locator('#diffBody .diff-cell.diff-add').count()).toBeGreaterThan(0);

    // The endpoint we added must have been called for both v1 and v3.
    expect(versionFetches.includes(1)).toBe(true);
    expect(versionFetches.includes(3)).toBe(true);

    // Close diff panel.
    await page.locator('#diffClose').click();
    await expect(page.locator('#diffPanel')).toBeHidden();

    // Pick v1 → v2 in the picker and click Compare.
    await page.locator('#diffLeft').selectOption('1');
    await page.locator('#diffRight').selectOption('2');
    await page.locator('#diffCompare').click();

    await expect(page.locator('#diffPanel')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#diffBody .diff-grid')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#diffSummary')).toContainText('v1');
    await expect(page.locator('#diffSummary')).toContainText('v2');

    // The endpoint should now also have been hit for v2 (cached for v1).
    expect(versionFetches.includes(2)).toBe(true);
  });

  test('clicking the active row diffs against the immediately-preceding version', async ({ page }) => {
    const slug = 'analyst';
    const v1Body = 'first\nsecond\n';
    const v2Body = 'first\nsecond v2\nthird new\n';
    const versionsList = [
      { id: 2, version: 2, notes: 'tweak', is_active: true,  created_at: '2026-04-29T10:00:00Z', created_by: 'admin' },
      { id: 1, version: 1, notes: 'init',  is_active: false, created_at: '2026-04-28T10:00:00Z', created_by: 'admin' }
    ];
    const bodyByVersion = { 1: v1Body, 2: v2Body };

    await page.route('**/api/admin/agent-fleet/**', async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();
      if (!req.headers()['x-admin-password']) {
        return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Unauthorized' }) });
      }
      const pathPart = url.split('/api/admin/agent-fleet')[1] || '';
      if (method === 'GET' && pathPart.startsWith('/agents') && !pathPart.includes('/prompt')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          agents: [{ slug, display_name: 'Analyst', enabled: true, autonomy: 'propose',
            daily_spend_cap_usd: 5, model: 'claude-sonnet-4', description: 'T', triggers: [],
            today_spend: { actual_usd: 0, reserved_usd: 0, call_count: 0 } }]
        }) });
      }
      if (method === 'GET' && /\/agents\/[^/]+\/prompt$/.test(pathPart)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          active: { id: 2, version: 2, body: v2Body, is_active: true, created_at: '2026-04-29T10:00:00Z' }
        }) });
      }
      if (method === 'GET' && /\/agents\/[^/]+\/prompt-history$/.test(pathPart)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ versions: versionsList }) });
      }
      const m = pathPart.match(/^\/agents\/[^/]+\/prompt\/(\d+)$/);
      if (method === 'GET' && m) {
        const v = Number.parseInt(m[1], 10);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          version: { id: v, version: v, body: bodyByVersion[v], is_active: v === 2, created_at: versionsList.find(x => x.version === v)?.created_at }
        }) });
      }
      if (method === 'GET' && pathPart.startsWith('/actions'))  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ actions: [], total: 0, limit: 50, offset: 0 }) });
      if (method === 'GET' && pathPart.startsWith('/spend'))    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ days: [] }) });
      if (method === 'GET' && pathPart.startsWith('/memory'))   return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], total: 0 }) });
      if (method === 'GET' && pathPart.startsWith('/briefing')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ briefing: null }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto(`${BASE_URL}/admin/agent-fleet-detail.html?slug=${slug}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#loginShell')).toBeVisible();
    await page.locator('#pwInput').fill(ADMIN_PASSWORD);
    await page.locator('#pwSubmit').click();
    await expect(page.locator('#appShell')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#promptHistory .version-row')).toHaveCount(2, { timeout: 10000 });

    // Click the active row (v2) — should still produce a diff (against v1).
    await page.locator('#promptHistory .version-row[data-version="2"]').click();
    await expect(page.locator('#diffPanel')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#diffBody .diff-grid')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#diffSummary')).toContainText('v1');
    await expect(page.locator('#diffSummary')).toContainText('v2');
  });
});
