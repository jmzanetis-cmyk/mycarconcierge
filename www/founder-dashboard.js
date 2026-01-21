    let currentUser = null;
    let founderProfile = null;

    async function init() {
      currentUser = await getCurrentUser();
      
      if (!currentUser) {
        window.location.href = 'login.html?redirect=founder-dashboard';
        return;
      }

      const { data: profile, error } = await supabaseClient
        .from('member_founder_profiles')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('status', 'active')
        .single();

      if (error || !profile) {
        document.getElementById('loading-overlay').style.display = 'none';
        document.getElementById('not-founder-message').style.display = 'block';
        return;
      }

      founderProfile = profile;
      
      document.getElementById('founder-name').textContent = profile.full_name || 'Founder';
      document.getElementById('referral-code').textContent = profile.referral_code || '----';
      
      generateQRCode();
      
      document.getElementById('stat-provider-referrals').textContent = profile.total_provider_referrals || 0;
      document.getElementById('stat-member-referrals').textContent = profile.total_member_referrals || 0;
      document.getElementById('stat-total-earnings').textContent = formatCurrency(profile.total_commissions_earned || 0);
      document.getElementById('stat-pending-balance').textContent = formatCurrency(profile.pending_balance || 0);
      
      const nextPayout = calculateNextPayoutDate(profile.pending_balance || 0);
      document.getElementById('stat-next-payout').textContent = nextPayout;

      document.getElementById('payout-method').value = profile.payout_method || 'stripe_connect';
      document.getElementById('payout-email').value = profile.payout_email || '';
      updatePayoutLabel();
      
      handleStripeCallback();

      document.getElementById('leaderboard-optin-checkbox').checked = profile.show_on_leaderboard || false;

      renderTierProgress();

      await Promise.all([
        loadReferrals(),
        loadCommissions(),
        loadPayouts(),
        loadActivityFeed(),
        loadLeaderboard()
      ]);

      document.getElementById('loading-overlay').style.display = 'none';
      document.getElementById('main-content').style.display = 'block';
    }

    function formatCurrency(amount) {
      return '$' + parseFloat(amount).toFixed(2);
    }

    function formatDate(dateStr) {
      if (!dateStr) return '--';
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function formatRelativeTime(dateStr) {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now - date;
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHr = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHr / 24);
      const diffWeek = Math.floor(diffDay / 7);
      const diffMonth = Math.floor(diffDay / 30);

      if (diffSec < 60) return 'Just now';
      if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
      if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
      if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
      if (diffWeek < 4) return `${diffWeek} week${diffWeek === 1 ? '' : 's'} ago`;
      if (diffMonth < 12) return `${diffMonth} month${diffMonth === 1 ? '' : 's'} ago`;
      return formatDate(dateStr);
    }

    function calculateTier(totalReferrals) {
      const tiers = [
        { name: 'Bronze', icon: '🥉', minReferrals: 0, maxReferrals: 9, bidPack: 50, cssClass: 'bronze' },
        { name: 'Silver', icon: '🥈', minReferrals: 10, maxReferrals: 24, bidPack: 50, cssClass: 'silver' },
        { name: 'Gold', icon: '🥇', minReferrals: 25, maxReferrals: 49, bidPack: 50, cssClass: 'gold' },
        { name: 'Platinum', icon: '💎', minReferrals: 50, maxReferrals: Infinity, bidPack: 50, cssClass: 'platinum' }
      ];

      let currentTier = tiers[0];
      let nextTier = tiers[1];

      for (let i = 0; i < tiers.length; i++) {
        if (totalReferrals >= tiers[i].minReferrals && totalReferrals <= tiers[i].maxReferrals) {
          currentTier = tiers[i];
          nextTier = tiers[i + 1] || null;
          break;
        }
      }

      const progressStart = currentTier.minReferrals;
      const progressEnd = nextTier ? nextTier.minReferrals : currentTier.minReferrals;
      const progressRange = progressEnd - progressStart;
      const progressCurrent = totalReferrals - progressStart;
      const progressPercent = progressRange > 0 ? Math.min((progressCurrent / progressRange) * 100, 100) : 100;

      const referralsToNext = nextTier ? nextTier.minReferrals - totalReferrals : 0;

      return {
        current: currentTier,
        next: nextTier,
        progressPercent,
        referralsToNext,
        totalReferrals
      };
    }

    function renderTierProgress() {
      if (!founderProfile) return;

      const totalReferrals = (founderProfile.total_provider_referrals || 0) + (founderProfile.total_member_referrals || 0);
      const tierInfo = calculateTier(totalReferrals);

      const tierBadge = document.getElementById('tier-badge');
      tierBadge.className = `tier-badge ${tierInfo.current.cssClass}`;
      tierBadge.textContent = `${tierInfo.current.icon} ${tierInfo.current.name}`;

      const progressFill = document.getElementById('tier-progress-fill');
      progressFill.className = `tier-progress-fill ${tierInfo.current.cssClass}`;
      progressFill.style.width = `${tierInfo.progressPercent}%`;

      document.getElementById('tier-progress-current').textContent = `${totalReferrals} referral${totalReferrals === 1 ? '' : 's'}`;

      if (tierInfo.next) {
        document.getElementById('tier-progress-next').textContent = `Next tier: ${tierInfo.next.minReferrals} referrals`;
        document.getElementById('tier-next-info').innerHTML = `Get <strong>${tierInfo.referralsToNext} more referral${tierInfo.referralsToNext === 1 ? '' : 's'}</strong> to unlock ${tierInfo.next.name} tier status!`;
        document.getElementById('tier-next-info').style.display = 'block';
      } else {
        document.getElementById('tier-progress-next').textContent = 'Max tier reached!';
        document.getElementById('tier-next-info').innerHTML = `🎉 Congratulations! You've reached the highest tier - Platinum Founder status!`;
      }

      document.getElementById('tier-rate-bidpack').textContent = `${tierInfo.current.bidPack}%`;
    }

    async function loadActivityFeed() {
      const [referralsResult, commissionsResult] = await Promise.all([
        supabaseClient
          .from('founder_referrals')
          .select('*')
          .eq('founder_id', founderProfile.id)
          .order('created_at', { ascending: false })
          .limit(10),
        supabaseClient
          .from('founder_commissions')
          .select('*')
          .eq('founder_id', founderProfile.id)
          .order('created_at', { ascending: false })
          .limit(10)
      ]);

      const referrals = referralsResult.data || [];
      const commissions = commissionsResult.data || [];

      const activities = [];

      referrals.forEach(ref => {
        const isProvider = ref.referred_type === 'provider';
        const name = ref.referred_name || ref.referred_email || 'Someone';
        activities.push({
          type: isProvider ? 'provider' : 'member',
          icon: isProvider ? '👨‍🔧' : '👤',
          description: isProvider 
            ? `<span class="highlight-blue">${name}</span> signed up as a provider`
            : `<span class="highlight-gold">${name}</span> signed up as a member`,
          timestamp: ref.created_at,
          date: new Date(ref.created_at)
        });
      });

      commissions.forEach(comm => {
        const amount = formatCurrency(comm.commission_amount);
        const type = comm.commission_type === 'bid_pack' ? 'bid pack purchase' : 'platform fee';
        activities.push({
          type: 'commission',
          icon: '💰',
          description: `You earned <span class="highlight-green">${amount}</span> from a ${type}`,
          timestamp: comm.created_at,
          date: new Date(comm.created_at)
        });
      });

      activities.sort((a, b) => b.date - a.date);
      const limitedActivities = activities.slice(0, 10);

      const feedContainer = document.getElementById('activity-feed');
      const emptyState = document.getElementById('activity-empty');

      if (limitedActivities.length === 0) {
        feedContainer.innerHTML = '';
        emptyState.style.display = 'block';
        return;
      }

      emptyState.style.display = 'none';
      feedContainer.innerHTML = limitedActivities.map(activity => `
        <div class="activity-item">
          <div class="activity-icon ${activity.type}">${activity.icon}</div>
          <div class="activity-content">
            <div class="activity-description">${activity.description}</div>
            <div class="activity-timestamp">${formatRelativeTime(activity.timestamp)}</div>
          </div>
        </div>
      `).join('');
    }

    function calculateNextPayoutDate(balance) {
      if (balance < 25) {
        return 'Balance < $25';
      }
      
      const now = new Date();
      let payoutDate;
      
      if (now.getDate() >= 15) {
        payoutDate = new Date(now.getFullYear(), now.getMonth() + 1, 15);
      } else {
        payoutDate = new Date(now.getFullYear(), now.getMonth(), 15);
      }
      
      return payoutDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    async function loadReferrals() {
      const { data, error } = await supabaseClient
        .from('founder_referrals')
        .select('*')
        .eq('founder_id', founderProfile.id)
        .order('created_at', { ascending: false });

      const tbody = document.getElementById('referrals-tbody');
      const emptyState = document.getElementById('referrals-empty');
      
      if (error || !data || data.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        document.getElementById('referrals-table').style.display = 'none';
        return;
      }

      emptyState.style.display = 'none';
      document.getElementById('referrals-table').style.display = '';
      
      tbody.innerHTML = data.map(ref => `
        <tr>
          <td><span class="type-badge ${ref.referred_type}">${ref.referred_type === 'provider' ? '👨‍🔧 Provider' : '👤 Member'}</span></td>
          <td>${ref.referred_name || ref.referred_email || '--'}</td>
          <td>${formatDate(ref.created_at)}</td>
          <td><span class="status-badge ${ref.status}">${ref.status}</span></td>
        </tr>
      `).join('');
    }

    async function loadCommissions() {
      const { data, error } = await supabaseClient
        .from('founder_commissions')
        .select('*')
        .eq('founder_id', founderProfile.id)
        .order('created_at', { ascending: false });

      const tbody = document.getElementById('commissions-tbody');
      const emptyState = document.getElementById('commissions-empty');
      
      if (error || !data || data.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        document.getElementById('commissions-table').style.display = 'none';
        renderAnalyticsCharts([]);
        return;
      }

      emptyState.style.display = 'none';
      document.getElementById('commissions-table').style.display = '';
      
      tbody.innerHTML = data.map(comm => `
        <tr>
          <td>${comm.commission_type === 'bid_pack' ? '📦 Bid Pack' : '💳 Platform Fee'}</td>
          <td style="color: var(--accent-green); font-weight: 600;">${formatCurrency(comm.commission_amount)}</td>
          <td>${formatDate(comm.created_at)}</td>
          <td><span class="status-badge ${comm.status}">${comm.status}</span></td>
        </tr>
      `).join('');

      renderAnalyticsCharts(data);
    }

    let earningsChartInstance = null;
    let breakdownChartInstance = null;

    function renderAnalyticsCharts(commissions) {
      const analyticsEmpty = document.getElementById('analytics-empty');
      const earningsCanvas = document.getElementById('earnings-chart');
      const breakdownCanvas = document.getElementById('breakdown-chart');
      
      if (!commissions || commissions.length === 0) {
        analyticsEmpty.style.display = 'block';
        earningsCanvas.parentElement.parentElement.style.display = 'none';
        breakdownCanvas.parentElement.parentElement.style.display = 'none';
        return;
      }

      analyticsEmpty.style.display = 'none';
      earningsCanvas.parentElement.parentElement.style.display = '';
      breakdownCanvas.parentElement.parentElement.style.display = '';

      const monthlyEarnings = {};
      const typeBreakdown = {};

      commissions.forEach(comm => {
        const date = new Date(comm.created_at);
        const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const amount = parseFloat(comm.commission_amount) || 0;
        
        monthlyEarnings[monthKey] = (monthlyEarnings[monthKey] || 0) + amount;
        
        const type = comm.commission_type || 'other';
        typeBreakdown[type] = (typeBreakdown[type] || 0) + amount;
      });

      const sortedMonths = Object.keys(monthlyEarnings).sort((a, b) => {
        return new Date(a) - new Date(b);
      });

      if (earningsChartInstance) {
        earningsChartInstance.destroy();
      }
      
      earningsChartInstance = new Chart(earningsCanvas, {
        type: 'line',
        data: {
          labels: sortedMonths,
          datasets: [{
            label: 'Earnings ($)',
            data: sortedMonths.map(m => monthlyEarnings[m]),
            borderColor: '#d4a855',
            backgroundColor: 'rgba(212, 168, 85, 0.1)',
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#d4a855',
            pointBorderColor: '#d4a855',
            pointRadius: 4,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            x: {
              grid: {
                color: 'rgba(148, 148, 168, 0.1)'
              },
              ticks: {
                color: '#9898a8'
              }
            },
            y: {
              beginAtZero: true,
              grid: {
                color: 'rgba(148, 148, 168, 0.1)'
              },
              ticks: {
                color: '#9898a8',
                callback: function(value) {
                  return '$' + value.toFixed(0);
                }
              }
            }
          }
        }
      });

      const typeLabels = {
        'bid_pack': 'Bid Pack',
        'platform_fee': 'Platform Fee',
        'subscription': 'Subscription',
        'other': 'Other'
      };

      const breakdownLabels = Object.keys(typeBreakdown).map(t => typeLabels[t] || t);
      const breakdownValues = Object.values(typeBreakdown);
      const breakdownColors = ['#d4a855', '#4a7cff', '#4ac88c', '#f59e0b', '#ef5f5f'];

      if (breakdownChartInstance) {
        breakdownChartInstance.destroy();
      }

      breakdownChartInstance = new Chart(breakdownCanvas, {
        type: 'doughnut',
        data: {
          labels: breakdownLabels,
          datasets: [{
            data: breakdownValues,
            backgroundColor: breakdownColors.slice(0, breakdownValues.length),
            borderColor: '#0a0a0f',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: '#f4f4f6',
                padding: 16,
                font: {
                  size: 12
                }
              }
            }
          }
        }
      });
    }

    async function loadPayouts() {
      const { data, error } = await supabaseClient
        .from('founder_payouts')
        .select('*')
        .eq('founder_id', founderProfile.id)
        .order('created_at', { ascending: false });

      const tbody = document.getElementById('payouts-tbody');
      const emptyState = document.getElementById('payouts-empty');
      
      if (error || !data || data.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        document.getElementById('payouts-table').style.display = 'none';
        return;
      }

      emptyState.style.display = 'none';
      document.getElementById('payouts-table').style.display = '';
      
      const methodLabels = {
        'stripe_connect': 'Stripe Connect',
        'paypal': 'PayPal',
        'venmo': 'Venmo',
        'zelle': 'Zelle',
        'bank_transfer': 'Bank Transfer',
        'check': 'Check'
      };
      
      tbody.innerHTML = data.map(payout => `
        <tr>
          <td>${payout.payout_period || '--'}</td>
          <td style="color: var(--accent-green); font-weight: 600;">${formatCurrency(payout.amount)}</td>
          <td>${methodLabels[payout.payout_method] || payout.payout_method}</td>
          <td><span class="status-badge ${payout.status}">${payout.status}</span></td>
          <td>${formatDate(payout.processed_at || payout.created_at)}</td>
        </tr>
      `).join('');
    }

    async function loadLeaderboard() {
      const { data, error } = await supabaseClient
        .from('member_founder_profiles')
        .select('id, full_name, total_provider_referrals, total_member_referrals, total_commissions_earned')
        .eq('show_on_leaderboard', true)
        .eq('status', 'active')
        .order('total_commissions_earned', { ascending: false })
        .limit(10);

      const tbody = document.getElementById('leaderboard-tbody');
      const table = document.getElementById('leaderboard-table');
      const emptyState = document.getElementById('leaderboard-empty');

      if (error || !data || data.length === 0) {
        tbody.innerHTML = '';
        table.style.display = 'none';
        emptyState.style.display = 'block';
        return;
      }

      emptyState.style.display = 'none';
      table.style.display = '';

      tbody.innerHTML = data.map((founder, index) => {
        const rank = index + 1;
        const isCurrentUser = founder.id === founderProfile.id;
        const totalReferrals = (founder.total_provider_referrals || 0) + (founder.total_member_referrals || 0);
        
        let rankClass = '';
        let rankDisplay = rank;
        if (rank === 1) {
          rankClass = 'gold';
          rankDisplay = '🥇';
        } else if (rank === 2) {
          rankClass = 'silver';
          rankDisplay = '🥈';
        } else if (rank === 3) {
          rankClass = 'bronze';
          rankDisplay = '🥉';
        }

        const displayName = isCurrentUser 
          ? founder.full_name + ' (You)' 
          : maskName(founder.full_name);

        return `
          <tr class="leaderboard-row ${isCurrentUser ? 'current-user' : ''}">
            <td class="leaderboard-rank ${rankClass}">${rankDisplay}</td>
            <td class="leaderboard-name">${displayName}</td>
            <td class="leaderboard-stats">${totalReferrals}</td>
            <td class="leaderboard-earnings">${formatCurrency(founder.total_commissions_earned || 0)}</td>
          </tr>
        `;
      }).join('');
    }

    function maskName(fullName) {
      if (!fullName) return 'Anonymous';
      const parts = fullName.trim().split(' ');
      if (parts.length === 0) return 'Anonymous';
      
      const firstName = parts[0];
      const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] + '.' : '';
      
      return firstName + (lastInitial ? ' ' + lastInitial : '');
    }

    async function toggleLeaderboardOptIn() {
      const checkbox = document.getElementById('leaderboard-optin-checkbox');
      const isOptedIn = checkbox.checked;

      const { error } = await supabaseClient
        .from('member_founder_profiles')
        .update({
          show_on_leaderboard: isOptedIn,
          updated_at: new Date().toISOString()
        })
        .eq('id', founderProfile.id);

      if (error) {
        console.error('Error updating leaderboard opt-in:', error);
        checkbox.checked = !isOptedIn;
        showToast('Error updating preference');
        return;
      }

      founderProfile.show_on_leaderboard = isOptedIn;
      showToast(isOptedIn ? 'You are now on the leaderboard!' : 'You have been removed from the leaderboard');
      
      await loadLeaderboard();
    }

    function copyReferralCode() {
      const code = document.getElementById('referral-code').textContent;
      navigator.clipboard.writeText(code).then(() => {
        showToast('Referral code copied!');
      });
    }

    function copyShareLink(type) {
      const code = founderProfile.referral_code;
      const page = type === 'provider' ? 'signup-provider.html' : 'signup-member.html';
      const link = `${window.location.origin}/${page}?ref=${code}`;
      navigator.clipboard.writeText(link).then(() => {
        showToast(`${type === 'provider' ? 'Provider' : 'Member'} share link copied!`);
      });
    }

    function shareViaEmail(type) {
      const code = founderProfile.referral_code;
      const page = type === 'provider' ? 'signup-provider.html' : 'signup-member.html';
      const link = `${window.location.origin}/${page}?ref=${code}`;
      const typeLabel = type === 'provider' ? 'provider' : 'member';
      const subject = encodeURIComponent(`Join My Car Concierge as a ${typeLabel}`);
      const body = encodeURIComponent(`Hey!\n\nI'd like to invite you to join My Car Concierge as a ${typeLabel}. Use my referral code: ${code}\n\nSign up here: ${link}\n\nThanks!`);
      window.open(`mailto:?subject=${subject}&body=${body}`);
    }

    function generateQRCode() {
      if (!founderProfile?.referral_code) return;
      const code = founderProfile.referral_code;
      
      const memberSignupLink = `${window.location.origin}/signup-member.html?ref=${code}`;
      const memberCanvas = document.getElementById('qr-code-member');
      if (memberCanvas && typeof QrCreator !== 'undefined') {
        QrCreator.render({
          text: memberSignupLink,
          radius: 0.3,
          ecLevel: 'H',
          fill: '#0a0a0f',
          background: '#ffffff',
          size: 160
        }, memberCanvas);
      }
      
      const providerSignupLink = `${window.location.origin}/signup-provider.html?ref=${code}`;
      const providerCanvas = document.getElementById('qr-code-provider');
      if (providerCanvas && typeof QrCreator !== 'undefined') {
        QrCreator.render({
          text: providerSignupLink,
          radius: 0.3,
          ecLevel: 'H',
          fill: '#0a0a0f',
          background: '#ffffff',
          size: 160
        }, providerCanvas);
      }
    }

    function downloadQRCode(type) {
      const canvasId = type === 'provider' ? 'qr-code-provider' : 'qr-code-member';
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = `mcc-${type}-referral-${founderProfile.referral_code}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast(`${type === 'provider' ? 'Provider' : 'Member'} QR code downloaded!`);
    }

    function showToast(message) {
      const toast = document.getElementById('toast');
      document.getElementById('toast-message').textContent = message;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 3000);
    }

    function updatePayoutLabel() {
      const method = document.getElementById('payout-method').value;
      const label = document.getElementById('payout-email-label');
      const input = document.getElementById('payout-email');
      const emailGroup = document.getElementById('payout-email-group');
      const stripeGroup = document.getElementById('stripe-connect-group');
      
      if (method === 'stripe_connect') {
        emailGroup.style.display = 'none';
        stripeGroup.style.display = 'block';
        updateStripeConnectUI();
      } else {
        emailGroup.style.display = 'block';
        stripeGroup.style.display = 'none';
        
        const labels = {
          'paypal': { label: 'PayPal Email', placeholder: 'your@email.com' },
          'venmo': { label: 'Venmo Username', placeholder: '@username' },
          'zelle': { label: 'Zelle Email/Phone', placeholder: 'email or phone' },
          'bank_transfer': { label: 'Bank Details', placeholder: 'Account details' },
          'check': { label: 'Mailing Address', placeholder: 'Your address' }
        };
        
        const config = labels[method] || labels.paypal;
        label.textContent = config.label;
        input.placeholder = config.placeholder;
      }
    }

    function updateStripeConnectUI() {
      const statusDiv = document.getElementById('stripe-connect-status');
      const connectedDiv = document.getElementById('stripe-connect-connected');
      
      if (founderProfile && founderProfile.stripe_connect_account_id) {
        statusDiv.style.display = 'none';
        connectedDiv.style.display = 'block';
      } else {
        statusDiv.style.display = 'block';
        connectedDiv.style.display = 'none';
      }
    }

    async function initiateStripeConnect() {
      if (!founderProfile) return;
      
      const btn = document.getElementById('stripe-connect-btn');
      const originalText = btn.innerHTML;
      btn.innerHTML = 'Connecting...';
      btn.disabled = true;
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Please log in to connect with Stripe');
          btn.innerHTML = originalText;
          btn.disabled = false;
          return;
        }
        
        const response = await fetch(`/api/stripe/connect/onboard/${founderProfile.id}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });
        const data = await response.json();
        
        if (data.error) {
          showToast('Error: ' + data.error);
          btn.innerHTML = originalText;
          btn.disabled = false;
          return;
        }
        
        if (data.url) {
          window.location.href = data.url;
        }
      } catch (error) {
        console.error('Stripe Connect error:', error);
        showToast('Failed to connect with Stripe');
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }

    async function checkStripeConnectStatus() {
      if (!founderProfile) return;
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Please log in to check status');
          return;
        }
        
        const response = await fetch(`/api/stripe/connect/status/${founderProfile.id}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });
        const data = await response.json();
        
        if (data.error) {
          showToast('Error: ' + data.error);
          return;
        }
        
        if (data.charges_enabled && data.payouts_enabled) {
          showToast('Account fully set up and ready for payouts!');
        } else if (data.details_submitted) {
          showToast('Account pending verification. Check back soon.');
        } else {
          showToast('Account setup incomplete. Click "Update Account" to continue.');
        }
      } catch (error) {
        console.error('Status check error:', error);
        showToast('Failed to check status');
      }
    }

    function handleStripeCallback() {
      const urlParams = new URLSearchParams(window.location.search);
      const stripeResult = urlParams.get('stripe');
      
      if (stripeResult === 'success') {
        showToast('Stripe account connected successfully!');
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (stripeResult === 'refresh') {
        showToast('Please complete your Stripe account setup');
        window.history.replaceState({}, document.title, window.location.pathname);
        setTimeout(() => initiateStripeConnect(), 1000);
      }
    }

    document.getElementById('payout-method').addEventListener('change', updatePayoutLabel);

    document.getElementById('payout-settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const method = document.getElementById('payout-method').value;
      const email = document.getElementById('payout-email').value;
      
      const { error } = await supabaseClient
        .from('member_founder_profiles')
        .update({
          payout_method: method,
          payout_email: email,
          updated_at: new Date().toISOString()
        })
        .eq('id', founderProfile.id);
      
      if (error) {
        showToast('Error saving settings');
        console.error(error);
      } else {
        founderProfile.payout_method = method;
        founderProfile.payout_email = email;
        showToast('Payout settings saved!');
      }
    });

    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
      });
    });

    function logout() {
      supabaseClient.auth.signOut().then(() => {
        window.location.href = 'login.html';
      });
    }

    init();
    
    (async function() {
      await I18n.init();
      I18n.createLanguageSwitcher('language-switcher');
    })();
