// ========== PROVIDERS ANALYTICS MODULE ==========
// Earnings analytics, advanced analytics, POS analytics

// ========== EARNINGS ANALYTICS ==========
let earningsChart = null;
let earningsData = { revenue: [], tips: [], upsells: [], reimbursements: [] };

function initEarningsAnalytics() {
  loadEarningsAnalyticsData();
}

async function loadEarningsAnalyticsData() {
  try {
    const { data } = await supabaseClient
      .from('payments')
      .select('*')
      .eq('provider_id', currentUser.id)
      .order('created_at', { ascending: true });
    
    if (!data || data.length === 0) {
      renderEmptyEarningsChart();
      return;
    }
    
    const monthlyData = {};
    data.forEach(p => {
      const month = new Date(p.created_at).toLocaleString('default', { month: 'short', year: '2-digit' });
      if (!monthlyData[month]) {
        monthlyData[month] = { revenue: 0, tips: 0, upsells: 0, reimbursements: 0 };
      }
      monthlyData[month].revenue += (p.amount_provider || 0);
      monthlyData[month].tips += (p.tip_amount || 0);
    });
    
    const labels = Object.keys(monthlyData);
    earningsData = {
      labels,
      revenue: labels.map(l => monthlyData[l].revenue),
      tips: labels.map(l => monthlyData[l].tips),
      upsells: labels.map(l => monthlyData[l].upsells),
      reimbursements: labels.map(l => monthlyData[l].reimbursements)
    };
    
    renderEarningsChart();
    updateEarningsSummary();
    
  } catch (err) {
    console.error('Error loading earnings analytics:', err);
  }
}

function renderEarningsChart() {
  const ctx = document.getElementById('earnings-chart');
  if (!ctx) return;
  
  if (earningsChart) {
    earningsChart.destroy();
  }
  
  earningsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: earningsData.labels || [],
      datasets: [
        {
          label: 'Revenue',
          data: earningsData.revenue || [],
          backgroundColor: 'rgba(201, 162, 39, 0.8)',
          borderColor: '#c9a227',
          borderWidth: 1
        },
        {
          label: 'Tips',
          data: earningsData.tips || [],
          backgroundColor: 'rgba(52, 211, 153, 0.8)',
          borderColor: '#34d399',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: 'var(--text-secondary)' }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { 
            color: 'var(--text-muted)',
            callback: value => '$' + value
          },
          grid: { color: 'var(--border-subtle)' }
        },
        x: {
          ticks: { color: 'var(--text-muted)' },
          grid: { display: false }
        }
      }
    }
  });
}

function renderEmptyEarningsChart() {
  const container = document.getElementById('earnings-chart-container');
  if (container) {
    container.innerHTML = '<div class="empty-state" style="padding:40px;"><div class="empty-state-icon">📊</div><p>No earnings data yet. Complete jobs to see your analytics!</p></div>';
  }
}

function updateEarningsSummary() {
  const totalRevenue = (earningsData.revenue || []).reduce((a, b) => a + b, 0);
  const totalTips = (earningsData.tips || []).reduce((a, b) => a + b, 0);
  const avgPerJob = myPayments.length > 0 ? totalRevenue / myPayments.length : 0;
  
  const revenueEl = document.getElementById('analytics-total-revenue');
  if (revenueEl) revenueEl.textContent = '$' + totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 });
  
  const tipsEl = document.getElementById('analytics-total-tips');
  if (tipsEl) tipsEl.textContent = '$' + totalTips.toLocaleString(undefined, { minimumFractionDigits: 2 });
  
  const avgEl = document.getElementById('analytics-avg-job');
  if (avgEl) avgEl.textContent = '$' + avgPerJob.toFixed(2);
  
  const jobsEl = document.getElementById('analytics-jobs-count');
  if (jobsEl) jobsEl.textContent = myPayments.length;
}

// ========== ADVANCED ANALYTICS ==========
let advancedChart = null;

function initAdvancedAnalytics() {
  loadServiceBreakdown();
  loadPerformanceTrends();
}

async function loadServiceBreakdown() {
  try {
    const { data } = await supabaseClient
      .from('payments')
      .select('*, maintenance_packages(category)')
      .eq('provider_id', currentUser.id);
    
    if (!data || data.length === 0) return;
    
    const categories = {};
    data.forEach(p => {
      const cat = p.maintenance_packages?.category || 'Other';
      if (!categories[cat]) categories[cat] = 0;
      categories[cat] += (p.amount_provider || 0);
    });
    
    const ctx = document.getElementById('service-breakdown-chart');
    if (!ctx) return;
    
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(categories).map(c => formatCategory(c)),
        datasets: [{
          data: Object.values(categories),
          backgroundColor: [
            '#c9a227',
            '#34d399',
            '#38bdf8',
            '#f87171',
            '#a78bfa',
            '#fb923c'
          ]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: 'var(--text-secondary)' }
          }
        }
      }
    });
    
  } catch (err) {
    console.error('Error loading service breakdown:', err);
  }
}

async function loadPerformanceTrends() {
  try {
    const { data } = await supabaseClient
      .from('reviews')
      .select('rating, created_at')
      .eq('provider_id', currentUser.id)
      .order('created_at', { ascending: true });
    
    if (!data || data.length === 0) return;
    
    const monthlyRatings = {};
    data.forEach(r => {
      const month = new Date(r.created_at).toLocaleString('default', { month: 'short', year: '2-digit' });
      if (!monthlyRatings[month]) monthlyRatings[month] = [];
      monthlyRatings[month].push(r.rating);
    });
    
    const labels = Object.keys(monthlyRatings);
    const avgRatings = labels.map(l => {
      const ratings = monthlyRatings[l];
      return ratings.reduce((a, b) => a + b, 0) / ratings.length;
    });
    
    const ctx = document.getElementById('performance-trend-chart');
    if (!ctx) return;
    
    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Average Rating',
          data: avgRatings,
          borderColor: '#c9a227',
          backgroundColor: 'rgba(201, 162, 39, 0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: 0,
            max: 5,
            ticks: { color: 'var(--text-muted)' },
            grid: { color: 'var(--border-subtle)' }
          },
          x: {
            ticks: { color: 'var(--text-muted)' },
            grid: { display: false }
          }
        },
        plugins: {
          legend: {
            labels: { color: 'var(--text-secondary)' }
          }
        }
      }
    });
    
  } catch (err) {
    console.error('Error loading performance trends:', err);
  }
}

// ========== POS ANALYTICS ==========
let posAnalyticsChart = null;

async function loadPosAnalytics() {
  loadPosTransactionSummary();
  loadPosRevenueChart();
  loadAllPosTransactions();
}

async function loadPosTransactionSummary() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const headers = session?.access_token 
      ? { 'Authorization': `Bearer ${session.access_token}` } 
      : {};
    
    const [cloverRes, squareRes] = await Promise.all([
      fetch(`/api/clover/transactions/${currentUser.id}?limit=1000`, { headers }).then(r => r.json()).catch(() => ({ transactions: [] })),
      fetch(`/api/square/transactions/${currentUser.id}?limit=1000`, { headers }).then(r => r.json()).catch(() => ({ transactions: [] }))
    ]);
    
    const cloverTx = cloverRes.transactions || [];
    const squareTx = squareRes.transactions || [];
    const allTx = [...cloverTx, ...squareTx];
    
    const totalCount = allTx.length;
    const totalRevenue = allTx.reduce((sum, tx) => {
      const amount = typeof tx.amount === 'number' ? tx.amount / 100 : parseFloat(tx.amount || 0);
      return sum + amount;
    }, 0);
    
    const avgTicket = totalCount > 0 ? totalRevenue / totalCount : 0;
    
    const countEl = document.getElementById('pos-total-transactions');
    if (countEl) countEl.textContent = totalCount.toLocaleString();
    
    const revenueEl = document.getElementById('pos-total-revenue');
    if (revenueEl) revenueEl.textContent = '$' + totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 });
    
    const avgEl = document.getElementById('pos-avg-ticket');
    if (avgEl) avgEl.textContent = '$' + avgTicket.toFixed(2);
    
    const cloverEl = document.getElementById('pos-clover-count');
    if (cloverEl) cloverEl.textContent = cloverTx.length;
    
    const squareEl = document.getElementById('pos-square-count');
    if (squareEl) squareEl.textContent = squareTx.length;
    
  } catch (err) {
    console.error('Error loading POS summary:', err);
  }
}

async function loadPosRevenueChart() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const headers = session?.access_token 
      ? { 'Authorization': `Bearer ${session.access_token}` } 
      : {};
    
    const response = await fetch(`/api/pos/transactions/${currentUser.id}?limit=500`, { headers });
    const data = await response.json();
    
    if (!data.transactions || data.transactions.length === 0) {
      const container = document.getElementById('pos-revenue-chart-container');
      if (container) {
        container.innerHTML = '<div class="empty-state" style="padding:40px;"><div class="empty-state-icon">📊</div><p>No POS transactions yet.</p></div>';
      }
      return;
    }
    
    const dailyData = {};
    data.transactions.forEach(tx => {
      const date = new Date(tx.created_at || tx.timestamp).toLocaleDateString();
      const amount = typeof tx.amount === 'number' ? tx.amount / 100 : parseFloat(tx.amount || 0);
      if (!dailyData[date]) dailyData[date] = 0;
      dailyData[date] += amount;
    });
    
    const labels = Object.keys(dailyData).slice(-14);
    const values = labels.map(l => dailyData[l]);
    
    const ctx = document.getElementById('pos-revenue-chart');
    if (!ctx) return;
    
    if (posAnalyticsChart) {
      posAnalyticsChart.destroy();
    }
    
    posAnalyticsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Daily Revenue',
          data: values,
          backgroundColor: 'rgba(201, 162, 39, 0.8)',
          borderColor: '#c9a227',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { 
              color: 'var(--text-muted)',
              callback: value => '$' + value
            },
            grid: { color: 'var(--border-subtle)' }
          },
          x: {
            ticks: { color: 'var(--text-muted)', maxRotation: 45 },
            grid: { display: false }
          }
        }
      }
    });
    
  } catch (err) {
    console.error('Error loading POS revenue chart:', err);
  }
}

async function loadAllPosTransactions() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const headers = session?.access_token 
      ? { 'Authorization': `Bearer ${session.access_token}` } 
      : {};
    
    const response = await fetch(`/api/pos/transactions/${currentUser.id}?limit=50`, { headers });
    const data = await response.json();
    
    const tbody = document.getElementById('all-pos-transactions-body');
    if (!tbody) return;
    
    if (!data.transactions || data.transactions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">Connect a POS system to see transactions</td></tr>';
      return;
    }

    tbody.innerHTML = data.transactions.map(tx => {
      const date = new Date(tx.created_at || tx.timestamp).toLocaleDateString();
      const amount = typeof tx.amount === 'number' ? (tx.amount / 100).toFixed(2) : parseFloat(tx.amount || 0).toFixed(2);
      const card = tx.card_last_four ? `•••• ${tx.card_last_four}` : '—';
      const statusClass = tx.status === 'success' || tx.status === 'completed' ? 'accent-green' : tx.status === 'pending' ? 'accent-gold' : 'accent-red';
      const source = tx.pos_provider || tx.source || 'unknown';

      return `
        <tr>
          <td>${date}</td>
          <td style="font-weight:600;">$${amount}</td>
          <td>${card}</td>
          <td><span style="color:var(--${statusClass});text-transform:capitalize;">${tx.status}</span></td>
          <td style="text-transform:capitalize;">${source}</td>
        </tr>
      `;
    }).join('');
    
  } catch (err) {
    console.error('Error loading POS transactions:', err);
  }
}

// ========== EXPORT FUNCTIONS ==========
async function exportEarningsReport() {
  try {
    const { data } = await supabaseClient
      .from('payments')
      .select('*, maintenance_packages(title)')
      .eq('provider_id', currentUser.id)
      .order('created_at', { ascending: false });
    
    if (!data || data.length === 0) {
      showToast('No data to export', 'error');
      return;
    }
    
    const csv = [
      ['Date', 'Package', 'Amount', 'Status'].join(','),
      ...data.map(p => [
        new Date(p.created_at).toLocaleDateString(),
        `"${p.maintenance_packages?.title || 'Package'}"`,
        (p.amount_provider || 0).toFixed(2),
        p.status
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `earnings-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Report exported!', 'success');
    
  } catch (err) {
    console.error('Export error:', err);
    showToast('Failed to export report', 'error');
  }
}

console.log('providers-analytics.js loaded');
