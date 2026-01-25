    // ========== SECURITY HELPERS ==========
    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = String(text);
      return div.innerHTML;
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
      agreements: { page: 1, limit: 25, total: 0, totalPages: 0, search: '', filter: 'all' }
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
      'registration-verifications': false,
      tickets: false,
      members: false,
      'user-roles': false,
      'user-management': false,
      'merch-manager': false,
      agreements: false,
      settings: false
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
      'registration-verifications': async () => { await loadRegistrationVerifications(); },
      tickets: async () => { await loadTickets(); },
      members: async () => { await loadMembers(); },
      'user-roles': async () => { await loadUserRoles(); },
      'user-management': async () => { await loadUserManagement(); },
      'merch-manager': async () => { await loadDesignLibrary(); await loadMerchPreferences(); },
      agreements: async () => { await loadAgreements(); },
      settings: async () => { await load2faGlobalStatus(); }
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
    let currentModalState = 'loading'; // 'loading', 'login', 'password', 'not-admin'
    
    function showModalState(state) {
      currentModalState = state;
      const loginForm = document.getElementById('admin-login-form');
      const passwordForm = document.getElementById('admin-password-form');
      const notAdminError = document.getElementById('admin-not-admin-error');
      const modalBtn = document.getElementById('admin-modal-btn');
      const modalTitle = document.getElementById('admin-modal-title');
      
      loginForm.style.display = 'none';
      passwordForm.style.display = 'none';
      notAdminError.style.display = 'none';
      
      if (state === 'login') {
        modalTitle.textContent = '🔐 Admin Sign In';
        loginForm.style.display = 'block';
        modalBtn.textContent = 'Sign In';
        modalBtn.style.display = 'block';
        document.getElementById('admin-login-email').focus();
      } else if (state === 'password') {
        modalTitle.textContent = '🔐 Admin Access';
        passwordForm.style.display = 'block';
        modalBtn.textContent = 'Verify';
        modalBtn.style.display = 'block';
        document.getElementById('admin-password-input').focus();
      } else if (state === 'not-admin') {
        modalTitle.textContent = '⚠️ Access Denied';
        notAdminError.style.display = 'block';
        modalBtn.textContent = 'Sign Out & Try Again';
        modalBtn.style.display = 'block';
      }
    }
    
    async function handleAdminModalAction() {
      if (currentModalState === 'login') {
        await performAdminLogin();
      } else if (currentModalState === 'password') {
        await verifyAdminPassword();
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
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      console.log('[Admin] Auth state changed:', event, { hasSession: !!session });
      
      if (event === 'SIGNED_IN' && session?.user && currentModalState === 'login') {
        currentUser = session.user;
        const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', currentUser.id).single();
        if (profile?.role === 'admin') {
          showModalState('password');
        } else {
          showModalState('not-admin');
        }
      }
    });
    
    // ========== 2FA ACCESS CHECK ==========
    async function checkAccessAuthorization() {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        window.location.href = 'login.html';
        return false;
      }
      
      try {
        const response = await fetch('/api/auth/check-access', {
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
      
      // Check for existing session
      const { data: { session } } = await supabaseClient.auth.getSession();
      console.log('[Admin] getSession result:', { hasSession: !!session, hasUser: !!session?.user });
      
      if (session?.user) {
        currentUser = session.user;
        
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
          adminPasswordVerified = true;
          document.getElementById('admin-password-modal').style.display = 'none';
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
    
    // Expose to global scope for Mobile Safari onclick compatibility
    window.verifyAdminPassword = verifyAdminPassword;
    
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
          supabaseClient.from('helpdesk_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
          supabaseClient.from('violation_reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabaseClient.from('completed_activity_reviews').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
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
        document.getElementById('health-avg-rating').textContent = avgRating + ' ⭐';
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
          <span style="color:var(--accent-blue);">● Members</span>
          <span style="color:var(--accent-gold);margin-left:8px;">● Providers</span>
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
              <span style="font-size:1.2rem;">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '⭐'}</span>
              <span>${name}</span>
            </div>
            <div style="text-align:right;">
              <div style="font-weight:600;">${p.avg.toFixed(1)} ⭐</div>
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
        maintenance: '🔧 Maintenance',
        detailing: '✨ Detailing',
        cosmetic: '🎨 Cosmetic',
        accident_repair: '🚗 Accident Repair',
        other: '📦 Other'
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
        const [overviewRes, revenueRes, usersRes, ordersRes] = await Promise.all([
          fetch('/api/admin/stats/overview'),
          fetch(`/api/admin/stats/revenue?period=${dashboardPeriod}`),
          fetch(`/api/admin/stats/users?period=${dashboardPeriod}`),
          fetch(`/api/admin/stats/orders?period=${dashboardPeriod}`)
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
      renderApplications();
      document.getElementById('app-count').textContent = applications.filter(a => a.status === 'pending').length;
    }

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
      
      try {
        const response = await fetch(`/api/admin/providers?${params}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
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
      
      try {
        const response = await fetch(`/api/admin/members?${params}`, {
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
      
      try {
        const response = await fetch(`/api/admin/agreements?${params}`, {
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

    function formatAgreementType(type) {
      const types = {
        'founding_partner': 'Founding Partner',
        'member_founder': 'Member Founder',
        'provider': 'Provider'
      };
      return types[type] || type || 'Unknown';
    }

    function getAgreementTypeBadgeClass(type) {
      const classes = {
        'founding_partner': 'background:var(--accent-gold-soft);color:var(--accent-gold);',
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
        if (a.signature_type === 'drawn') {
          signatureHtml = `
            <div class="form-section">
              <div class="form-section-title">Signature</div>
              <div style="background:white;padding:16px;border-radius:var(--radius-md);border:1px solid var(--border-subtle);display:inline-block;">
                <img src="${a.signature_data}" alt="Signature" style="max-width:100%;max-height:150px;">
              </div>
            </div>
          `;
        } else if (a.signature_type === 'typed') {
          signatureHtml = `
            <div class="form-section">
              <div class="form-section-title">Typed Signature</div>
              <div style="font-family:'Brush Script MT', cursive;font-size:2rem;color:var(--text-primary);padding:16px;background:var(--bg-input);border-radius:var(--radius-md);">
                ${a.signature_data}
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

      document.getElementById('agreement-modal').classList.add('active');
    }
    window.viewAgreement = viewAgreement;

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
      
      try {
        const response = await fetch(`/api/admin/packages?${params}`, {
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
          supabaseClient.from('helpdesk_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open')
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
        if (pendingAppsCount > 0) attentionItems.push({ icon: '📋', text: `${pendingAppsCount} provider application(s) awaiting review`, section: 'applications' });
        if (openDisputesCount > 0) attentionItems.push({ icon: '⚠️', text: `${openDisputesCount} dispute(s) need resolution`, section: 'disputes' });
        if (openTicketsCount > 0) attentionItems.push({ icon: '🎫', text: `${openTicketsCount} support ticket(s) awaiting response`, section: 'tickets' });

        const container = document.getElementById('attention-items');
        if (attentionItems.length === 0) {
          container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><p>All caught up!</p></div>';
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
            icon: p.status === 'released' ? '💰' : p.status === 'held' ? '🔒' : '💳',
            text: `${p.status === 'released' ? 'Payment released' : p.status === 'held' ? 'Payment held in escrow' : 'Payment'} - $${p.amount_total?.toFixed(2) || 0}`,
            time: p.created_at,
            type: 'payment'
          });
        });
        (recentApps || []).forEach(a => {
          activities.push({ icon: '📋', text: `New provider application: ${a.business_name}`, time: a.created_at, type: 'application' });
        });
        (recentDisputes || []).forEach(d => {
          activities.push({ icon: '⚠️', text: `Dispute ${d.status}: ${d.maintenance_packages?.title || 'Package'}`, time: d.created_at, type: 'dispute' });
        });

        activities.sort((a, b) => new Date(b.time) - new Date(a.time));
        const container = document.getElementById('recent-activity-feed');
        if (activities.length === 0) {
          container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><p>No recent activity</p></div>';
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
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No applications</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(app => `
        <tr>
          <td><strong>${escapeHtml(app.business_name)}</strong><br><span style="color:var(--text-muted);font-size:0.82rem;">${escapeHtml(app.contact_name)}</span></td>
          <td>${escapeHtml(app.business_type) || 'N/A'}</td>
          <td>${escapeHtml(app.city) || ''}, ${escapeHtml(app.state) || ''}</td>
          <td>${new Date(app.created_at).toLocaleDateString()}</td>
          <td><span class="status-badge ${escapeHtml(app.status)}">${escapeHtml(app.status)}</span></td>
          <td><button class="btn btn-secondary btn-sm" onclick="viewApplication('${escapeHtml(app.id)}')">Review</button></td>
        </tr>
      `).join('');
    }

    let selectedProviders = new Set();
    let filteredProviders = [];

    function renderProviders() {
      const tbody = document.getElementById('providers-table');
      filteredProviders = filterProvidersData();
      
      if (!filteredProviders.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No providers match filters</td></tr>';
        updateBulkBar();
        return;
      }

      tbody.innerHTML = filteredProviders.map(p => {
        const stats = p.provider_stats?.[0] || {};
        const totalCredits = (p.bid_credits || 0) + (p.free_trial_bids || 0);
        const isSuspended = p.suspension_reason || stats.suspended;
        const isSelected = selectedProviders.has(p.id);
        
        return `
          <tr style="${isSelected ? 'background:var(--accent-blue-soft);' : ''}">
            <td><input type="checkbox" class="provider-checkbox" data-id="${p.id}" ${isSelected ? 'checked' : ''} onchange="toggleProviderSelection('${p.id}')"></td>
            <td>
              <div><strong>${p.business_name || p.full_name || 'Unnamed'}</strong>${p.is_founding_provider ? ' <span style="background:linear-gradient(135deg,#d4a855,#f0d78c);color:#0a0a0f;padding:2px 8px;border-radius:4px;font-size:0.7rem;font-weight:600;margin-left:8px;">🌟 FOUNDING</span>' : ''}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${p.email || ''}</div>
            </td>
            <td>
              <span style="padding:4px 8px;border-radius:4px;font-size:0.85rem;background:${totalCredits === 0 ? 'var(--accent-red-soft)' : totalCredits < 10 ? 'var(--accent-orange-soft)' : 'var(--accent-green-soft)'};color:${totalCredits === 0 ? 'var(--accent-red)' : totalCredits < 10 ? 'var(--accent-orange)' : 'var(--accent-green)'};">
                🎟️ ${totalCredits}
              </span>
            </td>
            <td>⭐ ${stats.average_rating?.toFixed(1) || 'New'}${stats.average_rating && stats.average_rating < 4 ? ' <span style="color:var(--accent-red);">⚠️</span>' : ''}</td>
            <td>${stats.jobs_completed || 0}</td>
            <td>$${(stats.total_earnings || 0).toLocaleString()}</td>
            <td><span class="status-badge ${isSuspended ? 'rejected' : 'approved'}">${isSuspended ? 'Suspended' : 'Active'}</span></td>
            <td>
              <div style="display:flex;gap:4px;">
                <button class="btn btn-secondary btn-sm" onclick="viewProvider('${p.id}')">View</button>
                <button class="btn btn-ghost btn-sm" onclick="quickAddCredits('${p.id}')" title="Add Credits">🎟️</button>
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
      let success = 0;

      for (const providerId of selectedProviders) {
        const provider = providers.find(p => p.id === providerId);
        const newCredits = (provider?.bid_credits || 0) + creditsToAdd;
        
        const { error } = await supabaseClient.from('profiles').update({
          bid_credits: newCredits
        }).eq('id', providerId);

        if (!error) success++;
      }

      showToast(`Added ${creditsToAdd} credits to ${success} provider(s)`, 'success');
      clearSelection();
      await loadProviders();
    }

    async function bulkSuspend() {
      const count = selectedProviders.size;
      const reason = prompt(`Suspend ${count} provider(s):\n\nEnter suspension reason:`);
      if (!reason) return;

      let success = 0;

      for (const providerId of selectedProviders) {
        const { error } = await supabaseClient.from('profiles').update({
          suspension_reason: reason,
          suspended_at: new Date().toISOString()
        }).eq('id', providerId);

        if (!error) success++;
      }

      showToast(`Suspended ${success} provider(s)`, 'success');
      clearSelection();
      await loadProviders();
    }

    async function bulkActivate() {
      const count = selectedProviders.size;
      if (!confirm(`Activate ${count} suspended provider(s)?`)) return;

      let success = 0;

      for (const providerId of selectedProviders) {
        const { error } = await supabaseClient.from('profiles').update({
          suspension_reason: null,
          suspended_at: null
        }).eq('id', providerId);

        if (!error) success++;
      }

      showToast(`Activated ${success} provider(s)`, 'success');
      clearSelection();
      await loadProviders();
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
          title: '📢 Message from MCC Admin',
          message: message
        });
        if (!error) success++;
      }

      showToast(`Message sent to ${success} provider(s)`, 'success');
      clearSelection();
    }

    async function checkLowRatedProviders() {
      // Find providers with ratings below 4 stars who are not already suspended
      const lowRated = providers.filter(p => {
        const stats = p.provider_stats?.[0] || {};
        const avgRating = stats.average_rating;
        const isSuspended = p.suspension_reason || stats.suspended;
        return avgRating !== null && avgRating !== undefined && avgRating < 4 && !isSuspended;
      });

      if (lowRated.length === 0) {
        showToast('No providers with ratings below 4 stars found!', 'success');
        return;
      }

      const names = lowRated.map(p => `• ${p.business_name || p.full_name} (${p.provider_stats?.[0]?.average_rating?.toFixed(1)} ⭐)`).join('\n');
      
      const action = confirm(`⚠️ Found ${lowRated.length} provider(s) with ratings below 4 stars:\n\n${names}\n\nDo you want to suspend these providers?`);
      
      if (!action) {
        // Just filter to show them
        document.getElementById('provider-rating-filter').value = 'low';
        filterProviders();
        showToast(`Showing ${lowRated.length} low-rated provider(s)`, 'info');
        return;
      }

      // Suspend low-rated providers
      let suspended = 0;
      for (const provider of lowRated) {
        const { error } = await supabaseClient
          .from('profiles')
          .update({ 
            suspension_reason: 'Rating below 4 stars - automatic suspension',
            suspended_at: new Date().toISOString()
          })
          .eq('id', provider.id);
        
        if (!error) {
          suspended++;
          
          // Send notification
          await supabaseClient.from('notifications').insert({
            user_id: provider.id,
            type: 'account_suspended',
            title: '⚠️ Account Suspended',
            message: 'Your provider account has been suspended due to ratings falling below 4 stars. Please contact support to discuss reinstatement.'
          });
        }
      }

      showToast(`Suspended ${suspended} provider(s) with low ratings`, 'success');
      await loadData();
      renderProviders();
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
      const newCredits = (provider?.bid_credits || 0) + creditsToAdd;

      const { error } = await supabaseClient.from('profiles').update({
        bid_credits: newCredits
      }).eq('id', providerId);

      if (error) {
        showToast('Failed to add credits', 'error');
      } else {
        showToast(`Added ${creditsToAdd} credits to ${name}`, 'success');
        await loadProviders();
      }
    }

    function renderPayments() {
      const filtered = payments.filter(p => p.status === currentFilters.payments || currentFilters.payments === 'all');
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
          <td>
            ${p.status === 'held' ? `<button class="btn btn-sm btn-success" onclick="releasePayment('${p.id}')">Release</button>` : '-'}
          </td>
        </tr>
      `).join('');
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
          <div class="form-section-title">🚗 Loaner Vehicle Program</div>
          ${app.has_loaner_vehicles ? `
            <div class="detail-grid">
              <span class="detail-label">Loaner Vehicles:</span><span class="detail-value" style="color:var(--accent-green);">✓ Yes (${app.loaner_vehicle_count || '?'} vehicles)</span>
              <span class="detail-label">Vehicle Types:</span><span class="detail-value">${app.loaner_vehicle_types || 'N/A'}</span>
              <span class="detail-label">Delivery Options:</span><span class="detail-value">${loanerOptions}</span>
              <span class="detail-label">Requirements:</span><span class="detail-value">${app.loaner_requirements || 'N/A'}</span>
              <span class="detail-label">Fee:</span><span class="detail-value">${app.loaner_fee_type === 'free' ? 'Free with service' : app.loaner_fee_type === 'deposit' ? 'Deposit only' : app.loaner_fee_amount ? '$' + app.loaner_fee_amount + '/day' : 'N/A'}</span>
            </div>
          ` : `
            <p style="color:var(--text-muted);">❌ No loaner vehicles available</p>
          `}
        </div>

        <div class="form-section">
          <div class="form-section-title">🚚 Pickup & Delivery</div>
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
                  <span class="doc-icon">📄</span>
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
                <span class="doc-icon">⭐</span>
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
                <span class="doc-icon">👤</span>
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
              <label for="chk-insurance">Insurance certificate verified (adequate coverage)</label>
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
      `;

      document.getElementById('application-modal').classList.add('active');
    }

    async function approveApplication() {
      if (!currentApplication) return;
      if (!confirm('Approve this provider? They will gain access to the provider portal.')) return;

      const adminNotes = document.getElementById('admin-notes').value;

      await supabaseClient.from('provider_applications').update({
        status: 'approved',
        admin_notes: adminNotes,
        reviewed_by: currentUser.id,
        reviewed_at: new Date().toISOString(),
        license_verified: document.getElementById('chk-license').checked,
        insurance_verified: document.getElementById('chk-insurance').checked,
        certifications_verified: document.getElementById('chk-certs').checked,
        reviews_checked: document.getElementById('chk-reviews').checked,
        references_contacted: document.getElementById('chk-refs').checked
      }).eq('id', currentApplication.id);

      await supabaseClient.from('profiles').update({ role: 'provider' }).eq('id', currentApplication.user_id);

      // Create provider_stats record
      await supabaseClient.from('provider_stats').insert({ provider_id: currentApplication.user_id });

      closeModal('application-modal');
      showToast('Provider approved!');
      await loadApplications();
      await loadProviders();
      updateDashboard();
    }

    async function rejectApplication() {
      if (!currentApplication) return;
      const reason = prompt('Reason for rejection:');
      if (!reason) return;

      await supabaseClient.from('provider_applications').update({
        status: 'rejected',
        rejection_reason: reason,
        admin_notes: document.getElementById('admin-notes').value,
        reviewed_by: currentUser.id,
        reviewed_at: new Date().toISOString()
      }).eq('id', currentApplication.id);

      closeModal('application-modal');
      showToast('Application rejected');
      await loadApplications();
      updateDashboard();
    }

    async function requestMoreInfo() {
      if (!currentApplication) return;
      const request = prompt('What additional information is needed?');
      if (!request) return;

      await supabaseClient.from('provider_applications').update({
        status: 'more_info_needed',
        admin_notes: (document.getElementById('admin-notes').value || '') + '\n\nRequested: ' + request
      }).eq('id', currentApplication.id);

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
            ⚠️ This dispute is over $1,000. Third-party inspection may be required.
          </div>
        ` : ''}

        <div class="form-section">
          <div class="form-section-title">Evidence Submitted</div>
          ${evidence?.length ? `
            <div class="evidence-grid">
              ${evidence.map(e => `
                <div class="evidence-item" onclick="window.open('${e.file_url}','_blank')">
                  <img src="${e.file_url}" onerror="this.parentElement.innerHTML='📄'">
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
      `;

      document.getElementById('dispute-modal-footer').innerHTML = `
        ${isHighValue && !d.requires_inspection ? `<button class="btn btn-secondary" onclick="scheduleInspection()">Schedule Inspection</button>` : ''}
        <button class="btn btn-danger" onclick="resolveDispute('provider')">Resolve for Provider</button>
        <button class="btn btn-success" onclick="resolveDispute('member')">Resolve for Member</button>
      `;

      document.getElementById('dispute-modal').classList.add('active');
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
      `;

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
    }

    function navigateToSection(id) {
      showSection(id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.navigateToSection = navigateToSection;

    function closeModal(id) { document.getElementById(id).classList.remove('active'); }

    function showToast(msg, type = 'success') {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerHTML = `<span>${type === 'success' ? '✓' : '⚠'}</span><span>${msg}</span>`;
      document.getElementById('toast-container').appendChild(toast);
      setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    }

    // ========== GLOBAL 2FA TOGGLE ==========
    async function load2faGlobalStatus() {
      try {
        const session = await supabaseClient.auth.getSession();
        if (!session?.data?.session?.access_token) return;
        
        const response = await fetch('/api/admin/2fa-global-status', {
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
        
        const response = await fetch('/api/admin/2fa-global-toggle', {
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
                  <button class="btn btn-success btn-sm" onclick="approvePilotApplication('${app.id}')">✓</button>
                  <button class="btn btn-danger btn-sm" onclick="rejectPilotApplication('${app.id}')">✗</button>
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
          <div class="form-section-title">🌟 Founding Provider Application</div>
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
              ${app.agree_tos ? '✅' : '❌'} Agreed to Terms of Service
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              ${app.agree_contractor ? '✅' : '❌'} Agreed to Independent Contractor Terms
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              ${app.agree_accuracy ? '✅' : '❌'} Confirmed Information Accuracy
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
                  <button class="btn btn-success btn-sm" onclick="approveMemberFounder('${app.id}')">✓</button>
                  <button class="btn btn-danger btn-sm" onclick="rejectMemberFounder('${app.id}')">✗</button>
                ` : ''}
                ${['approved', 'active'].includes((app.status || '').toLowerCase().trim()) ? `
                  <button class="btn btn-primary btn-sm" onclick="resendFounderWelcomeEmail('${app.id}')" title="Resend Welcome Email">📧</button>
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
          <div class="form-section-title">👤 Applicant Information</div>
          <div class="detail-grid">
            <span class="detail-label">Full Name:</span><span class="detail-value">${app.full_name || 'N/A'}</span>
            <span class="detail-label">Email:</span><span class="detail-value">${app.email || 'N/A'}</span>
            <span class="detail-label">Phone:</span><span class="detail-value">${app.phone || 'N/A'}</span>
            <span class="detail-label">Location:</span><span class="detail-value">${app.location || 'N/A'}</span>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">📣 Promotion Strategy</div>
          <div class="detail-grid">
            <span class="detail-label">Primary Method:</span><span class="detail-value">${promotionLabels[app.promotion_method] || app.promotion_method || 'N/A'}</span>
            <span class="detail-label">Social Following:</span><span class="detail-value">${app.social_following || 'Not specified'}</span>
            <span class="detail-label">Hours/Week:</span><span class="detail-value">${app.hours_available || 'Not specified'}</span>
            <span class="detail-label">Auto Connections:</span><span class="detail-value">${connectionLabels[app.auto_connections] || app.auto_connections || 'Not specified'}</span>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">💬 Motivation</div>
          <p style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);line-height:1.6;">${app.motivation || 'No motivation provided.'}</p>
        </div>

        <div class="form-section">
          <div class="form-section-title">📋 Agreements</div>
          <div style="display:grid;gap:8px;">
            ${app.agreements_accepted ? `
              <div style="display:flex;align-items:center;gap:8px;">
                ${app.agreements_accepted.terms_of_service ? '✅' : '❌'} Terms of Service
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                ${app.agreements_accepted.independent_contractor ? '✅' : '❌'} Independent Contractor Terms
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                ${app.agreements_accepted.commission_terms ? '✅' : '❌'} Commission Terms
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                ${app.agreements_accepted.accurate_information ? '✅' : '❌'} Information Accuracy
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
          const emailResponse = await fetch('/api/email/founder-approved', {
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
        const response = await fetch('/api/email/founder-approved', {
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

    function updatePayoutStats() {
      const activeFounders = founderProfiles.filter(f => f.status === 'active').length;
      const totalReferrals = founderProfiles.reduce((sum, f) => sum + (f.total_provider_referrals || 0), 0);
      const pendingBalance = founderProfiles.reduce((sum, f) => sum + parseFloat(f.pending_balance || 0), 0);
      const totalPaid = founderProfiles.reduce((sum, f) => sum + parseFloat(f.total_commissions_paid || 0), 0);
      const pendingPayoutsCount = founderProfiles.filter(f => parseFloat(f.pending_balance || 0) >= 25).length;

      document.getElementById('total-founders').textContent = activeFounders;
      document.getElementById('total-referrals').textContent = totalReferrals;
      document.getElementById('pending-commissions').textContent = '$' + pendingBalance.toFixed(2);
      document.getElementById('total-paid').textContent = '$' + totalPaid.toFixed(2);
      document.getElementById('payout-count').textContent = pendingPayoutsCount;
      document.getElementById('payout-count').style.display = pendingPayoutsCount > 0 ? 'inline' : 'none';
    }

    function renderPayoutContent() {
      const tbody = document.getElementById('payout-table-body');
      const header = document.getElementById('payout-table-header');

      if (currentPayoutTab === 'founders') {
        header.innerHTML = `
          <th>Founder</th>
          <th>Referral Code</th>
          <th>Provider Referrals</th>
          <th>Pending Balance</th>
          <th>Total Earned</th>
          <th>Stripe Connect</th>
          <th>Status</th>
          <th>Action</th>
        `;

        if (!founderProfiles.length) {
          tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No member founders yet</td></tr>`;
          return;
        }

        tbody.innerHTML = founderProfiles.map(f => {
          const hasStripeConnect = f.stripe_connect_account_id && f.payout_details?.transfers_enabled;
          const stripePending = f.stripe_connect_account_id && !f.payout_details?.transfers_enabled;
          const stripeStatus = hasStripeConnect ? 
            '<span class="status-badge approved" title="Ready for payouts">💳 Connected</span>' : 
            stripePending ? 
            '<span class="status-badge orange" title="Onboarding incomplete">⏳ Pending</span>' : 
            '<span class="status-badge" style="background:var(--bg-input);color:var(--text-muted);">Not Setup</span>';
          return `
          <tr>
            <td>
              <div><strong>${f.full_name}</strong></div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${f.email}</div>
            </td>
            <td><code style="background:var(--accent-gold-soft);color:var(--accent-gold);padding:4px 8px;border-radius:4px;font-weight:600;">${f.referral_code}</code></td>
            <td>${f.total_provider_referrals || 0}</td>
            <td style="font-weight:600;color:${parseFloat(f.pending_balance || 0) >= 25 ? 'var(--accent-green)' : 'var(--text-primary)'};">$${parseFloat(f.pending_balance || 0).toFixed(2)}</td>
            <td>$${parseFloat(f.total_commissions_earned || 0).toFixed(2)}</td>
            <td>${stripeStatus}</td>
            <td><span class="status-badge ${f.status === 'active' ? 'approved' : f.status}">${f.status}</span></td>
            <td>
              <div style="display:flex;gap:4px;flex-wrap:wrap;">
                <button class="btn btn-secondary btn-sm" onclick="viewFounderDetails('${f.id}')">View</button>
                ${parseFloat(f.pending_balance || 0) >= 25 ? `<button class="btn btn-success btn-sm" onclick="createPayout('${f.id}')">Pay</button>` : ''}
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
          <th>Created</th>
          <th>Status</th>
          <th>Action</th>
        `;

        const pendingPayouts = founderPayouts.filter(p => p.status === 'pending' || p.status === 'processing');
        
        if (!pendingPayouts.length) {
          tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No pending payouts</td></tr>`;
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
            <td>${new Date(p.created_at).toLocaleDateString()}</td>
            <td><span class="status-badge ${p.status === 'processing' ? 'blue' : 'orange'}">${p.status}</span></td>
            <td>
              <div style="display:flex;gap:4px;flex-wrap:wrap;">
                ${p.payout_method === 'stripe_connect' ? `<button class="btn btn-primary btn-sm" onclick="processStripePayout('${p.id}')">💳 Process via Stripe</button>` : `<button class="btn btn-success btn-sm" onclick="completePayout('${p.id}')">Mark Complete</button>`}
                <button class="btn btn-danger btn-sm" onclick="cancelPayout('${p.id}')">Cancel</button>
              </div>
            </td>
          </tr>
        `).join('');
      } else if (currentPayoutTab === 'completed-payouts') {
        header.innerHTML = `
          <th>Founder</th>
          <th>Period</th>
          <th>Amount</th>
          <th>Method</th>
          <th>Paid On</th>
          <th>Status</th>
          <th>Notes</th>
        `;

        const completedPayouts = founderPayouts.filter(p => p.status === 'completed');
        
        if (!completedPayouts.length) {
          tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No completed payouts yet</td></tr>`;
          return;
        }

        tbody.innerHTML = completedPayouts.map(p => `
          <tr>
            <td>
              <div><strong>${p.founder?.full_name || 'Unknown'}</strong></div>
              <div style="font-size:0.8rem;color:var(--text-muted);">${p.founder?.email || ''}</div>
            </td>
            <td>${p.payout_period}</td>
            <td style="font-weight:600;color:var(--accent-green);">$${parseFloat(p.amount).toFixed(2)}</td>
            <td>${p.payout_method}</td>
            <td>${p.processed_at ? new Date(p.processed_at).toLocaleDateString() : 'N/A'}</td>
            <td><span class="status-badge approved">completed</span></td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.notes || '-'}</td>
          </tr>
        `).join('');
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
          <div class="form-section-title">👤 Founder Information</div>
          <div class="detail-grid">
            <span class="detail-label">Name:</span><span class="detail-value">${founder.full_name}</span>
            <span class="detail-label">Email:</span><span class="detail-value">${founder.email}</span>
            <span class="detail-label">Referral Code:</span><span class="detail-value"><code style="background:var(--accent-gold-soft);color:var(--accent-gold);padding:4px 8px;border-radius:4px;font-weight:600;">${founder.referral_code}</code></span>
            <span class="detail-label">Status:</span><span class="detail-value"><span class="status-badge ${founder.status === 'active' ? 'approved' : founder.status}">${founder.status}</span></span>
            <span class="detail-label">Joined:</span><span class="detail-value">${new Date(founder.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">💰 Commission Summary</div>
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
          <div class="form-section-title">🔗 Provider Referrals (${referrals?.length || 0})</div>
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
          <div class="form-section-title">📋 Recent Commissions (${commissions?.length || 0})</div>
          ${commissions?.length ? `
            <div style="display:flex;flex-direction:column;gap:8px;max-height:200px;overflow-y:auto;">
              ${commissions.map(c => `
                <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-input);padding:12px;border-radius:var(--radius-md);">
                  <div>
                    <strong>$${parseFloat(c.commission_amount).toFixed(2)}</strong>
                    <span style="font-size:0.8rem;color:var(--text-muted);">(${c.commission_type === 'bid_pack' ? '📦 Bid Pack' : '💳 Platform Fee'})</span>
                    <div style="font-size:0.8rem;color:var(--text-muted);">${new Date(c.created_at).toLocaleDateString()}</div>
                  </div>
                  <span class="status-badge ${c.status}">${c.status}</span>
                </div>
              `).join('')}
            </div>
          ` : '<p style="color:var(--text-muted);">No commissions recorded yet</p>'}
        </div>

        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">💳 Payout Settings</div>
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

      if (!confirm(`Process Stripe transfer of $${parseFloat(payout.amount).toFixed(2)} to ${payout.founder?.full_name || 'founder'}? This will initiate a real payment.`)) {
        return;
      }

      const adminPassword = prompt('Enter admin password to authorize payout:');
      if (!adminPassword) return;

      try {
        showToast('Processing Stripe transfer...', 'info');
        
        const response = await fetch('/api/admin/process-founder-payout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payout_id: payoutId,
            admin_password: adminPassword
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

    document.getElementById('payout-tabs')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab')) {
        document.querySelectorAll('#payout-tabs .tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentPayoutTab = e.target.dataset.filter;
        renderPayoutContent();
      }
    });

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
        container.innerHTML = `<div class="empty-state" style="padding:40px;"><div class="empty-state-icon">🚩</div><p>No ${currentViolationFilter} reports</p></div>`;
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
                  ${report.evidence_urls.map((url, i) => `<a href="${url}" target="_blank" class="btn btn-secondary btn-sm">📎 Evidence ${i + 1}</a>`).join('')}
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
                <strong>💰 Reward:</strong> $${report.reward_amount.toFixed(2)} ${report.reward_paid_at ? '(Paid)' : '(Pending)'}
              </div>
            ` : ''}

            <div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:16px;border-top:1px solid var(--border-subtle);">
              ${report.status === 'pending' ? `
                <button class="btn btn-primary btn-sm" onclick="updateViolationStatus('${report.id}', 'investigating')">🔍 Start Investigation</button>
                <button class="btn btn-secondary btn-sm" onclick="updateViolationStatus('${report.id}', 'dismissed')">✗ Dismiss</button>
              ` : ''}
              ${report.status === 'investigating' ? `
                <button class="btn btn-primary btn-sm" onclick="confirmViolation('${report.id}')">✓ Confirm Violation</button>
                <button class="btn btn-secondary btn-sm" onclick="updateViolationStatus('${report.id}', 'dismissed')">✗ Dismiss</button>
              ` : ''}
              ${report.status === 'confirmed' && !report.reward_paid_at ? `
                <button class="btn btn-primary btn-sm" onclick="markRewardPaid('${report.id}')">💰 Mark Reward Paid</button>
              ` : ''}
              <button class="btn btn-ghost btn-sm" onclick="addViolationNotes('${report.id}')">📝 Add Notes</button>
              <button class="btn btn-ghost btn-sm" onclick="viewProviderHistory('${report.provider_id}')">👤 Provider History</button>
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

      // Suspend the provider
      const suspendProvider = confirm('Violation confirmed. Suspend this provider account?');
      if (suspendProvider && report.provider_id) {
        await supabaseClient
          .from('profiles')
          .update({ role: 'suspended', suspended_at: new Date().toISOString(), suspension_reason: 'Policy violation - circumvention attempt' })
          .eq('id', report.provider_id);
        
        showToast('Provider account suspended', 'success');
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
              <button class="btn btn-secondary btn-sm" onclick="openUserEditModal('${u.id}')">✏️ Edit</button>
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
        return `<span style="background:linear-gradient(135deg,#9b59b6,#8e44ad);color:white;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">👑 Founding Partner</span>`;
      }
      
      const statuses = [];
      if (user.isFoundingMember) statuses.push('Member Founder');
      if (user.isFoundingProvider) statuses.push('Provider Founder');
      
      if (statuses.length === 0) return '<span style="color:var(--text-muted);">None</span>';
      
      return statuses.map(s => {
        if (s === 'Member Founder') {
          return `<span style="background:linear-gradient(135deg,#4a7cff,#6b9fff);color:white;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:500;margin-right:4px;">🌟 ${s}</span>`;
        }
        return `<span style="background:linear-gradient(135deg,#d4a855,#f0d78c);color:#0a0a0f;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:500;">🌟 ${s}</span>`;
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
          <div class="form-section-title">🌟 Member Founder Details</div>
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
              (mfp.payout_details?.transfers_enabled ? '<span class="status-badge approved">💳 Connected</span>' : '<span class="status-badge orange">⏳ Pending</span>') : 
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
          <div class="form-section-title">🔧 Provider Founder Status</div>
          <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--accent-gold-soft);border-radius:var(--radius-md);">
            <span style="font-size:24px;">🌟</span>
            <div>
              <div style="font-weight:600;color:var(--accent-gold);">Founding Provider</div>
              <div style="font-size:0.85rem;color:var(--text-secondary);">This provider is part of the founding program</div>
            </div>
          </div>
        </div>
      ` : '';

      const modalContent = `
        <div class="form-section">
          <div class="form-section-title">👤 Basic Information</div>
          <div class="detail-grid">
            <span class="detail-label">Name:</span><span class="detail-value">${user.full_name || 'Not set'}</span>
            <span class="detail-label">Email:</span><span class="detail-value">${user.email || 'Not set'}</span>
            <span class="detail-label">Phone:</span><span class="detail-value">${user.phone || 'Not set'}</span>
            <span class="detail-label">Joined:</span><span class="detail-value">${new Date(user.created_at).toLocaleString()}</span>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">🔄 Role Management</div>
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
          <div class="form-section-title">🌟 Founder Status</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
            <button class="btn ${user.isFoundingMember ? 'btn-success' : 'btn-secondary'}" onclick="toggleFounderStatus('${user.id}', 'member')">
              ${user.isFoundingMember ? '✓ Member Founder' : 'Make Founding Member'}
            </button>
            <button class="btn ${user.isFoundingProvider ? 'btn-success' : 'btn-secondary'}" onclick="toggleFounderStatus('${user.id}', 'provider')">
              ${user.isFoundingProvider ? '✓ Provider Founder' : 'Make Founding Provider'}
            </button>
          </div>
        </div>

        ${founderSection}
        ${providerFounderSection}

        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">⚙️ Account Actions</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${user.isSuspended ? `
              <button class="btn btn-success" onclick="toggleUserSuspension('${user.id}', false)">✓ Unsuspend Account</button>
              <div style="margin-top:8px;padding:12px;background:var(--accent-red-soft);border-radius:var(--radius-md);width:100%;">
                <div style="color:var(--accent-red);font-weight:600;">🚫 Account Suspended</div>
                <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px;">Reason: ${user.suspension_reason || 'Not specified'}</div>
                ${user.suspended_at ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">Suspended on: ${new Date(user.suspended_at).toLocaleString()}</div>` : ''}
              </div>
            ` : `
              <button class="btn btn-danger" onclick="toggleUserSuspension('${user.id}', true)">🚫 Suspend Account</button>
            `}
          </div>
        </div>
      `;

      document.getElementById('user-edit-modal-body').innerHTML = modalContent;
      document.getElementById('user-edit-modal').classList.add('active');
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

      if (suspend) {
        const reason = prompt('Enter suspension reason:');
        if (!reason) return;

        const { error } = await supabaseClient
          .from('profiles')
          .update({ 
            suspension_reason: reason,
            suspended_at: new Date().toISOString()
          })
          .eq('id', userId);

        if (error) {
          showToast('Failed to suspend user: ' + error.message, 'error');
          return;
        }
        showToast('User suspended', 'success');
      } else {
        if (!confirm('Unsuspend this user?')) return;

        const { error } = await supabaseClient
          .from('profiles')
          .update({ 
            suspension_reason: null,
            suspended_at: null
          })
          .eq('id', userId);

        if (error) {
          showToast('Failed to unsuspend user: ' + error.message, 'error');
          return;
        }
        showToast('User unsuspended', 'success');
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
          <div class="form-section-title">👤 Provider Information</div>
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
            <span class="detail-value">${avgRating ? avgRating.toFixed(1) + ' ⭐' : 'N/A'} (${totalReviews || 0} reviews)</span>
            <span class="detail-label">CAR Status:</span>
            <span class="detail-value"><span class="status-badge ${statusClass}">${statusLabel}</span></span>
          </div>
        </div>
        
        <div class="form-section">
          <div class="form-section-title">⚠️ Complaint Information</div>
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
          <div class="form-section-title">🔍 Root Cause Analysis</div>
          <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);white-space:pre-wrap;line-height:1.6;">
            ${car.root_cause_analysis || 'No root cause analysis provided.'}
          </div>
        </div>
        
        <div class="form-section">
          <div class="form-section-title">✅ Corrective Action Plan</div>
          <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);white-space:pre-wrap;line-height:1.6;">
            ${car.corrective_action_plan || 'No corrective action plan provided.'}
          </div>
        </div>
        
        <div class="form-section">
          <div class="form-section-title">🛡️ Preventative Action</div>
          <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);white-space:pre-wrap;line-height:1.6;">
            ${car.preventative_action || 'No preventative action provided.'}
          </div>
        </div>
        
        ${car.additional_notes ? `
        <div class="form-section">
          <div class="form-section-title">📝 Additional Notes from Provider</div>
          <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);white-space:pre-wrap;line-height:1.6;">
            ${car.additional_notes}
          </div>
        </div>
        ` : ''}
        
        ${car.reviewed_at ? `
        <div class="form-section">
          <div class="form-section-title">📋 Review Information</div>
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
          <div class="form-section-title">📝 Admin Notes</div>
          <textarea class="form-textarea" id="car-admin-notes" placeholder="Add internal notes about this CAR review (optional)..." rows="3"></textarea>
        </div>
        
        <div class="form-section" id="car-rejection-section" style="display:none;border-bottom:none;">
          <div class="form-section-title" style="color:var(--accent-red);">❌ Rejection Reason</div>
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
          <div class="form-section-title">👤 User & Vehicle Information</div>
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
          <div class="form-section-title">📷 Registration Image</div>
          ${v.image_url ? `
            <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);text-align:center;">
              <img src="${v.image_url}" alt="Registration Document" style="max-width:100%;max-height:400px;border-radius:var(--radius-sm);cursor:pointer;" onclick="window.open('${v.image_url}', '_blank')">
              <div style="margin-top:8px;font-size:0.8rem;color:var(--text-muted);">Click image to open in new tab</div>
            </div>
          ` : '<p style="color:var(--text-muted);">No image uploaded</p>'}
        </div>

        <div class="form-section">
          <div class="form-section-title">🔤 Extracted Text (OCR Results)</div>
          <div style="background:var(--bg-input);padding:16px;border-radius:var(--radius-md);max-height:200px;overflow-y:auto;">
            <pre style="font-family:monospace;font-size:0.85rem;white-space:pre-wrap;color:var(--text-primary);margin:0;">${v.extracted_text || 'No text extracted'}</pre>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">🔍 Name Comparison</div>
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
                  <div style="font-weight:600;color:${matchScore >= 80 ? 'var(--accent-green)' : matchScore >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)'}">${matchScore >= 80 ? '✓ Good Match' : matchScore >= 50 ? '⚠️ Partial Match' : '✗ Poor Match'}</div>
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
          <div class="form-section-title">📋 Extracted Details</div>
          <div class="detail-grid">
            <span class="detail-label">VIN:</span>
            <span class="detail-value" style="font-family:monospace;">${v.extracted_vin || 'Not detected'}</span>
            <span class="detail-label">Plate Number:</span>
            <span class="detail-value" style="font-family:monospace;">${v.extracted_plate || 'Not detected'}</span>
          </div>
        </div>

        ${v.status !== 'approved' && v.status !== 'rejected' ? `
        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">📝 Admin Notes</div>
          <textarea class="form-textarea" id="verification-admin-notes" placeholder="Add notes about this verification decision (optional)..." rows="3"></textarea>
        </div>
        ` : ''}

        ${v.admin_notes ? `
        <div class="form-section" style="border-bottom:none;">
          <div class="form-section-title">📝 Previous Admin Notes</div>
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

        const response = await fetch(`/api/registration/verifications/${currentVerification.id}`, {
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

        const response = await fetch(`/api/registration/verifications/${currentVerification.id}`, {
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

    async function logout() { await supabaseClient.auth.signOut(); window.location.href = 'login.html'; }
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
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }
      return { 'Authorization': `Bearer ${session.access_token}` };
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
        const response = await fetch('/api/admin/printful/catalog', { headers });
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
        const response = await fetch(`/api/admin/printful/catalog/${catalogProductId}`, { headers });
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
        const response = await fetch('/api/admin/printful/products', {
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
      btnText.textContent = '⏳ Loading...';
      
      try {
        const authHeaders = await getAdminAuthHeader();
        const response = await fetch('/api/admin/printful/mockup', {
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
        btnText.textContent = '👁️ Preview';
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
        const response = await fetch('/api/admin/printful/store-products', { headers });
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
              ${product.thumbnail ? `<img src="${product.thumbnail}" alt="${product.name}" style="max-width:100%;max-height:100%;object-fit:contain;">` : '<div style="font-size:48px;">📦</div>'}
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
        const response = await fetch(`/api/admin/printful/products/${productId}`, {
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
          progressLog.innerHTML += `<div style="color:var(--accent-orange);">⚠️ Unknown category: ${cat.categoryName}</div>`;
          continue;
        }
        
        progressLog.innerHTML += `<div style="color:var(--text-muted);">📦 Fetching variants for ${cat.categoryName}...</div>`;
        progressLog.scrollTop = progressLog.scrollHeight;
        
        try {
          const headers = await getAdminAuthHeader();
          const response = await fetch(`/api/admin/printful/catalog/${config.productId}`, { headers });
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
            progressLog.innerHTML += `<div style="color:var(--accent-green);">✓ ${cat.categoryName}: ${variantIds.length} variants</div>`;
          } else {
            progressLog.innerHTML += `<div style="color:var(--accent-orange);">⚠️ ${cat.categoryName}: No variants found</div>`;
          }
        } catch (error) {
          progressLog.innerHTML += `<div style="color:var(--accent-red);">✗ ${cat.categoryName}: ${error.message}</div>`;
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
        const response = await fetch('/api/admin/printful/products/bulk', {
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
            progressLog.innerHTML += `<div style="color:var(--accent-green);">✓ Created: ${result.product.name} (${result.product.variants} variants)</div>`;
          } else {
            progressLog.innerHTML += `<div style="color:var(--accent-red);">✗ Failed: ${result.error}</div>`;
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
        progressLog.innerHTML += `<div style="color:var(--accent-red);font-weight:600;">✗ Error: ${error.message}</div>`;
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
        const response = await fetch('/api/admin/designs', { headers });
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
              <button onclick="copyDesignUrl('${design.url}')" style="flex:1;padding:6px;border:none;border-radius:var(--radius-sm);background:var(--accent-blue-soft);color:var(--accent-blue);cursor:pointer;font-size:0.72rem;">📋 Copy URL</button>
              <button onclick="deleteDesign('${encodeURIComponent(design.filename)}')" style="padding:6px 8px;border:none;border-radius:var(--radius-sm);background:var(--accent-red-soft);color:var(--accent-red);cursor:pointer;font-size:0.72rem;">🗑️</button>
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
        
        const response = await fetch('/api/admin/designs/upload', {
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
        const response = await fetch(`/api/admin/designs/${encodedFilename}`, {
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
