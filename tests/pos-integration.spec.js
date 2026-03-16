const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const providersHtml = fs.readFileSync(path.join(__dirname, '..', 'www', 'providers.html'), 'utf8');
const providersJs = fs.readFileSync(path.join(__dirname, '..', 'www', 'providers.js'), 'utf8');
const providersAnalyticsJs = fs.readFileSync(path.join(__dirname, '..', 'www', 'providers-analytics.js'), 'utf8');
const providersCoreJs = fs.readFileSync(path.join(__dirname, '..', 'www', 'providers-core.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(__dirname, '..', 'www', 'server.js'), 'utf8');

test.describe('POS Integration - Walk-In System', () => {

  test.describe('POS Stepper UI Elements', () => {

    test('POS stepper container and progress line exist', async () => {
      expect(providersHtml).toContain('id="pos-stepper"');
      expect(providersHtml).toContain('id="pos-stepper-fill"');
      expect(providersHtml).toContain('pos-stepper-line');
      expect(providersHtml).toContain('pos-stepper-line-fill');
    });

    test('All 6 POS step content sections exist', async () => {
      expect(providersHtml).toContain('id="pos-step-1"');
      expect(providersHtml).toContain('id="pos-step-2"');
      expect(providersHtml).toContain('id="pos-step-3"');
      expect(providersHtml).toContain('id="pos-step-4"');
      expect(providersHtml).toContain('id="pos-step-5"');
      expect(providersHtml).toContain('id="pos-step-6"');
    });

    test('Step navigation function handles all steps', async () => {
      expect(providersJs).toContain('function posGoToStep(step)');
      expect(providersJs).toContain('pos-step-content');
      expect(providersJs).toContain('pos-stepper-fill');
    });

  });

  test.describe('Step 1 - Phone Lookup', () => {

    test('Phone input field exists with correct attributes', async () => {
      expect(providersHtml).toContain('id="pos-phone"');
      expect(providersHtml).toContain('type="tel"');
      expect(providersHtml).toContain('pos-input-lg');
      expect(providersHtml).toContain('maxlength="14"');
    });

    test('Lookup button exists and triggers posLookupCustomer', async () => {
      expect(providersHtml).toContain('id="pos-lookup-btn"');
      expect(providersHtml).toContain('posLookupCustomer()');
    });

    test('Phone error display element exists', async () => {
      expect(providersHtml).toContain('id="pos-phone-error"');
    });

    test('Customer lookup function exists in source code', async () => {
      expect(providersJs).toContain('async function posLookupCustomer()');
    });

    test('Phone formatter function exists', async () => {
      expect(providersJs).toContain('function posFormatPhone(value)');
    });

    test('QR scanner modal exists', async () => {
      expect(providersHtml).toContain('id="pos-qr-scanner-modal"');
      expect(providersHtml).toContain('id="pos-qr-reader"');
      expect(providersHtml).toContain('id="pos-qr-scanner-status"');
    });

  });

  test.describe('Step 2 - OTP Verification', () => {

    test('OTP display and input elements exist', async () => {
      expect(providersHtml).toContain('id="pos-otp-section"');
      expect(providersHtml).toContain('id="pos-otp-display-box"');
      expect(providersHtml).toContain('id="pos-otp-display"');
      expect(providersHtml).toContain('id="pos-otp-input"');
    });

    test('OTP resend button exists', async () => {
      expect(providersHtml).toContain('id="pos-resend-btn"');
      expect(providersHtml).toContain('posResendOtp()');
    });

    test('Verify button exists and triggers posVerifyOtp', async () => {
      expect(providersHtml).toContain('id="pos-verify-btn"');
      expect(providersHtml).toContain('posVerifyOtp()');
    });

    test('OTP verification function exists', async () => {
      expect(providersJs).toContain('async function posVerifyOtp()');
    });

    test('OTP resend function exists', async () => {
      expect(providersJs).toContain('async function posResendOtp()');
    });

    test('New customer info section exists', async () => {
      expect(providersHtml).toContain('id="pos-customer-info-section"');
      expect(providersHtml).toContain('id="pos-customer-name"');
      expect(providersHtml).toContain('id="pos-customer-email"');
    });

    test('Existing customer section exists', async () => {
      expect(providersHtml).toContain('id="pos-existing-customer-section"');
      expect(providersHtml).toContain('id="pos-existing-name"');
      expect(providersHtml).toContain('id="pos-existing-email"');
    });

    test('OTP error display exists', async () => {
      expect(providersHtml).toContain('id="pos-otp-error"');
    });

  });

  test.describe('Step 3 - Vehicle Selection', () => {

    test('Existing vehicles container exists', async () => {
      expect(providersHtml).toContain('id="pos-existing-vehicles"');
    });

    test('Add new vehicle button and form exist', async () => {
      expect(providersHtml).toContain('id="pos-add-vehicle-btn"');
      expect(providersHtml).toContain('id="pos-new-vehicle-form"');
      expect(providersHtml).toContain('posShowNewVehicleForm()');
    });

    test('Vehicle input fields exist', async () => {
      expect(providersHtml).toContain('id="pos-vehicle-year"');
      expect(providersHtml).toContain('id="pos-vehicle-make"');
      expect(providersHtml).toContain('id="pos-vehicle-model"');
      expect(providersHtml).toContain('id="pos-vehicle-color"');
      expect(providersHtml).toContain('id="pos-vehicle-plate"');
    });

    test('Vehicle rendering and selection functions exist', async () => {
      expect(providersJs).toContain('function posRenderVehicles()');
      expect(providersJs).toContain('function posSelectExistingVehicle(id)');
      expect(providersJs).toContain('async function posSelectVehicle()');
    });

  });

  test.describe('Step 4 - Services', () => {

    test('Add service function exists', async () => {
      expect(providersJs).toContain('async function posAddService()');
    });

    test('Quick service function exists', async () => {
      expect(providersJs).toContain('function posQuickService(category, description, price)');
    });

  });

  test.describe('Step 5 - Authorization', () => {

    test('Authorization population function exists', async () => {
      expect(providersJs).toContain('function posPopulateAuthorizationStep()');
    });

    test('Signature pad init and clear functions exist', async () => {
      expect(providersJs).toContain('function posInitSignaturePad()');
      expect(providersJs).toContain('function posClearSignature()');
    });

    test('Submit authorization function exists', async () => {
      expect(providersJs).toContain('async function posSubmitAuthorization()');
    });

  });

  test.describe('Step 6 - Payment', () => {

    test('Stripe elements init function exists', async () => {
      expect(providersJs).toContain('function posInitStripeElements()');
    });

    test('Payment processing function exists', async () => {
      expect(providersJs).toContain('async function posProcessPayment()');
    });

    test('Checkout initiation function exists', async () => {
      expect(providersJs).toContain('async function posInitiateCheckout()');
    });

    test('Session confirmation function exists', async () => {
      expect(providersJs).toContain('async function posConfirmSession(paymentIntentId)');
    });

    test('Stripe marketplace init function exists', async () => {
      expect(providersJs).toContain('async function posInitStripeMarketplace(clientSecret)');
    });

  });

  test.describe('Step 7 - Completion & Receipts', () => {

    test('Success display elements exist', async () => {
      expect(providersHtml).toContain('id="pos-success-txn"');
      expect(providersHtml).toContain('id="pos-success-amount"');
      expect(providersHtml).toContain('id="pos-success-customer"');
      expect(providersHtml).toContain('id="pos-success-vehicle"');
      expect(providersHtml).toContain('id="pos-success-message"');
    });

    test('Receipt delivery section exists', async () => {
      expect(providersHtml).toContain('id="pos-receipt-section"');
      expect(providersHtml).toContain('id="pos-receipt-email"');
      expect(providersHtml).toContain('id="pos-receipt-sms"');
      expect(providersHtml).toContain('id="pos-receipt-print"');
    });

    test('Send receipt button and status exist', async () => {
      expect(providersHtml).toContain('id="pos-send-receipt-btn"');
      expect(providersHtml).toContain('posSendReceipt()');
      expect(providersHtml).toContain('id="pos-receipt-status"');
    });

    test('Receipt delivery functions exist', async () => {
      expect(providersJs).toContain('async function posSendReceipt()');
      expect(providersJs).toContain('function posPrintReceipt()');
      expect(providersJs).toContain('function posUpdateReceiptDisplays()');
      expect(providersJs).toContain('function posResetReceiptUI()');
    });

    test('Start new session button and function exist', async () => {
      expect(providersHtml).toContain('posStartNewSession()');
      expect(providersJs).toContain('function posStartNewSession()');
    });

    test('Success sound and confetti functions exist', async () => {
      expect(providersJs).toContain('function posPlaySuccessSound()');
      expect(providersJs).toContain('function posCreateConfetti()');
    });

  });

  test.describe('Maintenance Reminders', () => {

    test('Reminder section exists in completion step', async () => {
      expect(providersHtml).toContain('id="pos-maintenance-reminder-section"');
    });

    test('Reminder input fields exist', async () => {
      expect(providersHtml).toContain('id="pos-reminder-type"');
      expect(providersHtml).toContain('id="pos-reminder-date"');
      expect(providersHtml).toContain('id="pos-reminder-notes"');
    });

    test('Quick reminder buttons for 3, 6, 12 months exist', async () => {
      expect(providersHtml).toContain('posSetReminderQuick(3)');
      expect(providersHtml).toContain('posSetReminderQuick(6)');
      expect(providersHtml).toContain('posSetReminderQuick(12)');
    });

    test('Add reminder button and status exist', async () => {
      expect(providersHtml).toContain('id="pos-add-reminder-btn"');
      expect(providersHtml).toContain('posAddMaintenanceReminder()');
      expect(providersHtml).toContain('id="pos-reminder-status"');
      expect(providersHtml).toContain('id="pos-reminders-list"');
    });

    test('Reminder functions exist in source code', async () => {
      expect(providersJs).toContain('function posSetReminderQuick(months)');
      expect(providersJs).toContain('async function posAddMaintenanceReminder()');
    });

  });

  test.describe('Vehicle Inspection', () => {

    test('Inspection toggle function exists', async () => {
      expect(providersJs).toContain('function posToggleInspection()');
    });

    test('Inspection checklist update function exists', async () => {
      expect(providersJs).toContain('function posUpdateInspectionChecklist()');
    });

    test('Inspection data collection function exists', async () => {
      expect(providersJs).toContain('function posCollectInspectionData()');
    });

    test('Save inspection function exists', async () => {
      expect(providersJs).toContain('async function posSaveInspection(inspectionData)');
    });

    test('Inspection print HTML generator exists', async () => {
      expect(providersJs).toContain('function posGenerateInspectionPrintHtml()');
    });

  });

  test.describe('Marketplace Integration', () => {

    test('Check marketplace jobs function exists', async () => {
      expect(providersJs).toContain('async function posCheckMarketplaceJobs()');
    });

    test('Marketplace choice rendering function exists', async () => {
      expect(providersJs).toContain('function posRenderMarketplaceChoice()');
    });

    test('Select marketplace job function exists', async () => {
      expect(providersJs).toContain('async function posSelectMarketplaceJob(bidId, packageId, escrowFunded)');
    });

    test('Choose new walk-in function exists', async () => {
      expect(providersJs).toContain('function posChooseNewWalkin()');
    });

    test('Marketplace success display function exists', async () => {
      expect(providersJs).toContain('function posShowMarketplaceSuccess(message)');
    });

  });

  test.describe('Session & State Management', () => {

    test('Session start function exists', async () => {
      expect(providersJs).toContain('async function posStartSession()');
    });

    test('State reset function exists', async () => {
      expect(providersJs).toContain('function posResetState()');
    });

    test('Loading state helper function exists', async () => {
      expect(providersJs).toContain('function posSetLoading(btnId, loading, originalText');
    });

    test('Session history function exists', async () => {
      expect(providersJs).toContain('async function posLoadHistory()');
    });

    test('POS history list element exists', async () => {
      expect(providersHtml).toContain('id="pos-history-list"');
    });

  });

});

test.describe('POS Integration - Analytics', () => {

  test.describe('POS Analytics Functions', () => {

    test('loadPosAnalytics orchestrator calls all sub-functions', async () => {
      expect(providersAnalyticsJs).toContain('async function loadPosAnalytics()');
      expect(providersAnalyticsJs).toContain('loadPosTransactionSummary()');
      expect(providersAnalyticsJs).toContain('loadPosRevenueChart()');
      expect(providersAnalyticsJs).toContain('loadAllPosTransactions()');
    });

    test('Transaction summary function fetches Clover and Square data', async () => {
      expect(providersAnalyticsJs).toContain('async function loadPosTransactionSummary()');
      expect(providersAnalyticsJs).toContain('/api/clover/transactions/');
      expect(providersAnalyticsJs).toContain('/api/square/transactions/');
    });

    test('Transaction summary calculates totals, average ticket, and per-provider counts', async () => {
      expect(providersAnalyticsJs).toContain('totalCount');
      expect(providersAnalyticsJs).toContain('totalRevenue');
      expect(providersAnalyticsJs).toContain('avgTicket');
      expect(providersAnalyticsJs).toContain('cloverTx');
      expect(providersAnalyticsJs).toContain('squareTx');
    });

    test('Revenue chart function uses Chart.js bar chart', async () => {
      expect(providersAnalyticsJs).toContain('async function loadPosRevenueChart()');
      expect(providersAnalyticsJs).toContain("type: 'bar'");
      expect(providersAnalyticsJs).toContain("label: 'Daily Revenue'");
      expect(providersAnalyticsJs).toContain('posAnalyticsChart');
    });

    test('Revenue chart fetches from /api/pos/transactions/', async () => {
      expect(providersAnalyticsJs).toContain('/api/pos/transactions/');
    });

    test('Revenue chart handles empty state with message', async () => {
      expect(providersAnalyticsJs).toContain('No POS transactions yet');
    });

    test('Revenue chart destroys previous instance before creating new one', async () => {
      expect(providersAnalyticsJs).toContain('posAnalyticsChart.destroy()');
    });

    test('Transaction table function loads and renders rows', async () => {
      expect(providersAnalyticsJs).toContain('async function loadAllPosTransactions()');
      expect(providersAnalyticsJs).toContain('all-pos-transactions-body');
    });

    test('Transaction table shows source column (pos_provider)', async () => {
      expect(providersAnalyticsJs).toContain('tx.pos_provider');
      expect(providersAnalyticsJs).toContain("tx.source || 'unknown'");
    });

    test('Transaction table handles empty state', async () => {
      expect(providersAnalyticsJs).toContain('Connect a POS system to see transactions');
    });

    test('Transaction table displays card last four with masking', async () => {
      expect(providersAnalyticsJs).toContain('card_last_four');
    });

    test('Transaction table status uses color coding', async () => {
      expect(providersAnalyticsJs).toContain('accent-green');
      expect(providersAnalyticsJs).toContain('accent-gold');
      expect(providersAnalyticsJs).toContain('accent-red');
    });

  });

  test.describe('POS Analytics HTML Elements', () => {

    test('POS analytics section exists in providers.html', async () => {
      expect(providersHtml).toContain('id="pos-analytics"');
    });

    test('POS analytics JS references summary stat element IDs', async () => {
      expect(providersAnalyticsJs).toContain("getElementById('pos-total-transactions')");
      expect(providersAnalyticsJs).toContain("getElementById('pos-total-revenue')");
      expect(providersAnalyticsJs).toContain("getElementById('pos-avg-ticket')");
      expect(providersAnalyticsJs).toContain("getElementById('pos-clover-count')");
      expect(providersAnalyticsJs).toContain("getElementById('pos-square-count')");
    });

    test('POS revenue chart canvas referenced in JS', async () => {
      expect(providersAnalyticsJs).toContain("getElementById('pos-revenue-chart')");
    });

    test('POS transactions table body referenced in JS', async () => {
      expect(providersAnalyticsJs).toContain("getElementById('all-pos-transactions-body')");
    });

    test('POS revenue chart container referenced in JS', async () => {
      expect(providersAnalyticsJs).toContain("getElementById('pos-revenue-chart-container')");
    });

  });

});

test.describe('POS Integration - Server API', () => {

  test.describe('POS Connection Endpoints', () => {

    test('GET /api/pos/connections/:providerId endpoint exists', async () => {
      expect(serverJs).toContain("/api/pos/connections/");
      expect(serverJs).toMatch(/GET.*\/api\/pos\/connections\//s);
    });

    test('GET /api/pos/transactions/:providerId endpoint exists', async () => {
      expect(serverJs).toContain("/api/pos/transactions/");
    });

  });

  test.describe('POS Session Endpoints', () => {

    test('POST /api/pos/session endpoint exists', async () => {
      expect(serverJs).toContain("req.url === '/api/pos/session'");
      expect(serverJs).toContain("req.method === 'POST'");
    });

    test('Multiple session sub-routes exist for session lifecycle', async () => {
      const sessionRouteCount = (serverJs.match(/\/api\/pos\/session\//g) || []).length;
      expect(sessionRouteCount).toBeGreaterThanOrEqual(10);
    });

  });

  test.describe('POS Provider & Receipt Endpoints', () => {

    test('GET /api/pos/provider/:providerId endpoint exists', async () => {
      expect(serverJs).toContain("/api/pos/provider/");
    });

    test('POST /api/pos/receipt-delivery endpoint exists', async () => {
      expect(serverJs).toContain("'/api/pos/receipt-delivery'");
    });

    test('POST /api/pos/inspection endpoint exists', async () => {
      expect(serverJs).toContain("'/api/pos/inspection'");
    });

  });

});

test.describe('POS Integration - CSS Styling', () => {

  test('POS container and card styles defined', async () => {
    expect(providersHtml).toContain('.pos-container');
    expect(providersHtml).toContain('.pos-card');
  });

  test('POS stepper CSS classes defined', async () => {
    expect(providersHtml).toContain('.pos-stepper');
    expect(providersHtml).toContain('.pos-step');
    expect(providersHtml).toContain('.pos-step-circle');
    expect(providersHtml).toContain('.pos-step-label');
    expect(providersHtml).toContain('.pos-step.active');
    expect(providersHtml).toContain('.pos-step.completed');
  });

  test('POS input styles defined', async () => {
    expect(providersHtml).toContain('.pos-input');
    expect(providersHtml).toContain('.pos-input:focus');
    expect(providersHtml).toContain('.pos-input-lg');
    expect(providersHtml).toContain('.pos-input-hint');
  });

  test('POS button variants defined', async () => {
    expect(providersHtml).toContain('.pos-btn');
    expect(providersHtml).toContain('.pos-btn-primary');
    expect(providersHtml).toContain('.pos-btn-secondary');
    expect(providersHtml).toContain('.pos-btn-success');
    expect(providersHtml).toContain('.pos-btn-ghost');
    expect(providersHtml).toContain('.pos-btn-primary:hover');
    expect(providersHtml).toContain('.pos-btn-primary:disabled');
  });

  test('POS vehicle card styles defined', async () => {
    expect(providersHtml).toContain('.pos-vehicle-card');
    expect(providersHtml).toContain('.pos-vehicle-card:hover');
    expect(providersHtml).toContain('.pos-vehicle-card.selected');
    expect(providersHtml).toContain('.pos-vehicle-title');
    expect(providersHtml).toContain('.pos-vehicle-meta');
  });

  test('POS summary and OTP display styles defined', async () => {
    expect(providersHtml).toContain('.pos-summary-row');
    expect(providersHtml).toContain('.pos-summary-row.total');
    expect(providersHtml).toContain('.pos-otp-display');
    expect(providersHtml).toContain('.pos-otp-code');
  });

  test('POS history card styles defined', async () => {
    expect(providersHtml).toContain('.pos-history-card');
    expect(providersHtml).toContain('.pos-history-info');
    expect(providersHtml).toContain('.pos-history-customer');
    expect(providersHtml).toContain('.pos-history-amount');
  });

  test('POS status badge styles for all states defined', async () => {
    expect(providersHtml).toContain('.pos-status-badge');
    expect(providersHtml).toContain('.pos-status-badge.completed');
    expect(providersHtml).toContain('.pos-status-badge.pending');
    expect(providersHtml).toContain('.pos-status-badge.failed');
  });

  test('POS form layout styles defined', async () => {
    expect(providersHtml).toContain('.pos-label');
    expect(providersHtml).toContain('.pos-form-group');
    expect(providersHtml).toContain('.pos-form-row');
  });

  test('Active step uses brand gold gradient', async () => {
    expect(providersHtml).toMatch(/\.pos-step\.active.*#c9a227/s);
  });

  test('Completed step uses accent green', async () => {
    expect(providersHtml).toMatch(/\.pos-step\.completed.*accent-green/s);
  });

});

test.describe('POS Integration - Provider Core', () => {

  test('POS integration status loader exists in providers-core.js', async () => {
    expect(providersCoreJs).toContain('async function loadPosIntegrationStatus()');
  });

  test('POS enabled toggle exists in providers.html', async () => {
    expect(providersHtml).toContain('id="pos-enabled-toggle"');
    expect(providersHtml).toContain('togglePosFeatures');
  });

  test('POS integration section exists in providers.html', async () => {
    expect(providersHtml).toContain('id="pos-integration"');
  });

});
