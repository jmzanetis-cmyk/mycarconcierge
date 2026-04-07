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
      
      initPayTaxInfo(profile);
      handleStripeCallback();

      document.getElementById('leaderboard-optin-checkbox').checked = profile.show_on_leaderboard || false;

      renderTierProgress();

      await Promise.all([
        loadReferrals(),
        loadCommissions(),
        loadPayouts(),
        loadActivityFeed(),
        loadLeaderboard(),
        loadWefunderWidget()
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
        { name: 'Bronze', icon: mccIcon('star', 16), minReferrals: 0, maxReferrals: 9, bidPack: 50, cssClass: 'bronze' },
        { name: 'Silver', icon: mccIcon('star', 16), minReferrals: 10, maxReferrals: 24, bidPack: 50, cssClass: 'silver' },
        { name: 'Gold', icon: mccIcon('star', 16), minReferrals: 25, maxReferrals: 49, bidPack: 50, cssClass: 'gold' },
        { name: 'Platinum', icon: mccIcon('star', 16), minReferrals: 50, maxReferrals: Infinity, bidPack: 50, cssClass: 'platinum' }
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
        document.getElementById('tier-next-info').innerHTML = `Congratulations! You've reached the highest tier - Platinum Founder status!`;
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
          icon: isProvider ? mccIcon('wrench', 16) : mccIcon('user', 16),
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
          icon: mccIcon('dollar-sign', 16),
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
          <td><span class="type-badge ${ref.referred_type}">${ref.referred_type === 'provider' ? mccIcon('wrench', 14) + ' Provider' : mccIcon('user', 14) + ' Member'}</span></td>
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
          <td>${comm.commission_type === 'bid_pack' ? mccIcon('package', 14) + ' Bid Pack' : mccIcon('dollar-sign', 14) + ' Platform Fee'}</td>
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
      
      const hasFees = data.some(p => parseFloat(p.fee_amount || 0) > 0);
      
      if (hasFees) {
        document.querySelector('#payouts-table thead tr').innerHTML = `
          <th>Period</th>
          <th>Gross</th>
          <th>Fee</th>
          <th>Net Received</th>
          <th>Method</th>
          <th>Status</th>
          <th>Date</th>
          <th>Receipt</th>
        `;
      }
      
      tbody.innerHTML = data.map(payout => {
        const grossAmount = parseFloat(payout.amount || 0);
        const feeAmount = parseFloat(payout.fee_amount || 0);
        const netAmount = parseFloat(payout.net_amount || grossAmount);
        
        if (hasFees) {
          return `
            <tr>
              <td>${payout.payout_period || '--'}</td>
              <td style="color: var(--text-primary);">${formatCurrency(grossAmount)}</td>
              <td style="color: ${feeAmount > 0 ? 'var(--accent-orange)' : 'var(--text-muted)'};">${feeAmount > 0 ? '-' + formatCurrency(feeAmount) : 'FREE'}</td>
              <td style="color: var(--accent-green); font-weight: 600;">${formatCurrency(netAmount)}</td>
              <td>${methodLabels[payout.payout_method] || payout.payout_method}</td>
              <td><span class="status-badge ${payout.status}">${payout.status}</span></td>
              <td>${formatDate(payout.processed_at || payout.created_at)}</td>
              <td>
                <a href="/api/founder/payout-receipt/${payout.id}" target="_blank" class="btn btn-sm btn-secondary" title="Download Receipt">
                  ${mccIcon('file-text', 14)}
                </a>
              </td>
            </tr>
          `;
        }
        
        return `
          <tr>
            <td>${payout.payout_period || '--'}</td>
            <td style="color: var(--accent-green); font-weight: 600;">${formatCurrency(grossAmount)}</td>
            <td>${methodLabels[payout.payout_method] || payout.payout_method}</td>
            <td><span class="status-badge ${payout.status}">${payout.status}</span></td>
            <td>${formatDate(payout.processed_at || payout.created_at)}</td>
            <td>
              <a href="/api/founder/payout-receipt/${payout.id}" target="_blank" class="btn btn-sm btn-secondary" title="Download Receipt">
                ${mccIcon('file-text', 14)} Receipt
              </a>
            </td>
          </tr>
        `;
      }).join('');
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
          rankDisplay = mccIcon('star', 16);
        } else if (rank === 2) {
          rankClass = 'silver';
          rankDisplay = mccIcon('star', 16);
        } else if (rank === 3) {
          rankClass = 'bronze';
          rankDisplay = mccIcon('star', 16);
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

    function shareViaSMS(type) {
      const code = founderProfile.referral_code;
      const page = type === 'provider' ? 'signup-provider.html' : 'signup-member.html';
      const link = `${window.location.origin}/${page}?ref=${code}`;
      const typeLabel = type === 'provider' ? 'service provider' : 'member';
      const message = encodeURIComponent(`Check out My Car Concierge! Join as a ${typeLabel} and get competitive bids on auto services. Sign up here: ${link}`);
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        window.open(`sms:&body=${message}`);
      } else {
        window.open(`sms:?body=${message}`);
      }
    }

    function shareToFacebook(type) {
      const code = founderProfile.referral_code;
      const page = type === 'provider' ? 'signup-provider.html' : 'signup-member.html';
      const link = encodeURIComponent(`${window.location.origin}/${page}?ref=${code}`);
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${link}`, '_blank', 'width=600,height=400');
    }

    function shareToTwitter(type) {
      const code = founderProfile.referral_code;
      const page = type === 'provider' ? 'signup-provider.html' : 'signup-member.html';
      const link = `${window.location.origin}/${page}?ref=${code}`;
      const typeLabel = type === 'provider' ? 'service provider' : 'member';
      const text = encodeURIComponent(`Join My Car Concierge as a ${typeLabel}! Get competitive bids on auto services. ${link}`);
      window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank', 'width=600,height=400');
    }

    function shareToWhatsApp(type) {
      const code = founderProfile.referral_code;
      const page = type === 'provider' ? 'signup-provider.html' : 'signup-member.html';
      const link = `${window.location.origin}/${page}?ref=${code}`;
      const typeLabel = type === 'provider' ? 'service provider' : 'member';
      const text = encodeURIComponent(`Check out My Car Concierge! Join as a ${typeLabel} and get competitive bids on auto services. Sign up here: ${link}`);
      window.open(`https://wa.me/?text=${text}`, '_blank');
    }

    window.copyShareLink = copyShareLink;
    window.shareViaSMS = shareViaSMS;
    window.shareViaEmail = shareViaEmail;
    window.shareToFacebook = shareToFacebook;
    window.shareToTwitter = shareToTwitter;
    window.shareToWhatsApp = shareToWhatsApp;

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
      // Deprecated - now handled by initPayTaxInfo
    }
    
    function updateInstantPayoutUI() {
      // Deprecated - now handled by initPayTaxInfo
    }
    
    function updateToggleVisual(isChecked, slider, bg) {
      // Deprecated - instant payout is now toggled via handlePayoutMethodClick
    }

    function updateStripeConnectUI() {
      // Deprecated - now handled by initPayTaxInfo
    }

    async function initiateStripeConnect() {
      if (!founderProfile) return;
      
      showToast('Connecting to Stripe...');
      
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast('Please log in to connect with Stripe');
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
          return;
        }
        
        if (data.url) {
          window.location.href = data.url;
        }
      } catch (error) {
        console.error('Stripe Connect error:', error);
        showToast('Failed to connect with Stripe');
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

    // Deprecated - form is now hidden, settings are managed via modals
    const payoutForm = document.getElementById('payout-settings-form');
    if (payoutForm) {
      payoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // Form submission is now handled by individual modal save functions
      });
    }
    
    const payoutMethodEl = document.getElementById('payout-method');
    if (payoutMethodEl) {
      payoutMethodEl.addEventListener('change', () => {
        // Deprecated - now handled by initPayTaxInfo
      });
    }

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

    function initPayTaxInfo(profile) {
      const stripeConnected = !!profile.stripe_connect_account_id;
      const instantPayEnabled = profile.instant_payout_enabled;
      const weeklyEnabled = profile.weekly_payout_enabled !== false;
      const hasBackupMethod = profile.payout_method && profile.payout_method !== 'stripe_connect' && profile.payout_email;
      const taxVerified = profile.tax_info_verified;
      const taxVerifiedAt = profile.tax_info_verified_at;
      const outstandingBalance = parseFloat(profile.outstanding_balance || 0);
      
      if (stripeConnected) {
        document.getElementById('stripe-connect-info').textContent = 'Account connected';
        document.getElementById('stripe-connect-badge').textContent = 'Connected';
        document.getElementById('stripe-connect-badge').className = 'payout-status-badge status-active';
      } else {
        document.getElementById('stripe-connect-info').textContent = 'Not connected';
        document.getElementById('stripe-connect-badge').textContent = 'Setup';
        document.getElementById('stripe-connect-badge').className = 'payout-status-badge';
      }
      
      if (instantPayEnabled && stripeConnected) {
        document.getElementById('instant-pay-info').textContent = 'Receive earnings instantly';
        document.getElementById('instant-pay-badge').textContent = 'On';
        document.getElementById('instant-pay-badge').className = 'payout-status-badge status-active';
      } else if (!stripeConnected) {
        document.getElementById('instant-pay-info').textContent = 'Requires Stripe Connect';
        document.getElementById('instant-pay-badge').textContent = 'Setup';
        document.getElementById('instant-pay-badge').className = 'payout-status-badge status-inactive';
      } else {
        document.getElementById('instant-pay-info').textContent = 'Receive earnings instantly';
        document.getElementById('instant-pay-badge').textContent = 'Off';
        document.getElementById('instant-pay-badge').className = 'payout-status-badge status-inactive';
      }
      
      if (weeklyEnabled) {
        document.getElementById('weekly-payout-info').textContent = profile.bank_last_four ? `Account ending in *${profile.bank_last_four}` : 'Every Tuesday';
        document.getElementById('weekly-payout-badge').textContent = 'Active';
        document.getElementById('weekly-payout-badge').className = 'payout-status-badge status-active';
      } else {
        document.getElementById('weekly-payout-badge').textContent = 'Off';
        document.getElementById('weekly-payout-badge').className = 'payout-status-badge status-inactive';
      }
      
      if (hasBackupMethod) {
        const methodNames = { paypal: 'PayPal', venmo: 'Venmo', zelle: 'Zelle', check: 'Check', bank_transfer: 'Bank Transfer' };
        document.getElementById('backup-payout-info').textContent = `${methodNames[profile.payout_method] || profile.payout_method}: ${profile.payout_email}`;
        document.getElementById('backup-payout-badge').textContent = 'Active';
        document.getElementById('backup-payout-badge').className = 'payout-status-badge status-active';
      }
      
      if (taxVerified && taxVerifiedAt) {
        const verifiedDate = new Date(taxVerifiedAt);
        document.getElementById('tax-info-status').textContent = `Verified ${verifiedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
      } else {
        document.getElementById('tax-info-status').textContent = 'Not verified - required for payouts';
      }
      
      if (outstandingBalance > 0) {
        document.getElementById('outstanding-balance-section').style.display = 'block';
        document.getElementById('outstanding-balance-info').textContent = `You have an outstanding balance of ${formatCurrency(outstandingBalance)}. Please pay now.`;
      }
    }
    
    function handlePayoutMethodClick(method) {
      if (method === 'stripe_connect') {
        if (founderProfile.stripe_connect_account_id) {
          showPayoutMethodModal('stripe_connect');
        } else {
          initiateStripeConnect();
        }
      } else if (method === 'instant_pay') {
        if (!founderProfile.stripe_connect_account_id) {
          showToast('Please connect Stripe first to enable Instant Pay');
          return;
        }
        toggleInstantPay();
      } else if (method === 'weekly') {
        showPayoutMethodModal('weekly');
      } else if (method === 'backup') {
        showBackupPayoutModal();
      }
    }
    
    async function toggleInstantPay() {
      const newValue = !founderProfile.instant_payout_enabled;
      
      const { error } = await supabaseClient
        .from('member_founder_profiles')
        .update({
          instant_payout_enabled: newValue,
          payout_preference: newValue ? 'instant' : 'weekly',
          updated_at: new Date().toISOString()
        })
        .eq('id', founderProfile.id);
      
      if (error) {
        showToast('Failed to update instant pay setting');
        return;
      }
      
      founderProfile.instant_payout_enabled = newValue;
      founderProfile.payout_preference = newValue ? 'instant' : 'weekly';
      
      initPayTaxInfo(founderProfile);
      showToast(newValue ? 'Instant Pay enabled!' : 'Instant Pay disabled');
    }
    
    function showPayoutMethodModal(method) {
      showToast(`${method === 'stripe_connect' ? 'Stripe Connect' : 'Weekly payout'} settings coming soon`);
    }
    
    function showBackupPayoutModal() {
      const modal = document.createElement('div');
      modal.id = 'backup-payout-modal';
      modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:1000;';
      modal.innerHTML = `
        <div style="background:var(--bg-card);border-radius:var(--radius-lg);padding:32px;max-width:420px;width:90%;max-height:80vh;overflow-y:auto;">
          <h3 style="margin-bottom:20px;font-size:1.2rem;">Backup Payout Method</h3>
          <p style="color:var(--text-muted);margin-bottom:20px;font-size:0.9rem;">Set a backup method for receiving payouts when Stripe is unavailable.</p>
          <div style="margin-bottom:16px;">
            <label style="display:block;margin-bottom:8px;font-weight:500;">Method</label>
            <select id="backup-method-select" style="width:100%;padding:12px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-md);color:var(--text-primary);font-size:1rem;">
              <option value="paypal">PayPal</option>
              <option value="venmo">Venmo</option>
              <option value="zelle">Zelle</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="check">Check</option>
            </select>
          </div>
          <div style="margin-bottom:20px;">
            <label style="display:block;margin-bottom:8px;font-weight:500;" id="backup-email-label">PayPal Email</label>
            <input type="text" id="backup-email-input" placeholder="your@email.com" value="${founderProfile.payout_email || ''}" style="width:100%;padding:12px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-md);color:var(--text-primary);font-size:1rem;">
          </div>
          <div style="display:flex;gap:12px;">
            <button onclick="closeBackupPayoutModal()" class="btn btn-secondary" style="flex:1;">Cancel</button>
            <button onclick="saveBackupPayout()" class="btn btn-primary" style="flex:1;">Save</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      const select = document.getElementById('backup-method-select');
      select.value = founderProfile.payout_method || 'paypal';
      select.addEventListener('change', updateBackupLabel);
      updateBackupLabel();
    }
    
    function updateBackupLabel() {
      const method = document.getElementById('backup-method-select').value;
      const labels = {
        paypal: 'PayPal Email',
        venmo: 'Venmo Username/Phone',
        zelle: 'Zelle Email/Phone',
        bank_transfer: 'Bank Account Info',
        check: 'Mailing Address'
      };
      document.getElementById('backup-email-label').textContent = labels[method] || 'Details';
    }
    
    function closeBackupPayoutModal() {
      const modal = document.getElementById('backup-payout-modal');
      if (modal) modal.remove();
    }
    
    async function saveBackupPayout() {
      const method = document.getElementById('backup-method-select').value;
      const email = document.getElementById('backup-email-input').value.trim();
      
      if (!email) {
        showToast('Please enter the required details');
        return;
      }
      
      const { error } = await supabaseClient
        .from('member_founder_profiles')
        .update({
          payout_method: method,
          payout_email: email,
          updated_at: new Date().toISOString()
        })
        .eq('id', founderProfile.id);
      
      if (error) {
        showToast('Failed to save backup payout method');
        return;
      }
      
      founderProfile.payout_method = method;
      founderProfile.payout_email = email;
      
      closeBackupPayoutModal();
      initPayTaxInfo(founderProfile);
      showToast('Backup payout method saved!');
    }
    
    function openTaxCenter() {
      const modal = document.createElement('div');
      modal.id = 'tax-center-modal';
      modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:1000;';
      
      const year = new Date().getFullYear();
      const hasEarnings = (founderProfile.total_commissions_earned || 0) >= 600;
      
      modal.innerHTML = `
        <div style="background:var(--bg-card);border-radius:var(--radius-lg);padding:32px;max-width:480px;width:90%;max-height:80vh;overflow-y:auto;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
            <h3 style="font-size:1.2rem;">${mccIcon('file-text', 18)} Tax Center</h3>
            <button onclick="closeTaxCenterModal()" style="background:none;border:none;color:var(--text-muted);font-size:1.5rem;cursor:pointer;">×</button>
          </div>
          
          <div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:20px;margin-bottom:20px;">
            <div style="font-weight:600;margin-bottom:8px;">Tax Year ${year - 1}</div>
            ${hasEarnings ? `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border-subtle);">
                <div>
                  <div style="font-weight:500;">1099-NEC</div>
                  <div style="font-size:0.85rem;color:var(--text-muted);">Non-employee compensation</div>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="downloadTaxForm('1099-NEC', ${year - 1})">Download</button>
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;">
                <div>
                  <div style="font-weight:500;">Annual Summary</div>
                  <div style="font-size:0.85rem;color:var(--text-muted);">Total earnings: ${formatCurrency(founderProfile.total_commissions_earned || 0)}</div>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="downloadTaxForm('summary', ${year - 1})">Download</button>
              </div>
            ` : `
              <div style="color:var(--text-muted);font-size:0.9rem;">
                <p>No tax documents available.</p>
                <p style="margin-top:8px;">A 1099-NEC form will be generated if you earn $600 or more in a calendar year.</p>
              </div>
            `}
          </div>
          
          <p style="font-size:0.85rem;color:var(--text-muted);">
            Tax documents are typically available by January 31st for the previous year. For questions about taxes, please consult a tax professional.
          </p>
        </div>
      `;
      document.body.appendChild(modal);
    }
    
    function closeTaxCenterModal() {
      const modal = document.getElementById('tax-center-modal');
      if (modal) modal.remove();
    }
    
    function downloadTaxForm(type, year) {
      showToast(`Downloading ${type} for ${year}...`);
    }
    
    function openTaxInfo() {
      const modal = document.createElement('div');
      modal.id = 'tax-info-modal';
      modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:1000;';
      
      const verified = founderProfile.tax_info_verified;
      const formType = founderProfile.tax_form_type || 'W-9';
      const ssnLast4 = founderProfile.ssn_last_four || '';
      
      modal.innerHTML = `
        <div style="background:var(--bg-card);border-radius:var(--radius-lg);padding:32px;max-width:480px;width:90%;max-height:80vh;overflow-y:auto;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
            <h3 style="font-size:1.2rem;">${mccIcon('user', 18)} Your Tax Info</h3>
            <button onclick="closeTaxInfoModal()" style="background:none;border:none;color:var(--text-muted);font-size:1.5rem;cursor:pointer;">×</button>
          </div>
          
          ${verified ? `
            <div style="background:var(--accent-green-soft);border:1px solid var(--accent-green);border-radius:var(--radius-md);padding:16px;margin-bottom:20px;">
              <div style="display:flex;align-items:center;gap:8px;color:var(--accent-green);font-weight:600;">
                <span>✓</span> Tax info verified
              </div>
              <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:8px;">
                Form: ${formType} • SSN ending in ${ssnLast4 || '****'}
              </div>
            </div>
          ` : `
            <div style="background:var(--accent-orange-soft);border:1px solid var(--accent-orange);border-radius:var(--radius-md);padding:16px;margin-bottom:20px;">
              <div style="display:flex;align-items:center;gap:8px;color:var(--accent-orange);font-weight:600;">
                ⚠️ Tax info required
              </div>
              <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:8px;">
                Please submit your tax information to receive payouts. This is required by the IRS for anyone earning $600 or more.
              </div>
            </div>
          `}
          
          <div style="margin-bottom:20px;">
            <label style="display:block;margin-bottom:8px;font-weight:500;">Tax Form Type</label>
            <select id="tax-form-type" style="width:100%;padding:12px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-md);color:var(--text-primary);">
              <option value="W-9" ${formType === 'W-9' ? 'selected' : ''}>W-9 (US Citizen/Resident)</option>
              <option value="W-8BEN" ${formType === 'W-8BEN' ? 'selected' : ''}>W-8BEN (Non-US Individual)</option>
            </select>
          </div>
          
          <div style="margin-bottom:20px;">
            <label style="display:block;margin-bottom:8px;font-weight:500;">Social Security Number (Last 4 digits)</label>
            <input type="text" id="ssn-last-four" maxlength="4" placeholder="****" value="${ssnLast4}" style="width:100%;padding:12px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:var(--radius-md);color:var(--text-primary);">
            <div style="font-size:0.8rem;color:var(--text-muted);margin-top:6px;">For verification purposes only. Your full SSN is never stored.</div>
          </div>
          
          <div style="display:flex;gap:12px;">
            <button onclick="closeTaxInfoModal()" class="btn btn-secondary" style="flex:1;">Cancel</button>
            <button onclick="saveTaxInfo()" class="btn btn-primary" style="flex:1;">Save Tax Info</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }
    
    function closeTaxInfoModal() {
      const modal = document.getElementById('tax-info-modal');
      if (modal) modal.remove();
    }
    
    async function saveTaxInfo() {
      const formType = document.getElementById('tax-form-type').value;
      const ssnLast4 = document.getElementById('ssn-last-four').value.trim();
      
      if (!ssnLast4 || ssnLast4.length !== 4 || !/^\d{4}$/.test(ssnLast4)) {
        showToast('Please enter the last 4 digits of your SSN');
        return;
      }
      
      const { error } = await supabaseClient
        .from('member_founder_profiles')
        .update({
          tax_form_type: formType,
          ssn_last_four: ssnLast4,
          tax_info_verified: true,
          tax_info_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', founderProfile.id);
      
      if (error) {
        showToast('Failed to save tax info');
        return;
      }
      
      founderProfile.tax_form_type = formType;
      founderProfile.ssn_last_four = ssnLast4;
      founderProfile.tax_info_verified = true;
      founderProfile.tax_info_verified_at = new Date().toISOString();
      
      closeTaxInfoModal();
      initPayTaxInfo(founderProfile);
      showToast('Tax info saved and verified!');
    }
    
    function payOutstandingBalance() {
      showToast('Outstanding balance payment coming soon');
    }

    function formatCompact(n) {
      if (!n || isNaN(n)) return '—';
      if (n >= 1000000) return '$' + (n / 1000000).toFixed(2) + 'M';
      if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
      return '$' + Math.round(n).toLocaleString();
    }

    async function loadWefunderWidget() {
      const personalUrl = getPersonalWefunderLink();
      const linkEl = document.getElementById('wefunder-personal-link');
      if (linkEl) linkEl.textContent = personalUrl;
      const investEl = document.getElementById('wefunder-invest-link');
      if (investEl) investEl.href = personalUrl;
      loadWefunderClickStats().catch(() => {});

      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const res = await fetch('/api/founder/campaign-stats', {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (!res.ok) throw new Error(`Campaign stats error: ${res.status}`);
        const s = await res.json();
        const loading = document.getElementById('wefunder-loading');
        const body = document.getElementById('wefunder-body');
        const badge = document.getElementById('wefunder-live-badge');
        if (loading) loading.style.display = 'none';
        if (body) body.style.display = 'block';

        if (s.live) {
          if (badge) badge.style.display = 'inline-flex';
        }

        const grid = document.getElementById('wefunder-stats-grid');
        if (grid) {
          const statCard = (label, value, color) =>
            `<div style="padding: 16px; background: rgba(0,196,140,0.06); border: 1px solid rgba(0,196,140,0.14); border-radius: var(--radius-md); text-align: center;">
              <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px;">${label}</div>
              <div style="font-size: 1.3rem; font-weight: 700; color: ${color};">${value}</div>
            </div>`;
          grid.innerHTML =
            statCard('Raised', s.raised > 0 ? formatCompact(s.raised) : '—', '#00c48c') +
            statCard('Investors', s.investors > 0 ? s.investors.toLocaleString() : '—', 'var(--accent-gold)') +
            statCard(s.daysLeft !== null ? 'Days Left' : 'Status', s.daysLeft !== null ? s.daysLeft : 'Active', 'var(--accent-blue)');
        }

        if (s.raised > 0 && s.goal > 0) {
          const pw = document.getElementById('wefunder-progress-wrap');
          const pb = document.getElementById('wefunder-progress-bar');
          const rl = document.getElementById('wefunder-raised-label');
          const gl = document.getElementById('wefunder-goal-label');
          if (pw) pw.style.display = 'block';
          if (rl) rl.textContent = formatCompact(s.raised) + ' raised';
          if (gl) gl.textContent = 'Goal: ' + formatCompact(s.goal);
          if (pb) {
            const pct = Math.min(100, (s.raised / s.goal) * 100).toFixed(1);
            setTimeout(() => { pb.style.width = pct + '%'; }, 100);
          }
        }
      } catch (e) {
        const loading = document.getElementById('wefunder-loading');
        const body = document.getElementById('wefunder-body');
        if (loading) loading.style.display = 'none';
        if (body) body.style.display = 'block';
        // Show explicit fallback so founders can still reach the campaign
        const grid = document.getElementById('wefunder-stats-grid');
        if (grid) {
          grid.innerHTML = `<div style="grid-column:1/-1;padding:14px;background:rgba(255,180,50,0.07);border:1px solid rgba(255,180,50,0.18);border-radius:var(--radius-md);display:flex;align-items:center;gap:12px;font-size:0.85rem;color:var(--text-muted);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="flex-shrink:0;color:#f0a500;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>Live campaign stats couldn't be loaded right now. <a href="https://wefunder.com/my.car.concierge" target="_blank" rel="noopener noreferrer" style="color:#00c48c;font-weight:600;text-decoration:none;">View Campaign on Wefunder &rarr;</a></span>
          </div>`;
        }
      }
    }

    function getPersonalWefunderLink() {
      const code = founderProfile?.referral_code || founderProfile?.id || '';
      if (!code) return 'https://wefunder.com/my.car.concierge';
      return `${window.location.origin}/api/founder/campaign-link?code=${encodeURIComponent(code)}`;
    }

    async function loadWefunderClickStats() {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        if (!token) return;
        // Server resolves the authenticated founder's own code — no code param needed
        const res = await fetch(`/api/founder/campaign-link-stats`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        const statsEl = document.getElementById('wefunder-click-stats');
        const totalEl = document.getElementById('wefunder-click-total');
        const weekEl = document.getElementById('wefunder-click-7d');
        if (statsEl && totalEl && weekEl) {
          totalEl.textContent = data.total_clicks || 0;
          weekEl.textContent = data.clicks_last_7d || 0;
          statsEl.style.display = 'block';
        }
        // Render investment pipeline: visits → investments conversion
        renderInvestmentPipeline(data);
      } catch {}
    }

    function renderInvestmentPipeline(data) {
      const pipelineEl = document.getElementById('wefunder-pipeline');
      if (!pipelineEl) return;
      const visits = data.total_clicks || 0;
      const investments = data.attributed_investments || 0;
      const convRate = visits > 0 ? ((investments / visits) * 100).toFixed(1) : '0.0';
      pipelineEl.innerHTML = `
        <div style="margin-top:12px;padding:12px 14px;background:rgba(0,196,140,0.05);border:1px solid rgba(0,196,140,0.15);border-radius:var(--radius-md);">
          <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:10px;font-weight:600;">Your Referral Pipeline</div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <div style="text-align:center;min-width:60px;">
              <div style="font-size:1.2rem;font-weight:700;color:#00c48c;">${visits.toLocaleString()}</div>
              <div style="font-size:0.7rem;color:var(--text-muted);">Link Visits</div>
            </div>
            <div style="color:var(--text-muted);font-size:0.9rem;">→</div>
            <div style="text-align:center;min-width:60px;">
              <div style="font-size:1.2rem;font-weight:700;color:var(--accent-gold);">${investments.toLocaleString()}</div>
              <div style="font-size:0.7rem;color:var(--text-muted);">Investments</div>
            </div>
            <div style="color:var(--text-muted);font-size:0.9rem;">→</div>
            <div style="text-align:center;min-width:60px;">
              <div style="font-size:1.2rem;font-weight:700;color:var(--accent-blue);">${convRate}%</div>
              <div style="font-size:0.7rem;color:var(--text-muted);">Conversion</div>
            </div>
          </div>
          <div style="font-size:0.7rem;color:var(--text-muted);margin-top:8px;">Investment counts updated manually by the MCC team after Wefunder processes contributions.</div>
        </div>
      `;
    }

    function copyWefunderLink() {
      const url = getPersonalWefunderLink();
      navigator.clipboard.writeText(url).then(() => {
        const label = document.getElementById('wefunder-copy-label');
        if (label) {
          label.textContent = 'Copied!';
          setTimeout(() => { label.textContent = 'Copy Link'; }, 2500);
        }
        if (typeof showToast === 'function') showToast('Your personal campaign link copied!');
      }).catch(() => {
        if (typeof showToast === 'function') showToast('Copy this link: ' + url);
      });
    }

    function shareWefunderCampaign() {
      const url = getPersonalWefunderLink();
      const text = 'I\'m a founding member of My Car Concierge — the app that connects car owners with trusted service providers. They\'re raising on Wefunder and it\'s worth a look.';
      if (navigator.share) {
        navigator.share({ title: 'My Car Concierge on Wefunder', text, url }).catch(() => {});
      } else {
        navigator.clipboard.writeText(url).then(() => {
          if (typeof showToast === 'function') showToast('Campaign link copied — paste it anywhere to share!');
        }).catch(() => {
          if (typeof showToast === 'function') showToast('Copy: ' + url);
        });
      }
    }

    init();
    
    (async function() {
      await I18n.init();
      I18n.createLanguageSwitcher('language-switcher');
    })();
