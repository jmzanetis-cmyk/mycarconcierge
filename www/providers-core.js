// ========== PROVIDERS CORE MODULE ==========
// Essential initialization, state management, auth, and module loading

// ========== MODULE LOADER ==========
const loadedModules = {};
async function loadModule(name) {
  if (loadedModules[name]) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `/providers-${name}.js`;
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
      return loadModule('jobs');
    case 'earnings':
    case 'earnings-analytics':
    case 'pos-analytics':
    case 'pos-integration':
      return loadModule('analytics');
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
    themeIcon.textContent = currentTheme === 'dark' ? '🌙' : '☀️';
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
    iconDisplay.textContent = currentTheme === 'dark' ? '🌙' : '☀️';
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
    const result = await response.json();
    
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
      alert('Provider access required.');
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
    showToast('Error loading page. Check console for details.', 'error');
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
    }),
    loadEarnings(),
    loadMyReviews(),
    loadProviderProfile(),
    loadSubscription(),
    loadPosIntegrationStatus(),
    loadPerformance()
  ]);
  
  // Load service credits after profile is loaded (needs providerProfile)
  if (typeof window.loadServiceCredits === 'function') {
    console.log('[Init] Loading service credits...');
    window.loadServiceCredits();
  } else {
    console.warn('[Init] loadServiceCredits not available');
  }
  
  updateStats();
  setupNav();
  
  // Load settings module for notifications
  loadModule('settings').then(() => {
    if (typeof loadNotifications === 'function') loadNotifications();
    if (typeof loadTeamManagementData === 'function') loadTeamManagementData();
    if (typeof loadLoyaltyNetwork === 'function') loadLoyaltyNetwork();
  });
  
  // Load jobs module for emergencies
  loadModule('jobs').then(() => {
    if (typeof setupEmergencySettings === 'function') setupEmergencySettings();
    if (typeof refreshEmergencies === 'function') refreshEmergencies();
    if (typeof loadDestinationTasks === 'function') loadDestinationTasks();
  });
  
  checkPurchaseStatus();
  
  if (typeof applyFilters === 'function') applyFilters();
  
  setupRealtimeSubscriptions();
  initProviderPushNotifications();
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
  
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`.nav-item[data-section="${id}"]`)?.classList.add('active');
  document.getElementById('sidebar').classList.remove('open');
  
  // Section-specific loading
  if (id === 'team' && typeof loadTeamMembers === 'function') {
    loadTeamMembers();
    if (typeof loadBackgroundCheckStatus === 'function') loadBackgroundCheckStatus();
  }
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
}

// ========== CORE UTILITY FUNCTIONS ==========
function showToast(message, type = 'success') {
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

function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
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
    
    const result = await response.json();
    
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
    showToast('Failed to delete account: ' + error.message, 'error');
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

window.openDeleteAccountModal = openDeleteAccountModal;
window.confirmDeleteAccount = confirmDeleteAccount;

// ========== STATS UPDATE ==========
function updateStats() {
  document.getElementById('stat-open').textContent = openPackages.length;
  document.getElementById('stat-bids').textContent = myBids.filter(b => b.status === 'pending').length;
  document.getElementById('stat-won').textContent = myBids.filter(b => b.status === 'accepted').length;
  
  const totalCredits = (providerProfile?.bid_credits || 0) + (providerProfile?.free_trial_bids || 0);
  document.getElementById('stat-credits').textContent = totalCredits;
  
  const dashboardCredits = document.getElementById('dashboard-bid-credits');
  if (dashboardCredits) dashboardCredits.textContent = totalCredits;
  
  const browseCredits = document.getElementById('browse-credits-count');
  if (browseCredits) browseCredits.textContent = totalCredits;
  
  const uniqueMembers = new Set(openPackages.map(p => p.member_id)).size;
  document.getElementById('stat-members-nearby').textContent = uniqueMembers;
}

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
    const data = await response.json();
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
    const data = await response.json();
    
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
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💰</div><p>No payments yet. Complete jobs to see your earnings!</p></div>';
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
          ${p.status === 'held' ? '⏳ In Escrow' : p.status === 'released' ? '✓ Released' : p.status === 'refunded' ? '↩ Refunded' : p.status}
        </div>
      </div>
    </div>
  `).join('');
}

// ========== REVIEWS ==========
async function loadMyReviews() {
  try {
    const { data, error } = await supabaseClient
      .from('reviews')
      .select('*, maintenance_packages(title), profiles!reviews_member_id_fkey(full_name)')
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
      myReviews = data || [];
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
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⭐</div><p>No reviews yet.</p></div>';
    return;
  }

  container.innerHTML = myReviews.map(r => `
    <div style="padding:16px;border-bottom:1px solid var(--border-subtle);">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <strong>${r.profiles?.full_name || 'Member'}</strong>
        <span style="color:var(--accent-gold);">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span>
      </div>
      ${r.comment ? `<p style="color:var(--text-secondary);margin-bottom:8px;">"${r.comment}"</p>` : ''}
      <div style="font-size:0.85rem;color:var(--text-muted);">${r.maintenance_packages?.title || 'Service'} • ${new Date(r.created_at).toLocaleDateString()}</div>
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
  const icons = { platinum: '💎', gold: '🏆', silver: '🥈', bronze: '🥉' };
  return icons[tier] || '🥉';
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
  const fields = ['business_name', 'phone', 'address', 'city', 'state', 'zip_code', 'bio', 'hourly_rate'];
  fields.forEach(f => {
    const el = document.getElementById(`profile-${f.replace('_', '-')}`);
    if (el) el.value = profile[f] || '';
  });
  
  if (typeof loadQrCheckinSetting === 'function') {
    loadQrCheckinSetting();
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
    showToast('🎉 Bid credits purchased successfully!', 'success');
    window.history.replaceState({}, '', window.location.pathname);
    loadProviderProfile();
    updateStats();
  } else if (urlParams.get('purchase') === 'canceled') {
    showToast('Purchase canceled', 'warning');
    window.history.replaceState({}, '', window.location.pathname);
  }
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

// ========== PUSH NOTIFICATIONS ==========
async function initProviderPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push notifications not supported');
    return;
  }
  
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      console.log('No push subscription yet');
    }
  } catch (err) {
    console.log('Push notification setup error:', err);
  }
}

// ========== LOGOUT ==========
async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
}

function switchToMember() {
  localStorage.setItem('mcc_portal', 'member');
  window.location.href = 'members.html';
}

console.log('providers-core.js loaded');
