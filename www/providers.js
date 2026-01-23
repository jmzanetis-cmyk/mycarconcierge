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

    // Global function for mobile sidebar toggle (needs to be accessible from onclick)
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

    let currentUser = null;
    let providerProfile = null;
    let openPackages = [];
    let myBids = [];
    let myReviews = [];
    let currentBidPackageId = null;
    let currentMessageMemberId = null;
    let currentMessagePackageId = null;
    let myPayments = [];
    
    // GPS Tracking State
    let activeTrackingPackageId = null;
    let trackingWatchId = null;
    let trackingIntervalId = null;
    let lastTrackingPosition = null;
    
    // Emergency State
    let nearbyEmergencies = [];
    let myActiveEmergency = null;
    let providerLocation = null;

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
      try {
        const user = await getCurrentUser();
        if (!user) return window.location.href = 'login.html';
        currentUser = user;

        // Check 2FA authorization before loading dashboard
        const authorized = await checkAccessAuthorization();
        if (!authorized) return;

        const { data: profile, error: profileError } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
        
        // If no profile exists, create one as provider
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

        // Check ToS acceptance before loading dashboard
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
      // Always show switch portal button for easy navigation between portals
      document.getElementById('switch-portal-container').style.display = 'block';

      // Display business name or full name
      const displayName = providerProfile.business_name || providerProfile.full_name || 'Provider';
      document.getElementById('user-name').textContent = displayName;
      document.getElementById('user-email').textContent = user.email;
      document.getElementById('user-avatar').textContent = displayName[0].toUpperCase();

      // Load all data in parallel for faster dashboard loading
      await Promise.all([
        loadOpenPackages(),
        loadMyBids(),
        loadEarnings(),
        loadMyReviews(),
        loadProviderProfile(),
        loadSubscription(),
        loadNotifications(),
        loadPerformance(),
        loadPosIntegrationStatus(),
        loadTeamManagementData(),
        loadLoyaltyNetwork()
      ]);
      
      updateStats();
      setupNav();
      
      // Setup emergency settings
      setupEmergencySettings();
      
      // Load emergency and destination tasks in parallel
      await Promise.all([
        refreshEmergencies(),
        loadDestinationTasks()
      ]);
      
      // Check if returning from Stripe checkout
      checkPurchaseStatus();
      
      // Apply initial filters (includes distance)
      applyFilters();
      
      // Setup realtime updates
      setupRealtimeSubscriptions();
      
      // Initialize push notifications
      initProviderPushNotifications();
    }

    // ========== POS INTEGRATION (CLOVER + SQUARE) ==========
    let cloverConnectionStatus = null;
    let squareConnectionStatus = null;

    async function loadPosIntegrationStatus() {
      await Promise.all([loadCloverStatus(), loadSquareStatus()]);
      await loadAllPosTransactions();
    }

    async function loadCloverStatus() {
      try {
        const response = await fetch(`/api/clover/status/${currentUser.id}`);
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
        const response = await fetch(`/api/pos/connections/${currentUser.id}`);
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

      if (status.connected) {
        statusBadge.className = 'pos-connection-badge connected';
        statusBadge.textContent = 'Connected';
        card.classList.add('connected');
        connectBtn.style.display = 'none';
        disconnectBtn.style.display = 'inline-flex';
        syncBtn.style.display = 'inline-flex';
        connectionInfo.style.display = 'block';
        statsSection.style.display = 'grid';

        document.getElementById('clover-merchant-id').textContent = status.merchant_id || '—';
        document.getElementById('clover-last-sync').textContent = status.last_sync ? new Date(status.last_sync).toLocaleString() : 'Never';
        document.getElementById('clover-environment').textContent = status.environment || 'Production';
        document.getElementById('clover-tx-count').textContent = status.transaction_count || '0';
        document.getElementById('clover-last-sync-display').textContent = status.last_sync ? formatTimeAgo(new Date(status.last_sync)) : '—';

        loadCloverTransactions();
      } else {
        statusBadge.className = 'pos-connection-badge disconnected';
        statusBadge.textContent = 'Not Connected';
        card.classList.remove('connected');
        connectBtn.style.display = 'inline-flex';
        disconnectBtn.style.display = 'none';
        syncBtn.style.display = 'none';
        connectionInfo.style.display = 'none';
        statsSection.style.display = 'none';
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

      if (status.connected) {
        statusBadge.className = 'pos-connection-badge connected';
        statusBadge.textContent = 'Connected';
        card.classList.add('connected');
        connectBtn.style.display = 'none';
        disconnectBtn.style.display = 'inline-flex';
        syncBtn.style.display = 'inline-flex';
        connectionInfo.style.display = 'block';
        statsSection.style.display = 'grid';

        document.getElementById('square-merchant-id').textContent = status.merchant_id || '—';
        document.getElementById('square-last-sync').textContent = status.last_synced_at ? new Date(status.last_synced_at).toLocaleString() : 'Never';
        document.getElementById('square-location').textContent = status.location_id || '—';
        document.getElementById('square-tx-count').textContent = status.transaction_count || '0';
        document.getElementById('square-last-sync-display').textContent = status.last_synced_at ? formatTimeAgo(new Date(status.last_synced_at)) : '—';
      } else {
        statusBadge.className = 'pos-connection-badge disconnected';
        statusBadge.textContent = 'Not Connected';
        card.classList.remove('connected');
        connectBtn.style.display = 'inline-flex';
        disconnectBtn.style.display = 'none';
        syncBtn.style.display = 'none';
        connectionInfo.style.display = 'none';
        statsSection.style.display = 'none';
      }
    }

    function formatTimeAgo(date) {
      const now = new Date();
      const diff = Math.floor((now - date) / 1000);
      if (diff < 60) return 'Just now';
      if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
      return Math.floor(diff / 86400) + 'd ago';
    }

    async function connectClover() {
      try {
        const connectBtn = document.getElementById('clover-connect-btn');
        connectBtn.disabled = true;
        connectBtn.innerHTML = '<span class="clover-sync-spinner"></span> Connecting...';

        const response = await fetch('/api/clover/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider_id: currentUser.id })
        });
        
        const data = await response.json();
        
        if (data.redirect_url) {
          window.location.href = data.redirect_url;
        } else if (data.success) {
          showToast('🍀 Clover connected successfully!', 'success');
          await loadCloverStatus();
        } else {
          throw new Error(data.error || 'Failed to connect Clover');
        }
      } catch (error) {
        console.error('Connect Clover error:', error);
        showToast('Failed to connect Clover: ' + error.message, 'error');
      } finally {
        const connectBtn = document.getElementById('clover-connect-btn');
        connectBtn.disabled = false;
        connectBtn.innerHTML = '🔗 Connect Clover Account';
      }
    }

    async function disconnectClover() {
      if (!confirm('Are you sure you want to disconnect your Clover account? Your synced transactions will be preserved.')) {
        return;
      }

      try {
        const disconnectBtn = document.getElementById('clover-disconnect-btn');
        disconnectBtn.disabled = true;
        disconnectBtn.innerHTML = '<span class="clover-sync-spinner"></span> Disconnecting...';

        const response = await fetch('/api/clover/disconnect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider_id: currentUser.id })
        });
        
        const data = await response.json();
        
        if (data.success) {
          showToast('Clover disconnected', 'success');
          await loadCloverStatus();
        } else {
          throw new Error(data.error || 'Failed to disconnect Clover');
        }
      } catch (error) {
        console.error('Disconnect Clover error:', error);
        showToast('Failed to disconnect: ' + error.message, 'error');
      } finally {
        const disconnectBtn = document.getElementById('clover-disconnect-btn');
        disconnectBtn.disabled = false;
        disconnectBtn.innerHTML = '❌ Disconnect';
      }
    }

    async function syncClover() {
      try {
        const syncBtn = document.getElementById('clover-sync-btn');
        syncBtn.disabled = true;
        syncBtn.innerHTML = '<span class="clover-sync-spinner"></span> Syncing...';

        const response = await fetch(`/api/clover/sync/${currentUser.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.success) {
          showToast(`🍀 Synced ${data.transactions_count || 0} transactions!`, 'success');
          document.getElementById('clover-last-sync').textContent = new Date().toLocaleString();
          document.getElementById('clover-last-sync-display').textContent = 'Just now';
          await loadCloverTransactions();
        } else {
          throw new Error(data.error || 'Failed to sync Clover');
        }
      } catch (error) {
        console.error('Sync Clover error:', error);
        showToast('Sync failed: ' + error.message, 'error');
      } finally {
        const syncBtn = document.getElementById('clover-sync-btn');
        syncBtn.disabled = false;
        syncBtn.innerHTML = '🔄 Sync Now';
      }
    }

    async function loadCloverTransactions() {
      try {
        const response = await fetch(`/api/clover/transactions/${currentUser.id}?limit=100`);
        const data = await response.json();
        
        const txCount = data.transactions?.length || data.total_count || 0;
        const txCountEl = document.getElementById('clover-tx-count');
        if (txCountEl) {
          txCountEl.textContent = txCount.toString();
        }
        
        await loadAllPosTransactions();
      } catch (error) {
        console.log('Load Clover transactions error:', error.message);
      }
    }

    function showAllCloverTransactions() {
      showSection('pos-analytics');
      showToast('View Clover transactions in POS Analytics', 'success');
    }

    // ========== SQUARE POS INTEGRATION ==========
    async function connectSquare() {
      try {
        const connectBtn = document.getElementById('square-connect-btn');
        connectBtn.disabled = true;
        connectBtn.innerHTML = '<span class="pos-sync-spinner"></span> Connecting...';

        const response = await fetch('/api/square/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider_id: currentUser.id })
        });
        
        const data = await response.json();
        
        if (data.redirect_url || data.authorization_url) {
          window.location.href = data.redirect_url || data.authorization_url;
        } else if (data.success) {
          showToast('⬛ Square connected successfully!', 'success');
          await loadSquareStatus();
        } else {
          throw new Error(data.error || 'Failed to connect Square');
        }
      } catch (error) {
        console.error('Connect Square error:', error);
        showToast('Failed to connect Square: ' + error.message, 'error');
      } finally {
        const connectBtn = document.getElementById('square-connect-btn');
        connectBtn.disabled = false;
        connectBtn.innerHTML = '🔗 Connect Square';
      }
    }

    async function disconnectSquare() {
      if (!confirm('Are you sure you want to disconnect your Square account? Your synced transactions will be preserved.')) {
        return;
      }

      try {
        const disconnectBtn = document.getElementById('square-disconnect-btn');
        disconnectBtn.disabled = true;
        disconnectBtn.innerHTML = '<span class="pos-sync-spinner"></span> Disconnecting...';

        const response = await fetch('/api/square/disconnect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider_id: currentUser.id })
        });
        
        const data = await response.json();
        
        if (data.success) {
          showToast('Square disconnected', 'success');
          await loadSquareStatus();
          await loadAllPosTransactions();
        } else {
          throw new Error(data.error || 'Failed to disconnect Square');
        }
      } catch (error) {
        console.error('Disconnect Square error:', error);
        showToast('Failed to disconnect: ' + error.message, 'error');
      } finally {
        const disconnectBtn = document.getElementById('square-disconnect-btn');
        disconnectBtn.disabled = false;
        disconnectBtn.innerHTML = '❌ Disconnect';
      }
    }

    async function syncSquareTransactions() {
      try {
        const syncBtn = document.getElementById('square-sync-btn');
        syncBtn.disabled = true;
        syncBtn.innerHTML = '<span class="pos-sync-spinner"></span> Syncing...';

        const response = await fetch(`/api/square/sync/${currentUser.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.success) {
          showToast(`⬛ Synced ${data.transactions_count || data.synced_count || 0} transactions!`, 'success');
          document.getElementById('square-last-sync').textContent = new Date().toLocaleString();
          document.getElementById('square-last-sync-display').textContent = 'Just now';
          await loadAllPosTransactions();
        } else {
          throw new Error(data.error || 'Failed to sync Square');
        }
      } catch (error) {
        console.error('Sync Square error:', error);
        showToast('Sync failed: ' + error.message, 'error');
      } finally {
        const syncBtn = document.getElementById('square-sync-btn');
        syncBtn.disabled = false;
        syncBtn.innerHTML = '🔄 Sync Now';
      }
    }

    // ========== ALL POS TRANSACTIONS ==========
    async function loadAllPosTransactions() {
      try {
        const response = await fetch(`/api/pos/transactions/${currentUser.id}?limit=10`);
        const data = await response.json();
        
        const tbody = document.getElementById('all-pos-transactions-body');
        
        if (!data.transactions || data.transactions.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">Connect a POS system to see transactions</td></tr>';
          return;
        }

        tbody.innerHTML = data.transactions.map(tx => {
          const date = new Date(tx.created_at || tx.timestamp || tx.transaction_date).toLocaleDateString();
          const amount = typeof tx.amount === 'number' ? (tx.amount / 100).toFixed(2) : parseFloat(tx.amount || 0).toFixed(2);
          const card = tx.card_last_four ? `•••• ${tx.card_last_four}` : '—';
          const statusClass = tx.status === 'success' || tx.status === 'completed' ? 'status-success' : tx.status === 'pending' ? 'status-pending' : 'status-failed';
          const source = tx.pos_provider || tx.source || 'unknown';
          const sourceClass = source.toLowerCase();
          
          return `
            <tr>
              <td>${date}</td>
              <td><span class="pos-tx-source-badge ${sourceClass}">${source === 'clover' ? '🍀' : '⬛'} ${source.charAt(0).toUpperCase() + source.slice(1)}</span></td>
              <td class="amount">$${amount}</td>
              <td>${card}</td>
              <td class="${statusClass}">${tx.status || 'completed'}</td>
            </tr>
          `;
        }).join('');
      } catch (error) {
        console.log('Load all POS transactions error:', error.message);
        const tbody = document.getElementById('all-pos-transactions-body');
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">Connect a POS system to see transactions</td></tr>';
      }
    }

    // ========== REALTIME SUBSCRIPTIONS ==========
    let realtimeChannel = null;

    function setupRealtimeSubscriptions() {
      realtimeChannel = supabaseClient.channel('provider-updates')
        
        // New packages posted (for browse)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'maintenance_packages'
        }, async (payload) => {
          if (payload.new.status === 'open') {
            console.log('[REALTIME] New package posted:', payload.new);
            showToast('📦 New package available!', 'success');
            await loadOpenPackages();
            applyFilters();
          }
        })

        // Bid status changes (accepted/rejected)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'bids',
          filter: `provider_id=eq.${currentUser.id}`
        }, async (payload) => {
          console.log('[REALTIME] Bid updated:', payload.new);
          if (payload.old.status !== payload.new.status) {
            if (payload.new.status === 'accepted') {
              showToast('🎉 Your bid was accepted!', 'success');
            } else if (payload.new.status === 'rejected') {
              showToast('Your bid was not selected', 'success');
            }
            await loadMyBids();
            updateStats();
          }
        })

        // New messages
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${currentUser.id}`
        }, async (payload) => {
          console.log('[REALTIME] New message:', payload.new);
          showToast('💬 New message from member!', 'success');
          
          // If message modal is open, add message
          if (document.getElementById('message-modal').classList.contains('active')) {
            const msgThread = document.getElementById('message-thread');
            const newMsg = payload.new;
            const msgHtml = `
              <div class="message received">
                <div class="message-bubble">${newMsg.content}</div>
                <div class="message-time">${new Date(newMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            `;
            msgThread.insertAdjacentHTML('beforeend', msgHtml);
            msgThread.scrollTop = msgThread.scrollHeight;
          }
        })

        // New notifications
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUser.id}`
        }, async (payload) => {
          console.log('[REALTIME] New notification:', payload.new);
          await loadNotifications();
        })

        // New reviews
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'provider_reviews',
          filter: `provider_id=eq.${currentUser.id}`
        }, async (payload) => {
          console.log('[REALTIME] New review:', payload.new);
          showToast('⭐ You received a new review!', 'success');
          await loadMyReviews();
        })

        // Payment released
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'payments',
          filter: `provider_id=eq.${currentUser.id}`
        }, async (payload) => {
          if (payload.new.status === 'released' && payload.old.status !== 'released') {
            console.log('[REALTIME] Payment released:', payload.new);
            showToast('💰 Payment released to your account!', 'success');
            await loadEarnings();
          }
        })

        .subscribe((status) => {
          console.log('[REALTIME] Subscription status:', status);
          updateRealtimeStatus(status);
        });
    }

    function updateRealtimeStatus(status) {
      const dot = document.getElementById('realtime-dot');
      const text = document.getElementById('realtime-text');
      
      if (status === 'SUBSCRIBED') {
        dot.style.background = 'var(--accent-green)';
        text.textContent = 'Live updates on';
      } else if (status === 'CHANNEL_ERROR') {
        dot.style.background = 'var(--accent-red)';
        text.textContent = 'Connection error';
      } else if (status === 'CLOSED') {
        dot.style.background = 'var(--text-muted)';
        text.textContent = 'Disconnected';
      } else {
        dot.style.background = 'var(--accent-orange)';
        text.textContent = 'Connecting...';
      }
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      if (realtimeChannel) {
        supabaseClient.removeChannel(realtimeChannel);
      }
    });

    // ========== REVIEWS ==========
    
    // Complaint reason code to human-readable label mapping
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

    function getComplaintLabel(reasonCode) {
      return COMPLAINT_REASON_LABELS[reasonCode] || reasonCode || 'Unknown';
    }

    async function loadMyReviews() {
      const { data } = await supabaseClient.from('provider_reviews')
        .select('*')
        .eq('provider_id', currentUser.id)
        .eq('status', 'published')
        .order('created_at', { ascending: false });
      myReviews = data || [];
      
      const suspensionStatus = await isProviderSuspended(currentUser.id);
      
      // Fetch CAR-related data from provider_stats
      const { data: providerStats } = await supabaseClient
        .from('provider_stats')
        .select('car_required, car_id, car_submitted_at, primary_complaint_reason, complaint_counts')
        .eq('provider_id', currentUser.id)
        .single();
      
      if (suspensionStatus.data) {
        const { suspended, reason, suspended_at, current_rating } = suspensionStatus.data;
        
        const suspensionAlert = document.getElementById('suspension-alert');
        const ratingWarning = document.getElementById('rating-warning');
        const carFormContainer = document.getElementById('car-form-container');
        const carSubmittedStatus = document.getElementById('car-submitted-status');
        
        if (suspended) {
          suspensionAlert.style.display = 'block';
          document.getElementById('suspension-reason').textContent = reason || 'Your average rating has dropped below 3 stars.';
          if (suspended_at) {
            document.getElementById('suspension-date').textContent = 'Suspended on: ' + new Date(suspended_at).toLocaleDateString();
          }
          ratingWarning.style.display = 'none';
          
          // Check if CAR is required and handle CAR display
          if (providerStats && providerStats.car_required) {
            if (providerStats.car_submitted_at) {
              // CAR already submitted - show status
              carFormContainer.style.display = 'none';
              carSubmittedStatus.style.display = 'block';
              document.getElementById('car-submitted-date').textContent = 
                'Submitted on: ' + new Date(providerStats.car_submitted_at).toLocaleDateString();
            } else {
              // CAR required but not submitted - show form
              carFormContainer.style.display = 'block';
              carSubmittedStatus.style.display = 'none';
              
              // Display primary complaint reason
              const primaryReason = providerStats.primary_complaint_reason;
              document.getElementById('car-complaint-label').textContent = getComplaintLabel(primaryReason);
              
              // Display complaint breakdown if available
              const complaintCounts = providerStats.complaint_counts;
              if (complaintCounts && Object.keys(complaintCounts).length > 0) {
                document.getElementById('car-complaint-breakdown').style.display = 'block';
                const breakdownList = document.getElementById('car-breakdown-list');
                breakdownList.innerHTML = Object.entries(complaintCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([code, count]) => `
                    <div style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:100px;font-size:0.82rem;">
                      <span style="color:var(--text-secondary);">${getComplaintLabel(code)}</span>
                      <span style="background:rgba(239,95,95,0.2);color:var(--accent-red);padding:2px 8px;border-radius:100px;font-weight:500;">${count}</span>
                    </div>
                  `).join('');
              }
            }
          } else {
            carFormContainer.style.display = 'none';
            carSubmittedStatus.style.display = 'none';
          }
        } else {
          suspensionAlert.style.display = 'none';
          carFormContainer.style.display = 'none';
          carSubmittedStatus.style.display = 'none';
          const avgRating = parseFloat(current_rating) || 0;
          const reviewCount = myReviews.length;
          if (avgRating >= 3.0 && avgRating < 3.5 && reviewCount >= 2) {
            ratingWarning.style.display = 'block';
          } else {
            ratingWarning.style.display = 'none';
          }
        }
      }
      
      renderReviews();
    }
    
    async function submitCAR(event) {
      event.preventDefault();
      
      const rootCause = document.getElementById('car-root-cause').value.trim();
      const correctiveAction = document.getElementById('car-corrective-action').value.trim();
      const preventativeAction = document.getElementById('car-preventative-action').value.trim();
      const additionalNotes = document.getElementById('car-additional-notes').value.trim();
      
      if (!rootCause || !correctiveAction || !preventativeAction) {
        showToast('Please fill in all required fields.', 'error');
        return;
      }
      
      const submitBtn = document.getElementById('car-submit-btn');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>⏳</span> Submitting...';
      
      try {
        const { data, error } = await supabaseClient.rpc('submit_corrective_action', {
          p_provider_id: currentUser.id,
          p_root_cause: rootCause,
          p_corrective_action: correctiveAction,
          p_preventative_action: preventativeAction,
          p_additional_notes: additionalNotes || null
        });
        
        if (error) {
          console.error('CAR submission error:', error);
          showToast('Failed to submit CAR: ' + error.message, 'error');
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>📤</span> Submit Corrective Action Response';
          return;
        }
        
        showToast('Corrective Action Response submitted successfully!', 'success');
        
        // Update UI to show submitted status
        document.getElementById('car-form-container').style.display = 'none';
        document.getElementById('car-submitted-status').style.display = 'block';
        document.getElementById('car-submitted-date').textContent = 
          'Submitted on: ' + new Date().toLocaleDateString();
        
        // Clear form
        document.getElementById('car-form').reset();
        
      } catch (err) {
        console.error('CAR submission exception:', err);
        showToast('An error occurred while submitting. Please try again.', 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>📤</span> Submit Corrective Action Response';
      }
    }

    function renderReviews() {
      // Calculate stats
      const totalReviews = myReviews.length;
      const avgRating = totalReviews ? (myReviews.reduce((sum, r) => sum + r.overall_rating, 0) / totalReviews).toFixed(1) : '--';
      const fiveStarCount = myReviews.filter(r => r.overall_rating === 5).length;
      const fiveStarRate = totalReviews ? Math.round((fiveStarCount / totalReviews) * 100) : 0;

      // Update dashboard stat
      document.getElementById('stat-rating').textContent = avgRating;
      document.getElementById('stat-review-count').textContent = `(${totalReviews} reviews)`;

      // Update reviews section stats
      document.getElementById('reviews-avg-rating').textContent = avgRating;
      document.getElementById('reviews-total-count').textContent = totalReviews;
      document.getElementById('reviews-5-star').textContent = fiveStarRate + '%';

      // Calculate category breakdowns
      if (totalReviews > 0) {
        const avgQuality = (myReviews.reduce((sum, r) => sum + (r.quality_rating || 5), 0) / totalReviews).toFixed(1);
        const avgCommunication = (myReviews.reduce((sum, r) => sum + (r.communication_rating || 5), 0) / totalReviews).toFixed(1);
        const avgTimeliness = (myReviews.reduce((sum, r) => sum + (r.timeliness_rating || 5), 0) / totalReviews).toFixed(1);
        const avgValue = (myReviews.reduce((sum, r) => sum + (r.value_rating || 5), 0) / totalReviews).toFixed(1);

        document.getElementById('breakdown-quality').textContent = avgQuality + ' ⭐';
        document.getElementById('breakdown-communication').textContent = avgCommunication + ' ⭐';
        document.getElementById('breakdown-timeliness').textContent = avgTimeliness + ' ⭐';
        document.getElementById('breakdown-value').textContent = avgValue + ' ⭐';
      }

      // Render reviews list
      const container = document.getElementById('reviews-list');
      if (!myReviews.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⭐</div><p>No reviews yet. Complete jobs to receive reviews!</p></div>';
        return;
      }

      container.innerHTML = myReviews.map(r => `
        <div style="padding:20px 0;border-bottom:1px solid var(--border-subtle);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
            <div>
              <div style="color:var(--accent-gold);font-size:1.1rem;margin-bottom:4px;">
                ${'★'.repeat(r.overall_rating)}${'☆'.repeat(5 - r.overall_rating)}
              </div>
              ${r.review_title ? `<strong style="font-size:1rem;">${r.review_title}</strong>` : ''}
            </div>
            <div style="text-align:right;font-size:0.85rem;color:var(--text-muted);">
              ${new Date(r.created_at).toLocaleDateString()}
              ${r.verified_purchase ? '<span style="color:var(--accent-green);margin-left:8px;">✓ Verified</span>' : ''}
            </div>
          </div>
          ${r.review_text ? `<p style="color:var(--text-secondary);margin-bottom:12px;">${r.review_text}</p>` : ''}
          <div style="font-size:0.85rem;color:var(--text-muted);">
            ${r.service_type ? `<span style="margin-right:16px;">🔧 ${r.service_type}</span>` : ''}
            ${r.vehicle_info ? `<span style="margin-right:16px;">🚗 ${r.vehicle_info}</span>` : ''}
            ${r.amount_paid ? `<span>💰 $${r.amount_paid.toFixed(2)}</span>` : ''}
          </div>
          ${r.provider_response ? `
            <div style="margin-top:16px;padding:12px 16px;background:var(--bg-input);border-radius:var(--radius-md);border-left:3px solid var(--accent-gold);">
              <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:4px;">Your Response:</div>
              <p style="margin:0;">${r.provider_response}</p>
            </div>
          ` : `
            <button class="btn btn-ghost btn-sm" style="margin-top:12px;" onclick="respondToReview('${r.id}')">💬 Respond to Review</button>
          `}
        </div>
      `).join('');
    }

    async function respondToReview(reviewId) {
      const response = prompt('Your response to this review:');
      if (!response) return;

      await supabaseClient.from('provider_reviews').update({
        provider_response: response,
        provider_responded_at: new Date().toISOString()
      }).eq('id', reviewId);

      showToast('Response submitted!', 'success');
      await loadMyReviews();
    }

    // ========== PERFORMANCE SCORING ==========
    let myPerformance = null;

    function getTierIcon(tier) {
      return {'platinum': '💎', 'gold': '🥇', 'silver': '🥈', 'bronze': '🥉'}[tier] || '🥉';
    }

    function getTierLabel(tier) {
      return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Bronze';
    }

    function generateStarsHtml(rating) {
      const fullStars = Math.floor(rating);
      const halfStar = rating % 1 >= 0.5 ? 1 : 0;
      const emptyStars = 5 - fullStars - halfStar;
      return '★'.repeat(fullStars) + (halfStar ? '½' : '') + '☆'.repeat(emptyStars);
    }

    function formatResponseTime(hours) {
      if (!hours && hours !== 0) return '--';
      if (hours < 1) return `${Math.round(hours * 60)}min`;
      if (hours < 24) return `${Math.round(hours)}hr`;
      return `${Math.round(hours / 24)}d`;
    }

    function getPerformanceTips(perf) {
      const tips = [];
      if (!perf) {
        tips.push({ icon: '💡', text: 'Start bidding on packages to build your performance record and earn badges!' });
        return tips;
      }
      if (perf.jobs_completed < 5) {
        tips.push({ icon: '🚀', text: 'Complete more jobs to improve your experience score. Each completed job boosts your overall rating!' });
      }
      if (perf.rating_avg && perf.rating_avg < 4.5) {
        tips.push({ icon: '⭐', text: 'Focus on quality service to improve your rating. Aim for 4.8+ to earn the Top Rated badge!' });
      }
      if (perf.avg_response_time_hours && perf.avg_response_time_hours > 2) {
        tips.push({ icon: '⚡', text: 'Respond to bid requests faster! Under 2 hours average earns you the Quick Responder badge.' });
      }
      if (perf.on_time_rate && perf.on_time_rate < 90) {
        tips.push({ icon: '⏰', text: 'Improve your on-time completion rate. Reliable providers earn more repeat customers!' });
      }
      if (perf.acceptance_rate && perf.acceptance_rate < 30) {
        tips.push({ icon: '📝', text: 'Your bid acceptance rate is low. Try competitive pricing or highlight your specialties.' });
      }
      if (tips.length === 0) {
        tips.push({ icon: '🎉', text: 'Great job! Keep up the excellent work to maintain your performance tier.' });
      }
      return tips;
    }

    async function loadPerformance() {
      try {
        // First, try to get existing performance data
        const { data: existing } = await getProviderPerformance(currentUser.id);
        
        if (existing) {
          myPerformance = existing;
        } else {
          // Calculate and create performance data
          const { data: calculated } = await calculateProviderPerformance(currentUser.id);
          myPerformance = calculated;
        }
        
        renderPerformance();
      } catch (err) {
        console.error('Error loading performance:', err);
        renderPerformance();
      }
    }

    async function refreshPerformance() {
      showToast('Calculating performance...', 'success');
      const { data, error } = await calculateProviderPerformance(currentUser.id);
      if (error) {
        console.error('Error calculating performance:', error);
        showToast('Error updating performance', 'error');
        return;
      }
      myPerformance = data;
      renderPerformance();
      showToast('Performance updated!', 'success');
    }

    function renderPerformance() {
      const perf = myPerformance;
      
      // Overall Score
      const scoreEl = document.getElementById('perf-overall-score');
      scoreEl.textContent = perf ? Math.round(perf.overall_score) : '--';
      
      // Tier badge
      const tier = perf?.tier || 'bronze';
      const tierBadge = document.getElementById('perf-tier-badge');
      tierBadge.className = `performance-tier-badge ${tier}`;
      tierBadge.querySelector('span:first-child').textContent = getTierIcon(tier);
      document.getElementById('perf-tier-text').textContent = getTierLabel(tier);
      
      // Update score display border based on tier
      const scoreDisplay = document.getElementById('perf-score-display');
      const tierColors = {
        platinum: '#e5e4e2',
        gold: 'var(--accent-gold)',
        silver: '#c0c0c0',
        bronze: '#cd7f32'
      };
      scoreDisplay.style.borderColor = tierColors[tier] || tierColors.bronze;
      document.getElementById('perf-overall-score').style.color = tierColors[tier] || tierColors.bronze;
      
      // Metrics
      if (perf) {
        document.getElementById('perf-rating').textContent = perf.rating_avg ? perf.rating_avg.toFixed(1) : '--';
        document.getElementById('perf-stars').innerHTML = perf.rating_avg ? generateStarsHtml(perf.rating_avg) : '';
        document.getElementById('perf-jobs-completed').textContent = perf.jobs_completed || 0;
        document.getElementById('perf-on-time').textContent = perf.jobs_completed > 0 ? `${Math.round(perf.on_time_rate)}%` : '--';
        document.getElementById('perf-response-time').textContent = formatResponseTime(perf.avg_response_time_hours);
        document.getElementById('perf-acceptance-rate').textContent = perf.bids_submitted > 0 ? `${Math.round(perf.acceptance_rate)}%` : '--';
        document.getElementById('perf-bids-submitted').textContent = perf.bids_submitted || 0;
      }
      
      // Badges
      const badges = perf?.badges || [];
      document.querySelectorAll('#perf-badges-grid .performance-badge').forEach(badgeEl => {
        const badgeName = badgeEl.dataset.badge;
        if (badges.includes(badgeName)) {
          badgeEl.classList.add('earned');
          badgeEl.classList.remove('locked');
        } else {
          badgeEl.classList.remove('earned');
          badgeEl.classList.add('locked');
        }
      });
      
      // Performance Tips
      const tips = getPerformanceTips(perf);
      const tipsContainer = document.getElementById('perf-tips');
      tipsContainer.innerHTML = tips.map(tip => `
        <div class="performance-tip">
          <span class="performance-tip-icon">${tip.icon}</span>
          <div class="performance-tip-text">${tip.text}</div>
        </div>
      `).join('');
    }

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
      const total = myPayments.filter(p => p.status === 'released').reduce((sum, p) => sum + (p.amount_provider || 0), 0);

      document.getElementById('earnings-pending').textContent = '$' + pending.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
      document.getElementById('earnings-released').textContent = '$' + released.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
      document.getElementById('earnings-total').textContent = '$' + total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

      const container = document.getElementById('earnings-list');
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

    function setupNav() {
      document.querySelectorAll('.nav-item[data-section]').forEach(item => {
        item.addEventListener('click', () => showSection(item.dataset.section));
      });
    }

    function showSection(id) {
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById(id).classList.add('active');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelector(`.nav-item[data-section="${id}"]`)?.classList.add('active');
      document.getElementById('sidebar').classList.remove('open');
      
      // Load team members and background checks when team section is shown
      if (id === 'team') {
        loadTeamMembers();
        loadBackgroundCheckStatus();
      }
      // Load team management data when team-section is shown
      if (id === 'team-section') {
        loadTeamManagementData();
      }
      // Load earnings analytics when section is shown
      if (id === 'earnings-analytics') {
        initEarningsAnalytics();
        initAdvancedAnalytics();
      }
      // Load referral section when shown
      if (id === 'refer-providers') {
        loadReferralSection();
      }
      // Load POS analytics when section is shown
      if (id === 'pos-analytics') {
        loadPosAnalytics();
      }
    }

    async function loadOpenPackages() {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          console.error('No session for loading packages');
          openPackages = [];
          renderOpenPackages();
          renderRecentPackages();
          return;
        }
        
        const response = await fetch('/api/provider/packages', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('Error loading packages:', errorData.error || response.statusText);
          openPackages = [];
        } else {
          const result = await response.json();
          openPackages = result.packages || [];
        }
        
        // Show location warning if provider hasn't set their ZIP
        const locationWarning = document.getElementById('location-warning');
        if (!providerProfile?.zip_code) {
          locationWarning.style.display = 'block';
        } else {
          locationWarning.style.display = 'none';
        }
        
        renderOpenPackages();
        renderRecentPackages();
        document.getElementById('open-count').textContent = openPackages.length;
      } catch (err) {
        console.error('loadOpenPackages error:', err);
        openPackages = [];
        renderOpenPackages();
      }
    }

    async function loadMyBids() {
      try {
        const { data, error } = await supabaseClient.from('bids').select('*, maintenance_packages(title, status, member_id, vehicles(year, make, model))').eq('provider_id', currentUser.id).order('created_at', { ascending: false });
        if (error) {
          console.error('Error loading bids:', error);
          myBids = [];
        } else {
          myBids = data || [];
        }
        renderMyBids();
        renderActiveJobs();
      } catch (err) {
        console.error('loadMyBids error:', err);
        myBids = [];
        renderMyBids();
      }
    }

    function updateStats() {
      document.getElementById('stat-open').textContent = openPackages.length;
      document.getElementById('stat-bids').textContent = myBids.filter(b => b.status === 'pending').length;
      document.getElementById('stat-won').textContent = myBids.filter(b => b.status === 'accepted').length;
      
      // Update bid credits display
      const totalCredits = (providerProfile?.bid_credits || 0) + (providerProfile?.free_trial_bids || 0);
      document.getElementById('stat-credits').textContent = totalCredits;
      document.getElementById('dashboard-bid-credits').textContent = totalCredits;
      document.getElementById('browse-credits-count').textContent = totalCredits;
      
      // Update members nearby count (estimate based on open packages)
      const uniqueMembers = new Set(openPackages.map(p => p.member_id)).size;
      document.getElementById('stat-members-nearby').textContent = uniqueMembers;
    }

    function renderOpenPackages(filtered = null) {
      const container = document.getElementById('open-packages');
      const packagesToRender = filtered || openPackages;
      
      if (!packagesToRender.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📦</div><p>No packages match your filters. Try adjusting your criteria.</p></div>';
        document.getElementById('filter-results-info').textContent = '';
        return;
      }
      
      // Update results info
      if (filtered && filtered.length !== openPackages.length) {
        document.getElementById('filter-results-info').textContent = `Showing ${filtered.length} of ${openPackages.length} packages`;
      } else {
        document.getElementById('filter-results-info').textContent = `${packagesToRender.length} open packages`;
      }
      
      container.innerHTML = packagesToRender.map(p => renderPackageCard(p, true)).join('');
    }

    function applyFilters() {
      const distance = document.getElementById('filter-distance').value;
      const category = document.getElementById('filter-category').value;
      const urgency = document.getElementById('filter-urgency').value;
      const parts = document.getElementById('filter-parts').value;
      const sort = document.getElementById('filter-sort').value;

      let filtered = [...openPackages];

      // Filter by distance (requires both provider and member ZIP codes)
      if (distance && providerProfile?.zip_code) {
        filtered = filtered.filter(p => {
          if (!p.member_zip) return true; // Show packages without location (legacy)
          const dist = estimateZipDistance(providerProfile.zip_code, p.member_zip);
          p._estimatedDistance = dist; // Store for display and sorting
          return dist <= parseInt(distance);
        });
      } else {
        // Calculate distance for display even if not filtering
        filtered.forEach(p => {
          if (p.member_zip && providerProfile?.zip_code) {
            p._estimatedDistance = estimateZipDistance(providerProfile.zip_code, p.member_zip);
          }
        });
      }

      // Filter by category
      if (category) {
        filtered = filtered.filter(p => p.category === category);
      }

      // Filter by urgency (time until deadline)
      if (urgency) {
        const now = new Date();
        filtered = filtered.filter(p => {
          if (!p.bidding_deadline) return urgency === 'flexible';
          const deadline = new Date(p.bidding_deadline);
          const hoursLeft = (deadline - now) / (1000 * 60 * 60);
          
          if (urgency === 'urgent') return hoursLeft > 0 && hoursLeft <= 24;
          if (urgency === 'soon') return hoursLeft > 0 && hoursLeft <= 72;
          if (urgency === 'flexible') return hoursLeft > 72;
          return true;
        });
      }

      // Filter by parts preference
      if (parts) {
        filtered = filtered.filter(p => p.parts_preference === parts);
      }

      // Filter by service type (destination vs standard)
      if (currentServiceTypeFilter === 'destination') {
        filtered = filtered.filter(p => isDestinationPackage(p));
      } else if (currentServiceTypeFilter === 'standard') {
        filtered = filtered.filter(p => !isDestinationPackage(p));
      }

      // Sort
      if (sort === 'nearest') {
        filtered.sort((a, b) => (a._estimatedDistance || 999) - (b._estimatedDistance || 999));
      } else if (sort === 'newest') {
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      } else if (sort === 'oldest') {
        filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      } else if (sort === 'ending') {
        filtered.sort((a, b) => {
          const aDeadline = a.bidding_deadline ? new Date(a.bidding_deadline) : new Date('2099-12-31');
          const bDeadline = b.bidding_deadline ? new Date(b.bidding_deadline) : new Date('2099-12-31');
          return aDeadline - bDeadline;
        });
      }

      renderOpenPackages(filtered);
    }

    // Simple ZIP code distance estimator (uses first 3 digits for rough region)
    // For production, use a proper ZIP code database or API
    function estimateZipDistance(zip1, zip2) {
      if (!zip1 || !zip2) return 999;
      
      // Same ZIP = 0 miles
      if (zip1 === zip2) return 0;
      
      // Same first 3 digits = roughly same area (0-25 miles)
      if (zip1.substring(0, 3) === zip2.substring(0, 3)) {
        return Math.abs(parseInt(zip1) - parseInt(zip2)) * 0.5; // Rough estimate
      }
      
      // Different first 3 digits - use a rough approximation based on ZIP difference
      const diff = Math.abs(parseInt(zip1.substring(0, 3)) - parseInt(zip2.substring(0, 3)));
      
      // Very rough estimate: each ZIP prefix represents ~20-50 miles
      if (diff <= 2) return 15 + (diff * 10);
      if (diff <= 5) return 30 + (diff * 8);
      if (diff <= 10) return 50 + (diff * 5);
      return 100 + (diff * 3);
    }

    function clearFilters() {
      document.getElementById('filter-distance').value = '';
      document.getElementById('filter-category').value = '';
      document.getElementById('filter-urgency').value = '';
      document.getElementById('filter-parts').value = '';
      document.getElementById('filter-sort').value = 'nearest';
      // Reset service type filter
      document.querySelectorAll('.service-type-filter').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.serviceType === 'all') btn.classList.add('active');
      });
      currentServiceTypeFilter = 'all';
      applyFilters();
    }

    let currentServiceTypeFilter = 'all';

    function filterByServiceType(type) {
      currentServiceTypeFilter = type;
      document.querySelectorAll('.service-type-filter').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.serviceType === type) btn.classList.add('active');
      });
      applyFilters();
    }

    function isDestinationPackage(p) {
      return p.category === 'destination_service' || p.is_destination_service === true || p.pickup_preference === 'destination_service';
    }

    function renderRecentPackages() {
      const container = document.getElementById('recent-packages');
      const recent = openPackages.slice(0, 3);
      if (!recent.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📦</div><p>No open packages.</p></div>';
        return;
      }
      container.innerHTML = recent.map(p => renderPackageCard(p, true)).join('');
    }

    function renderPackageCard(p, showBidButton = false) {
      const vehicle = p.vehicles;
      const vehicleName = vehicle ? (vehicle.nickname || `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim()) : 'Vehicle';
      const isRecurring = p.frequency && p.frequency !== 'one_time';
      const alreadyBid = myBids.some(b => b.package_id === p.id) || p._myBid;
      const myCurrentBid = p._myBid || myBids.find(b => b.package_id === p.id);
      const vinDisplay = vehicle?.vin ? `<span title="${vehicle.vin}">🔖 VIN: ...${vehicle.vin.slice(-6)}</span>` : '';
      
      // Member loyalty badges
      const member = p.member || {};
      let memberBadgesHtml = '';
      if (member.platform_fee_exempt) {
        memberBadgesHtml += '<span class="member-badge vip">👑 VIP</span>';
      }
      if (member.provider_verified) {
        memberBadgesHtml += '<span class="member-badge trusted">✓ Trusted</span>';
      }
      if (member.referred_by_provider_id === currentUser?.id) {
        memberBadgesHtml += '<span class="member-badge loyal">⭐ Loyal Customer</span>';
      }
      
      // Location display
      const locationDisplay = p.member_city && p.member_state 
        ? `${p.member_city}, ${p.member_state}` 
        : (p.member_zip || 'Location N/A');
      const distanceDisplay = p._estimatedDistance !== undefined 
        ? `~${Math.round(p._estimatedDistance)} mi` 
        : '';
      
      // Check bidding deadline
      const countdown = p.bidding_deadline ? formatCountdown(p.bidding_deadline) : null;
      const biddingExpired = countdown?.expired || false;
      const countdownHtml = countdown ? `
        <div class="countdown-timer ${countdown.expired ? 'expired' : countdown.urgent ? 'urgent' : ''}" style="margin-top:8px;">
          ⏱️ ${countdown.text}
        </div>
      ` : '';
      
      // Competition info
      const bidCount = p._bidCount || 0;
      const lowestBid = p._lowestBid;
      const isLowestBidder = myCurrentBid && lowestBid && myCurrentBid.price <= lowestBid;
      const canBeatLowest = myCurrentBid && lowestBid && myCurrentBid.price > lowestBid;
      
      const competitionHtml = bidCount > 0 ? `
        <div style="margin-top:10px;padding:10px;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <span style="font-size:0.85rem;">🏆 <strong>${bidCount}</strong> bid${bidCount !== 1 ? 's' : ''} ${lowestBid ? `• Lowest: <strong style="color:var(--accent-gold);">$${lowestBid}</strong>` : ''}</span>
            ${isLowestBidder ? '<span style="color:var(--accent-green);font-size:0.8rem;">✓ You\'re the lowest!</span>' : ''}
            ${canBeatLowest ? '<span style="color:var(--accent-orange);font-size:0.8rem;">⚡ You can beat this!</span>' : ''}
          </div>
        </div>
      ` : '';
      
      // Destination service info for destination_service packages or is_destination_service flag
      const destService = p._destinationService;
      let destinationBadgeHtml = '';
      let destinationInfoHtml = '';
      const isDestinationService = p.is_destination_service || p.category === 'destination_service' || p.pickup_preference === 'destination_service';
      
      if (isDestinationService && destService) {
        const dsIcon = getDestinationServiceIcon(destService.service_type);
        const dsLabel = getDestinationServiceLabel(destService.service_type);
        const pickup = destService.pickup_location || 'TBD';
        const dropoff = destService.dropoff_location || 'TBD';
        
        // Get appropriate datetime based on service type
        let serviceTime = '';
        if (destService.service_type === 'airport' && destService.flight_datetime) {
          serviceTime = formatDestinationDateTime(destService.flight_datetime);
        } else if (destService.service_type === 'dealership' && destService.appointment_datetime) {
          serviceTime = formatDestinationDateTime(destService.appointment_datetime);
        } else if (destService.service_type === 'valet' && destService.event_datetime) {
          serviceTime = formatDestinationDateTime(destService.event_datetime);
        } else if (destService.event_datetime) {
          serviceTime = formatDestinationDateTime(destService.event_datetime);
        }
        
        destinationBadgeHtml = `<span class="package-badge" style="background:var(--accent-blue-soft);color:var(--accent-blue);">${dsIcon} ${dsLabel}</span>`;
        
        destinationInfoHtml = `
          <div style="margin-top:12px;padding:12px 16px;background:var(--accent-blue-soft);border-radius:var(--radius-md);border:1px solid rgba(74, 124, 255, 0.2);">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <span style="font-size:1.1rem;">${dsIcon}</span>
              <strong style="color:var(--accent-blue);">${dsLabel}</strong>
            </div>
            <div style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:4px;">
              📍 <span style="color:var(--text-primary);">${pickup}</span> → <span style="color:var(--text-primary);">${dropoff}</span>
            </div>
            ${serviceTime ? `<div style="font-size:0.85rem;color:var(--text-muted);">🕐 ${serviceTime}</div>` : ''}
          </div>
        `;
      } else if (isDestinationService) {
        destinationBadgeHtml = '<span class="package-badge" style="background:var(--accent-blue-soft);color:var(--accent-blue);">🚗 Transport Service</span>';
      }

      // Private job indicator
      let privateJobHtml = '';
      if (p._isPrivateJob) {
        privateJobHtml = `
          <div class="private-job-banner" style="margin-bottom:12px;padding:12px 16px;background:linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(168, 85, 247, 0.1));border:1px solid rgba(139, 92, 246, 0.5);border-radius:var(--radius-md);display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.3rem;">🔒</span>
            <div>
              <div style="font-weight:600;color:#a78bfa;font-size:0.95rem;">Private Request</div>
              <div style="font-size:0.85rem;color:var(--text-secondary);">This customer sent this request directly to you. No competitive bidding required.</div>
            </div>
          </div>
        `;
      }

      // Exclusive opportunity indicator
      let exclusiveOpportunityHtml = '';
      if (p._isExclusiveOpportunity && p._exclusiveTimeRemaining && !p._isPrivateJob) {
        const hoursRemaining = Math.ceil(p._exclusiveTimeRemaining / (1000 * 60 * 60));
        const minutesRemaining = Math.ceil((p._exclusiveTimeRemaining % (1000 * 60 * 60)) / (1000 * 60));
        const timeText = hoursRemaining > 0 ? `${hoursRemaining}h ${minutesRemaining}m` : `${minutesRemaining}m`;
        exclusiveOpportunityHtml = `
          <div class="exclusive-opportunity-banner" style="margin-bottom:12px;padding:12px 16px;background:linear-gradient(135deg, var(--accent-gold-soft), var(--accent-bronze-soft));border:1px solid var(--accent-gold);border-radius:var(--radius-md);display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.3rem;">⭐</span>
            <div>
              <div style="font-weight:600;color:var(--accent-gold);font-size:0.95rem;">Exclusive Bid Opportunity</div>
              <div style="font-size:0.85rem;color:var(--text-secondary);">You have exclusive access for <strong style="color:var(--accent-gold);">${timeText}</strong> remaining</div>
            </div>
          </div>
        `;
      }

      return `
        <div class="package-card">
          ${privateJobHtml}
          ${exclusiveOpportunityHtml}
          <div class="package-header">
            <div>
              <div class="package-title">${p.title}${memberBadgesHtml ? `<span class="member-badges">${memberBadgesHtml}</span>` : ''}</div>
              <div class="package-vehicle">${vehicleName}</div>
            </div>
            <div style="text-align:right;">
              ${destinationBadgeHtml}
              ${isRecurring ? '<span class="package-badge recurring">Recurring</span>' : ''}
              ${p._isPrivateJob ? '<span class="package-badge" style="background:rgba(139, 92, 246, 0.15);color:#a78bfa;border:1px solid rgba(139, 92, 246, 0.5);">🔒 Private Request</span>' : ''}
              ${p._isExclusiveOpportunity && !p._isPrivateJob ? '<span class="package-badge" style="background:var(--accent-gold-soft);color:var(--accent-gold);border:1px solid var(--accent-gold);">⭐ Exclusive</span>' : ''}
              <span class="package-badge open">Open</span>
              ${countdownHtml}
            </div>
          </div>
          ${destinationInfoHtml}
          <div class="package-meta">
            <span style="color:var(--accent-gold);font-weight:500;">📍 ${locationDisplay} ${distanceDisplay ? `(${distanceDisplay})` : ''}</span>
            <span>📅 ${new Date(p.created_at).toLocaleDateString()}</span>
            ${p.category ? `<span>🏷️ ${formatCategory(p.category)}</span>` : ''}
            <span>🔄 ${formatFrequency(p.frequency)}</span>
            <span>🔧 ${p.parts_preference || 'Standard'} parts</span>
            <span>🚗 ${formatPickup(p.pickup_preference)}</span>
            ${vinDisplay}
          </div>
          ${p._isPrivateJob ? '' : competitionHtml}
          ${p.description ? `<div class="package-description">${p.description.slice(0, 200)}${p.description.length > 200 ? '...' : ''}</div>` : ''}
          <div class="package-footer">
            <button class="btn btn-secondary btn-sm" onclick="viewPackageDetails('${p.id}')">View Details</button>
            ${p._isPrivateJob ? `
              <button class="btn btn-primary btn-sm" onclick="acceptPrivateJob('${p.id}')" style="background:linear-gradient(135deg, #8b5cf6, #a855f7);">
                ⚡ Accept Job
              </button>
            ` : `
              ${showBidButton && !biddingExpired ? `
                ${alreadyBid ? `
                  <span style="color:var(--accent-green);font-size:0.85rem;margin-right:8px;">✓ Your bid: $${myCurrentBid?.price || '?'}</span>
                  <button class="btn btn-primary btn-sm" onclick="openBidModal('${p.id}', '${p.title.replace(/'/g, "\\'")}', ${myCurrentBid?.price || 0})">Update Bid</button>
                ` : `
                  <button class="btn btn-primary btn-sm" onclick="openBidModal('${p.id}', '${p.title.replace(/'/g, "\\'")}')">Submit Bid</button>
                `}
              ` : ''}
              ${biddingExpired && !alreadyBid ? '<span style="color:var(--text-muted);font-size:0.85rem;">Bidding closed</span>' : ''}
            `}
          </div>
        </div>
      `;
    }

    function formatCountdown(deadline) {
      const now = new Date();
      const end = new Date(deadline);
      const diff = end - now;
      
      if (diff <= 0) return { text: 'Bidding closed', expired: true, urgent: false };
      
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      let text = '';
      if (days > 0) {
        text = `${days}d ${hours}h left`;
      } else if (hours > 0) {
        text = `${hours}h ${minutes}m left`;
      } else {
        text = `${minutes}m left`;
      }
      
      return { 
        text, 
        expired: false, 
        urgent: diff < 4 * 60 * 60 * 1000 // Less than 4 hours
      };
    }

    function formatCategory(cat) {
      const map = { maintenance: 'Maintenance', detailing: 'Detailing', cosmetic: 'Cosmetic', accident_repair: 'Accident Repair', destination_service: 'Destination Service', other: 'Other' };
      return map[cat] || cat || 'General';
    }

    async function fetchDestinationServiceDetails(packageId) {
      const { data, error } = await supabaseClient
        .from('destination_services')
        .select('*')
        .eq('package_id', packageId)
        .single();
      return { data, error };
    }

    function getDestinationServiceIcon(serviceType) {
      const icons = { airport: '✈️', dealership: '🏢', detailing: '✨', valet: '🔑' };
      return icons[serviceType] || '📍';
    }

    function getDestinationServiceLabel(serviceType) {
      const labels = { airport: 'Airport Service', dealership: 'Dealership Service', detailing: 'Detailing Service', valet: 'Valet Service' };
      return labels[serviceType] || 'Destination Service';
    }

    function formatDestinationDateTime(datetime) {
      if (!datetime) return 'Not specified';
      const d = new Date(datetime);
      return d.toLocaleString(undefined, { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric', 
        hour: 'numeric', 
        minute: '2-digit'
      });
    }

    function renderMyBids() {
      const container = document.getElementById('my-bids');
      const pending = myBids.filter(b => b.status === 'pending' || b.status === 'rejected');
      if (!pending.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💬</div><p>No pending bids. Browse packages to submit bids!</p></div>';
        return;
      }
      container.innerHTML = pending.map(b => `
        <div class="bid-card">
          <div class="bid-header">
            <div class="bid-package">${b.maintenance_packages?.title || 'Package'}</div>
            <span class="bid-status ${b.status}">${b.status}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div class="bid-meta">Submitted ${new Date(b.created_at).toLocaleDateString()}</div>
            <div class="bid-amount">$${(b.price || 0).toFixed(2)}</div>
          </div>
          ${b.status === 'pending' ? `<div style="margin-top:12px;"><button class="btn btn-secondary btn-sm" onclick="openMessageWithMember('${b.package_id}', '${b.maintenance_packages?.member_id}')">💬 Message Member</button></div>` : ''}
        </div>
      `).join('');
    }

    async function renderActiveJobs() {
      const container = document.getElementById('active-jobs');
      const active = myBids.filter(b => b.status === 'accepted');
      if (!active.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✓</div><p>No active jobs yet. Keep bidding!</p></div>';
        return;
      }
      
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><p>Loading job details...</p></div>';
      
      const jobCards = await Promise.all(active.map(async b => {
        const pkg = b.maintenance_packages;
        const pkgStatus = pkg?.status || 'accepted';
        const vehicleName = pkg?.vehicles ? `${pkg.vehicles.year} ${pkg.vehicles.make} ${pkg.vehicles.model}` : 'Vehicle';
        
        let appointment = null;
        let transfer = null;
        let memberLocation = null;
        
        try {
          const [apptResult, transferResult, locationResult] = await Promise.all([
            window.getAppointment(b.package_id),
            window.getVehicleTransfer(b.package_id),
            window.getActiveLocationShare(b.package_id)
          ]);
          appointment = apptResult.data;
          transfer = transferResult.data;
          memberLocation = locationResult.data;
        } catch (e) {
          console.log('Error loading logistics data:', e);
        }
        
        return renderJobDashboard(b, pkg, pkgStatus, vehicleName, appointment, transfer, memberLocation);
      }));
      
      container.innerHTML = jobCards.join('');
    }
    
    async function renderJobDashboard(bid, pkg, pkgStatus, vehicleName, appointment, transfer, memberLocation) {
      const packageId = bid.package_id;
      const memberId = pkg?.member_id;
      const providerId = currentUser.id;
      const vehicleId = pkg?.vehicle_id;
      
      // Check for pending cost increases that have expired (4 hours passed)
      const { data: pendingUpsells } = await supabaseClient
        .from('upsell_requests')
        .select('*')
        .eq('package_id', packageId)
        .eq('provider_id', providerId)
        .eq('status', 'pending')
        .eq('update_type', 'cost_increase');
      
      const expiredUpsell = pendingUpsells?.find(u => u.expires_at && new Date(u.expires_at) < new Date());
      const pendingCostIncrease = pendingUpsells?.find(u => u.expires_at && new Date(u.expires_at) > new Date());
      
      const schedulingHtml = renderSchedulingSection(packageId, memberId, providerId, appointment);
      const transferHtml = renderTransferSection(packageId, transfer);
      const locationHtml = renderLocationSection(packageId, memberId, memberLocation);
      const evidenceHtml = await renderEvidenceSection(packageId);
      const keyExchangeHtml = await renderKeyExchangeSection(packageId);
      
      const statusBadge = pkgStatus === 'in_progress' ? 'In Progress' : pkgStatus === 'completed' ? 'Completed' : 'Accepted';
      const statusClass = pkgStatus === 'in_progress' ? 'pending' : 'accepted';
      
      return `
        <div class="job-dashboard">
          <div class="job-dashboard-header">
            <div>
              <div class="job-dashboard-title">${pkg?.title || 'Package'}</div>
              <div class="job-dashboard-vehicle">🚗 ${vehicleName}</div>
            </div>
            <div style="text-align:right;">
              <div class="job-dashboard-price">$${(bid.price || 0).toFixed(2)}</div>
              <span class="bid-status ${statusClass}">${statusBadge}</span>
            </div>
          </div>
          
          ${pkgStatus === 'accepted' ? `
            <div class="alert" style="background:var(--accent-blue-soft);border:1px solid rgba(74,124,255,0.3);color:var(--accent-blue);margin-bottom:16px;padding:12px;border-radius:var(--radius-md);font-size:0.88rem;">
              💰 Payment is held in escrow. Coordinate with member and start work when ready!
            </div>
          ` : ''}
          
          ${expiredUpsell ? `
            <div class="alert" style="background:var(--accent-red-soft);border:2px solid var(--accent-red);color:var(--accent-red);margin-bottom:16px;padding:16px;border-radius:var(--radius-md);">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
                <div>
                  <strong>⚠️ Price Adjustment Expired - No Response</strong>
                  <div style="font-size:0.88rem;margin-top:4px;">Your request for "$${(expiredUpsell.estimated_cost || 0).toFixed(2)}" has not received a response within 4 hours.</div>
                </div>
                <button class="btn btn-danger btn-sm" onclick="suspendWork('${packageId}', '${expiredUpsell.id}')">⏸️ Suspend Work</button>
              </div>
            </div>
          ` : pendingCostIncrease ? `
            <div class="alert" style="background:var(--accent-orange-soft);border:1px solid rgba(245,158,11,0.3);color:var(--accent-orange);margin-bottom:16px;padding:12px;border-radius:var(--radius-md);font-size:0.88rem;">
              ⏳ Waiting for member to approve price adjustment ($${(pendingCostIncrease.estimated_cost || 0).toFixed(2)}) - ${getTimeRemaining(pendingCostIncrease.expires_at) || 'checking...'}
            </div>
          ` : ''}
          
          ${schedulingHtml}
          ${transferHtml}
          ${locationHtml}
          ${keyExchangeHtml}
          ${evidenceHtml}
          
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;padding-top:16px;border-top:1px solid var(--border-subtle);">
            <button class="btn btn-primary btn-sm" onclick="openMessageWithMember('${packageId}', '${memberId}')">💬 Contact Member</button>
            <button class="inspection-btn" onclick="openInspectionModal('${packageId}', '${vehicleId}')">🔍 Inspection Report</button>
            ${pkgStatus === 'accepted' ? `
              <button class="btn btn-secondary btn-sm" style="background:var(--accent-green);color:#fff;border:none;" onclick="markWorkStarted('${packageId}')">▶️ Start Work</button>
            ` : pkgStatus === 'in_progress' ? `
              <button class="btn btn-secondary btn-sm" style="background:var(--accent-green);color:#fff;border:none;" onclick="markJobComplete('${packageId}')">✓ Mark Complete</button>
              <button class="btn btn-secondary btn-sm" onclick="openUpsellModal('${packageId}', '${memberId}')">📢 Send Update</button>
            ` : ''}
          </div>
        </div>
      `;
    }
    
    function renderSchedulingSection(packageId, memberId, providerId, appointment) {
      if (!appointment) {
        return `
          <div class="logistics-section">
            <div class="logistics-section-header">
              <div class="logistics-section-title">📅 Service Scheduling</div>
            </div>
            <div class="logistics-section-content">
              <p style="margin-bottom:12px;">No appointment scheduled yet. Propose a date and time for the service.</p>
              <button class="btn btn-primary btn-sm" onclick="openProviderScheduleModal('${packageId}', '${memberId}', '${providerId}')">📅 Propose Appointment</button>
            </div>
          </div>
        `;
      }
      
      const proposedDate = appointment.proposed_date ? new Date(appointment.proposed_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'TBD';
      const timeRange = appointment.proposed_time_start && appointment.proposed_time_end ? `${appointment.proposed_time_start} - ${appointment.proposed_time_end}` : (appointment.proposed_time_start || 'Flexible');
      const status = appointment.status || 'proposed';
      const proposedBy = appointment.proposed_by === 'member' ? 'Member' : 'You';
      
      let actionHtml = '';
      if (status === 'proposed' && appointment.proposed_by === 'member') {
        actionHtml = `
          <div style="display:flex;gap:8px;margin-top:12px;">
            <button class="btn btn-primary btn-sm" onclick="confirmScheduleFromProvider('${appointment.id}', '${packageId}')">✓ Confirm</button>
            <button class="btn btn-secondary btn-sm" onclick="proposeNewTimeFromProvider('${appointment.id}', '${packageId}')">🔄 Suggest Different Time</button>
          </div>
        `;
      } else if (status === 'rescheduled' && appointment.counter_proposed_by === 'member') {
        const counterDate = appointment.counter_proposed_date ? new Date(appointment.counter_proposed_date).toLocaleDateString() : '';
        actionHtml = `
          <div style="background:var(--accent-blue-soft);padding:12px;border-radius:var(--radius-md);margin-top:12px;">
            <strong>Member proposed: ${counterDate}</strong>
            ${appointment.counter_notes ? `<p style="margin-top:4px;font-size:0.85rem;">${appointment.counter_notes}</p>` : ''}
            <div style="display:flex;gap:8px;margin-top:8px;">
              <button class="btn btn-primary btn-sm" onclick="acceptCounterFromProvider('${appointment.id}', '${packageId}')">✓ Accept</button>
              <button class="btn btn-secondary btn-sm" onclick="proposeNewTimeFromProvider('${appointment.id}', '${packageId}')">🔄 Counter</button>
            </div>
          </div>
        `;
      } else if (status === 'proposed' || status === 'rescheduled') {
        actionHtml = `<p style="color:var(--accent-gold);margin-top:8px;font-size:0.85rem;">⏳ Waiting for member to respond...</p>`;
      }
      
      const confirmedHtml = status === 'confirmed' ? `
        <div style="background:var(--accent-green-soft);padding:12px;border-radius:var(--radius-md);margin-top:12px;display:flex;align-items:center;gap:8px;">
          <span style="font-size:20px;">✅</span>
          <div>
            <strong style="color:var(--accent-green);">Appointment Confirmed!</strong>
            <div style="font-size:0.85rem;color:var(--text-secondary);">${appointment.confirmed_date ? new Date(appointment.confirmed_date).toLocaleDateString() : proposedDate}</div>
          </div>
        </div>
      ` : '';
      
      return `
        <div class="logistics-section">
          <div class="logistics-section-header">
            <div class="logistics-section-title">📅 Service Scheduling</div>
            <span class="appointment-status ${status}">${status === 'confirmed' ? '✓ Confirmed' : status === 'rescheduled' ? '🔄 Rescheduled' : '⏳ Proposed'}</span>
          </div>
          <div class="logistics-section-content">
            <div class="appointment-card">
              <div class="appointment-date">${proposedDate}</div>
              <div class="appointment-time">🕐 ${timeRange}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">Proposed by: ${proposedBy}</div>
              ${appointment.provider_notes || appointment.member_notes ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-top:8px;">📝 ${appointment.provider_notes || appointment.member_notes}</div>` : ''}
            </div>
            ${confirmedHtml}
            ${actionHtml}
          </div>
        </div>
      `;
    }
    
    function renderTransferSection(packageId, transfer) {
      const statusFlow = [
        { key: 'with_member', label: 'With Member', icon: '👤' },
        { key: 'in_transit_to_provider', label: 'In Transit to Shop', icon: '🚗' },
        { key: 'at_provider', label: 'At Shop', icon: '🏪' },
        { key: 'work_in_progress', label: 'Work Started', icon: '🔧' },
        { key: 'work_complete', label: 'Work Complete', icon: '✅' },
        { key: 'ready_for_return', label: 'Ready for Return', icon: '📦' },
        { key: 'in_transit_to_member', label: 'Returning to Member', icon: '🚗' },
        { key: 'returned', label: 'Returned', icon: '🎉' }
      ];
      
      const currentStatus = transfer?.vehicle_status || 'with_member';
      const currentIndex = statusFlow.findIndex(s => s.key === currentStatus);
      const transferType = transfer?.transfer_type || 'member_dropoff';
      
      const transferTypeLabels = {
        'member_dropoff': '🚗 Member drops off',
        'provider_pickup': '🚚 Provider picks up',
        'mobile_service': '📍 Mobile service'
      };
      
      const timelineHtml = statusFlow.map((step, idx) => {
        let stepClass = 'pending';
        let timestamp = '';
        
        if (idx < currentIndex) {
          stepClass = 'completed';
        } else if (idx === currentIndex) {
          stepClass = 'current';
        }
        
        if (transfer) {
          if (step.key === 'at_provider' && transfer.arrived_at_provider_at) {
            timestamp = new Date(transfer.arrived_at_provider_at).toLocaleString();
          } else if (step.key === 'work_in_progress' && transfer.work_started_at) {
            timestamp = new Date(transfer.work_started_at).toLocaleString();
          } else if (step.key === 'work_complete' && transfer.work_completed_at) {
            timestamp = new Date(transfer.work_completed_at).toLocaleString();
          } else if (step.key === 'returned' && transfer.returned_at) {
            timestamp = new Date(transfer.returned_at).toLocaleString();
          }
        }
        
        return `
          <div class="status-step ${stepClass}">
            <div class="status-dot">${step.icon}</div>
            <div class="status-info">
              <div class="status-label">${step.label}</div>
              ${timestamp ? `<div class="status-time">${timestamp}</div>` : ''}
            </div>
          </div>
        `;
      }).join('');
      
      const nextAction = getNextTransferAction(currentStatus, transfer?.id, packageId);
      
      return `
        <div class="logistics-section">
          <div class="logistics-section-header">
            <div class="logistics-section-title">🚗 Vehicle Transfer</div>
            <span style="font-size:0.85rem;color:var(--text-muted);">${transferTypeLabels[transferType] || transferType}</span>
          </div>
          <div class="logistics-section-content">
            <div class="status-timeline">
              ${timelineHtml}
            </div>
            ${nextAction}
          </div>
        </div>
      `;
    }
    
    function getNextTransferAction(currentStatus, transferId, packageId) {
      const actions = {
        'with_member': { label: 'Mark Vehicle Picked Up', nextStatus: 'in_transit_to_provider', icon: '🚗' },
        'in_transit_to_provider': { label: 'Mark Vehicle Received', nextStatus: 'at_provider', icon: '🏪' },
        'at_provider': { label: 'Mark Work Started', nextStatus: 'work_in_progress', icon: '🔧' },
        'work_in_progress': { label: 'Mark Work Complete', nextStatus: 'work_complete', icon: '✅' },
        'work_complete': { label: 'Mark Ready for Return', nextStatus: 'ready_for_return', icon: '📦' },
        'ready_for_return': { label: 'Mark Vehicle Returned', nextStatus: 'returned', icon: '🎉' },
        'in_transit_to_member': { label: 'Mark Vehicle Returned', nextStatus: 'returned', icon: '🎉' }
      };
      
      const action = actions[currentStatus];
      if (!action || currentStatus === 'returned') {
        return currentStatus === 'returned' ? `<div style="text-align:center;color:var(--accent-green);font-weight:500;padding:12px;">🎉 Vehicle returned successfully!</div>` : '';
      }
      
      return `
        <div class="status-action" style="text-align:center;padding-top:8px;">
          <button class="btn btn-primary btn-sm" onclick="updateJobVehicleStatus('${transferId}', '${packageId}', '${action.nextStatus}')">
            ${action.icon} ${action.label}
          </button>
        </div>
      `;
    }
    
    function renderLocationSection(packageId, memberId, memberLocation) {
      let memberLocationHtml = '';
      if (memberLocation && memberLocation.is_active) {
        const sharedTime = memberLocation.shared_at ? new Date(memberLocation.shared_at).toLocaleString() : '';
        const sharedByName = memberLocation.profiles?.full_name || 'Member';
        memberLocationHtml = `
          <div class="location-card" style="margin-bottom:12px;">
            <div class="location-icon">📍</div>
            <div class="location-details">
              <div style="font-weight:500;margin-bottom:4px;">Member's Location</div>
              <div class="location-address">${memberLocation.address_text || 'Location shared'}</div>
              <div class="location-time">Shared ${sharedTime}</div>
              <a href="${memberLocation.maps_link}" target="_blank" class="btn btn-secondary btn-sm" style="margin-top:8px;">
                🗺️ Open in Google Maps
              </a>
            </div>
          </div>
        `;
      }
      
      const isTracking = activeTrackingPackageId === packageId;
      const trackingStatusHtml = isTracking ? `
        <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--accent-green-soft);border:1px solid rgba(74,200,140,0.3);border-radius:var(--radius-md);margin-bottom:12px;">
          <div style="width:12px;height:12px;border-radius:50%;background:var(--accent-green);animation:pulse 1.5s ease-in-out infinite;"></div>
          <div>
            <div style="font-weight:600;color:var(--accent-green);">🚗 Live Tracking Active</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);" id="tracking-status-${packageId}">Sending location updates...</div>
          </div>
        </div>
      ` : '';
      
      const trackingButtonsHtml = isTracking ? `
        <button class="btn btn-sm" style="background:var(--accent-red);color:#fff;border:none;" onclick="stopLocationTracking()">
          🛑 Stop Tracking
        </button>
      ` : `
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="startLocationTracking('${packageId}', 'pickup')" title="Track while picking up vehicle">
            📍 Start Pickup Tracking
          </button>
          <button class="btn btn-secondary btn-sm" onclick="startLocationTracking('${packageId}', 'return')" title="Track while returning vehicle">
            📍 Start Return Tracking
          </button>
        </div>
      `;
      
      return `
        <div class="logistics-section">
          <div class="logistics-section-header">
            <div class="logistics-section-title">📍 Location & Tracking</div>
          </div>
          <div class="logistics-section-content">
            ${trackingStatusHtml}
            ${memberLocationHtml}
            ${!memberLocation && !isTracking ? '<p style="color:var(--text-muted);margin-bottom:12px;font-size:0.9rem;">No location shared by member yet.</p>' : ''}
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              ${trackingButtonsHtml}
              ${!isTracking ? `
                <button class="btn btn-secondary btn-sm" onclick="shareProviderLocation('${packageId}', '${memberId}')">
                  📍 Share One-Time Location
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }

    // ========== GPS LIVE TRACKING FUNCTIONS ==========
    
    function startLocationTracking(packageId, trackingType) {
      if (!navigator.geolocation) {
        showToast('Geolocation is not supported by this browser', 'error');
        return;
      }
      
      if (activeTrackingPackageId) {
        showToast('Already tracking another package. Stop current tracking first.', 'error');
        return;
      }
      
      activeTrackingPackageId = packageId;
      
      const geoOptions = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      };
      
      trackingWatchId = navigator.geolocation.watchPosition(
        (position) => {
          lastTrackingPosition = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            heading: position.coords.heading,
            speed: position.coords.speed ? (position.coords.speed * 2.237).toFixed(1) : null,
            trackingType: trackingType
          };
          
          const statusEl = document.getElementById(`tracking-status-${packageId}`);
          if (statusEl) {
            statusEl.textContent = `Last update: ${new Date().toLocaleTimeString()}`;
          }
        },
        (error) => {
          console.error('Geolocation error:', error);
          let errorMsg = 'Location error';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMsg = 'Location permission denied';
              stopLocationTracking();
              break;
            case error.POSITION_UNAVAILABLE:
              errorMsg = 'Location unavailable';
              break;
            case error.TIMEOUT:
              errorMsg = 'Location request timed out';
              break;
          }
          showToast(errorMsg, 'error');
        },
        geoOptions
      );
      
      sendLocationUpdateNow(packageId, trackingType);
      
      trackingIntervalId = setInterval(() => {
        if (lastTrackingPosition) {
          sendLocationUpdateNow(packageId, trackingType);
        }
      }, 25000);
      
      showToast(`📍 Live tracking started (${trackingType})`, 'success');
      renderActiveJobs();
    }
    
    async function sendLocationUpdateNow(packageId, trackingType) {
      if (!lastTrackingPosition && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { data, error } = await window.updateDriverLocation(
              packageId,
              position.coords.latitude,
              position.coords.longitude,
              position.coords.heading,
              position.coords.speed ? (position.coords.speed * 2.237).toFixed(1) : null,
              trackingType
            );
            if (error) console.error('Failed to send location update:', error);
          },
          (error) => console.error('Location fetch error:', error),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      } else if (lastTrackingPosition) {
        const { data, error } = await window.updateDriverLocation(
          packageId,
          lastTrackingPosition.lat,
          lastTrackingPosition.lng,
          lastTrackingPosition.heading,
          lastTrackingPosition.speed,
          trackingType
        );
        if (error) console.error('Failed to send location update:', error);
      }
    }
    
    async function stopLocationTracking() {
      if (trackingWatchId !== null) {
        navigator.geolocation.clearWatch(trackingWatchId);
        trackingWatchId = null;
      }
      
      if (trackingIntervalId !== null) {
        clearInterval(trackingIntervalId);
        trackingIntervalId = null;
      }
      
      if (activeTrackingPackageId) {
        await window.clearDriverLocation(activeTrackingPackageId);
      }
      
      activeTrackingPackageId = null;
      lastTrackingPosition = null;
      
      showToast('🛑 Live tracking stopped', 'success');
      renderActiveJobs();
    }

    async function markWorkStarted(packageId) {
      if (!confirm('Mark this job as started? This will notify the member that work has begun.')) return;

      await supabaseClient.from('maintenance_packages').update({
        status: 'in_progress',
        work_started_at: new Date().toISOString()
      }).eq('id', packageId);

      // Notify member
      try {
        await window.notifyWorkStarted(packageId);
      } catch (e) {
        console.log('Notification error (non-critical):', e);
      }

      showToast('Job marked as started. Keep up the great work!', 'success');
      await loadMyBids();
    }

    async function markJobComplete(packageId) {
      if (!confirm('Mark this job as complete? The member will be notified to confirm and release payment.')) return;

      await supabaseClient.from('maintenance_packages').update({
        status: 'in_progress', // Keep as in_progress until member confirms
        work_completed_at: new Date().toISOString()
      }).eq('id', packageId);

      // Notify member
      try {
        await window.notifyWorkCompleted(packageId);
      } catch (e) {
        console.log('Notification error (non-critical):', e);
      }

      showToast('Job marked complete! Payment will be released once the member confirms.', 'success');
      await loadMyBids();
    }

    // ========== PROVIDER SCHEDULING & COORDINATION ==========

    function openProviderScheduleModal(packageId, memberId, providerId) {
      document.getElementById('schedule-package-id').value = packageId;
      document.getElementById('schedule-member-id').value = memberId;
      document.getElementById('schedule-provider-id').value = providerId;
      document.getElementById('schedule-date').value = '';
      document.getElementById('schedule-time-start').value = '09:00';
      document.getElementById('schedule-time-end').value = '17:00';
      document.getElementById('schedule-duration').value = '1';
      document.getElementById('schedule-notes').value = '';
      document.getElementById('provider-schedule-modal').classList.add('active');
    }

    async function submitProviderScheduleProposal() {
      const packageId = document.getElementById('schedule-package-id').value;
      const memberId = document.getElementById('schedule-member-id').value;
      const providerId = document.getElementById('schedule-provider-id').value;
      const date = document.getElementById('schedule-date').value;
      const timeStart = document.getElementById('schedule-time-start').value;
      const timeEnd = document.getElementById('schedule-time-end').value;
      const duration = document.getElementById('schedule-duration').value;
      const notes = document.getElementById('schedule-notes').value;
      if (!date) return showToast('Please select a date', 'error');
      const { error } = await window.createAppointment(packageId, memberId, providerId, date, timeStart, timeEnd, parseInt(duration), notes);
      if (error) return showToast('Failed to propose appointment: ' + error.message, 'error');
      closeModal('provider-schedule-modal');
      showToast('Appointment proposal sent!', 'success');
      await renderActiveJobs();
    }

    async function confirmScheduleFromProvider(appointmentId, packageId) {
      if (!confirm('Confirm this appointment?')) return;
      const { error } = await window.confirmAppointment(appointmentId, packageId);
      if (error) return showToast('Failed: ' + error.message, 'error');
      showToast('Appointment confirmed!', 'success');
      await renderActiveJobs();
    }

    function proposeNewTimeFromProvider(appointmentId, packageId) {
      document.getElementById('counter-appointment-id').value = appointmentId;
      document.getElementById('counter-package-id').value = packageId;
      document.getElementById('counter-date').value = '';
      document.getElementById('counter-time-start').value = '09:00';
      document.getElementById('counter-time-end').value = '17:00';
      document.getElementById('counter-notes').value = '';
      document.getElementById('provider-counter-modal').classList.add('active');
    }

    async function submitProviderCounterProposal() {
      const appointmentId = document.getElementById('counter-appointment-id').value;
      const packageId = document.getElementById('counter-package-id').value;
      const date = document.getElementById('counter-date').value;
      const timeStart = document.getElementById('counter-time-start').value;
      const timeEnd = document.getElementById('counter-time-end').value;
      const notes = document.getElementById('counter-notes').value;
      if (!date) return showToast('Please select a date', 'error');
      const { error } = await window.proposeNewTime(appointmentId, packageId, date, timeStart, timeEnd, notes);
      if (error) return showToast('Failed: ' + error.message, 'error');
      closeModal('provider-counter-modal');
      showToast('New time proposed!', 'success');
      await renderActiveJobs();
    }

    async function acceptCounterFromProvider(appointmentId, packageId) {
      if (!confirm('Accept this proposed time?')) return;
      const { error } = await window.acceptCounterProposal(appointmentId, packageId);
      if (error) return showToast('Failed: ' + error.message, 'error');
      showToast('Time accepted!', 'success');
      await renderActiveJobs();
    }

    async function updateJobVehicleStatus(transferId, packageId, newStatus) {
      const labels = { 'in_transit_to_provider': 'picked up', 'at_provider': 'received', 'work_in_progress': 'started', 'work_complete': 'completed', 'ready_for_return': 'ready', 'returned': 'returned' };
      if (!confirm(`Mark vehicle as ${labels[newStatus] || newStatus}?`)) return;
      const { error } = await window.updateVehicleStatus(transferId, packageId, newStatus);
      if (error) return showToast('Failed: ' + error.message, 'error');
      showToast('Status updated!', 'success');
      await renderActiveJobs();
    }

    function shareProviderLocation(packageId, memberId) {
      document.getElementById('location-package-id').value = packageId;
      document.getElementById('location-member-id').value = memberId;
      document.getElementById('location-context').value = 'shop_location';
      document.getElementById('location-message').value = '';
      document.getElementById('location-status').style.display = 'none';
      document.getElementById('provider-location-modal').classList.add('active');
    }

    async function executeProviderLocationShare() {
      const packageId = document.getElementById('location-package-id').value;
      const memberId = document.getElementById('location-member-id').value;
      const context = document.getElementById('location-context').value;
      const message = document.getElementById('location-message').value;
      const statusDiv = document.getElementById('location-status');
      const btn = document.getElementById('share-location-btn');
      btn.disabled = true;
      btn.textContent = 'Getting location...';
      statusDiv.style.display = 'block';
      statusDiv.innerHTML = '<p style="color:var(--accent-gold);">📍 Getting your location...</p>';
      const { error, mapsLink } = await window.shareLocation(packageId, memberId, context, message);
      btn.disabled = false;
      btn.textContent = '📍 Share My Location';
      if (error) { statusDiv.innerHTML = `<p style="color:var(--accent-red);">❌ ${error}</p>`; return; }
      statusDiv.innerHTML = `<p style="color:var(--accent-green);">✅ Location shared!</p><a href="${mapsLink}" target="_blank" style="color:var(--accent-gold);">View on Maps</a>`;
      showToast('Location shared with member!', 'success');
      setTimeout(() => { closeModal('provider-location-modal'); renderActiveJobs(); }, 2000);
    }

    async function viewMemberLocation(packageId) {
      const { data: location, error } = await window.getActiveLocationShare(packageId, 'provider');
      if (error || !location) {
        showToast('No active location shared by member', 'error');
        return;
      }
      if (location.maps_link) {
        await window.markLocationViewed(location.id);
        window.open(location.maps_link, '_blank');
      } else {
        showToast('Location link not available', 'error');
      }
    }

    // ========== SERVICE EVIDENCE CAPTURE ==========
    
    const evidenceTypeLabels = {
      'pre_pickup': { label: 'Pre-Pickup Condition', icon: '🔵', color: 'var(--accent-blue)' },
      'arrival_shop': { label: 'Arrival at Shop', icon: '🟠', color: '#f59e0b' },
      'post_service': { label: 'Post-Service Condition', icon: '🟢', color: 'var(--accent-green)' },
      'return': { label: 'Vehicle Return', icon: '🟣', color: '#a855f7' }
    };

    function captureEvidence(packageId, type) {
      document.getElementById('evidence-package-id').value = packageId;
      document.getElementById('evidence-type').value = type;
      document.getElementById('evidence-modal-title').textContent = evidenceTypeLabels[type]?.label || 'Capture Evidence';
      document.getElementById('evidence-photo-preview').innerHTML = '';
      document.getElementById('evidence-photos').value = '';
      document.getElementById('evidence-odometer').value = '';
      document.getElementById('evidence-fuel').value = '';
      document.getElementById('evidence-exterior').value = '';
      document.getElementById('evidence-interior').value = '';
      document.getElementById('evidence-notes').value = '';
      document.getElementById('evidence-upload-status').style.display = 'none';
      document.getElementById('evidence-modal').classList.add('active');
    }

    function previewEvidencePhotos() {
      const fileInput = document.getElementById('evidence-photos');
      const preview = document.getElementById('evidence-photo-preview');
      const files = Array.from(fileInput.files).slice(0, 10);
      preview.innerHTML = '';
      files.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = document.createElement('div');
          img.style.cssText = 'width:80px;height:80px;border-radius:8px;overflow:hidden;border:1px solid var(--border-subtle);position:relative;';
          img.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;">`;
          preview.appendChild(img);
        };
        reader.readAsDataURL(file);
      });
    }

    async function submitEvidence() {
      const packageId = document.getElementById('evidence-package-id').value;
      const type = document.getElementById('evidence-type').value;
      const fileInput = document.getElementById('evidence-photos');
      const odometer = document.getElementById('evidence-odometer').value;
      const fuelLevel = document.getElementById('evidence-fuel').value;
      const exteriorCondition = document.getElementById('evidence-exterior').value;
      const interiorCondition = document.getElementById('evidence-interior').value;
      const notes = document.getElementById('evidence-notes').value;

      if (!odometer || !fuelLevel) {
        return showToast('Please provide odometer reading and fuel level', 'error');
      }

      const files = Array.from(fileInput.files).slice(0, 10);
      if (files.length === 0) {
        return showToast('Please add at least one photo', 'error');
      }

      const btn = document.getElementById('submit-evidence-btn');
      const statusDiv = document.getElementById('evidence-upload-status');
      btn.disabled = true;
      btn.textContent = 'Uploading...';
      statusDiv.style.display = 'block';
      statusDiv.innerHTML = '<p style="color:var(--accent-gold);">📤 Uploading photos...</p>';

      try {
        const photoUrls = await window.uploadEvidencePhotos(packageId, files);
        if (photoUrls.length === 0) {
          throw new Error('Failed to upload photos');
        }

        statusDiv.innerHTML = '<p style="color:var(--accent-gold);">📝 Saving evidence...</p>';

        let lat = null, lng = null;
        try {
          const pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch (e) { }

        const { data, error } = await window.saveEvidence({
          packageId,
          type,
          photos: photoUrls,
          odometer: parseInt(odometer),
          fuelLevel,
          exteriorCondition,
          interiorCondition,
          notes,
          role: 'provider',
          lat,
          lng
        });

        if (error) throw error;

        statusDiv.innerHTML = '<p style="color:var(--accent-green);">✅ Evidence saved successfully!</p>';
        showToast('Evidence captured and saved!', 'success');
        
        setTimeout(() => {
          closeModal('evidence-modal');
          renderActiveJobs();
        }, 1500);
      } catch (err) {
        console.error('Evidence submission error:', err);
        statusDiv.innerHTML = `<p style="color:var(--accent-red);">❌ Error: ${err.message || 'Failed to save evidence'}</p>`;
        showToast('Failed to save evidence', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '📸 Save Evidence';
      }
    }

    async function renderEvidenceSection(packageId) {
      const { data: evidence } = await window.getPackageEvidence(packageId);
      
      if (!evidence || evidence.length === 0) {
        return `
          <div class="logistics-section">
            <div class="logistics-section-header">
              <div class="logistics-section-title">📸 Vehicle Condition Evidence</div>
            </div>
            <div class="logistics-section-content">
              <p style="color:var(--text-muted);margin-bottom:16px;font-size:0.9rem;">No evidence captured yet. Document the vehicle condition at each stage.</p>
              <button class="btn btn-secondary btn-sm" onclick="captureEvidence('${packageId}', 'pre_pickup')">📸 Capture Pre-Pickup Evidence</button>
            </div>
          </div>
        `;
      }

      const timeline = evidence.map(e => {
        const typeInfo = evidenceTypeLabels[e.type] || { label: e.type, icon: '📷', color: 'var(--text-muted)' };
        const photoGrid = e.photos?.length ? `
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
            ${e.photos.slice(0, 4).map(url => `
              <div style="width:60px;height:60px;border-radius:6px;overflow:hidden;border:1px solid var(--border-subtle);cursor:pointer;" onclick="window.open('${url}','_blank')">
                <img src="${url}" style="width:100%;height:100%;object-fit:cover;">
              </div>
            `).join('')}
            ${e.photos.length > 4 ? `<div style="width:60px;height:60px;border-radius:6px;background:var(--bg-input);display:flex;align-items:center;justify-content:center;font-size:0.8rem;color:var(--text-muted);">+${e.photos.length - 4}</div>` : ''}
          </div>
        ` : '';
        
        return `
          <div style="display:flex;gap:12px;padding:12px;background:var(--bg-input);border-radius:var(--radius-md);border-left:3px solid ${typeInfo.color};margin-bottom:12px;">
            <div style="font-size:20px;">${typeInfo.icon}</div>
            <div style="flex:1;">
              <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;">${typeInfo.label}</div>
              <div style="display:flex;gap:16px;font-size:0.82rem;color:var(--text-secondary);margin-bottom:4px;">
                <span>🔢 ${e.odometer?.toLocaleString() || 'N/A'} mi</span>
                <span>⛽ ${e.fuel_level || 'N/A'}</span>
              </div>
              ${e.notes ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-top:6px;">${e.notes}</div>` : ''}
              <div style="font-size:0.75rem;color:var(--text-muted);margin-top:8px;">${new Date(e.created_at).toLocaleString()}</div>
              ${photoGrid}
            </div>
          </div>
        `;
      }).join('');

      const capturedTypes = evidence.map(e => e.type);
      let nextButton = '';
      if (!capturedTypes.includes('pre_pickup')) {
        nextButton = `<button class="btn btn-secondary btn-sm" onclick="captureEvidence('${packageId}', 'pre_pickup')">📸 Capture Pre-Pickup</button>`;
      } else if (!capturedTypes.includes('arrival_shop')) {
        nextButton = `<button class="btn btn-secondary btn-sm" onclick="captureEvidence('${packageId}', 'arrival_shop')">📸 Record Shop Arrival</button>`;
      } else if (!capturedTypes.includes('post_service')) {
        nextButton = `<button class="btn btn-secondary btn-sm" onclick="captureEvidence('${packageId}', 'post_service')">📸 Record Post-Service</button>`;
      } else if (!capturedTypes.includes('return')) {
        nextButton = `<button class="btn btn-secondary btn-sm" onclick="captureEvidence('${packageId}', 'return')">📸 Record Return</button>`;
      }

      return `
        <div class="logistics-section">
          <div class="logistics-section-header">
            <div class="logistics-section-title">📸 Vehicle Condition Evidence</div>
          </div>
          <div class="logistics-section-content">
            ${timeline}
            ${nextButton ? `<div style="margin-top:12px;">${nextButton}</div>` : '<p style="color:var(--accent-green);font-size:0.85rem;margin-top:8px;">✅ All evidence stages captured</p>'}
          </div>
        </div>
      `;
    }

    // ========== KEY EXCHANGE VERIFICATION ==========

    function openKeyExchangeModal(packageId, stage) {
      document.getElementById('key-exchange-package-id').value = packageId;
      document.getElementById('key-exchange-stage').value = stage;
      document.getElementById('key-exchange-modal-title').textContent = stage === 'pickup' ? 'Pickup Key Exchange' : 'Return Key Exchange';
      document.getElementById('key-exchange-id-preview').innerHTML = '';
      document.getElementById('key-exchange-photos-preview').innerHTML = '';
      document.getElementById('key-exchange-id-photo').value = '';
      document.getElementById('key-exchange-key-photos').value = '';
      document.getElementById('key-exchange-notes').value = '';
      document.getElementById('key-exchange-upload-status').style.display = 'none';
      document.getElementById('key-exchange-modal').classList.add('active');
    }

    function previewKeyExchangeIdPhoto() {
      const fileInput = document.getElementById('key-exchange-id-photo');
      const preview = document.getElementById('key-exchange-id-preview');
      preview.innerHTML = '';
      if (fileInput.files.length > 0) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = document.createElement('div');
          img.style.cssText = 'width:80px;height:80px;border-radius:8px;overflow:hidden;border:2px solid var(--accent-gold);position:relative;';
          img.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;"><div style="position:absolute;top:2px;right:2px;background:var(--accent-gold);color:#000;padding:2px 4px;border-radius:4px;font-size:0.65rem;font-weight:600;">ID</div>`;
          preview.appendChild(img);
        };
        reader.readAsDataURL(fileInput.files[0]);
      }
    }

    function previewKeyExchangePhotos() {
      const fileInput = document.getElementById('key-exchange-key-photos');
      const preview = document.getElementById('key-exchange-photos-preview');
      const files = Array.from(fileInput.files).slice(0, 3);
      preview.innerHTML = '';
      files.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = document.createElement('div');
          img.style.cssText = 'width:80px;height:80px;border-radius:8px;overflow:hidden;border:1px solid var(--border-subtle);position:relative;';
          img.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;">`;
          preview.appendChild(img);
        };
        reader.readAsDataURL(file);
      });
    }

    async function uploadKeyExchangePhoto(packageId, stage, file, photoType) {
      const timestamp = Date.now();
      const ext = file.name.split('.').pop();
      const filePath = `${packageId}/${stage}/${photoType}_${timestamp}.${ext}`;
      
      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from('key-exchange-photos')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });
      
      if (uploadError) {
        console.error('Upload error:', uploadError);
        return null;
      }
      
      const { data: urlData } = supabaseClient.storage
        .from('key-exchange-photos')
        .getPublicUrl(filePath);
      
      return urlData?.publicUrl || null;
    }

    async function submitKeyExchange() {
      const packageId = document.getElementById('key-exchange-package-id').value;
      const stage = document.getElementById('key-exchange-stage').value;
      const idPhotoInput = document.getElementById('key-exchange-id-photo');
      const keyPhotosInput = document.getElementById('key-exchange-key-photos');
      const notes = document.getElementById('key-exchange-notes').value;

      if (!idPhotoInput.files.length) {
        return showToast('Please capture the driver ID photo', 'error');
      }
      if (!keyPhotosInput.files.length) {
        return showToast('Please add at least one key handoff photo', 'error');
      }

      const btn = document.getElementById('submit-key-exchange-btn');
      const statusDiv = document.getElementById('key-exchange-upload-status');
      btn.disabled = true;
      btn.textContent = 'Uploading...';
      statusDiv.style.display = 'block';
      statusDiv.innerHTML = '<p style="color:var(--accent-gold);">📤 Uploading photos...</p>';

      try {
        const idPhotoUrl = await uploadKeyExchangePhoto(packageId, stage, idPhotoInput.files[0], 'driver_id');
        if (!idPhotoUrl) throw new Error('Failed to upload ID photo');

        const keyPhotoFiles = Array.from(keyPhotosInput.files).slice(0, 3);
        const keyPhotoUrls = [];
        for (let i = 0; i < keyPhotoFiles.length; i++) {
          statusDiv.innerHTML = `<p style="color:var(--accent-gold);">📤 Uploading photo ${i + 2} of ${keyPhotoFiles.length + 1}...</p>`;
          const url = await uploadKeyExchangePhoto(packageId, stage, keyPhotoFiles[i], `key_${i + 1}`);
          if (url) keyPhotoUrls.push(url);
        }

        if (keyPhotoUrls.length === 0) throw new Error('Failed to upload key photos');

        statusDiv.innerHTML = '<p style="color:var(--accent-gold);">📝 Saving key exchange record...</p>';

        const { data: existingExchange } = await supabaseClient
          .from('key_exchanges')
          .select('id')
          .eq('package_id', packageId)
          .eq('stage', stage)
          .maybeSingle();

        let result;
        if (existingExchange) {
          result = await supabaseClient.from('key_exchanges').update({
            driver_id_photo_url: idPhotoUrl,
            key_photos: keyPhotoUrls,
            notes: notes || null,
            verified_at: new Date().toISOString()
          }).eq('id', existingExchange.id);
        } else {
          result = await supabaseClient.from('key_exchanges').insert({
            package_id: packageId,
            driver_user_id: currentUser.id,
            stage: stage,
            driver_id_photo_url: idPhotoUrl,
            key_photos: keyPhotoUrls,
            notes: notes || null,
            verified_at: new Date().toISOString()
          });
        }

        if (result.error) throw result.error;

        statusDiv.innerHTML = '<p style="color:var(--accent-green);">✅ Key exchange verified successfully!</p>';
        showToast(`${stage === 'pickup' ? 'Pickup' : 'Return'} key exchange verified!`, 'success');
        
        setTimeout(() => {
          closeModal('key-exchange-modal');
          renderActiveJobs();
        }, 1500);
      } catch (err) {
        console.error('Key exchange submission error:', err);
        statusDiv.innerHTML = `<p style="color:var(--accent-red);">❌ Error: ${err.message || 'Failed to save key exchange'}</p>`;
        showToast('Failed to save key exchange', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '🔑 Verify Key Exchange';
      }
    }

    async function renderKeyExchangeSection(packageId) {
      const { data: keyExchanges, error } = await supabaseClient
        .from('key_exchanges')
        .select('*')
        .eq('package_id', packageId)
        .order('created_at', { ascending: true });

      const pickupExchange = keyExchanges?.find(e => e.stage === 'pickup');
      const returnExchange = keyExchanges?.find(e => e.stage === 'return');

      const renderExchangeCard = (exchange, stage, label, icon) => {
        if (exchange?.verified_at) {
          const photoGrid = exchange.key_photos?.length ? `
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
              <div style="width:50px;height:50px;border-radius:6px;overflow:hidden;border:2px solid var(--accent-gold);position:relative;cursor:pointer;" onclick="window.open('${exchange.driver_id_photo_url}','_blank')">
                <img src="${exchange.driver_id_photo_url}" style="width:100%;height:100%;object-fit:cover;">
                <div style="position:absolute;top:2px;right:2px;background:var(--accent-gold);color:#000;padding:1px 3px;border-radius:3px;font-size:0.55rem;font-weight:600;">ID</div>
              </div>
              ${exchange.key_photos.slice(0, 3).map(url => `
                <div style="width:50px;height:50px;border-radius:6px;overflow:hidden;border:1px solid var(--border-subtle);cursor:pointer;" onclick="window.open('${url}','_blank')">
                  <img src="${url}" style="width:100%;height:100%;object-fit:cover;">
                </div>
              `).join('')}
            </div>
          ` : '';
          
          return `
            <div style="display:flex;gap:12px;padding:12px;background:var(--bg-input);border-radius:var(--radius-md);border-left:3px solid var(--accent-green);margin-bottom:12px;">
              <div style="font-size:20px;">${icon}</div>
              <div style="flex:1;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                  <span style="font-weight:600;font-size:0.9rem;">${label}</span>
                  <span style="background:var(--accent-green);color:#fff;padding:2px 8px;border-radius:12px;font-size:0.7rem;font-weight:600;">✓ Verified</span>
                </div>
                <div style="font-size:0.75rem;color:var(--text-muted);">${new Date(exchange.verified_at).toLocaleString()}</div>
                ${exchange.notes ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin-top:6px;">${exchange.notes}</div>` : ''}
                ${photoGrid}
              </div>
            </div>
          `;
        } else {
          return `
            <div style="display:flex;gap:12px;padding:12px;background:var(--bg-input);border-radius:var(--radius-md);border-left:3px solid var(--border-subtle);margin-bottom:12px;">
              <div style="font-size:20px;opacity:0.5;">${icon}</div>
              <div style="flex:1;">
                <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;color:var(--text-muted);">${label}</div>
                <button class="btn btn-secondary btn-sm" onclick="openKeyExchangeModal('${packageId}', '${stage}')">🔑 Verify ${label}</button>
              </div>
            </div>
          `;
        }
      };

      return `
        <div class="logistics-section">
          <div class="logistics-section-header">
            <div class="logistics-section-title">🔑 Key Exchange Verification</div>
          </div>
          <div class="logistics-section-content">
            <p style="color:var(--text-muted);margin-bottom:16px;font-size:0.9rem;">Document key handoffs to verify custody and protect both parties.</p>
            ${renderExchangeCard(pickupExchange, 'pickup', 'Pickup Key Exchange', '🔵')}
            ${renderExchangeCard(returnExchange, 'return', 'Return Key Exchange', '🟣')}
          </div>
        </div>
      `;
    }

    // ========== URGENT UPDATES SYSTEM ==========
    let currentUpsellPackageId = null;
    let currentUpsellMemberId = null;
    let currentUpdateType = 'cost_increase';

    const updateTypeConfig = {
      cost_increase: {
        title: 'Send Update to Member',
        alertBox: '<strong>Cost Increase:</strong> The member has 24 hours to approve, decline, or seek competing bids.',
        alertStyle: 'background:var(--accent-orange-soft);border-color:rgba(245,158,11,0.3);color:var(--accent-orange);',
        titleLabel: 'Issue Found *',
        titlePlaceholder: 'e.g., Worn brake pads, Leaking coolant hose',
        showCost: true,
        requiresCost: true,
        buttonText: 'Send Cost Request',
        successMsg: 'Cost increase request sent. Member has 24 hours to respond.'
      },
      car_ready: {
        title: 'Notify: Car Ready for Pickup',
        alertBox: '<strong>Car Ready:</strong> Let the member know their vehicle is ready to be picked up.',
        alertStyle: 'background:var(--accent-green-soft);border-color:rgba(46,204,113,0.3);color:var(--accent-green);',
        titleLabel: 'Pickup Instructions',
        titlePlaceholder: 'e.g., Ready after 3pm, Ask for Mike at front desk',
        showCost: false,
        requiresCost: false,
        buttonText: 'Notify Member',
        successMsg: 'Member notified that their car is ready for pickup!'
      },
      work_paused: {
        title: 'Alert: Work Paused',
        alertBox: '<strong>Work Paused:</strong> Work cannot continue until the member responds. They will receive an urgent notification.',
        alertStyle: 'background:var(--accent-red-soft);border-color:rgba(231,76,60,0.3);color:var(--accent-red);',
        titleLabel: 'Reason for Pause *',
        titlePlaceholder: 'e.g., Found unexpected damage, Need authorization for parts',
        showCost: true,
        requiresCost: false,
        buttonText: 'Send Urgent Alert',
        successMsg: 'Urgent alert sent. Member will be notified immediately.'
      },
      question: {
        title: 'Ask Member a Question',
        alertBox: '<strong>Question:</strong> Ask the member a question that needs their input before you can proceed.',
        alertStyle: 'background:var(--accent-blue-soft);border-color:rgba(74,124,255,0.3);color:var(--accent-blue);',
        titleLabel: 'Your Question *',
        titlePlaceholder: 'e.g., Do you want the OEM or aftermarket parts?',
        showCost: false,
        requiresCost: false,
        buttonText: 'Send Question',
        successMsg: 'Question sent to member. They will be notified to respond.'
      },
      request_call: {
        title: 'Request Phone Call',
        alertBox: '<strong>Request Call:</strong> Ask the member to call you. They will receive an SMS and email with your contact info.',
        alertStyle: 'background:var(--accent-purple-soft, rgba(147,112,219,0.15));border-color:rgba(147,112,219,0.3);color:var(--accent-purple, #9370DB);',
        titleLabel: 'Reason for Call *',
        titlePlaceholder: 'e.g., Need to discuss options, Complex issue to explain',
        showCost: false,
        requiresCost: false,
        buttonText: 'Request Call',
        successMsg: 'Call request sent. Member will be notified to call you.'
      }
    };

    function selectUpdateType(type) {
      currentUpdateType = type;
      document.getElementById('upsell-update-type').value = type;
      
      document.querySelectorAll('.update-type-card').forEach(card => {
        const cardType = card.dataset.type;
        if (cardType === type) {
          card.classList.add('active');
          card.style.borderColor = getTypeColor(type);
          card.style.background = getTypeBgColor(type);
        } else {
          card.classList.remove('active');
          card.style.borderColor = 'var(--border-subtle)';
          card.style.background = 'var(--bg-input)';
        }
      });

      const config = updateTypeConfig[type];
      document.getElementById('update-modal-title').textContent = config.title;
      document.getElementById('update-alert-box').innerHTML = config.alertBox;
      document.getElementById('update-alert-box').style.cssText = config.alertStyle + 'margin-bottom:20px;padding:16px;border-radius:var(--radius-md);border-width:1px;border-style:solid;';
      document.getElementById('upsell-title-label').textContent = config.titleLabel;
      document.getElementById('upsell-title').placeholder = config.titlePlaceholder;
      document.getElementById('cost-fields').style.display = config.showCost ? 'grid' : 'none';
      document.getElementById('send-update-btn').textContent = config.buttonText;
      
      if (type === 'work_paused') {
        document.getElementById('upsell-urgent').checked = true;
      }
    }

    function getTypeColor(type) {
      const colors = { cost_increase: 'var(--accent-orange)', car_ready: 'var(--accent-green)', work_paused: 'var(--accent-red)', question: 'var(--accent-blue)', request_call: 'var(--accent-purple, #9370DB)' };
      return colors[type] || 'var(--accent-gold)';
    }

    function getTypeBgColor(type) {
      const colors = { cost_increase: 'var(--accent-orange-soft)', car_ready: 'var(--accent-green-soft)', work_paused: 'var(--accent-red-soft)', question: 'var(--accent-blue-soft)', request_call: 'var(--accent-purple-soft, rgba(147,112,219,0.15))' };
      return colors[type] || 'var(--bg-input)';
    }

    function openUpsellModal(packageId, memberId) {
      currentUpsellPackageId = packageId;
      currentUpsellMemberId = memberId;
      currentUpdateType = 'cost_increase';
      document.getElementById('upsell-title').value = '';
      document.getElementById('upsell-description').value = '';
      document.getElementById('upsell-cost').value = '';
      document.getElementById('upsell-urgency').value = 'recommended';
      document.getElementById('upsell-urgent').checked = false;
      document.getElementById('upsell-update-type').value = 'cost_increase';
      selectUpdateType('cost_increase');
      document.getElementById('upsell-modal').classList.add('active');
    }

    async function submitUpsellRequest() {
      const updateType = document.getElementById('upsell-update-type').value;
      const config = updateTypeConfig[updateType];
      const title = document.getElementById('upsell-title').value.trim();
      const description = document.getElementById('upsell-description').value.trim();
      const cost = parseFloat(document.getElementById('upsell-cost').value) || 0;
      const urgency = document.getElementById('upsell-urgency').value;
      const isUrgent = document.getElementById('upsell-urgent').checked;

      if (!title) {
        return showToast('Please provide a title or description.', 'error');
      }
      if (config.requiresCost && !cost) {
        return showToast('Please provide an estimated cost.', 'error');
      }

      const requiresResponse = updateType !== 'car_ready';
      const finalIsUrgent = isUrgent || updateType === 'work_paused' || updateType === 'request_call';

      // Cost increases have 4-hour deadline, others have 24 hours
      const deadlineHours = updateType === 'cost_increase' ? 4 : 24;
      const expiresAt = new Date(Date.now() + deadlineHours * 60 * 60 * 1000).toISOString();
      
      const { error } = await supabaseClient.from('upsell_requests').insert({
        package_id: currentUpsellPackageId,
        provider_id: currentUser.id,
        member_id: currentUpsellMemberId,
        title: title,
        description: description,
        estimated_cost: cost || null,
        urgency: urgency,
        status: 'pending',
        update_type: updateType,
        requires_response: requiresResponse,
        is_urgent: finalIsUrgent,
        call_requested: updateType === 'request_call',
        expires_at: expiresAt
      });

      if (error) {
        console.error('Error sending update:', error);
        return showToast('Failed to send update: ' + error.message, 'error');
      }

      const pkg = myJobs.find(j => j.id === currentUpsellPackageId) || openPackages.find(p => p.id === currentUpsellPackageId);
      const packageTitle = pkg?.title || 'Your Service Request';

      try {
        await fetch('/api/notify/urgent-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            memberId: currentUpsellMemberId,
            providerName: providerProfile?.business_name || 'Your Provider',
            updateType: updateType,
            title: title,
            description: description,
            estimatedCost: cost || null,
            isUrgent: finalIsUrgent,
            packageTitle: packageTitle,
            dashboardUrl: ((window.MCC_CONFIG && window.MCC_CONFIG.siteUrl) || 'https://mycarconcierge.com') + '/members.html',
            deadlineHours: deadlineHours
          })
        });
      } catch (notifyError) {
        console.log('Notification API call failed (non-critical):', notifyError);
      }

      closeModal('upsell-modal');
      showToast(config.successMsg, 'success');
    }
    
    function getTimeRemaining(expiresAt) {
      const now = new Date();
      const expiry = new Date(expiresAt);
      const diff = expiry - now;
      if (diff <= 0) return null;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      if (hours > 0) return `${hours}h ${minutes}m left`;
      return `${minutes}m left`;
    }
    
    async function suspendWork(packageId, upsellId) {
      if (!confirm('Suspend work on this job until the member responds to your price adjustment?\n\nThe member will be notified that work is paused.')) return;
      
      // Update upsell request status to indicate work is suspended
      const { error: upsellError } = await supabaseClient
        .from('upsell_requests')
        .update({ 
          status: 'expired',
          work_suspended: true,
          suspended_at: new Date().toISOString()
        })
        .eq('id', upsellId);
      
      if (upsellError) {
        console.error('Error suspending work:', upsellError);
        showToast('Failed to suspend work: ' + upsellError.message, 'error');
        return;
      }
      
      // Notify the member
      const pkg = myJobs.find(j => j.id === packageId);
      if (pkg?.member_id) {
        try {
          await supabaseClient.from('notifications').insert({
            user_id: pkg.member_id,
            type: 'work_suspended',
            title: '⏸️ Work Suspended',
            message: `${providerProfile?.business_name || 'Your provider'} has suspended work on "${pkg.title || 'your service'}" pending your response to the price adjustment request.`,
            link_type: 'upsell'
          });
          
          // Also send email/SMS notification
          await fetch('/api/notify/urgent-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              memberId: pkg.member_id,
              providerName: providerProfile?.business_name || 'Your Provider',
              updateType: 'work_paused',
              title: 'Work Suspended - Response Required',
              description: 'Work has been suspended pending your approval of the price adjustment. Please respond as soon as possible.',
              isUrgent: true,
              packageTitle: pkg.title || 'Your Service Request',
              dashboardUrl: ((window.MCC_CONFIG && window.MCC_CONFIG.siteUrl) || 'https://mycarconcierge.com') + '/members.html'
            })
          });
        } catch (e) {
          console.log('Notification failed (non-critical):', e);
        }
      }
      
      showToast('Work suspended. Member has been notified.', 'success');
      await renderMyJobs();
    }

    async function viewPackageDetails(packageId) {
      const pkg = openPackages.find(p => p.id === packageId);
      if (!pkg) return;

      // Fetch photos for this package
      const { data: photos } = await supabaseClient
        .from('package_photos')
        .select('*')
        .eq('package_id', packageId);
      
      // Fetch destination service details if applicable
      let destService = pkg._destinationService;
      if (pkg.category === 'destination_service' && !destService) {
        const { data } = await fetchDestinationServiceDetails(packageId);
        destService = data;
      }
        
      const vehicle = pkg.vehicles;
      const vehicleName = vehicle ? (vehicle.nickname || `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim()) : 'Vehicle';

      // Location display
      const locationDisplay = pkg.member_city && pkg.member_state 
        ? `${pkg.member_city}, ${pkg.member_state}` 
        : (pkg.member_zip || 'Location N/A');

      // Build destination service details HTML
      let destinationDetailsHtml = '';
      if (pkg.category === 'destination_service' && destService) {
        const dsIcon = getDestinationServiceIcon(destService.service_type);
        const dsLabel = getDestinationServiceLabel(destService.service_type);
        
        let serviceSpecificHtml = '';
        
        if (destService.service_type === 'airport') {
          serviceSpecificHtml = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              ${destService.flight_datetime ? `<div><span style="color:var(--text-muted);font-size:0.85rem;">Flight Date/Time</span><div style="font-weight:500;">${formatDestinationDateTime(destService.flight_datetime)}</div></div>` : ''}
              ${destService.flight_number ? `<div><span style="color:var(--text-muted);font-size:0.85rem;">Flight Number</span><div style="font-weight:500;">${destService.flight_number}</div></div>` : ''}
              ${destService.airline ? `<div><span style="color:var(--text-muted);font-size:0.85rem;">Airline</span><div style="font-weight:500;">${destService.airline}</div></div>` : ''}
              ${destService.parking_preference ? `<div><span style="color:var(--text-muted);font-size:0.85rem;">Parking Preference</span><div style="font-weight:500;">${destService.parking_preference}</div></div>` : ''}
              ${destService.trip_type ? `<div><span style="color:var(--text-muted);font-size:0.85rem;">Trip Type</span><div style="font-weight:500;">${destService.trip_type}</div></div>` : ''}
              ${destService.return_datetime ? `<div><span style="color:var(--text-muted);font-size:0.85rem;">Return Date</span><div style="font-weight:500;">${formatDestinationDateTime(destService.return_datetime)}</div></div>` : ''}
            </div>
          `;
        } else if (destService.service_type === 'dealership') {
          serviceSpecificHtml = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              ${destService.dealership_name ? `<div><span style="color:var(--text-muted);font-size:0.85rem;">Dealership</span><div style="font-weight:500;">${destService.dealership_name}</div></div>` : ''}
              ${destService.dealership_service_type ? `<div><span style="color:var(--text-muted);font-size:0.85rem;">Service Type</span><div style="font-weight:500;">${destService.dealership_service_type}</div></div>` : ''}
              ${destService.appointment_datetime ? `<div><span style="color:var(--text-muted);font-size:0.85rem;">Appointment</span><div style="font-weight:500;">${formatDestinationDateTime(destService.appointment_datetime)}</div></div>` : ''}
              ${destService.dealership_address ? `<div style="grid-column:span 2;"><span style="color:var(--text-muted);font-size:0.85rem;">Dealership Address</span><div style="font-weight:500;">${destService.dealership_address}</div></div>` : ''}
            </div>
          `;
        } else if (destService.service_type === 'detailing') {
          serviceSpecificHtml = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              ${destService.detail_level || destService.detail_service_level ? `<div><span style="color:var(--text-muted);font-size:0.85rem;">Detail Level</span><div style="font-weight:500;">${destService.detail_level || destService.detail_service_level}</div></div>` : ''}
              ${destService.event_datetime ? `<div><span style="color:var(--text-muted);font-size:0.85rem;">Scheduled Time</span><div style="font-weight:500;">${formatDestinationDateTime(destService.event_datetime)}</div></div>` : ''}
            </div>
          `;
        } else if (destService.service_type === 'valet') {
          serviceSpecificHtml = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              ${destService.event_name || destService.valet_event_name ? `<div><span style="color:var(--text-muted);font-size:0.85rem;">Event</span><div style="font-weight:500;">${destService.event_name || destService.valet_event_name}</div></div>` : ''}
              ${destService.event_venue || destService.valet_venue ? `<div><span style="color:var(--text-muted);font-size:0.85rem;">Venue</span><div style="font-weight:500;">${destService.event_venue || destService.valet_venue}</div></div>` : ''}
              ${destService.event_datetime ? `<div><span style="color:var(--text-muted);font-size:0.85rem;">Event Time</span><div style="font-weight:500;">${formatDestinationDateTime(destService.event_datetime)}</div></div>` : ''}
              ${destService.expected_duration ? `<div><span style="color:var(--text-muted);font-size:0.85rem;">Expected Duration</span><div style="font-weight:500;">${destService.expected_duration}</div></div>` : ''}
            </div>
          `;
        }
        
        destinationDetailsHtml = `
          <div style="margin-bottom:20px;padding:20px;background:var(--accent-blue-soft);border-radius:var(--radius-lg);border:1px solid rgba(74, 124, 255, 0.25);">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
              <span style="font-size:1.5rem;">${dsIcon}</span>
              <strong style="font-size:1.1rem;color:var(--accent-blue);">${dsLabel}</strong>
            </div>
            
            <div style="margin-bottom:16px;padding:12px 16px;background:var(--bg-card);border-radius:var(--radius-md);">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span style="color:var(--accent-green);">📍</span>
                <span style="color:var(--text-muted);font-size:0.85rem;">Pickup Location</span>
              </div>
              <div style="font-weight:500;margin-bottom:12px;">${destService.pickup_location || 'To be confirmed'}</div>
              
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span style="color:var(--accent-gold);">🎯</span>
                <span style="color:var(--text-muted);font-size:0.85rem;">Destination</span>
              </div>
              <div style="font-weight:500;">${destService.dropoff_location || 'To be confirmed'}</div>
            </div>
            
            ${serviceSpecificHtml}
            
            ${destService.special_instructions ? `
              <div style="margin-top:16px;padding:12px 16px;background:var(--bg-card);border-radius:var(--radius-md);border-left:3px solid var(--accent-gold);">
                <div style="color:var(--text-muted);font-size:0.85rem;margin-bottom:4px;">📝 Special Instructions</div>
                <div style="color:var(--text-secondary);line-height:1.5;">${destService.special_instructions}</div>
              </div>
            ` : ''}
          </div>
        `;
      }

      document.getElementById('package-details-title').textContent = pkg.title;
      document.getElementById('package-details-body').innerHTML = `
        ${pkg._isPrivateJob ? `
          <div style="margin-bottom:20px;padding:16px;background:linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(168, 85, 247, 0.1));border:1px solid rgba(139, 92, 246, 0.5);border-radius:var(--radius-md);display:flex;align-items:center;gap:12px;">
            <span style="font-size:1.5rem;">🔒</span>
            <div>
              <div style="font-weight:600;color:#a78bfa;font-size:1rem;">Private Request</div>
              <div style="font-size:0.9rem;color:var(--text-secondary);">This customer sent this request directly to you. No competitive bidding - accept directly!</div>
            </div>
          </div>
        ` : ''}
        <div style="margin-bottom:20px;">
          <div class="package-meta">
            <span>🚗 ${vehicleName}</span>
            <span>📍 ${locationDisplay}</span>
            <span>📅 Posted ${new Date(pkg.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        ${destinationDetailsHtml}
        <div style="margin-bottom:20px;">
          <strong>Service Details</strong>
          <div class="package-meta" style="margin-top:8px;">
            <span>Category: ${formatCategory(pkg.category) || 'General'}</span>
            <span>Type: ${pkg.service_type || 'Not specified'}</span>
          </div>
        </div>
        <div style="margin-bottom:20px;">
          <strong>Requirements</strong>
          <div class="package-meta" style="margin-top:8px;">
            <span>🔄 ${formatFrequency(pkg.frequency)}</span>
            <span>🔧 ${pkg.parts_preference || 'Standard'} parts</span>
            <span>🚗 ${formatPickup(pkg.pickup_preference)}</span>
          </div>
          ${pkg.preferred_schedule ? `<p style="margin-top:8px;color:var(--text-secondary);">Preferred timing: ${pkg.preferred_schedule}</p>` : ''}
        </div>
        ${pkg.oil_preference ? (() => {
          try {
            const oilPref = typeof pkg.oil_preference === 'string' ? JSON.parse(pkg.oil_preference) : pkg.oil_preference;
            if (oilPref.choice === 'provider') {
              return `<div style="margin-bottom:20px;padding:12px 16px;background:var(--accent-gold-soft);border-radius:var(--radius-md);border-left:3px solid var(--accent-gold);">
                <strong>🛢️ Oil/Fluid Preference</strong>
                <p style="color:var(--text-secondary);margin-top:8px;">Provider's choice based on vehicle specs & manufacturer recommendations</p>
              </div>`;
            } else if (oilPref.choice === 'specify') {
              return `<div style="margin-bottom:20px;padding:12px 16px;background:var(--accent-gold-soft);border-radius:var(--radius-md);border-left:3px solid var(--accent-gold);">
                <strong>🛢️ Oil/Fluid Preference</strong>
                <div style="margin-top:8px;display:flex;gap:16px;flex-wrap:wrap;">
                  <span style="color:var(--text-secondary);">Type: <strong style="color:var(--text-primary);">${oilPref.oil_type || 'Not specified'}</strong></span>
                  ${oilPref.brand_preference ? `<span style="color:var(--text-secondary);">Brand: <strong style="color:var(--text-primary);">${oilPref.brand_preference}</strong></span>` : ''}
                </div>
              </div>`;
            }
            return '';
          } catch (e) { return ''; }
        })() : ''}
        ${pkg.description ? `<div style="margin-bottom:20px;"><strong>Description</strong><p style="color:var(--text-secondary);margin-top:8px;line-height:1.6;">${pkg.description}</p></div>` : ''}
        ${pkg.insurance_claim ? `<div style="margin-bottom:20px;padding:12px;background:var(--accent-gold-soft);border-radius:var(--radius-md);"><strong>⚠️ Insurance Claim</strong><p style="color:var(--text-secondary);margin-top:4px;">Carrier: ${pkg.insurance_company || 'N/A'} • Claim #: ${pkg.claim_number || 'N/A'}</p></div>` : ''}
        ${photos?.length ? `
          <div style="margin-bottom:20px;">
            <strong>📷 Photos (${photos.length})</strong>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-top:12px;">
              ${photos.map(p => `
                <div style="aspect-ratio:1;border-radius:var(--radius-md);overflow:hidden;border:1px solid var(--border-subtle);cursor:pointer;" onclick="window.open('${p.url}','_blank')">
                  <img src="${p.url}" style="width:100%;height:100%;object-fit:cover;">
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        <div style="display:flex;gap:12px;margin-top:24px;">
          ${pkg._isPrivateJob ? `
            <button class="btn btn-primary" onclick="closeModal('package-details-modal');acceptPrivateJob('${packageId}')" style="background:linear-gradient(135deg, #8b5cf6, #a855f7);">
              ⚡ Accept Private Job
            </button>
          ` : `
            ${!myBids.some(b => b.package_id === packageId) ? `<button class="btn btn-primary" onclick="closeModal('package-details-modal');openBidModal('${packageId}', '${pkg.title.replace(/'/g, "\\'")}')">Submit Bid</button>` : '<span style="color:var(--accent-green);">✓ You\'ve already bid on this package</span>'}
          `}
        </div>
      `;
      document.getElementById('package-details-modal').classList.add('active');
    }

    async function acceptPrivateJob(packageId) {
      if (!confirm('Accept this private job request? This will assign the job directly to you.')) {
        return;
      }
      
      try {
        const pkg = openPackages.find(p => p.id === packageId);
        if (!pkg || !pkg._isPrivateJob) {
          showToast('This job is not a private request', 'error');
          return;
        }
        
        // Create a bid record marked as accepted (to track the job)
        const { data: bidData, error: bidError } = await supabaseClient.from('bids').insert({
          package_id: packageId,
          provider_id: currentUser.id,
          price: 0, // Price to be discussed directly with customer
          notes: 'Private job - accepted directly without bidding',
          status: 'accepted'
        }).select().single();
        
        if (bidError) {
          console.error('Error creating bid for private job:', bidError);
          showToast('Failed to accept job: ' + (bidError.message || 'Unknown error'), 'error');
          return;
        }
        
        // Update package status to in_progress
        const { error: pkgError } = await supabaseClient
          .from('maintenance_packages')
          .update({ 
            status: 'in_progress',
            accepted_bid_id: bidData.id
          })
          .eq('id', packageId);
        
        if (pkgError) {
          console.error('Error updating package status:', pkgError);
          showToast('Failed to update job status: ' + (pkgError.message || 'Unknown error'), 'error');
          return;
        }
        
        showToast('Private job accepted! Contact the customer to discuss details.', 'success');
        
        // Reload data
        await Promise.all([loadOpenPackages(), loadMyBids()]);
        updateStats();
        
      } catch (err) {
        console.error('Accept private job error:', err);
        showToast('An error occurred. Please try again.', 'error');
      }
    }

    let isUpdatingBid = false;
    
    async function openBidModal(packageId, title, existingPrice = null) {
      currentBidPackageId = packageId;
      isUpdatingBid = existingPrice !== null && existingPrice > 0;
      
      document.getElementById('bid-package-title').textContent = isUpdatingBid ? `Update Bid: ${title}` : title;
      ['bid-price', 'bid-duration', 'bid-parts', 'bid-labor', 'bid-availability', 'bid-notes'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('bid-price-custom').value = '';
      document.getElementById('bid-price-custom').style.display = 'none';
      
      // Handle destination service details
      const destDetailsEl = document.getElementById('bid-destination-details');
      const pkg = openPackages.find(p => p.id === packageId);
      
      // Fetch destination service data if it's a destination package and not already loaded
      if (pkg && isDestinationPackage(pkg) && !pkg._destinationService) {
        try {
          const { data, error } = await fetchDestinationServiceDetails(packageId);
          if (data && !error) {
            pkg._destinationService = data;
          }
        } catch (e) {
          console.error('Error fetching destination service details:', e);
        }
      }
      
      if (pkg && isDestinationPackage(pkg) && pkg._destinationService) {
        const ds = pkg._destinationService;
        destDetailsEl.style.display = 'block';
        
        // Service type
        const serviceTypeLabel = getDestinationServiceLabel(ds.service_type);
        const serviceTypeIcon = getDestinationServiceIcon(ds.service_type);
        document.getElementById('bid-dest-service-type').innerHTML = `<strong>${serviceTypeIcon} ${serviceTypeLabel}</strong>`;
        
        // Locations
        document.getElementById('bid-dest-pickup').textContent = ds.pickup_location || 'To be confirmed';
        document.getElementById('bid-dest-dropoff').textContent = ds.dropoff_location || 'To be confirmed';
        
        // Schedule
        const scheduleEl = document.getElementById('bid-dest-schedule');
        if (ds.scheduled_date || ds.scheduled_time) {
          const dateStr = ds.scheduled_date ? new Date(ds.scheduled_date).toLocaleDateString() : '';
          const timeStr = ds.scheduled_time || '';
          scheduleEl.innerHTML = `🕐 ${dateStr} ${timeStr}`.trim();
          scheduleEl.style.display = 'flex';
        } else {
          scheduleEl.style.display = 'none';
        }
        
        // Special instructions
        const instructionsEl = document.getElementById('bid-dest-instructions');
        if (ds.special_instructions) {
          instructionsEl.textContent = '📝 ' + ds.special_instructions;
          instructionsEl.style.display = 'block';
        } else {
          instructionsEl.style.display = 'none';
        }
      } else {
        destDetailsEl.style.display = 'none';
      }
      
      // Reset pricing confirmation checkbox
      const pricingConfirm = document.getElementById('bid-pricing-confirm');
      if (pricingConfirm) pricingConfirm.checked = false;
      
      // Pre-select existing price if updating
      if (existingPrice) {
        const priceSelect = document.getElementById('bid-price');
        const matchingOption = Array.from(priceSelect.options).find(o => o.value === String(existingPrice));
        if (matchingOption) {
          priceSelect.value = String(existingPrice);
        } else {
          priceSelect.value = 'custom';
          document.getElementById('bid-price-custom').value = existingPrice;
          document.getElementById('bid-price-custom').style.display = 'block';
        }
      }
      
      // Update submit button text
      const submitBtn = document.querySelector('#bid-modal .btn-primary');
      submitBtn.textContent = isUpdatingBid ? 'Update Bid (Free)' : 'Submit Bid';
      
      document.getElementById('bid-modal').classList.add('active');
      
      // Add listener for custom amount
      document.getElementById('bid-price').onchange = function() {
        const customInput = document.getElementById('bid-price-custom');
        if (this.value === 'custom') {
          customInput.style.display = 'block';
          customInput.focus();
        } else {
          customInput.style.display = 'none';
        }
      };
      
      // Reset and initialize bid calculator
      resetBidCalculator();
      
      // Load competition data for this package
      if (pkg) {
        loadCompetitionData(packageId, pkg.categories?.[0] || 'General');
      }
    }

    // ========== BID CALCULATOR FUNCTIONS ==========
    
    // State tax rates (hardcoded for now)
    const STATE_TAX_RATES = {
      'AL': 4.0, 'AK': 0.0, 'AZ': 5.6, 'AR': 6.5, 'CA': 7.25, 'CO': 2.9, 'CT': 6.35, 'DE': 0.0,
      'FL': 6.0, 'GA': 4.0, 'HI': 4.0, 'ID': 6.0, 'IL': 6.25, 'IN': 7.0, 'IA': 6.0, 'KS': 6.5,
      'KY': 6.0, 'LA': 4.45, 'ME': 5.5, 'MD': 6.0, 'MA': 6.25, 'MI': 6.0, 'MN': 6.875, 'MS': 7.0,
      'MO': 4.225, 'MT': 0.0, 'NE': 5.5, 'NV': 6.85, 'NH': 0.0, 'NJ': 6.625, 'NM': 5.125, 'NY': 4.0,
      'NC': 4.75, 'ND': 5.0, 'OH': 5.75, 'OK': 4.5, 'OR': 0.0, 'PA': 6.0, 'RI': 7.0, 'SC': 6.0,
      'SD': 4.5, 'TN': 7.0, 'TX': 6.25, 'UT': 5.95, 'VT': 6.0, 'VA': 5.3, 'WA': 6.5, 'WV': 6.0,
      'WI': 5.0, 'WY': 4.0, 'DC': 6.0
    };
    
    const PLATFORM_FEE_PERCENT = 10;
    
    let calculatorCompetitionData = { minBid: 0, maxBid: 0, avgBid: 0, count: 0 };
    
    function getStateTaxRate(stateCode) {
      if (!stateCode) return 0;
      const code = stateCode.toUpperCase().trim();
      return STATE_TAX_RATES[code] || 0;
    }
    
    function toggleBidCalculator() {
      const toggle = document.querySelector('.bid-calculator-toggle');
      const container = document.getElementById('bid-calculator');
      toggle.classList.toggle('active');
      container.classList.toggle('active');
    }
    
    function resetBidCalculator() {
      // Reset all calculator inputs
      document.getElementById('calc-parts').value = '';
      document.getElementById('calc-labor-hours').value = '';
      document.getElementById('calc-labor-rate').value = providerProfile?.hourly_rate || '75';
      document.getElementById('calc-profit-margin').value = '20';
      document.getElementById('calc-profit-value').textContent = '20%';
      document.getElementById('calc-travel-enabled').checked = false;
      document.getElementById('calc-travel').value = '';
      document.getElementById('calc-transport-enabled').checked = false;
      document.getElementById('calc-transport').value = '';
      document.getElementById('calc-urgency').checked = false;
      
      // Reset toggle state
      document.querySelector('.bid-calculator-toggle').classList.remove('active');
      document.getElementById('bid-calculator').classList.remove('active');
      
      // Reset urgency row styling
      document.getElementById('calc-urgency-row').classList.remove('active');
      
      // Update display
      updateBidCalculation();
    }
    
    function updateBidCalculation() {
      // Get values
      const parts = parseFloat(document.getElementById('calc-parts').value) || 0;
      const laborHours = parseFloat(document.getElementById('calc-labor-hours').value) || 0;
      const laborRate = parseFloat(document.getElementById('calc-labor-rate').value) || 75;
      const profitMargin = parseFloat(document.getElementById('calc-profit-margin').value) || 20;
      const travelEnabled = document.getElementById('calc-travel-enabled').checked;
      const travel = travelEnabled ? (parseFloat(document.getElementById('calc-travel').value) || 0) : 0;
      const transportEnabled = document.getElementById('calc-transport-enabled').checked;
      const transport = transportEnabled ? (parseFloat(document.getElementById('calc-transport').value) || 0) : 0;
      const urgencyEnabled = document.getElementById('calc-urgency').checked;
      
      // Update profit margin display
      document.getElementById('calc-profit-value').textContent = profitMargin + '%';
      
      // Update urgency row styling
      document.getElementById('calc-urgency-row').classList.toggle('active', urgencyEnabled);
      
      // Calculate labor
      const labor = laborHours * laborRate;
      
      // Calculate subtotal (parts + labor)
      const subtotal = parts + labor;
      
      // Calculate profit
      const profit = subtotal * (profitMargin / 100);
      
      // Pre-rush subtotal
      const preRushSubtotal = subtotal + profit + travel + transport;
      
      // Rush fee (25% of pre-rush subtotal)
      const rushFee = urgencyEnabled ? preRushSubtotal * 0.25 : 0;
      
      // Pre-tax subtotal
      const preTaxSubtotal = preRushSubtotal + rushFee;
      
      // Get tax rate from provider's state
      const providerState = providerProfile?.state || providerProfile?.address?.state || '';
      const taxRate = getStateTaxRate(providerState);
      const tax = preTaxSubtotal * (taxRate / 100);
      
      // All-inclusive total
      const total = preTaxSubtotal + tax;
      
      // Platform fee and net earnings
      const platformFee = total * (PLATFORM_FEE_PERCENT / 100);
      const netEarnings = total - platformFee;
      
      // Update display elements
      document.getElementById('calc-display-parts').textContent = '$' + parts.toFixed(2);
      document.getElementById('calc-display-labor').textContent = '$' + labor.toFixed(2);
      document.getElementById('calc-display-labor-detail').textContent = `(${laborHours} hrs × $${laborRate}/hr)`;
      document.getElementById('calc-display-subtotal').textContent = '$' + subtotal.toFixed(2);
      document.getElementById('calc-display-profit-pct').textContent = profitMargin;
      document.getElementById('calc-display-profit').textContent = '+$' + profit.toFixed(2);
      
      // Toggle optional fee rows
      const travelRow = document.getElementById('calc-row-travel');
      const transportRow = document.getElementById('calc-row-transport');
      const rushRow = document.getElementById('calc-row-rush');
      
      if (travelEnabled && travel > 0) {
        travelRow.style.display = 'flex';
        document.getElementById('calc-display-travel').textContent = '+$' + travel.toFixed(2);
      } else {
        travelRow.style.display = 'none';
      }
      
      if (transportEnabled && transport > 0) {
        transportRow.style.display = 'flex';
        document.getElementById('calc-display-transport').textContent = '+$' + transport.toFixed(2);
      } else {
        transportRow.style.display = 'none';
      }
      
      if (urgencyEnabled) {
        rushRow.style.display = 'flex';
        document.getElementById('calc-display-rush').textContent = '+$' + rushFee.toFixed(2);
      } else {
        rushRow.style.display = 'none';
      }
      
      document.getElementById('calc-display-pretax').textContent = '$' + preTaxSubtotal.toFixed(2);
      document.getElementById('calc-display-tax-pct').textContent = taxRate.toFixed(1);
      document.getElementById('calc-display-tax').textContent = '$' + tax.toFixed(2);
      document.getElementById('calc-display-total').textContent = '$' + total.toFixed(2);
      document.getElementById('calc-display-platform-fee').textContent = '-$' + platformFee.toFixed(2);
      document.getElementById('calc-display-net').textContent = '$' + netEarnings.toFixed(2);
      
      // Update competition gauge
      updateCompetitionGauge(total);
    }
    
    async function loadCompetitionData(packageId, category) {
      try {
        // Get bid count for this specific package
        const { count: bidCount } = await supabaseClient
          .from('bids')
          .select('*', { count: 'exact', head: true })
          .eq('package_id', packageId);
        
        // Get historical bid stats for this category (last 90 days)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        
        const { data: categoryBids } = await supabaseClient
          .from('bids')
          .select('price, service_packages!inner(category)')
          .eq('service_packages.category', category)
          .gte('created_at', ninetyDaysAgo.toISOString())
          .not('price', 'is', null);
        
        if (categoryBids && categoryBids.length > 0) {
          const prices = categoryBids.map(b => b.price).filter(p => p > 0);
          const minBid = Math.min(...prices);
          const maxBid = Math.max(...prices);
          const avgBid = prices.reduce((a, b) => a + b, 0) / prices.length;
          
          // Store for gauge calculation
          window.competitionData = { minBid, maxBid, avgBid, bidCount: bidCount || 0 };
          calculatorCompetitionData = window.competitionData;
          
          // Update UI
          document.getElementById('calc-comp-category').textContent = category || 'this category';
          document.getElementById('calc-comp-range').textContent = 
            `$${Math.round(minBid)} - $${Math.round(maxBid)}`;
          document.getElementById('calc-comp-count').textContent = bidCount || 0;
        } else {
          // No historical data - show placeholder
          window.competitionData = null;
          calculatorCompetitionData = { minBid: 100, maxBid: 500, avgBid: 250, count: 0 };
          
          document.getElementById('calc-comp-category').textContent = category || 'this category';
          document.getElementById('calc-comp-range').textContent = 'No data yet';
          document.getElementById('calc-comp-count').textContent = bidCount || 0;
        }
        
        updateCompetitionGauge(0);
      } catch (err) {
        console.error('Error loading competition data:', err);
        // Graceful fallback - calculator still works
        window.competitionData = null;
        calculatorCompetitionData = { minBid: 100, maxBid: 500, avgBid: 250, count: 0 };
        document.getElementById('calc-comp-range').textContent = 'Unavailable';
        document.getElementById('calc-comp-count').textContent = '--';
      }
    }
    
    function updateCompetitionGauge(bidAmount) {
      const marker = document.getElementById('calc-gauge-marker');
      const fill = document.getElementById('calc-gauge-fill');
      const positionEl = document.getElementById('calc-gauge-position');
      
      if (!marker || !fill || !positionEl) return;
      
      const data = window.competitionData || calculatorCompetitionData;
      
      if (!data || !bidAmount || bidAmount <= 0) {
        marker.style.left = '50%';
        fill.className = 'calc-gauge-fill competitive';
        fill.style.width = '50%';
        positionEl.textContent = 'Enter values to see position';
        positionEl.className = 'calc-gauge-position';
        return;
      }
      
      const { minBid, maxBid, avgBid } = data;
      const range = maxBid - minBid;
      
      if (range <= 0) {
        marker.style.left = '50%';
        fill.className = 'calc-gauge-fill competitive';
        fill.style.width = '50%';
        positionEl.textContent = 'Competitive - Good position!';
        positionEl.className = 'calc-gauge-position competitive';
        return;
      }
      
      // Calculate position (0-100%)
      let position = ((bidAmount - minBid) / range) * 90 + 5;
      position = Math.max(5, Math.min(95, position));
      
      // Determine bid classification
      let classification, fillClass;
      const lowThreshold = avgBid * 0.85;
      const highThreshold = avgBid * 1.15;
      
      if (bidAmount < lowThreshold) {
        classification = 'Below Average - Great for winning!';
        fillClass = 'low';
      } else if (bidAmount > highThreshold) {
        classification = 'Above Average - Consider lowering';
        fillClass = 'high';
      } else {
        classification = 'Competitive - Good position!';
        fillClass = 'competitive';
      }
      
      // Update UI
      marker.style.left = position + '%';
      fill.className = 'calc-gauge-fill ' + fillClass;
      fill.style.width = position + '%';
      positionEl.textContent = classification;
      positionEl.className = 'calc-gauge-position ' + fillClass;
    }
    
    function applyCalculatorToForm() {
      // Get calculated values
      const parts = parseFloat(document.getElementById('calc-parts').value) || 0;
      const laborHours = parseFloat(document.getElementById('calc-labor-hours').value) || 0;
      const laborRate = parseFloat(document.getElementById('calc-labor-rate').value) || 75;
      const labor = laborHours * laborRate;
      
      // Get total from display (parse it back)
      const totalText = document.getElementById('calc-display-total').textContent;
      const total = parseFloat(totalText.replace('$', '').replace(',', '')) || 0;
      
      if (total <= 0) {
        showToast('Please enter values in the calculator first', 'error');
        return;
      }
      
      // Round to nearest reasonable amount
      const roundedTotal = Math.ceil(total);
      
      // Set the price field
      const priceSelect = document.getElementById('bid-price');
      const priceOptions = Array.from(priceSelect.options).map(o => parseFloat(o.value));
      const matchingOption = priceOptions.find(p => p === roundedTotal);
      
      if (matchingOption) {
        priceSelect.value = String(roundedTotal);
        document.getElementById('bid-price-custom').style.display = 'none';
      } else {
        priceSelect.value = 'custom';
        document.getElementById('bid-price-custom').value = roundedTotal;
        document.getElementById('bid-price-custom').style.display = 'block';
      }
      
      // Set parts and labor fields
      document.getElementById('bid-parts').value = parts > 0 ? Math.round(parts) : '';
      document.getElementById('bid-labor').value = labor > 0 ? Math.round(labor) : '';
      
      // Set duration estimate based on hours
      if (laborHours > 0) {
        document.getElementById('bid-duration').value = laborHours + ' hour' + (laborHours !== 1 ? 's' : '');
      }
      
      // Collapse the calculator
      document.querySelector('.bid-calculator-toggle').classList.remove('active');
      document.getElementById('bid-calculator').classList.remove('active');
      
      // Show success message
      showToast('Calculator values applied to bid form!', 'success');
    }
    
    // ========== END BID CALCULATOR FUNCTIONS ==========

    async function submitBid() {
      const priceSelect = document.getElementById('bid-price').value;
      const priceCustom = document.getElementById('bid-price-custom').value;
      const price = priceSelect === 'custom' ? priceCustom : priceSelect;
      
      if (!price || !currentBidPackageId) return showToast('Please select a price estimate', 'error');
      
      // Require all-inclusive pricing confirmation for new bids
      const pricingConfirmed = document.getElementById('bid-pricing-confirm')?.checked;
      if (!isUpdatingBid && !pricingConfirmed) {
        return showToast('Please confirm your bid is all-inclusive before submitting', 'error');
      }

      // Check if provider is suspended (for new bids only)
      if (!isUpdatingBid) {
        const suspensionCheck = await canProviderBid(currentUser.id);
        if (!suspensionCheck.canBid) {
          showToast('Your account is currently suspended due to low ratings. You cannot place new bids at this time.', 'error');
          closeModal('bid-modal');
          showSection('my-reviews');
          return;
        }
      }

      // Only check credits for new bids, not updates
      if (!isUpdatingBid) {
        const bidCredits = providerProfile?.bid_credits || 0;
        const freeBids = providerProfile?.free_trial_bids || 0;
        const totalCredits = bidCredits + freeBids;

        if (totalCredits <= 0) {
          showToast('No bid credits remaining. Purchase more to continue bidding.', 'error');
          showSection('subscription');
          closeModal('bid-modal');
          return;
        }
      }

      const bidData = {
        price: Number(price),
        parts_cost: document.getElementById('bid-parts').value ? Number(document.getElementById('bid-parts').value) : null,
        labor_cost: document.getElementById('bid-labor').value ? Number(document.getElementById('bid-labor').value) : null,
        estimated_duration: document.getElementById('bid-duration').value.trim() || null,
        available_dates: document.getElementById('bid-availability').value.trim() || null,
        notes: document.getElementById('bid-notes').value.trim() || null,
        updated_at: new Date().toISOString()
      };

      let error;
      
      if (isUpdatingBid) {
        // Update existing bid
        const result = await supabaseClient.from('bids')
          .update(bidData)
          .eq('package_id', currentBidPackageId)
          .eq('provider_id', currentUser.id);
        error = result.error;
      } else {
        // Insert new bid
        bidData.package_id = currentBidPackageId;
        bidData.provider_id = currentUser.id;
        bidData.status = 'pending';
        const result = await supabaseClient.from('bids').insert(bidData);
        error = result.error;
      }

      if (error) {
        console.error('Bid submission error:', error);
        return showToast('Failed to ' + (isUpdatingBid ? 'update' : 'submit') + ' bid: ' + (error.message || 'Unknown error'), 'error');
      }

      // Only deduct credit for new bids
      if (!isUpdatingBid) {
        const bidCredits = providerProfile?.bid_credits || 0;
        const freeBids = providerProfile?.free_trial_bids || 0;
        
        // Deduct bid credit (use free bids first, then paid credits)
        if (freeBids > 0) {
          await supabaseClient.from('profiles').update({
            free_trial_bids: freeBids - 1,
            total_bids_used: (providerProfile?.total_bids_used || 0) + 1
          }).eq('id', currentUser.id);
          providerProfile.free_trial_bids = freeBids - 1;
        } else {
          await supabaseClient.from('profiles').update({
            bid_credits: bidCredits - 1,
            total_bids_used: (providerProfile?.total_bids_used || 0) + 1
          }).eq('id', currentUser.id);
          providerProfile.bid_credits = bidCredits - 1;
        }
        providerProfile.total_bids_used = (providerProfile?.total_bids_used || 0) + 1;

        // Update sidebar badge
        updateCreditsBadge();
      }

      // Notify member of new/updated bid (in-app + email + SMS)
      const pkg = openPackages.find(p => p.id === currentBidPackageId);
      try {
        // In-app notification
        await supabaseClient.from('notifications').insert({
          user_id: pkg?.member_id,
          type: isUpdatingBid ? 'bid_updated' : 'bid_received',
          title: isUpdatingBid ? '🔄 Bid updated!' : '💰 New bid received!',
          message: `A provider has ${isUpdatingBid ? 'updated their bid to' : 'submitted a bid of'} $${Number(price).toFixed(2)} for "${pkg?.title || 'your package'}".`,
          link_type: 'package',
          link_id: currentBidPackageId
        });

        // Get member profile for email/SMS notification (only for new bids)
        if (!isUpdatingBid) {
          const { data: memberProfile } = await supabaseClient.from('profiles').select('*').eq('id', pkg?.member_id).single();
          const { count: totalBids } = await supabaseClient.from('bids').select('id', { count: 'exact' }).eq('package_id', currentBidPackageId);
          
          if (typeof EmailService !== 'undefined') {
            // Email notification
            if (memberProfile?.email) {
              const vehicleName = pkg?.vehicles ? `${pkg.vehicles.year || ''} ${pkg.vehicles.make} ${pkg.vehicles.model}`.trim() : 'Your vehicle';
              await EmailService.sendBidReceivedEmail(
                memberProfile.email,
                memberProfile.full_name || 'Member',
                pkg?.title || 'Maintenance Package',
                vehicleName,
                Number(price),
                totalBids || 1
              );
            }
            
            // SMS notification (if enabled)
            if (memberProfile?.sms_notifications && memberProfile?.sms_bid_received && memberProfile?.phone) {
              await EmailService.sendBidReceivedSms(
                memberProfile.phone,
                pkg?.title || 'Maintenance Package',
                Number(price)
              );
            }
          }
        }
      } catch (e) {
        console.log('Notification error (non-critical):', e);
      }

      closeModal('bid-modal');
      showToast(isUpdatingBid ? 'Bid updated successfully!' : 'Bid submitted successfully!', 'success');
      isUpdatingBid = false;
      await loadMyBids();
      await loadOpenPackages();
      updateStats();
    }

    async function openMessageWithMember(packageId, memberId) {
      currentMessagePackageId = packageId;
      currentMessageMemberId = memberId;

      const { data: messages } = await supabaseClient.from('messages').select('*').eq('package_id', packageId).or(`sender_id.eq.${currentUser.id},recipient_id.eq.${currentUser.id}`).order('created_at', { ascending: true });

      const thread = document.getElementById('message-thread');
      if (!messages?.length) {
        thread.innerHTML = '<p style="color:var(--text-muted);text-align:center;">No messages yet. Start the conversation!</p>';
      } else {
        thread.innerHTML = messages.map(m => `
          <div class="message ${m.sender_id === currentUser.id ? 'sent' : 'received'}">
            <div class="message-bubble">${m.content}</div>
            <div class="message-time">${new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        `).join('');
        thread.scrollTop = thread.scrollHeight;
      }

      document.getElementById('message-modal-title').textContent = 'Message Member';
      document.getElementById('message-input').value = '';
      document.getElementById('message-modal').classList.add('active');
    }

    async function sendMessage() {
      const input = document.getElementById('message-input');
      const content = input.value.trim();
      if (!content || !currentMessageMemberId || !currentMessagePackageId) return;

      await supabaseClient.from('messages').insert({
        package_id: currentMessagePackageId,
        sender_id: currentUser.id,
        recipient_id: currentMessageMemberId,
        content
      });

      input.value = '';
      await openMessageWithMember(currentMessagePackageId, currentMessageMemberId);
    }

    function closeModal(id) { document.getElementById(id).classList.remove('active'); }

    function formatFrequency(freq) {
      const map = { one_time: 'One-time', weekly: 'Weekly', bi_weekly: 'Bi-weekly', monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annually' };
      return map[freq] || freq || 'One-time';
    }

    function formatPickup(pref) {
      const map = { 
        provider_pickup: 'Provider pickup', 
        member_dropoff: 'Drop-off', 
        rideshare: 'Rideshare', 
        either: 'Flexible',
        destination_service: '🚗 Transport Service'
      };
      return map[pref] || pref || 'Flexible';
    }

    function showToast(msg, type = 'success') {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerHTML = `<span>${type === 'success' ? '✓' : '⚠'}</span><span>${msg}</span>`;
      document.getElementById('toast-container').appendChild(toast);
      setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    }

    // ========== PROVIDER PROFILE ==========
    async function loadProviderProfile() {
      const { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

      if (error) {
        console.error('Error loading profile:', error);
        return;
      }

      // Populate form fields
      document.getElementById('profile-business-name').value = profile.business_name || '';
      document.getElementById('profile-full-name').value = profile.full_name || '';
      document.getElementById('profile-phone').value = profile.business_phone || '';
      document.getElementById('profile-address').value = profile.business_address || '';
      document.getElementById('profile-years').value = profile.years_in_business || '';
      document.getElementById('profile-description').value = profile.description || '';
      
      // Service areas
      const zipCodes = profile.service_areas || [];
      document.getElementById('profile-zip-codes').value = zipCodes.join(', ');
      
      // Services offered
      const services = profile.services_offered || [];
      document.querySelectorAll('#services-grid input[type="checkbox"]').forEach(cb => {
        cb.checked = services.includes(cb.value);
      });
      
      // Certifications
      const certs = profile.certifications || [];
      const knownCerts = ['ASE Certified', 'ASE Master Technician', 'Manufacturer Certified', 'I-CAR Certified', 'EPA Certified', 'AAA Approved', 'BBB Accredited'];
      document.querySelectorAll('#certifications-grid input[type="checkbox"]').forEach(cb => {
        cb.checked = certs.includes(cb.value);
      });
      
      // Other certs (ones not in the checkbox list)
      const otherCerts = certs.filter(c => !knownCerts.includes(c));
      document.getElementById('profile-other-certs').value = otherCerts.join(', ');

      // Load business hours
      if (profile.business_hours) {
        setBusinessHours(profile.business_hours);
      }

      // Load blocked dates
      blockedDates = profile.blocked_dates || [];
      renderBlockedDates();

      // Load POS enabled setting
      const posEnabled = profile.pos_enabled || false;
      const posToggle = document.getElementById('pos-enabled-toggle');
      if (posToggle) {
        posToggle.checked = posEnabled;
      }
      updatePosMenuVisibility(posEnabled);

      updateProfileCompletion(profile);
      
      // Load verification status from provider_applications
      await loadVerificationStatus();
    }

    function updatePosMenuVisibility(enabled) {
      document.querySelectorAll('.pos-feature').forEach(el => {
        el.style.display = enabled ? 'flex' : 'none';
      });
    }

    async function togglePosFeatures(enabled) {
      updatePosMenuVisibility(enabled);
      
      // Save to database
      try {
        const { error } = await supabaseClient
          .from('profiles')
          .update({ pos_enabled: enabled })
          .eq('id', currentUser.id);
        
        if (error) {
          console.error('Error saving POS setting:', error);
          showToast('Failed to save POS setting', 'error');
        } else {
          showToast(enabled ? 'POS features enabled' : 'POS features disabled', 'success');
        }
      } catch (err) {
        console.error('Error toggling POS:', err);
      }
    }

    // ========== VERIFICATION STATUS ==========
    let providerApplication = null;

    async function loadVerificationStatus() {
      try {
        // Fetch provider application for this user
        const { data, error } = await supabaseClient
          .from('provider_applications')
          .select('*')
          .eq('user_id', currentUser.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.log('Error loading provider application:', error);
        }

        providerApplication = data;
        updateVerificationUI();
      } catch (err) {
        console.log('loadVerificationStatus error:', err);
      }
    }

    function getDocExpirationBadge(uploadDate) {
      if (!uploadDate) return '';
      const status = getExpirationStatus(uploadDate);
      if (status.status === 'expired') {
        return `<span class="expiration-badge expired">⚠️ Expired - Re-upload Required</span>`;
      } else if (status.status === 'expiring_soon') {
        return `<span class="expiration-badge expiring-soon">⏰ ${status.label}</span>`;
      } else {
        return `<span class="expiration-badge valid">✓ ${status.label}</span>`;
      }
    }

    function updateVerificationUI() {
      const app = providerApplication;
      let expiringDocs = [];
      let expiredDocs = [];
      
      // License verification
      const licenseItem = document.getElementById('verify-license');
      const licenseStatus = licenseItem.querySelector('.verify-status');
      const licenseBadge = licenseItem.querySelector('.verify-badge');
      const licenseViewBtn = document.getElementById('license-view-btn');
      const licenseUploadStatus = document.getElementById('license-upload-status');
      
      if (app?.license_verified) {
        licenseStatus.textContent = '✓';
        licenseBadge.textContent = 'Verified';
        licenseBadge.style.background = 'var(--accent-green-soft)';
        licenseBadge.style.color = 'var(--accent-green)';
        licenseItem.style.borderColor = 'var(--accent-green)';
        // Check expiration
        const expBadge = getDocExpirationBadge(app.license_uploaded_at);
        const expStatus = getExpirationStatus(app.license_uploaded_at);
        licenseUploadStatus.innerHTML = expBadge;
        if (expStatus.status === 'expired') expiredDocs.push('Business License');
        else if (expStatus.status === 'expiring_soon') expiringDocs.push('Business License');
      } else if (app?.business_license_url) {
        licenseStatus.textContent = '📄';
        licenseBadge.textContent = 'Under Review';
        licenseBadge.style.background = 'var(--accent-blue-soft)';
        licenseBadge.style.color = 'var(--accent-blue)';
        licenseViewBtn.href = app.business_license_url;
        licenseViewBtn.style.display = 'inline-flex';
        const expBadge = getDocExpirationBadge(app.license_uploaded_at);
        licenseUploadStatus.innerHTML = '<span style="color:var(--accent-blue);">✓ Document uploaded - awaiting verification</span>' + expBadge;
      }

      // Insurance verification
      const insuranceItem = document.getElementById('verify-insurance');
      const insuranceStatus = insuranceItem.querySelector('.verify-status');
      const insuranceBadge = insuranceItem.querySelector('.verify-badge');
      const insuranceViewBtn = document.getElementById('insurance-view-btn');
      const insuranceUploadStatus = document.getElementById('insurance-upload-status');
      
      if (app?.insurance_verified) {
        insuranceStatus.textContent = '✓';
        insuranceBadge.textContent = 'Verified';
        insuranceBadge.style.background = 'var(--accent-green-soft)';
        insuranceBadge.style.color = 'var(--accent-green)';
        insuranceItem.style.borderColor = 'var(--accent-green)';
        // Check expiration
        const expBadge = getDocExpirationBadge(app.insurance_uploaded_at);
        const expStatus = getExpirationStatus(app.insurance_uploaded_at);
        insuranceUploadStatus.innerHTML = expBadge;
        if (expStatus.status === 'expired') expiredDocs.push('Insurance Certificate');
        else if (expStatus.status === 'expiring_soon') expiringDocs.push('Insurance Certificate');
      } else if (app?.insurance_document_url) {
        insuranceStatus.textContent = '📄';
        insuranceBadge.textContent = 'Under Review';
        insuranceBadge.style.background = 'var(--accent-blue-soft)';
        insuranceBadge.style.color = 'var(--accent-blue)';
        insuranceViewBtn.href = app.insurance_document_url;
        insuranceViewBtn.style.display = 'inline-flex';
        const expBadge = getDocExpirationBadge(app.insurance_uploaded_at);
        insuranceUploadStatus.innerHTML = '<span style="color:var(--accent-blue);">✓ Document uploaded - awaiting verification</span>' + expBadge;
      }

      // Certifications verification
      const certsItem = document.getElementById('verify-certifications');
      const certsStatus = certsItem.querySelector('.verify-status');
      const certsBadge = certsItem.querySelector('.verify-badge');
      const certsViewBtn = document.getElementById('certifications-view-btn');
      const certsUploadStatus = document.getElementById('certifications-upload-status');
      
      if (app?.certifications_verified) {
        certsStatus.textContent = '✓';
        certsBadge.textContent = 'Verified';
        certsBadge.style.background = 'var(--accent-green-soft)';
        certsBadge.style.color = 'var(--accent-green)';
        certsItem.style.borderColor = 'var(--accent-green)';
        // Check expiration
        const expBadge = getDocExpirationBadge(app.certifications_uploaded_at);
        const expStatus = getExpirationStatus(app.certifications_uploaded_at);
        certsUploadStatus.innerHTML = expBadge;
        if (expStatus.status === 'expired') expiredDocs.push('Certifications');
        else if (expStatus.status === 'expiring_soon') expiringDocs.push('Certifications');
      } else if (app?.certifications_url) {
        certsStatus.textContent = '📄';
        certsBadge.textContent = 'Under Review';
        certsBadge.style.background = 'var(--accent-blue-soft)';
        certsBadge.style.color = 'var(--accent-blue)';
        certsViewBtn.href = app.certifications_url;
        certsViewBtn.style.display = 'inline-flex';
        const expBadge = getDocExpirationBadge(app.certifications_uploaded_at);
        certsUploadStatus.innerHTML = '<span style="color:var(--accent-blue);">✓ Document uploaded - awaiting verification</span>' + expBadge;
      }

      // Show verified badge if all three are verified
      if (app?.license_verified && app?.insurance_verified && app?.certifications_verified) {
        document.getElementById('verified-badge-container').style.display = 'block';
      } else {
        document.getElementById('verified-badge-container').style.display = 'none';
      }

      // Show expiration warnings at top of profile section
      let warningHtml = '';
      if (expiredDocs.length > 0) {
        warningHtml += `<div class="expiration-warning">⚠️ <strong>Expired Documents:</strong> ${expiredDocs.join(', ')} - Please re-upload to maintain your verified status.</div>`;
      }
      if (expiringDocs.length > 0) {
        warningHtml += `<div class="expiration-warning warning">⏰ <strong>Expiring Soon:</strong> ${expiringDocs.join(', ')} - Please update these documents before they expire.</div>`;
      }
      
      let warningContainer = document.getElementById('doc-expiration-warnings');
      if (!warningContainer) {
        warningContainer = document.createElement('div');
        warningContainer.id = 'doc-expiration-warnings';
        const profileSection = document.getElementById('profile');
        if (profileSection) {
          profileSection.insertBefore(warningContainer, profileSection.firstChild);
        }
      }
      warningContainer.innerHTML = warningHtml;
    }

    async function uploadVerificationDoc(docType) {
      const fileInputId = `${docType}-file-input`;
      const statusId = `${docType}-upload-status`;
      const viewBtnId = `${docType}-view-btn`;
      
      const fileInput = document.getElementById(fileInputId);
      const statusEl = document.getElementById(statusId);
      const viewBtn = document.getElementById(viewBtnId);
      
      const file = fileInput.files[0];
      if (!file) return;

      // Validate file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(file.type)) {
        showToast('Please upload a PDF, JPG, or PNG file.', 'error');
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        showToast('File size must be less than 10MB.', 'error');
        return;
      }

      statusEl.innerHTML = '<span style="color:var(--accent-gold);">⏳ Uploading...</span>';

      try {
        // Create unique filename
        const ext = file.name.split('.').pop();
        const fileName = `${currentUser.id}/${docType}_${Date.now()}.${ext}`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
          .from('provider-docs')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: true
          });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabaseClient.storage
          .from('provider-docs')
          .getPublicUrl(fileName);

        const publicUrl = urlData.publicUrl;

        // Determine which field to update
        const fieldMap = {
          'license': 'business_license_url',
          'insurance': 'insurance_document_url',
          'certifications': 'certifications_url'
        };
        const fieldDateMap = {
          'license': 'license_uploaded_at',
          'insurance': 'insurance_uploaded_at',
          'certifications': 'certifications_uploaded_at'
        };
        const fieldName = fieldMap[docType];
        const fieldDateName = fieldDateMap[docType];

        // Check if provider_application exists, if not create one
        const uploadTimestamp = new Date().toISOString();
        if (!providerApplication) {
          const { data: newApp, error: createError } = await supabaseClient
            .from('provider_applications')
            .insert({
              user_id: currentUser.id,
              business_name: providerProfile?.business_name || 'Provider',
              contact_name: providerProfile?.full_name || '',
              email: currentUser.email,
              status: 'pending',
              [fieldName]: publicUrl,
              [fieldDateName]: uploadTimestamp
            })
            .select()
            .single();

          if (createError) throw createError;
          providerApplication = newApp;
        } else {
          // Update existing application
          const { error: updateError } = await supabaseClient
            .from('provider_applications')
            .update({ 
              [fieldName]: publicUrl,
              [fieldDateName]: uploadTimestamp,
              updated_at: new Date().toISOString()
            })
            .eq('id', providerApplication.id);

          if (updateError) throw updateError;
          providerApplication[fieldName] = publicUrl;
          providerApplication[fieldDateName] = uploadTimestamp;
        }

        // Update UI
        statusEl.innerHTML = '<span style="color:var(--accent-green);">✓ Uploaded successfully - awaiting verification</span>';
        viewBtn.href = publicUrl;
        viewBtn.style.display = 'inline-flex';
        
        showToast('Document uploaded! Our team will review it within 1-2 business days.', 'success');
        
        // Refresh verification status
        await loadVerificationStatus();

      } catch (err) {
        console.error('Upload error:', err);
        statusEl.innerHTML = '<span style="color:var(--accent-red);">✗ Upload failed - please try again</span>';
        showToast('Failed to upload document: ' + err.message, 'error');
      }

      // Clear file input
      fileInput.value = '';
    }

    function updateProfileCompletion(profile) {
      let score = 0;
      let total = 7;

      if (profile.business_name) score++;
      if (profile.full_name) score++;
      if (profile.business_phone) score++;
      if (profile.business_address) score++;
      if (profile.services_offered?.length > 0) score++;
      if (profile.certifications?.length > 0) score++;
      if (profile.description) score++;

      const pct = Math.round((score / total) * 100);
      document.getElementById('profile-completion-pct').textContent = pct + '%';
      document.getElementById('profile-completion-bar').style.width = pct + '%';

      // Update bar color based on completion
      const bar = document.getElementById('profile-completion-bar');
      if (pct < 50) {
        bar.style.background = 'var(--accent-red)';
      } else if (pct < 80) {
        bar.style.background = 'var(--accent-orange)';
      } else {
        bar.style.background = 'linear-gradient(90deg, var(--accent-gold), #c49a45)';
      }
    }

    async function saveProviderProfile() {
      // Gather services
      const services = [];
      document.querySelectorAll('#services-grid input[type="checkbox"]:checked').forEach(cb => {
        services.push(cb.value);
      });

      // Gather certifications
      const certs = [];
      document.querySelectorAll('#certifications-grid input[type="checkbox"]:checked').forEach(cb => {
        certs.push(cb.value);
      });
      
      // Add other certs
      const otherCerts = document.getElementById('profile-other-certs').value
        .split(',')
        .map(c => c.trim())
        .filter(c => c);
      certs.push(...otherCerts);

      // Gather ZIP codes
      const zipCodes = document.getElementById('profile-zip-codes').value
        .split(',')
        .map(z => z.trim())
        .filter(z => z);

      // Gather emergency services
      const emergencyServices = [];
      document.querySelectorAll('.emergency-service-check:checked').forEach(cb => {
        emergencyServices.push(cb.value);
      });

      const profileData = {
        business_name: document.getElementById('profile-business-name').value.trim() || null,
        full_name: document.getElementById('profile-full-name').value.trim() || null,
        business_phone: document.getElementById('profile-phone').value.trim() || null,
        business_address: document.getElementById('profile-address').value.trim() || null,
        years_in_business: document.getElementById('profile-years').value ? parseInt(document.getElementById('profile-years').value) : null,
        services_offered: services.length > 0 ? services : null,
        certifications: certs.length > 0 ? certs : null,
        service_areas: zipCodes.length > 0 ? zipCodes : null,
        description: document.getElementById('profile-description').value.trim() || null,
        business_hours: getBusinessHours(),
        emergency_enabled: document.getElementById('emergency-accept-calls')?.checked || false,
        emergency_services: emergencyServices.length > 0 ? emergencyServices : null,
        emergency_radius: parseInt(document.getElementById('emergency-radius')?.value) || 15,
        is_24_seven: document.getElementById('emergency-24-7')?.checked || false,
        can_tow: document.getElementById('emergency-can-tow')?.checked || false,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabaseClient
        .from('profiles')
        .update(profileData)
        .eq('id', currentUser.id);

      if (error) {
        console.error('Error saving profile:', error);
        showToast('Failed to save profile: ' + error.message, 'error');
        return;
      }

      // Update sidebar display
      if (profileData.business_name || profileData.full_name) {
        document.getElementById('user-name').textContent = profileData.business_name || profileData.full_name;
        document.getElementById('user-avatar').textContent = (profileData.business_name || profileData.full_name)[0].toUpperCase();
      }

      showToast('Profile saved successfully!', 'success');
      
      // Recalculate completion
      const { data: updatedProfile } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();
      
      if (updatedProfile) {
        updateProfileCompletion(updatedProfile);
      }
    }

    // ========== AVAILABILITY MANAGEMENT ==========
    let blockedDates = [];

    function getBusinessHours() {
      const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      const hours = {};
      
      days.forEach(day => {
        const isOpen = document.getElementById(`hours-${day}-open`)?.checked;
        hours[day] = {
          open: isOpen,
          start: document.getElementById(`hours-${day}-start`)?.value || '09:00',
          end: document.getElementById(`hours-${day}-end`)?.value || '17:00'
        };
      });
      
      return hours;
    }

    function setBusinessHours(hours) {
      if (!hours) return;
      
      const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      days.forEach(day => {
        if (hours[day]) {
          const openCheckbox = document.getElementById(`hours-${day}-open`);
          const startInput = document.getElementById(`hours-${day}-start`);
          const endInput = document.getElementById(`hours-${day}-end`);
          
          if (openCheckbox) openCheckbox.checked = hours[day].open;
          if (startInput) startInput.value = hours[day].start || '09:00';
          if (endInput) endInput.value = hours[day].end || '17:00';
        }
      });
    }

    function addBlockedDate() {
      const startDate = document.getElementById('block-start').value;
      const endDate = document.getElementById('block-end').value || startDate;
      const reason = document.getElementById('block-reason').value.trim();

      if (!startDate) {
        showToast('Please select a start date', 'error');
        return;
      }

      if (new Date(endDate) < new Date(startDate)) {
        showToast('End date must be after start date', 'error');
        return;
      }

      blockedDates.push({
        start: startDate,
        end: endDate,
        reason: reason || null
      });

      // Clear inputs
      document.getElementById('block-start').value = '';
      document.getElementById('block-end').value = '';
      document.getElementById('block-reason').value = '';

      renderBlockedDates();
      showToast('Date blocked. Remember to save your profile!', 'success');
    }

    function removeBlockedDate(index) {
      blockedDates.splice(index, 1);
      renderBlockedDates();
    }

    function renderBlockedDates() {
      const container = document.getElementById('blocked-dates-list');
      
      if (!blockedDates.length) {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;">No blocked dates.</p>';
        return;
      }

      container.innerHTML = blockedDates.map((block, i) => {
        const startFormatted = new Date(block.start + 'T00:00:00').toLocaleDateString();
        const endFormatted = new Date(block.end + 'T00:00:00').toLocaleDateString();
        const dateRange = block.start === block.end ? startFormatted : `${startFormatted} - ${endFormatted}`;
        
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg-input);border-radius:var(--radius-sm);margin-bottom:8px;">
            <div>
              <span style="font-weight:500;">🚫 ${dateRange}</span>
              ${block.reason ? `<span style="color:var(--text-muted);margin-left:12px;">(${block.reason})</span>` : ''}
            </div>
            <button onclick="removeBlockedDate(${i})" style="background:none;border:none;color:var(--accent-red);cursor:pointer;font-size:1.1rem;">×</button>
          </div>
        `;
      }).join('');
    }

    // ========== BID CREDITS ==========
    let bidPacks = [];

    async function loadSubscription() {
      try {
        // Load available bid packs
        const { data: packs } = await supabaseClient
          .from('bid_packs')
          .select('*')
          .eq('is_active', true)
          .order('price', { ascending: true });
        
        bidPacks = packs || [];
        renderBidPacks();

        // Update balance display
        renderCreditBalance();

        // Load purchase history
        const { data: purchases } = await supabaseClient
          .from('bid_credit_purchases')
          .select('*, bid_packs(name)')
          .eq('provider_id', currentUser.id)
          .order('created_at', { ascending: false })
          .limit(10);

        renderPurchaseHistory(purchases || []);

        // Update sidebar badge
        updateCreditsBadge();

      } catch (err) {
        console.error('Error loading bid credits:', err);
      }
    }

    function renderCreditBalance() {
      const credits = providerProfile?.bid_credits || 0;
      const freeBids = providerProfile?.free_trial_bids || 0;
      const totalPurchased = providerProfile?.total_bids_purchased || 0;
      const totalUsed = providerProfile?.total_bids_used || 0;
      const totalAvailable = credits + freeBids;

      document.getElementById('credits-balance').textContent = totalAvailable;
      document.getElementById('browse-credits-count').textContent = totalAvailable;
      document.getElementById('free-bids-remaining').textContent = freeBids;
      document.getElementById('total-purchased').textContent = totalPurchased;
      document.getElementById('total-used').textContent = totalUsed;

      // Show warnings
      const lowWarning = document.getElementById('low-credits-warning');
      const noWarning = document.getElementById('no-credits-warning');
      
      lowWarning.style.display = 'none';
      noWarning.style.display = 'none';

      if (totalAvailable === 0) {
        noWarning.style.display = 'block';
      } else if (totalAvailable <= 3) {
        lowWarning.style.display = 'block';
      }
    }

    function renderBidPacks() {
      const container = document.getElementById('bid-packs-grid');
      
      if (!bidPacks.length) {
        container.innerHTML = '<p style="color:var(--text-muted);">No bid packs available.</p>';
        return;
      }

      container.innerHTML = bidPacks.map(pack => {
        const totalBids = pack.bid_count + (pack.bonus_bids || 0);
        const effectivePrice = (pack.price / totalBids).toFixed(2);
        
        return `
          <div style="background:var(--bg-elevated);border:2px solid ${pack.is_popular ? 'var(--accent-gold)' : 'var(--border-subtle)'};border-radius:var(--radius-lg);padding:20px;position:relative;text-align:center;">
            ${pack.is_popular ? '<div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:var(--accent-gold);color:#0a0a0f;font-size:0.7rem;font-weight:600;padding:3px 10px;border-radius:100px;">BEST VALUE</div>' : ''}
            
            <div style="font-size:2.5rem;margin-bottom:8px;">🎟️</div>
            <h3 style="font-size:1.2rem;font-weight:600;margin-bottom:4px;">${pack.name}</h3>
            
            <div style="margin:16px 0;">
              <span style="font-size:2rem;font-weight:700;">${pack.bid_count}</span>
              <span style="color:var(--text-muted);"> bids</span>
              ${pack.bonus_bids > 0 ? `<div style="color:var(--accent-green);font-size:0.9rem;font-weight:500;">+${pack.bonus_bids} FREE bonus!</div>` : ''}
            </div>

            <div style="font-size:1.5rem;font-weight:600;color:var(--accent-gold);margin-bottom:4px;">$${pack.price.toFixed(2)}</div>
            <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:16px;">$${effectivePrice} per bid</div>

            <button class="btn ${pack.is_popular ? 'btn-primary' : 'btn-secondary'}" style="width:100%;" onclick="purchaseBidPack('${pack.id}')">
              Buy Now
            </button>
          </div>
        `;
      }).join('');
    }

    function renderPurchaseHistory(purchases) {
      const container = document.getElementById('purchase-history');
      
      if (!purchases.length) {
        container.innerHTML = '<p style="color:var(--text-muted);">No purchases yet.</p>';
        return;
      }

      container.innerHTML = `
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:1px solid var(--border-subtle);">
              <th style="text-align:left;padding:12px 8px;font-weight:500;color:var(--text-muted);font-size:0.85rem;">Date</th>
              <th style="text-align:left;padding:12px 8px;font-weight:500;color:var(--text-muted);font-size:0.85rem;">Pack</th>
              <th style="text-align:left;padding:12px 8px;font-weight:500;color:var(--text-muted);font-size:0.85rem;">Credits</th>
              <th style="text-align:right;padding:12px 8px;font-weight:500;color:var(--text-muted);font-size:0.85rem;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${purchases.map(p => `
              <tr style="border-bottom:1px solid var(--border-subtle);">
                <td style="padding:12px 8px;">${new Date(p.created_at).toLocaleDateString()}</td>
                <td style="padding:12px 8px;">${p.bid_packs?.name || 'Bid Pack'}</td>
                <td style="padding:12px 8px;">
                  ${p.bids_purchased}${p.bonus_bids > 0 ? ` <span style="color:var(--accent-green);">+${p.bonus_bids}</span>` : ''}
                </td>
                <td style="padding:12px 8px;text-align:right;">$${p.amount_paid.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    function updateCreditsBadge() {
      const badge = document.getElementById('sub-badge');
      const totalCredits = (providerProfile?.bid_credits || 0) + (providerProfile?.free_trial_bids || 0);
      
      if (totalCredits > 0) {
        badge.textContent = totalCredits;
        badge.style.display = 'inline';
        badge.style.background = 'var(--accent-gold)';
        badge.style.color = '#0a0a0f';
      } else {
        badge.textContent = '0';
        badge.style.display = 'inline';
        badge.style.background = 'var(--accent-red)';
        badge.style.color = 'white';
      }
    }

    // Stripe Checkout Endpoint (Server-side)
    const STRIPE_CHECKOUT_URL = '/api/create-bid-checkout';
    const USE_STRIPE = true; // Enable real Stripe checkout

    async function purchaseBidPack(packId) {
      const pack = bidPacks.find(p => p.id === packId);
      if (!pack) return;

      const totalBids = pack.bid_count + (pack.bonus_bids || 0);
      
      if (!confirm(`Purchase ${pack.name} pack?\n\n${pack.bid_count} bids${pack.bonus_bids > 0 ? ` + ${pack.bonus_bids} bonus` : ''} = ${totalBids} total bids\nPrice: $${pack.price.toFixed(2)}\n\nYou'll be redirected to complete payment.`)) {
        return;
      }

      // Production: Use Stripe Checkout
      if (USE_STRIPE) {
        try {
          showToast('Redirecting to checkout...', 'success');
          
          const session = await supabaseClient.auth.getSession();
          console.log('Session:', session.data.session ? 'exists' : 'missing');
          console.log('Pack ID:', pack.id);
          console.log('Provider ID:', currentUser.id);
          console.log('URL:', STRIPE_CHECKOUT_URL);
          
          const response = await fetch(STRIPE_CHECKOUT_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.data.session?.access_token}`
            },
            body: JSON.stringify({
              packId: pack.id,
              providerId: currentUser.id
            })
          });
          
          console.log('Response status:', response.status);
          const data = await response.json();
          console.log('Response data:', data);
          
          if (data.error) throw new Error(data.error);
          if (!data.url) throw new Error('No checkout URL returned');
          
          // Redirect to Stripe Checkout
          window.location.href = data.url;
          
        } catch (err) {
          console.error('Checkout error:', err);
          showToast('Failed to start checkout: ' + err.message, 'error');
        }
        return;
      }

      // Demo mode: Add credits directly (for testing)
      try {
        // Record purchase
        const { error: purchaseError } = await supabaseClient.from('bid_credit_purchases').insert({
          provider_id: currentUser.id,
          pack_id: packId,
          bids_purchased: pack.bid_count,
          bonus_bids: pack.bonus_bids || 0,
          amount_paid: pack.price,
          status: 'completed'
        });

        if (purchaseError) throw purchaseError;

        // Add credits to profile
        const newCredits = (providerProfile?.bid_credits || 0) + totalBids;
        const newTotalPurchased = (providerProfile?.total_bids_purchased || 0) + totalBids;

        await supabaseClient.from('profiles').update({
          bid_credits: newCredits,
          total_bids_purchased: newTotalPurchased
        }).eq('id', currentUser.id);

        // Update local profile
        providerProfile.bid_credits = newCredits;
        providerProfile.total_bids_purchased = newTotalPurchased;

        showToast(`🎉 ${totalBids} bid credits added to your account! (Demo Mode)`, 'success');
        await loadSubscription();

      } catch (err) {
        console.error('Purchase error:', err);
        showToast('Failed to process purchase. Please try again.', 'error');
      }
    }

    // Handle return from Stripe Checkout
    function checkPurchaseStatus() {
      const params = new URLSearchParams(window.location.search);
      if (params.get('purchase') === 'success') {
        showToast('🎉 Purchase successful! Credits added to your account.', 'success');
        window.history.replaceState({}, '', 'providers.html');
        // Refresh to show updated credits
        setTimeout(() => loadSubscription(), 1000);
      } else if (params.get('purchase') === 'cancelled') {
        showToast('Purchase cancelled.', 'error');
        window.history.replaceState({}, '', 'providers.html');
      }
    }

    // ========== TEAM MEMBERS ==========
    let teamMembers = [];
    let pendingTeamPhoto = null;
    let editingTeamMemberId = null;

    async function loadTeamMembers() {
      try {
        const { data, error } = await supabaseClient
          .from('team_members')
          .select('*')
          .eq('provider_id', currentUser.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.log('Team members table may not exist:', error);
          teamMembers = [];
          renderTeamMembers();
          return;
        }

        teamMembers = data || [];
        renderTeamMembers();
      } catch (err) {
        console.log('loadTeamMembers error:', err);
        teamMembers = [];
        renderTeamMembers();
      }
    }

    function renderTeamMembers() {
      const container = document.getElementById('team-members-grid');
      if (!container) return;

      if (!teamMembers.length) {
        container.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1;">
            <div class="empty-state-icon">👥</div>
            <p>No team members yet. Add your first team member to showcase your team!</p>
          </div>
        `;
        return;
      }

      const roleLabels = {
        'mechanic': 'Mechanic',
        'driver': 'Driver',
        'detailer': 'Detailer',
        'technician': 'Technician',
        'manager': 'Manager',
        'other': 'Team Member'
      };

      container.innerHTML = teamMembers.map(member => {
        const photoHtml = member.photo_url 
          ? `<img src="${member.photo_url}" alt="${member.name}">`
          : '👤';
        
        const certBadges = (member.certifications || []).slice(0, 3).map(cert => 
          `<span class="team-badge">${cert}</span>`
        ).join('');
        
        const hasMoreCerts = (member.certifications || []).length > 3;
        const moreCertsHtml = hasMoreCerts 
          ? `<span class="team-badge">+${member.certifications.length - 3}</span>` 
          : '';

        return `
          <div class="team-card">
            <div class="team-card-header">
              <div class="team-avatar">${photoHtml}</div>
              <div class="team-info">
                <div class="team-name">${member.name}</div>
                <span class="team-role">${roleLabels[member.role] || member.role}</span>
                ${member.years_experience ? `<div class="team-experience">🛠️ ${member.years_experience} years experience</div>` : ''}
              </div>
            </div>
            ${member.bio ? `<div class="team-bio">${member.bio}</div>` : ''}
            ${(member.certifications?.length || member.specialties?.length) ? `
              <div class="team-badges">
                ${certBadges}
                ${moreCertsHtml}
              </div>
            ` : ''}
            <div style="margin-bottom:12px;">
              <span class="team-status-badge ${member.is_active ? 'active' : 'inactive'}">
                ${member.is_active ? '✓ Active' : '○ Inactive'}
              </span>
            </div>
            <div class="team-actions">
              <button class="btn btn-secondary btn-sm" onclick="openTeamMemberModal('${member.id}')">✏️ Edit</button>
              <button class="btn btn-ghost btn-sm" onclick="deleteTeamMember('${member.id}')" style="color:var(--accent-red);">🗑️ Delete</button>
            </div>
          </div>
        `;
      }).join('');
    }

    function openTeamMemberModal(memberId = null) {
      editingTeamMemberId = memberId;
      pendingTeamPhoto = null;

      // Reset form
      document.getElementById('team-member-name').value = '';
      document.getElementById('team-member-role').value = '';
      document.getElementById('team-member-experience').value = '';
      document.getElementById('team-member-bio').value = '';
      document.getElementById('team-member-certifications').value = '';
      document.getElementById('team-member-specialties').value = '';
      document.getElementById('team-member-active').checked = true;
      document.getElementById('team-member-consent').checked = false;
      
      // Reset photo upload
      const photoUpload = document.getElementById('team-photo-upload');
      photoUpload.innerHTML = `
        <div class="team-photo-upload-icon">📷</div>
        <div class="team-photo-upload-text">Upload Photo</div>
      `;
      photoUpload.classList.remove('has-photo');
      document.getElementById('remove-team-photo-btn').style.display = 'none';

      if (memberId) {
        // Edit mode - populate form
        const member = teamMembers.find(m => m.id === memberId);
        if (member) {
          document.getElementById('team-modal-title').textContent = 'Edit Team Member';
          document.getElementById('team-member-name').value = member.name || '';
          document.getElementById('team-member-role').value = member.role || '';
          document.getElementById('team-member-experience').value = member.years_experience || '';
          document.getElementById('team-member-bio').value = member.bio || '';
          document.getElementById('team-member-certifications').value = (member.certifications || []).join(', ');
          document.getElementById('team-member-specialties').value = (member.specialties || []).join(', ');
          document.getElementById('team-member-active').checked = member.is_active !== false;

          if (member.photo_url) {
            photoUpload.innerHTML = `<img src="${member.photo_url}" alt="Team member photo">`;
            photoUpload.classList.add('has-photo');
            document.getElementById('remove-team-photo-btn').style.display = 'block';
          }
        }
      } else {
        document.getElementById('team-modal-title').textContent = 'Add Team Member';
      }

      document.getElementById('team-member-modal').classList.add('active');
    }

    function handleTeamPhotoSelect(event) {
      const file = event.target.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        showToast('Image must be less than 5MB', 'error');
        return;
      }

      pendingTeamPhoto = file;

      const reader = new FileReader();
      reader.onload = (e) => {
        const photoUpload = document.getElementById('team-photo-upload');
        photoUpload.innerHTML = `<img src="${e.target.result}" alt="Team member photo">`;
        photoUpload.classList.add('has-photo');
        document.getElementById('remove-team-photo-btn').style.display = 'block';
      };
      reader.readAsDataURL(file);
    }

    function removeTeamPhoto() {
      pendingTeamPhoto = null;
      const photoUpload = document.getElementById('team-photo-upload');
      photoUpload.innerHTML = `
        <div class="team-photo-upload-icon">📷</div>
        <div class="team-photo-upload-text">Upload Photo</div>
      `;
      photoUpload.classList.remove('has-photo');
      document.getElementById('remove-team-photo-btn').style.display = 'none';
      document.getElementById('team-photo-input').value = '';
    }

    async function uploadTeamPhoto(file) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${currentUser.id}/${Date.now()}.${fileExt}`;
      
      const { data, error } = await supabaseClient.storage
        .from('team-photos')
        .upload(fileName, file, { upsert: true });

      if (error) {
        console.error('Photo upload error:', error);
        throw new Error('Failed to upload photo');
      }

      const { data: urlData } = supabaseClient.storage
        .from('team-photos')
        .getPublicUrl(fileName);

      return urlData.publicUrl;
    }

    async function saveTeamMember() {
      const name = document.getElementById('team-member-name').value.trim();
      const role = document.getElementById('team-member-role').value;
      const experience = document.getElementById('team-member-experience').value;
      const bio = document.getElementById('team-member-bio').value.trim();
      const certificationsStr = document.getElementById('team-member-certifications').value;
      const specialtiesStr = document.getElementById('team-member-specialties').value;
      const isActive = document.getElementById('team-member-active').checked;

      if (!name) {
        showToast('Please enter a name', 'error');
        return;
      }
      if (!role) {
        showToast('Please select a role', 'error');
        return;
      }

      // Require consent acknowledgment
      const hasConsent = document.getElementById('team-member-consent').checked;
      if (!hasConsent) {
        showToast('Please confirm you have permission to display this team member\'s information', 'error');
        return;
      }

      // Parse comma-separated values
      const certifications = certificationsStr ? certificationsStr.split(',').map(c => c.trim()).filter(c => c) : [];
      const specialties = specialtiesStr ? specialtiesStr.split(',').map(s => s.trim()).filter(s => s) : [];

      let photoUrl = null;

      // Handle photo upload
      if (pendingTeamPhoto) {
        try {
          photoUrl = await uploadTeamPhoto(pendingTeamPhoto);
        } catch (err) {
          console.error('Photo upload failed:', err);
          showToast('Photo upload failed. Saving without photo.', 'error');
        }
      } else if (editingTeamMemberId) {
        // Keep existing photo if editing and no new photo selected
        const existingMember = teamMembers.find(m => m.id === editingTeamMemberId);
        photoUrl = existingMember?.photo_url || null;
        
        // Check if photo was removed
        if (!document.getElementById('team-photo-upload').classList.contains('has-photo')) {
          photoUrl = null;
        }
      }

      const teamMemberData = {
        name,
        role,
        bio: bio || null,
        years_experience: experience ? parseInt(experience) : null,
        certifications,
        specialties,
        photo_url: photoUrl,
        is_active: isActive,
        updated_at: new Date().toISOString()
      };

      try {
        if (editingTeamMemberId) {
          // Update existing
          const { error } = await supabaseClient
            .from('team_members')
            .update(teamMemberData)
            .eq('id', editingTeamMemberId)
            .eq('provider_id', currentUser.id);

          if (error) throw error;
          showToast('Team member updated!', 'success');
        } else {
          // Insert new
          teamMemberData.provider_id = currentUser.id;
          const { error } = await supabaseClient
            .from('team_members')
            .insert(teamMemberData);

          if (error) throw error;
          showToast('Team member added!', 'success');
        }

        closeModal('team-member-modal');
        await loadTeamMembers();
      } catch (err) {
        console.error('Save team member error:', err);
        showToast('Failed to save team member: ' + (err.message || 'Unknown error'), 'error');
      }
    }

    async function deleteTeamMember(memberId) {
      const member = teamMembers.find(m => m.id === memberId);
      if (!member) return;

      if (!confirm(`Are you sure you want to delete ${member.name}?`)) {
        return;
      }

      try {
        const { error } = await supabaseClient
          .from('team_members')
          .delete()
          .eq('id', memberId)
          .eq('provider_id', currentUser.id);

        if (error) throw error;

        showToast('Team member deleted', 'success');
        await loadTeamMembers();
      } catch (err) {
        console.error('Delete team member error:', err);
        showToast('Failed to delete team member', 'error');
      }
    }

    // ========== BACKGROUND CHECKS ==========
    async function loadBackgroundCheckStatus() {
      const container = document.getElementById('bg-check-status-container');
      if (!container) return;

      try {
        const response = await fetch(`/api/background-check-status?provider_id=${currentUser.id}`);
        if (!response.ok) {
          throw new Error('Failed to fetch background check status');
        }
        const data = await response.json();

        if (!data.checks || data.checks.length === 0) {
          container.innerHTML = `
            <div style="text-align:center;padding:20px;color:var(--text-muted);">
              <div style="font-size:2rem;margin-bottom:12px;">📋</div>
              <p>No background checks on file</p>
              <p style="font-size:0.85rem;">Initiate a background check to verify your credentials</p>
            </div>
          `;
          return;
        }

        container.innerHTML = data.checks.map(check => {
          const statusColors = {
            'pending': 'var(--accent-gold)',
            'clear': 'var(--success)',
            'consider': 'var(--warning)',
            'suspended': 'var(--error)',
            'dispute': 'var(--accent-blue)'
          };
          const statusIcons = {
            'pending': '⏳',
            'clear': '✅',
            'consider': '⚠️',
            'suspended': '🚫',
            'dispute': '📝'
          };
          const statusColor = statusColors[check.status] || 'var(--text-muted)';
          const statusIcon = statusIcons[check.status] || '📋';
          const checkDate = new Date(check.created_at).toLocaleDateString();

          return `
            <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:16px;margin-bottom:12px;border-left:3px solid ${statusColor};">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <div style="font-weight:600;">${statusIcon} ${check.subject_type === 'employee' ? 'Employee: ' + (check.team_member_name || 'Team Member') : 'Provider Check'}</div>
                <span style="font-size:0.85rem;color:${statusColor};text-transform:uppercase;">${check.status}</span>
              </div>
              <div style="font-size:0.85rem;color:var(--text-muted);">
                <div>Package: Standard + MVR</div>
                <div>Initiated: ${checkDate}</div>
                ${check.completed_at ? `<div>Completed: ${new Date(check.completed_at).toLocaleDateString()}</div>` : ''}
              </div>
            </div>
          `;
        }).join('');
      } catch (err) {
        console.error('Error loading background check status:', err);
        container.innerHTML = `
          <div style="text-align:center;padding:20px;color:var(--text-muted);">
            <div style="font-size:2rem;margin-bottom:12px;">📋</div>
            <p>Background check status unavailable</p>
            <p style="font-size:0.85rem;">Please try again later</p>
          </div>
        `;
      }
    }

    function openBackgroundCheckModal() {
      document.getElementById('bg-check-type').value = 'provider';
      document.getElementById('bg-check-email').value = currentUser?.email || '';
      document.getElementById('bg-check-employee-fields').style.display = 'none';
      
      // Populate team members dropdown
      const teamSelect = document.getElementById('bg-check-team-member');
      teamSelect.innerHTML = '<option value="">Select a team member...</option>';
      if (teamMembers && teamMembers.length > 0) {
        teamMembers.forEach(member => {
          teamSelect.innerHTML += `<option value="${member.id}">${member.name} (${member.role})</option>`;
        });
      }
      
      document.getElementById('background-check-modal').classList.add('active');
    }

    function updateBgCheckForm() {
      const type = document.getElementById('bg-check-type').value;
      const employeeFields = document.getElementById('bg-check-employee-fields');
      const emailInput = document.getElementById('bg-check-email');
      
      if (type === 'employee') {
        employeeFields.style.display = 'block';
        emailInput.value = '';
        emailInput.placeholder = 'Team member email address';
      } else {
        employeeFields.style.display = 'none';
        emailInput.value = currentUser?.email || '';
        emailInput.placeholder = 'Your email address';
      }
    }

    async function submitBackgroundCheck() {
      const type = document.getElementById('bg-check-type').value;
      const email = document.getElementById('bg-check-email').value.trim();
      const teamMemberId = document.getElementById('bg-check-team-member').value;

      if (!email) {
        showToast('Please enter an email address', 'error');
        return;
      }

      if (type === 'employee' && !teamMemberId) {
        showToast('Please select a team member', 'error');
        return;
      }

      try {
        const response = await fetch('/api/initiate-background-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider_id: currentUser.id,
            subject_type: type,
            team_member_id: type === 'employee' ? teamMemberId : null,
            email: email,
            package_type: 'standard_mvr'
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to initiate background check');
        }

        showToast('Background check initiated! An invitation has been sent.', 'success');
        closeModal('background-check-modal');
        await loadBackgroundCheckStatus();
      } catch (err) {
        console.error('Error initiating background check:', err);
        showToast(err.message || 'Failed to initiate background check', 'error');
      }
    }

    // ========== NOTIFICATIONS ==========
    let notifications = [];

    async function loadNotifications() {
      try {
        const { data, error } = await supabaseClient
          .from('notifications')
          .select('*')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          console.log('Notifications table may not exist:', error);
          return;
        }

        notifications = data || [];
        renderNotifications();
        updateNotificationBadge();
      } catch (err) {
        console.log('loadNotifications error:', err);
      }
    }

    function updateNotificationBadge() {
      const unreadCount = notifications.filter(n => !n.read).length;
      const badge = document.getElementById('notif-count');
      if (badge) {
        if (unreadCount > 0) {
          badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
          badge.style.display = 'inline';
        } else {
          badge.style.display = 'none';
        }
      }
    }

    function renderNotifications() {
      const container = document.getElementById('notifications-list');
      if (!container) return;
      
      if (!notifications.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔔</div><p>No notifications yet.</p></div>';
        return;
      }

      const notifIcons = {
        'bid_accepted': '🎉',
        'new_package': '📦',
        'message_received': '💬',
        'payment_received': '💰',
        'review_received': '⭐',
        'default': '📢'
      };

      container.innerHTML = notifications.map(n => {
        const icon = notifIcons[n.type] || notifIcons['default'];
        const timeAgo = formatTimeAgo(n.created_at);
        
        return `
          <div class="notification-item" onclick="handleNotificationClick('${n.id}', '${n.link_type || ''}', '${n.link_id || ''}')" style="display:flex;gap:16px;padding:16px 20px;background:${n.read ? 'var(--bg-card)' : 'var(--accent-gold-soft)'};border:1px solid ${n.read ? 'var(--border-subtle)' : 'rgba(212,168,85,0.3)'};border-radius:var(--radius-md);margin-bottom:12px;cursor:pointer;transition:all 0.15s;">
            <div style="font-size:24px;">${icon}</div>
            <div style="flex:1;">
              <div style="font-weight:${n.read ? '400' : '600'};margin-bottom:4px;">${n.title}</div>
              ${n.message ? `<div style="font-size:0.9rem;color:var(--text-secondary);line-height:1.5;">${n.message}</div>` : ''}
              <div style="font-size:0.8rem;color:var(--text-muted);margin-top:8px;">${timeAgo}</div>
            </div>
            ${!n.read ? '<div style="width:10px;height:10px;background:var(--accent-gold);border-radius:50%;flex-shrink:0;margin-top:6px;"></div>' : ''}
          </div>
        `;
      }).join('');
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

    async function handleNotificationClick(notifId, linkType, linkId) {
      await supabaseClient
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('id', notifId);

      if (linkType === 'package' && linkId) {
        showSection('jobs');
      } else if (linkType === 'message') {
        showSection('messages');
      }

      await loadNotifications();
    }

    async function markAllNotificationsRead() {
      const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
      if (!unreadIds.length) {
        showToast('All notifications already read', 'success');
        return;
      }

      await supabaseClient
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .in('id', unreadIds);

      showToast('All notifications marked as read', 'success');
      await loadNotifications();
    }

    // ========== EMERGENCY FUNCTIONS ==========
    function setupEmergencySettings() {
      const acceptCheckbox = document.getElementById('emergency-accept-calls');
      const detailsSection = document.getElementById('emergency-settings-details');
      
      if (acceptCheckbox) {
        acceptCheckbox.addEventListener('change', () => {
          detailsSection.style.display = acceptCheckbox.checked ? 'block' : 'none';
        });
        
        if (providerProfile?.emergency_enabled) {
          acceptCheckbox.checked = true;
          detailsSection.style.display = 'block';
        }
        
        if (providerProfile?.emergency_services) {
          providerProfile.emergency_services.forEach(svc => {
            const cb = document.querySelector(`.emergency-service-check[value="${svc}"]`);
            if (cb) cb.checked = true;
          });
        }
        
        if (providerProfile?.emergency_radius) {
          document.getElementById('emergency-radius').value = providerProfile.emergency_radius;
        }
        if (providerProfile?.is_24_seven) {
          document.getElementById('emergency-24-7').checked = true;
        }
        if (providerProfile?.can_tow) {
          document.getElementById('emergency-can-tow').checked = true;
        }
      }
    }

    function getProviderLocation() {
      return new Promise((resolve) => {
        if (!navigator.geolocation) {
          resolve(null);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            providerLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            resolve(providerLocation);
          },
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });
    }

    async function refreshEmergencies() {
      await loadNearbyEmergencies();
      await loadMyActiveEmergency();
    }

    async function loadNearbyEmergencies() {
      const noticeEl = document.getElementById('emergency-settings-notice');
      const queueEl = document.getElementById('emergency-queue');
      
      if (!providerProfile?.emergency_enabled) {
        noticeEl.style.display = 'block';
        queueEl.innerHTML = '<div class="empty-state" style="padding:24px;"><p style="color:var(--text-muted);">Enable emergency services in your profile to see requests.</p></div>';
        return;
      }
      
      noticeEl.style.display = 'none';
      
      const location = await getProviderLocation();
      if (!location) {
        queueEl.innerHTML = '<div class="empty-state" style="padding:24px;"><p style="color:var(--text-muted);">📍 Enable location to see nearby emergencies</p></div>';
        return;
      }

      try {
        const radius = providerProfile.emergency_radius || 15;
        const { data, error } = await getNearbyEmergencies(location.lat, location.lng, radius);
        
        if (error) throw error;
        
        nearbyEmergencies = data || [];
        renderEmergencyQueue();
        updateEmergencyBadge();
      } catch (err) {
        console.error('Error loading emergencies:', err);
        queueEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>Failed to load emergencies</p></div>';
      }
    }

    async function loadMyActiveEmergency() {
      try {
        const { data } = await supabaseClient
          .from('emergency_requests')
          .select('*, member:member_id(full_name, phone), vehicles(year, make, model)')
          .eq('assigned_provider_id', currentUser.id)
          .in('status', ['accepted', 'en_route', 'arrived', 'in_progress'])
          .single();
        
        myActiveEmergency = data;
        renderMyActiveEmergency();
      } catch (err) {
        myActiveEmergency = null;
        renderMyActiveEmergency();
      }
    }

    function updateEmergencyBadge() {
      const badge = document.getElementById('emergency-count');
      const count = nearbyEmergencies.length;
      if (count > 0) {
        badge.textContent = count > 9 ? '9+' : count;
        badge.style.display = 'inline';
      } else {
        badge.style.display = 'none';
      }
    }

    let emergencyCountdownIntervals = {};

    function renderEmergencyQueue() {
      const container = document.getElementById('emergency-queue');
      
      // Clear existing countdown intervals
      Object.values(emergencyCountdownIntervals).forEach(clearInterval);
      emergencyCountdownIntervals = {};
      
      if (!nearbyEmergencies.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><p>No pending emergencies nearby</p></div>';
        return;
      }
      
      const typeLabels = {
        'flat_tire': '🛞 Flat Tire',
        'dead_battery': '🔋 Dead Battery',
        'lockout': '🔐 Locked Out',
        'tow_needed': '🚛 Tow Needed',
        'fuel_delivery': '⛽ Out of Fuel',
        'accident': '💥 Accident',
        'other': '❓ Other'
      };
      
      const totalCredits = (providerProfile?.bid_credits || 0) + (providerProfile?.free_trial_bids || 0);
      const hasCredits = totalCredits >= 1;
      
      container.innerHTML = nearbyEmergencies.map(e => {
        const timeAgo = formatTimeAgo(e.created_at);
        const distance = e.distance_miles ? `${e.distance_miles.toFixed(1)} mi away` : 'Nearby';
        const escrowAmount = e.escrow_amount ? `$${parseFloat(e.escrow_amount).toFixed(2)}` : 'Pending';
        
        // Calculate time remaining for claim
        let countdownHtml = '';
        let urgencyClass = '';
        if (e.claim_deadline) {
          const deadline = new Date(e.claim_deadline);
          const now = new Date();
          const diffMs = deadline - now;
          const diffSecs = Math.max(0, Math.floor(diffMs / 1000));
          const mins = Math.floor(diffSecs / 60);
          const secs = diffSecs % 60;
          
          if (diffSecs <= 120) urgencyClass = 'urgent';
          countdownHtml = `<span class="countdown-timer ${urgencyClass}" id="countdown-${e.id}" data-deadline="${e.claim_deadline}">⏱️ Claim in ${mins}:${secs.toString().padStart(2, '0')}</span>`;
        }
        
        const claimCostHtml = hasCredits
          ? `<span style="font-size:0.85rem;color:var(--accent-gold);">🎟️ 1 bid credit to claim</span>`
          : `<span style="font-size:0.85rem;color:var(--accent-red);">⚠️ Need 1 bid credit to claim</span>`;
        
        return `
          <div class="emergency-card ${urgencyClass ? 'urgent-emergency' : ''}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
              <div>
                <span class="emergency-type-badge">${typeLabels[e.emergency_type] || e.emergency_type}</span>
                <div style="margin-top:8px;">
                  <span class="emergency-distance">📍 ${distance}</span>
                  <span class="emergency-time" style="margin-left:12px;">⏱️ ${timeAgo}</span>
                </div>
              </div>
              <div style="text-align:right;">
                ${countdownHtml}
                <div style="font-size:1.1rem;font-weight:600;color:var(--accent-green);margin-top:4px;">💰 ${escrowAmount}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);">escrow authorized</div>
              </div>
            </div>
            ${e.address ? `<div style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:8px;">${e.address}</div>` : ''}
            ${e.description ? `<div style="font-size:0.9rem;color:var(--text-muted);margin-bottom:12px;">"${e.description.substring(0, 100)}${e.description.length > 100 ? '...' : ''}"</div>` : ''}
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:10px;background:var(--bg-input);border-radius:var(--radius-sm);">
              ${claimCostHtml}
            </div>
            <div class="emergency-actions">
              <button class="btn btn-emergency" onclick="openAcceptEmergency('${e.id}')" ${!hasCredits ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>🚗 Claim Emergency</button>
              <button class="btn btn-secondary" onclick="viewEmergencyDetails('${e.id}')">View Details</button>
            </div>
          </div>
        `;
      }).join('');
      
      // Start countdown timers
      nearbyEmergencies.forEach(e => {
        if (e.claim_deadline) {
          startEmergencyCountdown(e.id, e.claim_deadline);
        }
      });
    }

    function startEmergencyCountdown(emergencyId, deadlineStr) {
      const el = document.getElementById(`countdown-${emergencyId}`);
      if (!el) return;
      
      const deadline = new Date(deadlineStr);
      
      emergencyCountdownIntervals[emergencyId] = setInterval(() => {
        const now = new Date();
        const diffMs = deadline - now;
        const diffSecs = Math.max(0, Math.floor(diffMs / 1000));
        const mins = Math.floor(diffSecs / 60);
        const secs = diffSecs % 60;
        
        if (diffSecs <= 0) {
          clearInterval(emergencyCountdownIntervals[emergencyId]);
          el.textContent = '⏱️ Expired';
          el.classList.add('expired');
          el.classList.remove('urgent');
          // Refresh the queue after a short delay
          setTimeout(() => refreshEmergencies(), 1000);
          return;
        }
        
        el.textContent = `⏱️ Claim in ${mins}:${secs.toString().padStart(2, '0')}`;
        
        if (diffSecs <= 120 && !el.classList.contains('urgent')) {
          el.classList.add('urgent');
        }
      }, 1000);
    }

    function renderMyActiveEmergency() {
      const container = document.getElementById('my-active-emergency');
      
      if (!myActiveEmergency) {
        container.innerHTML = '<div class="empty-state" style="padding:24px;"><p style="color:var(--text-muted);">No active emergency job</p></div>';
        return;
      }
      
      const e = myActiveEmergency;
      const typeLabels = {
        'flat_tire': '🛞 Flat Tire',
        'dead_battery': '🔋 Dead Battery',
        'lockout': '🔐 Locked Out',
        'tow_needed': '🚛 Tow Needed',
        'fuel_delivery': '⛽ Out of Fuel',
        'accident': '💥 Accident',
        'other': '❓ Other'
      };
      
      const vehicleName = e.vehicles ? `${e.vehicles.year} ${e.vehicles.make} ${e.vehicles.model}` : 'Unknown vehicle';
      const memberName = e.member?.full_name || 'Member';
      const memberPhone = e.member?.phone;
      const etaMinutes = e.provider_eta_minutes || e.eta_minutes;
      const isTowing = ['tow_needed', 'accident'].includes(e.emergency_type);
      
      // Calculate ETA deadline from claimed_at/accepted_at
      let etaInfo = '';
      if (etaMinutes && (e.claimed_at || e.accepted_at)) {
        const startTime = new Date(e.claimed_at || e.accepted_at);
        const etaTime = new Date(startTime.getTime() + etaMinutes * 60 * 1000);
        const now = new Date();
        const diffMs = etaTime - now;
        const diffMins = Math.ceil(diffMs / 60000);
        
        if (diffMins > 0 && !e.provider_arrived_at) {
          etaInfo = `<div style="background:var(--accent-gold-soft);padding:12px;border-radius:var(--radius-sm);margin-bottom:16px;">
            <div style="font-size:0.85rem;color:var(--text-muted);">⏱️ Your ETA Commitment</div>
            <div style="font-weight:600;color:var(--accent-gold);">Arrive in ${diffMins} minutes (${etaMinutes} min ETA)</div>
          </div>`;
        } else if (diffMins <= 0 && !e.provider_arrived_at) {
          etaInfo = `<div style="background:rgba(239,95,95,0.15);padding:12px;border-radius:var(--radius-sm);margin-bottom:16px;">
            <div style="font-size:0.85rem;color:var(--accent-red);">⚠️ ETA Overdue!</div>
            <div style="font-weight:600;color:var(--accent-red);">Please arrive ASAP or member may report no-show</div>
          </div>`;
        }
      }
      
      // Mark Arrived button for accepted/en_route status
      let markArrivedBtn = '';
      if (['accepted', 'en_route'].includes(e.status) && !e.provider_arrived_at) {
        markArrivedBtn = `<button class="btn btn-primary" onclick="markArrivedEmergency('${e.id}')">📍 Mark Arrived</button>`;
      }
      
      // Arrived confirmation
      let arrivedInfo = '';
      if (e.provider_arrived_at) {
        const arrivedTime = new Date(e.provider_arrived_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        arrivedInfo = `<div style="background:var(--accent-green-soft);padding:10px;border-radius:var(--radius-sm);margin-bottom:12px;font-size:0.9rem;">
          ✅ Arrived at ${arrivedTime}
        </div>`;
      }
      
      let statusButtons = '';
      switch (e.status) {
        case 'accepted':
          statusButtons = `
            ${markArrivedBtn}
            <button class="btn btn-secondary" onclick="updateMyEmergencyStatus('${e.id}', 'en_route')">🚗 I'm En Route</button>
          `;
          break;
        case 'en_route':
          statusButtons = markArrivedBtn || `<button class="btn btn-primary" onclick="updateMyEmergencyStatus('${e.id}', 'arrived')">📍 I've Arrived</button>`;
          break;
        case 'arrived':
          statusButtons = `<button class="btn btn-primary" onclick="updateMyEmergencyStatus('${e.id}', 'in_progress')">🔧 Start Work</button>`;
          break;
        case 'in_progress':
          statusButtons = `<button class="btn btn-primary" onclick="openCompleteEmergency('${e.id}', ${isTowing})">✅ Submit Invoice & Complete</button>`;
          break;
      }
      
      container.innerHTML = `
        <div class="emergency-card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
            <div>
              <span class="emergency-type-badge">${typeLabels[e.emergency_type] || e.emergency_type}</span>
              <div style="font-size:0.9rem;color:var(--text-secondary);margin-top:8px;">${vehicleName}</div>
            </div>
            <span class="bid-status ${e.status}" style="text-transform:capitalize;">${e.status.replace('_', ' ')}</span>
          </div>
          
          ${etaInfo}
          ${arrivedInfo}
          
          <div style="background:var(--bg-elevated);padding:16px;border-radius:var(--radius-md);margin-bottom:16px;">
            <div style="font-weight:600;margin-bottom:8px;">👤 ${memberName}</div>
            ${memberPhone ? `<a href="tel:${memberPhone}" class="btn btn-secondary btn-sm" style="margin-top:8px;">📞 Call Member</a>` : ''}
          </div>
          
          ${e.address ? `
            <div style="margin-bottom:16px;">
              <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:4px;">📍 Location</div>
              <div style="font-size:0.9rem;">${e.address}</div>
              <a href="https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lng}" target="_blank" class="btn btn-secondary btn-sm" style="margin-top:8px;">🗺️ Navigate</a>
            </div>
          ` : ''}
          
          ${e.escrow_amount ? `
            <div style="margin-bottom:16px;padding:12px;background:var(--bg-input);border-radius:var(--radius-sm);">
              <div style="font-size:0.85rem;color:var(--text-muted);">💰 Member Escrow Authorized</div>
              <div style="font-size:1.2rem;font-weight:600;color:var(--accent-green);">$${parseFloat(e.escrow_amount).toFixed(2)}</div>
            </div>
          ` : ''}
          
          ${e.description ? `<div style="font-size:0.9rem;color:var(--text-muted);margin-bottom:16px;">${e.description}</div>` : ''}
          
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            ${statusButtons}
          </div>
        </div>
      `;
    }

    async function markArrivedEmergency(emergencyId) {
      try {
        const { error } = await supabaseClient
          .from('emergency_requests')
          .update({
            provider_arrived_at: new Date().toISOString(),
            status: 'arrived',
            updated_at: new Date().toISOString()
          })
          .eq('id', emergencyId);
        
        if (error) throw error;
        
        showToast('📍 Marked as arrived!', 'success');
        await loadMyActiveEmergency();
      } catch (err) {
        console.error('Error marking arrived:', err);
        showToast('Failed to update: ' + err.message, 'error');
      }
    }

    function openAcceptEmergency(emergencyId) {
      document.getElementById('accept-emergency-id').value = emergencyId;
      document.getElementById('accept-eta').value = '';
      openModal('emergency-accept-modal');
    }

    async function confirmAcceptEmergency() {
      const emergencyId = document.getElementById('accept-emergency-id').value;
      const eta = parseInt(document.getElementById('accept-eta').value);
      
      if (!eta) {
        showToast('Please select your ETA', 'error');
        return;
      }
      
      // Check bid credits
      const bidCredits = providerProfile?.bid_credits || 0;
      const freeTrialBids = providerProfile?.free_trial_bids || 0;
      const totalCredits = bidCredits + freeTrialBids;
      
      if (totalCredits < 1) {
        showToast('You need at least 1 bid credit to claim an emergency', 'error');
        return;
      }
      
      try {
        // Deduct bid credit from provider profile
        let updateData = {};
        if (freeTrialBids > 0) {
          updateData.free_trial_bids = freeTrialBids - 1;
          providerProfile.free_trial_bids = freeTrialBids - 1;
        } else {
          updateData.bid_credits = bidCredits - 1;
          providerProfile.bid_credits = bidCredits - 1;
        }
        
        const { error: creditError } = await supabaseClient
          .from('profiles')
          .update(updateData)
          .eq('id', currentUser.id);
        
        if (creditError) throw new Error('Failed to deduct bid credit: ' + creditError.message);
        
        // Accept the emergency with bid_credits_spent=1
        const { error } = await respondToEmergency(emergencyId, currentUser.id, eta, 1);
        if (error) throw new Error(error);
        
        closeModal('emergency-accept-modal');
        showToast('🚗 Emergency claimed! 1 bid credit deducted. Navigate to the member now.', 'success');
        await refreshEmergencies();
        await updateProviderStats();
        showSection('emergencies');
      } catch (err) {
        console.error('Error accepting emergency:', err);
        showToast('Failed to claim: ' + err.message, 'error');
      }
    }

    async function viewEmergencyDetails(emergencyId) {
      openModal('emergency-detail-modal');
      
      try {
        const emergency = nearbyEmergencies.find(e => e.id === emergencyId);
        if (!emergency) throw new Error('Emergency not found');
        
        const typeLabels = {
          'flat_tire': '🛞 Flat Tire',
          'dead_battery': '🔋 Dead Battery',
          'lockout': '🔐 Locked Out',
          'tow_needed': '🚛 Tow Needed',
          'fuel_delivery': '⛽ Out of Fuel',
          'accident': '💥 Accident',
          'other': '❓ Other'
        };
        
        const timeAgo = formatTimeAgo(emergency.created_at);
        
        document.getElementById('emergency-detail-content').innerHTML = `
          <div style="text-align:center;margin-bottom:20px;">
            <div style="font-size:48px;margin-bottom:8px;">${typeLabels[emergency.emergency_type]?.split(' ')[0] || '🚨'}</div>
            <div style="font-size:1.2rem;font-weight:600;">${typeLabels[emergency.emergency_type] || emergency.emergency_type}</div>
            <div style="color:var(--text-muted);font-size:0.9rem;">Posted ${timeAgo}</div>
          </div>
          
          ${emergency.address ? `
            <div style="padding:16px;background:var(--bg-input);border-radius:var(--radius-md);margin-bottom:16px;">
              <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:4px;">📍 Location</div>
              <div>${emergency.address}</div>
              <a href="https://www.google.com/maps?q=${emergency.lat},${emergency.lng}" target="_blank" style="color:var(--accent-gold);font-size:0.9rem;">View on Map →</a>
            </div>
          ` : ''}
          
          ${emergency.description ? `
            <div style="padding:16px;background:var(--bg-input);border-radius:var(--radius-md);margin-bottom:16px;">
              <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:4px;">Description</div>
              <div>${emergency.description}</div>
            </div>
          ` : ''}
          
          ${emergency.distance_miles ? `
            <div style="text-align:center;padding:16px;background:var(--accent-gold-soft);border-radius:var(--radius-md);">
              <div style="font-size:1.5rem;font-weight:600;color:var(--accent-gold);">${emergency.distance_miles.toFixed(1)} miles</div>
              <div style="color:var(--text-muted);font-size:0.9rem;">from your location</div>
            </div>
          ` : ''}
        `;
        
        document.getElementById('emergency-detail-footer').innerHTML = `
          <button class="btn btn-secondary" onclick="closeModal('emergency-detail-modal')">Close</button>
          <button class="btn btn-emergency" onclick="closeModal('emergency-detail-modal'); openAcceptEmergency('${emergencyId}')">🚗 Accept Emergency</button>
        `;
      } catch (err) {
        document.getElementById('emergency-detail-content').innerHTML = `
          <div class="empty-state"><div class="empty-state-icon">⚠️</div><p>Failed to load details</p></div>
        `;
      }
    }

    async function updateMyEmergencyStatus(emergencyId, newStatus) {
      try {
        const { error } = await updateEmergencyStatus(emergencyId, newStatus);
        if (error) throw new Error(error);
        
        showToast('Status updated!', 'success');
        await loadMyActiveEmergency();
      } catch (err) {
        console.error('Error updating status:', err);
        showToast('Failed to update status: ' + err.message, 'error');
      }
    }

    function openCompleteEmergency(emergencyId, isTowing = false) {
      document.getElementById('complete-emergency-id').value = emergencyId;
      document.getElementById('complete-is-towing').value = isTowing ? 'true' : 'false';
      document.getElementById('complete-notes').value = '';
      document.getElementById('complete-amount').value = '';
      document.getElementById('complete-actual-miles').value = '';
      
      // Show/hide miles field based on towing
      const milesGroup = document.getElementById('complete-miles-group');
      milesGroup.style.display = isTowing ? 'block' : 'none';
      
      // Show escrow amount
      const escrowDisplay = document.getElementById('complete-escrow-display');
      if (myActiveEmergency?.escrow_amount) {
        escrowDisplay.textContent = `$${parseFloat(myActiveEmergency.escrow_amount).toFixed(2)}`;
      } else {
        escrowDisplay.textContent = 'Not set';
      }
      
      openModal('emergency-complete-modal');
    }

    async function confirmCompleteEmergency() {
      const emergencyId = document.getElementById('complete-emergency-id').value;
      const notes = document.getElementById('complete-notes').value;
      const amount = parseFloat(document.getElementById('complete-amount').value) || 0;
      const isTowing = document.getElementById('complete-is-towing').value === 'true';
      const actualMiles = isTowing ? parseFloat(document.getElementById('complete-actual-miles').value) || null : null;
      
      if (amount <= 0) {
        showToast('Please enter a valid invoice amount', 'error');
        return;
      }
      
      if (isTowing && !actualMiles) {
        showToast('Please enter actual miles towed', 'error');
        return;
      }
      
      try {
        const { error } = await supabaseClient
          .from('emergency_requests')
          .update({
            status: 'completed',
            provider_invoice_amount: amount,
            provider_invoice_notes: notes,
            actual_miles: actualMiles,
            provider_invoice_submitted_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', emergencyId);
        
        if (error) throw error;
        
        // Create notification for member
        if (myActiveEmergency?.member_id) {
          await createNotification(
            myActiveEmergency.member_id,
            'emergency_completed',
            'Emergency Service Complete ✅',
            `Your emergency service has been completed. Invoice: $${amount.toFixed(2)}`,
            'emergency',
            emergencyId
          );
        }
        
        closeModal('emergency-complete-modal');
        showToast('🎉 Invoice submitted! Emergency completed successfully!', 'success');
        myActiveEmergency = null;
        renderMyActiveEmergency();
      } catch (err) {
        console.error('Error completing emergency:', err);
        showToast('Failed to complete: ' + err.message, 'error');
      }
    }

    async function logout() { await supabaseClient.auth.signOut(); window.location.href = 'login.html'; }
    
    function switchToMember() {
      localStorage.setItem('mcc_portal', 'member');
      window.location.href = 'members.html';
    }

    document.querySelectorAll('.modal-backdrop').forEach(b => b.addEventListener('click', e => { if (e.target === b) b.classList.remove('active'); }));
    document.getElementById('message-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });

    // ========== MULTI-POINT INSPECTION ==========
    let inspectionData = {};
    
    function toggleInspectionCategory(header) {
      const category = header.parentElement;
      category.classList.toggle('expanded');
    }
    
    function setInspectionStatus(btn, status) {
      const item = btn.closest('.inspection-item');
      const field = item.dataset.field;
      
      item.querySelectorAll('.inspection-status-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      inspectionData[field] = status;
      
      updateInspectionSummary();
    }
    
    function updateInspectionSummary() {
      let good = 0, fair = 0, attention = 0, urgent = 0;
      
      Object.values(inspectionData).forEach(status => {
        if (status === 'good') good++;
        else if (status === 'fair') fair++;
        else if (status === 'needs_attention') attention++;
        else if (status === 'urgent') urgent++;
      });
      
      document.getElementById('count-good').textContent = good;
      document.getElementById('count-fair').textContent = fair;
      document.getElementById('count-attention').textContent = attention;
      document.getElementById('count-urgent').textContent = urgent;
      
      const hasData = good + fair + attention + urgent > 0;
      document.getElementById('inspection-summary').style.display = hasData ? 'block' : 'none';
    }
    
    async function openInspectionModal(packageId, vehicleId) {
      document.getElementById('inspection-package-id').value = packageId;
      document.getElementById('inspection-vehicle-id').value = vehicleId;
      document.getElementById('inspection-report-id').value = '';
      inspectionData = {};
      
      document.querySelectorAll('.inspection-status-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.inspection-measurement input').forEach(i => i.value = '');
      document.getElementById('inspection-notes').value = '';
      document.getElementById('inspection-recommendations').value = '';
      document.getElementById('inspection-type').value = 'standard';
      document.getElementById('inspection-photo-preview').innerHTML = '';
      document.getElementById('inspection-summary').style.display = 'none';
      
      try {
        const { data: existing } = await supabaseClient
          .from('inspection_reports')
          .select('*')
          .eq('package_id', packageId)
          .single();
        
        if (existing) {
          document.getElementById('inspection-report-id').value = existing.id;
          document.getElementById('inspection-type').value = existing.inspection_type || 'standard';
          document.getElementById('inspection-notes').value = existing.technician_notes || '';
          document.getElementById('inspection-recommendations').value = existing.recommendations || '';
          
          const fields = ['engine_oil', 'transmission_fluid', 'coolant_level', 'brake_fluid', 'power_steering_fluid',
            'brake_pads_front', 'brake_pads_rear', 'brake_rotors',
            'tire_front_left', 'tire_front_right', 'tire_rear_left', 'tire_rear_right', 'spare_tire',
            'battery', 'headlights', 'taillights', 'turn_signals',
            'serpentine_belt', 'hoses', 'wiper_blades', 'windshield',
            'shocks_struts', 'alignment', 'air_filter', 'cabin_filter'];
          
          fields.forEach(field => {
            if (existing[field]) {
              inspectionData[field] = existing[field];
              const item = document.querySelector(`.inspection-item[data-field="${field}"]`);
              if (item) {
                const btn = item.querySelector(`.inspection-status-btn.${existing[field]}`);
                if (btn) btn.classList.add('active');
              }
            }
          });
          
          if (existing.brake_pads_front_percent) document.getElementById('brake_pads_front_percent').value = existing.brake_pads_front_percent;
          if (existing.brake_pads_rear_percent) document.getElementById('brake_pads_rear_percent').value = existing.brake_pads_rear_percent;
          if (existing.tire_front_left_tread) document.getElementById('tire_front_left_tread').value = existing.tire_front_left_tread;
          if (existing.tire_front_right_tread) document.getElementById('tire_front_right_tread').value = existing.tire_front_right_tread;
          if (existing.tire_rear_left_tread) document.getElementById('tire_rear_left_tread').value = existing.tire_rear_left_tread;
          if (existing.tire_rear_right_tread) document.getElementById('tire_rear_right_tread').value = existing.tire_rear_right_tread;
          if (existing.battery_voltage) document.getElementById('battery_voltage').value = existing.battery_voltage;
          
          updateInspectionSummary();
        }
      } catch (e) {
        console.log('No existing inspection or error:', e);
      }
      
      openModal('inspection-modal');
    }
    
    function calculateOverallCondition() {
      let urgent = 0, attention = 0, fair = 0, good = 0;
      Object.values(inspectionData).forEach(status => {
        if (status === 'urgent') urgent++;
        else if (status === 'needs_attention') attention++;
        else if (status === 'fair') fair++;
        else if (status === 'good') good++;
      });
      
      if (urgent > 0) return 'needs_attention';
      if (attention > 2) return 'needs_attention';
      if (attention > 0 || fair > 3) return 'fair';
      if (fair > 0) return 'good';
      return 'excellent';
    }
    
    async function saveInspectionReport() {
      const packageId = document.getElementById('inspection-package-id').value;
      const vehicleId = document.getElementById('inspection-vehicle-id').value;
      const reportId = document.getElementById('inspection-report-id').value;
      
      let urgent = 0, attention = 0;
      Object.values(inspectionData).forEach(status => {
        if (status === 'urgent') urgent++;
        else if (status === 'needs_attention') attention++;
      });
      
      const reportData = {
        package_id: packageId,
        vehicle_id: vehicleId,
        provider_id: currentUser.id,
        inspection_type: document.getElementById('inspection-type').value,
        inspection_date: new Date().toISOString(),
        overall_condition: calculateOverallCondition(),
        urgent_items: urgent,
        attention_items: attention,
        technician_notes: document.getElementById('inspection-notes').value || null,
        recommendations: document.getElementById('inspection-recommendations').value || null,
        ...inspectionData,
        brake_pads_front_percent: parseInt(document.getElementById('brake_pads_front_percent').value) || null,
        brake_pads_rear_percent: parseInt(document.getElementById('brake_pads_rear_percent').value) || null,
        tire_front_left_tread: parseInt(document.getElementById('tire_front_left_tread').value) || null,
        tire_front_right_tread: parseInt(document.getElementById('tire_front_right_tread').value) || null,
        tire_rear_left_tread: parseInt(document.getElementById('tire_rear_left_tread').value) || null,
        tire_rear_right_tread: parseInt(document.getElementById('tire_rear_right_tread').value) || null,
        battery_voltage: parseFloat(document.getElementById('battery_voltage').value) || null,
        updated_at: new Date().toISOString()
      };
      
      try {
        let result;
        if (reportId) {
          result = await supabaseClient.from('inspection_reports').update(reportData).eq('id', reportId);
        } else {
          result = await supabaseClient.from('inspection_reports').insert(reportData);
        }
        
        if (result.error) throw result.error;
        
        closeModal('inspection-modal');
        showToast('🔍 Inspection report saved successfully!', 'success');
        await loadActiveJobs();
      } catch (err) {
        console.error('Error saving inspection:', err);
        showToast('Failed to save inspection: ' + err.message, 'error');
      }
    }

    // ========== DESTINATION TASKS ==========
    let destinationTasks = [];
    let completedDestTasks = [];
    let currentDestFilter = 'all';
    let currentDestTask = null;

    const destServiceTypeLabels = {
      'airport_pickup': { icon: '✈️', label: 'Airport Pickup', class: 'airport' },
      'airport_dropoff': { icon: '✈️', label: 'Airport Drop-off', class: 'airport' },
      'parking': { icon: '🅿️', label: 'Airport Parking', class: 'airport' },
      'dealership': { icon: '🔧', label: 'Dealership', class: 'dealership' },
      'dealership_pickup': { icon: '🔧', label: 'Dealership Pickup', class: 'dealership' },
      'dealership_dropoff': { icon: '🔧', label: 'Dealership Drop-off', class: 'dealership' },
      'detailing': { icon: '✨', label: 'Detailing', class: 'detail' },
      'detail': { icon: '✨', label: 'Detail', class: 'detail' },
      'valet': { icon: '🔑', label: 'Valet', class: 'valet' },
      'valet_event': { icon: '🔑', label: 'Valet Event', class: 'valet' }
    };

    const destStatusLabels = {
      'pending': 'Pending',
      'assigned': 'Assigned',
      'accepted': 'Accepted',
      'en_route': 'En Route',
      'in_transit': 'In Transit',
      'picked_up': 'Picked Up',
      'in_progress': 'In Progress',
      'at_destination': 'At Destination',
      'parked': 'Parked',
      'returning': 'Returning',
      'completed': 'Completed',
      'cancelled': 'Cancelled'
    };

    const destStatusWorkflow = ['pending', 'assigned', 'en_route', 'picked_up', 'in_progress', 'at_destination', 'completed'];

    async function loadDestinationTasks() {
      if (!currentUser) return;
      
      try {
        const { data, error } = await getProviderDestinationServices(currentUser.id);
        if (error) throw error;
        
        destinationTasks = (data || []).filter(t => t.status !== 'completed' && t.status !== 'cancelled');
        completedDestTasks = (data || []).filter(t => t.status === 'completed');
        
        updateDestinationStats();
        renderDestinationTasks();
        updateDestinationBadge();
        renderCompletedTasksStats();
      } catch (err) {
        console.error('Error loading destination tasks:', err);
      }
    }

    let currentDestTypeFilter = 'all';
    let currentDestSort = 'time';

    function updateDestinationStats() {
      const today = new Date();
      const todayStr = today.toDateString();
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const todayTasks = destinationTasks.filter(t => {
        const taskDate = t.estimated_pickup_time ? new Date(t.estimated_pickup_time).toDateString() : null;
        return taskDate === todayStr;
      });
      
      const inProgress = destinationTasks.filter(t => ['en_route', 'in_transit', 'picked_up', 'in_progress'].includes(t.status)).length;
      
      const weekCompleted = completedDestTasks.filter(t => {
        const completedDate = t.completed_at ? new Date(t.completed_at) : null;
        return completedDate && completedDate >= weekAgo;
      });
      
      let avgTimeMinutes = 0;
      if (weekCompleted.length > 0) {
        const totalMinutes = weekCompleted.reduce((sum, t) => {
          if (t.created_at && t.completed_at) {
            const start = new Date(t.created_at);
            const end = new Date(t.completed_at);
            return sum + (end - start) / (1000 * 60);
          }
          return sum;
        }, 0);
        avgTimeMinutes = Math.round(totalMinutes / weekCompleted.length);
      }
      
      const avgTimeDisplay = avgTimeMinutes > 0 
        ? (avgTimeMinutes >= 60 ? `${Math.floor(avgTimeMinutes/60)}h ${avgTimeMinutes%60}m` : `${avgTimeMinutes}m`)
        : '--';
      
      document.getElementById('dest-today-count').textContent = todayTasks.length;
      document.getElementById('dest-week-completed').textContent = weekCompleted.length;
      document.getElementById('dest-avg-time').textContent = avgTimeDisplay;
      document.getElementById('dest-inprogress-count').textContent = inProgress;
    }

    function updateDestinationBadge() {
      const badge = document.getElementById('destination-count');
      const activeCount = destinationTasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length;
      if (activeCount > 0) {
        badge.textContent = activeCount > 9 ? '9+' : activeCount;
        badge.style.display = 'inline';
      } else {
        badge.style.display = 'none';
      }
    }

    function filterDestinationTasks(filter) {
      currentDestFilter = filter;
      document.querySelectorAll('.dest-filter-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.filter === filter);
      });
      renderDestinationTasks();
    }

    function filterDestTypeQuick(type) {
      currentDestTypeFilter = type;
      document.querySelectorAll('.dest-type-filter').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
      });
      renderDestinationTasks();
    }

    function sortDestinationTasks(sortBy) {
      currentDestSort = sortBy;
      renderDestinationTasks();
    }

    function getFilteredDestTasks() {
      const today = new Date();
      const todayStr = today.toDateString();
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      
      let tasks = [];
      
      if (currentDestFilter === 'all') {
        tasks = [...destinationTasks];
      } else if (currentDestFilter === 'today') {
        tasks = destinationTasks.filter(t => {
          const taskDate = t.estimated_pickup_time ? new Date(t.estimated_pickup_time).toDateString() : null;
          return taskDate === todayStr;
        });
      } else if (currentDestFilter === 'upcoming') {
        tasks = destinationTasks.filter(t => {
          if (!t.estimated_pickup_time) return true;
          const taskDate = new Date(t.estimated_pickup_time);
          return taskDate >= tomorrow;
        });
      } else if (currentDestFilter === 'completed') {
        tasks = [...completedDestTasks];
      }
      
      if (currentDestTypeFilter !== 'all') {
        tasks = tasks.filter(task => {
          const serviceType = task.service_type || '';
          if (currentDestTypeFilter === 'airport') {
            return serviceType.includes('airport') || serviceType === 'parking';
          }
          if (currentDestTypeFilter === 'dealership') {
            return serviceType.includes('dealership');
          }
          if (currentDestTypeFilter === 'detail') {
            return serviceType.includes('detail') || serviceType === 'detailing';
          }
          if (currentDestTypeFilter === 'valet') {
            return serviceType.includes('valet');
          }
          return true;
        });
      }
      
      tasks.sort((a, b) => {
        switch(currentDestSort) {
          case 'time':
            const timeA = a.estimated_pickup_time ? new Date(a.estimated_pickup_time) : new Date(0);
            const timeB = b.estimated_pickup_time ? new Date(b.estimated_pickup_time) : new Date(0);
            return timeA - timeB;
          case 'type':
            return (a.service_type || '').localeCompare(b.service_type || '');
          case 'status':
            const statusOrder = { pending: 1, assigned: 2, en_route: 3, picked_up: 4, in_progress: 5, at_destination: 6, returning: 7, completed: 8 };
            return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
          case 'priority':
            return getTaskPriority(b) - getTaskPriority(a);
          default:
            return 0;
        }
      });
      
      return tasks;
    }

    function getTaskPriority(task) {
      if (!task.estimated_pickup_time) return 0;
      const now = new Date();
      const pickupTime = new Date(task.estimated_pickup_time);
      const hoursUntil = (pickupTime - now) / (1000 * 60 * 60);
      
      if (hoursUntil < 0) return 3;
      if (hoursUntil < 2) return 2;
      if (hoursUntil < 24) return 1;
      return 0;
    }

    function getTaskPriorityBadge(task) {
      const priority = getTaskPriority(task);
      if (priority === 3) return '<span class="dest-task-priority high">⚠️ OVERDUE</span>';
      if (priority === 2) return '<span class="dest-task-priority high">⚡ URGENT</span>';
      if (priority === 1) return '<span class="dest-task-priority normal">📅 TODAY</span>';
      return '';
    }

    function renderDestinationTasks() {
      const container = document.getElementById('destination-task-list');
      const tasks = getFilteredDestTasks();
      
      if (!tasks.length) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🚗</div>
            <p>${currentDestFilter === 'all' ? 'No destination tasks yet. Tasks will appear here when members request transport services.' : 'No ' + currentDestFilter + ' tasks found.'}</p>
          </div>
        `;
        return;
      }
      
      container.innerHTML = tasks.map(task => renderDestTaskCard(task)).join('');
    }

    function renderDestTaskCard(task) {
      const pkg = task.maintenance_packages || {};
      const vehicle = pkg.vehicles || {};
      const vehicleName = vehicle.year ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Vehicle';
      
      const member = pkg.profiles || task.member || {};
      const memberName = member.full_name || member.name || 'Member';
      
      const typeInfo = destServiceTypeLabels[task.service_type] || { icon: '🚗', label: task.service_type, class: '' };
      const statusLabel = destStatusLabels[task.status] || task.status;
      
      const pickupLocation = task.pickup_location || 'TBD';
      const dropoffLocation = task.dropoff_location || task.parking_location || 'TBD';
      
      const scheduledTime = task.estimated_pickup_time 
        ? new Date(task.estimated_pickup_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        : 'Not scheduled';
      
      const priorityBadge = getTaskPriorityBadge(task);
      
      return `
        <div class="dest-task-card" onclick="openDestTaskDetail('${task.id}')">
          <div class="dest-task-header">
            <div>
              <span class="dest-task-type ${typeInfo.class}">${typeInfo.icon} ${typeInfo.label}</span>
              ${priorityBadge}
            </div>
            <span class="dest-task-status ${task.status}">${statusLabel}</span>
          </div>
          
          <div style="margin-bottom:12px;">
            <div style="font-weight:600;font-size:1rem;">${vehicleName}</div>
            <div style="font-size:0.88rem;color:var(--text-secondary);">👤 ${memberName}</div>
          </div>
          
          <div style="font-size:0.85rem;color:var(--accent-gold);margin-bottom:12px;">
            🕐 ${scheduledTime}
          </div>
          
          <div class="dest-task-route">
            <div style="flex:1;">
              <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:2px;">📍 From</div>
              <div>${pickupLocation.substring(0, 40)}${pickupLocation.length > 40 ? '...' : ''}</div>
            </div>
            <span class="dest-task-route-arrow">→</span>
            <div style="flex:1;">
              <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:2px;">🏁 To</div>
              <div>${dropoffLocation.substring(0, 40)}${dropoffLocation.length > 40 ? '...' : ''}</div>
            </div>
          </div>
          
          <div class="dest-task-meta">
            ${task.flight_number ? `<span>✈️ ${task.flight_number}</span>` : ''}
            ${task.dealership_name ? `<span>🏢 ${task.dealership_name}</span>` : ''}
            ${pkg.title ? `<span>📦 ${pkg.title}</span>` : ''}
          </div>
          
          <div class="dest-task-actions" onclick="event.stopPropagation();">
            ${getDestTaskActionButtons(task)}
          </div>
        </div>
      `;
    }

    function getDestTaskActionButtons(task) {
      const buttons = [];
      
      switch(task.status) {
        case 'pending':
          buttons.push(`<button class="btn btn-primary btn-sm" onclick="updateDestTaskStatus('${task.id}', 'assigned')">✓ Accept Task</button>`);
          buttons.push(`<button class="btn btn-secondary btn-sm" onclick="openDriverAssignment('${task.id}')">👤 Assign Driver</button>`);
          break;
        case 'assigned':
        case 'accepted':
          buttons.push(`<button class="btn btn-primary btn-sm" onclick="openDestStatusUpdate('${task.id}', 'en_route')">🚗 Start Pickup</button>`);
          break;
        case 'en_route':
          buttons.push(`<button class="btn btn-primary btn-sm" onclick="openDestStatusUpdate('${task.id}', 'picked_up')">📸 Mark Picked Up</button>`);
          break;
        case 'picked_up':
        case 'in_transit':
          buttons.push(`<button class="btn btn-primary btn-sm" onclick="openDestStatusUpdate('${task.id}', 'at_destination')">🏁 At Destination</button>`);
          break;
        case 'in_progress':
          buttons.push(`<button class="btn btn-primary btn-sm" onclick="openDestStatusUpdate('${task.id}', 'at_destination')">🏁 At Destination</button>`);
          break;
        case 'at_destination':
          if (task.service_type?.includes('airport') || task.service_type === 'parking') {
            buttons.push(`<button class="btn btn-secondary btn-sm" onclick="openDestStatusUpdate('${task.id}', 'returning')">🚗 Start Return</button>`);
          }
          buttons.push(`<button class="btn btn-primary btn-sm" onclick="openDestStatusUpdate('${task.id}', 'completed')">✅ Complete</button>`);
          break;
        case 'returning':
          buttons.push(`<button class="btn btn-primary btn-sm" onclick="openDestStatusUpdate('${task.id}', 'completed')">✅ Complete</button>`);
          break;
      }
      
      buttons.push(`<button class="btn btn-ghost btn-sm" onclick="openDestTaskDetail('${task.id}')">View Details</button>`);
      
      return buttons.join('');
    }

    async function openDestTaskDetail(serviceId) {
      openModal('destination-task-modal');
      
      const task = destinationTasks.find(t => t.id === serviceId) || completedDestTasks.find(t => t.id === serviceId);
      if (!task) {
        document.getElementById('dest-task-modal-body').innerHTML = '<div class="empty-state"><p>Task not found</p></div>';
        return;
      }
      
      currentDestTask = task;
      const pkg = task.maintenance_packages || {};
      const vehicle = pkg.vehicles || {};
      const vehicleName = vehicle.year ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Vehicle';
      const typeInfo = destServiceTypeLabels[task.service_type] || { icon: '🚗', label: task.service_type, class: '' };
      
      const member = pkg.profiles || task.member || {};
      const memberName = member.full_name || member.name || 'Member';
      const memberPhone = member.phone || member.phone_number || '';
      const memberEmail = member.email || '';
      
      const pickupAddr = task.pickup_location || '';
      const dropoffAddr = task.dropoff_location || task.parking_location || '';
      const mapsPickupUrl = pickupAddr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pickupAddr)}` : '';
      const mapsDropoffUrl = dropoffAddr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dropoffAddr)}` : '';
      
      document.getElementById('dest-task-modal-title').textContent = `${typeInfo.icon} ${typeInfo.label}`;
      
      let detailsHtml = `
        <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;">
            <div style="font-size:1.2rem;font-weight:600;margin-bottom:4px;">${vehicleName}</div>
            <div style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:8px;">${pkg.title || 'Transport Service'}</div>
            <span class="dest-task-status ${task.status}">${destStatusLabels[task.status] || task.status}</span>
          </div>
          ${vehicle.color || vehicle.license_plate ? `
            <div style="padding:12px 16px;background:var(--bg-input);border-radius:var(--radius-md);">
              ${vehicle.color ? `<div style="font-size:0.85rem;"><span style="color:var(--text-muted);">Color:</span> ${vehicle.color}</div>` : ''}
              ${vehicle.license_plate ? `<div style="font-size:0.85rem;"><span style="color:var(--text-muted);">Plate:</span> ${vehicle.license_plate}</div>` : ''}
            </div>
          ` : ''}
        </div>
        
        <!-- Member Contact Info -->
        <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:16px;margin-bottom:20px;">
          <div style="font-weight:600;margin-bottom:12px;">👤 Member Contact</div>
          <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;">
            <div style="font-size:1rem;font-weight:500;">${memberName}</div>
            ${memberPhone ? `<a href="tel:${memberPhone}" class="btn btn-sm btn-secondary" style="text-decoration:none;">📞 ${memberPhone}</a>` : ''}
            ${memberEmail ? `<a href="mailto:${memberEmail}" class="btn btn-sm btn-secondary" style="text-decoration:none;">✉️ Email</a>` : ''}
          </div>
        </div>
        
        <!-- Route Info with Maps Links -->
        <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:16px;margin-bottom:20px;">
          <div style="font-weight:600;margin-bottom:12px;">📍 Route Information</div>
          <div class="dest-task-route" style="margin:0;">
            <div style="flex:1;">
              <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:2px;">Pickup</div>
              <div>${pickupAddr || 'Not specified'}</div>
              ${mapsPickupUrl ? `<a href="${mapsPickupUrl}" target="_blank" style="color:var(--accent-gold);font-size:0.85rem;text-decoration:none;">🗺️ Open in Maps</a>` : ''}
            </div>
            <span class="dest-task-route-arrow">→</span>
            <div style="flex:1;">
              <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:2px;">Destination</div>
              <div>${dropoffAddr || 'Not specified'}</div>
              ${mapsDropoffUrl ? `<a href="${mapsDropoffUrl}" target="_blank" style="color:var(--accent-gold);font-size:0.85rem;text-decoration:none;">🗺️ Open in Maps</a>` : ''}
            </div>
          </div>
          ${task.estimated_pickup_time ? `
            <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-subtle);">
              <span style="color:var(--text-muted);">Scheduled:</span> 
              <span style="color:var(--accent-gold);font-weight:500;">${new Date(task.estimated_pickup_time).toLocaleString()}</span>
            </div>
          ` : ''}
        </div>
      `;
      
      // Service-specific details
      if (task.service_type?.includes('airport') || task.service_type === 'parking') {
        detailsHtml += `
          <div style="background:var(--accent-blue-soft);border:1px solid rgba(74,124,255,0.3);border-radius:var(--radius-md);padding:16px;margin-bottom:20px;">
            <div style="font-weight:600;margin-bottom:12px;">✈️ Flight Information</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              ${task.flight_number ? `<div><span style="color:var(--text-muted);">Flight:</span> ${task.flight_number}</div>` : ''}
              ${task.airline ? `<div><span style="color:var(--text-muted);">Airline:</span> ${task.airline}</div>` : ''}
              ${task.flight_datetime ? `<div><span style="color:var(--text-muted);">Flight Time:</span> ${new Date(task.flight_datetime).toLocaleString()}</div>` : ''}
              ${task.trip_type ? `<div><span style="color:var(--text-muted);">Trip Type:</span> ${task.trip_type}</div>` : ''}
            </div>
            ${task.parking_spot ? `<div style="margin-top:12px;padding:12px;background:var(--bg-input);border-radius:var(--radius-sm);"><strong>🅿️ Parking Spot:</strong> ${task.parking_spot}</div>` : ''}
          </div>
        `;
      }
      
      if (task.service_type?.includes('dealership')) {
        detailsHtml += `
          <div style="background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.3);border-radius:var(--radius-md);padding:16px;margin-bottom:20px;">
            <div style="font-weight:600;margin-bottom:12px;">🔧 Dealership Information</div>
            ${task.dealership_name ? `<div style="margin-bottom:8px;"><span style="color:var(--text-muted);">Dealership:</span> ${task.dealership_name}</div>` : ''}
            ${task.dealership_service_type ? `<div><span style="color:var(--text-muted);">Service Type:</span> ${task.dealership_service_type}</div>` : ''}
          </div>
        `;
      }
      
      if (task.service_type?.includes('detail') || task.service_type === 'detailing') {
        detailsHtml += `
          <div style="background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.3);border-radius:var(--radius-md);padding:16px;margin-bottom:20px;">
            <div style="font-weight:600;margin-bottom:12px;">✨ Detail Service</div>
            ${task.detail_service_level ? `<div><span style="color:var(--text-muted);">Service Level:</span> ${task.detail_service_level}</div>` : ''}
          </div>
        `;
      }
      
      if (task.service_type?.includes('valet')) {
        detailsHtml += `
          <div style="background:rgba(236,72,153,0.1);border:1px solid rgba(236,72,153,0.3);border-radius:var(--radius-md);padding:16px;margin-bottom:20px;">
            <div style="font-weight:600;margin-bottom:12px;">🔑 Valet Event</div>
            ${task.valet_event_name ? `<div style="margin-bottom:8px;"><span style="color:var(--text-muted);">Event:</span> ${task.valet_event_name}</div>` : ''}
            ${task.valet_venue ? `<div><span style="color:var(--text-muted);">Venue:</span> ${task.valet_venue}</div>` : ''}
          </div>
        `;
      }
      
      // Special instructions
      if (task.special_instructions) {
        detailsHtml += `
          <div style="background:var(--accent-gold-soft);border:1px solid rgba(212,168,85,0.3);border-radius:var(--radius-md);padding:16px;margin-bottom:20px;">
            <div style="font-weight:600;margin-bottom:8px;">📝 Special Instructions</div>
            <div style="color:var(--text-secondary);">${task.special_instructions}</div>
          </div>
        `;
      }
      
      // Status Timeline
      detailsHtml += `
        <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:16px;margin-bottom:20px;">
          <div style="font-weight:600;margin-bottom:16px;">📊 Status Timeline</div>
          ${renderDestStatusTimeline(task)}
        </div>
      `;
      
      document.getElementById('dest-task-modal-body').innerHTML = detailsHtml;
      
      // Footer actions
      const footerHtml = `
        <button class="btn btn-secondary" onclick="closeModal('destination-task-modal')">Close</button>
        ${getDestTaskActionButtons(task)}
      `;
      document.getElementById('dest-task-modal-footer').innerHTML = footerHtml;
    }

    function renderDestStatusTimeline(task) {
      const currentStatusIndex = destStatusWorkflow.indexOf(task.status);
      
      return destStatusWorkflow.map((status, index) => {
        let stepClass = '';
        if (index < currentStatusIndex || task.status === 'completed') {
          stepClass = 'completed';
        } else if (index === currentStatusIndex) {
          stepClass = 'current';
        } else {
          stepClass = 'pending';
        }
        
        const icon = stepClass === 'completed' ? '✓' : (stepClass === 'current' ? '●' : '○');
        const label = destStatusLabels[status] || status;
        
        return `
          <div class="dest-timeline-item ${stepClass}">
            <div class="dest-timeline-dot">${icon}</div>
            <div style="flex:1;padding-top:4px;">
              <div style="font-weight:500;font-size:0.9rem;">${label}</div>
              ${stepClass === 'completed' || stepClass === 'current' ? '<div style="font-size:0.78rem;color:var(--text-muted);">Updated</div>' : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    function openDestStatusUpdate(serviceId, newStatus) {
      const task = destinationTasks.find(t => t.id === serviceId);
      if (!task) return;
      
      document.getElementById('dest-status-service-id').value = serviceId;
      document.getElementById('dest-status-new-status').value = newStatus;
      document.getElementById('dest-status-notes').value = '';
      document.getElementById('dest-status-photo-preview').innerHTML = '';
      document.getElementById('dest-parking-spot').value = '';
      document.getElementById('dest-location-lat').value = '';
      document.getElementById('dest-location-lng').value = '';
      document.getElementById('dest-location-status').textContent = 'Click "Capture Location" to record GPS coordinates';
      
      // Reset new fields
      const odometerInput = document.getElementById('dest-odometer-reading');
      const fuelSelect = document.getElementById('dest-fuel-level');
      const finalOdometerInput = document.getElementById('dest-final-odometer');
      if (odometerInput) odometerInput.value = '';
      if (fuelSelect) fuelSelect.value = '';
      if (finalOdometerInput) finalOdometerInput.value = '';
      
      const statusInfo = {
        'assigned': '✓ Accepting this task - you will be responsible for completing it.',
        'en_route': '🚗 Starting pickup - you are on your way to pick up the vehicle.',
        'picked_up': '📸 Marking vehicle as picked up - please capture a photo, odometer reading, and fuel level.',
        'at_destination': '🏁 Arrived at destination - please capture a photo and record the location.',
        'returning': '🚗 Starting return trip - you are bringing the vehicle back.',
        'completed': '✅ Completing delivery - please capture a return photo and final odometer reading.'
      };
      
      document.getElementById('dest-status-info').textContent = statusInfo[newStatus] || 'Updating task status...';
      document.getElementById('dest-status-modal-title').textContent = destStatusLabels[newStatus] || 'Update Status';
      
      // Show/hide parking spot field for airport services
      const isAirport = task.service_type?.includes('airport') || task.service_type === 'parking';
      document.getElementById('dest-parking-group').style.display = (isAirport && newStatus === 'at_destination') ? 'block' : 'none';
      
      // Show/hide odometer and fuel level for pickup
      const isPickup = newStatus === 'picked_up';
      document.getElementById('dest-odometer-group').style.display = isPickup ? 'block' : 'none';
      document.getElementById('dest-fuel-group').style.display = isPickup ? 'block' : 'none';
      
      // Show/hide final odometer for completion
      const isCompleted = newStatus === 'completed';
      document.getElementById('dest-final-odometer-group').style.display = isCompleted ? 'block' : 'none';
      
      // Update notes label based on status
      const notesLabel = document.getElementById('dest-notes-label');
      if (isCompleted) {
        notesLabel.textContent = 'Delivery Notes';
        document.getElementById('dest-status-notes').placeholder = 'Any notes about the delivery (condition, location, etc.)...';
      } else {
        notesLabel.textContent = 'Notes (optional)';
        document.getElementById('dest-status-notes').placeholder = 'Any notes about this status update...';
      }
      
      closeModal('destination-task-modal');
      openModal('dest-status-modal');
    }

    function previewDestStatusPhoto() {
      const input = document.getElementById('dest-status-photo');
      const preview = document.getElementById('dest-status-photo-preview');
      
      if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
          preview.innerHTML = `<img src="${e.target.result}" style="width:100px;height:75px;object-fit:cover;border-radius:var(--radius-sm);border:1px solid var(--border-subtle);">`;
        };
        reader.readAsDataURL(input.files[0]);
      }
    }

    function captureDestLocation() {
      const statusEl = document.getElementById('dest-location-status');
      statusEl.textContent = 'Capturing location...';
      
      if (!navigator.geolocation) {
        statusEl.textContent = '❌ Geolocation not supported';
        return;
      }
      
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          document.getElementById('dest-location-lat').value = pos.coords.latitude;
          document.getElementById('dest-location-lng').value = pos.coords.longitude;
          statusEl.innerHTML = `✅ Location captured: <a href="https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}" target="_blank" style="color:var(--accent-gold);">View on Map</a>`;
        },
        (err) => {
          statusEl.textContent = '❌ Failed to get location: ' + err.message;
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }

    async function submitDestStatusUpdate() {
      const serviceId = document.getElementById('dest-status-service-id').value;
      const newStatus = document.getElementById('dest-status-new-status').value;
      const notes = document.getElementById('dest-status-notes').value;
      const parkingSpot = document.getElementById('dest-parking-spot').value;
      const lat = document.getElementById('dest-location-lat').value;
      const lng = document.getElementById('dest-location-lng').value;
      const odometerReading = document.getElementById('dest-odometer-reading')?.value;
      const fuelLevel = document.getElementById('dest-fuel-level')?.value;
      const finalOdometer = document.getElementById('dest-final-odometer')?.value;
      
      const btn = document.getElementById('dest-status-submit-btn');
      btn.disabled = true;
      btn.textContent = 'Updating...';
      
      try {
        const extraData = {};
        if (notes) extraData.notes = notes;
        if (parkingSpot) extraData.parking_spot = parkingSpot;
        if (lat && lng) {
          extraData.last_location_lat = parseFloat(lat);
          extraData.last_location_lng = parseFloat(lng);
        }
        
        // Capture odometer and fuel level for pickup
        if (newStatus === 'picked_up') {
          if (odometerReading) extraData.pickup_odometer = parseInt(odometerReading);
          if (fuelLevel) extraData.pickup_fuel_level = fuelLevel;
        }
        
        // Capture final odometer for completion
        if (newStatus === 'completed') {
          if (finalOdometer) extraData.dropoff_odometer = parseInt(finalOdometer);
          if (notes) extraData.delivery_notes = notes;
        }
        
        // Handle photo upload if present
        const photoInput = document.getElementById('dest-status-photo');
        if (photoInput.files && photoInput.files[0]) {
          const file = photoInput.files[0];
          const resized = await resizeImage(file, 1280, 0.8);
          const filename = `${serviceId}/${newStatus}_${Date.now()}.jpg`;
          const { error: uploadErr } = await supabaseClient.storage
            .from('package-photos')
            .upload(filename, resized, { contentType: 'image/jpeg' });
          
          if (!uploadErr) {
            const { data: urlData } = supabaseClient.storage.from('package-photos').getPublicUrl(filename);
            if (newStatus === 'picked_up') {
              extraData.pickup_photo_url = urlData.publicUrl;
            } else if (newStatus === 'at_destination' || newStatus === 'completed') {
              extraData.dropoff_photo_url = urlData.publicUrl;
            }
          }
        }
        
        const { error } = await updateDestinationServiceStatus(serviceId, newStatus, extraData);
        if (error) throw new Error(error);
        
        closeModal('dest-status-modal');
        showToast(`Status updated to ${destStatusLabels[newStatus]}!`, 'success');
        await loadDestinationTasks();
      } catch (err) {
        console.error('Error updating status:', err);
        showToast('Failed to update status: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Update Status';
      }
    }

    async function updateDestTaskStatus(serviceId, newStatus) {
      try {
        const { error } = await updateDestinationServiceStatus(serviceId, newStatus);
        if (error) throw new Error(error);
        
        showToast(`Status updated to ${destStatusLabels[newStatus]}!`, 'success');
        await loadDestinationTasks();
      } catch (err) {
        console.error('Error updating status:', err);
        showToast('Failed to update status: ' + err.message, 'error');
      }
    }

    async function openDriverAssignment(serviceId) {
      document.getElementById('dest-driver-service-id').value = serviceId;
      
      // Load team members
      try {
        const { data: teamMembers } = await supabaseClient
          .from('team_members')
          .select('*')
          .eq('provider_id', currentUser.id)
          .eq('is_active', true)
          .in('role', ['driver', 'mechanic', 'technician']);
        
        const select = document.getElementById('dest-driver-select');
        select.innerHTML = '<option value="">Select a team member...</option>';
        
        if (teamMembers && teamMembers.length > 0) {
          teamMembers.forEach(member => {
            select.innerHTML += `<option value="${member.id}">${member.name} (${member.role})</option>`;
          });
        } else {
          select.innerHTML += '<option value="" disabled>No drivers found. Add team members first.</option>';
        }
        
        openModal('dest-driver-modal');
      } catch (err) {
        console.error('Error loading team members:', err);
        showToast('Failed to load team members', 'error');
      }
    }

    async function assignDestDriver() {
      const serviceId = document.getElementById('dest-driver-service-id').value;
      const driverId = document.getElementById('dest-driver-select').value;
      
      if (!driverId) {
        showToast('Please select a driver', 'error');
        return;
      }
      
      try {
        // Create transport task with driver assigned
        const { error } = await createTransportTask({
          destination_service_id: serviceId,
          driver_id: driverId,
          task_type: 'pickup',
          scheduled_time: new Date().toISOString()
        });
        
        if (error) throw new Error(error);
        
        // Update service status to assigned
        await updateDestinationServiceStatus(serviceId, 'assigned');
        
        closeModal('dest-driver-modal');
        showToast('Driver assigned successfully!', 'success');
        await loadDestinationTasks();
      } catch (err) {
        console.error('Error assigning driver:', err);
        showToast('Failed to assign driver: ' + err.message, 'error');
      }
    }

    function renderCompletedTasksStats() {
      const total = completedDestTasks.length;
      document.getElementById('dest-total-completed').textContent = total;
      
      // Calculate on-time rate (placeholder - would need actual timing data)
      const onTimeRate = total > 0 ? '95%' : '--%';
      document.getElementById('dest-ontime-rate').textContent = onTimeRate;
      
      // Average rating (placeholder)
      document.getElementById('dest-avg-rating').textContent = total > 0 ? '4.8' : '--';
    }

    function toggleCompletedTasksHistory() {
      const container = document.getElementById('completed-tasks-list');
      const isHidden = container.style.display === 'none';
      container.style.display = isHidden ? 'block' : 'none';
      
      if (isHidden && completedDestTasks.length > 0) {
        container.innerHTML = completedDestTasks.slice(0, 10).map(task => {
          const pkg = task.maintenance_packages || {};
          const vehicle = pkg.vehicles || {};
          const vehicleName = vehicle.year ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Vehicle';
          const typeInfo = destServiceTypeLabels[task.service_type] || { icon: '🚗', label: task.service_type };
          const completedDate = task.completed_at ? new Date(task.completed_at).toLocaleDateString() : 'Unknown';
          
          return `
            <div style="padding:12px 0;border-bottom:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center;">
              <div>
                <div style="font-weight:500;">${typeInfo.icon} ${vehicleName}</div>
                <div style="font-size:0.85rem;color:var(--text-muted);">${typeInfo.label} • Completed ${completedDate}</div>
              </div>
              <span class="dest-task-status completed">Completed</span>
            </div>
          `;
        }).join('');
      } else if (isHidden && completedDestTasks.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding:24px;"><p style="color:var(--text-muted);">No completed tasks yet</p></div>';
      }
    }

    // =====================================================
    // FLEET SERVICES FUNCTIONS
    // =====================================================

    let fleetJobQueue = [];
    let fleetBatches = [];
    let fleetCompletedBatches = [];
    let currentFleetBatch = null;
    let currentFleetBidBatch = null;
    let selectedBatchItems = new Set();

    function switchFleetTab(tab) {
      document.querySelectorAll('.fleet-tab').forEach(t => t.classList.remove('active'));
      document.querySelector(`[data-fleet-tab="${tab}"]`).classList.add('active');
      document.querySelectorAll('.fleet-section').forEach(s => s.classList.remove('active'));
      document.getElementById(`fleet-${tab}-section`).classList.add('active');

      if (tab === 'queue') loadFleetJobQueue();
      else if (tab === 'batches') loadFleetBatches();
      else if (tab === 'completed') loadFleetCompletedBatches();
    }

    async function loadFleetJobQueue() {
      const container = document.getElementById('fleet-job-queue');
      container.innerHTML = '<div class="empty-state"><p>Loading fleet requests...</p></div>';

      try {
        const { data, error } = await supabaseClient
          .from('bulk_service_batches')
          .select(`
            *,
            fleet:fleet_id(id, name, company_name, verified),
            items:bulk_service_items(id, vehicle_id, status)
          `)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (error) throw error;
        fleetJobQueue = data || [];

        const badge = document.getElementById('fleet-queue-badge');
        const navBadge = document.getElementById('fleet-count');
        if (fleetJobQueue.length > 0) {
          badge.textContent = fleetJobQueue.length;
          badge.style.display = 'inline';
          navBadge.textContent = fleetJobQueue.length;
          navBadge.style.display = 'inline';
        } else {
          badge.style.display = 'none';
          navBadge.style.display = 'none';
        }

        renderFleetJobQueue();
      } catch (err) {
        console.error('Error loading fleet job queue:', err);
        container.innerHTML = '<div class="empty-state"><p>Failed to load fleet requests.</p></div>';
      }
    }

    function renderFleetJobQueue() {
      const container = document.getElementById('fleet-job-queue');
      
      if (!fleetJobQueue.length) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🏢</div>
            <p>No fleet job requests at the moment. Fleet requests from verified business accounts will appear here.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = fleetJobQueue.map(batch => {
        const fleet = batch.fleet || {};
        const vehicleCount = batch.items?.length || batch.vehicle_count || 0;
        const estimatedValue = batch.estimated_total_value || (vehicleCount * 75);
        const timePosted = batch.created_at ? timeAgo(new Date(batch.created_at)) : 'Recently';

        return `
          <div class="fleet-request-card" style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;flex-wrap:wrap;gap:12px;">
              <div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                  <span style="font-weight:600;font-size:1.05rem;">${fleet.company_name || fleet.name || 'Fleet Account'}</span>
                  ${fleet.verified ? '<span style="background:linear-gradient(135deg, var(--accent-gold), #c49a45);color:#0a0a0f;padding:2px 8px;border-radius:100px;font-size:0.72rem;font-weight:600;">✓ Verified Business</span>' : ''}
                  <span class="fleet-badge" style="background:var(--accent-gold-soft);color:var(--accent-gold);padding:2px 8px;border-radius:100px;font-size:0.72rem;font-weight:500;">🏢 Fleet</span>
                </div>
                <div style="font-size:1rem;margin-bottom:4px;">${batch.name || batch.service_type || 'Bulk Service Request'}</div>
                <div style="font-size:0.85rem;color:var(--text-muted);">Posted ${timePosted}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:0.82rem;color:var(--text-muted);">Estimated Value</div>
                <div style="font-size:1.4rem;font-weight:600;color:var(--accent-gold);">$${estimatedValue.toLocaleString()}</div>
              </div>
            </div>
            
            <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;font-size:0.88rem;">
              <span style="color:var(--text-secondary);">🚗 <strong>${vehicleCount}</strong> vehicles</span>
              ${batch.service_type ? `<span style="color:var(--text-secondary);">🔧 ${batch.service_type}</span>` : ''}
              ${batch.date_range_start && batch.date_range_end ? `<span style="color:var(--text-secondary);">📅 ${new Date(batch.date_range_start).toLocaleDateString()} - ${new Date(batch.date_range_end).toLocaleDateString()}</span>` : ''}
            </div>

            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-primary btn-sm" onclick="openFleetBulkBidModal('${batch.id}')">💼 Submit Bid</button>
              <button class="btn btn-secondary btn-sm" onclick="openFleetRequestDetail('${batch.id}')">View Details</button>
            </div>
          </div>
        `;
      }).join('');
    }

    async function loadFleetBatches() {
      const container = document.getElementById('fleet-batches-list');
      container.innerHTML = '<div class="empty-state"><p>Loading batches...</p></div>';

      try {
        if (!currentUser) return;
        const { data, error } = await supabaseClient
          .from('bulk_service_batches')
          .select(`
            *,
            fleet:fleet_id(id, name, company_name),
            items:bulk_service_items(id, vehicle_id, status, scheduled_date, assigned_driver_id)
          `)
          .eq('assigned_provider_id', currentUser.id)
          .in('status', ['approved', 'in_progress'])
          .order('created_at', { ascending: false });

        if (error) throw error;
        fleetBatches = data || [];
        
        document.getElementById('fleet-active-batches').textContent = fleetBatches.length;
        renderFleetBatches();
      } catch (err) {
        console.error('Error loading fleet batches:', err);
        container.innerHTML = '<div class="empty-state"><p>Failed to load batches.</p></div>';
      }
    }

    function renderFleetBatches() {
      const container = document.getElementById('fleet-batches-list');
      
      if (!fleetBatches.length) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📦</div>
            <p>No active bulk service batches. Accept fleet jobs to see batches here.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = fleetBatches.map(batch => {
        const fleet = batch.fleet || {};
        const items = batch.items || [];
        const completedCount = items.filter(i => i.status === 'completed').length;
        const totalCount = items.length;
        const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
        
        let statusBadge = '';
        let statusClass = '';
        if (completedCount === 0) {
          statusBadge = 'Not Started';
          statusClass = 'pending';
        } else if (completedCount < totalCount) {
          statusBadge = `In Progress (${completedCount}/${totalCount})`;
          statusClass = 'in_progress';
        } else {
          statusBadge = 'Completed';
          statusClass = 'completed';
        }

        return `
          <div class="fleet-batch-card" style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;flex-wrap:wrap;gap:12px;">
              <div>
                <div style="font-weight:600;font-size:1.05rem;margin-bottom:4px;">${batch.name || 'Bulk Service Batch'}</div>
                <div style="font-size:0.9rem;color:var(--text-secondary);">${fleet.company_name || fleet.name || 'Fleet'}</div>
              </div>
              <span class="fleet-item-status ${statusClass}">${statusBadge}</span>
            </div>

            <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;font-size:0.88rem;">
              <span style="color:var(--text-secondary);">🚗 <strong>${totalCount}</strong> vehicles</span>
              ${batch.date_range_start && batch.date_range_end ? `<span style="color:var(--text-secondary);">📅 ${new Date(batch.date_range_start).toLocaleDateString()} - ${new Date(batch.date_range_end).toLocaleDateString()}</span>` : ''}
            </div>

            <div style="margin-bottom:16px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.85rem;">
                <span>Progress</span>
                <span style="color:var(--accent-gold);font-weight:500;">${progress}%</span>
              </div>
              <div style="height:8px;background:var(--bg-input);border-radius:4px;overflow:hidden;">
                <div style="height:100%;width:${progress}%;background:linear-gradient(90deg,var(--accent-gold),#c49a45);transition:width 0.3s;"></div>
              </div>
            </div>

            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-primary btn-sm" onclick="openFleetBatchDetail('${batch.id}')">📋 View Vehicles</button>
            </div>
          </div>
        `;
      }).join('');
    }

    async function loadFleetCompletedBatches() {
      const container = document.getElementById('fleet-completed-list');
      container.innerHTML = '<div class="empty-state"><p>Loading completed jobs...</p></div>';

      try {
        if (!currentUser) return;
        const { data, error } = await supabaseClient
          .from('bulk_service_batches')
          .select(`
            *,
            fleet:fleet_id(id, name, company_name),
            items:bulk_service_items(id, vehicle_id, status)
          `)
          .eq('assigned_provider_id', currentUser.id)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(20);

        if (error) throw error;
        fleetCompletedBatches = data || [];

        document.getElementById('fleet-jobs-completed').textContent = fleetCompletedBatches.length;
        
        if (fleetCompletedBatches.length > 0) {
          const totalVehicles = fleetCompletedBatches.reduce((sum, b) => sum + (b.items?.length || 0), 0);
          const avgVehicles = Math.round(totalVehicles / fleetCompletedBatches.length);
          document.getElementById('fleet-avg-vehicles').textContent = avgVehicles;
        }

        renderFleetCompletedBatches();
      } catch (err) {
        console.error('Error loading completed fleet batches:', err);
        container.innerHTML = '<div class="empty-state"><p>Failed to load completed jobs.</p></div>';
      }
    }

    function renderFleetCompletedBatches() {
      const container = document.getElementById('fleet-completed-list');
      
      if (!fleetCompletedBatches.length) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">✅</div>
            <p>No completed fleet jobs yet.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = fleetCompletedBatches.map(batch => {
        const fleet = batch.fleet || {};
        const completedDate = batch.completed_at ? new Date(batch.completed_at).toLocaleDateString() : 'Unknown';
        const vehicleCount = batch.items?.length || 0;

        return `
          <div style="padding:16px 0;border-bottom:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
            <div>
              <div style="font-weight:500;">${batch.name || 'Bulk Service'}</div>
              <div style="font-size:0.85rem;color:var(--text-muted);">${fleet.company_name || fleet.name || 'Fleet'} • ${vehicleCount} vehicles • Completed ${completedDate}</div>
            </div>
            <span class="fleet-item-status completed">✅ Completed</span>
          </div>
        `;
      }).join('');
    }

    async function openFleetBatchDetail(batchId) {
      openModal('fleet-batch-modal');
      document.getElementById('fleet-batch-modal-body').innerHTML = '<div class="empty-state"><p>Loading batch details...</p></div>';

      try {
        const { data, error } = await getBulkBatchDetails(batchId);
        if (error) throw new Error(error);

        currentFleetBatch = data;
        selectedBatchItems.clear();
        renderFleetBatchDetail();
      } catch (err) {
        console.error('Error loading batch details:', err);
        document.getElementById('fleet-batch-modal-body').innerHTML = '<div class="empty-state"><p>Failed to load batch details.</p></div>';
      }
    }

    function renderFleetBatchDetail() {
      if (!currentFleetBatch) return;

      const batch = currentFleetBatch;
      const items = batch.items || [];
      const fleet = batch.fleet || {};
      const completedCount = items.filter(i => i.status === 'completed').length;
      const progress = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

      document.getElementById('fleet-batch-modal-title').textContent = `📦 ${batch.name || 'Batch Details'}`;

      let html = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
          <div>
            <div style="font-size:0.9rem;color:var(--text-secondary);">${fleet.company_name || fleet.name || 'Fleet'}</div>
            <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
              <span style="font-size:0.88rem;color:var(--text-secondary);">🚗 ${items.length} vehicles</span>
              ${batch.date_range_start ? `<span style="font-size:0.88rem;color:var(--text-secondary);">📅 ${new Date(batch.date_range_start).toLocaleDateString()} - ${new Date(batch.date_range_end || batch.date_range_start).toLocaleDateString()}</span>` : ''}
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:0.82rem;color:var(--text-muted);">Progress</div>
            <div style="font-size:1.2rem;font-weight:600;color:var(--accent-gold);">${progress}%</div>
          </div>
        </div>

        <div style="margin-bottom:20px;">
          <div style="height:8px;background:var(--bg-input);border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${progress}%;background:linear-gradient(90deg,var(--accent-gold),#c49a45);transition:width 0.3s;"></div>
          </div>
        </div>

        <div class="fleet-bulk-actions">
          <button class="btn btn-secondary btn-sm" onclick="selectAllBatchItems()">☑️ Select All</button>
          <button class="btn btn-primary btn-sm" onclick="markSelectedComplete()" ${selectedBatchItems.size === 0 ? 'disabled' : ''}>✅ Mark Selected Complete</button>
        </div>

        <div style="max-height:400px;overflow-y:auto;">
      `;

      items.forEach((item, index) => {
        const vehicle = item.vehicle || {};
        const vehicleName = vehicle.year ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : `Vehicle ${index + 1}`;
        const scheduledDate = item.scheduled_date ? new Date(item.scheduled_date).toLocaleDateString() : 'Not scheduled';
        const statusLabels = {
          pending: 'Pending',
          scheduled: 'Scheduled',
          in_progress: 'In Progress',
          completed: 'Completed',
          skipped: 'Skipped'
        };

        html += `
          <div class="fleet-vehicle-item" style="display:flex;align-items:center;gap:12px;padding:16px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-md);margin-bottom:8px;">
            <input type="checkbox" style="width:20px;height:20px;cursor:pointer;" 
              ${selectedBatchItems.has(item.id) ? 'checked' : ''} 
              ${item.status === 'completed' || item.status === 'skipped' ? 'disabled' : ''}
              onchange="toggleBatchItem('${item.id}')">
            
            <div style="flex:1;min-width:150px;">
              <div style="font-weight:500;">${vehicleName}</div>
              ${item.assigned_driver ? `<div style="font-size:0.82rem;color:var(--text-muted);">👤 ${item.assigned_driver.full_name || 'Driver'}</div>` : ''}
            </div>

            <div style="font-size:0.85rem;color:var(--text-secondary);">📅 ${scheduledDate}</div>

            <span class="fleet-item-status ${item.status}">${statusLabels[item.status] || item.status}</span>

            <div class="fleet-item-actions">
              ${item.status === 'pending' || item.status === 'scheduled' ? `
                <button class="btn btn-primary btn-sm" onclick="updateFleetItemStatus('${item.id}', 'in_progress')">▶️ Start</button>
              ` : ''}
              ${item.status === 'in_progress' ? `
                <button class="btn btn-primary btn-sm" onclick="updateFleetItemStatus('${item.id}', 'completed')">✅ Complete</button>
              ` : ''}
              ${item.status !== 'completed' && item.status !== 'skipped' ? `
                <button class="btn btn-ghost btn-sm" onclick="updateFleetItemStatus('${item.id}', 'skipped')">⏭️ Skip</button>
              ` : ''}
            </div>
          </div>
        `;
      });

      html += '</div>';
      document.getElementById('fleet-batch-modal-body').innerHTML = html;
    }

    function toggleBatchItem(itemId) {
      if (selectedBatchItems.has(itemId)) {
        selectedBatchItems.delete(itemId);
      } else {
        selectedBatchItems.add(itemId);
      }
      renderFleetBatchDetail();
    }

    function selectAllBatchItems() {
      if (!currentFleetBatch) return;
      const items = currentFleetBatch.items || [];
      items.forEach(item => {
        if (item.status !== 'completed' && item.status !== 'skipped') {
          selectedBatchItems.add(item.id);
        }
      });
      renderFleetBatchDetail();
    }

    async function markSelectedComplete() {
      if (selectedBatchItems.size === 0) return;

      try {
        for (const itemId of selectedBatchItems) {
          await updateBulkItemStatus(itemId, 'completed');
        }
        
        selectedBatchItems.clear();
        showToast(`Marked ${selectedBatchItems.size || 'items'} as complete!`, 'success');
        
        if (currentFleetBatch) {
          await openFleetBatchDetail(currentFleetBatch.id);
        }
        await loadFleetBatches();
      } catch (err) {
        console.error('Error marking items complete:', err);
        showToast('Failed to update items', 'error');
      }
    }

    async function updateFleetItemStatus(itemId, status) {
      try {
        const { error } = await updateBulkItemStatus(itemId, status);
        if (error) throw new Error(error);

        showToast(`Status updated to ${status}!`, 'success');
        
        if (currentFleetBatch) {
          await openFleetBatchDetail(currentFleetBatch.id);
        }
        await loadFleetBatches();
      } catch (err) {
        console.error('Error updating item status:', err);
        showToast('Failed to update status', 'error');
      }
    }

    function openFleetBulkBidModal(batchId) {
      const batch = fleetJobQueue.find(b => b.id === batchId);
      if (!batch) return;

      currentFleetBidBatch = batch;
      document.getElementById('fleet-bid-batch-id').value = batchId;
      
      const vehicleCount = batch.items?.length || batch.vehicle_count || 0;
      document.getElementById('fleet-bid-vehicle-count').textContent = vehicleCount;
      document.getElementById('fleet-bid-batch-summary').textContent = 
        `${batch.name || 'Bulk Service'} - ${vehicleCount} vehicles`;

      document.getElementById('fleet-bid-price').value = '';
      document.getElementById('fleet-bid-duration').value = '';
      document.getElementById('fleet-bid-notes').value = '';
      
      const today = new Date();
      document.getElementById('fleet-bid-start-date').value = today.toISOString().split('T')[0];
      today.setDate(today.getDate() + 7);
      document.getElementById('fleet-bid-end-date').value = today.toISOString().split('T')[0];

      updateFleetBidTotal();
      openModal('fleet-bulk-bid-modal');
    }

    function updateFleetBidTotal() {
      const pricingType = document.querySelector('input[name="fleet-pricing-type"]:checked')?.value || 'per_vehicle';
      const price = parseFloat(document.getElementById('fleet-bid-price').value) || 0;
      const vehicleCount = currentFleetBidBatch?.items?.length || currentFleetBidBatch?.vehicle_count || 0;

      const label = document.getElementById('fleet-bid-price-label');
      
      if (pricingType === 'per_vehicle') {
        label.textContent = 'Price Per Vehicle ($)';
        const total = price * vehicleCount;
        document.getElementById('fleet-bid-per-vehicle').textContent = `$${price.toFixed(2)}`;
        document.getElementById('fleet-bid-total').textContent = `$${total.toFixed(2)}`;
      } else {
        label.textContent = 'Total Flat Rate ($)';
        const perVehicle = vehicleCount > 0 ? price / vehicleCount : 0;
        document.getElementById('fleet-bid-per-vehicle').textContent = `$${perVehicle.toFixed(2)}`;
        document.getElementById('fleet-bid-total').textContent = `$${price.toFixed(2)}`;
      }
    }

    async function submitFleetBulkBid() {
      const batchId = document.getElementById('fleet-bid-batch-id').value;
      const price = parseFloat(document.getElementById('fleet-bid-price').value);
      const pricingType = document.querySelector('input[name="fleet-pricing-type"]:checked')?.value;
      const duration = document.getElementById('fleet-bid-duration').value;
      const notes = document.getElementById('fleet-bid-notes').value;
      const startDate = document.getElementById('fleet-bid-start-date').value;
      const endDate = document.getElementById('fleet-bid-end-date').value;

      if (!price || price <= 0) {
        showToast('Please enter a valid price', 'error');
        return;
      }

      try {
        const vehicleCount = currentFleetBidBatch?.items?.length || currentFleetBidBatch?.vehicle_count || 1;
        const totalPrice = pricingType === 'per_vehicle' ? price * vehicleCount : price;

        const { error } = await supabaseClient
          .from('bulk_service_bids')
          .insert({
            batch_id: batchId,
            provider_id: currentUser.id,
            pricing_type: pricingType,
            price_per_vehicle: pricingType === 'per_vehicle' ? price : null,
            total_price: totalPrice,
            estimated_duration: duration,
            proposed_start_date: startDate,
            proposed_end_date: endDate,
            notes: notes,
            status: 'pending'
          });

        if (error) throw error;

        closeModal('fleet-bulk-bid-modal');
        showToast('Bulk bid submitted successfully!', 'success');
        await loadFleetJobQueue();
      } catch (err) {
        console.error('Error submitting fleet bid:', err);
        showToast('Failed to submit bid: ' + err.message, 'error');
      }
    }

    async function openFleetRequestDetail(batchId) {
      openModal('fleet-request-modal');
      document.getElementById('fleet-request-modal-body').innerHTML = '<div class="empty-state"><p>Loading request details...</p></div>';

      try {
        const batch = fleetJobQueue.find(b => b.id === batchId);
        if (!batch) throw new Error('Batch not found');

        const fleet = batch.fleet || {};
        const items = batch.items || [];
        const vehicleCount = items.length || batch.vehicle_count || 0;

        document.getElementById('fleet-request-modal-title').textContent = `📋 ${batch.name || 'Fleet Service Request'}`;

        let html = `
          <div style="background:linear-gradient(135deg, var(--accent-gold-soft), rgba(212,168,85,0.05));border:1px solid rgba(212,168,85,0.3);border-radius:var(--radius-md);padding:20px;margin-bottom:20px;">
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
              <span style="font-size:1.2rem;font-weight:600;">${fleet.company_name || fleet.name || 'Fleet Account'}</span>
              ${fleet.verified ? '<span style="background:linear-gradient(135deg, var(--accent-gold), #c49a45);color:#0a0a0f;padding:4px 10px;border-radius:100px;font-size:0.75rem;font-weight:600;">✓ Verified Business</span>' : ''}
            </div>
            <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:0.9rem;">
              <span style="color:var(--accent-green);">✓ Guaranteed Payment</span>
              <span style="color:var(--accent-blue);">💰 Volume Pricing</span>
              <span style="color:var(--text-secondary);">🔄 Recurring Potential</span>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));gap:16px;margin-bottom:20px;">
            <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:16px;text-align:center;">
              <div style="font-size:1.4rem;font-weight:600;color:var(--accent-gold);">${vehicleCount}</div>
              <div style="font-size:0.82rem;color:var(--text-muted);">Vehicles</div>
            </div>
            <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:16px;text-align:center;">
              <div style="font-size:1.4rem;font-weight:600;color:var(--accent-gold);">$${(batch.estimated_total_value || vehicleCount * 75).toLocaleString()}</div>
              <div style="font-size:0.82rem;color:var(--text-muted);">Est. Value</div>
            </div>
            ${batch.date_range_start ? `
            <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:16px;text-align:center;">
              <div style="font-size:0.95rem;font-weight:500;color:var(--text-primary);">${new Date(batch.date_range_start).toLocaleDateString()}</div>
              <div style="font-size:0.82rem;color:var(--text-muted);">Start Date</div>
            </div>
            ` : ''}
          </div>

          <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:16px;margin-bottom:20px;">
            <div style="font-weight:600;margin-bottom:12px;">🔧 Service Details</div>
            <div style="color:var(--text-secondary);">
              ${batch.service_type ? `<div style="margin-bottom:8px;"><strong>Service Type:</strong> ${batch.service_type}</div>` : ''}
              ${batch.description ? `<div>${batch.description}</div>` : '<div>Standard fleet service request</div>'}
            </div>
          </div>

          ${items.length > 0 ? `
          <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:16px;">
            <div style="font-weight:600;margin-bottom:12px;">🚗 Vehicles in Batch</div>
            <div style="max-height:200px;overflow-y:auto;">
              ${items.slice(0, 10).map((item, i) => {
                const v = item.vehicle || {};
                return `<div style="padding:8px 0;border-bottom:1px solid var(--border-subtle);font-size:0.9rem;">${v.year ? `${v.year} ${v.make} ${v.model}` : `Vehicle ${i+1}`}</div>`;
              }).join('')}
              ${items.length > 10 ? `<div style="padding:8px 0;color:var(--text-muted);font-size:0.85rem;">...and ${items.length - 10} more vehicles</div>` : ''}
            </div>
          </div>
          ` : ''}
        `;

        document.getElementById('fleet-request-modal-body').innerHTML = html;
        document.getElementById('fleet-request-modal-footer').innerHTML = `
          <button class="btn btn-secondary" onclick="closeModal('fleet-request-modal')">Close</button>
          <button class="btn btn-primary" onclick="closeModal('fleet-request-modal');openFleetBulkBidModal('${batchId}')">💼 Submit Bid</button>
        `;
      } catch (err) {
        console.error('Error loading request details:', err);
        document.getElementById('fleet-request-modal-body').innerHTML = '<div class="empty-state"><p>Failed to load request details.</p></div>';
      }
    }

    function timeAgo(date) {
      const seconds = Math.floor((new Date() - date) / 1000);
      if (seconds < 60) return 'just now';
      if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
      if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
      return Math.floor(seconds / 86400) + 'd ago';
    }

    // Initialize time dropdown selects with AM/PM format
    function initTimeDropdowns() {
      const timeOptions = [];
      for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 30) {
          const hour24 = String(h).padStart(2, '0');
          const min = String(m).padStart(2, '0');
          const value = `${hour24}:${min}`;
          const hour12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);
          const ampm = h < 12 ? 'AM' : 'PM';
          const label = `${hour12}:${min} ${ampm}`;
          timeOptions.push({ value, label });
        }
      }
      
      const defaults = {
        'hours-mon-start': '08:00', 'hours-mon-end': '17:00',
        'hours-tue-start': '08:00', 'hours-tue-end': '17:00',
        'hours-wed-start': '08:00', 'hours-wed-end': '17:00',
        'hours-thu-start': '08:00', 'hours-thu-end': '17:00',
        'hours-fri-start': '08:00', 'hours-fri-end': '17:00',
        'hours-sat-start': '09:00', 'hours-sat-end': '14:00',
        'hours-sun-start': '10:00', 'hours-sun-end': '14:00'
      };
      
      document.querySelectorAll('.time-select').forEach(select => {
        select.innerHTML = timeOptions.map(opt => 
          `<option value="${opt.value}">${opt.label}</option>`
        ).join('');
        const defaultVal = defaults[select.id];
        if (defaultVal) select.value = defaultVal;
      });
    }

    // Call on page load
    initTimeDropdowns();

    // ========== EARNINGS ANALYTICS ==========
    let earningsChart = null;
    let earningsData = { revenue: [], tips: [], upsells: [], reimbursements: [] };

    function initEarningsAnalytics() {
      const yearFilter = document.getElementById('earnings-year-filter');
      const currentYear = new Date().getFullYear();
      yearFilter.innerHTML = '';
      for (let y = currentYear; y >= currentYear - 5; y--) {
        yearFilter.innerHTML += `<option value="${y}">${y}</option>`;
      }
      yearFilter.value = currentYear;
      yearFilter.addEventListener('change', () => loadEarningsAnalyticsData());
      
      loadEarningsAnalyticsData();
    }

    async function loadEarningsAnalyticsData() {
      const year = document.getElementById('earnings-year-filter').value || new Date().getFullYear();
      
      document.getElementById('earnings-year-label').textContent = year;
      
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      
      const { data, error } = await supabaseClient
        .from('payments')
        .select('*')
        .eq('provider_id', currentUser.id)
        .eq('status', 'completed')
        .gte('created_at', startDate)
        .lte('created_at', endDate);
      
      if (error) {
        console.error('Error loading earnings data:', error);
        return;
      }
      
      const monthlyData = Array(12).fill(null).map(() => ({ revenue: 0, tips: 0, upsells: 0, reimbursements: 0 }));
      let totalRevenue = 0, totalTips = 0, totalUpsells = 0, totalReimbursements = 0;
      
      (data || []).forEach(payment => {
        const month = new Date(payment.created_at).getMonth();
        const total = parseFloat(payment.amount) || 0;
        const providerAmount = total * 0.925;
        const tip = parseFloat(payment.tip_amount) || 0;
        const upsell = parseFloat(payment.upsell_amount) || 0;
        const reimbursement = parseFloat(payment.reimbursement_amount) || 0;
        
        monthlyData[month].revenue += providerAmount;
        monthlyData[month].tips += tip;
        monthlyData[month].upsells += upsell;
        monthlyData[month].reimbursements += reimbursement;
        
        totalRevenue += providerAmount;
        totalTips += tip;
        totalUpsells += upsell;
        totalReimbursements += reimbursement;
      });
      
      earningsData = {
        revenue: monthlyData.map(m => m.revenue),
        tips: monthlyData.map(m => m.tips),
        upsells: monthlyData.map(m => m.upsells),
        reimbursements: monthlyData.map(m => m.reimbursements)
      };
      
      const grandTotal = totalRevenue + totalTips + totalUpsells + totalReimbursements;
      document.getElementById('earnings-total-label').textContent = '$' + grandTotal.toFixed(2);
      document.getElementById('legend-revenue').textContent = '$' + totalRevenue.toFixed(2);
      document.getElementById('legend-tips').textContent = '$' + totalTips.toFixed(2);
      document.getElementById('legend-upsells').textContent = '$' + totalUpsells.toFixed(2);
      document.getElementById('legend-reimbursements').textContent = '$' + totalReimbursements.toFixed(2);
      
      renderEarningsChart();
    }

    function renderEarningsChart() {
      const ctx = document.getElementById('earnings-chart');
      if (!ctx) return;
      
      if (earningsChart) earningsChart.destroy();
      
      earningsChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
          datasets: [
            { label: 'Service Revenue', data: earningsData.revenue, backgroundColor: '#4a7cff', borderRadius: 4 },
            { label: 'Tips', data: earningsData.tips, backgroundColor: '#9b59b6', borderRadius: 4 },
            { label: 'Upsells', data: earningsData.upsells, backgroundColor: '#4ac88c', borderRadius: 4 },
            { label: 'Reimbursements', data: earningsData.reimbursements, backgroundColor: '#f59e0b', borderRadius: 4 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { stacked: true, grid: { color: 'rgba(148,148,168,0.12)' }, ticks: { color: '#9898a8' } },
            y: { stacked: true, grid: { color: 'rgba(148,148,168,0.12)' }, ticks: { color: '#9898a8', callback: v => '$' + v } }
          }
        }
      });
    }

    function downloadEarningsCSV() {
      const year = document.getElementById('earnings-year-filter').value;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      let csv = 'Month,Service Revenue,Tips,Upsells,Reimbursements,Total\n';
      
      for (let i = 0; i < 12; i++) {
        const revenue = earningsData.revenue[i] || 0;
        const tips = earningsData.tips[i] || 0;
        const upsells = earningsData.upsells[i] || 0;
        const reimbursements = earningsData.reimbursements[i] || 0;
        const total = revenue + tips + upsells + reimbursements;
        csv += `${months[i]},${revenue.toFixed(2)},${tips.toFixed(2)},${upsells.toFixed(2)},${reimbursements.toFixed(2)},${total.toFixed(2)}\n`;
      }
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `earnings-${year}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    // ========== ADVANCED ANALYTICS SECTION ==========
    let advancedRevenueChart = null;
    let servicesPieChart = null;
    let busyHoursChart = null;
    let retentionChart = null;
    let ratingsTrendChart = null;

    function initAdvancedAnalytics() {
      document.getElementById('revenue-period-filter').addEventListener('change', loadAdvancedRevenueChart);
      document.getElementById('revenue-range-filter').addEventListener('change', loadAdvancedRevenueChart);
      
      loadAdvancedRevenueChart();
      loadServicesChart();
      loadBusyHoursChart();
      loadRetentionChart();
      loadRatingsChart();
    }

    async function loadAdvancedRevenueChart() {
      const loadingEl = document.getElementById('revenue-chart-loading');
      const errorEl = document.getElementById('revenue-chart-error');
      const chartEl = document.getElementById('advanced-revenue-chart');
      
      loadingEl.style.display = 'block';
      errorEl.style.display = 'none';
      chartEl.style.display = 'none';
      
      try {
        const period = document.getElementById('revenue-period-filter').value;
        const range = document.getElementById('revenue-range-filter').value;
        
        const response = await fetch(`/api/providers/${currentUser.id}/analytics/revenue?period=${period}&range=${range}`);
        if (!response.ok) throw new Error('Failed to fetch revenue data');
        
        const data = await response.json();
        
        loadingEl.style.display = 'none';
        chartEl.style.display = 'block';
        
        const ctx = chartEl.getContext('2d');
        if (advancedRevenueChart) advancedRevenueChart.destroy();
        
        advancedRevenueChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: data.labels.map(l => {
              if (period === 'monthly') {
                const [y, m] = l.split('-');
                return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
              }
              return new Date(l).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }),
            datasets: [
              {
                label: 'POS Revenue',
                data: data.datasets.pos.map(v => v / 100),
                borderColor: '#4a7cff',
                backgroundColor: 'rgba(74, 124, 255, 0.1)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'Marketplace Revenue',
                data: data.datasets.marketplace.map(v => v / 100),
                borderColor: '#d4a855',
                backgroundColor: 'rgba(212, 168, 85, 0.1)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'Tips',
                data: data.datasets.tips.map(v => v / 100),
                borderColor: '#4ac88c',
                backgroundColor: 'rgba(74, 200, 140, 0.1)',
                tension: 0.3,
                fill: true
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: ctx => `${ctx.dataset.label}: $${ctx.parsed.y.toFixed(2)}`
                }
              }
            },
            scales: {
              x: {
                grid: { color: 'rgba(148,148,168,0.12)' },
                ticks: { color: '#9898a8', maxRotation: 45, minRotation: 0 }
              },
              y: {
                grid: { color: 'rgba(148,148,168,0.12)' },
                ticks: { color: '#9898a8', callback: v => '$' + v }
              }
            }
          }
        });
        
      } catch (error) {
        console.error('Error loading revenue chart:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
      }
    }

    async function loadServicesChart() {
      const loadingEl = document.getElementById('services-chart-loading');
      const listEl = document.getElementById('services-list');
      
      loadingEl.style.display = 'block';
      
      try {
        const response = await fetch(`/api/providers/${currentUser.id}/analytics/services`);
        if (!response.ok) throw new Error('Failed to fetch services data');
        
        const data = await response.json();
        loadingEl.style.display = 'none';
        
        const ctx = document.getElementById('services-pie-chart').getContext('2d');
        if (servicesPieChart) servicesPieChart.destroy();
        
        const colors = ['#d4a855', '#4a7cff', '#4ac88c', '#9b59b6', '#e74c3c', '#3498db', '#f39c12', '#1abc9c'];
        const categories = data.categories.slice(0, 8);
        
        servicesPieChart = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: categories.map(c => c.name),
            datasets: [{
              data: categories.map(c => c.count),
              backgroundColor: colors.slice(0, categories.length),
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: ctx => `${ctx.label}: ${ctx.parsed} jobs ($${(categories[ctx.dataIndex].revenue / 100).toFixed(2)})`
                }
              }
            },
            cutout: '60%'
          }
        });
        
        listEl.innerHTML = categories.slice(0, 5).map((c, i) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-subtle);">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="width:10px;height:10px;border-radius:50%;background:${colors[i]};"></span>
              <span style="font-size:0.9rem;color:var(--text-primary);">${c.name}</span>
            </div>
            <span style="font-size:0.85rem;color:var(--text-secondary);">${c.count} jobs</span>
          </div>
        `).join('') || '<p style="text-align:center;color:var(--text-muted);font-size:0.9rem;">No service data yet</p>';
        
      } catch (error) {
        console.error('Error loading services chart:', error);
        loadingEl.style.display = 'none';
        listEl.innerHTML = '<p style="text-align:center;color:var(--accent-red);font-size:0.9rem;">Failed to load data</p>';
      }
    }

    async function loadBusyHoursChart() {
      const loadingEl = document.getElementById('busy-hours-loading');
      const summaryEl = document.getElementById('peak-times-summary');
      
      loadingEl.style.display = 'block';
      
      try {
        const response = await fetch(`/api/providers/${currentUser.id}/analytics/busy-hours`);
        if (!response.ok) throw new Error('Failed to fetch busy hours data');
        
        const data = await response.json();
        loadingEl.style.display = 'none';
        
        const ctx = document.getElementById('busy-hours-chart').getContext('2d');
        if (busyHoursChart) busyHoursChart.destroy();
        
        const peakHours = data.hourly.filter(h => h.count > 0).sort((a, b) => b.count - a.count).slice(0, 12);
        
        busyHoursChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: peakHours.map(h => h.label),
            datasets: [{
              label: 'Jobs',
              data: peakHours.map(h => h.count),
              backgroundColor: '#d4a855',
              borderRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: ctx => `${ctx.parsed.y} jobs`
                }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: '#9898a8', font: { size: 10 } }
              },
              y: {
                grid: { color: 'rgba(148,148,168,0.12)' },
                ticks: { color: '#9898a8', stepSize: 1 }
              }
            }
          }
        });
        
        const peakDayName = data.daily[data.peakDay]?.name || 'N/A';
        const peakHourLabel = data.hourly[data.peakHour]?.label || 'N/A';
        summaryEl.innerHTML = `
          <strong style="color:var(--accent-gold);">Peak Day:</strong> ${peakDayName} | 
          <strong style="color:var(--accent-gold);">Peak Hour:</strong> ${peakHourLabel}
        `;
        
      } catch (error) {
        console.error('Error loading busy hours chart:', error);
        loadingEl.style.display = 'none';
        summaryEl.innerHTML = '<span style="color:var(--accent-red);">Failed to load data</span>';
      }
    }

    async function loadRetentionChart() {
      const loadingEl = document.getElementById('retention-loading');
      const statsEl = document.getElementById('retention-stats');
      
      loadingEl.style.display = 'block';
      
      try {
        const response = await fetch(`/api/provider/${currentUser.id}/analytics`);
        if (!response.ok) throw new Error('Failed to fetch retention data');
        
        const data = await response.json();
        loadingEl.style.display = 'none';
        
        const ctx = document.getElementById('retention-chart').getContext('2d');
        if (retentionChart) retentionChart.destroy();
        
        const uniqueCustomers = data.customers?.unique || 0;
        const repeatCustomers = data.customers?.repeat || 0;
        const oneTime = uniqueCustomers - repeatCustomers;
        
        retentionChart = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: ['Repeat Customers', 'First-Time Customers'],
            datasets: [{
              data: [repeatCustomers, oneTime],
              backgroundColor: ['#d4a855', '#4a7cff'],
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false }
            },
            cutout: '70%'
          }
        });
        
        const retentionRate = uniqueCustomers > 0 ? ((repeatCustomers / uniqueCustomers) * 100).toFixed(1) : 0;
        const avgValue = ((data.customers?.avgTransactionValue || 0) / 100).toFixed(2);
        
        statsEl.innerHTML = `
          <div style="background:var(--bg-elevated);padding:12px;border-radius:var(--radius-md);text-align:center;">
            <div style="font-size:1.5rem;color:var(--accent-gold);font-weight:600;">${retentionRate}%</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);">Repeat Rate</div>
          </div>
          <div style="background:var(--bg-elevated);padding:12px;border-radius:var(--radius-md);text-align:center;">
            <div style="font-size:1.5rem;color:var(--accent-blue);font-weight:600;">${uniqueCustomers}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);">Total Customers</div>
          </div>
          <div style="background:var(--bg-elevated);padding:12px;border-radius:var(--radius-md);text-align:center;">
            <div style="font-size:1.5rem;color:var(--accent-green);font-weight:600;">${repeatCustomers}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);">Repeat Customers</div>
          </div>
          <div style="background:var(--bg-elevated);padding:12px;border-radius:var(--radius-md);text-align:center;">
            <div style="font-size:1.5rem;color:var(--text-primary);font-weight:600;">$${avgValue}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);">Avg. Transaction</div>
          </div>
        `;
        
      } catch (error) {
        console.error('Error loading retention chart:', error);
        loadingEl.style.display = 'none';
        statsEl.innerHTML = '<p style="text-align:center;color:var(--accent-red);font-size:0.9rem;grid-column:span 2;">Failed to load data</p>';
      }
    }

    async function loadRatingsChart() {
      const loadingEl = document.getElementById('ratings-loading');
      const summaryEl = document.getElementById('ratings-summary');
      
      loadingEl.style.display = 'block';
      
      try {
        const response = await fetch(`/api/providers/${currentUser.id}/analytics/ratings`);
        if (!response.ok) throw new Error('Failed to fetch ratings data');
        
        const data = await response.json();
        loadingEl.style.display = 'none';
        
        const ctx = document.getElementById('ratings-trend-chart').getContext('2d');
        if (ratingsTrendChart) ratingsTrendChart.destroy();
        
        const trendData = data.recentTrend || [];
        
        if (trendData.length > 0) {
          ratingsTrendChart = new Chart(ctx, {
            type: 'line',
            data: {
              labels: trendData.map(t => {
                const [y, m] = t.month.split('-');
                return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short' });
              }),
              datasets: [{
                label: 'Average Rating',
                data: trendData.map(t => parseFloat(t.average)),
                borderColor: '#d4a855',
                backgroundColor: 'rgba(212, 168, 85, 0.2)',
                tension: 0.3,
                fill: true,
                pointBackgroundColor: '#d4a855',
                pointRadius: 4
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false }
              },
              scales: {
                x: {
                  grid: { color: 'rgba(148,148,168,0.12)' },
                  ticks: { color: '#9898a8' }
                },
                y: {
                  min: 1,
                  max: 5,
                  grid: { color: 'rgba(148,148,168,0.12)' },
                  ticks: { color: '#9898a8', stepSize: 1 }
                }
              }
            }
          });
        }
        
        const distribution = data.overall?.distribution || {};
        const totalReviews = data.overall?.totalReviews || 0;
        const avgRating = data.overall?.average || 0;
        
        const stars = [5, 4, 3, 2, 1].map(star => {
          const count = distribution[star] || 0;
          const pct = totalReviews > 0 ? (count / totalReviews * 100).toFixed(0) : 0;
          return `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span style="width:20px;font-size:0.8rem;color:var(--text-secondary);">${star}★</span>
              <div style="flex:1;height:8px;background:var(--bg-elevated);border-radius:4px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:${star >= 4 ? '#d4a855' : star >= 3 ? '#f39c12' : '#e74c3c'};"></div>
              </div>
              <span style="width:30px;font-size:0.75rem;color:var(--text-muted);text-align:right;">${count}</span>
            </div>
          `;
        }).join('');
        
        summaryEl.innerHTML = `
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">
            <div style="font-size:2rem;color:var(--accent-gold);font-weight:700;">${avgRating.toFixed(1)}</div>
            <div>
              <div style="color:var(--accent-gold);">${'★'.repeat(Math.round(avgRating))}${'☆'.repeat(5 - Math.round(avgRating))}</div>
              <div style="font-size:0.8rem;color:var(--text-secondary);">${totalReviews} reviews</div>
            </div>
          </div>
          ${stars}
        `;
        
      } catch (error) {
        console.error('Error loading ratings chart:', error);
        loadingEl.style.display = 'none';
        summaryEl.innerHTML = '<p style="text-align:center;color:var(--accent-red);font-size:0.9rem;">Failed to load ratings data</p>';
      }
    }

    // ========== POS ANALYTICS SECTION ==========
    
    async function loadPosAnalytics() {
      const loadingEl = document.getElementById('analytics-loading');
      const contentEl = document.getElementById('analytics-content');
      const emptyEl = document.getElementById('analytics-empty');
      
      loadingEl.style.display = 'block';
      contentEl.style.display = 'none';
      emptyEl.style.display = 'none';
      
      try {
        const response = await fetch(`/api/provider/${currentUser.id}/analytics`);
        if (!response.ok) throw new Error('Failed to fetch analytics');
        
        const data = await response.json();
        
        if (data.customers.totalTransactions === 0) {
          loadingEl.style.display = 'none';
          emptyEl.style.display = 'block';
          return;
        }
        
        renderPosAnalytics(data);
        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';
      } catch (error) {
        console.error('Error loading POS analytics:', error);
        loadingEl.innerHTML = '<p style="color:var(--accent-red);">Error loading analytics. Please try again.</p>';
      }
    }
    
    function formatCents(cents) {
      return '$' + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    
    function renderPosAnalytics(data) {
      document.getElementById('analytics-today').textContent = formatCents(data.revenue.today);
      document.getElementById('analytics-week').textContent = formatCents(data.revenue.week);
      document.getElementById('analytics-month').textContent = formatCents(data.revenue.month);
      document.getElementById('analytics-year').textContent = formatCents(data.revenue.year);
      document.getElementById('analytics-total-label').textContent = 'Total: ' + formatCents(data.revenue.total);
      
      const chartContainer = document.getElementById('analytics-chart');
      const labelsContainer = document.getElementById('analytics-chart-labels');
      const maxRevenue = Math.max(...data.chart.map(d => d.revenue), 1);
      
      chartContainer.innerHTML = data.chart.map((d, i) => {
        const heightPct = (d.revenue / maxRevenue * 100) || 0;
        const barColor = d.revenue > 0 ? 'var(--accent-gold)' : 'var(--border-subtle)';
        return `<div style="flex:1;min-width:8px;max-width:20px;background:${barColor};height:${Math.max(heightPct, 2)}%;border-radius:2px 2px 0 0;transition:height 0.3s;" title="${d.label}: ${formatCents(d.revenue)}"></div>`;
      }).join('');
      
      labelsContainer.innerHTML = `
        <span>${data.chart[0]?.label || ''}</span>
        <span>${data.chart[14]?.label || ''}</span>
        <span>${data.chart[29]?.label || ''}</span>
      `;
      
      const countContainer = document.getElementById('analytics-services-count');
      if (data.services.byCount.length === 0) {
        countContainer.innerHTML = '<div style="color:var(--text-muted);font-size:0.9rem;">No service data yet</div>';
      } else {
        const maxCount = Math.max(...data.services.byCount.map(s => s.count), 1);
        countContainer.innerHTML = data.services.byCount.map(s => `
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:0.9rem;font-weight:500;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.category}</div>
              <div style="height:8px;background:var(--bg-input);border-radius:4px;overflow:hidden;">
                <div style="height:100%;width:${(s.count / maxCount * 100)}%;background:var(--accent-blue);border-radius:4px;"></div>
              </div>
            </div>
            <div style="text-align:right;min-width:60px;">
              <div style="font-weight:600;color:var(--accent-blue);">${s.count}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${formatCents(s.revenue)}</div>
            </div>
          </div>
        `).join('');
      }
      
      const revenueContainer = document.getElementById('analytics-services-revenue');
      if (data.services.byRevenue.length === 0) {
        revenueContainer.innerHTML = '<div style="color:var(--text-muted);font-size:0.9rem;">No service data yet</div>';
      } else {
        const maxRev = Math.max(...data.services.byRevenue.map(s => s.revenue), 1);
        revenueContainer.innerHTML = data.services.byRevenue.map(s => `
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:0.9rem;font-weight:500;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.category}</div>
              <div style="height:8px;background:var(--bg-input);border-radius:4px;overflow:hidden;">
                <div style="height:100%;width:${(s.revenue / maxRev * 100)}%;background:var(--accent-gold);border-radius:4px;"></div>
              </div>
            </div>
            <div style="text-align:right;min-width:60px;">
              <div style="font-weight:600;color:var(--accent-gold);">${formatCents(s.revenue)}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${s.count} jobs</div>
            </div>
          </div>
        `).join('');
      }
      
      const daysContainer = document.getElementById('analytics-busy-days');
      const maxDayCount = Math.max(...data.busyTimes.days.map(d => d.count), 1);
      daysContainer.innerHTML = data.busyTimes.days.map((d, i) => {
        const intensity = d.count / maxDayCount;
        const bgColor = intensity > 0.7 ? 'var(--accent-gold)' : intensity > 0.3 ? 'var(--accent-blue)' : 'var(--bg-elevated)';
        const textColor = intensity > 0.5 ? '#000' : 'var(--text-primary)';
        return `<div style="padding:10px 14px;background:${bgColor};color:${textColor};border-radius:var(--radius-md);text-align:center;min-width:60px;">
          <div style="font-weight:600;">${d.day}</div>
          <div style="font-size:0.8rem;opacity:0.8;">${d.count}</div>
        </div>`;
      }).join('');
      
      const hoursContainer = document.getElementById('analytics-busy-hours');
      if (data.busyTimes.hours.length === 0) {
        hoursContainer.innerHTML = '<div style="color:var(--text-muted);font-size:0.9rem;">No hour data yet</div>';
      } else {
        const maxHourCount = Math.max(...data.busyTimes.hours.map(h => h.count), 1);
        hoursContainer.innerHTML = data.busyTimes.hours.map(h => {
          const intensity = h.count / maxHourCount;
          const bgColor = intensity > 0.7 ? 'var(--accent-green)' : intensity > 0.3 ? 'var(--accent-blue)' : 'var(--bg-elevated)';
          const textColor = intensity > 0.5 ? '#000' : 'var(--text-primary)';
          return `<div style="padding:8px 12px;background:${bgColor};color:${textColor};border-radius:var(--radius-md);text-align:center;">
            <div style="font-size:0.85rem;font-weight:500;">${h.label}</div>
            <div style="font-size:0.75rem;opacity:0.8;">${h.count}</div>
          </div>`;
        }).join('');
      }
      
      document.getElementById('analytics-unique-customers').textContent = data.customers.unique;
      document.getElementById('analytics-repeat-customers').textContent = data.customers.repeat;
      document.getElementById('analytics-total-transactions').textContent = data.customers.totalTransactions;
      document.getElementById('analytics-avg-transaction').textContent = formatCents(data.customers.avgTransactionValue);
    }

    // ========== PROVIDER REFERRAL SECTION ==========
    let providerFounderProfile = null;

    async function loadReferralSection() {
      const loadingEl = document.getElementById('referral-loading');
      const contentEl = document.getElementById('referral-content');
      
      loadingEl.style.display = 'block';
      contentEl.style.display = 'none';

      try {
        providerFounderProfile = await getOrCreateFounderProfile();
        
        if (providerFounderProfile) {
          document.getElementById('provider-referral-code').textContent = providerFounderProfile.referral_code || '----';
          document.getElementById('provider-ref-count').textContent = providerFounderProfile.total_provider_referrals || 0;
          document.getElementById('provider-total-earnings').textContent = formatReferralCurrency(providerFounderProfile.total_commissions_earned || 0);
          document.getElementById('provider-pending-balance').textContent = formatReferralCurrency(providerFounderProfile.pending_balance || 0);
          
          generateProviderQRCode();
          loadReferralCodes();
          
          loadingEl.style.display = 'none';
          contentEl.style.display = 'block';
        }
      } catch (error) {
        console.error('Error loading referral section:', error);
        loadingEl.innerHTML = '<p style="color:var(--accent-red);">Error loading referral program. Please try again.</p>';
      }
    }

    function formatReferralCurrency(amount) {
      return '$' + parseFloat(amount || 0).toFixed(2);
    }

    async function getOrCreateFounderProfile() {
      if (!currentUser) return null;

      const { data: existingProfile, error: fetchError } = await supabaseClient
        .from('member_founder_profiles')
        .select('*')
        .eq('user_id', currentUser.id)
        .single();

      if (existingProfile) {
        return existingProfile;
      }

      const providerProfile = await loadCurrentProviderProfile();
      const fullName = currentUser.user_metadata?.full_name || providerProfile?.business_name || 'Provider';
      const referralCode = generateReferralCode();

      const { data: newProfile, error: insertError } = await supabaseClient
        .from('member_founder_profiles')
        .insert({
          user_id: currentUser.id,
          email: currentUser.email,
          full_name: fullName,
          referral_code: referralCode,
          status: 'active',
          payout_method: 'paypal',
          founder_type: 'provider',
          total_provider_referrals: 0,
          total_member_referrals: 0,
          total_commissions_earned: 0,
          pending_balance: 0
        })
        .select()
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          const retryCode = generateReferralCode();
          const { data: retryProfile, error: retryError } = await supabaseClient
            .from('member_founder_profiles')
            .insert({
              user_id: currentUser.id,
              email: currentUser.email,
              full_name: fullName,
              referral_code: retryCode,
              status: 'active',
              payout_method: 'paypal',
              founder_type: 'provider',
              total_provider_referrals: 0,
              total_member_referrals: 0,
              total_commissions_earned: 0,
              pending_balance: 0
            })
            .select()
            .single();

          if (retryError) {
            console.error('Error creating founder profile (retry):', retryError);
            return null;
          }
          return retryProfile;
        }
        console.error('Error creating founder profile:', insertError);
        return null;
      }

      return newProfile;
    }

    async function loadCurrentProviderProfile() {
      if (!currentUser) return null;
      const { data } = await supabaseClient
        .from('provider_profiles')
        .select('business_name')
        .eq('user_id', currentUser.id)
        .single();
      return data;
    }

    function generateReferralCode() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = 'MCC-';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    }

    function generateProviderQRCode() {
      if (!providerFounderProfile?.referral_code) return;

      const canvas = document.getElementById('provider-qr-code');
      if (!canvas) return;

      const siteUrl = (window.MCC_CONFIG && window.MCC_CONFIG.siteUrl) || 'https://mycarconcierge.com';
      const referralUrl = `${siteUrl}/provider-pilot.html?ref=${providerFounderProfile.referral_code}`;

      try {
        if (typeof QrCreator !== 'undefined') {
          QrCreator.render({
            text: referralUrl,
            radius: 0.4,
            ecLevel: 'H',
            fill: '#0a0a0f',
            background: '#ffffff',
            size: 180
          }, canvas);
        } else {
          canvas.style.display = 'none';
          const qrContainer = canvas.parentElement;
          if (qrContainer) {
            qrContainer.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">QR code unavailable. Share your code: <strong>' + providerFounderProfile.referral_code + '</strong></p>';
          }
        }
      } catch (error) {
        console.error('Error generating QR code:', error);
        canvas.style.display = 'none';
        const qrContainer = canvas.parentElement;
        if (qrContainer) {
          qrContainer.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">QR code unavailable. Share your code: <strong>' + providerFounderProfile.referral_code + '</strong></p>';
        }
      }
    }

    function copyProviderReferralCode() {
      if (!providerFounderProfile?.referral_code) return;

      navigator.clipboard.writeText(providerFounderProfile.referral_code).then(() => {
        showReferralToast('Referral code copied!');
      }).catch(() => {
        const textArea = document.createElement('textarea');
        textArea.value = providerFounderProfile.referral_code;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showReferralToast('Referral code copied!');
      });
    }

    function shareProviderReferral(method) {
      if (!providerFounderProfile?.referral_code) return;

      const siteUrl = (window.MCC_CONFIG && window.MCC_CONFIG.siteUrl) || 'https://mycarconcierge.com';
      const referralUrl = `${siteUrl}/provider-pilot.html?ref=${providerFounderProfile.referral_code}`;
      const message = `Join My Car Concierge as a founding provider! Use my referral code ${providerFounderProfile.referral_code} to get started: ${referralUrl}`;

      if (method === 'sms') {
        window.open(`sms:?body=${encodeURIComponent(message)}`);
      } else if (method === 'email') {
        window.open(`mailto:?subject=${encodeURIComponent('Join My Car Concierge as a Provider')}&body=${encodeURIComponent(message)}`);
      }
    }

    function downloadProviderQRCode() {
      const canvas = document.getElementById('provider-qr-code');
      if (!canvas) return;

      const link = document.createElement('a');
      link.download = `mcc-provider-referral-${providerFounderProfile?.referral_code || 'qr'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }

    function showReferralToast(message) {
      let toast = document.getElementById('referral-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'referral-toast';
        toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:var(--bg-elevated);border:1px solid var(--accent-green);border-radius:var(--radius-md);padding:16px 20px;display:flex;align-items:center;gap:12px;z-index:200;animation:toastIn 0.3s ease;';
        document.body.appendChild(toast);
      }
      toast.innerHTML = `<span style="color:var(--accent-green);">✓</span> ${message}`;
      toast.style.display = 'flex';
      setTimeout(() => {
        toast.style.display = 'none';
      }, 3000);
    }

    // ========== LOYALTY NETWORK SECTION ==========
    let loyaltyNetworkData = {
      referrals: [],
      stats: { loyal_customers: 0, new_members: 0, providers: 0, total: 0 }
    };

    async function loadLoyaltyNetwork() {
      const loadingEl = document.getElementById('loyalty-loading');
      const contentEl = document.getElementById('loyalty-content');
      
      if (loadingEl) loadingEl.style.display = 'block';
      if (contentEl) contentEl.style.display = 'none';
      
      try {
        if (!currentUser) {
          console.log('No user for loyalty network');
          return;
        }

        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          console.log('No session for loyalty network');
          return;
        }

        const response = await fetch(`/api/provider/${currentUser.id}/referrals`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        
        if (!response.ok) {
          throw new Error('Failed to load loyalty network data');
        }
        
        const data = await response.json();
        loyaltyNetworkData = {
          referrals: data.referrals || [],
          stats: data.stats || { loyal_customers: 0, new_members: 0, providers: 0, total: 0 }
        };
        
        renderLoyaltyStats();
        renderLoyaltyReferralsList();
        updateLoyaltyQRUsage();
        updateLoyaltyBadge();
        
        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';
        
      } catch (error) {
        console.error('Error loading loyalty network:', error);
        if (loadingEl) {
          loadingEl.innerHTML = '<p style="color:var(--text-muted);">Unable to load loyalty network. <button onclick="loadLoyaltyNetwork()" class="btn btn-secondary btn-sm" style="margin-left:8px;">Retry</button></p>';
        }
      }
    }

    function renderLoyaltyStats() {
      const stats = loyaltyNetworkData.stats;
      
      const loyalCustomersEl = document.getElementById('loyalty-loyal-customers');
      const newMembersEl = document.getElementById('loyalty-new-members');
      const providersEl = document.getElementById('loyalty-providers');
      const totalEl = document.getElementById('loyalty-total');
      
      if (loyalCustomersEl) loyalCustomersEl.textContent = stats.loyal_customers || 0;
      if (newMembersEl) newMembersEl.textContent = stats.new_members || 0;
      if (providersEl) providersEl.textContent = stats.providers || 0;
      if (totalEl) totalEl.textContent = stats.total || 0;
    }

    function renderLoyaltyReferralsList() {
      const listEl = document.getElementById('loyalty-referrals-list');
      if (!listEl) return;
      
      const referrals = loyaltyNetworkData.referrals;
      
      if (!referrals || referrals.length === 0) {
        listEl.innerHTML = `
          <div class="empty-state" style="padding:32px;text-align:center;">
            <div style="font-size:2rem;margin-bottom:12px;">👥</div>
            <p style="color:var(--text-muted);">No referrals yet. Share your QR codes to grow your network!</p>
            <button onclick="showSection('refer-providers')" class="btn btn-primary" style="margin-top:16px;">🔗 Get Your QR Codes</button>
          </div>
        `;
        return;
      }
      
      const html = referrals.slice(0, 20).map(referral => {
        const referralType = referral.referral_type || 'new_member';
        const typeClass = referralType.replace('_', '-');
        const userName = referral.referred_user?.full_name || referral.referred_user?.email?.split('@')[0] || 'Unknown';
        const userInitial = userName[0]?.toUpperCase() || '?';
        const signupDate = referral.referred_user?.created_at || referral.created_at;
        const formattedDate = signupDate ? new Date(signupDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown';
        
        let badgeText = 'New Member';
        let badgeIcon = '🌟';
        if (referralType === 'loyal_customer') {
          badgeText = 'Loyal Customer';
          badgeIcon = '👑';
        } else if (referralType === 'provider') {
          badgeText = 'Provider';
          badgeIcon = '🔧';
        }
        
        return `
          <div class="loyalty-referral-item">
            <div class="loyalty-referral-avatar ${typeClass}">${userInitial}</div>
            <div class="loyalty-referral-info">
              <div class="loyalty-referral-name">${escapeHtml(userName)}</div>
              <div class="loyalty-referral-date">Joined ${formattedDate}</div>
            </div>
            <span class="referral-type-badge ${typeClass}">${badgeIcon} ${badgeText}</span>
          </div>
        `;
      }).join('');
      
      listEl.innerHTML = html;
    }

    function updateLoyaltyQRUsage() {
      const referrals = loyaltyNetworkData.referrals;
      
      const loyalUses = referrals.filter(r => r.referral_type === 'loyal_customer').length;
      const memberUses = referrals.filter(r => r.referral_type === 'new_member').length;
      const providerUses = referrals.filter(r => r.referral_type === 'provider').length;
      
      const loyalUsesEl = document.getElementById('qr-loyal-uses');
      const memberUsesEl = document.getElementById('qr-member-uses');
      const providerUsesEl = document.getElementById('qr-provider-uses');
      
      if (loyalUsesEl) loyalUsesEl.textContent = loyalUses;
      if (memberUsesEl) memberUsesEl.textContent = memberUses;
      if (providerUsesEl) providerUsesEl.textContent = providerUses;
    }

    function updateLoyaltyBadge() {
      const total = loyaltyNetworkData.stats?.total || 0;
      const badgeEl = document.getElementById('loyalty-count');
      
      if (badgeEl) {
        if (total > 0) {
          badgeEl.textContent = total;
          badgeEl.style.display = 'inline-block';
        } else {
          badgeEl.style.display = 'none';
        }
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // ========== REFERRAL CODES SECTION ==========
    let referralCodesData = {
      loyalCustomer: { code: '', url: '' },
      newMember: { code: '', url: '' },
      referProvider: { code: '', url: '' }
    };

    async function loadReferralCodes() {
      const loadingEl = document.getElementById('referral-codes-loading');
      const gridEl = document.getElementById('referral-codes-grid');
      
      if (loadingEl) loadingEl.style.display = 'block';
      if (gridEl) gridEl.style.opacity = '0.5';
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Please log in to view referral codes', 'error');
          return;
        }

        const response = await fetch('/api/provider/referral-codes', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        
        if (!response.ok) {
          throw new Error('Failed to load referral codes');
        }
        
        const data = await response.json();
        
        const siteUrl = (window.MCC_CONFIG && window.MCC_CONFIG.siteUrl) || 'https://mycarconcierge.com';
        referralCodesData.loyalCustomer = {
          code: data.loyal_customer?.code || generateReferralCode(),
          url: data.loyal_customer?.url || `${siteUrl}/signup-loyal-customer.html?ref=${currentUser?.id}`
        };
        referralCodesData.newMember = {
          code: data.new_member?.code || generateReferralCode(),
          url: data.new_member?.url || `${siteUrl}/signup-member.html?ref=${currentUser?.id}`
        };
        referralCodesData.referProvider = {
          code: data.refer_provider?.code || (providerFounderProfile?.referral_code || generateReferralCode()),
          url: data.refer_provider?.url || `${siteUrl}/provider-pilot.html?ref=${providerFounderProfile?.referral_code || currentUser?.id}`
        };
        
        generateAllReferralQRCodes();
        updateReferralCodeDisplays();
        
      } catch (error) {
        console.error('Error loading referral codes:', error);
        const siteUrl = (window.MCC_CONFIG && window.MCC_CONFIG.siteUrl) || 'https://mycarconcierge.com';
        referralCodesData.loyalCustomer = {
          code: generateReferralCode(),
          url: `${siteUrl}/signup-loyal-customer.html?ref=${currentUser?.id}`
        };
        referralCodesData.newMember = {
          code: generateReferralCode(),
          url: `${siteUrl}/signup-member.html?ref=${currentUser?.id}`
        };
        referralCodesData.referProvider = {
          code: providerFounderProfile?.referral_code || generateReferralCode(),
          url: `${siteUrl}/provider-pilot.html?ref=${providerFounderProfile?.referral_code || currentUser?.id}`
        };
        generateAllReferralQRCodes();
        updateReferralCodeDisplays();
      } finally {
        if (loadingEl) loadingEl.style.display = 'none';
        if (gridEl) gridEl.style.opacity = '1';
      }
    }

    function updateReferralCodeDisplays() {
      const loyalCodeEl = document.getElementById('loyal-customer-code');
      const newMemberCodeEl = document.getElementById('new-member-code');
      const referProviderCodeEl = document.getElementById('refer-provider-code');
      
      if (loyalCodeEl) loyalCodeEl.textContent = referralCodesData.loyalCustomer.code;
      if (newMemberCodeEl) newMemberCodeEl.textContent = referralCodesData.newMember.code;
      if (referProviderCodeEl) referProviderCodeEl.textContent = referralCodesData.referProvider.code;
    }

    function generateAllReferralQRCodes() {
      generateSingleReferralQR('loyal-customer-qr', referralCodesData.loyalCustomer.url);
      generateSingleReferralQR('new-member-qr', referralCodesData.newMember.url);
      generateSingleReferralQR('refer-provider-qr', referralCodesData.referProvider.url);
    }

    function generateSingleReferralQR(canvasId, url) {
      const canvas = document.getElementById(canvasId);
      if (!canvas || !url) return;

      try {
        if (typeof QrCreator !== 'undefined') {
          QrCreator.render({
            text: url,
            radius: 0.4,
            ecLevel: 'H',
            fill: '#0a0a0f',
            background: '#ffffff',
            size: 150
          }, canvas);
        } else {
          canvas.style.display = 'none';
          const container = canvas.parentElement;
          if (container) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem;padding:20px;">QR unavailable</p>';
          }
        }
      } catch (error) {
        console.error('Error generating QR code for', canvasId, error);
      }
    }

    function downloadReferralQR(type) {
      let canvasId, filename;
      switch (type) {
        case 'loyal-customer':
          canvasId = 'loyal-customer-qr';
          filename = `mcc-loyal-customer-${referralCodesData.loyalCustomer.code}.png`;
          break;
        case 'new-member':
          canvasId = 'new-member-qr';
          filename = `mcc-new-member-${referralCodesData.newMember.code}.png`;
          break;
        case 'refer-provider':
          canvasId = 'refer-provider-qr';
          filename = `mcc-refer-provider-${referralCodesData.referProvider.code}.png`;
          break;
        default:
          return;
      }

      const canvas = document.getElementById(canvasId);
      if (!canvas) return;

      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showReferralToast('QR code downloaded!');
    }

    function copyReferralLink(type) {
      let url;
      switch (type) {
        case 'loyal-customer':
          url = referralCodesData.loyalCustomer.url;
          break;
        case 'new-member':
          url = referralCodesData.newMember.url;
          break;
        case 'refer-provider':
          url = referralCodesData.referProvider.url;
          break;
        default:
          return;
      }

      navigator.clipboard.writeText(url).then(() => {
        showReferralToast('Link copied to clipboard!');
      }).catch(() => {
        const textArea = document.createElement('textarea');
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showReferralToast('Link copied to clipboard!');
      });
    }

    // ========== WALK-IN POS SYSTEM ==========
    let posState = {
      sessionId: null,
      currentStep: 1,
      phone: '',
      otp: '',
      isNewCustomer: false,
      customerId: null,
      customerName: '',
      customerEmail: '',
      vehicles: [],
      selectedVehicleId: null,
      isNewVehicle: false,
      newVehicle: {},
      service: {
        category: '',
        description: '',
        laborPrice: 0,
        partsPrice: 0,
        notes: ''
      },
      inspection: null,
      paymentIntentClientSecret: null,
      stripeElements: null,
      cardElement: null,
      isMarketplaceJob: false,
      marketplaceJobs: [],
      selectedBidId: null,
      selectedPackageId: null,
      totalCents: 0
    };

    function posResetState() {
      posState = {
        sessionId: null,
        currentStep: 1,
        phone: '',
        otp: '',
        isNewCustomer: false,
        customerId: null,
        customerName: '',
        customerEmail: '',
        vehicles: [],
        selectedVehicleId: null,
        isNewVehicle: false,
        newVehicle: {},
        service: { category: '', description: '', laborPrice: 0, partsPrice: 0, notes: '' },
        inspection: null,
        paymentIntentClientSecret: null,
        stripeElements: null,
        cardElement: null,
        isMarketplaceJob: false,
        marketplaceJobs: [],
        selectedBidId: null,
        selectedPackageId: null,
        totalCents: 0
      };
    }

    let posQrScanner = null;

    async function openPosQrScanner() {
      const modal = document.getElementById('pos-qr-scanner-modal');
      const statusEl = document.getElementById('pos-qr-scanner-status');
      modal.style.display = 'flex';
      statusEl.textContent = 'Initializing camera...';
      
      if (!posState.sessionId) {
        await posStartSession();
      }
      
      try {
        posQrScanner = new Html5Qrcode('pos-qr-reader');
        await posQrScanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText) => {
            await handlePosQrScan(decodedText);
          },
          (errorMessage) => {}
        );
        statusEl.textContent = 'Point camera at customer\'s QR code';
      } catch (err) {
        console.error('QR scanner error:', err);
        statusEl.textContent = 'Camera access denied. Please use phone number.';
      }
    }

    async function closePosQrScanner() {
      const modal = document.getElementById('pos-qr-scanner-modal');
      modal.style.display = 'none';
      
      if (posQrScanner) {
        try {
          await posQrScanner.stop();
          posQrScanner.clear();
        } catch (e) {}
        posQrScanner = null;
      }
    }

    async function handlePosQrScan(qrData) {
      const statusEl = document.getElementById('pos-qr-scanner-status');
      
      if (!qrData.startsWith('mcc:checkin:')) {
        statusEl.textContent = 'Invalid QR code. Looking for MCC check-in code.';
        return;
      }
      
      const qrToken = qrData.replace('mcc:checkin:', '');
      statusEl.textContent = 'QR code detected! Looking up member...';
      
      try {
        await closePosQrScanner();
        
        const res = await fetch(`/api/pos/session/${posState.sessionId}/qr-lookup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qrToken })
        });
        
        const data = await res.json();
        
        if (data.success && data.member) {
          posState.customerId = data.member.id;
          posState.customerName = data.member.name;
          posState.customerEmail = data.member.email;
          posState.phone = data.member.phone;
          posState.vehicles = data.vehicles || [];
          posState.isNewCustomer = false;
          
          showToast(`Welcome back, ${data.member.name}!`, 'success');
          
          posRenderVehicles();
          posGoToStep(3);
        } else {
          showToast(data.error || 'QR code not recognized. Please use phone number.', 'error');
        }
      } catch (err) {
        console.error('QR lookup error:', err);
        showToast('Failed to look up QR code. Please use phone number.', 'error');
      }
    }

    function posGoToStep(step) {
      posState.currentStep = step;
      document.querySelectorAll('.pos-step-content').forEach(el => el.classList.remove('active'));
      document.getElementById(`pos-step-${step}`)?.classList.add('active');
      document.querySelectorAll('.pos-step').forEach(el => {
        const s = parseInt(el.dataset.step);
        el.classList.remove('active', 'completed');
        if (s < step) el.classList.add('completed');
        if (s === step) el.classList.add('active');
      });
      document.querySelectorAll('.pos-step .pos-step-circle').forEach((circle, idx) => {
        const s = idx + 1;
        if (s < step) circle.textContent = '✓';
        else circle.textContent = s;
      });
      const fillEl = document.getElementById('pos-stepper-fill');
      if (fillEl) {
        const fillPercent = Math.max(0, ((step - 1) / 4) * 100);
        fillEl.style.width = `calc(${fillPercent}% - 120px)`;
      }
    }

    function posSetLoading(btnId, loading, originalText = '') {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      if (loading) {
        btn.disabled = true;
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = '<span class="pos-spinner"></span> Loading...';
      } else {
        btn.disabled = false;
        btn.innerHTML = btn.dataset.originalText || originalText;
      }
    }

    function posQuickService(category, description, price) {
      document.getElementById('pos-service-category').value = category;
      document.getElementById('pos-service-description').value = description;
      document.getElementById('pos-labor-price').value = price.toFixed(2);
      document.getElementById('pos-parts-price').value = '0.00';
      document.querySelectorAll('.pos-quick-btn').forEach(btn => btn.style.borderColor = '');
      event.target.closest('.pos-quick-btn').style.borderColor = '#c9a227';
    }

    const POS_INSPECTION_CONFIG = {
      quick_visual: {
        name: 'Quick Visual',
        items: [
          { id: 'tires', name: 'Tires', icon: '🛞', options: ['Good', 'Fair', 'Poor'] },
          { id: 'lights', name: 'Lights', icon: '💡', options: ['Working', 'Not Working'] },
          { id: 'fluids', name: 'Fluid Levels', icon: '🛢️', options: ['Full', 'Low', 'Empty'] },
          { id: 'wipers', name: 'Wipers', icon: '🌧️', options: ['Good', 'Worn'] },
          { id: 'exterior', name: 'Exterior Condition', icon: '🚗', options: ['Good', 'Fair', 'Poor'] }
        ]
      },
      multi_point: {
        name: 'Multi-Point',
        items: [
          { id: 'tires_tread', name: 'Tire Tread Depth', icon: '🛞', options: ['Good', 'Fair', 'Poor'] },
          { id: 'tires_pressure', name: 'Tire Pressure', icon: '🎈', options: ['Good', 'Low', 'High'] },
          { id: 'brakes_pads', name: 'Brake Pads', icon: '🛑', options: ['Good', 'Fair', 'Poor'] },
          { id: 'brakes_rotors', name: 'Brake Rotors', icon: '⚙️', options: ['Good', 'Fair', 'Poor'] },
          { id: 'brakes_fluid', name: 'Brake Fluid', icon: '💧', options: ['Full', 'Low', 'Empty'] },
          { id: 'lights_headlights', name: 'Headlights', icon: '🔦', options: ['Working', 'Not Working'] },
          { id: 'lights_taillights', name: 'Taillights', icon: '🚨', options: ['Working', 'Not Working'] },
          { id: 'lights_signals', name: 'Turn Signals', icon: '↗️', options: ['Working', 'Not Working'] },
          { id: 'oil', name: 'Oil Level', icon: '🛢️', options: ['Full', 'Low', 'Empty'] },
          { id: 'coolant', name: 'Coolant', icon: '❄️', options: ['Full', 'Low', 'Empty'] },
          { id: 'transmission', name: 'Transmission Fluid', icon: '⚙️', options: ['Full', 'Low', 'Empty'] },
          { id: 'battery', name: 'Battery', icon: '🔋', options: ['Good', 'Weak', 'Replace'] },
          { id: 'belts', name: 'Belts & Hoses', icon: '🔗', options: ['Good', 'Worn', 'Replace'] },
          { id: 'wipers', name: 'Wipers', icon: '🌧️', options: ['Good', 'Worn'] },
          { id: 'air_filter', name: 'Air Filter', icon: '🌬️', options: ['Clean', 'Dirty', 'Replace'] }
        ]
      },
      full_diagnostic: {
        name: 'Full Diagnostic',
        items: [
          { id: 'tires_tread', name: 'Tire Tread Depth', icon: '🛞', options: ['Good', 'Fair', 'Poor'] },
          { id: 'tires_pressure', name: 'Tire Pressure', icon: '🎈', options: ['Good', 'Low', 'High'] },
          { id: 'tires_condition', name: 'Tire Sidewall', icon: '⭕', options: ['Good', 'Fair', 'Poor'] },
          { id: 'brakes_pads', name: 'Brake Pads', icon: '🛑', options: ['Good', 'Fair', 'Poor'] },
          { id: 'brakes_rotors', name: 'Brake Rotors', icon: '⚙️', options: ['Good', 'Fair', 'Poor'] },
          { id: 'brakes_fluid', name: 'Brake Fluid', icon: '💧', options: ['Full', 'Low', 'Empty'] },
          { id: 'brakes_lines', name: 'Brake Lines', icon: '🔗', options: ['Good', 'Fair', 'Poor'] },
          { id: 'lights_headlights', name: 'Headlights', icon: '🔦', options: ['Working', 'Not Working'] },
          { id: 'lights_taillights', name: 'Taillights', icon: '🚨', options: ['Working', 'Not Working'] },
          { id: 'lights_signals', name: 'Turn Signals', icon: '↗️', options: ['Working', 'Not Working'] },
          { id: 'lights_brake', name: 'Brake Lights', icon: '🔴', options: ['Working', 'Not Working'] },
          { id: 'oil', name: 'Oil Level', icon: '🛢️', options: ['Full', 'Low', 'Empty'] },
          { id: 'oil_condition', name: 'Oil Condition', icon: '🔍', options: ['Clean', 'Dark', 'Dirty'] },
          { id: 'coolant', name: 'Coolant', icon: '❄️', options: ['Full', 'Low', 'Empty'] },
          { id: 'transmission', name: 'Transmission Fluid', icon: '⚙️', options: ['Full', 'Low', 'Empty'] },
          { id: 'power_steering', name: 'Power Steering', icon: '🎯', options: ['Full', 'Low', 'Empty'] },
          { id: 'washer', name: 'Washer Fluid', icon: '💦', options: ['Full', 'Low', 'Empty'] },
          { id: 'battery', name: 'Battery', icon: '🔋', options: ['Good', 'Weak', 'Replace'] },
          { id: 'battery_terminals', name: 'Battery Terminals', icon: '🔌', options: ['Clean', 'Corroded'] },
          { id: 'belts', name: 'Serpentine Belt', icon: '🔗', options: ['Good', 'Worn', 'Replace'] },
          { id: 'hoses', name: 'Coolant Hoses', icon: '🧪', options: ['Good', 'Worn', 'Replace'] },
          { id: 'wipers', name: 'Wipers', icon: '🌧️', options: ['Good', 'Worn'] },
          { id: 'air_filter', name: 'Air Filter', icon: '🌬️', options: ['Clean', 'Dirty', 'Replace'] },
          { id: 'cabin_filter', name: 'Cabin Filter', icon: '🏠', options: ['Clean', 'Dirty', 'Replace'] },
          { id: 'suspension', name: 'Suspension', icon: '🚙', options: ['Good', 'Fair', 'Poor'] }
        ]
      }
    };

    function posToggleInspection() {
      const body = document.getElementById('pos-inspection-body');
      const toggle = document.getElementById('pos-inspection-toggle');
      if (body.style.display === 'none') {
        body.style.display = 'block';
        toggle.style.transform = 'rotate(180deg)';
      } else {
        body.style.display = 'none';
        toggle.style.transform = 'rotate(0deg)';
      }
    }

    function posUpdateInspectionChecklist() {
      const type = document.getElementById('pos-inspection-type').value;
      const checklistDiv = document.getElementById('pos-inspection-checklist');
      const itemsDiv = document.getElementById('pos-inspection-items');
      
      if (!type) {
        checklistDiv.style.display = 'none';
        itemsDiv.innerHTML = '';
        return;
      }
      
      const config = POS_INSPECTION_CONFIG[type];
      if (!config) return;
      
      checklistDiv.style.display = 'block';
      
      let html = `<h4 style="font-size:0.95rem;font-weight:600;margin-bottom:16px;color:var(--accent-gold);">📋 ${config.name} Inspection (${config.items.length} points)</h4>`;
      
      config.items.forEach(item => {
        html += `
          <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:14px;margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
              <div style="display:flex;align-items:center;gap:8px;min-width:150px;">
                <span style="font-size:1.1rem;">${item.icon}</span>
                <span style="font-weight:500;">${item.name}</span>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                ${item.options.map(opt => {
                  const optClass = opt.toLowerCase().replace(/\s+/g, '_');
                  const color = opt === 'Good' || opt === 'Working' || opt === 'Full' || opt === 'Clean' ? 'var(--accent-green)' :
                               opt === 'Fair' || opt === 'Low' || opt === 'Worn' || opt === 'Dirty' || opt === 'Weak' || opt === 'Dark' || opt === 'Corroded' || opt === 'High' ? 'var(--accent-orange)' :
                               opt === 'Poor' || opt === 'Empty' || opt === 'Replace' || opt === 'Not Working' ? 'var(--accent-red)' : 'var(--text-secondary)';
                  return `<label style="display:inline-flex;align-items:center;gap:4px;padding:6px 12px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);cursor:pointer;font-size:0.85rem;transition:all 0.15s;" class="pos-inspection-opt">
                    <input type="radio" name="inspection_${item.id}" value="${opt}" style="accent-color:${color};">
                    <span>${opt}</span>
                  </label>`;
                }).join('')}
              </div>
            </div>
            <div style="margin-top:10px;">
              <input type="text" class="pos-input" id="inspection_note_${item.id}" placeholder="Notes for ${item.name}..." style="font-size:0.85rem;padding:8px 12px;">
            </div>
          </div>
        `;
      });
      
      itemsDiv.innerHTML = html;
    }

    function posCollectInspectionData() {
      const type = document.getElementById('pos-inspection-type').value;
      if (!type) return null;
      
      const config = POS_INSPECTION_CONFIG[type];
      if (!config) return null;
      
      const technician = document.getElementById('pos-inspection-technician').value.trim();
      const condition = document.getElementById('pos-inspection-condition').value;
      const notes = document.getElementById('pos-inspection-notes').value.trim();
      
      const inspectionData = {};
      let hasAnyData = false;
      
      config.items.forEach(item => {
        const selectedRadio = document.querySelector(`input[name="inspection_${item.id}"]:checked`);
        const noteEl = document.getElementById(`inspection_note_${item.id}`);
        const itemNote = noteEl ? noteEl.value.trim() : '';
        
        if (selectedRadio || itemNote) {
          hasAnyData = true;
          inspectionData[item.id] = {
            name: item.name,
            status: selectedRadio ? selectedRadio.value : null,
            note: itemNote
          };
        }
      });
      
      if (!hasAnyData) return null;
      
      return {
        type: type,
        typeName: config.name,
        technicianName: technician,
        overallCondition: condition,
        notes: notes,
        items: inspectionData
      };
    }

    async function posSaveInspection(inspectionData) {
      if (!inspectionData || !posState.sessionId) return null;
      
      try {
        const resp = await fetch('/api/pos/inspection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: posState.sessionId,
            memberId: posState.customerId,
            vehicleId: posState.selectedVehicleId,
            providerId: currentUser?.id,
            inspectionType: inspectionData.type,
            inspectionData: inspectionData.items,
            overallCondition: inspectionData.overallCondition,
            notes: inspectionData.notes,
            technicianName: inspectionData.technicianName
          })
        });
        const data = await resp.json();
        if (!resp.ok) {
          console.error('Failed to save inspection:', data.error);
          return null;
        }
        return data.inspectionId;
      } catch (err) {
        console.error('Inspection save error:', err);
        return null;
      }
    }

    async function posResendOtp() {
      const btn = document.getElementById('pos-resend-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="pos-spinner"></span> Sending...';
      try {
        const resp = await fetch(`/api/pos/session/${posState.sessionId}/resend-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await resp.json();
        if (data.otp) {
          document.getElementById('pos-otp-display').textContent = data.otp;
          posState.otp = data.otp;
        }
        showToast('Verification code resent!', 'success');
      } catch (err) {
        showToast('Failed to resend code', 'error');
      }
      btn.disabled = false;
      btn.innerHTML = '🔄 Resend Code';
    }

    function posPrintReceipt() {
      const vehicle = posState.vehicles.find(v => v.id === posState.selectedVehicleId) || posState.newVehicle;
      const vehicleStr = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : 'N/A';
      const vehicleColor = vehicle?.color || '';
      const vehiclePlate = vehicle?.license_plate || '';
      const total = posState.service ? (posState.service.laborPrice + posState.service.partsPrice) : 0;
      const txnId = document.getElementById('pos-success-txn').textContent;
      const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
      const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const notes = posState.service?.notes || '';
      
      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Service Receipt</title>
          <style>
            @page { margin: 0; size: 80mm auto; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { 
              font-family: 'Courier New', Courier, monospace; 
              width: 300px; 
              max-width: 300px;
              margin: 0 auto; 
              padding: 12px;
              font-size: 12px;
              line-height: 1.4;
              background: #fff;
              color: #000;
            }
            .header { text-align: center; padding-bottom: 8px; border-bottom: 2px solid #000; margin-bottom: 10px; }
            .logo { font-size: 18px; font-weight: bold; letter-spacing: 1px; }
            .logo-gold { color: #c9a227; }
            .subtitle { font-size: 11px; margin-top: 4px; }
            .divider { border-bottom: 1px dashed #888; margin: 10px 0; }
            .divider-bold { border-bottom: 2px solid #000; margin: 10px 0; }
            .section { margin-bottom: 10px; }
            .section-title { font-weight: bold; font-size: 11px; text-transform: uppercase; margin-bottom: 6px; background: #eee; padding: 4px 6px; }
            .row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 11px; }
            .row-label { color: #555; }
            .row-value { font-weight: 500; text-align: right; max-width: 55%; }
            .service-item { padding: 6px 0; border-bottom: 1px dotted #ccc; }
            .service-name { font-weight: bold; font-size: 12px; }
            .service-desc { font-size: 10px; color: #555; margin-top: 2px; }
            .total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 16px; font-weight: bold; border-top: 2px solid #000; margin-top: 8px; }
            .notes-box { background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; padding: 8px; margin-top: 8px; font-size: 10px; }
            .notes-title { font-weight: bold; font-size: 11px; margin-bottom: 4px; }
            .footer { text-align: center; margin-top: 16px; padding-top: 10px; border-top: 2px solid #000; }
            .footer-thanks { font-size: 14px; font-weight: bold; margin-bottom: 6px; }
            .footer-site { font-size: 11px; color: #666; }
            .footer-tagline { font-size: 9px; color: #888; margin-top: 4px; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">${currentUser?.business_name?.toUpperCase() || 'SERVICE RECEIPT'}</div>
            <div class="subtitle">Service Receipt & Report</div>
          </div>
          
          <div class="section">
            <div class="row"><span class="row-label">Date:</span><span class="row-value">${dateStr}</span></div>
            <div class="row"><span class="row-label">Time:</span><span class="row-value">${timeStr}</span></div>
            <div class="row"><span class="row-label">Transaction:</span><span class="row-value" style="font-family:monospace;">${txnId}</span></div>
          </div>
          
          <div class="divider"></div>
          
          <div class="section">
            <div class="section-title">Customer Information</div>
            <div class="row"><span class="row-label">Name:</span><span class="row-value">${posState.customerName || 'Walk-In Customer'}</span></div>
            <div class="row"><span class="row-label">Phone:</span><span class="row-value">${posState.phone || '-'}</span></div>
            ${posState.customerEmail ? `<div class="row"><span class="row-label">Email:</span><span class="row-value" style="font-size:9px;">${posState.customerEmail}</span></div>` : ''}
          </div>
          
          <div class="section">
            <div class="section-title">Vehicle Details</div>
            <div class="row"><span class="row-label">Vehicle:</span><span class="row-value">${vehicleStr}</span></div>
            ${vehicleColor ? `<div class="row"><span class="row-label">Color:</span><span class="row-value">${vehicleColor}</span></div>` : ''}
            ${vehiclePlate ? `<div class="row"><span class="row-label">License:</span><span class="row-value">${vehiclePlate}</span></div>` : ''}
          </div>
          
          <div class="divider-bold"></div>
          
          <div class="section">
            <div class="section-title">Services Performed</div>
            <div class="service-item">
              <div class="service-name">${posState.service?.category || 'Service'}</div>
              <div class="service-desc">${posState.service?.description || ''}</div>
            </div>
          </div>
          
          <div class="section">
            <div class="row"><span class="row-label">Labor:</span><span class="row-value">$${(posState.service?.laborPrice || 0).toFixed(2)}</span></div>
            <div class="row"><span class="row-label">Parts:</span><span class="row-value">$${(posState.service?.partsPrice || 0).toFixed(2)}</span></div>
            <div class="total-row"><span>TOTAL PAID:</span><span>$${total.toFixed(2)}</span></div>
          </div>
          
          ${notes ? `
          <div class="notes-box">
            <div class="notes-title">Technician Notes:</div>
            <div>${notes}</div>
          </div>
          ` : ''}
          
          ${posGenerateInspectionPrintHtml()}
          
          <div class="footer">
            <div class="footer-thanks">Thank You For Your Business!</div>
            <div class="footer-tagline">Powered by My Car Concierge</div>
          </div>
        </body>
        </html>
      `;
      const printWindow = window.open('', '_blank', 'width=350,height=700');
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); }, 300);
    }

    function posGenerateInspectionPrintHtml() {
      const inspection = posState.inspection;
      if (!inspection || !inspection.items) return '';
      
      const conditionLabels = {
        'excellent': '✅ Excellent',
        'good': '👍 Good',
        'fair': '⚠️ Fair',
        'needs_attention': '🔶 Needs Attention',
        'critical': '🔴 Critical'
      };
      
      const statusColors = {
        'Good': '#22c55e', 'Working': '#22c55e', 'Full': '#22c55e', 'Clean': '#22c55e',
        'Fair': '#f59e0b', 'Low': '#f59e0b', 'Worn': '#f59e0b', 'Dirty': '#f59e0b', 'Weak': '#f59e0b', 'Dark': '#f59e0b', 'Corroded': '#f59e0b', 'High': '#f59e0b',
        'Poor': '#ef4444', 'Empty': '#ef4444', 'Replace': '#ef4444', 'Not Working': '#ef4444'
      };
      
      let itemsHtml = '';
      const inspectionItems = inspection.items || {};
      Object.values(inspectionItems).forEach(item => {
        if (!item) return;
        const itemName = item.name || 'Unknown Item';
        const itemStatus = item.status || '';
        if (itemStatus) {
          const color = statusColors[itemStatus] || '#666';
          itemsHtml += `<div class="row"><span class="row-label">${itemName}:</span><span class="row-value" style="color:${color};font-weight:600;">${itemStatus}</span></div>`;
          if (item.note) {
            itemsHtml += `<div style="font-size:9px;color:#666;padding-left:10px;margin-bottom:4px;">↳ ${item.note}</div>`;
          }
        }
      });
      
      if (!itemsHtml) return '';
      
      return `
        <div class="divider-bold"></div>
        <div class="section">
          <div class="section-title">🔍 Vehicle Inspection Report</div>
          <div class="row"><span class="row-label">Type:</span><span class="row-value">${inspection.typeName || inspection.type}</span></div>
          ${inspection.technicianName ? `<div class="row"><span class="row-label">Inspector:</span><span class="row-value">${inspection.technicianName}</span></div>` : ''}
          ${inspection.overallCondition ? `<div class="row"><span class="row-label">Overall:</span><span class="row-value">${conditionLabels[inspection.overallCondition] || inspection.overallCondition}</span></div>` : ''}
        </div>
        <div class="section" style="margin-top:8px;">
          ${itemsHtml}
        </div>
        ${inspection.notes ? `
        <div class="notes-box" style="margin-top:8px;">
          <div class="notes-title">Inspection Notes:</div>
          <div>${inspection.notes}</div>
        </div>
        ` : ''}
      `;
    }

    function posUpdateReceiptDisplays() {
      const emailDisplay = document.getElementById('pos-receipt-email-display');
      const smsDisplay = document.getElementById('pos-receipt-sms-display');
      const emailCheckbox = document.getElementById('pos-receipt-email');
      const smsCheckbox = document.getElementById('pos-receipt-sms');
      const printCheckbox = document.getElementById('pos-receipt-print');
      
      const hasEmail = !!posState.customerEmail;
      const hasPhone = !!posState.phone;
      
      if (emailDisplay) {
        emailDisplay.textContent = posState.customerEmail || 'No email on file';
        emailDisplay.style.color = hasEmail ? 'var(--text-muted)' : 'var(--accent-red)';
      }
      if (emailCheckbox) {
        emailCheckbox.checked = hasEmail;
        emailCheckbox.disabled = !hasEmail;
      }
      
      if (smsDisplay) {
        smsDisplay.textContent = hasPhone ? posFormatPhone(posState.phone) : 'No phone on file';
        smsDisplay.style.color = hasPhone ? 'var(--text-muted)' : 'var(--accent-red)';
      }
      if (smsCheckbox) {
        smsCheckbox.checked = hasPhone;
        smsCheckbox.disabled = !hasPhone;
      }
      
      if (printCheckbox) {
        printCheckbox.checked = true;
        printCheckbox.disabled = false;
      }
    }

    async function posSendReceipt() {
      const emailCheckbox = document.getElementById('pos-receipt-email');
      const smsCheckbox = document.getElementById('pos-receipt-sms');
      const printCheckbox = document.getElementById('pos-receipt-print');
      const errorEl = document.getElementById('pos-receipt-validation-error');
      const statusEl = document.getElementById('pos-receipt-status');
      const btn = document.getElementById('pos-send-receipt-btn');
      
      const sendEmail = emailCheckbox.checked && !emailCheckbox.disabled;
      const sendSms = smsCheckbox.checked && !smsCheckbox.disabled;
      const doPrint = printCheckbox.checked;
      
      if (!sendEmail && !sendSms && !doPrint) {
        errorEl.style.display = 'block';
        return;
      }
      errorEl.style.display = 'none';
      
      btn.disabled = true;
      btn.innerHTML = '<span class="pos-spinner"></span> Sending...';
      statusEl.style.display = 'none';
      
      try {
        const vehicle = posState.vehicles.find(v => v.id === posState.selectedVehicleId) || posState.newVehicle;
        const vehicleStr = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : 'N/A';
        const total = posState.service ? (posState.service.laborPrice + posState.service.partsPrice) : 0;
        const txnId = document.getElementById('pos-success-txn').textContent;
        
        const receiptData = {
          sessionId: posState.sessionId,
          transactionId: txnId,
          customerName: posState.customerName || 'Customer',
          customerEmail: posState.customerEmail,
          customerPhone: posState.phone,
          vehicle: vehicleStr,
          vehicleDetails: vehicle,
          service: posState.service,
          total: total,
          providerName: currentUser?.business_name || currentUser?.name || 'Service Provider',
          sendEmail: sendEmail,
          sendSms: sendSms,
          generatePrint: doPrint
        };
        
        const resp = await fetch('/api/pos/receipt-delivery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(receiptData)
        });
        
        const data = await resp.json();
        
        if (!resp.ok) throw new Error(data.error || 'Failed to send receipt');
        
        let statusHtml = '<div style="color:var(--accent-green);">✅ Receipt delivery complete!</div><ul style="margin-top:8px;font-size:0.9rem;text-align:left;list-style:none;padding:0;">';
        
        if (data.emailResult) {
          statusHtml += `<li>${data.emailResult.sent ? '✓ Email sent' : '⚠️ Email: ' + (data.emailResult.reason || 'not sent')}</li>`;
        }
        if (data.smsResult) {
          statusHtml += `<li>${data.smsResult.sent ? '✓ SMS sent' : '⚠️ SMS: ' + (data.smsResult.reason || 'not sent')}</li>`;
        }
        if (doPrint) {
          statusHtml += '<li>✓ Opening print dialog...</li>';
        }
        
        statusHtml += '</ul>';
        statusEl.innerHTML = statusHtml;
        statusEl.style.display = 'block';
        statusEl.style.background = 'var(--accent-green-soft)';
        statusEl.style.border = '1px solid var(--accent-green)';
        
        if (doPrint) {
          setTimeout(() => posPrintReceipt(), 500);
        }
        
        btn.innerHTML = '✓ Receipt Sent';
        btn.style.background = 'var(--accent-green)';
        
      } catch (err) {
        console.error('Receipt delivery error:', err);
        statusEl.innerHTML = `<div style="color:var(--accent-red);">❌ ${err.message}</div>`;
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(239,95,95,0.1)';
        statusEl.style.border = '1px solid var(--accent-red)';
        btn.disabled = false;
        btn.innerHTML = '✉️ Send Receipt';
      }
    }

    function posPlaySuccessSound() {
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1);
        oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.4);
      } catch (e) { console.log('Audio not available'); }
    }

    function posCreateConfetti() {
      const card = document.getElementById('pos-success-card');
      if (!card) return;
      const colors = ['#c9a227', '#4ac88c', '#4a7cff', '#ef5f5f', '#f59e0b'];
      for (let i = 0; i < 30; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'pos-confetti';
        confetti.style.cssText = `
          left: ${Math.random() * 100}%;
          top: -10px;
          background: ${colors[Math.floor(Math.random() * colors.length)]};
          animation: confetti-fall ${1 + Math.random() * 2}s ease-out forwards;
          animation-delay: ${Math.random() * 0.5}s;
        `;
        card.appendChild(confetti);
        setTimeout(() => confetti.remove(), 3000);
      }
    }

    function posFormatPhone(value) {
      const digits = value.replace(/\D/g, '');
      if (digits.length <= 3) return digits;
      if (digits.length <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
      return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6,10)}`;
    }

    document.getElementById('pos-phone')?.addEventListener('input', (e) => {
      e.target.value = posFormatPhone(e.target.value);
    });

    async function posStartSession() {
      try {
        const resp = await fetch('/api/pos/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId: currentUser.id, startedBy: currentUser.id })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed to start session');
        posState.sessionId = data.session?.id || data.sessionId || data.session_id;
        console.log('POS session started:', posState.sessionId);
        return posState.sessionId;
      } catch (err) {
        console.error('POS session error:', err);
        showToast(err.message, 'error');
        return null;
      }
    }

    async function posLookupCustomer() {
      const phoneInput = document.getElementById('pos-phone');
      const errorEl = document.getElementById('pos-phone-error');
      const phone = phoneInput.value.replace(/\D/g, '');
      
      if (phone.length < 10) {
        errorEl.textContent = 'Please enter a valid 10-digit phone number';
        errorEl.style.display = 'block';
        return;
      }
      errorEl.style.display = 'none';
      posState.phone = phone;
      
      posSetLoading('pos-lookup-btn', true);
      
      if (!posState.sessionId) {
        await posStartSession();
        if (!posState.sessionId) {
          posSetLoading('pos-lookup-btn', false, '🔍 Look Up Customer');
          return;
        }
      }
      
      try {
        const resp = await fetch(`/api/pos/session/${posState.sessionId}/member-lookup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Lookup failed');
        
        posState.isNewCustomer = data.is_new;
        posState.customerId = data.member_id;
        posState.customerName = data.name || '';
        posState.customerEmail = data.email || '';
        posState.vehicles = data.vehicles || [];
        posState.otp = data.otp || '';
        
        document.getElementById('pos-otp-display').textContent = data.otp || '------';
        if (data.otp) {
          document.getElementById('pos-otp-display-box').style.display = 'block';
        } else {
          document.getElementById('pos-otp-display-box').style.display = 'none';
        }
        
        if (data.is_new) {
          document.getElementById('pos-customer-info-section').style.display = 'block';
          document.getElementById('pos-existing-customer-section').style.display = 'none';
        } else {
          document.getElementById('pos-customer-info-section').style.display = 'none';
          document.getElementById('pos-existing-customer-section').style.display = 'block';
          document.getElementById('pos-existing-name').textContent = `Welcome back, ${data.name || 'Customer'}!`;
          document.getElementById('pos-existing-email').textContent = data.email || '';
        }
        
        posSetLoading('pos-lookup-btn', false, '🔍 Look Up Customer');
        posGoToStep(2);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        posSetLoading('pos-lookup-btn', false, '🔍 Look Up Customer');
      }
    }

    async function posVerifyOtp() {
      const otpInput = document.getElementById('pos-otp-input');
      const errorEl = document.getElementById('pos-otp-error');
      const otp = otpInput.value.trim();
      
      if (otp.length < 4) {
        errorEl.textContent = 'Please enter the verification code';
        errorEl.style.display = 'block';
        return;
      }
      errorEl.style.display = 'none';
      
      if (posState.isNewCustomer) {
        const nameInput = document.getElementById('pos-customer-name');
        const emailInput = document.getElementById('pos-customer-email');
        const name = nameInput.value.trim();
        
        if (!name) {
          errorEl.textContent = 'Please enter customer name';
          errorEl.style.display = 'block';
          return;
        }
        posState.customerName = name;
        posState.customerEmail = emailInput.value.trim();
      }
      
      posSetLoading('pos-verify-btn', true);
      
      try {
        const resp = await fetch(`/api/pos/session/${posState.sessionId}/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            otp,
            name: posState.customerName,
            email: posState.customerEmail
          })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Verification failed');
        
        posState.customerId = data.member_id;
        posState.vehicles = data.vehicles || [];
        
        posSetLoading('pos-verify-btn', false, 'Verify & Continue →');
        
        const marketplaceJobs = await posCheckMarketplaceJobs();
        if (marketplaceJobs && marketplaceJobs.length > 0) {
          posState.marketplaceJobs = marketplaceJobs;
          posRenderMarketplaceChoice();
          document.getElementById('pos-marketplace-choice').style.display = 'block';
        } else {
          posRenderVehicles();
          posGoToStep(3);
        }
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        posSetLoading('pos-verify-btn', false, 'Verify & Continue →');
      }
    }
    
    async function posCheckMarketplaceJobs() {
      try {
        const resp = await fetch(`/api/pos/session/${posState.sessionId}/marketplace-jobs`);
        const data = await resp.json();
        if (!resp.ok) return [];
        return data.jobs || [];
      } catch (err) {
        console.error('Error fetching marketplace jobs:', err);
        return [];
      }
    }
    
    function posRenderMarketplaceChoice() {
      const container = document.getElementById('pos-marketplace-jobs-list');
      const jobs = posState.marketplaceJobs || [];
      
      container.innerHTML = jobs.map(job => {
        const vehicleName = job.vehicleName || 'No vehicle info';
        const escrowBadge = job.escrowFunded 
          ? `<span style="background:var(--accent-green-soft);color:var(--accent-green);padding:4px 10px;border-radius:100px;font-size:0.8rem;font-weight:500;">✓ Escrow Funded</span>`
          : `<span style="background:var(--accent-gold-soft);color:var(--accent-gold);padding:4px 10px;border-radius:100px;font-size:0.8rem;font-weight:500;">💳 Payment Needed</span>`;
        
        return `
          <div class="pos-marketplace-job" onclick="posSelectMarketplaceJob('${job.bidId}', '${job.packageId}', ${job.escrowFunded})" style="background:var(--bg-card);border:2px solid var(--border-subtle);border-radius:var(--radius-md);padding:20px;margin-bottom:12px;cursor:pointer;transition:all 0.2s;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
              <div>
                <div style="font-weight:600;font-size:1.1rem;margin-bottom:4px;">${job.title}</div>
                <div style="color:var(--text-muted);font-size:0.9rem;">🚗 ${vehicleName}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-weight:700;color:var(--accent-gold);font-size:1.2rem;">$${(job.price || 0).toFixed(2)}</div>
                ${escrowBadge}
              </div>
            </div>
            <div style="font-size:0.85rem;color:var(--text-muted);">
              Accepted ${new Date(job.createdAt).toLocaleDateString()}
            </div>
          </div>
        `;
      }).join('');
    }
    
    async function posSelectMarketplaceJob(bidId, packageId, escrowFunded) {
      posState.isMarketplaceJob = true;
      posState.selectedBidId = bidId;
      posState.selectedPackageId = packageId;
      
      document.getElementById('pos-marketplace-choice').style.display = 'none';
      
      const loadingEl = document.getElementById('pos-marketplace-loading');
      loadingEl.style.display = 'block';
      
      try {
        const resp = await fetch(`/api/pos/session/${posState.sessionId}/link-marketplace`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bidId, packageId })
        });
        const data = await resp.json();
        
        loadingEl.style.display = 'none';
        
        if (!resp.ok) throw new Error(data.error || 'Failed to link job');
        
        if (data.escrowFunded) {
          posShowMarketplaceSuccess('Vehicle checked in successfully! Escrow is already funded - work can begin immediately.');
        } else if (data.needsPayment) {
          posState.paymentClientSecret = data.clientSecret;
          posState.totalCents = data.totalCents;
          document.getElementById('pos-pay-total').textContent = `$${(data.totalCents / 100).toFixed(2)}`;
          let breakdownHtml = `
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-subtle);">
              <span>Marketplace Job (Escrow)</span>
              <span>$${(data.totalCents / 100).toFixed(2)}</span>
            </div>
          `;
          if (data.vipMember && data.vipMessage) {
            breakdownHtml += `
              <div style="display:flex;align-items:center;gap:8px;padding:12px;margin-top:12px;background:linear-gradient(135deg,rgba(201,162,39,0.15),rgba(201,162,39,0.05));border:1px solid rgba(201,162,39,0.3);border-radius:8px;color:#c9a227;">
                <span style="font-size:1.2rem;">👑</span>
                <span style="font-weight:600;">${data.vipMessage}</span>
              </div>
            `;
          }
          document.getElementById('pos-pay-breakdown').innerHTML = breakdownHtml;
          posGoToStep(5);
          posInitStripeMarketplace(data.clientSecret);
        }
      } catch (err) {
        loadingEl.style.display = 'none';
        alert('Error: ' + err.message);
        document.getElementById('pos-marketplace-choice').style.display = 'block';
      }
    }
    
    function posChooseNewWalkin() {
      document.getElementById('pos-marketplace-choice').style.display = 'none';
      posState.isMarketplaceJob = false;
      posRenderVehicles();
      posGoToStep(3);
    }
    
    function posShowMarketplaceSuccess(message) {
      document.getElementById('pos-success-title').textContent = 'Marketplace Job Started!';
      document.getElementById('pos-success-message').textContent = message;
      document.querySelectorAll('.pos-step-content').forEach(c => c.classList.remove('active'));
      document.getElementById('pos-step-success').style.display = 'block';
      document.getElementById('pos-step-success').classList.add('active');
      posUpdateReceiptDisplays();
      posResetReceiptUI();
      posPlaySuccessSound();
      posLaunchConfetti();
    }
    
    function posResetReceiptUI() {
      const emailCheckbox = document.getElementById('pos-receipt-email');
      const smsCheckbox = document.getElementById('pos-receipt-sms');
      const printCheckbox = document.getElementById('pos-receipt-print');
      const btn = document.getElementById('pos-send-receipt-btn');
      const statusEl = document.getElementById('pos-receipt-status');
      const errorEl = document.getElementById('pos-receipt-validation-error');
      
      const hasEmail = !!posState.customerEmail;
      const hasPhone = !!posState.phone;
      
      if (emailCheckbox) {
        emailCheckbox.checked = hasEmail;
        emailCheckbox.disabled = !hasEmail;
      }
      if (smsCheckbox) {
        smsCheckbox.checked = hasPhone;
        smsCheckbox.disabled = !hasPhone;
      }
      if (printCheckbox) {
        printCheckbox.checked = true;
        printCheckbox.disabled = false;
      }
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '✉️ Send Receipt';
        btn.style.background = '';
      }
      if (statusEl) statusEl.style.display = 'none';
      if (errorEl) errorEl.style.display = 'none';
    }
    
    async function posInitStripeMarketplace(clientSecret) {
      if (typeof Stripe === 'undefined') {
        console.error('Stripe.js not loaded');
        return;
      }
      try {
        const resp = await fetch('/api/stripe-publishable-key');
        const data = await resp.json();
        if (!data.publishableKey) {
          console.error('No Stripe publishable key');
          return;
        }
        posState.stripe = Stripe(data.publishableKey);
        posState.elements = posState.stripe.elements({ clientSecret });
        const paymentElement = posState.elements.create('payment');
        document.getElementById('pos-payment-element').innerHTML = '';
        paymentElement.mount('#pos-payment-element');
      } catch (err) {
        console.error('Stripe init error:', err);
      }
    }

    function posRenderVehicles() {
      const container = document.getElementById('pos-existing-vehicles');
      
      if (posState.vehicles.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">No vehicles on file. Add a new vehicle below.</div>';
        posShowNewVehicleForm();
        return;
      }
      
      container.innerHTML = posState.vehicles.map(v => `
        <div class="pos-vehicle-card ${posState.selectedVehicleId === v.id ? 'selected' : ''}" onclick="posSelectExistingVehicle('${v.id}')">
          <div class="pos-vehicle-title">${v.year} ${v.make} ${v.model}</div>
          <div class="pos-vehicle-meta">${v.color || ''} ${v.license_plate ? '• ' + v.license_plate : ''}</div>
        </div>
      `).join('');
      
      const yearSelect = document.getElementById('pos-vehicle-year');
      if (yearSelect && yearSelect.options.length <= 1) {
        const currentYear = new Date().getFullYear();
        for (let y = currentYear + 1; y >= 1950; y--) {
          yearSelect.innerHTML += `<option value="${y}">${y}</option>`;
        }
      }
    }

    function posSelectExistingVehicle(id) {
      posState.selectedVehicleId = id;
      posState.isNewVehicle = false;
      document.querySelectorAll('.pos-vehicle-card').forEach(c => c.classList.remove('selected'));
      document.querySelector(`.pos-vehicle-card[onclick*="${id}"]`)?.classList.add('selected');
      document.getElementById('pos-new-vehicle-form').style.display = 'none';
    }

    function posShowNewVehicleForm() {
      posState.selectedVehicleId = null;
      posState.isNewVehicle = true;
      document.querySelectorAll('.pos-vehicle-card').forEach(c => c.classList.remove('selected'));
      document.getElementById('pos-new-vehicle-form').style.display = 'block';
      
      const yearSelect = document.getElementById('pos-vehicle-year');
      if (yearSelect && yearSelect.options.length <= 1) {
        const currentYear = new Date().getFullYear();
        for (let y = currentYear + 1; y >= 1950; y--) {
          yearSelect.innerHTML += `<option value="${y}">${y}</option>`;
        }
      }
    }

    async function posSelectVehicle() {
      const errorEl = document.getElementById('pos-vehicle-error');
      errorEl.style.display = 'none';
      
      if (posState.isNewVehicle) {
        const year = document.getElementById('pos-vehicle-year').value;
        const make = document.getElementById('pos-vehicle-make').value.trim();
        const model = document.getElementById('pos-vehicle-model').value.trim();
        const color = document.getElementById('pos-vehicle-color').value.trim();
        const plate = document.getElementById('pos-vehicle-plate').value.trim().toUpperCase();
        const vin = document.getElementById('pos-vehicle-vin').value.trim().toUpperCase();
        
        if (!year || !make || !model) {
          errorEl.textContent = 'Please enter year, make, and model';
          errorEl.style.display = 'block';
          return;
        }
        
        posState.newVehicle = { year: parseInt(year), make, model, color, license_plate: plate, vin };
      } else if (!posState.selectedVehicleId) {
        errorEl.textContent = 'Please select a vehicle or add a new one';
        errorEl.style.display = 'block';
        return;
      }
      
      posSetLoading('pos-vehicle-btn', true);
      
      try {
        const resp = await fetch(`/api/pos/session/${posState.sessionId}/vehicle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicle_id: posState.selectedVehicleId,
            new_vehicle: posState.isNewVehicle ? posState.newVehicle : null
          })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed to set vehicle');
        
        if (data.vehicle_id) posState.selectedVehicleId = data.vehicle_id;
        posSetLoading('pos-vehicle-btn', false, 'Continue →');
        posGoToStep(4);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        posSetLoading('pos-vehicle-btn', false, 'Continue →');
      }
    }

    async function posAddService() {
      const errorEl = document.getElementById('pos-service-error');
      errorEl.style.display = 'none';
      
      const category = document.getElementById('pos-service-category').value;
      const description = document.getElementById('pos-service-description').value.trim();
      const laborPrice = parseFloat(document.getElementById('pos-labor-price').value) || 0;
      const partsPrice = parseFloat(document.getElementById('pos-parts-price').value) || 0;
      const notes = document.getElementById('pos-service-notes').value.trim();
      
      if (!category) {
        errorEl.textContent = 'Please select a service category';
        errorEl.style.display = 'block';
        return;
      }
      if (!description) {
        errorEl.textContent = 'Please enter a service description';
        errorEl.style.display = 'block';
        return;
      }
      if (laborPrice <= 0 && partsPrice <= 0) {
        errorEl.textContent = 'Please enter labor or parts price';
        errorEl.style.display = 'block';
        return;
      }
      
      posState.service = { category, description, laborPrice, partsPrice, notes };
      
      const inspectionData = posCollectInspectionData();
      posState.inspection = inspectionData;
      
      posSetLoading('pos-service-btn', true);
      
      try {
        const resp = await fetch(`/api/pos/session/${posState.sessionId}/service`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category,
            description,
            labor_price: laborPrice,
            parts_price: partsPrice,
            notes
          })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed to add service');
        
        if (inspectionData) {
          await posSaveInspection(inspectionData);
        }
        
        posPopulateAuthorizationStep();
        posGoToStep(5);
        posSetLoading('pos-service-btn', false, 'Continue to Authorization →');
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        posSetLoading('pos-service-btn', false, 'Continue to Authorization →');
      }
    }
    
    let posSignaturePad = null;
    
    function posPopulateAuthorizationStep() {
      const vehicle = posState.vehicles.find(v => v.id === posState.selectedVehicleId) || posState.newVehicle;
      const vehicleStr = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : 'N/A';
      const total = (posState.service.laborPrice || 0) + (posState.service.partsPrice || 0);
      
      document.getElementById('pos-auth-customer').textContent = posState.customerName || posState.phone;
      document.getElementById('pos-auth-vehicle').textContent = vehicleStr;
      document.getElementById('pos-auth-service').textContent = `${posState.service.category} - ${posState.service.description}`;
      document.getElementById('pos-auth-cost').textContent = '$' + total.toFixed(2);
      
      document.getElementById('pos-signer-name').value = posState.customerName || '';
      
      posInitSignaturePad();
    }
    
    function posInitSignaturePad() {
      const canvas = document.getElementById('pos-signature-canvas');
      if (!canvas) return;
      
      const container = canvas.parentElement;
      canvas.width = container.offsetWidth - 8;
      canvas.height = 200;
      
      if (posSignaturePad) {
        posSignaturePad.clear();
      } else {
        posSignaturePad = new SignaturePad(canvas, {
          backgroundColor: 'rgb(255, 255, 255)',
          penColor: 'rgb(0, 0, 0)',
          minWidth: 1,
          maxWidth: 3
        });
      }
      
      posSignaturePad.addEventListener('endStroke', () => {
        const container = document.getElementById('pos-signature-container');
        if (!posSignaturePad.isEmpty()) {
          container.classList.add('has-signature');
        }
      });
    }
    
    function posClearSignature() {
      if (posSignaturePad) {
        posSignaturePad.clear();
        document.getElementById('pos-signature-container').classList.remove('has-signature');
      }
    }
    
    async function posSubmitAuthorization() {
      const errorEl = document.getElementById('pos-auth-error');
      errorEl.style.display = 'none';
      
      const signerName = document.getElementById('pos-signer-name').value.trim();
      
      if (!signerName) {
        errorEl.textContent = 'Please enter the signer name';
        errorEl.style.display = 'block';
        return;
      }
      
      if (!posSignaturePad || posSignaturePad.isEmpty()) {
        errorEl.textContent = 'Please provide a signature';
        errorEl.style.display = 'block';
        return;
      }
      
      posSetLoading('pos-auth-btn', true);
      
      try {
        const signatureData = posSignaturePad.toDataURL('image/png');
        const waiverText = document.getElementById('pos-waiver-text').textContent;
        const total = (posState.service.laborPrice || 0) + (posState.service.partsPrice || 0);
        const vehicle = posState.vehicles.find(v => v.id === posState.selectedVehicleId) || posState.newVehicle;
        const vehicleStr = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : 'N/A';
        
        const resp = await fetch(`/api/pos/session/${posState.sessionId}/authorize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signature_data: signatureData,
            signer_name: signerName,
            waiver_text: waiverText,
            authorized_services: `${posState.service.category} - ${posState.service.description}`,
            estimated_cost: total,
            authorization_type: 'combined'
          })
        });
        
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed to save authorization');
        
        posState.authorizationId = data.authorization_id;
        posState.signerName = signerName;
        
        await posInitiateCheckout();
        posSetLoading('pos-auth-btn', false, '✍️ Sign and Authorize');
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        posSetLoading('pos-auth-btn', false, '✍️ Sign and Authorize');
      }
    }

    async function posInitiateCheckout() {
      if (!posState.authorizationId) {
        showToast('Customer authorization signature is required before proceeding to payment', 'error');
        return;
      }
      
      try {
        const resp = await fetch(`/api/pos/session/${posState.sessionId}/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Checkout failed');
        
        posState.paymentIntentClientSecret = data.clientSecret;
        posState.vipMember = data.vipMember;
        posState.vipMessage = data.vipMessage;
        
        const vehicle = posState.vehicles.find(v => v.id === posState.selectedVehicleId) || posState.newVehicle;
        const vehicleStr = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : 'N/A';
        
        document.getElementById('pos-summary-customer').textContent = posState.customerName || posState.phone;
        document.getElementById('pos-summary-vehicle').textContent = vehicleStr;
        document.getElementById('pos-summary-service').textContent = `${posState.service.category} - ${posState.service.description}`;
        document.getElementById('pos-summary-labor').textContent = '$' + posState.service.laborPrice.toFixed(2);
        document.getElementById('pos-summary-parts').textContent = '$' + posState.service.partsPrice.toFixed(2);
        const total = posState.service.laborPrice + posState.service.partsPrice;
        document.getElementById('pos-summary-total').textContent = '$' + total.toFixed(2);
        
        // Show VIP badge for platform fee exempt members
        const vipBadgeEl = document.getElementById('pos-vip-badge');
        if (vipBadgeEl) {
          if (data.vipMember && data.vipMessage) {
            vipBadgeEl.innerHTML = `
              <div style="display:flex;align-items:center;gap:8px;padding:12px;background:linear-gradient(135deg,rgba(201,162,39,0.15),rgba(201,162,39,0.05));border:1px solid rgba(201,162,39,0.3);border-radius:8px;color:#c9a227;">
                <span style="font-size:1.2rem;">👑</span>
                <span style="font-weight:600;">${data.vipMessage}</span>
              </div>
            `;
            vipBadgeEl.style.display = 'block';
          } else {
            vipBadgeEl.style.display = 'none';
          }
        }
        
        if (posState.signerName) {
          document.getElementById('pos-auth-signer').textContent = posState.signerName;
        }
        
        posInitStripeElements();
        posGoToStep(6);
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    function posInitStripeElements() {
      if (typeof Stripe === 'undefined') {
        document.getElementById('pos-stripe-element').innerHTML = '<p style="color:var(--accent-red);">Stripe not loaded. Please refresh the page.</p>';
        return;
      }
      
      const stripeKey = window.STRIPE_PUBLIC_KEY || 'pk_live_51Sa0fg0V5HwfygbhAapjgXWedMWajevRvx0DNz26w21kVEMCM7zvldoRytCaKy2vArn3duePaywnaQ32V620qK71ze0VbG9NvSH';
      const stripe = Stripe(stripeKey);
      const elements = stripe.elements({
        clientSecret: posState.paymentIntentClientSecret,
        appearance: {
          theme: 'night',
          variables: {
            colorPrimary: '#c9a227',
            colorBackground: '#1a1a24',
            colorText: '#f0f0f5',
            colorDanger: '#ef5f5f',
            fontFamily: 'Inter, sans-serif',
            borderRadius: '8px'
          }
        }
      });
      
      const paymentElement = elements.create('payment');
      paymentElement.mount('#pos-stripe-element');
      
      posState.stripeElements = elements;
      posState.cardElement = paymentElement;
    }

    async function posProcessPayment() {
      const payBtn = document.getElementById('pos-pay-btn');
      const errorEl = document.getElementById('pos-payment-error');
      errorEl.style.display = 'none';
      
      payBtn.disabled = true;
      payBtn.innerHTML = '⏳ Processing...';
      
      try {
        if (!posState.stripeElements) throw new Error('Payment not initialized');
        
        const stripeKey = window.STRIPE_PUBLIC_KEY || 'pk_live_51Sa0fg0V5HwfygbhAapjgXWedMWajevRvx0DNz26w21kVEMCM7zvldoRytCaKy2vArn3duePaywnaQ32V620qK71ze0VbG9NvSH';
        const stripe = Stripe(stripeKey);
        
        const { error, paymentIntent } = await stripe.confirmPayment({
          elements: posState.stripeElements,
          confirmParams: {
            return_url: window.location.href
          },
          redirect: 'if_required'
        });
        
        if (error) throw new Error(error.message);
        
        if (paymentIntent && paymentIntent.status === 'succeeded') {
          await posConfirmSession(paymentIntent.id);
        }
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        payBtn.disabled = false;
        payBtn.innerHTML = '💳 Process Payment';
      }
    }

    async function posConfirmSession(paymentIntentId) {
      try {
        let confirmUrl = `/api/pos/session/${posState.sessionId}/confirm`;
        
        if (posState.isMarketplaceJob) {
          confirmUrl = `/api/pos/session/${posState.sessionId}/marketplace-confirm`;
        }
        
        const resp = await fetch(confirmUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment_intent_id: paymentIntentId })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Confirmation failed');
        
        let total = 0;
        let vehicleStr = 'N/A';
        
        if (posState.isMarketplaceJob) {
          total = (posState.totalCents || 0) / 100;
          const selectedJob = posState.marketplaceJobs?.find(j => j.bidId === posState.selectedBidId);
          vehicleStr = selectedJob?.vehicleName || 'Marketplace Vehicle';
          document.getElementById('pos-success-title').textContent = 'Marketplace Job Started!';
          document.getElementById('pos-success-message').textContent = 'Payment received. The escrow is funded and work can begin.';
        } else {
          total = posState.service ? (posState.service.laborPrice + posState.service.partsPrice) : 0;
          const vehicle = posState.vehicles.find(v => v.id === posState.selectedVehicleId) || posState.newVehicle;
          vehicleStr = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : 'N/A';
          document.getElementById('pos-success-title').textContent = 'Payment Successful!';
          document.getElementById('pos-success-message').textContent = 'The transaction has been completed successfully.';
        }
        
        document.getElementById('pos-success-txn').textContent = paymentIntentId.slice(-12);
        document.getElementById('pos-success-amount').textContent = '$' + total.toFixed(2);
        document.getElementById('pos-success-customer').textContent = posState.customerName || 'Walk-In Customer';
        document.getElementById('pos-success-vehicle').textContent = vehicleStr;
        
        if (posState.signerName) {
          document.getElementById('pos-success-signer').textContent = posState.signerName;
        } else {
          document.getElementById('pos-success-auth-row').style.display = 'none';
        }
        
        document.querySelectorAll('.pos-step-content').forEach(el => el.classList.remove('active'));
        document.getElementById('pos-step-success').style.display = 'block';
        
        document.querySelectorAll('.pos-step').forEach(el => el.classList.add('completed'));
        document.querySelectorAll('.pos-step .pos-step-circle').forEach(c => c.textContent = '✓');
        
        const fillEl = document.getElementById('pos-stepper-fill');
        if (fillEl) fillEl.style.width = 'calc(100% - 120px)';
        
        posUpdateReceiptDisplays();
        posResetReceiptUI();
        
        posPlaySuccessSound();
        posCreateConfetti();
        
        showToast('Payment successful!', 'success');
        posLoadHistory();
      } catch (err) {
        document.getElementById('pos-payment-error').textContent = err.message;
        document.getElementById('pos-payment-error').style.display = 'block';
      }
    }

    function posStartNewSession() {
      posResetState();
      document.getElementById('pos-step-success').style.display = 'none';
      document.getElementById('pos-phone').value = '';
      document.getElementById('pos-otp-input').value = '';
      document.getElementById('pos-customer-name').value = '';
      document.getElementById('pos-customer-email').value = '';
      document.getElementById('pos-vehicle-year').value = '';
      document.getElementById('pos-vehicle-make').value = '';
      document.getElementById('pos-vehicle-model').value = '';
      document.getElementById('pos-vehicle-color').value = '';
      document.getElementById('pos-vehicle-plate').value = '';
      document.getElementById('pos-vehicle-vin').value = '';
      document.getElementById('pos-service-category').value = '';
      document.getElementById('pos-service-description').value = '';
      document.getElementById('pos-labor-price').value = '';
      document.getElementById('pos-parts-price').value = '';
      document.getElementById('pos-service-notes').value = '';
      document.getElementById('pos-new-vehicle-form').style.display = 'none';
      document.getElementById('pos-existing-vehicles').innerHTML = '';
      document.getElementById('pos-customer-info-section').style.display = 'none';
      document.getElementById('pos-existing-customer-section').style.display = 'none';
      document.querySelectorAll('.pos-quick-btn').forEach(btn => btn.style.borderColor = '');
      const fillEl = document.getElementById('pos-stepper-fill');
      if (fillEl) fillEl.style.width = '0%';
      document.getElementById('pos-reminder-type').value = '';
      document.getElementById('pos-reminder-date').value = '';
      document.getElementById('pos-reminder-notes').value = '';
      document.getElementById('pos-reminder-status').style.display = 'none';
      document.getElementById('pos-reminders-list').style.display = 'none';
      document.getElementById('pos-reminders-list').innerHTML = '';
      posGoToStep(1);
    }

    function posSetReminderQuick(months) {
      const date = new Date();
      date.setMonth(date.getMonth() + months);
      const dateStr = date.toISOString().split('T')[0];
      document.getElementById('pos-reminder-date').value = dateStr;
    }

    async function posAddMaintenanceReminder() {
      const reminderType = document.getElementById('pos-reminder-type').value;
      const reminderDate = document.getElementById('pos-reminder-date').value;
      const notes = document.getElementById('pos-reminder-notes').value;
      const statusEl = document.getElementById('pos-reminder-status');
      const btn = document.getElementById('pos-add-reminder-btn');
      
      if (!reminderType) {
        statusEl.innerHTML = '⚠️ Please select a reminder type';
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(239,95,95,0.15)';
        statusEl.style.color = 'var(--accent-red)';
        return;
      }
      
      if (!reminderDate) {
        statusEl.innerHTML = '⚠️ Please select a reminder date';
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(239,95,95,0.15)';
        statusEl.style.color = 'var(--accent-red)';
        return;
      }
      
      btn.disabled = true;
      btn.innerHTML = '⏳ Adding...';
      
      try {
        const vehicle = posState.vehicles.find(v => v.id === posState.selectedVehicleId) || posState.newVehicle;
        const vehicleInfo = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : null;
        
        const response = await fetch('/api/maintenance-reminders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: posState.sessionId || null,
            reminderType: reminderType,
            reminderDate: reminderDate,
            notes: notes || null,
            memberId: posState.memberId || null,
            vehicleId: posState.selectedVehicleId || null,
            providerId: currentUser?.id || null,
            customerEmail: posState.customerEmail || null,
            customerPhone: posState.customerPhone || null,
            customerName: posState.customerName || null,
            providerName: currentUser?.business_name || currentUser?.email || null,
            vehicleInfo: vehicleInfo
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          statusEl.innerHTML = `✅ Reminder set for ${new Date(reminderDate).toLocaleDateString()} - ${reminderType}`;
          statusEl.style.display = 'block';
          statusEl.style.background = 'rgba(74,200,140,0.15)';
          statusEl.style.color = 'var(--accent-green)';
          
          const listEl = document.getElementById('pos-reminders-list');
          listEl.style.display = 'block';
          listEl.innerHTML += `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg-elevated);border-radius:var(--radius-sm);margin-top:8px;">
              <span>🔔 ${reminderType}</span>
              <span style="color:var(--text-muted);font-size:0.85rem;">${new Date(reminderDate).toLocaleDateString()}</span>
            </div>
          `;
          
          document.getElementById('pos-reminder-type').value = '';
          document.getElementById('pos-reminder-date').value = '';
          document.getElementById('pos-reminder-notes').value = '';
          
          showToast('Maintenance reminder added!', 'success');
        } else if (result.warning) {
          statusEl.innerHTML = `⚠️ ${result.warning}`;
          statusEl.style.display = 'block';
          statusEl.style.background = 'rgba(245,158,11,0.15)';
          statusEl.style.color = 'var(--accent-orange)';
        } else {
          throw new Error(result.error || 'Failed to add reminder');
        }
      } catch (err) {
        console.error('Error adding maintenance reminder:', err);
        statusEl.innerHTML = `❌ ${err.message}`;
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(239,95,95,0.15)';
        statusEl.style.color = 'var(--accent-red)';
      } finally {
        btn.disabled = false;
        btn.innerHTML = '🔔 Add Reminder';
      }
    }

    async function posLoadHistory() {
      const container = document.getElementById('pos-history-list');
      
      try {
        const { data, error } = await supabaseClient
          .from('pos_sessions')
          .select('*')
          .eq('provider_id', currentUser.id)
          .order('created_at', { ascending: false })
          .limit(20);
        
        if (error) throw error;
        
        if (!data || data.length === 0) {
          container.innerHTML = '<div class="empty-state" style="padding:32px;"><div class="empty-state-icon">🛒</div><p>No walk-in transactions yet. Start your first transaction above!</p></div>';
          return;
        }
        
        container.innerHTML = data.map(s => `
          <div class="pos-history-card">
            <div class="pos-history-info">
              <div class="pos-history-customer">${s.customer_name || 'Customer'}</div>
              <div class="pos-history-vehicle">${s.vehicle_info || 'N/A'}</div>
              <div class="pos-history-date">${new Date(s.created_at).toLocaleDateString()} ${new Date(s.created_at).toLocaleTimeString()}</div>
            </div>
            <div style="text-align:right;">
              <div class="pos-history-amount">$${(s.total_amount || 0).toFixed(2)}</div>
              <span class="pos-status-badge ${s.status}">${s.status}</span>
            </div>
          </div>
        `).join('');
      } catch (err) {
        console.error('Error loading POS history:', err);
        container.innerHTML = '<div style="padding:20px;color:var(--text-muted);text-align:center;">Failed to load history</div>';
      }
    }

    document.querySelector('.nav-item[data-section="walkin-pos"]')?.addEventListener('click', () => {
      posLoadHistory();
    });

    // Customer Queue Functions
    let queueRefreshInterval = null;
    
    function getKioskUrl() {
      return `${window.location.origin}/check-in.html?provider=${currentUser?.id || ''}`;
    }
    
    function updateKioskUrlDisplay() {
      const urlDisplay = document.getElementById('kiosk-url-display');
      if (urlDisplay && currentUser) {
        urlDisplay.textContent = getKioskUrl();
      }
    }
    
    async function loadCustomerQueue() {
      const container = document.getElementById('customer-queue-list');
      if (!container || !currentUser) return;
      
      try {
        const response = await fetch(`/api/checkin/queue/${currentUser.id}`);
        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'Failed to load queue');
        }
        
        const queue = result.queue || [];
        const stats = result.stats || { waiting: 0, serving: 0, completed: 0 };
        
        document.getElementById('queue-waiting-count').textContent = stats.waiting;
        document.getElementById('queue-serving-count').textContent = stats.serving;
        document.getElementById('queue-completed-count').textContent = stats.completed;
        
        const badge = document.getElementById('queue-count');
        if (badge) {
          if (stats.waiting > 0) {
            badge.textContent = stats.waiting;
            badge.style.display = 'inline-block';
          } else {
            badge.style.display = 'none';
          }
        }
        
        if (!queue || queue.length === 0) {
          container.innerHTML = `
            <div class="empty-state" style="padding:48px 24px;">
              <div class="empty-state-icon">📋</div>
              <p>No customers in queue. Set up the tablet kiosk to let customers check themselves in.</p>
            </div>`;
          return;
        }
        
        container.innerHTML = queue.map((item, index) => {
          const checkInTime = new Date(item.created_at);
          const waitMinutes = Math.floor((Date.now() - checkInTime.getTime()) / 60000);
          const statusClass = item.status === 'serving' ? 'accent-blue' : 'accent-orange';
          const statusBg = item.status === 'serving' ? 'var(--accent-blue-soft)' : 'rgba(245,158,11,0.15)';
          
          return `
            <div class="package-card" style="border-left:4px solid var(--${statusClass});margin-bottom:16px;">
              <div class="package-header">
                <div>
                  <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
                    <span style="background:var(--${statusClass});color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.9rem;">#${index + 1}</span>
                    <div>
                      <div class="package-title">${item.customer_name || 'Customer'}</div>
                      <div class="package-vehicle">${item.customer_phone || 'No phone'}</div>
                    </div>
                  </div>
                </div>
                <span class="package-badge" style="background:${statusBg};color:var(--${statusClass});text-transform:capitalize;">${item.status}</span>
              </div>
              <div class="package-meta">
                <span>🚗 ${item.vehicle_year || ''} ${item.vehicle_make || ''} ${item.vehicle_model || 'No vehicle info'}</span>
                <span>🔧 ${item.service_category || 'General Service'}</span>
              </div>
              ${item.service_description ? `<div class="package-description" style="margin-bottom:12px;">${item.service_description}</div>` : ''}
              <div class="package-footer" style="flex-wrap:wrap;gap:12px;">
                <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
                  <span style="font-size:0.85rem;color:var(--text-muted);">⏰ Checked in ${waitMinutes} min ago</span>
                  <span style="font-size:0.85rem;color:var(--text-muted);">📅 ${checkInTime.toLocaleTimeString()}</span>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                  ${item.status === 'waiting' ? `<button class="btn btn-primary btn-sm" onclick="callQueueCustomer('${item.id}')">📞 Call Customer</button>` : ''}
                  ${item.status === 'serving' ? `<button class="btn btn-sm" onclick="completeQueueCustomer('${item.id}')" style="background:var(--accent-green);color:#fff;">✓ Mark Complete</button>` : ''}
                  <button class="btn btn-ghost btn-sm" onclick="cancelQueueCustomer('${item.id}')" style="color:var(--accent-red);">✕ Cancel</button>
                </div>
              </div>
            </div>`;
        }).join('');
        
      } catch (err) {
        console.error('Error loading queue:', err);
        container.innerHTML = `
          <div class="empty-state" style="padding:32px;">
            <div class="empty-state-icon">⚠️</div>
            <p>Failed to load queue. Please try again.</p>
            <button class="btn btn-secondary" onclick="loadCustomerQueue()" style="margin-top:16px;">🔄 Retry</button>
          </div>`;
      }
    }
    
    async function callQueueCustomer(queueId) {
      try {
        const response = await fetch(`/api/checkin/queue/${queueId}/call`, { method: 'POST' });
        const result = await response.json();
        
        if (!response.ok) throw new Error(result.error || 'Failed to call customer');
        
        showToast('Customer marked as being served!', 'success');
        loadCustomerQueue();
      } catch (err) {
        console.error('Error calling customer:', err);
        showToast('Failed to update status: ' + err.message, 'error');
      }
    }
    
    async function completeQueueCustomer(queueId) {
      try {
        const response = await fetch(`/api/checkin/queue/${queueId}/complete`, { method: 'POST' });
        const result = await response.json();
        
        if (!response.ok) throw new Error(result.error || 'Failed to complete');
        
        showToast('Customer marked as complete!', 'success');
        loadCustomerQueue();
      } catch (err) {
        console.error('Error completing customer:', err);
        showToast('Failed to complete: ' + err.message, 'error');
      }
    }
    
    async function cancelQueueCustomer(queueId) {
      if (!confirm('Remove this customer from the queue?')) return;
      
      try {
        const response = await fetch(`/api/checkin/queue/${queueId}`, { method: 'DELETE' });
        const result = await response.json();
        
        if (!response.ok) throw new Error(result.error || 'Failed to cancel');
        
        showToast('Customer removed from queue', 'success');
        loadCustomerQueue();
      } catch (err) {
        console.error('Error canceling customer:', err);
        showToast('Failed to remove: ' + err.message, 'error');
      }
    }
    
    function copyKioskLink() {
      const url = getKioskUrl();
      navigator.clipboard.writeText(url).then(() => {
        showToast('Kiosk link copied to clipboard!', 'success');
      }).catch(err => {
        console.error('Failed to copy:', err);
        showToast('Failed to copy link', 'error');
      });
    }
    
    function showKioskQR() {
      const modal = document.getElementById('qr-modal');
      const container = document.getElementById('qr-code-container');
      
      if (modal && container) {
        container.innerHTML = '';
        
        if (typeof QrCreator !== 'undefined') {
          QrCreator.render({
            text: getKioskUrl(),
            radius: 0.5,
            ecLevel: 'H',
            fill: '#0a0a0f',
            background: '#ffffff',
            size: 200
          }, container);
        } else {
          container.innerHTML = '<p style="color:#333;padding:20px;">QR library not loaded</p>';
        }
        
        modal.classList.add('active');
      }
    }
    
    function closeQRModal() {
      const modal = document.getElementById('qr-modal');
      if (modal) modal.classList.remove('active');
    }
    
    document.querySelector('.nav-item[data-section="customer-queue"]')?.addEventListener('click', () => {
      updateKioskUrlDisplay();
      loadCustomerQueue();
      
      if (queueRefreshInterval) clearInterval(queueRefreshInterval);
      queueRefreshInterval = setInterval(() => {
        const section = document.getElementById('customer-queue');
        if (section && section.classList.contains('active')) {
          loadCustomerQueue();
        } else {
          clearInterval(queueRefreshInterval);
          queueRefreshInterval = null;
        }
      }, 15000);
    });

    // Load 2FA status when profile section is shown
    document.querySelector('.nav-item[data-section="profile"]')?.addEventListener('click', () => {
      load2FAStatus();
    });

    // ========== 2FA FUNCTIONS ==========
    let pending2FAPhone = '';

    async function load2FAStatus() {
      if (!currentUser) return;
      
      const loadingEl = document.getElementById('2fa-loading');
      const contentEl = document.getElementById('2fa-content');
      
      if (loadingEl) loadingEl.style.display = 'block';
      if (contentEl) contentEl.style.display = 'none';
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          update2FADisplay(false, null);
          return;
        }
        
        const response = await fetch('/api/2fa/status', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });
        const data = await response.json();
        
        update2FADisplay(data.enabled, data.phone);
      } catch (error) {
        console.error('Error loading 2FA status:', error);
        update2FADisplay(false, null);
      } finally {
        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';
      }
    }

    function update2FADisplay(enabled, maskedPhone) {
      const statusIcon = document.getElementById('2fa-status-icon');
      const statusText = document.getElementById('2fa-status-text');
      const statusDesc = document.getElementById('2fa-status-desc');
      const statusBadge = document.getElementById('2fa-status-badge');
      const enableSection = document.getElementById('2fa-enable-section');
      const disableSection = document.getElementById('2fa-disable-section');
      const maskedPhoneEl = document.getElementById('2fa-masked-phone');
      
      if (enabled) {
        if (statusIcon) statusIcon.textContent = '🔒';
        if (statusText) statusText.textContent = '2FA is Enabled';
        if (statusDesc) statusDesc.textContent = 'Your account is protected with two-factor authentication.';
        if (statusBadge) {
          statusBadge.textContent = 'Enabled';
          statusBadge.style.background = 'var(--accent-green-soft)';
          statusBadge.style.color = 'var(--accent-green)';
        }
        if (enableSection) enableSection.style.display = 'none';
        if (disableSection) disableSection.style.display = 'block';
        if (maskedPhoneEl) maskedPhoneEl.textContent = maskedPhone || '***-***-****';
      } else {
        if (statusIcon) statusIcon.textContent = '🔓';
        if (statusText) statusText.textContent = '2FA is Disabled';
        if (statusDesc) statusDesc.textContent = 'Your account is protected by password only.';
        if (statusBadge) {
          statusBadge.textContent = 'Disabled';
          statusBadge.style.background = 'rgba(239,95,95,0.15)';
          statusBadge.style.color = 'var(--accent-red)';
        }
        if (enableSection) enableSection.style.display = 'block';
        if (disableSection) disableSection.style.display = 'none';
      }
    }

    function format2FAPhoneInput(input) {
      let value = input.value.replace(/\D/g, '');
      if (value.length > 10) value = value.slice(0, 10);
      
      if (value.length >= 6) {
        input.value = `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6)}`;
      } else if (value.length >= 3) {
        input.value = `(${value.slice(0, 3)}) ${value.slice(3)}`;
      } else if (value.length > 0) {
        input.value = `(${value}`;
      }
    }

    async function initiate2FAEnable() {
      const phoneInput = document.getElementById('2fa-phone-input');
      const phone = phoneInput.value.replace(/\D/g, '');
      
      if (phone.length !== 10) {
        showToast('Please enter a valid 10-digit phone number', 'error');
        return;
      }
      
      const btn = document.getElementById('2fa-enable-btn');
      const originalText = btn.innerHTML;
      btn.innerHTML = '⏳ Sending...';
      btn.disabled = true;
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Session expired. Please log in again.', 'error');
          return;
        }
        
        const response = await fetch('/api/2fa/send-code', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ phone: phone })
        });
        
        const data = await response.json();
        
        if (data.success) {
          pending2FAPhone = phone;
          open2FAVerifyModal(phoneInput.value);
        } else {
          showToast(data.error || 'Failed to send verification code', 'error');
        }
      } catch (error) {
        console.error('Error sending 2FA code:', error);
        showToast('Failed to send verification code. Please try again.', 'error');
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }

    function open2FAVerifyModal(formattedPhone) {
      const phoneDisplay = document.getElementById('2fa-verify-phone-display');
      if (phoneDisplay) phoneDisplay.textContent = formattedPhone;
      
      // Clear all digit inputs
      for (let i = 1; i <= 6; i++) {
        const input = document.getElementById(`2fa-digit-${i}`);
        if (input) input.value = '';
      }
      
      document.getElementById('2fa-verify-error').style.display = 'none';
      document.getElementById('2fa-verify-btn').disabled = true;
      
      document.getElementById('2fa-verify-modal').classList.add('active');
      
      // Focus first input
      setTimeout(() => {
        const firstInput = document.getElementById('2fa-digit-1');
        if (firstInput) firstInput.focus();
      }, 100);
    }

    function close2FAVerifyModal() {
      document.getElementById('2fa-verify-modal').classList.remove('active');
    }

    function handle2FADigitInput(input, position) {
      const value = input.value.replace(/\D/g, '');
      input.value = value.slice(0, 1);
      
      if (value && position < 6) {
        const nextInput = document.getElementById(`2fa-digit-${position + 1}`);
        if (nextInput) nextInput.focus();
      }
      
      check2FACodeComplete();
    }

    function handle2FAKeydown(event, position) {
      if (event.key === 'Backspace' && !event.target.value && position > 1) {
        const prevInput = document.getElementById(`2fa-digit-${position - 1}`);
        if (prevInput) {
          prevInput.focus();
          prevInput.value = '';
        }
      }
    }

    function check2FACodeComplete() {
      let code = '';
      for (let i = 1; i <= 6; i++) {
        const input = document.getElementById(`2fa-digit-${i}`);
        code += input ? input.value : '';
      }
      
      const verifyBtn = document.getElementById('2fa-verify-btn');
      if (verifyBtn) {
        verifyBtn.disabled = code.length !== 6;
      }
    }

    function get2FACode() {
      let code = '';
      for (let i = 1; i <= 6; i++) {
        const input = document.getElementById(`2fa-digit-${i}`);
        code += input ? input.value : '';
      }
      return code;
    }

    async function verify2FACode() {
      const code = get2FACode();
      if (code.length !== 6) return;
      
      const btn = document.getElementById('2fa-verify-btn');
      const errorEl = document.getElementById('2fa-verify-error');
      
      btn.innerHTML = '⏳ Verifying...';
      btn.disabled = true;
      errorEl.style.display = 'none';
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          errorEl.textContent = 'Session expired. Please log in again.';
          errorEl.style.display = 'block';
          return;
        }
        
        // First verify the code
        const verifyResponse = await fetch('/api/2fa/verify-code', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ code: code })
        });
        
        const verifyData = await verifyResponse.json();
        
        if (!verifyData.success) {
          errorEl.textContent = verifyData.error || 'Invalid verification code';
          errorEl.style.display = 'block';
          btn.innerHTML = 'Verify & Enable 2FA';
          btn.disabled = false;
          return;
        }
        
        // Then enable 2FA
        const enableResponse = await fetch('/api/2fa/enable', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ phone: pending2FAPhone })
        });
        
        const enableData = await enableResponse.json();
        
        if (enableData.success) {
          close2FAVerifyModal();
          showToast('✅ Two-factor authentication enabled successfully!', 'success');
          load2FAStatus();
          document.getElementById('2fa-phone-input').value = '';
        } else {
          errorEl.textContent = enableData.error || 'Failed to enable 2FA';
          errorEl.style.display = 'block';
        }
      } catch (error) {
        console.error('Error verifying 2FA code:', error);
        errorEl.textContent = 'An error occurred. Please try again.';
        errorEl.style.display = 'block';
      } finally {
        btn.innerHTML = 'Verify & Enable 2FA';
        btn.disabled = false;
      }
    }

    async function resend2FACode() {
      const resendBtn = document.getElementById('2fa-resend-btn');
      if (!pending2FAPhone || !resendBtn) return;
      
      resendBtn.textContent = 'Sending...';
      resendBtn.disabled = true;
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Session expired. Please log in again.', 'error');
          return;
        }
        
        const response = await fetch('/api/2fa/send-code', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ phone: pending2FAPhone })
        });
        
        const data = await response.json();
        
        if (data.success) {
          showToast('Verification code resent!', 'success');
        } else {
          showToast(data.error || 'Failed to resend code', 'error');
        }
      } catch (error) {
        console.error('Error resending 2FA code:', error);
        showToast('Failed to resend code. Please try again.', 'error');
      } finally {
        resendBtn.textContent = 'Resend Code';
        resendBtn.disabled = false;
      }
    }

    function open2FADisableModal() {
      document.getElementById('2fa-disable-modal').classList.add('active');
    }

    function close2FADisableModal() {
      document.getElementById('2fa-disable-modal').classList.remove('active');
    }

    async function confirm2FADisable() {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Session expired. Please log in again.', 'error');
          return;
        }
        
        const response = await fetch('/api/2fa/disable', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({})
        });
        
        const data = await response.json();
        
        if (data.success) {
          close2FADisableModal();
          showToast('Two-factor authentication has been disabled.', 'success');
          load2FAStatus();
        } else {
          showToast(data.error || 'Failed to disable 2FA', 'error');
        }
      } catch (error) {
        console.error('Error disabling 2FA:', error);
        showToast('Failed to disable 2FA. Please try again.', 'error');
      }
    }

    // ========== TEAM MANAGEMENT ==========
    let managementTeamMembers = [];
    let teamInvitations = [];
    let currentUserTeamRole = null;

    async function loadTeamManagementData() {
      if (!providerProfile?.id) return;
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        // Fetch team members
        const teamResponse = await fetch(`/api/providers/${providerProfile.id}/team`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        
        if (teamResponse.ok) {
          const teamData = await teamResponse.json();
          managementTeamMembers = teamData.members || [];
          currentUserTeamRole = teamData.currentUserRole || null;
          
          // Show/hide team management nav based on role
          const navItem = document.querySelector('.team-management-nav');
          if (navItem) {
            navItem.style.display = (currentUserTeamRole === 'owner' || currentUserTeamRole === 'admin') ? '' : 'none';
          }
        }

        // Fetch pending invitations
        const inviteResponse = await fetch(`/api/providers/${providerProfile.id}/team/invitations`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        
        if (inviteResponse.ok) {
          const inviteData = await inviteResponse.json();
          teamInvitations = inviteData.invitations || [];
        }

        renderTeamManagement();
      } catch (error) {
        console.error('Error loading team management data:', error);
      }
    }

    function renderTeamManagement() {
      renderTeamMembersTable();
      renderPendingInvitations();
    }

    function renderTeamMembersTable() {
      const tbody = document.getElementById('team-members-tbody');
      if (!tbody) return;

      if (!managementTeamMembers.length) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" style="padding:48px;text-align:center;color:var(--text-muted);">
              <div style="font-size:48px;margin-bottom:16px;opacity:0.5;">👥</div>
              <p>No team members found</p>
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = managementTeamMembers.map(member => {
        const isCurrentUser = member.user_id === currentUser?.id;
        const isOwner = member.role === 'owner';
        const canManage = (currentUserTeamRole === 'owner' || currentUserTeamRole === 'admin') && !isOwner && !isCurrentUser;
        
        const roleBadgeStyles = {
          owner: 'background:linear-gradient(135deg,rgba(212,168,85,0.2),rgba(212,168,85,0.1));color:#d4a855;border:1px solid rgba(212,168,85,0.3);',
          admin: 'background:var(--accent-blue-soft);color:var(--accent-blue);',
          staff: 'background:rgba(107,107,122,0.15);color:var(--text-muted);'
        };

        return `
          <tr style="border-bottom:1px solid var(--border-subtle);">
            <td style="padding:16px;">
              <div style="display:flex;align-items:center;gap:12px;">
                <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--accent-gold-soft),var(--bg-elevated));display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--accent-gold);">
                  ${member.full_name ? member.full_name.charAt(0).toUpperCase() : '👤'}
                </div>
                <div>
                  <div style="font-weight:500;">${member.full_name || 'Unknown'}${isCurrentUser ? ' <span style="color:var(--text-muted);font-weight:400;">(You)</span>' : ''}</div>
                </div>
              </div>
            </td>
            <td style="padding:16px;color:var(--text-secondary);">${member.email || '-'}</td>
            <td style="padding:16px;">
              <span style="display:inline-block;padding:4px 12px;border-radius:100px;font-size:0.78rem;font-weight:500;${roleBadgeStyles[member.role] || roleBadgeStyles.staff}">
                ${member.role.charAt(0).toUpperCase() + member.role.slice(1)}
              </span>
            </td>
            <td style="padding:16px;">
              <span style="display:inline-flex;align-items:center;gap:6px;font-size:0.85rem;color:var(--accent-green);">
                <span style="width:8px;height:8px;border-radius:50%;background:var(--accent-green);"></span>
                Active
              </span>
            </td>
            <td style="padding:16px;text-align:right;">
              ${canManage ? `
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                  <select onchange="updateTeamMemberRole('${member.id}', this.value)" style="padding:6px 12px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);color:var(--text-primary);font-size:0.82rem;cursor:pointer;">
                    <option value="admin" ${member.role === 'admin' ? 'selected' : ''}>Admin</option>
                    <option value="staff" ${member.role === 'staff' ? 'selected' : ''}>Staff</option>
                  </select>
                  <button onclick="confirmRemoveTeamMember('${member.id}', '${member.full_name || member.email}')" class="btn btn-sm" style="background:rgba(239,95,95,0.1);color:var(--accent-red);border:1px solid rgba(239,95,95,0.2);">Remove</button>
                </div>
              ` : isOwner ? '<span style="font-size:0.82rem;color:var(--text-muted);">Owner</span>' : ''}
            </td>
          </tr>
        `;
      }).join('');
    }

    function renderPendingInvitations() {
      const container = document.getElementById('pending-invitations-container');
      if (!container) return;

      if (!teamInvitations.length) {
        container.innerHTML = `
          <div class="empty-state" style="padding:32px;">
            <div class="empty-state-icon">📧</div>
            <p>No pending invitations</p>
          </div>
        `;
        return;
      }

      container.innerHTML = teamInvitations.map(invite => {
        const expiryDate = new Date(invite.expires_at);
        const isExpired = expiryDate < new Date();
        const roleBadgeStyle = invite.role === 'admin' 
          ? 'background:var(--accent-blue-soft);color:var(--accent-blue);' 
          : 'background:rgba(107,107,122,0.15);color:var(--text-muted);';

        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border-subtle);">
            <div style="display:flex;align-items:center;gap:16px;">
              <div style="width:40px;height:40px;border-radius:50%;background:var(--bg-input);display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--text-muted);">📧</div>
              <div>
                <div style="font-weight:500;">${invite.email}</div>
                <div style="font-size:0.82rem;color:var(--text-muted);margin-top:2px;">
                  <span style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.72rem;${roleBadgeStyle}">${invite.role.charAt(0).toUpperCase() + invite.role.slice(1)}</span>
                  <span style="margin-left:8px;">Expires: ${isExpired ? '<span style="color:var(--accent-red);">Expired</span>' : expiryDate.toLocaleDateString()}</span>
                </div>
              </div>
            </div>
            <button onclick="cancelTeamInvitation('${invite.id}')" class="btn btn-sm btn-ghost" style="color:var(--accent-red);">Cancel</button>
          </div>
        `;
      }).join('');
    }

    function openInviteTeamModal() {
      document.getElementById('team-invite-email').value = '';
      document.getElementById('team-invite-role').value = 'staff';
      document.getElementById('team-invite-feedback').style.display = 'none';
      document.getElementById('team-invite-modal').classList.add('active');
    }

    async function submitTeamInvitation() {
      const email = document.getElementById('team-invite-email').value.trim();
      const role = document.getElementById('team-invite-role').value;
      const feedback = document.getElementById('team-invite-feedback');
      const submitBtn = document.getElementById('team-invite-submit-btn');

      if (!email) {
        feedback.textContent = 'Please enter an email address';
        feedback.style.display = 'block';
        feedback.style.background = 'rgba(239,95,95,0.15)';
        feedback.style.color = 'var(--accent-red)';
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        feedback.textContent = 'Please enter a valid email address';
        feedback.style.display = 'block';
        feedback.style.background = 'rgba(239,95,95,0.15)';
        feedback.style.color = 'var(--accent-red)';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Session expired. Please log in again.', 'error');
          return;
        }

        const response = await fetch(`/api/providers/${providerProfile.id}/team/invite`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ email, role })
        });

        const data = await response.json();

        if (response.ok && data.success) {
          feedback.textContent = '✓ Invitation sent successfully!';
          feedback.style.display = 'block';
          feedback.style.background = 'var(--accent-green-soft)';
          feedback.style.color = 'var(--accent-green)';
          
          setTimeout(() => {
            closeModal('team-invite-modal');
            loadTeamManagementData();
          }, 1500);
        } else {
          feedback.textContent = data.error || 'Failed to send invitation';
          feedback.style.display = 'block';
          feedback.style.background = 'rgba(239,95,95,0.15)';
          feedback.style.color = 'var(--accent-red)';
        }
      } catch (error) {
        console.error('Error sending team invitation:', error);
        feedback.textContent = 'An error occurred. Please try again.';
        feedback.style.display = 'block';
        feedback.style.background = 'rgba(239,95,95,0.15)';
        feedback.style.color = 'var(--accent-red)';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '📧 Send Invitation';
      }
    }

    async function updateTeamMemberRole(memberId, newRole) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Session expired. Please log in again.', 'error');
          return;
        }

        const response = await fetch(`/api/providers/${providerProfile.id}/team/${memberId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ role: newRole })
        });

        const data = await response.json();

        if (response.ok && data.success) {
          showToast('Team member role updated', 'success');
          loadTeamManagementData();
        } else {
          showToast(data.error || 'Failed to update role', 'error');
          loadTeamManagementData();
        }
      } catch (error) {
        console.error('Error updating team member role:', error);
        showToast('An error occurred. Please try again.', 'error');
      }
    }

    function confirmRemoveTeamMember(memberId, memberName) {
      if (confirm(`Are you sure you want to remove ${memberName} from the team? They will lose access to this provider account.`)) {
        removeTeamMember(memberId);
      }
    }

    async function removeTeamMember(memberId) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Session expired. Please log in again.', 'error');
          return;
        }

        const response = await fetch(`/api/providers/${providerProfile.id}/team/${memberId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });

        const data = await response.json();

        if (response.ok && data.success) {
          showToast('Team member removed', 'success');
          loadTeamManagementData();
        } else {
          showToast(data.error || 'Failed to remove team member', 'error');
        }
      } catch (error) {
        console.error('Error removing team member:', error);
        showToast('An error occurred. Please try again.', 'error');
      }
    }

    async function cancelTeamInvitation(invitationId) {
      if (!confirm('Are you sure you want to cancel this invitation?')) return;

      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Session expired. Please log in again.', 'error');
          return;
        }

        const response = await fetch(`/api/providers/${providerProfile.id}/team/invitations/${invitationId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });

        const data = await response.json();

        if (response.ok && data.success) {
          showToast('Invitation cancelled', 'success');
          loadTeamManagementData();
        } else {
          showToast(data.error || 'Failed to cancel invitation', 'error');
        }
      } catch (error) {
        console.error('Error cancelling invitation:', error);
        showToast('An error occurred. Please try again.', 'error');
      }
    }

    // ==================== PROVIDER PUSH NOTIFICATIONS ====================
    
    let providerPushSubscription = null;
    
    async function initProviderPushNotifications() {
      const notSupportedEl = document.getElementById('provider-push-not-supported');
      const contentEl = document.getElementById('provider-push-content');
      
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        if (notSupportedEl) notSupportedEl.style.display = 'block';
        if (contentEl) contentEl.style.display = 'none';
        return;
      }
      
      try {
        const registration = await navigator.serviceWorker.ready;
        providerPushSubscription = await registration.pushManager.getSubscription();
        
        updateProviderPushUI(!!providerPushSubscription);
        
        if (providerPushSubscription) {
          await loadProviderPushPreferences();
        }
      } catch (error) {
        console.error('Provider push init error:', error);
      }
    }
    
    function updateProviderPushUI(enabled) {
      const statusIcon = document.getElementById('provider-push-status-icon');
      const statusText = document.getElementById('provider-push-status-text');
      const statusDesc = document.getElementById('provider-push-status-desc');
      const statusBadge = document.getElementById('provider-push-status-badge');
      const enableSection = document.getElementById('provider-push-enable-section');
      const enabledSection = document.getElementById('provider-push-enabled-section');
      
      if (!statusIcon) return;
      
      if (enabled) {
        statusIcon.textContent = '🔔';
        statusText.textContent = 'Push Notifications Enabled';
        statusDesc.textContent = 'You\'ll receive instant alerts on this device.';
        statusBadge.textContent = 'On';
        statusBadge.style.background = 'rgba(74,200,140,0.15)';
        statusBadge.style.color = 'var(--accent-green)';
        enableSection.style.display = 'none';
        enabledSection.style.display = 'block';
      } else {
        statusIcon.textContent = '🔕';
        statusText.textContent = 'Push Notifications Disabled';
        statusDesc.textContent = 'Enable to receive instant alerts for new bid opportunities and updates.';
        statusBadge.textContent = 'Off';
        statusBadge.style.background = 'rgba(239,95,95,0.15)';
        statusBadge.style.color = 'var(--accent-red)';
        enableSection.style.display = 'block';
        enabledSection.style.display = 'none';
      }
    }
    
    async function enableProviderPushNotifications() {
      try {
        const btn = document.getElementById('provider-push-enable-btn');
        btn.disabled = true;
        btn.textContent = 'Enabling...';
        
        const permission = await Notification.requestPermission();
        
        if (permission !== 'granted') {
          showToast('Please allow notifications in your browser settings', 'error');
          btn.disabled = false;
          btn.textContent = '🔔 Enable Push Notifications';
          return;
        }
        
        const registration = await navigator.serviceWorker.ready;
        
        const vapidKey = await getProviderVapidKey();
        if (!vapidKey) {
          showToast('Push notifications not configured', 'error');
          btn.disabled = false;
          btn.textContent = '🔔 Enable Push Notifications';
          return;
        }
        
        providerPushSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8ArrayProvider(vapidKey)
        });
        
        await saveProviderPushSubscription(providerPushSubscription);
        
        updateProviderPushUI(true);
        await loadProviderPushPreferences();
        showToast('Push notifications enabled!', 'success');
        
      } catch (error) {
        console.error('Enable provider push error:', error);
        showToast('Failed to enable push notifications', 'error');
        const btn = document.getElementById('provider-push-enable-btn');
        btn.disabled = false;
        btn.textContent = '🔔 Enable Push Notifications';
      }
    }
    
    async function disableProviderPushNotifications() {
      try {
        if (providerPushSubscription) {
          await providerPushSubscription.unsubscribe();
          await removeProviderPushSubscription();
          providerPushSubscription = null;
        }
        
        updateProviderPushUI(false);
        showToast('Push notifications disabled', 'success');
        
      } catch (error) {
        console.error('Disable provider push error:', error);
        showToast('Failed to disable push notifications', 'error');
      }
    }
    
    async function getProviderVapidKey() {
      try {
        const response = await fetch('/api/push/vapid-key');
        const data = await response.json();
        return data.publicKey;
      } catch (error) {
        console.error('Failed to get VAPID key:', error);
        return null;
      }
    }
    
    async function saveProviderPushSubscription(subscription) {
      if (!currentUser) return;
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session?.access_token) return;
        
        await fetch('/api/provider/push/subscribe', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            subscription: subscription.toJSON()
          })
        });
      } catch (error) {
        console.error('Failed to save provider push subscription:', error);
      }
    }
    
    async function removeProviderPushSubscription() {
      if (!currentUser) return;
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session?.access_token) return;
        
        await fetch('/api/provider/push/unsubscribe', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({})
        });
      } catch (error) {
        console.error('Failed to remove provider push subscription:', error);
      }
    }
    
    async function loadProviderPushPreferences() {
      const bidOpportunities = document.getElementById('provider-push-bid-opportunities');
      const appointmentReminders = document.getElementById('provider-push-appointment-reminders');
      const paymentReceived = document.getElementById('provider-push-payment-received');
      const customerMessages = document.getElementById('provider-push-customer-messages');
      
      if (!bidOpportunities) return;
      
      try {
        const response = await fetch(`/api/provider/${currentUser.id}/notification-preferences`);
        const data = await response.json();
        const prefs = data.preferences || {};
        
        bidOpportunities.checked = prefs.push_bid_opportunities !== false;
        appointmentReminders.checked = prefs.push_appointment_reminders !== false;
        paymentReceived.checked = prefs.push_payment_received !== false;
        customerMessages.checked = prefs.push_customer_messages !== false;
        
        [bidOpportunities, appointmentReminders, paymentReceived, customerMessages].forEach(el => {
          el.addEventListener('change', saveProviderPushPreferences);
        });
        
      } catch (error) {
        console.error('Failed to load provider push preferences:', error);
      }
    }
    
    async function saveProviderPushPreferences() {
      if (!currentUser) return;
      
      const preferences = {
        push_bid_opportunities: document.getElementById('provider-push-bid-opportunities')?.checked ?? true,
        push_appointment_reminders: document.getElementById('provider-push-appointment-reminders')?.checked ?? true,
        push_payment_received: document.getElementById('provider-push-payment-received')?.checked ?? true,
        push_customer_messages: document.getElementById('provider-push-customer-messages')?.checked ?? true
      };
      
      try {
        await fetch(`/api/provider/${currentUser.id}/notification-preferences`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(preferences)
        });
      } catch (error) {
        console.error('Failed to save provider push preferences:', error);
      }
    }
    
    function urlBase64ToUint8ArrayProvider(base64String) {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    }
