// ========== PROVIDERS CORE MODULE ==========
// Essential initialization, state management, auth, and module loading

// ========== MODULE LOADER ==========
// Pre-populated: providers-settings.js is loaded statically by providers.html
// (script tag, not via this loader), so its top-level const declarations have
// already run. Without this entry, loadModule('settings') would re-inject the
// same <script> and re-evaluating `const DAY_LABELS = …` (and BUSINESS_DAYS)
// at top level throws SyntaxError: Can't create duplicate variable.
const loadedModules = { settings: true };
async function loadModule(name) {
  if (loadedModules[name]) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `/providers-${name}.js?v=20260914d`;
    script.async = true;
    script.onload = () => {
      loadedModules[name] = true;
      console.log(`[Module] Loaded ${name} module`);
      resolve();
    };
    script.onerror = (e) => {
      console.error(`[Module] Failed to load ${name} module`, e);
      reject(e);
    };
    document.body.appendChild(script);
  });
}

function loadModuleForSection(section) {
  switch(section) {
    case 'browse':
    case 'open-packages':
    case 'bid-calculator':
    case 'bids':
    case 'subscription':
      return loadModule('bids');
    case 'jobs':
    case 'active-jobs':
    case 'inspections':
    case 'emergencies':
    case 'fleet-services':
    case 'customer-queue':
    case 'walkin-pos':
    case 'refund-requests':
      return loadModule('jobs');
    case 'earnings':
    case 'earnings-analytics':
    case 'pos-analytics':
    case 'pos-integration':
      return loadModule('analytics');
    case 'my-documents':
      return loadModule('documents');
    case 'settings':
    case 'profile':
    case 'team':
    case 'team-section':
    case 'background-checks':
    case 'notifications':
    case 'refer-providers':
    case 'loyalty-network':
      return loadModule('settings');
    case 'overview':
    case 'reviews':
    case 'performance':
    case 'messages':
      return Promise.resolve();
    default:
      console.error(`[Module] No module mapping for section: ${section}`);
      return Promise.resolve();
  }
}

// ========== THEME TOGGLE ==========
function toggleTheme() {
  document.documentElement.classList.add('theme-transition');
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon();
  updateThemeToggleUI();
  setTimeout(() => {
    document.documentElement.classList.remove('theme-transition');
  }, 300);
}

function updateThemeIcon() {
  const themeIcon = document.getElementById('theme-icon');
  const currentTheme = document.documentElement.getAttribute('data-theme');
  if (themeIcon) {
    themeIcon.innerHTML = currentTheme === 'dark' ? mccIcon('moon', 16) : mccIcon('sun', 16);
  }
}

function updateThemeToggleUI() {
  const themeToggle = document.getElementById('settings-theme-toggle');
  const themeLabel = document.getElementById('settings-theme-label');
  const iconDisplay = document.getElementById('settings-theme-icon-display');
  const currentTheme = document.documentElement.getAttribute('data-theme');
  if (themeToggle) {
    themeToggle.checked = currentTheme === 'light';
  }
  if (themeLabel) {
    themeLabel.textContent = currentTheme === 'dark' ? 'Dark Mode' : 'Light Mode';
  }
  if (iconDisplay) {
    iconDisplay.innerHTML = currentTheme === 'dark' ? mccIcon('moon', 16) : mccIcon('sun', 16);
  }
}

function setThemeFromToggle(isLight) {
  document.documentElement.classList.add('theme-transition');
  const newTheme = isLight ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon();
  updateThemeToggleUI();
  setTimeout(() => {
    document.documentElement.classList.remove('theme-transition');
  }, 300);
}

document.addEventListener('DOMContentLoaded', () => {
  updateThemeIcon();
});

// Global function for mobile sidebar toggle
function toggleSidebar() { 
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.toggle('open'); 
  if (sidebar.classList.contains('open')) {
    overlay.style.display = 'block';
    document.querySelector('.mobile-close').style.display = 'flex';
    document.body.classList.add('sidebar-open');
  } else {
    overlay.style.display = 'none';
    document.body.classList.remove('sidebar-open');
  }
}

// ========== GLOBAL STATE ==========
let currentUser = null;
let providerProfile = null;
let openPackages = [];
let myBids = [];
let myReviews = [];
let currentBidPackageId = null;
let currentMessageMemberId = null;
let currentMessagePackageId = null;
let myPayments = [];
let myPerformance = null;

// GPS Tracking State
let activeTrackingPackageId = null;
let trackingWatchId = null;
let trackingIntervalId = null;
let lastTrackingPosition = null;

// Emergency State
let nearbyEmergencies = [];
let myActiveEmergency = null;
let providerLocation = null;

// POS State
let cloverConnectionStatus = null;
let squareConnectionStatus = null;

// ========== 2FA ACCESS CHECK ==========
async function checkAccessAuthorization() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return false;
  }
  
  try {
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const response = await fetch(`${apiBase}/api/auth/check-access`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    if (!response.ok) {
      console.warn('[checkAccessAuthorization] /api/auth/check-access returned', response.status);
      return true; // fail-open on a degraded auth check (matches existing catch behavior)
    }
    const result = await response.json().catch(() => ({}));

    if (!result.authorized && result.reason === '2fa_required') {
      window.location.href = 'login.html?2fa=required&returnTo=' + encodeURIComponent(window.location.pathname);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Access check error:', error);
    return true;
  }
}

// ========== INITIALIZATION ==========
window.addEventListener('load', async () => {
  try {
    const user = await getCurrentUser();
    if (!user) return window.location.href = 'login.html';
    currentUser = user;

    const authorized = await checkAccessAuthorization();
    if (!authorized) return;

    const { data: profile, error: profileError } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
    
    if (profileError || !profile) {
      console.log('No profile found, creating provider profile...');
      const { data: newProfile, error: createError } = await supabaseClient.from('profiles').insert({
        id: user.id,
        email: user.email,
        role: 'provider'
      }).select().single();
      
      if (createError) {
        console.error('Failed to create profile:', createError);
        showToast('Error setting up profile. Please try again.', 'error');
        return;
      }
      providerProfile = newProfile;
    } else if (profile.role !== 'provider' && !profile.is_also_provider) {
      showToast('This account does not have provider access. Please contact support to enable provider mode.', 'error');
      return window.location.href = 'login.html';
    } else {
      providerProfile = profile;
    }

    const tosAccepted = await TosModal.check(supabaseClient, user.id);
    if (!tosAccepted) {
      TosModal.show(async () => {
        const accepted = await TosModal.accept(supabaseClient, user.id);
        if (accepted) {
          await initializeProviderDashboard(user);
        }
      });
      return;
    }
    
    await initializeProviderDashboard(user);
  } catch (err) {
    console.error('Page initialization error:', err);
    showToast('Unable to load your dashboard. Please refresh the page or try again later.', 'error');
  }
});

async function initializeProviderDashboard(user) {
  document.getElementById('switch-portal-container').style.display = 'block';

  const displayName = providerProfile.business_name || providerProfile.full_name || 'Provider';
  document.getElementById('user-name').textContent = displayName;
  document.getElementById('user-email').textContent = user.email;
  document.getElementById('user-avatar').textContent = displayName[0].toUpperCase();

  // Load essential data - bids module handles packages/bids loading
  await Promise.all([
    loadModule('bids').then(() => {
      if (typeof loadOpenPackages === 'function') loadOpenPackages();
      if (typeof loadMyBids === 'function') loadMyBids();
      if (typeof window.loadServiceCredits === 'function') {
        console.log('[Init] Loading service credits...');
        window.loadServiceCredits();
      } else {
        console.warn('[Init] loadServiceCredits not available after bids module loaded');
      }
    }),
    loadEarnings(),
    loadMyReviews(),
    loadProviderProfile(),
    loadSubscription(),
    loadPosIntegrationStatus(),
    loadPerformance(),
    // Phase 2/3/7 auto-bid redesign panels (Match Preferences, Rate Card,
    // Auto-Bid Activity) live in the 'profile' section. providers-settings.js
    // is loaded statically (see loadModule's own comment above), so these
    // are safe to call directly here without a loadModule() wrapper — same
    // as every other call in this Promise.all. Guarded with typeof checks
    // for defensive parity with the rest of this function, in case the
    // settings module is ever changed to load asynchronously later.
    (typeof loadMatchPreferences === 'function' ? loadMatchPreferences() : Promise.resolve()),
    (typeof loadRateCard === 'function' ? loadRateCard() : Promise.resolve()),
    (typeof loadAutoBidActivity === 'function' ? loadAutoBidActivity() : Promise.resolve())
  ]);
  
  updateStats();
  setupNav();
  
  // Load settings module for notifications
  loadModule('settings').then(() => {
    if (typeof loadNotifications === 'function') loadNotifications();
    if (typeof loadTeamManagementData === 'function') loadTeamManagementData();
    if (typeof loadLoyaltyNetwork === 'function') loadLoyaltyNetwork();
    if (typeof loadBackgroundCheckStatus === 'function') loadBackgroundCheckStatus();
  });
  
  // Load jobs module for emergencies
  loadModule('jobs').then(() => {
    if (typeof setupEmergencySettings === 'function') setupEmergencySettings();
    if (typeof refreshEmergencies === 'function') refreshEmergencies();
    if (typeof loadDestinationTasks === 'function') loadDestinationTasks();
    if (typeof loadProviderRefundBadge === 'function') loadProviderRefundBadge();
  });
  
  checkPurchaseStatus();
  checkDeepLinkSection();
  loadCarClubCard();
  
  if (typeof applyFilters === 'function') applyFilters();
  
  // Task #89: Shop SaaS initial loads
  if (typeof loadShopSubscription === 'function') loadShopSubscription();
  if (typeof loadShopOnboardingChecklist === 'function') loadShopOnboardingChecklist();
  
  setupRealtimeSubscriptions();
  initProviderPushNotifications();
  _setupNativeFocusRefresh();
}

// ========== NATIVE FOCUS REFRESH ==========
// When the SFSafariViewController opened by Browser.open closes (checkout
// done or cancelled), or when the app returns to the foreground for any
// reason, we can't know from the JS side whether a purchase completed
// or not — Stripe's webhook has already run against the server, but the
// in-app balance / plans still reflect a pre-purchase snapshot. Just
// re-run the loaders on focus. Debounced 500ms so a burst of events
// (appStateChange + browserFinished fire back-to-back on Browser close)
// coalesces into one refresh.
let _nativeFocusRefreshTimer = 0;
function _refreshOnNativeFocus() {
  clearTimeout(_nativeFocusRefreshTimer);
  _nativeFocusRefreshTimer = setTimeout(() => {
    if (typeof loadSubscription === 'function') loadSubscription();
    if (typeof loadProviderPlans === 'function') loadProviderPlans();
  }, 500);
}

function _setupNativeFocusRefresh() {
  if (!_isNativePlatform()) return;
  const CapApp    = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  const Browser   = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
  if (CapApp && typeof CapApp.addListener === 'function') {
    CapApp.addListener('appStateChange', (state) => {
      if (state && state.isActive) _refreshOnNativeFocus();
    });
  }
  if (Browser && typeof Browser.addListener === 'function') {
    Browser.addListener('browserFinished', () => _refreshOnNativeFocus());
  }
}

// ========== NATIVE SCROLL LAYOUT NUDGE ==========
// On Capacitor iOS (WKWebView), any section whose DOM keeps growing AFTER
// showSection() ran gets its scroll contentSize frozen at the size the
// document had at section-switch time. Nothing forces a relayout of that
// contentSize until the user opens the sidebar (which toggles body
// overflow:hidden). Result: page feels unscrollable until the menu is
// opened once — reported for Browse Packages on 2026-09-14, then for
// multiple other provider sections (2026-09-20).
//
// Generalized workaround: run the same body-overflow toggle for every
// section, and re-run it whenever the active section's size changes via
// a ResizeObserver. No-op on web. Skip while the sidebar is open — the
// menu owns body.overflow in that state.
function nudgeScrollLayout() {
  if (document.body.classList.contains('sidebar-open')) return;
  const b = document.body;
  const prev = b.style.overflow;
  b.style.overflow = 'hidden';
  void b.offsetHeight; // force reflow
  b.style.overflow = prev;
}

function _isNativePlatform() {
  return !!(window.Capacitor
    && typeof window.Capacitor.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform());
}

let _nudgeDebounce = 0;
function _nudgeSoon() {
  clearTimeout(_nudgeDebounce);
  _nudgeDebounce = setTimeout(nudgeScrollLayout, 50);
}

// One reused observer; re-target on section switch so we never observe
// two sections at once and never leak a listener when the user tab-hops.
let _nudgeObserver = null;
let _nudgeObservedEl = null;
function _observeSectionForNudge(el) {
  if (!_isNativePlatform() || !el) return;
  if (!_nudgeObserver && typeof ResizeObserver === 'function') {
    _nudgeObserver = new ResizeObserver(_nudgeSoon);
  }
  if (!_nudgeObserver) return;
  if (_nudgeObservedEl === el) return;
  if (_nudgeObservedEl) _nudgeObserver.unobserve(_nudgeObservedEl);
  _nudgeObserver.observe(el);
  _nudgeObservedEl = el;
}

// ========== NAVIGATION ==========
function setupNav() {
  document.querySelectorAll('.nav-item[data-section]').forEach(item => {
    item.addEventListener('click', () => showSection(item.dataset.section));
  });
}

async function showSection(id) {
  // Load required module before showing section
  await loadModuleForSection(id);

  const target = document.getElementById(id);
  if (!target) { console.warn('[showSection] Unknown section:', id); return; }

  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  target.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`.nav-item[data-section="${id}"]`)?.classList.add('active');
  document.getElementById('sidebar').classList.remove('open');
  
  // Section-specific loading
  if (id === 'team' && typeof loadTeamMembers === 'function') {
    loadTeamMembers();
  }
  if (id === 'background-checks') {
    if (typeof loadVerificationBadgeStatus === 'function') loadVerificationBadgeStatus();
    if (typeof loadBackgroundCheckStatus === 'function') loadBackgroundCheckStatus();
    // Phase 3 — populate Documents/Reviews/References cards + submit button.
    if (typeof loadProviderVerification === 'function') loadProviderVerification();
  }
  // Note: background-check polling (_bgCheckPollTimer) continues across section changes so the
  // overview dashboard card stays fresh while a check is in-progress. It self-stops when resolved.
  if (id === 'team-section' && typeof loadTeamManagementData === 'function') {
    loadTeamManagementData();
  }
  if (id === 'earnings-analytics') {
    if (typeof initEarningsAnalytics === 'function') initEarningsAnalytics();
    if (typeof initAdvancedAnalytics === 'function') initAdvancedAnalytics();
  }
  if (id === 'refer-providers' && typeof loadReferralSection === 'function') {
    loadReferralSection();
  }
  if (id === 'pos-analytics' && typeof loadPosAnalytics === 'function') {
    loadPosAnalytics();
  }
  if (id === 'refund-requests' && typeof loadProviderRefunds === 'function') {
    loadProviderRefunds();
  }
  if (id === 'bids' && typeof loadBidInsights === 'function') {
    loadBidInsights();
  }
  // Browse Packages must (re)load when its section becomes visible. The open-
  // packages feed is fetched once at app init while this section is still
  // display:none; on WebKit (native WKWebView) cards whose innerHTML was set
  // inside a hidden container are not reflowed when the section is later shown,
  // so they render at zero height. Loading on show — like every other section
  // above — renders the cards while the section is visible. (2026-09-14)
  // The follow-on scroll-layout nudge lives in the generalized native path
  // at the bottom of showSection() (2026-09-20) — no per-section copy.
  if (id === 'browse' && typeof loadOpenPackages === 'function') {
    loadOpenPackages();
  }
  if ((id === 'settings' || id === 'notifications') && typeof loadProviderNotificationSettings === 'function') {
    loadProviderNotificationSettings();
    if (typeof loadProviderPushPreferences === 'function') {
      loadProviderPushPreferences();
    }
    if (typeof loadMarketplaceVisibility === 'function') {
      loadMarketplaceVisibility();
    }
    if (typeof loadBusinessHours === 'function') {
      loadBusinessHours();
    }
  }
  if (id === 'subscription' && typeof loadShopSubscription === 'function') {
    loadShopSubscription();
  }
  if (id === 'overview' && typeof loadShopOnboardingChecklist === 'function') {
    loadShopOnboardingChecklist();
  }
  if (id === 'my-documents' && typeof loadMyDocuments === 'function') {
    loadMyDocuments();
  }

  // Generalized WKWebView scroll-layout nudge. See nudgeScrollLayout()
  // header — every section, not just Browse Packages. rAF so we run
  // after the browser has committed the display change from above.
  if (_isNativePlatform()) {
    _observeSectionForNudge(target);
    requestAnimationFrame(nudgeScrollLayout);
  }
}

// ========== CORE UTILITY FUNCTIONS ==========
// 2s de-dupe: drop a toast whose (msg, type) matches the previous one within
// 2000ms. Keeps rapid double-taps on moderation buttons from stacking two
// identical toasts. Module-scoped via window so it works across all callers.
if (typeof window._mccProviderLastToast === 'undefined') window._mccProviderLastToast = { key: null, at: 0 };
function showToast(message, type = 'success') {
  const key = type + '|' + String(message);
  const now = Date.now();
  if (key === window._mccProviderLastToast.key && (now - window._mccProviderLastToast.at) < 2000) return;
  window._mccProviderLastToast.key = key;
  window._mccProviderLastToast.at = now;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:12px 24px;border-radius:8px;color:#fff;z-index:9999;animation:fadeIn 0.3s;';
  toast.style.background = type === 'error' ? '#ef5f5f' : type === 'warning' ? '#f59e0b' : '#4ac88c';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function formatTimeAgo(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function formatCountdown(deadline) {
  const now = new Date();
  const end = new Date(deadline);
  const diff = end - now;
  
  if (diff <= 0) return { text: 'Expired', expired: true };
  
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  
  if (hours < 2) {
    return { text: `${hours}h ${minutes}m left`, urgent: true };
  }
  if (hours < 24) {
    return { text: `${hours}h left`, urgent: false };
  }
  const days = Math.floor(hours / 24);
  return { text: `${days}d left`, urgent: false };
}

function formatCategory(cat) {
  if (!cat) return '';
  return cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatFrequency(freq) {
  const labels = {
    'one_time': 'One-time',
    'monthly': 'Monthly',
    'quarterly': 'Quarterly',
    'yearly': 'Yearly'
  };
  return labels[freq] || freq || 'One-time';
}

function formatPickup(pickup) {
  const labels = {
    'drop_off': 'Drop-off',
    'pickup': 'Pickup needed',
    'mobile': 'Mobile service',
    'destination_service': 'Destination Service'
  };
  return labels[pickup] || pickup || 'Standard';
}

// package-details-modal has a bespoke iPad split-view treatment (see the
// #package-details-modal rules in providers.html): at ≥1024/768pt it renders
// as a persistent right drawer, and .main needs padding-right reserved so
// the drawer doesn't overlap the browse list. Prior version used CSS :has()
// to reflow .main, but IPHONEOS_DEPLOYMENT_TARGET=14.0 predates :has() (added
// iOS 15.4), so any real iPad on iOS 14.0-15.3 wouldn't reflow. Toggling a
// body class from the JS layer works everywhere the app can install.
function openModal(id) {
  document.getElementById(id).classList.add('active');
  if (id === 'package-details-modal') document.body.classList.add('drawer-open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  if (id === 'package-details-modal') document.body.classList.remove('drawer-open');
}

// ========== DELETE ACCOUNT ==========
function openDeleteAccountModal() {
  const input = document.getElementById('delete-confirm-input');
  const btn = document.getElementById('confirm-delete-btn');
  if (input) input.value = '';
  if (btn) btn.disabled = true;
  
  // Add input listener for DELETE confirmation
  if (input) {
    input.oninput = function() {
      btn.disabled = this.value !== 'DELETE';
    };
  }
  
  openModal('delete-account-modal');
}

async function confirmDeleteAccount() {
  const input = document.getElementById('delete-confirm-input');
  if (!input || input.value !== 'DELETE') {
    showToast('Please type DELETE to confirm', 'error');
    return;
  }
  
  const btn = document.getElementById('confirm-delete-btn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid white;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;"></span> Deleting...';
  
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      showToast('You must be logged in', 'error');
      return;
    }
    
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const response = await fetch(`${apiBase}/api/account/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `Failed to delete account (${response.status})`);
    }

    if (result.success) {
      // Sign out and redirect
      await supabaseClient.auth.signOut();
      showToast('Your account has been deleted. Redirecting...', 'success');
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } else {
      throw new Error(result.error || 'Failed to delete account');
    }
  } catch (error) {
    console.error('Delete account error:', error);
    showToast('Unable to delete your account. Please try again or contact support for assistance.', 'error');
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

window.openDeleteAccountModal = openDeleteAccountModal;
window.confirmDeleteAccount = confirmDeleteAccount;

// ========== STATS UPDATE ==========
// Toggle the "zero-state hint" span next to a stat: shown when value === 0,
// hidden otherwise. Kept as a local helper so both updateStats (this file)
// and the reviews-rating render in providers.js can call it with matching
// semantics. Fails silently if the hint element is missing.
function toggleStatZeroHint(hintId, value) {
  const el = document.getElementById(hintId);
  if (!el) return;
  el.style.display = value === 0 ? '' : 'none';
}

function updateStats() {
  const openCount = openPackages.length;
  const pendingCount = myBids.filter(b => b.status === 'pending').length;
  const wonCount = myBids.filter(b => b.status === 'accepted').length;
  document.getElementById('stat-open').textContent = openCount;
  document.getElementById('stat-bids').textContent = pendingCount;
  document.getElementById('stat-won').textContent = wonCount;
  toggleStatZeroHint('stat-open-hint', openCount);
  toggleStatZeroHint('stat-bids-hint', pendingCount);
  toggleStatZeroHint('stat-won-hint', wonCount);

  const totalCredits = (providerProfile?.bid_credits || 0) + (providerProfile?.free_trial_bids || 0);
  document.getElementById('stat-credits').textContent = totalCredits;

  const dashboardCredits = document.getElementById('dashboard-bid-credits');
  if (dashboardCredits) dashboardCredits.textContent = totalCredits;

  const browseCredits = document.getElementById('browse-credits-count');
  if (browseCredits) browseCredits.textContent = totalCredits;

  const uniqueMembers = new Set(openPackages.map(p => p.member_id)).size;
  document.getElementById('stat-members-nearby').textContent = uniqueMembers;
  toggleStatZeroHint('stat-members-nearby-hint', uniqueMembers);
}

// Exposed on window so providers.js's rating render (loadReviews) can call it
// for the review-count zero state, without duplicating the DOM logic.
window.toggleStatZeroHint = toggleStatZeroHint;

// ========== BASIC POS STATUS ==========
async function loadPosIntegrationStatus() {
  await Promise.all([loadCloverStatus(), loadSquareStatus()]);
  if (typeof loadAllPosTransactions === 'function') {
    loadAllPosTransactions();
  }
}

async function loadCloverStatus() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const headers = session?.access_token
      ? { 'Authorization': `Bearer ${session.access_token}` }
      : {};
    const response = await fetch(`/api/clover/status/${currentUser.id}`, { headers });
    if (!response.ok) {
      console.warn('[loadCloverStatus] /api/clover/status returned', response.status);
      updateCloverUI({ connected: false });
      return;
    }
    const data = await response.json().catch(() => ({}));
    cloverConnectionStatus = data;
    updateCloverUI(data);
  } catch (error) {
    console.log('Clover status check:', error.message || 'Not connected');
    updateCloverUI({ connected: false });
  }
}

async function loadSquareStatus() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const headers = session?.access_token
      ? { 'Authorization': `Bearer ${session.access_token}` }
      : {};
    const response = await fetch(`/api/pos/connections/${currentUser.id}`, { headers });
    if (!response.ok) {
      console.warn('[loadSquareStatus] /api/pos/connections returned', response.status);
      squareConnectionStatus = { connected: false };
      updateSquareUI(squareConnectionStatus);
      return;
    }
    const data = await response.json().catch(() => ({}));

    const squareConnection = data.connections?.find(c => c.pos_provider === 'square');
    if (squareConnection) {
      squareConnectionStatus = { connected: true, ...squareConnection };
      updateSquareUI(squareConnectionStatus);
    } else {
      squareConnectionStatus = { connected: false };
      updateSquareUI({ connected: false });
    }
  } catch (error) {
    console.log('Square status check:', error.message || 'Not connected');
    updateSquareUI({ connected: false });
  }
}

function updateCloverUI(status) {
  const statusBadge = document.getElementById('clover-status-badge');
  const connectBtn = document.getElementById('clover-connect-btn');
  const disconnectBtn = document.getElementById('clover-disconnect-btn');
  const syncBtn = document.getElementById('clover-sync-btn');
  const connectionInfo = document.getElementById('clover-connection-info');
  const statsSection = document.getElementById('clover-stats');
  const card = document.getElementById('clover-card');

  if (!statusBadge) return;

  if (status.connected) {
    statusBadge.className = 'pos-connection-badge connected';
    statusBadge.textContent = 'Connected';
    if (card) card.classList.add('connected');
    if (connectBtn) connectBtn.style.display = 'none';
    if (disconnectBtn) disconnectBtn.style.display = 'inline-flex';
    if (syncBtn) syncBtn.style.display = 'inline-flex';
    if (connectionInfo) connectionInfo.style.display = 'block';
    if (statsSection) statsSection.style.display = 'grid';

    const merchantId = document.getElementById('clover-merchant-id');
    if (merchantId) merchantId.textContent = status.merchant_id || '—';
    
    const lastSync = document.getElementById('clover-last-sync');
    if (lastSync) lastSync.textContent = status.last_sync ? new Date(status.last_sync).toLocaleString() : 'Never';
  } else {
    statusBadge.className = 'pos-connection-badge disconnected';
    statusBadge.textContent = 'Not Connected';
    if (card) card.classList.remove('connected');
    if (connectBtn) connectBtn.style.display = 'inline-flex';
    if (disconnectBtn) disconnectBtn.style.display = 'none';
    if (syncBtn) syncBtn.style.display = 'none';
    if (connectionInfo) connectionInfo.style.display = 'none';
    if (statsSection) statsSection.style.display = 'none';
  }
}

function updateSquareUI(status) {
  const statusBadge = document.getElementById('square-status-badge');
  const connectBtn = document.getElementById('square-connect-btn');
  const disconnectBtn = document.getElementById('square-disconnect-btn');
  const syncBtn = document.getElementById('square-sync-btn');
  const connectionInfo = document.getElementById('square-connection-info');
  const statsSection = document.getElementById('square-stats');
  const card = document.getElementById('square-card');

  if (!statusBadge) return;

  if (status.connected) {
    statusBadge.className = 'pos-connection-badge connected';
    statusBadge.textContent = 'Connected';
    if (card) card.classList.add('connected');
    if (connectBtn) connectBtn.style.display = 'none';
    if (disconnectBtn) disconnectBtn.style.display = 'inline-flex';
    if (syncBtn) syncBtn.style.display = 'inline-flex';
    if (connectionInfo) connectionInfo.style.display = 'block';
    if (statsSection) statsSection.style.display = 'grid';
  } else {
    statusBadge.className = 'pos-connection-badge disconnected';
    statusBadge.textContent = 'Not Connected';
    if (card) card.classList.remove('connected');
    if (connectBtn) connectBtn.style.display = 'inline-flex';
    if (disconnectBtn) disconnectBtn.style.display = 'none';
    if (syncBtn) syncBtn.style.display = 'none';
    if (connectionInfo) connectionInfo.style.display = 'none';
    if (statsSection) statsSection.style.display = 'none';
  }
}

// ========== BASIC EARNINGS ==========
async function loadEarnings() {
  const { data } = await supabaseClient.from('payments')
    .select('*, maintenance_packages(title)')
    .eq('provider_id', currentUser.id)
    .order('created_at', { ascending: false });
  myPayments = data || [];
  renderEarnings();
}

function renderEarnings() {
  const pending = myPayments.filter(p => p.status === 'held').reduce((sum, p) => sum + (p.amount_provider || 0), 0);
  const released = myPayments.filter(p => p.status === 'released').reduce((sum, p) => sum + (p.amount_provider || 0), 0);

  const pendingEl = document.getElementById('earnings-pending');
  if (pendingEl) pendingEl.textContent = '$' + pending.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
  
  const releasedEl = document.getElementById('earnings-released');
  if (releasedEl) releasedEl.textContent = '$' + released.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
  
  const totalEl = document.getElementById('earnings-total');
  if (totalEl) totalEl.textContent = '$' + released.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

  const container = document.getElementById('earnings-list');
  if (!container) return;
  
  if (!myPayments.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">' + mccIcon('dollar-sign', 40) + '</div><p>No payments yet. Complete jobs to see your earnings!</p></div>';
    return;
  }

  container.innerHTML = myPayments.map(p => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px;border-bottom:1px solid var(--border-subtle);">
      <div>
        <div style="font-weight:500;">${p.maintenance_packages?.title || 'Package'}</div>
        <div style="font-size:0.85rem;color:var(--text-muted);">${new Date(p.created_at).toLocaleDateString()}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:600;color:${p.status === 'released' ? 'var(--accent-green)' : p.status === 'held' ? 'var(--accent-blue)' : 'var(--text-muted)'};">
          ${p.status === 'released' ? '+' : ''}$${(p.amount_provider || 0).toFixed(2)}
        </div>
        <div style="font-size:0.8rem;color:var(--text-muted);">
          ${p.status === 'held' ? mccIcon('clock', 16) + ' Payment Held' : p.status === 'released' ? mccIcon('check', 16) + ' Released' : p.status === 'refunded' ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg> Refunded' : p.status}
        </div>
      </div>
    </div>
  `).join('');
}

// ========== REVIEWS ==========
async function loadMyReviews() {
  try {
    // Two-query stitch — the previous `profiles!reviews_member_id_fkey` embed
    // referenced a constraint name that doesn't exist in prod (only
    // provider_reviews_*_fkey constraints exist; there's no `reviews_*_fkey`).
    // The plain `maintenance_packages(title)` embed stays — PostgREST resolves
    // it via implicit FK introspection.
    const { data, error } = await supabaseClient
      .from('reviews')
      .select('*, maintenance_packages(title)')
      .eq('provider_id', currentUser.id)
      .order('created_at', { ascending: false });
    if (error) {
      // Silently handle table not found (404) or other expected errors
      if (error.code === 'PGRST116' || error.code === '42P01') {
        console.log('Reviews table not available');
      } else {
        console.log('loadMyReviews error:', error.message);
      }
      myReviews = [];
    } else {
      const rows = data || [];
      const memberIds = [...new Set(rows.map(r => r.member_id).filter(Boolean))];
      let profilesById = {};
      if (memberIds.length > 0) {
        const { data: profs, error: profErr } = await supabaseClient
          .from('profiles')
          .select('id, full_name')
          .in('id', memberIds);
        if (profErr) {
          console.log('loadMyReviews profiles stitch error:', profErr.message);
        } else {
          profilesById = Object.fromEntries((profs || []).map(p => [p.id, p]));
        }
      }
      myReviews = rows.map(r => ({ ...r, profiles: profilesById[r.member_id] || null }));
    }
    renderReviews();
  } catch (err) {
    console.log('loadMyReviews error:', err);
    myReviews = [];
    renderReviews();
  }
}

function renderReviews() {
  const container = document.getElementById('reviews-list');
  if (!container) return;
  
  if (!myReviews.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">' + mccIcon('star', 40) + '</div><p>No reviews yet.</p></div>';
    return;
  }

  container.innerHTML = myReviews.map(r => `
    <div style="padding:16px;border-bottom:1px solid var(--border-subtle);">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <strong>${r.profiles?.full_name || 'Member'}</strong>
        <span style="color:var(--accent-gold);">${mccIcon('star', 16).repeat(r.rating)}${mccIcon('star', 16).repeat(5-r.rating)}</span>
      </div>
      ${r.comment ? `<p style="color:var(--text-secondary);margin-bottom:8px;">"${r.comment}"</p>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <span style="font-size:0.85rem;color:var(--text-muted);">${r.maintenance_packages?.title || 'Service'} • ${new Date(r.created_at).toLocaleDateString()}</span>
        <button onclick="window.mccModeration && window.mccModeration.openReport({contentType:'review',contentId:'${r.id}',reportedUserId:'${r.member_id || ''}',subjectLabel:'this review'})" style="background:none;border:none;color:var(--text-muted);font-size:0.8rem;cursor:pointer;text-decoration:underline;padding:0;">Report</button>
      </div>
    </div>
  `).join('');
}

// ========== PERFORMANCE ==========
async function loadPerformance() {
  try {
    const { data: existing } = await getProviderPerformance(currentUser.id);
    
    if (existing) {
      myPerformance = existing;
    } else {
      const { data: calculated } = await calculateProviderPerformance(currentUser.id);
      myPerformance = calculated;
    }
    
    renderPerformance();
  } catch (err) {
    console.error('Error loading performance:', err);
    renderPerformance();
  }
}

function renderPerformance() {
  const perf = myPerformance;
  
  const scoreEl = document.getElementById('perf-overall-score');
  if (scoreEl) scoreEl.textContent = perf ? Math.round(perf.overall_score) : '--';
  
  const tier = perf?.tier || 'bronze';
  const tierBadge = document.getElementById('perf-tier-badge');
  if (tierBadge) {
    tierBadge.className = `performance-tier-badge ${tier}`;
    const firstSpan = tierBadge.querySelector('span:first-child');
    if (firstSpan) firstSpan.textContent = getTierIcon(tier);
  }
  
  const tierText = document.getElementById('perf-tier-text');
  if (tierText) tierText.textContent = getTierLabel(tier);
}

function getTierIcon(tier) {
  const icons = { platinum: mccIcon('sparkles', 16), gold: mccIcon('trophy', 16), silver: mccIcon('award', 16), bronze: mccIcon('award', 16) };
  return icons[tier] || mccIcon('award', 16);
}

function getTierLabel(tier) {
  const labels = { platinum: 'Platinum', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };
  return labels[tier] || 'Bronze';
}

// ========== PROVIDER PROFILE ==========
async function loadProviderProfile() {
  const { data } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
  if (data) {
    providerProfile = data;
    populateProfileForm(data);
  }
}

function populateProfileForm(profile) {
  // Generic scalar prefill — only fields whose HTML id matches the
  // `profile-${db_col_with_underscores_to_hyphens}` convention.
  // Off-convention ids (e.g. years_in_business → #profile-years) are
  // handled explicitly below.
  const fields = ['business_name', 'phone', 'full_name', 'street_address', 'city', 'state', 'zip_code', 'description'];
  fields.forEach(f => {
    const el = document.getElementById(`profile-${f.replaceAll('_', '-')}`);
    if (el) el.value = profile[f] || '';
  });

  // years_in_business → #profile-years (off-convention id).
  const yearsEl = document.getElementById('profile-years');
  if (yearsEl) {
    yearsEl.value = profile.years_in_business != null ? String(profile.years_in_business) : '';
  }

  // Certifications — TEXT column, comma-separated. Split into a list; check the
  // matching #certifications-grid boxes; put any unrecognized values back into
  // the #profile-other-certs free-text input so a round-trip preserves them.
  const certList = (profile.certifications || '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  const knownCerts = new Set();
  document.querySelectorAll('#certifications-grid input[type="checkbox"]').forEach(cb => {
    knownCerts.add(cb.value);
    cb.checked = certList.includes(cb.value);
  });
  const otherCertsEl = document.getElementById('profile-other-certs');
  if (otherCertsEl) {
    otherCertsEl.value = certList.filter(c => !knownCerts.has(c)).join(', ');
  }

  // Services offered — text[] ARRAY column. Tick the matching boxes.
  const services = Array.isArray(profile.services_offered) ? profile.services_offered : [];
  document.querySelectorAll('#services-grid input[type="checkbox"]').forEach(cb => {
    cb.checked = services.includes(cb.value);
  });

  if (typeof loadQrCheckinSetting === 'function') {
    loadQrCheckinSetting();
  }
  if (typeof initPublicProfileCard === 'function') {
    initPublicProfileCard();
  }

  // Persistent "didn't geocode" banner. Provider-profile-save runs Nominatim
  // (street then ZIP centroid) on any address change and writes lat/lng back
  // into profiles; a row with a saved address but null coords means the
  // geocoder couldn't find anything — the distance filter treats null coords
  // as permissive so jobs still show up, but the "3.2 mi away" prefill on
  // notify won't work until it's resolved. Show the banner iff there's at
  // least ONE address field filled in but no coords — a blank profile
  // shouldn't nag the provider before they've entered anything.
  const geocodeBanner = document.getElementById('profile-geocode-banner');
  if (geocodeBanner) {
    const hasAddress = !!(profile.street_address || profile.city || profile.state || profile.zip_code);
    const hasCoords = profile.lat != null && profile.lng != null;
    geocodeBanner.style.display = (hasAddress && !hasCoords) ? '' : 'none';
  }
}

// ========== SUBSCRIPTION ==========
async function loadSubscription() {
  try {
    const { data, error } = await supabaseClient
      .from('subscriptions')
      .select('*')
      .eq('provider_id', currentUser.id)
      .eq('status', 'active')
      .single();
    
    if (error) {
      // Silently handle table not found (404) or no rows found
      if (error.code === 'PGRST116' || error.code === '42P01' || error.code === 'PGRST200') {
        console.log('Subscriptions not available');
      }
      return;
    }
    
    if (data) {
      const statusEl = document.getElementById('subscription-status');
      if (statusEl) statusEl.textContent = `${data.plan_name || 'Active'} Plan`;
    }
  } catch (err) {
    console.log('No active subscription');
  }
}

// ========== PURCHASE STATUS ==========
function checkPurchaseStatus() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('purchase') === 'success') {
    showToast(mccIcon('party-popper', 16) + ' Bid credits purchased successfully!', 'success');
    window.history.replaceState({}, '', window.location.pathname);
    loadProviderProfile();
    updateStats();
  } else if (urlParams.get('purchase') === 'canceled') {
    showToast('Purchase canceled', 'warning');
    window.history.replaceState({}, '', window.location.pathname);
  }
}

// ========== DEEP-LINK SECTION HANDLER ==========
// Handles ?section=<id> from external links (specifically the native-app
// "Buy Bid Credits" flow, which opens providers.html?section=subscription
// in SFSafariViewController / Chrome Custom Tabs via @capacitor/browser).
// Silently ignored if the section id isn't in the DOM. Cleared from the
// URL after dispatch so refresh doesn't re-trigger.
function checkDeepLinkSection() {
  const params = new URLSearchParams(window.location.search);
  const section = params.get('section');
  if (!section) return;
  const target = document.getElementById(section);
  if (target && typeof showSection === 'function') {
    showSection(section);
  }
  params.delete('section');
  const qs = params.toString();
  window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''));
}

// ========== REALTIME SUBSCRIPTIONS ==========
function setupRealtimeSubscriptions() {
  supabaseClient
    .channel('provider-updates')
    .on('postgres_changes', { 
      event: 'INSERT', 
      schema: 'public', 
      table: 'maintenance_packages',
      filter: `status=eq.open`
    }, () => {
      if (typeof loadOpenPackages === 'function') loadOpenPackages();
    })
    .on('postgres_changes', { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'bids',
      filter: `provider_id=eq.${currentUser.id}`
    }, () => {
      if (typeof loadMyBids === 'function') loadMyBids();
    })
    .on('postgres_changes', { 
      event: 'INSERT', 
      schema: 'public', 
      table: 'notifications',
      filter: `user_id=eq.${currentUser.id}`
    }, () => {
      if (typeof loadNotifications === 'function') loadNotifications();
    })
    .subscribe();
}

async function loadCarClubCard() {
  const el = document.getElementById('car-club-card-content');
  if (!el) return;
  // Feature gate: do not fire /api/car-club/my-club when car_club_programs_enabled is off.
  // Fail-closed: if loadMccFlags is unavailable or the flag isn't true, skip the fetch.
  if (typeof window.loadMccFlags === 'function') await window.loadMccFlags();
  if (!window._mccFlags?.car_club_programs_enabled) return;
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
    const resp = await fetch(`${apiBase}/api/car-club/my-club`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    if (!resp.ok) {
      console.warn('[loadCarClubCard] /api/car-club/my-club returned', resp.status);
      return;
    }
    const data = await resp.json().catch(() => ({}));
    if (data.club) {
      const club = data.club;
      const rules = club.reward_rules || [];
      const activeRewards = rules.filter(r => r.is_active).length;
      const memberCount = club.member_count || 0;
      el.innerHTML = `<div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:12px;">
        <div style="flex:1;min-width:80px;text-align:center;">
          <div style="font-size:1.5rem;font-weight:700;color:var(--text-primary);">${memberCount}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">Members</div>
        </div>
        <div style="flex:1;min-width:80px;text-align:center;">
          <div style="font-size:1.5rem;font-weight:700;color:var(--text-primary);">${activeRewards}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">Active Rewards</div>
        </div>
      </div>
      <a href="/car-club-provider.html" style="display:inline-block;font-size:0.85rem;color:var(--accent-gold);text-decoration:none;font-weight:500;">Manage →</a>`;
    } else {
      el.innerHTML = `<div style="text-align:center;padding:16px 0;">
        <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:16px;">Build loyalty and keep your customers coming back with reward programs.</p>
        <a href="/car-club-provider.html" class="btn" style="background:linear-gradient(135deg, var(--accent-gold), #c49a45);color:#0a0a0f;font-weight:600;padding:10px 24px;border-radius:10px;text-decoration:none;display:inline-block;">Launch Car Club</a>
      </div>`;
    }
  } catch(e) {
    el.innerHTML = `<div style="text-align:center;padding:16px 0;">
      <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:16px;">Build loyalty and keep your customers coming back with reward programs.</p>
      <a href="/car-club-provider.html" class="btn" style="background:linear-gradient(135deg, var(--accent-gold), #c49a45);color:#0a0a0f;font-weight:600;padding:10px 24px;border-radius:10px;text-decoration:none;display:inline-block;">Launch Car Club</a>
    </div>`;
  }
}

async function initProviderPushNotifications() {
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
    if (typeof window.initCapacitorPush === 'function') {
      await window.initCapacitorPush('provider');
    }
    return;
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('[ProviderPush] Push notifications not supported');
    return;
  }
  
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (typeof updateProviderWebPushUI === 'function') {
      updateProviderWebPushUI(!!subscription);
    }
    console.log('[ProviderPush] Web push subscription:', subscription ? 'active' : 'none');
  } catch (err) {
    console.log('[ProviderPush] Push notification setup error:', err);
  }
}

// ========== LOGOUT ==========
async function logout() {
  try {
    const storedToken = localStorage.getItem('mcc_fcm_token');
    if (storedToken) {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session) {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        await fetch(`${apiBase}/api/push/unregister-device`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ token: storedToken })
        }).catch(() => {});
        localStorage.removeItem('mcc_fcm_token');
      }
    }
  } catch {}
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
}

function switchToMember() {
  localStorage.setItem('mcc_portal', 'member');
  window.location.href = 'members.html';
}

function showProviderFounderPromo() {
  const banner = document.getElementById('provider-founder-promo');
  if (!banner) return;
  const dismissed = localStorage.getItem('providerFounderPromoDismissed');
  if (dismissed) return;
  banner.style.display = 'block';
}

window.dismissProviderFounderPromo = function() {
  const banner = document.getElementById('provider-founder-promo');
  if (banner) banner.style.display = 'none';
  localStorage.setItem('providerFounderPromoDismissed', Date.now().toString());
};

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(showProviderFounderPromo, 1000);
});

console.log('providers-core.js loaded');
