// ========== PROVIDERS BIDS MODULE ==========
// Open packages, bidding, bid calculator, filters

// ========== SERVICE TYPE FILTER ==========
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

// ========== LOAD OPEN PACKAGES ==========
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
    
    const locationWarning = document.getElementById('location-warning');
    if (locationWarning) {
      locationWarning.style.display = !providerProfile?.zip_code ? 'block' : 'none';
    }
    
    renderOpenPackages();
    renderRecentPackages();
    const openCount = document.getElementById('open-count');
    if (openCount) openCount.textContent = openPackages.length;
    if (typeof updateStats === 'function') updateStats();
  } catch (err) {
    console.error('loadOpenPackages error:', err);
    openPackages = [];
    renderOpenPackages();
  }
}

// ========== LOAD MY BIDS ==========
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
    if (typeof renderActiveJobs === 'function') renderActiveJobs();
    if (typeof updateStats === 'function') updateStats();
  } catch (err) {
    console.error('loadMyBids error:', err);
    myBids = [];
    renderMyBids();
  }
}

// ========== RENDER FUNCTIONS ==========
function renderOpenPackages(filtered = null) {
  const container = document.getElementById('open-packages');
  if (!container) return;
  
  const packagesToRender = filtered || openPackages;
  
  if (!packagesToRender.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📦</div><p>No packages match your filters. Try adjusting your criteria.</p></div>';
    const filterInfo = document.getElementById('filter-results-info');
    if (filterInfo) filterInfo.textContent = '';
    return;
  }
  
  const filterInfo = document.getElementById('filter-results-info');
  if (filterInfo) {
    if (filtered && filtered.length !== openPackages.length) {
      filterInfo.textContent = `Showing ${filtered.length} of ${openPackages.length} packages`;
    } else {
      filterInfo.textContent = `${packagesToRender.length} open packages`;
    }
  }
  
  container.innerHTML = packagesToRender.map(p => renderPackageCard(p, true)).join('');
}

function renderRecentPackages() {
  const container = document.getElementById('recent-packages');
  if (!container) return;
  
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
  const alreadyBid = myBids.some(b => b.package_id === p.id) || p._myBid;
  const myCurrentBid = p._myBid || myBids.find(b => b.package_id === p.id);
  
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
  
  const locationDisplay = p.member_city && p.member_state 
    ? `${p.member_city}, ${p.member_state}` 
    : (p.member_zip || 'Location N/A');
  const distanceDisplay = p._estimatedDistance !== undefined 
    ? `~${Math.round(p._estimatedDistance)} mi` 
    : '';
  
  const countdown = p.bidding_deadline ? formatCountdown(p.bidding_deadline) : null;
  const biddingExpired = countdown?.expired || false;
  const countdownHtml = countdown ? `
    <div class="countdown-timer ${countdown.expired ? 'expired' : countdown.urgent ? 'urgent' : ''}" style="margin-top:8px;">
      ⏱️ ${countdown.text}
    </div>
  ` : '';
  
  const bidCount = p._bidCount || 0;
  const lowestBid = p._lowestBid;
  
  const competitionHtml = bidCount > 0 ? `
    <div style="margin-top:10px;padding:10px;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
      <span style="font-size:0.85rem;">🏆 <strong>${bidCount}</strong> bid${bidCount !== 1 ? 's' : ''} ${lowestBid ? `• Lowest: <strong style="color:var(--accent-gold);">$${lowestBid}</strong>` : ''}</span>
    </div>
  ` : '';

  return `
    <div class="package-card">
      <div class="package-header">
        <div>
          <div class="package-title">${p.title}${memberBadgesHtml ? `<span class="member-badges">${memberBadgesHtml}</span>` : ''}</div>
          <div class="package-vehicle">🚗 ${vehicleName}</div>
        </div>
        <span class="package-badge">${formatCategory(p.category) || 'General'}</span>
      </div>
      <div class="package-meta">
        <span>📍 ${locationDisplay} ${distanceDisplay ? `(${distanceDisplay})` : ''}</span>
        <span>🔄 ${formatFrequency(p.frequency)}</span>
        <span>🔧 ${p.parts_preference || 'Standard'}</span>
      </div>
      ${p.description ? `<div class="package-description">${p.description.substring(0, 150)}${p.description.length > 150 ? '...' : ''}</div>` : ''}
      ${countdownHtml}
      ${competitionHtml}
      <div class="package-footer">
        <span style="font-size:0.85rem;color:var(--text-muted);">Posted ${formatTimeAgo(p.created_at)}</span>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary btn-sm" onclick="viewPackageDetails('${p.id}')">View Details</button>
          ${!alreadyBid && !biddingExpired ? `<button class="btn btn-primary btn-sm" onclick="openBidModal('${p.id}', '${p.title.replace(/'/g, "\\'")}')">Submit Bid</button>` : ''}
          ${alreadyBid ? `<span style="color:var(--accent-green);font-size:0.85rem;display:flex;align-items:center;">✓ Bid submitted</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderMyBids() {
  const container = document.getElementById('my-bids');
  if (!container) return;
  
  const pendingBids = myBids.filter(b => b.status === 'pending');
  
  if (!pendingBids.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><p>No pending bids.</p></div>';
    return;
  }
  
  container.innerHTML = pendingBids.map(b => {
    const pkg = b.maintenance_packages;
    const vehicle = pkg?.vehicles;
    const vehicleName = vehicle ? `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim() : 'Vehicle';
    
    return `
      <div class="package-card">
        <div class="package-header">
          <div>
            <div class="package-title">${pkg?.title || 'Package'}</div>
            <div class="package-vehicle">🚗 ${vehicleName}</div>
          </div>
          <span class="package-badge" style="background:var(--accent-blue-soft);color:var(--accent-blue);">Pending</span>
        </div>
        <div class="package-meta">
          <span>💰 Your bid: <strong>$${b.price}</strong></span>
          <span>📅 Submitted ${formatTimeAgo(b.created_at)}</span>
        </div>
        <div class="package-footer">
          <span></span>
          <button class="btn btn-secondary btn-sm" onclick="openBidModal('${b.package_id}', '${(pkg?.title || 'Package').replace(/'/g, "\\'")}', ${b.price})">Update Bid</button>
        </div>
      </div>
    `;
  }).join('');
}

// ========== FILTERS ==========
function applyFilters() {
  const distanceEl = document.getElementById('filter-distance');
  const categoryEl = document.getElementById('filter-category');
  const urgencyEl = document.getElementById('filter-urgency');
  const partsEl = document.getElementById('filter-parts');
  const sortEl = document.getElementById('filter-sort');
  
  const distance = distanceEl?.value;
  const category = categoryEl?.value;
  const urgency = urgencyEl?.value;
  const parts = partsEl?.value;
  const sort = sortEl?.value || 'nearest';

  let filtered = [...openPackages];

  if (distance && providerProfile?.zip_code) {
    filtered = filtered.filter(p => {
      if (!p.member_zip) return true;
      const dist = estimateZipDistance(providerProfile.zip_code, p.member_zip);
      p._estimatedDistance = dist;
      return dist <= parseInt(distance);
    });
  } else {
    filtered.forEach(p => {
      if (p.member_zip && providerProfile?.zip_code) {
        p._estimatedDistance = estimateZipDistance(providerProfile.zip_code, p.member_zip);
      }
    });
  }

  if (category) {
    filtered = filtered.filter(p => p.category === category);
  }

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

  if (parts) {
    filtered = filtered.filter(p => p.parts_preference === parts);
  }

  if (currentServiceTypeFilter === 'destination') {
    filtered = filtered.filter(p => isDestinationPackage(p));
  } else if (currentServiceTypeFilter === 'standard') {
    filtered = filtered.filter(p => !isDestinationPackage(p));
  }

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

function estimateZipDistance(zip1, zip2) {
  if (!zip1 || !zip2) return 999;
  if (zip1 === zip2) return 0;
  if (zip1.substring(0, 3) === zip2.substring(0, 3)) {
    return Math.abs(parseInt(zip1) - parseInt(zip2)) * 0.5;
  }
  const diff = Math.abs(parseInt(zip1.substring(0, 3)) - parseInt(zip2.substring(0, 3)));
  if (diff <= 2) return 15 + (diff * 10);
  if (diff <= 5) return 30 + (diff * 8);
  if (diff <= 10) return 50 + (diff * 5);
  return 100 + (diff * 3);
}

function clearFilters() {
  const els = ['filter-distance', 'filter-category', 'filter-urgency', 'filter-parts'];
  els.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const sortEl = document.getElementById('filter-sort');
  if (sortEl) sortEl.value = 'nearest';
  
  document.querySelectorAll('.service-type-filter').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.serviceType === 'all') btn.classList.add('active');
  });
  currentServiceTypeFilter = 'all';
  applyFilters();
}

// ========== VIEW PACKAGE DETAILS ==========
async function viewPackageDetails(packageId) {
  const pkg = openPackages.find(p => p.id === packageId);
  if (!pkg) return;

  const { data: photos } = await supabaseClient
    .from('package_photos')
    .select('*')
    .eq('package_id', packageId);
    
  const vehicle = pkg.vehicles;
  const vehicleName = vehicle ? (vehicle.nickname || `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim()) : 'Vehicle';
  const locationDisplay = pkg.member_city && pkg.member_state 
    ? `${pkg.member_city}, ${pkg.member_state}` 
    : (pkg.member_zip || 'Location N/A');

  const titleEl = document.getElementById('package-details-title');
  if (titleEl) titleEl.textContent = pkg.title;
  
  const bodyEl = document.getElementById('package-details-body');
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div style="margin-bottom:20px;">
        <div class="package-meta">
          <span>🚗 ${vehicleName}</span>
          <span>📍 ${locationDisplay}</span>
          <span>📅 Posted ${new Date(pkg.created_at).toLocaleDateString()}</span>
        </div>
      </div>
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
      </div>
      ${pkg.description ? `<div style="margin-bottom:20px;"><strong>Description</strong><p style="color:var(--text-secondary);margin-top:8px;line-height:1.6;">${pkg.description}</p></div>` : ''}
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
        ${!myBids.some(b => b.package_id === packageId) ? `<button class="btn btn-primary" onclick="closeModal('package-details-modal');openBidModal('${packageId}', '${pkg.title.replace(/'/g, "\\'")}')">Submit Bid</button>` : '<span style="color:var(--accent-green);">✓ You\'ve already bid on this package</span>'}
      </div>
    `;
  }
  
  openModal('package-details-modal');
}

// ========== BID MODAL ==========
let isUpdatingBid = false;

async function openBidModal(packageId, title, existingPrice = null) {
  currentBidPackageId = packageId;
  isUpdatingBid = existingPrice !== null && existingPrice > 0;
  
  const titleEl = document.getElementById('bid-package-title');
  if (titleEl) titleEl.textContent = isUpdatingBid ? `Update Bid: ${title}` : title;
  
  ['bid-price', 'bid-duration', 'bid-parts', 'bid-labor', 'bid-availability', 'bid-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  
  const customPrice = document.getElementById('bid-price-custom');
  if (customPrice) {
    customPrice.value = '';
    customPrice.style.display = 'none';
  }
  
  const pricingConfirm = document.getElementById('bid-pricing-confirm');
  if (pricingConfirm) pricingConfirm.checked = false;
  
  if (existingPrice) {
    const priceSelect = document.getElementById('bid-price');
    if (priceSelect) {
      const matchingOption = Array.from(priceSelect.options).find(o => o.value === String(existingPrice));
      if (matchingOption) {
        priceSelect.value = String(existingPrice);
      } else {
        priceSelect.value = 'custom';
        if (customPrice) {
          customPrice.value = existingPrice;
          customPrice.style.display = 'block';
        }
      }
    }
  }
  
  const submitBtn = document.querySelector('#bid-modal .btn-primary');
  if (submitBtn) submitBtn.textContent = isUpdatingBid ? 'Update Bid (Free)' : 'Submit Bid';
  
  openModal('bid-modal');
  
  const priceSelect = document.getElementById('bid-price');
  if (priceSelect) {
    priceSelect.onchange = function() {
      const customInput = document.getElementById('bid-price-custom');
      if (customInput) {
        if (this.value === 'custom') {
          customInput.style.display = 'block';
          customInput.focus();
        } else {
          customInput.style.display = 'none';
        }
      }
    };
  }
  
  resetBidCalculator();
}

async function submitBid() {
  const priceSelect = document.getElementById('bid-price');
  const customPrice = document.getElementById('bid-price-custom');
  
  let price = priceSelect?.value;
  if (price === 'custom') {
    price = customPrice?.value;
  }
  
  if (!price || isNaN(parseFloat(price))) {
    showToast('Please enter a valid price', 'error');
    return;
  }
  
  const notes = document.getElementById('bid-notes')?.value || '';
  const duration = document.getElementById('bid-duration')?.value || '';
  const availability = document.getElementById('bid-availability')?.value || '';
  
  try {
    if (isUpdatingBid) {
      const existingBid = myBids.find(b => b.package_id === currentBidPackageId);
      if (existingBid) {
        const { error } = await supabaseClient
          .from('bids')
          .update({ price: parseFloat(price), notes, estimated_duration: duration })
          .eq('id', existingBid.id);
        
        if (error) throw error;
        showToast('Bid updated successfully!', 'success');
      }
    } else {
      const totalCredits = (providerProfile?.bid_credits || 0) + (providerProfile?.free_trial_bids || 0);
      if (totalCredits < 1) {
        showToast('No bid credits available. Purchase credits to submit bids.', 'error');
        return;
      }
      
      const { data: { session } } = await supabaseClient.auth.getSession();
      const response = await fetch('/api/bids', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          package_id: currentBidPackageId,
          price: parseFloat(price),
          notes,
          estimated_duration: duration,
          availability
        })
      });
      
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to submit bid');
      
      showToast('Bid submitted successfully!', 'success');
      
      if (typeof loadProviderProfile === 'function') loadProviderProfile();
    }
    
    closeModal('bid-modal');
    await loadMyBids();
    await loadOpenPackages();
    if (typeof updateStats === 'function') updateStats();
    
  } catch (err) {
    console.error('Submit bid error:', err);
    showToast(err.message || 'Failed to submit bid', 'error');
  }
}

// ========== BID CALCULATOR ==========
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
  if (toggle) toggle.classList.toggle('active');
  if (container) container.classList.toggle('active');
}

function resetBidCalculator() {
  const ids = ['calc-parts', 'calc-labor-hours', 'calc-travel', 'calc-transport'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  
  const laborRate = document.getElementById('calc-labor-rate');
  if (laborRate) laborRate.value = providerProfile?.hourly_rate || '75';
  
  const profitMargin = document.getElementById('calc-profit-margin');
  if (profitMargin) profitMargin.value = '20';
  
  const profitValue = document.getElementById('calc-profit-value');
  if (profitValue) profitValue.textContent = '20%';
  
  const checks = ['calc-travel-enabled', 'calc-transport-enabled', 'calc-urgency'];
  checks.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });
  
  const toggle = document.querySelector('.bid-calculator-toggle');
  if (toggle) toggle.classList.remove('active');
  
  const container = document.getElementById('bid-calculator');
  if (container) container.classList.remove('active');
  
  const urgencyRow = document.getElementById('calc-urgency-row');
  if (urgencyRow) urgencyRow.classList.remove('active');
  
  updateBidCalculation();
}

function updateBidCalculation() {
  const parts = parseFloat(document.getElementById('calc-parts')?.value) || 0;
  const laborHours = parseFloat(document.getElementById('calc-labor-hours')?.value) || 0;
  const laborRate = parseFloat(document.getElementById('calc-labor-rate')?.value) || 75;
  const profitMargin = parseFloat(document.getElementById('calc-profit-margin')?.value) || 20;
  const travelEnabled = document.getElementById('calc-travel-enabled')?.checked;
  const travel = travelEnabled ? (parseFloat(document.getElementById('calc-travel')?.value) || 0) : 0;
  const transportEnabled = document.getElementById('calc-transport-enabled')?.checked;
  const transport = transportEnabled ? (parseFloat(document.getElementById('calc-transport')?.value) || 0) : 0;
  const urgencyEnabled = document.getElementById('calc-urgency')?.checked;
  
  const profitValue = document.getElementById('calc-profit-value');
  if (profitValue) profitValue.textContent = profitMargin + '%';
  
  const urgencyRow = document.getElementById('calc-urgency-row');
  if (urgencyRow) urgencyRow.classList.toggle('active', urgencyEnabled);
  
  const labor = laborHours * laborRate;
  const subtotal = parts + labor;
  const profit = subtotal * (profitMargin / 100);
  const preRushSubtotal = subtotal + profit + travel + transport;
  const rushFee = urgencyEnabled ? preRushSubtotal * 0.25 : 0;
  const preTaxSubtotal = preRushSubtotal + rushFee;
  
  const providerState = providerProfile?.state || '';
  const taxRate = getStateTaxRate(providerState);
  const tax = preTaxSubtotal * (taxRate / 100);
  const customerTotal = preTaxSubtotal + tax;
  const platformFee = customerTotal * (PLATFORM_FEE_PERCENT / 100);
  const yourEarnings = customerTotal - platformFee;
  
  const partsDisplay = document.getElementById('calc-display-parts');
  if (partsDisplay) partsDisplay.textContent = '$' + parts.toFixed(2);
  
  const laborDisplay = document.getElementById('calc-display-labor');
  if (laborDisplay) laborDisplay.textContent = '$' + labor.toFixed(2);
  
  const profitDisplay = document.getElementById('calc-display-profit');
  if (profitDisplay) profitDisplay.textContent = '$' + profit.toFixed(2);
  
  const travelDisplay = document.getElementById('calc-display-travel');
  if (travelDisplay) travelDisplay.textContent = '$' + travel.toFixed(2);
  
  const transportDisplay = document.getElementById('calc-display-transport');
  if (transportDisplay) transportDisplay.textContent = '$' + transport.toFixed(2);
  
  const rushDisplay = document.getElementById('calc-display-rush');
  if (rushDisplay) rushDisplay.textContent = '$' + rushFee.toFixed(2);
  
  const taxDisplay = document.getElementById('calc-display-tax');
  if (taxDisplay) taxDisplay.textContent = '$' + tax.toFixed(2);
  
  const totalDisplay = document.getElementById('calc-display-total');
  if (totalDisplay) totalDisplay.textContent = '$' + customerTotal.toFixed(2);
  
  const feeDisplay = document.getElementById('calc-display-fee');
  if (feeDisplay) feeDisplay.textContent = '-$' + platformFee.toFixed(2);
  
  const earningsDisplay = document.getElementById('calc-display-earnings');
  if (earningsDisplay) earningsDisplay.textContent = '$' + yourEarnings.toFixed(2);
}

function applyCalculatedPrice() {
  const totalDisplay = document.getElementById('calc-display-total');
  const total = parseFloat(totalDisplay?.textContent?.replace('$', '') || '0');
  
  if (total > 0) {
    const priceSelect = document.getElementById('bid-price');
    const customInput = document.getElementById('bid-price-custom');
    
    if (priceSelect) priceSelect.value = 'custom';
    if (customInput) {
      customInput.value = Math.round(total);
      customInput.style.display = 'block';
    }
    
    toggleBidCalculator();
    showToast(`Price set to $${Math.round(total)}`, 'success');
  }
}

async function loadCompetitionData(packageId, category) {
  try {
    const { data } = await supabaseClient
      .from('bids')
      .select('price')
      .eq('package_id', packageId);
    
    if (data && data.length > 0) {
      const prices = data.map(b => b.price);
      calculatorCompetitionData = {
        minBid: Math.min(...prices),
        maxBid: Math.max(...prices),
        avgBid: prices.reduce((a, b) => a + b, 0) / prices.length,
        count: prices.length
      };
      
      const competitionEl = document.getElementById('calc-competition-data');
      if (competitionEl) {
        competitionEl.innerHTML = `
          <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:8px;">Current bids: ${calculatorCompetitionData.count}</div>
          <div style="display:flex;gap:16px;font-size:0.9rem;">
            <span>Low: <strong>$${calculatorCompetitionData.minBid.toFixed(0)}</strong></span>
            <span>Avg: <strong>$${calculatorCompetitionData.avgBid.toFixed(0)}</strong></span>
            <span>High: <strong>$${calculatorCompetitionData.maxBid.toFixed(0)}</strong></span>
          </div>
        `;
      }
    }
  } catch (err) {
    console.log('Error loading competition data:', err);
  }
}

// ========== DESTINATION SERVICE HELPERS ==========
function getDestinationServiceIcon(type) {
  const icons = {
    'airport': '✈️',
    'dealership': '🏪',
    'valet': '🎩',
    'detailing': '✨',
    'transport': '🚚'
  };
  return icons[type] || '🚗';
}

function getDestinationServiceLabel(type) {
  const labels = {
    'airport': 'Airport Service',
    'dealership': 'Dealership Service',
    'valet': 'Valet Service',
    'detailing': 'Detailing Service',
    'transport': 'Transport Service'
  };
  return labels[type] || 'Destination Service';
}

function formatDestinationDateTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

async function fetchDestinationServiceDetails(packageId) {
  try {
    const { data, error } = await supabaseClient
      .from('destination_services')
      .select('*')
      .eq('package_id', packageId)
      .single();
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

console.log('providers-bids.js loaded');
