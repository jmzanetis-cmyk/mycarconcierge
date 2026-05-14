const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const FAKE_PROVIDER_ID = '00000000-aaaa-bbbb-cccc-000000000002';
const FAKE_PROVIDER_EMAIL = 'provider@example.com';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

const providersHtmlContent = fs.readFileSync(path.join(__dirname, '..', 'www', 'providers.html'), 'utf8');
const providersAnalyticsJs = fs.readFileSync(path.join(__dirname, '..', 'www', 'providers-analytics.js'), 'utf8');
const serverJsContent = fs.readFileSync(path.join(__dirname, '..', 'www', 'server.js'), 'utf8');

test.describe('Provider Analytics Module', () => {

  test.describe('Earnings Analytics', () => {

    test('Earnings chart canvas element exists in providers.html', async () => {
      expect(providersHtmlContent).toContain('id="earnings-chart"');
      expect(providersHtmlContent).toContain('<canvas');
    });

    test('Source code processes monthly payment data with revenue and tips', async () => {
      expect(providersAnalyticsJs).toContain("from('payments')");
      expect(providersAnalyticsJs).toContain('monthlyData');
      expect(providersAnalyticsJs).toContain('revenue');
      expect(providersAnalyticsJs).toContain('tips');
      expect(providersAnalyticsJs).toContain("month: 'short'");
      expect(providersAnalyticsJs).toContain('amount_provider');
      expect(providersAnalyticsJs).toContain('tip_amount');
    });

    test('Empty earnings state shows proper message', async () => {
      expect(providersAnalyticsJs).toContain('renderEmptyEarningsChart');
      expect(providersAnalyticsJs).toContain('No earnings data yet');
      expect(providersAnalyticsJs).toContain('Complete jobs to see your analytics');
    });

    test('Earnings summary elements referenced in source code', async () => {
      expect(providersAnalyticsJs).toContain("getElementById('analytics-total-revenue')");
      expect(providersAnalyticsJs).toContain("getElementById('analytics-total-tips')");
      expect(providersAnalyticsJs).toContain("getElementById('analytics-avg-job')");
      expect(providersAnalyticsJs).toContain("getElementById('analytics-jobs-count')");
    });

  });

  test.describe('Advanced Analytics', () => {

    test('Service breakdown chart exists with doughnut type', async () => {
      expect(providersAnalyticsJs).toContain("getElementById('service-breakdown-chart')");
      expect(providersAnalyticsJs).toContain("type: 'doughnut'");
    });

    test('Performance trends chart exists with line type', async () => {
      expect(providersAnalyticsJs).toContain("getElementById('performance-trend-chart')");
      expect(providersAnalyticsJs).toContain("type: 'line'");
    });

    test('Performance trends use reviews data with monthly average ratings scale 0-5', async () => {
      expect(providersAnalyticsJs).toContain("from('reviews')");
      expect(providersAnalyticsJs).toContain('monthlyRatings');
      expect(providersAnalyticsJs).toContain('avgRatings');
      expect(providersAnalyticsJs).toContain('min: 0');
      expect(providersAnalyticsJs).toContain('max: 5');
    });

  });

  test.describe('POS Analytics', () => {

    test('POS transaction summary elements referenced in source code', async () => {
      expect(providersAnalyticsJs).toContain("getElementById('pos-total-transactions')");
      expect(providersAnalyticsJs).toContain("getElementById('pos-total-revenue')");
      expect(providersAnalyticsJs).toContain("getElementById('pos-avg-ticket')");
    });

    test('POS revenue chart exists in source code', async () => {
      expect(providersAnalyticsJs).toContain("getElementById('pos-revenue-chart')");
      expect(providersAnalyticsJs).toContain('loadPosRevenueChart');
    });

    test('Clover and Square transaction counts displayed', async () => {
      expect(providersAnalyticsJs).toContain("getElementById('pos-clover-count')");
      expect(providersAnalyticsJs).toContain("getElementById('pos-square-count')");
      expect(providersAnalyticsJs).toContain('cloverTx.length');
      expect(providersAnalyticsJs).toContain('squareTx.length');
    });

    test('POS transactions table body exists in providers.html', async () => {
      expect(providersHtmlContent).toContain('id="all-pos-transactions-body"');
    });

    test('POS endpoints exist in server', async () => {
      expect(serverJsContent).toContain('/api/clover/transactions/');
      expect(serverJsContent).toContain('/api/square/transactions/');
      expect(serverJsContent).toContain('/api/pos/transactions/');
    });

  });

  test.describe('Export Functions', () => {

    test('Export earnings report function exists in source code', async () => {
      expect(providersAnalyticsJs).toContain('async function exportEarningsReport()');
      expect(providersAnalyticsJs).toContain("from('payments')");
      expect(providersAnalyticsJs).toContain('Report exported!');
    });

    test('CSV export includes Date, Package, Amount, Status headers', async () => {
      expect(providersAnalyticsJs).toContain("'Date'");
      expect(providersAnalyticsJs).toContain("'Package'");
      expect(providersAnalyticsJs).toContain("'Amount'");
      expect(providersAnalyticsJs).toContain("'Status'");
      expect(providersAnalyticsJs).toContain(".join(',')");
    });

    test('Export creates downloadable blob with correct filename pattern', async () => {
      expect(providersAnalyticsJs).toContain("new Blob([csv], { type: 'text/csv' })");
      expect(providersAnalyticsJs).toContain('URL.createObjectURL');
      expect(providersAnalyticsJs).toContain('earnings-report-');
      expect(providersAnalyticsJs).toContain(".download = `earnings-report-");
      expect(providersAnalyticsJs).toContain('.csv');
    });

  });

  test.describe('Chart Configuration', () => {

    test('All charts use responsive: true', async () => {
      const responsiveMatches = providersAnalyticsJs.match(/responsive:\s*true/g) || [];
      expect(responsiveMatches.length).toBeGreaterThanOrEqual(3);
    });

    test('Charts use brand colors gold and green', async () => {
      expect(providersAnalyticsJs).toContain('#c9a227');
      expect(providersAnalyticsJs).toContain('rgba(201, 162, 39');
      expect(providersAnalyticsJs).toContain('#34d399');
      expect(providersAnalyticsJs).toContain('rgba(52, 211, 153');
    });

    test('Y-axis ticks format as currency with dollar prefix', async () => {
      const currencyCallbacks = providersAnalyticsJs.match(/callback:\s*value\s*=>\s*'\$'\s*\+\s*value/g) || [];
      expect(currencyCallbacks.length).toBeGreaterThanOrEqual(2);
    });

  });

});
