    // ========== SECURITY HELPERS ==========
    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = String(text);
      return div.innerHTML;
    }

    // ========== FETCH HELPER ==========
    async function safeFetch(url, options) {
      const res = await fetch(url, options);
      if (!res.ok) {
        let errMsg = `Server error (${res.status})`;
        try { const e = await res.clone().json(); errMsg = e.error || e.message || errMsg; } catch {}
        throw new Error(errMsg);
      }
      return res.json();
    }
    
    // ========== STATE ==========
    let currentUser = null;
    let applications = [];
    let providers = [];
    let payments = [];
    let disputes = [];
    let tickets = [];
    let members = [];
    let registrationVerifications = [];
    let currentApplication = null;
    let currentDispute = null;
    let currentTicket = null;
    let currentVerification = null;
    let currentFilters = {
      applications: 'pending',
      payments: 'held',
      disputes: 'open',
      tickets: 'open',
      registrations: 'all'
    };

    // ========== PAGINATION STATE ==========
    const paginationState = {
      providers: { page: 1, limit: 25, total: 0, totalPages: 0, search: '', filter: 'all' },
      members: { page: 1, limit: 25, total: 0, totalPages: 0, search: '', filter: 'all' },
      packages: { page: 1, limit: 25, total: 0, totalPages: 0, search: '', filter: 'all' },
      agreements: { page: 1, limit: 25, total: 0, totalPages: 0, search: '', filter: 'all' },
      refunds: { page: 1, limit: 25, total: 0, totalPages: 0, filter: 'all' }
    };
    
    // Debounce helper for search functions
    let searchDebounceTimers = {};
    function debounceSearch(key, fn, delay = 300) {
      if (searchDebounceTimers[key]) {
        clearTimeout(searchDebounceTimers[key]);
      }
      searchDebounceTimers[key] = setTimeout(fn, delay);
    }
    
    function renderPaginationControls(state, changePageFn) {
      const start = state.total === 0 ? 0 : (state.page - 1) * state.limit + 1;
      const end = Math.min(state.page * state.limit, state.total);
      
      return `
        <div class="pagination-controls" style="display:flex;justify-content:space-between;align-items:center;padding:16px 0;border-top:1px solid var(--border-subtle);margin-top:16px;">
          <div style="color:var(--text-secondary);font-size:0.9rem;">
            Showing ${start}-${end} of ${state.total}
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <button class="btn btn-secondary btn-sm" onclick="${changePageFn}(-1)" ${state.page <= 1 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
              ← Previous
            </button>
            <span style="color:var(--text-primary);font-size:0.9rem;font-weight:500;">
              Page ${state.page} of ${state.totalPages || 1}
            </span>
            <button class="btn btn-secondary btn-sm" onclick="${changePageFn}(1)" ${state.page >= state.totalPages ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
              Next →
            </button>
          </div>
        </div>
      `;
    }

    // ========== LAZY LOADING STATE ==========
    const loadedSections = {
      dashboard: false,
      analytics: false,
      applications: false,
      providers: false,
      violations: false,
      'car-reviews': false,
      'pilot-applications': false,
      'member-founders': false,
      'commission-payouts': false,
      packages: false,
      payments: false,
      disputes: false,
      refunds: false,
      'registration-verifications': false,
      tickets: false,
      members: false,
      'user-roles': false,
      'user-management': false,
      'merch-manager': false,
      agreements: false,
      settings: false,
      'ai-chat-insights': false,
      crm: false,
      traffic: false,
      'marketing-outreach': false,
      'ai-ops': false,
      'agent-fleet': false,
      'saas-subscriptions': false,
      'white-label': false,
      'survey-analytics': false,
      'member-surveys': false
    };

    const sectionLoaders = {
      dashboard: async () => { await loadDashboardCharts(); },
      analytics: async () => { await loadAnalytics(); },
      applications: async () => { await loadApplications(); },
      providers: async () => { await loadProviders(); },
      violations: async () => { await loadViolationReports(); },
      'car-reviews': async () => { await loadPendingCARs(); },
      'pilot-applications': async () => { await loadPilotApplications(); },
      'member-founders': async () => { await loadMemberFounderApplications(); },
      'commission-payouts': async () => { await loadFounderPayouts(); },
      packages: async () => { await loadAllPackages(); },
      payments: async () => { await loadPayments(); },
      disputes: async () => { await loadDisputes(); },
      refunds: async () => { await loadRefunds(); },
      'registration-verifications': async () => { await loadRegistrationVerifications(); },
      tickets: async () => { await loadTickets(); },
      members: async () => { await loadMembers(); },
      'user-roles': async () => { await loadUserRoles(); },
      'user-management': async () => { await loadUserManagement(); },
      'merch-manager': async () => { await loadDesignLibrary(); await loadMerchPreferences(); },
      agreements: async () => { await loadAgreements(); },
      settings: async () => { await load2faGlobalStatus(); },
      'ai-chat-insights': async () => { await loadChatInsights(); },
      crm: async () => { await loadCrmData(); },
      'team-management': async () => { await loadTeamMembers(); },
      traffic: async () => { await loadTrafficData(); },
      'marketing-outreach': async () => { await initMarketingHub(); if (typeof window.initOutreachEngine === 'function') await window.initOutreachEngine(); },
      'ai-ops': async () => { await initAiOps(); },
      'agent-fleet': async () => { await loadAgentFleetSection(); },
      'sms-log': async () => { await loadSmsLog(1); },
      'saas-subscriptions': async () => { await loadSaasSubscriptions(); },
      'white-label': async () => { await loadWhiteLabelTenants(); },
      'api-usage': async () => { await loadApiUsage(); },
      'survey-analytics': async () => { await loadSurveyAnalytics(); },
      'member-surveys': async () => { await loadMemberSurveyAnalytics(); },
      'car-clubs': async () => { if (typeof loadCarClubs === 'function') await loadCarClubs(); }
    };

    function showSectionLoading(sectionId) {
      const section = document.getElementById(sectionId);
      if (!section) return;
      let loader = section.querySelector('.section-loader');
      if (!loader) {
        loader = document.createElement('div');
        loader.className = 'section-loader';
        loader.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px;color:var(--text-muted);">
            <div style="width:32px;height:32px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;"></div>
            <p style="margin-top:16px;">Loading...</p>
          </div>
        `;
        section.insertBefore(loader, section.firstChild);
      }
      loader.style.display = 'block';
    }

    function hideSectionLoading(sectionId) {
      const section = document.getElementById(sectionId);
      if (!section) return;
      const loader = section.querySelector('.section-loader');
      if (loader) loader.style.display = 'none';
    }

    async function loadSectionIfNeeded(sectionId) {
      if (loadedSections[sectionId]) return;
      const loader = sectionLoaders[sectionId];
      if (!loader) return;
      
      showSectionLoading(sectionId);
      try {
        await loader();
        loadedSections[sectionId] = true;
      } catch (err) {
        console.error(`Error loading section ${sectionId}:`, err);
      } finally {
        hideSectionLoading(sectionId);
      }
    }

    // ========== INIT ==========
    let adminPasswordVerified = false;
    let adminTeamToken = null;
    let adminTeamUser = null;
    let adminPermissions = null;
    let currentModalState = 'loading'; // 'loading', 'login', 'password', 'not-admin', 'team-login'
    
    function showModalState(state) {
      currentModalState = state;
      const loginForm = document.getElementById('admin-login-form');
      const passwordForm = document.getElementById('admin-password-form');
      const teamLoginForm = document.getElementById('admin-team-login-form');
      const notAdminError = document.getElementById('admin-not-admin-error');
      const modalBtn = document.getElementById('admin-modal-btn');
      const modalTitle = document.getElementById('admin-modal-title');
      
      loginForm.style.display = 'none';
      passwordForm.style.display = 'none';
      if (teamLoginForm) teamLoginForm.style.display = 'none';
      notAdminError.style.display = 'none';
      
      if (state === 'login') {
        modalTitle.innerHTML = mccIcon('lock', 16) + ' Admin Sign In';
        loginForm.style.display = 'block';
        modalBtn.textContent = 'Sign In';
        modalBtn.style.display = 'block';
        document.getElementById('admin-login-email').focus();
      } else if (state === 'password') {
        modalTitle.innerHTML = mccIcon('lock', 16) + ' Admin Access';
        passwordForm.style.display = 'block';
        modalBtn.textContent = 'Verify';
        modalBtn.style.display = 'block';
        document.getElementById('admin-password-input').focus();
      } else if (state === 'team-login') {
        modalTitle.innerHTML = mccIcon('users', 16) + ' Team Login';
        if (teamLoginForm) teamLoginForm.style.display = 'block';
        modalBtn.textContent = 'Sign In';
        modalBtn.style.display = 'block';
        document.getElementById('team-login-email')?.focus();
      } else if (state === 'not-admin') {
        modalTitle.innerHTML = mccIcon('alert-triangle', 16) + ' Access Denied';
        notAdminError.style.display = 'block';
        modalBtn.textContent = 'Sign Out & Try Again';
        modalBtn.style.display = 'block';
      }
    }
    
    async function handleAdminModalAction() {
      if (currentModalState === 'loading') {
        var pwForm = document.getElementById('admin-password-form');
        var loginForm = document.getElementById('admin-login-form');
        var teamForm = document.getElementById('admin-team-login-form');
        if (teamForm && teamForm.style.display !== 'none') {
          currentModalState = 'team-login';
          await performTeamLogin();
        } else if (pwForm && pwForm.style.display !== 'none') {
          currentModalState = 'password';
          await verifyAdminPassword();
        } else if (loginForm && loginForm.style.display !== 'none') {
          currentModalState = 'login';
          await performAdminLogin();
        } else {
          showModalState('login');
        }
        return;
      }
      if (currentModalState === 'login') {
        await performAdminLogin();
      } else if (currentModalState === 'password') {
        await verifyAdminPassword();
      } else if (currentModalState === 'team-login') {
        await performTeamLogin();
      } else if (currentModalState === 'not-admin') {
        await supabaseClient.auth.signOut();
        showModalState('login');
      }
    }
    
    async function performAdminLogin() {
      const email = document.getElementById('admin-login-email').value.trim();
      const password = document.getElementById('admin-login-password').value;
      const errorEl = document.getElementById('admin-login-error');
      const btn = document.getElementById('admin-modal-btn');
      
      if (!email || !password) {
        errorEl.textContent = 'Please enter email and password.';
        errorEl.style.display = 'block';
        return;
      }
      
      btn.textContent = 'Signing in...';
      btn.disabled = true;
      errorEl.style.display = 'none';
      
      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        
        if (error) {
          errorEl.textContent = error.message;
          errorEl.style.display = 'block';
          btn.textContent = 'Sign In';
          btn.disabled = false;
          return;
        }
        
        if (data.user) {
          currentUser = data.user;
          // Check if admin
          const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', currentUser.id).single();
          
          if (!profile || profile.role !== 'admin') {
            showModalState('not-admin');
            btn.disabled = false;
            return;
          }
          
          // Admin confirmed, show password verification
          showModalState('password');
          btn.disabled = false;
        }
      } catch (err) {
        errorEl.textContent = 'Login failed. Please try again.';
        errorEl.style.display = 'block';
        btn.textContent = 'Sign In';
        btn.disabled = false;
      }
    }
    
    // Listen for auth state changes
    try { supabaseClient.auth.onAuthStateChange(async (event, session) => {
      console.log('[Admin] Auth state changed:', event, { hasSession: !!session });
      
      if (event === 'SIGNED_IN' && session?.user && currentModalState === 'login') {
        currentUser = session.user;
        window._adminEmail = session.user.email || '';
        const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', currentUser.id).single();
        if (profile?.role === 'admin') {
          showModalState('password');
        } else {
          showModalState('not-admin');
        }
      }
    });
    } catch(e) { console.error('[Admin] onAuthStateChange setup error:', e); }
    
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

    window.addEventListener('load', async () => {
      console.log('[Admin] Page loaded, checking auth...');
      
      // Set up enter key handlers
      document.getElementById('admin-login-email').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('admin-login-password').focus();
      });
      document.getElementById('admin-login-password').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAdminModalAction();
      });
      document.getElementById('admin-password-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAdminModalAction();
      });
      const teamEmailEl = document.getElementById('team-login-email');
      if (teamEmailEl) {
        teamEmailEl.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') document.getElementById('team-login-password')?.focus();
        });
        document.getElementById('team-login-password')?.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') handleAdminModalAction();
        });
      }
      
      try {
        // Check for existing session
        const { data: { session } } = await supabaseClient.auth.getSession();
        console.log('[Admin] getSession result:', { hasSession: !!session, hasUser: !!session?.user });
        
        if (session?.user) {
          currentUser = session.user;
          window._adminEmail = session.user.email || '';
          
          // Check 2FA authorization before checking admin role
          const authorized = await checkAccessAuthorization();
          if (!authorized) return;
          
          // Check if admin
          const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', currentUser.id).single();
          console.log('[Admin] Profile:', profile);
          
          if (profile?.role === 'admin') {
            showModalState('password');
          } else {
            showModalState('not-admin');
          }
        } else {
          // No session - show login form (NO REDIRECT!)
          console.log('[Admin] No session, showing login form');
          showModalState('login');
        }
      } catch (err) {
        console.error('[Admin] Init error, falling back to login:', err);
        showModalState('login');
      }
    });
    
    async function verifyAdminPassword() {
      const password = document.getElementById('admin-password-input').value;
      const errorEl = document.getElementById('admin-password-error');
      const btn = document.getElementById('admin-modal-btn');
      
      if (!password) {
        errorEl.textContent = 'Please enter a password.';
        errorEl.style.display = 'block';
        return;
      }
      
      btn.textContent = 'Verifying...';
      btn.disabled = true;
      errorEl.style.display = 'none';
      
      try {
        // Call Supabase RPC function for secure server-side password verification
        const { data, error } = await supabaseClient.rpc('verify_admin_password', {
          input_password: password
        });
        
        if (error) {
          console.error('Password verification error:', error);
          errorEl.textContent = 'Error: ' + (error.message || 'Verification failed');
          errorEl.style.display = 'block';
          btn.textContent = 'Verify';
          btn.disabled = false;
          return;
        }
        
        if (data === true) {
          adminPasswordVerified = password;
          localStorage.setItem('mcc_admin_pass', password);
          adminPermissions = null;
          document.getElementById('admin-password-modal').style.display = 'none';
          applyRolePermissions(null);
          await loadAllData();
          setupEventListeners();
        } else {
          errorEl.textContent = 'Invalid password. Please try again.';
          errorEl.style.display = 'block';
          btn.textContent = 'Verify';
          btn.disabled = false;
        }
      } catch (error) {
        console.error('Password verification error:', error);
        errorEl.textContent = 'Error: ' + (error.message || 'Unknown error');
        errorEl.style.display = 'block';
        btn.textContent = 'Verify';
        btn.disabled = false;
      }
    }
    
    window.handleAdminModalAction = handleAdminModalAction;
    window.verifyAdminPassword = verifyAdminPassword;

    (function bindAdminButtons() {
      function attach() {
        var btn = document.getElementById('admin-modal-btn');
        var cancelBtn = document.getElementById('admin-cancel-btn');
        if (btn) {
          btn.removeEventListener('click', handleAdminModalAction);
          btn.addEventListener('click', handleAdminModalAction);
        }
        if (cancelBtn) {
          cancelBtn.onclick = function() { window.location.href = 'index.html'; };
        }
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attach);
      } else {
        attach();
      }
    })();
    
    function showForgotAdminPassword(event) {
      event.preventDefault();
      const infoDiv = document.getElementById('admin-forgot-password-info');
      infoDiv.style.display = infoDiv.style.display === 'none' ? 'block' : 'none';
    }
    window.showForgotAdminPassword = showForgotAdminPassword;

    async function loadAllData() {
      await Promise.all([
        loadDashboardStats(),
        loadDashboardCharts(),
        loadAnalytics()
      ]);
      loadedSections.dashboard = true;
      loadedSections.analytics = true;
      updateDashboard();
      // Task #139 — start agent-fleet badge polling once admin is verified,
      // and explicitly load the dashboard agent tile (also called from
      // loadDashboardCharts as a best-effort, but called here too so the
      // dependency on charts succeeding does not gate fleet visibility).
      if (typeof loadAgentFleetBadge === 'function') {
        loadAgentFleetBadge();
        if (!_agentFleetBadgeTimer) {
          _agentFleetBadgeTimer = setInterval(() => {
            try { loadAgentFleetBadge(); } catch (_) {}
          }, 60000);
        }
      }
      if (typeof loadDashboardAgentTile === 'function') {
        try { await loadDashboardAgentTile(); }
        catch (e) { console.warn('[admin] dashboard agent tile failed:', e); }
      }
    }

    async function loadDashboardStats() {
      try {
        const [
          { count: appCount },
          { count: providerCount },
          { count: disputeCount },
          { count: ticketCount },
          { count: violationCount },
          { count: carCount },
          { count: pilotCount },
          { count: memberFounderCount },
          { count: payoutCount },
          { count: memberCount },
          { count: registrationCount }
        ] = await Promise.all([
          supabaseClient.from('provider_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabaseClient.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'provider').eq('application_status', 'approved'),
          supabaseClient.from('disputes').select('*', { count: 'exact', head: true }).eq('status', 'open'),
          Promise.resolve(supabaseClient.from('helpdesk_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open')).catch(() => ({ count: 0 })),
          Promise.resolve(supabaseClient.from('violation_reports').select('*', { count: 'exact', head: true }).eq('status', 'pending')).catch(() => ({ count: 0 })),
          Promise.resolve(supabaseClient.from('completed_activity_reviews').select('*', { count: 'exact', head: true }).eq('status', 'pending')).catch(() => ({ count: 0 })),
          supabaseClient.from('pilot_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabaseClient.from('member_founder_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabaseClient.from('founder_payouts').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabaseClient.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'member'),
          supabaseClient.from('registration_verifications').select('*', { count: 'exact', head: true }).in('status', ['pending', 'manual_review'])
        ]);

        document.getElementById('app-count').textContent = appCount || 0;
        document.getElementById('dispute-count').textContent = disputeCount || 0;
        document.getElementById('ticket-count').textContent = ticketCount || 0;
        document.getElementById('violation-count').textContent = violationCount || 0;
        document.getElementById('car-count').textContent = carCount || 0;
        document.getElementById('pilot-count').textContent = pilotCount || 0;
        document.getElementById('member-founder-count').textContent = memberFounderCount || 0;
        document.getElementById('payout-count').textContent = payoutCount || 0;
        document.getElementById('registration-count').textContent = registrationCount || 0;

        const statApps = document.getElementById('stat-pending-apps');
        const statProviders = document.getElementById('stat-providers');
        const statDisputes = document.getElementById('stat-disputes');
        const statTickets = document.getElementById('stat-tickets');
        const statMembers = document.getElementById('stat-members');
        if (statApps) statApps.textContent = appCount || 0;
        if (statProviders) statProviders.textContent = providerCount || 0;
        if (statDisputes) statDisputes.textContent = disputeCount || 0;
        if (statTickets) statTickets.textContent = ticketCount || 0;
        if (statMembers) statMembers.textContent = memberCount || 0;
      } catch (err) {
        console.error('Dashboard stats error:', err);
      }
    }

    // ========== ANALYTICS ==========
    let analyticsDateRange = 7; // days

    async function loadAnalytics() {
      const startDate = analyticsDateRange > 0 
        ? new Date(Date.now() - analyticsDateRange * 24 * 60 * 60 * 1000).toISOString()
        : null;

      try {
        // Fetch all data for analytics
        let paymentsQuery = supabaseClient.from('payments').select('*');
        let packagesQuery = supabaseClient.from('maintenance_packages').select('*');
        let bidsQuery = supabaseClient.from('bids').select('*');
        let membersQuery = supabaseClient.from('profiles').select('*').eq('role', 'member');
        let providersQuery = supabaseClient.from('profiles').select('*').eq('role', 'provider');
        let reviewsQuery = supabaseClient.from('provider_reviews').select('*');
        let disputesQuery = supabaseClient.from('disputes').select('*');

        if (startDate) {
          paymentsQuery = paymentsQuery.gte('created_at', startDate);
          packagesQuery = packagesQuery.gte('created_at', startDate);
          bidsQuery = bidsQuery.gte('created_at', startDate);
          membersQuery = membersQuery.gte('created_at', startDate);
          providersQuery = providersQuery.gte('created_at', startDate);
        }

        const [
          { data: paymentsData },
          { data: packagesData },
          { data: bidsData },
          { data: membersData },
          { data: providersData },
          { data: reviewsData },
          { data: disputesData }
        ] = await Promise.all([
          paymentsQuery,
          packagesQuery,
          bidsQuery,
          membersQuery,
          providersQuery,
          reviewsQuery,
          disputesQuery
        ]);

        const payments = paymentsData || [];
        const packages = packagesData || [];
        const bids = bidsData || [];
        const newMembers = membersData || [];
        const newProviders = providersData || [];
        const reviews = reviewsData || [];
        const disputes = disputesData || [];

        // Calculate metrics
        const totalRevenue = payments.filter(p => p.status === 'released').reduce((sum, p) => sum + (p.mcc_fee || 0), 0);
        const totalPackages = packages.length;
        const totalBids = bids.length;
        const completedJobs = packages.filter(p => p.status === 'completed').length;

        // Update key metrics
        document.getElementById('analytics-revenue').textContent = '$' + totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        document.getElementById('analytics-packages').textContent = totalPackages.toLocaleString();
        document.getElementById('analytics-bids').textContent = totalBids.toLocaleString();
        document.getElementById('analytics-completed').textContent = completedJobs.toLocaleString();

        // Revenue chart
        renderRevenueChart(payments);

        // Signups chart
        renderSignupsChart(newMembers, newProviders);

        // Top providers
        renderTopProviders();

        // Category breakdown
        renderCategoryBreakdown(packages);

        // Platform health
        const acceptedBids = bids.filter(b => b.status === 'accepted').length;
        const bidRate = totalBids > 0 ? ((acceptedBids / totalBids) * 100).toFixed(1) : 0;
        const avgBidsPerPackage = totalPackages > 0 ? (totalBids / totalPackages).toFixed(1) : 0;
        const avgRating = reviews.length > 0 ? (reviews.reduce((sum, r) => sum + r.overall_rating, 0) / reviews.length).toFixed(1) : '--';
        const disputeRate = completedJobs > 0 ? ((disputes.length / completedJobs) * 100).toFixed(1) : 0;

        document.getElementById('health-bid-rate').textContent = bidRate + '%';
        document.getElementById('health-avg-bids').textContent = avgBidsPerPackage;
        document.getElementById('health-avg-rating').innerHTML = avgRating + ' ' + mccIcon('star', 16);
        document.getElementById('health-dispute-rate').textContent = disputeRate + '%';
        document.getElementById('health-time-to-accept').textContent = '~24 hrs'; // Placeholder

      } catch (err) {
        console.error('Analytics error:', err);
      }
    }

    function renderRevenueChart(payments) {
      const container = document.getElementById('revenue-chart');
      const releasedPayments = payments.filter(p => p.status === 'released' && p.released_at);
      
      if (!releasedPayments.length) {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center;width:100%;">No revenue data for this period</p>';
        return;
      }

      // Group by day
      const dailyRevenue = {};
      releasedPayments.forEach(p => {
        const day = new Date(p.released_at).toLocaleDateString();
        dailyRevenue[day] = (dailyRevenue[day] || 0) + (p.mcc_fee || 0);
      });

      const days = Object.keys(dailyRevenue).sort((a, b) => new Date(a) - new Date(b)).slice(-14);
      const maxRevenue = Math.max(...days.map(d => dailyRevenue[d]));

      container.innerHTML = days.map(day => {
        const value = dailyRevenue[day];
        const height = maxRevenue > 0 ? (value / maxRevenue) * 180 : 0;
        const shortDay = new Date(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
            <div style="font-size:0.7rem;color:var(--text-muted);">$${value.toFixed(0)}</div>
            <div style="width:100%;max-width:40px;height:${Math.max(height, 4)}px;background:linear-gradient(180deg, var(--accent-green), rgba(74,200,140,0.5));border-radius:4px 4px 0 0;"></div>
            <div style="font-size:0.65rem;color:var(--text-muted);white-space:nowrap;">${shortDay}</div>
          </div>
        `;
      }).join('');
    }

    function renderSignupsChart(members, providers) {
      const container = document.getElementById('signups-chart');
      
      // Combine and group by day
      const dailySignups = {};
      [...members, ...providers].forEach(p => {
        const day = new Date(p.created_at).toLocaleDateString();
        if (!dailySignups[day]) dailySignups[day] = { members: 0, providers: 0 };
        if (p.role === 'provider') {
          dailySignups[day].providers++;
        } else {
          dailySignups[day].members++;
        }
      });

      const days = Object.keys(dailySignups).sort((a, b) => new Date(a) - new Date(b)).slice(-14);
      
      if (!days.length) {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center;width:100%;">No signup data for this period</p>';
        return;
      }

      const maxSignups = Math.max(...days.map(d => dailySignups[d].members + dailySignups[d].providers));

      container.innerHTML = days.map(day => {
        const data = dailySignups[day];
        const total = data.members + data.providers;
        const height = maxSignups > 0 ? (total / maxSignups) * 180 : 0;
        const memberHeight = maxSignups > 0 ? (data.members / maxSignups) * 180 : 0;
        const providerHeight = maxSignups > 0 ? (data.providers / maxSignups) * 180 : 0;
        const shortDay = new Date(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
            <div style="font-size:0.7rem;color:var(--text-muted);">${total}</div>
            <div style="width:100%;max-width:40px;display:flex;flex-direction:column;">
              <div style="height:${Math.max(providerHeight, total > 0 ? 2 : 0)}px;background:var(--accent-gold);border-radius:4px 4px 0 0;"></div>
              <div style="height:${Math.max(memberHeight, total > 0 ? 2 : 0)}px;background:var(--accent-blue);border-radius:0 0 0 0;"></div>
            </div>
            <div style="font-size:0.65rem;color:var(--text-muted);white-space:nowrap;">${shortDay}</div>
          </div>
        `;
      }).join('') + `
        <div style="position:absolute;top:0;right:0;font-size:0.75rem;">
          <span style="color:var(--accent-blue);"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent-blue);margin-right:4px;"></span> Members</span>
          <span style="color:var(--accent-gold);margin-left:8px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent-gold);margin-right:4px;"></span> Providers</span>
        </div>
      `;
      container.style.position = 'relative';
    }

    async function renderTopProviders() {
      const container = document.getElementById('top-providers-list');
      
      const { data: reviews } = await supabaseClient
        .from('provider_reviews')
        .select('provider_id, overall_rating');

      if (!reviews?.length) {
        container.innerHTML = '<p style="color:var(--text-muted);">No provider data yet</p>';
        return;
      }

      // Calculate avg rating per provider
      const providerRatings = {};
      reviews.forEach(r => {
        if (!providerRatings[r.provider_id]) {
          providerRatings[r.provider_id] = { sum: 0, count: 0 };
        }
        providerRatings[r.provider_id].sum += r.overall_rating;
        providerRatings[r.provider_id].count++;
      });

      const ranked = Object.entries(providerRatings)
        .map(([id, data]) => ({ id, avg: data.sum / data.count, count: data.count }))
        .filter(p => p.count >= 2)
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 5);

      if (!ranked.length) {
        container.innerHTML = '<p style="color:var(--text-muted);">Not enough data yet</p>';
        return;
      }

      // Get provider names
      const { data: profiles } = await supabaseClient
        .from('profiles')
        .select('id, business_name, full_name')
        .in('id', ranked.map(r => r.id));

      const profileMap = {};
      profiles?.forEach(p => profileMap[p.id] = p);

      container.innerHTML = ranked.map((p, i) => {
        const profile = profileMap[p.id] || {};
        const name = profile.business_name || profile.full_name || 'Provider';
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;${i < ranked.length - 1 ? 'border-bottom:1px solid var(--border-subtle);' : ''}">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:1.2rem;">${i === 0 ? mccIcon('award', 20) : i === 1 ? mccIcon('award', 20) : i === 2 ? mccIcon('award', 20) : mccIcon('star', 20)}</span>
              <span>${name}</span>
            </div>
            <div style="text-align:right;">
              <div style="font-weight:600;">${p.avg.toFixed(1)} ${mccIcon('star', 16)}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${p.count} reviews</div>
            </div>
          </div>
        `;
      }).join('');
    }

    function renderCategoryBreakdown(packages) {
      const container = document.getElementById('category-breakdown');
      
      if (!packages.length) {
        container.innerHTML = '<p style="color:var(--text-muted);">No package data for this period</p>';
        return;
      }

      const categories = {};
      packages.forEach(p => {
        const cat = p.category || 'other';
        categories[cat] = (categories[cat] || 0) + 1;
      });

      const total = packages.length;
      const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);
      const colors = {
        maintenance: 'var(--accent-blue)',
        detailing: 'var(--accent-gold)',
        cosmetic: 'var(--accent-green)',
        accident_repair: 'var(--accent-red)',
        other: 'var(--text-muted)'
      };
      const labels = {
        maintenance: mccIcon('wrench', 16) + ' Maintenance',
        detailing: mccIcon('sparkles', 16) + ' Detailing',
        cosmetic: mccIcon('sparkles', 16) + ' Cosmetic',
        accident_repair: mccIcon('car', 16) + ' Accident Repair',
        other: mccIcon('package', 16) + ' Other'
      };

      container.innerHTML = sorted.map(([cat, count]) => {
        const pct = ((count / total) * 100).toFixed(0);
        return `
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span>${labels[cat] || cat}</span>
              <span style="font-weight:500;">${count} (${pct}%)</span>
            </div>
            <div style="height:8px;background:var(--bg-input);border-radius:4px;overflow:hidden;">
              <div style="width:${pct}%;height:100%;background:${colors[cat] || 'var(--accent-blue)'};"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Analytics date range handler
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('analytics-range')) {
        document.querySelectorAll('.analytics-range').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        analyticsDateRange = parseInt(e.target.dataset.days);
        loadAnalytics();
      }
    });

    // ========== DASHBOARD CHARTS (Chart.js) ==========
    let dashboardCharts = {
      revenue: null,
      users: null,
      orders: null
    };
    let dashboardPeriod = 'week';

    const chartColors = {
      gold: '#d4a855',
      blue: '#4a7cff',
      green: '#4ac88c',
      textColor: '#f4f4f6',
      gridColor: 'rgba(148, 148, 168, 0.1)',
      goldSoft: 'rgba(212, 168, 85, 0.2)',
      blueSoft: 'rgba(74, 124, 255, 0.2)',
      greenSoft: 'rgba(74, 200, 140, 0.2)'
    };

    const chartDefaults = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: chartColors.textColor, font: { size: 11 } }
        }
      },
      scales: {
        x: {
          ticks: { color: chartColors.textColor, font: { size: 10 } },
          grid: { color: chartColors.gridColor }
        },
        y: {
          ticks: { color: chartColors.textColor, font: { size: 10 } },
          grid: { color: chartColors.gridColor },
          beginAtZero: true
        }
      }
    };

    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('dashboard-period')) {
        document.querySelectorAll('.dashboard-period').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        dashboardPeriod = e.target.dataset.period;
        loadDashboardCharts();
      }
    });

    async function loadDashboardCharts() {
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const statsHeaders = getAdminHeaders();
        const [overviewRes, revenueRes, usersRes, ordersRes] = await Promise.all([
          fetch(`${apiBase}/api/admin/stats/overview`, { headers: statsHeaders }),
          fetch(`${apiBase}/api/admin/stats/revenue?period=${dashboardPeriod}`, { headers: statsHeaders }),
          fetch(`${apiBase}/api/admin/stats/users?period=${dashboardPeriod}`, { headers: statsHeaders }),
          fetch(`${apiBase}/api/admin/stats/orders?period=${dashboardPeriod}`, { headers: statsHeaders })
        ]);

        const [overview, revenue, users, orders] = await Promise.all([
          overviewRes.json(),
          revenueRes.json(),
          usersRes.json(),
          ordersRes.json()
        ]);

        if (overview.success) {
          document.getElementById('dash-total-members').textContent = (overview.data.totalMembers || 0).toLocaleString();
          document.getElementById('dash-total-providers').textContent = (overview.data.totalProviders || 0).toLocaleString();
          document.getElementById('dash-active-packages').textContent = (overview.data.activePackages || 0).toLocaleString();
          document.getElementById('dash-total-revenue').textContent = '$' + (overview.data.totalRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        if (revenue.success) {
          renderDashboardRevenueChart(revenue.data.chartData || []);
        }

        if (users.success) {
          renderDashboardUsersChart(users.data.chartData || []);
        }

        if (orders.success) {
          renderDashboardOrdersChart(orders.data.chartData || []);
        }
      } catch (err) {
        console.error('Dashboard charts error:', err);
      }
      // Task #139 — best-effort agent fleet tile/recent list (won't block dashboard if it fails).
      try { if (typeof loadDashboardAgentTile === 'function') await loadDashboardAgentTile(); }
      catch (e) { console.warn('[admin] dashboard agent tile failed:', e); }
    }

    function formatChartLabel(dateStr) {
      if (!dateStr) return '';
      if (dateStr.length === 7) {
        const [year, month] = dateStr.split('-');
        return new Date(year, month - 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
      }
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    function renderDashboardRevenueChart(data) {
      const ctx = document.getElementById('dashboard-revenue-chart');
      if (!ctx) return;

      if (dashboardCharts.revenue) {
        dashboardCharts.revenue.destroy();
      }

      const labels = data.map(d => formatChartLabel(d.label));
      const values = data.map(d => d.revenue || 0);

      dashboardCharts.revenue = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Revenue ($)',
            data: values,
            borderColor: chartColors.gold,
            backgroundColor: chartColors.goldSoft,
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: chartColors.gold
          }]
        },
        options: {
          ...chartDefaults,
          plugins: {
            ...chartDefaults.plugins,
            tooltip: {
              callbacks: {
                label: (ctx) => `$${ctx.raw.toFixed(2)}`
              }
            }
          }
        }
      });
    }

    function renderDashboardUsersChart(data) {
      const ctx = document.getElementById('dashboard-users-chart');
      if (!ctx) return;

      if (dashboardCharts.users) {
        dashboardCharts.users.destroy();
      }

      const labels = data.map(d => formatChartLabel(d.label));
      const members = data.map(d => d.members || 0);
      const providers = data.map(d => d.providers || 0);

      dashboardCharts.users = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Members',
              data: members,
              borderColor: chartColors.blue,
              backgroundColor: chartColors.blueSoft,
              fill: true,
              tension: 0.3,
              pointRadius: 3,
              pointBackgroundColor: chartColors.blue
            },
            {
              label: 'Providers',
              data: providers,
              borderColor: chartColors.gold,
              backgroundColor: chartColors.goldSoft,
              fill: true,
              tension: 0.3,
              pointRadius: 3,
              pointBackgroundColor: chartColors.gold
            }
          ]
        },
        options: chartDefaults
      });
    }

    function renderDashboardOrdersChart(data) {
      const ctx = document.getElementById('dashboard-orders-chart');
      if (!ctx) return;

      if (dashboardCharts.orders) {
        dashboardCharts.orders.destroy();
      }

      const labels = data.map(d => formatChartLabel(d.label));
      const created = data.map(d => d.created || 0);
      const completed = data.map(d => d.completed || 0);

      dashboardCharts.orders = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Created',
              data: created,
              backgroundColor: chartColors.blue,
              borderRadius: 4
            },
            {
              label: 'Completed',
              data: completed,
              backgroundColor: chartColors.green,
              borderRadius: 4
            }
          ]
        },
        options: {
          ...chartDefaults,
          plugins: {
            ...chartDefaults.plugins,
            legend: {
              ...chartDefaults.plugins.legend,
              position: 'top'
            }
          }
        }
      });
    }

    async function loadApplications() {
      const { data } = await supabaseClient.from('provider_applications').select('*').order('created_at', { ascending: false });
      applications = data || [];
      // Task #189 — surface the originating cold-outreach lead on each
      // application. The browser admin client uses the anon JWT and so can
      // not SELECT from outreach_leads (RLS only grants service_role), so we
      // batch-fetch the lead rows through the privileged
      // provider-application-review endpoint and decorate each application
      // with `_outreach_lead`. Failures here never block the table render —
      // worst case the badge falls back to "Direct signup" / "Lead linked".
      await hydrateApplicationOutreachLeads(applications);
      renderApplications();
      document.getElementById('app-count').textContent = applications.filter(a => a.status === 'pending').length;
    }

    async function hydrateApplicationOutreachLeads(apps) {
      if (!Array.isArray(apps) || !apps.length) return;
      const leadIds = Array.from(new Set(
        apps.map(a => a && a.outreach_lead_id).filter(Boolean)
      ));
      if (!leadIds.length) return;
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/provider-application/outreach-leads`, {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_ids: leadIds })
        });
        if (!res.ok) {
          console.warn('[admin] outreach-leads fetch failed:', res.status);
          return;
        }
        const json = await res.json();
        const map = new Map((json.leads || []).map(l => [l.id, l]));
        apps.forEach(a => {
          a._outreach_lead = a.outreach_lead_id ? (map.get(a.outreach_lead_id) || null) : null;
        });
      } catch (e) {
        console.warn('[admin] outreach-leads fetch errored:', e);
      }
    }

    // Task #189 — formats the originating-lead chip shown in the
    // applications table and detail modal. Returns a small HTML snippet that
    // is safe to drop into innerHTML; everything user-controlled is run
    // through escapeHtml first.
    function renderApplicationLeadBadge(app) {
      const lead = app && app._outreach_lead;
      if (!app || !app.outreach_lead_id) {
        return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:100px;font-size:0.72rem;font-weight:600;background:rgba(100,100,120,0.12);color:var(--text-muted);border:1px solid var(--border-subtle);" title="No matching outreach lead — applicant signed up without ever being contacted by the cold-outreach engine.">${mccIcon('user', 14)} Direct signup</span>`;
      }
      if (!lead) {
        // Application has an outreach_lead_id but the row could not be loaded
        // (RLS denial, deleted lead, lookup failure). Treat as linked-but-
        // unreadable so reviewers still see the attribution exists.
        return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:100px;font-size:0.72rem;font-weight:600;background:rgba(56,189,248,0.10);color:var(--accent-blue);border:1px solid rgba(56,189,248,0.25);" title="Linked to outreach lead ${escapeHtml(app.outreach_lead_id)} but the lead row could not be loaded.">${mccIcon('link', 14)} Lead linked</span>`;
      }
      const sourceLabel = (lead.source || 'outreach').toString();
      // Title-case the source code for display ("hunter" → "Hunter").
      const sourceDisplay = sourceLabel.charAt(0).toUpperCase() + sourceLabel.slice(1).replace(/_/g, ' ');
      const parts = [sourceDisplay];
      if (lead.location) parts.push(lead.location);
      if (lead.created_at) {
        try { parts.push(new Date(lead.created_at).toLocaleDateString()); } catch (e) {}
      }
      const label = parts.join(' — ');
      const tooltip = `From cold-outreach lead "${lead.name || 'Unknown'}" (${lead.type || '?'}) — click to open the lead`;
      // Use data-* attributes (encoded for attribute context) instead of an
      // inline JS handler so apostrophes / quotes / backslashes / angle
      // brackets in untrusted lead fields can't break the attribute boundary
      // or inject script. The repo-wide escapeHtml helper relies on the HTML
      // serializer, which escapes & < > but NOT " or ' — unsafe for raw
      // attribute interpolation. encodeAttr handles the additional chars.
      const encodeAttr = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      const safeId = encodeAttr(lead.id);
      const safeName = encodeAttr(lead.name || '');
      const safeEmail = encodeAttr(lead.email || '');
      const safeTooltip = encodeAttr(tooltip);
      // The `mcc-outreach-lead-link` class is wired to a single delegated
      // click handler installed below (no inline handler in markup).
      return `<a href="#" class="mcc-outreach-lead-link" data-lead-id="${safeId}" data-lead-name="${safeName}" data-lead-email="${safeEmail}" title="${safeTooltip}" style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:100px;font-size:0.72rem;font-weight:600;background:rgba(201,162,39,0.12);color:var(--accent-gold);border:1px solid rgba(201,162,39,0.3);text-decoration:none;">${mccIcon('mail', 14)} ${escapeHtml(label)}</a>`;
    }
    // Test seam: exposed so unit tests can exercise the real renderer
    // against full DOM output instead of a re-implemented stub.
    window.renderApplicationLeadBadge = renderApplicationLeadBadge;

    // Delegated click handler for outreach-lead badges (Task #189). Installed
    // once per page load — guarded by a window flag so repeated re-renders or
    // hot-reloads don't stack listeners. Reads data-* attributes (which the
    // browser already decodes back to plain text) and dispatches to
    // viewOutreachLead, so untrusted values never touch a JS literal.
    if (!window.__mccOutreachLeadLinkBound) {
      document.addEventListener('click', function(e) {
        const el = e.target && e.target.closest && e.target.closest('.mcc-outreach-lead-link');
        if (!el) return;
        e.preventDefault();
        const id = el.getAttribute('data-lead-id') || '';
        const name = el.getAttribute('data-lead-name') || '';
        const email = el.getAttribute('data-lead-email') || '';
        if (typeof window.viewOutreachLead === 'function') {
          window.viewOutreachLead(id, name, email);
        }
      });
      window.__mccOutreachLeadLinkBound = true;
    }

    // Task #189 — deep-link from the application row's source badge into the
    // outreach engine's Leads tab, with the lead's email pre-filled in the
    // search box so the operator immediately sees the matching row. We do not
    // try to open the edit modal directly because editLead() reads from the
    // local outreachLeads cache and that cache is only populated after
    // loadLeads() resolves; instead we navigate, switch tabs, set the search
    // box, and let the operator click through.
    async function viewOutreachLead(leadId, leadName, leadEmail) {
      try {
        // 1. Navigate to the marketing-outreach section.
        if (typeof showSection === 'function') {
          await showSection('marketing-outreach');
        }
        // 2. Make sure the Outreach Engine sub-tab is active (it's the
        //    default but a previous session may have switched away).
        const moTab = document.querySelector('.mo-tab[data-tab="outreach-engine"]');
        if (moTab && !moTab.classList.contains('active')) moTab.click();
        // 3. Switch to the Leads sub-tab inside Outreach Engine.
        if (typeof window.switchOutreachTab === 'function') {
          window.switchOutreachTab('leads');
        }
        // 4. Pre-fill the leads search input. Email is the most precise
        //    match; fall back to name. loadLeads() reads the input value
        //    when called, so we trigger it after setting.
        await new Promise(r => setTimeout(r, 50));
        const searchEl = document.getElementById('leads-search');
        if (searchEl) {
          searchEl.value = leadEmail || leadName || '';
          searchEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (typeof window.loadLeads === 'function') {
          await window.loadLeads();
        }
      } catch (e) {
        console.warn('[admin] viewOutreachLead failed:', e);
      }
    }
    window.viewOutreachLead = viewOutreachLead;

    async function loadProviders(page = 1) {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return;
      
      const state = paginationState.providers;
      state.page = page;
      
      const params = new URLSearchParams({
        page: state.page,
        limit: state.limit,
        search: state.search,
        filter: state.filter
      });
      
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const response = await fetch(`${apiBase}/api/admin/providers?${params}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!response.ok) { let e; try { e = await response.json(); } catch {} throw new Error((e && (e.error || e.message)) || `Failed to load providers (${response.status})`); }
        const result = await response.json();
        
        if (result.success) {
          providers = result.data || [];
          state.total = result.total;
          state.totalPages = result.totalPages;
          renderProviders();
        } else {
          console.error('Failed to load providers:', result.error);
          providers = [];
          renderProviders();
        }
      } catch (err) {
        console.error('Error loading providers:', err);
        providers = [];
        renderProviders();
      }
      // Task #139 — agent activity strip (matchmaker / treasurer / gatekeeper / advocate touch providers).
      // Runs on both success and failure paths so the strip always reflects fleet activity.
      if (typeof window.renderAgentActivityPanel === 'function') {
        try { window.renderAgentActivityPanel('providers-agent-activity', {
          agentSlug: ['matchmaker', 'treasurer', 'gatekeeper', 'advocate'],
          limit: 10, title: 'Recent Provider-related Agent Activity', showEmpty: false
        }); } catch (e) {}
      }
    }
    
    function changeProvidersPage(delta) {
      const state = paginationState.providers;
      const newPage = state.page + delta;
      if (newPage >= 1 && newPage <= state.totalPages) {
        loadProviders(newPage);
      }
    }
    
    function searchProviders() {
      debounceSearch('providers', () => {
        const searchInput = document.getElementById('provider-search');
        paginationState.providers.search = searchInput?.value || '';
        paginationState.providers.page = 1;
        loadProviders(1);
      });
    }
    
    function filterProvidersApi() {
      const statusFilter = document.getElementById('provider-status-filter')?.value || 'all';
      paginationState.providers.filter = statusFilter;
      paginationState.providers.page = 1;
      loadProviders(1);
    }

    // Add suspended_at column if not exists
    // ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

    async function loadPayments() {
      const { data } = await supabaseClient.from('payments').select('*, maintenance_packages(title), member:member_id(full_name), provider:provider_id(full_name)').order('created_at', { ascending: false });
      payments = data || [];
      renderPayments();
      // Task #139 — Treasurer agent + legacy payment_tracker module both touch payments.
      if (typeof window.renderAgentActivityPanel === 'function') {
        try { window.renderAgentActivityPanel('payments-agent-activity', {
          agentSlug: 'treasurer',
          includeAiOpsModule: 'payment_tracker',
          limit: 10, title: 'Recent Payment-related Agent Activity', showEmpty: false
        }); } catch (e) {}
      }
    }

    async function loadDisputes() {
      const { data } = await supabaseClient.from('disputes').select('*, maintenance_packages(title), payments(amount_total), filed_by_profile:filed_by(full_name)').order('created_at', { ascending: false });
      disputes = data || [];
      renderDisputes();
      document.getElementById('dispute-count').textContent = disputes.filter(d => d.status === 'open').length;
    }

    async function loadTickets() {
      const { data } = await supabaseClient.from('support_tickets').select('*, user:user_id(full_name, email)').order('created_at', { ascending: false });
      tickets = data || [];
      renderTickets();
      document.getElementById('ticket-count').textContent = tickets.filter(t => t.status === 'open').length;
    }

    async function loadMembers(page = 1) {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return;
      
      const state = paginationState.members;
      state.page = page;
      
      const params = new URLSearchParams({
        page: state.page,
        limit: state.limit,
        search: state.search,
        filter: state.filter
      });
      
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const response = await fetch(`${apiBase}/api/admin/members?${params}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const result = await response.json();
        
        if (result.success) {
          members = result.data || [];
          state.total = result.total;
          state.totalPages = result.totalPages;
          renderMembers();
        } else {
          console.error('Failed to load members:', result.error);
          members = [];
          renderMembers();
        }
      } catch (err) {
        console.error('Error loading members:', err);
        members = [];
        renderMembers();
      }
    }
    
    function changeMembersPage(delta) {
      const state = paginationState.members;
      const newPage = state.page + delta;
      if (newPage >= 1 && newPage <= state.totalPages) {
        loadMembers(newPage);
      }
    }
    
    function searchMembers() {
      debounceSearch('members', () => {
        const searchInput = document.getElementById('member-search');
        paginationState.members.search = searchInput?.value || '';
        paginationState.members.page = 1;
        loadMembers(1);
      });
    }
    
    function filterMembersApi() {
      const typeFilter = document.getElementById('member-type-filter')?.value || 'all';
      paginationState.members.filter = typeFilter;
      paginationState.members.page = 1;
      loadMembers(1);
    }

    // ========== SIGNED AGREEMENTS MANAGEMENT ==========
    let agreements = [];
    let currentAgreement = null;

    async function loadAgreements(page = 1) {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return;
      
      const state = paginationState.agreements;
      state.page = page;
      
      const params = new URLSearchParams({
        page: state.page,
        limit: state.limit
      });
      
      if (state.search) {
        params.append('search', state.search);
      }
      if (state.filter && state.filter !== 'all') {
        params.append('type', state.filter);
      }
      
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const response = await fetch(`${apiBase}/api/admin/agreements?${params}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const result = await response.json();
        
        if (result.success) {
          agreements = result.agreements || [];
          state.total = result.total;
          state.totalPages = result.totalPages;
          renderAgreements();
        } else {
          console.error('Failed to load agreements:', result.error);
          agreements = [];
          renderAgreements();
        }
      } catch (err) {
        console.error('Error loading agreements:', err);
        agreements = [];
        renderAgreements();
      }
    }
    
    function changeAgreementsPage(delta) {
      const state = paginationState.agreements;
      const newPage = state.page + delta;
      if (newPage >= 1 && newPage <= state.totalPages) {
        loadAgreements(newPage);
      }
    }
    window.changeAgreementsPage = changeAgreementsPage;
    
    function searchAgreements() {
      debounceSearch('agreements', () => {
        const searchInput = document.getElementById('agreement-search');
        paginationState.agreements.search = searchInput?.value || '';
        paginationState.agreements.page = 1;
        loadAgreements(1);
      });
    }
    window.searchAgreements = searchAgreements;
    
    function filterAgreementsApi() {
      const typeFilter = document.getElementById('agreement-type-filter')?.value || 'all';
      paginationState.agreements.filter = typeFilter;
      paginationState.agreements.page = 1;
      loadAgreements(1);
    }
    window.filterAgreementsApi = filterAgreementsApi;

    async function submitAddAgreement() {
      const name = document.getElementById('add-agreement-name')?.value?.trim();
      const business = document.getElementById('add-agreement-business')?.value?.trim();
      const type = document.getElementById('add-agreement-type')?.value;
      const date = document.getElementById('add-agreement-date')?.value;
      const pdfUrl = document.getElementById('add-agreement-pdf-url')?.value?.trim();
      const notes = document.getElementById('add-agreement-notes')?.value?.trim();
      const errEl = document.getElementById('add-agreement-error');
      if (errEl) errEl.style.display = 'none';
      if (!name || !type) {
        if (errEl) { errEl.textContent = 'Full Name and Agreement Type are required.'; errEl.style.display = 'block'; }
        return;
      }
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const headers = { 'Content-Type': 'application/json' };
        if (adminPasswordVerified) headers['x-admin-password'] = adminPasswordVerified;
        else if (localStorage.getItem('mcc_admin_pass')) headers['x-admin-password'] = localStorage.getItem('mcc_admin_pass');
        const res = await fetch(`${apiBase}/api/admin/agreements`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ full_name: name, business_name: business || null, agreement_type: type, signed_at: date ? new Date(date).toISOString() : null, pdf_url: pdfUrl || null, notes: notes || null })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save agreement');
        document.getElementById('add-agreement-modal').style.display = 'none';
        if (window.showToast) showToast('Agreement added successfully', 'success');
        loadAgreements(1);
      } catch (err) {
        if (errEl) { errEl.textContent = 'Error: ' + err.message; errEl.style.display = 'block'; }
      }
    }
    window.submitAddAgreement = submitAddAgreement;

    function formatAgreementType(type) {
      const types = {
        'founding_partner': 'Founding Partner',
        'founding_provider_chris_agrapidis': 'Founding Provider',
        'member_founder': 'Member Founder',
        'provider': 'Provider'
      };
      return types[type] || type || 'Unknown';
    }

    function getAgreementTypeBadgeClass(type) {
      const classes = {
        'founding_partner': 'background:var(--accent-gold-soft);color:var(--accent-gold);',
        'founding_provider_chris_agrapidis': 'background:linear-gradient(135deg,rgba(212,168,85,0.15),rgba(184,148,45,0.15));color:var(--accent-gold);border:1px solid rgba(212,168,85,0.3);',
        'member_founder': 'background:var(--accent-blue-soft);color:var(--accent-blue);',
        'provider': 'background:var(--accent-green-soft);color:var(--accent-green);'
      };
      return classes[type] || 'background:var(--bg-elevated);color:var(--text-muted);';
    }

    function renderAgreements() {
      const tbody = document.getElementById('agreements-table');
      if (!agreements.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No agreements found</td></tr>';
        const paginationContainer = document.getElementById('agreements-pagination');
        if (paginationContainer) {
          paginationContainer.innerHTML = renderPaginationControls(paginationState.agreements, 'changeAgreementsPage');
        }
        return;
      }

      tbody.innerHTML = agreements.map(a => `
        <tr>
          <td style="font-family:monospace;font-size:0.8rem;color:var(--text-muted);">${a.id?.substring(0, 8) || 'N/A'}...</td>
          <td><span style="padding:4px 10px;border-radius:100px;font-size:0.75rem;font-weight:500;${getAgreementTypeBadgeClass(a.agreement_type)}">${formatAgreementType(a.agreement_type)}</span></td>
          <td>${a.full_name || 'N/A'}</td>
          <td>${a.business_name || '-'}</td>
          <td>${a.signed_at ? new Date(a.signed_at).toLocaleDateString() : 'N/A'}</td>
          <td><button class="btn btn-secondary btn-sm" onclick="viewAgreement('${a.id}')">View</button></td>
        </tr>
      `).join('');
      
      const paginationContainer = document.getElementById('agreements-pagination');
      if (paginationContainer) {
        paginationContainer.innerHTML = renderPaginationControls(paginationState.agreements, 'changeAgreementsPage');
      }
    }

    function viewAgreement(agreementId) {
      currentAgreement = agreements.find(a => a.id === agreementId);
      if (!currentAgreement) return;

      const a = currentAgreement;
      const signedDate = a.signed_at ? new Date(a.signed_at).toLocaleString() : 'N/A';
      const effectiveDate = a.effective_date ? new Date(a.effective_date).toLocaleDateString() : 'N/A';
      
      let acknowledgmentsHtml = '';
      if (a.acknowledgments && typeof a.acknowledgments === 'object') {
        const ackList = Object.entries(a.acknowledgments)
          .filter(([key, value]) => value === true)
          .map(([key]) => `<li style="margin:4px 0;">${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</li>`)
          .join('');
        if (ackList) {
          acknowledgmentsHtml = `
            <div class="form-section">
              <div class="form-section-title">Acknowledgments</div>
              <ul style="margin-left:20px;color:var(--text-secondary);font-size:0.9rem;">
                ${ackList}
              </ul>
            </div>
          `;
        }
      }

      let signatureHtml = '';
      if (a.signature_data) {
        if (a.signature_data.startsWith('data:image')) {
          signatureHtml = `
            <div class="form-section">
              <div class="form-section-title">Signature</div>
              <div style="background:white;padding:16px;border-radius:var(--radius-md);border:1px solid var(--border-subtle);display:inline-block;">
                <img src="${a.signature_data}" alt="Signature" style="max-width:100%;max-height:150px;">
              </div>
            </div>
          `;
        } else if (a.signature_type === 'typed' || a.signature_data.startsWith('typed:')) {
          const typedName = a.signature_data.startsWith('typed:') ? a.signature_data.substring(6) : a.signature_data;
          signatureHtml = `
            <div class="form-section">
              <div class="form-section-title">Typed Signature</div>
              <div style="font-family:'Brush Script MT', cursive;font-size:2rem;color:var(--text-primary);padding:16px;background:var(--bg-input);border-radius:var(--radius-md);">
                ${typedName}
              </div>
            </div>
          `;
        }
      }

      document.getElementById('agreement-modal-body').innerHTML = `
        <div class="form-section">
          <div class="form-section-title">Agreement Information</div>
          <div class="detail-grid">
            <span class="detail-label">Agreement ID:</span><span class="detail-value" style="font-family:monospace;">${a.id}</span>
            <span class="detail-label">Type:</span><span class="detail-value"><span style="padding:4px 10px;border-radius:100px;font-size:0.75rem;font-weight:500;${getAgreementTypeBadgeClass(a.agreement_type)}">${formatAgreementType(a.agreement_type)}</span></span>
            <span class="detail-label">Full Name:</span><span class="detail-value">${a.full_name || 'N/A'}</span>
            <span class="detail-label">Business Name:</span><span class="detail-value">${a.business_name || '-'}</span>
            ${a.ein_last4 ? `<span class="detail-label">EIN (last 4):</span><span class="detail-value">****${a.ein_last4}</span>` : ''}
            <span class="detail-label">Effective Date:</span><span class="detail-value">${effectiveDate}</span>
            <span class="detail-label">Signed At:</span><span class="detail-value">${signedDate}</span>
            ${a.user_id ? `<span class="detail-label">User ID:</span><span class="detail-value" style="font-family:monospace;font-size:0.85rem;">${a.user_id}</span>` : ''}
          </div>
        </div>

        ${acknowledgmentsHtml}
        ${signatureHtml}
      `;

      const downloadBtn = document.getElementById('download-agreement-btn');
      if (downloadBtn) {
        downloadBtn.style.display = 'inline-flex';
      }

      document.getElementById('agreement-modal').classList.add('active');
    }
    window.viewAgreement = viewAgreement;

    async function downloadAgreementPDF() {
      if (!currentAgreement) return;
      const a = currentAgreement;
      const btn = document.getElementById('download-agreement-btn');
      const origText = btn.innerHTML;
      btn.innerHTML = mccIcon('clock', 16) + ' Generating...';
      btn.disabled = true;

      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const response = await fetch(`${apiBase}/api/admin/agreements/${a.id}/pdf`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Failed to generate PDF' }));
          throw new Error(err.error || 'Failed to generate PDF');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const safeName = (a.full_name || 'agreement').replace(/[^a-zA-Z0-9]/g, '-');
        link.download = `MCC-Agreement-${safeName}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Error downloading PDF:', err);
        alert('Failed to download PDF. Please try again.');
      } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
      }
    }
    window.downloadAgreementPDF = downloadAgreementPDF;

    // ========== USER ROLES MANAGEMENT ==========
    let allUsersForRoles = [];

    async function loadUserRoles() {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('id, full_name, business_name, email, role, is_also_member, is_also_provider, created_at')
        .in('role', ['member', 'provider', 'admin'])
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error loading user roles:', error);
        allUsersForRoles = [];
      } else {
        allUsersForRoles = data || [];
      }
      
      renderUserRoles();
    }

    function filterUserRoles() {
      renderUserRoles();
    }

    function renderUserRoles() {
      const tbody = document.getElementById('user-roles-table');
      const searchTerm = document.getElementById('user-roles-search')?.value?.toLowerCase() || '';
      const roleFilter = document.getElementById('user-roles-filter')?.value || 'all';
      
      let filtered = allUsersForRoles;
      
      // Apply search filter
      if (searchTerm) {
        filtered = filtered.filter(u => 
          (u.full_name || '').toLowerCase().includes(searchTerm) ||
          (u.business_name || '').toLowerCase().includes(searchTerm) ||
          (u.email || '').toLowerCase().includes(searchTerm)
        );
      }
      
      // Apply role filter
      if (roleFilter === 'member') {
        filtered = filtered.filter(u => u.role === 'member');
      } else if (roleFilter === 'provider') {
        filtered = filtered.filter(u => u.role === 'provider');
      } else if (roleFilter === 'dual') {
        filtered = filtered.filter(u => u.is_also_member || u.is_also_provider);
      }
      
      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No users found</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(u => {
        const displayName = escapeHtml(u.business_name || u.full_name || 'Unnamed');
        const roleLabel = u.role === 'member' ? 'Member' : u.role === 'provider' ? 'Provider' : 'Admin';
        const roleColor = u.role === 'member' ? 'var(--accent-blue)' : u.role === 'provider' ? 'var(--accent-gold)' : 'var(--accent-green)';
        
        // For members, show "Also Provider" toggle
        // For providers, show "Also Member" toggle
        const showAlsoMember = u.role === 'provider';
        const showAlsoProvider = u.role === 'member';
        
        return `
          <tr>
            <td>
              <div><strong>${displayName}</strong></div>
              ${u.business_name && u.full_name ? `<div style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(u.full_name)}</div>` : ''}
            </td>
            <td style="font-size:0.9rem;">${escapeHtml(u.email) || 'N/A'}</td>
            <td>
              <span style="padding:4px 10px;border-radius:100px;font-size:0.8rem;background:${roleColor}22;color:${roleColor};">${roleLabel}</span>
            </td>
            <td>
              ${showAlsoMember ? `
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                  <input type="checkbox" ${u.is_also_member ? 'checked' : ''} onchange="toggleDualRole('${u.id}', 'is_also_member', this.checked)" style="width:18px;height:18px;accent-color:var(--accent-blue);">
                  <span style="font-size:0.85rem;color:${u.is_also_member ? 'var(--accent-blue)' : 'var(--text-muted)'};">${u.is_also_member ? 'Yes' : 'No'}</span>
                </label>
              ` : '<span style="color:var(--text-muted);font-size:0.85rem;">N/A</span>'}
            </td>
            <td>
              ${showAlsoProvider ? `
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                  <input type="checkbox" ${u.is_also_provider ? 'checked' : ''} onchange="toggleDualRole('${u.id}', 'is_also_provider', this.checked)" style="width:18px;height:18px;accent-color:var(--accent-gold);">
                  <span style="font-size:0.85rem;color:${u.is_also_provider ? 'var(--accent-gold)' : 'var(--text-muted)'};">${u.is_also_provider ? 'Yes' : 'No'}</span>
                </label>
              ` : '<span style="color:var(--text-muted);font-size:0.85rem;">N/A</span>'}
            </td>
            <td style="font-size:0.85rem;color:var(--text-muted);">${new Date(u.created_at).toLocaleDateString()}</td>
          </tr>
        `;
      }).join('');
    }

    async function toggleDualRole(userId, field, value) {
      try {
        const updateData = {};
        updateData[field] = value;
        
        const { error } = await supabaseClient
          .from('profiles')
          .update(updateData)
          .eq('id', userId);
        
        if (error) {
          console.error('Error updating dual role:', error);
          showToast('Failed to update user role', 'error');
          await loadUserRoles(); // Reload to reset checkbox
          return;
        }
        
        // Update local data
        const user = allUsersForRoles.find(u => u.id === userId);
        if (user) {
          user[field] = value;
        }
        
        const action = value ? 'enabled' : 'disabled';
        const roleType = field === 'is_also_member' ? 'member portal access' : 'provider portal access';
        showToast(`${action.charAt(0).toUpperCase() + action.slice(1)} ${roleType}`);
        
        renderUserRoles();
      } catch (err) {
        console.error('toggleDualRole error:', err);
        showToast('Error updating user role', 'error');
      }
    }

    let allPackages = [];
    let currentPackageFilter = 'all';

    async function loadAllPackages(page = 1) {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return;
      
      const state = paginationState.packages;
      state.page = page;
      
      const params = new URLSearchParams({
        page: state.page,
        limit: state.limit,
        search: state.search,
        filter: state.filter
      });
      
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const response = await fetch(`${apiBase}/api/admin/packages?${params}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const result = await response.json();
        
        if (result.success) {
          allPackages = result.data || [];
          state.total = result.total;
          state.totalPages = result.totalPages;
          renderAllPackages();
          updatePackageStats();
        } else {
          console.error('Failed to load packages:', result.error);
          allPackages = [];
          renderAllPackages();
        }
      } catch (err) {
        console.error('Error loading packages:', err);
        allPackages = [];
        renderAllPackages();
      }
    }
    
    function changePackagesPage(delta) {
      const state = paginationState.packages;
      const newPage = state.page + delta;
      if (newPage >= 1 && newPage <= state.totalPages) {
        loadAllPackages(newPage);
      }
    }
    
    function searchPackages() {
      debounceSearch('packages', () => {
        const searchInput = document.getElementById('package-search');
        paginationState.packages.search = searchInput?.value || '';
        paginationState.packages.page = 1;
        loadAllPackages(1);
      });
    }
    
    function filterPackagesApi(filter) {
      paginationState.packages.filter = filter;
      paginationState.packages.page = 1;
      currentPackageFilter = filter;
      
      // Update tab active state
      const tabs = document.querySelectorAll('#packages-tabs .tab');
      tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.filter === filter);
      });
      
      loadAllPackages(1);
    }
    
    function updatePackageStats() {
      const now = new Date();
      document.getElementById('packages-open').textContent = allPackages.filter(p => p.status === 'open' && (!p.bidding_deadline || new Date(p.bidding_deadline) > now)).length;
      document.getElementById('packages-accepted').textContent = allPackages.filter(p => p.status === 'accepted').length;
      document.getElementById('packages-in-progress').textContent = allPackages.filter(p => p.status === 'in_progress').length;
      document.getElementById('packages-completed').textContent = allPackages.filter(p => p.status === 'completed').length;
    }

    function renderAllPackages() {
      const now = new Date();
      let filtered = allPackages;

      if (currentPackageFilter !== 'all') {
        if (currentPackageFilter === 'expired') {
          filtered = allPackages.filter(p => p.status === 'open' && p.bidding_deadline && new Date(p.bidding_deadline) < now);
        } else {
          filtered = allPackages.filter(p => p.status === currentPackageFilter);
        }
      }

      const tbody = document.getElementById('packages-table');
      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No packages found</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(p => {
        const isExpired = p.status === 'open' && p.bidding_deadline && new Date(p.bidding_deadline) < now;
        const displayStatus = isExpired ? 'expired' : p.status;
        const vehicle = p.vehicles;
        const vehicleName = vehicle ? `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim() : 'N/A';
        
        return `
          <tr>
            <td><strong>${p.title}</strong></td>
            <td>${p.member?.full_name || p.member?.email || 'Unknown'}</td>
            <td>${vehicleName}</td>
            <td>${p.category || 'N/A'}</td>
            <td>${p.bid_count || 0}</td>
            <td><span class="status-badge ${displayStatus}">${displayStatus}</span></td>
            <td>${new Date(p.created_at).toLocaleDateString()}</td>
          </tr>
        `;
      }).join('');
      
      // Add pagination controls
      const paginationContainer = document.getElementById('packages-pagination');
      if (paginationContainer) {
        paginationContainer.innerHTML = renderPaginationControls(paginationState.packages, 'changePackagesPage');
      }
    }

    // ========== DASHBOARD ==========
    async function updateDashboard() {
      try {
        const [
          { count: pendingAppsCount },
          { count: activeProvidersCount },
          { data: heldPaymentsData },
          { count: openDisputesCount },
          { data: releasedPaymentsData },
          { count: activePackagesCount },
          { count: openTicketsCount }
        ] = await Promise.all([
          supabaseClient.from('provider_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabaseClient.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'provider').eq('application_status', 'approved'),
          supabaseClient.from('payments').select('amount_total').eq('status', 'held'),
          supabaseClient.from('disputes').select('*', { count: 'exact', head: true }).eq('status', 'open'),
          supabaseClient.from('payments').select('amount_mcc_fee').eq('status', 'released'),
          supabaseClient.from('maintenance_packages').select('*', { count: 'exact', head: true }).in('status', ['open', 'accepted', 'in_progress']),
          Promise.resolve(supabaseClient.from('helpdesk_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open')).catch(() => ({ count: 0 }))
        ]);

        document.getElementById('stat-pending-apps').textContent = pendingAppsCount || 0;
        document.getElementById('stat-active-providers').textContent = activeProvidersCount || 0;
        
        const heldAmount = (heldPaymentsData || []).reduce((sum, p) => sum + (p.amount_total || 0), 0);
        document.getElementById('stat-escrow').textContent = '$' + heldAmount.toLocaleString();
        
        document.getElementById('stat-open-disputes').textContent = openDisputesCount || 0;
        
        const revenue = (releasedPaymentsData || []).reduce((sum, p) => sum + (p.amount_mcc_fee || 0), 0);
        document.getElementById('stat-revenue').textContent = '$' + revenue.toLocaleString();
        
        document.getElementById('stat-packages').textContent = activePackagesCount || 0;

        const attentionItems = [];
        if (pendingAppsCount > 0) attentionItems.push({ icon: mccIcon('clipboard-list', 16), text: `${pendingAppsCount} provider application(s) awaiting review`, section: 'applications' });
        if (openDisputesCount > 0) attentionItems.push({ icon: mccIcon('alert-triangle', 16), text: `${openDisputesCount} dispute(s) need resolution`, section: 'disputes' });
        if (openTicketsCount > 0) attentionItems.push({ icon: mccIcon('ticket', 16), text: `${openTicketsCount} support ticket(s) awaiting response`, section: 'tickets' });

        const container = document.getElementById('attention-items');
        if (attentionItems.length === 0) {
          container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">' + mccIcon('check-circle', 40) + '</div><p>All caught up!</p></div>';
        } else {
          container.innerHTML = attentionItems.map(item => `
            <div style="display:flex;align-items:center;gap:16px;padding:16px;background:var(--bg-elevated);border-radius:var(--radius-md);margin-bottom:8px;cursor:pointer;" onclick="showSection('${item.section}')">
              <span style="font-size:24px;">${item.icon}</span>
              <span>${item.text}</span>
              <span style="margin-left:auto;color:var(--accent-blue);">View →</span>
            </div>
          `).join('');
        }

        await loadRecentActivityLazy();
        await loadQuickStats();
      } catch (err) {
        console.error('Dashboard update error:', err);
      }
    }

    async function loadRecentActivityLazy() {
      try {
        const [
          { data: recentPayments },
          { data: recentApps },
          { data: recentDisputes }
        ] = await Promise.all([
          supabaseClient.from('payments').select('status, amount_total, created_at').order('created_at', { ascending: false }).limit(5),
          supabaseClient.from('provider_applications').select('business_name, created_at').order('created_at', { ascending: false }).limit(3),
          supabaseClient.from('disputes').select('status, created_at, maintenance_packages(title)').order('created_at', { ascending: false }).limit(3)
        ]);

        const activities = [];
        (recentPayments || []).forEach(p => {
          activities.push({
            icon: p.status === 'released' ? mccIcon('dollar-sign', 16) : p.status === 'held' ? mccIcon('lock', 16) : mccIcon('credit-card', 16),
            text: `${p.status === 'released' ? 'Payment released' : p.status === 'held' ? 'Payment held in escrow' : 'Payment'} - $${p.amount_total?.toFixed(2) || 0}`,
            time: p.created_at,
            type: 'payment'
          });
        });
        (recentApps || []).forEach(a => {
          activities.push({ icon: mccIcon('clipboard-list', 16), text: `New provider application: ${a.business_name}`, time: a.created_at, type: 'application' });
        });
        (recentDisputes || []).forEach(d => {
          activities.push({ icon: mccIcon('alert-triangle', 16), text: `Dispute ${d.status}: ${d.maintenance_packages?.title || 'Package'}`, time: d.created_at, type: 'dispute' });
        });

        activities.sort((a, b) => new Date(b.time) - new Date(a.time));
        const container = document.getElementById('recent-activity-feed');
        if (activities.length === 0) {
          container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">' + mccIcon('bar-chart', 40) + '</div><p>No recent activity</p></div>';
          return;
        }
        container.innerHTML = activities.slice(0, 8).map(a => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-subtle);">
            <span style="font-size:18px;">${a.icon}</span>
            <div style="flex:1;">
              <div style="font-size:0.9rem;">${a.text}</div>
              <div style="font-size:0.78rem;color:var(--text-muted);">${formatTimeAgo(a.time)}</div>
            </div>
          </div>
        `).join('');
      } catch (err) {
        console.error('Recent activity error:', err);
      }
    }

    function updateStatPreviews() {
      // NOTE: This function is not currently called from anywhere.
      // It uses global arrays which would be empty during lazy loading.
      // If previews are needed in the future, this should be refactored to
      // fetch its own data like loadRecentActivityLazy() does.
      // Preview for pending applications
      const pendingApps = applications.filter(a => a.status === 'pending').slice(0, 3);
      const appsPreview = document.getElementById('preview-pending-apps');
      if (pendingApps.length > 0) {
        appsPreview.innerHTML = pendingApps.map(a => `
          <div class="stat-preview-item">
            <span class="stat-preview-name">${a.business_name || 'Unnamed'}</span>
          </div>
        `).join('');
        if (applications.filter(a => a.status === 'pending').length > 3) {
          appsPreview.innerHTML += '<div class="stat-preview-more">+ more...</div>';
        }
        appsPreview.classList.add('has-data');
      } else {
        appsPreview.classList.remove('has-data');
      }

      // Preview for active providers
      const activeProviders = providers.slice(0, 3);
      const providersPreview = document.getElementById('preview-active-providers');
      if (activeProviders.length > 0) {
        providersPreview.innerHTML = activeProviders.map(p => `
          <div class="stat-preview-item">
            <span class="stat-preview-name">${p.business_name || p.full_name || 'Provider'}</span>
          </div>
        `).join('');
        if (providers.length > 3) {
          providersPreview.innerHTML += '<div class="stat-preview-more">+ more...</div>';
        }
        providersPreview.classList.add('has-data');
      } else {
        providersPreview.classList.remove('has-data');
      }

      // Preview for open disputes
      const openDisputes = disputes.filter(d => d.status === 'open').slice(0, 3);
      const disputesPreview = document.getElementById('preview-open-disputes');
      if (openDisputes.length > 0) {
        disputesPreview.innerHTML = openDisputes.map(d => `
          <div class="stat-preview-item">
            <span class="stat-preview-name">${d.maintenance_packages?.title || 'Dispute'}</span>
          </div>
        `).join('');
        if (disputes.filter(d => d.status === 'open').length > 3) {
          disputesPreview.innerHTML += '<div class="stat-preview-more">+ more...</div>';
        }
        disputesPreview.classList.add('has-data');
      } else {
        disputesPreview.classList.remove('has-data');
      }

      // Preview for active packages
      const activePackages = allPackages.filter(p => ['open', 'accepted', 'in_progress'].includes(p.status)).slice(0, 3);
      const packagesPreview = document.getElementById('preview-packages');
      if (activePackages.length > 0) {
        packagesPreview.innerHTML = activePackages.map(p => `
          <div class="stat-preview-item">
            <span class="stat-preview-name">${p.title || 'Package'}</span>
          </div>
        `).join('');
        if (allPackages.filter(p => ['open', 'accepted', 'in_progress'].includes(p.status)).length > 3) {
          packagesPreview.innerHTML += '<div class="stat-preview-more">+ more...</div>';
        }
        packagesPreview.classList.add('has-data');
      } else {
        packagesPreview.classList.remove('has-data');
      }
    }

    async function loadQuickStats() {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      
      try {
        // New members
        const { count: newMembers } = await supabaseClient
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'member')
          .gte('created_at', sevenDaysAgo);
        document.getElementById('stat-new-members').textContent = newMembers || 0;

        // New packages
        const { count: newPackages } = await supabaseClient
          .from('maintenance_packages')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', sevenDaysAgo);
        document.getElementById('stat-new-packages').textContent = newPackages || 0;

        // New bids
        const { count: newBids } = await supabaseClient
          .from('bids')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', sevenDaysAgo);
        document.getElementById('stat-new-bids').textContent = newBids || 0;

        // Completed jobs
        const { count: completedJobs } = await supabaseClient
          .from('maintenance_packages')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'completed')
          .gte('member_confirmed_at', sevenDaysAgo);
        document.getElementById('stat-completed-jobs').textContent = completedJobs || 0;

        // Total processed
        const { data: processedPayments } = await supabaseClient
          .from('payments')
          .select('amount_total')
          .eq('status', 'released')
          .gte('released_at', sevenDaysAgo);
        const totalProcessed = processedPayments?.reduce((sum, p) => sum + (p.amount_total || 0), 0) || 0;
        document.getElementById('stat-total-processed').textContent = '$' + totalProcessed.toLocaleString();
      } catch (err) {
        console.error('Error loading quick stats:', err);
      }
    }

    function formatTimeAgo(timestamp) {
      const now = new Date();
      const date = new Date(timestamp);
      const diff = now - date;
      
      if (diff < 60000) return 'Just now';
      if (diff < 3600000) return Math.floor(diff / 60000) + ' minutes ago';
      if (diff < 86400000) return Math.floor(diff / 3600000) + ' hours ago';
      if (diff < 604800000) return Math.floor(diff / 86400000) + ' days ago';
      return date.toLocaleDateString();
    }

    // ========== RENDER TABLES ==========
    function renderApplications() {
      const filtered = applications.filter(a => a.status === currentFilters.applications || currentFilters.applications === 'all');
      const tbody = document.getElementById('applications-table');
      
      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No applications</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(app => `
        <tr>
          <td><strong>${escapeHtml(app.business_name)}</strong><br><span style="color:var(--text-muted);font-size:0.82rem;">${escapeHtml(app.contact_name)}</span></td>
          <td>${escapeHtml(app.business_type) || 'N/A'}</td>
          <td>${escapeHtml(app.city) || ''}, ${escapeHtml(app.state) || ''}</td>
          <td>${new Date(app.created_at).toLocaleDateString()}</td>
          <td>${renderApplicationLeadBadge(app)}</td>
          <td><span class="status-badge ${escapeHtml(app.status)}">${escapeHtml(app.status)}</span></td>
          <td><button class="btn btn-secondary btn-sm" onclick="viewApplication('${escapeHtml(app.id)}')">Review</button></td>
        </tr>
      `).join('');
    }

    let selectedProviders = new Set();
    let filteredProviders = [];

    function renderBgCheckBadge(status, updatedAt) {
      const cfg = {
        eligible:     { bg: 'rgba(74,200,140,0.15)',  border: 'rgba(74,200,140,0.3)',  color: 'var(--accent-green)',  icon: '✅', label: 'Cleared'    },
        clear:        { bg: 'rgba(74,200,140,0.15)',  border: 'rgba(74,200,140,0.3)',  color: 'var(--accent-green)',  icon: '✅', label: 'Cleared'    },
        needs_review: { bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.3)',  color: 'var(--accent-orange)', icon: '⚠️', label: 'Review'     },
        not_eligible: { bg: 'rgba(239,95,95,0.15)',   border: 'rgba(239,95,95,0.3)',   color: 'var(--accent-red)',    icon: '🚫', label: 'Not Eligible'},
        initiated:    { bg: 'rgba(56,189,248,0.1)',   border: 'rgba(56,189,248,0.25)', color: 'var(--accent-blue)',   icon: '⏳', label: 'Initiated'  },
        pending:      { bg: 'rgba(201,162,39,0.12)',  border: 'rgba(201,162,39,0.3)',  color: 'var(--accent-gold)',   icon: '⏳', label: 'Pending'    },
        processing:   { bg: 'rgba(56,189,248,0.1)',   border: 'rgba(56,189,248,0.25)', color: 'var(--accent-blue)',   icon: '🔍', label: 'Processing' },
        canceled:     { bg: 'rgba(100,100,120,0.1)',  border: 'var(--border-subtle)',  color: 'var(--text-muted)',    icon: '—',  label: 'Canceled'   },
        disputed:     { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.25)', color: 'var(--accent-orange)', icon: '⚠️', label: 'Disputed'   },
      };
      if (!status) {
        return `<span style="font-size:0.75rem;color:var(--text-muted);">Not started</span>`;
      }
      const s = cfg[status] || { bg: 'rgba(100,100,120,0.1)', border: 'var(--border-subtle)', color: 'var(--text-muted)', icon: '—', label: status };
      const title = updatedAt ? `title="Updated ${new Date(updatedAt).toLocaleDateString()}"` : '';
      return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:100px;font-size:0.72rem;font-weight:600;background:${s.bg};color:${s.color};border:1px solid ${s.border};" ${title}>${s.icon} ${s.label}</span>`;
    }

    function renderProviders() {
      const tbody = document.getElementById('providers-table');
      filteredProviders = filterProvidersData();
      
      if (!filteredProviders.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No providers match filters</td></tr>';
        updateBulkBar();
        return;
      }

      tbody.innerHTML = filteredProviders.map(p => {
        const stats = p.provider_stats?.[0] || {};
        const totalCredits = (p.bid_credits || 0) + (p.free_trial_bids || 0);
        const isSuspended = p.suspension_reason || stats.suspended;
        const isSelected = selectedProviders.has(p.id);
        
        // Intentional contrast: dark text (#0a0a0f) on gold FOUNDING badge for readability
        return `
          <tr style="${isSelected ? 'background:var(--accent-blue-soft);' : ''}">
            <td><input type="checkbox" class="provider-checkbox" data-id="${p.id}" ${isSelected ? 'checked' : ''} onchange="toggleProviderSelection('${p.id}')"></td>
            <td>
              <div><strong>${p.business_name || p.full_name || 'Unnamed'}</strong>${p.is_founding_provider ? ' <span style="background:linear-gradient(135deg,var(--accent-gold),#f0d78c);color:#0a0a0f;padding:2px 8px;border-radius:4px;font-size:0.7rem;font-weight:600;margin-left:8px;">' + mccIcon('star', 16) + ' FOUNDING</span>' : ''}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${p.email || ''}</div>
            </td>
            <td>
              <span style="padding:4px 8px;border-radius:4px;font-size:0.85rem;background:${totalCredits === 0 ? 'var(--accent-red-soft)' : totalCredits < 10 ? 'var(--accent-orange-soft)' : 'var(--accent-green-soft)'};color:${totalCredits === 0 ? 'var(--accent-red)' : totalCredits < 10 ? 'var(--accent-orange)' : 'var(--accent-green)'};">
                ${mccIcon('ticket', 16)} ${totalCredits}
              </span>
            </td>
            <td>${mccIcon('star', 16)} ${stats.average_rating?.toFixed(1) || 'New'}${stats.average_rating && stats.average_rating < 4 ? ' <span style="color:var(--accent-red);">' + mccIcon('alert-triangle', 16) + '</span>' : ''}</td>
            <td>${stats.jobs_completed || 0}</td>
            <td>$${(stats.total_earnings || 0).toLocaleString()}</td>
            <td>${renderBgCheckBadge(p.bgcheck_status, p.bgcheck_updated_at)}</td>
            <td><span class="status-badge ${isSuspended ? 'rejected' : 'approved'}">${isSuspended ? 'Suspended' : 'Active'}</span></td>
            <td>
              <div style="display:flex;gap:4px;">
                <button class="btn btn-secondary btn-sm" onclick="viewProvider('${p.id}')">View</button>
                <button class="btn btn-ghost btn-sm" onclick="quickAddCredits('${p.id}')" title="Add Credits">${mccIcon('ticket', 16)}</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
      
      updateBulkBar();
      
      // Add pagination controls
      const paginationContainer = document.getElementById('providers-pagination');
      if (paginationContainer) {
        paginationContainer.innerHTML = renderPaginationControls(paginationState.providers, 'changeProvidersPage');
      }
    }

    function filterProvidersData() {
      const statusFilter = document.getElementById('provider-status-filter')?.value || 'all';
      const creditsFilter = document.getElementById('provider-credits-filter')?.value || 'all';
      const ratingFilter = document.getElementById('provider-rating-filter')?.value || 'all';
      const typeFilter = document.getElementById('provider-type-filter')?.value || 'all';
      const searchTerm = document.getElementById('provider-search')?.value?.toLowerCase() || '';

      return providers.filter(p => {
        const stats = p.provider_stats?.[0] || {};
        const isSuspended = p.suspension_reason || stats.suspended;
        const totalCredits = (p.bid_credits || 0) + (p.free_trial_bids || 0);
        const avgRating = stats.average_rating;
        const searchStr = `${p.business_name || ''} ${p.full_name || ''} ${p.email || ''}`.toLowerCase();

        // Status filter
        if (statusFilter === 'active' && isSuspended) return false;
        if (statusFilter === 'suspended' && !isSuspended) return false;

        // Credits filter
        if (creditsFilter === 'zero' && totalCredits > 0) return false;
        if (creditsFilter === 'low' && (totalCredits === 0 || totalCredits > 10)) return false;
        if (creditsFilter === 'has' && totalCredits < 10) return false;

        // Rating filter
        if (ratingFilter === 'low' && (avgRating === null || avgRating === undefined || avgRating >= 4)) return false;
        if (ratingFilter === 'good' && (avgRating === null || avgRating === undefined || avgRating < 4)) return false;
        if (ratingFilter === 'new' && avgRating !== null && avgRating !== undefined) return false;

        // Type filter (founding/standard)
        if (typeFilter === 'founding' && !p.is_founding_provider) return false;
        if (typeFilter === 'standard' && p.is_founding_provider) return false;

        // Search filter
        if (searchTerm && !searchStr.includes(searchTerm)) return false;

        return true;
      });
    }

    function filterProviders() {
      renderProviders();
    }

    function toggleProviderSelection(id) {
      if (selectedProviders.has(id)) {
        selectedProviders.delete(id);
      } else {
        selectedProviders.add(id);
      }
      renderProviders();
    }

    function toggleSelectAll(checkbox) {
      if (checkbox.checked) {
        filteredProviders.forEach(p => selectedProviders.add(p.id));
      } else {
        selectedProviders.clear();
      }
      renderProviders();
    }

    function clearSelection() {
      selectedProviders.clear();
      document.getElementById('select-all-providers').checked = false;
      renderProviders();
    }

    function updateBulkBar() {
      const bar = document.getElementById('bulk-actions-bar');
      const count = selectedProviders.size;
      document.getElementById('selected-count').textContent = count;
      bar.style.display = count > 0 ? 'block' : 'none';
    }

    async function bulkAddCredits() {
      const count = selectedProviders.size;
      const credits = prompt(`Add bid credits to ${count} provider(s):\n\nEnter number of credits to add:`);
      if (!credits || isNaN(credits) || parseInt(credits) <= 0) return;

      const creditsToAdd = parseInt(credits);

      try {
        const res = await fetch('/api/admin/provider-actions/adjust-credits', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider_ids: Array.from(selectedProviders),
            delta: creditsToAdd,
            reason: 'Bulk credit grant from admin UI'
          })
        });
        const json = await res.json();
        if (!res.ok) {
          showToast(json.error || `Add credits failed (${res.status})`, 'error');
          return;
        }
        const ok = json.updated || 0;
        const failed = (json.failed || []).length;
        showToast(`Added ${creditsToAdd} credits to ${ok} provider(s)${failed ? ` · ${failed} failed` : ''}`, failed ? 'warning' : 'success');
        clearSelection();
        await loadProviders();
      } catch (e) {
        showToast(`Add credits failed: ${e.message}`, 'error');
      }
    }

    async function bulkSuspend() {
      const count = selectedProviders.size;
      const reason = prompt(`Suspend ${count} provider(s):\n\nEnter suspension reason:`);
      if (!reason || reason.trim().length < 5) {
        showToast('Suspension reason must be at least 5 characters.', 'error');
        return;
      }

      try {
        const res = await fetch('/api/admin/provider-actions/suspend', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider_ids: Array.from(selectedProviders), reason: reason.trim() })
        });
        const json = await res.json();
        if (!res.ok) {
          showToast(json.error || `Suspend failed (${res.status})`, 'error');
          return;
        }
        const ok = json.updated || 0;
        const failed = (json.failed || []).length;
        showToast(`Suspended ${ok} provider(s)${failed ? ` · ${failed} failed` : ''}`, failed ? 'warning' : 'success');
        clearSelection();
        await loadProviders();
      } catch (e) {
        showToast(`Suspend failed: ${e.message}`, 'error');
      }
    }

    async function bulkActivate() {
      const count = selectedProviders.size;
      if (!confirm(`Activate ${count} suspended provider(s)?`)) return;

      try {
        const res = await fetch('/api/admin/provider-actions/activate', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider_ids: Array.from(selectedProviders) })
        });
        const json = await res.json();
        if (!res.ok) {
          showToast(json.error || `Activate failed (${res.status})`, 'error');
          return;
        }
        const ok = json.updated || 0;
        const failed = (json.failed || []).length;
        showToast(`Activated ${ok} provider(s)${failed ? ` · ${failed} failed` : ''}`, failed ? 'warning' : 'success');
        clearSelection();
        await loadProviders();
      } catch (e) {
        showToast(`Activate failed: ${e.message}`, 'error');
      }
    }

    async function bulkSendMessage() {
      const count = selectedProviders.size;
      const message = prompt(`Send message to ${count} provider(s):\n\nEnter your message:`);
      if (!message) return;

      // Queue notification for each provider
      let success = 0;
      for (const providerId of selectedProviders) {
        const { error } = await supabaseClient.from('notifications').insert({
          user_id: providerId,
          type: 'admin_message',
          title: mccIcon('bell', 16) + ' Message from MCC Admin',
          message: message
        });
        if (!error) success++;
      }

      showToast(`Message sent to ${success} provider(s)`, 'success');
      clearSelection();
    }

    async function checkLowRatedProviders() {
      // Server-side preview: ask the endpoint for the canonical list (audited
      // there) instead of trusting the local in-memory copy.
      let preview;
      try {
        const res = await fetch('/api/admin/provider-actions/check-low-rated', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating_threshold: 4, autosuspend: false })
        });
        preview = await res.json();
        if (!res.ok) {
          showToast(preview.error || `Preview failed (${res.status})`, 'error');
          return;
        }
      } catch (e) {
        showToast(`Preview failed: ${e.message}`, 'error');
        return;
      }

      const lowRated = preview.providers || [];
      if (lowRated.length === 0) {
        showToast('No providers with ratings below 4 stars found!', 'success');
        return;
      }

      const names = lowRated.map(p => `• ${p.name} (${(p.avg_rating || 0).toFixed(1)} ${mccIcon('star', 16)})`).join('\n');
      const action = confirm(`${mccIcon('alert-triangle', 16)} Found ${lowRated.length} provider(s) with ratings below 4 stars:\n\n${names}\n\nDo you want to suspend these providers?`);

      if (!action) {
        // Just filter to show them
        document.getElementById('provider-rating-filter').value = 'low';
        filterProviders();
        showToast(`Showing ${lowRated.length} low-rated provider(s)`, 'info');
        return;
      }

      // Confirm step → server autosuspend (emails + audit row per provider).
      try {
        const res = await fetch('/api/admin/provider-actions/check-low-rated', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating_threshold: 4, autosuspend: true, reason: 'Rating below 4 stars - automatic suspension' })
        });
        const json = await res.json();
        if (!res.ok) {
          showToast(json.error || `Auto-suspend failed (${res.status})`, 'error');
          return;
        }
        showToast(`Suspended ${json.suspended || 0} provider(s) with low ratings`, 'success');
        await loadData();
        renderProviders();
      } catch (e) {
        showToast(`Auto-suspend failed: ${e.message}`, 'error');
      }
    }

    function bulkExport() {
      const data = [];
      for (const providerId of selectedProviders) {
        const p = providers.find(pr => pr.id === providerId);
        if (p) {
          const stats = p.provider_stats?.[0] || {};
          data.push({
            business_name: p.business_name || '',
            full_name: p.full_name || '',
            email: p.email || '',
            phone: p.business_phone || '',
            bid_credits: (p.bid_credits || 0) + (p.free_trial_bids || 0),
            rating: stats.average_rating || 'N/A',
            jobs_completed: stats.jobs_completed || 0,
            total_earnings: stats.total_earnings || 0,
            status: p.suspension_reason ? 'Suspended' : 'Active'
          });
        }
      }

      // Create CSV
      const headers = Object.keys(data[0] || {}).join(',');
      const rows = data.map(row => Object.values(row).join(','));
      const csv = [headers, ...rows].join('\n');

      // Download
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `providers-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      showToast(`Exported ${data.length} provider(s)`, 'success');
    }

    async function quickAddCredits(providerId) {
      const provider = providers.find(p => p.id === providerId);
      const name = provider?.business_name || provider?.full_name || 'Provider';
      const currentCredits = (provider?.bid_credits || 0) + (provider?.free_trial_bids || 0);

      const credits = prompt(`Add credits to ${name}\nCurrent balance: ${currentCredits}\n\nEnter credits to add:`);
      if (!credits || isNaN(credits) || parseInt(credits) <= 0) return;

      const creditsToAdd = parseInt(credits);

      try {
        const res = await fetch('/api/admin/provider-actions/adjust-credits', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider_ids: [providerId],
            delta: creditsToAdd,
            reason: `Quick credit grant for ${name}`
          })
        });
        const json = await res.json();
        if (!res.ok || (json.updated || 0) === 0) {
          const detail = (json.failed && json.failed[0] && json.failed[0].error) || json.error || `status ${res.status}`;
          showToast(`Failed to add credits: ${detail}`, 'error');
          return;
        }
        showToast(`Added ${creditsToAdd} credits to ${name}`, 'success');
        await loadProviders();
      } catch (e) {
        showToast(`Failed to add credits: ${e.message}`, 'error');
      }
    }

    let filteredPayments = [];

    function renderPayments() {
      const filtered = payments.filter(p => p.status === currentFilters.payments || currentFilters.payments === 'all');
      filteredPayments = filtered;
      const tbody = document.getElementById('payments-table');

      // Update stats
      document.getElementById('payments-held').textContent = '$' + payments.filter(p => p.status === 'held').reduce((s, p) => s + (p.amount_total || 0), 0).toLocaleString();
      document.getElementById('payments-released').textContent = '$' + payments.filter(p => p.status === 'released').reduce((s, p) => s + (p.amount_total || 0), 0).toLocaleString();
      document.getElementById('payments-refunded').textContent = '$' + payments.filter(p => p.status === 'refunded').reduce((s, p) => s + (p.refund_amount || 0), 0).toLocaleString();
      document.getElementById('payments-fees').textContent = '$' + payments.filter(p => p.status === 'released').reduce((s, p) => s + (p.amount_mcc_fee || 0), 0).toLocaleString();

      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No payments</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(p => `
        <tr>
          <td>${p.maintenance_packages?.title || 'Package'}</td>
          <td>${p.member?.full_name || 'Member'}</td>
          <td>${p.provider?.full_name || 'Provider'}</td>
          <td>$${(p.amount_total || 0).toFixed(2)}</td>
          <td>$${(p.amount_mcc_fee || 0).toFixed(2)}</td>
          <td><span class="status-badge ${p.status}">${p.status}</span></td>
          <td style="white-space:nowrap;">
            ${p.status === 'held' ? `<button class="btn btn-sm btn-success" onclick="releasePayment('${p.id}')">Release</button> ` : ''}
            <button class="btn btn-sm btn-secondary" onclick="editPayment('${p.id}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="deletePayment('${p.id}')">Delete</button>
          </td>
        </tr>
      `).join('');
    }

    let allRefunds = [];
    
    async function loadRefunds(page = 1) {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return;
      
      const state = paginationState.refunds;
      state.page = page;
      
      const params = new URLSearchParams({
        page: state.page,
        limit: state.limit,
        filter: state.filter
      });
      
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const response = await fetch(`${apiBase}/api/admin/refunds?${params}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const result = await response.json();
        
        if (result.success) {
          allRefunds = result.data || [];
          state.total = result.total;
          state.totalPages = result.totalPages;
          renderRefunds();
          updateRefundStats();
        } else {
          console.error('Failed to load refunds:', result.error);
          allRefunds = [];
          renderRefunds();
        }
      } catch (err) {
        console.error('Error loading refunds:', err);
        allRefunds = [];
        renderRefunds();
      }
    }
    
    function changeRefundsPage(delta) {
      const state = paginationState.refunds;
      const newPage = state.page + delta;
      if (newPage >= 1 && newPage <= state.totalPages) {
        loadRefunds(newPage);
      }
    }
    
    function updateRefundStats() {
      document.getElementById('refunds-requested').textContent = allRefunds.filter(r => r.status === 'requested').length;
      document.getElementById('refunds-processed').textContent = allRefunds.filter(r => r.status === 'processed').length;
      const totalRefunded = allRefunds.filter(r => r.status === 'processed').reduce((s, r) => s + (r.amount_cents || 0), 0);
      document.getElementById('refunds-total-amount').textContent = '$' + (totalRefunded / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      document.getElementById('refund-count').textContent = allRefunds.filter(r => r.status === 'requested').length;
    }
    
    function renderRefunds() {
      const tbody = document.getElementById('refunds-table');
      
      if (!allRefunds.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No refunds found</td></tr>';
        document.getElementById('refunds-pagination').innerHTML = '';
        return;
      }
      
      tbody.innerHTML = allRefunds.map(r => {
        const memberName = r.member?.full_name || 'Unknown';
        const pkgTitle = r.package?.title || r.package_id?.slice(0, 8) || '-';
        const amount = (r.amount_cents || 0) / 100;
        const statusClass = r.status === 'processed' ? 'released' : r.status === 'requested' ? 'held' : r.status === 'cancelled' ? 'refunded' : 'pending';
        
        let actionHtml = `<button class="btn btn-sm btn-secondary" onclick="viewRefund('${escapeHtml(r.id)}')">View</button>`;
        if (r.status === 'requested') {
          actionHtml += `
            <button class="btn btn-sm btn-success" onclick="approveRefund('${escapeHtml(r.id)}', ${r.amount_cents})">Approve</button>
            <button class="btn btn-sm btn-secondary" onclick="denyRefund('${escapeHtml(r.id)}')">Deny</button>
          `;
        }
        
        return `
          <tr>
            <td>${escapeHtml(memberName)}</td>
            <td title="${escapeHtml(r.package_id || '')}">${escapeHtml(pkgTitle)}</td>
            <td><span class="status-badge ${r.refund_type === 'partial' ? 'pending' : 'held'}">${escapeHtml(r.refund_type || 'full')}</span></td>
            <td>$${amount.toFixed(2)}</td>
            <td title="${escapeHtml(r.reason || '')}">${escapeHtml((r.reason || '-').substring(0, 40))}${(r.reason || '').length > 40 ? '...' : ''}</td>
            <td><span class="status-badge ${statusClass}">${escapeHtml(r.status)}</span></td>
            <td>${r.requested_at ? new Date(r.requested_at).toLocaleDateString() : '-'}</td>
            <td>${actionHtml}</td>
          </tr>
        `;
      }).join('');
      
      const state = paginationState.refunds;
      document.getElementById('refunds-pagination').innerHTML = renderPaginationControls(state, 'changeRefundsPage');
    }
    
    async function approveRefund(refundId, amountCents) {
      if (!confirm(`Approve this refund of $${(amountCents / 100).toFixed(2)}? This will process the refund via Stripe immediately.`)) return;
      
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return;
      
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const response = await fetch(`${apiBase}/api/admin/refunds/${refundId}/process`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ action: 'approve' })
        });
        const result = await response.json();
        
        if (result.success) {
          showToast(`Refund of ${result.message || 'processed'} successfully`, 'success');
          loadedSections.refunds = false;
          await loadRefunds(paginationState.refunds.page);
        } else {
          showToast(result.error || 'Failed to process refund', 'error');
        }
      } catch (err) {
        console.error('Approve refund error:', err);
        showToast('Error processing refund', 'error');
      }
    }
    
    async function viewRefund(refundId) {
      const r = allRefunds.find(x => x.id === refundId);
      if (!r) return;

      const memberName = r.member?.full_name || r.member?.email || 'Unknown';
      const pkgTitle = r.package?.title || r.package_id || '-';
      const amount = ((r.amount_cents || 0) / 100).toFixed(2);
      const statusClass = r.status === 'processed' ? 'released' : r.status === 'requested' ? 'held' : r.status === 'cancelled' ? 'refunded' : 'pending';

      document.getElementById('refund-modal-body').innerHTML = `
        <div class="form-section">
          <div class="form-section-title">Refund Details</div>
          <div class="detail-grid">
            <span class="detail-label">Member:</span><span class="detail-value">${escapeHtml(memberName)}</span>
            <span class="detail-label">Package:</span><span class="detail-value">${escapeHtml(pkgTitle)}</span>
            <span class="detail-label">Type:</span><span class="detail-value">${escapeHtml(r.refund_type || 'full')}</span>
            <span class="detail-label">Amount:</span><span class="detail-value">$${amount}</span>
            <span class="detail-label">Status:</span><span class="detail-value"><span class="status-badge ${statusClass}">${escapeHtml(r.status)}</span></span>
            <span class="detail-label">Requested:</span><span class="detail-value">${r.requested_at ? new Date(r.requested_at).toLocaleString() : '-'}</span>
            ${r.processed_at ? `<span class="detail-label">Processed:</span><span class="detail-value">${new Date(r.processed_at).toLocaleString()}</span>` : ''}
          </div>
          ${r.reason ? `<p style="margin-top:16px;color:var(--text-secondary);background:var(--bg-input);padding:16px;border-radius:var(--radius-md);">${escapeHtml(r.reason)}</p>` : ''}
        </div>

        ${(r.user_id || r.requested_by) ? `
        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('mail', 24)} Outreach History</div>
          <div id="refund-outreach-history-body-${r.id}" style="font-size:0.9rem;color:var(--text-muted);">Loading…</div>
        </div>
        ` : ''}
      `;

      document.getElementById('refund-modal-footer').innerHTML = r.status === 'requested' ? `
        <button class="btn btn-secondary" onclick="denyRefund('${escapeHtml(r.id)}')">Deny</button>
        <button class="btn btn-success" onclick="approveRefund('${escapeHtml(r.id)}', ${r.amount_cents})">Approve</button>
      ` : '';

      const refundUserId = r.user_id || r.requested_by;
      if (refundUserId && typeof window.renderOutreachHistoryPanel === 'function') {
        try { window.renderOutreachHistoryPanel(`refund-outreach-history-body-${r.id}`, refundUserId); }
        catch (e) { console.warn('[admin] refund outreach history panel failed:', e); }
      }

      document.getElementById('refund-modal').classList.add('active');
    }

    async function denyRefund(refundId) {
      if (!confirm('Deny this refund request? The member will be notified.')) return;
      
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return;
      
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const response = await fetch(`${apiBase}/api/admin/refunds/${refundId}/process`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ action: 'deny' })
        });
        const result = await response.json();
        
        if (result.success) {
          showToast('Refund denied', 'success');
          loadedSections.refunds = false;
          await loadRefunds(paginationState.refunds.page);
        } else {
          showToast(result.error || 'Failed to deny refund', 'error');
        }
      } catch (err) {
        console.error('Deny refund error:', err);
        showToast('Error denying refund', 'error');
      }
    }

    function renderDisputes() {
      const filtered = disputes.filter(d => {
        if (currentFilters.disputes === 'inspection') return d.requires_inspection && d.status !== 'resolved';
        return d.status === currentFilters.disputes || currentFilters.disputes === 'all';
      });
      const tbody = document.getElementById('disputes-table');

      const highValue = disputes.filter(d => d.payments?.amount_total > 1000 && d.status === 'open');
      document.getElementById('high-value-alert').style.display = highValue.length ? 'block' : 'none';

      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No disputes</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(d => `
        <tr>
          <td>${escapeHtml(d.maintenance_packages?.title) || 'Package'}</td>
          <td>${escapeHtml(d.filed_by_profile?.full_name) || 'User'} (${escapeHtml(d.filed_by_role)})</td>
          <td>${escapeHtml(d.reason)}</td>
          <td>$${(d.payments?.amount_total || 0).toFixed(2)}</td>
          <td>${new Date(d.created_at).toLocaleDateString()}</td>
          <td><span class="status-badge ${d.status === 'open' ? 'open' : d.status.includes('resolved') ? 'resolved' : 'pending'}">${escapeHtml(d.status)}</span></td>
          <td><button class="btn btn-secondary btn-sm" onclick="viewDispute('${escapeHtml(d.id)}')">Review</button></td>
        </tr>
      `).join('');
    }

    function renderTickets() {
      const filtered = tickets.filter(t => t.status === currentFilters.tickets || currentFilters.tickets === 'all');
      const tbody = document.getElementById('tickets-table');

      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No tickets</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(t => `
        <tr>
          <td>${escapeHtml(t.subject)}</td>
          <td>${escapeHtml(t.user?.full_name || t.user?.email) || 'User'}</td>
          <td>${escapeHtml(t.category) || 'General'}</td>
          <td><span class="status-badge ${t.priority === 'urgent' ? 'rejected' : t.priority === 'high' ? 'pending' : 'approved'}">${t.priority || 'normal'}</span></td>
          <td>${new Date(t.created_at).toLocaleDateString()}</td>
          <td><span class="status-badge ${t.status === 'open' ? 'open' : t.status === 'resolved' ? 'resolved' : 'pending'}">${t.status}</span></td>
          <td><button class="btn btn-secondary btn-sm" onclick="viewTicket('${t.id}')">View</button></td>
        </tr>
      `).join('');
    }

    function renderMembers() {
      const tbody = document.getElementById('members-table');
      if (!members.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No members</td></tr>';
        // Still show pagination if there's state
        const paginationContainer = document.getElementById('members-pagination');
        if (paginationContainer) {
          paginationContainer.innerHTML = renderPaginationControls(paginationState.members, 'changeMembersPage');
        }
        return;
      }

      tbody.innerHTML = members.map(m => `
        <tr>
          <td>${m.full_name || 'N/A'}</td>
          <td>${m.email || 'N/A'}</td>
          <td>${m.account_type || 'individual'}</td>
          <td>-</td>
          <td>-</td>
          <td>${new Date(m.created_at).toLocaleDateString()}</td>
          <td><button class="btn btn-secondary btn-sm" onclick="viewMember('${m.id}')">View</button></td>
        </tr>
      `).join('');
      
      // Add pagination controls
      const paginationContainer = document.getElementById('members-pagination');
      if (paginationContainer) {
        paginationContainer.innerHTML = renderPaginationControls(paginationState.members, 'changeMembersPage');
      }
    }

    // ========== APPLICATION REVIEW ==========
    async function viewApplication(appId) {
      currentApplication = applications.find(a => a.id === appId);
      if (!currentApplication) return;

      // Load documents
      const { data: docs } = await supabaseClient.from('provider_documents').select('*').eq('application_id', appId);
      const { data: refs } = await supabaseClient.from('provider_references').select('*').eq('application_id', appId);
      const { data: reviews } = await supabaseClient.from('provider_external_reviews').select('*').eq('application_id', appId);

      const app = currentApplication;
      
      // Format loaner delivery options
      const loanerDeliveryLabels = {
        'deliver_loaner': 'Delivers loaner to member',
        'pickup_at_shop': 'Member picks up at shop',
        'swap_at_member': 'Swaps vehicles at member location'
      };
      const loanerOptions = app.loaner_delivery_options?.map(o => loanerDeliveryLabels[o] || o).join(', ') || 'N/A';
      
      // Format pickup/delivery options
      const pickupLabels = {
        'pickup_vehicle': 'Picks up member vehicle',
        'deliver_vehicle': 'Delivers after service',
        'flatbed': 'Flatbed/tow capability',
        'rideshare_coord': 'Coordinates rideshare'
      };
      const pickupOptions = app.pickup_delivery_options?.map(o => pickupLabels[o] || o).join(', ') || 'N/A';

      document.getElementById('application-modal-body').innerHTML = `
        <div class="form-section">
          <div class="form-section-title">Business Information</div>
          <div class="detail-grid">
            <span class="detail-label">Business Name:</span><span class="detail-value">${app.business_name}</span>
            <span class="detail-label">Business Type:</span><span class="detail-value">${app.business_type || 'N/A'}</span>
            <span class="detail-label">Contact:</span><span class="detail-value">${app.contact_name}</span>
            <span class="detail-label">Phone:</span><span class="detail-value">${app.phone || 'N/A'}</span>
            <span class="detail-label">Email:</span><span class="detail-value">${app.email || 'N/A'}</span>
            <span class="detail-label">Website:</span><span class="detail-value">${app.website ? `<a href="${app.website}" target="_blank" style="color:var(--accent-blue)">${app.website}</a>` : 'N/A'}</span>
            <span class="detail-label">Address:</span><span class="detail-value">${app.street_address || ''}, ${app.city || ''}, ${app.state || ''} ${app.zip_code || ''}</span>
            <span class="detail-label">Service Area:</span><span class="detail-value">${app.service_area || 'N/A'}</span>
            <span class="detail-label">Years in Business:</span><span class="detail-value">${app.years_in_business || 'N/A'}</span>
            <span class="detail-label">Services:</span><span class="detail-value">${app.services_offered?.join(', ') || 'N/A'}</span>
            <span class="detail-label">Specializations:</span><span class="detail-value">${app.brand_specializations?.join(', ') || 'None'}</span>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('car', 24)} Loaner Vehicle Program</div>
          ${app.has_loaner_vehicles ? `
            <div class="detail-grid">
              <span class="detail-label">Loaner Vehicles:</span><span class="detail-value" style="color:var(--accent-green);">${mccIcon('check', 16)} Yes (${app.loaner_vehicle_count || '?'} vehicles)</span>
              <span class="detail-label">Vehicle Types:</span><span class="detail-value">${app.loaner_vehicle_types || 'N/A'}</span>
              <span class="detail-label">Delivery Options:</span><span class="detail-value">${loanerOptions}</span>
              <span class="detail-label">Requirements:</span><span class="detail-value">${app.loaner_requirements || 'N/A'}</span>
              <span class="detail-label">Fee:</span><span class="detail-value">${app.loaner_fee_type === 'free' ? 'Free with service' : app.loaner_fee_type === 'deposit' ? 'Deposit only' : app.loaner_fee_amount ? '$' + app.loaner_fee_amount + '/day' : 'N/A'}</span>
            </div>
          ` : `
            <p style="color:var(--text-muted);">${mccIcon('x', 16)} No loaner vehicles available</p>
          `}
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('truck', 24)} Pickup & Delivery</div>
          <div class="detail-grid">
            <span class="detail-label">Capabilities:</span><span class="detail-value">${pickupOptions}</span>
            <span class="detail-label">Radius:</span><span class="detail-value">${app.pickup_radius_miles ? app.pickup_radius_miles + ' miles' : 'N/A'}</span>
            <span class="detail-label">Fee:</span><span class="detail-value">${app.pickup_fee_type === 'free' ? 'Free' : app.pickup_fee_type === 'included' ? 'Included in service' : app.pickup_fee_type === 'flat' ? '$' + (app.pickup_fee_amount || 0) + ' flat' : app.pickup_fee_type === 'per_mile' ? '$' + (app.pickup_fee_amount || 0) + '/mile' : app.pickup_fee_type || 'N/A'}</span>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">Uploaded Documents</div>
          <div class="doc-list">
            ${docs?.length ? docs.map(d => `
              <div class="doc-item">
                <div class="doc-item-info">
                  <span class="doc-icon">${mccIcon('file-text', 16)}</span>
                  <span>${d.document_type}: ${d.document_name || 'Document'}</span>
                </div>
                <a href="${d.file_url}" target="_blank" class="btn btn-sm btn-secondary">View</a>
              </div>
            `).join('') : '<p style="color:var(--text-muted)">No documents uploaded</p>'}
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">External Reviews</div>
          ${reviews?.length ? reviews.map(r => `
            <div class="doc-item">
              <div class="doc-item-info">
                <span class="doc-icon">${mccIcon('star', 16)}</span>
                <span>${r.platform}: ${r.rating || '?'}/5 (${r.review_count || '?'} reviews)</span>
              </div>
              <a href="${r.profile_url}" target="_blank" class="btn btn-sm btn-secondary">View</a>
            </div>
          `).join('') : '<p style="color:var(--text-muted)">No external reviews provided</p>'}
        </div>

        <div class="form-section">
          <div class="form-section-title">References</div>
          ${refs?.length ? refs.map(r => `
            <div class="doc-item">
              <div class="doc-item-info">
                <span class="doc-icon">${mccIcon('user', 16)}</span>
                <div>
                  <strong>${r.reference_name}</strong> - ${r.relationship}<br>
                  <span style="font-size:0.82rem;color:var(--text-muted)">${r.reference_phone || ''} ${r.reference_email || ''}</span>
                </div>
              </div>
            </div>
          `).join('') : '<p style="color:var(--text-muted)">No references provided</p>'}
        </div>

        <div class="form-section">
          <div class="form-section-title">Vetting Checklist</div>
          <div class="checklist">
            <div class="checklist-item ${app.license_verified ? 'checked' : ''}">
              <input type="checkbox" id="chk-license" ${app.license_verified ? 'checked' : ''}>
              <label for="chk-license">Business license verified</label>
            </div>
            <div class="checklist-item ${app.insurance_verified ? 'checked' : ''}">
              <input type="checkbox" id="chk-insurance" ${app.insurance_verified ? 'checked' : ''}>
              <label for="chk-insurance">Insurance acknowledgment confirmed (provider agreed to maintain coverage)</label>
            </div>
            <div class="checklist-item ${app.certifications_verified ? 'checked' : ''}">
              <input type="checkbox" id="chk-certs" ${app.certifications_verified ? 'checked' : ''}>
              <label for="chk-certs">Certifications verified</label>
            </div>
            <div class="checklist-item ${app.reviews_checked ? 'checked' : ''}">
              <input type="checkbox" id="chk-reviews" ${app.reviews_checked ? 'checked' : ''}>
              <label for="chk-reviews">External reviews checked</label>
            </div>
            <div class="checklist-item ${app.references_contacted ? 'checked' : ''}">
              <input type="checkbox" id="chk-refs" ${app.references_contacted ? 'checked' : ''}>
              <label for="chk-refs">References contacted</label>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Admin Notes</label>
          <textarea class="form-textarea" id="admin-notes" placeholder="Internal notes about this application...">${app.admin_notes || ''}</textarea>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('user-check', 24)} Originating Lead</div>
          <div style="font-size:0.9rem;line-height:1.6;">
            ${renderApplicationLeadBadge(app)}
            ${app._outreach_lead ? `
              <div style="margin-top:10px;color:var(--text-secondary);">
                <div><strong style="color:var(--text-primary);">${escapeHtml(app._outreach_lead.name || 'Unknown')}</strong>${app._outreach_lead.type ? ` <span style="color:var(--text-muted);font-size:0.85em;">(${escapeHtml(app._outreach_lead.type)})</span>` : ''}</div>
                ${app._outreach_lead.email ? `<div style="font-size:0.85em;color:var(--text-muted);">${escapeHtml(app._outreach_lead.email)}</div>` : ''}
                ${app._outreach_lead.location ? `<div style="font-size:0.85em;color:var(--text-muted);">${escapeHtml(app._outreach_lead.location)}</div>` : ''}
                ${app._outreach_lead.status ? `<div style="font-size:0.85em;color:var(--text-muted);margin-top:4px;">Lead status: <span style="font-weight:600;color:var(--text-primary);">${escapeHtml(app._outreach_lead.status)}</span></div>` : ''}
              </div>
            ` : (!app.outreach_lead_id ? `
              <div style="margin-top:8px;color:var(--text-muted);font-size:0.85em;">
                This applicant signed up directly — no record of cold-outreach contact in the engine.
              </div>
            ` : '')}
          </div>
        </div>

        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('mail', 24)} Outreach History</div>
          <div id="application-outreach-history-body" style="font-size:0.9rem;color:var(--text-muted);">Loading…</div>
        </div>
      `;

      // Task #139: Gatekeeper agent-activity panel.
      // Append a container after the form sections; the helper renders into it.
      const modalBody = document.getElementById('application-modal-body');
      if (modalBody) {
        const agentDiv = document.createElement('div');
        agentDiv.className = 'form-section';
        agentDiv.style.borderBottom = 'none';
        agentDiv.innerHTML = `<div class="form-section-title">${mccIcon('zap', 24)} Gatekeeper Review</div>
          <div id="app-agent-${app.id}"></div>`;
        modalBody.appendChild(agentDiv);
      }

      document.getElementById('application-modal').classList.add('active');
      if (app.user_id && typeof window.renderOutreachHistoryPanel === 'function') {
        window.renderOutreachHistoryPanel('application-outreach-history-body', app.user_id);
      }
      if (typeof window.renderAgentActivityPanel === 'function') {
        // Gatekeeper writes payload.provider_id = applicant user_id; fall back to application id.
        const targetId = app.user_id || app.id;
        try { window.renderAgentActivityPanel(`app-agent-${app.id}`, {
          targetId, targetKind: 'application', agentSlug: 'gatekeeper',
          title: 'Gatekeeper Review', limit: 8, showEmpty: true
        }); } catch (e) { console.warn('[admin] gatekeeper panel failed:', e); }
      }
    }

    // Provider application approve / reject / request-more-info now flow
    // through the privileged /api/admin/provider-application endpoint
    // (netlify/functions/provider-application-review.js). The browser no
    // longer mutates provider_applications or profiles.role directly — see
    // Task #179.
    async function approveApplication() {
      if (!currentApplication) return;
      if (!confirm('Approve this provider? They will gain access to the provider portal.')) return;

      const adminNotes = document.getElementById('admin-notes').value;
      try {
        const res = await fetch('/api/admin/provider-application/approve', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            application_id: currentApplication.id,
            admin_notes: adminNotes,
            reviewed_by: currentUser?.id || null,
            license_verified:        document.getElementById('chk-license').checked,
            insurance_verified:      document.getElementById('chk-insurance').checked,
            certifications_verified: document.getElementById('chk-certs').checked,
            reviews_checked:         document.getElementById('chk-reviews').checked,
            references_contacted:    document.getElementById('chk-refs').checked
          })
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(json.error || `Approve failed (${res.status})`, 'error');
          return;
        }
        if (json.provider_stats_error) {
          showToast(`Approved (provider_stats note: ${json.provider_stats_error})`, 'warning');
        } else {
          showToast('Provider approved!');
        }
      } catch (e) {
        showToast(`Approve failed: ${e.message}`, 'error');
        return;
      }

      closeModal('application-modal');
      await loadApplications();
      await loadProviders();
      updateDashboard();
    }

    async function rejectApplication() {
      if (!currentApplication) return;
      const reason = prompt('Reason for rejection:');
      if (!reason) return;

      try {
        const res = await fetch('/api/admin/provider-application/reject', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            application_id: currentApplication.id,
            reason,
            admin_notes: document.getElementById('admin-notes').value,
            reviewed_by: currentUser?.id || null
          })
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(json.error || `Reject failed (${res.status})`, 'error');
          return;
        }
      } catch (e) {
        showToast(`Reject failed: ${e.message}`, 'error');
        return;
      }

      closeModal('application-modal');
      showToast('Application rejected');
      await loadApplications();
      updateDashboard();
    }

    async function requestMoreInfo() {
      if (!currentApplication) return;
      const request = prompt('What additional information is needed?');
      if (!request) return;

      try {
        const res = await fetch('/api/admin/provider-application/request-info', {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            application_id: currentApplication.id,
            info_requested: request,
            admin_notes: document.getElementById('admin-notes').value || '',
            reviewed_by: currentUser?.id || null
          })
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(json.error || `Request failed (${res.status})`, 'error');
          return;
        }
      } catch (e) {
        showToast(`Request failed: ${e.message}`, 'error');
        return;
      }

      closeModal('application-modal');
      showToast('Request sent to applicant');
      await loadApplications();
    }

    // ========== DISPUTE HANDLING ==========
    async function viewDispute(disputeId) {
      currentDispute = disputes.find(d => d.id === disputeId);
      if (!currentDispute) return;

      const { data: evidence } = await supabaseClient.from('dispute_evidence').select('*').eq('dispute_id', disputeId);
      const d = currentDispute;
      const isHighValue = d.payments?.amount_total > 1000;

      document.getElementById('dispute-modal-body').innerHTML = `
        <div class="form-section">
          <div class="form-section-title">Dispute Details</div>
          <div class="detail-grid">
            <span class="detail-label">Package:</span><span class="detail-value">${d.maintenance_packages?.title || 'N/A'}</span>
            <span class="detail-label">Amount:</span><span class="detail-value">$${(d.payments?.amount_total || 0).toFixed(2)}</span>
            <span class="detail-label">Filed By:</span><span class="detail-value">${d.filed_by_profile?.full_name || 'User'} (${d.filed_by_role})</span>
            <span class="detail-label">Reason:</span><span class="detail-value">${d.reason}</span>
            <span class="detail-label">Filed:</span><span class="detail-value">${new Date(d.created_at).toLocaleString()}</span>
          </div>
          ${d.description ? `<p style="margin-top:16px;color:var(--text-secondary);">${d.description}</p>` : ''}
        </div>

        ${isHighValue ? `
          <div class="alert warning">
            ${mccIcon('alert-triangle', 16)} This dispute is over $1,000. Third-party inspection may be required.
          </div>
        ` : ''}

        <div class="form-section">
          <div class="form-section-title">Evidence Submitted</div>
          ${evidence?.length ? `
            <div class="evidence-grid">
              ${evidence.map(e => `
                <div class="evidence-item" onclick="window.open('${e.file_url}','_blank')">
                  <img src="${e.file_url}" onerror="this.parentElement.innerHTML=mccIcon('file-text', 16)">
                </div>
              `).join('')}
            </div>
          ` : '<p style="color:var(--text-muted)">No evidence submitted</p>'}
        </div>

        <div class="form-group">
          <label class="form-label">Resolution Amount ($)</label>
          <input type="number" class="form-input" id="resolution-amount" placeholder="Amount to refund to member" value="${d.payments?.amount_total || 0}">
        </div>

        <div class="form-group">
          <label class="form-label">Resolution Notes</label>
          <textarea class="form-textarea" id="resolution-notes" placeholder="Explain the resolution decision...">${d.resolution_notes || ''}</textarea>
        </div>

        ${(d.user_id || d.filed_by) ? `
        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('mail', 24)} Outreach History</div>
          <div id="dispute-outreach-history-body-${d.id}" style="font-size:0.9rem;color:var(--text-muted);">Loading…</div>
        </div>
        ` : ''}
      `;

      document.getElementById('dispute-modal-footer').innerHTML = `
        ${isHighValue && !d.requires_inspection ? `<button class="btn btn-secondary" onclick="scheduleInspection()">Schedule Inspection</button>` : ''}
        <button class="btn btn-danger" onclick="resolveDispute('provider')">Resolve for Provider</button>
        <button class="btn btn-success" onclick="resolveDispute('member')">Resolve for Member</button>
      `;

      const disputeUserId = d.user_id || d.filed_by;
      if (disputeUserId && typeof window.renderOutreachHistoryPanel === 'function') {
        try { window.renderOutreachHistoryPanel(`dispute-outreach-history-body-${d.id}`, disputeUserId); }
        catch (e) { console.warn('[admin] dispute outreach history panel failed:', e); }
      }

      // Task #139: AI dispute analysis panel (legacy ai_ops dispute_resolver + Advocate fleet agent).
      const dBody = document.getElementById('dispute-modal-body');
      if (dBody) {
        const ad = document.createElement('div');
        ad.className = 'form-section';
        ad.style.borderBottom = 'none';
        ad.innerHTML = `<div class="form-section-title">${mccIcon('cpu', 24)} AI Dispute Analysis</div>
          <div id="dispute-agent-${d.id}"></div>`;
        dBody.appendChild(ad);
      }

      document.getElementById('dispute-modal').classList.add('active');
      if (typeof window.renderAgentActivityPanel === 'function') {
        try { window.renderAgentActivityPanel(`dispute-agent-${d.id}`, {
          targetId: d.id, targetKind: 'dispute',
          agentSlug: 'advocate', includeAiOpsModule: 'dispute_resolver',
          title: 'AI Dispute Analysis', limit: 8, showEmpty: true
        }); } catch (e) { console.warn('[admin] dispute agent panel failed:', e); }
      }
    }

    async function resolveDispute(winner) {
      if (!currentDispute) return;
      const resolutionAmount = parseFloat(document.getElementById('resolution-amount').value) || 0;
      const notes = document.getElementById('resolution-notes').value;

      if (!notes) return showToast('Please provide resolution notes', 'error');

      // Update dispute
      await supabaseClient.from('disputes').update({
        status: `resolved_${winner}`,
        resolution_amount: winner === 'member' ? resolutionAmount : 0,
        resolution_notes: notes,
        resolved_by: currentUser.id,
        resolved_at: new Date().toISOString()
      }).eq('id', currentDispute.id);

      // Process refund if member wins
      if (winner === 'member' && currentDispute.payment_id) {
        await supabaseClient.from('payments').update({
          status: 'refunded',
          refund_amount: resolutionAmount,
          refund_reason: notes,
          refunded_at: new Date().toISOString()
        }).eq('id', currentDispute.payment_id);
      }

      // If provider loses, add a strike
      if (winner === 'member') {
        // Get provider from payment
        const payment = payments.find(p => p.id === currentDispute.payment_id);
        if (payment?.provider_id) {
          await supabaseClient.rpc('increment_provider_strikes', { provider_id: payment.provider_id });
        }
      }

      closeModal('dispute-modal');
      showToast('Dispute resolved');
      await loadDisputes();
      await loadPayments();
      updateDashboard();
    }

    async function scheduleInspection() {
      // For now, just mark that inspection is needed
      await supabaseClient.from('disputes').update({ requires_inspection: true, status: 'inspection_scheduled' }).eq('id', currentDispute.id);
      closeModal('dispute-modal');
      showToast('Inspection scheduled');
      await loadDisputes();
    }

    // ========== TICKETS ==========
    async function viewTicket(ticketId) {
      currentTicket = tickets.find(t => t.id === ticketId);
      if (!currentTicket) return;

      const { data: messages } = await supabaseClient.from('ticket_messages').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true });
      const t = currentTicket;

      document.getElementById('ticket-modal-body').innerHTML = `
        <div class="form-section">
          <div class="form-section-title">${t.subject}</div>
          <div class="detail-grid">
            <span class="detail-label">From:</span><span class="detail-value">${t.user?.full_name || t.user?.email || 'User'}</span>
            <span class="detail-label">Category:</span><span class="detail-value">${t.category || 'General'}</span>
            <span class="detail-label">Priority:</span><span class="detail-value">${t.priority || 'Normal'}</span>
            <span class="detail-label">Submitted:</span><span class="detail-value">${new Date(t.created_at).toLocaleString()}</span>
          </div>
          <p style="margin-top:16px;color:var(--text-secondary);background:var(--bg-input);padding:16px;border-radius:var(--radius-md);">${t.description}</p>
        </div>

        <div class="form-section">
          <div class="form-section-title">Conversation</div>
          <div style="max-height:200px;overflow-y:auto;">
            ${messages?.length ? messages.map(m => `
              <div style="margin-bottom:12px;padding:12px;background:${m.sender_role === 'admin' ? 'var(--accent-blue-soft)' : 'var(--bg-input)'};border-radius:var(--radius-md);">
                <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:4px;">${m.sender_role === 'admin' ? 'Admin' : 'User'} - ${new Date(m.created_at).toLocaleString()}</div>
                <p>${m.content}</p>
              </div>
            `).join('') : ''}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Your Reply</label>
          <textarea class="form-textarea" id="ticket-reply" placeholder="Type your response..."></textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="ticket-status">
            <option value="open" ${t.status === 'open' ? 'selected' : ''}>Open</option>
            <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
            <option value="resolved" ${t.status === 'resolved' ? 'selected' : ''}>Resolved</option>
            <option value="closed" ${t.status === 'closed' ? 'selected' : ''}>Closed</option>
          </select>
        </div>

        ${t.user_id ? `
        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('mail', 24)} Outreach History</div>
          <div id="ticket-outreach-history-body-${t.id}" style="font-size:0.9rem;color:var(--text-muted);">Loading…</div>
        </div>
        ` : ''}

        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('cpu', 24)} AI Helpdesk Activity</div>
          <div id="ticket-agent-${t.id}"></div>
        </div>
      `;

      if (t.user_id && typeof window.renderOutreachHistoryPanel === 'function') {
        try { window.renderOutreachHistoryPanel(`ticket-outreach-history-body-${t.id}`, t.user_id); }
        catch (e) { console.warn('[admin] outreach history panel failed:', e); }
      }

      // Task #139: AI Helpdesk module rows for this ticket (legacy ai_action_log).
      if (typeof window.renderAgentActivityPanel === 'function') {
        try { window.renderAgentActivityPanel(`ticket-agent-${t.id}`, {
          targetId: t.id, targetKind: 'ticket',
          includeAiOpsModule: 'ai_helpdesk',
          title: 'AI Helpdesk', limit: 8, showEmpty: true
        }); } catch (e) { console.warn('[admin] ticket agent panel failed:', e); }
      }

      document.getElementById('ticket-modal').classList.add('active');
    }

    async function sendTicketReply() {
      if (!currentTicket) return;
      const reply = document.getElementById('ticket-reply').value.trim();
      const status = document.getElementById('ticket-status').value;

      if (reply) {
        await supabaseClient.from('ticket_messages').insert({
          ticket_id: currentTicket.id,
          sender_id: currentUser.id,
          sender_role: 'admin',
          content: reply
        });
      }

      await supabaseClient.from('support_tickets').update({
        status: status,
        assigned_to: currentUser.id,
        updated_at: new Date().toISOString()
      }).eq('id', currentTicket.id);

      closeModal('ticket-modal');
      showToast('Reply sent');
      await loadTickets();
      updateDashboard();
    }

    // ========== PAYMENTS ==========
    async function releasePayment(paymentId) {
      if (!confirm('Release this payment to the provider?')) return;

      await supabaseClient.from('payments').update({
        status: 'released',
        released_at: new Date().toISOString()
      }).eq('id', paymentId);

      showToast('Payment released');
      await loadPayments();
      updateDashboard();
    }

    async function logAdminAction(action, targetId, metadata) {
      try {
        await supabaseClient.from('admin_audit_log').insert({
          performed_by: currentUser?.id || null,
          action,
          target_type: 'payment',
          target_id: targetId,
          metadata: metadata || {}
        });
      } catch (err) {
        console.warn('admin_audit_log insert failed', err);
      }
    }

    function editPayment(paymentId) {
      const p = payments.find(x => x.id === paymentId);
      if (!p) {
        showToast('Payment not found', 'error');
        return;
      }
      document.getElementById('edit-payment-id').value = p.id;
      document.getElementById('edit-payment-status').value = p.status || 'held';
      document.getElementById('edit-payment-amount-total').value = p.amount_total ?? '';
      document.getElementById('edit-payment-mcc-fee').value = p.amount_mcc_fee ?? '';
      document.getElementById('edit-payment-refund-amount').value = p.refund_amount ?? '';
      document.getElementById('edit-payment-admin-note').value = p.admin_note || '';
      const modal = document.getElementById('edit-payment-modal');
      modal.style.display = 'flex';
      modal.classList.add('active');
    }

    async function saveEditPayment() {
      const id = document.getElementById('edit-payment-id').value;
      if (!id) return;
      const before = payments.find(x => x.id === id);

      const status = document.getElementById('edit-payment-status').value;
      const amountTotalRaw = document.getElementById('edit-payment-amount-total').value;
      const mccFeeRaw = document.getElementById('edit-payment-mcc-fee').value;
      const refundRaw = document.getElementById('edit-payment-refund-amount').value;
      const note = document.getElementById('edit-payment-admin-note').value.trim();

      const updates = {
        status,
        amount_total: amountTotalRaw === '' ? null : Number.parseFloat(amountTotalRaw),
        amount_mcc_fee: mccFeeRaw === '' ? null : Number.parseFloat(mccFeeRaw),
        refund_amount: refundRaw === '' ? null : Number.parseFloat(refundRaw),
        admin_note: note || null
      };

      for (const k of ['amount_total', 'amount_mcc_fee', 'refund_amount']) {
        if (updates[k] !== null && (Number.isNaN(updates[k]) || updates[k] < 0)) {
          showToast(`Invalid value for ${k.replaceAll('_', ' ')}`, 'error');
          return;
        }
      }

      const { error } = await supabaseClient.from('payments').update(updates).eq('id', id);
      if (error) {
        showToast('Failed to save: ' + error.message, 'error');
        return;
      }

      await logAdminAction('edit_payment', id, {
        before: before ? {
          status: before.status,
          amount_total: before.amount_total,
          amount_mcc_fee: before.amount_mcc_fee,
          refund_amount: before.refund_amount,
          admin_note: before.admin_note || null
        } : null,
        after: updates
      });

      closeModal('edit-payment-modal');
      showToast('Payment updated');
      await loadPayments();
      updateDashboard();
    }

    async function deletePayment(paymentId) {
      const p = payments.find(x => x.id === paymentId);
      if (!p) {
        showToast('Payment not found', 'error');
        return;
      }
      if (!confirm(`Permanently delete this payment?\n\nPackage: ${p.maintenance_packages?.title || 'Package'}\nAmount: $${(p.amount_total || 0).toFixed(2)}\n\nThis cannot be undone.`)) return;

      const { data: openDisputes, error: disputeErr } = await supabaseClient
        .from('disputes')
        .select('id')
        .eq('payment_id', paymentId)
        .eq('status', 'open')
        .limit(1);
      if (disputeErr) {
        showToast('Could not check disputes: ' + disputeErr.message, 'error');
        return;
      }
      if (openDisputes && openDisputes.length > 0) {
        showToast('Cannot delete: an open dispute references this payment. Resolve the dispute first.', 'error');
        return;
      }

      const { error } = await supabaseClient.from('payments').delete().eq('id', paymentId);
      if (error) {
        showToast('Failed to delete: ' + error.message, 'error');
        return;
      }

      await logAdminAction('delete_payment', paymentId, {
        before: {
          status: p.status,
          amount_total: p.amount_total,
          amount_mcc_fee: p.amount_mcc_fee,
          refund_amount: p.refund_amount,
          admin_note: p.admin_note || null,
          member_id: p.member_id,
          provider_id: p.provider_id,
          package_id: p.package_id
        },
        after: null
      });

      showToast('Payment deleted');
      await loadPayments();
      updateDashboard();
    }

    function csvEscapePayments(v) {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replaceAll('"', '""')}"`;
      }
      return s;
    }

    function exportPayments() {
      const rows = filteredPayments;
      if (!rows || !rows.length) {
        showToast('No payments to export for the current filter', 'error');
        return;
      }
      const header = ['Date', 'Package', 'Member', 'Provider', 'Amount', 'MCC Fee', 'Refund Amount', 'Status', 'Payment ID'];
      const lines = [header.join(',')];
      for (const p of rows) {
        lines.push([
          csvEscapePayments(p.created_at || ''),
          csvEscapePayments(p.maintenance_packages?.title || ''),
          csvEscapePayments(p.member?.full_name || ''),
          csvEscapePayments(p.provider?.full_name || ''),
          csvEscapePayments((p.amount_total ?? 0).toFixed(2)),
          csvEscapePayments((p.amount_mcc_fee ?? 0).toFixed(2)),
          csvEscapePayments((p.refund_amount ?? 0).toFixed(2)),
          csvEscapePayments(p.status || ''),
          csvEscapePayments(p.id || '')
        ].join(','));
      }
      const csv = lines.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `payments-export-${today}.csv`;
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`Exported ${rows.length} payment${rows.length === 1 ? '' : 's'}`);
    }

    // ========== NAVIGATION ==========
    function setupEventListeners() {
      document.querySelectorAll('.nav-item[data-section]').forEach(item => {
        item.addEventListener('click', () => showSection(item.dataset.section));
      });

      document.querySelectorAll('.quick-stat-btn[data-nav]').forEach(btn => {
        btn.addEventListener('click', () => {
          showSection(btn.dataset.nav);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });

      document.querySelectorAll('.tabs').forEach(tabContainer => {
        tabContainer.querySelectorAll('.tab').forEach(tab => {
          tab.addEventListener('click', () => {
            tabContainer.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const section = tabContainer.closest('.section').id;
            currentFilters[section] = tab.dataset.filter;
            if (section === 'applications') renderApplications();
            if (section === 'payments') renderPayments();
            if (section === 'disputes') renderDisputes();
            if (section === 'tickets') renderTickets();
            if (section === 'refunds') { paginationState.refunds.filter = tab.dataset.filter; paginationState.refunds.page = 1; loadRefunds(1); }
          });
        });
      });

      document.querySelectorAll('.modal-backdrop').forEach(b => {
        b.addEventListener('click', e => { if (e.target === b) b.classList.remove('active'); });
      });
    }

    async function showSection(id) {
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById(id).classList.add('active');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelector(`.nav-item[data-section="${id}"]`)?.classList.add('active');
      
      await loadSectionIfNeeded(id);

      // Task #139 — refresh the dashboard agent tile every time the user
      // navigates back to the dashboard so 24h counts and the recent-activity
      // list stay current (loadAllData only runs once at admin verification).
      if (id === 'dashboard' && typeof loadDashboardAgentTile === 'function') {
        try { await loadDashboardAgentTile(); }
        catch (e) { console.warn('[admin] dashboard agent tile refresh failed:', e); }
      }
    }

    function navigateToSection(id) {
      showSection(id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.navigateToSection = navigateToSection;

    function closeModal(id) { const m = document.getElementById(id); m.classList.remove('active'); m.style.display = 'none'; }

    function showToast(msg, type = 'success') {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerHTML = `<span>${type === 'success' ? mccIcon('check', 16) : mccIcon('alert-triangle', 16)}</span><span>${msg}</span>`;
      document.getElementById('toast-container').appendChild(toast);
      setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    }

    // ========== HUBSPOT CRM ==========
    let crmContactsData = [];
    let crmDealsData = [];
    let crmCompaniesData = [];
    let currentCrmFormType = 'contact';

    async function loadCrmData() {
      try {
        const [contactsRes, dealsRes, companiesRes] = await Promise.all([
          fetch('/api/admin/hubspot/contacts', { headers: getAdminHeaders() }),
          fetch('/api/admin/hubspot/deals', { headers: getAdminHeaders() }),
          fetch('/api/admin/hubspot/companies', { headers: getAdminHeaders() })
        ]);

        if (contactsRes.ok) {
          const cData = await contactsRes.json();
          crmContactsData = cData.contacts || [];
          document.getElementById('crm-stat-contacts').textContent = crmContactsData.length;
          renderCrmContacts(crmContactsData);
        }
        if (dealsRes.ok) {
          const dData = await dealsRes.json();
          crmDealsData = dData.deals || [];
          document.getElementById('crm-stat-deals').textContent = crmDealsData.length;
          renderCrmDeals(crmDealsData);
        }
        if (companiesRes.ok) {
          const coData = await companiesRes.json();
          crmCompaniesData = coData.companies || [];
          document.getElementById('crm-stat-companies').textContent = crmCompaniesData.length;
          renderCrmCompanies(crmCompaniesData);
        }
      } catch (err) {
        console.error('Error loading CRM data:', err);
        showToast('Failed to load CRM data', 'error');
      }
    }

    function renderCrmContacts(contacts) {
      const tbody = document.getElementById('crm-contacts-body');
      if (!contacts.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px;">No contacts found</td></tr>';
        return;
      }
      tbody.innerHTML = contacts.map(c => {
        const p = c.properties || {};
        const name = [p.firstname, p.lastname].filter(Boolean).join(' ') || '—';
        const stage = p.lifecyclestage ? `<span class="status-badge" style="background:var(--accent-blue-soft);color:var(--accent-blue);">${p.lifecyclestage}</span>` : '—';
        const created = p.createdate ? new Date(p.createdate).toLocaleDateString() : '—';
        return `<tr>
          <td style="font-weight:600;">${name}</td>
          <td>${p.email || '—'}</td>
          <td>${p.phone || '—'}</td>
          <td>${p.company || '—'}</td>
          <td>${stage}</td>
          <td>${created}</td>
        </tr>`;
      }).join('');
    }

    function renderCrmDeals(deals) {
      const tbody = document.getElementById('crm-deals-body');
      if (!deals.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px;">No deals found</td></tr>';
        return;
      }
      tbody.innerHTML = deals.map(d => {
        const p = d.properties || {};
        const amount = p.amount ? `$${parseFloat(p.amount).toLocaleString('en-US', {minimumFractionDigits:2})}` : '—';
        const stageColors = {
          closedwon: 'background:var(--accent-green-soft);color:var(--accent-green);',
          closedlost: 'background:var(--accent-red-soft);color:var(--accent-red);',
        };
        const stageStyle = stageColors[p.dealstage] || 'background:var(--accent-blue-soft);color:var(--accent-blue);';
        const stage = p.dealstage ? `<span class="status-badge" style="${stageStyle}">${p.dealstage}</span>` : '—';
        const closeDate = p.closedate ? new Date(p.closedate).toLocaleDateString() : '—';
        const created = p.createdate ? new Date(p.createdate).toLocaleDateString() : '—';
        return `<tr>
          <td style="font-weight:600;">${p.dealname || '—'}</td>
          <td>${amount}</td>
          <td>${stage}</td>
          <td>${p.pipeline || '—'}</td>
          <td>${closeDate}</td>
          <td>${created}</td>
        </tr>`;
      }).join('');
    }

    function renderCrmCompanies(companies) {
      const tbody = document.getElementById('crm-companies-body');
      if (!companies.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px;">No companies found</td></tr>';
        return;
      }
      tbody.innerHTML = companies.map(co => {
        const p = co.properties || {};
        const location = [p.city, p.state].filter(Boolean).join(', ') || '—';
        const created = p.createdate ? new Date(p.createdate).toLocaleDateString() : '—';
        return `<tr>
          <td style="font-weight:600;">${p.name || '—'}</td>
          <td>${p.domain ? `<a href="https://${p.domain}" target="_blank" style="color:var(--accent-blue);">${p.domain}</a>` : '—'}</td>
          <td>${p.industry || '—'}</td>
          <td>${p.phone || '—'}</td>
          <td>${location}</td>
          <td>${created}</td>
        </tr>`;
      }).join('');
    }

    function switchCrmTab(tab) {
      document.querySelectorAll('.crm-tab-panel').forEach(p => p.style.display = 'none');
      document.querySelectorAll('.crm-tab-btn').forEach(b => {
        b.classList.remove('active');
        b.classList.remove('btn-primary');
        b.classList.add('btn-secondary');
      });
      document.getElementById('crm-tab-' + tab).style.display = 'block';
      const activeBtn = document.querySelector(`.crm-tab-btn[data-crm-tab="${tab}"]`);
      if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.classList.remove('btn-secondary');
        activeBtn.classList.add('btn-primary');
      }
    }
    window.switchCrmTab = switchCrmTab;

    function filterCrmContacts() {
      const q = document.getElementById('crm-contact-search').value.toLowerCase();
      const filtered = crmContactsData.filter(c => {
        const p = c.properties || {};
        return [p.firstname, p.lastname, p.email, p.phone, p.company].some(v => v && v.toLowerCase().includes(q));
      });
      renderCrmContacts(filtered);
    }
    window.filterCrmContacts = filterCrmContacts;

    function filterCrmDeals() {
      const q = document.getElementById('crm-deal-search').value.toLowerCase();
      const filtered = crmDealsData.filter(d => {
        const p = d.properties || {};
        return [p.dealname, p.dealstage, p.pipeline].some(v => v && v.toLowerCase().includes(q));
      });
      renderCrmDeals(filtered);
    }
    window.filterCrmDeals = filterCrmDeals;

    function filterCrmCompanies() {
      const q = document.getElementById('crm-company-search').value.toLowerCase();
      const filtered = crmCompaniesData.filter(co => {
        const p = co.properties || {};
        return [p.name, p.domain, p.industry, p.city, p.state].some(v => v && v.toLowerCase().includes(q));
      });
      renderCrmCompanies(filtered);
    }
    window.filterCrmCompanies = filterCrmCompanies;

    function showCrmModal(type) {
      currentCrmFormType = type;
      document.getElementById('crm-form-contact').style.display = type === 'contact' ? 'block' : 'none';
      document.getElementById('crm-form-deal').style.display = type === 'deal' ? 'block' : 'none';
      document.getElementById('crm-form-company').style.display = type === 'company' ? 'block' : 'none';
      const titles = { contact: 'Add Contact', deal: 'Add Deal', company: 'Add Company' };
      document.getElementById('crm-modal-title').textContent = titles[type] || 'Add Record';
      const modal = document.getElementById('crm-add-modal');
      modal.style.display = 'flex';
      modal.classList.add('active');
    }
    window.showCrmModal = showCrmModal;

    function closeCrmModal() {
      const modal = document.getElementById('crm-add-modal');
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
    window.closeCrmModal = closeCrmModal;

    async function saveCrmRecord() {
      const btn = document.getElementById('crm-modal-save-btn');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      try {
        let url, body;
        if (currentCrmFormType === 'contact') {
          const email = document.getElementById('crm-contact-email').value.trim();
          if (!email) { showToast('Email is required', 'error'); return; }
          url = '/api/admin/hubspot/contacts';
          body = {
            firstname: document.getElementById('crm-contact-firstname').value.trim(),
            lastname: document.getElementById('crm-contact-lastname').value.trim(),
            email,
            phone: document.getElementById('crm-contact-phone').value.trim(),
            company: document.getElementById('crm-contact-company').value.trim(),
            lifecyclestage: document.getElementById('crm-contact-stage').value
          };
        } else if (currentCrmFormType === 'deal') {
          const dealname = document.getElementById('crm-deal-name').value.trim();
          if (!dealname) { showToast('Deal name is required', 'error'); return; }
          url = '/api/admin/hubspot/deals';
          body = {
            dealname,
            amount: document.getElementById('crm-deal-amount').value || '',
            dealstage: document.getElementById('crm-deal-stage').value,
            closedate: document.getElementById('crm-deal-closedate').value || ''
          };
        } else if (currentCrmFormType === 'company') {
          const name = document.getElementById('crm-company-name').value.trim();
          if (!name) { showToast('Company name is required', 'error'); return; }
          url = '/api/admin/hubspot/companies';
          body = {
            name,
            domain: document.getElementById('crm-company-domain').value.trim(),
            industry: document.getElementById('crm-company-industry').value.trim(),
            phone: document.getElementById('crm-company-phone').value.trim(),
            city: document.getElementById('crm-company-city').value.trim(),
            state: document.getElementById('crm-company-state').value.trim()
          };
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify(body)
        });

        if (res.ok) {
          showToast(`${currentCrmFormType.charAt(0).toUpperCase() + currentCrmFormType.slice(1)} created successfully`);
          closeCrmModal();
          loadedSections['crm'] = false;
          await loadCrmData();
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to create record', 'error');
        }
      } catch (err) {
        console.error('CRM save error:', err);
        showToast('Failed to save record', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save';
      }
    }
    window.saveCrmRecord = saveCrmRecord;

    async function syncMembersToHubSpot() {
      const btn = event.target;
      btn.disabled = true;
      btn.textContent = 'Syncing...';
      try {
        const res = await fetch('/api/admin/hubspot/sync-members', {
          method: 'POST',
          headers: getAdminHeaders()
        });
        if (res.ok) {
          const data = await res.json();
          showToast(`Synced ${data.synced || 0} members to HubSpot`);
          loadedSections['crm'] = false;
          await loadCrmData();
        } else {
          const err = await res.json();
          showToast(err.error || 'Sync failed', 'error');
        }
      } catch (err) {
        showToast('Failed to sync members', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Sync Members';
      }
    }
    window.syncMembersToHubSpot = syncMembersToHubSpot;

    // ========== GLOBAL 2FA TOGGLE ==========
    async function load2faGlobalStatus() {
      try {
        const session = await supabaseClient.auth.getSession();
        if (!session?.data?.session?.access_token) return;
        
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/2fa-global-status`, {
          headers: { 'Authorization': `Bearer ${session.data.session.access_token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          const toggle = document.getElementById('global-2fa-toggle');
          const statusMsg = document.getElementById('2fa-status-message');
          if (toggle) {
            toggle.checked = data.enabled;
          }
          if (statusMsg) {
            statusMsg.style.display = 'block';
            statusMsg.style.background = data.enabled ? 'var(--accent-green-soft)' : 'var(--accent-orange-soft)';
            statusMsg.style.color = data.enabled ? 'var(--accent-green)' : 'var(--accent-orange)';
            statusMsg.textContent = data.enabled 
              ? '2FA enforcement is ON. Users with 2FA enabled must verify to access protected features.'
              : '2FA enforcement is OFF. Users can access features without 2FA verification (for App Store review).';
          }
        }
      } catch (err) {
        console.error('Failed to load 2FA global status:', err);
      }
    }

    async function toggle2faGlobal(enabled) {
      const toggle = document.getElementById('global-2fa-toggle');
      const statusMsg = document.getElementById('2fa-status-message');
      
      try {
        const session = await supabaseClient.auth.getSession();
        if (!session?.data?.session?.access_token) {
          showToast('Authentication required', 'error');
          toggle.checked = !enabled;
          return;
        }
        
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/2fa-global-toggle`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.data.session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ enabled })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          showToast(data.message, 'success');
          statusMsg.style.display = 'block';
          statusMsg.style.background = enabled ? 'var(--accent-green-soft)' : 'var(--accent-orange-soft)';
          statusMsg.style.color = enabled ? 'var(--accent-green)' : 'var(--accent-orange)';
          statusMsg.textContent = enabled 
            ? '2FA enforcement is ON. Users with 2FA enabled must verify to access protected features.'
            : '2FA enforcement is OFF. Users can access features without 2FA verification (for App Store review).';
        } else {
          showToast(data.error || 'Failed to update 2FA setting', 'error');
          toggle.checked = !enabled;
        }
      } catch (err) {
        console.error('Failed to toggle 2FA:', err);
        showToast('Failed to update 2FA setting', 'error');
        toggle.checked = !enabled;
      }
    }

    async function sendBulkWelcomeEmails() {
      const btn = document.getElementById('send-welcome-emails-btn');
      const statusMsg = document.getElementById('welcome-email-status');
      
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Sending...';
      
      try {
        const session = await supabaseClient.auth.getSession();
        if (!session?.data?.session?.access_token) {
          showToast('Authentication required', 'error');
          btn.disabled = false;
          btn.textContent = originalText;
          return;
        }
        
        statusMsg.style.display = 'block';
        statusMsg.style.background = 'var(--bg-input)';
        statusMsg.style.color = 'var(--text-secondary)';
        statusMsg.textContent = 'Sending welcome emails... This may take a few minutes.';
        
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/send-bulk-welcome-emails`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.data.session.access_token}`,
            'Content-Type': 'application/json'
          }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          showToast(`Welcome emails sent! ${data.sent} sent, ${data.skipped} skipped, ${data.errors} errors`, 'success');
          statusMsg.style.background = 'var(--accent-green-soft)';
          statusMsg.style.color = 'var(--accent-green)';
          statusMsg.textContent = `Complete! ${data.sent} emails sent, ${data.skipped} already sent/skipped, ${data.errors} errors. Total accounts: ${data.total}`;
        } else {
          showToast(data.error || 'Failed to send welcome emails', 'error');
          statusMsg.style.background = 'var(--accent-red-soft)';
          statusMsg.style.color = 'var(--accent-red)';
          statusMsg.textContent = data.error || 'Failed to send welcome emails';
        }
      } catch (err) {
        console.error('Failed to send bulk welcome emails:', err);
        showToast('Failed to send welcome emails', 'error');
        statusMsg.style.display = 'block';
        statusMsg.style.background = 'var(--accent-red-soft)';
        statusMsg.style.color = 'var(--accent-red)';
        statusMsg.textContent = 'Error: ' + err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }

    // ========== PILOT APPLICATIONS ==========
    let pilotApplications = [];
    let currentPilotFilter = 'pending';

    async function loadPilotApplications() {
      try {
        const { data, error } = await supabaseClient
          .from('pilot_applications')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error loading pilot applications:', error);
          pilotApplications = [];
        } else {
          pilotApplications = data || [];
        }

        updatePilotStats();
        renderPilotApplications();
        // Task #139 — Gatekeeper screens applications.
        if (typeof window.renderAgentActivityPanel === 'function') {
          try { window.renderAgentActivityPanel('pilot-agent-activity', {
            agentSlug: 'gatekeeper',
            limit: 10, title: 'Recent Gatekeeper Reviews', showEmpty: false
          }); } catch (e) {}
        }
      } catch (err) {
        console.error('loadPilotApplications error:', err);
      }
    }

    function updatePilotStats() {
      const pending = pilotApplications.filter(a => a.status === 'pending').length;
      const approved = pilotApplications.filter(a => a.status === 'approved').length;
      const rejected = pilotApplications.filter(a => a.status === 'rejected').length;

      document.getElementById('pilot-pending').textContent = pending;
      document.getElementById('pilot-approved').textContent = approved;
      document.getElementById('pilot-rejected').textContent = rejected;
      document.getElementById('pilot-count').textContent = pending;
      document.getElementById('pilot-count').style.display = pending > 0 ? 'inline' : 'none';
    }

    function renderPilotApplications() {
      const tbody = document.getElementById('pilot-applications-table');
      let filtered = pilotApplications;

      if (currentPilotFilter !== 'all') {
        filtered = pilotApplications.filter(a => a.status === currentPilotFilter);
      }

      if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No ${currentPilotFilter} pilot applications</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(app => {
        const services = Array.isArray(app.services) ? app.services.join(', ') : (app.services || 'N/A');
        const location = `${app.city || ''}, ${app.state || ''}`.replace(/^, |, $/g, '') || 'N/A';
        
        return `
          <tr>
            <td>
              <div><strong>${app.business_name || 'Unnamed'}</strong></div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${app.contact_name || ''}</div>
            </td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${services}">${services}</td>
            <td>${location}</td>
            <td>${app.phone || 'N/A'}</td>
            <td>${new Date(app.created_at).toLocaleDateString()}</td>
            <td><span class="status-badge ${app.status}">${app.status}</span></td>
            <td>
              <div style="display:flex;gap:4px;">
                <button class="btn btn-secondary btn-sm" onclick="viewPilotApplication('${app.id}')">View</button>
                ${app.status === 'pending' ? `
                  <button class="btn btn-success btn-sm" onclick="approvePilotApplication('${app.id}')">${mccIcon('check', 16)}</button>
                  <button class="btn btn-danger btn-sm" onclick="rejectPilotApplication('${app.id}')">${mccIcon('x', 16)}</button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    function viewPilotApplication(id) {
      const app = pilotApplications.find(a => a.id === id);
      if (!app) return;

      const services = Array.isArray(app.services) ? app.services.join(', ') : (app.services || 'N/A');
      
      const modalContent = `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('star', 24)} Founding Provider Application</div>
          <div class="detail-grid">
            <span class="detail-label">Business Name:</span><span class="detail-value">${app.business_name || 'N/A'}</span>
            <span class="detail-label">Contact Name:</span><span class="detail-value">${app.contact_name || 'N/A'}</span>
            <span class="detail-label">Email:</span><span class="detail-value">${app.email || 'N/A'}</span>
            <span class="detail-label">Phone:</span><span class="detail-value">${app.phone || 'N/A'}</span>
            <span class="detail-label">Location:</span><span class="detail-value">${app.city || ''}, ${app.state || ''}</span>
            <span class="detail-label">Years Experience:</span><span class="detail-value">${app.years_experience || 'N/A'}</span>
            <span class="detail-label">Services:</span><span class="detail-value">${services}</span>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">About the Business</div>
          <p style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);line-height:1.6;">${app.about_business || 'No description provided.'}</p>
        </div>

        <div class="form-section">
          <div class="form-section-title">Agreements</div>
          <div style="display:grid;gap:8px;">
            <div style="display:flex;align-items:center;gap:8px;">
              ${app.agree_tos ? mccIcon('check-circle', 16) : mccIcon('x', 16)} Agreed to Terms of Service
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              ${app.agree_contractor ? mccIcon('check-circle', 16) : mccIcon('x', 16)} Agreed to Independent Contractor Terms
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              ${app.agree_accuracy ? mccIcon('check-circle', 16) : mccIcon('x', 16)} Confirmed Information Accuracy
            </div>
          </div>
        </div>

        <div class="form-section" style="border-bottom:none;">
          <div class="detail-grid">
            <span class="detail-label">Status:</span><span class="detail-value"><span class="status-badge ${app.status}">${app.status}</span></span>
            <span class="detail-label">Submitted:</span><span class="detail-value">${new Date(app.created_at).toLocaleString()}</span>
          </div>
        </div>
      `;

      document.getElementById('application-modal-body').innerHTML = modalContent;
      
      // Update modal footer buttons based on status
      const modalFooter = document.querySelector('#application-modal .modal-footer');
      if (app.status === 'pending') {
        modalFooter.innerHTML = `
          <button class="btn btn-secondary" onclick="closeModal('application-modal')">Close</button>
          <button class="btn btn-danger" onclick="rejectPilotApplication('${app.id}'); closeModal('application-modal');">Reject</button>
          <button class="btn btn-success" onclick="approvePilotApplication('${app.id}'); closeModal('application-modal');">Approve as Founding Provider</button>
        `;
      } else {
        modalFooter.innerHTML = `
          <button class="btn btn-secondary" onclick="closeModal('application-modal')">Close</button>
        `;
      }

      document.getElementById('application-modal').classList.add('active');
    }

    async function approvePilotApplication(id) {
      const app = pilotApplications.find(a => a.id === id);
      if (!app) return;

      if (!confirm(`Approve ${app.business_name} as a Founding Provider?\n\nThis will create their provider profile with Founding Provider status.`)) return;

      try {
        // Update pilot application status
        const { error: updateError } = await supabaseClient
          .from('pilot_applications')
          .update({ 
            status: 'approved',
            approved_at: new Date().toISOString(),
            approved_by: currentUser.id
          })
          .eq('id', id);

        if (updateError) {
          showToast('Failed to approve application', 'error');
          console.error('Approval error:', updateError);
          return;
        }

        // Check if a profile already exists for this email
        const { data: existingProfile } = await supabaseClient
          .from('profiles')
          .select('id')
          .eq('email', app.email)
          .single();

        if (existingProfile) {
          // Update existing profile to be a founding provider
          const { error: profileError } = await supabaseClient
            .from('profiles')
            .update({
              role: 'provider',
              is_founding_provider: true,
              business_name: app.business_name,
              business_phone: app.phone,
              city: app.city,
              state: app.state
            })
            .eq('id', existingProfile.id);

          if (profileError) {
            console.error('Profile update error:', profileError);
          }

          // Ensure provider_stats exists
          await supabaseClient.from('provider_stats').upsert({ 
            provider_id: existingProfile.id 
          }, { onConflict: 'provider_id' });
        }

        showToast(`${app.business_name} approved as Founding Provider!`, 'success');
        await loadPilotApplications();
        await loadProviders();
      } catch (err) {
        console.error('approvePilotApplication error:', err);
        showToast('Error approving application', 'error');
      }
    }

    async function rejectPilotApplication(id) {
      const app = pilotApplications.find(a => a.id === id);
      if (!app) return;

      const reason = prompt('Reason for rejection (optional):');
      if (reason === null) return; // Cancelled

      try {
        const { error } = await supabaseClient
          .from('pilot_applications')
          .update({ 
            status: 'rejected',
            rejection_reason: reason || null,
            rejected_at: new Date().toISOString(),
            rejected_by: currentUser.id
          })
          .eq('id', id);

        if (error) {
          showToast('Failed to reject application', 'error');
          console.error('Rejection error:', error);
          return;
        }

        showToast(`Application rejected`, 'success');
        await loadPilotApplications();
      } catch (err) {
        console.error('rejectPilotApplication error:', err);
        showToast('Error rejecting application', 'error');
      }
    }

    // Setup pilot applications tabs
    document.getElementById('pilot-tabs')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab')) {
        document.querySelectorAll('#pilot-tabs .tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentPilotFilter = e.target.dataset.filter;
        renderPilotApplications();
      }
    });

    // ========== MEMBER FOUNDER APPLICATIONS ==========
    let memberFounderApplications = [];
    let currentMFFilter = 'pending';

    async function loadMemberFounderApplications() {
      try {
        const { data, error } = await supabaseClient
          .from('member_founder_applications')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error loading member founder applications:', error);
          memberFounderApplications = [];
        } else {
          memberFounderApplications = data || [];
        }

        updateMFStats();
        renderMemberFounderApplications();
        // Task #139 — Concierge + Advocate touch member-founder onboarding.
        if (typeof window.renderAgentActivityPanel === 'function') {
          try { window.renderAgentActivityPanel('member-founders-agent-activity', {
            agentSlug: ['concierge', 'advocate'],
            limit: 10, title: 'Recent Member-Founder Agent Activity', showEmpty: false
          }); } catch (e) {}
        }
      } catch (err) {
        console.error('loadMemberFounderApplications error:', err);
      }
    }

    function updateMFStats() {
      const pending = memberFounderApplications.filter(a => a.status === 'pending').length;
      const approved = memberFounderApplications.filter(a => a.status === 'approved').length;
      const rejected = memberFounderApplications.filter(a => a.status === 'rejected').length;

      document.getElementById('mf-pending').textContent = pending;
      document.getElementById('mf-approved').textContent = approved;
      document.getElementById('mf-rejected').textContent = rejected;
      document.getElementById('member-founder-count').textContent = pending;
      document.getElementById('member-founder-count').style.display = pending > 0 ? 'inline' : 'none';
    }

    function renderMemberFounderApplications() {
      const tbody = document.getElementById('member-founders-table');
      let filtered = memberFounderApplications;

      if (currentMFFilter !== 'all') {
        filtered = memberFounderApplications.filter(a => a.status === currentMFFilter);
      }

      if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No ${currentMFFilter} member founder applications</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(app => {
        const promotionLabels = {
          'social_media': 'Social Media',
          'word_of_mouth': 'Word of Mouth',
          'local_business': 'Local Business',
          'car_community': 'Car Community',
          'professional_network': 'Professional Network',
          'content_creation': 'Content Creation',
          'events': 'Events',
          'other': 'Other'
        };
        const promotionMethod = promotionLabels[app.promotion_method] || app.promotion_method || 'N/A';
        
        return `
          <tr>
            <td>
              <div><strong>${app.full_name || 'Unnamed'}</strong></div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${app.phone || ''}</div>
            </td>
            <td>${app.email || 'N/A'}</td>
            <td>${app.location || 'N/A'}</td>
            <td>${promotionMethod}</td>
            <td>${new Date(app.created_at).toLocaleDateString()}</td>
            <td><span class="status-badge ${app.status}">${app.status}</span></td>
            <td>
              <div style="display:flex;gap:4px;flex-wrap:wrap;">
                <button class="btn btn-secondary btn-sm" onclick="viewMemberFounder('${app.id}')">View</button>
                ${(app.status || '').toLowerCase().trim() === 'pending' ? `
                  <button class="btn btn-success btn-sm" onclick="approveMemberFounder('${app.id}')">${mccIcon('check', 16)}</button>
                  <button class="btn btn-danger btn-sm" onclick="rejectMemberFounder('${app.id}')">${mccIcon('x', 16)}</button>
                ` : ''}
                ${['approved', 'active'].includes((app.status || '').toLowerCase().trim()) ? `
                  <button class="btn btn-primary btn-sm" onclick="resendFounderWelcomeEmail('${app.id}')" title="Resend Welcome Email">${mccIcon('mail', 16)}</button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    function viewMemberFounder(id) {
      const app = memberFounderApplications.find(a => a.id === id);
      if (!app) return;

      const promotionLabels = {
        'social_media': 'Social Media (Instagram, Facebook, TikTok)',
        'word_of_mouth': 'Word of Mouth / Networking',
        'local_business': 'Local Business Connections',
        'car_community': 'Car Enthusiast Community',
        'professional_network': 'Professional Network',
        'content_creation': 'Content Creation (YouTube, Blog)',
        'events': 'Events & Car Shows',
        'other': 'Other'
      };

      const connectionLabels = {
        'none': 'No existing connections',
        'mechanics': 'Knows mechanics/technicians',
        'detailers': 'Knows detailers/auto spa owners',
        'bodyshops': 'Knows body shop owners',
        'dealership': 'Knows dealership staff',
        'multiple': 'Multiple types of providers',
        'industry_worker': 'Works in the auto industry'
      };
      
      const modalContent = `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('user', 24)} Applicant Information</div>
          <div class="detail-grid">
            <span class="detail-label">Full Name:</span><span class="detail-value">${app.full_name || 'N/A'}</span>
            <span class="detail-label">Email:</span><span class="detail-value">${app.email || 'N/A'}</span>
            <span class="detail-label">Phone:</span><span class="detail-value">${app.phone || 'N/A'}</span>
            <span class="detail-label">Location:</span><span class="detail-value">${app.location || 'N/A'}</span>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('bell', 24)} Promotion Strategy</div>
          <div class="detail-grid">
            <span class="detail-label">Primary Method:</span><span class="detail-value">${promotionLabels[app.promotion_method] || app.promotion_method || 'N/A'}</span>
            <span class="detail-label">Social Following:</span><span class="detail-value">${app.social_following || 'Not specified'}</span>
            <span class="detail-label">Hours/Week:</span><span class="detail-value">${app.hours_available || 'Not specified'}</span>
            <span class="detail-label">Auto Connections:</span><span class="detail-value">${connectionLabels[app.auto_connections] || app.auto_connections || 'Not specified'}</span>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('message-square', 24)} Motivation</div>
          <p style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);line-height:1.6;">${app.motivation || 'No motivation provided.'}</p>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('clipboard-list', 24)} Agreements</div>
          <div style="display:grid;gap:8px;">
            ${app.agreements_accepted ? `
              <div style="display:flex;align-items:center;gap:8px;">
                ${app.agreements_accepted.terms_of_service ? mccIcon('check-circle', 16) : mccIcon('x', 16)} Terms of Service
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                ${app.agreements_accepted.independent_contractor ? mccIcon('check-circle', 16) : mccIcon('x', 16)} Independent Contractor Terms
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                ${app.agreements_accepted.commission_terms ? mccIcon('check-circle', 16) : mccIcon('x', 16)} Commission Terms
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                ${app.agreements_accepted.accurate_information ? mccIcon('check-circle', 16) : mccIcon('x', 16)} Information Accuracy
              </div>
            ` : '<div style="color:var(--text-muted);">Agreement details not available</div>'}
          </div>
        </div>

        <div class="form-section" style="border-bottom:none;">
          <div class="detail-grid">
            <span class="detail-label">Status:</span><span class="detail-value"><span class="status-badge ${app.status}">${app.status}</span></span>
            <span class="detail-label">Submitted:</span><span class="detail-value">${new Date(app.created_at).toLocaleString()}</span>
          </div>
        </div>
      `;

      document.getElementById('application-modal-body').innerHTML = modalContent;
      
      const modalFooter = document.querySelector('#application-modal .modal-footer');
      if (app.status === 'pending') {
        modalFooter.innerHTML = `
          <button class="btn btn-secondary" onclick="closeModal('application-modal')">Close</button>
          <button class="btn btn-danger" onclick="rejectMemberFounder('${app.id}'); closeModal('application-modal');">Reject</button>
          <button class="btn btn-success" onclick="approveMemberFounder('${app.id}'); closeModal('application-modal');">Approve as Member Founder</button>
        `;
      } else {
        modalFooter.innerHTML = `
          <button class="btn btn-secondary" onclick="closeModal('application-modal')">Close</button>
        `;
      }

      document.getElementById('application-modal').classList.add('active');
    }

    function generateReferralCode(name) {
      const base = (name || 'MCC').toUpperCase().replace(/[^A-Z]/g, '').substring(0, 4).padEnd(4, 'X');
      const random = Math.floor(1000 + Math.random() * 9000);
      return base + random;
    }

    async function approveMemberFounder(id) {
      const app = memberFounderApplications.find(a => a.id === id);
      if (!app) return;

      if (!confirm(`Approve ${app.full_name} as a Member Founder?\n\nThey will be notified and added to the ambassador program with a unique referral code.`)) return;

      try {
        let referralCode;
        let founderProfileId;
        const normalizedEmail = (app.email || '').trim().toLowerCase();

        const { data: existingProfile } = await supabaseClient
          .from('member_founder_profiles')
          .select('id, referral_code, email')
          .ilike('email', normalizedEmail)
          .maybeSingle();

        if (existingProfile) {
          referralCode = existingProfile.referral_code;
          founderProfileId = existingProfile.id;
          console.log('Found existing founder profile for email:', app.email);

          const { error: updateProfileError } = await supabaseClient
            .from('member_founder_profiles')
            .update({
              application_id: id,
              user_id: app.user_id || null,
              full_name: app.full_name,
              phone: app.phone,
              location: app.location
            })
            .eq('id', existingProfile.id);

          if (updateProfileError) {
            console.error('Error updating existing profile:', updateProfileError);
            showToast('Failed to link to existing founder profile', 'error');
            return;
          }
        } else {
          referralCode = generateReferralCode(app.full_name);
          
          let attempts = 0;
          let insertError = null;
          while (attempts < 5) {
            const { data: founderProfile, error: profileError } = await supabaseClient
              .from('member_founder_profiles')
              .insert({
                application_id: id,
                user_id: app.user_id || null,
                full_name: app.full_name,
                email: normalizedEmail,
                phone: app.phone,
                location: app.location,
                referral_code: referralCode,
                status: 'active'
              })
              .select()
              .single();

            if (!profileError) {
              founderProfileId = founderProfile.id;
              break;
            }
            
            if (profileError.code === '23505' && profileError.message.includes('referral_code')) {
              referralCode = generateReferralCode(app.full_name);
              attempts++;
              console.log('Referral code collision, retrying with:', referralCode);
              continue;
            }
            
            insertError = profileError;
            break;
          }

          if (insertError) {
            if (insertError.code === '23505') {
              showToast('A founder profile already exists for this email address', 'error');
            } else if (insertError.code === '42P01') {
              showToast('Founder profiles table not set up. Please run the commission system migration in Supabase.', 'error');
            } else {
              showToast('Failed to create founder profile: ' + insertError.message, 'error');
            }
            console.error('Founder profile error:', insertError);
            return;
          }
        }

        const { error } = await supabaseClient
          .from('member_founder_applications')
          .update({ 
            status: 'approved',
            approved_at: new Date().toISOString(),
            approved_by: currentUser.id,
            referral_code: referralCode
          })
          .eq('id', id);

        if (error) {
          showToast('Failed to update application status', 'error');
          console.error('Approval error:', error);
          return;
        }

        showToast(`${app.full_name} approved! Referral code: ${referralCode}`, 'success');
        
        try {
          const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
          const emailResponse = await fetch(`${apiBase}/api/email/founder-approved`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: app.email,
              name: app.full_name,
              referralCode: referralCode
            })
          });
          
          const emailResult = await emailResponse.json();
          if (emailResult.success) {
            console.log('Founder approved email sent successfully');
          } else {
            console.warn('Failed to send founder approved email:', emailResult.error || emailResult.reason);
          }
        } catch (emailErr) {
          console.warn('Error sending founder approved email:', emailErr);
        }
        
        await loadMemberFounderApplications();
        await loadFounderPayouts();
      } catch (err) {
        console.error('approveMemberFounder error:', err);
        showToast('Error approving application', 'error');
      }
    }

    async function rejectMemberFounder(id) {
      const app = memberFounderApplications.find(a => a.id === id);
      if (!app) return;

      const reason = prompt('Reason for rejection (optional):');
      if (reason === null) return;

      try {
        const { error } = await supabaseClient
          .from('member_founder_applications')
          .update({ 
            status: 'rejected',
            rejected_at: new Date().toISOString(),
            rejected_by: currentUser.id,
            rejection_reason: reason || null
          })
          .eq('id', id);

        if (error) {
          showToast('Failed to reject application', 'error');
          console.error('Rejection error:', error);
          return;
        }

        showToast(`Application from ${app.full_name} rejected`, 'success');
        await loadMemberFounderApplications();
      } catch (err) {
        console.error('rejectMemberFounder error:', err);
        showToast('Error rejecting application', 'error');
      }
    }

    async function resendFounderWelcomeEmail(id) {
      const app = memberFounderApplications.find(a => a.id === id);
      if (!app) {
        showToast('Application not found', 'error');
        return;
      }

      const normalizedStatus = (app.status || '').toLowerCase().trim();
      if (!['approved', 'active'].includes(normalizedStatus)) {
        showToast('Can only resend email to approved founders', 'error');
        return;
      }

      const normalizedEmail = (app.email || '').trim().toLowerCase();
      const { data: founderProfile, error: profileError } = await supabaseClient
        .from('member_founder_profiles')
        .select('referral_code')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      if (profileError || !founderProfile || !founderProfile.referral_code) {
        showToast('Could not find referral code for this founder', 'error');
        console.error('Profile lookup error:', profileError);
        return;
      }

      if (!confirm(`Resend welcome email to ${app.full_name} (${app.email})?`)) {
        return;
      }

      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/email/founder-approved`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: app.email,
            name: app.full_name,
            referralCode: founderProfile.referral_code
          })
        });
        
        const result = await response.json();
        if (result.success) {
          showToast(`Welcome email sent to ${app.full_name}!`, 'success');
        } else {
          showToast('Failed to send email: ' + (result.error || 'Unknown error'), 'error');
        }
      } catch (err) {
        console.error('Error resending welcome email:', err);
        showToast('Error sending email', 'error');
      }
    }

    // Setup member founder applications tabs
    document.getElementById('mf-tabs')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab')) {
        document.querySelectorAll('#mf-tabs .tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentMFFilter = e.target.dataset.filter;
        renderMemberFounderApplications();
      }
    });

    // ========== COMMISSION PAYOUTS ==========
    let founderProfiles = [];
    let founderPayouts = [];
    let currentPayoutTab = 'founders';

    async function loadFounderPayouts() {
      try {
        const { data: profiles, error: profilesError } = await supabaseClient
          .from('member_founder_profiles')
          .select('*')
          .order('created_at', { ascending: false });

        if (profilesError) {
          console.error('Error loading founder profiles:', profilesError);
          founderProfiles = [];
        } else {
          founderProfiles = profiles || [];
        }

        const { data: payouts, error: payoutsError } = await supabaseClient
          .from('founder_payouts')
          .select('*, founder:founder_id(full_name, email, referral_code)')
          .order('created_at', { ascending: false });

        if (payoutsError) {
          console.error('Error loading founder payouts:', payoutsError);
          founderPayouts = [];
        } else {
          founderPayouts = payouts || [];
        }

        updatePayoutStats();
        renderPayoutContent();
      } catch (err) {
        console.error('loadFounderPayouts error:', err);
      }
    }

    const PAYOUT_THRESHOLD = 10;

    function updatePayoutStats() {
      const activeFounders = founderProfiles.filter(f => f.status === 'active').length;
      const totalReferrals = founderProfiles.reduce((sum, f) => sum + (f.total_provider_referrals || 0), 0);
      const pendingBalance = founderProfiles.reduce((sum, f) => sum + parseFloat(f.pending_balance || 0), 0);
      const totalPaid = founderProfiles.reduce((sum, f) => sum + parseFloat(f.total_commissions_paid || 0), 0);
      
      const eligibleFounders = founderProfiles.filter(f => 
        f.status === 'active' && 
        parseFloat(f.pending_balance || 0) >= PAYOUT_THRESHOLD &&
        f.stripe_connect_account_id
      );
      const eligibleCount = eligibleFounders.length;
      const eligibleTotal = eligibleFounders.reduce((sum, f) => sum + parseFloat(f.pending_balance || 0), 0);
      const pendingPayoutsCount = eligibleCount;

      document.getElementById('total-founders').textContent = activeFounders;
      document.getElementById('total-referrals').textContent = totalReferrals;
      document.getElementById('pending-commissions').textContent = '$' + pendingBalance.toFixed(2);
      document.getElementById('total-paid').textContent = '$' + totalPaid.toFixed(2);
      document.getElementById('payout-count').textContent = pendingPayoutsCount;
      document.getElementById('payout-count').style.display = pendingPayoutsCount > 0 ? 'inline' : 'none';
      
      const bulkBar = document.getElementById('bulk-payout-bar');
      if (bulkBar) {
        if (eligibleCount > 0) {
          bulkBar.style.display = 'block';
          document.getElementById('eligible-founders-count').textContent = eligibleCount;
          document.getElementById('eligible-total-amount').textContent = '$' + eligibleTotal.toFixed(2);
        } else {
          bulkBar.style.display = 'none';
        }
      }
    }

    function renderPayoutContent() {
      const tbody = document.getElementById('payout-table-body');
      const header = document.getElementById('payout-table-header');

      if (currentPayoutTab === 'founders') {
        header.innerHTML = `
          <th>Founder</th>
          <th>Referral Code</th>
          <th>Commission Rate</th>
          <th>Provider Referrals</th>
          <th>Pending Balance</th>
          <th>Total Earned</th>
          <th>Stripe Connect</th>
          <th>Status</th>
          <th>Action</th>
        `;

        if (!founderProfiles.length) {
          tbody.innerHTML = `<tr><td colspan="9" class="empty-state">No member founders yet</td></tr>`;
          return;
        }

        tbody.innerHTML = founderProfiles.map(f => {
          const hasStripeConnect = f.stripe_connect_account_id && f.payout_details?.transfers_enabled;
          const stripePending = f.stripe_connect_account_id && !f.payout_details?.transfers_enabled;
          const stripeStatus = hasStripeConnect ? 
            '<span class="status-badge approved" title="Ready for payouts">' + mccIcon('credit-card', 16) + ' Connected</span>' : 
            stripePending ? 
            '<span class="status-badge orange" title="Onboarding incomplete">' + mccIcon('clock', 16) + ' Pending</span>' : 
            '<span class="status-badge" style="background:var(--bg-input);color:var(--text-muted);">Not Setup</span>';
          const commissionRate = parseFloat(f.commission_rate || 0.50) * 100;
          const pendingBal = parseFloat(f.pending_balance || 0);
          const isEligible = f.status === 'active' && pendingBal >= PAYOUT_THRESHOLD && f.stripe_connect_account_id;
          const eligibilityBadge = isEligible ? 
            '<span class="status-badge approved" style="margin-left:6px;font-size:0.7rem;" title="Ready for bulk payout">' + mccIcon('check', 16) + ' Eligible</span>' : 
            (pendingBal >= PAYOUT_THRESHOLD && !f.stripe_connect_account_id) ?
            '<span class="status-badge orange" style="margin-left:6px;font-size:0.7rem;" title="Needs Stripe Connect setup">' + mccIcon('alert-triangle', 16) + ' No Stripe</span>' : '';
          return `
          <tr${isEligible ? ' style="background:var(--accent-green-soft);"' : ''}>
            <td>
              <div><strong>${f.full_name}</strong>${eligibilityBadge}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${f.email}</div>
            </td>
            <td><code style="background:var(--accent-gold-soft);color:var(--accent-gold);padding:4px 8px;border-radius:4px;font-weight:600;">${f.referral_code}</code></td>
            <td>
              <span style="font-weight:600;color:var(--accent-gold);">${commissionRate.toFixed(0)}%</span>
              <button class="btn btn-sm" style="margin-left:6px;padding:2px 8px;font-size:0.75rem;" onclick="editFounderCommission('${f.id}', '${f.full_name}', ${commissionRate})">Edit</button>
            </td>
            <td>${f.total_provider_referrals || 0}</td>
            <td style="font-weight:600;color:${pendingBal >= PAYOUT_THRESHOLD ? 'var(--accent-green)' : 'var(--text-primary)'};">$${pendingBal.toFixed(2)}${pendingBal >= PAYOUT_THRESHOLD ? ' ' + mccIcon('check', 16) : ''}</td>
            <td>$${parseFloat(f.total_commissions_earned || 0).toFixed(2)}</td>
            <td>${stripeStatus}</td>
            <td><span class="status-badge ${f.status === 'active' ? 'approved' : f.status}">${f.status}</span></td>
            <td>
              <div style="display:flex;gap:4px;flex-wrap:wrap;">
                <button class="btn btn-secondary btn-sm" onclick="viewFounderDetails('${f.id}')">View</button>
                ${pendingBal >= PAYOUT_THRESHOLD ? `<button class="btn btn-success btn-sm" onclick="createPayout('${f.id}')">Pay</button>` : ''}
              </div>
            </td>
          </tr>
        `}).join('');
      } else if (currentPayoutTab === 'pending-payouts') {
        header.innerHTML = `
          <th>Founder</th>
          <th>Period</th>
          <th>Amount</th>
          <th>Method</th>
          <th>Type</th>
          <th>Created</th>
          <th>Status</th>
          <th>Action</th>
        `;

        const pendingPayouts = founderPayouts.filter(p => p.status === 'pending' || p.status === 'processing');
        
        if (!pendingPayouts.length) {
          tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No pending payouts</td></tr>`;
          return;
        }

        tbody.innerHTML = pendingPayouts.map(p => `
          <tr>
            <td>
              <div><strong>${p.founder?.full_name || 'Unknown'}</strong></div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${p.founder?.email || ''}</div>
            </td>
            <td>${p.payout_period}</td>
            <td style="font-weight:600;color:var(--accent-green);">$${parseFloat(p.amount).toFixed(2)}</td>
            <td>${p.payout_method}</td>
            <td>
              <select id="payout-type-${p.id}" style="padding:4px 8px;border-radius:4px;border:1px solid var(--border-subtle);background:var(--bg-input);color:var(--text-primary);font-size:0.85rem;">
                <option value="weekly" selected>${mccIcon('calendar', 16)} Weekly (FREE)</option>
                <option value="instant">${mccIcon('zap', 16)} Instant (1% fee)</option>
              </select>
            </td>
            <td>${new Date(p.created_at).toLocaleDateString()}</td>
            <td><span class="status-badge ${p.status === 'processing' ? 'blue' : 'orange'}">${p.status}</span></td>
            <td>
              <div style="display:flex;gap:4px;flex-wrap:wrap;">
                ${p.payout_method === 'stripe_connect' ? `<button class="btn btn-primary btn-sm" onclick="processStripePayout('${p.id}')">${mccIcon('credit-card', 16)} Process</button>` : `<button class="btn btn-success btn-sm" onclick="completePayout('${p.id}')">Mark Complete</button>`}
                <button class="btn btn-danger btn-sm" onclick="cancelPayout('${p.id}')">Cancel</button>
              </div>
            </td>
          </tr>
        `).join('');
      } else if (currentPayoutTab === 'completed-payouts') {
        header.innerHTML = `
          <th>Founder</th>
          <th>Period</th>
          <th>Gross</th>
          <th>Fee</th>
          <th>Net</th>
          <th>Type</th>
          <th>Paid On</th>
          <th>Status</th>
        `;

        const completedPayouts = founderPayouts.filter(p => p.status === 'completed');
        
        if (!completedPayouts.length) {
          tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No completed payouts yet</td></tr>`;
          return;
        }

        tbody.innerHTML = completedPayouts.map(p => {
          const grossAmount = parseFloat(p.amount || 0);
          const feeAmount = parseFloat(p.fee_amount || 0);
          const netAmount = parseFloat(p.net_amount || grossAmount);
          const payoutType = p.payout_type || 'instant';
          
          return `
            <tr>
              <td>
                <div><strong>${p.founder?.full_name || 'Unknown'}</strong></div>
                <div style="font-size:0.8rem;color:var(--text-muted);">${p.founder?.email || ''}</div>
              </td>
              <td>${p.payout_period}</td>
              <td>$${grossAmount.toFixed(2)}</td>
              <td style="color:${feeAmount > 0 ? 'var(--accent-orange)' : 'var(--accent-green)'};">${feeAmount > 0 ? '-$' + feeAmount.toFixed(2) : 'FREE'}</td>
              <td style="font-weight:600;color:var(--accent-green);">$${netAmount.toFixed(2)}</td>
              <td><span class="status-badge ${payoutType === 'weekly' ? 'blue' : 'orange'}">${payoutType === 'weekly' ? mccIcon('calendar', 16) + ' Weekly' : mccIcon('zap', 16) + ' Instant'}</span></td>
              <td>${p.processed_at ? new Date(p.processed_at).toLocaleDateString() : 'N/A'}</td>
              <td><span class="status-badge approved">completed</span></td>
            </tr>
          `;
        }).join('');
      }
    }

    // Founder Commission Rate Management
    async function editFounderCommission(founderId, founderName, currentRate) {
      document.getElementById('commission-founder-id').value = founderId;
      document.getElementById('commission-founder-name').textContent = founderName;
      document.getElementById('commission-rate-input').value = Math.round(currentRate);
      document.getElementById('founder-commission-modal').style.display = 'flex';
      
      const historyContainer = document.getElementById('commission-history-container');
      historyContainer.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Loading history...</p>';
      
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/founders/${founderId}/commission-history`, {
          headers: {
            'Authorization': `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`
          }
        });
        
        if (!response.ok) throw new Error('Failed to fetch history');
        
        const { history } = await response.json();
        
        if (!history || history.length === 0) {
          historyContainer.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No rate changes recorded yet.</p>';
        } else {
          historyContainer.innerHTML = `
            <p style="font-weight:600;margin-bottom:8px;font-size:0.85rem;color:var(--text-secondary);">Recent Changes</p>
            ${history.map(h => {
              const date = new Date(h.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              return `<p style="color:var(--text-muted);font-size:0.8rem;margin-bottom:4px;">Changed from ${Math.round(h.old_rate * 100)}% to ${Math.round(h.new_rate * 100)}% by ${escapeHtml(h.admin_email)} on ${date}</p>`;
            }).join('')}
          `;
        }
      } catch (err) {
        console.error('Error loading commission history:', err);
        historyContainer.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Could not load history.</p>';
      }
    }

    function closeCommissionModal() {
      document.getElementById('founder-commission-modal').style.display = 'none';
    }

    async function saveFounderCommission() {
      const founderId = document.getElementById('commission-founder-id').value;
      const ratePercent = parseInt(document.getElementById('commission-rate-input').value);
      
      if (isNaN(ratePercent) || ratePercent < 0 || ratePercent > 100) {
        showNotification('Please enter a valid rate between 0 and 100', 'error');
        return;
      }

      const commissionRate = ratePercent / 100; // Convert to decimal (e.g., 50% -> 0.50)
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      
      try {
        const response = await fetch(`${apiBase}/api/admin/founders/${founderId}/commission`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`
          },
          body: JSON.stringify({ commission_rate: commissionRate })
        });

        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'Failed to update commission rate');
        }

        showNotification(`Commission rate updated to ${ratePercent}%`, 'success');
        closeCommissionModal();
        await loadFounderPayouts();
      } catch (err) {
        console.error('Error updating commission rate:', err);
        showNotification(err.message || 'Failed to update commission rate', 'error');
      }
    }

    async function viewFounderDetails(founderId) {
      const founder = founderProfiles.find(f => f.id === founderId);
      if (!founder) return;

      const { data: referrals } = await supabaseClient
        .from('founder_referrals')
        .select('*, provider:provider_profile_id(full_name, business_name, email)')
        .eq('founder_id', founderId)
        .order('created_at', { ascending: false });

      const { data: commissions } = await supabaseClient
        .from('founder_commissions')
        .select('*')
        .eq('founder_id', founderId)
        .order('created_at', { ascending: false })
        .limit(20);

      const modalContent = `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('user', 24)} Founder Information</div>
          <div class="detail-grid">
            <span class="detail-label">Name:</span><span class="detail-value">${founder.full_name}</span>
            <span class="detail-label">Email:</span><span class="detail-value">${founder.email}</span>
            <span class="detail-label">Referral Code:</span><span class="detail-value"><code style="background:var(--accent-gold-soft);color:var(--accent-gold);padding:4px 8px;border-radius:4px;font-weight:600;">${founder.referral_code}</code></span>
            <span class="detail-label">Status:</span><span class="detail-value"><span class="status-badge ${founder.status === 'active' ? 'approved' : founder.status}">${founder.status}</span></span>
            <span class="detail-label">Joined:</span><span class="detail-value">${new Date(founder.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('dollar-sign', 24)} Commission Summary</div>
          <div class="stats-grid" style="margin-bottom:0;">
            <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);text-align:center;">
              <div style="font-size:1.4rem;font-weight:600;color:var(--accent-gold);">${founder.total_provider_referrals || 0}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);">Provider Referrals</div>
            </div>
            <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);text-align:center;">
              <div style="font-size:1.4rem;font-weight:600;color:var(--accent-green);">$${parseFloat(founder.pending_balance || 0).toFixed(2)}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);">Pending Balance</div>
            </div>
            <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);text-align:center;">
              <div style="font-size:1.4rem;font-weight:600;">$${parseFloat(founder.total_commissions_earned || 0).toFixed(2)}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);">Total Earned</div>
            </div>
            <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);text-align:center;">
              <div style="font-size:1.4rem;font-weight:600;">$${parseFloat(founder.total_commissions_paid || 0).toFixed(2)}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);">Total Paid</div>
            </div>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('link', 24)} Provider Referrals (${referrals?.length || 0})</div>
          ${referrals?.length ? `
            <div style="display:flex;flex-direction:column;gap:8px;max-height:200px;overflow-y:auto;">
              ${referrals.map(r => `
                <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-input);padding:12px;border-radius:var(--radius-md);">
                  <div>
                    <strong>${r.provider?.business_name || r.provider?.full_name || 'Unknown'}</strong>
                    <div style="font-size:0.8rem;color:var(--text-muted);">${r.provider?.email || ''}</div>
                  </div>
                  <span class="status-badge ${r.status}">${r.status}</span>
                </div>
              `).join('')}
            </div>
          ` : '<p style="color:var(--text-muted);">No provider referrals yet</p>'}
        </div>

        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('clipboard-list', 24)} Recent Commissions (${commissions?.length || 0})</div>
          ${commissions?.length ? `
            <div style="display:flex;flex-direction:column;gap:8px;max-height:200px;overflow-y:auto;">
              ${commissions.map(c => `
                <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-input);padding:12px;border-radius:var(--radius-md);">
                  <div>
                    <strong>$${parseFloat(c.commission_amount).toFixed(2)}</strong>
                    <span style="font-size:0.8rem;color:var(--text-muted);">(${c.commission_type === 'bid_pack' ? mccIcon('package', 16) + ' Bid Pack' : mccIcon('credit-card', 16) + ' Platform Fee'})</span>
                    <div style="font-size:0.8rem;color:var(--text-muted);">${new Date(c.created_at).toLocaleDateString()}</div>
                  </div>
                  <span class="status-badge ${c.status}">${c.status}</span>
                </div>
              `).join('')}
            </div>
          ` : '<p style="color:var(--text-muted);">No commissions recorded yet</p>'}
        </div>

        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('credit-card', 24)} Payout Settings</div>
          <div class="detail-grid">
            <span class="detail-label">Method:</span><span class="detail-value">${founder.payout_method || 'Not set'}</span>
            <span class="detail-label">Email:</span><span class="detail-value">${founder.payout_email || 'Not set'}</span>
          </div>
        </div>
      `;

      document.getElementById('application-modal-body').innerHTML = modalContent;
      document.querySelector('#application-modal .modal-footer').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal('application-modal')">Close</button>
        ${parseFloat(founder.pending_balance || 0) >= 25 ? `<button class="btn btn-success" onclick="createPayout('${founder.id}'); closeModal('application-modal');">Create Payout</button>` : ''}
      `;
      document.getElementById('application-modal').classList.add('active');
    }

    async function createPayout(founderId) {
      const founder = founderProfiles.find(f => f.id === founderId);
      if (!founder) return;

      const amount = parseFloat(founder.pending_balance || 0);
      if (amount < 25) {
        showToast('Minimum payout amount is $25', 'error');
        return;
      }

      const currentMonth = new Date().toISOString().slice(0, 7);
      
      const hasStripeConnect = founder.stripe_connect_account_id && founder.payout_details?.transfers_enabled;
      const payoutMethod = hasStripeConnect ? 'stripe_connect' : (founder.payout_method || 'paypal');
      const methodDisplay = hasStripeConnect ? 'Stripe Connect (automatic transfer)' : (founder.payout_method || 'Not set');
      
      if (!confirm(`Create payout of $${amount.toFixed(2)} for ${founder.full_name}?\n\nPayout method: ${methodDisplay}`)) return;

      try {
        const { error: payoutError } = await supabaseClient
          .from('founder_payouts')
          .insert({
            founder_id: founderId,
            payout_period: currentMonth,
            amount: amount,
            payout_method: payoutMethod,
            payout_details: hasStripeConnect ? { stripe_account_id: founder.stripe_connect_account_id } : { email: founder.payout_email },
            status: 'pending'
          });

        if (payoutError) {
          showToast('Failed to create payout: ' + payoutError.message, 'error');
          return;
        }

        const { error: updateError } = await supabaseClient
          .from('member_founder_profiles')
          .update({ pending_balance: 0, updated_at: new Date().toISOString() })
          .eq('id', founderId);

        if (updateError) {
          console.error('Failed to reset pending balance:', updateError);
        }

        showToast(`Payout of $${amount.toFixed(2)} created for ${founder.full_name}`, 'success');
        await loadFounderPayouts();
      } catch (err) {
        console.error('createPayout error:', err);
        showToast('Error creating payout', 'error');
      }
    }

    async function completePayout(payoutId) {
      const notes = prompt('Add payment notes (transaction ID, etc):');
      if (notes === null) return;

      try {
        const { error } = await supabaseClient
          .from('founder_payouts')
          .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
            processed_by: currentUser.id,
            notes: notes
          })
          .eq('id', payoutId);

        if (error) {
          showToast('Failed to complete payout', 'error');
          return;
        }

        const payout = founderPayouts.find(p => p.id === payoutId);
        if (payout) {
          await supabaseClient
            .from('member_founder_profiles')
            .update({
              total_commissions_paid: supabaseClient.raw('total_commissions_paid + ?', [payout.amount]),
              updated_at: new Date().toISOString()
            })
            .eq('id', payout.founder_id);
        }

        showToast('Payout marked as completed', 'success');
        await loadFounderPayouts();
      } catch (err) {
        console.error('completePayout error:', err);
        showToast('Error completing payout', 'error');
      }
    }

    async function cancelPayout(payoutId) {
      if (!confirm('Cancel this payout? The pending balance will be restored to the founder.')) return;

      try {
        const payout = founderPayouts.find(p => p.id === payoutId);
        
        const { error } = await supabaseClient
          .from('founder_payouts')
          .update({ status: 'failed', notes: 'Cancelled by admin' })
          .eq('id', payoutId);

        if (error) {
          showToast('Failed to cancel payout', 'error');
          return;
        }

        if (payout) {
          const founder = founderProfiles.find(f => f.id === payout.founder_id);
          if (founder) {
            await supabaseClient
              .from('member_founder_profiles')
              .update({
                pending_balance: parseFloat(founder.pending_balance || 0) + parseFloat(payout.amount),
                updated_at: new Date().toISOString()
              })
              .eq('id', payout.founder_id);
          }
        }

        showToast('Payout cancelled', 'success');
        await loadFounderPayouts();
      } catch (err) {
        console.error('cancelPayout error:', err);
        showToast('Error cancelling payout', 'error');
      }
    }

    async function processStripePayout(payoutId) {
      const payout = founderPayouts.find(p => p.id === payoutId);
      if (!payout) {
        showToast('Payout not found', 'error');
        return;
      }

      const payoutTypeSelect = document.getElementById(`payout-type-${payoutId}`);
      const payoutType = payoutTypeSelect?.value || 'weekly';
      const feeText = payoutType === 'instant' ? ' (1% fee will be deducted)' : ' (no fee)';

      if (!confirm(`Process Stripe transfer of $${parseFloat(payout.amount).toFixed(2)} to ${payout.founder?.full_name || 'founder'}?${feeText}\n\nThis will initiate a real payment.`)) {
        return;
      }

      const adminPassword = prompt('Enter admin password to authorize payout:');
      if (!adminPassword) return;

      try {
        showToast('Processing Stripe transfer...', 'info');
        
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/process-founder-payout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payout_id: payoutId,
            admin_password: adminPassword,
            payout_type: payoutType
          })
        });

        const result = await response.json();
        
        if (!response.ok) {
          showToast(result.error || 'Failed to process payout', 'error');
          return;
        }

        showToast(`Stripe transfer successful! Transfer ID: ${result.transfer_id}`, 'success');
        await loadFounderPayouts();
      } catch (err) {
        console.error('processStripePayout error:', err);
        showToast('Error processing Stripe payout', 'error');
      }
    }

    async function processBulkPayouts() {
      const eligibleFounders = founderProfiles.filter(f => 
        f.status === 'active' && 
        parseFloat(f.pending_balance || 0) >= PAYOUT_THRESHOLD &&
        f.stripe_connect_account_id
      );
      
      if (eligibleFounders.length === 0) {
        showToast('No eligible founders for payout', 'info');
        return;
      }

      const totalAmount = eligibleFounders.reduce((sum, f) => sum + parseFloat(f.pending_balance || 0), 0);
      
      const payoutType = await new Promise(resolve => {
        const choice = confirm(
          `Process bulk payouts for ${eligibleFounders.length} founder${eligibleFounders.length > 1 ? 's' : ''}?\n\n` +
          `Total amount: $${totalAmount.toFixed(2)}\n\n` +
          `Click OK for WEEKLY payout (FREE, no fees)\n` +
          `Click Cancel to abort, then use individual payouts for instant transfers.`
        );
        resolve(choice ? 'weekly' : null);
      });
      
      if (!payoutType) return;

      const adminPassword = prompt('Enter admin password to authorize bulk payout:');
      if (!adminPassword) return;

      const btn = document.getElementById('bulk-payout-btn');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = mccIcon('clock', 16) + ' Processing...';
      }

      try {
        showToast(`Processing ${eligibleFounders.length} payouts...`, 'info');
        
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/process-bulk-payouts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            admin_password: adminPassword,
            threshold: PAYOUT_THRESHOLD,
            payout_type: payoutType
          })
        });

        const result = await response.json();
        
        if (!response.ok) {
          showToast(result.error || 'Failed to process bulk payouts', 'error');
          return;
        }

        const { summary } = result;
        
        if (summary.succeeded > 0 && summary.failed === 0) {
          showToast(`${mccIcon('check-circle', 16)} All ${summary.succeeded} payouts processed successfully! Total: $${summary.total_amount.toFixed(2)}`, 'success');
        } else if (summary.succeeded > 0 && summary.failed > 0) {
          showToast(`${mccIcon('alert-triangle', 16)} ${summary.succeeded} succeeded, ${summary.failed} failed. Check details below.`, 'warning');
        } else if (summary.failed > 0) {
          showToast(`${mccIcon('x', 16)} All ${summary.failed} payouts failed. Check details below.`, 'error');
        } else {
          showToast('No payouts were processed.', 'info');
        }

        if (result.results && result.results.length > 0) {
          showBulkPayoutResults(result.results);
        }

        await loadFounderPayouts();
      } catch (err) {
        console.error('processBulkPayouts error:', err);
        showToast('Error processing bulk payouts', 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = mccIcon('credit-card', 16) + ' Process All Pending Payouts';
        }
      }
    }

    function showBulkPayoutResults(results) {
      const succeeded = results.filter(r => r.status === 'success');
      const failed = results.filter(r => r.status === 'failed');
      
      let message = `<div style="max-height:400px;overflow-y:auto;">`;
      
      if (succeeded.length > 0) {
        message += `<h4 style="color:var(--accent-green);margin-bottom:8px;">${mccIcon('check-circle', 16)} Succeeded (${succeeded.length})</h4>`;
        message += `<table style="width:100%;font-size:0.85rem;margin-bottom:16px;">`;
        message += `<tr style="background:var(--bg-elevated);"><th style="padding:6px;text-align:left;">Founder</th><th style="padding:6px;text-align:right;">Amount</th><th style="padding:6px;text-align:left;">Transfer ID</th></tr>`;
        succeeded.forEach(r => {
          message += `<tr><td style="padding:6px;">${escapeHtml(r.founder_name)}</td><td style="padding:6px;text-align:right;">$${r.amount.toFixed(2)}</td><td style="padding:6px;font-family:monospace;font-size:0.75rem;">${r.stripe_transfer_id || '-'}</td></tr>`;
        });
        message += `</table>`;
      }
      
      if (failed.length > 0) {
        message += `<h4 style="color:var(--accent-red);margin-bottom:8px;">${mccIcon('x', 16)} Failed (${failed.length})</h4>`;
        message += `<table style="width:100%;font-size:0.85rem;">`;
        message += `<tr style="background:var(--bg-elevated);"><th style="padding:6px;text-align:left;">Founder</th><th style="padding:6px;text-align:right;">Amount</th><th style="padding:6px;text-align:left;">Error</th></tr>`;
        failed.forEach(r => {
          message += `<tr><td style="padding:6px;">${escapeHtml(r.founder_name)}</td><td style="padding:6px;text-align:right;">$${r.amount.toFixed(2)}</td><td style="padding:6px;color:var(--accent-red);">${escapeHtml(r.error || 'Unknown error')}</td></tr>`;
        });
        message += `</table>`;
      }
      
      message += `</div>`;
      
      showModal('Bulk Payout Results', message, [
        { text: 'Close', className: 'btn btn-secondary', onclick: 'closeModal()' }
      ]);
    }

    document.getElementById('payout-tabs')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab')) {
        document.querySelectorAll('#payout-tabs .tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentPayoutTab = e.target.dataset.filter;
        
        const payoutContent = document.getElementById('payout-content');
        const settingsContent = document.getElementById('payout-settings-content');
        const milestonesContent = document.getElementById('milestones-content');
        const bonusReserveContent = document.getElementById('bonus-reserve-content');
        
        payoutContent.style.display = 'none';
        settingsContent.style.display = 'none';
        if (milestonesContent) milestonesContent.style.display = 'none';
        if (bonusReserveContent) bonusReserveContent.style.display = 'none';
        
        if (currentPayoutTab === 'payout-settings') {
          settingsContent.style.display = 'block';
          loadPayoutSettings();
        } else if (currentPayoutTab === 'milestones') {
          if (milestonesContent) milestonesContent.style.display = 'block';
          loadMilestonesData();
        } else if (currentPayoutTab === 'bonus-reserve') {
          if (bonusReserveContent) bonusReserveContent.style.display = 'block';
          loadBonusReserveData();
        } else {
          payoutContent.style.display = 'block';
          renderPayoutContent();
        }
      }
    });

    let payoutSettings = null;

    async function loadPayoutSettings() {
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/payout-settings`, {
          headers: {
            'Authorization': `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`
          }
        });
        
        if (!response.ok) throw new Error('Failed to fetch settings');
        
        const data = await response.json();
        payoutSettings = data.settings;
        
        document.getElementById('setting-min-payout-threshold').value = payoutSettings.min_payout_threshold || 10.00;
        document.getElementById('setting-instant-fee-percent').value = payoutSettings.instant_payout_fee_percent || 1.00;
        document.getElementById('setting-instant-fee-min').value = payoutSettings.instant_payout_fee_min || 0.50;
        document.getElementById('setting-instant-fee-max').value = payoutSettings.instant_payout_fee_max || 10.00;
        document.getElementById('setting-weekly-fee').value = payoutSettings.weekly_payout_fee || 0.00;
      } catch (err) {
        console.error('Error loading payout settings:', err);
        showNotification('Failed to load payout settings', 'error');
      }
    }

    async function savePayoutSettings() {
      const settings = {
        min_payout_threshold: parseFloat(document.getElementById('setting-min-payout-threshold').value) || 10.00,
        instant_payout_fee_percent: parseFloat(document.getElementById('setting-instant-fee-percent').value) || 1.00,
        instant_payout_fee_min: parseFloat(document.getElementById('setting-instant-fee-min').value) || 0.50,
        instant_payout_fee_max: parseFloat(document.getElementById('setting-instant-fee-max').value) || 10.00,
        weekly_payout_fee: parseFloat(document.getElementById('setting-weekly-fee').value) || 0.00
      };

      if (settings.min_payout_threshold < 1) {
        showNotification('Minimum payout threshold must be at least $1', 'error');
        return;
      }

      if (settings.instant_payout_fee_percent < 0 || settings.instant_payout_fee_percent > 10) {
        showNotification('Instant fee percentage must be between 0% and 10%', 'error');
        return;
      }

      if (settings.instant_payout_fee_min < 0 || settings.instant_payout_fee_max < 0) {
        showNotification('Fee amounts cannot be negative', 'error');
        return;
      }

      if (settings.instant_payout_fee_min > settings.instant_payout_fee_max) {
        showNotification('Minimum fee cannot be greater than maximum fee', 'error');
        return;
      }

      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/payout-settings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`
          },
          body: JSON.stringify({ 
            settings,
            admin_password: currentAdminPassword 
          })
        });

        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'Failed to save settings');
        }

        payoutSettings = settings;
        showNotification('Payout settings saved successfully', 'success');
      } catch (err) {
        console.error('Error saving payout settings:', err);
        showNotification(err.message || 'Failed to save payout settings', 'error');
      }
    }

    // ========== MILESTONES AND BONUS RESERVE ==========
    let milestonesData = null;
    let bonusReserveData = null;

    async function loadMilestonesData() {
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/milestones`, {
          headers: {
            'Authorization': `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`
          }
        });
        
        if (!response.ok) throw new Error('Failed to fetch milestones');
        
        milestonesData = await response.json();
        renderMilestonesContent();
      } catch (err) {
        console.error('Error loading milestones:', err);
        showToast('Failed to load milestones data', 'error');
      }
    }

    function renderMilestonesContent() {
      if (!milestonesData) return;
      
      const revenue = milestonesData.total_bid_pack_revenue || 0;
      const milestones = milestonesData.milestones || [];
      const achievedCount = milestones.filter(m => m.is_achieved).length;
      const pendingCount = milestones.filter(m => !m.is_achieved).length;
      
      document.getElementById('total-platform-revenue').textContent = '$' + revenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
      document.getElementById('achieved-milestones-count').textContent = achievedCount;
      document.getElementById('pending-milestones-count').textContent = pendingCount;
      document.getElementById('anniversary-countdown').textContent = milestonesData.days_until_anniversary || '-';
      
      const nextMilestone = milestonesData.next_milestone;
      const progressPercent = milestonesData.progress_percent || 0;
      
      if (nextMilestone) {
        const remaining = nextMilestone.threshold_amount - revenue;
        document.getElementById('next-milestone-info').innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <strong style="color:var(--accent-gold);">$${nextMilestone.threshold_amount.toLocaleString()}</strong>
              <span style="color:var(--text-secondary);"> - ${nextMilestone.description}</span>
            </div>
            <div style="font-weight:600;">
              <span style="color:var(--accent-green);">$${remaining.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              <span style="color:var(--text-muted);"> remaining</span>
            </div>
          </div>
        `;
      } else {
        document.getElementById('next-milestone-info').innerHTML = `
          <span style="color:var(--accent-green);font-weight:600;">${mccIcon('party-popper', 16)} All milestones achieved!</span>
        `;
      }
      
      document.getElementById('milestone-progress-bar').style.width = progressPercent + '%';
      document.getElementById('milestone-progress-text').textContent = progressPercent.toFixed(1) + '%';
      
      const partners = milestonesData.founding_partners || [];
      const chrisPartner = partners.find(p => p.partner_name?.toLowerCase().includes('chris agrapidis'));
      
      if (chrisPartner) {
        const achievedBonuses = milestones.filter(m => m.is_achieved && m.is_paid);
        const pendingBonuses = milestones.filter(m => m.is_achieved && !m.is_paid);
        const achievedTotal = achievedBonuses.reduce((sum, m) => sum + parseFloat(m.bonus_amount || 0), 0);
        const pendingTotal = pendingBonuses.reduce((sum, m) => sum + parseFloat(m.bonus_amount || 0), 0);
        
        document.getElementById('founding-partner-info').innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:16px;">
            <div style="padding:16px;background:var(--bg-input);border-radius:8px;">
              <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:4px;">Partner Name</div>
              <div style="font-weight:600;color:var(--text-primary);">${chrisPartner.partner_name}</div>
            </div>
            <div style="padding:16px;background:var(--bg-input);border-radius:8px;">
              <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:4px;">Commission Rate</div>
              <div style="font-weight:600;color:var(--accent-gold);">${(chrisPartner.commission_rate * 100).toFixed(0)}%</div>
            </div>
            <div style="padding:16px;background:var(--accent-green-soft);border-radius:8px;">
              <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:4px;">Bonuses Paid</div>
              <div style="font-weight:600;color:var(--accent-green);">$${achievedTotal.toLocaleString()}</div>
            </div>
            <div style="padding:16px;background:var(--accent-orange-soft);border-radius:8px;">
              <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:4px;">Bonuses Pending</div>
              <div style="font-weight:600;color:var(--accent-orange);">$${pendingTotal.toLocaleString()}</div>
            </div>
          </div>
          <div style="margin-top:12px;font-size:0.85rem;color:var(--text-secondary);">
            <span style="display:inline-block;margin-right:16px;">${mccIcon('calendar', 16)} Partnership Start: ${new Date(chrisPartner.partnership_start_date).toLocaleDateString()}</span>
            <span style="display:inline-block;margin-right:16px;">${mccIcon('calendar', 16)} Next Anniversary: January 23, ${new Date().getFullYear() + (new Date() > new Date(new Date().getFullYear(), 0, 23) ? 1 : 0)}</span>
            <span style="display:inline-block;">${mccIcon('sparkles', 16)} Status: <span class="status-badge approved">${chrisPartner.status}</span></span>
          </div>
        `;
      } else {
        document.getElementById('founding-partner-info').innerHTML = `<span style="color:var(--text-muted);">No founding partner record found</span>`;
      }
      
      const tbody = document.getElementById('milestones-table-body');
      if (!milestones.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No milestones configured</td></tr>`;
        return;
      }
      
      tbody.innerHTML = milestones.map(m => {
        const statusBadge = m.is_paid 
          ? '<span class="status-badge approved">' + mccIcon('check', 16) + ' Paid</span>'
          : m.is_achieved 
            ? '<span class="status-badge orange">' + mccIcon('clock', 16) + ' Achieved - Unpaid</span>'
            : '<span class="status-badge" style="background:var(--bg-input);color:var(--text-muted);">Pending</span>';
        
        const paidDate = m.achievement?.paid_at ? new Date(m.achievement.paid_at).toLocaleDateString() : '-';
        
        const canPay = m.is_achieved && !m.is_paid;
        const actionBtn = canPay 
          ? `<button class="btn btn-success btn-sm" onclick="payMilestone('${m.id}', '${m.description}', ${m.bonus_amount})">${mccIcon('credit-card', 16)} Pay $${m.bonus_amount.toLocaleString()}</button>`
          : m.is_paid
            ? `<span style="color:var(--text-muted);font-size:0.85rem;">Paid</span>`
            : `<span style="color:var(--text-muted);font-size:0.85rem;">-</span>`;
        
        return `
          <tr style="${m.is_achieved ? 'background:var(--accent-green-soft);' : ''}">
            <td style="font-weight:600;">$${parseFloat(m.threshold_amount).toLocaleString()}</td>
            <td style="font-weight:600;color:var(--accent-gold);">$${parseFloat(m.bonus_amount).toLocaleString()}</td>
            <td>${m.description}</td>
            <td>${statusBadge}</td>
            <td>${paidDate}</td>
            <td>${actionBtn}</td>
          </tr>
        `;
      }).join('');
    }

    async function payMilestone(milestoneId, description, amount) {
      const confirmed = await showConfirmDialog(
        'Pay Milestone Bonus',
        `Are you sure you want to mark this milestone as paid?<br><br>
        <strong>${description}</strong><br>
        Amount: <span style="color:var(--accent-gold);font-weight:600;">$${amount.toLocaleString()}</span><br><br>
        <small style="color:var(--text-muted);">This will deduct from the bonus reserve balance.</small>`
      );
      
      if (!confirmed) return;
      
      const stripeTransferId = prompt('Enter Stripe Transfer ID (optional):');
      const notes = prompt('Add notes (optional):');
      
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/milestones/${milestoneId}/pay`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`
          },
          body: JSON.stringify({
            stripe_transfer_id: stripeTransferId || null,
            notes: notes || null
          })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'Failed to process payment');
        }
        
        showToast(result.message || 'Milestone marked as paid!', 'success');
        loadMilestonesData();
      } catch (err) {
        console.error('Error paying milestone:', err);
        showToast(err.message || 'Failed to process milestone payment', 'error');
      }
    }

    async function loadBonusReserveData() {
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/bonus-reserve`, {
          headers: {
            'Authorization': `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`
          }
        });
        
        if (!response.ok) throw new Error('Failed to fetch bonus reserve');
        
        bonusReserveData = await response.json();
        renderBonusReserveContent();
      } catch (err) {
        console.error('Error loading bonus reserve:', err);
        showToast('Failed to load bonus reserve data', 'error');
      }
    }

    function renderBonusReserveContent() {
      if (!bonusReserveData) return;
      
      const currentBalance = bonusReserveData.current_balance || 0;
      const totalAccruals = bonusReserveData.total_accruals || 0;
      const totalPayouts = bonusReserveData.total_payouts || 0;
      const reserveRate = (bonusReserveData.reserve_rate || 0.15) * 100;
      const treasury = bonusReserveData.treasury || {};
      
      document.getElementById('reserve-balance').textContent = '$' + currentBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
      document.getElementById('total-accruals').textContent = '$' + totalAccruals.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
      document.getElementById('total-payouts-reserve').textContent = '$' + totalPayouts.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
      document.getElementById('reserve-rate').textContent = reserveRate.toFixed(0) + '%';
      
      // Render Treasury status
      const treasuryContainer = document.getElementById('treasury-status-container');
      if (treasuryContainer) {
        const statusBadge = treasury.status === 'active' 
          ? '<span class="status-badge approved">Active</span>'
          : treasury.status === 'pending_setup'
            ? '<span class="status-badge orange">Pending Setup</span>'
            : '<span class="status-badge rejected">Error</span>';
        
        const treasuryBalance = treasury.active ? '$' + (treasury.balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-';
        const pendingBalance = treasury.active && treasury.pendingBalance ? '$' + treasury.pendingBalance.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-';
        
        treasuryContainer.innerHTML = `
          <div class="stat-card" style="border-left:4px solid var(--accent-primary);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <h4 style="margin:0;color:var(--text-primary);">Stripe Treasury</h4>
              ${statusBadge}
            </div>
            ${treasury.active ? `
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                <div>
                  <div style="color:var(--text-muted);font-size:12px;margin-bottom:4px;">Available Balance</div>
                  <div style="font-size:24px;font-weight:700;color:var(--accent-green);">${treasuryBalance}</div>
                </div>
                <div>
                  <div style="color:var(--text-muted);font-size:12px;margin-bottom:4px;">Pending</div>
                  <div style="font-size:24px;font-weight:700;color:var(--text-secondary);">${pendingBalance}</div>
                </div>
              </div>
              <div style="margin-top:12px;font-size:11px;color:var(--text-muted);">Interest accrues automatically. FDIC insured up to $250K.</div>
            ` : `
              <div style="color:var(--text-secondary);font-size:14px;">
                ${treasury.message || 'Treasury approval pending. Reserve funds tracked in database until setup complete.'}
              </div>
              <div style="margin-top:12px;padding:10px;background:rgba(212,168,85,0.1);border-radius:8px;font-size:12px;">
                <strong style="color:var(--accent-primary);">Note:</strong> Once Treasury is active, 15% of bid pack revenue will be automatically transferred to earn interest.
              </div>
            `}
          </div>
        `;
      }
      
      const monthlyData = bonusReserveData.monthly_breakdown || [];
      const monthlyTbody = document.getElementById('monthly-reserve-body');
      
      if (!monthlyData.length) {
        monthlyTbody.innerHTML = `<tr><td colspan="4" class="empty-state">No monthly data available</td></tr>`;
      } else {
        monthlyTbody.innerHTML = monthlyData.map(m => `
          <tr>
            <td style="font-weight:600;">${m.month_year}</td>
            <td>$${parseFloat(m.bid_pack_revenue || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td style="color:var(--accent-green);">$${parseFloat(m.reserve_accrual || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td><span class="status-badge ${m.status === 'finalized' ? 'approved' : 'orange'}">${m.status || 'pending'}</span></td>
          </tr>
        `).join('');
      }
      
      const transactions = bonusReserveData.transactions || [];
      const txTbody = document.getElementById('reserve-transactions-body');
      
      if (!transactions.length) {
        txTbody.innerHTML = `<tr><td colspan="5" class="empty-state">No transactions yet</td></tr>`;
      } else {
        txTbody.innerHTML = transactions.map(t => {
          const typeColor = t.transaction_type === 'accrual' ? 'var(--accent-green)' 
            : t.transaction_type === 'payout' ? 'var(--accent-orange)' 
            : 'var(--accent-blue)';
          const amountPrefix = t.amount >= 0 ? '+' : '';
          
          return `
            <tr>
              <td>${new Date(t.created_at).toLocaleString()}</td>
              <td><span style="color:${typeColor};font-weight:600;text-transform:capitalize;">${t.transaction_type}</span></td>
              <td style="font-weight:600;color:${t.amount >= 0 ? 'var(--accent-green)' : 'var(--accent-orange)'};">${amountPrefix}$${parseFloat(t.amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
              <td>$${parseFloat(t.balance_after || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${t.notes || ''}">${t.notes || '-'}</td>
            </tr>
          `;
        }).join('');
      }
    }

    async function adjustBonusReserve() {
      const amountInput = document.getElementById('reserve-adjust-amount');
      const notesInput = document.getElementById('reserve-adjust-notes');
      
      const amount = parseFloat(amountInput.value);
      const notes = notesInput.value.trim();
      
      if (isNaN(amount) || amount === 0) {
        showToast('Please enter a valid non-zero amount', 'error');
        return;
      }
      
      if (!notes) {
        showToast('Notes are required for reserve adjustments', 'error');
        return;
      }
      
      const confirmed = await showConfirmDialog(
        'Adjust Bonus Reserve',
        `Are you sure you want to adjust the reserve balance?<br><br>
        Amount: <span style="font-weight:600;color:${amount >= 0 ? 'var(--accent-green)' : 'var(--accent-orange)'};">${amount >= 0 ? '+' : ''}$${amount.toFixed(2)}</span><br>
        Notes: ${notes}`
      );
      
      if (!confirmed) return;
      
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/bonus-reserve/adjust`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`
          },
          body: JSON.stringify({ amount, notes })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'Failed to adjust reserve');
        }
        
        showToast(result.message || 'Reserve adjusted successfully!', 'success');
        amountInput.value = '';
        notesInput.value = '';
        loadBonusReserveData();
      } catch (err) {
        console.error('Error adjusting reserve:', err);
        showToast(err.message || 'Failed to adjust reserve balance', 'error');
      }
    }

    // ========== VIOLATION REPORTS ==========
    let violationReports = [];
    let currentViolationFilter = 'pending';

    async function loadViolationReports() {
      try {
        const { data, error } = await supabaseClient
          .from('circumvention_reports')
          .select(`
            *,
            reporter:reporter_id(id, full_name, email),
            provider:provider_id(id, full_name, business_name, provider_alias, email),
            package:package_id(id, title)
          `)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error loading violation reports:', error);
          return;
        }

        violationReports = data || [];
        updateViolationStats();
        renderViolationReports();
      } catch (err) {
        console.error('loadViolationReports error:', err);
      }
    }

    function updateViolationStats() {
      const pending = violationReports.filter(r => r.status === 'pending').length;
      const investigating = violationReports.filter(r => r.status === 'investigating').length;
      const confirmed = violationReports.filter(r => r.status === 'confirmed').length;
      const dismissed = violationReports.filter(r => r.status === 'dismissed').length;

      document.getElementById('violations-pending').textContent = pending;
      document.getElementById('violations-investigating').textContent = investigating;
      document.getElementById('violations-confirmed').textContent = confirmed;
      document.getElementById('violations-dismissed').textContent = dismissed;
      document.getElementById('violation-count').textContent = pending;
      document.getElementById('violation-count').style.display = pending > 0 ? 'inline' : 'none';
    }

    function renderViolationReports() {
      const container = document.getElementById('violations-list');
      let filtered = violationReports;

      if (currentViolationFilter !== 'all') {
        filtered = violationReports.filter(r => r.status === currentViolationFilter);
      }

      if (!filtered.length) {
        container.innerHTML = `<div class="empty-state" style="padding:40px;"><div class="empty-state-icon">${mccIcon('flag', 40)}</div><p>No ${currentViolationFilter} reports</p></div>`;
        return;
      }

      container.innerHTML = filtered.map(report => {
        const reporterName = report.reporter?.full_name || report.reporter?.email || 'Unknown';
        const providerAlias = report.provider?.provider_alias || `Provider #${report.provider_id?.slice(0,4).toUpperCase()}`;
        const providerRealName = report.provider?.business_name || report.provider?.full_name || 'Unknown';
        const packageTitle = report.package?.title || 'N/A';
        
        const reportTypeLabels = {
          'contact_info': 'Shared Contact Info',
          'solicitation': 'Direct Solicitation',
          'payment_outside': 'Outside Payment Request',
          'discount_offer': 'Discount to Bypass MCC',
          'business_card': 'Business Card/Flyer',
          'other': 'Other Violation'
        };

        const statusColors = {
          'pending': 'orange',
          'investigating': 'blue',
          'confirmed': 'red',
          'dismissed': 'muted'
        };

        return `
          <div class="card" style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
              <div>
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
                  <span class="status-badge ${statusColors[report.status]}">${report.status.toUpperCase()}</span>
                  <span style="font-weight:600;">${reportTypeLabels[report.report_type] || report.report_type}</span>
                </div>
                <div style="font-size:0.85rem;color:var(--text-muted);">
                  Reported ${new Date(report.created_at).toLocaleDateString()} at ${new Date(report.created_at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                </div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:0.85rem;color:var(--text-muted);">Report #${report.id.slice(0,8).toUpperCase()}</div>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:16px;">
              <div>
                <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Reporter (Member)</div>
                <div style="font-weight:500;">${reporterName}</div>
                <div style="font-size:0.85rem;color:var(--text-secondary);">${report.reporter?.email || ''}</div>
              </div>
              <div>
                <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Accused Provider</div>
                <div style="font-weight:500;">${providerAlias}</div>
                <div style="font-size:0.85rem;color:var(--accent-gold);">Real: ${providerRealName}</div>
                <div style="font-size:0.85rem;color:var(--text-secondary);">${report.provider?.email || ''}</div>
              </div>
            </div>

            <div style="margin-bottom:16px;">
              <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Related Package</div>
              <div>${packageTitle}</div>
            </div>

            <div style="margin-bottom:16px;">
              <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Description</div>
              <div style="background:var(--bg-input);padding:12px;border-radius:var(--radius-md);line-height:1.6;">${report.description}</div>
            </div>

            ${report.evidence_urls?.length ? `
              <div style="margin-bottom:16px;">
                <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:8px;">Evidence (${report.evidence_urls.length} file${report.evidence_urls.length > 1 ? 's' : ''})</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                  ${report.evidence_urls.map((url, i) => `<a href="${url}" target="_blank" class="btn btn-secondary btn-sm">${mccIcon('paperclip', 16)} Evidence ${i + 1}</a>`).join('')}
                </div>
              </div>
            ` : ''}

            ${report.admin_notes ? `
              <div style="margin-bottom:16px;">
                <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Admin Notes</div>
                <div style="background:var(--accent-blue-soft);padding:12px;border-radius:var(--radius-md);border:1px solid rgba(74,124,255,0.3);">${report.admin_notes}</div>
              </div>
            ` : ''}

            ${report.status === 'confirmed' && report.reward_amount ? `
              <div style="background:var(--accent-gold-soft);padding:12px;border-radius:var(--radius-md);border:1px solid rgba(212,168,85,0.3);margin-bottom:16px;">
                <strong>${mccIcon('dollar-sign', 16)} Reward:</strong> $${report.reward_amount.toFixed(2)} ${report.reward_paid_at ? '(Paid)' : '(Pending)'}
              </div>
            ` : ''}

            <div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:16px;border-top:1px solid var(--border-subtle);">
              ${report.status === 'pending' ? `
                <button class="btn btn-primary btn-sm" onclick="updateViolationStatus('${report.id}', 'investigating')">${mccIcon('search', 16)} Start Investigation</button>
                <button class="btn btn-secondary btn-sm" onclick="updateViolationStatus('${report.id}', 'dismissed')">${mccIcon('x', 16)} Dismiss</button>
              ` : ''}
              ${report.status === 'investigating' ? `
                <button class="btn btn-primary btn-sm" onclick="confirmViolation('${report.id}')">${mccIcon('check', 16)} Confirm Violation</button>
                <button class="btn btn-secondary btn-sm" onclick="updateViolationStatus('${report.id}', 'dismissed')">${mccIcon('x', 16)} Dismiss</button>
              ` : ''}
              ${report.status === 'confirmed' && !report.reward_paid_at ? `
                <button class="btn btn-primary btn-sm" onclick="markRewardPaid('${report.id}')">${mccIcon('dollar-sign', 16)} Mark Reward Paid</button>
              ` : ''}
              <button class="btn btn-ghost btn-sm" onclick="addViolationNotes('${report.id}')">${mccIcon('file-text', 16)} Add Notes</button>
              <button class="btn btn-ghost btn-sm" onclick="viewProviderHistory('${report.provider_id}')">${mccIcon('user', 16)} Provider History</button>
            </div>
          </div>
        `;
      }).join('');
    }

    async function updateViolationStatus(reportId, status) {
      const updates = { status, updated_at: new Date().toISOString() };
      
      if (status === 'investigating') {
        updates.investigated_at = new Date().toISOString();
      }
      if (status === 'dismissed' || status === 'confirmed') {
        updates.resolved_at = new Date().toISOString();
      }

      const { error } = await supabaseClient
        .from('circumvention_reports')
        .update(updates)
        .eq('id', reportId);

      if (error) {
        showToast('Failed to update status', 'error');
        return;
      }

      showToast(`Report marked as ${status}`, 'success');
      await loadViolationReports();
    }

    async function confirmViolation(reportId) {
      const report = violationReports.find(r => r.id === reportId);
      if (!report) return;

      // Show confirm dialog with reward amount input
      const rewardAmount = prompt('Enter reward amount for reporter (up to 25% of damages recovered).\nEnter 0 if no reward, or leave blank to skip reward for now:', '50');
      
      if (rewardAmount === null) return; // Cancelled

      const updates = {
        status: 'confirmed',
        resolved_at: new Date().toISOString(),
        reward_amount: rewardAmount ? parseFloat(rewardAmount) : null
      };

      const { error } = await supabaseClient
        .from('circumvention_reports')
        .update(updates)
        .eq('id', reportId);

      if (error) {
        showToast('Failed to confirm violation', 'error');
        return;
      }

      // Suspend the provider — Task #127: routed through the server
      // /api/admin/provider/suspend endpoint so the action is admin-password
      // gated, audited, and triggers the Gatekeeper Postgres trigger by
      // flipping role=suspended.
      const suspendProvider = confirm('Violation confirmed. Suspend this provider account?');
      if (suspendProvider && report.provider_id) {
        try {
          const sres = await fetch('/api/admin/provider/suspend', {
            method: 'POST',
            headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider_id: report.provider_id,
              reason: 'Policy violation - circumvention attempt',
              set_role_suspended: true
            })
          });
          const sjson = await sres.json().catch(() => ({}));
          if (!sres.ok) {
            showToast(sjson.error || `Suspend failed (${sres.status})`, 'error');
          } else {
            showToast('Provider account suspended', 'success');
          }
        } catch (e) {
          showToast(`Suspend failed: ${e.message}`, 'error');
        }
      }

      showToast('Violation confirmed', 'success');
      await loadViolationReports();
    }

    async function markRewardPaid(reportId) {
      const { error } = await supabaseClient
        .from('circumvention_reports')
        .update({ reward_paid_at: new Date().toISOString() })
        .eq('id', reportId);

      if (error) {
        showToast('Failed to update reward status', 'error');
        return;
      }

      showToast('Reward marked as paid', 'success');
      await loadViolationReports();
    }

    async function addViolationNotes(reportId) {
      const report = violationReports.find(r => r.id === reportId);
      const currentNotes = report?.admin_notes || '';
      const newNotes = prompt('Enter admin notes:', currentNotes);
      
      if (newNotes === null) return;

      const { error } = await supabaseClient
        .from('circumvention_reports')
        .update({ admin_notes: newNotes })
        .eq('id', reportId);

      if (error) {
        showToast('Failed to save notes', 'error');
        return;
      }

      showToast('Notes saved', 'success');
      await loadViolationReports();
    }

    function viewProviderHistory(providerId) {
      // Filter violations by this provider
      const providerViolations = violationReports.filter(r => r.provider_id === providerId);
      alert(`This provider has ${providerViolations.length} total report(s):\n\n` + 
        providerViolations.map(r => `• ${r.status.toUpperCase()}: ${r.report_type} (${new Date(r.created_at).toLocaleDateString()})`).join('\n'));
    }

    // Setup violation tabs
    document.getElementById('violations-tabs')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab')) {
        document.querySelectorAll('#violations-tabs .tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentViolationFilter = e.target.dataset.filter;
        renderViolationReports();
      }
    });

    // ========== USER MANAGEMENT ==========
    let allUserManagementData = [];
    let filteredUserManagementData = [];
    let currentUserManagementFilter = 'all';
    let currentUserManagementSearch = '';
    let currentEditingUser = null;

    async function loadUserManagement() {
      try {
        const { data: profiles, error: profilesError } = await supabaseClient
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false });

        if (profilesError) {
          console.error('Error loading profiles:', profilesError);
          return;
        }

        const { data: memberFounders, error: mfError } = await supabaseClient
          .from('member_founder_profiles')
          .select('*');

        const { data: referrals, error: refError } = await supabaseClient
          .from('founder_referrals')
          .select('founder_id');

        const { data: providerProfiles, error: ppError } = await supabaseClient
          .from('provider_profiles')
          .select('user_id, business_name');

        const referralCounts = {};
        if (referrals) {
          referrals.forEach(r => {
            referralCounts[r.founder_id] = (referralCounts[r.founder_id] || 0) + 1;
          });
        }

        const memberFounderMap = {};
        if (memberFounders) {
          memberFounders.forEach(mf => {
            if (mf.user_id) memberFounderMap[mf.user_id] = mf;
            if (mf.email) memberFounderMap[mf.email] = mf;
          });
        }

        const providerProfileMap = {};
        if (providerProfiles) {
          providerProfiles.forEach(pp => {
            if (pp.user_id) providerProfileMap[pp.user_id] = pp;
          });
        }

        allUserManagementData = profiles.map(p => {
          const memberFounder = memberFounderMap[p.id] || memberFounderMap[p.email];
          const providerProfile = providerProfileMap[p.id];
          const referralCount = memberFounder ? (referralCounts[memberFounder.id] || 0) : 0;
          
          return {
            ...p,
            memberFounderProfile: memberFounder || null,
            providerProfile: providerProfile || null,
            referralCount: referralCount,
            isFoundingMember: !!memberFounder,
            isFoundingProvider: p.is_founding_provider || false,
            isSuspended: !!(p.suspension_reason || p.suspended_at)
          };
        });

        updateUserManagementStats();
        filterUsersByRole(currentUserManagementFilter);
      } catch (err) {
        console.error('loadUserManagement error:', err);
      }
    }

    function updateUserManagementStats() {
      const total = allUserManagementData.length;
      const members = allUserManagementData.filter(u => u.role === 'member' || u.also_member).length;
      const providers = allUserManagementData.filter(u => u.role === 'provider' || u.also_provider).length;
      const founders = allUserManagementData.filter(u => u.isFoundingMember || u.isFoundingProvider).length;
      const suspended = allUserManagementData.filter(u => u.isSuspended).length;

      document.getElementById('um-total-users').textContent = total;
      document.getElementById('um-total-members').textContent = members;
      document.getElementById('um-total-providers').textContent = providers;
      document.getElementById('um-total-founders').textContent = founders;
      document.getElementById('um-suspended').textContent = suspended;
    }

    function searchUsers(query) {
      currentUserManagementSearch = query.toLowerCase().trim();
      renderUserManagementTable();
    }

    function filterUsersByRole(role) {
      currentUserManagementFilter = role;
      
      switch (role) {
        case 'all':
          filteredUserManagementData = [...allUserManagementData];
          break;
        case 'member':
          filteredUserManagementData = allUserManagementData.filter(u => u.role === 'member' || u.also_member);
          break;
        case 'provider':
          filteredUserManagementData = allUserManagementData.filter(u => u.role === 'provider' || u.also_provider);
          break;
        case 'founding-member':
          filteredUserManagementData = allUserManagementData.filter(u => u.isFoundingMember);
          break;
        case 'founding-provider':
          filteredUserManagementData = allUserManagementData.filter(u => u.isFoundingProvider);
          break;
        case 'provider-referrers':
          filteredUserManagementData = allUserManagementData.filter(u => u.isFoundingProvider && u.referralCount > 0);
          break;
        default:
          filteredUserManagementData = [...allUserManagementData];
      }
      
      renderUserManagementTable();
    }

    function renderUserManagementTable() {
      const tbody = document.getElementById('user-management-table');
      
      let displayData = filteredUserManagementData;
      
      if (currentUserManagementSearch) {
        displayData = displayData.filter(u => {
          const searchStr = `${u.full_name || ''} ${u.email || ''} ${u.phone || ''} ${u.business_name || ''}`.toLowerCase();
          return searchStr.includes(currentUserManagementSearch);
        });
      }

      if (!displayData.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No users found</td></tr>`;
        return;
      }

      tbody.innerHTML = displayData.map(u => {
        const roleDisplay = getRoleDisplay(u);
        const founderStatus = getFounderStatus(u);
        const statusBadge = u.isSuspended ? 
          '<span class="status-badge rejected">Suspended</span>' : 
          '<span class="status-badge approved">Active</span>';
        
        return `
          <tr>
            <td>
              <div><strong>${u.full_name || 'Unnamed'}</strong></div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${u.email || 'No email'}</div>
              ${u.phone ? `<div style="font-size:0.75rem;color:var(--text-muted);">${u.phone}</div>` : ''}
            </td>
            <td>${roleDisplay}</td>
            <td>${founderStatus}</td>
            <td>${u.referralCount > 0 ? `<span style="color:var(--accent-gold);font-weight:600;">${u.referralCount}</span>` : '-'}</td>
            <td>${statusBadge}</td>
            <td>${new Date(u.created_at).toLocaleDateString()}</td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="openUserEditModal('${u.id}')">${mccIcon('file-text', 16)} Edit</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    function getRoleDisplay(user) {
      const roles = [];
      if (user.role === 'member' || user.also_member) roles.push('Member');
      if (user.role === 'provider' || user.also_provider) roles.push('Provider');
      if (user.role === 'admin') roles.push('Admin');
      
      if (roles.length === 0) return '<span class="status-badge muted">Unknown</span>';
      if (roles.includes('Member') && roles.includes('Provider')) {
        return '<span class="status-badge blue">Both</span>';
      }
      if (roles.includes('Provider')) {
        return '<span class="status-badge" style="background:var(--accent-gold-soft);color:var(--accent-gold);">Provider</span>';
      }
      if (roles.includes('Member')) {
        return '<span class="status-badge" style="background:var(--accent-green-soft);color:var(--accent-green);">Member</span>';
      }
      if (roles.includes('Admin')) {
        return '<span class="status-badge" style="background:var(--accent-red-soft);color:var(--accent-red);">Admin</span>';
      }
      return '<span class="status-badge muted">-</span>';
    }

    function getFounderStatus(user) {
      if (user.isFoundingMember && user.isFoundingProvider) {
        return `<span style="background:linear-gradient(135deg,#9b59b6,#8e44ad);color:white;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">${mccIcon('award', 16)} Founding Partner</span>`;
      }
      
      const statuses = [];
      if (user.isFoundingMember) statuses.push('Member Founder');
      if (user.isFoundingProvider) statuses.push('Provider Founder');
      
      if (statuses.length === 0) return '<span style="color:var(--text-muted);">None</span>';
      
      // Intentional contrast: dark text (#0a0a0f) on gold/light backgrounds for readability
      return statuses.map(s => {
        if (s === 'Member Founder') {
          return `<span style="background:linear-gradient(135deg,var(--accent-blue),#6b9fff);color:white;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:500;margin-right:4px;">${mccIcon('star', 16)} ${s}</span>`;
        }
        return `<span style="background:linear-gradient(135deg,var(--accent-gold),#f0d78c);color:#0a0a0f;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:500;">${mccIcon('star', 16)} ${s}</span>`;
      }).join(' ');
    }

    async function openUserEditModal(userId) {
      const user = allUserManagementData.find(u => u.id === userId);
      if (!user) {
        showToast('User not found', 'error');
        return;
      }

      currentEditingUser = user;
      
      const mfp = user.memberFounderProfile;
      const founderSection = mfp ? `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('star', 24)} Member Founder Details</div>
          <div class="detail-grid">
            <span class="detail-label">Referral Code:</span>
            <span class="detail-value"><code style="background:var(--accent-gold-soft);color:var(--accent-gold);padding:4px 8px;border-radius:4px;font-weight:600;">${mfp.referral_code || 'N/A'}</code></span>
            <span class="detail-label">Tier:</span>
            <span class="detail-value">${mfp.tier || 'Standard'}</span>
            <span class="detail-label">Total Earnings:</span>
            <span class="detail-value" style="color:var(--accent-green);">$${parseFloat(mfp.total_commissions_earned || 0).toFixed(2)}</span>
            <span class="detail-label">Pending Balance:</span>
            <span class="detail-value" style="color:var(--accent-gold);">$${parseFloat(mfp.pending_balance || 0).toFixed(2)}</span>
            <span class="detail-label">Provider Referrals:</span>
            <span class="detail-value">${user.referralCount}</span>
            <span class="detail-label">Stripe Connect:</span>
            <span class="detail-value">${mfp.stripe_connect_account_id ? 
              (mfp.payout_details?.transfers_enabled ? '<span class="status-badge approved">' + mccIcon('credit-card', 16) + ' Connected</span>' : '<span class="status-badge orange">' + mccIcon('clock', 16) + ' Pending</span>') : 
              '<span class="status-badge muted">Not Setup</span>'}</span>
          </div>
          <div class="form-group" style="margin-top:16px;">
            <label class="form-label">Payout Method</label>
            <select class="form-select" id="edit-payout-method">
              <option value="stripe_connect" ${mfp.payout_method === 'stripe_connect' ? 'selected' : ''}>Stripe Connect</option>
              <option value="paypal" ${mfp.payout_method === 'paypal' ? 'selected' : ''}>PayPal</option>
              <option value="bank_transfer" ${mfp.payout_method === 'bank_transfer' ? 'selected' : ''}>Bank Transfer</option>
              <option value="check" ${mfp.payout_method === 'check' ? 'selected' : ''}>Check</option>
            </select>
          </div>
        </div>
      ` : '';

      const providerFounderSection = user.isFoundingProvider ? `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('wrench', 24)} Provider Founder Status</div>
          <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--accent-gold-soft);border-radius:var(--radius-md);">
            <span style="font-size:24px;">${mccIcon('star', 24)}</span>
            <div>
              <div style="font-weight:600;color:var(--accent-gold);">Founding Provider</div>
              <div style="font-size:0.85rem;color:var(--text-secondary);">This provider is part of the founding program</div>
            </div>
          </div>
        </div>
      ` : '';

      const modalContent = `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('user', 24)} Basic Information</div>
          <div class="detail-grid">
            <span class="detail-label">Name:</span><span class="detail-value">${user.full_name || 'Not set'}</span>
            <span class="detail-label">Email:</span><span class="detail-value">${user.email || 'Not set'}</span>
            <span class="detail-label">Phone:</span><span class="detail-value">${user.phone || 'Not set'}</span>
            <span class="detail-label">Joined:</span><span class="detail-value">${new Date(user.created_at).toLocaleString()}</span>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('refresh-cw', 24)} Role Management</div>
          <div style="margin-bottom:12px;">
            <span class="form-label">Current Role:</span>
            ${getRoleDisplay(user)}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn ${user.role === 'member' && !user.also_provider ? 'btn-primary' : 'btn-secondary'}" onclick="updateUserRole('${user.id}', 'member')">Make Member Only</button>
            <button class="btn ${user.role === 'provider' && !user.also_member ? 'btn-primary' : 'btn-secondary'}" onclick="updateUserRole('${user.id}', 'provider')">Make Provider Only</button>
            <button class="btn ${(user.also_member && user.also_provider) || (user.role === 'member' && user.also_provider) || (user.role === 'provider' && user.also_member) ? 'btn-primary' : 'btn-secondary'}" onclick="updateUserRole('${user.id}', 'both')">Make Both</button>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('star', 24)} Founder Status</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
            <button class="btn ${user.isFoundingMember ? 'btn-success' : 'btn-secondary'}" onclick="toggleFounderStatus('${user.id}', 'member')">
              ${user.isFoundingMember ? mccIcon('check', 16) + ' Member Founder' : 'Make Founding Member'}
            </button>
            <button class="btn ${user.isFoundingProvider ? 'btn-success' : 'btn-secondary'}" onclick="toggleFounderStatus('${user.id}', 'provider')">
              ${user.isFoundingProvider ? mccIcon('check', 16) + ' Provider Founder' : 'Make Founding Provider'}
            </button>
          </div>
        </div>

        ${founderSection}
        ${providerFounderSection}

        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('settings', 24)} Account Actions</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${user.isSuspended ? `
              <button class="btn btn-success" onclick="toggleUserSuspension('${user.id}', false)">${mccIcon('check', 16)} Unsuspend Account</button>
              <div style="margin-top:8px;padding:12px;background:var(--accent-red-soft);border-radius:var(--radius-md);width:100%;">
                <div style="color:var(--accent-red);font-weight:600;">${mccIcon('x', 16)} Account Suspended</div>
                <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px;">Reason: ${user.suspension_reason || 'Not specified'}</div>
                ${user.suspended_at ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">Suspended on: ${new Date(user.suspended_at).toLocaleString()}</div>` : ''}
              </div>
            ` : `
              <button class="btn btn-danger" onclick="toggleUserSuspension('${user.id}', true)">${mccIcon('x', 16)} Suspend Account</button>
            `}
          </div>
        </div>
      `;

      document.getElementById('user-edit-modal-body').innerHTML = modalContent
        + `<div class="form-section" id="user-edit-outreach-history" style="border-bottom:none;"><div class="form-section-title">${mccIcon('mail', 24)} Outreach History</div><div id="user-edit-outreach-history-body" style="font-size:0.9rem;color:var(--text-muted);">Loading…</div></div>`;
      const userEditModal = document.getElementById('user-edit-modal');
      userEditModal.style.display = '';
      userEditModal.classList.add('active');
      if (typeof window.renderOutreachHistoryPanel === 'function') {
        window.renderOutreachHistoryPanel('user-edit-outreach-history-body', user.id);
      }
    }

    async function updateUserRole(userId, newRole) {
      const user = allUserManagementData.find(u => u.id === userId);
      if (!user) return;

      let updateData = {};
      
      switch (newRole) {
        case 'member':
          updateData = { role: 'member', also_provider: false, also_member: false };
          break;
        case 'provider':
          updateData = { role: 'provider', also_member: false, also_provider: false };
          break;
        case 'both':
          if (user.role === 'member') {
            updateData = { also_provider: true };
          } else if (user.role === 'provider') {
            updateData = { also_member: true };
          } else {
            updateData = { role: 'member', also_provider: true };
          }
          break;
      }

      const { error } = await supabaseClient
        .from('profiles')
        .update(updateData)
        .eq('id', userId);

      if (error) {
        showToast('Failed to update role: ' + error.message, 'error');
        return;
      }

      showToast('Role updated successfully', 'success');
      await loadUserManagement();
      openUserEditModal(userId);
    }

    async function toggleFounderStatus(userId, founderType) {
      const user = allUserManagementData.find(u => u.id === userId);
      if (!user) return;

      if (founderType === 'member') {
        if (user.isFoundingMember) {
          if (!confirm('Remove founding member status? This will not delete their referral history.')) return;
          
          const { error } = await supabaseClient
            .from('member_founder_profiles')
            .update({ status: 'inactive' })
            .eq('user_id', userId);

          if (error) {
            showToast('Failed to update founder status: ' + error.message, 'error');
            return;
          }
          showToast('Founding member status removed', 'success');
        } else {
          let founderName = user.full_name;
          if (!founderName || founderName.trim() === '') {
            founderName = prompt('This user has no name set. Enter a name for the founder profile:', user.email?.split('@')[0] || 'User');
            if (!founderName || founderName.trim() === '') {
              showToast('A name is required to create a founder profile', 'error');
              return;
            }
          }
          
          const referralCode = generateReferralCode(founderName);
          
          const { error } = await supabaseClient
            .from('member_founder_profiles')
            .insert({
              user_id: userId,
              full_name: founderName,
              email: user.email,
              phone: user.phone,
              referral_code: referralCode,
              status: 'active'
            });

          if (error) {
            if (error.code === '23505') {
              const { error: updateError } = await supabaseClient
                .from('member_founder_profiles')
                .update({ status: 'active' })
                .eq('user_id', userId);
              
              if (updateError) {
                showToast('Failed to reactivate founder status: ' + updateError.message, 'error');
                return;
              }
            } else {
              showToast('Failed to create founder profile: ' + error.message, 'error');
              return;
            }
          }
          showToast(`User is now a Founding Member! Code: ${referralCode}`, 'success');
        }
      } else if (founderType === 'provider') {
        const newStatus = !user.isFoundingProvider;
        
        const { error } = await supabaseClient
          .from('profiles')
          .update({ is_founding_provider: newStatus })
          .eq('id', userId);

        if (error) {
          showToast('Failed to update founding provider status: ' + error.message, 'error');
          return;
        }
        showToast(newStatus ? 'User is now a Founding Provider!' : 'Founding provider status removed', 'success');
      }

      await loadUserManagement();
      openUserEditModal(userId);
    }

    async function toggleUserSuspension(userId, suspend) {
      const user = allUserManagementData.find(u => u.id === userId);
      if (!user) return;

      // Task #127 — both branches now route through admin-password-gated
      // server endpoints so the actions are validated, rate-limited, and
      // audited (and Gatekeeper triggers fire when role changes).
      if (suspend) {
        const reason = prompt('Enter suspension reason (5-500 chars):');
        if (!reason || reason.trim().length < 5) {
          showToast('Suspension reason must be at least 5 characters.', 'error');
          return;
        }
        try {
          const res = await fetch('/api/admin/provider/suspend', {
            method: 'POST',
            headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider_id: userId, reason: reason.trim() })
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            showToast(json.error || `Failed to suspend user (${res.status})`, 'error');
            return;
          }
          showToast('User suspended', 'success');
        } catch (e) {
          showToast('Failed to suspend user: ' + e.message, 'error');
          return;
        }
      } else {
        if (!confirm('Unsuspend this user?')) return;
        try {
          const res = await fetch('/api/admin/provider/activate', {
            method: 'POST',
            headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider_id: userId })
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            showToast(json.error || `Failed to unsuspend user (${res.status})`, 'error');
            return;
          }
          showToast('User unsuspended', 'success');
        } catch (e) {
          showToast('Failed to unsuspend user: ' + e.message, 'error');
          return;
        }
      }

      await loadUserManagement();
      openUserEditModal(userId);
    }

    async function saveUserChanges() {
      if (!currentEditingUser) return;

      const mfp = currentEditingUser.memberFounderProfile;
      if (mfp) {
        const payoutMethod = document.getElementById('edit-payout-method')?.value;
        if (payoutMethod && payoutMethod !== mfp.payout_method) {
          const { error } = await supabaseClient
            .from('member_founder_profiles')
            .update({ payout_method: payoutMethod })
            .eq('id', mfp.id);

          if (error) {
            showToast('Failed to update payout method: ' + error.message, 'error');
            return;
          }
        }
      }

      showToast('Changes saved successfully', 'success');
      closeModal('user-edit-modal');
      await loadUserManagement();
    }

    async function refreshUserManagement() {
      showToast('Refreshing user data...', 'info');
      await loadUserManagement();
      showToast('User data refreshed', 'success');
    }

    // Setup user management tabs
    document.getElementById('user-management-tabs')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab')) {
        document.querySelectorAll('#user-management-tabs .tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        filterUsersByRole(e.target.dataset.filter);
      }
    });

    // ========== CAR (CORRECTIVE ACTION RESPONSE) MANAGEMENT ==========
    let allCARs = [];
    let currentCAR = null;
    let currentCARFilter = 'pending';

    const COMPLAINT_REASON_LABELS = {
      'poor_quality': 'Poor Quality of Work',
      'incomplete_work': 'Incomplete or Unfinished Work',
      'damage_caused': 'Damage Caused to Vehicle',
      'overcharged': 'Overcharged / Unexpected Fees',
      'late_delivery': 'Late Delivery / Missed Deadline',
      'poor_communication': 'Poor Communication',
      'unprofessional': 'Unprofessional Behavior',
      'no_show': 'No Show / Missed Appointment',
      'dishonest': 'Dishonest or Misleading',
      'safety_concern': 'Safety Concern',
      'other': 'Other',
      'unspecified': 'General Low Rating'
    };

    function getComplaintLabel(code) {
      return COMPLAINT_REASON_LABELS[code] || code || 'Unknown';
    }

    function getCARStatusBadgeClass(status) {
      switch(status) {
        case 'pending': return 'pending';
        case 'under_review': return 'blue';
        case 'approved': return 'approved';
        case 'rejected': return 'rejected';
        case 'revision_requested': return 'orange';
        default: return 'muted';
      }
    }

    function getCARStatusLabel(status) {
      switch(status) {
        case 'pending': return 'Pending';
        case 'under_review': return 'Under Review';
        case 'approved': return 'Approved';
        case 'rejected': return 'Rejected';
        case 'revision_requested': return 'Revision Requested';
        default: return status || 'Unknown';
      }
    }

    async function loadPendingCARs() {
      try {
        const { data, error } = await supabaseClient
          .from('corrective_action_responses')
          .select(`
            *,
            provider:provider_id(id, full_name, business_name, email, suspended_at),
            provider_stats:provider_id(average_rating, total_reviews, suspended, suspended_at, primary_complaint_reason, complaint_counts)
          `)
          .order('submitted_at', { ascending: false });
        
        if (error) {
          console.error('Error loading CARs:', error);
          allCARs = [];
        } else {
          allCARs = data || [];
        }
        
        updateCARStats();
        renderCARs();
        
        const pendingCount = allCARs.filter(c => c.status === 'pending' || c.status === 'under_review').length;
        document.getElementById('car-count').textContent = pendingCount;
      } catch (err) {
        console.error('loadPendingCARs error:', err);
        allCARs = [];
        renderCARs();
      }
    }

    function updateCARStats() {
      document.getElementById('car-pending').textContent = allCARs.filter(c => c.status === 'pending').length;
      document.getElementById('car-under-review').textContent = allCARs.filter(c => c.status === 'under_review').length;
      document.getElementById('car-approved').textContent = allCARs.filter(c => c.status === 'approved').length;
      document.getElementById('car-rejected').textContent = allCARs.filter(c => c.status === 'rejected').length;
    }

    function filterCARs(filter) {
      currentCARFilter = filter;
      renderCARs();
    }

    function renderCARs() {
      const tbody = document.getElementById('car-table');
      let filtered = allCARs;
      
      if (currentCARFilter !== 'all') {
        filtered = allCARs.filter(c => c.status === currentCARFilter);
      }
      
      if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No CAR submissions ${currentCARFilter !== 'all' ? 'with status "' + getCARStatusLabel(currentCARFilter) + '"' : ''}</td></tr>`;
        return;
      }
      
      tbody.innerHTML = filtered.map(car => {
        const provider = car.provider;
        const providerName = provider?.business_name || provider?.full_name || 'Unknown Provider';
        const complaintLabel = getComplaintLabel(car.primary_complaint_reason);
        const statusClass = getCARStatusBadgeClass(car.status);
        const statusLabel = getCARStatusLabel(car.status);
        
        return `
          <tr>
            <td>
              <strong>${providerName}</strong>
              <div style="font-size:0.8rem;color:var(--text-muted);">${provider?.email || ''}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">ID: ${car.provider_id?.substring(0,8)}...</div>
            </td>
            <td>${new Date(car.submitted_at).toLocaleDateString()}</td>
            <td>
              <span style="background:var(--accent-red-soft);color:var(--accent-red);padding:4px 10px;border-radius:100px;font-size:0.8rem;">
                ${complaintLabel}
              </span>
            </td>
            <td style="text-align:center;font-weight:600;">${car.complaint_count || 1}</td>
            <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
            <td><button class="btn btn-secondary btn-sm" onclick="viewCAR('${car.id}')">Review</button></td>
          </tr>
        `;
      }).join('');
    }

    async function viewCAR(carId) {
      currentCAR = allCARs.find(c => c.id === carId);
      if (!currentCAR) {
        showToast('CAR not found', 'error');
        return;
      }
      
      const car = currentCAR;
      const provider = car.provider;
      const providerStats = Array.isArray(car.provider_stats) ? car.provider_stats[0] : car.provider_stats;
      const providerName = provider?.business_name || provider?.full_name || 'Unknown Provider';
      const complaintLabel = getComplaintLabel(car.primary_complaint_reason);
      const statusClass = getCARStatusBadgeClass(car.status);
      const statusLabel = getCARStatusLabel(car.status);
      
      const suspendedDate = provider?.suspended_at || providerStats?.suspended_at;
      const avgRating = providerStats?.average_rating;
      const totalReviews = providerStats?.total_reviews;
      
      const isReviewed = car.status === 'approved' || car.status === 'rejected';
      
      const modalBody = document.getElementById('car-modal-body');
      modalBody.innerHTML = `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('user', 24)} Provider Information</div>
          <div class="detail-grid">
            <span class="detail-label">Provider Name:</span>
            <span class="detail-value"><strong>${providerName}</strong></span>
            <span class="detail-label">Email:</span>
            <span class="detail-value">${provider?.email || 'N/A'}</span>
            <span class="detail-label">Provider ID:</span>
            <span class="detail-value" style="font-family:monospace;font-size:0.85rem;">${car.provider_id}</span>
            <span class="detail-label">Suspended Date:</span>
            <span class="detail-value">${suspendedDate ? new Date(suspendedDate).toLocaleString() : 'N/A'}</span>
            <span class="detail-label">Average Rating:</span>
            <span class="detail-value">${avgRating ? avgRating.toFixed(1) + ' ' + mccIcon('star', 16) : 'N/A'} (${totalReviews || 0} reviews)</span>
            <span class="detail-label">CAR Status:</span>
            <span class="detail-value"><span class="status-badge ${statusClass}">${statusLabel}</span></span>
          </div>
        </div>
        
        <div class="form-section">
          <div class="form-section-title">${mccIcon('alert-triangle', 24)} Complaint Information</div>
          <div class="detail-grid">
            <span class="detail-label">Primary Complaint:</span>
            <span class="detail-value">
              <span style="background:var(--accent-red-soft);color:var(--accent-red);padding:4px 12px;border-radius:100px;font-size:0.9rem;font-weight:500;">
                ${complaintLabel}
              </span>
            </span>
            <span class="detail-label">Complaint Count:</span>
            <span class="detail-value" style="font-weight:600;font-size:1.1rem;">${car.complaint_count || 1}</span>
            <span class="detail-label">Submitted:</span>
            <span class="detail-value">${new Date(car.submitted_at).toLocaleString()}</span>
          </div>
        </div>
        
        <div class="form-section">
          <div class="form-section-title">${mccIcon('search', 24)} Root Cause Analysis</div>
          <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);white-space:pre-wrap;line-height:1.6;">
            ${car.root_cause_analysis || 'No root cause analysis provided.'}
          </div>
        </div>
        
        <div class="form-section">
          <div class="form-section-title">${mccIcon('check-circle', 24)} Corrective Action Plan</div>
          <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);white-space:pre-wrap;line-height:1.6;">
            ${car.corrective_action_plan || 'No corrective action plan provided.'}
          </div>
        </div>
        
        <div class="form-section">
          <div class="form-section-title">${mccIcon('shield', 24)} Preventative Action</div>
          <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);white-space:pre-wrap;line-height:1.6;">
            ${car.preventative_action || 'No preventative action provided.'}
          </div>
        </div>
        
        ${car.additional_notes ? `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('file-text', 24)} Additional Notes from Provider</div>
          <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);white-space:pre-wrap;line-height:1.6;">
            ${car.additional_notes}
          </div>
        </div>
        ` : ''}
        
        ${car.reviewed_at ? `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('clipboard-list', 24)} Review Information</div>
          <div class="detail-grid">
            <span class="detail-label">Reviewed At:</span>
            <span class="detail-value">${new Date(car.reviewed_at).toLocaleString()}</span>
            ${car.admin_notes ? `
            <span class="detail-label">Admin Notes:</span>
            <span class="detail-value">${car.admin_notes}</span>
            ` : ''}
            ${car.rejection_reason ? `
            <span class="detail-label">Rejection Reason:</span>
            <span class="detail-value" style="color:var(--accent-red);">${car.rejection_reason}</span>
            ` : ''}
          </div>
        </div>
        ` : `
        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('file-text', 24)} Admin Notes</div>
          <textarea class="form-textarea" id="car-admin-notes" placeholder="Add internal notes about this CAR review (optional)..." rows="3"></textarea>
        </div>
        
        <div class="form-section" id="car-rejection-section" style="display:none;border-bottom:none;">
          <div class="form-section-title" style="color:var(--accent-red);">${mccIcon('x', 24)} Rejection Reason</div>
          <textarea class="form-textarea" id="car-rejection-reason" placeholder="Explain why this CAR is being rejected..." rows="3"></textarea>
        </div>
        `}
      `;
      
      const footer = document.getElementById('car-modal-footer');
      if (isReviewed) {
        footer.innerHTML = `
          <button class="btn btn-secondary" onclick="closeModal('car-modal')">Close</button>
        `;
      } else {
        footer.innerHTML = `
          <button class="btn btn-secondary" onclick="closeModal('car-modal')">Close</button>
          <button class="btn btn-danger" onclick="showCARRejectionForm()">Reject</button>
          <button class="btn" style="background:var(--accent-orange-soft);color:var(--accent-orange);border:1px solid var(--accent-orange);" onclick="reviewCAR('${car.id}', 'revision_requested')">Request Revision</button>
          <button class="btn btn-success" onclick="reviewCAR('${car.id}', 'approved')">Approve & Lift Suspension</button>
        `;
      }
      
      document.getElementById('car-modal').classList.add('active');
    }

    function showCARRejectionForm() {
      const section = document.getElementById('car-rejection-section');
      if (section) {
        section.style.display = 'block';
        document.getElementById('car-rejection-reason')?.focus();
      }
    }

    async function reviewCAR(carId, decision) {
      if (!carId) {
        showToast('No CAR selected', 'error');
        return;
      }
      
      const adminNotes = document.getElementById('car-admin-notes')?.value?.trim() || null;
      const rejectionReason = document.getElementById('car-rejection-reason')?.value?.trim() || null;
      
      if (decision === 'rejected' && !rejectionReason) {
        showToast('Please provide a rejection reason', 'error');
        document.getElementById('car-rejection-reason')?.focus();
        return;
      }
      
      const confirmMessages = {
        'approved': 'Approve this CAR and lift the provider\'s suspension?',
        'rejected': 'Reject this CAR? The provider will remain suspended.',
        'revision_requested': 'Request revisions to this CAR? The provider will need to update and resubmit.'
      };
      
      if (!confirm(confirmMessages[decision] || 'Proceed with this action?')) return;
      
      try {
        const user = await getCurrentUser();
        if (!user) {
          showToast('You must be logged in to review CARs', 'error');
          return;
        }
        
        const { data, error } = await supabaseClient.rpc('review_corrective_action', {
          p_car_id: carId,
          p_admin_id: user.id,
          p_decision: decision,
          p_admin_notes: adminNotes,
          p_rejection_reason: rejectionReason
        });
        
        if (error) {
          console.error('Error reviewing CAR:', error);
          showToast('Failed to submit review: ' + error.message, 'error');
          return;
        }
        
        const successMessages = {
          'approved': 'CAR approved! Provider suspension has been lifted.',
          'rejected': 'CAR rejected. Provider remains suspended.',
          'revision_requested': 'Revision requested. Provider has been notified.'
        };
        
        showToast(successMessages[decision] || 'Review submitted successfully', 'success');
        closeModal('car-modal');
        await loadPendingCARs();
        await loadProviders();
      } catch (err) {
        console.error('reviewCAR error:', err);
        showToast('Error submitting review: ' + err.message, 'error');
      }
    }

    document.getElementById('car-tabs')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab')) {
        document.querySelectorAll('#car-tabs .tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        filterCARs(e.target.dataset.filter);
      }
    });

    // ========== REGISTRATION VERIFICATIONS ==========
    async function loadRegistrationVerifications(status = null) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        let url = '/api/registration/verifications';
        if (status && status !== 'all') {
          url += `?status=${status}`;
        }

        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });

        if (!response.ok) {
          console.error('Failed to load registration verifications');
          registrationVerifications = [];
          renderRegistrationVerifications();
          return;
        }

        const data = await response.json();
        registrationVerifications = data.verifications || [];
        
        updateRegistrationStats();
        renderRegistrationVerifications();
        updateRegistrationBadge();
      } catch (err) {
        console.error('Error loading registration verifications:', err);
        registrationVerifications = [];
        renderRegistrationVerifications();
      }
    }

    function updateRegistrationStats() {
      const needsReview = registrationVerifications.filter(v => v.status === 'needs_review').length;
      const pending = registrationVerifications.filter(v => v.status === 'pending').length;
      const approved = registrationVerifications.filter(v => v.status === 'approved').length;
      const rejected = registrationVerifications.filter(v => v.status === 'rejected').length;

      const needsReviewEl = document.getElementById('reg-needs-review');
      const pendingEl = document.getElementById('reg-pending');
      const approvedEl = document.getElementById('reg-approved');
      const rejectedEl = document.getElementById('reg-rejected');

      if (needsReviewEl) needsReviewEl.textContent = needsReview;
      if (pendingEl) pendingEl.textContent = pending;
      if (approvedEl) approvedEl.textContent = approved;
      if (rejectedEl) rejectedEl.textContent = rejected;
    }

    function updateRegistrationBadge() {
      const needsReview = registrationVerifications.filter(v => v.status === 'needs_review').length;
      const badgeEl = document.getElementById('registration-count');
      if (badgeEl) {
        badgeEl.textContent = needsReview;
        badgeEl.style.display = needsReview > 0 ? 'inline-block' : 'none';
      }
    }

    function renderRegistrationVerifications() {
      const tbody = document.getElementById('registration-verifications-table');
      if (!tbody) return;

      let filtered = registrationVerifications;
      if (currentFilters.registrations && currentFilters.registrations !== 'all') {
        filtered = registrationVerifications.filter(v => v.status === currentFilters.registrations);
      }

      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No verification requests found</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(v => {
        const userName = v.user?.full_name || v.user?.email || 'Unknown User';
        const vehicleInfo = v.vehicle ? `${v.vehicle.year || ''} ${v.vehicle.make || ''} ${v.vehicle.model || ''}`.trim() : 'Unknown Vehicle';
        const matchScore = v.name_match_score !== null && v.name_match_score !== undefined 
          ? Math.round(v.name_match_score) 
          : '--';
        const scoreColor = matchScore === '--' ? 'var(--text-muted)' : 
          matchScore >= 80 ? 'var(--accent-green)' : 
          matchScore >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)';
        const submittedDate = v.created_at ? new Date(v.created_at).toLocaleDateString() : 'N/A';

        return `
          <tr style="cursor:pointer;" onclick="openVerificationDetail('${v.id}')">
            <td>
              <div><strong>${userName}</strong></div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${v.user?.email || ''}</div>
            </td>
            <td>${vehicleInfo}</td>
            <td><span class="status-badge ${v.status === 'needs_review' ? 'orange' : v.status === 'pending' ? 'blue' : v.status === 'approved' ? 'approved' : v.status === 'rejected' ? 'rejected' : 'muted'}">${v.status?.replace('_', ' ') || 'unknown'}</span></td>
            <td><span style="color:${scoreColor};font-weight:600;">${matchScore}${matchScore !== '--' ? '%' : ''}</span></td>
            <td>${submittedDate}</td>
            <td><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();openVerificationDetail('${v.id}')">Review</button></td>
          </tr>
        `;
      }).join('');
    }

    async function openVerificationDetail(verificationId) {
      currentVerification = registrationVerifications.find(v => v.id === verificationId);
      if (!currentVerification) {
        showToast('Verification not found', 'error');
        return;
      }

      const v = currentVerification;
      const userName = v.user?.full_name || 'Unknown User';
      const userEmail = v.user?.email || '';
      const vehicleInfo = v.vehicle ? `${v.vehicle.year || ''} ${v.vehicle.make || ''} ${v.vehicle.model || ''}`.trim() : 'Unknown Vehicle';
      const matchScore = v.name_match_score !== null && v.name_match_score !== undefined 
        ? Math.round(v.name_match_score) 
        : null;

      const modalBody = document.getElementById('verification-modal-body');
      modalBody.innerHTML = `
        <div class="form-section">
          <div class="form-section-title">${mccIcon('user', 24)} User & Vehicle Information</div>
          <div class="detail-grid">
            <span class="detail-label">User Name:</span>
            <span class="detail-value">${userName}</span>
            <span class="detail-label">User Email:</span>
            <span class="detail-value">${userEmail}</span>
            <span class="detail-label">Vehicle:</span>
            <span class="detail-value">${vehicleInfo}</span>
            <span class="detail-label">Status:</span>
            <span class="detail-value"><span class="status-badge ${v.status === 'needs_review' ? 'orange' : v.status === 'pending' ? 'blue' : v.status === 'approved' ? 'approved' : v.status === 'rejected' ? 'rejected' : 'muted'}">${v.status?.replace('_', ' ') || 'unknown'}</span></span>
            <span class="detail-label">Submitted:</span>
            <span class="detail-value">${v.created_at ? new Date(v.created_at).toLocaleString() : 'N/A'}</span>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('camera', 24)} Registration Image</div>
          ${v.image_url ? `
            <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);text-align:center;">
              <img src="${v.image_url}" alt="Registration Document" style="max-width:100%;max-height:400px;border-radius:var(--radius-sm);cursor:pointer;" onclick="window.open('${v.image_url}', '_blank')">
              <div style="margin-top:8px;font-size:0.8rem;color:var(--text-muted);">Click image to open in new tab</div>
            </div>
          ` : '<p style="color:var(--text-muted);">No image uploaded</p>'}
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('file-text', 24)} Extracted Text (OCR Results)</div>
          <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);max-height:200px;overflow-y:auto;">
            <pre style="font-family:monospace;font-size:0.85rem;white-space:pre-wrap;color:var(--text-primary);margin:0;">${v.extracted_text || 'No text extracted'}</pre>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('search', 24)} Name Comparison</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);">
              <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;">Extracted Owner Name</div>
              <div style="font-size:1.1rem;font-weight:600;">${v.extracted_owner_name || 'Not detected'}</div>
            </div>
            <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);">
              <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;">Profile Name</div>
              <div style="font-size:1.1rem;font-weight:600;">${userName}</div>
            </div>
          </div>
          ${matchScore !== null ? `
            <div style="margin-top:16px;padding:16px;border-radius:var(--radius-md);background:${matchScore >= 80 ? 'var(--accent-green-soft)' : matchScore >= 50 ? 'var(--accent-orange-soft)' : 'var(--accent-red-soft)'};">
              <div style="display:flex;align-items:center;gap:16px;">
                <div style="font-size:2rem;font-weight:700;color:${matchScore >= 80 ? 'var(--accent-green)' : matchScore >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)'};">${matchScore}%</div>
                <div>
                  <div style="font-weight:600;color:${matchScore >= 80 ? 'var(--accent-green)' : matchScore >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)'}">${matchScore >= 80 ? mccIcon('check', 16) + ' Good Match' : matchScore >= 50 ? mccIcon('alert-triangle', 16) + ' Partial Match' : mccIcon('x', 16) + ' Poor Match'}</div>
                  <div style="font-size:0.85rem;color:var(--text-muted);">Name match confidence score</div>
                </div>
              </div>
              <div style="margin-top:12px;height:8px;background:var(--bg-card);border-radius:4px;overflow:hidden;">
                <div style="width:${matchScore}%;height:100%;background:${matchScore >= 80 ? 'var(--accent-green)' : matchScore >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)'};border-radius:4px;"></div>
              </div>
            </div>
          ` : '<p style="color:var(--text-muted);margin-top:8px;">Match score not available</p>'}
        </div>

        <div class="form-section">
          <div class="form-section-title">${mccIcon('clipboard-list', 24)} Extracted Details</div>
          <div class="detail-grid">
            <span class="detail-label">VIN:</span>
            <span class="detail-value" style="font-family:monospace;">${v.extracted_vin || 'Not detected'}</span>
            <span class="detail-label">Plate Number:</span>
            <span class="detail-value" style="font-family:monospace;">${v.extracted_plate || 'Not detected'}</span>
          </div>
        </div>

        ${v.status !== 'approved' && v.status !== 'rejected' ? `
        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('file-text', 24)} Admin Notes</div>
          <textarea class="form-textarea" id="verification-admin-notes" placeholder="Add notes about this verification decision (optional)..." rows="3"></textarea>
        </div>
        ` : ''}

        ${v.admin_notes ? `
        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">${mccIcon('file-text', 24)} Previous Admin Notes</div>
          <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);">${v.admin_notes}</div>
        </div>
        ` : ''}
      `;

      const footer = document.getElementById('verification-modal-footer');
      if (v.status === 'approved' || v.status === 'rejected') {
        footer.innerHTML = `
          <button class="btn btn-secondary" onclick="closeModal('verification-modal')">Close</button>
        `;
      } else {
        footer.innerHTML = `
          <button class="btn btn-secondary" onclick="closeModal('verification-modal')">Close</button>
          <button class="btn btn-danger" onclick="rejectVerification()">Reject</button>
          <button class="btn btn-success" onclick="approveVerification()">Approve</button>
        `;
      }

      document.getElementById('verification-modal').classList.add('active');
    }
    window.openVerificationDetail = openVerificationDetail;

    async function approveVerification() {
      if (!currentVerification) {
        showToast('No verification selected', 'error');
        return;
      }

      const notes = document.getElementById('verification-admin-notes')?.value?.trim() || null;

      if (!confirm('Approve this registration verification?')) return;

      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('You must be logged in', 'error');
          return;
        }

        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/registration/verifications/${currentVerification.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: 'approved',
            admin_notes: notes
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to approve verification');
        }

        showToast('Verification approved successfully', 'success');
        closeModal('verification-modal');
        await loadRegistrationVerifications();
      } catch (err) {
        console.error('Error approving verification:', err);
        showToast('Error: ' + err.message, 'error');
      }
    }
    window.approveVerification = approveVerification;

    async function rejectVerification() {
      if (!currentVerification) {
        showToast('No verification selected', 'error');
        return;
      }

      const notes = document.getElementById('verification-admin-notes')?.value?.trim() || null;

      if (!confirm('Reject this registration verification?')) return;

      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('You must be logged in', 'error');
          return;
        }

        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/registration/verifications/${currentVerification.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: 'rejected',
            admin_notes: notes
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to reject verification');
        }

        showToast('Verification rejected', 'success');
        closeModal('verification-modal');
        await loadRegistrationVerifications();
      } catch (err) {
        console.error('Error rejecting verification:', err);
        showToast('Error: ' + err.message, 'error');
      }
    }
    window.rejectVerification = rejectVerification;

    document.getElementById('registration-tabs')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab')) {
        document.querySelectorAll('#registration-tabs .tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentFilters.registrations = e.target.dataset.filter;
        renderRegistrationVerifications();
      }
    });

    window.loadRefunds = loadRefunds;
    window.changeRefundsPage = changeRefundsPage;
    window.approveRefund = approveRefund;
    window.denyRefund = denyRefund;
    window.viewRefund = viewRefund;

    async function logout() { localStorage.removeItem('mcc_admin_pass'); localStorage.removeItem('mcc_admin_team_token'); await supabaseClient.auth.signOut(); window.location.href = 'login.html'; }
    window.logout = logout;

    function toggleSidebar() {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      sidebar.classList.toggle('open');
      overlay.classList.toggle('active');
    }
    window.toggleSidebar = toggleSidebar;

    // ========== PRINTFUL MERCH MANAGER ==========
    let printfulCatalog = [];
    let printfulStoreProducts = [];
    let currentCatalogProduct = null;
    let selectedColors = new Set();
    let selectedSizes = new Set();
    let productVariantsMap = {};

    // ========== MERCH PREFERENCES ==========
    const MERCH_PREFS_KEY = 'merch_manager_preferences';

    function loadMerchPreferences() {
      try {
        const stored = localStorage.getItem(MERCH_PREFS_KEY);
        if (stored) {
          const prefs = JSON.parse(stored);
          if (prefs.defaultPrice !== undefined) {
            document.getElementById('merch-pref-price').value = prefs.defaultPrice;
          }
          if (prefs.priceMarkup !== undefined) {
            document.getElementById('merch-pref-markup').value = prefs.priceMarkup;
          }
          if (prefs.favoriteColors && Array.isArray(prefs.favoriteColors)) {
            document.querySelectorAll('.merch-color-pref input[type="checkbox"]').forEach(cb => {
              cb.checked = prefs.favoriteColors.includes(cb.value);
              updateMerchColorPrefStyle(cb);
            });
          }
        } else {
          document.querySelectorAll('.merch-color-pref input[type="checkbox"]').forEach(cb => {
            updateMerchColorPrefStyle(cb);
          });
        }
      } catch (err) {
        console.error('Error loading merch preferences:', err);
      }
    }
    window.loadMerchPreferences = loadMerchPreferences;

    function saveMerchPreferences() {
      try {
        const prefs = {
          defaultPrice: parseFloat(document.getElementById('merch-pref-price').value) || 29.99,
          priceMarkup: parseInt(document.getElementById('merch-pref-markup').value) || 50,
          favoriteColors: []
        };
        document.querySelectorAll('.merch-color-pref input[type="checkbox"]:checked').forEach(cb => {
          prefs.favoriteColors.push(cb.value);
        });
        localStorage.setItem(MERCH_PREFS_KEY, JSON.stringify(prefs));
        showToast('Preferences saved!', 'success');
      } catch (err) {
        console.error('Error saving merch preferences:', err);
        showToast('Failed to save preferences', 'error');
      }
    }
    window.saveMerchPreferences = saveMerchPreferences;

    function getMerchDefaultPrice() {
      try {
        const stored = localStorage.getItem(MERCH_PREFS_KEY);
        if (stored) {
          const prefs = JSON.parse(stored);
          if (prefs.defaultPrice !== undefined) {
            return prefs.defaultPrice;
          }
        }
      } catch (err) {
        console.error('Error getting merch default price:', err);
      }
      return 29.99;
    }
    window.getMerchDefaultPrice = getMerchDefaultPrice;

    function getMerchDefaultColors() {
      try {
        const stored = localStorage.getItem(MERCH_PREFS_KEY);
        if (stored) {
          const prefs = JSON.parse(stored);
          if (prefs.favoriteColors && Array.isArray(prefs.favoriteColors)) {
            return prefs.favoriteColors;
          }
        }
      } catch (err) {
        console.error('Error getting merch default colors:', err);
      }
      return ['Black', 'White', 'Navy'];
    }
    window.getMerchDefaultColors = getMerchDefaultColors;

    function toggleMerchPreferencesPanel() {
      const panel = document.getElementById('merch-preferences-panel');
      const toggle = document.getElementById('merch-prefs-toggle');
      if (panel.style.display === 'none') {
        panel.style.display = 'block';
        toggle.style.transform = 'rotate(180deg)';
      } else {
        panel.style.display = 'none';
        toggle.style.transform = 'rotate(0deg)';
      }
    }
    window.toggleMerchPreferencesPanel = toggleMerchPreferencesPanel;

    function updateMerchColorPrefStyle(checkbox) {
      const label = checkbox.closest('label');
      if (label) {
        if (checkbox.checked) {
          label.style.borderColor = 'var(--accent-gold)';
          label.style.background = 'var(--accent-gold-soft)';
        } else {
          label.style.borderColor = 'transparent';
          label.style.background = 'var(--bg-input)';
        }
      }
    }

    document.addEventListener('change', (e) => {
      if (e.target.closest('.merch-color-pref')) {
        updateMerchColorPrefStyle(e.target);
      }
    });

    async function getAdminAuthHeader() {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session?.access_token) {
          return { 'Authorization': `Bearer ${session.access_token}` };
        }
      } catch (_) {}
      const headers = {};
      if (adminTeamToken) headers['x-admin-token'] = adminTeamToken;
      else if (adminPasswordVerified || localStorage.getItem('mcc_admin_pass')) {
        headers['x-admin-password'] = localStorage.getItem('mcc_admin_pass') || adminPasswordVerified || '';
      }
      if (!headers['Authorization'] && !headers['x-admin-token'] && !headers['x-admin-password']) {
        throw new Error('Not authenticated');
      }
      return headers;
    }

    async function loadPrintfulCatalog() {
      const loadingEl = document.getElementById('catalog-loading');
      const emptyEl = document.getElementById('catalog-empty');
      const gridEl = document.getElementById('catalog-grid');
      const filterEl = document.getElementById('catalog-category-filter');
      
      loadingEl.style.display = 'block';
      emptyEl.style.display = 'none';
      gridEl.style.display = 'none';
      
      try {
        const headers = await getAdminAuthHeader();
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/printful/catalog`, { headers });
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to load catalog');
        }
        
        printfulCatalog = data.products;
        
        filterEl.innerHTML = '<option value="all">All Categories</option>';
        (data.categories || []).forEach(cat => {
          filterEl.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
        });
        
        renderCatalog();
      } catch (error) {
        console.error('Error loading catalog:', error);
        showToast('Error loading catalog: ' + error.message, 'error');
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
      }
    }
    window.loadPrintfulCatalog = loadPrintfulCatalog;

    function renderCatalog(filter = 'all') {
      const loadingEl = document.getElementById('catalog-loading');
      const emptyEl = document.getElementById('catalog-empty');
      const gridEl = document.getElementById('catalog-grid');
      
      loadingEl.style.display = 'none';
      
      const filtered = filter === 'all' ? printfulCatalog : printfulCatalog.filter(p => p.category === filter);
      
      if (filtered.length === 0) {
        emptyEl.style.display = 'block';
        gridEl.style.display = 'none';
        return;
      }
      
      emptyEl.style.display = 'none';
      gridEl.style.display = 'grid';
      
      gridEl.innerHTML = filtered.map(product => `
        <div style="background:var(--bg-card);border:1px solid var(--border-light);border-radius:var(--radius-md);overflow:hidden;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;" onclick="openProductCreator(${product.id})" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.3)';" onmouseout="this.style.transform='none';this.style.boxShadow='none';">
          <div style="height:160px;background:var(--bg-input);display:flex;align-items:center;justify-content:center;overflow:hidden;">
            <img src="${product.image}" alt="${product.title}" style="max-width:100%;max-height:100%;object-fit:contain;" loading="lazy">
          </div>
          <div style="padding:14px;">
            <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${product.title}</div>
            <div style="font-size:0.8rem;color:var(--text-muted);">${product.category}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">${product.variantCount} variants</div>
          </div>
        </div>
      `).join('');
    }

    function filterCatalogByCategory() {
      const filter = document.getElementById('catalog-category-filter').value;
      renderCatalog(filter);
    }
    window.filterCatalogByCategory = filterCatalogByCategory;

    async function openProductCreator(catalogProductId) {
      const modal = document.getElementById('product-creator-modal');
      const loadingEl = document.getElementById('product-creator-loading');
      const formEl = document.getElementById('product-creator-form');
      const submitBtn = document.getElementById('product-creator-submit');
      
      modal.style.display = 'flex';
      loadingEl.style.display = 'block';
      formEl.style.display = 'none';
      submitBtn.disabled = true;
      
      selectedColors.clear();
      selectedSizes.clear();
      productVariantsMap = {};
      
      try {
        const headers = await getAdminAuthHeader();
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/printful/catalog/${catalogProductId}`, { headers });
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to load product');
        }
        
        currentCatalogProduct = data.product;
        
        document.getElementById('product-creator-title').textContent = data.product.title;
        document.getElementById('product-creator-image').src = data.product.image;
        document.getElementById('product-creator-name').value = 'MCC ' + data.product.title;
        document.getElementById('product-creator-price').value = getMerchDefaultPrice();
        
        const favoriteColors = getMerchDefaultColors();
        const colorsEl = document.getElementById('product-creator-colors');
        colorsEl.innerHTML = data.product.colors.map(c => {
          const isFavorite = favoriteColors.includes(c.name);
          if (isFavorite) {
            selectedColors.add(c.name);
          }
          return `
          <button type="button" class="color-option" data-color="${c.name}" onclick="toggleColorSelection(this, '${c.name}')" style="padding:8px 14px;border-radius:20px;border:2px solid ${isFavorite ? 'var(--accent-gold)' : 'var(--border-light)'};background:${isFavorite ? 'var(--accent-gold-soft)' : 'var(--bg-input)'};cursor:pointer;display:flex;align-items:center;gap:8px;transition:all 0.15s;">
            <span style="width:16px;height:16px;border-radius:50%;background:${c.code || '#888'};border:1px solid rgba(255,255,255,0.2);"></span>
            <span>${c.name}</span>
          </button>
        `;
        }).join('');
        
        const sizesEl = document.getElementById('product-creator-sizes');
        if (data.product.sizes.length > 0) {
          sizesEl.innerHTML = data.product.sizes.map(s => `
            <button type="button" class="size-option" data-size="${s}" onclick="toggleSizeSelection(this, '${s}')" style="padding:8px 16px;border-radius:8px;border:2px solid var(--border-light);background:var(--bg-input);cursor:pointer;min-width:50px;transition:all 0.15s;">
              ${s}
            </button>
          `).join('');
          sizesEl.parentElement.style.display = 'block';
        } else {
          sizesEl.parentElement.style.display = 'none';
        }
        
        data.product.variants.forEach(v => {
          const key = `${v.color || 'default'}|${v.size || 'default'}`;
          productVariantsMap[key] = v.id;
        });
        
        loadingEl.style.display = 'none';
        formEl.style.display = 'block';
        updateVariantCount();
        renderModalDesignGallery();
      } catch (error) {
        console.error('Error loading product:', error);
        showToast('Error loading product: ' + error.message, 'error');
        closeProductCreatorModal();
      }
    }
    window.openProductCreator = openProductCreator;

    function toggleColorSelection(btn, color) {
      if (selectedColors.has(color)) {
        selectedColors.delete(color);
        btn.style.borderColor = 'var(--border-light)';
        btn.style.background = 'var(--bg-input)';
      } else {
        selectedColors.add(color);
        btn.style.borderColor = 'var(--accent-gold)';
        btn.style.background = 'var(--accent-gold-soft)';
      }
      updateVariantCount();
    }
    window.toggleColorSelection = toggleColorSelection;

    function toggleSizeSelection(btn, size) {
      if (selectedSizes.has(size)) {
        selectedSizes.delete(size);
        btn.style.borderColor = 'var(--border-light)';
        btn.style.background = 'var(--bg-input)';
      } else {
        selectedSizes.add(size);
        btn.style.borderColor = 'var(--accent-gold)';
        btn.style.background = 'var(--accent-gold-soft)';
      }
      updateVariantCount();
    }
    window.toggleSizeSelection = toggleSizeSelection;

    function updateVariantCount() {
      const variantIds = getSelectedVariantIds();
      const infoEl = document.getElementById('product-creator-variants-info');
      const submitBtn = document.getElementById('product-creator-submit');
      
      infoEl.innerHTML = `<span style="font-weight:600;">${variantIds.length}</span> variants selected`;
      submitBtn.disabled = variantIds.length === 0;
    }

    function getSelectedVariantIds() {
      const variantIds = [];
      const colors = selectedColors.size > 0 ? Array.from(selectedColors) : ['default'];
      const sizes = selectedSizes.size > 0 ? Array.from(selectedSizes) : ['default'];
      
      for (const color of colors) {
        for (const size of sizes) {
          const key = `${color}|${size}`;
          if (productVariantsMap[key]) {
            variantIds.push(productVariantsMap[key]);
          }
        }
      }
      
      return variantIds;
    }

    async function submitProductCreation() {
      const submitBtn = document.getElementById('product-creator-submit');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';
      
      try {
        const name = document.getElementById('product-creator-name').value.trim();
        const price = document.getElementById('product-creator-price').value;
        const designUrl = document.getElementById('product-creator-design').value.trim();
        const variantIds = getSelectedVariantIds();
        
        if (!name) {
          throw new Error('Please enter a product name');
        }
        
        if (variantIds.length === 0) {
          throw new Error('Please select at least one color/size combination');
        }
        
        const authHeaders = await getAdminAuthHeader();
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/printful/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            name,
            variantIds,
            retailPrice: price,
            designUrl: designUrl || null,
            designPosition: 'front'
          })
        });
        
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to create product');
        }
        
        showToast(`Product created with ${data.product.variants} variants!`, 'success');
        closeProductCreatorModal();
        await refreshStoreProducts();
      } catch (error) {
        console.error('Error creating product:', error);
        showToast('Error: ' + error.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
    window.submitProductCreation = submitProductCreation;

    function closeProductCreatorModal() {
      document.getElementById('product-creator-modal').style.display = 'none';
      currentCatalogProduct = null;
      hideMockupPreview();
    }
    window.closeProductCreatorModal = closeProductCreatorModal;

    async function generateMockupPreview() {
      const designUrl = document.getElementById('product-creator-design').value.trim();
      const variantIds = getSelectedVariantIds();
      
      if (!designUrl) {
        showToast('Please enter a design URL first', 'error');
        return;
      }
      
      if (variantIds.length === 0) {
        showToast('Please select at least one color variant', 'error');
        return;
      }
      
      if (!currentCatalogProduct) {
        showToast('Product not loaded', 'error');
        return;
      }
      
      const previewArea = document.getElementById('mockup-preview-area');
      const loadingEl = document.getElementById('mockup-preview-loading');
      const contentEl = document.getElementById('mockup-preview-content');
      const errorEl = document.getElementById('mockup-preview-error');
      const btn = document.getElementById('preview-mockup-btn');
      const btnText = document.getElementById('mockup-btn-text');
      
      previewArea.style.display = 'block';
      loadingEl.style.display = 'block';
      contentEl.style.display = 'none';
      errorEl.style.display = 'none';
      btn.disabled = true;
      btnText.innerHTML = mccIcon('clock', 16) + ' Loading...';
      
      try {
        const authHeaders = await getAdminAuthHeader();
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/printful/mockup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            productId: currentCatalogProduct.id,
            variantIds: [variantIds[0]],
            designUrl: designUrl
          })
        });
        
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to generate mockup');
        }
        
        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';
        document.getElementById('mockup-preview-image').src = data.mockupUrl;
        
      } catch (error) {
        console.error('Mockup generation error:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        document.getElementById('mockup-error-text').textContent = 'Error: ' + error.message;
      } finally {
        btn.disabled = false;
        btnText.innerHTML = mccIcon('eye', 16) + ' Preview';
      }
    }
    window.generateMockupPreview = generateMockupPreview;
    
    function hideMockupPreview() {
      const previewArea = document.getElementById('mockup-preview-area');
      if (previewArea) {
        previewArea.style.display = 'none';
      }
    }
    window.hideMockupPreview = hideMockupPreview;

    async function refreshStoreProducts() {
      const loadingEl = document.getElementById('store-products-loading');
      const emptyEl = document.getElementById('store-products-empty');
      const gridEl = document.getElementById('store-products-grid');
      
      loadingEl.style.display = 'block';
      emptyEl.style.display = 'none';
      gridEl.innerHTML = '';
      
      try {
        const headers = await getAdminAuthHeader();
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/printful/store-products`, { headers });
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to load store products');
        }
        
        printfulStoreProducts = data.products;
        loadingEl.style.display = 'none';
        
        if (printfulStoreProducts.length === 0) {
          emptyEl.style.display = 'block';
          return;
        }
        
        gridEl.innerHTML = printfulStoreProducts.map(product => `
          <div style="background:var(--bg-card);border:1px solid var(--border-light);border-radius:var(--radius-md);overflow:hidden;position:relative;">
            <div style="height:120px;background:var(--bg-input);display:flex;align-items:center;justify-content:center;overflow:hidden;">
              ${product.thumbnail ? `<img src="${product.thumbnail}" alt="${product.name}" style="max-width:100%;max-height:100%;object-fit:contain;">` : '<div style="font-size:48px;">' + mccIcon('package', 40) + '</div>'}
            </div>
            <div style="padding:12px;">
              <div style="font-weight:600;font-size:0.85rem;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${product.name}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${product.variants} variants</div>
            </div>
            <button onclick="deleteStoreProduct(${product.id}, '${product.name.replace(/'/g, "\\'")}')" style="position:absolute;top:8px;right:8px;width:28px;height:28px;border-radius:50%;background:rgba(239,95,95,0.9);border:none;color:white;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;">×</button>
          </div>
        `).join('');
      } catch (error) {
        console.error('Error loading store products:', error);
        showToast('Error: ' + error.message, 'error');
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
      }
    }
    window.refreshStoreProducts = refreshStoreProducts;

    async function deleteStoreProduct(productId, productName) {
      if (!confirm(`Delete "${productName}" from your store?`)) {
        return;
      }
      
      try {
        const headers = await getAdminAuthHeader();
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/printful/products/${productId}`, {
          method: 'DELETE',
          headers
        });
        
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to delete product');
        }
        
        showToast('Product deleted', 'success');
        await refreshStoreProducts();
      } catch (error) {
        console.error('Error deleting product:', error);
        showToast('Error: ' + error.message, 'error');
      }
    }
    window.deleteStoreProduct = deleteStoreProduct;

    // ========== BULK PRODUCT CREATOR ==========
    const BULK_CATEGORY_DEFAULTS = {
      24: { name: 'T-Shirt', productId: 71, defaultColors: ['Black', 'White', 'Navy'], defaultSizes: ['S', 'M', 'L', 'XL'] },
      55: { name: 'Hoodie', productId: 146, defaultColors: ['Black', 'White', 'Navy'], defaultSizes: ['S', 'M', 'L', 'XL'] },
      60: { name: 'Hat', productId: 206, defaultColors: ['Black', 'White', 'Navy'], defaultSizes: [] },
      82: { name: 'Mug', productId: 19, defaultColors: ['White'], defaultSizes: [] },
      57: { name: 'Tank Top', productId: 163, defaultColors: ['Black', 'White'], defaultSizes: ['S', 'M', 'L', 'XL'] },
      26: { name: 'Long Sleeve', productId: 116, defaultColors: ['Black', 'White', 'Navy'], defaultSizes: ['S', 'M', 'L', 'XL'] },
      52: { name: 'Sticker', productId: 358, defaultColors: [], defaultSizes: [] },
      73: { name: 'Phone Case', productId: 274, defaultColors: [], defaultSizes: [] },
      72: { name: 'Bag', productId: 308, defaultColors: ['Black'], defaultSizes: [] }
    };

    function openBulkCreatorModal() {
      const modal = document.getElementById('bulk-product-creator-modal');
      modal.style.display = 'flex';
      
      document.getElementById('bulk-creator-name').value = 'MCC';
      document.getElementById('bulk-creator-price').value = getMerchDefaultPrice();
      document.getElementById('bulk-creator-design').value = '';
      document.getElementById('bulk-creator-progress').style.display = 'none';
      document.getElementById('bulk-creator-submit').disabled = false;
      document.getElementById('bulk-creator-submit').textContent = 'Create Products';
      
      const checkboxes = document.querySelectorAll('.bulk-category-checkbox');
      checkboxes.forEach((cb, idx) => {
        cb.checked = idx < 4;
        updateCategoryLabelStyle(cb);
      });
      
      updateBulkCategoryCount();
      renderBulkModalDesignGallery();
    }
    window.openBulkCreatorModal = openBulkCreatorModal;

    function closeBulkCreatorModal() {
      document.getElementById('bulk-product-creator-modal').style.display = 'none';
    }
    window.closeBulkCreatorModal = closeBulkCreatorModal;

    function toggleAllCategories(checked) {
      const checkboxes = document.querySelectorAll('.bulk-category-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = checked;
        updateCategoryLabelStyle(cb);
      });
      updateBulkCategoryCount();
    }
    window.toggleAllCategories = toggleAllCategories;

    function updateCategoryLabelStyle(checkbox) {
      const label = checkbox.closest('label');
      if (label) {
        if (checkbox.checked) {
          label.style.borderColor = 'var(--accent-gold)';
          label.style.background = 'var(--accent-gold-soft)';
        } else {
          label.style.borderColor = 'transparent';
          label.style.background = 'var(--bg-input)';
        }
      }
    }

    function updateBulkCategoryCount() {
      const checkboxes = document.querySelectorAll('.bulk-category-checkbox:checked');
      const countEl = document.getElementById('bulk-category-count');
      if (countEl) {
        countEl.textContent = checkboxes.length;
      }
    }

    document.addEventListener('change', (e) => {
      if (e.target.classList.contains('bulk-category-checkbox')) {
        updateCategoryLabelStyle(e.target);
        updateBulkCategoryCount();
      }
    });

    function renderBulkModalDesignGallery() {
      const galleryEl = document.getElementById('bulk-modal-design-gallery');
      if (!galleryEl) return;
      
      if (designLibrary.length === 0) {
        galleryEl.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:0.8rem;">No designs uploaded. Upload designs in the Design Library section.</div>';
        return;
      }
      
      galleryEl.innerHTML = designLibrary.map(design => `
        <div onclick="selectBulkDesign('${design.url}')" style="width:60px;height:60px;border-radius:var(--radius-sm);overflow:hidden;cursor:pointer;border:2px solid var(--border-subtle);transition:all 0.15s;background:var(--bg-elevated);" onmouseover="this.style.borderColor='var(--accent-gold)';" onmouseout="if(!this.classList.contains('selected'))this.style.borderColor='var(--border-subtle)';">
          <img src="${design.url}" alt="${design.filename}" style="width:100%;height:100%;object-fit:contain;" loading="lazy">
        </div>
      `).join('');
    }

    function selectBulkDesign(url) {
      document.getElementById('bulk-creator-design').value = url;
      
      const gallery = document.getElementById('bulk-modal-design-gallery');
      if (gallery) {
        gallery.querySelectorAll('div').forEach(div => {
          div.classList.remove('selected');
          div.style.borderColor = 'var(--border-subtle)';
        });
        
        const selected = gallery.querySelector(`div[onclick*="${url}"]`);
        if (selected) {
          selected.classList.add('selected');
          selected.style.borderColor = 'var(--accent-gold)';
        }
      }
    }
    window.selectBulkDesign = selectBulkDesign;

    async function submitBulkCreation() {
      const submitBtn = document.getElementById('bulk-creator-submit');
      const progressEl = document.getElementById('bulk-creator-progress');
      const progressBar = document.getElementById('bulk-progress-bar');
      const progressText = document.getElementById('bulk-progress-text');
      const progressLog = document.getElementById('bulk-progress-log');
      
      const namePrefix = document.getElementById('bulk-creator-name').value.trim();
      const price = document.getElementById('bulk-creator-price').value;
      const designUrl = document.getElementById('bulk-creator-design').value.trim();
      
      if (!namePrefix) {
        showToast('Please enter a product name prefix', 'error');
        return;
      }
      
      const selectedCategories = [];
      document.querySelectorAll('.bulk-category-checkbox:checked').forEach(cb => {
        selectedCategories.push({
          categoryId: parseInt(cb.value),
          categoryName: cb.dataset.categoryName
        });
      });
      
      if (selectedCategories.length === 0) {
        showToast('Please select at least one category', 'error');
        return;
      }
      
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';
      progressEl.style.display = 'block';
      progressBar.style.width = '0%';
      progressText.textContent = `0 / ${selectedCategories.length}`;
      progressLog.innerHTML = '';
      
      const products = [];
      let completed = 0;
      
      for (const cat of selectedCategories) {
        const config = BULK_CATEGORY_DEFAULTS[cat.categoryId];
        if (!config) {
          progressLog.innerHTML += `<div style="color:var(--accent-orange);">${mccIcon('alert-triangle', 16)} Unknown category: ${cat.categoryName}</div>`;
          continue;
        }
        
        progressLog.innerHTML += `<div style="color:var(--text-muted);">${mccIcon('package', 16)} Fetching variants for ${cat.categoryName}...</div>`;
        progressLog.scrollTop = progressLog.scrollHeight;
        
        try {
          const headers = await getAdminAuthHeader();
          const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
          const response = await fetch(`${apiBase}/api/admin/printful/catalog/${config.productId}`, { headers });
          const data = await response.json();
          
          if (!data.success || !data.product) {
            throw new Error(data.error || 'Failed to load product data');
          }
          
          const variantIds = [];
          const variants = data.product.variants || [];
          
          for (const variant of variants) {
            const colorMatch = config.defaultColors.length === 0 || 
                               config.defaultColors.some(c => (variant.color || '').toLowerCase().includes(c.toLowerCase()));
            const sizeMatch = config.defaultSizes.length === 0 || 
                              config.defaultSizes.includes(variant.size);
            
            if (colorMatch && sizeMatch) {
              variantIds.push(variant.id);
            }
          }
          
          if (variantIds.length === 0 && variants.length > 0) {
            variantIds.push(...variants.slice(0, 5).map(v => v.id));
          }
          
          if (variantIds.length > 0) {
            products.push({
              catalogProductId: config.productId,
              productName: `${namePrefix} ${cat.categoryName}`,
              variantIds
            });
            progressLog.innerHTML += `<div style="color:var(--accent-green);">${mccIcon('check', 16)} ${cat.categoryName}: ${variantIds.length} variants</div>`;
          } else {
            progressLog.innerHTML += `<div style="color:var(--accent-orange);">${mccIcon('alert-triangle', 16)} ${cat.categoryName}: No variants found</div>`;
          }
        } catch (error) {
          progressLog.innerHTML += `<div style="color:var(--accent-red);">${mccIcon('x', 16)} ${cat.categoryName}: ${error.message}</div>`;
        }
        
        completed++;
        progressBar.style.width = `${(completed / selectedCategories.length) * 50}%`;
        progressLog.scrollTop = progressLog.scrollHeight;
      }
      
      if (products.length === 0) {
        showToast('No products could be prepared. Check the logs above.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Products';
        return;
      }
      
      progressLog.innerHTML += `<div style="color:var(--text-primary);font-weight:600;margin-top:8px;">Creating ${products.length} products...</div>`;
      progressLog.scrollTop = progressLog.scrollHeight;
      
      try {
        const headers = await getAdminAuthHeader();
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/printful/products/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            name: namePrefix,
            designUrl: designUrl || null,
            retailPrice: price,
            products
          })
        });
        
        const data = await response.json();
        
        progressBar.style.width = '100%';
        
        if (!data.success) {
          throw new Error(data.error || 'Bulk creation failed');
        }
        
        for (const result of data.results) {
          if (result.success) {
            progressLog.innerHTML += `<div style="color:var(--accent-green);">${mccIcon('check', 16)} Created: ${result.product.name} (${result.product.variants} variants)</div>`;
          } else {
            progressLog.innerHTML += `<div style="color:var(--accent-red);">${mccIcon('x', 16)} Failed: ${result.error}</div>`;
          }
        }
        
        progressLog.scrollTop = progressLog.scrollHeight;
        progressText.textContent = `${data.summary.succeeded} / ${data.summary.total} succeeded`;
        
        showToast(`Bulk creation complete: ${data.summary.succeeded} succeeded, ${data.summary.failed} failed`, 
                  data.summary.failed > 0 ? 'warning' : 'success');
        
        await refreshStoreProducts();
        
        submitBtn.textContent = 'Done!';
        setTimeout(() => {
          closeBulkCreatorModal();
        }, 2000);
      } catch (error) {
        console.error('Bulk creation error:', error);
        progressLog.innerHTML += `<div style="color:var(--accent-red);font-weight:600;">${mccIcon('x', 16)} Error: ${error.message}</div>`;
        showToast('Bulk creation failed: ' + error.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Retry';
      }
    }
    window.submitBulkCreation = submitBulkCreation;

    // ========== DESIGN LIBRARY ==========
    let designLibrary = [];

    async function loadDesignLibrary() {
      const loadingEl = document.getElementById('design-library-loading');
      const emptyEl = document.getElementById('design-library-empty');
      const gridEl = document.getElementById('design-library-grid');
      
      if (!loadingEl || !emptyEl || !gridEl) return;
      
      loadingEl.style.display = 'block';
      emptyEl.style.display = 'none';
      gridEl.style.display = 'none';
      
      try {
        const headers = await getAdminAuthHeader();
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/designs`, { headers });
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to load designs');
        }
        
        designLibrary = data.designs || [];
        loadingEl.style.display = 'none';
        
        if (designLibrary.length === 0) {
          emptyEl.style.display = 'block';
          return;
        }
        
        emptyEl.style.display = 'none';
        gridEl.style.display = 'grid';
        renderDesignLibrary();
      } catch (error) {
        console.error('Error loading designs:', error);
        showToast('Error loading designs: ' + error.message, 'error');
        loadingEl.style.display = 'none';
        emptyEl.style.display = 'block';
      }
    }
    window.loadDesignLibrary = loadDesignLibrary;

    function renderDesignLibrary() {
      const gridEl = document.getElementById('design-library-grid');
      if (!gridEl) return;
      
      gridEl.innerHTML = designLibrary.map(design => `
        <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);overflow:hidden;position:relative;">
          <div style="height:100px;background:var(--bg-input);display:flex;align-items:center;justify-content:center;overflow:hidden;padding:8px;">
            <img src="${design.url}" alt="${design.filename}" style="max-width:100%;max-height:100%;object-fit:contain;" loading="lazy">
          </div>
          <div style="padding:10px;">
            <div style="font-size:0.72rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:8px;" title="${design.filename}">${design.filename}</div>
            <div style="display:flex;gap:6px;">
              <button onclick="copyDesignUrl('${design.url}')" style="flex:1;padding:6px;border:none;border-radius:var(--radius-sm);background:var(--accent-blue-soft);color:var(--accent-blue);cursor:pointer;font-size:0.72rem;">${mccIcon('clipboard-list', 16)} Copy URL</button>
              <button onclick="deleteDesign('${encodeURIComponent(design.filename)}')" style="padding:6px 8px;border:none;border-radius:var(--radius-sm);background:var(--accent-red-soft);color:var(--accent-red);cursor:pointer;font-size:0.72rem;">${mccIcon('x', 16)}</button>
            </div>
          </div>
        </div>
      `).join('');
    }

    async function uploadDesign(file) {
      if (!file) return;
      
      const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
      if (!allowedTypes.includes(file.type)) {
        showToast('Invalid file type. Use PNG, JPEG, WebP, or SVG.', 'error');
        return;
      }
      
      if (file.size > 10 * 1024 * 1024) {
        showToast('File too large. Max size is 10MB.', 'error');
        return;
      }
      
      showToast('Uploading design...', 'info');
      
      try {
        const headers = await getAdminAuthHeader();
        const formData = new FormData();
        formData.append('file', file);
        
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/designs/upload`, {
          method: 'POST',
          headers: headers,
          body: formData
        });
        
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Upload failed');
        }
        
        showToast('Design uploaded successfully!', 'success');
        await loadDesignLibrary();
      } catch (error) {
        console.error('Upload error:', error);
        showToast('Upload failed: ' + error.message, 'error');
      }
    }
    window.uploadDesign = uploadDesign;

    async function deleteDesign(encodedFilename) {
      const filename = decodeURIComponent(encodedFilename);
      if (!confirm(`Delete design "${filename}"?`)) return;
      
      try {
        const headers = await getAdminAuthHeader();
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/designs/${encodedFilename}`, {
          method: 'DELETE',
          headers
        });
        
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Delete failed');
        }
        
        showToast('Design deleted', 'success');
        await loadDesignLibrary();
      } catch (error) {
        console.error('Delete error:', error);
        showToast('Delete failed: ' + error.message, 'error');
      }
    }
    window.deleteDesign = deleteDesign;

    function copyDesignUrl(url) {
      navigator.clipboard.writeText(url).then(() => {
        showToast('URL copied to clipboard!', 'success');
      }).catch(err => {
        console.error('Copy failed:', err);
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('URL copied to clipboard!', 'success');
      });
    }
    window.copyDesignUrl = copyDesignUrl;

    function triggerDesignUpload() {
      document.getElementById('design-upload-input').click();
    }
    window.triggerDesignUpload = triggerDesignUpload;

    function handleDesignFileSelect(event) {
      const file = event.target.files[0];
      if (file) {
        uploadDesign(file);
      }
      event.target.value = '';
    }
    window.handleDesignFileSelect = handleDesignFileSelect;

    function handleDesignDragOver(event) {
      event.preventDefault();
      event.stopPropagation();
      const dropZone = document.getElementById('design-drop-zone');
      if (dropZone) {
        dropZone.style.borderColor = 'var(--accent-gold)';
        dropZone.style.background = 'var(--accent-gold-soft)';
      }
    }
    window.handleDesignDragOver = handleDesignDragOver;

    function handleDesignDragLeave(event) {
      event.preventDefault();
      event.stopPropagation();
      const dropZone = document.getElementById('design-drop-zone');
      if (dropZone) {
        dropZone.style.borderColor = 'var(--border-subtle)';
        dropZone.style.background = 'transparent';
      }
    }
    window.handleDesignDragLeave = handleDesignDragLeave;

    function handleDesignDrop(event) {
      event.preventDefault();
      event.stopPropagation();
      const dropZone = document.getElementById('design-drop-zone');
      if (dropZone) {
        dropZone.style.borderColor = 'var(--border-subtle)';
        dropZone.style.background = 'transparent';
      }
      
      const files = event.dataTransfer.files;
      if (files.length > 0) {
        uploadDesign(files[0]);
      }
    }
    window.handleDesignDrop = handleDesignDrop;

    function selectDesignForProduct(url) {
      const designInput = document.getElementById('product-creator-design');
      if (designInput) {
        designInput.value = url;
        showToast('Design selected', 'success');
      }
    }
    window.selectDesignForProduct = selectDesignForProduct;

    function renderModalDesignGallery() {
      const galleryEl = document.getElementById('modal-design-gallery');
      if (!galleryEl) return;
      
      if (designLibrary.length === 0) {
        galleryEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem;margin:0;">No designs uploaded yet. Upload designs in the Design Library above.</p>';
        return;
      }
      
      galleryEl.innerHTML = designLibrary.map(design => `
        <div onclick="selectDesignForProduct('${design.url}')" style="width:60px;height:60px;border:2px solid var(--border-subtle);border-radius:var(--radius-sm);overflow:hidden;cursor:pointer;transition:all 0.15s;flex-shrink:0;" onmouseover="this.style.borderColor='var(--accent-gold)'" onmouseout="this.style.borderColor='var(--border-subtle)'">
          <img src="${design.url}" alt="${design.filename}" style="width:100%;height:100%;object-fit:contain;" loading="lazy">
        </div>
      `).join('');
    }
    window.renderModalDesignGallery = renderModalDesignGallery;

    async function loadChatInsights() {
      try {
        const resp = await fetch('/api/admin/chat-insights', {
          headers: getAdminHeaders()
        });
        if (!resp.ok) throw new Error('Failed to load chat insights');
        const data = await resp.json();
        
        document.getElementById('chat-stat-total-sessions').textContent = data.totalSessions || 0;
        document.getElementById('chat-stat-total-messages').textContent = data.totalMessages || 0;
        document.getElementById('chat-stat-thumbs-up').textContent = data.thumbsUp || 0;
        document.getElementById('chat-stat-thumbs-down').textContent = data.thumbsDown || 0;
        document.getElementById('chat-mode-driver').textContent = data.modeCount?.driver || 0;
        document.getElementById('chat-mode-provider').textContent = data.modeCount?.provider || 0;
        document.getElementById('chat-mode-education').textContent = data.modeCount?.education || 0;
        
        const activityEl = document.getElementById('chat-recent-activity');
        if (data.recentActivity && data.recentActivity.length > 0) {
          activityEl.innerHTML = data.recentActivity.map(a => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid var(--border-subtle);">
              <div>
                <span style="color:var(--text-primary);font-weight:500;">${escapeHtml(a.mode)} session</span>
                <span style="color:var(--text-muted);font-size:0.85rem;margin-left:8px;">${a.messageCount} messages</span>
              </div>
              <div style="color:var(--text-secondary);font-size:0.85rem;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(a.lastMessage)}</div>
            </div>
          `).join('');
        } else {
          activityEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">No chat activity yet. Sessions appear here once users interact with the AI assistant.</p>';
        }
        
        const feedbackEl = document.getElementById('chat-feedback-list');
        feedbackEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">Feedback is stored locally on each user\'s device. Aggregate feedback tracking will be available in a future update.</p>';
        
      } catch (err) {
        console.error('Failed to load chat insights:', err);
      }
    }

    // ========== TEAM LOGIN & ROLE-BASED ACCESS ==========
    function getAdminHeaders() {
      const headers = { 'Content-Type': 'application/json' };
      if (adminTeamToken) headers['x-admin-token'] = adminTeamToken;
      else if (adminPasswordVerified) headers['x-admin-password'] = adminPasswordVerified;
      return headers;
    }

    async function performTeamLogin() {
      const email = document.getElementById('team-login-email')?.value?.trim();
      const password = document.getElementById('team-login-password')?.value;
      const errorEl = document.getElementById('team-login-error');
      const btn = document.getElementById('admin-modal-btn');
      
      if (!email || !password) {
        if (errorEl) { errorEl.textContent = 'Please enter email and password.'; errorEl.style.display = 'block'; }
        return;
      }
      
      btn.textContent = 'Signing in...';
      btn.disabled = true;
      if (errorEl) errorEl.style.display = 'none';
      
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/team-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        
        if (!response.ok || !data.success) {
          if (errorEl) { errorEl.textContent = data.error || 'Login failed'; errorEl.style.display = 'block'; }
          btn.textContent = 'Sign In';
          btn.disabled = false;
          return;
        }
        
        adminTeamToken = data.token;
        adminTeamUser = data.user;
        adminPermissions = data.permissions;
        adminPasswordVerified = false;
        // Expose to window + localStorage so external helper scripts (e.g.
        // www/admin-agent-activity.js) can read the same credential when
        // assembling auth headers. Mirrors how mcc_admin_pass is persisted.
        try {
          window.adminTeamToken = data.token;
          if (data.token) localStorage.setItem('adminTeamToken', data.token);
        } catch (e) {}
        
        document.getElementById('admin-password-modal').style.display = 'none';
        applyRolePermissions(data.permissions);
        await loadAllData();
        setupEventListeners();
      } catch (err) {
        if (errorEl) { errorEl.textContent = 'Login failed. Please try again.'; errorEl.style.display = 'block'; }
        btn.textContent = 'Sign In';
        btn.disabled = false;
      }
    }
    window.performTeamLogin = performTeamLogin;

    function showTeamLoginMode(e) {
      if (e) e.preventDefault();
      showModalState('team-login');
    }
    window.showTeamLoginMode = showTeamLoginMode;

    function showAdminLoginMode(e) {
      if (e) e.preventDefault();
      showModalState(currentUser ? 'password' : 'login');
    }
    window.showAdminLoginMode = showAdminLoginMode;

    function applyRolePermissions(permissions) {
      const navItems = document.querySelectorAll('.nav-item[data-section]');
      const navLabels = document.querySelectorAll('.nav-label');
      
      if (!permissions) {
        navItems.forEach(item => item.style.display = '');
        navLabels.forEach(label => label.style.display = '');
        return;
      }
      
      navItems.forEach(item => {
        const section = item.dataset.section;
        if (permissions.includes(section)) {
          item.style.display = '';
        } else {
          item.style.display = 'none';
        }
      });
      
      navLabels.forEach(label => {
        let next = label.nextElementSibling;
        let hasVisible = false;
        while (next && !next.classList.contains('nav-label')) {
          if (next.classList.contains('nav-item') && next.style.display !== 'none') {
            hasVisible = true;
            break;
          }
          next = next.nextElementSibling;
        }
        label.style.display = hasVisible ? '' : 'none';
      });
      
      const userInfo = document.createElement('div');
      const existingInfo = document.getElementById('admin-role-badge');
      if (existingInfo) existingInfo.remove();
      if (adminTeamUser) {
        const badge = document.createElement('div');
        badge.id = 'admin-role-badge';
        badge.style.cssText = 'padding:12px 16px;margin-bottom:12px;background:var(--accent-blue-soft);border-radius:var(--radius-md);text-align:center;';
        const roleLabel = (adminTeamUser.role || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        badge.innerHTML = `<div style="font-weight:600;color:var(--text-primary);font-size:0.9rem;">${escapeHtml(adminTeamUser.displayName)}</div><div style="font-size:0.8rem;color:var(--accent-gold);margin-top:4px;">${escapeHtml(roleLabel)}</div>`;
        const sidebarNav = document.querySelector('.sidebar-nav');
        if (sidebarNav) sidebarNav.insertBefore(badge, sidebarNav.firstChild);
      }
    }

    // ========== TEAM MANAGEMENT ==========
    let teamMembers = [];

    async function loadTeamMembers() {
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/team-members`, { headers: getAdminHeaders() });
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        teamMembers = Array.isArray(data) ? data : (data.members || []);
        renderTeamMembers();
        loadPendingInvites();
      } catch (err) {
        console.error('Failed to load team members:', err);
        document.getElementById('team-members-body').innerHTML = '<tr><td colspan="6" class="loading-cell">Failed to load team members</td></tr>';
      }
    }

    function renderTeamMembers() {
      const tbody = document.getElementById('team-members-body');
      if (!tbody) return;
      
      const total = teamMembers.length;
      const active = teamMembers.filter(m => m.status === 'active').length;
      const disabled = total - active;
      const roles = new Set(teamMembers.map(m => m.role));
      
      const totalEl = document.getElementById('team-total');
      const activeEl = document.getElementById('team-active');
      const disabledEl = document.getElementById('team-disabled');
      const rolesEl = document.getElementById('team-roles-count');
      if (totalEl) totalEl.textContent = total;
      if (activeEl) activeEl.textContent = active;
      if (disabledEl) disabledEl.textContent = disabled;
      if (rolesEl) rolesEl.textContent = roles.size;
      
      if (teamMembers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No team members yet. Click "Add Team Member" to get started.</td></tr>';
        return;
      }
      
      const roleBadgeClass = {
        super_admin: 'badge-green',
        crm_manager: 'badge-blue',
        marketing: 'badge-purple',
        operations: 'badge-orange',
        finance: 'badge-gold',
        support: 'badge-teal'
      };
      
      tbody.innerHTML = teamMembers.map(m => {
        const roleLabel = (m.role || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const badgeClass = roleBadgeClass[m.role] || 'badge-blue';
        const statusBadge = m.status === 'active' ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Disabled</span>';
        const lastLogin = m.last_login ? new Date(m.last_login).toLocaleDateString() + ' ' + new Date(m.last_login).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : 'Never';
        return `<tr>
          <td>${escapeHtml(m.display_name)}</td>
          <td>${escapeHtml(m.email)}</td>
          <td><span class="badge ${badgeClass}">${escapeHtml(roleLabel)}</span></td>
          <td>${statusBadge}</td>
          <td>${lastLogin}</td>
          <td>
            <button class="btn btn-secondary" style="padding:6px 12px;font-size:0.8rem;" onclick="editTeamMember('${m.id}')">Edit</button>
            <button class="btn btn-secondary" style="padding:6px 12px;font-size:0.8rem;color:var(--accent-red);" onclick="deleteTeamMember('${m.id}', '${escapeHtml(m.display_name)}')">Remove</button>
          </td>
        </tr>`;
      }).join('');
    }

    function showAddTeamMemberModal() {
      document.getElementById('team-add-name').value = '';
      document.getElementById('team-add-email').value = '';
      document.getElementById('team-add-password').value = '';
      document.getElementById('team-add-role').value = 'crm_manager';
      document.getElementById('team-add-error').style.display = 'none';
      document.getElementById('add-team-member-modal').style.display = 'flex';
    }
    window.showAddTeamMemberModal = showAddTeamMemberModal;

    function closeTeamMemberModal() {
      document.getElementById('add-team-member-modal').style.display = 'none';
    }
    window.closeTeamMemberModal = closeTeamMemberModal;

    async function addTeamMember() {
      const name = document.getElementById('team-add-name').value.trim();
      const email = document.getElementById('team-add-email').value.trim();
      const password = document.getElementById('team-add-password').value;
      const role = document.getElementById('team-add-role').value;
      const errorEl = document.getElementById('team-add-error');
      const btn = document.getElementById('team-add-btn');
      
      if (!name || !email || !password || !role) {
        errorEl.textContent = 'All fields are required.';
        errorEl.style.display = 'block';
        return;
      }
      if (password.length < 8) {
        errorEl.textContent = 'Password must be at least 8 characters.';
        errorEl.style.display = 'block';
        return;
      }
      
      btn.textContent = 'Adding...';
      btn.disabled = true;
      errorEl.style.display = 'none';
      
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/team-members`, {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({ email, password, display_name: name, role })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to add member');
        
        showToast(`${name} added as ${role.replace(/_/g, ' ')}`);
        closeTeamMemberModal();
        await loadTeamMembers();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      } finally {
        btn.textContent = 'Add Member';
        btn.disabled = false;
      }
    }
    window.addTeamMember = addTeamMember;

    function editTeamMember(id) {
      const member = teamMembers.find(m => m.id === id);
      if (!member) return;
      document.getElementById('team-edit-id').value = id;
      document.getElementById('team-edit-name').value = member.display_name;
      document.getElementById('team-edit-role').value = member.role;
      document.getElementById('team-edit-status').value = member.status;
      document.getElementById('team-edit-password').value = '';
      document.getElementById('team-edit-error').style.display = 'none';
      document.getElementById('edit-team-member-modal').style.display = 'flex';
    }
    window.editTeamMember = editTeamMember;

    function closeEditTeamModal() {
      document.getElementById('edit-team-member-modal').style.display = 'none';
    }
    window.closeEditTeamModal = closeEditTeamModal;

    async function saveTeamMember() {
      const id = document.getElementById('team-edit-id').value;
      const name = document.getElementById('team-edit-name').value.trim();
      const role = document.getElementById('team-edit-role').value;
      const status = document.getElementById('team-edit-status').value;
      const password = document.getElementById('team-edit-password').value;
      const errorEl = document.getElementById('team-edit-error');
      const btn = document.getElementById('team-edit-btn');
      
      if (!name) {
        errorEl.textContent = 'Display name is required.';
        errorEl.style.display = 'block';
        return;
      }
      if (password && password.length < 8) {
        errorEl.textContent = 'Password must be at least 8 characters.';
        errorEl.style.display = 'block';
        return;
      }
      
      btn.textContent = 'Saving...';
      btn.disabled = true;
      errorEl.style.display = 'none';
      
      try {
        const body = { display_name: name, role, status };
        if (password) body.password = password;
        
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/team-members/${id}`, {
          method: 'PUT',
          headers: getAdminHeaders(),
          body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to update');
        
        showToast('Team member updated');
        closeEditTeamModal();
        await loadTeamMembers();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      } finally {
        btn.textContent = 'Save Changes';
        btn.disabled = false;
      }
    }
    window.saveTeamMember = saveTeamMember;

    async function deleteTeamMember(id, name) {
      if (!confirm(`Are you sure you want to remove ${name} from the team? This cannot be undone.`)) return;
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/team-members/${id}`, {
          method: 'DELETE',
          headers: getAdminHeaders()
        });
        if (!response.ok) throw new Error('Failed to delete');
        showToast(`${name} removed from team`);
        await loadTeamMembers();
      } catch (err) {
        showToast('Failed to remove team member', 'error');
      }
    }
    window.deleteTeamMember = deleteTeamMember;

    // ========== TEAM INVITES ==========
    let currentInviteId = null;
    let currentInviteUrl = null;

    function showInviteModal() {
      document.getElementById('invite-email').value = '';
      document.getElementById('invite-role').value = 'crm_manager';
      document.getElementById('invite-error').style.display = 'none';
      document.getElementById('invite-result').style.display = 'none';
      document.getElementById('invite-send-status').textContent = '';
      document.getElementById('invite-generate-btn').style.display = '';
      document.getElementById('invite-send-btn').style.display = 'none';
      const smsBtn = document.getElementById('invite-sms-btn');
      if (smsBtn) smsBtn.style.display = 'none';
      currentInviteId = null;
      currentInviteUrl = null;
      document.getElementById('invite-team-member-modal').style.display = 'flex';
    }
    window.showInviteModal = showInviteModal;

    function closeInviteModal() {
      document.getElementById('invite-team-member-modal').style.display = 'none';
      if (currentInviteId) loadPendingInvites();
    }
    window.closeInviteModal = closeInviteModal;

    async function generateInvite() {
      const email = document.getElementById('invite-email').value.trim();
      const role = document.getElementById('invite-role').value;
      const errorEl = document.getElementById('invite-error');
      const btn = document.getElementById('invite-generate-btn');

      if (!email) {
        errorEl.textContent = 'Please enter an email address.';
        errorEl.style.display = 'block';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Generating...';
      errorEl.style.display = 'none';

      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/team-invites`, {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({ email, role })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to generate invite');

        currentInviteId = data.invite.id;
        currentInviteUrl = data.inviteUrl;
        document.getElementById('invite-link-display').value = data.inviteUrl;
        document.getElementById('invite-result').style.display = 'block';
        document.getElementById('invite-generate-btn').style.display = 'none';
        document.getElementById('invite-send-btn').style.display = '';
        document.getElementById('invite-sms-btn').style.display = '';
        showToast('Invite generated successfully');
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Generate Invite';
      }
    }
    window.generateInvite = generateInvite;

    function copyInviteLink() {
      const linkEl = document.getElementById('invite-link-display');
      if (linkEl && linkEl.value) {
        navigator.clipboard.writeText(linkEl.value).then(() => {
          showToast('Invite link copied to clipboard');
        }).catch(() => {
          linkEl.select();
          document.execCommand('copy');
          showToast('Invite link copied');
        });
      }
    }
    window.copyInviteLink = copyInviteLink;

    async function sendInviteEmail() {
      if (!currentInviteId) return;
      const btn = document.getElementById('invite-send-btn');
      const statusEl = document.getElementById('invite-send-status');
      btn.disabled = true;
      btn.textContent = 'Sending...';
      statusEl.textContent = '';

      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/team-invites/${currentInviteId}/send-email`, {
          method: 'POST',
          headers: getAdminHeaders()
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to send email');
        statusEl.innerHTML = '<span style="color:var(--accent-green);">✓ Email sent successfully</span>';
        showToast('Invite email sent');
      } catch (err) {
        statusEl.innerHTML = '<span style="color:var(--accent-red);">✗ ' + escapeHtml(err.message) + '</span>';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send via Email';
      }
    }
    window.sendInviteEmail = sendInviteEmail;

    function showSmsSendDialog() {
      if (!currentInviteId) return;
      const statusEl = document.getElementById('invite-send-status');
      statusEl.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;margin-top:8px;">
          <input type="tel" id="invite-sms-phone" placeholder="+1 (555) 123-4567" style="flex:1;padding:8px 12px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);font-size:0.9rem;" />
          <button class="btn btn-primary" onclick="sendInviteSms()" style="background:#2d8a6e;white-space:nowrap;">Send SMS</button>
        </div>
      `;
      const phoneInput = document.getElementById('invite-sms-phone');
      if (phoneInput) phoneInput.focus();
    }
    window.showSmsSendDialog = showSmsSendDialog;

    async function sendInviteSms() {
      if (!currentInviteId) return;
      const phoneInput = document.getElementById('invite-sms-phone');
      const phone = phoneInput ? phoneInput.value.trim() : '';
      const statusEl = document.getElementById('invite-send-status');

      if (!phone) {
        statusEl.innerHTML = '<span style="color:var(--accent-red);">Please enter a phone number</span>';
        return;
      }

      const smsBtn = document.getElementById('invite-sms-btn');
      if (smsBtn) { smsBtn.disabled = true; smsBtn.textContent = 'Sending...'; }

      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/team-invites/${currentInviteId}/send-sms`, {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to send SMS');
        statusEl.innerHTML = '<span style="color:var(--accent-green);">✓ SMS sent successfully</span>';
        showToast('Invite SMS sent');
      } catch (err) {
        statusEl.innerHTML = '<span style="color:var(--accent-red);">✗ ' + escapeHtml(err.message) + '</span>';
      } finally {
        if (smsBtn) { smsBtn.disabled = false; smsBtn.textContent = 'Send via SMS'; }
      }
    }
    window.sendInviteSms = sendInviteSms;

    async function loadPendingInvites() {
      const tbody = document.getElementById('pending-invites-body');
      if (!tbody) return;
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/team-invites`, { headers: getAdminHeaders() });
        if (!response.ok) throw new Error('Failed to fetch');
        const invites = await response.json();

        const roleBadgeClass = {
          super_admin: 'badge-green', crm_manager: 'badge-blue', marketing: 'badge-purple',
          operations: 'badge-orange', finance: 'badge-gold', support: 'badge-teal'
        };

        if (invites.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No pending invites</td></tr>';
          return;
        }

        tbody.innerHTML = invites.map(inv => {
          const roleLabel = (inv.role || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          const badgeClass = roleBadgeClass[inv.role] || 'badge-blue';
          const statusClass = inv.status === 'pending' ? 'badge-orange' : inv.status === 'accepted' ? 'badge-green' : 'badge-red';
          const statusLabel = inv.status.charAt(0).toUpperCase() + inv.status.slice(1);
          const created = new Date(inv.created_at).toLocaleDateString();
          const expires = new Date(inv.expires_at).toLocaleDateString() + ' ' + new Date(inv.expires_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
          const inviteUrl = inv.token ? `https://mycarconcierge.com/admin-invite.html?token=${inv.token}` : '';
          const copyBtn = inv.token && inv.status === 'pending'
            ? `<button class="btn btn-secondary btn-sm" onclick="copyInviteLinkUrl('${inviteUrl}')" style="font-size:0.78rem;" title="Copy invite link">Copy Link</button>`
            : '';
          const actions = inv.status === 'pending'
            ? `${copyBtn}
               <button class="btn btn-secondary btn-sm" onclick="resendInviteEmail('${inv.id}')" style="font-size:0.78rem;">Resend</button>
               <button class="btn btn-secondary btn-sm" onclick="revokeInvite('${inv.id}', '${escapeHtml(inv.email)}')" style="font-size:0.78rem;color:var(--accent-red);">Revoke</button>`
            : '-';
          return `<tr>
            <td>${escapeHtml(inv.email)}</td>
            <td><span class="badge ${badgeClass}">${escapeHtml(roleLabel)}</span></td>
            <td><span class="badge ${statusClass}">${statusLabel}</span></td>
            <td>${created}</td>
            <td>${expires}</td>
            <td>${actions}</td>
          </tr>`;
        }).join('');
      } catch (err) {
        console.error('Failed to load invites:', err);
        tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">Failed to load invites</td></tr>';
      }
    }

    async function resendInviteEmail(inviteId) {
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/team-invites/${inviteId}/send-email`, {
          method: 'POST',
          headers: getAdminHeaders()
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to send');
        showToast('Invite email resent');
      } catch (err) {
        showToast('Failed to resend: ' + err.message, 'error');
      }
    }
    window.resendInviteEmail = resendInviteEmail;

    async function revokeInvite(id, email) {
      if (!confirm(`Revoke invite for ${email}? They will no longer be able to use this invite link.`)) return;
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const response = await fetch(`${apiBase}/api/admin/team-invites/${id}`, {
          method: 'DELETE',
          headers: getAdminHeaders()
        });
        if (!response.ok) throw new Error('Failed to revoke');
        showToast('Invite revoked');
        await loadPendingInvites();
      } catch (err) {
        showToast('Failed to revoke invite', 'error');
      }
    }
    window.revokeInvite = revokeInvite;

    function getTeamApiUrl(endpoint) {
      const isNetlify = window.location.hostname.includes('netlify') ||
                        window.location.hostname === 'mycarconcierge.com' ||
                        window.location.hostname === 'www.mycarconcierge.com';
      if (isNetlify) {
        return `/.netlify/functions/admin-team/${endpoint}`;
      }
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      if (endpoint === 'members') return `${apiBase}/api/admin/team-members`;
      if (endpoint === 'invites') return `${apiBase}/api/admin/team-invites`;
      return `${apiBase}/api/admin/team-${endpoint}`;
    }

    let mktShareLinkUrl = null;
    let mktShareLinkGenEmail = null;

    function openMarketingShareModal() {
      const modal = document.getElementById('marketing-share-modal');
      if (!modal) return;
      document.getElementById('mkt-share-email').value = '';
      document.getElementById('mkt-share-invite-error').style.display = 'none';
      mktShareLinkUrl = null;
      mktShareLinkGenEmail = null;
      const copyText = document.getElementById('mkt-share-copy-text');
      if (copyText) copyText.textContent = 'Copy link';
      modal.style.display = 'flex';
      loadMarketingSharePeople();
    }
    window.openMarketingShareModal = openMarketingShareModal;
    const _mktShareBtn = document.getElementById('marketing-share-btn');
    if (_mktShareBtn) _mktShareBtn.addEventListener('click', openMarketingShareModal);

    function closeMarketingShareModal() {
      const modal = document.getElementById('marketing-share-modal');
      if (modal) modal.style.display = 'none';
    }
    window.closeMarketingShareModal = closeMarketingShareModal;

    async function loadMarketingSharePeople() {
      const container = document.getElementById('mkt-share-people-list');
      if (!container) return;
      container.innerHTML = '<div style="text-align:center;padding:20px;"><div style="width:24px;height:24px;border:2px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto;"></div></div>';
      try {
        const [membersRes, invitesRes] = await Promise.all([
          fetch(getTeamApiUrl('members'), { headers: getAdminHeaders() }),
          fetch(getTeamApiUrl('invites'), { headers: getAdminHeaders() })
        ]);
        if (!membersRes.ok) throw new Error('Load failed');
        const membersData = await membersRes.json();
        const allMembers = (membersData.members || membersData || []).filter(m =>
          m.role === 'marketing' || m.role === 'super_admin'
        );
        const currentEmail = window._adminEmail || '';
        let html = '';
        if (allMembers.length === 0 && (!invitesRes.ok)) {
          html = '<p style="color:var(--text-muted);text-align:center;padding:16px;font-size:0.88rem;">No collaborators yet. Add people above or share a link.</p>';
          container.innerHTML = html;
          return;
        }
        allMembers.forEach(m => {
          const isYou = currentEmail && m.email && m.email.toLowerCase() === currentEmail.toLowerCase();
          const isOwner = m.role === 'super_admin';
          const roleLabel = isOwner ? 'Owner' : 'Marketing';
          const initials = (m.displayName || m.email || '??').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
          const avatarColors = ['#4285f4','#ea4335','#34a853','#fbbc05','#8e24aa','#00acc1'];
          const colorIdx = (m.email || '').length % avatarColors.length;
          html += `<div style="display:flex;align-items:center;gap:12px;padding:8px 4px;">
            <div style="width:36px;height:36px;border-radius:50%;background:${avatarColors[colorIdx]};display:flex;align-items:center;justify-content:center;font-weight:600;color:#fff;font-size:0.82rem;flex-shrink:0;">${initials}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:0.88rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(m.displayName || m.email)}${isYou ? ' <span style="color:var(--text-muted);font-weight:400;">(you)</span>' : ''}</div>
              <div style="font-size:0.78rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(m.email || '')}</div>
            </div>
            <div style="font-size:0.82rem;color:var(--text-secondary);white-space:nowrap;">${roleLabel}</div>
          </div>`;
        });
        if (invitesRes.ok) {
          const invitesData = await invitesRes.json();
          const pendingMarketing = (invitesData.invites || invitesData || []).filter(inv => inv.role === 'marketing' && inv.status === 'pending');
          pendingMarketing.forEach(inv => {
            const initials = (inv.email || '??').substring(0, 2).toUpperCase();
            html += `<div style="display:flex;align-items:center;gap:12px;padding:8px 4px;">
              <div style="width:36px;height:36px;border-radius:50%;background:var(--border-subtle);display:flex;align-items:center;justify-content:center;font-weight:600;color:var(--text-muted);font-size:0.82rem;flex-shrink:0;">${initials}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:0.88rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(inv.email)}</div>
                <div style="font-size:0.78rem;color:var(--text-muted);">Invitation sent</div>
              </div>
              <div style="font-size:0.78rem;padding:2px 10px;border-radius:12px;background:var(--accent-gold-soft, rgba(251,188,5,0.15));color:var(--accent-gold);">Pending</div>
            </div>`;
          });
        }
        if (!html) {
          html = '<p style="color:var(--text-muted);text-align:center;padding:16px;font-size:0.88rem;">No collaborators yet. Add people above or share a link.</p>';
        }
        container.innerHTML = html;
      } catch (err) {
        container.innerHTML = `<p style="color:var(--accent-red);text-align:center;padding:16px;font-size:0.85rem;">Error loading: ${err.message}</p>`;
      }
    }

    async function sendMarketingInvite() {
      const emailInput = document.getElementById('mkt-share-email');
      const errorEl = document.getElementById('mkt-share-invite-error');
      const btn = document.getElementById('mkt-share-send-btn');
      const email = (emailInput?.value || '').trim();
      errorEl.style.display = 'none';
      if (!email || !email.includes('@')) {
        errorEl.textContent = 'Please enter a valid email address.';
        errorEl.style.display = 'block';
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Sending...';
      try {
        const res = await fetch(getTeamApiUrl('invites'), {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, role: 'marketing' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to send invite');
        emailInput.value = '';
        showToast(`Invite sent to ${email}`);
        loadMarketingSharePeople();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send invite';
      }
    }
    window.sendMarketingInvite = sendMarketingInvite;

    async function copyMarketingShareLink() {
      const copyText = document.getElementById('mkt-share-copy-text');
      const btn = document.getElementById('mkt-share-copy-btn');
      if (mktShareLinkUrl) {
        await clipboardCopy(mktShareLinkUrl);
        copyText.textContent = 'Copied!';
        setTimeout(() => { copyText.textContent = 'Copy link'; }, 2000);
        return;
      }
      btn.disabled = true;
      copyText.textContent = 'Generating...';
      try {
        const res = await fetch(getTeamApiUrl('invites'), {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'link-invite@mycarconcierge.com', role: 'marketing' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to generate link');
        const inviteUrl = data.inviteUrl || data.invite_url || data.link;
        if (!inviteUrl) throw new Error('No invite link returned');
        mktShareLinkUrl = inviteUrl;
        await clipboardCopy(inviteUrl);
        copyText.textContent = 'Copied!';
        setTimeout(() => { copyText.textContent = 'Copy link'; }, 2000);
        loadMarketingSharePeople();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
        copyText.textContent = 'Copy link';
      } finally {
        btn.disabled = false;
      }
    }
    window.copyMarketingShareLink = copyMarketingShareLink;

    async function clipboardCopy(text) {
      try {
        await navigator.clipboard.writeText(text);
      } catch (err) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    }

    let trafficDays = 7;

    document.querySelectorAll('.traffic-range').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.traffic-range').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        trafficDays = parseInt(btn.dataset.days);
        loadedSections['traffic'] = false;
        loadTrafficData();
      });
    });

    async function loadTrafficData() {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const headers = {};
      if (adminTeamToken) headers['x-admin-token'] = adminTeamToken;
      else if (adminPasswordVerified) headers['x-admin-password'] = localStorage.getItem('mcc_admin_pass') || '';

      try {
        const response = await fetch(`${apiBase}/api/analytics/data?days=${trafficDays}`, { headers });
        if (!response.ok) throw new Error('Failed to load traffic data');
        const data = await response.json();

        document.getElementById('traffic-total-views').textContent = (data.totalViews || 0).toLocaleString();
        document.getElementById('traffic-total-visitors').textContent = (data.totalVisitors || 0).toLocaleString();
        document.getElementById('traffic-active-now').textContent = (data.activeNow || 0).toLocaleString();

        const dailyData = data.dailyViews || [];
        const avgDaily = dailyData.length > 0 ? Math.round(dailyData.reduce((s, d) => s + d.views, 0) / dailyData.length) : 0;
        document.getElementById('traffic-avg-daily').textContent = avgDaily.toLocaleString();

        renderTrafficBarChart('traffic-daily-chart', dailyData, 'views', 'var(--accent-blue)');
        renderTrafficBarChart('traffic-visitors-chart', dailyData, 'visitors', 'var(--accent-green)');
        renderDeviceBreakdown(data.deviceBreakdown || {});
        renderTopPages(data.topPages || []);
        renderReferrals(data.referralSources || []);
      } catch (err) {
        console.error('Traffic data error:', err);
      }
    }

    function renderTrafficBarChart(containerId, data, field, color) {
      const container = document.getElementById(containerId);
      if (!container || !data.length) {
        if (container) container.innerHTML = '<p style="color:var(--text-muted);padding:20px;text-align:center;">No data available yet</p>';
        return;
      }
      const maxVal = Math.max(...data.map(d => d[field] || 0), 1);
      container.innerHTML = data.map(d => {
        const val = d[field] || 0;
        const height = Math.max((val / maxVal) * 200, 2);
        const dateLabel = d.date ? d.date.slice(5) : '';
        return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:20px;max-width:40px;" title="${d.date}: ${val}">
          <span style="font-size:10px;color:var(--text-muted);margin-bottom:4px;">${val}</span>
          <div style="width:100%;height:${height}px;background:${color};border-radius:4px 4px 0 0;min-height:2px;transition:height 0.3s;"></div>
          <span style="font-size:9px;color:var(--text-muted);margin-top:4px;transform:rotate(-45deg);white-space:nowrap;">${dateLabel}</span>
        </div>`;
      }).join('');
    }

    function renderDeviceBreakdown(devices) {
      const container = document.getElementById('traffic-device-breakdown');
      if (!container) return;
      const total = Object.values(devices).reduce((s, v) => s + v, 0);
      if (total === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center;">No data available yet</p>';
        return;
      }
      const labels = {
        ios_app: { name: 'iOS App', color: '#007AFF', icon: 'smartphone' },
        android_app: { name: 'Android App', color: '#34A853', icon: 'smartphone' },
        desktop_web: { name: 'Desktop Web', color: 'var(--accent-blue)', icon: 'monitor' },
        mobile_web: { name: 'Mobile Web', color: 'var(--accent-gold)', icon: 'smartphone' },
        unknown: { name: 'Unknown', color: 'var(--text-muted)', icon: 'help-circle' }
      };
      let html = '<div style="display:flex;flex-direction:column;gap:12px;">';
      for (const [key, count] of Object.entries(devices).sort((a, b) => b[1] - a[1])) {
        if (count === 0) continue;
        const pct = ((count / total) * 100).toFixed(1);
        const info = labels[key] || { name: key, color: 'var(--text-muted)', icon: 'help-circle' };
        html += `<div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="display:flex;align-items:center;gap:8px;"><span class="icon-inline" data-icon="${info.icon}"></span> ${info.name}</span>
            <span style="font-weight:600;">${count.toLocaleString()} (${pct}%)</span>
          </div>
          <div style="height:8px;background:var(--bg-elevated);border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${info.color};border-radius:4px;transition:width 0.3s;"></div>
          </div>
        </div>`;
      }
      html += '</div>';
      container.innerHTML = html;
      if (typeof mccIcon !== 'undefined') initInlineIcons(container);
    }

    function renderTopPages(pages) {
      const container = document.getElementById('traffic-top-pages');
      if (!container) return;
      if (!pages.length) {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:16px;">No data available yet</p>';
        return;
      }
      let html = '<table style="width:100%;border-collapse:collapse;"><thead><tr><th style="text-align:left;padding:10px 12px;border-bottom:1px solid var(--border-subtle);color:var(--text-muted);font-weight:500;">Page</th><th style="text-align:right;padding:10px 12px;border-bottom:1px solid var(--border-subtle);color:var(--text-muted);font-weight:500;">Views</th></tr></thead><tbody>';
      pages.forEach(p => {
        html += `<tr><td style="padding:10px 12px;border-bottom:1px solid var(--border-subtle);font-size:0.9rem;word-break:break-all;">${escapeHtml(p.page)}</td><td style="padding:10px 12px;border-bottom:1px solid var(--border-subtle);text-align:right;font-weight:600;">${p.views.toLocaleString()}</td></tr>`;
      });
      html += '</tbody></table>';
      container.innerHTML = html;
    }

    function renderReferrals(sources) {
      const container = document.getElementById('traffic-referrals');
      if (!container) return;
      if (!sources.length) {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:16px;">No data available yet</p>';
        return;
      }
      let html = '<table style="width:100%;border-collapse:collapse;"><thead><tr><th style="text-align:left;padding:10px 12px;border-bottom:1px solid var(--border-subtle);color:var(--text-muted);font-weight:500;">Source</th><th style="text-align:right;padding:10px 12px;border-bottom:1px solid var(--border-subtle);color:var(--text-muted);font-weight:500;">Visits</th></tr></thead><tbody>';
      sources.forEach(s => {
        html += `<tr><td style="padding:10px 12px;border-bottom:1px solid var(--border-subtle);font-size:0.9rem;word-break:break-all;">${escapeHtml(s.source)}</td><td style="padding:10px 12px;border-bottom:1px solid var(--border-subtle);text-align:right;font-weight:600;">${s.count.toLocaleString()}</td></tr>`;
      });
      html += '</tbody></table>';
      container.innerHTML = html;
    }

    let currentMktContent = '';
    let currentEmailHtml = '';
    let currentEmailSubject = '';
    let currentStrategyContent = '';
    let currentFundContent = '';

    document.querySelectorAll('.mo-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.mo-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.mo-panel').forEach(p => p.style.display = 'none');
        const panelId = 'mo-' + tab.dataset.tab;
        const panel = document.getElementById(panelId);
        if (panel) panel.style.display = 'block';
        if (tab.dataset.tab === 'growth-funnel') loadGrowthFunnel();
      });
    });

    async function generateSocialPosts() {
      const topic = document.getElementById('social-topic').value;
      if (!topic) { showToast('Please enter a topic', 'error'); return; }
      const platforms = [];
      document.querySelectorAll('.social-platform-cb:checked').forEach(cb => platforms.push(cb.value));
      if (platforms.length === 0) { showToast('Select at least one platform', 'error'); return; }
      const tone = document.getElementById('social-tone').value;
      const audience = document.getElementById('social-audience').value;
      const context = document.getElementById('social-context').value;
      const btn = document.getElementById('social-generate-btn');
      const output = document.getElementById('social-posts-output');
      btn.disabled = true;
      btn.textContent = 'Generating...';
      output.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);"><div style="width:32px;height:32px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px;"></div>Creating platform-optimized posts...</div>';
      try {
        const res = await fetch('/api/admin/marketing/generate', {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({
            type: 'social_post',
            topic,
            tone,
            audience,
            context: `Generate SEPARATE optimized posts for each of these platforms: ${platforms.join(', ')}. For each platform, follow its specific best practices:\n- Twitter/X: Max 280 characters, punchy, 2-3 relevant hashtags\n- Facebook: Conversational, can be longer (1-2 paragraphs), include a call to action, 3-5 hashtags\n- Instagram: Visual-focused caption, storytelling tone, 10-15 relevant hashtags at the end, include emoji\n- LinkedIn: Professional tone, thought leadership angle, 3-5 hashtags\n\nFormat your response with clear headers for each platform like:\n\n## X (Twitter)\n[post content]\n\n## Facebook\n[post content]\n\n## Instagram\n[post content]\n\n## LinkedIn\n[post content]\n\nAdditional context: ${context || 'None'}`,
            platform: 'general'
          })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        const content = data.content || data.result || '';
        const platformConfigs = {
          twitter: { name: 'X (Twitter)', icon: 'message-circle', color: '#1DA1F2', maxChars: 280 },
          facebook: { name: 'Facebook', icon: 'thumbs-up', color: '#1877F2', maxChars: null },
          instagram: { name: 'Instagram', icon: 'camera', color: '#E4405F', maxChars: null },
          linkedin: { name: 'LinkedIn', icon: 'briefcase', color: '#0A66C2', maxChars: null }
        };
        const sections = content.split(/##\s+/);
        let html = '';
        platforms.forEach(p => {
          const cfg = platformConfigs[p];
          let postContent = '';
          for (const sec of sections) {
            const lower = sec.toLowerCase();
            if ((p === 'twitter' && (lower.startsWith('x (twitter)') || lower.startsWith('twitter') || lower.startsWith('x\n'))) ||
                (p === 'facebook' && lower.startsWith('facebook')) ||
                (p === 'instagram' && lower.startsWith('instagram')) ||
                (p === 'linkedin' && lower.startsWith('linkedin'))) {
              postContent = sec.replace(/^[^\n]+\n/, '').trim();
              break;
            }
          }
          if (!postContent) postContent = content;
          const charInfo = cfg.maxChars ? ` <span style="color:${postContent.length > cfg.maxChars ? 'var(--accent-red)' : 'var(--text-muted)'};font-size:0.8rem;">${postContent.length}/${cfg.maxChars}</span>` : '';
          html += `<div style="border:1px solid var(--border-subtle);border-radius:var(--radius-md);overflow:hidden;">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--bg-elevated);border-bottom:1px solid var(--border-subtle);">
              <div style="display:flex;align-items:center;gap:8px;"><span style="width:10px;height:10px;border-radius:50%;background:${cfg.color};display:inline-block;"></span><strong>${cfg.name}</strong>${charInfo}</div>
              <div style="display:flex;gap:8px;">
                <button class="btn btn-sm" onclick="copySocialPost('${p}')"><span class="icon-inline" data-icon="clipboard"></span> Copy</button>
                <button class="btn btn-sm" onclick="saveSocialPost('${p}')"><span class="icon-inline" data-icon="bookmark"></span> Save</button>
              </div>
            </div>
            <div id="social-post-${p}" style="padding:16px;white-space:pre-wrap;font-size:0.95rem;line-height:1.6;color:var(--text-primary);">${postContent}</div>
          </div>`;
        });
        output.innerHTML = html;
      } catch(e) {
        output.innerHTML = `<p style="color:var(--accent-red);text-align:center;padding:40px;">Error: ${e.message}</p>`;
      }
      btn.disabled = false;
      btn.innerHTML = '<span class="icon-inline" data-icon="zap"></span> Generate Posts for All Platforms';
    }
    window.generateSocialPosts = generateSocialPosts;

    function copySocialPost(platform) {
      const el = document.getElementById('social-post-' + platform);
      if (el) { navigator.clipboard.writeText(el.textContent); showToast('Copied ' + platform + ' post'); }
    }
    window.copySocialPost = copySocialPost;

    function copyAllSocialPosts() {
      const posts = [];
      document.querySelectorAll('[id^="social-post-"]').forEach(el => {
        const platform = el.id.replace('social-post-', '').toUpperCase();
        posts.push(`--- ${platform} ---\n${el.textContent}`);
      });
      if (posts.length) { navigator.clipboard.writeText(posts.join('\n\n')); showToast('All posts copied'); }
    }
    window.copyAllSocialPosts = copyAllSocialPosts;

    function saveSocialPost(platform) {
      const el = document.getElementById('social-post-' + platform);
      if (!el) return;
      const saved = JSON.parse(localStorage.getItem('mcc_social_posts') || '[]');
      saved.unshift({ platform, content: el.textContent, date: new Date().toISOString() });
      if (saved.length > 50) saved.length = 50;
      localStorage.setItem('mcc_social_posts', JSON.stringify(saved));
      showToast('Post saved to history');
    }
    window.saveSocialPost = saveSocialPost;

    function loadSocialPostHistory() {
      const container = document.getElementById('social-post-history');
      if (!container) return;
      const saved = JSON.parse(localStorage.getItem('mcc_social_posts') || '[]');
      if (!saved.length) { container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">No posts saved yet.</p>'; return; }
      const platformColors = { twitter: '#1DA1F2', facebook: '#1877F2', instagram: '#E4405F', linkedin: '#0A66C2' };
      const platformNames = { twitter: 'X', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn' };
      container.innerHTML = saved.map((p, i) => `<div style="display:flex;gap:12px;align-items:flex-start;padding:12px;border-bottom:1px solid var(--border-subtle);${i === saved.length - 1 ? 'border:none;' : ''}">
        <span style="width:10px;height:10px;border-radius:50%;background:${platformColors[p.platform] || '#888'};flex-shrink:0;margin-top:6px;"></span>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <strong style="font-size:0.85rem;">${platformNames[p.platform] || p.platform}</strong>
            <span style="font-size:0.8rem;color:var(--text-muted);">${new Date(p.date).toLocaleDateString()}</span>
          </div>
          <div style="font-size:0.9rem;color:var(--text-secondary);white-space:pre-wrap;max-height:80px;overflow:hidden;text-overflow:ellipsis;">${p.content.substring(0, 200)}${p.content.length > 200 ? '...' : ''}</div>
        </div>
        <button class="btn btn-sm" onclick="navigator.clipboard.writeText(${JSON.stringify(p.content).replace(/'/g, "\\'")}); showToast('Copied');"><span class="icon-inline" data-icon="clipboard"></span></button>
      </div>`).join('');
    }
    window.loadSocialPostHistory = loadSocialPostHistory;

    function updatePlatformVisibility() {
      const type = document.getElementById('mkt-content-type')?.value;
      const platformWrap = document.getElementById('mkt-platform-wrap');
      if (platformWrap) {
        platformWrap.style.display = (type === 'social_post' || type === 'ad_copy') ? 'block' : 'none';
      }
    }
    if (document.getElementById('mkt-content-type')) {
      document.getElementById('mkt-content-type').addEventListener('change', updatePlatformVisibility);
    }

    async function initMarketingHub() {
      updatePlatformVisibility();
      await loadSavedCampaigns();
      // Task #139 — Hunter & Promoter activity strip at top of section.
      if (typeof window.renderAgentActivityPanel === 'function') {
        try { window.renderAgentActivityPanel('mo-agent-activity', {
          agentSlug: ['hunter', 'promoter'], limit: 15,
          title: 'Recent Hunter & Promoter Activity', showEmpty: true
        }); } catch (e) { console.warn('[admin] marketing agent panel failed:', e); }
      }
    }

    function getMarketingHeaders() {
      const headers = { 'Content-Type': 'application/json' };
      if (adminTeamToken) headers['x-admin-token'] = adminTeamToken;
      else if (adminPasswordVerified) headers['x-admin-password'] = localStorage.getItem('mcc_admin_pass') || '';
      return headers;
    }

    async function generateMarketingContent() {
      const type = document.getElementById('mkt-content-type').value;
      const platform = document.getElementById('mkt-platform').value;
      const topic = document.getElementById('mkt-topic').value;
      const tone = document.getElementById('mkt-tone').value;
      const audience = document.getElementById('mkt-audience').value;
      const context = document.getElementById('mkt-context').value;
      if (!topic) { showToast('Please enter a topic', 'error'); return; }
      const output = document.getElementById('mkt-output');
      const btn = document.getElementById('mkt-generate-btn');
      btn.disabled = true;
      btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 1s linear infinite;vertical-align:middle;margin-right:6px;"></span> Generating...';
      output.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;padding:60px;color:var(--text-muted);"><div style="width:32px;height:32px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;"></div><p style="margin-top:16px;">AI is crafting your content...</p></div>';
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/generate`, {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({ type, platform, topic, tone, targetAudience: audience, additionalContext: context })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Generation failed');
        currentMktContent = data.content;
        output.textContent = data.content;
      } catch (err) {
        output.innerHTML = '<p style="color:var(--accent-red);padding:20px;">Error: ' + escapeHtml(err.message) + '</p>';
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="icon-inline" data-icon="zap"></span> Generate Content';
        if (typeof initInlineIcons !== 'undefined') initInlineIcons(btn);
      }
    }
    window.generateMarketingContent = generateMarketingContent;

    function copyMarketingContent() {
      if (!currentMktContent) { showToast('No content to copy', 'error'); return; }
      navigator.clipboard.writeText(currentMktContent).then(() => showToast('Content copied to clipboard'));
    }
    window.copyMarketingContent = copyMarketingContent;

    async function saveMarketingContent() {
      if (!currentMktContent) { showToast('No content to save', 'error'); return; }
      const type = document.getElementById('mkt-content-type').value;
      const topic = document.getElementById('mkt-topic').value;
      await saveCampaignToServer(topic || 'Untitled', type, currentMktContent, { platform: document.getElementById('mkt-platform').value });
    }
    window.saveMarketingContent = saveMarketingContent;

    async function generateEmailCampaign() {
      const campaignType = document.getElementById('email-campaign-type').value;
      const subjectTopic = document.getElementById('email-subject-topic').value;
      const keyMessage = document.getElementById('email-key-message').value;
      if (!subjectTopic) { showToast('Please enter a subject topic', 'error'); return; }
      const preview = document.getElementById('email-preview');
      preview.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;padding:60px;color:#999;"><div style="width:32px;height:32px;border:3px solid #ddd;border-top-color:#007bff;border-radius:50%;animation:spin 1s linear infinite;"></div><p style="margin-top:16px;">Generating email...</p></div>';
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/generate`, {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({ type: 'email_campaign', topic: campaignType + ': ' + subjectTopic, tone: 'professional', targetAudience: 'car_owners', additionalContext: keyMessage || '' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Generation failed');
        currentEmailHtml = data.content;
        const subjectMatch = data.content.match(/Subject:\s*(.+?)(?:\n|<)/i);
        currentEmailSubject = subjectMatch ? subjectMatch[1].trim() : subjectTopic;
        preview.innerHTML = data.content;
        document.getElementById('email-subject-preview').style.display = 'block';
        document.getElementById('email-subject-text').textContent = currentEmailSubject;
      } catch (err) {
        preview.innerHTML = '<p style="color:red;padding:20px;">Error: ' + escapeHtml(err.message) + '</p>';
      }
    }
    window.generateEmailCampaign = generateEmailCampaign;

    async function sendEmailCampaign() {
      if (!currentEmailHtml) { showToast('Generate an email first', 'error'); return; }
      const recipientText = document.getElementById('email-recipients').value;
      if (!recipientText.trim()) { showToast('Enter recipient emails', 'error'); return; }
      const recipients = recipientText.split(',').map(e => e.trim()).filter(e => e.includes('@'));
      if (recipients.length === 0) { showToast('No valid email addresses', 'error'); return; }
      if (recipients.length > 50) { showToast('Maximum 50 recipients per send', 'error'); return; }
      const btn = document.getElementById('email-send-btn');
      btn.disabled = true;
      btn.textContent = 'Sending...';
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/send-email`, {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({ to: recipients, subject: currentEmailSubject, html: currentEmailHtml, fromName: 'My Car Concierge' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Send failed');
        showToast('Email sent to ' + (data.sent || recipients.length) + ' recipient(s)');
      } catch (err) {
        showToast('Failed to send: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="icon-inline" data-icon="send"></span> Send Campaign';
        if (typeof initInlineIcons !== 'undefined') initInlineIcons(btn);
      }
    }
    window.sendEmailCampaign = sendEmailCampaign;

    function copyEmailContent() {
      if (!currentEmailHtml) { showToast('No email to copy', 'error'); return; }
      navigator.clipboard.writeText(currentEmailHtml).then(() => showToast('Email HTML copied'));
    }
    window.copyEmailContent = copyEmailContent;

    function saveEmailCampaign() {
      if (!currentEmailHtml) { showToast('No email to save', 'error'); return; }
      saveCampaignToServer(currentEmailSubject || 'Email Campaign', 'email_campaign', currentEmailHtml, {});
    }
    window.saveEmailCampaign = saveEmailCampaign;

    async function generateStrategy() {
      const goal = document.getElementById('strategy-goal').value;
      const budget = document.getElementById('strategy-budget').value;
      const timeline = document.getElementById('strategy-timeline').value;
      const channels = Array.from(document.querySelectorAll('.strategy-channel:checked')).map(c => c.value);
      if (!goal) { showToast('Please enter a goal', 'error'); return; }
      const output = document.getElementById('strategy-output');
      output.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;padding:60px;color:var(--text-muted);"><div style="width:32px;height:32px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;"></div><p style="margin-top:16px;">AI is building your strategy...</p></div>';
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/strategy`, {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({ goal, budget: budget || 'Not specified', timeline, channels })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Strategy generation failed');
        currentStrategyContent = data.strategy;
        output.textContent = data.strategy;
      } catch (err) {
        output.innerHTML = '<p style="color:var(--accent-red);padding:20px;">Error: ' + escapeHtml(err.message) + '</p>';
      }
    }
    window.generateStrategy = generateStrategy;

    function copyStrategyContent() {
      if (!currentStrategyContent) { showToast('No strategy to copy', 'error'); return; }
      navigator.clipboard.writeText(currentStrategyContent).then(() => showToast('Strategy copied'));
    }
    window.copyStrategyContent = copyStrategyContent;

    function saveStrategyContent() {
      if (!currentStrategyContent) { showToast('No strategy to save', 'error'); return; }
      saveCampaignToServer(document.getElementById('strategy-goal').value || 'Marketing Strategy', 'campaign_strategy', currentStrategyContent, {});
    }
    window.saveStrategyContent = saveStrategyContent;

    async function generateFundraising() {
      const type = document.getElementById('fund-type').value;
      const goal = document.getElementById('fund-goal').value;
      const differentiators = document.getElementById('fund-differentiators').value;
      const stage = document.getElementById('fund-stage').value;
      if (!goal) { showToast('Please enter a funding goal', 'error'); return; }
      const output = document.getElementById('fund-output');
      output.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;padding:60px;color:var(--text-muted);"><div style="width:32px;height:32px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;"></div><p style="margin-top:16px;">AI is generating fundraising content...</p></div>';
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/generate`, {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({ type, topic: goal, tone: 'professional', targetAudience: 'investors', additionalContext: 'Stage: ' + stage + '. ' + (differentiators || '') })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Generation failed');
        currentFundContent = data.content;
        output.textContent = data.content;
      } catch (err) {
        output.innerHTML = '<p style="color:var(--accent-red);padding:20px;">Error: ' + escapeHtml(err.message) + '</p>';
      }
    }
    window.generateFundraising = generateFundraising;

    function copyFundraisingContent() {
      if (!currentFundContent) { showToast('No content to copy', 'error'); return; }
      navigator.clipboard.writeText(currentFundContent).then(() => showToast('Content copied'));
    }
    window.copyFundraisingContent = copyFundraisingContent;

    function saveFundraisingContent() {
      if (!currentFundContent) { showToast('No content to save', 'error'); return; }
      saveCampaignToServer(document.getElementById('fund-goal').value || 'Fundraising Content', document.getElementById('fund-type').value, currentFundContent, { stage: document.getElementById('fund-stage').value });
    }
    window.saveFundraisingContent = saveFundraisingContent;

    async function saveCampaignToServer(title, type, content, metadata) {
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/save-campaign`, {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({ title, type, content, metadata })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');
        showToast('Content saved successfully');
      } catch (err) {
        showToast('Failed to save: ' + err.message, 'error');
      }
    }

    async function loadSavedCampaigns() {
      const container = document.getElementById('saved-campaigns-list');
      if (!container) return;
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/saved-campaigns`, { headers: getMarketingHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const campaigns = data.campaigns || [];
        if (campaigns.length === 0) {
          container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">No saved content yet. Generate and save content from other tabs.</p>';
          return;
        }
        const typeLabels = { social_post: 'Social Post', email_campaign: 'Email Campaign', ad_copy: 'Ad Copy', blog_outline: 'Blog Outline', outreach_email: 'Outreach Email', press_release: 'Press Release', kickstarter_campaign: 'Crowdfunding', grant_application: 'Grant Application', investor_pitch: 'Investor Pitch', funding_research: 'Funding Research', campaign_strategy: 'Strategy' };
        container.innerHTML = campaigns.map(c => {
          const safeContent = escapeHtml(c.content);
          return '<div style="padding:16px;border-bottom:1px solid var(--border-subtle);cursor:pointer;" onclick="this.querySelector(\'.saved-body\').style.display=this.querySelector(\'.saved-body\').style.display===\'none\'?\'block\':\'none\'">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<div><strong>' + escapeHtml(c.title) + '</strong> <span style="background:var(--accent-blue-soft);color:var(--accent-blue);padding:2px 8px;border-radius:12px;font-size:0.75rem;margin-left:8px;">' + (typeLabels[c.type] || c.type) + '</span></div>' +
            '<span style="color:var(--text-muted);font-size:0.85rem;">' + new Date(c.createdAt).toLocaleDateString() + '</span>' +
            '</div>' +
            '<div class="saved-body" style="display:none;margin-top:12px;padding:12px;background:var(--bg-elevated);border-radius:8px;white-space:pre-wrap;font-size:0.9rem;max-height:400px;overflow-y:auto;">' + safeContent + '</div>' +
            '</div>';
        }).join('');
      } catch (err) {
        container.innerHTML = '<p style="color:var(--accent-red);padding:20px;">Error loading saved content: ' + escapeHtml(err.message) + '</p>';
      }
    }
    window.loadSavedCampaigns = loadSavedCampaigns;

    async function runResearch() {
      const category = document.getElementById('research-category').value;
      const focus = document.getElementById('research-focus').value;
      const customQuery = document.getElementById('research-custom').value;
      const resultsDiv = document.getElementById('research-results');
      const btn = document.getElementById('research-btn');
      const sourceCount = document.getElementById('research-source-count');
      btn.disabled = true;
      btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 1s linear infinite;vertical-align:middle;margin-right:6px;"></span> Searching the web...';
      resultsDiv.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;padding:60px;color:var(--text-muted);"><div style="width:32px;height:32px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;"></div><p style="margin-top:16px;">AI is searching the internet for real opportunities...</p><p style="font-size:0.85rem;margin-top:8px;">This may take 30-60 seconds</p></div>';
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/research`, {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({ category, focus, customQuery: customQuery || undefined })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Research failed');
        const opps = data.opportunities || [];
        if (sourceCount) sourceCount.textContent = (data.sources?.length || 0) + ' web sources found';
        if (opps.length === 0) {
          resultsDiv.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">No opportunities found. Try a different category or focus area.</p>';
          return;
        }
        renderResearchResults(opps, data.sources || []);
      } catch (err) {
        resultsDiv.innerHTML = '<p style="color:var(--accent-red);padding:20px;">Error: ' + escapeHtml(err.message) + '</p>';
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="icon-inline" data-icon="search"></span> Search & Find Opportunities';
        if (typeof initInlineIcons !== 'undefined') initInlineIcons(btn);
      }
    }
    window.runResearch = runResearch;

    function renderResearchResults(opportunities, sources) {
      const container = document.getElementById('research-results');
      if (!container) return;
      const categoryColors = { grants: 'var(--accent-green)', investors: 'var(--accent-blue)', accelerators: 'var(--accent-gold)', partnerships: 'var(--accent-purple, #8b5cf6)', media: 'var(--accent-teal, #14b8a6)', competitions: 'var(--accent-red, #ef4444)' };
      let html = '';
      opportunities.forEach((opp, idx) => {
        const color = categoryColors[opp.type] || 'var(--accent-blue)';
        const statusBadge = opp.status === 'sent' ? '<span style="background:var(--accent-green-soft);color:var(--accent-green);padding:2px 8px;border-radius:12px;font-size:0.75rem;margin-left:8px;">Sent</span>' : '<span style="background:var(--accent-gold-soft);color:var(--accent-gold);padding:2px 8px;border-radius:12px;font-size:0.75rem;margin-left:8px;">Draft</span>';
        html += '<div style="border:1px solid var(--border-subtle);border-radius:12px;padding:16px;margin-bottom:12px;border-left:4px solid ' + color + ';">';
        html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">';
        html += '<div><strong style="font-size:1.05rem;">' + escapeHtml(opp.name) + '</strong>' + statusBadge + '</div>';
        html += '<div style="display:flex;align-items:center;gap:4px;"><span class="icon-inline" data-icon="star"></span><span style="font-weight:600;">' + (opp.relevanceScore || '?') + '/10</span></div>';
        html += '</div>';
        html += '<p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:8px;">' + escapeHtml(opp.description || '') + '</p>';
        html += '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:0.85rem;color:var(--text-muted);margin-bottom:12px;">';
        if (opp.value) html += '<span><strong>Value:</strong> ' + escapeHtml(opp.value) + '</span>';
        if (opp.deadline) html += '<span><strong>Deadline:</strong> ' + escapeHtml(opp.deadline) + '</span>';
        if (opp.contactMethod) html += '<span><strong>Contact:</strong> ' + escapeHtml(opp.contactMethod) + '</span>';
        html += '</div>';
        html += '<details style="margin-top:8px;"><summary style="cursor:pointer;font-weight:500;color:var(--accent-blue);user-select:none;">View/Edit Outreach Email</summary>';
        html += '<div style="margin-top:12px;padding:12px;background:var(--bg-elevated);border-radius:8px;">';
        html += '<div style="margin-bottom:8px;"><label style="font-weight:500;font-size:0.85rem;">Subject:</label><input type="text" class="form-input outreach-subject" data-id="' + opp.id + '" value="' + escapeHtml(opp.emailSubject || '') + '" style="width:100%;margin-top:4px;"></div>';
        html += '<div style="margin-bottom:8px;"><label style="font-weight:500;font-size:0.85rem;">Email Body:</label><textarea class="form-input outreach-body" data-id="' + opp.id + '" style="width:100%;min-height:120px;margin-top:4px;">' + escapeHtml(opp.emailBody || '') + '</textarea></div>';
        html += '<div style="margin-bottom:8px;"><label style="font-weight:500;font-size:0.85rem;">Send To:</label><input type="email" class="form-input outreach-to" data-id="' + opp.id + '" placeholder="recipient@example.com" style="width:100%;margin-top:4px;"></div>';
        html += '<div style="display:flex;gap:8px;margin-top:8px;">';
        html += '<button class="btn btn-sm btn-primary" onclick="sendOutreach(' + opp.id + ', event)" style="background:var(--accent-green);"><span class="icon-inline" data-icon="send"></span> Send Email</button>';
        html += '<button class="btn btn-sm" onclick="updateOutreach(' + opp.id + ')"><span class="icon-inline" data-icon="check"></span> Save Edits</button>';
        html += '<button class="btn btn-sm" onclick="copyOutreachEmail(' + opp.id + ')"><span class="icon-inline" data-icon="clipboard"></span> Copy</button>';
        html += '</div></div></details></div>';
      });
      if (sources.length > 0) {
        html += '<div style="margin-top:16px;padding:12px;background:var(--bg-elevated);border-radius:8px;"><strong style="font-size:0.9rem;">Web Sources Used:</strong><ul style="margin:8px 0 0 16px;font-size:0.85rem;color:var(--text-muted);">';
        sources.forEach(s => {
          html += '<li style="margin-bottom:4px;"><a href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener" style="color:var(--accent-blue);">' + escapeHtml(s.title || s.url) + '</a></li>';
        });
        html += '</ul></div>';
      }
      container.innerHTML = html;
      if (typeof initInlineIcons !== 'undefined') initInlineIcons(container);
    }

    async function sendOutreach(id, evt) {
      const subjectEl = document.querySelector('.outreach-subject[data-id="' + id + '"]');
      const bodyEl = document.querySelector('.outreach-body[data-id="' + id + '"]');
      const toEl = document.querySelector('.outreach-to[data-id="' + id + '"]');
      if (!toEl || !toEl.value.trim()) { showToast('Enter a recipient email address', 'error'); return; }
      if (!subjectEl?.value || !bodyEl?.value) { showToast('Subject and body are required', 'error'); return; }
      const btn = evt ? evt.target.closest('button') : null;
      if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/outreach-send`, {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({ id, to: toEl.value.trim(), subject: subjectEl.value, body: bodyEl.value })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Send failed');
        showToast('Outreach email sent successfully!');
        if (btn) { btn.innerHTML = '<span class="icon-inline" data-icon="check"></span> Sent!'; btn.style.background = 'var(--accent-green)'; }
      } catch (err) {
        showToast('Failed to send: ' + err.message, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="icon-inline" data-icon="send"></span> Send Email'; }
      }
    }
    window.sendOutreach = sendOutreach;

    async function updateOutreach(id) {
      const subjectEl = document.querySelector('.outreach-subject[data-id="' + id + '"]');
      const bodyEl = document.querySelector('.outreach-body[data-id="' + id + '"]');
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/outreach-update`, {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({ id, emailSubject: subjectEl?.value, emailBody: bodyEl?.value })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Edits saved');
      } catch (err) {
        showToast('Failed to save: ' + err.message, 'error');
      }
    }
    window.updateOutreach = updateOutreach;

    function copyOutreachEmail(id) {
      const subjectEl = document.querySelector('.outreach-subject[data-id="' + id + '"]');
      const bodyEl = document.querySelector('.outreach-body[data-id="' + id + '"]');
      const text = 'Subject: ' + (subjectEl?.value || '') + '\n\n' + (bodyEl?.value || '');
      navigator.clipboard.writeText(text).then(() => showToast('Email copied'));
    }
    window.copyOutreachEmail = copyOutreachEmail;

    async function loadOutreachQueue() {
      const resultsDiv = document.getElementById('research-results');
      if (!resultsDiv) return;
      resultsDiv.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;padding:40px;color:var(--text-muted);"><div style="width:32px;height:32px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;"></div><p style="margin-top:16px;">Loading outreach queue...</p></div>';
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/outreach-queue`, { headers: getMarketingHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const items = data.items || [];
        if (items.length === 0) {
          resultsDiv.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">No items in outreach queue. Run a research search first.</p>';
          return;
        }
        renderResearchResults(items, []);
      } catch (err) {
        resultsDiv.innerHTML = '<p style="color:var(--accent-red);padding:20px;">Error: ' + escapeHtml(err.message) + '</p>';
      }
    }
    window.loadOutreachQueue = loadOutreachQueue;

    let emailOutreachLeads = [];

    function toggleEmailOutreachSection() {
      const filtersDiv = document.getElementById('email-outreach-filters');
      const icon = document.getElementById('outreach-toggle-icon');
      if (!filtersDiv) return;
      const isHidden = filtersDiv.style.display === 'none';
      filtersDiv.style.display = isHidden ? 'flex' : 'none';
      if (icon) icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    }
    window.toggleEmailOutreachSection = toggleEmailOutreachSection;

    async function loadEmailOutreachLeads() {
      const preview = document.getElementById('email-outreach-leads-preview');
      if (!preview) return;
      preview.style.display = 'block';
      preview.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-muted);">Loading leads...</div>';
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const type = document.getElementById('email-lead-type')?.value || '';
        const minScore = document.getElementById('email-lead-score')?.value || '';
        const source = document.getElementById('email-lead-source')?.value || '';
        const params = new URLSearchParams();
        if (type) params.set('type', type);
        if (minScore) params.set('min_score', minScore);
        if (source) params.set('source', source);
        params.set('limit', '200');
        const res = await fetch(`${apiBase}/api/admin/marketing/outreach-leads?${params}`, { headers: getMarketingHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        emailOutreachLeads = (data.leads || []).filter(l => l.email);
        if (emailOutreachLeads.length === 0) {
          preview.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-muted);">No leads with email addresses found for these filters.</div>';
          const addBtn = document.getElementById('email-add-leads-btn');
          if (addBtn) addBtn.style.display = 'none';
          return;
        }
        preview.innerHTML = `<div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;"><span style="font-weight:500;">${emailOutreachLeads.length} leads with emails</span><label style="cursor:pointer;font-size:0.85rem;"><input type="checkbox" id="email-lead-select-all" onchange="toggleAllEmailLeads(this.checked)" checked> Select all</label></div>` +
          emailOutreachLeads.map((l, i) => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:0.85rem;border-bottom:1px solid var(--border-subtle);"><input type="checkbox" class="email-lead-cb" data-idx="${i}" checked onchange="updateEmailLeadCount()"> <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><strong>${escapeHtml(l.name || 'Unknown')}</strong> (${l.type})</span><span style="color:var(--text-muted);">${escapeHtml(l.email)}</span></div>`).join('');
        const addBtn = document.getElementById('email-add-leads-btn');
        if (addBtn) addBtn.style.display = 'block';
        showToast(`Loaded ${emailOutreachLeads.length} leads from Outreach Engine`);
      } catch (err) {
        preview.innerHTML = '<div style="color:var(--accent-red);padding:12px;">Error: ' + escapeHtml(err.message) + '</div>';
        const addBtn = document.getElementById('email-add-leads-btn');
        if (addBtn) addBtn.style.display = 'none';
      }
    }
    window.loadEmailOutreachLeads = loadEmailOutreachLeads;

    function toggleAllEmailLeads(checked) {
      document.querySelectorAll('.email-lead-cb').forEach(cb => cb.checked = checked);
    }
    window.toggleAllEmailLeads = toggleAllEmailLeads;

    function updateEmailLeadCount() {
      const checked = document.querySelectorAll('.email-lead-cb:checked').length;
      const selectAll = document.getElementById('email-lead-select-all');
      if (selectAll) selectAll.checked = checked === emailOutreachLeads.length;
    }
    window.updateEmailLeadCount = updateEmailLeadCount;

    function addSelectedLeadsToRecipients() {
      const selected = [];
      document.querySelectorAll('.email-lead-cb:checked').forEach(cb => {
        const idx = parseInt(cb.dataset.idx);
        if (emailOutreachLeads[idx]?.email) selected.push(emailOutreachLeads[idx].email);
      });
      if (selected.length === 0) { showToast('No leads selected', 'error'); return; }
      const textarea = document.getElementById('email-recipients');
      if (!textarea) return;
      const existing = textarea.value.split(',').map(e => e.trim()).filter(Boolean);
      const merged = [...new Set([...existing, ...selected])];
      textarea.value = merged.join(', ');
      showToast(`Added ${selected.length} leads (${merged.length} total recipients)`);
      checkEmailDedup();
    }
    window.addSelectedLeadsToRecipients = addSelectedLeadsToRecipients;

    async function checkEmailDedup() {
      const status = document.getElementById('email-dedup-status');
      if (!status) return;
      const textarea = document.getElementById('email-recipients');
      if (!textarea) return;
      const emails = textarea.value.split(',').map(e => e.trim()).filter(e => e.includes('@'));
      if (emails.length === 0) { status.textContent = ''; return; }
      status.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">Checking duplicates...</span>';
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/check-dedup`, {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({ emails })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const dupCount = (data.duplicates || []).length;
        if (dupCount > 0) {
          status.innerHTML = `<span style="color:var(--accent-gold);font-size:0.8rem;">${dupCount} recipient(s) recently contacted via Outreach Engine</span>`;
        } else {
          status.innerHTML = '<span style="color:var(--accent-green);font-size:0.8rem;">No recent duplicates found</span>';
        }
      } catch (err) {
        status.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">Dedup check unavailable</span>';
      }
    }
    window.checkEmailDedup = checkEmailDedup;

    async function sendCampaignToLeads() {
      if (!currentEmailHtml) { showToast('Generate an email first', 'error'); return; }
      const selectedIds = [];
      document.querySelectorAll('.email-lead-cb:checked').forEach(cb => {
        const idx = parseInt(cb.dataset.idx);
        if (emailOutreachLeads[idx]?.id) selectedIds.push(emailOutreachLeads[idx].id);
      });
      if (selectedIds.length === 0) { showToast('No leads selected', 'error'); return; }
      if (!confirm(`Send this email campaign to ${selectedIds.length} outreach leads? This will also log the send in the Outreach Engine.`)) return;
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(`${apiBase}/api/admin/marketing/campaign-to-leads`, {
          method: 'POST',
          headers: getMarketingHeaders(),
          body: JSON.stringify({ subject: currentEmailSubject || 'MCC Campaign', html: currentEmailHtml, lead_ids: selectedIds, fromName: 'My Car Concierge' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Send failed');
        showToast(`Campaign sent: ${data.sent} delivered, ${data.skipped} skipped, ${data.failed} failed`);
      } catch (err) {
        showToast('Send failed: ' + err.message, 'error');
      }
    }
    window.sendCampaignToLeads = sendCampaignToLeads;

    async function loadGrowthFunnel() {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const res = await fetch(`${apiBase}/api/admin/marketing/pipeline-metrics`, { headers: getMarketingHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load metrics');

        const el = (id) => document.getElementById(id);
        if (el('funnel-total-leads')) el('funnel-total-leads').textContent = (data.total_leads || 0).toLocaleString();
        if (el('funnel-messages-sent')) el('funnel-messages-sent').textContent = (data.total_messages_sent || 0).toLocaleString();
        if (el('funnel-response-rate')) el('funnel-response-rate').textContent = (data.response_rate || 0).toFixed(1) + '%';

        const funnel = data.conversion_funnel || {};
        const convRate = funnel.discovered > 0 ? ((funnel.converted || 0) / funnel.discovered * 100).toFixed(1) : '0.0';
        if (el('funnel-conversion-rate')) el('funnel-conversion-rate').textContent = convRate + '%';

        const byType = data.leads_by_type || {};
        const typeContainer = el('funnel-leads-by-type');
        if (typeContainer) {
          const typeColors = { provider: 'var(--accent-blue)', member: 'var(--accent-green)', investor: 'var(--accent-gold)' };
          const total = Object.values(byType).reduce((s, v) => s + v, 0) || 1;
          typeContainer.innerHTML = Object.entries(byType).map(([type, count]) => 
            `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-subtle);"><div style="display:flex;align-items:center;gap:8px;"><span style="width:10px;height:10px;border-radius:50%;background:${typeColors[type] || 'var(--text-muted)'};"></span><span style="text-transform:capitalize;">${type}</span></div><div style="display:flex;align-items:center;gap:12px;"><div style="width:120px;height:6px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden;"><div style="height:100%;background:${typeColors[type] || 'var(--text-muted)'};width:${(count/total*100).toFixed(0)}%;border-radius:3px;"></div></div><strong>${count.toLocaleString()}</strong></div></div>`
          ).join('') || '<p style="color:var(--text-muted);text-align:center;padding:20px;">No leads yet</p>';
        }

        const bySource = data.leads_by_source || {};
        const sourceContainer = el('funnel-leads-by-source');
        if (sourceContainer) {
          const srcTotal = Object.values(bySource).reduce((s, v) => s + v, 0) || 1;
          const sourceLabels = { google_places: 'Google Places', community_discovery: 'Community Discovery', crm_reengagement: 'CRM Re-engagement', referral_nudge: 'Referral Nudge', stalled_application: 'Stalled Applications', manual: 'Manual Entry', csv_import: 'CSV Import', member_places: 'Member Places' };
          sourceContainer.innerHTML = Object.entries(bySource).sort((a,b) => b[1]-a[1]).map(([src, count]) => 
            `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;"><span style="font-size:0.9rem;">${sourceLabels[src] || src.replace(/_/g, ' ')}</span><div style="display:flex;align-items:center;gap:8px;"><div style="width:80px;height:5px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden;"><div style="height:100%;background:var(--accent-blue);width:${(count/srcTotal*100).toFixed(0)}%;border-radius:3px;"></div></div><span style="font-weight:500;min-width:30px;text-align:right;">${count}</span></div></div>`
          ).join('') || '<p style="color:var(--text-muted);text-align:center;padding:20px;">No data</p>';
        }

        const stagesContainer = el('funnel-stages');
        if (stagesContainer) {
          const stages = [
            { key: 'discovered', label: 'Discovered', color: '#6366f1' },
            { key: 'scored', label: 'Scored', color: '#8b5cf6' },
            { key: 'drafted', label: 'Drafted', color: '#a855f7' },
            { key: 'sent', label: 'Sent', color: '#d946ef' },
            { key: 'responded', label: 'Responded', color: '#ec4899' },
            { key: 'converted', label: 'Converted', color: '#22c55e' }
          ];
          const maxVal = Math.max(...stages.map(s => funnel[s.key] || 0), 1);
          stagesContainer.innerHTML = stages.map(s => {
            const val = funnel[s.key] || 0;
            const pct = (val / maxVal * 100).toFixed(0);
            return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;"><span style="min-width:80px;font-size:0.85rem;text-align:right;">${s.label}</span><div style="flex:1;height:24px;background:var(--bg-tertiary);border-radius:6px;overflow:hidden;position:relative;"><div style="height:100%;background:${s.color};width:${pct}%;border-radius:6px;transition:width 0.5s ease;"></div><span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:0.8rem;font-weight:600;">${val.toLocaleString()}</span></div></div>`;
          }).join('');
        }

        const regionsContainer = el('funnel-top-regions');
        if (regionsContainer) {
          const regions = data.top_regions || [];
          regionsContainer.innerHTML = regions.length > 0 ? regions.slice(0, 15).map((r, i) => 
            `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;${i < regions.length - 1 ? 'border-bottom:1px solid var(--border-subtle);' : ''}"><span style="font-size:0.9rem;">${escapeHtml(r.region || r.city || 'Unknown')}</span><strong>${(r.count || 0).toLocaleString()}</strong></div>`
          ).join('') : '<p style="color:var(--text-muted);text-align:center;padding:20px;">No regional data yet</p>';
        }

      } catch (err) {
        console.error('Growth funnel load error:', err);
      }
    }
    window.loadGrowthFunnel = loadGrowthFunnel;

    function switchOutreachTab(tab) {
      const panels = document.querySelectorAll('.outreach-panel');
      panels.forEach(p => { p.style.display = 'none'; });
      const buttons = document.querySelectorAll('.outreach-tab');
      buttons.forEach(b => b.classList.remove('active'));
      const activeBtn = document.querySelector(`.outreach-tab[data-tab="${tab}"]`);
      if (activeBtn) activeBtn.classList.add('active');
      const panelMap = {
        pipeline: 'outreach-pipeline', queue: 'outreach-queue', leads: 'outreach-leads',
        campaigns: 'outreach-campaigns', import: 'outreach-import', analytics: 'outreach-analytics', instantly: 'outreach-instantly'
      };
      const panelId = panelMap[tab];
      if (panelId) {
        const panel = document.getElementById(panelId);
        if (panel) panel.style.display = 'block';
      }
      if (tab === 'queue') loadApprovalQueue();
      else if (tab === 'leads') loadOutreachLeads();
      else if (tab === 'campaigns') loadOutreachCampaigns();
      else if (tab === 'pipeline') loadOutreachPipeline();
      else if (tab === 'analytics') { if (window.loadGrowthFunnel) loadGrowthFunnel(); if (window.loadOutreachAnalytics) loadOutreachAnalytics(); }
      else if (tab === 'instantly') loadInstantlyCampaigns();
    }
    window.switchOutreachTab = switchOutreachTab;

    async function loadApprovalQueue() {
      const listEl = document.getElementById('outreach-queue-list');
      const bulkBar = document.getElementById('outreach-bulk-bar');
      if (!listEl) return;
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      listEl.innerHTML = '<div style="display:flex;align-items:center;gap:12px;padding:32px;color:var(--text-muted);"><div style="width:24px;height:24px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;flex-shrink:0;"></div>Loading approval queue...</div>';
      try {
        const res = await fetch(`${apiBase}/api/admin/marketing/outreach-queue?status=draft&limit=50`, { headers: getMarketingHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load queue');
        const messages = data.data || data.items || [];
        if (bulkBar) bulkBar.style.display = messages.length > 0 ? 'block' : 'none';
        if (messages.length === 0) {
          listEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">No messages pending approval. Run a cycle to generate new drafts.</p>';
          return;
        }
        listEl.innerHTML = messages.map(m => {
          const lead = m.outreach_leads || {};
          const ch = m.channel === 'email' ? '✉️' : '💬';
          return `<div id="queue-msg-${m.id}" style="padding:16px;border-bottom:1px solid var(--border-subtle);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
              <div style="flex:1;min-width:0;">
                <div style="font-weight:600;margin-bottom:2px;">${ch} ${escapeHtml(lead.name || 'Unknown')} <span style="font-size:0.8rem;color:var(--text-muted);font-weight:400;">${escapeHtml(lead.company || lead.type || '')}</span></div>
                <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">${escapeHtml(m.channel === 'email' ? (lead.email || '') : (lead.phone || ''))}</div>
                ${m.subject ? `<div style="font-size:0.85rem;font-weight:500;margin-bottom:6px;">Subject: ${escapeHtml(m.subject)}</div>` : ''}
                <div style="font-size:0.9rem;color:var(--text-secondary);white-space:pre-wrap;max-height:120px;overflow:hidden;line-height:1.5;">${escapeHtml((m.body || '').substring(0, 400))}${(m.body || '').length > 400 ? '…' : ''}</div>
              </div>
              <div style="display:flex;gap:8px;flex-shrink:0;">
                <button class="btn btn-sm btn-primary" onclick="approveMessage('${m.id}')"><span class="icon-inline" data-icon="check"></span> Approve</button>
                <button class="btn btn-sm" onclick="skipMessage('${m.id}')" style="border-color:var(--text-muted);color:var(--text-muted);"><span class="icon-inline" data-icon="x"></span> Skip</button>
              </div>
            </div>
          </div>`;
        }).join('');
        if (window.renderIcons) renderIcons(listEl);
      } catch (err) {
        listEl.innerHTML = `<p style="color:var(--accent-red);padding:20px;">Error: ${escapeHtml(err.message)}</p>`;
      }
    }
    window.loadApprovalQueue = loadApprovalQueue;

    async function approveMessage(messageId) {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const res = await fetch(`${apiBase}/api/admin/outreach/messages/approve`, {
          method: 'POST',
          headers: { ...getMarketingHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_id: messageId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to approve');
        const el = document.getElementById(`queue-msg-${messageId}`);
        if (el) { el.style.opacity = '0.4'; el.style.pointerEvents = 'none'; el.querySelector('.btn.btn-primary').textContent = '✓ Approved'; }
        if (window.showToast) showToast('Message approved and queued for sending', 'success');
      } catch (err) {
        if (window.showToast) showToast('Error: ' + err.message, 'error');
      }
    }
    window.approveMessage = approveMessage;

    async function skipMessage(messageId) {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const res = await fetch(`${apiBase}/api/admin/outreach/messages/skip`, {
          method: 'POST',
          headers: { ...getMarketingHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_id: messageId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to skip');
        const el = document.getElementById(`queue-msg-${messageId}`);
        if (el) el.remove();
        if (window.showToast) showToast('Message skipped', 'success');
      } catch (err) {
        if (window.showToast) showToast('Error: ' + err.message, 'error');
      }
    }
    window.skipMessage = skipMessage;

    async function runCycleNow() {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const btn = document.querySelector('[onclick="runCycleNow()"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Running…'; }
      try {
        const res = await fetch(`${apiBase}/api/admin/marketing/outreach-cycle`, {
          method: 'POST',
          headers: getMarketingHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Cycle failed');
        if (window.showToast) showToast(`Cycle complete — ${data.drafted || 0} drafted, ${data.sent || 0} sent`, 'success');
        setTimeout(loadApprovalQueue, 1000);
      } catch (err) {
        if (window.showToast) showToast('Error: ' + err.message, 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="icon-inline" data-icon="zap"></span> Run Cycle Now'; if (window.renderIcons) renderIcons(btn); }
      }
    }
    window.runCycleNow = runCycleNow;

    async function flushApprovedQueue() {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const btn = document.getElementById('flush-queue-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      try {
        const res = await fetch(`${apiBase}/api/admin/outreach/messages/flush-queue`, {
          method: 'POST',
          headers: { ...getMarketingHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch_size: 50 })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Flush failed');
        if (window.showToast) showToast(`Sent ${data.sent} — ${data.skipped} skipped (${data.errors} errors)`, data.sent > 0 ? 'success' : 'info');
        setTimeout(loadApprovalQueue, 1500);
      } catch (err) {
        if (window.showToast) showToast('Flush error: ' + err.message, 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="icon-inline" data-icon="send"></span> Send Approved'; if (window.renderIcons) renderIcons(btn); }
      }
    }
    window.flushApprovedQueue = flushApprovedQueue;

    async function clearAndRedraft() {
      if (!confirm('This will delete all draft/approved messages and run a fresh cycle. Continue?')) return;
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const res = await fetch(`${apiBase}/api/admin/outreach/clear-and-redraft`, {
          method: 'POST',
          headers: getMarketingHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        if (window.showToast) showToast(`Cleared ${data.cleared || 0} messages and ran fresh cycle`, 'success');
        setTimeout(loadApprovalQueue, 1000);
      } catch (err) {
        if (window.showToast) showToast('Error: ' + err.message, 'error');
      }
    }
    window.clearAndRedraft = clearAndRedraft;

    async function bulkApproveAll() {
      if (!confirm('Approve all draft messages for sending?')) return;
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const listRes = await fetch(`${apiBase}/api/admin/marketing/outreach-queue?status=draft&limit=200`, { headers: getMarketingHeaders() });
        const listData = await listRes.json();
        if (!listRes.ok) throw new Error(listData.error || 'Failed to load messages');
        const messageIds = (listData.data || listData.items || []).map(m => m.id);
        if (messageIds.length === 0) { if (window.showToast) showToast('No draft messages to approve', 'error'); return; }
        const res = await fetch(`${apiBase}/api/admin/outreach/messages/approve-bulk`, {
          method: 'POST',
          headers: { ...getMarketingHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_ids: messageIds })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to approve');
        if (window.showToast) showToast(`Approved ${data.approved || 0} messages`, 'success');
        setTimeout(loadApprovalQueue, 800);
      } catch (err) {
        if (window.showToast) showToast('Error: ' + err.message, 'error');
      }
    }
    window.bulkApproveAll = bulkApproveAll;

    async function syncLeadsToInstantly() {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const campaignId = (document.getElementById('instantly-sync-campaign') || {}).value?.trim() || '';
      const syncLimit = parseInt((document.getElementById('instantly-sync-limit') || {}).value || '500', 10);
      const resultEl = document.getElementById('instantly-sync-result');
      const btn = document.getElementById('instantly-sync-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
      if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
      try {
        const payload = { limit: syncLimit, min_score: 0 };
        if (campaignId) payload.campaign_id = campaignId;
        const res = await fetch(`${apiBase}/api/admin/marketing/instantly-sync`, {
          method: 'POST',
          headers: { ...getMarketingHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Sync failed');
        if (resultEl) {
          resultEl.style.display = 'block';
          resultEl.style.color = 'var(--accent-green)';
          resultEl.innerHTML = `<strong>Sync complete!</strong><br>Leads synced: ${data.synced || 0}<br>${data.message || ''}`;
        }
        if (window.showToast) showToast(`Synced ${data.synced || 0} leads to Instantly.ai`, 'success');
      } catch (err) {
        if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = 'var(--accent-red)'; resultEl.textContent = 'Error: ' + err.message; }
        if (window.showToast) showToast('Error: ' + err.message, 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<span class="icon-inline" data-icon="send"></span> Sync Leads Now'; if (window.renderIcons) renderIcons(btn); }
      }
    }
    window.syncLeadsToInstantly = syncLeadsToInstantly;

    async function createInstantlyCampaign() {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const name = (document.getElementById('instantly-campaign-name') || {}).value?.trim() || '';
      const resultEl = document.getElementById('instantly-campaign-result');
      if (!name) { if (window.showToast) showToast('Campaign name is required', 'error'); return; }
      if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
      try {
        const res = await fetch(`${apiBase}/api/admin/marketing/instantly-create-campaign`, {
          method: 'POST',
          headers: { ...getMarketingHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, subject: 'Grow your auto service business with My Car Concierge', body: 'Hi {{first_name}},\n\nI wanted to reach out about My Car Concierge — a platform connecting local auto service providers with car owners in your area.\n\nWould you be open to a quick chat?\n\nBest,\nThe My Car Concierge Team' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || JSON.stringify(data));
        if (resultEl) {
          resultEl.style.display = 'block';
          resultEl.style.color = 'var(--accent-green)';
          resultEl.innerHTML = `<strong>Campaign created!</strong><br>ID: ${data.id || data.campaign_id || 'N/A'}<br>Name: ${escapeHtml(data.name || name)}`;
        }
        if (window.showToast) showToast('Instantly campaign created successfully', 'success');
        setTimeout(loadInstantlyCampaigns, 1000);
      } catch (err) {
        if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = 'var(--accent-red)'; resultEl.textContent = 'Error: ' + err.message; }
        if (window.showToast) showToast('Error: ' + err.message, 'error');
      }
    }
    window.createInstantlyCampaign = createInstantlyCampaign;

    async function loadInstantlyCampaigns() {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const listEl = document.getElementById('instantly-campaigns-list');
      if (!listEl) return;
      listEl.innerHTML = '<div style="display:flex;align-items:center;gap:12px;padding:24px;color:var(--text-muted);"><div style="width:24px;height:24px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;flex-shrink:0;"></div>Loading campaigns…</div>';
      try {
        const res = await fetch(`${apiBase}/api/admin/marketing/instantly-campaigns`, { headers: getMarketingHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        const campaigns = data.items || data.campaigns || data.data || [];
        if (campaigns.length === 0) {
          listEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:24px;">No campaigns found in Instantly.ai.</p>';
          return;
        }
        listEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
          <thead><tr style="border-bottom:1px solid var(--border-subtle);">
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Name</th>
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Status</th>
            <th style="text-align:right;padding:8px 12px;color:var(--text-muted);font-weight:500;">Emails Sent</th>
            <th style="text-align:right;padding:8px 12px;color:var(--text-muted);font-weight:500;">Open Rate</th>
            <th style="text-align:right;padding:8px 12px;color:var(--text-muted);font-weight:500;">Reply Rate</th>
          </tr></thead>
          <tbody>${campaigns.map(c => {
            const sent = c.emails_sent_count || 0;
            const openRate = typeof c.open_rate === 'number' ? c.open_rate.toFixed(1) + '%' : '—';
            const replyRate = typeof c.reply_rate === 'number' ? c.reply_rate.toFixed(1) + '%' : '—';
            return `<tr style="border-bottom:1px solid var(--border-subtle);">
              <td style="padding:10px 12px;font-weight:500;">${escapeHtml(c.name || 'Unnamed')}</td>
              <td style="padding:10px 12px;"><span style="padding:2px 8px;border-radius:20px;font-size:0.8rem;background:${c.status === 'active' ? 'var(--accent-green)' : 'var(--bg-tertiary)'};color:${c.status === 'active' ? '#fff' : 'var(--text-muted)'};">${escapeHtml(c.status || 'draft')}</span></td>
              <td style="padding:10px 12px;text-align:right;">${sent.toLocaleString()}</td>
              <td style="padding:10px 12px;text-align:right;font-weight:${c.open_rate > 0 ? '600' : '400'};color:${c.open_rate > 20 ? 'var(--accent-green)' : c.open_rate > 0 ? 'var(--text-primary)' : 'var(--text-muted)'};">${openRate}</td>
              <td style="padding:10px 12px;text-align:right;font-weight:${c.reply_rate > 0 ? '600' : '400'};color:${c.reply_rate > 5 ? 'var(--accent-green)' : c.reply_rate > 0 ? 'var(--text-primary)' : 'var(--text-muted)'};">${replyRate}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>`;
      } catch (err) {
        listEl.innerHTML = `<p style="color:var(--accent-red);padding:20px;">Error: ${escapeHtml(err.message)}</p>`;
      }
    }
    window.loadInstantlyCampaigns = loadInstantlyCampaigns;

    async function loadOutreachPipeline() {
      const listEl = document.getElementById('outreach-pipeline-list');
      if (!listEl) return;
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const priority = document.getElementById('pipeline-filter-priority')?.value || '';
      const stage = document.getElementById('pipeline-filter-stage')?.value || '';
      listEl.innerHTML = '<div style="display:flex;align-items:center;gap:12px;padding:32px;color:var(--text-muted);"><div style="width:24px;height:24px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;flex-shrink:0;"></div>Loading pipeline…</div>';
      try {
        const params = new URLSearchParams();
        if (priority) params.set('priority', priority);
        if (stage) params.set('stage', stage);
        const res = await fetch(`${apiBase}/api/admin/outreach/pipeline?${params}`, { headers: getMarketingHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        const rows = Array.isArray(data) ? data : (data.data || []);
        if (rows.length === 0) {
          listEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">No leads in pipeline yet. Score some leads to populate this view.</p>';
          return;
        }
        const priorityColors = { high: 'var(--accent-green)', medium: 'var(--accent-gold)', low: 'var(--text-muted)' };
        const stageLabels = { new: 'New', draft_ready: 'Draft Ready', message_queued: 'Queued', contacted: 'Contacted', converted: 'Converted' };
        listEl.innerHTML = rows.map(r => {
          const lead = r.outreach_leads || {};
          const score = (r.opportunity_score || 0).toFixed(0);
          const pColor = priorityColors[r.priority] || 'var(--text-muted)';
          return `<div style="display:grid;grid-template-columns:60px 1fr 60px 1fr auto 100px 90px auto;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--border-subtle);font-size:0.875rem;">
            <span style="padding:2px 8px;border-radius:20px;background:${pColor};color:#fff;font-size:0.75rem;text-align:center;font-weight:600;">${(r.priority || 'low').toUpperCase()}</span>
            <div><div style="font-weight:500;">${escapeHtml(lead.name || '—')}</div><div style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(lead.company || lead.type || '')}</div></div>
            <span style="font-weight:700;text-align:center;">${score}</span>
            <span style="font-size:0.8rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml((r.ai_notes || '').substring(0, 60))}${(r.ai_notes || '').length > 60 ? '…' : ''}</span>
            <span style="font-size:0.8rem;">${r.preferred_channel || 'email'}</span>
            <span style="padding:2px 8px;border-radius:20px;background:var(--bg-tertiary);font-size:0.75rem;">${stageLabels[r.stage] || r.stage || ''}</span>
            <span style="font-size:0.75rem;color:var(--text-muted);">${r.added_at ? new Date(r.added_at).toLocaleDateString() : '—'}</span>
            <button class="btn btn-sm" onclick="window.outreachFetch && outreachFetch('/messages/draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lead_id:'${lead.id}'})}).then(()=>{showToast('Draft created');loadApprovalQueue();switchOutreachTab('queue');})">Draft</button>
          </div>`;
        }).join('');
      } catch (err) {
        listEl.innerHTML = `<p style="color:var(--accent-red);padding:20px;">Error: ${escapeHtml(err.message)}</p>`;
      }
    }
    window.loadOutreachPipeline = loadOutreachPipeline;

    async function loadOutreachLeads() {
      const listEl = document.getElementById('outreach-leads-list');
      if (!listEl) return;
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const search = document.getElementById('leads-search')?.value?.trim() || '';
      const type = document.getElementById('leads-filter-type')?.value || '';
      const status = document.getElementById('leads-filter-status')?.value || '';
      listEl.innerHTML = '<div style="display:flex;align-items:center;gap:12px;padding:32px;color:var(--text-muted);"><div style="width:24px;height:24px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;flex-shrink:0;"></div>Loading leads…</div>';
      try {
        const params = new URLSearchParams({ limit: '50' });
        if (search) params.set('search', search);
        if (type) params.set('type', type);
        if (status) params.set('status', status);
        const res = await fetch(`${apiBase}/api/admin/outreach/leads?${params}`, { headers: getMarketingHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        const leads = data.data || [];
        if (leads.length === 0) {
          listEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">No leads found.</p>';
          return;
        }
        listEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
          <thead><tr style="border-bottom:1px solid var(--border-subtle);">
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Name</th>
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Type</th>
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Email</th>
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Location</th>
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Status</th>
            <th style="text-align:right;padding:8px 12px;color:var(--text-muted);font-weight:500;">Score</th>
          </tr></thead>
          <tbody>${leads.map(l => `<tr style="border-bottom:1px solid var(--border-subtle);">
            <td style="padding:10px 12px;font-weight:500;">${escapeHtml(l.name || '—')}<div style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(l.company || '')}</div></td>
            <td style="padding:10px 12px;text-transform:capitalize;">${escapeHtml(l.type || '—')}</td>
            <td style="padding:10px 12px;font-size:0.85rem;">${escapeHtml(l.email || '—')}</td>
            <td style="padding:10px 12px;font-size:0.85rem;">${escapeHtml(l.location || '—')}</td>
            <td style="padding:10px 12px;"><span style="padding:2px 8px;border-radius:20px;font-size:0.75rem;background:var(--bg-tertiary);">${escapeHtml(l.status || 'new')}</span></td>
            <td style="padding:10px 12px;text-align:right;font-weight:600;">${l.score != null ? l.score.toFixed(0) : '—'}</td>
          </tr>`).join('')}</tbody>
        </table>`;
      } catch (err) {
        listEl.innerHTML = `<p style="color:var(--accent-red);padding:20px;">Error: ${escapeHtml(err.message)}</p>`;
      }
    }
    window.loadOutreachLeads = loadOutreachLeads;

    async function loadOutreachCampaigns() {
      const listEl = document.getElementById('outreach-campaigns-list');
      if (!listEl) return;
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      listEl.innerHTML = '<div style="display:flex;align-items:center;gap:12px;padding:32px;color:var(--text-muted);"><div style="width:24px;height:24px;border:3px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;flex-shrink:0;"></div>Loading campaigns…</div>';
      try {
        const res = await fetch(`${apiBase}/api/admin/outreach/campaigns`, { headers: getMarketingHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        const campaigns = Array.isArray(data) ? data : (data.data || []);
        if (campaigns.length === 0) {
          listEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">No campaigns yet. Create one to get started.</p>';
          return;
        }
        listEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
          <thead><tr style="border-bottom:1px solid var(--border-subtle);">
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Name</th>
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Target</th>
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Channel</th>
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Status</th>
            <th style="text-align:left;padding:8px 12px;color:var(--text-muted);font-weight:500;">Auto-Send</th>
          </tr></thead>
          <tbody>${campaigns.map(c => `<tr style="border-bottom:1px solid var(--border-subtle);">
            <td style="padding:10px 12px;font-weight:500;">${escapeHtml(c.name || '—')}</td>
            <td style="padding:10px 12px;text-transform:capitalize;">${escapeHtml(c.target_type || '—')}</td>
            <td style="padding:10px 12px;text-transform:capitalize;">${escapeHtml(c.channel || '—')}</td>
            <td style="padding:10px 12px;"><span style="padding:2px 8px;border-radius:20px;font-size:0.75rem;background:${c.status === 'active' ? 'var(--accent-green)' : 'var(--bg-tertiary)'};color:${c.status === 'active' ? '#fff' : 'var(--text-primary)'};">${escapeHtml(c.status || 'draft')}</span></td>
            <td style="padding:10px 12px;">${c.auto_send_followups ? '<span style="color:var(--accent-green);">Yes</span>' : '<span style="color:var(--text-muted);">No</span>'}</td>
          </tr>`).join('')}</tbody>
        </table>`;
      } catch (err) {
        listEl.innerHTML = `<p style="color:var(--accent-red);padding:20px;">Error: ${escapeHtml(err.message)}</p>`;
      }
    }
    window.loadOutreachCampaigns = loadOutreachCampaigns;

    function outreachFetch(pathname, opts) {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      return fetch(`${apiBase}/api/admin/outreach${pathname}`, {
        ...opts,
        headers: { ...getMarketingHeaders(), ...(opts && opts.headers ? opts.headers : {}) }
      }).then(r => r.json());
    }
    window.outreachFetch = outreachFetch;

    // ========== AI OPS AGENT ==========

    let aiOpsCurrentTab = 'activity';
    let aiOpsActivityPage = 1;
    let aiOpsDigests = [];

    function getAiOpsHeaders() {
      // Send whichever credentials are present. agent-fleet-runtime.js and
      // ai-ops-admin.js authenticateAdmin both accept x-admin-token OR
      // x-admin-password (validated server-side against ADMIN_PASSWORD, same
      // pattern as admin-team.js), so a team-admin session with only the
      // token still authenticates correctly.
      const headers = {};
      if (adminTeamToken) headers['x-admin-token'] = adminTeamToken;
      const pw = adminPasswordVerified || localStorage.getItem('mcc_admin_pass') || localStorage.getItem('adminPassword');
      if (pw) headers['x-admin-password'] = pw;
      return headers;
    }

    // Task #174 — diagnostic fetch wrapper for the AI Activity / Agent Fleet
    // admin loaders. The legacy code path showed a generic "Failed to fetch"
    // for any failure mode (network, 401, 5xx) which made production triage
    // impossible. This helper turns every failure into a human-readable error
    // that names:
    //   - the HTTP status code (or "network unreachable" when fetch() itself
    //     rejects, which is what produces the literal "Failed to fetch"
    //     TypeError)
    //   - the relative API path that failed
    //   - a short, plain-language reason ("not signed in", "server error",
    //     "network unreachable")
    // Used by loadAiOpsActivity / loadAiOpsEscalations / loadAiOpsDigests /
    // loadAiOpsSettings so future failures are obvious from the UI without
    // DevTools.
    async function aiOpsFetch(url, options) {
      const opts = options || {};
      const headers = opts.headers || {};
      // Detect missing admin auth headers up-front. Without this guard we
      // would call the function, get a 401, and surface "server said 401" —
      // but the actual user-actionable problem is that they need to sign in
      // again. Common production cause: the admin re-logged in on a different
      // subdomain, or their localStorage was cleared by a tab-restore.
      let hasAuth = false;
      for (const k of Object.keys(headers)) {
        const lk = k.toLowerCase();
        if ((lk === 'x-admin-password' || lk === 'x-admin-token') && headers[k]) {
          hasAuth = true; break;
        }
      }
      // Compute a stable display path. Strip query strings only for the
      // primary label so the message stays short, but include the full
      // path+query as a parenthetical so admins can replay the exact call.
      let displayPath = url;
      let fullPath = url;
      try {
        const u = new URL(url, window.location.origin);
        displayPath = u.pathname;
        fullPath = u.pathname + (u.search || '');
      } catch { /* leave url as-is */ }
      if (!hasAuth) {
        const e = new Error(`Not signed in as admin — open the admin login page and sign in again, then retry. (${displayPath})`);
        e.code = 'NO_ADMIN_AUTH';
        throw e;
      }
      let res;
      try {
        res = await fetch(url, opts);
      } catch (netErr) {
        // fetch() rejects only on network/CORS-level failure. The browser's
        // TypeError message is usually the literal "Failed to fetch", which
        // tells the admin nothing. Replace it with something actionable.
        const e = new Error(`Network unreachable — could not reach ${displayPath} (browser said: ${netErr && netErr.message ? netErr.message : 'fetch failed'}). Check your internet connection or whether the API endpoint is deployed.`);
        e.code = 'NETWORK_UNREACHABLE';
        e.path = fullPath;
        throw e;
      }
      if (!res.ok) {
        // Try to surface the JSON `error`/`message` field the function
        // returned (agent-fleet-admin / ai-ops-admin both use jsonResponse()
        // with { error: '...' }). If parsing fails (502 with no body), keep
        // the bare HTTP status.
        let serverMsg = '';
        try {
          const body = await res.clone().json();
          serverMsg = (body && (body.error || body.message)) || '';
        } catch { /* non-JSON body, leave blank */ }
        const tail = serverMsg ? ` — ${serverMsg}` : '';
        if (res.status === 401 || res.status === 403) {
          const e = new Error(`Not signed in as admin (HTTP ${res.status}) on ${displayPath}${tail}. Sign in again from the admin login page.`);
          e.code = 'ADMIN_AUTH_REJECTED';
          e.status = res.status;
          e.path = fullPath;
          throw e;
        }
        if (res.status >= 500) {
          const e = new Error(`Server error – HTTP ${res.status} on ${displayPath}${tail}.`);
          e.code = 'SERVER_ERROR';
          e.status = res.status;
          e.path = fullPath;
          throw e;
        }
        const e = new Error(`Request failed – HTTP ${res.status} on ${displayPath}${tail}.`);
        e.code = 'REQUEST_FAILED';
        e.status = res.status;
        e.path = fullPath;
        throw e;
      }
      // Defensive: a 200 with non-JSON body still parses as JSON via res.json()
      // throwing — surface that distinctly so the admin knows the function
      // returned garbage rather than a true network failure.
      try {
        return await res.json();
      } catch (parseErr) {
        const e = new Error(`Server returned a non-JSON response (HTTP ${res.status}) on ${displayPath}. ${parseErr && parseErr.message ? parseErr.message : ''}`);
        e.code = 'NON_JSON_RESPONSE';
        e.status = res.status;
        e.path = fullPath;
        throw e;
      }
    }
    window.aiOpsFetch = aiOpsFetch;

    // ========== AGENT FLEET (Task #139) ==========
    // Lightweight glue that exposes the agent-fleet output in the main admin
    // portal. Polls badge-summary every 60s, renders the inline section, and
    // populates the dashboard 24h tile. All heavy lifting still lives in
    // /admin/agent-fleet.html — this is presentation only.
    let _agentFleetBadgeTimer = null;

    async function loadAgentFleetBadge() {
      try {
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const r = await fetch(`${apiBase}/api/admin/agent-fleet/badge-summary`, { headers: getAiOpsHeaders() });
        if (!r.ok) return;
        const j = await r.json();
        const badge = document.getElementById('agent-fleet-badge');
        if (!badge) return;
        const total = j.total_attention || 0;
        if (total > 0) {
          badge.textContent = total > 99 ? '99+' : String(total);
          badge.style.display = 'inline-block';
          badge.title = `${j.open_dlq||0} dead-letter · ${j.needs_review||0} needs review · ${j.unack_spend_alerts||0} spend alerts`;
        } else {
          badge.style.display = 'none';
        }
      } catch (e) { /* silent — badge is best-effort */ }
    }
    window.loadAgentFleetBadge = loadAgentFleetBadge;

    async function loadAgentFleetSection() {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const summaryEl = document.getElementById('agent-fleet-summary');
      // Pull badge summary (counts) and recent actions in parallel.
      try {
        const [bRes] = await Promise.all([
          fetch(`${apiBase}/api/admin/agent-fleet/badge-summary`, { headers: getAiOpsHeaders() })
        ]);
        const b = bRes.ok ? await bRes.json() : { open_dlq: 0, needs_review: 0, unack_spend_alerts: 0 };
        if (summaryEl) {
          const tile = (label, val, color, hint) => `
            <div style="background:var(--bg-elevated);border-radius:10px;padding:14px;border-left:3px solid ${color};">
              <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:4px;">${label}</div>
              <div style="font-size:1.6rem;font-weight:700;color:${color};">${val}</div>
              <div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">${hint}</div>
            </div>`;
          summaryEl.innerHTML = [
            tile('Dead-letter (open)', b.open_dlq || 0, '#c0392b', 'agent_dead_letter'),
            tile('Actions awaiting review', b.needs_review || 0, '#b8942d', 'needs_review = true'),
            tile('Unack spend alerts (7d)', b.unack_spend_alerts || 0, '#f59e0b', 'agent_spend_alerts')
          ].join('');
        }
      } catch (e) {
        if (summaryEl) summaryEl.innerHTML =
          `<div style="grid-column:1/-1;padding:14px;color:var(--accent-red);font-size:0.85rem;">Failed to load summary: ${escapeHtml(e.message)}</div>`;
      }
      // Render last 25 across all agents using the shared helper.
      if (typeof window.renderAgentActivityPanel === 'function') {
        window.renderAgentActivityPanel('agent-fleet-recent', {
          limit: 25, title: '', showEmpty: true
        });
      }
    }
    window.loadAgentFleetSection = loadAgentFleetSection;

    async function loadDashboardAgentTile() {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const tileEl = document.getElementById('dashboard-agent-fleet-tile');
      if (!tileEl) return;
      try {
        // Use the service-role-backed admin API; agent_actions has RLS that only
        // allows service_role, so a browser supabaseClient query would silently
        // return zeros. The /stats/24h endpoint runs server-side with the
        // service-role client and respects authenticateAdmin.
        const r = await fetch(`${apiBase}/api/admin/agent-fleet/stats/24h`, { headers: getAiOpsHeaders() });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const tile = (label, val, color) => `
          <div style="background:var(--bg-elevated);border-radius:10px;padding:14px;border-left:3px solid ${color};">
            <div style="font-size:0.74rem;color:var(--text-muted);margin-bottom:4px;">${label}</div>
            <div style="font-size:1.4rem;font-weight:700;color:${color};">${val}</div>
          </div>`;
        tileEl.innerHTML = [
          tile('Actions taken', j.actions_taken || 0, '#10b981'),
          tile('Escalated',     j.escalated     || 0, '#b8942d'),
          tile('Failed',        j.failed        || 0, '#c0392b')
        ].join('');
      } catch (e) {
        tileEl.innerHTML = `<div style="grid-column:1/-1;padding:10px;color:var(--text-muted);font-size:0.82rem;">Agent metrics unavailable</div>`;
      }
      if (typeof window.renderAgentActivityPanel === 'function') {
        window.renderAgentActivityPanel('dashboard-agent-recent', {
          limit: 10, title: 'Recent Agent Actions', showEmpty: true
        });
      }
    }
    window.loadDashboardAgentTile = loadDashboardAgentTile;


    function switchAiOpsTab(tab) {
      aiOpsCurrentTab = tab;
      ['activity', 'escalations', 'digest', 'settings'].forEach(t => {
        const btn = document.getElementById(`ai-ops-tab-${t}`);
        const panel = document.getElementById(`ai-ops-panel-${t}`);
        if (btn) { btn.style.borderBottomColor = t === tab ? 'var(--accent-blue)' : 'transparent'; btn.style.color = t === tab ? 'var(--accent-blue)' : 'var(--text-secondary)'; btn.style.fontWeight = t === tab ? '600' : '400'; }
        if (panel) panel.style.display = t === tab ? '' : 'none';
      });
      if (tab === 'activity') loadAiOpsActivity();
      else if (tab === 'escalations') loadAiOpsEscalations();
      else if (tab === 'digest') loadAiOpsDigests();
      else if (tab === 'settings') loadAiOpsSettings();
    }
    window.switchAiOpsTab = switchAiOpsTab;

    async function initAiOps() {
      await loadAiOpsActivity();
      loadAiOpsEscalations();
      loadAiOpsSettings();
    }

    async function loadAiOpsActivity() {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const listEl = document.getElementById('ai-ops-activity-list');
      const pagEl = document.getElementById('ai-ops-activity-pagination');
      if (!listEl) return;
      const rawMod = document.getElementById('ai-ops-module-filter')?.value || '';
      const source = document.getElementById('ai-ops-source-filter')?.value || 'all';
      const outcome = document.getElementById('ai-ops-outcome-filter')?.value || '';
      const timeRange = document.getElementById('ai-ops-time-filter')?.value || '7d';
      // Split "agent:slug" prefix into a fleet-only filter; bare values stay legacy.
      const isAgentFilter = rawMod.startsWith('agent:');
      const agentSlug = isAgentFilter ? rawMod.slice('agent:'.length) : '';
      const mod = isAgentFilter ? '' : rawMod;
      // Effective source: agent: prefix forces fleet, otherwise honor dropdown.
      const effSource = isAgentFilter ? 'fleet' : source;
      // Build a `since` ISO timestamp for both branches; "all" leaves it blank.
      const sinceMap = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 };
      const sinceISO = sinceMap[timeRange]
        ? new Date(Date.now() - sinceMap[timeRange] * 60 * 60 * 1000).toISOString()
        : '';
      // Outcome filter is rendered post-fetch (legacy and fleet use different
      // status field names — outcome vs status — and slightly different value
      // vocabularies: legacy uses 'error' where fleet uses 'errored').
      const matchesOutcome = (row, src) => {
        if (!outcome) return true;
        const v = (src === 'fleet' ? row.status : row.outcome) || '';
        if (outcome === 'escalated') {
          return v === 'escalated' || (src === 'fleet' && row.needs_review && !row.reviewed_at);
        }
        if (outcome === 'errored') {
          // Legacy ai_action_log emits 'error', fleet agent_actions emits 'errored'.
          return v === 'errored' || v === 'error';
        }
        return v === outcome;
      };

      listEl.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);">Loading…</div>';
      try {
        // Helpers shared between fleet/all rendering paths.
        const confColor = c => c >= 0.9 ? 'var(--accent-green)' : c >= 0.7 ? 'var(--accent-gold)' : 'var(--accent-red)';
        const renderFleetRow = (a) => `<tr style="border-bottom:1px solid var(--border-subtle);">
          <td style="padding:10px 12px;"><span style="background:#3b82f6;color:#fff;padding:2px 8px;border-radius:6px;font-size:0.75rem;margin-right:6px;">FLEET</span><span style="font-family:monospace;font-size:0.82rem;">${escapeHtml(a.agent_slug)}</span></td>
          <td style="padding:10px 12px;">${escapeHtml(a.action_type || '—')}</td>
          <td style="padding:10px 12px;color:var(--text-muted);font-size:0.82rem;">${escapeHtml(a.autonomy_used || '—')}</td>
          <td style="padding:10px 12px;text-align:center;"><span style="color:${confColor(a.confidence || 0)};font-weight:600;">${((a.confidence || 0) * 100).toFixed(0)}%</span></td>
          <td style="padding:10px 12px;"><span style="padding:2px 8px;border-radius:20px;font-size:0.78rem;background:${a.status === 'executed' ? 'var(--accent-green)' : a.status === 'proposed' ? '#f59e0b' : a.status === 'errored' ? 'var(--accent-red)' : 'var(--bg-tertiary)'};color:${['executed','proposed','errored'].includes(a.status) ? '#fff' : 'var(--text-primary)'};">${escapeHtml(a.status || 'pending')}${a.needs_review && !a.reviewed_at ? ' · review' : ''}</span></td>
          <td style="padding:10px 12px;text-align:right;color:var(--text-muted);font-size:0.82rem;">$${Number(a.cost_usd || 0).toFixed(4)}</td>
          <td style="padding:10px 12px;color:var(--text-muted);font-size:0.82rem;">${new Date(a.created_at).toLocaleDateString()} ${new Date(a.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
        </tr>`;
        const renderLegacyRow = (a) => `<tr style="border-bottom:1px solid var(--border-subtle);">
          <td style="padding:10px 12px;"><span style="background:#7c3aed;color:#fff;padding:2px 8px;border-radius:6px;font-size:0.75rem;margin-right:6px;">AI OPS</span><span style="font-family:monospace;font-size:0.82rem;">${escapeHtml(a.module || '—')}</span></td>
          <td style="padding:10px 12px;">${escapeHtml(a.action_type || '—')}</td>
          <td style="padding:10px 12px;color:var(--text-muted);font-size:0.82rem;">${a.auto_executed ? 'auto' : a.escalated ? 'escalated' : '—'}</td>
          <td style="padding:10px 12px;text-align:center;"><span style="color:${confColor(a.confidence || 0)};font-weight:600;">${((a.confidence || 0) * 100).toFixed(0)}%</span></td>
          <td style="padding:10px 12px;"><span style="padding:2px 8px;border-radius:20px;font-size:0.78rem;background:${a.outcome === 'executed' ? 'var(--accent-green)' : a.outcome === 'escalated' ? '#f59e0b' : a.outcome === 'error' ? 'var(--accent-red)' : 'var(--bg-tertiary)'};color:${['executed','escalated','error'].includes(a.outcome) ? '#fff' : 'var(--text-primary)'};">${escapeHtml(a.outcome || 'pending')}</span></td>
          <td style="padding:10px 12px;text-align:right;color:var(--text-muted);font-size:0.82rem;">—</td>
          <td style="padding:10px 12px;color:var(--text-muted);font-size:0.82rem;">${new Date(a.created_at).toLocaleDateString()} ${new Date(a.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
        </tr>`;
        const tableShell = (rowsHtml) => `<table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
          <thead><tr style="border-bottom:2px solid var(--border-subtle);">
            <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Source / Agent</th>
            <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Action</th>
            <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Autonomy</th>
            <th style="padding:10px 12px;text-align:center;color:var(--text-muted);font-weight:500;">Confidence</th>
            <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Status</th>
            <th style="padding:10px 12px;text-align:right;color:var(--text-muted);font-weight:500;">Cost</th>
            <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Time</th>
          </tr></thead><tbody>${rowsHtml}</tbody></table>`;

        // Fleet-only branch.
        if (effSource === 'fleet') {
          const p = new URLSearchParams({ limit: 100 });
          if (agentSlug) p.set('agent', agentSlug);
          if (sinceISO) p.set('since', sinceISO);
          // Task #174 — aiOpsFetch surfaces network/auth/server errors as
          // human-readable messages instead of bare "Failed to fetch".
          const j = await aiOpsFetch(`${apiBase}/api/admin/agent-fleet/actions?${p}`, { headers: getAiOpsHeaders() });
          let actions = (j.actions || []).filter(a => matchesOutcome(a, 'fleet'));
          if (sinceISO) actions = actions.filter(a => new Date(a.created_at) >= new Date(sinceISO));
          actions = actions.slice(0, 50);
          if (actions.length === 0) {
            listEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">No agent fleet actions match the current filters.</div>';
            if (pagEl) pagEl.innerHTML = '';
            return;
          }
          listEl.innerHTML = tableShell(actions.map(renderFleetRow).join(''));
          if (pagEl) pagEl.innerHTML = '';
          return;
        }

        // Unified ("all") branch — fetch both legacy and fleet, merge by created_at.
        // When a legacy module is selected, fleet rows are suppressed because
        // the module concept does not map to fleet agent_slug (fleet is filtered
        // via the `agent:` prefix instead, which routes to the fleet-only branch).
        if (effSource === 'all') {
          const fleetParams = new URLSearchParams({ limit: 50 });
          if (sinceISO) fleetParams.set('since', sinceISO);
          const legacyParams = new URLSearchParams({ page: 1, limit: 50 });
          if (mod) legacyParams.set('module', mod);
          if (sinceISO) legacyParams.set('since', sinceISO);
          // Task #174 — capture per-source errors instead of silently
          // swallowing them. Previously a 401/network failure on both sides
          // rendered as the harmless "No AI activity matches the current
          // filters." empty state, hiding real outages. Now we surface the
          // diagnostic message from aiOpsFetch when both sides fail and
          // show a partial-fail banner when only one side fails.
          const fleetErr = { msg: null };
          const legacyErr = { msg: null };
          const [fleetRes, legacyRes] = await Promise.all([
            // Skip the fleet round-trip entirely when a legacy-only module filter is set.
            mod
              ? Promise.resolve({ actions: [] })
              : aiOpsFetch(`${apiBase}/api/admin/agent-fleet/actions?${fleetParams}`, { headers: getAiOpsHeaders() })
                  .catch(e => { fleetErr.msg = e.message; return { actions: [] }; }),
            aiOpsFetch(`${apiBase}/api/admin/ai-ops/actions?${legacyParams}`, { headers: getAiOpsHeaders() })
              .catch(e => { legacyErr.msg = e.message; return { actions: [] }; })
          ]);
          // Both sides failed → render the real error so the admin can act
          // instead of seeing a misleading empty state.
          if (fleetErr.msg && legacyErr.msg) {
            listEl.innerHTML = `<div style="padding:32px;text-align:left;color:var(--accent-red);max-width:760px;margin:0 auto;">
              <div style="font-weight:600;margin-bottom:8px;">Could not load AI activity.</div>
              <div style="font-size:0.85rem;margin-bottom:6px;"><strong>Agent Fleet:</strong> ${escapeHtml(fleetErr.msg)}</div>
              <div style="font-size:0.85rem;">Legacy AI Ops: ${escapeHtml(legacyErr.msg)}</div>
            </div>`;
            if (pagEl) pagEl.innerHTML = '';
            return;
          }
          const merged = [
            ...(fleetRes.actions  || []).filter(a => matchesOutcome(a, 'fleet'))
              .map(a => ({ __src: 'fleet',  __ts: a.created_at, row: a })),
            ...(legacyRes.actions || []).filter(a => matchesOutcome(a, 'legacy'))
              .map(a => ({ __src: 'legacy', __ts: a.created_at, row: a }))
          ]
            .filter(m => !sinceISO || new Date(m.__ts) >= new Date(sinceISO))
            .sort((a, b) => new Date(b.__ts) - new Date(a.__ts))
            .slice(0, 50);
          // One side failed → surface a banner above whatever data the other
          // side returned, so the admin sees both the available data AND
          // the real reason the other source is missing.
          const partialFailBanner = (fleetErr.msg || legacyErr.msg)
            ? `<div style="background:var(--bg-tertiary);border-left:3px solid var(--accent-red);padding:10px 14px;margin-bottom:12px;font-size:0.85rem;color:var(--accent-red);">
                 ${fleetErr.msg ? `Agent Fleet feed unavailable: ${escapeHtml(fleetErr.msg)}` : `Legacy AI Ops feed unavailable: ${escapeHtml(legacyErr.msg)}`}
               </div>`
            : '';
          if (merged.length === 0) {
            listEl.innerHTML = partialFailBanner + '<div style="padding:40px;text-align:center;color:var(--text-muted);">No AI activity matches the current filters.</div>';
            if (pagEl) pagEl.innerHTML = '';
            return;
          }
          listEl.innerHTML = partialFailBanner + tableShell(merged.map(m =>
            m.__src === 'fleet' ? renderFleetRow(m.row) : renderLegacyRow(m.row)
          ).join(''));
          if (pagEl) pagEl.innerHTML = '';
          return;
        }

        // Legacy-only branch (preserves the original paginated behavior).
        // Outcome is handled client-side via matchesOutcome() because the legacy
        // table uses different vocabularies ('error' vs fleet 'errored') and we
        // want the same set of dropdown values to behave consistently across
        // every Source selection.
        const params = new URLSearchParams({ page: aiOpsActivityPage, limit: 25 });
        if (mod) params.set('module', mod);
        if (sinceISO) params.set('since', sinceISO);
        // Task #174 — aiOpsFetch surfaces the HTTP status, path, and a plain-
        // language reason instead of a bare "Failed to fetch" / "Server error".
        const data = await aiOpsFetch(`${apiBase}/api/admin/ai-ops/actions?${params}`, { headers: getAiOpsHeaders() });
        const actions = (data.actions || []).filter(a => matchesOutcome(a, 'legacy'));
        if (actions.length === 0) {
          listEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">No AI actions logged yet. Run an AI Ops module to see activity here.</div>';
          if (pagEl) pagEl.innerHTML = '';
          return;
        }
        listEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
          <thead><tr style="border-bottom:2px solid var(--border-subtle);">
            <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Module</th>
            <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Action</th>
            <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Target</th>
            <th style="padding:10px 12px;text-align:center;color:var(--text-muted);font-weight:500;">Confidence</th>
            <th style="padding:10px 12px;text-align:center;color:var(--text-muted);font-weight:500;">Auto</th>
            <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Outcome</th>
            <th style="padding:10px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Time</th>
          </tr></thead>
          <tbody>${actions.map(a => `<tr style="border-bottom:1px solid var(--border-subtle);">
            <td style="padding:10px 12px;"><span style="background:var(--bg-tertiary);padding:2px 8px;border-radius:6px;font-size:0.8rem;font-family:monospace;">${escapeHtml(a.module || '—')}</span></td>
            <td style="padding:10px 12px;">${escapeHtml(a.action_type || '—')}</td>
            <td style="padding:10px 12px;color:var(--text-muted);font-size:0.82rem;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(a.target_id || '')}">${escapeHtml((a.target_id || '—').substring(0, 12))}…</td>
            <td style="padding:10px 12px;text-align:center;"><span style="color:${confColor(a.confidence || 0)};font-weight:600;">${((a.confidence || 0) * 100).toFixed(0)}%</span></td>
            <td style="padding:10px 12px;text-align:center;">${a.auto_executed ? '<span style="color:var(--accent-green);">✓</span>' : a.escalated ? '<span style="color:var(--accent-gold);">⬆</span>' : '<span style="color:var(--text-muted);">—</span>'}</td>
            <td style="padding:10px 12px;"><span style="padding:2px 8px;border-radius:20px;font-size:0.78rem;background:${a.outcome === 'executed' ? 'var(--accent-green)' : a.outcome === 'escalated' ? '#f59e0b' : a.outcome === 'error' ? 'var(--accent-red)' : 'var(--bg-tertiary)'};color:${a.outcome === 'executed' || a.outcome === 'escalated' || a.outcome === 'error' ? '#fff' : 'var(--text-primary)'};">${escapeHtml(a.outcome || 'pending')}</span></td>
            <td style="padding:10px 12px;color:var(--text-muted);font-size:0.82rem;">${new Date(a.created_at).toLocaleDateString()} ${new Date(a.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
          </tr>`).join('')}</tbody>
        </table>`;
        if (pagEl) {
          const total = data.total || 0;
          const totalPages = data.totalPages || 1;
          pagEl.innerHTML = total > 25 ? renderPaginationControls({ page: aiOpsActivityPage, limit: 25, total, totalPages }, 'changeAiOpsActivityPage') : '';
        }
      } catch (err) {
        listEl.innerHTML = `<div style="padding:32px;text-align:center;color:var(--accent-red);">Error: ${escapeHtml(err.message)}</div>`;
      }
    }
    window.loadAiOpsActivity = loadAiOpsActivity;

    function changeAiOpsActivityPage(delta) { aiOpsActivityPage += delta; loadAiOpsActivity(); }
    window.changeAiOpsActivityPage = changeAiOpsActivityPage;

    async function loadAiOpsEscalations() {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const listEl = document.getElementById('ai-ops-escalations-list');
      if (!listEl) return;
      listEl.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);">Loading escalations…</div>';
      try {
        // Task #174 — aiOpsFetch produces actionable error messages.
        const data = await aiOpsFetch(`${apiBase}/api/admin/ai-ops/escalations?status=pending`, { headers: getAiOpsHeaders() });
        const escs = data.escalations || [];
        const badge = document.getElementById('ai-ops-esc-badge');
        if (badge) { badge.textContent = escs.length; badge.style.display = escs.length > 0 ? 'inline' : 'none'; }
        if (escs.length === 0) {
          listEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">No pending escalations. All clear!</div>';
          return;
        }
        listEl.innerHTML = escs.map(e => {
          const rec = e.recommendation || {};
          return `<div style="border:1px solid var(--border-subtle);border-radius:12px;padding:20px;margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
              <div>
                <span style="background:var(--bg-tertiary);padding:2px 10px;border-radius:6px;font-size:0.8rem;font-family:monospace;">${escapeHtml(e.module || '—')}</span>
                <span style="margin-left:8px;color:var(--text-muted);font-size:0.85rem;">${new Date(e.created_at).toLocaleDateString()}</span>
              </div>
              <span style="color:var(--accent-gold);font-weight:600;font-size:0.85rem;">Confidence: ${((e.confidence || 0) * 100).toFixed(0)}%</span>
            </div>
            <div style="margin-bottom:8px;"><strong>Target:</strong> <code style="font-size:0.82rem;background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;">${escapeHtml(e.target_id || '—')}</code></div>
            <div style="margin-bottom:8px;"><strong>AI Recommendation:</strong> <span style="color:var(--accent-blue);">${escapeHtml(rec.recommendation || '—')}</span></div>
            ${rec.reasoning ? `<div style="background:var(--bg-secondary);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:0.88rem;color:var(--text-secondary);">${escapeHtml(rec.reasoning)}</div>` : ''}
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-primary btn-sm" onclick="resolveAiEscalation('${e.id}', 'approve')">✓ Approve AI Recommendation</button>
              <button class="btn btn-secondary btn-sm" onclick="showEscalationOverride('${e.id}')">↩ Override</button>
            </div>
            <div id="esc-override-${e.id}" style="display:none;margin-top:12px;padding:12px;background:var(--bg-secondary);border-radius:8px;">
              <label style="display:block;font-size:0.82rem;color:var(--text-muted);margin-bottom:6px;">Admin Decision</label>
              <select id="esc-decision-${e.id}" style="width:100%;padding:8px 12px;border:1px solid var(--border-subtle);border-radius:6px;background:var(--bg-tertiary);color:var(--text-primary);font-size:0.88rem;margin-bottom:8px;">
                <option value="deny_refund">Deny Refund</option>
                <option value="full_refund">Issue Full Refund</option>
                <option value="partial_refund">Issue Partial Refund</option>
                <option value="escalate_to_support">Escalate to Support Team</option>
                <option value="no_action">No Action Required</option>
                <option value="manual_review">Requires Manual Review</option>
              </select>
              <label style="display:block;font-size:0.82rem;color:var(--text-muted);margin-bottom:6px;">Override Notes</label>
              <textarea id="esc-notes-${e.id}" placeholder="Explain your override reason…" style="width:100%;padding:8px;border:1px solid var(--border-subtle);border-radius:6px;background:var(--bg-tertiary);color:var(--text-primary);font-size:0.85rem;min-height:60px;resize:vertical;"></textarea>
              <div style="display:flex;gap:8px;margin-top:8px;">
                <button class="btn btn-secondary btn-sm" onclick="resolveAiEscalation('${e.id}', 'override')">Confirm Override</button>
                <button class="btn btn-secondary btn-sm" onclick="document.getElementById('esc-override-${e.id}').style.display='none'">Cancel</button>
              </div>
            </div>
          </div>`;
        }).join('');
      } catch (err) {
        listEl.innerHTML = `<div style="padding:32px;text-align:center;color:var(--accent-red);">Error: ${escapeHtml(err.message)}</div>`;
      }
    }
    window.loadAiOpsEscalations = loadAiOpsEscalations;

    function showEscalationOverride(id) {
      const el = document.getElementById(`esc-override-${id}`);
      if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
    }
    window.showEscalationOverride = showEscalationOverride;

    async function resolveAiEscalation(id, action) {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const notes = document.getElementById(`esc-notes-${id}`)?.value || '';
      const adminDecision = action === 'override' ? (document.getElementById(`esc-decision-${id}`)?.value || 'manual_review') : action;
      try {
        const res = await fetch(`${apiBase}/api/admin/ai-ops/escalations/${id}/resolve`, {
          method: 'POST',
          headers: { ...getAiOpsHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, notes, admin_decision: adminDecision })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        if (window.showToast) showToast(action === 'approve' ? 'AI recommendation approved' : 'Override recorded', 'success');
        loadAiOpsEscalations();
      } catch (err) {
        if (window.showToast) showToast('Error: ' + err.message, 'error');
      }
    }
    window.resolveAiEscalation = resolveAiEscalation;

    async function loadAiOpsDigests() {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const contentEl = document.getElementById('ai-ops-digest-content');
      const selectorEl = document.getElementById('ai-ops-digest-selector');
      const dateEl = document.getElementById('ai-ops-digest-date');
      if (!contentEl) return;
      try {
        // Task #174 — aiOpsFetch produces actionable error messages.
        const data = await aiOpsFetch(`${apiBase}/api/admin/ai-ops/digests`, { headers: getAiOpsHeaders() });
        aiOpsDigests = data.digests || [];
        if (aiOpsDigests.length === 0) {
          contentEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">No digests yet. Click "Generate Now" to create today\'s digest.</div>';
          if (selectorEl) selectorEl.style.display = 'none';
          return;
        }
        if (dateEl) {
          dateEl.innerHTML = aiOpsDigests.map(d => `<option value="${d.date}">${new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric', year:'numeric'})}</option>`).join('');
        }
        if (selectorEl) selectorEl.style.display = '';
        renderSelectedDigest();
      } catch (err) {
        contentEl.innerHTML = `<div style="padding:32px;text-align:center;color:var(--accent-red);">Error: ${escapeHtml(err.message)}</div>`;
      }
    }
    window.loadAiOpsDigests = loadAiOpsDigests;

    function renderSelectedDigest() {
      const dateEl = document.getElementById('ai-ops-digest-date');
      const contentEl = document.getElementById('ai-ops-digest-content');
      if (!contentEl) return;
      const date = dateEl?.value;
      const digest = aiOpsDigests.find(d => d.date === date) || aiOpsDigests[0];
      if (!digest) { contentEl.innerHTML = '<div style="color:var(--text-muted);padding:24px;">No digest found for this date.</div>'; return; }
      const stats = digest.stats || {};
      const moduleCount = Object.keys(stats).length;
      contentEl.innerHTML = `
        <div style="padding:20px;background:var(--bg-secondary);border-radius:10px;margin-bottom:16px;">
          <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;">${new Date(digest.date + 'T12:00:00').toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric', year:'numeric'})}</div>
          <p style="line-height:1.6;color:var(--text-primary);">${escapeHtml(digest.narrative || 'No narrative generated.')}</p>
        </div>
        ${moduleCount > 0 ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;">
          ${Object.entries(stats).map(([mod, s]) => `<div style="border:1px solid var(--border-subtle);border-radius:10px;padding:16px;">
            <div style="font-size:0.78rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">${escapeHtml(mod.replace(/_/g,' '))}</div>
            <div style="font-size:1.6rem;font-weight:700;color:var(--text-primary);">${s.total || 0}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);">actions<br>${s.auto_executed || 0} auto · ${s.escalated || 0} escalated</div>
          </div>`).join('')}
        </div>` : ''}
      `;
    }
    window.renderSelectedDigest = renderSelectedDigest;

    async function runAiOpsDigest() {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const resultEl = document.getElementById('ai-ops-digest-trigger-result');
      try {
        if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = 'var(--text-muted)'; resultEl.textContent = 'Generating…'; }
        const res = await fetch(`${apiBase}/api/admin/ai-ops/daily-digest/run`, { method: 'POST', headers: getAiOpsHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        if (window.showToast) showToast('Digest generated successfully', 'success');
        if (resultEl) { resultEl.style.color = 'var(--accent-green)'; resultEl.textContent = `Generated: ${data.date} (${data.totalActions} actions)`; }
        if (aiOpsCurrentTab === 'digest') setTimeout(loadAiOpsDigests, 500);
      } catch (err) {
        if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = 'var(--accent-red)'; resultEl.textContent = 'Error: ' + err.message; }
        if (window.showToast) showToast('Error: ' + err.message, 'error');
      }
    }
    window.runAiOpsDigest = runAiOpsDigest;

    // === Task #150 Light: Dispute Resolver / Payment Tracker / Care Plan Completions ===
    async function runAiOpsDisputeResolver() {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const resultEl = document.getElementById('ai-ops-dispute-trigger-result');
      const idEl = document.getElementById('ai-ops-dispute-completion-id');
      const completionId = (idEl?.value || '').trim();
      if (!completionId) {
        if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = 'var(--accent-red)'; resultEl.textContent = 'Enter a completion UUID first.'; }
        return;
      }
      try {
        if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = 'var(--text-muted)'; resultEl.textContent = 'Resolving…'; }
        const res = await fetch(`${apiBase}/api/admin/ai-ops/dispute-resolver/trigger`, {
          method: 'POST', headers: { ...getAiOpsHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ completion_id: completionId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        if (window.showToast) showToast(`Dispute ${data.action || 'processed'}`, 'success');
        if (resultEl) { resultEl.style.color = 'var(--accent-green)'; resultEl.textContent = `${data.action} (conf ${(data.confidence || 0).toFixed(2)}) — ${data.reasoning || ''}`; }
        if (typeof loadCarePlanCompletions === 'function') loadCarePlanCompletions();
      } catch (err) {
        if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = 'var(--accent-red)'; resultEl.textContent = 'Error: ' + err.message; }
        if (window.showToast) showToast('Error: ' + err.message, 'error');
      }
    }
    window.runAiOpsDisputeResolver = runAiOpsDisputeResolver;

    async function runAiOpsPaymentTracker() {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const resultEl = document.getElementById('ai-ops-payment-trigger-result');
      try {
        if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = 'var(--text-muted)'; resultEl.textContent = 'Scanning…'; }
        const res = await fetch(`${apiBase}/api/admin/ai-ops/payment-tracker/run`, { method: 'POST', headers: getAiOpsHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        if (window.showToast) showToast('Payment scan complete', 'success');
        if (resultEl) {
          resultEl.style.color = 'var(--accent-green)';
          resultEl.textContent = `Aging: ${data.aging_pending || 0} · Mismatches: ${data.amount_mismatches || 0} · Missing amount: ${data.missing_amount || 0} · New findings: ${data.new_findings_logged || 0}`;
        }
      } catch (err) {
        if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = 'var(--accent-red)'; resultEl.textContent = 'Error: ' + err.message; }
        if (window.showToast) showToast('Error: ' + err.message, 'error');
      }
    }
    window.runAiOpsPaymentTracker = runAiOpsPaymentTracker;

    async function loadCarePlanCompletions() {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const contentEl = document.getElementById('ai-ops-completions-content');
      if (!contentEl) return;
      const status = (document.getElementById('ai-ops-completions-status-filter')?.value || '').trim();
      contentEl.innerHTML = '<div style="color:var(--text-muted);padding:24px;text-align:center;">Loading…</div>';
      try {
        const qs = status ? `?status=${encodeURIComponent(status)}` : '';
        const res = await fetch(`${apiBase}/api/admin/ai-ops/care-plan-completions${qs}`, { headers: getAiOpsHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        const rows = data.completions || [];
        if (!rows.length) {
          contentEl.innerHTML = '<div style="color:var(--text-muted);padding:24px;text-align:center;font-size:0.9rem;">No completions found.</div>';
          return;
        }
        const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const fmt = v => v == null ? '—' : `$${Number(v).toFixed(2)}`;
        const dt = s => s ? new Date(s).toLocaleString() : '—';
        const statusColor = s => ({pending:'var(--text-muted)',completed:'var(--accent-green)',disputed:'var(--accent-red)',resolved:'var(--accent-blue)',cancelled:'var(--text-muted)'})[s] || 'var(--text-muted)';
        const payColor = s => ({pending:'var(--text-muted)',captured:'var(--accent-green)',refunded:'var(--accent-red)',partially_refunded:'var(--accent-orange)'})[s] || 'var(--text-muted)';
        contentEl.innerHTML = `
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
              <thead>
                <tr style="text-align:left;border-bottom:1px solid var(--border-subtle);color:var(--text-muted);">
                  <th style="padding:8px;">ID</th><th style="padding:8px;">Status</th><th style="padding:8px;">Bid</th><th style="padding:8px;">Paid/Captured</th><th style="padding:8px;">Escrow</th><th style="padding:8px;">Payout Batch</th><th style="padding:8px;">Created</th><th style="padding:8px;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r => {
                  const hasPI = !!r.stripe_payment_intent_id;
                  const escrowState = r.payment_capture_status || (hasPI ? 'pending' : null);
                  const canCapture = hasPI && r.payment_capture_status !== 'captured' && r.payment_capture_status !== 'refunded';
                  const canRefund = hasPI && r.payment_capture_status !== 'refunded';
                  return `
                  <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:8px;font-family:monospace;font-size:0.78rem;">${esc(r.id).slice(0,8)}…</td>
                    <td style="padding:8px;color:${statusColor(r.status)};font-weight:600;">${esc(r.status)}</td>
                    <td style="padding:8px;">${fmt(r.bid_amount)}</td>
                    <td style="padding:8px;">${fmt(r.captured_amount != null ? r.captured_amount : r.actual_paid_amount)}</td>
                    <td style="padding:8px;color:${payColor(escrowState)};font-weight:600;font-size:0.8rem;">${escrowState ? esc(escrowState) : '—'}</td>
                    <td style="padding:8px;font-family:monospace;font-size:0.78rem;color:var(--text-muted);">${r.payout_batch_id ? esc(r.payout_batch_id) : '—'}</td>
                    <td style="padding:8px;color:var(--text-muted);">${dt(r.created_at)}</td>
                    <td style="padding:8px;display:flex;gap:4px;flex-wrap:wrap;">
                      <button class="btn btn-secondary btn-sm" onclick="document.getElementById('ai-ops-dispute-completion-id').value='${esc(r.id)}';window.scrollTo({top:0,behavior:'smooth'});">Use ID</button>
                      ${r.status === 'disputed' ? `<button class="btn btn-primary btn-sm" onclick="(async()=>{document.getElementById('ai-ops-dispute-completion-id').value='${esc(r.id)}';await runAiOpsDisputeResolver();})()">Resolve</button>` : ''}
                      ${canCapture ? `<button class="btn btn-primary btn-sm" style="background:var(--accent-green);" onclick="captureCarePlanEscrow('${esc(r.id)}')">Capture</button>` : ''}
                      ${canRefund ? `<button class="btn btn-secondary btn-sm" style="border-color:var(--accent-red);color:var(--accent-red);" onclick="refundCarePlanEscrow('${esc(r.id)}')">Refund</button>` : ''}
                      <button class="btn btn-secondary btn-sm" onclick="tagCarePlanPayoutBatch('${esc(r.id)}', '${esc(r.payout_batch_id || '')}')">Tag Batch</button>
                    </td>
                  </tr>
                `;}).join('')}
              </tbody>
            </table>
          </div>
          <div style="color:var(--text-muted);font-size:0.78rem;padding:8px;">${rows.length} record${rows.length === 1 ? '' : 's'} · Capture/Refund actions hit Stripe live — held funds get released immediately.</div>
        `;
      } catch (err) {
        contentEl.innerHTML = `<div style="color:var(--accent-red);padding:16px;font-size:0.85rem;">Error: ${err.message}</div>`;
      }
    }
    window.loadCarePlanCompletions = loadCarePlanCompletions;

    async function captureCarePlanEscrow(completionId) {
      if (!completionId) return;
      if (!confirm('Capture held escrow funds for this completion? This will release payment to the provider AND trigger founder commission. Cannot be undone.')) return;
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const res = await fetch(`${apiBase}/api/admin/ai-ops/care-plan-completions/${completionId}/capture`, {
          method: 'POST',
          headers: getAiOpsHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        alert(data.already_captured ? 'Already captured.' : `Captured $${(data.captured_amount || 0).toFixed(2)}` + (data.commission?.amount ? ` (commission: $${data.commission.amount.toFixed(2)})` : ''));
        await loadCarePlanCompletions();
      } catch (err) {
        alert(`Capture failed: ${err.message}`);
      }
    }
    window.captureCarePlanEscrow = captureCarePlanEscrow;

    async function refundCarePlanEscrow(completionId) {
      if (!completionId) return;
      const amountStr = prompt('Refund amount in dollars (leave blank for full refund):', '');
      if (amountStr === null) return;
      const body = {};
      const cleaned = String(amountStr).replace(/[\s$,]/g, '');
      if (cleaned !== '') {
        const amt = Number(cleaned);
        if (!Number.isFinite(amt) || amt <= 0) { alert('Invalid amount.'); return; }
        body.amount = amt;
      }
      if (!confirm(`Refund ${body.amount ? '$' + body.amount.toFixed(2) : 'FULL amount'} to member? If funds are still held (uncaptured), the authorization will be cancelled. Cannot be undone.`)) return;
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const res = await fetch(`${apiBase}/api/admin/ai-ops/care-plan-completions/${completionId}/refund`, {
          method: 'POST',
          headers: { ...getAiOpsHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (data.cancelled) {
          alert('Held authorization cancelled — member was never charged.');
        } else {
          alert(`Refunded $${(data.refunded_amount || 0).toFixed(2)}${data.is_full ? ' (full)' : ' (partial)'}`);
        }
        await loadCarePlanCompletions();
      } catch (err) {
        alert(`Refund failed: ${err.message}`);
      }
    }
    window.refundCarePlanEscrow = refundCarePlanEscrow;

    // Task #150: tag a completion with a payout-batch label so weekly
    // settlement runs can be reconciled in one place. Pass empty string to clear.
    async function tagCarePlanPayoutBatch(completionId, currentValue) {
      if (!completionId) return;
      const next = prompt('Payout batch ID (e.g. 2026-W17). Leave blank to clear.', currentValue || '');
      if (next === null) return;
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      try {
        const res = await fetch(`${apiBase}/api/admin/ai-ops/care-plan-completions/${completionId}`, {
          method: 'PATCH',
          headers: { ...getAiOpsHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payout_batch_id: next.trim() || null,
            metadata_merge: { payout_batch_tagged_at: new Date().toISOString(), payout_batch_value: next.trim() || null }
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (window.showToast) showToast('Payout batch updated', 'success');
        await loadCarePlanCompletions();
      } catch (err) {
        alert(`Tag failed: ${err.message}`);
      }
    }
    window.tagCarePlanPayoutBatch = tagCarePlanPayoutBatch;

    async function loadAiOpsSettings() {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const contentEl = document.getElementById('ai-ops-settings-content');
      if (!contentEl) return;
      try {
        // Task #174 — aiOpsFetch produces actionable error messages instead
        // of "Failed to fetch" / generic "Failed".
        const data = await aiOpsFetch(`${apiBase}/api/admin/ai-ops/settings`, { headers: getAiOpsHeaders() });
        const shadowMode = data.shadow_mode;
        const shadowBanner = document.getElementById('ai-ops-shadow-banner');
        if (shadowBanner) shadowBanner.style.display = shadowMode ? 'flex' : 'none';
        contentEl.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-bottom:20px;">
            <div style="border:1px solid var(--border-subtle);border-radius:10px;padding:16px;">
              <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">Current Confidence Threshold</div>
              <div style="font-size:1.8rem;font-weight:700;color:${shadowMode ? '#a78bfa' : 'var(--accent-blue)'};">${(data.confidence_threshold * 100).toFixed(0)}%</div>
              <div style="font-size:0.82rem;color:var(--text-muted);margin-top:4px;">${shadowMode ? '🛡️ Shadow Mode — nothing auto-executes' : '✓ Autonomous actions enabled'}</div>
            </div>
            <div style="border:1px solid var(--border-subtle);border-radius:10px;padding:16px;">
              <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">Current Max Auto-Refund</div>
              <div style="font-size:1.8rem;font-weight:700;color:var(--accent-green);">$${data.max_auto_refund}</div>
              <div style="font-size:0.82rem;color:var(--text-muted);margin-top:4px;">Per dispute auto-resolution ceiling</div>
            </div>
          </div>
          <div style="border:1px solid var(--border-subtle);border-radius:12px;padding:20px;max-width:480px;">
            <div style="font-weight:600;margin-bottom:16px;">Override Settings (Session)</div>
            <div style="margin-bottom:14px;">
              <label style="display:block;font-size:0.85rem;color:var(--text-muted);margin-bottom:6px;">Confidence Threshold (0.0 – 1.0)</label>
              <input id="ai-ops-threshold-input" type="number" min="0" max="1" step="0.05" value="${data.confidence_threshold}" style="width:100%;padding:8px 12px;border:1px solid var(--border-subtle);border-radius:8px;background:var(--bg-tertiary);color:var(--text-primary);font-size:0.95rem;">
              <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">1.0 = Shadow Mode (recommend for initial setup)</div>
            </div>
            <div style="margin-bottom:16px;">
              <label style="display:block;font-size:0.85rem;color:var(--text-muted);margin-bottom:6px;">Max Auto-Refund ($)</label>
              <input id="ai-ops-max-refund-input" type="number" min="0" max="10000" step="50" value="${data.max_auto_refund}" style="width:100%;padding:8px 12px;border:1px solid var(--border-subtle);border-radius:8px;background:var(--bg-tertiary);color:var(--text-primary);font-size:0.95rem;">
            </div>
            <button class="btn btn-primary btn-sm" onclick="saveAiOpsSettings()">Save Settings</button>
            <div id="ai-ops-settings-save-msg" style="margin-top:10px;font-size:0.85rem;display:none;"></div>
          </div>
          <div style="margin-top:16px;padding:12px 16px;background:var(--bg-secondary);border-radius:8px;font-size:0.82rem;color:var(--text-secondary);">
            <strong>Note:</strong> These overrides are stored in the database and take precedence over environment variables at runtime. For permanent changes, also update <code>AI_CONFIDENCE_THRESHOLD</code> and <code>AI_MAX_AUTO_REFUND</code> env vars.
          </div>
        `;
      } catch (err) {
        if (contentEl) contentEl.innerHTML = `<div style="color:var(--text-muted);font-size:0.9rem;">Settings unavailable: ${escapeHtml(err.message)}</div>`;
      }
    }
    window.loadAiOpsSettings = loadAiOpsSettings;

    async function saveAiOpsSettings() {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const threshold = parseFloat(document.getElementById('ai-ops-threshold-input')?.value || '1');
      const maxRefund = parseFloat(document.getElementById('ai-ops-max-refund-input')?.value || '500');
      const msgEl = document.getElementById('ai-ops-settings-save-msg');
      if (isNaN(threshold) || threshold < 0 || threshold > 1) { if (window.showToast) showToast('Threshold must be between 0.0 and 1.0', 'error'); return; }
      if (isNaN(maxRefund) || maxRefund < 0) { if (window.showToast) showToast('Max refund must be a positive number', 'error'); return; }
      if (msgEl) { msgEl.style.display = 'block'; msgEl.style.color = 'var(--text-muted)'; msgEl.textContent = 'Saving…'; }
      try {
        const res = await fetch(`${apiBase}/api/admin/ai-ops/settings`, {
          method: 'POST',
          headers: { ...getAiOpsHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ confidence_threshold: threshold, max_auto_refund: maxRefund })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');
        if (msgEl) { msgEl.style.color = 'var(--accent-green)'; msgEl.textContent = '✓ Settings saved'; setTimeout(() => { msgEl.style.display = 'none'; }, 3000); }
        if (window.showToast) showToast('AI Ops settings saved', 'success');
        setTimeout(loadAiOpsSettings, 500);
      } catch (err) {
        if (msgEl) { msgEl.style.color = 'var(--accent-red)'; msgEl.textContent = 'Error: ' + err.message; }
        if (window.showToast) showToast('Save failed: ' + err.message, 'error');
      }
    }
    window.saveAiOpsSettings = saveAiOpsSettings;

    async function triggerDisputeResolver() {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const disputeId = document.getElementById('ai-ops-dispute-id')?.value?.trim();
      const resultEl = document.getElementById('ai-ops-dispute-result');
      if (!disputeId) { if (window.showToast) showToast('Enter a dispute ID', 'error'); return; }
      if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = 'var(--text-muted)'; resultEl.textContent = 'Analyzing dispute…'; }
      try {
        const data = await safeFetch(`${apiBase}/api/admin/ai-ops/dispute-resolver/trigger`, {
          method: 'POST',
          headers: { ...getAiOpsHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ dispute_id: disputeId })
        });
        if (resultEl) {
          resultEl.style.color = 'var(--accent-green)';
          resultEl.textContent = `Action: ${data.action || '—'} | Confidence: ${((data.confidence || 0) * 100).toFixed(0)}% | ${data.reasoning || ''}`;
        }
        if (window.showToast) showToast(`Dispute ${data.action || 'analyzed'} (${((data.confidence || 0) * 100).toFixed(0)}% confidence)`, 'success');
        setTimeout(() => { if (aiOpsCurrentTab === 'activity') loadAiOpsActivity(); else if (aiOpsCurrentTab === 'escalations') loadAiOpsEscalations(); }, 500);
      } catch (err) {
        if (resultEl) { resultEl.style.color = 'var(--accent-red)'; resultEl.textContent = 'Error: ' + err.message; }
        if (window.showToast) showToast('Error: ' + err.message, 'error');
      }
    }
    window.triggerDisputeResolver = triggerDisputeResolver;

    async function triggerPaymentTracker() {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const resultEl = document.getElementById('ai-ops-payment-result');
      if (resultEl) { resultEl.style.display = 'block'; resultEl.style.color = 'var(--text-muted)'; resultEl.textContent = 'Running payment tracker…'; }
      try {
        const data = await safeFetch(`${apiBase}/api/admin/ai-ops/payment-tracker/run`, { method: 'POST', headers: getAiOpsHeaders() });
        if (resultEl) {
          resultEl.style.color = 'var(--accent-green)';
          resultEl.textContent = data.message || `Processed ${data.processed || 0} orders, ${data.anomalies || 0} anomalies`;
        }
        if (window.showToast) showToast(data.message || `Payment tracker: ${data.processed || 0} orders`, 'success');
      } catch (err) {
        if (resultEl) { resultEl.style.color = 'var(--accent-red)'; resultEl.textContent = 'Error: ' + err.message; }
        if (window.showToast) showToast('Error: ' + err.message, 'error');
      }
    }
    window.triggerPaymentTracker = triggerPaymentTracker;

    // ========== END AI OPS AGENT ==========

    // ========== SMS LOG ==========

    let smsLogPage = 1;
    const SMS_LOG_PAGE_SIZE = 50;

    function smsStatusBadge(status) {
      const map = {
        delivered: 'approved',
        sent: 'blue',
        queued: 'orange',
        failed: 'rejected',
        undelivered: 'rejected',
        unknown: 'muted'
      };
      return `<span class="status-badge ${map[status] || 'muted'}">${status || 'unknown'}</span>`;
    }

    function smsTypeBadge(type) {
      const labels = {
        '2fa': '2FA',
        appointment_reminders: 'Appt Reminder',
        maintenance_reminders: 'Maintenance',
        bid_alert: 'Bid Alert',
        general: 'General',
        maintenance_nudge: 'Maintenance',
        dream_car: 'Dream Car'
      };
      return `<span class="badge badge-gray">${labels[type] || type || 'unknown'}</span>`;
    }

    async function loadSmsLog(page = 1) {
      smsLogPage = page;
      const statusFilter = document.getElementById('sms-log-status-filter')?.value || '';
      const typeFilter = document.getElementById('sms-log-type-filter')?.value || '';
      const tbody = document.getElementById('sms-log-tbody');
      const paginationEl = document.getElementById('sms-log-pagination');
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:40px;"><div style="display:inline-block;width:24px;height:24px;border:2px solid var(--border-subtle);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;"></div></td></tr>`;

      try {
        const params = new URLSearchParams({ page, limit: SMS_LOG_PAGE_SIZE });
        if (statusFilter) params.set('status', statusFilter);
        if (typeFilter) params.set('type', typeFilter);
        const data = await safeFetch(`/api/admin/sms-log?${params}`, {
          headers: { 'x-admin-password': localStorage.getItem('adminPassword') || '', 'x-admin-token': localStorage.getItem('adminTeamToken') || '' }
        });

        const { rows = [], total = 0, summary = {} } = data;

        const total7dEl = document.getElementById('sms-stat-total7d');
        const rateEl = document.getElementById('sms-stat-rate');
        const failedEl = document.getElementById('sms-stat-failed');
        if (total7dEl) total7dEl.textContent = summary.total7d ?? '--';
        if (rateEl) rateEl.textContent = summary.deliveryRate != null ? `${summary.deliveryRate}%` : '--';
        if (failedEl) {
          failedEl.textContent = summary.failed7d ?? '--';
          failedEl.style.color = summary.failed7d > 0 ? 'var(--accent-red)' : 'inherit';
        }

        if (!tbody) return;
        if (rows.length === 0) {
          tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:40px;">No SMS messages found</td></tr>`;
        } else {
          tbody.innerHTML = rows.map(row => {
            const isFailed = row.status === 'failed' || row.status === 'undelivered';
            const rowStyle = isFailed ? 'border-left:3px solid var(--accent-red);' : '';
            const errorCell = row.error_code
              ? `<span style="color:var(--accent-red);font-size:0.82rem;">${row.error_code}${row.error_message ? ' — ' + row.error_message.substring(0, 60) : ''}</span>`
              : `<span style="color:var(--text-muted);">—</span>`;
            const sidCell = row.message_sid
              ? `<span style="font-size:0.75rem;font-family:monospace;color:var(--text-muted);">${row.message_sid}</span>`
              : `<span style="color:var(--text-muted);">—</span>`;
            const actionCell = row.message_sid
              ? `<button class="btn btn-ghost btn-sm" onclick="refreshSingleSmsStatus('${row.message_sid}', this)" title="Refresh status from Twilio" style="padding:4px 8px;font-size:0.75rem;"><span class="icon-inline" data-icon="refresh-cw"></span></button>`
              : '';
            const ts = row.created_at ? new Date(row.created_at).toLocaleString() : '—';
            return `<tr style="${rowStyle}">
              <td style="font-size:0.82rem;white-space:nowrap;">${ts}</td>
              <td style="font-family:monospace;font-size:0.85rem;">${row.to_phone_masked || '—'}</td>
              <td>${smsTypeBadge(row.message_type)}</td>
              <td>${smsStatusBadge(row.status)}</td>
              <td style="max-width:260px;">${errorCell}</td>
              <td>${sidCell}</td>
              <td>${actionCell}</td>
            </tr>`;
          }).join('');
          if (window.MCC_ICONS) {
            tbody.querySelectorAll('[data-icon]').forEach(el => {
              const svg = MCC_ICONS[el.getAttribute('data-icon')];
              if (svg) el.innerHTML = svg;
            });
          }
        }

        if (paginationEl) {
          const totalPages = Math.ceil(total / SMS_LOG_PAGE_SIZE);
          const start = total > 0 ? (page - 1) * SMS_LOG_PAGE_SIZE + 1 : 0;
          const end = Math.min(page * SMS_LOG_PAGE_SIZE, total);
          paginationEl.innerHTML = `
            <span>${total > 0 ? `${start}–${end} of ${total}` : '0 results'}</span>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-secondary btn-sm" onclick="loadSmsLog(${page - 1})" ${page <= 1 ? 'disabled' : ''}>← Prev</button>
              <span style="padding:6px 12px;font-size:0.85rem;">Page ${page} of ${totalPages || 1}</span>
              <button class="btn btn-secondary btn-sm" onclick="loadSmsLog(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>Next →</button>
            </div>`;
        }
      } catch (err) {
        console.error('[SMS_LOG] Load error:', err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--accent-red);padding:40px;">${err.message}</td></tr>`;
      }
    }

    async function refreshSingleSmsStatus(sid, btn) {
      if (!sid) return;
      if (btn) { btn.disabled = true; btn.textContent = '…'; }
      try {
        const res = await fetch('/api/admin/sms-log/refresh-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-password': localStorage.getItem('adminPassword') || '',
            'x-admin-token': localStorage.getItem('adminTeamToken') || ''
          },
          body: JSON.stringify({ sids: [sid] })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        const result = data.results?.[0];
        if (result?.status) {
          if (window.showToast) showToast(`Status updated: ${result.status}`, 'success');
          await loadSmsLog(smsLogPage);
        }
      } catch (err) {
        if (window.showToast) showToast('Refresh failed: ' + err.message, 'error');
      } finally {
        if (btn) { btn.disabled = false; if (btn.querySelector) btn.innerHTML = (window.MCC_ICONS?.['refresh-cw'] || '↻'); }
      }
    }

    window.loadSmsLog = loadSmsLog;
    window.refreshSingleSmsStatus = refreshSingleSmsStatus;

    // ========== END SMS LOG ==========

    // ========== SAAS SUBSCRIPTIONS ADMIN ==========
    async function loadSaasSubscriptions() {
      const container = document.getElementById('saas-subscriptions-content');
      if (!container) return;
      container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);">Loading subscription data…</div>';
      try {
        const resp = await safeFetch('/api/admin/saas/subscriptions', {
          headers: { 'x-admin-token': window.__adminToken || '' }
        });

        const { subscriptions = [], stats = {}, by_product = {}, recent_churns = [] } = resp;

        const productLabels = {
          fleet: 'Fleet Management', shop: 'Provider Shop', ai_api: 'AI API',
          outreach: 'Outreach Engine', white_label: 'White-label'
        };
        const statusColors = {
          active: 'var(--accent-green)', trialing: 'var(--accent-blue)',
          canceled: 'var(--text-muted)', past_due: 'var(--accent-red)',
          incomplete: 'var(--accent-orange)'
        };

        container.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:28px;">
            <div class="stat-card" style="padding:20px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);">
              <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">Total Subscriptions</div>
              <div style="font-size:1.8rem;font-weight:700;">${stats.total || 0}</div>
            </div>
            <div class="stat-card" style="padding:20px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);">
              <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">Active</div>
              <div style="font-size:1.8rem;font-weight:700;color:var(--accent-green);">${stats.active || 0}</div>
            </div>
            <div class="stat-card" style="padding:20px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);">
              <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">Trialing</div>
              <div style="font-size:1.8rem;font-weight:700;color:var(--accent-blue);">${stats.trialing || 0}</div>
            </div>
            <div class="stat-card" style="padding:20px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);">
              <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">Past Due</div>
              <div style="font-size:1.8rem;font-weight:700;color:var(--accent-red);">${stats.past_due || 0}</div>
            </div>
            <div class="stat-card" style="padding:20px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);">
              <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">Est. MRR</div>
              <div style="font-size:1.8rem;font-weight:700;color:var(--accent-gold);">$${stats.mrr_dollars || '0.00'}</div>
            </div>
            <div class="stat-card" style="padding:20px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);">
              <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">Churned (30d)</div>
              <div style="font-size:1.8rem;font-weight:700;color:var(--accent-orange);">${stats.recent_churns || 0}</div>
            </div>
          </div>

          ${recent_churns.length > 0 ? `
          <div style="margin-bottom:24px;">
            <div style="font-weight:600;margin-bottom:10px;color:var(--accent-orange);">Recent Churns (Last 30 Days)</div>
            <div style="overflow-x:auto;">
              <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
                <thead>
                  <tr style="background:var(--bg-input);">
                    <th style="padding:8px 12px;text-align:left;color:var(--text-muted);font-weight:500;">User</th>
                    <th style="padding:8px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Product</th>
                    <th style="padding:8px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Plan</th>
                    <th style="padding:8px 12px;text-align:left;color:var(--text-muted);font-weight:500;">Canceled At</th>
                  </tr>
                </thead>
                <tbody>
                  ${recent_churns.map(c => `
                    <tr style="border-top:1px solid var(--border-subtle);">
                      <td style="padding:8px 12px;color:var(--text-muted);">${c.user_id?.slice(0,8)}…</td>
                      <td style="padding:8px 12px;font-weight:500;">${{ fleet: 'Fleet', shop: 'Shop', ai_api: 'AI API', outreach: 'Outreach', white_label: 'White-label' }[c.product] || c.product}</td>
                      <td style="padding:8px 12px;text-transform:capitalize;">${c.plan}</td>
                      <td style="padding:8px 12px;color:var(--text-muted);">${new Date(c.canceled_at).toLocaleDateString()}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>` : ''}

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:28px;">
            ${Object.entries(by_product).map(([product, counts]) => `
              <div style="padding:16px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);">
                <div style="font-weight:600;margin-bottom:10px;">${productLabels[product] || product}</div>
                <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:0.82rem;">
                  <span style="color:var(--accent-green);">Active: ${counts.active || 0}</span>
                  <span style="color:var(--accent-blue);">Trial: ${counts.trialing || 0}</span>
                  <span style="color:var(--text-muted);">Canceled: ${counts.canceled || 0}</span>
                  <span style="font-weight:600;">Total: ${counts.total || 0}</span>
                </div>
              </div>
            `).join('')}
            ${Object.keys(by_product).length === 0 ? '<div style="color:var(--text-muted);padding:16px;">No subscriptions yet.</div>' : ''}
          </div>

          <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);overflow:hidden;">
            <div style="padding:16px 20px;border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between;">
              <h3 style="margin:0;font-size:1rem;">All Subscriptions</h3>
              <button class="btn btn-secondary btn-sm" onclick="loadSaasSubscriptions()">↻ Refresh</button>
            </div>
            ${subscriptions.length === 0 ? `
              <div style="padding:40px;text-align:center;color:var(--text-muted);">
                <div style="font-size:2.5rem;margin-bottom:12px;">📋</div>
                <p>No SaaS subscriptions yet.</p>
                <p style="font-size:0.85rem;">Once users subscribe to a SaaS product line, their subscriptions will appear here.</p>
              </div>
            ` : `
              <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;">
                  <thead>
                    <tr style="background:var(--bg-input);">
                      <th style="padding:10px 16px;text-align:left;font-size:0.8rem;color:var(--text-muted);font-weight:500;">User ID</th>
                      <th style="padding:10px 16px;text-align:left;font-size:0.8rem;color:var(--text-muted);font-weight:500;">Product</th>
                      <th style="padding:10px 16px;text-align:left;font-size:0.8rem;color:var(--text-muted);font-weight:500;">Plan</th>
                      <th style="padding:10px 16px;text-align:left;font-size:0.8rem;color:var(--text-muted);font-weight:500;">Status</th>
                      <th style="padding:10px 16px;text-align:left;font-size:0.8rem;color:var(--text-muted);font-weight:500;">Renews</th>
                      <th style="padding:10px 16px;text-align:left;font-size:0.8rem;color:var(--text-muted);font-weight:500;">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${subscriptions.map(s => `
                      <tr style="border-top:1px solid var(--border-subtle);">
                        <td style="padding:10px 16px;font-size:0.82rem;color:var(--text-muted);">${s.user_id?.slice(0,8)}…</td>
                        <td style="padding:10px 16px;font-weight:500;">${productLabels[s.product] || s.product}</td>
                        <td style="padding:10px 16px;text-transform:capitalize;">${s.plan}</td>
                        <td style="padding:10px 16px;">
                          <span style="padding:2px 8px;border-radius:100px;font-size:0.75rem;font-weight:600;background:${statusColors[s.status] || 'var(--text-muted)'}22;color:${statusColors[s.status] || 'var(--text-muted)'};border:1px solid ${statusColors[s.status] || 'var(--text-muted)'}44;">${s.status}</span>
                          ${s.cancel_at_period_end ? '<span style="margin-left:4px;font-size:0.72rem;color:var(--accent-orange);">Cancels at period end</span>' : ''}
                        </td>
                        <td style="padding:10px 16px;font-size:0.82rem;color:var(--text-muted);">${s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : '—'}</td>
                        <td style="padding:10px 16px;font-size:0.82rem;color:var(--text-muted);">${new Date(s.created_at).toLocaleDateString()}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        `;
      } catch (err) {
        container.innerHTML = `<div style="padding:32px;text-align:center;color:var(--accent-red);">Failed to load subscriptions: ${err.message}</div>`;
      }
    }

    window.loadSaasSubscriptions = loadSaasSubscriptions;

    // ========== END SAAS SUBSCRIPTIONS ADMIN ==========

    // ========== WHITE-LABEL TENANTS (Task #87) ==========

    let _editingTenantId = null;

    async function loadWhiteLabelTenants() {
      const statsEl = document.getElementById('white-label-stats');
      const contentEl = document.getElementById('white-label-content');
      if (!statsEl || !contentEl) return;

      const token = adminTeamToken || (adminPasswordVerified ? adminPassword : null);
      const headers = token ? { 'x-admin-token': token } : {};

      try {
        const res = await fetch('/api/admin/white-label/tenants', { headers });
        if (!res.ok) throw new Error('Failed to load tenants');
        const { tenants, meta } = await res.json();

        const active = tenants.filter(t => t.status === 'active').length;
        const byPlan = { starter: 0, pro: 0, business: 0 };
        for (const t of tenants) if (byPlan[t.plan] !== undefined) byPlan[t.plan]++;
        const totalMrr = meta?.total_mrr || tenants.filter(t=>t.status==='active').reduce((s,t)=>s+({starter:149,pro:499,business:999}[t.plan]||0),0);
        const totalMembers = tenants.reduce((s,t)=>s+(t._stats?.member_count||0),0);

        statsEl.innerHTML = `
          <div class="stat-card"><div class="stat-icon" style="background:var(--accent-blue-soft);color:var(--accent-blue);">🏢</div><div class="stat-value">${tenants.length}</div><div class="stat-label">Total Tenants</div></div>
          <div class="stat-card"><div class="stat-icon" style="background:var(--accent-green-soft);color:var(--accent-green);">✅</div><div class="stat-value">${active}</div><div class="stat-label">Active</div></div>
          <div class="stat-card"><div class="stat-icon" style="background:var(--accent-gold-soft);color:var(--accent-gold);">💰</div><div class="stat-value">$${totalMrr.toLocaleString()}</div><div class="stat-label">Est. MRR</div></div>
          <div class="stat-card"><div class="stat-icon" style="background:var(--accent-teal-soft);color:var(--accent-teal);">👥</div><div class="stat-value">${totalMembers}</div><div class="stat-label">Total Members</div></div>
          <div class="stat-card"><div class="stat-icon" style="background:var(--accent-gold-soft);color:var(--accent-gold);">⭐</div><div class="stat-value">${byPlan.starter}</div><div class="stat-label">Starter</div></div>
          <div class="stat-card"><div class="stat-icon" style="background:var(--accent-teal-soft);color:var(--accent-teal);">🚀</div><div class="stat-value">${byPlan.pro}</div><div class="stat-label">Pro</div></div>
          <div class="stat-card"><div class="stat-icon" style="background:var(--accent-purple-soft,#7c3aed22);color:#7c3aed;">💼</div><div class="stat-value">${byPlan.business}</div><div class="stat-label">Business</div></div>
        `;

        if (!tenants.length) {
          contentEl.innerHTML = `
            <div style="padding:64px;text-align:center;color:var(--text-muted);">
              <div style="font-size:48px;margin-bottom:16px;">🏢</div>
              <h3 style="margin:0 0 8px;">No White-label Tenants Yet</h3>
              <p style="margin:0 0 20px;">Create your first branded platform instance for an enterprise client.</p>
              <button class="btn btn-primary" onclick="openCreateTenantModal()">Create First Tenant</button>
            </div>`;
          return;
        }

        const planBadge = (plan) => {
          const colors = { starter: 'var(--accent-blue)', pro: 'var(--accent-teal)', business: '#7c3aed' };
          return `<span style="background:${colors[plan] || '#888'}22;color:${colors[plan] || '#888'};padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;text-transform:uppercase;">${plan}</span>`;
        };
        const statusBadge = (s) => {
          const m = { active: ['var(--accent-green)','Active'], suspended: ['var(--accent-orange)','Suspended'], canceled: ['var(--accent-red)','Canceled'], pending: ['var(--accent-blue)','Pending'] };
          const [col, label] = m[s] || ['#888', s];
          return `<span style="background:${col}22;color:${col};padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">${label}</span>`;
        };

        contentEl.innerHTML = `
          <div style="overflow-x:auto;">
            <table class="data-table" style="width:100%;">
              <thead><tr>
                <th>Brand Name</th><th>Domain</th><th>Plan</th><th>Status</th>
                <th>Members Used</th><th>Providers Used</th><th>Est. MRR</th><th>Created</th><th>Actions</th>
              </tr></thead>
              <tbody>
                ${tenants.map(t => {
                  const stats = t._stats || {};
                  const mLimit = t.max_members === -1 ? '∞' : t.max_members;
                  const pLimit = t.max_providers === -1 ? '∞' : t.max_providers;
                  const planMrr = { starter: 149, pro: 499, business: 999 };
                  const mrr = t.status === 'active' ? (planMrr[t.plan] || 0) : 0;
                  const tenantDomain = t.domain || (t.subdomain ? t.subdomain + '.mycarconcierge.com' : null);
                  return `
                  <tr>
                    <td><div style="font-weight:600;">${t.brand_name}</div><div style="font-size:12px;color:var(--text-muted);">${t.name}</div></td>
                    <td style="font-family:monospace;font-size:12px;">${tenantDomain ? `<a href="https://${tenantDomain}" target="_blank" style="color:var(--accent-teal);">${tenantDomain}</a>` : '<span style="color:var(--text-muted)">—</span>'}</td>
                    <td>${planBadge(t.plan)}</td>
                    <td>${statusBadge(t.status)}</td>
                    <td style="text-align:center;">${stats.member_count || 0} / ${mLimit}</td>
                    <td style="text-align:center;">${stats.provider_count || 0} / ${pLimit}</td>
                    <td style="font-weight:600;color:var(--accent-gold);">$${mrr}</td>
                    <td style="font-size:12px;color:var(--text-muted);">${new Date(t.created_at).toLocaleDateString()}</td>
                    <td style="white-space:nowrap;">
                      <button class="btn btn-sm btn-secondary" onclick="openEditTenantModal('${t.id}')">Edit</button>
                      <button class="btn btn-sm btn-secondary" onclick="openTenantAccessModal('${t.id}')" style="margin-left:4px;" title="View tenant portal as admin">View Portal</button>
                      ${tenantDomain ? `<button class="btn btn-sm btn-secondary" onclick="previewTenantBranding('${tenantDomain}')" style="margin-left:4px;" title="Preview branding">Preview</button>` : ''}
                      ${t.status === 'active' ? `<button class="btn btn-sm btn-danger" onclick="deactivateTenant('${t.id}')" style="margin-left:4px;">Suspend</button>` : ''}
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`;

        // Store for edit lookups
        window._wlTenants = tenants;
      } catch (err) {
        contentEl.innerHTML = `<div style="padding:32px;text-align:center;color:var(--accent-red);">Error: ${err.message}</div>`;
      }
    }

    // ===== TENANT ONBOARDING WIZARD (Task #87) =====
    let _tenantWizardStep = 1;
    const _WIZARD_STEPS = 4;
    const _WIZARD_SUBTITLES = [
      'Step 1 of 4 — Tenant Identity',
      'Step 2 of 4 — Domain Configuration',
      'Step 3 of 4 — Branding',
      'Step 4 of 4 — Plan & Review'
    ];

    function _tenantWizardShowStep(step) {
      _tenantWizardStep = step;
      for (let i = 1; i <= _WIZARD_STEPS; i++) {
        const el = document.getElementById('tenant-wz-step-' + i);
        if (el) el.style.display = i === step ? '' : 'none';
        const bar = document.getElementById('wz-step-bar-' + i);
        if (bar) bar.style.background = i <= step ? 'var(--accent-gold)' : 'var(--border-subtle)';
      }
      const sub = document.getElementById('tenant-wizard-subtitle');
      if (sub) sub.textContent = _WIZARD_SUBTITLES[step - 1] || '';
      const backBtn = document.getElementById('tenant-wz-back-btn');
      if (backBtn) backBtn.style.display = step > 1 ? '' : 'none';
      const nextBtn = document.getElementById('tenant-wz-next-btn');
      if (nextBtn) nextBtn.textContent = step < _WIZARD_STEPS ? 'Next →' : 'Create Tenant';
      // Update branding preview on step 3
      if (step === 3) _updateBrandingPreview();
      // Update review on step 4
      if (step === 4) _updateTenantReview();
      // Hide error on step change
      const errEl = document.getElementById('tenant-modal-error');
      if (errEl) errEl.style.display = 'none';
    }

    function _updateBrandingPreview() {
      const primary = document.getElementById('tenant-primary-color')?.value || '#C9A227';
      const accent = document.getElementById('tenant-accent-color')?.value || '#2CC4B4';
      const bg = document.getElementById('tenant-bg-color')?.value || '#12161c';
      const bgEl = document.getElementById('wz-preview-bg');
      const btnEl = document.getElementById('wz-preview-btn');
      const badgeEl = document.getElementById('wz-preview-badge');
      if (bgEl) bgEl.style.background = bg;
      if (btnEl) { btnEl.style.background = primary; btnEl.style.color = '#000'; }
      if (badgeEl) badgeEl.style.background = accent;
    }

    function _updateTenantReview() {
      const reviewEl = document.getElementById('tenant-wizard-review');
      if (!reviewEl) return;
      const name = document.getElementById('tenant-name')?.value || '—';
      const brand = document.getElementById('tenant-brand-name')?.value || '—';
      const ownerEmail = document.getElementById('tenant-owner-email')?.value || '—';
      const domain = document.getElementById('tenant-domain')?.value || '—';
      const subdomain = document.getElementById('tenant-subdomain')?.value || '—';
      const plan = document.getElementById('tenant-plan')?.value || 'starter';
      const planLabels = { starter: 'Starter (500 members)', pro: 'Pro (5,000 members)', business: 'Business (Unlimited)' };
      const logo = document.getElementById('tenant-logo-url')?.value || '—';
      reviewEl.innerHTML = `
        <span style="color:var(--text-muted);">Internal Name</span><span style="font-weight:500;">${name}</span>
        <span style="color:var(--text-muted);">Brand Name</span><span style="font-weight:500;">${brand}</span>
        <span style="color:var(--text-muted);">Owner Email</span><span style="font-weight:500;">${ownerEmail}</span>
        <span style="color:var(--text-muted);">Custom Domain</span><span style="font-weight:500;">${domain}</span>
        <span style="color:var(--text-muted);">Subdomain</span><span style="font-weight:500;">${subdomain !== '—' ? subdomain + '.mycarconcierge.com' : '—'}</span>
        <span style="color:var(--text-muted);">Plan</span><span style="font-weight:500;">${planLabels[plan] || plan}</span>
        <span style="color:var(--text-muted);">Logo</span><span style="font-weight:500;word-break:break-all;">${logo}</span>
      `;
    }

    function tenantWizardBack() {
      if (_tenantWizardStep > 1) _tenantWizardShowStep(_tenantWizardStep - 1);
    }

    async function tenantWizardNext() {
      const errEl = document.getElementById('tenant-modal-error');
      if (errEl) errEl.style.display = 'none';
      // Validate step 1
      if (_tenantWizardStep === 1) {
        const name = document.getElementById('tenant-name')?.value.trim();
        const brand = document.getElementById('tenant-brand-name')?.value.trim();
        if (!name || !brand) {
          if (errEl) { errEl.textContent = 'Internal name and brand name are required.'; errEl.style.display = 'block'; }
          return;
        }
      }
      if (_tenantWizardStep < _WIZARD_STEPS) {
        _tenantWizardShowStep(_tenantWizardStep + 1);
      } else {
        await _saveTenantFromWizard();
      }
    }

    async function _saveTenantFromWizard() {
      const errEl = document.getElementById('tenant-modal-error');
      if (errEl) errEl.style.display = 'none';
      const body = {
        name: document.getElementById('tenant-name')?.value.trim(),
        brand_name: document.getElementById('tenant-brand-name')?.value.trim(),
        owner_email: document.getElementById('tenant-owner-email')?.value.trim() || null,
        domain: document.getElementById('tenant-domain')?.value.trim() || null,
        subdomain: document.getElementById('tenant-subdomain')?.value.trim() || null,
        logo_url: document.getElementById('tenant-logo-url')?.value.trim() || null,
        favicon_url: document.getElementById('tenant-favicon-url')?.value.trim() || null,
        support_email: document.getElementById('tenant-support-email')?.value.trim() || null,
        primary_color: document.getElementById('tenant-primary-color')?.value || '#C9A227',
        accent_color: document.getElementById('tenant-accent-color')?.value || '#2CC4B4',
        bg_color: document.getElementById('tenant-bg-color')?.value || '#12161c',
        plan: document.getElementById('tenant-plan')?.value || 'starter',
        status: document.getElementById('tenant-status')?.value || 'active'
      };
      if (!body.name || !body.brand_name) {
        if (errEl) { errEl.textContent = 'Internal name and brand name are required.'; errEl.style.display = 'block'; }
        return;
      }
      const nextBtn = document.getElementById('tenant-wz-next-btn');
      if (nextBtn) { nextBtn.disabled = true; nextBtn.textContent = 'Creating…'; }
      const token = adminTeamToken || (adminPasswordVerified ? adminPassword : null);
      const headers = { 'Content-Type': 'application/json', ...(token ? { 'x-admin-token': token } : {}) };
      try {
        const res = await fetch('/api/admin/white-label/tenants', { method: 'POST', headers, body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create tenant');
        closeTenantModal();
        loadedSections['white-label'] = false;
        await loadWhiteLabelTenants();
      } catch (err) {
        if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
      } finally {
        if (nextBtn) { nextBtn.disabled = false; nextBtn.textContent = 'Create Tenant'; }
      }
    }

    function openCreateTenantModal() {
      _editingTenantId = null;
      document.getElementById('tenant-modal-title').textContent = 'New White-label Tenant';
      document.getElementById('tenant-modal-id').value = '';
      const wizardProgress = document.getElementById('tenant-wizard-progress');
      if (wizardProgress) wizardProgress.style.display = '';
      const backBtn = document.getElementById('tenant-wz-back-btn');
      if (backBtn) backBtn.style.display = 'none';
      // Reset all wizard fields
      ['tenant-name','tenant-brand-name','tenant-owner-email','tenant-domain','tenant-subdomain','tenant-logo-url','tenant-favicon-url','tenant-support-email'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      const pc = document.getElementById('tenant-primary-color'); if (pc) pc.value = '#C9A227';
      const ac = document.getElementById('tenant-accent-color'); if (ac) ac.value = '#2CC4B4';
      const bc = document.getElementById('tenant-bg-color'); if (bc) bc.value = '#12161c';
      const plan = document.getElementById('tenant-plan'); if (plan) plan.value = 'starter';
      const status = document.getElementById('tenant-status'); if (status) status.value = 'active';
      const errEl = document.getElementById('tenant-modal-error'); if (errEl) errEl.style.display = 'none';
      _tenantWizardShowStep(1);
      document.getElementById('tenant-modal').style.display = 'flex';
    }

    function openEditTenantModal(id) {
      const t = (window._wlTenants || []).find(x => x.id === id);
      if (!t) return;
      _editingTenantId = id;
      const editModal = document.getElementById('tenant-edit-modal');
      if (!editModal) return;
      document.getElementById('tenant-edit-id').value = id;
      document.getElementById('tenant-edit-name').value = t.name || '';
      document.getElementById('tenant-edit-brand-name').value = t.brand_name || '';
      document.getElementById('tenant-edit-domain').value = t.domain || '';
      document.getElementById('tenant-edit-subdomain').value = t.subdomain || '';
      document.getElementById('tenant-edit-logo-url').value = t.logo_url || '';
      document.getElementById('tenant-edit-support-email').value = t.support_email || '';
      document.getElementById('tenant-edit-primary-color').value = t.primary_color || '#C9A227';
      document.getElementById('tenant-edit-accent-color').value = t.accent_color || '#2CC4B4';
      document.getElementById('tenant-edit-bg-color').value = t.bg_color || '#12161c';
      document.getElementById('tenant-edit-plan').value = t.plan || 'starter';
      document.getElementById('tenant-edit-status').value = t.status || 'active';
      const errEl = document.getElementById('tenant-edit-error'); if (errEl) errEl.style.display = 'none';
      editModal.style.display = 'flex';
    }

    function closeTenantModal() {
      document.getElementById('tenant-modal').style.display = 'none';
    }

    function closeTenantEditModal() {
      const m = document.getElementById('tenant-edit-modal'); if (m) m.style.display = 'none';
    }

    async function saveTenantEdit() {
      const errEl = document.getElementById('tenant-edit-error');
      if (errEl) errEl.style.display = 'none';
      const id = document.getElementById('tenant-edit-id')?.value;
      if (!id) return;
      const body = {
        name: document.getElementById('tenant-edit-name')?.value.trim(),
        brand_name: document.getElementById('tenant-edit-brand-name')?.value.trim(),
        domain: document.getElementById('tenant-edit-domain')?.value.trim() || null,
        subdomain: document.getElementById('tenant-edit-subdomain')?.value.trim() || null,
        logo_url: document.getElementById('tenant-edit-logo-url')?.value.trim() || null,
        support_email: document.getElementById('tenant-edit-support-email')?.value.trim() || null,
        primary_color: document.getElementById('tenant-edit-primary-color')?.value || '#C9A227',
        accent_color: document.getElementById('tenant-edit-accent-color')?.value || '#2CC4B4',
        bg_color: document.getElementById('tenant-edit-bg-color')?.value || '#12161c',
        plan: document.getElementById('tenant-edit-plan')?.value || 'starter',
        status: document.getElementById('tenant-edit-status')?.value || 'active'
      };
      if (!body.name || !body.brand_name) { if (errEl) { errEl.textContent = 'Name and brand name required.'; errEl.style.display = 'block'; } return; }
      const btn = document.getElementById('save-tenant-edit-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      const token = adminTeamToken || (adminPasswordVerified ? adminPassword : null);
      const headers = { 'Content-Type': 'application/json', ...(token ? { 'x-admin-token': token } : {}) };
      try {
        const res = await fetch(`/api/admin/white-label/tenants/${id}`, { method: 'PUT', headers, body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save');
        closeTenantEditModal();
        loadedSections['white-label'] = false;
        await loadWhiteLabelTenants();
      } catch (err) {
        if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
      }
    }

    // Keep legacy saveTenant for backward compat (not called from new wizard)
    async function saveTenant() { await _saveTenantFromWizard(); }

    async function deactivateTenant(id) {
      if (!confirm('Suspend this tenant? They will lose access to white-label features.')) return;
      const token = adminTeamToken || (adminPasswordVerified ? adminPassword : null);
      const headers = { 'Content-Type': 'application/json', ...(token ? { 'x-admin-token': token } : {}) };
      try {
        await fetch(`/api/admin/white-label/tenants/${id}`, { method: 'PUT', headers, body: JSON.stringify({ status: 'suspended' }) });
        loadedSections['white-label'] = false;
        await loadWhiteLabelTenants();
      } catch (err) { alert('Error: ' + err.message); }
    }

    async function previewTenantBranding(domain) {
      const token = adminTeamToken || (adminPasswordVerified ? adminPassword : null);
      if (!token) { alert('Admin auth required to preview branding.'); return; }
      try {
        const res = await fetch(`/api/white-label/config?preview_domain=${encodeURIComponent(domain)}`, {
          headers: { 'x-admin-token': token }
        });
        const data = await res.json();
        if (!data.is_white_label || !data.tenant) {
          alert(`No active white-label tenant found for domain: ${domain}`);
          return;
        }
        const t = data.tenant;
        const preview = document.createElement('div');
        preview.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;`;
        preview.innerHTML = `
          <div style="background:${t.bg_color||'#12161c'};border-radius:16px;padding:32px;width:min(480px,95vw);position:relative;">
            <button onclick="this.closest('div[style*=fixed]').remove()" style="position:absolute;top:16px;right:16px;background:none;border:none;color:${t.primary_color||'#C9A227'};font-size:20px;cursor:pointer;">✕</button>
            <div style="margin-bottom:20px;">
              ${t.logo_url ? `<img src="${t.logo_url}" alt="${t.brand_name}" style="height:48px;object-fit:contain;margin-bottom:12px;">` : ''}
              <h2 style="color:${t.primary_color||'#C9A227'};margin:0 0 4px;font-size:1.4rem;">${t.brand_name}</h2>
              <p style="color:${t.accent_color||'#2CC4B4'};margin:0;font-size:0.85rem;">White-label Branding Preview</p>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px;">
              <div style="text-align:center;">
                <div style="width:100%;height:40px;border-radius:8px;background:${t.primary_color||'#C9A227'};margin-bottom:6px;"></div>
                <div style="font-size:11px;color:#888;">Primary</div>
                <div style="font-size:11px;color:#ccc;">${t.primary_color||'#C9A227'}</div>
              </div>
              <div style="text-align:center;">
                <div style="width:100%;height:40px;border-radius:8px;background:${t.accent_color||'#2CC4B4'};margin-bottom:6px;"></div>
                <div style="font-size:11px;color:#888;">Accent</div>
                <div style="font-size:11px;color:#ccc;">${t.accent_color||'#2CC4B4'}</div>
              </div>
              <div style="text-align:center;">
                <div style="width:100%;height:40px;border-radius:8px;background:${t.bg_color||'#12161c'};border:1px solid #333;margin-bottom:6px;"></div>
                <div style="font-size:11px;color:#888;">Background</div>
                <div style="font-size:11px;color:#ccc;">${t.bg_color||'#12161c'}</div>
              </div>
            </div>
            <div style="display:flex;gap:10px;">
              <button style="flex:1;padding:12px;border-radius:8px;background:${t.primary_color||'#C9A227'};border:none;color:#12161c;font-weight:600;cursor:pointer;">Sample CTA Button</button>
              <button style="flex:1;padding:12px;border-radius:8px;background:transparent;border:1px solid ${t.accent_color||'#2CC4B4'};color:${t.accent_color||'#2CC4B4'};font-weight:600;cursor:pointer;">Secondary Action</button>
            </div>
            ${t.plan ? `<div style="margin-top:16px;font-size:12px;color:#888;">Plan: <strong style="color:#ccc;">${t.plan}</strong> · Domain: <strong style="color:#ccc;">${domain}</strong></div>` : ''}
          </div>`;
        document.body.appendChild(preview);
        preview.addEventListener('click', (e) => { if (e.target === preview) preview.remove(); });
      } catch (err) { alert('Preview failed: ' + err.message); }
    }

    window.loadWhiteLabelTenants = loadWhiteLabelTenants;
    window.openCreateTenantModal = openCreateTenantModal;
    window.openEditTenantModal = openEditTenantModal;
    window.closeTenantModal = closeTenantModal;
    window.saveTenant = saveTenant;
    window.deactivateTenant = deactivateTenant;
    window.previewTenantBranding = previewTenantBranding;

    // ===== TENANT PORTAL ACCESS MODAL (Admin Impersonation-Lite) =====
    async function openTenantAccessModal(tenantId) {
      const modal = document.getElementById('tenant-access-modal');
      const contentEl = document.getElementById('tenant-access-content');
      if (!modal || !contentEl) return;
      contentEl.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);">Loading tenant data…</div>';
      modal.style.display = 'flex';
      const token = adminTeamToken || (adminPasswordVerified ? adminPassword : null);
      const headers = token ? { 'x-admin-token': token } : {};
      try {
        const res = await fetch(`/api/admin/white-label/tenants/${tenantId}/portal`, { headers });
        if (!res.ok) throw new Error('Failed to load tenant portal');
        const { tenant, usage, estimated_mrr, recent_members } = await res.json();
        const titleEl = document.getElementById('tenant-access-title');
        if (titleEl) titleEl.textContent = `Portal View — ${tenant.brand_name}`;
        const planColors = { starter: 'var(--accent-teal)', pro: 'var(--accent-gold)', business: '#7c3aed' };
        const planColor = planColors[tenant.plan] || 'var(--text-muted)';
        const domain = tenant.domain || (tenant.subdomain ? `${tenant.subdomain}.mycarconcierge.com` : '—');
        const mPct = usage.members.unlimited ? 0 : Math.min(100, Math.round((usage.members.current / usage.members.limit) * 100));
        const pPct = usage.providers.unlimited ? 0 : Math.min(100, Math.round((usage.providers.current / usage.providers.limit) * 100));
        const barColor = (pct) => pct >= 90 ? 'var(--accent-red)' : pct >= 70 ? 'var(--accent-orange)' : 'var(--accent-teal)';

        contentEl.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:20px;">
            <div style="padding:12px;background:var(--surface-3);border-radius:8px;text-align:center;">
              <div style="font-size:1.3rem;font-weight:700;color:${planColor};">${tenant.plan?.toUpperCase()}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">Plan</div>
            </div>
            <div style="padding:12px;background:var(--surface-3);border-radius:8px;text-align:center;">
              <div style="font-size:1.3rem;font-weight:700;color:var(--accent-teal);">${usage.members.current}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">Members</div>
            </div>
            <div style="padding:12px;background:var(--surface-3);border-radius:8px;text-align:center;">
              <div style="font-size:1.3rem;font-weight:700;color:var(--accent-gold);">${usage.providers.current}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">Providers</div>
            </div>
            <div style="padding:12px;background:var(--surface-3);border-radius:8px;text-align:center;">
              <div style="font-size:1.3rem;font-weight:700;color:var(--accent-gold);">$${estimated_mrr}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">Est. MRR</div>
            </div>
          </div>
          <div style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px;"><span>Member Seats</span><span>${usage.members.current} / ${usage.members.unlimited ? '∞' : usage.members.limit}</span></div>
            <div style="height:6px;background:var(--border-subtle);border-radius:3px;overflow:hidden;margin-bottom:8px;"><div style="height:100%;background:${barColor(mPct)};width:${mPct}%;border-radius:3px;"></div></div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px;"><span>Provider Seats</span><span>${usage.providers.current} / ${usage.providers.unlimited ? '∞' : usage.providers.limit}</span></div>
            <div style="height:6px;background:var(--border-subtle);border-radius:3px;overflow:hidden;"><div style="height:100%;background:${barColor(pPct)};width:${pPct}%;border-radius:3px;"></div></div>
          </div>
          <div style="padding:14px;background:var(--surface-3);border-radius:8px;margin-bottom:16px;">
            <div style="display:grid;grid-template-columns:auto 1fr;gap:5px 14px;font-size:0.83rem;">
              <span style="color:var(--text-muted);">Brand</span><span>${tenant.brand_name}</span>
              <span style="color:var(--text-muted);">Domain</span><span style="font-family:monospace;">${domain}</span>
              <span style="color:var(--text-muted);">Status</span>
              <span style="display:inline-flex;align-items:center;gap:6px;">
                <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${tenant.status === 'active' ? 'var(--accent-teal)' : 'var(--accent-red)'}"></span>
                <span style="text-transform:capitalize;">${tenant.status}</span>
              </span>
              <span style="color:var(--text-muted);">Created</span><span>${new Date(tenant.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          ${recent_members.length ? `
          <div>
            <div style="font-size:0.82rem;font-weight:600;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Recent Members</div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${recent_members.map(m => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--surface-3);border-radius:6px;font-size:0.83rem;">
                  <span style="font-family:monospace;color:var(--text-muted);">${m.user_id.slice(0,12)}…</span>
                  <span style="background:var(--accent-teal-soft,rgba(44,196,180,0.1));color:var(--accent-teal);padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;text-transform:uppercase;">${m.role}</span>
                  <span style="color:var(--text-muted);font-size:11px;">${new Date(m.joined_at).toLocaleDateString()}</span>
                </div>`).join('')}
            </div>
          </div>` : '<div style="color:var(--text-muted);font-size:0.85rem;padding:8px 0;">No members have joined yet.</div>'}
          <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;">
            <button class="btn btn-secondary" onclick="closeTenantAccessModal()">Close</button>
            <button class="btn btn-primary" onclick="openEditTenantModal('${tenant.id}');closeTenantAccessModal();">Edit Tenant</button>
          </div>`;
      } catch (err) {
        contentEl.innerHTML = `<div style="color:var(--accent-red);padding:16px;">Error: ${err.message}</div>`;
      }
    }

    function closeTenantAccessModal() {
      const modal = document.getElementById('tenant-access-modal');
      if (modal) modal.style.display = 'none';
    }

    window.openTenantAccessModal = openTenantAccessModal;
    window.closeTenantAccessModal = closeTenantAccessModal;

    // ========== END WHITE-LABEL TENANTS ==========

    // ========== AI API USAGE DASHBOARD (Task #90) ==========
    let _apiUsageChart = null;
    async function loadApiUsage() {
      const adminPassword = sessionStorage.getItem('adminPassword');
      if (!adminPassword) return;
      const keysEl = document.getElementById('api-stat-keys');
      const callsEl = document.getElementById('api-stat-calls');
      const revenueEl = document.getElementById('api-stat-revenue');
      const monthEl = document.getElementById('api-stat-month');
      const tableEl = document.getElementById('api-keys-table');
      if (callsEl) callsEl.textContent = '…';
      try {
        const resp = await fetch('/api/admin/api-usage', { headers: { 'x-admin-password': adminPassword } });
        if (!resp.ok) throw new Error('Failed to load API usage');
        const data = await resp.json();
        if (keysEl) keysEl.textContent = data.active_keys ?? '--';
        if (callsEl) callsEl.textContent = (data.total_calls_this_month || 0).toLocaleString();
        if (revenueEl) revenueEl.textContent = '$' + ((data.estimated_revenue_cents || 0) / 100).toFixed(2);
        if (monthEl) monthEl.textContent = data.month || '--';
        // Chart
        const canvas = document.getElementById('api-endpoint-chart');
        if (canvas && data.by_endpoint) {
          const labels = Object.keys(data.by_endpoint);
          const callValues = Object.values(data.by_endpoint);
          // Estimated revenue: avg blended rate per call
          const totalCalls = callValues.reduce((a, b) => a + b, 0);
          const revenuePerCall = totalCalls > 0 ? (data.estimated_revenue_cents || 0) / 100 / totalCalls : 0;
          const revenueValues = callValues.map(c => parseFloat((c * revenuePerCall).toFixed(2)));
          if (_apiUsageChart) _apiUsageChart.destroy();
          _apiUsageChart = new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets: [
              { label: 'API Calls', data: callValues, backgroundColor: 'rgba(201,168,76,0.7)', borderColor: '#c9a84c', borderWidth: 1, yAxisID: 'y' },
              { label: 'Est. Revenue ($ based on plan rate)', data: revenueValues, backgroundColor: 'rgba(52,211,153,0.5)', borderColor: '#34d399', borderWidth: 1, yAxisID: 'y1' }
            ] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, labels: { color: '#9ca3af' } } }, scales: { y: { beginAtZero: true, position: 'left', ticks: { color: '#9ca3af' }, grid: { color: 'rgba(156,163,175,0.1)' } }, y1: { beginAtZero: true, position: 'right', ticks: { color: '#34d399', callback: v => '$' + v.toFixed(2) }, grid: { display: false } }, x: { ticks: { color: '#9ca3af' }, grid: { display: false } } } }
          });
        }
        // Table
        if (tableEl) {
          if (!data.top_keys || data.top_keys.length === 0) {
            tableEl.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);">No API keys found.</div>';
          } else {
            tableEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
              <thead><tr style="border-bottom:1px solid var(--border-subtle);">
                <th style="text-align:left;padding:10px 8px;color:var(--text-muted);">Key Name</th>
                <th style="text-align:left;padding:10px 8px;color:var(--text-muted);">Plan</th>
                <th style="text-align:right;padding:10px 8px;color:var(--text-muted);">Total Calls</th>
                <th style="text-align:right;padding:10px 8px;color:var(--text-muted);">Limit</th>
                <th style="text-align:left;padding:10px 8px;color:var(--text-muted);">Last Used</th>
                <th style="text-align:left;padding:10px 8px;color:var(--text-muted);">Status</th>
                <th style="text-align:center;padding:10px 8px;color:var(--text-muted);">Actions</th>
              </tr></thead>
              <tbody>${data.top_keys.map(k => {
                const safeName = escapeHtml(k.name || 'Unnamed');
                const safePlan = escapeHtml(String(k.plan || ''));
                const safeStatus = escapeHtml(String(k.status || ''));
                const statusBg = safeStatus === 'active' ? 'var(--accent-green-soft)' : 'var(--accent-red-soft)';
                const statusColor = safeStatus === 'active' ? 'var(--accent-green)' : 'var(--accent-red)';
                return `<tr style="border-bottom:1px solid var(--border-subtle);">
                  <td style="padding:10px 8px;">${safeName}</td>
                  <td style="padding:10px 8px;"><span class="badge" style="background:var(--accent-gold-soft);color:var(--accent-gold);text-transform:capitalize;">${safePlan}</span></td>
                  <td style="padding:10px 8px;text-align:right;">${(k.calls_made || 0).toLocaleString()}</td>
                  <td style="padding:10px 8px;text-align:right;">${k.calls_limit === -1 ? '∞' : (k.calls_limit || 0).toLocaleString()}</td>
                  <td style="padding:10px 8px;color:var(--text-muted);">${k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}</td>
                  <td style="padding:10px 8px;"><span class="badge" style="background:${statusBg};color:${statusColor};">${safeStatus}</span></td>
                  <td style="padding:10px 8px;text-align:center;">${safeStatus === 'active' ? `<button onclick="adminRevokeApiKey('${escapeHtml(String(k.id || ''))}', this)" style="padding:3px 10px;background:var(--accent-red-soft);color:var(--accent-red);border:1px solid var(--accent-red);border-radius:4px;cursor:pointer;font-size:0.8rem;">Revoke</button>` : '<span style="color:var(--text-muted);font-size:0.8rem;">—</span>'}</td>
                </tr>`;
              }).join('')}
              </tbody>
            </table>`;
          }
        }
      } catch (err) {
        if (callsEl) callsEl.textContent = 'Error';
        console.error('[Admin] API usage load error:', err.message);
      }
    }
    window.loadApiUsage = loadApiUsage;

    async function adminRevokeApiKey(keyId, btn) {
      if (!keyId || !confirm('Revoke this API key? This cannot be undone.')) return;
      const adminPassword = sessionStorage.getItem('adminPassword');
      if (!adminPassword) { alert('Admin session not found. Please refresh.'); return; }
      btn.disabled = true; btn.textContent = 'Revoking…';
      try {
        const res = await fetch(`/api/admin/api-keys/${encodeURIComponent(keyId)}/revoke`, {
          method: 'POST',
          headers: { 'x-admin-password': adminPassword }
        });
        const data = await res.json();
        if (res.ok) {
          btn.textContent = 'Revoked';
          btn.style.opacity = '0.5';
          btn.disabled = true;
          const statusCell = btn.closest('tr').cells[5];
          if (statusCell) {
            const badge = statusCell.querySelector('.badge');
            if (badge) { badge.textContent = 'revoked'; badge.style.background = 'var(--accent-red-soft)'; badge.style.color = 'var(--accent-red)'; }
          }
        } else {
          btn.disabled = false; btn.textContent = 'Revoke';
          alert(data.error || 'Failed to revoke key');
        }
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Revoke';
        alert('Network error');
      }
    }
    window.adminRevokeApiKey = adminRevokeApiKey;
    // ========== END AI API USAGE DASHBOARD ==========

    // ========== SURVEY LEADS (Task #93) ==========

    const SURVEY_FEATURE_NAMES = {
      get_quotes:       'Get Instant Quotes',
      manage_vehicles:  'Manage Your Vehicles',
      maintenance:      'Maintenance Tracking',
      shop_smarter:     'Shop Smarter',
      booking:          'Easy Service Booking',
      obd_diagnostics:  'OBD Diagnostics',
      provider_ratings: 'Verified Ratings',
      price_estimator:  'AI Price Estimator'
    };

    const SURVEY_SERVICE_NAMES = {
      oil_change: 'Oil Change', tire_rotation: 'Tire Rotation', brake_service: 'Brake Service',
      diagnostic: 'Diagnostic', ac_repair: 'A/C Repair', transmission: 'Transmission',
      body_paint: 'Body Work', detailing: 'Detailing', towing: 'Towing',
      inspection: 'Inspection', windshield: 'Windshield', electrical: 'Electrical',
      suspension: 'Suspension', snow_removal: 'Snow Removal', other: 'Other'
    };

    let surveyLeadsState = { page: 1, limit: 25, total: 0, totalPages: 0, sortDir: 'desc' };
    let surveyNiState    = { page: 1, limit: 50, total: 0, totalPages: 0 };
    let surveyTrendData  = null;
    let surveyTrendChart = null;
    let surveyTrendView  = 'daily';
    let surveySearchTimer = null;
    // Cache leads rows so onclick can reference by index (avoids unsafe inline JSON)
    let _surveyLeadsCache = [];

    async function loadSurveyAnalytics() {
      try {
        const headers = getAdminHeaders();
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(apiBase + '/api/admin/survey-stats', { headers });
        if (!res.ok) throw new Error('Stats fetch failed');
        const data = await res.json();

        const el = id => document.getElementById(id);
        if (el('sl-total'))          el('sl-total').textContent          = (data.total_responses || 0).toLocaleString();
        if (el('sl-pct-interested')) el('sl-pct-interested').textContent = (data.pct_interested || 0) + '%';
        if (el('sl-profiles'))       el('sl-profiles').textContent       = (data.total_profiles || 0).toLocaleString();
        if (el('sl-jobs'))           el('sl-jobs').textContent           = (data.total_jobs || 0).toLocaleString();

        // Render heatmap
        renderSurveyHeatmap(data.feature_heatmap || {});

        // Store trend data for chart
        surveyTrendData = data.daily_counts || {};
        if (document.getElementById('sl-trend-chart')) renderSurveyTrendChart();

        // Load leads table
        await loadSurveyLeads(1);

      } catch (err) {
        console.error('[SurveyLeads] loadSurveyAnalytics error:', err.message);
      }
    }
    window.loadSurveyAnalytics = loadSurveyAnalytics;

    // ===== MEMBER SURVEY ANALYTICS =====
    // Labels come from the shared survey definition (www/shared/survey-questions.js)
    // so they cannot drift from the form options (onboarding-member.html) or the
    // server's ALLOWED enum map (server.js). Unknown values fall back to the raw enum code.
    const MS_LABELS = (typeof window !== 'undefined' && window.MCCSurvey && window.MCCSurvey.LABELS) || {};
    const MS_CHART_COLORS = ['#c9a227','#22d3ee','#38bdf8','#34d399','#fb923c','#f87171','#a78bfa'];
    let _msCharts = {};

    function buildMsDoughnut(canvasId, labelMap, countMap) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      const keys = Object.keys(countMap).filter(k => countMap[k] > 0);
      // No data: show placeholder but preserve canvas so re-render works without full reload
      let placeholder = canvas.parentElement.querySelector('.ms-chart-empty');
      if (!keys.length) {
        canvas.style.display = 'none';
        if (!placeholder) {
          placeholder = document.createElement('p');
          placeholder.className = 'ms-chart-empty';
          placeholder.style.cssText = 'color:var(--text-muted);text-align:center;font-size:0.88rem;padding:32px 0;';
          placeholder.textContent = 'Not enough responses yet';
          canvas.parentElement.appendChild(placeholder);
        }
        return;
      }
      // Has data: hide placeholder, restore canvas
      if (placeholder) placeholder.remove();
      canvas.style.display = '';
      const labels = keys.map(k => labelMap[k] || k);
      const values = keys.map(k => countMap[k]);
      if (_msCharts[canvasId]) { _msCharts[canvasId].destroy(); }
      _msCharts[canvasId] = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{ data: values, backgroundColor: MS_CHART_COLORS.slice(0, keys.length), borderWidth: 0 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { color: '#a0a8b8', font: { size: 11 }, padding: 10, boxWidth: 12 } },
            tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} (${Math.round(ctx.raw / values.reduce((a,b) => a+b,0) * 100)}%)` } }
          },
          cutout: '60%'
        }
      });
    }

    async function loadMemberSurveyAnalytics() {
      const el = id => document.getElementById(id);
      const banner = el('ms-error-banner');
      // Reset banner on every load
      if (banner) { banner.style.display = 'none'; banner.textContent = ''; }
      try {
        const headers = getAdminHeaders();
        const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
        const res = await fetch(apiBase + '/api/admin/survey-analytics', { headers });
        if (!res.ok) {
          let serverMsg = '';
          try { const j = await res.json(); serverMsg = j.error || j.detail || ''; } catch (_) {}
          throw new Error(`HTTP ${res.status}${serverMsg ? ' — ' + serverMsg : ''}`);
        }
        const data = await res.json();

        if (el('ms-total')) el('ms-total').textContent = (data.total || 0).toLocaleString();
        if (el('ms-week')) el('ms-week').textContent = (data.recent_week || 0).toLocaleString();

        const topPriority = Object.entries(data.by_top_priority || {}).sort((a,b) => b[1]-a[1])[0];
        if (el('ms-top-pain')) el('ms-top-pain').textContent = topPriority ? (MS_LABELS.top_priority[topPriority[0]] || topPriority[0]) : '—';

        const topSat = Object.entries(data.by_provider_satisfaction || {}).sort((a,b) => b[1]-a[1])[0];
        if (el('ms-top-improvement')) el('ms-top-improvement').textContent = topSat ? (MS_LABELS.provider_satisfaction[topSat[0]] || topSat[0]) : '—';

        // Render every survey dimension. Order matches the visual groups in admin.html
        // (Discovery & Satisfaction → Service Habits → Spending → Trust → Tracking & Comms → Adoption).
        // Canvases are named `ms-chart-<key>` so adding a new dimension only requires
        // appending the key here AND a matching canvas card in admin.html.
        const CHART_KEYS = [
          'provider_discovery','provider_satisfaction','top_priority',
          'service_frequency','service_types','vehicle_count',
          'annual_spend','pricing_confidence','estimate_surprise','quote_behavior',
          'provider_honesty','provider_vetting','maintenance_avoidance','dispute_history',
          'history_tracking','job_status_updates','maintenance_reminders',
          'competitive_bids','app_usage','payment_comfort','decision_maker','near_term_need'
        ];
        for (const key of CHART_KEYS) {
          buildMsDoughnut('ms-chart-' + key, MS_LABELS[key] || {}, data['by_' + key] || {});
        }

        // Surface "schema not yet migrated" hint to the admin if the server told us so
        if (data.schema_pending && banner) {
          banner.style.display = 'block';
          banner.style.color = '#fbbf24';
          banner.style.background = 'rgba(251,191,36,0.10)';
          banner.style.borderColor = 'rgba(251,191,36,0.40)';
          banner.textContent = 'survey_responses table is missing expected columns. Apply supabase/migrations/20260428_survey_responses_columns_fix.sql in Supabase SQL Editor, then refresh this page.';
        }
      } catch (err) {
        console.error('[MemberSurveys] load error:', err.message);
        if (banner) {
          banner.style.display = 'block';
          banner.textContent = 'Could not load survey analytics: ' + err.message + '. Check server logs and try Refresh.';
        }
        // Reset headline cards to a clear "error" sentinel rather than stale numbers
        if (el('ms-total')) el('ms-total').textContent = '—';
        if (el('ms-week')) el('ms-week').textContent = '—';
        if (el('ms-top-pain')) el('ms-top-pain').textContent = '—';
        if (el('ms-top-improvement')) el('ms-top-improvement').textContent = '—';
      }
    }
    window.loadMemberSurveyAnalytics = loadMemberSurveyAnalytics;

    function renderSurveyHeatmap(heatmap) {
      const container = document.getElementById('sl-heatmap');
      if (!container) return;
      const FEATURE_IDS = Object.keys(SURVEY_FEATURE_NAMES);
      if (!FEATURE_IDS.some(fid => (heatmap[fid]?.yes || 0) + (heatmap[fid]?.maybe || 0) + (heatmap[fid]?.no || 0) > 0)) {
        container.innerHTML = '<p style="color:var(--text-muted);padding:24px;text-align:center;">No feature ratings yet.</p>';
        return;
      }
      container.innerHTML = FEATURE_IDS.map(fid => {
        const counts = heatmap[fid] || { yes: 0, maybe: 0, no: 0 };
        const total  = counts.yes + counts.maybe + counts.no || 1;
        const yPct   = Math.round((counts.yes   / total) * 100);
        const mPct   = Math.round((counts.maybe / total) * 100);
        const nPct   = 100 - yPct - mPct;
        return `
          <div style="margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
              <span style="font-size:0.88rem;font-weight:500;color:var(--text-primary);">${escapeHtml(SURVEY_FEATURE_NAMES[fid] || fid)}</span>
              <span style="font-size:0.78rem;color:var(--text-muted);">${counts.yes}👍 ${counts.maybe}🤔 ${counts.no}👎</span>
            </div>
            <div style="display:flex;height:10px;border-radius:6px;overflow:hidden;gap:2px;">
              <div style="width:${yPct}%;background:#22c55e;border-radius:6px 0 0 6px;" title="Yes: ${yPct}%"></div>
              <div style="width:${mPct}%;background:var(--accent-gold);" title="Maybe: ${mPct}%"></div>
              <div style="width:${nPct}%;background:#94a3b8;border-radius:0 6px 6px 0;" title="No: ${nPct}%"></div>
            </div>
          </div>`;
      }).join('');
    }

    function renderSurveyTrendChart() {
      if (!surveyTrendData) return;
      const canvas = document.getElementById('sl-trend-chart');
      if (!canvas) return;
      if (typeof Chart === 'undefined') {
        // Lazy-load Chart.js
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
        s.onload = () => renderSurveyTrendChart();
        document.head.appendChild(s);
        return;
      }
      if (surveyTrendChart) { surveyTrendChart.destroy(); surveyTrendChart = null; }

      const daily   = Object.entries(surveyTrendData).sort((a, b) => a[0].localeCompare(b[0]));
      let labels, values;
      if (surveyTrendView === 'weekly') {
        const weekMap = {};
        for (const [date, count] of daily) {
          const d = new Date(date);
          const wStart = new Date(d); wStart.setDate(d.getDate() - d.getDay());
          const key = wStart.toISOString().slice(0, 10);
          weekMap[key] = (weekMap[key] || 0) + count;
        }
        const weeks = Object.entries(weekMap).sort((a, b) => a[0].localeCompare(b[0]));
        labels = weeks.map(([d]) => 'Wk ' + d.slice(5));
        values = weeks.map(([, v]) => v);
      } else {
        labels = daily.map(([d]) => d.slice(5));
        values = daily.map(([, v]) => v);
      }

      const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
      const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
      const textColor = isDark ? '#a0a8b8' : '#4a5568';
      surveyTrendChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Responses',
            data: values,
            borderColor: '#C9A84C',
            backgroundColor: 'rgba(201,168,76,0.12)',
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.3,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: textColor, maxTicksLimit: 14 }, grid: { color: gridColor } },
            y: { ticks: { color: textColor, stepSize: 1, precision: 0 }, grid: { color: gridColor }, beginAtZero: true }
          }
        }
      });
    }

    function switchTrendView(view) {
      surveyTrendView = view;
      const dailyBtn  = document.getElementById('sl-trend-daily');
      const weeklyBtn = document.getElementById('sl-trend-weekly');
      if (dailyBtn)  dailyBtn.style.background  = view === 'daily'  ? 'var(--accent-blue-soft)' : '';
      if (dailyBtn)  dailyBtn.style.color        = view === 'daily'  ? 'var(--accent-blue)' : '';
      if (weeklyBtn) weeklyBtn.style.background  = view === 'weekly' ? 'var(--accent-blue-soft)' : '';
      if (weeklyBtn) weeklyBtn.style.color        = view === 'weekly' ? 'var(--accent-blue)' : '';
      renderSurveyTrendChart();
    }
    window.switchTrendView = switchTrendView;

    async function loadSurveyLeads(page) {
      page = page || surveyLeadsState.page;
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const search  = (document.getElementById('sl-search')?.value || '').trim();
      const filter  = document.getElementById('sl-filter')?.value || 'all';
      const sortDir = surveyLeadsState.sortDir || 'desc';
      const params  = new URLSearchParams({ page, limit: surveyLeadsState.limit, search, filter, sort_dir: sortDir });
      const tbody   = document.getElementById('sl-table-body');
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted);">Loading…</td></tr>';
      try {
        const res = await fetch(apiBase + '/api/admin/survey-leads?' + params.toString(), { headers: getAdminHeaders() });
        if (!res.ok) throw new Error('Fetch failed');
        const data = await res.json();
        surveyLeadsState.page       = page;
        surveyLeadsState.total      = data.total || 0;
        surveyLeadsState.totalPages = Math.max(1, Math.ceil((data.total || 0) / surveyLeadsState.limit));
        _surveyLeadsCache = data.leads || [];

        // Update sort button labels
        const sortBtn = document.getElementById('sl-sort-date-btn');
        if (sortBtn) sortBtn.textContent = sortDir === 'desc' ? '📅 Newest First' : '📅 Oldest First';

        if (tbody) {
          const leads = _surveyLeadsCache;
          if (!leads.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);">No leads found.</td></tr>';
          } else {
            // Use data-idx to avoid unsafe inline JSON in onclick
            tbody.innerHTML = leads.map((lead, idx) => {
              const badge = lead.interested === true
                ? '<span class="badge badge-green">✅ Yes</span>'
                : lead.interested === false
                  ? '<span class="badge badge-gray">👎 No</span>'
                  : '<span class="badge badge-gray">—</span>';
              const topFeature = lead.top_feature ? (SURVEY_FEATURE_NAMES[lead.top_feature] || lead.top_feature) : '—';
              const service    = lead.job_service  ? (SURVEY_SERVICE_NAMES[lead.job_service]  || lead.job_service)  : '—';
              const date       = lead.created_at   ? new Date(lead.created_at).toLocaleDateString() : '—';
              return `<tr class="sl-lead-row" data-idx="${idx}" style="cursor:pointer;">
                <td><span style="font-weight:500;">${escapeHtml(lead.name || '—')}</span></td>
                <td><a href="mailto:${escapeHtml(lead.email||'')}" class="sl-email-link" style="color:var(--accent-blue);">${escapeHtml(lead.email||'—')}</a></td>
                <td>${escapeHtml(lead.zip||'—')}</td>
                <td style="font-size:0.83rem;">${escapeHtml(lead.vehicle||'—')}</td>
                <td>${badge}</td>
                <td style="font-size:0.83rem;">${escapeHtml(topFeature)}</td>
                <td style="font-size:0.83rem;">${escapeHtml(service)}</td>
                <td style="font-size:0.83rem;color:var(--text-muted);">${date}</td>
              </tr>`;
            }).join('');
            // Attach click events via delegation (safe — no inline JSON)
            tbody.querySelectorAll('.sl-lead-row').forEach(row => {
              row.addEventListener('click', e => {
                if (e.target.classList.contains('sl-email-link')) return;
                openSurveyLeadDetail(_surveyLeadsCache[parseInt(row.dataset.idx, 10)]);
              });
            });
          }
        }

        const pagEl = document.getElementById('sl-pagination');
        if (pagEl) pagEl.innerHTML = renderPaginationControls(surveyLeadsState, 'loadSurveyLeads');
      } catch (err) {
        console.error('[SurveyLeads] loadSurveyLeads error:', err.message);
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--accent-red);">Failed to load leads.</td></tr>';
      }
    }
    window.loadSurveyLeads = loadSurveyLeads;

    function toggleSurveyDateSort() {
      surveyLeadsState.sortDir = surveyLeadsState.sortDir === 'desc' ? 'asc' : 'desc';
      loadSurveyLeads(1);
    }
    window.toggleSurveyDateSort = toggleSurveyDateSort;

    function openSurveyLeadDetail(lead) {
      if (!lead) return;
      const modal = document.getElementById('sl-detail-modal');
      const body  = document.getElementById('sl-detail-body');
      if (!modal || !body) return;

      const fr = lead.feature_ratings || {};
      const featureRows = Object.entries(fr).map(([fid, val]) => {
        const icon = val === 'yes' ? '👍' : val === 'maybe' ? '🤔' : '👎';
        return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border-subtle);font-size:0.85rem;">
          <span style="color:var(--text-secondary);">${escapeHtml(SURVEY_FEATURE_NAMES[fid] || fid)}</span>
          <span>${icon} ${escapeHtml(val)}</span>
        </div>`;
      }).join('') || '<p style="color:var(--text-muted);font-size:0.83rem;">No feature ratings.</p>';

      const urgencyMap = { asap: '🚨 ASAP', this_week: '📅 This Week', this_month: '🗓️ This Month', just_curious: '👀 Just Pricing' };
      const budgetMap  = { under_100: 'Under $100', '100_500': '$100–$500', '500_1000': '$500–$1,000', '1000_plus': '$1,000+', unsure: 'Not sure' };

      body.innerHTML = `
        <div style="margin-bottom:20px;">
          <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:8px;">Contact</div>
          <div class="detail-grid">
            <span class="detail-label">Name</span><span class="detail-value">${escapeHtml(lead.name||'—')}</span>
            <span class="detail-label">Email</span><span class="detail-value"><a href="mailto:${escapeHtml(lead.email||'')}" style="color:var(--accent-blue);">${escapeHtml(lead.email||'—')}</a></span>
            <span class="detail-label">Phone</span><span class="detail-value">${escapeHtml(lead.phone||'—')}</span>
            <span class="detail-label">ZIP</span><span class="detail-value">${escapeHtml(lead.zip||'—')}</span>
            <span class="detail-label">Vehicle</span><span class="detail-value">${escapeHtml(lead.vehicle||'—')}</span>
            <span class="detail-label">Interested</span><span class="detail-value">${lead.interested === true ? '✅ Yes' : lead.interested === false ? '👎 No' : '—'}</span>
            <span class="detail-label">Date</span><span class="detail-value">${lead.created_at ? new Date(lead.created_at).toLocaleString() : '—'}</span>
          </div>
        </div>
        ${lead.job_service || lead.job_issue ? `
        <div style="margin-bottom:20px;">
          <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:8px;">Job Request</div>
          <div class="detail-grid">
            <span class="detail-label">Service</span><span class="detail-value">${escapeHtml(SURVEY_SERVICE_NAMES[lead.job_service] || lead.job_service || '—')}</span>
            <span class="detail-label">Urgency</span><span class="detail-value">${escapeHtml(urgencyMap[lead.job_urgency] || lead.job_urgency || '—')}</span>
            <span class="detail-label">Budget</span><span class="detail-value">${escapeHtml(budgetMap[lead.job_budget] || lead.job_budget || '—')}</span>
            <span class="detail-label" style="align-self:start;">Issue</span><span class="detail-value" style="white-space:pre-wrap;">${escapeHtml(lead.job_issue || '—')}</span>
          </div>
        </div>` : ''}
        <div>
          <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:8px;">Feature Ratings</div>
          ${featureRows}
        </div>`;

      modal.classList.add('active');
    }
    window.openSurveyLeadDetail = openSurveyLeadDetail;

    async function loadSurveyNotInterested(page) {
      page = page || surveyNiState.page;
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const tbody   = document.getElementById('sl-ni-body');
      if (tbody) tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--text-muted);">Loading…</td></tr>';
      try {
        const params = new URLSearchParams({ page, limit: surveyNiState.limit });
        const res = await fetch(apiBase + '/api/admin/survey-not-interested?' + params.toString(), { headers: getAdminHeaders() });
        if (!res.ok) throw new Error('Fetch failed');
        const data = await res.json();
        surveyNiState.page       = page;
        surveyNiState.total      = data.total || 0;
        surveyNiState.totalPages = Math.max(1, Math.ceil((data.total || 0) / surveyNiState.limit));

        if (tbody) {
          const emails = data.emails || [];
          if (!emails.length) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:32px;color:var(--text-muted);">No not-interested emails yet.</td></tr>';
          } else {
            tbody.innerHTML = emails.map(row => {
              const hasRatings = row.feature_ratings && Object.keys(row.feature_ratings).length > 0;
              return `<tr>
                <td><a href="mailto:${escapeHtml(row.email||'')}" style="color:var(--accent-blue);">${escapeHtml(row.email||'—')}</a></td>
                <td style="color:var(--text-muted);font-size:0.85rem;">${row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}</td>
                <td>${hasRatings ? '<span class="badge badge-green">Yes</span>' : '<span class="badge badge-gray">No</span>'}</td>
              </tr>`;
            }).join('');
          }
        }

        const pagEl = document.getElementById('sl-ni-pagination');
        if (pagEl) pagEl.innerHTML = renderPaginationControls(surveyNiState, 'loadSurveyNotInterested');
      } catch (err) {
        console.error('[SurveyLeads] loadSurveyNotInterested error:', err.message);
        if (tbody) tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--accent-red);">Failed to load emails.</td></tr>';
      }
    }
    window.loadSurveyNotInterested = loadSurveyNotInterested;

    function switchSurveyTab(tab, el) {
      document.querySelectorAll('#survey-leads-tabs .tab').forEach(t => t.classList.remove('active'));
      if (el) el.classList.add('active');
      ['leads','not-interested','heatmap','trends'].forEach(t => {
        const div = document.getElementById('survey-tab-' + t);
        if (div) div.style.display = t === tab ? '' : 'none';
      });
      if (tab === 'not-interested') loadSurveyNotInterested(1);
      if (tab === 'trends' && surveyTrendData) setTimeout(renderSurveyTrendChart, 50);
    }
    window.switchSurveyTab = switchSurveyTab;

    function debounceSurveySearch() {
      if (surveySearchTimer) clearTimeout(surveySearchTimer);
      surveySearchTimer = setTimeout(() => loadSurveyLeads(1), 300);
    }
    window.debounceSurveySearch = debounceSurveySearch;

    function exportSurveyLeads() {
      const apiBase = window.MCC_CONFIG?.apiBaseUrl || '';
      const headers = getAdminHeaders();
      const pw      = headers['x-admin-password'] || headers['x-admin-token'] || '';
      const url     = apiBase + '/api/admin/survey-leads/export';
      const a       = document.createElement('a');
      a.href = url + (pw ? '?_t=' + Date.now() : '');
      // Pass password via fetch and redirect to blob URL
      fetch(url, { headers }).then(r => r.blob()).then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        a.href = blobUrl;
        a.download = 'survey-leads-' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      }).catch(err => { console.error('[SurveyLeads] export error:', err); alert('Export failed.'); });
    }
    window.exportSurveyLeads = exportSurveyLeads;

    // ========== END SURVEY LEADS ==========
