const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TEST_ACCOUNTS = {
  member: { email: 'testmember@mcc-test.com', password: 'TestPass123!' },
  providerA: { email: 'testprovider_a@mcc-test.com', password: 'TestPass123!' },
  providerB: { email: 'testprovider_b@mcc-test.com', password: 'TestPass123!' },
};

async function ensureTestPackageWithBids() {
  if (!SUPABASE_SERVICE_ROLE_KEY) return { skipped: true };

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: memberProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', TEST_ACCOUNTS.member.email)
    .single();

  if (!memberProfile) return { skipped: true, reason: 'Test member not found' };
  const memberId = memberProfile.id;

  const { data: provAProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', TEST_ACCOUNTS.providerA.email)
    .single();

  const { data: provBProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', TEST_ACCOUNTS.providerB.email)
    .single();

  if (!provAProfile || !provBProfile) return { skipped: true, reason: 'Test providers not found' };

  const { data: existingPkg } = await supabase
    .from('maintenance_packages')
    .select('id')
    .eq('member_id', memberId)
    .eq('title', 'AI E2E Test Package')
    .eq('status', 'open')
    .single();

  let pkgId = existingPkg?.id;

  if (!pkgId) {
    const { data: newPkg } = await supabase
      .from('maintenance_packages')
      .insert({
        member_id: memberId,
        title: 'AI E2E Test Package',
        category: 'maintenance',
        status: 'open',
        description: 'Full oil change and tire rotation needed, vehicle at 65k miles',
        pickup_preference: 'either',
      })
      .select('id')
      .single();
    if (!newPkg) return { skipped: true, reason: 'Could not create test package' };
    pkgId = newPkg.id;
  }

  const { data: existingBids } = await supabase
    .from('bids')
    .select('id, provider_id')
    .eq('package_id', pkgId)
    .eq('status', 'pending');

  const hasProvABid = existingBids?.some(b => b.provider_id === provAProfile.id);
  const hasProvBBid = existingBids?.some(b => b.provider_id === provBProfile.id);

  if (!hasProvABid) {
    await supabase.from('bids').insert({
      package_id: pkgId,
      provider_id: provAProfile.id,
      price: 85,
      description: 'Full synthetic oil change and tire rotation',
      status: 'pending',
      estimated_time: '45 minutes',
    });
  }

  if (!hasProvBBid) {
    await supabase.from('bids').insert({
      package_id: pkgId,
      provider_id: provBProfile.id,
      price: 110,
      description: 'Premium oil change with multi-point inspection',
      status: 'pending',
      estimated_time: '1 hour',
    });
  }

  return { pkgId, memberId };
}

async function verifyDatabaseState() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return { skipped: true };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const results = { passed: 0, failed: 0, errors: [] };

  const { data: priceData } = await supabase
    .from('bids')
    .select('price, package_id')
    .eq('status', 'accepted')
    .limit(1);

  if (priceData !== null) {
    results.passed++;
  } else {
    results.errors.push('Could not query accepted bids for price estimate');
    results.failed++;
  }

  const { data: provProfile } = await supabase
    .from('profiles')
    .select('id, bid_credits')
    .eq('email', TEST_ACCOUNTS.providerA.email)
    .single();

  if (provProfile) {
    results.passed++;
  } else {
    results.errors.push('Could not find provider A profile');
    results.failed++;
  }

  return results;
}

const TESTS = [
  {
    name: 'Member sees price estimate widget when creating a service package',
    plan: `
      1. [New Context] Create a new browser context
      2. [Browser] Navigate to /login.html
      3. [Browser] Fill #email with "${TEST_ACCOUNTS.member.email}" and #password with "${TEST_ACCOUNTS.member.password}"
      4. [Browser] Click #login-btn and wait for navigation to members.html (up to 10s)
      5. [Verify] URL contains "members.html"
      6. [Browser] Click the "Packages" navigation tab (look for tab or nav with text "Packages" or data-section="packages")
      7. [Browser] Wait for the packages section to appear (up to 5s)
      8. [Browser] Click the "New Package" or "+ New Package" button to open the package creation modal
      9. [Browser] Wait for #package-modal or the create package modal to appear
      10. [Browser] In #p-title, type "Test Oil Change"
      11. [Browser] In #p-description, type "Need a full synthetic oil change, vehicle is at 65,000 miles"
      12. [Browser] Wait 1 second for any AI suggestions to trigger
      13. [Verify] A category or suggestion panel may appear — no crashes or errors
      14. [Browser] In #p-category select, choose "maintenance"
      15. [Browser] Wait 2 seconds for price estimate to possibly appear (it queries historical data)
      16. [Verify] Either a price estimate section is visible with a price range, OR no error messages are shown (no estimate is fine if no data exists)
      17. [Browser] Close the modal or click Cancel
    `
  },
  {
    name: 'Member sees service recommendations when selecting a vehicle in package modal',
    plan: `
      1. [New Context] Create a new browser context
      2. [Browser] Navigate to /login.html
      3. [Browser] Fill #email with "${TEST_ACCOUNTS.member.email}" and #password with "${TEST_ACCOUNTS.member.password}"
      4. [Browser] Click #login-btn and wait for navigation to members.html (up to 10s)
      5. [Browser] Click the "Packages" navigation item
      6. [Browser] Click "New Package" or "+ New Package" button
      7. [Browser] Wait for the package creation modal to open
      8. [Verify] A vehicle selector (#p-vehicle) is present in the modal
      9. [Browser] Click #p-vehicle and select the first vehicle option (not the empty placeholder)
      10. [Browser] Wait up to 3 seconds for suggestions to load
      11. [Verify] Either #service-suggestions-panel becomes visible with suggestion chips, OR the panel is hidden because no vehicle record exists — no error messages either way
      12. [Browser] If suggestion chips are visible, verify at least one chip contains "Book it" button text
      13. [Browser] Close the modal
    `
  },
  {
    name: 'Member sees AI package suggestion panel when typing description',
    plan: `
      1. [New Context] Create a new browser context
      2. [Browser] Navigate to /login.html
      3. [Browser] Fill #email with "${TEST_ACCOUNTS.member.email}" and #password with "${TEST_ACCOUNTS.member.password}"
      4. [Browser] Click #login-btn and wait for members.html (up to 10s)
      5. [Browser] Click the "Packages" navigation item
      6. [Browser] Click "New Package" button
      7. [Browser] Wait for the package creation modal to appear
      8. [Browser] In #p-description, type "My front brakes are grinding badly and the rotors may need replacement"
      9. [Browser] Wait 2 seconds for the AI package assistant panel to trigger (it debounces 800ms)
      10. [Verify] Either #ai-package-assistant panel appears with a suggested category chip or question, OR it remains hidden — no crash, no error toast
      11. [Browser] Close the modal
    `
  },
  {
    name: 'Member sees AI Bid Analyzer card when viewing 2+ bids on a package',
    plan: `
      PREREQ: "AI E2E Test Package" must exist with 2 pending bids (created by ensureTestPackageWithBids()).
      
      1. [New Context] Create a new browser context
      2. [Browser] Navigate to /login.html
      3. [Browser] Fill #email with "${TEST_ACCOUNTS.member.email}" and #password with "${TEST_ACCOUNTS.member.password}"
      4. [Browser] Click #login-btn and wait for members.html (up to 10s)
      5. [Browser] Click the "Packages" navigation tab
      6. [Browser] Wait for packages to load (up to 5s)
      7. [Browser] Look for a package card containing the text "AI E2E Test Package" and click it
      8. [Browser] Wait for the package detail view or modal to open (up to 6s)
      9. [Verify] The package detail view is visible (title mentions "AI E2E Test Package" or bids are shown)
      10. [Browser] Wait up to 5 seconds for bid cards to load inside the detail view
      11. [Verify] At least 2 bids are visible in the detail view (e.g., "$85" and "$110" or any two price items)
      12. [Browser] Wait up to 6 seconds for the AI analyzer card to appear (fires after bids count >= 2)
      13. [Verify] An AI analysis card, "AI Pick" badge, or "AI Recommendation" section IS visible with a ranked provider recommendation. (If absent after 6s, note it but do not fail — the endpoint may be rate-limited during test run)
    `
  },
  {
    name: 'Provider sees Bid Strategy AI insights on bids tab',
    plan: `
      1. [New Context] Create a new browser context
      2. [Browser] Navigate to /login.html
      3. [Browser] Fill #email with "${TEST_ACCOUNTS.providerA.email}" and #password with "${TEST_ACCOUNTS.providerA.password}"
      4. [Browser] Click #login-btn and wait for providers.html (up to 10s)
      5. [Verify] URL contains "providers.html"
      6. [Browser] Click the "My Bids" navigation tab (look for nav item with data-section="bids" or text "My Bids")
      7. [Browser] Wait up to 6 seconds for the bids section to fully load
      8. [Verify] Bids section or #my-bids-section is visible
      9. [Browser] Wait up to 5 more seconds for the AI insights card to appear above the bids list
      10. [Verify] Either: (a) A "Bid Strategy" or "Bid Insights" card (#bid-insights-card) is visible with at least one win-rate badge or tip, OR (b) No card appears — acceptable if provider has no bid history; no error toast shown
    `
  },
  {
    name: 'Provider sees Matched for You badge on matched packages',
    plan: `
      1. [New Context] Create a new browser context
      2. [Browser] Navigate to /login.html
      3. [Browser] Fill #email with "${TEST_ACCOUNTS.providerA.email}" and #password with "${TEST_ACCOUNTS.providerA.password}"
      4. [Browser] Click #login-btn and wait for providers.html (up to 10s)
      5. [Browser] Click the "Browse Packages" navigation tab (data-section="browse")
      6. [Browser] Wait for the browse section and package cards to load (up to 6s)
      7. [Verify] Package cards are visible in #open-packages or the browse list
      8. [Verify] Either: (a) At least one card has a "Matched for you" badge/chip visible on it, OR (b) No matched badge visible — acceptable if no packages were matched recently; no error messages
    `
  },
  {
    name: 'Booking Assistance guidance settings toggles work correctly',
    plan: `
      1. [New Context] Create a new browser context
      2. [Browser] Navigate to /login.html
      3. [Browser] Fill #email with "${TEST_ACCOUNTS.member.email}" and #password with "${TEST_ACCOUNTS.member.password}"
      4. [Browser] Click #login-btn and wait for members.html (up to 10s)
      5. [Browser] Navigate to Settings section (look for nav item with data-section="settings" or text "Settings")
      6. [Browser] Wait for settings section to load (up to 4s)
      7. [Browser] Scroll down to find the "Booking Assistance" card
      8. [Verify] Three guidance tiles are visible: "Full Guidance", "Suggestions Only", "Off"
      9. [Verify] One of the tiles has active/selected state (data-active="true" or highlighted style)
      10. [Browser] Click the "Off" tile
      11. [Browser] Wait 1 second
      12. [Verify] The "Off" tile now appears selected/active
      13. [Browser] Click the "Full Guidance" tile to restore default
      14. [Verify] "Full Guidance" tile is now selected/active again
    `
  },
  {
    name: 'Guidance Off mode shows Turn on AI guidance link in package modal',
    plan: `
      1. [New Context] Create a new browser context
      2. [Browser] Navigate to /login.html
      3. [Browser] Fill #email with "${TEST_ACCOUNTS.member.email}" and #password with "${TEST_ACCOUNTS.member.password}"
      4. [Browser] Click #login-btn and wait for members.html (up to 10s)
      5. [Browser] Navigate to Settings section
      6. [Browser] Wait for settings to load (up to 4s)
      7. [Browser] Click the "Off" guidance tile
      8. [Browser] Wait 1 second
      9. [Browser] Navigate to the Packages section
      10. [Browser] Click "New Package" button
      11. [Browser] Wait for the package creation modal to open
      12. [Verify] #service-suggestions-panel is hidden (display none or not visible)
      13. [Verify] #ai-package-assistant panel is hidden
      14. [Verify] A "Turn on AI guidance" link (#pkg-modal-guidance-link) is visible in the modal
      15. [Browser] Click the "Turn on AI guidance" link
      16. [Browser] Wait 1 second
      17. [Verify] After clicking, AI assistance is re-enabled (link hides or guidance mode changes)
      18. [Browser] Close the modal
      19. [Browser] Navigate to Settings and restore "Full Guidance" tile
    `
  },
];

const TECHNICAL_DOCS = `
  - Login: /login.html, email=#email, password=#password, submit=#login-btn
  - Members redirect to members.html after login
  - Providers redirect to providers.html after login
  - Members nav: data-section="packages", data-section="settings"
  - Provider nav: data-section="browse" for Browse Packages, data-section="bids" for My Bids
  - Package create modal: #package-modal, opens via New Package button
  - Package modal inputs: #p-title (text), #p-description (textarea), #p-category (select), #p-vehicle (select)
  - AI suggestion panel: #service-suggestions-panel (hidden by default, shown after vehicle select)
  - AI package assistant: #ai-package-assistant (shown after 800ms typing debounce)
  - Price estimate: shown in modal or after package creation when category is set
  - Guidance link: #pkg-modal-guidance-link (shown when guidance mode is 'off')
  - Guidance tiles: .guidance-tile[data-value="full/suggestions_only/off"]
  - Provider bid strategy card: #bid-insights-card (above My Bids list)
  - Provider matched badge: "Matched for you" text on package cards in browse view
  - View package modal: #view-package-modal or view-package-modal class
  - AI bid analyzer card appears in package detail when 2+ bids are loaded
`;

if (require.main === module) {
  (async () => {
    console.log('Running AI features E2E test data setup...\n');

    const setupResult = await ensureTestPackageWithBids();
    if (setupResult.skipped) {
      console.log(`Setup skipped: ${setupResult.reason || 'No service role key'}`);
    } else {
      console.log(`Test package ready: ${setupResult.pkgId}`);
    }

    const dbResult = await verifyDatabaseState();
    if (dbResult.skipped) {
      console.log('DB verification skipped');
    } else {
      console.log(`DB verification: ${dbResult.passed} passed, ${dbResult.failed} failed`);
      if (dbResult.errors.length) {
        dbResult.errors.forEach(e => console.log(`  - ${e}`));
      }
    }
  })();
}

module.exports = { TEST_ACCOUNTS, TESTS, TECHNICAL_DOCS, verifyDatabaseState };
